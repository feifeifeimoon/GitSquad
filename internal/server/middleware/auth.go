package middleware

import (
	"strings"

	"github.com/feifeifeimoon/GitSquad/internal/crypto"
	"github.com/feifeifeimoon/GitSquad/internal/server/auth"
	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	"github.com/feifeifeimoon/GitSquad/internal/server/types"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const userContextKey = "user"

// RequireAuth returns a middleware that validates the Bearer JWT and injects the User into context.
func RequireAuth(cfg config.Config, users *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			types.Unauthorized(c, "missing authorization header")
			c.Abort()
			return
		}

		token := strings.TrimPrefix(header, "Bearer ")
		userID, err := auth.ParseToken(token, cfg.JWTSecret)
		if err != nil {
			types.Unauthorized(c, "invalid or expired token")
			c.Abort()
			return
		}

		id, err := uuid.Parse(userID)
		if err != nil {
			types.Unauthorized(c, "invalid token subject")
			c.Abort()
			return
		}

		user, err := users.FindByID(c.Request.Context(), id)
		if err != nil {
			types.Unauthorized(c, "user not found")
			c.Abort()
			return
		}

		c.Set(userContextKey, user)
		c.Next()
	}
}

// GetUser extracts the authenticated User from context.
func GetUser(c *gin.Context) *types.User {
	user, exists := c.Get(userContextKey)
	if !exists {
		return nil
	}
	return user.(*types.User)
}

const daemonContextKey = "daemon_machine"

// RequireDaemonAuth validates a daemon token and injects the DaemonMachine into context.
func RequireDaemonAuth(cfg config.Config, daemonSvc *service.DaemonService) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			types.Unauthorized(c, "missing authorization header")
			c.Abort()
			return
		}

		rawToken := strings.TrimPrefix(header, "Bearer ")
		if !strings.HasPrefix(rawToken, "gtsq_dm_") {
			types.Unauthorized(c, "invalid token format")
			c.Abort()
			return
		}

		tokenHash := crypto.Hash(rawToken)
		tok, err := daemonSvc.FindTokenByHash(c.Request.Context(), tokenHash)
		if err != nil || tok == nil || tok.DaemonID == nil {
			types.Unauthorized(c, "invalid or revoked token")
			c.Abort()
			return
		}

		machine, err := daemonSvc.FindByID(c.Request.Context(), *tok.DaemonID)
		if err != nil {
			types.Unauthorized(c, "daemon not found")
			c.Abort()
			return
		}

		c.Set(daemonContextKey, machine)
		c.Next()
	}
}

// GetDaemon extracts the authenticated Daemon from context.
func GetDaemon(c *gin.Context) *types.Daemon {
	d, exists := c.Get(daemonContextKey)
	if !exists {
		return nil
	}
	return d.(*types.Daemon)
}
