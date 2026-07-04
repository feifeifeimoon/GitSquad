package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// DaemonInfo is persisted to ~/.gitsquad/daemon.json so CLI commands
// (stop, status) can locate the running daemon.
type DaemonInfo struct {
	PID  int `json:"pid"`
	Port int `json:"port"`
}

func daemonStatePath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".gitsquad", "daemon.json")
}

// writeDaemonState persists the daemon's PID and health port.
func writeDaemonState(port int) error {
	dir := filepath.Dir(daemonStatePath())
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	data, err := json.Marshal(DaemonInfo{PID: os.Getpid(), Port: port})
	if err != nil {
		return err
	}
	return os.WriteFile(daemonStatePath(), data, 0600)
}

// ReadDaemonState reads the persisted daemon state.
// Returns zero values and an error if the file is missing or corrupt.
func ReadDaemonState() (DaemonInfo, error) {
	data, err := os.ReadFile(daemonStatePath())
	if err != nil {
		return DaemonInfo{}, err
	}
	var info DaemonInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return DaemonInfo{}, fmt.Errorf("corrupt daemon state: %w", err)
	}
	return info, nil
}

// clearDaemonState removes the daemon state file.
func clearDaemonState() {
	path := daemonStatePath()
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		slog.Warn("failed to remove daemon state", "path", path, "error", err)
	}
}

// healthResponse is the JSON body for GET /health.
type healthResponse struct {
	Status        string `json:"status"`
	PID           int    `json:"pid"`
	Uptime        string `json:"uptime"`
	DaemonVersion string `json:"daemon_version"`
}

// listenHealth binds a TCP listener on 127.0.0.1:0. If the port is already
// in use (another daemon running), it returns a descriptive error.
func (d *Daemon) listenHealth() (net.Listener, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	return ln, nil
}

// serveHealth starts an HTTP server on ln that serves /health and /shutdown.
// It blocks on srv.Serve(ln) and shuts down cleanly when ctx is cancelled.
func (d *Daemon) serveHealth(ctx context.Context, ln net.Listener, startedAt time.Time) {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", d.healthHandler(startedAt))
	mux.HandleFunc("/shutdown", d.shutdownHandler())

	srv := &http.Server{Handler: mux}

	go func() {
		<-ctx.Done()
		srv.Close()
	}()

	slog.Info("health server listening", "addr", ln.Addr().String())
	if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
		slog.Warn("health server error", "error", err)
	}
}

// healthHandler returns a handler that reports daemon liveness and readiness.
func (d *Daemon) healthHandler(startedAt time.Time) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		status := "starting"
		if d.ready.Load() {
			status = "running"
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(healthResponse{
			Status:        status,
			PID:           os.Getpid(),
			Uptime:        time.Since(startedAt).Truncate(time.Second).String(),
			DaemonVersion: d.cfg.DaemonVersion,
		})
	}
}

// shutdownHandler returns a handler that triggers graceful daemon shutdown.
// cancelFunc is called in a goroutine so the HTTP response flushes before
// the health server itself is closed.
func (d *Daemon) shutdownHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "shutting down"})

		if d.cancelFunc != nil {
			go d.cancelFunc()
		}
	}
}
