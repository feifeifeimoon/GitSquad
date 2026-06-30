package handler

import (
	"net/http"

	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
	"github.com/gin-gonic/gin"
)

type UserHandler struct{}

func NewUserHandler() *UserHandler {
	return &UserHandler{}
}

func (h *UserHandler) Me(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, pkgtypes.ErrorResponse("unauthorized"))
		return
	}

	c.JSON(http.StatusOK, pkgtypes.SuccessResponse(gin.H{
		"id":         user.ID,
		"login":      user.Login,
		"avatar_url": user.AvatarURL,
	}, 0))
}
