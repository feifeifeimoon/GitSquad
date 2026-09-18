package v1

import (
	"time"

	"github.com/google/uuid"
)

// Issue lifecycle statuses, in board order. The set is mirrored by a CHECK
// constraint on issues.status, so a new state has to be added in both places —
// and to the console's ISSUE_STATUSES list, which is what draws the columns.
const (
	IssueStatusBacklog    = "backlog"
	IssueStatusTodo       = "todo"
	IssueStatusInProgress = "in_progress"
	IssueStatusInReview   = "in_review"
	IssueStatusDone       = "done"
	IssueStatusBlocked    = "blocked"
	IssueStatusCancelled  = "cancelled"
)

// ValidIssueStatus reports whether s is one of the issue lifecycle statuses.
// The switch is deliberate: it names the constants directly, so there is no
// second list to keep in step with the const block above.
func ValidIssueStatus(s string) bool {
	switch s {
	case IssueStatusBacklog, IssueStatusTodo, IssueStatusInProgress,
		IssueStatusInReview, IssueStatusDone, IssueStatusBlocked,
		IssueStatusCancelled:
		return true
	}
	return false
}

// Issue is an issue as the console sees it. IssueKey is the human reference
// (e.g. "GTS-42"); Number is the per-workspace sequence behind it.
type Issue struct {
	ID             uuid.UUID `json:"id"`
	Number         int32     `json:"number"`
	IssueKey       string    `json:"issue_key"`
	Title          string    `json:"title"`
	Description    string    `json:"description"`
	Status         string    `json:"status"` // one of the IssueStatus* values
	AssignedAgents []string  `json:"assigned_agents"`
	// PullRequests is the issue's PR history, newest first. The active one is
	// the open PR that declares closing intent, if any; the rest are how the
	// issue got here. Only populated on the detail endpoint.
	PullRequests []PullRequest `json:"pull_requests,omitempty"`
	// ActivePullRequestNumber is the number of the issue's active PR, or 0 when
	// it has none. It rides on the list endpoint too, where the full history
	// would be wasted bytes: the board only needs to show that a PR exists.
	ActivePullRequestNumber int32     `json:"active_pr_number,omitempty"`
	CreatorName             string    `json:"creator_name"`
	CommentsCount           int       `json:"comments_count"`
	CreatedAt               time.Time `json:"created_at"`
	UpdatedAt               time.Time `json:"updated_at"`
}

// PullRequest is one pull request linked to an issue.
//
// Active is what the rest of the system keys off: an issue has at most one
// active PR at a time — the open one that declares closing intent — and it is
// the PR a new task continues. Merged, closed and unlinked rows are history.
type PullRequest struct {
	ID           uuid.UUID `json:"id"`
	Number       int32     `json:"number"`
	Title        string    `json:"title"`
	URL          string    `json:"url"`
	State        string    `json:"state"` // open | merged | closed
	Draft        bool      `json:"draft"`
	HeadBranch   string    `json:"head_branch"`
	BaseBranch   string    `json:"base_branch"`
	Author       string    `json:"author"`
	RepoFullName string    `json:"repo_full_name"`
	// Source is how the link was made: platform | branch | body | manual.
	Source      string     `json:"source"`
	CloseIntent bool       `json:"close_intent"`
	Suppressed  bool       `json:"suppressed"`
	Active      bool       `json:"active"`
	MergedAt    *time.Time `json:"merged_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// IssueComment is one entry in an issue's activity feed. Status changes and
// system notices are stored as comments so the feed is the whole history.
type IssueComment struct {
	ID         uuid.UUID `json:"id"`
	AuthorType string    `json:"author_type"` // user | agent | system
	AuthorName string    `json:"author_name"`
	Type       string    `json:"type"` // comment | status_change | system
	Content    string    `json:"content"`
	CreatedAt  time.Time `json:"created_at"`
}

// IssueDetail is an issue together with its full comment thread.
type IssueDetail struct {
	Issue
	Comments []IssueComment `json:"comments"`
}
