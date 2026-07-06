package middleware

import (
	"net/http"
	"strings"

	"github.com/feifeifeimoon/GitSquad/internal/crypto"
	"github.com/feifeifeimoon/GitSquad/internal/server/auth"
	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const userContextKey = "user"

// RequireAuth returns a middleware that validates the Bearer JWT and injects the User into context.
// The JWT may come from either the Authorization header or the gitsquad_token cookie.
func RequireAuth(cfg config.Config, users *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)

		userID, err := auth.ParseToken(token, cfg.JWTSecret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, v1.ErrorResponse("invalid or expired token"))
			return
		}

		id, err := uuid.Parse(userID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, v1.ErrorResponse("invalid token subject"))
			return
		}

		user, err := users.FindByID(c.Request.Context(), id)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, v1.ErrorResponse("user not found"))
			return
		}

		c.Set(userContextKey, user)
		c.Next()
	}
}

// extractToken reads the JWT from the Authorization header first,
// then falls back to the gitsquad_token cookie.
func extractToken(c *gin.Context) string {
	// 1. Authorization: Bearer <token>
	if header := c.GetHeader("Authorization"); header != "" && strings.HasPrefix(header, "Bearer ") {
		return strings.TrimPrefix(header, "Bearer ")
	}

	// 2. gitsquad_token cookie (used by browser redirects like GitHub App callback)
	if cookie, err := c.Cookie("gitsquad_token"); err == nil && cookie != "" {
		return cookie
	}

	return ""
}

// GetUser extracts the authenticated User from context.
func GetUser(c *gin.Context) *v1.User {
	user, exists := c.Get(userContextKey)
	if !exists {
		return nil
	}
	return user.(*v1.User)
}

const daemonContextKey = "daemon_machine"

// RequireDaemonAuth validates a daemon token and injects the DaemonMachine into context.
func RequireDaemonAuth(cfg config.Config, daemonSvc *service.DaemonService) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, v1.ErrorResponse("missing authorization header"))
			return
		}

		rawToken := strings.TrimPrefix(header, "Bearer ")
		if !strings.HasPrefix(rawToken, v1.DaemonTokenPrefix) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, v1.ErrorResponse("invalid token format"))
			return
		}

		tokenHash := crypto.Hash(rawToken)
		tok, err := daemonSvc.FindTokenByHash(c.Request.Context(), tokenHash)
		if err != nil || tok == nil || tok.DaemonID == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, v1.ErrorResponse("invalid or revoked token"))
			return
		}

		daemon, err := daemonSvc.FindByID(c.Request.Context(), *tok.DaemonID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, v1.ErrorResponse("daemon not found"))
			c.Abort()
			return
		}

		c.Set(daemonContextKey, daemon)
		c.Next()
	}
}

// GetDaemon extracts the authenticated Daemon from context.
func GetDaemon(c *gin.Context) *v1.Daemon {
	d, exists := c.Get(daemonContextKey)
	if !exists {
		return nil
	}
	return d.(*v1.Daemon)
}
