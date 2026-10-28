package runner

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/provider"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

func TestCheckoutPullRequestFetchesBaseBeforeHead(t *testing.T) {
	git := &fakeGit{}
	r := New(git, nil, nil, t.TempDir())
	pr := &v1.TaskPullRequestContext{Number: 7, BaseBranch: "main"}
	if _, err := r.checkoutPullRequest(context.Background(), t.TempDir(), pr, Credential{}); err != nil {
		t.Fatalf("checkout: %v", err)
	}
	want := "reset-worktree fetch-branch fetch-pr checkout:FETCH_HEAD head-sha"
	if got := strings.Join(git.calls, " "); got != want {
		t.Fatalf("calls = %q, want %q (FETCH_HEAD must still point at the PR head)", got, want)
	}
}

// agy keeps its process alive while a command it backgrounded is unfinished, so
// a review can be killed on the deadline after writing its result. The findings
// are what the task existed to produce: they are reported, with the abnormal end
// noted in the posted body.
func TestRunReviewReportsAReviewWrittenBeforeATimeout(t *testing.T) {
	git := &fakeGit{}
	rep := &fakeReporter{}
	backend := &fakeBackend{
		res: provider.Result{Status: "timeout", Error: "context deadline exceeded"},
		onExecute: func(dir string) {
			body := `{"summary":"found two things","comments":[{"path":"a.go","line":3,"body":"fix"}]}`
			if err := os.MkdirAll(filepath.Join(dir, ".gitsquad"), 0o755); err != nil {
				t.Fatalf("create .gitsquad: %v", err)
			}
			if err := os.WriteFile(filepath.Join(dir, ".gitsquad", "review.json"), []byte(body), 0o644); err != nil {
				t.Fatalf("write review.json: %v", err)
			}
		},
	}
	r := New(git, backend, rep, t.TempDir())
	task := testTask()
	task.Kind = "review"
	task.PullRequest = &v1.TaskPullRequestContext{Number: 109, BaseBranch: "main"}

	if err := r.Run(context.Background(), task); err != nil {
		t.Fatalf("Run() error = %v, want the delivered review to count as success", err)
	}
	last := rep.reports[len(rep.reports)-1]
	if last.Status != v1.TaskReportSucceeded || last.Summary == nil || last.Summary.Review == nil {
		t.Fatalf("last report = %+v, want succeeded carrying the review", last)
	}
	if len(last.Summary.Review.Comments) != 1 {
		t.Errorf("comments = %+v, want the reviewer's finding", last.Summary.Review.Comments)
	}
	if last.Summary.Review.HeadSHA != "review-sha" {
		t.Errorf("HeadSHA = %q, want the checked-out commit", last.Summary.Review.HeadSHA)
	}
	if !strings.Contains(last.Summary.Output, "context deadline exceeded") {
		t.Errorf("summary = %q, want the abnormal end noted", last.Summary.Output)
	}
}

// Without a result there is nothing to deliver, so a killed run still fails.
func TestRunReviewWithoutAResultStillFails(t *testing.T) {
	git := &fakeGit{}
	rep := &fakeReporter{}
	backend := &fakeBackend{res: provider.Result{Status: "timeout", Error: "context deadline exceeded"}}
	r := New(git, backend, rep, t.TempDir())
	task := testTask()
	task.Kind = "review"
	task.PullRequest = &v1.TaskPullRequestContext{Number: 109, BaseBranch: "main"}

	if err := r.Run(context.Background(), task); err == nil {
		t.Fatal("Run() = nil, want a failure when no review was written")
	}
	last := rep.reports[len(rep.reports)-1]
	if last.Status != v1.TaskReportFailed || last.Summary != nil {
		t.Errorf("last report = %+v, want failed without a summary", last)
	}
}

func TestTriggerPromptReviewUsesPullRequest(t *testing.T) {
	task := testTask()
	task.Kind = "review"
	task.PullRequest = &v1.TaskPullRequestContext{Number: 42}
	if got := triggerPrompt(task); got != "Review pull request #42." {
		t.Fatalf("prompt = %q, want the pull request prompt", got)
	}
}

func TestReadReviewResultStripsFence(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".gitsquad"), 0o755); err != nil {
		t.Fatal(err)
	}
	body := "```json\n{\"summary\":\"looks good\",\"comments\":[{\"path\":\"a.go\",\"line\":3,\"body\":\"fix this\"}]}\n```"
	if err := os.WriteFile(filepath.Join(dir, ".gitsquad", "review.json"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	review, summary := readReviewResult(dir, "fallback")
	if review == nil {
		t.Fatal("review = nil, want parsed JSON")
	}
	if summary != "looks good" || len(review.Comments) != 1 {
		t.Fatalf("review = %+v, summary = %q", review, summary)
	}
	if review.Comments[0].Path != "a.go" || review.Comments[0].Line != 3 {
		t.Fatalf("comment = %+v", review.Comments[0])
	}
}

func TestReadReviewResultFallsBack(t *testing.T) {
	dir := t.TempDir()
	review, summary := readReviewResult(dir, "plain text")
	if review != nil {
		t.Fatalf("review = %+v, want nil", review)
	}
	if summary != "plain text" {
		t.Fatalf("summary = %q, want the fallback", summary)
	}
}

func TestNeutralizeRepoInstructions(t *testing.T) {
	dir := t.TempDir()
	files := []string{
		"CLAUDE.md",
		filepath.Join("sub", "AGENTS.md"),
		filepath.Join(".claude", "settings.json"),
		filepath.Join(".agents", "skills", "x", "SKILL.md"),
		filepath.Join("src", "main.go"),
	}
	for _, name := range files {
		path := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	cleanup, err := neutralizeRepoInstructions(dir)
	if err != nil {
		t.Fatalf("neutralize: %v", err)
	}
	defer cleanup()
	for _, name := range files[:4] {
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Errorf("%s still exists, want it moved aside", name)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "src", "main.go")); err != nil {
		t.Errorf("src/main.go was removed: %v", err)
	}
}
