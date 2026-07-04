package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"os"
	"sync/atomic"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/client"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// Daemon is the local daemon process that connects a machine to GitSquad.
type Daemon struct {
	cfg         daemonconfig.Config
	client      *client.Client
	ws          *client.WSConn
	registry    *Registry
	lastRuntime []v1.Runtime

	// Lifecycle control.
	cancelFunc context.CancelFunc // called by /shutdown or SIGINT
	ready      atomic.Bool        // flips to true after preflight (liveness vs readiness)
}

// New creates a Daemon by loading configuration from the environment,
// .env files, and ~/.gitsquad/config.yaml.
// The HTTP client and runtime registry are initialized eagerly.
func New() *Daemon {
	cfg := daemonconfig.Load()
	return &Daemon{
		cfg:         cfg,
		client:      client.New(cfg.APIURL, cfg.Token),
		registry:    DefaultRegistry(),
		lastRuntime: make([]v1.Runtime, 0),
	}
}

// Run starts the daemon: binds the health server, validates credentials,
// persists runtime state, launches the heartbeat goroutine, and enters
// the main connection loop. It blocks until ctx is cancelled.
func (d *Daemon) Run(ctx context.Context) error {
	if d.cfg.Token == "" || d.cfg.ID == "" {
		return fmt.Errorf("not logged in. Run 'gitsquad daemon login' first")
	}

	ctx, cancel := context.WithCancel(ctx)
	d.cancelFunc = cancel

	healthLn, err := d.listenHealth()
	if err != nil {
		return fmt.Errorf("health port: %w (is another daemon running?)", err)
	}
	// Persist state so CLI commands (stop, status) can find the running daemon.
	port := healthLn.Addr().(*net.TCPAddr).Port
	if err := writeDaemonState(port); err != nil {
		return fmt.Errorf("write daemon state: %w", err)
	}
	go d.serveHealth(ctx, healthLn, time.Now())

	defer d.gracefulShutdown()

	// Register runtimes once at startup.
	_, runtimes := d.DetectRuntimes()
	d.lastRuntime = runtimes
	slog.Info("runtimes detected", "count", len(runtimes))
	if err := d.client.Register(ctx, runtimes); err != nil {
		slog.Warn("register runtimes failed", "error", err)
	}

	go d.heartbeatLoop(ctx)

	d.ready.Store(true)
	return d.serve(ctx)
}

// gracefulShutdown performs best-effort cleanup when the daemon exits.
func (d *Daemon) gracefulShutdown() {
	clearDaemonState()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if d.ws != nil {
		d.ws.Close()
	}
	slog.Info("daemon stopped")
	_ = ctx // reserved for future Deregister API call
}

// serve is the main connection loop: dials the WebSocket, uploads runtimes,
// and enters readLoop. On disconnect it retries every 5s until ctx is cancelled.
func (d *Daemon) serve(ctx context.Context) error {
	const reconnectInterval = 5 * time.Second

	for {
		if ctx.Err() != nil {
			return nil
		}

		slog.Info("connecting", "url", d.cfg.APIURL)
		ws, err := d.client.ConnectWS(ctx, d.cfg.ID)
		if err != nil {
			slog.Warn("connect failed, retrying", "error", err)
			if sleepCtx(ctx, reconnectInterval) != nil {
				return nil
			}
			continue
		}

		d.ws = ws
		slog.Info("daemon online")

		// Close the connection when ctx is cancelled so readLoop unblocks.
		go func() {
			<-ctx.Done()
			ws.Close()
		}()

		// readLoop blocks until the connection drops or ctx is cancelled.
		err = d.readLoop(ctx)

		d.ws.Close()
		d.ws = nil

		if ctx.Err() != nil {
			return nil
		}
		slog.Warn("connection lost, reconnecting", "error", err)
	}
}

// readLoop reads WebSocket frames in a loop and dispatches each one.
// It returns on any read error (connection drop) or ctx cancellation.
func (d *Daemon) readLoop(ctx context.Context) error {
	for {
		f, err := d.ws.ReadFrame()
		if err != nil {
			return err
		}
		d.dispatch(ctx, f)
	}
}

// dispatch routes an incoming WebSocket frame to the appropriate handler.
// New frame types only require adding a case here — the read loop stays clean.
func (d *Daemon) dispatch(ctx context.Context, f v1.Frame) {
	switch f.Type {
	case v1.FrameTypeHeartbeatAck:
		d.handleHeartbeatAck(ctx, f)
	case v1.FrameTypeTaskWake:
		d.handleTaskWake(ctx, f)
	case v1.FrameTypeError:
		slog.Warn("server error frame", "payload", string(f.Payload))
	default:
		slog.Warn("unknown frame type", "type", f.Type)
	}
}

// heartbeatLoop sends a heartbeat frame on a fixed interval.
// It runs in its own goroutine, independent of the main connection loop.
func (d *Daemon) heartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(d.cfg.HeartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			d.sendHeartbeat(ctx)
		}
	}
}

// handleHeartbeatAck processes the server's response to a heartbeat.
// It iterates pending actions (task_available, shutdown, etc.).
func (d *Daemon) handleHeartbeatAck(ctx context.Context, f v1.Frame) {
	var ack v1.WSHeartbeatAckPayload
	if err := json.Unmarshal(f.Payload, &ack); err != nil {
		slog.Warn("bad heartbeat_ack", "error", err)
		return
	}
	for _, action := range ack.PendingActions {
		switch action.Type {
		case v1.ActionTaskAvailable:
			var tasks v1.TaskAvailablePayload
			if err := json.Unmarshal(action.Payload, &tasks); err != nil {
				slog.Warn("bad task_available payload", "error", err)
				continue
			}
			for _, t := range tasks.Tasks {
				slog.Info("task available via heartbeat", "task_id", t.TaskID)
				// TODO: claim and execute task via HTTP.
			}
		case v1.ActionShutdown:
			slog.Info("server requested shutdown")
			if d.cancelFunc != nil {
				go d.cancelFunc()
			}
		default:
			slog.Info("heartbeat action", "type", action.Type)
		}
	}
}

// handleTaskWake processes a server-pushed task wake notification.
func (d *Daemon) handleTaskWake(ctx context.Context, f v1.Frame) {
	var p v1.WSTaskWakePayload
	if err := json.Unmarshal(f.Payload, &p); err != nil {
		slog.Warn("bad task_wake payload", "error", err)
		return
	}
	slog.Info("task wake received", "task_id", p.TaskID, "priority", p.Priority)
	// TODO: claim and execute task via HTTP.
}

// sendHeartbeat sends a heartbeat frame to the server.
func (d *Daemon) sendHeartbeat(ctx context.Context) {
	if d.ws == nil {
		return
	}
	payload := v1.WSHeartbeatPayload{
		DaemonVersion: d.cfg.DaemonVersion,
		ActiveTasks:   []string{},
	}
	if err := d.ws.SendHeartbeat(ctx, payload); err != nil {
		slog.Warn("heartbeat error", "error", err)
	}
}

// Status scans and displays the current machine capabilities.
// It does NOT upload anything to the server.
func (d *Daemon) Status(ctx context.Context) error {
	info, runtimes := d.DetectRuntimes()
	PrintRuntimes(os.Stdout, info, runtimes)
	return nil
}
