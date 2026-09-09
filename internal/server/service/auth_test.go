package service

import (
	"context"
	"os"
	"testing"

	"github.com/feifeifeimoon/GitSquad/internal/server/auth"
	"github.com/feifeifeimoon/GitSquad/internal/server/database"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
)

// TestAuthServiceE2ELoginIntegration verifies the E2E token-minting path
// against a real Postgres instance. It is skipped unless
// GITSQUAD_TEST_DATABASE_URL is set, so `go test ./...` stays green in CI
// without a database.
func TestAuthServiceE2ELoginIntegration(t *testing.T) {
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
	userSvc := NewUserService(s)
	authSvc := NewAuthService(userSvc, "test-secret")

	first, err := authSvc.E2ELogin(ctx, "E2E User")
	if err != nil {
		t.Fatalf("E2ELogin() error = %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, "DELETE FROM user_identities WHERE user_id = $1", first.User.ID)
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE id = $1", first.User.ID)
	})

	if first.Token == "" {
		t.Fatal("E2ELogin() returned an empty token")
	}
	if first.User.Login != "E2E User" {
		t.Fatalf("Login = %q, want %q", first.User.Login, "E2E User")
	}

	subject, err := auth.ParseToken(first.Token, "test-secret")
	if err != nil {
		t.Fatalf("ParseToken() error = %v", err)
	}
	if subject != first.User.ID.String() {
		t.Fatalf("token subject = %q, want %q", subject, first.User.ID.String())
	}

	// A second login must reuse the same user (idempotent) rather than
	// creating a duplicate.
	second, err := authSvc.E2ELogin(ctx, "E2E User")
	if err != nil {
		t.Fatalf("second E2ELogin() error = %v", err)
	}
	if second.User.ID != first.User.ID {
		t.Fatalf("second login user id = %s, want %s", second.User.ID, first.User.ID)
	}
}
