// Package execenv prepares an isolated per-task execution environment: it
// writes the managed brief into the provider's native runtime config file
// (CLAUDE.md / AGENTS.md), the issue context, and the agent's skills into
// provider-native locations, so the coding CLI discovers them relative to its
// working directory.
package execenv

import (
	"fmt"
	"os"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// Env is the prepared per-task execution environment.
type Env struct {
	// Root is the per-task isolation root. For the local MVP this equals
	// WorkDir; a cloud shell (chapter 8) may use a separate root for
	// logs/output while keeping the repo checkout elsewhere.
	Root string
	// WorkDir is where the coder runs (the repo checkout directory).
	WorkDir string
}

// PrepareParams holds the inputs for preparing a task execution environment.
type PrepareParams struct {
	WorkspaceID string
	TaskID      string
	AgentName   string
	Provider    string // claude | codex
	Issue       v1.TaskIssueContext
	Agent       v1.TaskAgentContext
}

// Prepare writes the task context files (managed brief, issue context,
// skills) into workDir and returns the prepared environment.
func Prepare(workDir string, p PrepareParams) (*Env, error) {
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return nil, fmt.Errorf("create workdir: %w", err)
	}
	if err := writeRuntimeConfig(workDir, p); err != nil {
		return nil, err
	}
	if err := writeContextFiles(workDir, p); err != nil {
		return nil, err
	}
	return &Env{Root: workDir, WorkDir: workDir}, nil
}
