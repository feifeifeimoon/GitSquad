package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/daemon"
	"github.com/spf13/cobra"
)

var daemonStopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the running daemon.",
	Long:  "Send a shutdown request to the running GitSquad daemon.",
	RunE:  runDaemonStop,
}

func runDaemonStop(cmd *cobra.Command, args []string) error {
	info, err := daemon.ReadDaemonState()
	if err != nil {
		return fmt.Errorf("no daemon running (state file not found)")
	}

	// Verify it's actually alive.
	if _, err := healthCheck(info.Port); err != nil {
		_ = os.Remove(daemonStatePath())
		return fmt.Errorf("daemon not responding (pid: %d), cleaned up stale state", info.PID)
	}

	fmt.Printf("Stopping daemon (pid: %d)...\n", info.PID)

	// POST /shutdown.
	url := fmt.Sprintf("http://127.0.0.1:%d/shutdown", info.Port)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return fmt.Errorf("failed to create shutdown request: %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to reach daemon: %w", err)
	}
	resp.Body.Close()

	// Wait for the daemon to exit. Check health — once it stops responding
	// the daemon is down, then clean up the state file.
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := healthCheck(info.Port); err != nil {
			_ = os.Remove(daemonStatePath())
			fmt.Println("Daemon stopped.")
			return nil
		}
		time.Sleep(300 * time.Millisecond)
	}

	// Timeout — force cleanup.
	_ = os.Remove(daemonStatePath())
	return fmt.Errorf("daemon did not stop in time, cleaned up state")
}
