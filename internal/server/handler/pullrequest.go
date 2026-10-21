package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// PullRequestHandler serves the workspace's Pull requests page and its manual
// Review now action.
type PullRequestHandler struct {
	pullRequests *service.PullRequestService
	reviews      *service.ReviewService
	workspaces   *service.WorkspaceService
}

func NewPullRequestHandler(
	pullRequests *service.PullRequestService,
	reviews *service.ReviewService,
	workspaces *service.WorkspaceService,
) *PullRequestHandler {
	return &PullRequestHandler{pullRequests: pullRequests, reviews: reviews, workspaces: workspaces}
}

// List handles GET /api/v1/workspaces/:id/pull-requests (id = UUID or slug).
func (h *PullRequestHandler) List(c *gin.Context) {
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

	state := c.DefaultQuery("state", "open")
	if state == "all" {
		state = ""
	}
	limit := int32(100)
	if raw := c.Query("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			limit = int32(n)
		}
	}

	list, err := h.pullRequests.ListWorkspacePullRequests(c.Request.Context(), workspace.ID, state, limit)
	if err != nil {
		slog.Error("list pull requests", "workspace", workspace.ID, "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to list pull requests"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(list, 0))
}

// Review handles POST /api/v1/workspaces/:id/pull-requests/:number/review.
func (h *PullRequestHandler) Review(c *gin.Context) {
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
	number, err := strconv.ParseInt(c.Param("number"), 10, 32)
	if err != nil || number <= 0 {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid pull request number"))
		return
	}

	review, err := h.reviews.DispatchManual(c.Request.Context(), workspace.ID, int32(number))
	if err != nil {
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			c.JSON(http.StatusNotFound, v1.ErrorResponse("pull request not found"))
		case errors.Is(err, service.ErrReviewInProgress):
			c.JSON(http.StatusConflict, v1.ErrorResponse(service.ErrReviewInProgress.Error()))
		case errors.Is(err, service.ErrReviewDisabled),
			errors.Is(err, service.ErrReviewerNotRunnable),
			errors.Is(err, service.ErrPullRequestNotOpen):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse(err.Error()))
		default:
			slog.Error("dispatch manual review", "workspace", workspace.ID, "pr", number, "error", err)
			c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to start review"))
		}
		return
	}

	c.JSON(http.StatusAccepted, v1.SuccessResponse(map[string]any{
		"status": review.Status, "review_id": review.ID,
	}, 0))
}
