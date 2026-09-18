package service

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"testing"

	"github.com/feifeifeimoon/GitSquad/internal/server/database"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/google/uuid"
)

// TestWorkspaceResponseShapeIntegration guards two things that were wrong about
// the workspace API at once: neither read query selected avatar_url, so every
// response carried "" and an uploaded avatar vanished on the next load; and the
// response was the internal record, so the installation/repo ids, the owning
// user and the issue numbering all crossed the wire as zero values.
//
// Asserting the exact field set is the point — a field added to the record
// without a decision about whether it is public fails here.
//
// Skipped unless GITSQUAD_TEST_DATABASE_URL is set.
func TestWorkspaceResponseShapeIntegration(t *testing.T) {
	dsn := os.Getenv("GITSQUAD_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("GITSQUAD_TEST_DATABASE_URL not set; skipping integration test")
	}

	ctx := context.Background()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	// t.Cleanup, not defer: the row deletes registered below run through this
	// pool, and t.Cleanup is LIFO, so a defer here would close it first.
	t.Cleanup(pool.Close)
	if err := database.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	s := store.New(pool)
	// A nil GitHub service keeps the best-effort commit lookup out of the test:
	// ListWorkspaces skips it, which is also the path a deployment without the
	// GitHub App configured takes.
	svc := NewWorkspaceService(s, nil)

	user, err := s.CreateUser(ctx, db.CreateUserParams{
		Login:     fmt.Sprintf("ws-user-%s", uuid.NewString()[:8]),
		AvatarUrl: nil,
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() { cleanupUserRows(t, ctx, pool, user.ID) })

	slug := fmt.Sprintf("ws-%s", uuid.NewString()[:8])
	ws := createWorkspaceForTest(ctx, t, s, user.ID, "WS", slug)

	const avatar = "https://example.test/avatar.png"
	if err := svc.UpdateWorkspaceAvatar(ctx, ws.ID, avatar); err != nil {
		t.Fatalf("UpdateWorkspaceAvatar: %v", err)
	}

	// The list path reports the avatar that was just stored.
	list, err := svc.ListWorkspaces(ctx, user.ID)
	if err != nil {
		t.Fatalf("ListWorkspaces: %v", err)
	}
	listed := false
	for _, w := range list {
		if w.ID == ws.ID {
			listed = true
			if w.AvatarURL != avatar {
				t.Errorf("ListWorkspaces AvatarURL = %q, want %q", w.AvatarURL, avatar)
			}
		}
	}
	if !listed {
		t.Fatalf("seeded workspace %s missing from ListWorkspaces", ws.ID)
	}

	// So does the resolve path the detail page uses.
	one, err := svc.ResolveWorkspaceResponse(ctx, user.ID, slug)
	if err != nil {
		t.Fatalf("ResolveWorkspaceResponse: %v", err)
	}
	if one.AvatarURL != avatar {
		t.Errorf("ResolveWorkspaceResponse AvatarURL = %q, want %q", one.AvatarURL, avatar)
	}
	if one.Slug != slug {
		t.Errorf("ResolveWorkspaceResponse Slug = %q, want %q", one.Slug, slug)
	}

	// The wire carries the documented field set and nothing else.
	encoded, err := json.Marshal(one)
	if err != nil {
		t.Fatalf("marshal workspace: %v", err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &fields); err != nil {
		t.Fatalf("unmarshal workspace: %v", err)
	}

	want := []string{
		"id", "slug", "name", "status", "avatar_url", "created_at",
		"repo_full_name", "repo_owner", "repo_name", "repo_private",
		"last_commit_message", "last_commit_author", "last_commit_at",
	}
	got := make([]string, 0, len(fields))
	for name := range fields {
		got = append(got, name)
	}
	sort.Strings(got)
	if len(fields) != len(want) {
		t.Errorf("workspace response has %d fields, want %d: %v", len(fields), len(want), got)
	}
	for _, name := range want {
		if _, ok := fields[name]; !ok {
			t.Errorf("workspace response is missing %q (got %v)", name, got)
		}
	}

	// Named explicitly so the intent survives a future edit to `want`: these are
	// the columns that must not cross this boundary.
	for _, name := range []string{"user_id", "installation_id", "github_repo_id", "issue_prefix", "issue_counter", "updated_at"} {
		if _, ok := fields[name]; ok {
			t.Errorf("workspace response leaks internal field %q", name)
		}
	}
}
