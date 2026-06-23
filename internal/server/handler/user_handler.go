package handler

import (
	"net/http"

	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/gin-gonic/gin"
)

type UserHandler struct{}

func NewUserHandler() *UserHandler {
	return &UserHandler{}
}

// Me returns the currently authenticated user.
func (h *UserHandler) Me(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         user.ID,
		"login":      user.Login,
		"avatar_url": user.AvatarURL,
	})
}
