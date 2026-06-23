package middleware

import (
	"net/http"
	"strings"

	"github.com/feifeifeimoon/GitSquad/internal/server/auth"
	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/model"
	"github.com/feifeifeimoon/GitSquad/internal/server/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const userContextKey = "user"

// RequireAuth returns a middleware that validates the Bearer JWT and injects the User into context.
func RequireAuth(cfg config.Config, userRepo *repository.UserRepo) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			return
		}

		token := strings.TrimPrefix(header, "Bearer ")
		userID, err := auth.ParseToken(token, cfg.JWTSecret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		id, err := uuid.Parse(userID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token subject"})
			return
		}

		user, err := userRepo.FindByID(c.Request.Context(), id)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}

		c.Set(userContextKey, user)
		c.Next()
	}
}

// GetUser extracts the authenticated User from context.
func GetUser(c *gin.Context) *model.User {
	user, exists := c.Get(userContextKey)
	if !exists {
		return nil
	}
	return user.(*model.User)
}
