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
	// ErrUnknownAgent is a request that names an agent this workspace does not
	// have. The console sends ids, so a bad one is a bug or a stale tab.
	ErrUnknownAgent = errors.New("unknown agent")
	// ErrUnknownMember is the same for the assignee: the person must belong to
	// the workspace, and today that means the one user it belongs to.
	ErrUnknownMember = errors.New("unknown member")
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

// members is the roster an assignee is picked from, identities included: the
// create and update paths both need to check membership, and the response needs
// the login and avatar the chip renders. One row today.
func (s *IssueService) members(ctx context.Context, workspaceID uuid.UUID) ([]db.ListWorkspaceMembersRow, error) {
	rows, err := s.store.ListWorkspaceMembers(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	return rows, nil
}

// memberOf finds a user in the roster by id.
func memberOf(rows []db.ListWorkspaceMembersRow, id uuid.UUID) (db.ListWorkspaceMembersRow, bool) {
	for _, r := range rows {
		if r.ID == id {
			return r, true
		}
	}
	return db.ListWorkspaceMembersRow{}, false
}

// assigneeFrom builds the assignee from a LEFT JOINed row: no id means the
// issue has nobody on it, which is a state the console renders as a slot.
func assigneeFrom(id *uuid.UUID, login, avatarURL string) *v1.IssueAssignee {
	if id == nil {
		return nil
	}
	return &v1.IssueAssignee{ID: *id, Login: login, AvatarURL: avatarURL}
}

// formatAssignee names one side of an assignee change for the feed, with the
// empty side spelled out rather than left blank.
func formatAssignee(id *uuid.UUID, login string) string {
	if id == nil || login == "" {
		return "未指派"
	}
	return login
}

// assignmentRoster is every agent in the workspace: the id the assignment table
// stores, the name an @mention matches, the avatar a response carries, and
// whether the agent can run. One read backs the roster, id validation and
// mention resolution — all three need the same rows.
func (s *IssueService) assignmentRoster(ctx context.Context, workspaceID uuid.UUID) ([]db.ListWorkspaceAgentsForAssignmentRow, error) {
	return s.store.ListWorkspaceAgentsForAssignment(ctx, workspaceID)
}

// mentionedIn resolves the @mentions in content against the enabled agents of a
// roster, returning the matched rows (so callers get ids without a second
// lookup) and the names nothing matched.
func mentionedIn(content string, roster []db.ListWorkspaceAgentsForAssignmentRow) ([]db.ListWorkspaceAgentsForAssignmentRow, []string) {
	names := make([]string, 0, len(roster))
	byName := make(map[string]db.ListWorkspaceAgentsForAssignmentRow, len(roster))
	for _, a := range roster {
		if !a.Enabled {
			continue
		}
		names = append(names, a.Name)
		byName[a.Name] = a
	}
	matchedNames, unmatched := processMentions(content, names)
	matched := make([]db.ListWorkspaceAgentsForAssignmentRow, 0, len(matchedNames))
	for _, name := range matchedNames {
		matched = append(matched, byName[name])
	}
	return matched, unmatched
}

// agentSetNames maps assignment rows to the names the activity feed prints.
func agentSetNames(rows []db.ListIssueAgentsRow) []string {
	names := make([]string, len(rows))
	for i, r := range rows {
		names[i] = r.Name
	}
	return names
}

// formatAgentSet renders a set of agents for the feed: "@planner、@reviewer",
// or 无 when nothing is assigned. The @ is the mention syntax on purpose — what
// is named here is agents, and that is how the rest of the console spells them.
func formatAgentSet(names []string) string {
	if len(names) == 0 {
		return "无"
	}
	marked := make([]string, len(names))
	for i, n := range names {
		marked[i] = "@" + n
	}
	return strings.Join(marked, "、")
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

// listRowToResponse maps a ListIssuesByWorkspaceRow to the API shape. The
// agents arrive separately because they live in their own table; the board
// reads them for the whole workspace and hands each issue its slice.
func listRowToResponse(row db.ListIssuesByWorkspaceRow, agents []v1.IssueAgent) v1.Issue {
	return v1.Issue{
		ID:                      row.ID,
		Number:                  row.Number,
		IssueKey:                issueKey(row.IssuePrefix, row.Number),
		Title:                   row.Title,
		Description:             row.Description,
		Status:                  row.Status,
		Agents:                  agents,
		Assignee:                assigneeFrom(row.AssigneeID, row.AssigneeLogin, row.AssigneeAvatarUrl),
		ActivePullRequestNumber: row.ActivePrNumber,
		CreatorName:             row.CreatorName,
		CommentsCount:           int(row.CommentsCount),
		CreatedAt:               row.CreatedAt,
		UpdatedAt:               row.UpdatedAt,
	}
}

// getRowToResponse maps a GetIssueRow to the API shape.
func getRowToResponse(row db.GetIssueRow, agents []v1.IssueAgent) v1.Issue {
	return v1.Issue{
		ID:            row.ID,
		Number:        row.Number,
		IssueKey:      issueKey(row.IssuePrefix, row.Number),
		Title:         row.Title,
		Description:   row.Description,
		Status:        row.Status,
		Agents:        agents,
		Assignee:      assigneeFrom(row.AssigneeID, row.AssigneeLogin, row.AssigneeAvatarUrl),
		CreatorName:   row.CreatorName,
		CommentsCount: int(row.CommentsCount),
		CreatedAt:     row.CreatedAt,
		UpdatedAt:     row.UpdatedAt,
	}
}

// issueAgents maps assignment rows to the API shape. The state is already
// resolved by the query, per (issue, agent).
func issueAgents(rows []db.ListIssueAgentsRow) []v1.IssueAgent {
	agents := make([]v1.IssueAgent, len(rows))
	for i, r := range rows {
		agents[i] = v1.IssueAgent{ID: r.ID, Name: r.Name, AvatarURL: r.AvatarUrl, State: r.State}
	}
	return agents
}

// groupIssueAgentsByIssue buckets the workspace-wide assignment read by issue,
// so the board resolves every card's agents in one pass instead of a query per
// card. Issues with no agents are simply absent from the map.
func groupIssueAgentsByIssue(rows []db.ListIssueAgentsByWorkspaceRow) map[uuid.UUID][]v1.IssueAgent {
	byIssue := make(map[uuid.UUID][]v1.IssueAgent)
	for _, r := range rows {
		byIssue[r.IssueID] = append(byIssue[r.IssueID], v1.IssueAgent{
			ID: r.ID, Name: r.Name, AvatarURL: r.AvatarUrl, State: r.State,
		})
	}
	return byIssue
}

// IssueCreate is what a caller may set when opening an issue. Mentioned agents
// are assigned and dispatched; agents named in AgentIDs are assigned only —
// assigning an agent records who works on the issue, it does not start a run.
type IssueCreate struct {
	Title       string
	Description string
	Status      string
	AgentIDs    []uuid.UUID
	// AssigneeID is who is accountable for the issue. Nil means the creator,
	// which is the only member a workspace has today.
	AssigneeID *uuid.UUID
}

// CreateIssue creates an issue with a per-workspace sequential number, assigns
// the agents named in the description and in AgentIDs, and appends system hints
// for mentions that match no agent. Runs in one transaction.
func (s *IssueService) CreateIssue(ctx context.Context, workspaceID, userID uuid.UUID, userLogin string, in IssueCreate) (*v1.Issue, error) {
	if strings.TrimSpace(in.Title) == "" {
		return nil, ErrEmptyTitle
	}
	status := in.Status
	if status == "" {
		status = v1.IssueStatusBacklog
	}
	if !v1.ValidIssueStatus(status) {
		return nil, ErrInvalidStatus
	}

	roster, err := s.assignmentRoster(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list agent names: %w", err)
	}
	matched, unmatched := mentionedIn(in.Description, roster)

	// The one person accountable. Defaults to the creator, so an issue is never
	// born ownerless; the roster is read anyway because the response carries the
	// avatar and the console renders an identity chip from it.
	members, err := s.members(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	assignee := v1.IssueAssignee{ID: userID, Login: userLogin}
	if m, ok := memberOf(members, userID); ok {
		assignee = v1.IssueAssignee{ID: m.ID, Login: m.Login, AvatarURL: m.AvatarUrl}
	}
	if in.AssigneeID != nil {
		m, ok := memberOf(members, *in.AssigneeID)
		if !ok {
			return nil, fmt.Errorf("%w: %s", ErrUnknownMember, *in.AssigneeID)
		}
		assignee = v1.IssueAssignee{ID: m.ID, Login: m.Login, AvatarURL: m.AvatarUrl}
	}

	// The stored set is the union of what the description mentioned and what
	// the caller asked for, in roster order. Mentions also dispatch (below);
	// the explicit ids never do.
	wanted := make(map[uuid.UUID]bool, len(matched)+len(in.AgentIDs))
	for _, a := range matched {
		wanted[a.ID] = true
	}
	if len(in.AgentIDs) > 0 {
		known := make(map[uuid.UUID]bool, len(roster))
		for _, a := range roster {
			known[a.ID] = true
		}
		for _, id := range in.AgentIDs {
			if !known[id] {
				return nil, fmt.Errorf("%w: %s", ErrUnknownAgent, id)
			}
			wanted[id] = true
		}
	}
	assigned := make([]db.ListWorkspaceAgentsForAssignmentRow, 0, len(wanted))
	for _, a := range roster {
		if wanted[a.ID] {
			assigned = append(assigned, a)
		}
	}

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
			WorkspaceID:         workspaceID,
			Number:              number,
			Title:               in.Title,
			Description:         in.Description,
			Status:              status,
			CreatorUserID:       util.Ptr(userID),
			AssigneeUserID:      util.Ptr(assignee.ID),
			SourceUpstreamIssue: nil,
		})
		if err != nil {
			return fmt.Errorf("create issue: %w", err)
		}
		// Assignment happens as part of creating the issue, so a fresh issue
		// never renders as unassigned while a task for it is already queued.
		agents := make([]v1.IssueAgent, 0, len(assigned))
		for _, a := range assigned {
			if err := q.AddIssueAgent(ctx, db.AddIssueAgentParams{IssueID: issue.ID, AgentID: a.ID}); err != nil {
				return fmt.Errorf("assign agent: %w", err)
			}
			agents = append(agents, v1.IssueAgent{
				ID: a.ID, Name: a.Name, AvatarURL: a.AvatarUrl, State: v1.AgentStateIdle,
			})
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
			ID:          issue.ID,
			Number:      issue.Number,
			IssueKey:    issueKey(prefix, issue.Number),
			Title:       issue.Title,
			Description: issue.Description,
			Status:      issue.Status,
			Agents:      agents,
			Assignee:    &assignee,
			CreatorName: userLogin,
			CreatedAt:   issue.CreatedAt,
			UpdatedAt:   issue.UpdatedAt,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	for _, a := range matched {
		s.dispatchForMention(ctx, workspaceID, resp.ID, a.Name)
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
	// One read for the whole board's assignments rather than a query per card.
	assigned, err := s.store.ListIssueAgentsByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list issue agents: %w", err)
	}
	byIssue := groupIssueAgentsByIssue(assigned)

	list := make([]v1.Issue, len(rows))
	for i, row := range rows {
		agents := byIssue[row.ID]
		if agents == nil {
			// An empty list, never null: the board maps over this field.
			agents = []v1.IssueAgent{}
		}
		list[i] = listRowToResponse(row, agents)
	}
	return list, nil
}

// GetIssue returns the issue with its full comment stream (oldest first).
func (s *IssueService) GetIssue(ctx context.Context, workspaceID, issueID uuid.UUID) (*v1.IssueDetail, error) {
	row, err := s.store.GetIssue(ctx, db.GetIssueParams{ID: issueID, WorkspaceID: workspaceID})
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrIssueNotFound, err)
	}
	agentRows, err := s.store.ListIssueAgents(ctx, issueID)
	if err != nil {
		return nil, fmt.Errorf("list issue agents: %w", err)
	}
	comments, err := s.store.ListCommentsByIssue(ctx, issueID)
	if err != nil {
		return nil, fmt.Errorf("list comments: %w", err)
	}
	detail := v1.IssueDetail{
		Issue:    getRowToResponse(row, issueAgents(agentRows)),
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

// IssueUpdate carries what a PATCH may change. A nil field is left alone, which
// is what keeps an edit to one property from rewriting the others.
type IssueUpdate struct {
	Status      *string
	Title       *string
	Description *string
	// AgentIDs replaces the whole assignment when non-nil; an empty slice
	// clears it. Replacement rather than a diff: the picker submits the set it
	// shows, and the pair is the primary key, so re-adding is a no-op.
	AgentIDs *[]uuid.UUID
	// AssigneeID sets the one accountable person: a user id to set, "" to clear
	// it, or nil to leave it alone. A UUID is never empty, so the empty string
	// is an unambiguous clear and no third state is needed.
	AssigneeID *string
}

// sameAgentSet reports whether two assignments hold the same agents, order
// aside — so a payload that merely reorders them writes no feed entry.
func sameAgentSet(current []db.ListIssueAgentsRow, next []db.ListWorkspaceAgentsForAssignmentRow) bool {
	if len(current) != len(next) {
		return false
	}
	wanted := make(map[uuid.UUID]bool, len(next))
	for _, a := range next {
		wanted[a.ID] = true
	}
	for _, a := range current {
		if !wanted[a.ID] {
			return false
		}
	}
	return true
}

// rosterNames lists the names of an assignment roster in roster order.
func rosterNames(rows []db.ListWorkspaceAgentsForAssignmentRow) []string {
	names := make([]string, len(rows))
	for i, r := range rows {
		names[i] = r.Name
	}
	return names
}

// UpdateIssue applies the non-nil fields. A status change and an assignment
// change each append an immutable feed entry naming the actor who made it.
func (s *IssueService) UpdateIssue(ctx context.Context, workspaceID, issueID uuid.UUID, actorName string, upd IssueUpdate) (*v1.Issue, error) {
	if upd.Status != nil && !v1.ValidIssueStatus(*upd.Status) {
		return nil, ErrInvalidStatus
	}
	if upd.Title != nil && strings.TrimSpace(*upd.Title) == "" {
		return nil, ErrEmptyTitle
	}

	// Resolve the requested agents before opening the transaction. An unknown
	// id is the caller's mistake rather than a database failure, and the names
	// are needed for the feed entry either way.
	var nextAgents []db.ListWorkspaceAgentsForAssignmentRow
	if upd.AgentIDs != nil {
		roster, err := s.assignmentRoster(ctx, workspaceID)
		if err != nil {
			return nil, fmt.Errorf("list agents: %w", err)
		}
		byID := make(map[uuid.UUID]bool, len(roster))
		for _, a := range roster {
			byID[a.ID] = true
		}
		wanted := make(map[uuid.UUID]bool, len(*upd.AgentIDs))
		for _, id := range *upd.AgentIDs {
			if !byID[id] {
				return nil, fmt.Errorf("%w: %s", ErrUnknownAgent, id)
			}
			wanted[id] = true // a repeat is noise, not an error
		}
		// Walk the roster rather than the payload: the stored set then reads in
		// the same order as the agents page however the caller sorted its ids.
		nextAgents = make([]db.ListWorkspaceAgentsForAssignmentRow, 0, len(wanted))
		for _, a := range roster {
			if wanted[a.ID] {
				nextAgents = append(nextAgents, a)
			}
		}
	}

	// Resolve the requested assignee before the transaction, like the agents: an
	// id outside the roster is the caller's mistake, not a database failure.
	var nextAssignee *db.ListWorkspaceMembersRow
	clearAssignee := false
	if upd.AssigneeID != nil {
		if *upd.AssigneeID == "" {
			clearAssignee = true
		} else {
			id, err := uuid.Parse(*upd.AssigneeID)
			if err != nil {
				return nil, fmt.Errorf("%w: %s", ErrUnknownMember, *upd.AssigneeID)
			}
			members, err := s.members(ctx, workspaceID)
			if err != nil {
				return nil, err
			}
			m, ok := memberOf(members, id)
			if !ok {
				return nil, fmt.Errorf("%w: %s", ErrUnknownMember, *upd.AssigneeID)
			}
			nextAssignee = &m
		}
	}

	var resp *v1.Issue
	err := s.store.ExecTx(ctx, func(q *db.Queries) error {
		row, err := q.GetIssue(ctx, db.GetIssueParams{ID: issueID, WorkspaceID: workspaceID})
		if err != nil {
			return fmt.Errorf("%w: %v", ErrIssueNotFound, err)
		}
		if upd.Status != nil && *upd.Status != row.Status {
			if _, err := q.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{
				ID:          issueID,
				WorkspaceID: workspaceID,
				Status:      *upd.Status,
			}); err != nil {
				return fmt.Errorf("update status: %w", err)
			}
			if _, err := q.CreateComment(ctx, db.CreateCommentParams{
				IssueID:    issueID,
				AuthorType: "system",
				AuthorName: actorName,
				Type:       "status_change",
				Content:    fmt.Sprintf("%s 状态变更: %s → %s,由 %s 操作", issueKey(row.IssuePrefix, row.Number), row.Status, *upd.Status, actorName),
			}); err != nil {
				return fmt.Errorf("append status change comment: %w", err)
			}
		}
		if upd.Title != nil || upd.Description != nil {
			newTitle := row.Title
			if upd.Title != nil {
				newTitle = *upd.Title
			}
			newDesc := row.Description
			if upd.Description != nil {
				newDesc = *upd.Description
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
		if upd.AgentIDs != nil {
			current, err := q.ListIssueAgents(ctx, issueID)
			if err != nil {
				return fmt.Errorf("list issue agents: %w", err)
			}
			if !sameAgentSet(current, nextAgents) {
				if err := q.DeleteIssueAgents(ctx, issueID); err != nil {
					return fmt.Errorf("clear issue agents: %w", err)
				}
				for _, a := range nextAgents {
					if err := q.AddIssueAgent(ctx, db.AddIssueAgentParams{IssueID: issueID, AgentID: a.ID}); err != nil {
						return fmt.Errorf("assign agent: %w", err)
					}
				}
				if _, err := q.CreateComment(ctx, db.CreateCommentParams{
					IssueID:    issueID,
					AuthorType: "system",
					AuthorName: actorName,
					Type:       "agents_change",
					Content: fmt.Sprintf("%s 执行者变更: %s → %s，由 %s 操作",
						issueKey(row.IssuePrefix, row.Number),
						formatAgentSet(agentSetNames(current)),
						formatAgentSet(rosterNames(nextAgents)),
						actorName),
				}); err != nil {
					return fmt.Errorf("append assignment comment: %w", err)
				}
			}
		}
		if upd.AssigneeID != nil {
			var newID *uuid.UUID
			newLogin := ""
			if !clearAssignee {
				newID = &nextAssignee.ID
				newLogin = nextAssignee.Login
			}
			sameOwner := (row.AssigneeID == nil && newID == nil) ||
				(row.AssigneeID != nil && newID != nil && *row.AssigneeID == *newID)
			if !sameOwner {
				if _, err := q.UpdateIssueAssignee(ctx, db.UpdateIssueAssigneeParams{
					ID:             issueID,
					WorkspaceID:    workspaceID,
					AssigneeUserID: newID,
				}); err != nil {
					return fmt.Errorf("update assignee: %w", err)
				}
				if _, err := q.CreateComment(ctx, db.CreateCommentParams{
					IssueID:    issueID,
					AuthorType: "system",
					AuthorName: actorName,
					Type:       "assignee_change",
					Content: fmt.Sprintf("%s 负责人变更: %s → %s，由 %s 操作",
						issueKey(row.IssuePrefix, row.Number),
						formatAssignee(row.AssigneeID, row.AssigneeLogin),
						formatAssignee(newID, newLogin),
						actorName),
				}); err != nil {
					return fmt.Errorf("append assignee comment: %w", err)
				}
			}
		}
		// Re-fetch so the response carries the accurate comments_count (which
		// the bare UpdateIssue* RETURNING row does not include) and the
		// assignment as it now stands.
		fresh, err := q.GetIssue(ctx, db.GetIssueParams{ID: issueID, WorkspaceID: workspaceID})
		if err != nil {
			return fmt.Errorf("refetch issue: %w", err)
		}
		agentRows, err := q.ListIssueAgents(ctx, issueID)
		if err != nil {
			return fmt.Errorf("list issue agents: %w", err)
		}
		r := getRowToResponse(fresh, issueAgents(agentRows))
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

	roster, err := s.assignmentRoster(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list agent names: %w", err)
	}
	matched, unmatched := mentionedIn(content, roster)

	var resp *v1.IssueComment
	err = s.store.ExecTx(ctx, func(q *db.Queries) error {
		if _, err := q.GetIssue(ctx, db.GetIssueParams{ID: issueID, WorkspaceID: workspaceID}); err != nil {
			return fmt.Errorf("%w: %v", ErrIssueNotFound, err)
		}
		for _, a := range matched {
			if err := q.AddIssueAgent(ctx, db.AddIssueAgentParams{IssueID: issueID, AgentID: a.ID}); err != nil {
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

	for _, a := range matched {
		s.dispatchForMention(ctx, workspaceID, issueID, a.Name)
	}
	s.publish(v1.AppEventCommentCreated, workspaceID, issueID)
	return resp, nil
}
