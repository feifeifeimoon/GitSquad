package app

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/client"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
)

func Login(ctx context.Context, cfg daemonconfig.Config, token string, name string) error {
	if name != "" {
		cfg.DaemonName = name
	}

	// Token mode: direct auth with pre-generated token.
	if token != "" {
		return loginByToken(ctx, cfg, token)
	}

	// Pairing mode: browser OAuth flow.
	return loginByPairing(ctx, cfg)
}

func loginByToken(ctx context.Context, cfg daemonconfig.Config, token string) error {
	c := client.New(cfg.APIURL, token)
	authResp, _, err := c.Auth(ctx, client.AuthRequest{
		MachineName:   cfg.DaemonName,
		OS:            cfg.OS(),
		Arch:          cfg.Arch(),
		DaemonVersion: cfg.DaemonVersion,
		Mode:          "token",
	})
	if err != nil {
		return fmt.Errorf("token auth failed: %w", err)
	}

	fmt.Printf("✓ Authenticated as daemon %s\n", authResp.DaemonID)
	return saveCfgAndReturn(cfg, authResp.DaemonID, token)
}

func loginByPairing(ctx context.Context, cfg daemonconfig.Config) error {
	// 1. Initiate pairing.
	c := client.New(cfg.APIURL, "")
	_, pairResp, err := c.Auth(ctx, client.AuthRequest{
		MachineName:   cfg.DaemonName,
		OS:            cfg.OS(),
		Arch:          cfg.Arch(),
		DaemonVersion: cfg.DaemonVersion,
		Mode:          "pairing",
	})
	if err != nil {
		return fmt.Errorf("pairing init failed: %w", err)
	}

	// 2. Open browser.
	if pairResp.BrowserURL == "" {
		return fmt.Errorf("server returned empty browser URL")
	}
	fmt.Printf("Opening browser to complete login...\n")
	fmt.Printf("If the browser doesn't open, visit:\n  %s\n\n", pairResp.BrowserURL)
	_ = openBrowser(pairResp.BrowserURL)

	// 3. Poll for confirmation.
	interval := time.Duration(pairResp.PollIntervalMs) * time.Millisecond
	if interval < 2*time.Second {
		interval = 2 * time.Second
	}

	fmt.Print("Waiting for confirmation")
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(interval):
			fmt.Print(".")
		}

		pr, err := c.PollPairing(ctx, pairResp.PairingCode)
		if err != nil {
			continue
		}

		switch pr.Status {
		case "pending":
			continue
		case "confirmed":
			fmt.Printf("\n✓ Authenticated as daemon %s\n", pr.DaemonID)
			return saveCfgAndReturn(cfg, pr.DaemonID, pr.Token)
		case "expired":
			fmt.Println()
			return fmt.Errorf("pairing expired: %s", pr.Message)
		case "rejected":
			fmt.Println()
			return fmt.Errorf("pairing rejected")
		case "consumed":
			fmt.Println()
			return fmt.Errorf("token already claimed")
		default:
			fmt.Printf("\nunexpected status: %s\n", pr.Status)
			continue
		}
	}
}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "linux":
		return exec.Command("xdg-open", url).Start()
	case "darwin":
		return exec.Command("open", url).Start()
	case "windows":
		return exec.Command("cmd", "/c", "start", url).Start()
	default:
		return fmt.Errorf("unsupported OS")
	}
}

func saveCfgAndReturn(cfg daemonconfig.Config, id, token string) error {
	cfg.ID = id
	cfg.Token = token
	return cfg.Save()
}
