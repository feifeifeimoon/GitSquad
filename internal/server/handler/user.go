package handler

import (
	"net/http"

	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
)

type UserHandler struct{}

func NewUserHandler() *UserHandler {
	return &UserHandler{}
}

func (h *UserHandler) Me(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("unauthorized"))
		return
	}

	c.JSON(http.StatusOK, v1.SuccessResponse(v1.MeResponse{
		ID:        user.ID,
		Login:     user.Login,
		AvatarURL: user.AvatarURL,
	}, 0))
}
