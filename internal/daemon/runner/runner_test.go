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
	// dirty = uncommitted work in the tree; ahead = commits the agent made.
	dirty, ahead            bool
	committed, pushed       bool
	discarded               bool
	branch, discardedBranch string
	// originHead is what the checkout's origin/HEAD resolves to ("" → "main").
	originHead string
	// missing lists branches the checkout does not have.
	missing []string
	// resetToDefault / resetToBranch record which starting point the task used.
	resetToDefault bool
	resetToBranch  string
}

func (f *fakeGit) CloneOrFetch(_ context.Context, _ string, _ string, _ Credential) error {
	return f.cloneErr
}
func (f *fakeGit) ResetToDefault(_ context.Context, _ string, _ string) error {
	f.resetToDefault = true
	return nil
}
func (f *fakeGit) ResetToBranch(_ context.Context, _ string, branch string) error {
	f.resetToBranch = branch
	return nil
}
func (f *fakeGit) DefaultBranch(_ context.Context, _ string) (string, error) {
	if f.originHead == "" {
		return "main", nil
	}
	return f.originHead, nil
}
func (f *fakeGit) HasBranch(_ context.Context, _ string, branch string) error {
	for _, m := range f.missing {
		if m == branch {
			return errors.New("no such branch")
		}
	}
	return nil
}
func (f *fakeGit) HasChanges(_ context.Context, _ string, _ string) (bool, error) {
	return f.dirty || f.ahead, nil
}
func (f *fakeGit) DiscardBranch(_ context.Context, _ string, branch, _ string) error {
	f.discarded = true
	f.discardedBranch = branch
	return nil
}
func (f *fakeGit) CreateBranch(_ context.Context, _ string, branch string) error {
	f.branch = branch
	return f.branchErr
}
func (f *fakeGit) Commit(_ context.Context, _ string, _ string) error {
	f.committed = true
	return f.commitErr
}
func (f *fakeGit) Push(_ context.Context, _ string, _ string, _ Credential) error {
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

// Every agent behaviour must converge on the same outcome: one branch, pushed.
// The agent is told to leave its work in the tree, but it may also commit — the
// old brief told it to — and either way the platform owns the commit step.
func TestRunnerRunConvergesOnEveryAgentBehaviour(t *testing.T) {
	cases := []struct {
		name         string
		dirty, ahead bool
	}{
		{name: "agent left changes uncommitted", dirty: true},
		{name: "agent committed everything", ahead: true},
		{name: "agent committed and left more", dirty: true, ahead: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			git := &fakeGit{dirty: tc.dirty, ahead: tc.ahead, diff: "diff --git a/x b/x\n+x\n"}
			rep := &fakeReporter{}
			r := New(git, &fakeBackend{res: provider.Result{Status: "completed", Output: "done"}}, rep, t.TempDir())

			if err := r.Run(context.Background(), testTask()); err != nil {
				t.Fatalf("Run() error = %v", err)
			}
			if git.branch == "" {
				t.Error("the branch must exist before the agent runs")
			}
			if !git.committed {
				t.Error("the commit step belongs to the platform on every path")
			}
			if !git.pushed {
				t.Error("want the branch pushed")
			}
			last := rep.reports[len(rep.reports)-1]
			if last.Status != v1.TaskReportSucceeded || last.Summary == nil || last.Summary.Branch == "" {
				t.Errorf("last report = %+v, want succeeded with a branch", last)
			}
		})
	}
}

// Nothing to deliver: the empty branch is dropped so a reused checkout does not
// accumulate one per read-only task, and the agent's text is the deliverable.
func TestRunnerRunNoChangesDiscardsBranch(t *testing.T) {
	git := &fakeGit{}
	rep := &fakeReporter{}
	r := New(git, &fakeBackend{res: provider.Result{Status: "completed", Output: "analysis"}}, rep, t.TempDir())

	if err := r.Run(context.Background(), testTask()); err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if !git.discarded || git.discardedBranch == "" {
		t.Errorf("want the empty branch discarded, got discarded=%v branch=%q", git.discarded, git.discardedBranch)
	}
	if git.committed || git.pushed {
		t.Error("nothing to deliver: must not commit or push")
	}
	last := rep.reports[len(rep.reports)-1]
	if last.Status != v1.TaskReportSucceeded || last.Summary == nil || last.Summary.Output != "analysis" {
		t.Errorf("last report = %+v, want succeeded with the agent output", last)
	}
}

