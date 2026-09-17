package v1

import "github.com/google/uuid"

// Detection outcomes for a runtime the daemon found. One that cannot be
// resolved at all is absent from the report rather than reported as an error,
// so only these two ever reach the runtimes.status column.
const (
	RuntimeStatusAvailable = "available"
	RuntimeStatusError     = "error"
)

// Runtime is a capability record reported by the daemon.
// Only available runtimes are reported — missing ones are simply absent.
// Kind is the runtime identifier (e.g. "claude", "codex", "git").
type Runtime struct {
	Kind           string    `json:"kind"`
	ExecutablePath string    `json:"executable_path,omitempty"`
	Version        string    `json:"version,omitempty"`
	MaxConcurrency int       `json:"max_concurrency"`
	Status         string    `json:"status,omitempty"`
	Diagnostics    string    `json:"diagnostics,omitempty"`
	ID             uuid.UUID `json:"id,omitempty"`
	DaemonID       uuid.UUID `json:"daemon_id,omitempty"`
}

// RegisterRequest is the body for PUT /api/v1/daemon/runtimes.
type RegisterRequest struct {
	Runtimes []Runtime `json:"runtimes"`
}

// RegisterResponse is the data returned on successful runtimes registration.
type RegisterResponse struct {
	Accepted int `json:"accepted"`
}
