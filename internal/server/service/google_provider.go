package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	googleAuthorizeURL = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL     = "https://oauth2.googleapis.com/token"
	googleUserAPI      = "https://www.googleapis.com/oauth2/v2/userinfo"
)

// GoogleProvider implements OAuthProvider for Google OAuth.
type GoogleProvider struct {
	clientID     string
	clientSecret string
	callbackURL  string
	httpClient   *http.Client
}

func NewGoogleProvider(clientID, clientSecret, callbackURL string) *GoogleProvider {
	return &GoogleProvider{
		clientID:     clientID,
		clientSecret: clientSecret,
		callbackURL:  callbackURL,
		httpClient:   &http.Client{Timeout: 10 * time.Second},
	}
}

func (p *GoogleProvider) Name() string { return "google" }

func (p *GoogleProvider) AuthorizeURL(state string) string {
	return fmt.Sprintf("%s?client_id=%s&redirect_uri=%s&response_type=code&scope=%s&state=%s",
		googleAuthorizeURL,
		p.clientID,
		url.QueryEscape(p.callbackURL),
		"openid email profile",
		state,
	)
}

func (p *GoogleProvider) ExchangeCode(ctx context.Context, code string) (*OAuthUserInfo, error) {
	accessToken, err := p.exchangeToken(ctx, code)
	if err != nil {
		return nil, err
	}
	return p.fetchUser(ctx, accessToken)
}

// ── private helpers ──────────────────────────────────────────────────────

type googleTokenResp struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	Scope       string `json:"scope"`
	TokenType   string `json:"token_type"`
	IDToken     string `json:"id_token"`
	Error       string `json:"error"`
}

func (p *GoogleProvider) exchangeToken(ctx context.Context, code string) (string, error) {
	body := fmt.Sprintf("code=%s&client_id=%s&client_secret=%s&redirect_uri=%s&grant_type=authorization_code",
		code, p.clientID, p.clientSecret, p.callbackURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, googleTokenURL, strings.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<12))
	var tr googleTokenResp
	if err := json.Unmarshal(respBody, &tr); err != nil {
		return "", fmt.Errorf("parse token response: %w (body: %s)", err, string(respBody))
	}
	if tr.Error != "" {
		return "", fmt.Errorf("google error: %s", tr.Error)
	}
	if tr.AccessToken == "" {
		return "", fmt.Errorf("no access_token in response: %s", string(respBody))
	}
	return tr.AccessToken, nil
}

type googleUserResp struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

func (p *GoogleProvider) fetchUser(ctx context.Context, accessToken string) (*OAuthUserInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleUserAPI, nil)
	if err != nil {
		return nil, fmt.Errorf("user request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("user request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("google returned %d: %s", resp.StatusCode, string(body))
	}

	var u googleUserResp
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return nil, fmt.Errorf("decode user: %w", err)
	}

	return &OAuthUserInfo{
		Provider:       "google",
		ProviderUserID: u.ID,
		Name:           u.Name,
		Email:          u.Email,
		AvatarURL:      u.Picture,
		AccessToken:    accessToken,
	}, nil
}
