package handler

import (
	"log/slog"
	"net/http"
	"net/url"

	"github.com/feifeifeimoon/GitSquad/internal/crypto"
	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
)

// AuthHandler handles OAuth login and callback endpoints.
// All OAuth business logic (code exchange, user upsert, JWT generation) lives
// in service.AuthService. This handler is responsible only for HTTP concerns:
// redirects and request parsing. The JWT is returned to the browser via the
// URL hash fragment (picked up by the frontend and stored in localStorage);
// it is NOT set as a cookie, since cookie auth on state-changing routes would
// be vulnerable to CSRF.
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

	// Redirect to frontend with JWT in hash fragment (for localStorage).
	c.Redirect(http.StatusFound,
		h.cfg.FrontendURL+"/auth/callback#"+url.QueryEscape(result.Token))
}

// redirectError redirects to the frontend login page with an error parameter.
func (h *AuthHandler) redirectError(c *gin.Context, errType string) {
	c.Redirect(http.StatusFound,
		h.cfg.FrontendURL+"/login?error="+errType)
}

// E2ELogin issues a JWT for the deterministic E2E test user. The route is only
// registered when GITSQUAD_E2E=true (see routes.go), so it never exists in
// production. It lets browser E2E tests authenticate without Google OAuth.
func (h *AuthHandler) E2ELogin(c *gin.Context) {
	name := c.DefaultQuery("name", "E2E User")

	result, err := h.authSvc.E2ELogin(c.Request.Context(), name)
	if err != nil {
		slog.Error("e2e login", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("e2e login failed"))
		return
	}

	c.JSON(http.StatusOK, v1.SuccessResponse(struct {
		Token string   `json:"token"`
		User  *v1.User `json:"user"`
	}{Token: result.Token, User: result.User}, 0))
}
