package service

import (
	"context"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

// appendIssueComment is the shared shape of "something happened, say it on the
// issue": the task lifecycle comments and the pull request notices both use it,
// so they land in the same feed the same way.
//
// It lives here rather than on one service because two of them write comments
// now, and a comment that only one of them could publish would show up
// differently depending on which subsystem noticed first.
func appendIssueComment(ctx context.Context, st *store.Store, publisher EventPublisher, workspaceID, issueID uuid.UUID, authorType, authorName, content string) error {
	_, err := st.CreateComment(ctx, db.CreateCommentParams{
		IssueID:    issueID,
		AuthorType: authorType,
		AuthorName: authorName,
		Type:       "comment",
		Content:    content,
	})
	if err != nil {
		return err
	}
	if publisher != nil {
		publisher.Publish(v1.AppEvent{Type: v1.AppEventCommentCreated, WorkspaceID: workspaceID, IssueID: issueID})
	}
	return nil
}
