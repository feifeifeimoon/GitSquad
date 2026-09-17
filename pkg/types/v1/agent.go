package v1

import (
	"time"

	"github.com/google/uuid"
)

// AgentRuntime is a workspace-scoped execution target backed by a user's
// daemon (local) or, later, a cloud sandbox.
type AgentRuntime struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	DaemonID    *uuid.UUID `json:"daemon_id,omitempty"`
	Name        string     `json:"name"`
	RuntimeMode string     `json:"runtime_mode"`
	Provider    string     `json:"provider"`
	DaemonName  string     `json:"daemon_name,omitempty"`
	// DaemonStatus is the backing machine's liveness, already resolved against
	// its last heartbeat by the server. Clients render it, they do not decide
	// it.
	DaemonStatus string    `json:"daemon_status,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Agent is a configured worker persona bound to a runtime.
type Agent struct {
	ID           uuid.UUID `json:"id"`
	WorkspaceID  uuid.UUID `json:"workspace_id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	Instructions string    `json:"instructions"`
	Model        string    `json:"model"`
	RuntimeID    uuid.UUID `json:"runtime_id"`
	Enabled      bool      `json:"enabled"`
	AvatarURL    string    `json:"avatar_url,omitempty"`
	// Live workload, derived from the task queue rather than stored on the
	// agent. RunningCount covers dispatched + running tasks; TotalRuns counts
	// the terminal ones, which is what "N runs" in the UI means.
	RunningCount int               `json:"running_count"`
	QueuedCount  int               `json:"queued_count"`
	TotalRuns    int               `json:"total_runs"`
	CurrentTask  *AgentCurrentTask `json:"current_task,omitempty"`
	Skills       []Skill           `json:"skills,omitempty"`
	Runtime      *AgentRuntime     `json:"runtime,omitempty"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`
}

// AgentCurrentTask names the issue an agent is working on right now. Nil when
// the agent has nothing in flight.
type AgentCurrentTask struct {
	IssueKey   string `json:"issue_key"`
	IssueTitle string `json:"issue_title"`
}

type CreateAgentRequest struct {
	Name         string   `json:"name" binding:"required"`
	Description  string   `json:"description"`
	Instructions string   `json:"instructions"`
	Model        string   `json:"model"`
	DaemonID     string   `json:"daemon_id" binding:"required"`
	Provider     string   `json:"provider" binding:"required"`
	AvatarURL    string   `json:"avatar_url"`
	SkillIDs     []string `json:"skill_ids"`
	Enabled      *bool    `json:"enabled"`
}

type UpdateAgentRequest struct {
	Name         *string  `json:"name"`
	Description  *string  `json:"description"`
	Instructions *string  `json:"instructions"`
	Model        *string  `json:"model"`
	DaemonID     *string  `json:"daemon_id"`
	Provider     *string  `json:"provider"`
	AvatarURL    *string  `json:"avatar_url"`
	SkillIDs     []string `json:"skill_ids"`
	Enabled      *bool    `json:"enabled"`
}

// Skill is a workspace-scoped reusable instruction document.
type Skill struct {
	ID          uuid.UUID `json:"id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Content     string    `json:"content"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateSkillRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	Content     string `json:"content"`
}

type UpdateSkillRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Content     *string `json:"content"`
}

// Model is a single LLM model a provider exposes.
type Model struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Provider string `json:"provider,omitempty"`
	Default  bool   `json:"default,omitempty"`
}
