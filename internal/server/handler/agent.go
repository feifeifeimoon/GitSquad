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

type AgentHandler struct {
	agents     *service.AgentService
	workspaces *service.WorkspaceService
}

func NewAgentHandler(a *service.AgentService, w *service.WorkspaceService) *AgentHandler {
	return &AgentHandler{agents: a, workspaces: w}
}

// requireWorkspace resolves the workspace (by UUID or slug) and returns its
// ID, writing the error response and returning false when it fails.
func (h *AgentHandler) requireWorkspace(c *gin.Context) (uuid.UUID, bool) {
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

func (h *AgentHandler) Create(c *gin.Context) {
	wsID, ok := h.requireWorkspace(c)
	if !ok {
		return
	}
	user := middleware.GetUser(c)
	var req v1.CreateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("name, daemon_id, and provider are required"))
		return
	}
	agent, err := h.agents.CreateAgent(c.Request.Context(), wsID, user.ID, req)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	c.JSON(http.StatusCreated, v1.SuccessResponse(agent, 0))
}

func (h *AgentHandler) List(c *gin.Context) {
	wsID, ok := h.requireWorkspace(c)
	if !ok {
		return
	}
	list, err := h.agents.ListAgents(c.Request.Context(), wsID)
	if err != nil {
		slog.Error("list agents", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to list agents"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(list, len(list)))
}

func (h *AgentHandler) Get(c *gin.Context) {
	wsID, ok := h.requireWorkspace(c)
	if !ok {
		return
	}
	agentID, err := uuid.Parse(c.Param("agentId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid agent id"))
		return
	}
	agent, err := h.agents.GetAgent(c.Request.Context(), wsID, agentID)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(agent, 0))
}

func (h *AgentHandler) Update(c *gin.Context) {
	wsID, ok := h.requireWorkspace(c)
	if !ok {
		return
	}
	agentID, err := uuid.Parse(c.Param("agentId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid agent id"))
		return
	}
	var req v1.UpdateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request body"))
		return
	}
	agent, err := h.agents.UpdateAgent(c.Request.Context(), wsID, agentID, req)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(agent, 0))
}

func (h *AgentHandler) Delete(c *gin.Context) {
	wsID, ok := h.requireWorkspace(c)
	if !ok {
		return
	}
	agentID, err := uuid.Parse(c.Param("agentId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid agent id"))
		return
	}
	if err := h.agents.DeleteAgent(c.Request.Context(), wsID, agentID); err != nil {
		slog.Error("delete agent", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to delete agent"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(map[string]bool{"deleted": true}, 0))
}

func (h *AgentHandler) ListRuntimes(c *gin.Context) {
	wsID, ok := h.requireWorkspace(c)
	if !ok {
		return
	}
	list, err := h.agents.ListRuntimes(c.Request.Context(), wsID)
	if err != nil {
		slog.Error("list runtimes", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to list runtimes"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(list, len(list)))
}

func (h *AgentHandler) writeErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrAgentNotFound):
		c.JSON(http.StatusNotFound, v1.ErrorResponse("agent not found"))
	case errors.Is(err, service.ErrAgentNameTaken):
		c.JSON(http.StatusConflict, v1.ErrorResponse("agent name already exists"))
	case errors.Is(err, service.ErrInvalidAgentName):
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid agent name"))
	case errors.Is(err, service.ErrInvalidProvider):
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("provider must be claude or codex"))
	case errors.Is(err, service.ErrDaemonMismatch):
		c.JSON(http.StatusForbidden, v1.ErrorResponse("daemon does not belong to you"))
	default:
		slog.Error("agent handler", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed"))
	}
}
