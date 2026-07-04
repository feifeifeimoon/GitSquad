package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/daemon"
	"github.com/spf13/cobra"
)

var daemonStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start the daemon in the background.",
	Long:  "Launch the GitSquad daemon as a detached background process.",
	RunE:  runDaemonStart,
}

func runDaemonStart(cmd *cobra.Command, args []string) error {
	// Check if already running.
	if info, err := daemon.ReadDaemonState(); err == nil {
		if resp, err := healthCheck(info.Port); err == nil && resp != nil {
			return fmt.Errorf("daemon already running (pid: %d, port: %d)", info.PID, info.Port)
		}
		// Stale file — clean up.
		_ = os.Remove(daemonStatePath())
	}

	// Resolve the current executable.
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("cannot find executable: %w", err)
	}

	// Spawn the child: "gitsquad daemon run".
	child := exec.Command(exe, "daemon", "run")
	child.SysProcAttr = daemonSysProcAttr()
	if err := child.Start(); err != nil {
		return fmt.Errorf("failed to start daemon: %w", err)
	}
	// Release the child so it runs independently.
	_ = child.Process.Release()

	// Poll health endpoint until the daemon is ready.
	state, err := waitForDaemon(15 * time.Second)
	if err != nil {
		return fmt.Errorf("daemon did not become ready: %w", err)
	}

	fmt.Printf("Daemon started (pid: %d, port: %d)\n", state.PID, state.Port)
	return nil
}

// daemonStatePath returns the path the daemon writes its state to.
func daemonStatePath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".gitsquad", "daemon.json")
}

// healthCheck calls GET /health on the daemon's HTTP server.
func healthCheck(port int) (map[string]any, error) {
	url := fmt.Sprintf("http://127.0.0.1:%d/health", port)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}

// waitForDaemon polls the daemon state file and health endpoint until the
// daemon is ready or timeout is reached.
func waitForDaemon(timeout time.Duration) (daemon.DaemonInfo, error) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		info, err := daemon.ReadDaemonState()
		if err != nil {
			time.Sleep(500 * time.Millisecond)
			continue
		}
		resp, err := healthCheck(info.Port)
		if err != nil {
			time.Sleep(500 * time.Millisecond)
			continue
		}
		if status, _ := resp["status"].(string); status == "running" || status == "starting" {
			return info, nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return daemon.DaemonInfo{}, fmt.Errorf("timeout waiting for daemon")
}
