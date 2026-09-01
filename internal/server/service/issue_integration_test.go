package service

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/database"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/google/uuid"
)

// TestIssueServiceIntegration exercises the full issue blackboard flow
// against a real Postgres instance. It is skipped unless
// GITSQUAD_TEST_DATABASE_URL is set, so `go test ./...` stays green in CI
// without a database.
func TestIssueServiceIntegration(t *testing.T) {
	dsn := os.Getenv("GITSQUAD_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("GITSQUAD_TEST_DATABASE_URL not set; skipping integration test")
	}

	ctx := context.Background()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer pool.Close()

	if err := database.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	s := store.New(pool)

	// Seed a user, GitHub installation, repo and workspace owned by the user.
	user, err := s.CreateUser(ctx, db.CreateUserParams{
		Login:     fmt.Sprintf("it-user-%s", uuid.NewString()[:8]),
		AvatarUrl: nil,
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() {
		// Delete in FK dependency order (no ON DELETE CASCADE on these FKs).
		_, _ = pool.Exec(ctx, "DELETE FROM workspaces WHERE user_id = $1", user.ID)
		_, _ = pool.Exec(ctx, "DELETE FROM github_repos WHERE installation_id IN (SELECT id FROM github_installations WHERE user_id = $1)", user.ID)
		_, _ = pool.Exec(ctx, "DELETE FROM github_installations WHERE user_id = $1", user.ID)
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", user.ID)
	})

	installation, err := s.CreateInstallation(ctx, db.CreateInstallationParams{
		UserID:              user.ID,
		InstallationID:      time.Now().UnixNano(),
		AccountLogin:        "it-owner",
		AccountType:         "User",
		RepositorySelection: "selected",
	})
	if err != nil {
		t.Fatalf("create installation: %v", err)
	}

	if err := s.UpsertRepo(ctx, db.UpsertRepoParams{
		InstallationID: installation.ID,
		GithubRepoID:   time.Now().UnixNano(),
		Owner:          "it-owner",
		Name:           "it-repo",
		FullName:       "it-owner/it-repo",
		Private:        false,
	}); err != nil {
		t.Fatalf("upsert repo: %v", err)
	}
	repos, err := s.ListReposByInstallation(ctx, installation.ID)
	if err != nil || len(repos) == 0 {
		t.Fatalf("list repos: %v (n=%d)", err, len(repos))
	}

	workspace, err := s.CreateWorkspace(ctx, db.CreateWorkspaceParams{
		UserID:         user.ID,
		InstallationID: installation.ID,
		GithubRepoID:   repos[0].ID,
		Name:           "Integration Workspace",
		IssuePrefix:    "ITW",
	})
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	svc := NewIssueService(s)

	// 1. Create with an unmatched @mention → numbering + system hint.
	issue, err := svc.CreateIssue(ctx, workspace.ID, user.ID, user.Login, "Fix the thing", "please @coder handle this", "")
	if err != nil {
		t.Fatalf("create issue: %v", err)
	}
	if issue.Status != "backlog" {
		t.Fatalf("issue status = %q, want backlog", issue.Status)
	}
	if issue.IssueKey != "ITW-1" {
		t.Fatalf("issue key = %q, want ITW-1", issue.IssueKey)
	}
	if issue.CreatorName != user.Login {
		t.Fatalf("creator name = %q, want %q", issue.CreatorName, user.Login)
	}

	// 2. Second issue increments the number.
	issue2, err := svc.CreateIssue(ctx, workspace.ID, user.ID, user.Login, "Second", "", "")
	if err != nil {
		t.Fatalf("create issue 2: %v", err)
	}
	if issue2.IssueKey != "ITW-2" {
		t.Fatalf("issue 2 key = %q, want ITW-2", issue2.IssueKey)
	}

	// 3. List returns both.
	list, err := svc.ListIssues(ctx, workspace.ID)
	if err != nil {
		t.Fatalf("list issues: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("list len = %d, want 2", len(list))
	}

	// 4. Detail includes the system hint for the unmatched mention.
	detail, err := svc.GetIssue(ctx, workspace.ID, issue.ID)
	if err != nil {
		t.Fatalf("get issue: %v", err)
	}
	if len(detail.Comments) != 1 {
		t.Fatalf("comments len = %d, want 1", len(detail.Comments))
	}
	if detail.Comments[0].Type != "system" {
		t.Fatalf("comment type = %q, want system", detail.Comments[0].Type)
	}

	// 5. Status change appends a status_change comment.
	status := "in_progress"
	updated, err := svc.UpdateIssue(ctx, workspace.ID, issue.ID, user.Login, &status, nil, nil)
	if err != nil {
		t.Fatalf("update issue: %v", err)
	}
	if updated.Status != "in_progress" {
		t.Fatalf("updated status = %q, want in_progress", updated.Status)
	}
	if updated.CommentsCount != 2 {
		t.Fatalf("updated comments_count = %d, want 2 (system hint + status_change)", updated.CommentsCount)
	}

	detail, err = svc.GetIssue(ctx, workspace.ID, issue.ID)
	if err != nil {
		t.Fatalf("get issue after update: %v", err)
	}
	var sawStatusChange bool
	for _, c := range detail.Comments {
		if c.Type == "status_change" {
			sawStatusChange = true
		}
	}
	if !sawStatusChange {
		t.Fatalf("expected a status_change comment, got %+v", detail.Comments)
	}

	// 6. Comment with unmatched mention also appends a hint; empty is rejected.
	if _, err := svc.AddComment(ctx, workspace.ID, issue.ID, user.ID, user.Login, "   "); err != ErrEmptyComment {
		t.Fatalf("empty comment err = %v, want ErrEmptyComment", err)
	}
	if _, err := svc.AddComment(ctx, workspace.ID, issue.ID, user.ID, user.Login, "nice work @ghost"); err != nil {
		t.Fatalf("add comment: %v", err)
	}

	// 7. Invalid status is rejected.
	bad := "open"
	if _, err := svc.UpdateIssue(ctx, workspace.ID, issue.ID, user.Login, &bad, nil, nil); err != ErrInvalidStatus {
		t.Fatalf("invalid status err = %v, want ErrInvalidStatus", err)
	}
}
