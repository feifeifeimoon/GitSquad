package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
)

type IssueHandler struct {
	issues     *service.IssueService
	workspaces *service.WorkspaceService
}

func NewIssueHandler(issues *service.IssueService, workspaces *service.WorkspaceService) *IssueHandler {
	return &IssueHandler{issues: issues, workspaces: workspaces}
}

// requireWorkspaceOwner resolves the workspace (by UUID or slug) and verifies
// it belongs to the authenticated user; returns the workspace and true on
// success, writing the error response and returning false otherwise.
func (h *IssueHandler) requireWorkspaceOwner(c *gin.Context) (*service.WorkspaceWithRepo, bool) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return nil, false
	}
	workspace, err := h.workspaces.ResolveWorkspace(c.Request.Context(), user.ID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, v1.ErrorResponse("workspace not found"))
		return nil, false
	}
	return workspace, true
}

type CreateIssueRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Status      string `json:"status"`
}

// Create handles POST /api/v1/workspaces/:id/issues.
func (h *IssueHandler) Create(c *gin.Context) {
	workspace, ok := h.requireWorkspaceOwner(c)
	if !ok {
		return
	}
	var req CreateIssueRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request body"))
		return
	}
	user := middleware.GetUser(c)
	issue, err := h.issues.CreateIssue(c.Request.Context(), workspace.ID, user.ID, user.Login, req.Title, req.Description, req.Status)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEmptyTitle):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("title is required"))
		case errors.Is(err, service.ErrInvalidStatus):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid status"))
		default:
			slog.Error("create issue", "error", err)
			c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to create issue"))
		}
		return
	}
	c.JSON(http.StatusCreated, v1.SuccessResponse(issue, 0))
}

// List handles GET /api/v1/workspaces/:id/issues.
func (h *IssueHandler) List(c *gin.Context) {
	workspace, ok := h.requireWorkspaceOwner(c)
	if !ok {
		return
	}
	list, err := h.issues.ListIssues(c.Request.Context(), workspace.ID)
	if err != nil {
		slog.Error("list issues", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to list issues"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(list, len(list)))
}

// Get handles GET /api/v1/workspaces/:id/issues/:issueId (id/issueId accept
// UUID or slug / PREFIX-NUMBER).
func (h *IssueHandler) Get(c *gin.Context) {
	workspace, ok := h.requireWorkspaceOwner(c)
	if !ok {
		return
	}
	issueID, err := h.issues.ResolveIssueID(c.Request.Context(), workspace.ID, c.Param("issueId"))
	if err != nil {
		if errors.Is(err, service.ErrIssueNotFound) {
			c.JSON(http.StatusNotFound, v1.ErrorResponse("issue not found"))
			return
		}
		slog.Error("get issue", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to get issue"))
		return
	}
	issue, err := h.issues.GetIssue(c.Request.Context(), workspace.ID, issueID)
	if err != nil {
		if errors.Is(err, service.ErrIssueNotFound) {
			c.JSON(http.StatusNotFound, v1.ErrorResponse("issue not found"))
			return
		}
		slog.Error("get issue", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to get issue"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(issue, 0))
}

type UpdateIssueRequest struct {
	Status      *string `json:"status"`
	Title       *string `json:"title"`
	Description *string `json:"description"`
}

// Update handles PATCH /api/v1/workspaces/:id/issues/:issueId.
func (h *IssueHandler) Update(c *gin.Context) {
	workspace, ok := h.requireWorkspaceOwner(c)
	if !ok {
		return
	}
	issueID, err := h.issues.ResolveIssueID(c.Request.Context(), workspace.ID, c.Param("issueId"))
	if err != nil {
		if errors.Is(err, service.ErrIssueNotFound) {
			c.JSON(http.StatusNotFound, v1.ErrorResponse("issue not found"))
			return
		}
		slog.Error("update issue", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to update issue"))
		return
	}
	var req UpdateIssueRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request body"))
		return
	}
	user := middleware.GetUser(c)
	issue, err := h.issues.UpdateIssue(c.Request.Context(), workspace.ID, issueID, user.Login, req.Status, req.Title, req.Description)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrIssueNotFound):
			c.JSON(http.StatusNotFound, v1.ErrorResponse("issue not found"))
		case errors.Is(err, service.ErrInvalidStatus):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid status"))
		case errors.Is(err, service.ErrEmptyTitle):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("title is required"))
		default:
			slog.Error("update issue", "error", err)
			c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to update issue"))
		}
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(issue, 0))
}

type CreateCommentRequest struct {
	Content string `json:"content"`
}

// AddComment handles POST /api/v1/workspaces/:id/issues/:issueId/comments.
func (h *IssueHandler) AddComment(c *gin.Context) {
	workspace, ok := h.requireWorkspaceOwner(c)
	if !ok {
		return
	}
	issueID, err := h.issues.ResolveIssueID(c.Request.Context(), workspace.ID, c.Param("issueId"))
	if err != nil {
		if errors.Is(err, service.ErrIssueNotFound) {
			c.JSON(http.StatusNotFound, v1.ErrorResponse("issue not found"))
			return
		}
		slog.Error("add comment", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to add comment"))
		return
	}
	var req CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request body"))
		return
	}
	user := middleware.GetUser(c)
	comment, err := h.issues.AddComment(c.Request.Context(), workspace.ID, issueID, user.ID, user.Login, req.Content)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrIssueNotFound):
			c.JSON(http.StatusNotFound, v1.ErrorResponse("issue not found"))
		case errors.Is(err, service.ErrEmptyComment):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("comment content is required"))
		default:
			slog.Error("add comment", "error", err)
			c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to add comment"))
		}
		return
	}
	c.JSON(http.StatusCreated, v1.SuccessResponse(comment, 0))
}
