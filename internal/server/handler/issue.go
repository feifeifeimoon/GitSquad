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
	"github.com/jackc/pgx/v5"
)

type IssueHandler struct {
	issues     *service.IssueService
	workspaces *service.WorkspaceService
	prs        *service.PullRequestService
}

// SetPullRequests wires the issue ↔ PR relationship in, for the manual link
// entry. Nil disables it — the automatic entries are unaffected.
func (h *IssueHandler) SetPullRequests(p *service.PullRequestService) { h.prs = p }

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
	// Agents are assigned when the issue is created, alongside whatever the
	// description mentions. Assigning an agent does not start a run — only a
	// mention does.
	Agents []string `json:"agents"`
	// AssigneeID is the person accountable for the issue. Omitted means the
	// creator, which is the only member a workspace has today.
	AssigneeID string `json:"assignee_id"`
}

// parseUUIDOr writes the 400 itself and reports whether the id was usable.
func parseUUIDOr(c *gin.Context, ref, message string) (uuid.UUID, bool) {
	id, err := uuid.Parse(ref)
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse(message))
		return uuid.Nil, false
	}
	return id, true
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
	agentIDs, ok := parseAgentIDs(c, req.Agents)
	if !ok {
		return
	}
	var assigneeID *uuid.UUID
	if req.AssigneeID != "" {
		id, ok := parseUUIDOr(c, req.AssigneeID, "invalid assignee id")
		if !ok {
			return
		}
		assigneeID = &id
	}
	user := middleware.GetUser(c)
	issue, err := h.issues.CreateIssue(c.Request.Context(), workspace.ID, user.ID, user.Login, service.IssueCreate{
		Title:       req.Title,
		Description: req.Description,
		Status:      req.Status,
		AgentIDs:    agentIDs,
		AssigneeID:  assigneeID,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEmptyTitle):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("title is required"))
		case errors.Is(err, service.ErrInvalidStatus):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid status"))
		case errors.Is(err, service.ErrUnknownAgent):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("unknown agent"))
		case errors.Is(err, service.ErrUnknownMember):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("unknown assignee"))
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
	// Agents replaces the assignment wholesale when present: the ids listed are
	// the agents on the issue when the request returns, and [] clears it. Absent
	// leaves it alone, which is what keeps a status edit from touching it.
	Agents *[]string `json:"agents"`
	// AssigneeID sets the accountable person: a user id, "" to clear it — an
	// issue nobody owns — or absent to leave it alone.
	AssigneeID *string `json:"assignee_id"`
}

// parseAgentIDs turns the wire's agent ids into UUIDs, writing the 400 itself
// when one does not parse so callers only branch on ok.
func parseAgentIDs(c *gin.Context, raw []string) ([]uuid.UUID, bool) {
	ids := make([]uuid.UUID, 0, len(raw))
	for _, ref := range raw {
		id, err := uuid.Parse(ref)
		if err != nil {
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid agent id"))
			return nil, false
		}
		ids = append(ids, id)
	}
	return ids, true
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
	// Absent and empty mean different things here: nil leaves the assignment
	// alone, an empty list clears it.
	var agentIDs *[]uuid.UUID
	if req.Agents != nil {
		ids, ok := parseAgentIDs(c, *req.Agents)
		if !ok {
			return
		}
		agentIDs = &ids
	}
	user := middleware.GetUser(c)
	issue, err := h.issues.UpdateIssue(c.Request.Context(), workspace.ID, issueID, user.Login, service.IssueUpdate{
		Status:      req.Status,
		Title:       req.Title,
		Description: req.Description,
		AgentIDs:    agentIDs,
		AssigneeID:  req.AssigneeID,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrIssueNotFound):
			c.JSON(http.StatusNotFound, v1.ErrorResponse("issue not found"))
		case errors.Is(err, service.ErrInvalidStatus):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid status"))
		case errors.Is(err, service.ErrEmptyTitle):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("title is required"))
		case errors.Is(err, service.ErrUnknownAgent):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("unknown agent"))
		case errors.Is(err, service.ErrUnknownMember):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("unknown assignee"))
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

// ── Pull request links (entry ④) ────────────────────────────────────────
//
// The other three entries are automatic. These are the human's: link a PR the
// platform did not open, unlink one it should not have, or restore one that was
// unlinked by mistake. An unlink leaves a tombstone, so no automation links the
// PR back afterwards.

