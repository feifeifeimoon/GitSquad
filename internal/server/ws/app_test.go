package ws

import (
	"encoding/json"
	"testing"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

func TestHubWakeSendsTaskWake(t *testing.T) {
	hub := NewHub(0) // no stale detection
	defer hub.Close()

	daemonID := uuid.New()
	conn := &Conn{send: make(chan []byte, 4)}
	hub.Register(daemonID.String(), conn)

	hub.Wake(daemonID)

	select {
	case data := <-conn.send:
		var f Frame
		if err := json.Unmarshal(data, &f); err != nil {
			t.Fatalf("unmarshal frame: %v", err)
		}
		if f.Type != TypeTaskWake {
			t.Fatalf("frame type = %q, want %q", f.Type, TypeTaskWake)
		}
		// The daemon unmarshals the payload before signalling; an empty payload
		// would be rejected, so it must be valid JSON.
		var p v1.WSTaskWakePayload
		if err := json.Unmarshal(f.Payload, &p); err != nil {
			t.Fatalf("payload is not a valid task_wake payload: %v", err)
		}
	default:
		t.Fatal("Wake delivered nothing to a connected daemon")
	}

	// Waking a daemon with no connection is a no-op, not a panic.
	hub.Wake(uuid.New())
}

func TestAppHubPublishesToSubscribers(t *testing.T) {
	hub := NewAppHub()
	workspace, other := uuid.New(), uuid.New()

	a := &AppConn{send: make(chan []byte, 4), workspaceID: workspace}
	b := &AppConn{send: make(chan []byte, 4), workspaceID: workspace}
	c := &AppConn{send: make(chan []byte, 4), workspaceID: other}
	hub.subscribe(workspace, a)
	hub.subscribe(workspace, b)
	hub.subscribe(other, c)

	hub.Publish(v1.AppEvent{Type: v1.AppEventCommentCreated, WorkspaceID: workspace, IssueID: uuid.New()})

	if len(a.send) != 1 || len(b.send) != 1 {
		t.Fatalf("subscribers missed the event: a=%d b=%d", len(a.send), len(b.send))
	}
	if len(c.send) != 0 {
		t.Fatal("another workspace must not receive the event")
	}

	hub.unsubscribe(workspace, a)
	hub.Publish(v1.AppEvent{Type: v1.AppEventIssueUpdated, WorkspaceID: workspace})
	if len(a.send) != 1 {
		t.Fatal("unsubscribed connection still received an event")
	}
	if len(b.send) != 2 {
		t.Fatalf("remaining subscriber send = %d, want 2", len(b.send))
	}
}

func TestAppHubDropsForSlowConsumer(t *testing.T) {
	hub := NewAppHub()
	workspace := uuid.New()
	slow := &AppConn{send: make(chan []byte, 1), workspaceID: workspace}
	hub.subscribe(workspace, slow)

	// Publishing past the buffer must drop, not block the publisher.
	for i := 0; i < 5; i++ {
		hub.Publish(v1.AppEvent{Type: v1.AppEventCommentCreated, WorkspaceID: workspace})
	}
	if len(slow.send) != 1 {
		t.Fatalf("slow consumer buffer = %d, want 1", len(slow.send))
	}
}