// The server's value is a snapshot from repo sync, so the checkout is the
// authority when it disagrees: an empty value (sync has not landed) or a value
// the clone does not have (the default branch was renamed) both resolve to
// origin/HEAD rather than failing the task at checkout.
func TestRunnerResolvesDefaultBranchFromTheCheckout(t *testing.T) {
	cases := []struct {
		name, want, originHead string
		missing                []string
		expect                 string
	}{
		{name: "server value wins when the clone has it", want: "develop", originHead: "main", expect: "develop"},
		{name: "empty falls back to origin/HEAD", originHead: "trunk", expect: "trunk"},
		{name: "stale value falls back to origin/HEAD", want: "main", originHead: "trunk", missing: []string{"main"}, expect: "trunk"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			git := &fakeGit{originHead: tc.originHead, missing: tc.missing}
			rep := &fakeReporter{}
			r := New(git, &fakeBackend{res: provider.Result{Status: "completed", Output: "done"}}, rep, t.TempDir())

			task := testTask()
			task.Repo.DefaultBranch = tc.want
			git.dirty = true
			git.diff = "diff --git a/x b/x\n+x\n"

			if err := r.Run(context.Background(), task); err != nil {
				t.Fatalf("Run() error = %v", err)
			}
			last := rep.reports[len(rep.reports)-1]
			if last.Summary == nil || last.Summary.BaseBranch != tc.expect {
				t.Errorf("reported base = %+v, want %q", last.Summary, tc.expect)
			}
		})
	}
}

// A task that continues the issue's live line of work starts from that PR's
// branch, at its remote tip — the agent has to see the work already on it — and
// reports the same branch so the platform can tell it already has a pull
// request.
func TestRunnerContinuesTheGivenBranch(t *testing.T) {
	git := &fakeGit{dirty: true, diff: "diff --git a/x b/x\n+x\n"}
	rep := &fakeReporter{}
	r := New(git, &fakeBackend{res: provider.Result{Status: "completed", Output: "done"}}, rep, t.TempDir())

	task := testTask()
	task.Repo.Branch = "gitsquad/GTS-42/earlier-task"
	task.Repo.PullRequestNumber = 7

	if err := r.Run(context.Background(), task); err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if git.resetToBranch != "gitsquad/GTS-42/earlier-task" {
		t.Errorf("resetToBranch = %q, want the PR's branch", git.resetToBranch)
	}
	if git.resetToDefault || git.branch != "" {
		t.Errorf("a continued line must not reset to default (default=%v) or create a branch (%q)",
			git.resetToDefault, git.branch)
	}
	last := rep.reports[len(rep.reports)-1]
	if last.Summary == nil || last.Summary.Branch != "gitsquad/GTS-42/earlier-task" {
		t.Errorf("reported branch = %+v, want the continued branch", last.Summary)
	}
	if !git.pushed {
		t.Error("want the branch pushed: that is what updates the pull request")
	}
}

// With no branch from the server, the task starts a new line exactly as before.
func TestRunnerStartsANewLineWithoutAGivenBranch(t *testing.T) {
	git := &fakeGit{dirty: true, diff: "diff --git a/x b/x\n+x\n"}
	rep := &fakeReporter{}
	r := New(git, &fakeBackend{res: provider.Result{Status: "completed", Output: "done"}}, rep, t.TempDir())

	task := testTask()
	if err := r.Run(context.Background(), task); err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if !git.resetToDefault || git.resetToBranch != "" {
		t.Errorf("want a fresh line (default=%v, branch=%q)", git.resetToDefault, git.resetToBranch)
	}
	if git.branch != "gitsquad/GTS-42/"+task.ID.String() {
		t.Errorf("branch = %q, want the task's own branch", git.branch)
	}
}

