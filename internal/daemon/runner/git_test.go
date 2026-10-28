package runner

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// runGit is a test helper that runs git in dir.
func runGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
	return string(out)
}

func initRepo(t *testing.T, dir string) {
	t.Helper()
	runGit(t, dir, "init", "-q")
	runGit(t, dir, "config", "user.email", "test@example.com")
	runGit(t, dir, "config", "user.name", "test")
}

func TestGitCLIFullFlow(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	ctx := context.Background()

	// Source repo with one commit.
	src := t.TempDir()
	initRepo(t, src)
	if err := os.WriteFile(filepath.Join(src, "hello.txt"), []byte("hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGit(t, src, "add", "-A")
	runGit(t, src, "commit", "-q", "-m", "init")
	defBranch := strings.TrimSpace(runGit(t, src, "branch", "--show-current"))

	// Bare remote.
	remote := filepath.Join(t.TempDir(), "repo.git")
	runGit(t, t.TempDir(), "init", "-q", "--bare", remote)
	runGit(t, src, "remote", "add", "origin", remote)
	runGit(t, src, "push", "-q", "-u", "origin", defBranch)

	g := NewGitCLI()

	// Clone, then reset to a clean default branch (what a task start does).
	dst := filepath.Join(t.TempDir(), "work")
	if err := g.CloneOrFetch(ctx, dst, remote, Credential{}); err != nil {
		t.Fatalf("CloneOrFetch: %v", err)
	}
	if err := g.ResetToDefault(ctx, dst, defBranch); err != nil {
		t.Fatalf("ResetToDefault: %v", err)
	}

	// Platform context files must stay out of the agent's diff and commit.
	if err := os.WriteFile(filepath.Join(dst, "AGENTS.md"), []byte("brief\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Create a task branch.
	branch := "gitsquad/GTS-42/task-1"
	if err := g.CreateBranch(ctx, dst, branch); err != nil {
		t.Fatalf("CreateBranch: %v", err)
	}

	// Modify + commit.
	if err := os.WriteFile(filepath.Join(dst, "hello.txt"), []byte("hello world\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := g.Commit(ctx, dst, "GTS-42: fix greeting"); err != nil {
		t.Fatalf("Commit: %v", err)
	}

	// Diff.
	diff, err := g.Diff(ctx, dst, "origin/"+defBranch)
	if err != nil {
		t.Fatalf("Diff: %v", err)
	}
	if !strings.Contains(diff, "hello world") {
		t.Errorf("diff should contain the change: %s", diff)
	}
	if strings.Contains(diff, "AGENTS.md") {
		t.Errorf("the platform brief leaked into the agent's diff: %s", diff)
	}

	// Push.
	if err := g.Push(ctx, dst, branch, Credential{}); err != nil {
		t.Fatalf("Push: %v", err)
	}

	// Idempotent CloneOrFetch on an existing checkout.
	if err := g.CloneOrFetch(ctx, dst, remote, Credential{}); err != nil {
		t.Fatalf("CloneOrFetch (fetch): %v", err)
	}
}

// newCheckout commits one file to a source repo, wires a bare remote, and
// returns a fresh clone of it.
func newCheckout(t *testing.T) (g *GitCLI, dst, defBranch string) {
	t.Helper()
	src := t.TempDir()
	initRepo(t, src)
	if err := os.WriteFile(filepath.Join(src, "AGENTS.md"), []byte("# repo instructions\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGit(t, src, "add", "-A")
	runGit(t, src, "commit", "-q", "-m", "init")
	defBranch = strings.TrimSpace(runGit(t, src, "branch", "--show-current"))

	remote := filepath.Join(t.TempDir(), "repo.git")
	runGit(t, t.TempDir(), "init", "-q", "--bare", remote)
	runGit(t, src, "remote", "add", "origin", remote)
	runGit(t, src, "push", "-q", "-u", "origin", defBranch)

	g = NewGitCLI()
	dst = filepath.Join(t.TempDir(), "work")
	if err := g.CloneOrFetch(context.Background(), dst, remote, Credential{}); err != nil {
		t.Fatalf("CloneOrFetch: %v", err)
	}
	if err := g.ResetToDefault(context.Background(), dst, defBranch); err != nil {
		t.Fatalf("ResetToDefault: %v", err)
	}
	return g, dst, defBranch
}

// A failed task leaves the shared checkout detached with the platform's brief in
// a tracked AGENTS.md. That is enough for `git checkout` to refuse every later
// ref switch — the "local changes would be overwritten" failure that made every
// review of a workspace fail once.
func TestGitCLIResetWorktreeUnblocksRefSwitch(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	ctx := context.Background()
	g, dst, defBranch := newCheckout(t)

	// A commit that touches AGENTS.md, so the switch has a file to update.
	branch := "gitsquad/GTS-42/task-1"
	if err := g.CreateBranch(ctx, dst, branch); err != nil {
		t.Fatalf("CreateBranch: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dst, "AGENTS.md"), []byte("# repo instructions\n\nreviewed\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := g.Commit(ctx, dst, "GTS-42: touch AGENTS.md"); err != nil {
		t.Fatalf("Commit: %v", err)
	}

	// The state a failed review leaves: detached on the default branch, the
	// platform's brief written over the tracked file, one stray untracked file.
	if err := g.CheckoutDetached(ctx, dst, defBranch); err != nil {
		t.Fatalf("CheckoutDetached: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dst, "AGENTS.md"), []byte("brief\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dst, "review.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := g.CheckoutDetached(ctx, dst, branch); err == nil {
		t.Fatal("want the dirty checkout to refuse the switch — this is the bug the reset guards")
	}

	if err := g.ResetWorktree(ctx, dst); err != nil {
		t.Fatalf("ResetWorktree: %v", err)
	}
	if err := g.CheckoutDetached(ctx, dst, branch); err != nil {
		t.Fatalf("CheckoutDetached after ResetWorktree: %v", err)
	}
	got, err := os.ReadFile(filepath.Join(dst, "AGENTS.md"))
	if err != nil {
		t.Fatal(err)
	}
	// core.autocrlf rewrites the line endings on checkout on Windows.
	if text := strings.ReplaceAll(string(got), "\r\n", "\n"); text != "# repo instructions\n\nreviewed\n" {
		t.Errorf("AGENTS.md = %q, want the committed content back", text)
	}
	if _, err := os.Stat(filepath.Join(dst, "review.json")); !os.IsNotExist(err) {
		t.Error("the untracked file should be gone")
	}
}

// The final reset of a review has to work from that same dirty detached state,
// not just from a clean branch: otherwise the leftovers survive and the next
// task inherits them.
func TestGitCLIResetToDefaultRecoversDetachedDirty(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	ctx := context.Background()
	g, dst, defBranch := newCheckout(t)

	branch := "gitsquad/GTS-42/task-1"
	if err := g.CreateBranch(ctx, dst, branch); err != nil {
		t.Fatalf("CreateBranch: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dst, "AGENTS.md"), []byte("# repo instructions\n\nreviewed\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := g.Commit(ctx, dst, "GTS-42: touch AGENTS.md"); err != nil {
		t.Fatalf("Commit: %v", err)
	}
	if err := g.CheckoutDetached(ctx, dst, branch); err != nil {
		t.Fatalf("CheckoutDetached: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dst, "AGENTS.md"), []byte("brief\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := g.ResetToDefault(ctx, dst, defBranch); err != nil {
		t.Fatalf("ResetToDefault from a dirty detached checkout: %v", err)
	}
	if cur := strings.TrimSpace(runGit(t, dst, "branch", "--show-current")); cur != defBranch {
		t.Errorf("current branch = %q, want %q", cur, defBranch)
	}
	if status := strings.TrimSpace(runGit(t, dst, "status", "--porcelain")); status != "" {
		t.Errorf("status = %q, want a clean checkout", status)
	}
}

// Excluding the platform's context files only covers untracked ones. A
// repository that tracks AGENTS.md has to have its copy restored, and the restore
// has to come from HEAD: `git checkout -- <path>` copies the index, so an agent
// that ran `git add` would hand the platform's own brief back for commit.
func TestGitCLIRestoreTracked(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	ctx := context.Background()
	g, dst, _ := newCheckout(t)

	if err := os.WriteFile(filepath.Join(dst, "AGENTS.md"), []byte("brief\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	// The agent staged it — the trap a plain `checkout --` falls into.
	runGit(t, dst, "add", "AGENTS.md")
	if err := os.WriteFile(filepath.Join(dst, "CLAUDE.md"), []byte("brief\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dst, "agent.txt"), []byte("the agent's work\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := g.RestoreTracked(ctx, dst, "AGENTS.md", "CLAUDE.md", ".claude", ".agents"); err != nil {
		t.Fatalf("RestoreTracked: %v", err)
	}
	got, err := os.ReadFile(filepath.Join(dst, "AGENTS.md"))
	if err != nil {
		t.Fatal(err)
	}
	// core.autocrlf rewrites the line endings on checkout on Windows.
	if text := strings.ReplaceAll(string(got), "\r\n", "\n"); text != "# repo instructions\n" {
		t.Errorf("AGENTS.md = %q, want the committed content back", text)
	}
	if status := strings.TrimSpace(runGit(t, dst, "status", "--porcelain", "AGENTS.md")); status != "" {
		t.Errorf("status = %q, want nothing staged or modified", status)
	}
	if _, err := os.Stat(filepath.Join(dst, "CLAUDE.md")); err != nil {
		t.Errorf("an untracked CLAUDE.md is not the platform's to delete: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dst, "agent.txt")); err != nil {
		t.Errorf("the agent's own file must survive: %v", err)
	}
}

// A checkout cloned before an exclude was added never picks it up otherwise, and
// the platform's context files then count as the task's work.
func TestGitCLICloneOrFetchRepairsExcludes(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	ctx := context.Background()
	src := t.TempDir()
	initRepo(t, src)
	if err := os.WriteFile(filepath.Join(src, "a.txt"), []byte("hi\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGit(t, src, "add", "-A")
	runGit(t, src, "commit", "-q", "-m", "init")

	// Clone with plain git, the way an older daemon checkout exists on disk.
	dst := filepath.Join(t.TempDir(), "work")
	runGit(t, filepath.Dir(dst), "clone", "-q", src, dst)

	g := NewGitCLI()
	if err := g.CloneOrFetch(ctx, dst, src, Credential{}); err != nil {
		t.Fatalf("CloneOrFetch: %v", err)
	}
	exclude, err := os.ReadFile(filepath.Join(dst, ".git", "info", "exclude"))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"AGENTS.md", ".gitsquad/"} {
		if !strings.Contains(string(exclude), want) {
			t.Errorf("exclude missing %q:\n%s", want, exclude)
		}
	}
}

func TestGitHubCloneURL(t *testing.T) {
	got := GitHubCloneURL("feifeifeimoon", "demo")
	want := "https://github.com/feifeifeimoon/demo.git"
	if got != want {
		t.Errorf("GitHubCloneURL = %q, want %q", got, want)
	}
}

// The platform owns the commit. That only works if Commit tolerates an agent
// that already committed everything — the old brief told it to, and the old
// Commit failed with "nothing to commit", failing a task that had done its job.
func TestGitCLICommitIsIdempotentAndHasChangesSeesTheWorktree(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	ctx := context.Background()

	src := t.TempDir()
	initRepo(t, src)
	if err := os.WriteFile(filepath.Join(src, "a.txt"), []byte("hi\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGit(t, src, "add", "-A")
	runGit(t, src, "commit", "-q", "-m", "init")
	defBranch := strings.TrimSpace(runGit(t, src, "branch", "--show-current"))

	remote := filepath.Join(t.TempDir(), "repo.git")
	runGit(t, t.TempDir(), "init", "-q", "--bare", remote)
	runGit(t, src, "remote", "add", "origin", remote)
	runGit(t, src, "push", "-q", "-u", "origin", defBranch)

	g := NewGitCLI()
	dst := filepath.Join(t.TempDir(), "work")
	if err := g.CloneOrFetch(ctx, dst, remote, Credential{}); err != nil {
		t.Fatalf("CloneOrFetch: %v", err)
	}
	if err := g.ResetToDefault(ctx, dst, defBranch); err != nil {
		t.Fatalf("ResetToDefault: %v", err)
	}
	branch := "gitsquad/GTS-42/task-1"
	if err := g.CreateBranch(ctx, dst, branch); err != nil {
		t.Fatalf("CreateBranch: %v", err)
	}
	base := "origin/" + defBranch

	// Nothing changed yet.
	if changed, err := g.HasChanges(ctx, dst, base); err != nil || changed {
		t.Fatalf("HasChanges = %v, %v; want false, nil on a fresh branch", changed, err)
	}

	// The agent leaves its work in the working tree (what the brief now asks).
	if err := os.WriteFile(filepath.Join(dst, "a.txt"), []byte("changed\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	changed, err := g.HasChanges(ctx, dst, base)
	if err != nil || !changed {
		t.Fatalf("HasChanges = %v, %v; want true for uncommitted work", changed, err)
	}
	if err := g.Commit(ctx, dst, "GTS-42: changes by coder"); err != nil {
		t.Fatalf("Commit: %v", err)
	}
	// Committing twice must not fail: the second call has nothing to stage.
	if err := g.Commit(ctx, dst, "GTS-42: changes by coder"); err != nil {
		t.Fatalf("second Commit: %v", err)
	}

	// The agent committed on its own instead (the behaviour the old brief
	// asked for): the tree is clean, HEAD is ahead of base, and the platform's
	// commit must still be a no-op rather than a failure.
	//
	// The identity is explicit because a clone does not inherit the source
	// repository's config. Without it this commit depends on the machine having
	// a global git identity, and a clean CI runner does not have one.
	if err := os.WriteFile(filepath.Join(dst, "b.txt"), []byte("agent wrote this\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGit(t, dst, "add", "-A")
	runGit(t, dst, "-c", "user.name=E2E Agent", "-c", "user.email=agent@example.com",
		"commit", "-q", "-m", "agent's own commit")
	changed, err = g.HasChanges(ctx, dst, base)
	if err != nil || !changed {
		t.Fatalf("HasChanges = %v, %v; want true for a commit on top of base", changed, err)
	}
	if err := g.Commit(ctx, dst, "GTS-42: changes by coder"); err != nil {
		t.Fatalf("Commit after an agent commit: %v", err)
	}
	if err := g.Push(ctx, dst, branch, Credential{}); err != nil {
		t.Fatalf("Push: %v", err)
	}
}

// Discarding an empty branch keeps a reused checkout from accumulating one
// branch per read-only task.
func TestGitCLIDiscardBranch(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	ctx := context.Background()

	src := t.TempDir()
	initRepo(t, src)
	if err := os.WriteFile(filepath.Join(src, "a.txt"), []byte("hi\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGit(t, src, "add", "-A")
	runGit(t, src, "commit", "-q", "-m", "init")
	defBranch := strings.TrimSpace(runGit(t, src, "branch", "--show-current"))

	remote := filepath.Join(t.TempDir(), "repo.git")
	runGit(t, t.TempDir(), "init", "-q", "--bare", remote)
	runGit(t, src, "remote", "add", "origin", remote)
	runGit(t, src, "push", "-q", "-u", "origin", defBranch)

	g := NewGitCLI()
	dst := filepath.Join(t.TempDir(), "work")
	if err := g.CloneOrFetch(ctx, dst, remote, Credential{}); err != nil {
		t.Fatalf("CloneOrFetch: %v", err)
	}
	if err := g.ResetToDefault(ctx, dst, defBranch); err != nil {
		t.Fatalf("ResetToDefault: %v", err)
	}
	branch := "gitsquad/GTS-42/task-1"
	if err := g.CreateBranch(ctx, dst, branch); err != nil {
		t.Fatalf("CreateBranch: %v", err)
	}
	if err := g.DiscardBranch(ctx, dst, branch, defBranch); err != nil {
		t.Fatalf("DiscardBranch: %v", err)
	}
	if out := runGit(t, dst, "branch", "--list", branch); strings.TrimSpace(out) != "" {
		t.Errorf("branch %q still exists", branch)
	}
	if cur := strings.TrimSpace(runGit(t, dst, "branch", "--show-current")); cur != defBranch {
		t.Errorf("current branch = %q, want %q", cur, defBranch)
	}
}
