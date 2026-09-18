package runner

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// GitOps abstracts the git operations the Runner needs. It exists so the
// Runner can be tested with a fake; GitCLI is the real `git` implementation.
type GitOps interface {
	// CloneOrFetch clones remoteURL into dst, or fetches origin if dst is
	// already a checkout. cred authorises the network operation.
	CloneOrFetch(ctx context.Context, dst, remoteURL string, cred Credential) error
	// DefaultBranch resolves the remote's default branch from origin/HEAD.
	DefaultBranch(ctx context.Context, dst string) (string, error)
	// HasBranch reports whether origin/<branch> exists in the checkout.
	HasBranch(ctx context.Context, dst, branch string) error
	// ResetToDefault puts a reused checkout back on the default branch at
	// origin's tip, discarding whatever a previous task left behind.
	ResetToDefault(ctx context.Context, dst, defaultBranch string) error
	// CreateBranch creates or resets branch at the current HEAD. It runs before
	// the agent starts, so a commit the agent makes on its own lands on the
	// task's branch instead of the default branch.
	CreateBranch(ctx context.Context, dst, branch string) error
	// HasChanges reports whether the worktree differs from base — uncommitted
	// edits, or commits stacked on top of it.
	HasChanges(ctx context.Context, dst, base string) (bool, error)
	// Commit stages and commits the worktree, and is a no-op when the agent
	// already committed everything.
	Commit(ctx context.Context, dst, message string) error
	Push(ctx context.Context, dst, branch string, cred Credential) error
	// DiscardBranch returns to fallback and deletes a branch that produced
	// nothing, so a reused checkout does not accumulate empty branches.
	DiscardBranch(ctx context.Context, dst, branch, fallback string) error
	// Diff returns the unified diff of base...HEAD.
	Diff(ctx context.Context, dst, base string) (string, error)
}

// GitHubCloneURL builds the unauthenticated HTTPS clone URL for a repo.
// Credentials travel in the process environment instead — see Credential.Env.
func GitHubCloneURL(owner, name string) string {
	return fmt.Sprintf("https://github.com/%s/%s.git", owner, name)
}

// GitCLI implements GitOps by shelling out to `git`.
type GitCLI struct {
	// Exec runs a git command; overridable in tests. Defaults to gitExec.
	Exec func(ctx context.Context, dir string, env []string, args ...string) (string, error)
}

// NewGitCLI returns a GitCLI backed by the system `git` binary.
func NewGitCLI() *GitCLI {
	return &GitCLI{Exec: gitExec}
}

func gitExec(ctx context.Context, dir string, env []string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	if len(env) > 0 {
		cmd.Env = append(os.Environ(), env...)
	}
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %s: %w: %s",
			strings.Join(args, " "), err, redactURLCredentials(strings.TrimSpace(errBuf.String())))
	}
	return out.String(), nil
}

func (g *GitCLI) CloneOrFetch(ctx context.Context, dst, remoteURL string, cred Credential) error {
	if isGitRepo(dst) {
		_, err := g.Exec(ctx, dst, cred.Env(), "fetch", "--prune", "origin")
		return err
	}
	if _, err := g.Exec(ctx, ".", cred.Env(), "clone", remoteURL, dst); err != nil {
		return err
	}
	return writeGitExcludes(dst)
}

// platformExcludes are paths the daemon writes into the workdir for the agent.
// Excluding them via .git/info/exclude keeps them out of the agent's diff and
// commit — and because `git clean -fd` spares ignored files, a reused checkout
// keeps them until the next Prepare rewrites them.
var platformExcludes = []string{"CLAUDE.md", "AGENTS.md", ".gitsquad/", ".claude/", ".agents/"}

func writeGitExcludes(dst string) error {
	path := filepath.Join(dst, ".git", "info", "exclude")
	existing, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return err
	}

	var b strings.Builder
	b.Write(existing)
	for _, p := range platformExcludes {
		if !strings.Contains(string(existing), p) {
			b.WriteString("\n" + p)
		}
	}
	return os.WriteFile(path, []byte(b.String()), 0o644)
}

