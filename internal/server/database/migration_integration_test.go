package database

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestStatusCheckConstraintsIntegration proves the status vocabularies migration
// 041 declares are actually enforced by Postgres. No unit test can see this: they
// never touch a database, so a constraint whose value list has a typo, or one
// that was never applied at all, would pass them silently — which is exactly how
// these columns went unconstrained in the first place.
//
// It is skipped unless GITSQUAD_TEST_DATABASE_URL is set.
func TestStatusCheckConstraintsIntegration(t *testing.T) {
	dsn := os.Getenv("GITSQUAD_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("GITSQUAD_TEST_DATABASE_URL not set; skipping integration test")
	}

	ctx := context.Background()
	pool, err := Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	// Registered before the fixture's own cleanup so that it runs after it:
	// t.Cleanup is LIFO, whereas a plain defer would close the pool while the
	// fixture still had rows to delete.
	t.Cleanup(pool.Close)

	// Every server boot runs Migrate, so a second pass has to be a no-op rather
	// than a duplicate_object error.
	for pass := 1; pass <= 2; pass++ {
		if err := Migrate(ctx, pool); err != nil {
			t.Fatalf("migrate (pass %d): %v", pass, err)
		}
	}

	f := newStatusFixture(t, ctx, pool)

	// The rejected value in each case is a plausible typo rather than random
	// noise: "revoked" and "suspended" are real statuses elsewhere in the schema,
	// which is how a copy-paste between vocabularies goes wrong.
	t.Run("daemon_tokens", func(t *testing.T) {
		assertStatusSet(t, ctx, func(status string) error {
			_, err := pool.Exec(ctx,
				`INSERT INTO daemon_tokens (token_hash, status) VALUES ($1, $2)`,
				"statuscheck-"+uuid.NewString(), status)
			return err
		}, []string{"pending", "active", "expired"}, "revoked")
	})

	t.Run("daemons", func(t *testing.T) {
		assertStatusSet(t, ctx, func(status string) error {
			_, err := pool.Exec(ctx,
				`INSERT INTO daemons (user_id, name, status) VALUES ($1, $2, $3)`,
				f.userID, "statuscheck-"+uuid.NewString(), status)
			return err
		}, []string{"online", "offline"}, "stale")
	})

	t.Run("runtimes", func(t *testing.T) {
		assertStatusSet(t, ctx, func(status string) error {
			_, err := pool.Exec(ctx,
				`INSERT INTO runtimes (daemon_id, kind, name, status) VALUES ($1, 'claude', $2, $3)`,
				f.daemonID, "statuscheck-"+uuid.NewString(), status)
			return err
		}, []string{"unknown", "available", "error"}, "missing")
	})

	t.Run("workspaces", func(t *testing.T) {
		assertStatusSet(t, ctx, func(status string) error {
			_, err := pool.Exec(ctx,
				`INSERT INTO workspaces (user_id, installation_id, github_repo_id, name, status, slug)
				 VALUES ($1, $2, $3, 'statuscheck', $4, $5)`,
				f.userID, f.installID, f.repoID, status, "statuscheck-"+uuid.NewString())
			return err
		}, []string{"active", "archived"}, "deleted")
	})

	t.Run("github_installations", func(t *testing.T) {
		assertStatusSet(t, ctx, func(status string) error {
			_, err := pool.Exec(ctx,
				`INSERT INTO github_installations (user_id, installation_id, account_login, account_type, status)
				 VALUES ($1, $2, 'statuscheck', 'User', $3)`,
				f.userID, f.nextID(), status)
			return err
		}, []string{"active", "revoked"}, "suspended")
	})
}

