package client

import (
	"context"
	"fmt"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// Auth authenticates the daemon with the server.
// - Token mode (Client.Token != ""): returns (*DaemonAuthTokenResponse, nil, error)
// - Pairing mode (Client.Token == ""): returns (nil, *DaemonAuthPairingResponse, error)
func (c *Client) Auth(ctx context.Context, req v1.DaemonAuthRequest) (*v1.DaemonAuthTokenResponse, *v1.DaemonAuthPairingResponse, error) {
	if c.Token != "" {
		var result v1.DaemonAuthTokenResponse
		if err := c.Do(ctx, "POST", "/api/v1/daemon/auth", req, &result); err != nil {
			return nil, nil, fmt.Errorf("auth: %w", err)
		}
		return &result, nil, nil
	}

	var result v1.DaemonAuthPairingResponse
	if err := c.Do(ctx, "POST", "/api/v1/daemon/auth", req, &result); err != nil {
		return nil, nil, fmt.Errorf("pairing init: %w", err)
	}
	return nil, &result, nil
}

// PollPairing checks the status of a pairing code.
func (c *Client) PollPairing(ctx context.Context, code string) (*v1.PairingPollResponse, error) {
	var result v1.PairingPollResponse
	if err := c.Do(ctx, "GET", "/api/v1/daemon/auth/"+code, nil, &result); err != nil {
		return nil, fmt.Errorf("poll pairing: %w", err)
	}
	return &result, nil
}

// PutRuntimes uploads the daemon's runtime capabilities to the server.
func (c *Client) PutRuntimes(ctx context.Context, daemonID string, runtimes []v1.Runtime) error {
	body := v1.PutRuntimesRequest{Runtimes: runtimes}
	if err := c.Do(ctx, "PUT", "/api/v1/daemon/"+daemonID+"/runtimes", body, nil); err != nil {
		return fmt.Errorf("put runtimes: %w", err)
	}
	return nil
}
