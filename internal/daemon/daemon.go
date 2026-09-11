package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/client"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	"github.com/feifeifeimoon/GitSquad/internal/daemon/provider"
	"github.com/feifeifeimoon/GitSquad/internal/daemon/runner"
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

	// Task execution (max_concurrency=1).
	taskWake     chan struct{}       // buffered signal to claim a task
	taskMu       sync.Mutex          // guards activeTaskID / activeCancel
	activeTaskID string
	activeCancel context.CancelFunc

	// runtimeMu guards lastRuntime (read by backendFor, written by refreshRuntimes).
	runtimeMu sync.Mutex
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
		taskWake:    make(chan struct{}, 1),
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
	d.runtimeMu.Lock()
	d.lastRuntime = runtimes
	d.runtimeMu.Unlock()
	slog.Info("runtimes detected", "count", len(runtimes))
	if err := d.client.Register(ctx, runtimes); err != nil {
		slog.Warn("register runtimes failed", "error", err)
	}

	go d.heartbeatLoop(ctx)
	go d.runtimeRefreshLoop(ctx)
	go d.taskLoop(ctx)

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
	case v1.FrameTypeRuntimeGone:
		d.handleRuntimeGone(ctx, f)
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
			slog.Info("task available via heartbeat")
			d.signalTask()
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
	d.signalTask()
}

// sendHeartbeat sends a heartbeat frame to the server.
func (d *Daemon) sendHeartbeat(ctx context.Context) {
	if d.ws == nil {
		return
	}
	payload := v1.WSHeartbeatPayload{
		DaemonVersion: d.cfg.DaemonVersion,
		ActiveTasks:   d.activeTasks(),
	}
	if err := d.ws.SendHeartbeat(ctx, payload); err != nil {
		slog.Warn("heartbeat error", "error", err)
	}
}

// taskLoop waits for a task wake signal, then drains the server queue by
// claiming and running tasks sequentially (max_concurrency=1).
func (d *Daemon) taskLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-d.taskWake:
		}
		d.drainTasks(ctx)
	}
}

// drainTasks claims and runs tasks until the queue is empty or a claim fails.
func (d *Daemon) drainTasks(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}
		task, err := d.client.ClaimTask(ctx)
		if err != nil {
			slog.Warn("claim task failed", "error", err)
			return
		}
		if task == nil {
			return // queue empty
		}
		if err := d.runTask(ctx, *task); err != nil {
			slog.Warn("task failed", "task_id", task.ID, "error", err)
		}
	}
}

// runTask resolves the provider backend and runs one task via the Runner.
func (d *Daemon) runTask(ctx context.Context, task v1.Task) error {
	reporter := runner.NewHTTPReporter(d.client)

	backend, err := d.backendFor(task.Agent.Provider)
	if err != nil {
		// The task is already claimed, so it can never be re-claimed. Report the
		// failure instead of leaving it stranded in dispatched with no trace.
		_ = reporter.Report(ctx, task.ID, v1.TaskReport{Status: v1.TaskReportFailed, Error: err.Error()})
		return err
	}
	r := runner.New(runner.NewGitCLI(), backend, reporter, d.cfg.WorkDir)

	taskCtx, cancel := context.WithCancel(ctx)
	d.setActive(task.ID.String(), cancel)
	defer d.clearActive()

	return r.Run(taskCtx, task)
}

// backendFor resolves the provider backend for kind using the detected
// executable path (falls back to PATH lookup when the path is empty).
func (d *Daemon) backendFor(kind string) (provider.Backend, error) {
	d.runtimeMu.Lock()
	defer d.runtimeMu.Unlock()
	exePath := ""
	for _, rt := range d.lastRuntime {
		if rt.Kind == kind {
			exePath = rt.ExecutablePath
			break
		}
	}
	return provider.New(kind, exePath, nil)
}

func (d *Daemon) signalTask() {
	select {
	case d.taskWake <- struct{}{}:
	default:
	}
}

func (d *Daemon) setActive(id string, cancel context.CancelFunc) {
	d.taskMu.Lock()
	defer d.taskMu.Unlock()
	d.activeTaskID = id
	d.activeCancel = cancel
}

func (d *Daemon) clearActive() {
	d.taskMu.Lock()
	defer d.taskMu.Unlock()
	d.activeTaskID = ""
	d.activeCancel = nil
}

func (d *Daemon) activeTasks() []string {
	d.taskMu.Lock()
	defer d.taskMu.Unlock()
	if d.activeTaskID == "" {
		return []string{}
	}
	return []string{d.activeTaskID}
}

// handleRuntimeGone cancels the in-flight task (if any) and acks cleanup.
func (d *Daemon) handleRuntimeGone(_ context.Context, f v1.Frame) {
	d.taskMu.Lock()
	cancel := d.activeCancel
	d.taskMu.Unlock()
	if cancel != nil {
		cancel()
	}
	if d.ws != nil {
		_ = d.ws.WriteFrame(v1.Frame{Type: v1.FrameTypeRuntimeGoneAck, Payload: f.Payload})
	}
}

// runtimeRefreshLoop periodically re-runs runtime detection and re-registers
// when the capability set changes, so runtimes installed while the daemon is
// running show up without a restart.
func (d *Daemon) runtimeRefreshLoop(ctx context.Context) {
	if d.cfg.RuntimeRefreshInterval <= 0 {
		return
	}
	ticker := time.NewTicker(d.cfg.RuntimeRefreshInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			d.refreshRuntimes(ctx)
		}
	}
}

// refreshRuntimes re-detects runtimes and, if anything changed, re-registers
// with the server (the endpoint is idempotent: upsert + delete-not-in).
func (d *Daemon) refreshRuntimes(ctx context.Context) {
	_, runtimes := d.DetectRuntimes()
	d.runtimeMu.Lock()
	changed := !runtimesEqual(d.lastRuntime, runtimes)
	if changed {
		d.lastRuntime = runtimes
	}
	d.runtimeMu.Unlock()
	if !changed {
		return
	}
	if err := d.client.Register(ctx, runtimes); err != nil {
		slog.Warn("register runtimes failed", "error", err)
		return
	}
	slog.Info("runtimes refreshed", "count", len(runtimes))
}

// runtimesEqual compares two runtime lists for equality in spec order. Only
// user-visible fields participate — an exact ordering match is sufficient
// because DetectAll iterates specs in a stable order.
func runtimesEqual(a, b []v1.Runtime) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Kind != b[i].Kind ||
			a[i].ExecutablePath != b[i].ExecutablePath ||
			a[i].Version != b[i].Version ||
			a[i].Status != b[i].Status {
			return false
		}
	}
	return true
}

// Status scans and displays the current machine capabilities.
// It does NOT upload anything to the server.
func (d *Daemon) Status(ctx context.Context) error {
	info, runtimes := d.DetectRuntimes()
	PrintRuntimes(os.Stdout, info, runtimes)
	return nil
}
