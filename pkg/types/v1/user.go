package v1

import (
	"time"

	"github.com/google/uuid"
)

// User represents a GitSquad user.
type User struct {
	ID        uuid.UUID `json:"id"`
	Login     string    `json:"login"`
	AvatarURL string    `json:"avatar_url"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// MeResponse is returned by GET /api/v1/me.
type MeResponse struct {
	ID        uuid.UUID `json:"id"`
	Login     string    `json:"login"`
	AvatarURL string    `json:"avatar_url"`
}
