package model

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID        uuid.UUID
	Login     string
	AvatarURL string
	CreatedAt time.Time
	UpdatedAt time.Time
}
