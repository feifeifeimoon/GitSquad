package v1

import "github.com/google/uuid"

// WSAppAuthPayload is the first frame a browser sends on /ws/app: the user JWT
// plus the workspace it wants to subscribe to.
//
// Browsers cannot set headers on a WebSocket handshake, so the token has to
// travel either in the URL or in this frame. It is deliberately NOT a query
// parameter — a query token leaks into proxy logs, CDNs, and browser history.
type WSAppAuthPayload struct {
	Token       string `json:"token"`
	WorkspaceID string `json:"workspace_id"` // workspace id or slug
}

// AppEvent is a workspace-scoped event pushed to connected browsers.
//
// It is deliberately a refresh hint rather than a data payload: clients refetch
// the resource they are showing, which keeps the event schema stable as the UI
// grows and avoids duplicating API response shapes on the wire.
type AppEvent struct {
	Type        string    `json:"type"` // comment:created | issue:created | issue:updated
	WorkspaceID uuid.UUID `json:"workspace_id"`
	IssueID     uuid.UUID `json:"issue_id,omitempty"`
}

// App window event types.
const (
	AppEventCommentCreated = "comment:created"
	AppEventIssueCreated   = "issue:created"
	AppEventIssueUpdated   = "issue:updated"
)
