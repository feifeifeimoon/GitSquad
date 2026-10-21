package service

import (
	"context"
	"errors"
	"testing"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

func TestUpdatePRReviewIntegration(t *testing.T) {
	s, pool := openTestStore(t)
	ctx := context.Background()
	f := seedTaskFixture(t, ctx, s, pool)
	svc := NewWorkspaceService(s, nil)

	on := v1.PRReviewConfig{
		Enabled: true, AgentID: &f.agent.ID, Trigger: "opened",
		IgnoreDrafts: true, AuthorScope: "collaborators", InlineComments: true,
	}
	ws, err := svc.UpdatePRReview(ctx, f.workspace.UserID, f.workspace.ID, on)
	if err != nil {
		t.Fatalf("enable review: %v", err)
	}
	if ws.PRReview == nil || !ws.PRReview.Enabled || ws.PRReview.AgentID == nil || *ws.PRReview.AgentID != f.agent.ID {
		t.Fatalf("workspace review config = %+v", ws.PRReview)
	}

	off := v1.PRReviewConfig{Enabled: false, Trigger: "manual", AuthorScope: "all"}
	if _, err := svc.UpdatePRReview(ctx, f.workspace.UserID, f.workspace.ID, off); err != nil {
		t.Fatalf("disable review: %v", err)
	}

	if _, err := svc.UpdatePRReview(ctx, f.workspace.UserID, f.workspace.ID, v1.PRReviewConfig{Enabled: true}); !errors.Is(err, ErrReviewerNotRunnable) {
		t.Fatalf("enabled without an agent: got %v", err)
	}
	foreign := uuid.New()
	if _, err := svc.UpdatePRReview(ctx, f.workspace.UserID, f.workspace.ID, v1.PRReviewConfig{Enabled: true, AgentID: &foreign}); !errors.Is(err, ErrReviewerNotRunnable) {
		t.Fatalf("foreign agent: got %v", err)
	}
	bad := on
	bad.Trigger = "sometimes"
	if _, err := svc.UpdatePRReview(ctx, f.workspace.UserID, f.workspace.ID, bad); !errors.Is(err, ErrInvalidReviewConfig) {
		t.Fatalf("bad trigger: got %v", err)
	}
	if _, err := svc.UpdatePRReview(ctx, uuid.New(), f.workspace.ID, on); !errors.Is(err, ErrWorkspaceNotFound) {
		t.Fatalf("other user: got %v", err)
	}
}
