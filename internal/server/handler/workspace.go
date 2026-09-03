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

type WorkspaceHandler struct {
	workspaces *service.WorkspaceService
}

func NewWorkspaceHandler(w *service.WorkspaceService) *WorkspaceHandler {
	return &WorkspaceHandler{workspaces: w}
}

type CreateWorkspaceRequest struct {
	InstallationID string `json:"installation_id" binding:"required"`
	RepoID         string `json:"repo_id" binding:"required"`
	Name           string `json:"name" binding:"required"`
}

// Create handles POST /api/v1/workspaces.
func (h *WorkspaceHandler) Create(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}

	var req CreateWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("installation_id, repo_id, and name are required"))
		return
	}

	installationID, err := uuid.Parse(req.InstallationID)
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid installation_id"))
		return
	}
	repoID, err := uuid.Parse(req.RepoID)
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid repo_id"))
		return
	}

	workspace, err := h.workspaces.CreateWorkspace(c.Request.Context(), user.ID, installationID, repoID, req.Name)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInstallationMismatch):
			c.JSON(http.StatusForbidden, v1.ErrorResponse("installation does not belong to you"))
		case errors.Is(err, service.ErrRepoMismatch):
			c.JSON(http.StatusForbidden, v1.ErrorResponse("repo does not belong to this installation"))
		case errors.Is(err, service.ErrInvalidWorkspaceName):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("workspace name must contain at least one letter or number"))
		case errors.Is(err, service.ErrWorkspaceSlugReserved):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("workspace slug is reserved"))
		case errors.Is(err, service.ErrWorkspaceSlugTaken):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("workspace slug already exists"))
		default:
			slog.Error("create workspace", "error", err)
			c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to create workspace"))
		}
		return
	}

	slog.Info("workspace created", "id", workspace.ID, "name", workspace.Name, "user", user.Login)
	c.JSON(http.StatusCreated, v1.SuccessResponse(workspace, 0))
}

// List handles GET /api/v1/workspaces.
func (h *WorkspaceHandler) List(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}

	list, err := h.workspaces.ListWorkspaces(c.Request.Context(), user.ID)
	if err != nil {
		slog.Error("list workspaces", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to list workspaces"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(list, len(list)))
}

// Get handles GET /api/v1/workspaces/:id (id = UUID or slug).
func (h *WorkspaceHandler) Get(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}

	workspace, err := h.workspaces.ResolveWorkspace(c.Request.Context(), user.ID, c.Param("id"))
	if err != nil {
		if errors.Is(err, service.ErrWorkspaceNotFound) {
			c.JSON(http.StatusNotFound, v1.ErrorResponse("workspace not found"))
			return
		}
		slog.Error("get workspace", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to get workspace"))
		return
	}

	c.JSON(http.StatusOK, v1.SuccessResponse(workspace, 0))
}

// Archive handles DELETE /api/v1/workspaces/:id (id = UUID or slug).
func (h *WorkspaceHandler) Archive(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}

	workspace, err := h.workspaces.ResolveWorkspace(c.Request.Context(), user.ID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, v1.ErrorResponse("workspace not found"))
		return
	}

	if err := h.workspaces.ArchiveWorkspace(c.Request.Context(), workspace.ID); err != nil {
		slog.Error("archive workspace", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to archive workspace"))
		return
	}

	c.JSON(http.StatusOK, v1.SuccessResponse(map[string]bool{"archived": true}, 0))
}

// Delete handles DELETE /api/v1/workspaces/:id/delete (id = UUID or slug).
func (h *WorkspaceHandler) Delete(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}

	workspace, err := h.workspaces.ResolveWorkspace(c.Request.Context(), user.ID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, v1.ErrorResponse("workspace not found"))
		return
	}

	if err := h.workspaces.DeleteWorkspace(c.Request.Context(), workspace.ID); err != nil {
		slog.Error("delete workspace", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to delete workspace"))
		return
	}

	c.JSON(http.StatusOK, v1.SuccessResponse(map[string]bool{"deleted": true}, 0))
}

// UpdateAvatar handles PUT /api/v1/workspaces/:id/avatar (id = UUID or slug).
func (h *WorkspaceHandler) UpdateAvatar(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}

	workspace, err := h.workspaces.ResolveWorkspace(c.Request.Context(), user.ID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, v1.ErrorResponse("workspace not found"))
		return
	}

	var req struct {
		AvatarURL string `json:"avatar_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request body"))
		return
	}

	if err := h.workspaces.UpdateWorkspaceAvatar(c.Request.Context(), workspace.ID, req.AvatarURL); err != nil {
		slog.Error("update workspace avatar", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to update avatar"))
		return
	}

	c.JSON(http.StatusOK, v1.SuccessResponse(map[string]string{"avatar_url": req.AvatarURL}, 0))
}