// LinkPullRequest handles POST /workspaces/:id/issues/:issueId/pull-requests.
func (h *IssueHandler) LinkPullRequest(c *gin.Context) {
	workspace, ok := h.requireWorkspaceOwner(c)
	if !ok {
		return
	}
	prs := h.prs
	if prs == nil {
		c.JSON(http.StatusServiceUnavailable, v1.ErrorResponse("pull request linking is unavailable"))
		return
	}
	issueID, ok := h.resolveIssue(c, workspace.ID)
	if !ok {
		return
	}
	var req LinkPullRequestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request body"))
		return
	}
	row, err := prs.LinkManual(c.Request.Context(), workspace.ID, issueID, req.Ref)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrPullRequestSlotTaken):
			// Not a server error: the human has a decision to make.
			c.JSON(http.StatusConflict, v1.ErrorResponse("该 issue 已有活跃 PR，请先关掉或解绑它"))
		default:
			slog.Warn("link pull request", "error", err)
			c.JSON(http.StatusBadRequest, v1.ErrorResponse(err.Error()))
		}
		return
	}
	c.JSON(http.StatusCreated, v1.SuccessResponse(service.PullRequestResponse(row), 0))
}

// UnlinkPullRequest handles DELETE /workspaces/:id/issues/:issueId/pull-requests/:prId.
func (h *IssueHandler) UnlinkPullRequest(c *gin.Context) {
	h.setPullRequestLink(c, func(prs *service.PullRequestService, workspaceID, issueID, prID uuid.UUID) error {
		return prs.Suppress(c.Request.Context(), workspaceID, issueID, prID)
	})
}

// RestorePullRequest handles POST /workspaces/:id/issues/:issueId/pull-requests/:prId/restore.
func (h *IssueHandler) RestorePullRequest(c *gin.Context) {
	h.setPullRequestLink(c, func(prs *service.PullRequestService, workspaceID, issueID, prID uuid.UUID) error {
		return prs.Restore(c.Request.Context(), workspaceID, issueID, prID)
	})
}

func (h *IssueHandler) setPullRequestLink(c *gin.Context, apply func(*service.PullRequestService, uuid.UUID, uuid.UUID, uuid.UUID) error) {
	workspace, ok := h.requireWorkspaceOwner(c)
	if !ok {
		return
	}
	prs := h.prs
	if prs == nil {
		c.JSON(http.StatusServiceUnavailable, v1.ErrorResponse("pull request linking is unavailable"))
		return
	}
	issueID, ok := h.resolveIssue(c, workspace.ID)
	if !ok {
		return
	}
	prID, err := uuid.Parse(c.Param("prId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid pull request id"))
		return
	}
	if err := apply(prs, workspace.ID, issueID, prID); err != nil {
		switch {
		case errors.Is(err, service.ErrPullRequestSlotTaken):
			c.JSON(http.StatusConflict, v1.ErrorResponse("该 issue 已有活跃 PR，请先关掉或解绑它"))
		case errors.Is(err, pgx.ErrNoRows):
			c.JSON(http.StatusNotFound, v1.ErrorResponse("pull request not found"))
		default:
			slog.Warn("update pull request link", "error", err)
			c.JSON(http.StatusBadRequest, v1.ErrorResponse(err.Error()))
		}
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(nil, 0))
}

// resolveIssue resolves the path's issue reference, writing the error response
// itself so callers only branch on ok.
func (h *IssueHandler) resolveIssue(c *gin.Context, workspaceID uuid.UUID) (uuid.UUID, bool) {
	issueID, err := h.issues.ResolveIssueID(c.Request.Context(), workspaceID, c.Param("issueId"))
	if err != nil {
		if errors.Is(err, service.ErrIssueNotFound) {
			c.JSON(http.StatusNotFound, v1.ErrorResponse("issue not found"))
			return uuid.Nil, false
		}
		slog.Error("resolve issue", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to resolve issue"))
		return uuid.Nil, false
	}
	return issueID, true
}

// LinkPullRequestRequest carries what a human pastes: a PR URL, or its number.
type LinkPullRequestRequest struct {
	Ref string `json:"ref" binding:"required"`
}
