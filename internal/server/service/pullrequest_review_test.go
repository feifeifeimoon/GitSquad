package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/jackc/pgx/v5"
)

func reviewConfig() db.GetWorkspacePRReviewConfigRow {
	return db.GetWorkspacePRReviewConfigRow{
		PrReviewEnabled:        true,
		PrReviewTrigger:        "opened",
		PrReviewIgnoreDrafts:   true,
		PrReviewAuthorScope:    "collaborators",
		PrReviewIncludeBots:    false,
		PrReviewInlineComments: true,
	}
}

func TestNormalizeReviewPath(t *testing.T) {
	cases := map[string]string{
		"internal/server/ws/hub.go":   "internal/server/ws/hub.go",
		"./internal/server/ws/hub.go": "internal/server/ws/hub.go",
		`internal\server\ws\hub.go`:   "internal/server/ws/hub.go",
		"/internal/server/ws/hub.go":  "internal/server/ws/hub.go",
		"":                            "",
	}
	for in, want := range cases {
		if got := normalizeReviewPath(in); got != want {
			t.Errorf("normalizeReviewPath(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestShouldReview(t *testing.T) {
	svc := &ReviewService{appName: "gitsquad"}
	base := GitHubPullRequestEvent{
		Action: "opened", State: "open",
		Author: "alice", AuthorAssociation: "MEMBER",
		ChangedFiles: 3, Additions: 20, Deletions: 5,
	}
	cases := []struct {
		name  string
		ev    GitHubPullRequestEvent
		cfg   db.GetWorkspacePRReviewConfigRow
		agent bool
		want  string
	}{
		{name: "allow", ev: base, cfg: reviewConfig(), agent: true},
		{name: "agent_disabled", ev: base, cfg: reviewConfig(), agent: false, want: "agent_disabled"},
		{name: "manual_only", ev: base, cfg: func() db.GetWorkspacePRReviewConfigRow { c := reviewConfig(); c.PrReviewTrigger = "manual"; return c }(), agent: true, want: "manual_only"},
		{name: "draft", ev: func() GitHubPullRequestEvent { e := base; e.Draft = true; return e }(), cfg: reviewConfig(), agent: true, want: "draft"},
		{name: "push_off", ev: func() GitHubPullRequestEvent { e := base; e.Action = "synchronize"; return e }(), cfg: reviewConfig(), agent: true, want: "push_disabled"},
		{name: "push_on", ev: func() GitHubPullRequestEvent { e := base; e.Action = "synchronize"; return e }(), cfg: func() db.GetWorkspacePRReviewConfigRow { c := reviewConfig(); c.PrReviewTrigger = "push"; return c }(), agent: true},
		{name: "ready", ev: func() GitHubPullRequestEvent { e := base; e.Action = "ready_for_review"; return e }(), cfg: reviewConfig(), agent: true},
		{name: "external", ev: func() GitHubPullRequestEvent { e := base; e.AuthorAssociation = "NONE"; return e }(), cfg: reviewConfig(), agent: true, want: "author"},
		{name: "external_allowed", ev: func() GitHubPullRequestEvent { e := base; e.AuthorAssociation = "NONE"; return e }(), cfg: func() db.GetWorkspacePRReviewConfigRow { c := reviewConfig(); c.PrReviewAuthorScope = "all"; return c }(), agent: true},
		{name: "bot", ev: func() GitHubPullRequestEvent { e := base; e.Author = "dependabot[bot]"; return e }(), cfg: reviewConfig(), agent: true, want: "bot"},
		{name: "our_bot", ev: func() GitHubPullRequestEvent {
			e := base
			e.Author = "gitsquad[bot]"
			e.AuthorAssociation = "NONE"
			return e
		}(), cfg: reviewConfig(), agent: true},
		{name: "too_many_files", ev: func() GitHubPullRequestEvent { e := base; e.ChangedFiles = 101; return e }(), cfg: reviewConfig(), agent: true, want: "too_large"},
		{name: "too_many_lines", ev: func() GitHubPullRequestEvent { e := base; e.Additions = 4000; e.Deletions = 1001; return e }(), cfg: reviewConfig(), agent: true, want: "too_large"},
		{name: "closed", ev: func() GitHubPullRequestEvent { e := base; e.State = "closed"; return e }(), cfg: reviewConfig(), agent: true, want: "not_open"},
		{name: "other_action", ev: func() GitHubPullRequestEvent { e := base; e.Action = "labeled"; return e }(), cfg: reviewConfig(), agent: true, want: "action"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := svc.shouldReview(tc.ev, tc.cfg, tc.agent); got != tc.want {
				t.Fatalf("reason = %q, want %q", got, tc.want)
			}
		})
	}
}

func enableReview(t *testing.T, s *store.Store, f taskFixture) {
	t.Helper()
	ctx := context.Background()
	if _, err := s.UpdateWorkspacePRReview(ctx, db.UpdateWorkspacePRReviewParams{
		ID:                     f.workspace.ID,
		PrReviewEnabled:        true,
		PrReviewAgentID:        &f.agent.ID,
		PrReviewTrigger:        "opened",
		PrReviewIgnoreDrafts:   true,
		PrReviewAuthorScope:    "collaborators",
		PrReviewIncludeBots:    false,
		PrReviewInlineComments: true,
	}); err != nil {
		t.Fatalf("enable review: %v", err)
	}
}

func reviewEvent(installationID int64, number int32, sha string) GitHubPullRequestEvent {
	return GitHubPullRequestEvent{
		Action: "opened", InstallationID: installationID,
		RepoOwner: "tk-owner", RepoName: "tk-repo", Number: number,
		Title: "external change", Body: "body", State: "open",
		HeadBranch: "someone/fix", BaseBranch: "main", HeadSHA: sha,
		Author: "alice", AuthorAssociation: "MEMBER", HeadRepo: "tk-owner/tk-repo",
		Additions: 5, Deletions: 1, ChangedFiles: 1,
		HTMLURL:   "https://github.com/tk-owner/tk-repo/pull/55",
		UpdatedAt: time.Now().UTC().Truncate(time.Second),
	}
}

func TestHandlePullRequestCreatesReviewTask(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	enableReview(t, s, f)

	prSvc := NewPullRequestService(s)
	taskSvc := NewTaskService(s, nil)
	reviewSvc := NewReviewService(s, taskSvc, "gitsquad")

	ev := reviewEvent(f.installationID, 55, "sha-55")
	if err := prSvc.ApplyState(ctx, ev); err != nil {
		t.Fatalf("ApplyState: %v", err)
	}
	if err := reviewSvc.HandlePullRequest(ctx, ev); err != nil {
		t.Fatalf("HandlePullRequest: %v", err)
	}

	pr, err := s.GetPullRequestByNumber(ctx, db.GetPullRequestByNumberParams{
		WorkspaceID: f.workspace.ID, RepoOwner: "tk-owner", RepoName: "tk-repo", Number: 55,
	})
	if err != nil {
		t.Fatalf("get PR: %v", err)
	}
	review, err := s.GetLatestReviewForPR(ctx, pr.ID)
	if err != nil {
		t.Fatalf("get review: %v", err)
	}
	if review.Status != "queued" || review.TaskID == nil {
		t.Fatalf("review = %+v, want a queued row with a task", review)
	}
	task, err := s.GetTask(ctx, *review.TaskID)
	if err != nil {
		t.Fatalf("get task: %v", err)
	}
	if task.Kind != "review" || task.IssueID != nil || task.PullRequestID == nil {
		t.Fatalf("task = %+v, want kind=review with a PR subject and no issue", task)
	}
	if task.Priority != 10 {
		t.Fatalf("priority = %d, want 10", task.Priority)
	}
}

func TestHandlePullRequestSkipsDraftThenReviewsReady(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	enableReview(t, s, f)

	prSvc := NewPullRequestService(s)
	taskSvc := NewTaskService(s, nil)
	reviewSvc := NewReviewService(s, taskSvc, "gitsquad")

	draft := reviewEvent(f.installationID, 56, "sha-56")
	draft.Draft = true
	if err := prSvc.ApplyState(ctx, draft); err != nil {
		t.Fatalf("ApplyState draft: %v", err)
	}
	if err := reviewSvc.HandlePullRequest(ctx, draft); err != nil {
		t.Fatalf("HandlePullRequest draft: %v", err)
	}
	pr, err := s.GetPullRequestByNumber(ctx, db.GetPullRequestByNumberParams{
		WorkspaceID: f.workspace.ID, RepoOwner: "tk-owner", RepoName: "tk-repo", Number: 56,
	})
	if err != nil {
		t.Fatalf("get PR: %v", err)
	}
	if _, err := s.GetLatestReviewForPR(ctx, pr.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("draft review: got %v, want no row", err)
	}

	ready := draft
	ready.Action = "ready_for_review"
	ready.Draft = false
	ready.UpdatedAt = time.Now().UTC().Add(time.Minute).Truncate(time.Second)
	if err := prSvc.ApplyState(ctx, ready); err != nil {
		t.Fatalf("ApplyState ready: %v", err)
	}
	if err := reviewSvc.HandlePullRequest(ctx, ready); err != nil {
		t.Fatalf("HandlePullRequest ready: %v", err)
	}
	review, err := s.GetLatestReviewForPR(ctx, pr.ID)
	if err != nil {
		t.Fatalf("ready review: %v", err)
	}
	if review.Status != "queued" {
		t.Fatalf("ready review status = %q, want queued", review.Status)
	}
}

func TestListWorkspacePullRequestsIncludesReviewTokens(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)

	pr, err := s.RecordRepoPullRequest(ctx, db.InsertRepoPullRequestParams{
		WorkspaceID: f.workspace.ID, RepoOwner: "tk-owner", RepoName: "tk-repo",
		Number: 81, Title: "Review token accounting", State: "open", HeadSha: "sha-81",
		GithubUpdatedAt: pgTime(t),
	})
	if err != nil {
		t.Fatalf("seed PR: %v", err)
	}
	review, err := s.CreatePRReview(ctx, db.CreatePRReviewParams{
		WorkspaceID: f.workspace.ID, PullRequestID: pr.ID, AgentID: &f.agent.ID,
		HeadSha: "sha-81", TriggerKind: "auto",
	})
	if err != nil {
		t.Fatalf("seed review: %v", err)
	}
	task, err := s.CreateTask(ctx, db.CreateTaskParams{
		WorkspaceID: f.workspace.ID, PullRequestID: &pr.ID, Kind: "review",
		AgentID: f.agent.ID, AssignedDaemonID: &f.daemon.ID, Provider: "claude",
		Context: []byte(`{}`),
	})
	if err != nil {
		t.Fatalf("seed task: %v", err)
	}
	if err := s.SetPRReviewTask(ctx, db.SetPRReviewTaskParams{ID: review.ID, TaskID: &task.ID}); err != nil {
		t.Fatalf("attach review task: %v", err)
	}
	if _, err := s.MarkReviewCompleted(ctx, db.MarkReviewCompletedParams{
		Column1: task.ID, Summary: "ok", Findings: 2,
		Url: "https://example.test/review", HeadSha: "sha-81",
	}); err != nil {
		t.Fatalf("complete review: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO task_usage
		(task_id, provider, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
		VALUES ($1, 'claude', 'test-model', 10, 5, 0, 0)`, task.ID); err != nil {
		t.Fatalf("seed usage: %v", err)
	}

	list, err := NewPullRequestService(s).ListWorkspacePullRequests(ctx, f.workspace.ID, "open", 100)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	for _, item := range list {
		if item.Number != 81 {
			continue
		}
		if item.LatestReview == nil {
			t.Fatal("latest review missing")
		}
		if item.LatestReview.Tokens != 15 {
			t.Fatalf("tokens = %d, want 15", item.LatestReview.Tokens)
		}
		if item.LatestReview.Findings != 2 {
			t.Fatalf("findings = %d, want 2", item.LatestReview.Findings)
		}
		return
	}
	t.Fatal("PR 81 not in the list")
}
