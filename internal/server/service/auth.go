package service

import (
	"context"
	"fmt"

	"github.com/feifeifeimoon/GitSquad/internal/server/auth"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// OAuthProvider abstracts a third-party OAuth / OIDC identity provider.
// Implementations include GoogleProvider, and in the future GitHubProvider, etc.
type OAuthProvider interface {
	// Name returns the provider identifier (e.g. "google", "github").
	Name() string

	// AuthorizeURL builds the OAuth authorize URL for the given state.
	AuthorizeURL(state string) string

	// ExchangeCode exchanges an authorization code for user info.
	ExchangeCode(ctx context.Context, code string) (*OAuthUserInfo, error)
}

// OAuthUserInfo is the normalized user profile returned by any OAuth provider.
type OAuthUserInfo struct {
	Provider       string
	ProviderUserID string
	Name           string
	Email          string
	AvatarURL      string
	AccessToken    string
}

// AuthResult is the outcome of a successful OAuth callback.
type AuthResult struct {
	User  *v1.User `json:"user"`
	Token string         `json:"token"`
}

// AuthService orchestrates OAuth login flows across multiple providers.
type AuthService struct {
	userSvc   *UserService
	jwtSecret string
	providers map[string]OAuthProvider
}

func NewAuthService(userSvc *UserService, jwtSecret string) *AuthService {
	return &AuthService{
		userSvc:   userSvc,
		jwtSecret: jwtSecret,
		providers: make(map[string]OAuthProvider),
	}
}

// RegisterProvider adds an OAuth provider so it can be used for login.
func (s *AuthService) RegisterProvider(p OAuthProvider) {
	s.providers[p.Name()] = p
}

// GetAuthorizationURL returns the OAuth authorize URL for the named provider.
func (s *AuthService) GetAuthorizationURL(provider string, state string) (string, error) {
	p, ok := s.providers[provider]
	if !ok {
		return "", fmt.Errorf("unknown provider: %s", provider)
	}
	return p.AuthorizeURL(state), nil
}

// HandleCallback completes the OAuth flow:
//  1. Exchange the authorization code for user info via the provider.
//  2. Upsert the user + identity into the database.
//  3. Generate and return a JWT.
func (s *AuthService) HandleCallback(ctx context.Context, provider string, code string) (*AuthResult, error) {
	p, ok := s.providers[provider]
	if !ok {
		return nil, fmt.Errorf("unknown provider: %s", provider)
	}

	info, err := p.ExchangeCode(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("exchange code: %w", err)
	}

	user, err := s.userSvc.UpsertByIdentity(ctx,
		info.Provider, info.ProviderUserID,
		info.Name, info.AvatarURL, info.Email, info.AccessToken,
	)
	if err != nil {
		return nil, fmt.Errorf("upsert user: %w", err)
	}

	token, err := auth.GenerateToken(user.ID.String(), s.jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	return &AuthResult{User: user, Token: token}, nil
}

// E2ELogin creates (or reuses) a deterministic test user and returns a signed
// JWT for it. It exists only to give browser E2E tests a stable way to log in
// without a real Google OAuth round-trip, and is only reachable when the
// server is started with GITSQUAD_E2E=true (the route is not registered
// otherwise).
func (s *AuthService) E2ELogin(ctx context.Context, name string) (*AuthResult, error) {
	const (
		provider       = "e2e"
		providerUserID = "gitsquad-e2e-user"
	)

	user, err := s.userSvc.UpsertByIdentity(ctx, provider, providerUserID, name, "", "", "")
	if err != nil {
		return nil, fmt.Errorf("upsert e2e user: %w", err)
	}

	token, err := auth.GenerateToken(user.ID.String(), s.jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	return &AuthResult{User: user, Token: token}, nil
}
