package v1

import (
	"time"

	"github.com/google/uuid"
)

type DaemonStatus = string

const (
	DaemonStatusOnline = "online"
)

// Daemon represents a registered daemon machine.
type Daemon struct {
	ID            uuid.UUID  `json:"id"`
	UserID        uuid.UUID  `json:"user_id"`
	TokenID       *uuid.UUID `json:"token_id,omitempty"`
	Name          string     `json:"name"`
	OS            string     `json:"os"`
	Arch          string     `json:"arch"`
	DaemonVersion string     `json:"daemon_version"`
	Status        string     `json:"status"`
	LastSeenAt    *time.Time `json:"last_seen_at"`
	ConnectedAt   *time.Time `json:"connected_at"`
	RegisteredAt  time.Time  `json:"registered_at"`
}

// DaemonWithRuntimes embeds Daemon and adds its runtimes.
type DaemonWithRuntimes struct {
	Daemon
	Runtimes []Runtime `json:"runtimes"`
}

// DaemonDetail is the daemon detail payload: the machine plus each runtime it
// reported, with the agents bound to that runtime nested underneath.
type DaemonDetail struct {
	Daemon
	Runtimes []DaemonRuntime `json:"runtimes"`
}

// DaemonRuntime is a runtime together with the agents configured against it.
type DaemonRuntime struct {
	Runtime
	Agents []DaemonAgent `json:"agents"`
}

// DaemonAgent is an agent bound to a runtime, flattened with the context the
// daemon page needs: which workspace it lives in and what it is doing now.
// Provider is the binding key — an agent runtime and a daemon runtime are the
// same thing when their provider and kind match.
// RunningCount / QueuedCount / CurrentTask mirror the agent list's workload
// fields so both surfaces describe an agent the same way.
type DaemonAgent struct {
	ID            uuid.UUID         `json:"id"`
	WorkspaceID   uuid.UUID         `json:"workspace_id"`
	WorkspaceSlug string            `json:"workspace_slug"`
	WorkspaceName string            `json:"workspace_name"`
	Name          string            `json:"name"`
	AvatarURL     string            `json:"avatar_url,omitempty"`
	Provider      string            `json:"provider"`
	Model         string            `json:"model"`
	Enabled       bool              `json:"enabled"`
	RunningCount  int               `json:"running_count"`
	QueuedCount   int               `json:"queued_count"`
	TotalRuns     int               `json:"total_runs"`
	CurrentTask   *AgentCurrentTask `json:"current_task,omitempty"`
}

// UpdateDaemonRequest is the body for PATCH /api/v1/daemons/:id. Only the name
// is editable — everything else is reported by the daemon on registration.
type UpdateDaemonRequest struct {
	Name *string `json:"name"`
}

// DeleteDaemonResponse is returned by DELETE /api/v1/daemons/:id.
type DeleteDaemonResponse struct {
	Deleted bool `json:"deleted"`
}
