package repository

import (
	"context"
	"fmt"

	"github.com/feifeifeimoon/GitSquad/internal/server/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type UserIdentityRepo struct {
	pool *pgxpool.Pool
}

func NewUserIdentityRepo(pool *pgxpool.Pool) *UserIdentityRepo {
	return &UserIdentityRepo{pool: pool}
}

// FindByProvider returns the identity and associated user for a given provider + provider_user_id.
// Returns nil, nil if not found.
func (r *UserIdentityRepo) FindByProvider(ctx context.Context, provider, providerUserID string) (*model.UserIdentity, *model.User, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT
			ui.id, ui.user_id, ui.provider, ui.provider_user_id,
			ui.provider_login, ui.email, ui.access_token, ui.refresh_token,
			ui.created_at, ui.updated_at,
			u.id, u.login, u.avatar_url, u.created_at, u.updated_at
		 FROM user_identities ui
		 JOIN users u ON u.id = ui.user_id
		 WHERE ui.provider = $1 AND ui.provider_user_id = $2`,
		provider, providerUserID,
	)
	if err != nil {
		return nil, nil, fmt.Errorf("find identity by provider: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, nil, nil // not found
	}

	identity := &model.UserIdentity{}
	user := &model.User{}
	err = rows.Scan(
		&identity.ID, &identity.UserID, &identity.Provider, &identity.ProviderUserID,
		&identity.ProviderLogin, &identity.Email, &identity.AccessToken, &identity.RefreshToken,
		&identity.CreatedAt, &identity.UpdatedAt,
		&user.ID, &user.Login, &user.AvatarURL, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, nil, fmt.Errorf("scan identity + user: %w", err)
	}

	return identity, user, nil
}

// Create links a new identity to an existing user.
func (r *UserIdentityRepo) Create(ctx context.Context, identity *model.UserIdentity) (*model.UserIdentity, error) {
	err := r.pool.QueryRow(ctx,
		`INSERT INTO user_identities
			(user_id, provider, provider_user_id, provider_login, email, access_token, refresh_token)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, created_at, updated_at`,
		identity.UserID, identity.Provider, identity.ProviderUserID,
		identity.ProviderLogin, identity.Email, identity.AccessToken, identity.RefreshToken,
	).Scan(&identity.ID, &identity.CreatedAt, &identity.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert identity: %w", err)
	}
	return identity, nil
}

// UpdateTokens updates the access_token and refresh_token for an identity.
func (r *UserIdentityRepo) UpdateTokens(ctx context.Context, id uuid.UUID, accessToken, refreshToken string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE user_identities
		 SET access_token = $2, refresh_token = $3, updated_at = now()
		 WHERE id = $1`,
		id, accessToken, refreshToken,
	)
	if err != nil {
		return fmt.Errorf("update identity tokens: %w", err)
	}
	return nil
}
