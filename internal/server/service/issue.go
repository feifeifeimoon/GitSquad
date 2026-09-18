package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strconv"
	"strings"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/feifeifeimoon/GitSquad/internal/util"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
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

type IssueService struct {
	store      *store.Store
	dispatcher TaskDispatcher // optional; enqueues tasks for matched @mentions
	publisher  EventPublisher // optional; pushes realtime events to browsers
}

func NewIssueService(s *store.Store, dispatcher ...TaskDispatcher) *IssueService {
	svc := &IssueService{store: s}
	if len(dispatcher) > 0 {
		svc.dispatcher = dispatcher[0]
	}
	return svc
}

// SetPublisher wires the realtime publisher in; nil disables realtime.
func (s *IssueService) SetPublisher(p EventPublisher) { s.publisher = p }

// publish notifies connected browsers of a workspace-scoped change.
func (s *IssueService) publish(eventType string, workspaceID, issueID uuid.UUID) {
	if s.publisher == nil {
		return
	}
	s.publisher.Publish(v1.AppEvent{Type: eventType, WorkspaceID: workspaceID, IssueID: issueID})
}

// listAgentNames returns the enabled agent names configured in a workspace,
// backing @mention resolution against the agents table.
func (s *IssueService) listAgentNames(ctx context.Context, workspaceID uuid.UUID) ([]string, error) {
	return s.store.ListAgentNamesByWorkspace(ctx, workspaceID)
}

// dispatchForMention is the seam where task dispatch hooks in: a matched
// mention should enqueue a task for the agent.
func (s *IssueService) dispatchForMention(ctx context.Context, workspaceID, issueID uuid.UUID, agentName string) {
	if s.dispatcher == nil {
		return
	}
	if err := s.dispatcher.Dispatch(ctx, workspaceID, issueID, agentName); err != nil {
		slog.Warn("dispatch task", "agent", agentName, "error", err)
	}
}

func issueKey(prefix string, number int32) string {
	return fmt.Sprintf("%s-%d", prefix, number)
}

// parseIssueNumber extracts the trailing number from an issue reference in
// "PREFIX-NUMBER" form (e.g. "GTS-42"). Bare numbers and malformed refs are
// rejected — only UUIDs or PREFIX-NUMBER are valid issue references.
func parseIssueNumber(ref string) (int32, bool) {
	i := strings.LastIndex(ref, "-")
	if i <= 0 || i >= len(ref)-1 {
		return 0, false
	}
	n, err := strconv.Atoi(ref[i+1:])
	if err != nil {
		return 0, false
	}
	return int32(n), true
}

// ResolveIssueID resolves an issue reference (UUID or "PREFIX-NUMBER") to its
// UUID. UUID refs are returned as-is and validated by the downstream
// Get/Update/AddComment calls; PREFIX-NUMBER refs are looked up by number.
func (s *IssueService) ResolveIssueID(ctx context.Context, workspaceID uuid.UUID, ref string) (uuid.UUID, error) {
	if id, err := uuid.Parse(ref); err == nil {
		return id, nil
	}
	num, ok := parseIssueNumber(ref)
	if !ok {
		return uuid.Nil, ErrIssueNotFound
	}
	row, err := s.store.GetIssueByNumber(ctx, db.GetIssueByNumberParams{WorkspaceID: workspaceID, Number: num})
	if err != nil {
		return uuid.Nil, fmt.Errorf("%w: %v", ErrIssueNotFound, err)
	}
	return row.ID, nil
}

// listRowToResponse maps a ListIssuesByWorkspaceRow to the API shape.
func listRowToResponse(row db.ListIssuesByWorkspaceRow) v1.Issue {
	return v1.Issue{
		ID:                      row.ID,
		Number:                  row.Number,
		IssueKey:                issueKey(row.IssuePrefix, row.Number),
		Title:                   row.Title,
		Description:             row.Description,
		Status:                  row.Status,
		AssignedAgents:          row.AssignedAgents,
		ActivePullRequestNumber: row.ActivePrNumber,
		CreatorName:             row.CreatorName,
		CommentsCount:           int(row.CommentsCount),
		CreatedAt:               row.CreatedAt,
		UpdatedAt:               row.UpdatedAt,
	}
}

// getRowToResponse maps a GetIssueRow to the API shape.
func getRowToResponse(row db.GetIssueRow) v1.Issue {
	return v1.Issue{
		ID:             row.ID,
		Number:         row.Number,
		IssueKey:       issueKey(row.IssuePrefix, row.Number),
		Title:          row.Title,
		Description:    row.Description,
		Status:         row.Status,
		AssignedAgents: row.AssignedAgents,
		CreatorName:    row.CreatorName,
		CommentsCount:  int(row.CommentsCount),
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
	}
}

