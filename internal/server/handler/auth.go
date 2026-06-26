package handler

import (
	"log/slog"
	"net/http"
	"net/url"

	"github.com/feifeifeimoon/GitSquad/internal/crypto"
	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	"github.com/gin-gonic/gin"
)

// AuthHandler handles OAuth login and callback endpoints.
// All OAuth business logic (code exchange, user upsert, JWT generation) lives
// in service.AuthService. This handler is responsible only for HTTP concerns:
// cookie management, redirects, and request parsing.
type AuthHandler struct {
	cfg     config.Config
	authSvc *service.AuthService
}

func NewAuthHandler(cfg config.Config, authSvc *service.AuthService) *AuthHandler {
	return &AuthHandler{cfg: cfg, authSvc: authSvc}
}

// LoginGoogle initiates the Google OAuth flow.
func (h *AuthHandler) LoginGoogle(c *gin.Context) {
	state, err := crypto.RandomHex(16)
	if err != nil {
		slog.Error("generate state", "error", err)
		c.String(http.StatusInternalServerError, "failed to generate state")
		return
	}
	c.SetCookie("oauth_state", state, 600, "/", "", false, true)

	authURL, err := h.authSvc.GetAuthorizationURL("google", state)
	if err != nil {
		slog.Error("authorization url", "error", err)
		c.String(http.StatusInternalServerError, "failed to build auth URL")
		return
	}

	c.Redirect(http.StatusFound, authURL)
}

// CallbackGoogle handles the Google OAuth callback.
func (h *AuthHandler) CallbackGoogle(c *gin.Context) {
	// Validate state.
	expected, _ := c.Cookie("oauth_state")
	if expected == "" || expected != c.Query("state") {
		slog.Error("oauth state mismatch")
		h.redirectError(c, "invalid_state")
		return
	}

	code := c.Query("code")
	if code == "" {
		slog.Error("oauth missing code")
		h.redirectError(c, "missing_code")
		return
	}

	result, err := h.authSvc.HandleCallback(c.Request.Context(), "google", code)
	if err != nil {
		slog.Error("oauth callback", "error", err)
		h.redirectError(c, "internal_error")
		return
	}

	slog.Info("oauth login success", "user", result.User.Login)

	// Redirect to frontend with JWT in hash fragment.
	// Hash fragments avoid URL query length limits and keep the token
	// out of server logs and referrer headers.
	c.Redirect(http.StatusFound,
		h.cfg.FrontendURL+"/auth/callback#"+url.QueryEscape(result.Token))
}

// redirectError redirects to the frontend login page with an error parameter.
func (h *AuthHandler) redirectError(c *gin.Context, errType string) {
	c.Redirect(http.StatusFound,
		h.cfg.FrontendURL+"/login?error="+errType)
}
