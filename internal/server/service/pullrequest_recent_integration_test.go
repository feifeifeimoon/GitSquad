package service

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/google/uuid"
)

// TestListRecentPullRequestsIntegration covers the workspace list's
// "Recent pull requests": the one PR read without a workspace in the path.
//
// What it promises: newest first across workspaces, the workspace on every row
// (the same key in two workspaces is two different pull requests), archived
// workspaces left out, another user's work absent, and the limit honoured.
func TestListRecentPullRequestsIntegration(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()

	user, err := s.CreateUser(ctx, db.CreateUserParams{
		Login: fmt.Sprintf("pr-feed-%s", uuid.NewString()[:8]),
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() { cleanupUserRows(t, ctx, pool, user.ID) })

	orion := createWorkspaceForTest(ctx, t, s, user.ID, "ORN", fmt.Sprintf("orn-%s", uuid.NewString()[:8]))
	atlas := createWorkspaceForTest(ctx, t, s, user.ID, "ATL", fmt.Sprintf("atl-%s", uuid.NewString()[:8]))
	archived := createWorkspaceForTest(ctx, t, s, user.ID, "ARC", fmt.Sprintf("arc-%s", uuid.NewString()[:8]))
	if err := s.UpdateWorkspaceStatus(ctx, db.UpdateWorkspaceStatusParams{
		ID: archived.ID, Status: "archived",
	}); err != nil {
		t.Fatalf("archive workspace: %v", err)
	}

	seed := func(wsID uuid.UUID, number int32, title string, updated time.Duration) uuid.UUID {
		t.Helper()
		pr, err := s.RecordRepoPullRequest(ctx, db.InsertRepoPullRequestParams{
			WorkspaceID: wsID, RepoOwner: "feed-owner", RepoName: "feed-repo",
			Number: number, Title: title, State: "open", HeadSha: fmt.Sprintf("sha-%d", number),
			// A time in the past, so ordering is a contract rather than a tie
			// between rows written in the same microsecond.
			GithubUpdatedAt: pgTime(t),
		})
		if err != nil {
			t.Fatalf("seed PR %d: %v", number, err)
		}
		if _, err := pool.Exec(ctx,
			`UPDATE pull_requests SET github_updated_at = now() - $2::interval WHERE id = $1`,
			pr.ID, updated.String(),
		); err != nil {
			t.Fatalf("age PR %d: %v", number, err)
		}
		return pr.ID
	}

	newest := seed(orion.ID, 104, "fix(webhook): count the attempt", 1*time.Hour)
	middle := seed(atlas.ID, 104, "fix(billing): stop double counting", 2*time.Hour)
	oldest := seed(orion.ID, 98, "feat(usage): tokens on the chart", 3*time.Hour)
	seed(archived.ID, 1, "chore: an archived workspace", 0)

	// Someone else's workspace, with its own PR.
	stranger, err := s.CreateUser(ctx, db.CreateUserParams{
		Login: fmt.Sprintf("pr-feed-stranger-%s", uuid.NewString()[:8]),
	})
	if err != nil {
		t.Fatalf("create stranger: %v", err)
	}
	t.Cleanup(func() { cleanupUserRows(t, ctx, pool, stranger.ID) })
	strangerWS := createWorkspaceForTest(ctx, t, s, stranger.ID, "STR", fmt.Sprintf("str-%s", uuid.NewString()[:8]))
	strangerPR := seed(strangerWS.ID, 7, "not yours", 0)

	svc := NewPullRequestService(s)
	list, err := svc.ListRecentPullRequests(ctx, user.ID, 10)
	if err != nil {
		t.Fatalf("list recent: %v", err)
	}
	if len(list) != 3 {
		t.Fatalf("list len = %d, want 3", len(list))
	}
	if list[0].ID != newest || list[1].ID != middle || list[2].ID != oldest {
		t.Errorf("order = [%d %d %d], want newest first", list[0].Number, list[1].Number, list[2].Number)
	}
	for _, item := range list {
		if item.ID == strangerPR {
			t.Error("leaked another user's pull request")
		}
		if item.WorkspaceSlug == "" || item.WorkspaceName == "" {
			t.Errorf("PR %d carries no workspace", item.Number)
		}
	}
	// The same number in two workspaces is two different pull requests, and the
	// workspace is what tells them apart.
	if list[0].WorkspaceSlug != orion.Slug || list[1].WorkspaceSlug != atlas.Slug {
		t.Errorf("workspaces = %q, %q; want %q, %q",
			list[0].WorkspaceSlug, list[1].WorkspaceSlug, orion.Slug, atlas.Slug)
	}

	// limit is honoured, and a zero asks for the default (5) rather than none.
	one, err := svc.ListRecentPullRequests(ctx, user.ID, 1)
	if err != nil {
		t.Fatalf("list recent (limit 1): %v", err)
	}
	if len(one) != 1 || one[0].ID != newest {
		t.Errorf("limit 1 returned %d rows", len(one))
	}
	all, err := svc.ListRecentPullRequests(ctx, user.ID, 0)
	if err != nil {
		t.Fatalf("list recent (limit 0): %v", err)
	}
	if len(all) != 3 {
		t.Errorf("default limit returned %d rows, want 3", len(all))
	}
}
