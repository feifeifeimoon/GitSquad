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
	// already a checkout.
	CloneOrFetch(ctx context.Context, dst, remoteURL string) error
	// ResetToDefault puts a reused checkout back on the default branch at
	// origin's tip, discarding whatever a previous task left behind.
	ResetToDefault(ctx context.Context, dst, defaultBranch string) error
	// CreateBranch creates branch from the current HEAD. It is only called once
	// the task has changes worth pushing.
	CreateBranch(ctx context.Context, dst, branch string) error
	Commit(ctx context.Context, dst, message string) error
	Push(ctx context.Context, dst, branch string) error
	// Diff returns the unified diff of base...HEAD.
	Diff(ctx context.Context, dst, base string) (string, error)
}

// GitHubCloneURL builds the authenticated HTTPS clone URL for a repo.
func GitHubCloneURL(owner, name, token string) string {
	return fmt.Sprintf("https://x-access-token:%s@github.com/%s/%s.git", token, owner, name)
}

// GitCLI implements GitOps by shelling out to `git`.
type GitCLI struct {
	// Exec runs a git command; overridable in tests. Defaults to gitExec.
	Exec func(ctx context.Context, dir string, args ...string) (string, error)
}

// NewGitCLI returns a GitCLI backed by the system `git` binary.
func NewGitCLI() *GitCLI {
	return &GitCLI{Exec: gitExec}
}

func gitExec(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(errBuf.String()))
	}
	return out.String(), nil
}

func (g *GitCLI) CloneOrFetch(ctx context.Context, dst, remoteURL string) error {
	if isGitRepo(dst) {
		_, err := g.Exec(ctx, dst, "fetch", "--prune", "origin")
		return err
	}
	if _, err := g.Exec(ctx, ".", "clone", remoteURL, dst); err != nil {
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

// ResetToDefault returns a reused checkout to a clean default branch. It is
// what makes an analysis/design task leave no branch (and no leftovers) behind.
func (g *GitCLI) ResetToDefault(ctx context.Context, dst, defaultBranch string) error {
	if _, err := g.Exec(ctx, dst, "checkout", defaultBranch); err != nil {
		return err
	}
	if _, err := g.Exec(ctx, dst, "reset", "--hard", "origin/"+defaultBranch); err != nil {
		return err
	}
	_, err := g.Exec(ctx, dst, "clean", "-fd")
	return err
}

func (g *GitCLI) CreateBranch(ctx context.Context, dst, branch string) error {
	_, err := g.Exec(ctx, dst, "checkout", "-b", branch)
	return err
}

func (g *GitCLI) Commit(ctx context.Context, dst, message string) error {
	if _, err := g.Exec(ctx, dst, "add", "-A"); err != nil {
		return err
	}
	// Use a stable bot identity so commits are attributable regardless of the
	// machine's git config.
	_, err := g.Exec(ctx, dst,
		"-c", "user.name=gitsquad[bot]",
		"-c", "user.email=gitsquad[bot]@users.noreply.github.com",
		"commit", "-m", message)
	return err
}

func (g *GitCLI) Push(ctx context.Context, dst, branch string) error {
	_, err := g.Exec(ctx, dst, "push", "-u", "origin", branch)
	return err
}

func (g *GitCLI) Diff(ctx context.Context, dst, base string) (string, error) {
	return g.Exec(ctx, dst, "diff", base+"...HEAD")
}

// isGitRepo reports whether dir is a git working tree (contains a .git).
func isGitRepo(dir string) bool {
	info, err := os.Stat(dir + string(os.PathSeparator) + ".git")
	return err == nil && info.IsDir()
}
