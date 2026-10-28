package runner

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// GitOps abstracts the git operations the Runner needs. It exists so the
// Runner can be tested with a fake; GitCLI is the real `git` implementation.
type GitOps interface {
	// CloneOrFetch clones remoteURL into dst, or fetches origin if dst is
	// already a checkout. cred authorises the network operation.
	CloneOrFetch(ctx context.Context, dst, remoteURL string, cred Credential) error
	// FetchPullRequest fetches refs/pull/<number>/head into FETCH_HEAD. It works
	// for same-repo and fork PRs alike.
	FetchPullRequest(ctx context.Context, dst string, number int, cred Credential) error
	// FetchBranch fetches one base branch into origin/<branch>.
	FetchBranch(ctx context.Context, dst, branch string, cred Credential) error
	// CheckoutDetached checks out ref without creating a branch.
	CheckoutDetached(ctx context.Context, dst, ref string) error
	// HeadSHA returns the checked-out commit.
	HeadSHA(ctx context.Context, dst string) (string, error)
	// DefaultBranch resolves the remote's default branch from origin/HEAD.
	DefaultBranch(ctx context.Context, dst string) (string, error)
	// HasBranch reports whether origin/<branch> exists in the checkout.
	HasBranch(ctx context.Context, dst, branch string) error
	// ResetWorktree discards every uncommitted change so the checkout can switch
	// refs again, whatever state a previous task left it in.
	ResetWorktree(ctx context.Context, dst string) error
	// RestoreTracked puts the named paths back to their committed state, skipping
	// names the repository does not track.
	RestoreTracked(ctx context.Context, dst string, paths ...string) error
	// ResetToDefault puts a reused checkout back on the default branch at
	// origin's tip, discarding whatever a previous task left behind.
	ResetToDefault(ctx context.Context, dst, defaultBranch string) error
	// ResetToBranch checks out branch at origin's tip — the starting point for a
	// task that continues the issue's live line of work, where the branch
	// already exists and carries commits the agent must see.
	ResetToBranch(ctx context.Context, dst, branch string) error
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
	// NumStat counts base...HEAD as git does: files touched, lines added and
	// removed. Binary files count as a file and no lines.
	NumStat(ctx context.Context, dst, base string) (files, additions, deletions int, err error)
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
		if _, err := g.Exec(ctx, dst, cred.Env(), "fetch", "--prune", "origin"); err != nil {
			return err
		}
		// A checkout cloned before an exclude was added never picks it up
		// otherwise, and the platform's own context files then count as the
		// task's work.
		return writeGitExcludes(dst)
	}
	if _, err := g.Exec(ctx, ".", cred.Env(), "clone", remoteURL, dst); err != nil {
		return err
	}
	return writeGitExcludes(dst)
}

func (g *GitCLI) FetchPullRequest(ctx context.Context, dst string, number int, cred Credential) error {
	_, err := g.Exec(ctx, dst, cred.Env(), "fetch", "origin", fmt.Sprintf("pull/%d/head", number))
	return err
}

func (g *GitCLI) FetchBranch(ctx context.Context, dst, branch string, cred Credential) error {
	_, err := g.Exec(ctx, dst, cred.Env(), "fetch", "origin", branch)
	return err
}

func (g *GitCLI) CheckoutDetached(ctx context.Context, dst, ref string) error {
	_, err := g.Exec(ctx, dst, nil, "checkout", "--detach", ref)
	return err
}

func (g *GitCLI) HeadSHA(ctx context.Context, dst string) (string, error) {
	out, err := g.Exec(ctx, dst, nil, "rev-parse", "HEAD")
	return strings.TrimSpace(out), err
}

// platformExcludes are paths the daemon writes into the workdir for the agent.
// Excluding them via .git/info/exclude keeps them out of the agent's diff and
// commit — and because `git clean -fd` spares ignored files, a reused checkout
// keeps them until the next Prepare rewrites them.
var platformExcludes = []string{"CLAUDE.md", "AGENTS.md", ".gitsquad/", ".claude/", ".agents/"}

