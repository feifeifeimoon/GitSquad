package service

import (
	"context"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

type UserService struct {
	store *store.Store
}

func NewUserService(s *store.Store) *UserService {
	return &UserService{store: s}
}

func (s *UserService) FindByID(ctx context.Context, id uuid.UUID) (*v1.User, error) {
	u, err := s.store.FindUserByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &v1.User{
		ID:        u.ID,
		Login:     u.Login,
		AvatarURL: strVal(u.AvatarUrl),
		CreatedAt: u.CreatedAt.Time,
		UpdatedAt: u.UpdatedAt.Time,
	}, nil
}

func (s *UserService) UpdateAvatar(ctx context.Context, id uuid.UUID, avatarURL string) error {
	return s.store.UpdateUserAvatar(ctx, db.UpdateUserAvatarParams{
		ID:        id,
		AvatarUrl: &avatarURL,
	})
}

func (s *UserService) FindByIdentity(ctx context.Context, provider, providerUserID string) (*UserIdentity, error) {
	row, err := s.store.FindIdentityByProvider(ctx, db.FindIdentityByProviderParams{
		Provider:       provider,
		ProviderUserID: providerUserID,
	})
	if err != nil {
		return nil, err
	}
	return &UserIdentity{
		ID:             row.ID,
		UserID:         row.UserID,
		Provider:       row.Provider,
		ProviderUserID: row.ProviderUserID,
		ProviderLogin:  row.ProviderLogin,
		Email:          strVal(row.Email),
		AccessToken:    strVal(row.AccessToken),
		CreatedAt:      row.CreatedAt.Time,
		UpdatedAt:      row.UpdatedAt.Time,
	}, nil
}

func (s *UserService) CreateUser(ctx context.Context, login, avatarURL string) (*v1.User, error) {
	u, err := s.store.CreateUser(ctx, db.CreateUserParams{
		Login:     login,
		AvatarUrl: &avatarURL,
	})
	if err != nil {
		return nil, err
	}
	return &v1.User{
		ID:        u.ID,
		Login:     u.Login,
		AvatarURL: strVal(u.AvatarUrl),
		CreatedAt: u.CreatedAt.Time,
		UpdatedAt: u.UpdatedAt.Time,
	}, nil
}

func (s *UserService) CreateIdentity(ctx context.Context, userID uuid.UUID, provider, providerUserID, login, email, accessToken string) error {
	var emailPtr *string
	if email != "" {
		emailPtr = &email
	}
	var tokPtr *string
	if accessToken != "" {
		tokPtr = &accessToken
	}
	_, err := s.store.CreateIdentity(ctx, db.CreateIdentityParams{
		UserID:         userID,
		Provider:       provider,
		ProviderUserID: providerUserID,
		ProviderLogin:  login,
		Email:          emailPtr,
		AccessToken:    tokPtr,
	})
	return err
}

func (s *UserService) UpdateIdentityTokens(ctx context.Context, id uuid.UUID, accessToken string) error {
	return s.store.UpdateIdentityTokens(ctx, db.UpdateIdentityTokensParams{
		ID:          id,
		AccessToken: &accessToken,
	})
}

// UpsertByIdentity finds an existing identity or creates a new user + identity.
func (s *UserService) UpsertByIdentity(ctx context.Context, provider, providerUserID, name, avatarURL, email, accessToken string) (*v1.User, error) {
	identity, err := s.FindByIdentity(ctx, provider, providerUserID)
	if err == nil && identity != nil {
		u, _ := s.FindByID(ctx, identity.UserID)
		if u != nil && u.AvatarURL != avatarURL {
			_ = s.UpdateAvatar(ctx, u.ID, avatarURL)
			u.AvatarURL = avatarURL
		}
		_ = s.UpdateIdentityTokens(ctx, identity.ID, accessToken)
		return u, nil
	}

	u, err := s.CreateUser(ctx, name, avatarURL)
	if err != nil {
		return nil, err
	}
	if err := s.CreateIdentity(ctx, u.ID, provider, providerUserID, name, email, accessToken); err != nil {
		return nil, err
	}
	return u, nil
}

func strVal(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
