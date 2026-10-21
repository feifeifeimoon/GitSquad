package runner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/execenv"
	"github.com/feifeifeimoon/GitSquad/internal/daemon/provider"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// runReview executes a review task. It is deliberately separate from the issue
// path: no branch is created, nothing is committed or pushed, and the provider
// never receives the installation token.
func (r *Runner) runReview(ctx context.Context, task v1.Task) error {
	if task.PullRequest == nil {
		return r.fail(ctx, task, nil, "", errors.New("review task has no pull request context"))
	}
	wsDir := filepath.Join(r.workRoot, "workspaces", task.WorkspaceID.String())
	if err := r.reporter.Report(ctx, task.ID, v1.TaskReport{Status: v1.TaskReportStarted}); err != nil {
		return fmt.Errorf("report started: %w", err)
	}

	cred := Credential{Token: task.InstallationToken}
	if err := r.git.CloneOrFetch(ctx, wsDir, GitHubCloneURL(task.Repo.Owner, task.Repo.Name), cred); err != nil {
		return r.fail(ctx, task, nil, "", fmt.Errorf("checkout: %w", err))
	}
	sha, err := r.checkoutPullRequest(ctx, wsDir, task.PullRequest, cred)
	if err != nil {
		return r.fail(ctx, task, nil, "", err)
	}

	cleanup, err := neutralizeRepoInstructions(wsDir)
	if err != nil {
		return r.fail(ctx, task, nil, "", fmt.Errorf("neutralize repository instructions: %w", err))
	}
	defer cleanup()
	if _, err := execenv.PrepareReview(wsDir, task); err != nil {
		return r.fail(ctx, task, nil, "", fmt.Errorf("prepare review env: %w", err))
	}

	// No cred.Env(): the provider can read the checkout, but it has no App token
	// to push with and no reason to receive one.
	sess, err := r.backend.Execute(ctx, triggerPrompt(task), provider.ExecOptions{
		Cwd: wsDir, Model: task.Agent.Model, Timeout: r.timeout,
	})
	if err != nil {
		return r.fail(ctx, task, nil, "", fmt.Errorf("execute reviewer: %w", err))
	}
	for message := range sess.Messages {
		_ = r.reporter.Report(ctx, task.ID, v1.TaskReport{
			Status: v1.TaskReportRunning, Progress: progressFromMessage(message),
		})
	}
	res := <-sess.Result
	usage := taskUsage(r.backend.Kind(), res.Usage)
	if res.Status != "completed" {
		errMsg := res.Error
		if errMsg == "" {
			errMsg = res.Status
		}
		return r.fail(ctx, task, usage, res.Output, fmt.Errorf("provider %s: %s", res.Status, errMsg))
	}

	review, summary := readReviewResult(wsDir, res.Output)
	if review != nil {
		review.HeadSHA = sha
	}
	defaultBranch := task.Repo.DefaultBranch
	if defaultBranch == "" {
		defaultBranch, _ = r.git.DefaultBranch(ctx, wsDir)
	}
	// Restores tracked CLAUDE.md/AGENTS.md the neutralization moved aside and
	// discards anything the reviewer wrote into the worktree.
	_ = r.git.ResetToDefault(ctx, wsDir, defaultBranch)

	return r.reporter.Report(ctx, task.ID, v1.TaskReport{
		Status: v1.TaskReportSucceeded,
		Summary: &v1.TaskSummary{
			Output: summary, Review: review, CommitSHA: sha,
		},
		Usage: usage,
	})
}

