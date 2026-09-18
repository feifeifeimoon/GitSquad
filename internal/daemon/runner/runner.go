package runner

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"
	"sort"
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

	remoteURL := GitHubCloneURL(task.Repo.Owner, task.Repo.Name)
	cred := Credential{Token: task.InstallationToken}
	if err := r.git.CloneOrFetch(ctx, wsDir, remoteURL, cred); err != nil {
		return r.fail(ctx, task, nil, fmt.Errorf("checkout: %w", err))
	}
	defaultBranch, err := r.resolveDefaultBranch(ctx, wsDir, task.Repo.DefaultBranch)
	if err != nil {
		return r.fail(ctx, task, nil, fmt.Errorf("resolve default branch: %w", err))
	}

	// A task either continues the issue's live line of work or starts a new one.
	// Continuing starts from the PR's branch at its remote tip, so the agent
	// sees the work already on it; the platform then only pushes, because the PR
	// already exists. Starting fresh puts the branch in place before the agent
	// runs, so a commit the agent makes on its own — which the previous brief
	// asked for — lands here rather than on the default branch.
	continued := task.Repo.Branch != ""
	changeBase := "origin/" + defaultBranch
	if continued {
		branch = task.Repo.Branch
		if err := r.git.ResetToBranch(ctx, wsDir, branch); err != nil {
			return r.fail(ctx, task, nil, fmt.Errorf("checkout branch %s: %w", branch, err))
		}
		// Changes are measured against the branch the PR is on: its commits are
		// already the issue's work, so only what this run adds counts.
		changeBase = "origin/" + branch
	} else {
		if err := r.git.ResetToDefault(ctx, wsDir, defaultBranch); err != nil {
			return r.fail(ctx, task, nil, fmt.Errorf("reset checkout: %w", err))
		}
		if err := r.git.CreateBranch(ctx, wsDir, branch); err != nil {
			return r.fail(ctx, task, nil, fmt.Errorf("create branch: %w", err))
		}
	}

	if _, err := execenv.Prepare(wsDir, execenv.PrepareParams{
		WorkspaceID: task.WorkspaceID.String(),
		TaskID:      task.ID.String(),
		AgentName:   task.Agent.Name,
		Provider:    task.Agent.Provider,
		Branch:      branch,
		Issue:       task.Issue,
		Agent:       task.Agent,
	}); err != nil {
		return r.fail(ctx, task, nil, fmt.Errorf("prepare env: %w", err))
	}

	// The provider gets the same credential: agents routinely run read-only git
	// commands (git log origin/main, git diff) and those would fail without it.
	sess, err := r.backend.Execute(ctx, triggerPrompt(task), provider.ExecOptions{
		Cwd:     wsDir,
		Model:   task.Agent.Model,
		Timeout: r.timeout,
		Env:     cred.Env(),
	})
	if err != nil {
		return r.fail(ctx, task, nil, fmt.Errorf("execute: %w", err))
	}

	for m := range sess.Messages {
		_ = r.reporter.Report(ctx, task.ID, v1.TaskReport{
			Status:   v1.TaskReportRunning,
			Progress: progressFromMessage(m),
		})
	}
	res := <-sess.Result

	// Collected before the status check so a run that timed out or aborted still
	// reports what it burned — the provider accumulates usage as turns stream in
	// precisely so the tokens are not lost with the process.
	usage := taskUsage(r.backend.Kind(), res.Usage)

	if res.Status != "completed" {
		errMsg := res.Error
		if errMsg == "" {
			errMsg = res.Status
		}
		return r.fail(ctx, task, usage, fmt.Errorf("provider %s: %s", res.Status, errMsg))
	}

	changed, err := r.git.HasChanges(ctx, wsDir, changeBase)
	if err != nil {
		return r.fail(ctx, task, usage, fmt.Errorf("check changes: %w", err))
	}

	// No code change is a normal outcome (analysis / design / review work), not
	// a failure — the agent's output is the deliverable either way.
	if !changed {
		// Only a branch this task created is dropped. A continued line belongs
		// to an existing pull request; deleting its local copy would be churn on
		// a branch the issue still tracks.
		if !continued {
			if err := r.git.DiscardBranch(ctx, wsDir, branch, defaultBranch); err != nil {
				// The next task resets the checkout anyway, so a leftover branch
				// is not worth failing an otherwise successful run over.
				slog.Warn("discard empty branch", "branch", branch, "error", err)
			}
		}
		return r.reporter.Report(ctx, task.ID, v1.TaskReport{
			Status:  v1.TaskReportSucceeded,
			Summary: &v1.TaskSummary{Output: res.Output},
			Usage:   usage,
		})
	}

	if err := r.git.Commit(ctx, wsDir, commitMessage(task)); err != nil {
		return r.fail(ctx, task, usage, fmt.Errorf("commit: %w", err))
	}
	// Diff after the commit so work the agent left uncommitted is included.
	diff, err := r.git.Diff(ctx, wsDir, "origin/"+defaultBranch)
	if err != nil {
		return r.fail(ctx, task, usage, fmt.Errorf("diff: %w", err))
	}
	if err := r.git.Push(ctx, wsDir, branch, cred); err != nil {
		return r.fail(ctx, task, usage, fmt.Errorf("push: %w", err))
	}

	return r.reporter.Report(ctx, task.ID, v1.TaskReport{
		Status: v1.TaskReportSucceeded,
		Summary: &v1.TaskSummary{
			Output:     res.Output,
			Branch:     branch,
			BaseBranch: defaultBranch,
			DiffStat:   diffStat(diff),
		},
		Usage: usage,
	})
}

