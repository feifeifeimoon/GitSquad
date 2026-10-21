package service

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/feifeifeimoon/GitSquad/internal/server/database"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// A GitHub redelivery carries the same X-GitHub-Delivery. The insert has to
// report that it did not create a row so the caller can skip side effects.
func TestCreateWebhookEventIsIdempotentIntegration(t *testing.T) {
	dsn := os.Getenv("GITSQUAD_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("GITSQUAD_TEST_DATABASE_URL not set; skipping integration test")
	}
	ctx := context.Background()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(pool.Close)
	if err := database.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	st := store.New(pool)

	delivery := "delivery-" + uuid.NewString()
	action := "opened"
	params := db.CreateWebhookEventParams{
		GithubDeliveryID: &delivery,
		EventType:        "pull_request",
		Action:           &action,
		Payload:          []byte(`{"action":"opened"}`),
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM webhook_events WHERE github_delivery_id = $1`, delivery)
	})

	if _, err := st.CreateWebhookEvent(ctx, params); err != nil {
		t.Fatalf("first insert: %v", err)
	}
	if _, err := st.CreateWebhookEvent(ctx, params); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("duplicate insert: got %v, want pgx.ErrNoRows", err)
	}
}
