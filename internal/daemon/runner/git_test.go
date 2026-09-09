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

	// Clone.
	dst := filepath.Join(t.TempDir(), "work")
	if err := g.CloneOrFetch(ctx, dst, remote); err != nil {
		t.Fatalf("CloneOrFetch: %v", err)
	}

	// Create a task branch.
	branch := "gitsquad/GTS-42/task-1"
	if err := g.CreateBranch(ctx, dst, defBranch, branch); err != nil {
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

	// Push.
	if err := g.Push(ctx, dst, branch); err != nil {
		t.Fatalf("Push: %v", err)
	}

	// Idempotent CloneOrFetch on an existing checkout.
	if err := g.CloneOrFetch(ctx, dst, remote); err != nil {
		t.Fatalf("CloneOrFetch (fetch): %v", err)
	}
}

func TestGitHubCloneURL(t *testing.T) {
	got := GitHubCloneURL("feifeifeimoon", "demo", "ghs_secret")
	want := "https://x-access-token:ghs_secret@github.com/feifeifeimoon/demo.git"
	if got != want {
		t.Errorf("GitHubCloneURL = %q, want %q", got, want)
	}
}
