package types

import (
	"time"

	"github.com/google/uuid"
)

type Runtime struct {
	ID             uuid.UUID `json:"id"`
	DaemonID       uuid.UUID `json:"daemon_id"`
	Kind           string    `json:"kind"`
	Name           string    `json:"name"`
	ExecutablePath string    `json:"executable_path,omitempty"`
	Version        string    `json:"version,omitempty"`
	Status         string    `json:"status"`
	CheckedAt      time.Time `json:"checked_at"`
	Diagnostics    string    `json:"diagnostics,omitempty"`
	MaxConcurrency int       `json:"max_concurrency"`
}
