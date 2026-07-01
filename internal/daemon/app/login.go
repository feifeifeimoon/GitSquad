package app

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/client"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// Login authenticates this machine with GitSquad.
// When token is non-empty, it performs direct token auth.
// Otherwise it opens a browser for OAuth pairing.
func (d *Daemon) Login(ctx context.Context, token string, name string) error {
	if name != "" {
		d.cfg.DaemonName = name
	}

	if token != "" {
		return d.loginByToken(ctx, token)
	}
	return d.loginByPairing(ctx)
}

func (d *Daemon) loginByToken(ctx context.Context, token string) error {
	d.client = client.New(d.cfg.APIURL, token)

	resp, _, err := d.client.Auth(ctx, v1.DaemonAuthRequest{
		MachineName:   d.cfg.DaemonName,
		OS:            d.cfg.OS(),
		Arch:          d.cfg.Arch(),
		DaemonVersion: d.cfg.DaemonVersion,
		Mode:          "token",
	})
	if err != nil {
		return fmt.Errorf("token auth failed: %w", err)
	}

	fmt.Printf("✓ Authenticated as daemon %s\n", resp.DaemonID)
	return d.saveIdentity(resp.DaemonID, token)
}

func (d *Daemon) loginByPairing(ctx context.Context) error {
	d.client = client.New(d.cfg.APIURL, "")

	_, pairResp, err := d.client.Auth(ctx, v1.DaemonAuthRequest{
		MachineName:   d.cfg.DaemonName,
		OS:            d.cfg.OS(),
		Arch:          d.cfg.Arch(),
		DaemonVersion: d.cfg.DaemonVersion,
		Mode:          "pairing",
	})
	if err != nil {
		return fmt.Errorf("pairing init failed: %w", err)
	}

	if pairResp.BrowserURL == "" {
		return fmt.Errorf("server returned empty browser URL")
	}
	fmt.Printf("Opening browser to complete login...\n")
	fmt.Printf("If the browser doesn't open, visit:\n  %s\n\n", pairResp.BrowserURL)
	_ = openBrowser(pairResp.BrowserURL)

	interval := time.Duration(pairResp.PollIntervalMs) * time.Millisecond
	if interval < d.cfg.PollInterval {
		interval = d.cfg.PollInterval
	}

	fmt.Print("Waiting for confirmation")
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(interval):
			fmt.Print(".")
		}

		pr, err := d.client.PollPairing(ctx, pairResp.PairingCode)
		if err != nil {
			continue
		}

		switch pr.Status {
		case "pending":
			continue
		case "confirmed":
			fmt.Printf("\n✓ Authenticated as daemon %s\n", pr.DaemonID)
			return d.saveIdentity(pr.DaemonID, pr.Token)
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

func (d *Daemon) saveIdentity(id, token string) error {
	d.cfg.ID = id
	d.cfg.Token = token
	return d.cfg.Save()
}
