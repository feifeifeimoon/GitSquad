package service

import (
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/google/uuid"
)

type TokenStatus = string

const (
	TokenPending = "pending"
	TokenActive  = "active"
	TokenExpired = "expired"
)

// DaemonToken is the server-internal token model. It is never exposed directly
// to the daemon or frontend — only TokenPrefix is returned via API.
type DaemonToken struct {
	ID          uuid.UUID  `json:"id"`
	UserID      *uuid.UUID `json:"user_id,omitempty"`
	DaemonID    *uuid.UUID `json:"daemon_id,omitempty"`
	TokenHash   string     `json:"-"`
	TokenPrefix string     `json:"token_prefix"`
	PairingCode *string    `json:"pairing_code,omitempty"`
	MachineName *string    `json:"machine_name,omitempty"`
	Status      string     `json:"status"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	IssuedAt    time.Time  `json:"issued_at"`
	ConfirmedAt *time.Time `json:"confirmed_at,omitempty"`
	LastUsedAt  *time.Time `json:"last_used_at,omitempty"`
}

// Conversion helpers for server-internal types.

func toToken(t *db.DaemonToken) *DaemonToken {
	return &DaemonToken{
		ID:          t.ID,
		UserID:      nullUUIDToPtr(t.UserID),
		DaemonID:    nullUUIDToPtr(t.DaemonID),
		TokenHash:   t.TokenHash,
		TokenPrefix: t.TokenPrefix,
		PairingCode: t.PairingCode,
		MachineName: t.MachineName,
		Status:      t.Status,
		ExpiresAt:   pgTimePtr(t.ExpiresAt),
		IssuedAt:    t.IssuedAt.Time,
		ConfirmedAt: pgTimePtr(t.ConfirmedAt),
		LastUsedAt:  pgTimePtr(t.LastUsedAt),
	}
}