// platformPaths is platformExcludes without the platform-only .gitsquad dir and
// without the brief files: the paths a repository can track but has no reason
// to keep a changed copy of. `git clean` keeps a tracked file out of nothing —
// the exclude has no say over it — so these have to be reverted explicitly.
var platformPaths = []string{".claude", ".agents"}

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

// ResetWorktree discards everything a task left uncommitted, tracked or not.
// Every ref switch runs it first: `git checkout` refuses to move at all while a
// tracked file the target also touches is dirty, so one CLAUDE.md/AGENTS.md
// carrying a platform brief would fail every later task on the workspace.
func (g *GitCLI) ResetWorktree(ctx context.Context, dst string) error {
	if _, err := g.Exec(ctx, dst, nil, "reset", "--hard"); err != nil {
		return err
	}
	_, err := g.Exec(ctx, dst, nil, "clean", "-fd")
	return err
}

// RestoreTracked puts the named paths back to their committed state. It checks
// out from HEAD rather than from the index: `git checkout -- <path>` copies the
// index into the worktree, and an agent that ran `git add` leaves the platform's
// own brief staged — restoring that would put the brief back for commit.
func (g *GitCLI) RestoreTracked(ctx context.Context, dst string, paths ...string) error {
	if len(paths) == 0 {
		return nil
	}
	out, err := g.Exec(ctx, dst, nil, append([]string{"ls-files", "--"}, paths...)...)
	if err != nil {
		return err
	}
	for _, path := range strings.Split(strings.TrimSpace(out), "\n") {
		if path = strings.TrimSpace(path); path == "" {
			continue
		}
		if _, err := g.Exec(ctx, dst, nil, "checkout", "HEAD", "--", path); err != nil {
			return err
		}
	}
	return nil
}

// ResetToDefault returns a reused checkout to a clean default branch. It is
// what makes an analysis/design task leave no branch (and no leftovers) behind.
func (g *GitCLI) ResetToDefault(ctx context.Context, dst, defaultBranch string) error {
	if err := g.ResetWorktree(ctx, dst); err != nil {
		return err
	}
	if _, err := g.Exec(ctx, dst, nil, "checkout", defaultBranch); err != nil {
		return err
	}
	_, err := g.Exec(ctx, dst, nil, "reset", "--hard", "origin/"+defaultBranch)
	return err
}

// ResetToBranch checks out branch at origin's tip. A task continuing the issue's
// pull request must start from the PR's branch, not from the default branch —
// using -B against origin/<branch> both creates it and picks up whatever the
// previous task pushed.
func (g *GitCLI) ResetToBranch(ctx context.Context, dst, branch string) error {
	if err := g.ResetWorktree(ctx, dst); err != nil {
		return err
	}
	_, err := g.Exec(ctx, dst, nil, "checkout", "-B", branch, "origin/"+branch)
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

func (g *GitCLI) NumStat(ctx context.Context, dst, base string) (int, int, int, error) {
	out, err := g.Exec(ctx, dst, nil, "diff", "--numstat", base+"...HEAD")
	if err != nil {
		return 0, 0, 0, err
	}
	return parseNumStat(out)
}

// parseNumStat totals git's "added\tdeleted\tpath" rows. A binary file reports
// "-" for both counts: it is still a changed file, just not a counted one.
func parseNumStat(out string) (files, additions, deletions int, err error) {
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if line = strings.TrimSpace(line); line == "" {
			continue
		}
		fields := strings.Split(line, "\t")
		if len(fields) < 3 {
			return 0, 0, 0, fmt.Errorf("unexpected numstat row: %q", line)
		}
		files++
		added, aerr := strconv.Atoi(fields[0])
		deleted, derr := strconv.Atoi(fields[1])
		if aerr != nil || derr != nil {
			continue
		}
		additions += added
		deletions += deleted
	}
	return files, additions, deletions, nil
}

// isGitRepo reports whether dir is a git working tree (contains a .git).
func isGitRepo(dir string) bool {
	info, err := os.Stat(dir + string(os.PathSeparator) + ".git")
	return err == nil && info.IsDir()
}
