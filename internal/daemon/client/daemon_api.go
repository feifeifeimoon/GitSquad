package client

import (
	"context"
	"fmt"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
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

// Register sends the daemon's runtime capabilities to the server.
// The daemon identity is resolved from the Authorization token — no daemon ID in the URL.
func (c *Client) Register(ctx context.Context, runtimes []v1.Runtime) error {
	body := v1.RegisterRequest{Runtimes: runtimes}
	if err := c.Do(ctx, "PUT", "/api/v1/daemon/runtimes", body, nil); err != nil {
		return fmt.Errorf("register runtimes: %w", err)
	}
	return nil
}

// ClaimTask requests a pending task for this daemon. It returns a nil task
// (and nil error) when the queue is empty.
func (c *Client) ClaimTask(ctx context.Context) (*v1.Task, error) {
	var task v1.Task
	if err := c.Do(ctx, "POST", "/api/v1/daemon/tasks/claim", nil, &task); err != nil {
		return nil, fmt.Errorf("claim task: %w", err)
	}
	if task.ID == uuid.Nil {
		return nil, nil
	}
	return &task, nil
}

// ReportTaskStatus reports a task lifecycle event (started / succeeded /
// failed, optionally with a progress event or artifact summary).
func (c *Client) ReportTaskStatus(ctx context.Context, taskID string, report v1.TaskReport) error {
	if err := c.Do(ctx, "POST", "/api/v1/daemon/tasks/"+taskID+"/status", report, nil); err != nil {
		return fmt.Errorf("report task status: %w", err)
	}
	return nil
}
