// Package types holds shared domain types used by daemon, server, and frontend.
package types

import "github.com/google/uuid"

// Runtime is a capability record reported by the daemon.
// Only available runtimes are reported — missing ones are simply absent.
// Kind is the runtime identifier (e.g. "claude", "codex", "git").
type Runtime struct {
	Kind           string    `json:"kind"`
	ExecutablePath string    `json:"executable_path,omitempty"`
	Version        string    `json:"version,omitempty"`
	MaxConcurrency int       `json:"max_concurrency"`
	ID             uuid.UUID `json:"id,omitempty"`
	DaemonID       uuid.UUID `json:"daemon_id,omitempty"`
}
