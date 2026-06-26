package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"time"

	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
)

type pairingResponse struct {
	PairingCode    string `json:"pairing_code"`
	BrowserURL     string `json:"browser_url"`
	ExpiresAt      string `json:"expires_at"`
	PollIntervalMs int    `json:"poll_interval_ms"`
}

type pollResponse struct {
	Status      string `json:"status"`
	DaemonID    string `json:"daemon_id"`
	Token       string `json:"token"`
	TokenPrefix string `json:"token_prefix"`
	Message     string `json:"message"`
}

type authRequest struct {
	MachineName   string `json:"machine_name"`
	OS            string `json:"os"`
	Arch          string `json:"arch"`
	DaemonVersion string `json:"daemon_version"`
	Mode          string `json:"mode"`
}

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
	body := authRequest{
		MachineName:   cfg.DaemonName,
		OS:            cfg.OS(),
		Arch:          cfg.Arch(),
		DaemonVersion: cfg.DaemonVersion,
		Mode:          "token",
	}

	resp, err := apiPost(ctx, cfg.APIURL+"/api/v1/daemon/auth", token, body)
	if err != nil {
		return fmt.Errorf("token auth failed: %w", err)
	}

	var result struct {
		DaemonID string `json:"daemon_id"`
		Token    string `json:"token"`
		Status   string `json:"status"`
	}
	if err := json.Unmarshal(resp, &result); err != nil {
		return fmt.Errorf("parse auth response: %w", err)
	}

	fmt.Printf("✓ Authenticated as daemon %s\n", result.DaemonID)
	return saveCfgAndReturn(cfg, result.DaemonID, token)
}

func loginByPairing(ctx context.Context, cfg daemonconfig.Config) error {
	// 1. Initiate pairing.
	body := authRequest{
		MachineName:   cfg.DaemonName,
		OS:            cfg.OS(),
		Arch:          cfg.Arch(),
		DaemonVersion: cfg.DaemonVersion,
		Mode:          "pairing",
	}

	resp, err := apiPost(ctx, cfg.APIURL+"/api/v1/daemon/auth", "", body)
	if err != nil {
		return fmt.Errorf("pairing init failed: %w", err)
	}

	var pairing pairingResponse
	if err := json.Unmarshal(resp, &pairing); err != nil {
		return fmt.Errorf("parse pairing response: %w", err)
	}

	// 2. Open browser.
	if pairing.BrowserURL == "" {
		return fmt.Errorf("server returned empty browser URL")
	}
	fmt.Printf("Opening browser to complete login...\n")
	fmt.Printf("If the browser doesn't open, visit:\n  %s\n\n", pairing.BrowserURL)
	_ = openBrowser(pairing.BrowserURL)

	// 3. Poll for confirmation.
	pollURL := fmt.Sprintf("%s/api/v1/daemon/auth/%s", cfg.APIURL, pairing.PairingCode)
	interval := time.Duration(pairing.PollIntervalMs) * time.Millisecond
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

		resp, err := apiGet(ctx, pollURL)
		if err != nil {
			continue
		}

		var pr pollResponse
		if err := json.Unmarshal(resp, &pr); err != nil {
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

type apiEnvelope struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
	Message string          `json:"message,omitempty"`
}

func apiPost(ctx context.Context, url, token string, body interface{}) ([]byte, error) {
	b, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	buf, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(buf)))
	}

	return unwrapEnvelope(buf)
}

func apiGet(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	buf, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	return unwrapEnvelope(buf)
}

func unwrapEnvelope(raw []byte) ([]byte, error) {
	var env apiEnvelope
	if err := json.Unmarshal(raw, &env); err != nil {
		// Not an envelope, return raw (backward compat).
		return raw, nil
	}
	if !env.Success && env.Message != "" {
		return nil, fmt.Errorf("%s", env.Message)
	}
	if env.Data != nil {
		return env.Data, nil
	}
	return raw, nil
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