// resolveDefaultBranch prefers the branch the server sent and falls back to the
// checkout's own origin/HEAD when that branch does not exist. The server's value
// is a snapshot taken during repo sync, so a repository that renamed its default
// branch would otherwise fail every task at checkout.
func (r *Runner) resolveDefaultBranch(ctx context.Context, dir, want string) (string, error) {
	got, gotErr := r.git.DefaultBranch(ctx, dir)
	if want == "" {
		if gotErr != nil {
			return "", gotErr
		}
		return got, nil
	}
	if err := r.git.HasBranch(ctx, dir, want); err == nil {
		return want, nil
	}
	if gotErr != nil || got == "" {
		// Neither branch resolves: keep the server's value so the checkout
		// failure names the branch the server believed in.
		return want, nil
	}
	slog.Warn("default branch from the task does not exist, using origin/HEAD", "task_branch", want, "resolved", got)
	return got, nil
}

// fail reports a failed terminal state and returns the error. usage is nil for
// failures that happened before the agent ever ran.
func (r *Runner) fail(ctx context.Context, task v1.Task, usage []v1.TaskUsage, err error) error {
	_ = r.reporter.Report(ctx, task.ID, v1.TaskReport{
		Status: v1.TaskReportFailed,
		Error:  err.Error(),
		Usage:  usage,
	})
	return err
}

// taskUsage converts the provider's per-model accumulation into wire entries.
// providerKind is the backend's own kind, so an agent configured for one
// provider while the daemon runs another still reports what actually ran.
// Sorted by model because Go map iteration is random and the order ends up in
// the database and in test expectations.
func taskUsage(providerKind string, byModel map[string]provider.TokenUsage) []v1.TaskUsage {
	if len(byModel) == 0 {
		return nil
	}
	out := make([]v1.TaskUsage, 0, len(byModel))
	for model, u := range byModel {
		if u.IsZero() {
			continue
		}
		out = append(out, v1.TaskUsage{
			Provider:         providerKind,
			Model:            model,
			InputTokens:      u.InputTokens,
			OutputTokens:     u.OutputTokens,
			CacheReadTokens:  u.CacheReadTokens,
			CacheWriteTokens: u.CacheWriteTokens,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Model < out[j].Model })
	if len(out) == 0 {
		return nil
	}
	return out
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
	return &v1.TaskProgress{Type: string(m.Type), Content: m.Content, Tool: m.Tool, Input: m.Input, Output: m.Output}
}

func diffStat(diff string) string {
	const max = 2000
	if len(diff) > max {
		return diff[:max] + "\n…"
	}
	return diff
}
