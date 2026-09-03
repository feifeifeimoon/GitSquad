package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type SkillHandler struct {
	skills     *service.SkillService
	workspaces *service.WorkspaceService
}

func NewSkillHandler(s *service.SkillService, w *service.WorkspaceService) *SkillHandler {
	return &SkillHandler{skills: s, workspaces: w}
}

func (h *SkillHandler) requireWorkspace(c *gin.Context) (uuid.UUID, bool) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return uuid.Nil, false
	}
	ws, err := h.workspaces.ResolveWorkspace(c.Request.Context(), user.ID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, v1.ErrorResponse("workspace not found"))
		return uuid.Nil, false
	}
	return ws.ID, true
}

func (h *SkillHandler) Create(c *gin.Context) {
	wsID, ok := h.requireWorkspace(c)
	if !ok {
		return
	}
	user := middleware.GetUser(c)
	var req v1.CreateSkillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("name is required"))
		return
	}
	sk, err := h.skills.CreateSkill(c.Request.Context(), wsID, user.ID, req)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	c.JSON(http.StatusCreated, v1.SuccessResponse(sk, 0))
}

func (h *SkillHandler) List(c *gin.Context) {
	wsID, ok := h.requireWorkspace(c)
	if !ok {
		return
	}
	list, err := h.skills.ListSkills(c.Request.Context(), wsID)
	if err != nil {
		slog.Error("list skills", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to list skills"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(list, len(list)))
}

func (h *SkillHandler) Get(c *gin.Context) {
	wsID, ok := h.requireWorkspace(c)
	if !ok {
		return
	}
	skillID, err := uuid.Parse(c.Param("skillId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid skill id"))
		return
	}
	sk, err := h.skills.GetSkill(c.Request.Context(), wsID, skillID)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(sk, 0))
}

func (h *SkillHandler) Update(c *gin.Context) {
	wsID, ok := h.requireWorkspace(c)
	if !ok {
		return
	}
	skillID, err := uuid.Parse(c.Param("skillId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid skill id"))
		return
	}
	var req v1.UpdateSkillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request body"))
		return
	}
	sk, err := h.skills.UpdateSkill(c.Request.Context(), wsID, skillID, req)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(sk, 0))
}

func (h *SkillHandler) Delete(c *gin.Context) {
	wsID, ok := h.requireWorkspace(c)
	if !ok {
		return
	}
	skillID, err := uuid.Parse(c.Param("skillId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid skill id"))
		return
	}
	if err := h.skills.DeleteSkill(c.Request.Context(), wsID, skillID); err != nil {
		slog.Error("delete skill", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to delete skill"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(map[string]bool{"deleted": true}, 0))
}

func (h *SkillHandler) writeErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrSkillNotFound):
		c.JSON(http.StatusNotFound, v1.ErrorResponse("skill not found"))
	case errors.Is(err, service.ErrSkillNameTaken):
		c.JSON(http.StatusConflict, v1.ErrorResponse("skill name already exists"))
	default:
		slog.Error("skill handler", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed"))
	}
}
