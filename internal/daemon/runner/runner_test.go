package runner

import (
	"context"
	"errors"
	"testing"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/provider"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

type fakeGit struct {
	cloneErr, branchErr, commitErr, pushErr error
	diff                                    string
	committed, pushed                       bool
	branch                                  string
}

func (f *fakeGit) CloneOrFetch(_ context.Context, _ string, _ string) error {
	return f.cloneErr
}
func (f *fakeGit) CreateBranch(_ context.Context, _ string, _ string, branch string) error {
	f.branch = branch
	return f.branchErr
}
func (f *fakeGit) Commit(_ context.Context, _ string, _ string) error {
	f.committed = true
	return f.commitErr
}
func (f *fakeGit) Push(_ context.Context, _ string, _ string) error {
	f.pushed = true
	return f.pushErr
}
func (f *fakeGit) Diff(_ context.Context, _ string, _ string) (string, error) {
	return f.diff, nil
}

type fakeBackend struct {
	msgs []provider.Message
	res  provider.Result
	err  error
}

func (f *fakeBackend) Kind() string { return "claude" }
func (f *fakeBackend) Execute(_ context.Context, _ string, _ provider.ExecOptions) (*provider.Session, error) {
	if f.err != nil {
		return nil, f.err
	}
	msgs := make(chan provider.Message, len(f.msgs)+1)
	for _, m := range f.msgs {
		msgs <- m
	}
	close(msgs)
	res := make(chan provider.Result, 1)
	res <- f.res
	close(res)
	return &provider.Session{Messages: msgs, Result: res}, nil
}

type fakeReporter struct {
	reports []v1.TaskReport
}

func (f *fakeReporter) Report(_ context.Context, _ uuid.UUID, r v1.TaskReport) error {
	f.reports = append(f.reports, r)
	return nil
}

func testTask() v1.Task {
	return v1.Task{
		ID:          uuid.New(),
		WorkspaceID: uuid.New(),
		Issue: v1.TaskIssueContext{
			Key:         "GTS-42",
			Title:       "login null pointer",
			Description: "fix it",
			Comments:    []v1.TaskComment{{AuthorName: "alice", Type: "comment", Content: "@coder fix it"}},
		},
		Repo:              v1.TaskRepoContext{Owner: "feifeifeimoon", Name: "demo", DefaultBranch: "main"},
		Agent:             v1.TaskAgentContext{Name: "coder", Instructions: "be conservative", Provider: "claude"},
		InstallationToken: "ghs_secret",
	}
}

func TestRunnerRunSuccess(t *testing.T) {
	git := &fakeGit{diff: "diff --git a/x b/x\n+x\n"}
	backend := &fakeBackend{
		msgs: []provider.Message{{Type: provider.MessageText, Content: "working"}},
		res:  provider.Result{Status: "completed", Output: "done"},
	}
	rep := &fakeReporter{}
	r := New(git, backend, rep, t.TempDir())

	task := testTask()
	if err := r.Run(context.Background(), task); err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if !git.committed || !git.pushed {
		t.Errorf("expected commit+push, got committed=%v pushed=%v", git.committed, git.pushed)
	}
	if git.branch != "gitsquad/GTS-42/"+task.ID.String() {
		t.Errorf("branch = %q", git.branch)
	}

	if len(rep.reports) == 0 {
		t.Fatal("no reports")
	}
	last := rep.reports[len(rep.reports)-1]
	if last.Status != v1.TaskReportSucceeded || last.Summary == nil || last.Summary.Branch == "" {
		t.Errorf("last report = %+v, want succeeded with branch", last)
	}
}

func TestRunnerRunProviderFailed(t *testing.T) {
	git := &fakeGit{diff: "diff"}
	backend := &fakeBackend{res: provider.Result{Status: "failed", Error: "boom"}}
	rep := &fakeReporter{}
	r := New(git, backend, rep, t.TempDir())

	err := r.Run(context.Background(), testTask())
	if err == nil {
		t.Fatal("Run() = nil, want error")
	}
	if git.committed || git.pushed {
		t.Errorf("should not commit/push on provider failure")
	}
	last := rep.reports[len(rep.reports)-1]
	if last.Status != v1.TaskReportFailed || last.Error == "" {
		t.Errorf("last report = %+v, want failed with error", last)
	}
}

func TestRunnerRunNoChanges(t *testing.T) {
	git := &fakeGit{diff: ""}
	backend := &fakeBackend{res: provider.Result{Status: "completed"}}
	rep := &fakeReporter{}
	r := New(git, backend, rep, t.TempDir())

	if err := r.Run(context.Background(), testTask()); err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if git.committed || git.pushed {
		t.Errorf("should not commit/push when diff is empty")
	}
	last := rep.reports[len(rep.reports)-1]
	if last.Status != v1.TaskReportSucceeded {
		t.Errorf("last report status = %s, want succeeded", last.Status)
	}
}

func TestRunnerRunCheckoutError(t *testing.T) {
	git := &fakeGit{cloneErr: errors.New("clone failed")}
	backend := &fakeBackend{res: provider.Result{Status: "completed"}}
	rep := &fakeReporter{}
	r := New(git, backend, rep, t.TempDir())

	err := r.Run(context.Background(), testTask())
	if err == nil {
		t.Fatal("Run() = nil, want error")
	}
	last := rep.reports[len(rep.reports)-1]
	if last.Status != v1.TaskReportFailed || last.Error == "" {
		t.Errorf("last report = %+v, want failed with error", last)
	}
}
