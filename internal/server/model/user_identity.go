package model

import (
	"time"

	"github.com/google/uuid"
)

type UserIdentity struct {
	ID             uuid.UUID
	UserID         uuid.UUID
	Provider       string // "github", "google", "email"
	ProviderUserID string // external platform's unique ID
	ProviderLogin  string
	Email          string
	AccessToken    string
	RefreshToken   string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}
