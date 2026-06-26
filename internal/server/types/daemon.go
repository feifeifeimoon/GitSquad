package types

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

type TokenStatus = string

const (
	TokenPending = "pending"
	TokenActive  = "active"
	TokenExpired = "expired"
)

type DaemonToken struct {
	ID           uuid.UUID  `json:"id"`
	UserID       *uuid.UUID `json:"user_id,omitempty"`
	DaemonID     *uuid.UUID `json:"daemon_id,omitempty"`
	TokenHash    string     `json:"-"`
	TokenPrefix  string     `json:"token_prefix"`
	PairingCode  *string    `json:"pairing_code,omitempty"`
	MachineName  *string    `json:"machine_name,omitempty"`
	Status       string     `json:"status"`
	ExpiresAt    *time.Time `json:"expires_at,omitempty"`
	IssuedAt     time.Time  `json:"issued_at"`
	ConfirmedAt  *time.Time `json:"confirmed_at,omitempty"`
	LastUsedAt   *time.Time `json:"last_used_at,omitempty"`
}

type DaemonWithRuntimes struct {
	Daemon
	Runtimes []Runtime `json:"runtimes"`
}
