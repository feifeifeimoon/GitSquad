package v1

import (
	"time"

	"github.com/google/uuid"
)

type DaemonStatus = string

const (
	DaemonStatusRegistered = "registered"
	DaemonStatusOnline     = "online"
	DaemonStatusOffline    = "offline"
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

// DeleteDaemonResponse is returned by DELETE /api/v1/daemons/:id.
type DeleteDaemonResponse struct {
	Deleted bool `json:"deleted"`
}
