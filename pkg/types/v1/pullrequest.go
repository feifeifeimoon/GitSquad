package v1

import (
	"time"

	"github.com/google/uuid"
)

// PullRequestSummary is one row of the workspace's Pull requests page. It is a
// read model over pull_requests plus its latest review, not a second source of
// truth for the PR itself — GitHub owns that.
type PullRequestSummary struct {
	ID         uuid.UUID `json:"id"`
	Number     int32     `json:"number"`
	Title      string    `json:"title"`
	URL        string    `json:"url"`
	State      string    `json:"state"` // open | merged | closed
	Draft      bool      `json:"draft"`
	Author     string    `json:"author"`
	HeadBranch string    `json:"head_branch"`
	BaseBranch string    `json:"base_branch"`
	HeadSHA    string    `json:"head_sha"`
	UpdatedAt  time.Time `json:"updated_at"`

	// The diff's size, as GitHub last reported it. The peek shows it beside the
	// title: "how big is this" is the next question after "what is it".
	Additions    int32 `json:"additions"`
	Deletions    int32 `json:"deletions"`
	ChangedFiles int32 `json:"changed_files"`

	// IssueKey and IssueTitle are empty when the PR is not linked to an issue.
	IssueKey   string `json:"issue_key,omitempty"`
	IssueTitle string `json:"issue_title,omitempty"`

	// WorkspaceSlug and WorkspaceName say whose pull request this is, and are
	// filled only by the cross-workspace read — the same rule as v1.Issue's and
	// v1.Agent's: a page inside one workspace has nothing to disambiguate.
	WorkspaceSlug string `json:"workspace_slug,omitempty"`
	WorkspaceName string `json:"workspace_name,omitempty"`

	LatestReview *PullRequestReview `json:"latest_review,omitempty"`
}

// PullRequestReview is one review run as the console shows it. Stale means the
// PR head moved after the reviewed SHA; Findings is the number of inline
// comments GitHub accepted.
type PullRequestReview struct {
	ID        uuid.UUID `json:"id"`
	Status    string    `json:"status"` // queued | running | completed | failed | cancelled
	AgentName string    `json:"agent_name"`
	HeadSHA   string    `json:"head_sha"`
	Summary   string    `json:"summary"`
	Findings  int32     `json:"findings"`
	URL       string    `json:"url"`
	Stale     bool      `json:"stale"`
	Tokens    int64     `json:"tokens"`
	CreatedAt time.Time `json:"created_at"`
}
