// Package types holds shared domain types used by both daemon and server.
package types

// Runtime is a capability record reported by the daemon.
// Only available runtimes are reported — missing ones are simply absent.
// Kind is the runtime identifier (e.g. "claude", "codex", "git").
type Runtime struct {
	Kind           string `json:"kind"`
	ExecutablePath string `json:"executable_path,omitempty"`
	Version        string `json:"version,omitempty"`
	MaxConcurrency int    `json:"max_concurrency"`
}
