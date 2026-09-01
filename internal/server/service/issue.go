package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/google/uuid"
)

var (
	ErrIssueNotFound = errors.New("issue not found")
	ErrInvalidStatus = errors.New("invalid issue status")
	ErrEmptyTitle    = errors.New("title is required")
	ErrEmptyComment  = errors.New("comment content is required")
)

var nonLetterRe = regexp.MustCompile(`[^a-zA-Z]`)

// deriveIssuePrefix derives the human-readable issue prefix for a workspace
// (e.g. "GitSquad" → "GTS"), falling back to "WS" when the name has fewer
// than 3 letters.
func deriveIssuePrefix(name string) string {
	letters := nonLetterRe.ReplaceAllString(name, "")
	if len(letters) >= 3 {
		return strings.ToUpper(letters[:3])
	}
	return "WS"
}

// issueStatuses is the canonical status set (Multica-style, 7 states).
var issueStatuses = map[string]bool{
	"backlog": true, "todo": true, "in_progress": true, "in_review": true,
	"done": true, "blocked": true, "cancelled": true,
}

func validIssueStatus(s string) bool { return issueStatuses[s] }

type IssueResponse struct {
	ID             uuid.UUID `json:"id"`
	Number         int32     `json:"number"`
	IssueKey       string    `json:"issue_key"`
	Title          string    `json:"title"`
	Description    string    `json:"description"`
	Status         string    `json:"status"`
	AssignedAgents []string  `json:"assigned_agents"`
	LinkedPRs      []string  `json:"linked_prs"`
	CreatorName    string    `json:"creator_name"`
	CommentsCount  int       `json:"comments_count"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type CommentResponse struct {
	ID         uuid.UUID `json:"id"`
	AuthorType string    `json:"author_type"`
	AuthorName string    `json:"author_name"`
	Type       string    `json:"type"`
	Content    string    `json:"content"`
	CreatedAt  time.Time `json:"created_at"`
}

type IssueDetailResponse struct {
	IssueResponse
	Comments []CommentResponse `json:"comments"`
}

type IssueService struct {
	store *store.Store
}

func NewIssueService(s *store.Store) *IssueService {
	return &IssueService{store: s}
}

// listAgentNames returns the agent names configured in a workspace.
// Chapter 5 (agent config) will back this with the agents table; until
// then it returns nothing, so every mention is treated as unmatched.
func listAgentNames(ctx context.Context, workspaceID uuid.UUID) ([]string, error) {
	return nil, nil
}

// dispatchForMention is the seam where Chapter 9 (task dispatch) hooks in:
// a matched mention should enqueue a task for the agent. Empty until then.
func (s *IssueService) dispatchForMention(ctx context.Context, issueID uuid.UUID, agentName string) {
}

func issueKey(prefix string, number int32) string {
	return fmt.Sprintf("%s-%d", prefix, number)
}

// listRowToResponse maps a ListIssuesByWorkspaceRow to the API shape.
func listRowToResponse(row db.ListIssuesByWorkspaceRow) IssueResponse {
	return IssueResponse{
		ID:             row.ID,
		Number:         row.Number,
		IssueKey:       issueKey(row.IssuePrefix, row.Number),
		Title:          row.Title,
		Description:    row.Description,
		Status:         row.Status,
		AssignedAgents: row.AssignedAgents,
		LinkedPRs:      row.LinkedPrs,
		CreatorName:    row.CreatorName,
		CommentsCount:  int(row.CommentsCount),
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
	}
}

// getRowToResponse maps a GetIssueRow to the API shape.
func getRowToResponse(row db.GetIssueRow) IssueResponse {
	return IssueResponse{
		ID:             row.ID,
		Number:         row.Number,
		IssueKey:       issueKey(row.IssuePrefix, row.Number),
		Title:          row.Title,
		Description:    row.Description,
		Status:         row.Status,
		AssignedAgents: row.AssignedAgents,
		LinkedPRs:      row.LinkedPrs,
		CreatorName:    row.CreatorName,
		CommentsCount:  int(row.CommentsCount),
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
	}
}

// uuidPtr converts a uuid.UUID into the *uuid.UUID the sqlc-generated
// models use for nullable uuid columns.
func uuidPtr(id uuid.UUID) *uuid.UUID { return &id }

// CreateIssue creates an issue with a per-workspace sequential number,
// scans the description for @mentions, and appends system hints for
// mentions that match no agent. Runs in one transaction.
func (s *IssueService) CreateIssue(ctx context.Context, workspaceID, userID uuid.UUID, userLogin, title, description, status string) (*IssueResponse, error) {
	if strings.TrimSpace(title) == "" {
		return nil, ErrEmptyTitle
	}
	if status == "" {
		status = "backlog"
	}
	if !validIssueStatus(status) {
		return nil, ErrInvalidStatus
	}

	agents, err := listAgentNames(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list agent names: %w", err)
	}
	matched, unmatched := processMentions(description, agents)

	var resp *IssueResponse
	err = s.store.ExecTx(ctx, func(q *db.Queries) error {
		prefix, err := q.GetWorkspaceNumbering(ctx, workspaceID)
		if err != nil {
			return fmt.Errorf("%w: %v", ErrIssueNotFound, err)
		}
		number, err := q.IncrementWorkspaceIssueCounter(ctx, workspaceID)
		if err != nil {
			return fmt.Errorf("increment counter: %w", err)
		}
		issue, err := q.CreateIssue(ctx, db.CreateIssueParams{
			WorkspaceID:    workspaceID,
			Number:         number,
			Title:          title,
			Description:    description,
			Status:         status,
			CreatorUserID:  uuidPtr(userID),
			AssignedAgents: matched,
		})
		if err != nil {
			return fmt.Errorf("create issue: %w", err)
		}
		for _, name := range unmatched {
			if _, err := q.CreateComment(ctx, db.CreateCommentParams{
				IssueID:    issue.ID,
				AuthorType: "system",
				AuthorName: "system",
				Type:       "system",
				Content:    "未匹配到 Workspace 中的任何 agent: @" + name,
			}); err != nil {
				return fmt.Errorf("append unmatched-mention hint: %w", err)
			}
		}
		resp = &IssueResponse{
			ID:             issue.ID,
			Number:         issue.Number,
			IssueKey:       issueKey(prefix, issue.Number),
			Title:          issue.Title,
			Description:    issue.Description,
			Status:         issue.Status,
			AssignedAgents: issue.AssignedAgents,
			LinkedPRs:      issue.LinkedPrs,
			CreatorName:    userLogin,
			CreatedAt:      issue.CreatedAt,
			UpdatedAt:      issue.UpdatedAt,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return resp, nil
}

// ListIssues returns every issue in the workspace, ordered by status then
// newest-first, for the kanban board.
func (s *IssueService) ListIssues(ctx context.Context, workspaceID uuid.UUID) ([]IssueResponse, error) {
	rows, err := s.store.ListIssuesByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list issues: %w", err)
	}
	list := make([]IssueResponse, len(rows))
	for i, row := range rows {
		list[i] = listRowToResponse(row)
	}
	return list, nil
}

// GetIssue returns the issue with its full comment stream (oldest first).
func (s *IssueService) GetIssue(ctx context.Context, workspaceID, issueID uuid.UUID) (*IssueDetailResponse, error) {
	row, err := s.store.GetIssue(ctx, db.GetIssueParams{ID: issueID, WorkspaceID: workspaceID})
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrIssueNotFound, err)
	}
	comments, err := s.store.ListCommentsByIssue(ctx, issueID)
	if err != nil {
		return nil, fmt.Errorf("list comments: %w", err)
	}
	detail := IssueDetailResponse{
		IssueResponse: getRowToResponse(row),
		Comments:      make([]CommentResponse, len(comments)),
	}
	for i, c := range comments {
		detail.Comments[i] = CommentResponse{
			ID:         c.ID,
			AuthorType: c.AuthorType,
			AuthorName: c.AuthorName,
			Type:       c.Type,
			Content:    c.Content,
			CreatedAt:  c.CreatedAt,
		}
	}
	return &detail, nil
}

// UpdateIssue applies the non-nil fields (status / title / description).
// A status change appends an immutable status_change comment naming the
// actor who triggered it.
func (s *IssueService) UpdateIssue(ctx context.Context, workspaceID, issueID uuid.UUID, actorName string, status, title, description *string) (*IssueResponse, error) {
	if status != nil && !validIssueStatus(*status) {
		return nil, ErrInvalidStatus
	}
	if title != nil && strings.TrimSpace(*title) == "" {
		return nil, ErrEmptyTitle
	}

	var resp *IssueResponse
	err := s.store.ExecTx(ctx, func(q *db.Queries) error {
		row, err := q.GetIssue(ctx, db.GetIssueParams{ID: issueID, WorkspaceID: workspaceID})
		if err != nil {
			return fmt.Errorf("%w: %v", ErrIssueNotFound, err)
		}
		if status != nil && *status != row.Status {
			if _, err := q.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{
				ID:          issueID,
				WorkspaceID: workspaceID,
				Status:      *status,
			}); err != nil {
				return fmt.Errorf("update status: %w", err)
			}
			if _, err := q.CreateComment(ctx, db.CreateCommentParams{
				IssueID:    issueID,
				AuthorType: "system",
				AuthorName: actorName,
				Type:       "status_change",
				Content:    fmt.Sprintf("%s 状态变更: %s → %s,由 %s 操作", issueKey(row.IssuePrefix, row.Number), row.Status, *status, actorName),
			}); err != nil {
				return fmt.Errorf("append status change comment: %w", err)
			}
		}
		if title != nil || description != nil {
			newTitle := row.Title
			if title != nil {
				newTitle = *title
			}
			newDesc := row.Description
			if description != nil {
				newDesc = *description
			}
			if _, err := q.UpdateIssueTitleDescription(ctx, db.UpdateIssueTitleDescriptionParams{
				ID:          issueID,
				WorkspaceID: workspaceID,
				Title:       newTitle,
				Description: newDesc,
			}); err != nil {
				return fmt.Errorf("update fields: %w", err)
			}
		}
		// Re-fetch so the response carries the accurate comments_count,
		// which the bare UpdateIssue* RETURNING row does not include.
		fresh, err := q.GetIssue(ctx, db.GetIssueParams{ID: issueID, WorkspaceID: workspaceID})
		if err != nil {
			return fmt.Errorf("refetch issue: %w", err)
		}
		r := getRowToResponse(fresh)
		resp = &r
		return nil
	})
	if err != nil {
		return nil, err
	}
	return resp, nil
}

// AddComment appends a user comment, processes @mentions (assigning
// matched agents and hinting at unmatched ones), and fires the dispatch
// hook for matched agents. Comment insert and mention effects share one
// transaction.
func (s *IssueService) AddComment(ctx context.Context, workspaceID, issueID, userID uuid.UUID, userLogin, content string) (*CommentResponse, error) {
	if strings.TrimSpace(content) == "" {
		return nil, ErrEmptyComment
	}

	agents, err := listAgentNames(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list agent names: %w", err)
	}
	matched, unmatched := processMentions(content, agents)

	var resp *CommentResponse
	err = s.store.ExecTx(ctx, func(q *db.Queries) error {
		if _, err := q.GetIssue(ctx, db.GetIssueParams{ID: issueID, WorkspaceID: workspaceID}); err != nil {
			return fmt.Errorf("%w: %v", ErrIssueNotFound, err)
		}
		for _, name := range matched {
			if err := q.AddIssueAssignedAgent(ctx, db.AddIssueAssignedAgentParams{
				ID:        issueID,
				AgentName: name,
			}); err != nil {
				return fmt.Errorf("assign agent: %w", err)
			}
		}
		comment, err := q.CreateComment(ctx, db.CreateCommentParams{
			IssueID:    issueID,
			AuthorType: "user",
			AuthorID:   uuidPtr(userID),
			AuthorName: userLogin,
			Type:       "comment",
			Content:    content,
		})
		if err != nil {
			return fmt.Errorf("create comment: %w", err)
		}
		for _, name := range unmatched {
			if _, err := q.CreateComment(ctx, db.CreateCommentParams{
				IssueID:    issueID,
				AuthorType: "system",
				AuthorName: "system",
				Type:       "system",
				Content:    "未匹配到 Workspace 中的任何 agent: @" + name,
			}); err != nil {
				return fmt.Errorf("append unmatched-mention hint: %w", err)
			}
		}
		resp = &CommentResponse{
			ID:         comment.ID,
			AuthorType: comment.AuthorType,
			AuthorName: comment.AuthorName,
			Type:       comment.Type,
			Content:    comment.Content,
			CreatedAt:  comment.CreatedAt,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	for _, name := range matched {
		s.dispatchForMention(ctx, issueID, name)
	}
	return resp, nil
}
