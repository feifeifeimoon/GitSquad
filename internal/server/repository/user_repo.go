package repository

import (
	"context"
	"fmt"

	"github.com/feifeifeimoon/GitSquad/internal/server/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type UserRepo struct {
	pool *pgxpool.Pool
}

func NewUserRepo(pool *pgxpool.Pool) *UserRepo {
	return &UserRepo{pool: pool}
}

func (r *UserRepo) Create(ctx context.Context, login, avatarURL string) (*model.User, error) {
	user := &model.User{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO users (login, avatar_url)
		 VALUES ($1, $2)
		 RETURNING id, login, avatar_url, created_at, updated_at`,
		login, avatarURL,
	).Scan(&user.ID, &user.Login, &user.AvatarURL, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}
	return user, nil
}

func (r *UserRepo) FindByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	user := &model.User{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, login, avatar_url, created_at, updated_at
		 FROM users WHERE id = $1`,
		id,
	).Scan(&user.ID, &user.Login, &user.AvatarURL, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("find user by id: %w", err)
	}
	return user, nil
}

func (r *UserRepo) UpdateAvatar(ctx context.Context, id uuid.UUID, avatarURL string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET avatar_url = $2, updated_at = now()
		 WHERE id = $1`,
		id, avatarURL,
	)
	if err != nil {
		return fmt.Errorf("update user avatar: %w", err)
	}
	return nil
}
