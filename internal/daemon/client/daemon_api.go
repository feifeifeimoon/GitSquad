package client

import (
	"context"
	"fmt"

	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

// ── Request / Response types ──────────────────────────────────────────

// AuthRequest is the body for POST /api/v1/daemon/auth.
type AuthRequest struct {
	MachineName   string `json:"machine_name"`
	OS            string `json:"os"`
	Arch          string `json:"arch"`
	DaemonVersion string `json:"daemon_version"`
	Mode          string `json:"mode"` // "token" or "pairing"
}

// AuthResponse is returned when authenticating with a pre-generated token.
type AuthResponse struct {
	DaemonID string `json:"daemon_id"`
	Token    string `json:"token"`
	Status   string `json:"status"`
}

// PairingResponse is returned when initiating a browser-based pairing.
type PairingResponse struct {
	PairingCode    string `json:"pairing_code"`
	BrowserURL     string `json:"browser_url"`
	ExpiresAt      string `json:"expires_at"`
	PollIntervalMs int    `json:"poll_interval_ms"`
}

// PollResponse is returned when polling a pairing code's status.
type PollResponse struct {
	Status      string `json:"status"`
	DaemonID    string `json:"daemon_id"`
	Token       string `json:"token"`
	TokenPrefix string `json:"token_prefix"`
	Message     string `json:"message"`
}

// ── API methods ───────────────────────────────────────────────────────

// Auth authenticates the daemon with the server.
// - Token mode (Client.Token != ""): returns (*AuthResponse, nil, error)
// - Pairing mode (Client.Token == ""): returns (nil, *PairingResponse, error)
func (c *Client) Auth(ctx context.Context, req AuthRequest) (*AuthResponse, *PairingResponse, error) {
	if c.Token != "" {
		var result AuthResponse
		if err := c.Do(ctx, "POST", "/api/v1/daemon/auth", req, &result); err != nil {
			return nil, nil, fmt.Errorf("auth: %w", err)
		}
		return &result, nil, nil
	}

	var result PairingResponse
	if err := c.Do(ctx, "POST", "/api/v1/daemon/auth", req, &result); err != nil {
		return nil, nil, fmt.Errorf("pairing init: %w", err)
	}
	return nil, &result, nil
}

// PollPairing checks the status of a pairing code.
func (c *Client) PollPairing(ctx context.Context, code string) (*PollResponse, error) {
	var result PollResponse
	if err := c.Do(ctx, "GET", "/api/v1/daemon/auth/"+code, nil, &result); err != nil {
		return nil, fmt.Errorf("poll pairing: %w", err)
	}
	return &result, nil
}

// PutRuntimes uploads the daemon's runtime capabilities to the server.
func (c *Client) PutRuntimes(ctx context.Context, daemonID string, runtimes []pkgtypes.Runtime) error {
	body := map[string]any{"runtimes": runtimes}
	if err := c.Do(ctx, "PUT", "/api/v1/daemon/"+daemonID+"/runtimes", body, nil); err != nil {
		return fmt.Errorf("put runtimes: %w", err)
	}
	return nil
}
