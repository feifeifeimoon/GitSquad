package daemon

import (
	"context"
	"fmt"
	"log/slog"
	"os"
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
}

// New creates a Daemon with the given configuration.
// The HTTP client and runtime registry are initialized eagerly.
func New(cfg daemonconfig.Config) *Daemon {
	return &Daemon{
		cfg:         cfg,
		client:      client.New(cfg.APIURL, cfg.Token),
		registry:    DefaultRegistry(),
		lastRuntime: make([]v1.Runtime, 0),
	}
}

// Run starts the daemon: connects to the server via WebSocket, uploads
// detected runtimes, and enters the event loop.
func (d *Daemon) Run(ctx context.Context) error {
	if d.cfg.Token == "" {
		return fmt.Errorf("not logged in. Run 'gitsquad daemon login' first")
	}
	if d.cfg.ID == "" {
		return fmt.Errorf("daemon id missing. Run 'gitsquad daemon login' first")
	}

	slog.Info("connecting", "url", d.cfg.APIURL)

	ws, err := d.client.ConnectWS(ctx, d.cfg.ID)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer ws.Close()
	d.ws = ws

	slog.Info("daemon online")

	_, runtimes := d.DetectRuntimes()
	d.lastRuntime = runtimes
	slog.Info("runtimes detected", "count", len(runtimes))
	if err := d.client.PutRuntimes(ctx, d.cfg.ID, runtimes); err != nil {
		slog.Warn("upload runtimes failed", "error", err)
	}

	return d.eventLoop(ctx)
}

// eventLoop is the main event-driven loop: reads WebSocket frames,
// sends heartbeats, and dispatches incoming tasks.
func (d *Daemon) eventLoop(ctx context.Context) error {
	heartbeatTicker := time.NewTicker(d.cfg.HeartbeatInterval)
	defer heartbeatTicker.Stop()

	frames := make(chan v1.Frame, 8)
	errs := make(chan error, 1)
	go d.readFrames(ctx, frames, errs)

	for {
		select {
		case <-ctx.Done():
			slog.Info("daemon shutting down")
			return nil

		case <-heartbeatTicker.C:
			d.sendHeartbeat(ctx)

		case f := <-frames:
			d.handleFrame(ctx, f)

		case err := <-errs:
			slog.Error("websocket read error", "error", err)
			return err
		}
	}
}

// readFrames continuously reads frames from the WebSocket and sends them
// to the frames channel. It sends any error to errs and returns.
func (d *Daemon) readFrames(ctx context.Context, frames chan<- v1.Frame, errs chan<- error) {
	for {
		f, err := d.ws.ReadFrame()
		if err != nil {
			errs <- err
			return
		}
		select {
		case frames <- f:
		case <-ctx.Done():
			return
		}
	}
}

// handleFrame dispatches an incoming WebSocket frame by type.
func (d *Daemon) handleFrame(ctx context.Context, f v1.Frame) {
	switch f.Type {
	case v1.FrameTypeHeartbeatAck:
		// Server confirms connectivity.

	case v1.FrameTypeTaskWake:
		slog.Info("task received", "payload", string(f.Payload))

	default:
		slog.Warn("unknown frame type", "type", f.Type)
	}
}

// sendHeartbeat sends a heartbeat frame to the server.
func (d *Daemon) sendHeartbeat(ctx context.Context) {
	summary := make(map[string]string, len(d.lastRuntime))
	for _, rt := range d.lastRuntime {
		summary[rt.Kind] = rt.Version
	}

	payload := v1.WSHeartbeatPayload{
		Status:         "online",
		DaemonVersion:  d.cfg.DaemonVersion,
		ActiveTasks:    []string{},
		RuntimeSummary: summary,
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
