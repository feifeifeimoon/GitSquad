package middleware

import (
	"net/http"
	"strings"

	"github.com/feifeifeimoon/GitSquad/internal/crypto"
	"github.com/feifeifeimoon/GitSquad/internal/server/auth"
	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const userContextKey = "user"

// RequireAuth returns a middleware that validates the Bearer JWT and injects the User into context.
func RequireAuth(cfg config.Config, users *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, pkgtypes.ErrorResponse("missing authorization header"))
			return
		}

		token := strings.TrimPrefix(header, "Bearer ")
		userID, err := auth.ParseToken(token, cfg.JWTSecret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, pkgtypes.ErrorResponse("invalid or expired token"))
			return
		}

		id, err := uuid.Parse(userID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, pkgtypes.ErrorResponse("invalid token subject"))
			return
		}

		user, err := users.FindByID(c.Request.Context(), id)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, pkgtypes.ErrorResponse("user not found"))
			return
		}

		c.Set(userContextKey, user)
		c.Next()
	}
}

// GetUser extracts the authenticated User from context.
func GetUser(c *gin.Context) *pkgtypes.User {
	user, exists := c.Get(userContextKey)
	if !exists {
		return nil
	}
	return user.(*pkgtypes.User)
}

const daemonContextKey = "daemon_machine"

// RequireDaemonAuth validates a daemon token and injects the DaemonMachine into context.
func RequireDaemonAuth(cfg config.Config, daemonSvc *service.DaemonService) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, pkgtypes.ErrorResponse("missing authorization header"))
			return
		}

		rawToken := strings.TrimPrefix(header, "Bearer ")
		if !strings.HasPrefix(rawToken, "gtsq_dm_") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, pkgtypes.ErrorResponse("invalid token format"))
			return
		}

		tokenHash := crypto.Hash(rawToken)
		tok, err := daemonSvc.FindTokenByHash(c.Request.Context(), tokenHash)
		if err != nil || tok == nil || tok.DaemonID == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, pkgtypes.ErrorResponse("invalid or revoked token"))
			return
		}

		machine, err := daemonSvc.FindByID(c.Request.Context(), *tok.DaemonID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, pkgtypes.ErrorResponse("daemon not found"))
			c.Abort()
			return
		}

		c.Set(daemonContextKey, machine)
		c.Next()
	}
}

// GetDaemon extracts the authenticated Daemon from context.
func GetDaemon(c *gin.Context) *pkgtypes.Daemon {
	d, exists := c.Get(daemonContextKey)
	if !exists {
		return nil
	}
	return d.(*pkgtypes.Daemon)
}
