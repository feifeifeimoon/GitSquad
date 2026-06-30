package app

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/client"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

func Run(ctx context.Context, cfg daemonconfig.Config) error {
	if cfg.Token == "" {
		return fmt.Errorf("not logged in. Run 'gitsquad daemon login' first")
	}
	if cfg.ID == "" {
		return fmt.Errorf("daemon id missing. Run 'gitsquad daemon login' first")
	}

	c := client.New(cfg.APIURL, cfg.Token)
	slog.Info("connecting", "url", c.BaseURL)

	ws, err := c.ConnectWS(ctx, cfg.ID)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer ws.Close()

	slog.Info("daemon online")

	scanResult := ScanCapabilities(cfg)
	slog.Info("capabilities", "available", countAvailable(scanResult))
	if err := scanResult.Upload(ctx, cfg, cfg.ID); err != nil {
		slog.Warn("upload capabilities failed", "error", err)
	}

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("daemon shutting down")
			return nil
		case <-ticker.C:
			if err := ws.SendHeartbeat(ctx, v1.WSHeartbeatPayload{
				Status:         "online",
				DaemonVersion:  cfg.DaemonVersion,
				ActiveTasks:    []string{},
				RuntimeSummary: runtimeSummary(scanResult),
			}); err != nil {
				slog.Warn("heartbeat error", "error", err)
			}
		}
	}
}

func countAvailable(result *ScanResult) int {
	return len(result.Runtimes)
}

func runtimeSummary(result *ScanResult) map[string]string {
	m := make(map[string]string)
	for _, rt := range result.Runtimes {
		m[rt.Kind] = rt.Version
	}
	return m
}
