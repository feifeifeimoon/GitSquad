package handler

import (
	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/types"
	"github.com/gin-gonic/gin"
)

type UserHandler struct{}

func NewUserHandler() *UserHandler {
	return &UserHandler{}
}

func (h *UserHandler) Me(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		types.Unauthorized(c, "unauthorized")
		return
	}

	types.OK(c, gin.H{
		"id":         user.ID,
		"login":      user.Login,
		"avatar_url": user.AvatarURL,
	})
}
