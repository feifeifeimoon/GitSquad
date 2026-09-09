package runner

import (
	"context"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/client"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

// Reporter reports task progress and terminal state to the SaaS.
type Reporter interface {
	Report(ctx context.Context, taskID uuid.UUID, report v1.TaskReport) error
}

// HTTPReporter reports via the daemon HTTP client.
type HTTPReporter struct {
	client *client.Client
}

// NewHTTPReporter returns a Reporter backed by the daemon HTTP client.
func NewHTTPReporter(c *client.Client) *HTTPReporter {
	return &HTTPReporter{client: c}
}

func (r *HTTPReporter) Report(ctx context.Context, taskID uuid.UUID, report v1.TaskReport) error {
	return r.client.ReportTaskStatus(ctx, taskID.String(), report)
}
