package v1

import (
	"time"

	"github.com/google/uuid"
)

// Workspace is a workspace as the console sees it: the row, the repository it
// is bound to, and the latest commit on that repository.
//
// It is deliberately narrower than the workspaces table. The installation and
// repo ids, the owning user, and the issue numbering columns are the server's
// business — a client has no use for them, and serving them invites clients to
// depend on internals. Widening this struct is a contract change.
type Workspace struct {
	ID        uuid.UUID `json:"id"`
	Slug      string    `json:"slug"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	AvatarURL string    `json:"avatar_url"`
	CreatedAt time.Time `json:"created_at"`

	RepoFullName string `json:"repo_full_name"`
	RepoOwner    string `json:"repo_owner"`
	RepoName     string `json:"repo_name"`
	RepoPrivate  bool   `json:"repo_private"`

	// The commit fields are best-effort and are empty when the GitHub lookup
	// fails, when the app is not configured, or when the repo has no commits.
	LastCommitMessage string `json:"last_commit_message"`
	LastCommitAuthor  string `json:"last_commit_author"`
	LastCommitAt      string `json:"last_commit_at"`
}

// Member is a person an issue in this workspace can be assigned to. A workspace
// belongs to exactly one user today, so the roster holds one row; the endpoint
// exists so that collaboration changes here rather than in every caller.
type Member struct {
	ID        uuid.UUID `json:"id"`
	Login     string    `json:"login"`
	AvatarURL string    `json:"avatar_url"`
}