func TestRunnerRunSuccess(t *testing.T) {
	git := &fakeGit{dirty: true, diff: "diff --git a/x b/x\n+x\n"}
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
	git := &fakeGit{dirty: true, diff: "diff"}
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
	backend := &fakeBackend{res: provider.Result{Status: "completed", Output: "here is my analysis"}}
	rep := &fakeReporter{}
	r := New(git, backend, rep, t.TempDir())

	if err := r.Run(context.Background(), testTask()); err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if git.committed || git.pushed {
		t.Errorf("should not commit/push when nothing changed")
	}
	// The branch is created before the agent runs, so the no-change path has to
	// take it back — otherwise a reused checkout accumulates one per task.
	if !git.discarded {
		t.Errorf("branch %q should be discarded for a read-only task", git.branch)
	}
	last := rep.reports[len(rep.reports)-1]
	if last.Status != v1.TaskReportSucceeded {
		t.Errorf("last report status = %s, want succeeded", last.Status)
	}
	// The agent's text is the deliverable even without a code change.
	if last.Summary == nil || last.Summary.Output != "here is my analysis" {
		t.Errorf("summary output = %+v, want the agent output", last.Summary)
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

// Usage must survive every terminal path once the agent has run: a task that
// commits and pushes, one that fails after the agent finished, and one whose
// provider timed out mid-stream.
func TestRunnerReportsUsageOnSuccess(t *testing.T) {
	git := &fakeGit{dirty: true, diff: "diff --git a/x b/x\n+x\n"}
	backend := &fakeBackend{res: provider.Result{
		Status: "completed",
		Output: "done",
		Usage: map[string]provider.TokenUsage{
			"claude-sonnet-4-5": {InputTokens: 10, OutputTokens: 20, CacheReadTokens: 30, CacheWriteTokens: 40},
			"claude-opus-4":     {InputTokens: 1, OutputTokens: 2},
		},
	}}
	rep := &fakeReporter{}
	r := New(git, backend, rep, t.TempDir())

	if err := r.Run(context.Background(), testTask()); err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	last := rep.reports[len(rep.reports)-1]
	if last.Status != v1.TaskReportSucceeded {
		t.Fatalf("status = %s, want succeeded", last.Status)
	}
	if len(last.Usage) != 2 {
		t.Fatalf("usage = %+v, want both models", last.Usage)
	}
	// Sorted by model so the wire order is deterministic.
	if last.Usage[0].Model != "claude-opus-4" || last.Usage[1].Model != "claude-sonnet-4-5" {
		t.Errorf("usage order = %s, %s, want sorted by model", last.Usage[0].Model, last.Usage[1].Model)
	}
	got := last.Usage[1]
	if got.Provider != "claude" || got.InputTokens != 10 || got.OutputTokens != 20 ||
		got.CacheReadTokens != 30 || got.CacheWriteTokens != 40 {
		t.Errorf("usage = %+v, want claude 10/20/30/40", got)
	}
}

func TestRunnerReportsUsageWhenProviderFails(t *testing.T) {
	// A timed-out run: the provider never emitted a result event, so the usage
	// is only what accumulated from streamed turns.
	backend := &fakeBackend{res: provider.Result{
		Status: "timeout",
		Usage:  map[string]provider.TokenUsage{"claude-sonnet-4-5": {InputTokens: 7, OutputTokens: 8}},
	}}
	rep := &fakeReporter{}
	r := New(&fakeGit{}, backend, rep, t.TempDir())

	if err := r.Run(context.Background(), testTask()); err == nil {
		t.Fatal("Run() = nil, want error")
	}

	last := rep.reports[len(rep.reports)-1]
	if last.Status != v1.TaskReportFailed {
		t.Fatalf("status = %s, want failed", last.Status)
	}
	if len(last.Usage) != 1 || last.Usage[0].InputTokens != 7 {
		t.Errorf("usage = %+v, want the timed-out run's tokens", last.Usage)
	}
}

// A failure after the agent finished — the push — still carries the tokens it
// spent producing the work.
func TestRunnerReportsUsageWhenPushFails(t *testing.T) {
	git := &fakeGit{dirty: true, diff: "diff --git a/x b/x\n+x\n", pushErr: errors.New("push failed")}
	backend := &fakeBackend{res: provider.Result{
		Status: "completed",
		Usage:  map[string]provider.TokenUsage{"claude-sonnet-4-5": {OutputTokens: 99}},
	}}
	rep := &fakeReporter{}
	r := New(git, backend, rep, t.TempDir())

	if err := r.Run(context.Background(), testTask()); err == nil {
		t.Fatal("Run() = nil, want error")
	}
	last := rep.reports[len(rep.reports)-1]
	if last.Status != v1.TaskReportFailed {
		t.Fatalf("status = %s, want failed", last.Status)
	}
	if len(last.Usage) != 1 || last.Usage[0].OutputTokens != 99 {
		t.Errorf("usage = %+v, want the tokens spent before the push", last.Usage)
	}
}

// A failure before the agent runs has no usage, and must not fabricate a zero
// row — "not reported" and "used nothing" are different facts.
func TestRunnerPreAgentFailureHasNoUsage(t *testing.T) {
	git := &fakeGit{cloneErr: errors.New("clone failed")}
	rep := &fakeReporter{}
	r := New(git, &fakeBackend{}, rep, t.TempDir())

	if err := r.Run(context.Background(), testTask()); err == nil {
		t.Fatal("Run() = nil, want error")
	}
	last := rep.reports[len(rep.reports)-1]
	if last.Usage != nil {
		t.Errorf("usage = %+v, want nil for a failure before the agent ran", last.Usage)
	}
}

// A provider that reports no usage leaves the field empty rather than sending a
// zero row, so the server can tell it apart from a real zero-token run.
func TestRunnerOmitsEmptyUsage(t *testing.T) {
	backend := &fakeBackend{res: provider.Result{
		Status: "completed",
		Output: "no code change",
		Usage:  map[string]provider.TokenUsage{"claude-sonnet-4-5": {}},
	}}
	rep := &fakeReporter{}
	r := New(&fakeGit{}, backend, rep, t.TempDir())

	if err := r.Run(context.Background(), testTask()); err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	last := rep.reports[len(rep.reports)-1]
	if last.Status != v1.TaskReportSucceeded {
		t.Fatalf("status = %s, want succeeded", last.Status)
	}
	if last.Usage != nil {
		t.Errorf("usage = %+v, want nil for an all-zero report", last.Usage)
	}
}
