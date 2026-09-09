package runner

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/execenv"
	"github.com/feifeifeimoon/GitSquad/internal/daemon/provider"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// Runner executes a single task: checkout, prepare the execution environment,
// drive the coding provider, collect artifacts, commit/push, and report
// progress + terminal state back to the SaaS.
type Runner struct {
	git      GitOps
	backend  provider.Backend
	reporter Reporter
	workRoot string
	timeout  time.Duration
}

// New returns a Runner. workRoot is the base directory for per-workspace
// checkouts.
func New(git GitOps, backend provider.Backend, reporter Reporter, workRoot string) *Runner {
	return &Runner{
		git:      git,
		backend:  backend,
		reporter: reporter,
		workRoot: workRoot,
		timeout:  30 * time.Minute,
	}
}

// Run executes task to completion. It reports a terminal succeeded/failed
// event to the SaaS before returning; the returned error mirrors the failure.
func (r *Runner) Run(ctx context.Context, task v1.Task) error {
	wsDir := filepath.Join(r.workRoot, "workspaces", task.WorkspaceID.String())
	branch := taskBranch(task)

	if err := r.reporter.Report(ctx, task.ID, v1.TaskReport{Status: v1.TaskReportStarted}); err != nil {
		return fmt.Errorf("report started: %w", err)
	}

	remoteURL := GitHubCloneURL(task.Repo.Owner, task.Repo.Name, task.InstallationToken)
	if err := r.git.CloneOrFetch(ctx, wsDir, remoteURL); err != nil {
		return r.fail(ctx, task, fmt.Errorf("checkout: %w", err))
	}
	if err := r.git.CreateBranch(ctx, wsDir, task.Repo.DefaultBranch, branch); err != nil {
		return r.fail(ctx, task, fmt.Errorf("create branch: %w", err))
	}

	if _, err := execenv.Prepare(wsDir, execenv.PrepareParams{
		WorkspaceID: task.WorkspaceID.String(),
		TaskID:      task.ID.String(),
		AgentName:   task.Agent.Name,
		Provider:    task.Agent.Provider,
		Issue:       task.Issue,
		Agent:       task.Agent,
	}); err != nil {
		return r.fail(ctx, task, fmt.Errorf("prepare env: %w", err))
	}

	sess, err := r.backend.Execute(ctx, triggerPrompt(task), provider.ExecOptions{
		Cwd:     wsDir,
		Model:   task.Agent.Model,
		Timeout: r.timeout,
	})
	if err != nil {
		return r.fail(ctx, task, fmt.Errorf("execute: %w", err))
	}

	for m := range sess.Messages {
		_ = r.reporter.Report(ctx, task.ID, v1.TaskReport{
			Status:   v1.TaskReportRunning,
			Progress: progressFromMessage(m),
		})
	}
	res := <-sess.Result

	if res.Status != "completed" {
		errMsg := res.Error
		if errMsg == "" {
			errMsg = res.Status
		}
		return r.fail(ctx, task, fmt.Errorf("provider %s: %s", res.Status, errMsg))
	}

	diff, err := r.git.Diff(ctx, wsDir, "origin/"+task.Repo.DefaultBranch)
	if err != nil {
		return r.fail(ctx, task, fmt.Errorf("diff: %w", err))
	}

	// No code change → succeed without a PR.
	if strings.TrimSpace(diff) == "" {
		return r.reporter.Report(ctx, task.ID, v1.TaskReport{
			Status:  v1.TaskReportSucceeded,
			Summary: &v1.TaskSummary{},
		})
	}

	if err := r.git.Commit(ctx, wsDir, commitMessage(task)); err != nil {
		return r.fail(ctx, task, fmt.Errorf("commit: %w", err))
	}
	if err := r.git.Push(ctx, wsDir, branch); err != nil {
		return r.fail(ctx, task, fmt.Errorf("push: %w", err))
	}

	return r.reporter.Report(ctx, task.ID, v1.TaskReport{
		Status: v1.TaskReportSucceeded,
		Summary: &v1.TaskSummary{
			Branch:   branch,
			DiffStat: diffStat(diff),
		},
	})
}

// fail reports a failed terminal state and returns the error.
func (r *Runner) fail(ctx context.Context, task v1.Task, err error) error {
	_ = r.reporter.Report(ctx, task.ID, v1.TaskReport{Status: v1.TaskReportFailed, Error: err.Error()})
	return err
}

func taskBranch(task v1.Task) string {
	key := task.Issue.Key
	if key == "" {
		key = task.Issue.ID.String()
	}
	return fmt.Sprintf("gitsquad/%s/%s", key, task.ID.String())
}

func commitMessage(task v1.Task) string {
	return fmt.Sprintf("%s: changes by %s", task.Issue.Key, task.Agent.Name)
}

// triggerPrompt is the short prompt passed to the provider; full context lives
// in the execenv files (brief + issue_context + skills).
func triggerPrompt(task v1.Task) string {
	if n := len(task.Issue.Comments); n > 0 {
		return task.Issue.Comments[n-1].Content
	}
	if task.Issue.Description != "" {
		return task.Issue.Description
	}
	return task.Issue.Title
}

func progressFromMessage(m provider.Message) *v1.TaskProgress {
	return &v1.TaskProgress{Type: string(m.Type), Content: m.Content, Tool: m.Tool}
}

func diffStat(diff string) string {
	const max = 2000
	if len(diff) > max {
		return diff[:max] + "\n…"
	}
	return diff
}