// checkoutPullRequest fetches the base first and the PR head last. git fetch
// writes FETCH_HEAD, so checking out FETCH_HEAD after the base fetch would
// detach to the base branch tip and review the unchanged code instead of the
// pull request.
func (r *Runner) checkoutPullRequest(ctx context.Context, dir string, pr *v1.TaskPullRequestContext, cred Credential) (string, error) {
	if err := r.git.FetchBranch(ctx, dir, pr.BaseBranch, cred); err != nil {
		return "", fmt.Errorf("fetch base branch: %w", err)
	}
	if err := r.git.FetchPullRequest(ctx, dir, pr.Number, cred); err != nil {
		return "", fmt.Errorf("fetch pull request: %w", err)
	}
	if err := r.git.CheckoutDetached(ctx, dir, "FETCH_HEAD"); err != nil {
		return "", fmt.Errorf("checkout pull request: %w", err)
	}
	sha, err := r.git.HeadSHA(ctx, dir)
	if err != nil {
		return "", fmt.Errorf("read pull request sha: %w", err)
	}
	return sha, nil
}

// neutralizeRepoInstructions moves every repository-owned agent instruction
// file/directory out of the checkout before the provider starts. A PR can add a
// CLAUDE.md, AGENTS.md, .claude/settings.json hook, or .agents/ directory; all
// of them are prompt-injection channels, and a reviewer never needs them.
func neutralizeRepoInstructions(workDir string) (func(), error) {
	tmp, err := os.MkdirTemp("", "gitsquad-review-*")
	if err != nil {
		return nil, err
	}
	index := 0
	err = filepath.WalkDir(workDir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if entry.IsDir() && entry.Name() == ".git" {
			return fs.SkipDir
		}
		if entry.IsDir() {
			if entry.Name() != ".claude" && entry.Name() != ".agents" {
				return nil
			}
			if _, err := moveAside(tmp, workDir, path, index); err != nil {
				return err
			}
			index++
			return fs.SkipDir
		}
		if entry.Name() != "CLAUDE.md" && entry.Name() != "AGENTS.md" {
			return nil
		}
		if _, err := moveAside(tmp, workDir, path, index); err != nil {
			return err
		}
		index++
		return nil
	})
	if err != nil {
		_ = os.RemoveAll(tmp)
		return nil, err
	}
	return func() { _ = os.RemoveAll(tmp) }, nil
}

func moveAside(tmp, workDir, path string, index int) (string, error) {
	rel, err := filepath.Rel(workDir, path)
	if err != nil {
		return "", err
	}
	name := fmt.Sprintf("%d-%s", index, strings.ReplaceAll(rel, string(os.PathSeparator), "_"))
	to := filepath.Join(tmp, name)
	if err := os.Rename(path, to); err != nil {
		return "", err
	}
	return to, nil
}

// readReviewResult reads .gitsquad/review.json, tolerating the code fence a
// model often wraps a JSON file in. A missing or malformed file degrades to the
// provider's plain-text summary rather than failing the task.
func readReviewResult(workDir, fallback string) (*v1.ReviewResult, string) {
	data, err := os.ReadFile(filepath.Join(workDir, ".gitsquad", "review.json"))
	if err != nil || len(data) > 256*1024 {
		return nil, strings.TrimSpace(fallback)
	}
	var review v1.ReviewResult
	if err := json.Unmarshal([]byte(stripCodeFence(string(data))), &review); err != nil {
		return nil, strings.TrimSpace(fallback)
	}
	if review.Summary == "" {
		review.Summary = strings.TrimSpace(fallback)
	}
	if len(review.Comments) > 30 {
		review.Comments = review.Comments[:30]
	}
	filtered := review.Comments[:0]
	for _, comment := range review.Comments {
		if comment.Path != "" && comment.Line > 0 && comment.Body != "" {
			filtered = append(filtered, comment)
		}
	}
	review.Comments = filtered
	return &review, review.Summary
}

func stripCodeFence(s string) string {
	s = strings.TrimSpace(strings.TrimPrefix(s, "\ufeff"))
	if strings.HasPrefix(s, "```") {
		if i := strings.IndexByte(s, '\n'); i >= 0 {
			s = s[i+1:]
		}
		s = strings.TrimSpace(s)
		s = strings.TrimSuffix(s, "```")
	}
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "{") {
		return s
	}
	if start := strings.Index(s, "{"); start >= 0 {
		if end := strings.LastIndex(s, "}"); end > start {
			return s[start : end+1]
		}
	}
	return s
}
