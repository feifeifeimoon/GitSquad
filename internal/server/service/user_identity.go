package service

import (
	"time"

	"github.com/google/uuid"
)

// UserIdentity is the server-internal OAuth identity model.
// AccessToken and RefreshToken are never serialized in API responses.
type UserIdentity struct {
	ID             uuid.UUID `json:"id"`
	UserID         uuid.UUID `json:"user_id"`
	Provider       string    `json:"provider"`
	ProviderUserID string    `json:"provider_user_id"`
	ProviderLogin  string    `json:"provider_login"`
	Email          string    `json:"email"`
	AccessToken    string    `json:"-"`
	RefreshToken   string    `json:"-"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}