// DefaultBranch resolves the remote's default branch via origin/HEAD, which a
// clone sets from the remote and a fetch leaves alone. It is the checkout's own
// answer, used when the branch the server sent turns out not to exist.
func (g *GitCLI) DefaultBranch(ctx context.Context, dst string) (string, error) {
	out, err := g.Exec(ctx, dst, nil, "symbolic-ref", "--short", "refs/remotes/origin/HEAD")
	if err != nil {
		return "", err
	}
	return strings.TrimPrefix(strings.TrimSpace(out), "origin/"), nil
}

// HasBranch reports whether origin/<branch> exists in the checkout.
func (g *GitCLI) HasBranch(ctx context.Context, dst, branch string) error {
	_, err := g.Exec(ctx, dst, nil, "rev-parse", "--verify", "--quiet", "refs/remotes/origin/"+branch)
	return err
}

// ResetToDefault returns a reused checkout to a clean default branch. It is
// what makes an analysis/design task leave no branch (and no leftovers) behind.
func (g *GitCLI) ResetToDefault(ctx context.Context, dst, defaultBranch string) error {
	if _, err := g.Exec(ctx, dst, nil, "checkout", defaultBranch); err != nil {
		return err
	}
	if _, err := g.Exec(ctx, dst, nil, "reset", "--hard", "origin/"+defaultBranch); err != nil {
		return err
	}
	_, err := g.Exec(ctx, dst, nil, "clean", "-fd")
	return err
}

// CreateBranch creates or resets branch at the current HEAD. -B makes a re-run
// of the same task idempotent instead of failing on the existing branch.
func (g *GitCLI) CreateBranch(ctx context.Context, dst, branch string) error {
	_, err := g.Exec(ctx, dst, nil, "checkout", "-B", branch)
	return err
}

// HasChanges reports whether the worktree differs from base: uncommitted edits,
// or commits stacked on top of it.
//
// A three-dot diff cannot answer this. It compares commits only, so an agent
// that left its work in the working tree — which is exactly what it is told to
// do — looks like it changed nothing, and the work is silently dropped.
func (g *GitCLI) HasChanges(ctx context.Context, dst, base string) (bool, error) {
	status, err := g.Exec(ctx, dst, nil, "status", "--porcelain")
	if err != nil {
		return false, err
	}
	if strings.TrimSpace(status) != "" {
		return true, nil
	}
	ahead, err := g.Exec(ctx, dst, nil, "rev-list", "--count", base+"..HEAD")
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(ahead) != "0", nil
}

// Commit stages and commits the worktree. It is a no-op when the agent already
// committed everything, which is what makes the platform owning the commit step
// independent of what the agent chose to do.
func (g *GitCLI) Commit(ctx context.Context, dst, message string) error {
	status, err := g.Exec(ctx, dst, nil, "status", "--porcelain")
	if err != nil {
		return err
	}
	if strings.TrimSpace(status) == "" {
		return nil
	}
	if _, err := g.Exec(ctx, dst, nil, "add", "-A"); err != nil {
		return err
	}
	// Use a stable bot identity so commits are attributable regardless of the
	// machine's git config.
	_, err = g.Exec(ctx, dst, nil,
		"-c", "user.name=gitsquad[bot]",
		"-c", "user.email=gitsquad[bot]@users.noreply.github.com",
		"commit", "-m", message)
	return err
}

// DiscardBranch returns to fallback and deletes a branch that produced nothing.
func (g *GitCLI) DiscardBranch(ctx context.Context, dst, branch, fallback string) error {
	if _, err := g.Exec(ctx, dst, nil, "checkout", fallback); err != nil {
		return err
	}
	_, err := g.Exec(ctx, dst, nil, "branch", "-D", branch)
	return err
}

func (g *GitCLI) Push(ctx context.Context, dst, branch string, cred Credential) error {
	_, err := g.Exec(ctx, dst, cred.Env(), "push", "-u", "origin", branch)
	return err
}

func (g *GitCLI) Diff(ctx context.Context, dst, base string) (string, error) {
	return g.Exec(ctx, dst, nil, "diff", base+"...HEAD")
}

// isGitRepo reports whether dir is a git working tree (contains a .git).
func isGitRepo(dir string) bool {
	info, err := os.Stat(dir + string(os.PathSeparator) + ".git")
	return err == nil && info.IsDir()
}
