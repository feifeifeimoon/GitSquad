package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"

	"github.com/feifeifeimoon/GitSquad/internal/server/auth"
	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/model"
	"github.com/feifeifeimoon/GitSquad/internal/server/repository"
	"github.com/gin-gonic/gin"
)

const (
	githubAuthorizeURL = "https://github.com/login/oauth/authorize"
	githubTokenURL     = "https://github.com/login/oauth/access_token"
	githubUserAPI      = "https://api.github.com/user"
)

type AuthHandler struct {
	cfg        config.Config
	userRepo   *repository.UserRepo
	identityRepo *repository.UserIdentityRepo
}

func NewAuthHandler(cfg config.Config, userRepo *repository.UserRepo, identityRepo *repository.UserIdentityRepo) *AuthHandler {
	return &AuthHandler{cfg: cfg, userRepo: userRepo, identityRepo: identityRepo}
}

// LoginGitHub redirects the user to GitHub's OAuth authorize page.
func (h *AuthHandler) LoginGitHub(c *gin.Context) {
	state, err := generateState()
	if err != nil {
		c.String(http.StatusInternalServerError, "failed to generate state")
		return
	}

	// Store state in a short-lived cookie for CSRF protection.
	c.SetCookie("oauth_state", state, 600, "/", "", false, true)

	authURL := fmt.Sprintf(
		"%s?client_id=%s&redirect_uri=%s&scope=%s&state=%s",
		githubAuthorizeURL,
		h.cfg.GitHubClientID,
		url.QueryEscape(h.cfg.GitHubCallbackURL),
		"user:email",
		state,
	)
	c.Redirect(http.StatusFound, authURL)
}

// CallbackGitHub handles the GitHub OAuth callback.
func (h *AuthHandler) CallbackGitHub(c *gin.Context) {
	// Validate state to prevent CSRF.
	expectedState, _ := c.Cookie("oauth_state")
	if expectedState == "" || expectedState != c.Query("state") {
		redirectWithError(c, h.cfg.FrontendURL, "invalid_state")
		return
	}

	code := c.Query("code")
	if code == "" {
		redirectWithError(c, h.cfg.FrontendURL, "missing_code")
		return
	}

	// Exchange code for access token.
	accessToken, err := exchangeGitHubCode(code, h.cfg.GitHubClientID, h.cfg.GitHubClientSecret)
	if err != nil {
		redirectWithError(c, h.cfg.FrontendURL, "token_exchange_failed")
		return
	}

	// Fetch GitHub user profile.
	ghUser, err := fetchGitHubUser(accessToken)
	if err != nil {
		redirectWithError(c, h.cfg.FrontendURL, "github_api_failed")
		return
	}

	// Upsert: find existing identity or create new user + identity.
	ctx := c.Request.Context()
	var user *model.User

	identity, existingUser, err := h.identityRepo.FindByProvider(ctx, "github", strconv.FormatInt(ghUser.ID, 10))
	if err != nil {
		redirectWithError(c, h.cfg.FrontendURL, "internal_error")
		return
	}

	if existingUser != nil {
		user = existingUser
		// Update avatar if changed.
		if user.AvatarURL != ghUser.AvatarURL {
			_ = h.userRepo.UpdateAvatar(ctx, user.ID, ghUser.AvatarURL)
			user.AvatarURL = ghUser.AvatarURL
		}
		// Update access token.
		_ = h.identityRepo.UpdateTokens(ctx, identity.ID, accessToken, "")
	} else {
		// New user.
		user, err = h.userRepo.Create(ctx, ghUser.Login, ghUser.AvatarURL)
		if err != nil {
			redirectWithError(c, h.cfg.FrontendURL, "internal_error")
			return
		}
		_, err = h.identityRepo.Create(ctx, &model.UserIdentity{
			UserID:         user.ID,
			Provider:       "github",
			ProviderUserID: strconv.FormatInt(ghUser.ID, 10),
			ProviderLogin:  ghUser.Login,
			Email:          ghUser.Email,
			AccessToken:    accessToken,
		})
		if err != nil {
			redirectWithError(c, h.cfg.FrontendURL, "internal_error")
			return
		}
	}

	// Generate JWT token.
	jwtToken, err := auth.GenerateToken(user.ID.String(), h.cfg.JWTSecret)
	if err != nil {
		redirectWithError(c, h.cfg.FrontendURL, "internal_error")
		return
	}

	// Redirect to frontend with token.
	frontendURL := fmt.Sprintf("%s/auth/callback?token=%s", h.cfg.FrontendURL, url.QueryEscape(jwtToken))
	c.Redirect(http.StatusFound, frontendURL)
}

type githubUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
	Email     string `json:"email"`
}

func exchangeGitHubCode(code, clientID, clientSecret string) (string, error) {
	resp, err := http.PostForm(githubTokenURL, url.Values{
		"client_id":     {clientID},
		"client_secret": {clientSecret},
		"code":          {code},
	})
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<10))
	if err != nil {
		return "", fmt.Errorf("read token response: %w", err)
	}

	values, err := url.ParseQuery(string(body))
	if err != nil {
		return "", fmt.Errorf("parse token response: %w", err)
	}

	token := values.Get("access_token")
	if token == "" {
		return "", fmt.Errorf("no access_token in response: %s", string(body))
	}

	return token, nil
}

func fetchGitHubUser(accessToken string) (*githubUser, error) {
	req, err := http.NewRequest("GET", githubUserAPI, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("github user request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github returned %d", resp.StatusCode)
	}

	var user githubUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, fmt.Errorf("decode github user: %w", err)
	}

	return &user, nil
}

func generateState() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func redirectWithError(c *gin.Context, frontendURL, errType string) {
	c.Redirect(http.StatusFound, fmt.Sprintf("%s/login?error=%s", frontendURL, errType))
}
