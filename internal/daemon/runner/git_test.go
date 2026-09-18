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
	if err := os.WriteFile(filepath.Join(dst, "b.txt"), []byte("agent wrote this\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGit(t, dst, "add", "-A")
	runGit(t, dst, "commit", "-q", "-m", "agent's own commit")
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