// assertStatusSet inserts every allowed status (each must be accepted) and then
// the rejected one, which must fail as a check-constraint violation. Asserting
// the SQLSTATE matters: it separates "the CHECK refused this" from "the insert
// broke for some unrelated reason", which would otherwise let the test pass
// while proving nothing.
func assertStatusSet(t *testing.T, ctx context.Context, insert func(status string) error, allowed []string, rejected string) {
	t.Helper()

	for _, status := range allowed {
		if err := insert(status); err != nil {
			t.Errorf("status %q rejected, want accepted: %v", status, err)
		}
	}

	err := insert(rejected)
	if err == nil {
		t.Fatalf("status %q accepted, want a check-constraint violation", rejected)
	}
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
		t.Fatalf("status %q failed with %v, want SQLSTATE 23514 (check_violation)", rejected, err)
	}
}

// statusFixture owns one user and the rows the status tables hang off, so each
// subtest inserts only the row it is actually testing.
type statusFixture struct {
	userID    uuid.UUID
	installID uuid.UUID
	repoID    uuid.UUID
	daemonID  uuid.UUID

	seq int64
}

// nextID hands out values for the BIGINT columns that are UNIQUE, which cannot
// be a constant because each subtest inserts more than one row.
func (f *statusFixture) nextID() int64 {
	f.seq++
	return f.seq
}

func newStatusFixture(t *testing.T, ctx context.Context, pool *pgxpool.Pool) *statusFixture {
	t.Helper()

	f := &statusFixture{}
	suffix := uuid.NewString()
	// Seeded from the clock so concurrent runs against one database do not
	// collide on the UNIQUE BIGINT columns.
	f.seq = time.Now().UnixNano()

	if err := pool.QueryRow(ctx,
		`INSERT INTO users (login) VALUES ($1) RETURNING id`,
		"statuscheck-"+suffix).Scan(&f.userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	if err := pool.QueryRow(ctx,
		`INSERT INTO github_installations (user_id, installation_id, account_login, account_type)
		 VALUES ($1, $2, $3, 'User') RETURNING id`,
		f.userID, f.nextID(), "statuscheck").Scan(&f.installID); err != nil {
		t.Fatalf("seed installation: %v", err)
	}

	if err := pool.QueryRow(ctx,
		`INSERT INTO github_repos (installation_id, github_repo_id, owner, name, full_name)
		 VALUES ($1, $2, 'statuscheck', 'repo', $3) RETURNING id`,
		f.installID, f.nextID(), "statuscheck/repo-"+suffix).Scan(&f.repoID); err != nil {
		t.Fatalf("seed repo: %v", err)
	}

	// Seeded with the column default, so this also exercises the CHECK against
	// a row that never named a status at all.
	if err := pool.QueryRow(ctx,
		`INSERT INTO daemons (user_id, name) VALUES ($1, $2) RETURNING id`,
		f.userID, "statuscheck-"+suffix).Scan(&f.daemonID); err != nil {
		t.Fatalf("seed daemon: %v", err)
	}

	t.Cleanup(func() {
		// Reverse foreign-key order; the fixture owns every row it created. The
		// token rows are keyed by the test's prefix rather than by user, because
		// an unconfirmed pairing token has no user yet.
		for _, cleanup := range []struct {
			sql string
			arg any
		}{
			{`DELETE FROM workspaces WHERE user_id = $1`, f.userID},
			{`DELETE FROM runtimes WHERE daemon_id IN (SELECT id FROM daemons WHERE user_id = $1)`, f.userID},
			{`DELETE FROM daemons WHERE user_id = $1`, f.userID},
			{`DELETE FROM github_repos WHERE installation_id IN (SELECT id FROM github_installations WHERE user_id = $1)`, f.userID},
			{`DELETE FROM github_installations WHERE user_id = $1`, f.userID},
			{`DELETE FROM daemon_tokens WHERE token_hash LIKE $1`, "statuscheck-%"},
			{`DELETE FROM users WHERE id = $1`, f.userID},
		} {
			if _, err := pool.Exec(ctx, cleanup.sql, cleanup.arg); err != nil {
				t.Errorf("cleanup %q: %v", cleanup.sql, err)
			}
		}
	})

	return f
}