// CreateIssue creates an issue with a per-workspace sequential number,
// scans the description for @mentions, and appends system hints for
// mentions that match no agent. Runs in one transaction.
func (s *IssueService) CreateIssue(ctx context.Context, workspaceID, userID uuid.UUID, userLogin, title, description, status string) (*v1.Issue, error) {
	if strings.TrimSpace(title) == "" {
		return nil, ErrEmptyTitle
	}
	if status == "" {
		status = v1.IssueStatusBacklog
	}
	if !v1.ValidIssueStatus(status) {
		return nil, ErrInvalidStatus
	}

	agents, err := s.listAgentNames(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list agent names: %w", err)
	}
	matched, unmatched := processMentions(description, agents)

	var resp *v1.Issue
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
			CreatorUserID:  util.Ptr(userID),
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
		resp = &v1.Issue{
			ID:             issue.ID,
			Number:         issue.Number,
			IssueKey:       issueKey(prefix, issue.Number),
			Title:          issue.Title,
			Description:    issue.Description,
			Status:         issue.Status,
			AssignedAgents: issue.AssignedAgents,
			CreatorName:    userLogin,
			CreatedAt:      issue.CreatedAt,
			UpdatedAt:      issue.UpdatedAt,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	for _, name := range matched {
		s.dispatchForMention(ctx, workspaceID, resp.ID, name)
	}
	s.publish(v1.AppEventIssueCreated, workspaceID, resp.ID)
	return resp, nil
}

// ListIssues returns every issue in the workspace, ordered by status then
// newest-first, for the kanban board.
func (s *IssueService) ListIssues(ctx context.Context, workspaceID uuid.UUID) ([]v1.Issue, error) {
	rows, err := s.store.ListIssuesByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list issues: %w", err)
	}
	list := make([]v1.Issue, len(rows))
	for i, row := range rows {
		list[i] = listRowToResponse(row)
	}
	return list, nil
}

// GetIssue returns the issue with its full comment stream (oldest first).
func (s *IssueService) GetIssue(ctx context.Context, workspaceID, issueID uuid.UUID) (*v1.IssueDetail, error) {
	row, err := s.store.GetIssue(ctx, db.GetIssueParams{ID: issueID, WorkspaceID: workspaceID})
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrIssueNotFound, err)
	}
	comments, err := s.store.ListCommentsByIssue(ctx, issueID)
	if err != nil {
		return nil, fmt.Errorf("list comments: %w", err)
	}
	detail := v1.IssueDetail{
		Issue:    getRowToResponse(row),
		Comments: make([]v1.IssueComment, len(comments)),
	}
	for i, c := range comments {
		detail.Comments[i] = v1.IssueComment{
			ID:         c.ID,
			AuthorType: c.AuthorType,
			AuthorName: c.AuthorName,
			Type:       c.Type,
			Content:    c.Content,
			CreatedAt:  c.CreatedAt,
		}
	}

	// The issue's pull requests ride along with the detail view, because that is
	// where a human looks to see where the work stands: the active PR plus the
	// history of how the issue got here. Best effort — a database hiccup here
	// must not hide the issue itself.
	prRows, err := s.store.ListPullRequestsByIssue(ctx, issueID)
	if err != nil {
		slog.Warn("list pull requests for issue", "issue", issueID, "error", err)
	}
	detail.Issue.PullRequests = pullRequestsToResponse(prRows)

	return &detail, nil
}

// pullRequestsToResponse maps PR rows to the API shape, flagging which one is
// the issue's active PR so clients do not have to re-derive the rule.
func pullRequestsToResponse(rows []db.PullRequest) []v1.PullRequest {
	if len(rows) == 0 {
		return nil
	}
	out := make([]v1.PullRequest, 0, len(rows))
	for _, r := range rows {
		out = append(out, PullRequestResponse(r))
	}
	return out
}

// UpdateIssue applies the non-nil fields (status / title / description).
// A status change appends an immutable status_change comment naming the
// actor who triggered it.
func (s *IssueService) UpdateIssue(ctx context.Context, workspaceID, issueID uuid.UUID, actorName string, status, title, description *string) (*v1.Issue, error) {
	if status != nil && !v1.ValidIssueStatus(*status) {
		return nil, ErrInvalidStatus
	}
	if title != nil && strings.TrimSpace(*title) == "" {
		return nil, ErrEmptyTitle
	}

	var resp *v1.Issue
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
	s.publish(v1.AppEventIssueUpdated, workspaceID, issueID)
	return resp, nil
}

// AddComment appends a user comment, processes @mentions (assigning
// matched agents and hinting at unmatched ones), and fires the dispatch
// hook for matched agents. Comment insert and mention effects share one
// transaction.
func (s *IssueService) AddComment(ctx context.Context, workspaceID, issueID, userID uuid.UUID, userLogin, content string) (*v1.IssueComment, error) {
	if strings.TrimSpace(content) == "" {
		return nil, ErrEmptyComment
	}

	agents, err := s.listAgentNames(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list agent names: %w", err)
	}
	matched, unmatched := processMentions(content, agents)

	var resp *v1.IssueComment
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
			AuthorID:   util.Ptr(userID),
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
		resp = &v1.IssueComment{
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
		s.dispatchForMention(ctx, workspaceID, issueID, name)
	}
	s.publish(v1.AppEventCommentCreated, workspaceID, issueID)
	return resp, nil
}
