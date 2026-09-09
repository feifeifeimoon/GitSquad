package v1

import (
	"time"

	"github.com/google/uuid"
)

// Task is the full task payload handed to the Runtime when a daemon claims a
// pending task. The installation token is minted at claim time and never
// persisted — the queued record holds the same data minus that field.
type Task struct {
	ID          uuid.UUID `json:"id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`

	Issue TaskIssueContext `json:"issue"`
	Repo  TaskRepoContext  `json:"repo"`
	Agent TaskAgentContext `json:"agent"`

	// InstallationToken authenticates git clone/push as the GitHub App for the
	// workspace's installation. Short-lived; must not be logged or stored.
	InstallationToken string `json:"installation_token"`
}

// TaskIssueContext is the issue snapshot the Runtime renders into the
// execution environment.
type TaskIssueContext struct {
	ID          uuid.UUID     `json:"id"`
	Key         string        `json:"key"` // e.g. "GTS-42"
	Title       string        `json:"title"`
	Description string        `json:"description"`
	Comments    []TaskComment `json:"comments"`
}

// TaskComment is one comment from the issue snapshot.
type TaskComment struct {
	AuthorName string    `json:"author_name"`
	Type       string    `json:"type"` // comment | status_change | system
	Content    string    `json:"content"`
	CreatedAt  time.Time `json:"created_at"`
}

// TaskRepoContext identifies the repository to check out.
type TaskRepoContext struct {
	Owner         string `json:"owner"`
	Name          string `json:"name"`
	DefaultBranch string `json:"default_branch"`
}

// TaskAgentContext is the agent persona + runtime binding snapshot.
type TaskAgentContext struct {
	Name         string      `json:"name"`
	Instructions string      `json:"instructions"`
	Model        string      `json:"model,omitempty"` // empty = provider default
	Provider     string      `json:"provider"`        // claude | codex
	Skills       []TaskSkill `json:"skills,omitempty"`
}

// TaskSkill is a skill injected into the execution environment.
type TaskSkill struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Content     string `json:"content"`
}

// Task lifecycle status values. The full state machine is owned by task
// dispatch (chapter 9); the daemon only reports progress and terminal state
// via TaskReport.
const (
	TaskStatusQueued    = "queued"
	TaskStatusClaimed   = "claimed"
	TaskStatusRunning   = "running"
	TaskStatusSucceeded = "succeeded"
	TaskStatusFailed    = "failed"
)

// TaskReportStatus are the lifecycle events a daemon reports for a task.
const (
	TaskReportStarted   = "started"
	TaskReportRunning   = "running" // progress event while the agent works
	TaskReportSucceeded = "succeeded"
	TaskReportFailed    = "failed"
)

// TaskReport is the body for POST /api/v1/daemon/tasks/:id/status.
type TaskReport struct {
	Status string `json:"status"` // started | running | succeeded | failed
	// Progress carries one streamed agent event; terminal reports may omit it.
	Progress *TaskProgress `json:"progress,omitempty"`
	// Summary is set on the terminal succeeded/failed report.
	Summary *TaskSummary `json:"summary,omitempty"`
	Error   string       `json:"error,omitempty"`
}

// TaskProgress is one streamed agent event forwarded to the server during
// execution. It mirrors the provider Message event model on the wire.
type TaskProgress struct {
	Type    string `json:"type"` // text | thinking | tool_use | tool_result | status | error
	Content string `json:"content,omitempty"`
	Tool    string `json:"tool,omitempty"`
}

// TaskSummary summarizes the artifacts on task completion.
type TaskSummary struct {
	Branch      string `json:"branch,omitempty"`
	CommitSHA   string `json:"commit_sha,omitempty"`
	DiffStat    string `json:"diff_stat,omitempty"`
	TestResults string `json:"test_results,omitempty"`
}
