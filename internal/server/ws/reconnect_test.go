package ws

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// A reconnecting daemon must survive the cleanup of its previous socket, over
// real sockets rather than by calling the hub directly.
//
// The sequence reproduced here is the one observed in production: the daemon
// reconnects after a network blip, and only afterwards does the server notice the
// old socket is gone and run its deferred cleanup.
func TestReconnectSurvivesLateCleanupOfThePreviousSocket(t *testing.T) {
	hub := NewHub(0)
	defer hub.Close()

	var mu sync.Mutex
	var disconnects []string
	hub.OnDisconnect = func(id string) {
		mu.Lock()
		disconnects = append(disconnects, id)
		mu.Unlock()
	}

	daemonID := uuid.New().String()
	srv := newDaemonServer(t, hub, daemonID)

	first := dialDaemon(t, srv.URL, daemonID)
	_ = first

	// Registering the second connection closes the first one server-side, which
	// makes its read loop exit and run its deferred cleanup.
	second := dialDaemon(t, srv.URL, daemonID)

	// Settle: the deferred cleanup runs as soon as the server's read loop
	// unblocks, which is immediate, but the assertion below is a negative and
	// needs it to have happened.
	time.Sleep(250 * time.Millisecond)

	mu.Lock()
	got := append([]string(nil), disconnects...)
	mu.Unlock()
	if len(got) != 0 {
		t.Fatalf("a reconnect must not report a disconnect, got %v", got)
	}

	// The live connection must still be the one the hub holds: a wake has to
	// arrive on the second socket.
	hub.Wake(uuid.MustParse(daemonID))

	if err := second.SetReadDeadline(time.Now().Add(3 * time.Second)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}
	_, msg, err := second.ReadMessage()
	if err != nil {
		t.Fatalf("the live connection received no wake: %v", err)
	}
	var frame Frame
	if err := json.Unmarshal(msg, &frame); err != nil {
		t.Fatalf("unmarshal wake frame: %v", err)
	}
	if frame.Type != TypeTaskWake {
		t.Fatalf("frame type = %q, want %q", frame.Type, TypeTaskWake)
	}
}

// A daemon that drops its socket and redials straight away must not be reported
// as disconnected.
//
// This is the shape of a NAT rebind or a laptop resuming from sleep: the old
// socket ends, the daemon is back sub-second later, and it never stopped running
// its task. Reporting the drop would mark a live daemon offline and fail work it
// is still executing, so the hub holds the report back and cancels it.
func TestDropThenImmediateRedialIsNotADisconnect(t *testing.T) {
	hub := NewHub(0, WithDisconnectGrace(500*time.Millisecond))
	defer hub.Close()

	var mu sync.Mutex
	var disconnects []string
	hub.OnDisconnect = func(id string) {
		mu.Lock()
		disconnects = append(disconnects, id)
		mu.Unlock()
	}

	daemonID := uuid.New().String()
	srv := newDaemonServer(t, hub, daemonID)

	first := dialDaemon(t, srv.URL, daemonID)
	_ = first.Close() // the socket dies
	second := dialDaemon(t, srv.URL, daemonID)

	// Wait comfortably past the grace window.
	time.Sleep(900 * time.Millisecond)

	mu.Lock()
	got := append([]string(nil), disconnects...)
	mu.Unlock()
	if len(got) != 0 {
		t.Fatalf("a redial inside the grace window must not report a disconnect, got %v", got)
	}

	// The live socket is the one the hub holds, so a wake still reaches it.
	hub.Wake(uuid.MustParse(daemonID))
	if err := second.SetReadDeadline(time.Now().Add(3 * time.Second)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}
	_, msg, err := second.ReadMessage()
	if err != nil {
		t.Fatalf("the live connection received no wake: %v", err)
	}
	var frame Frame
	if err := json.Unmarshal(msg, &frame); err != nil {
		t.Fatalf("unmarshal wake frame: %v", err)
	}
	if frame.Type != TypeTaskWake {
		t.Fatalf("frame type = %q, want %q", frame.Type, TypeTaskWake)
	}
}

// The other half of the same rule: a daemon that does not come back must still
// be reported, or the grace would just be a way to never notice a dead daemon.
func TestDropWithNoRedialIsReported(t *testing.T) {
	hub := NewHub(0, WithDisconnectGrace(100*time.Millisecond))
	defer hub.Close()

	notified := make(chan string, 4)
	hub.OnDisconnect = func(id string) { notified <- id }

	daemonID := uuid.New().String()
	srv := newDaemonServer(t, hub, daemonID)

	first := dialDaemon(t, srv.URL, daemonID)
	_ = first.Close()

	select {
	case id := <-notified:
		if id != daemonID {
			t.Fatalf("notified %q, want %q", id, daemonID)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("a daemon that never came back was never reported as disconnected")
	}
}

// newDaemonServer serves the daemon WS endpoint with a stand-in auth handler:
// the same publish order as the real one, no database.
func newDaemonServer(t *testing.T, hub *Hub, daemonID string) *httptest.Server {
	t.Helper()

	disp := NewDispatcher()
	disp.On(TypeAuth, func(conn *Conn, hub *Hub, frame Frame) *Frame {
		conn.DaemonID = daemonID
		conn.Authenticated = true
		hub.Register(conn)
		return &Frame{Type: TypeAuthAck}
	})

	srv := httptest.NewServer(Upgrade(hub, disp))
	t.Cleanup(srv.Close)
	return srv
}

// dialDaemon opens a daemon socket, authenticates it, and waits for the ack.
func dialDaemon(t *testing.T, baseURL, daemonID string) *websocket.Conn {
	t.Helper()

	url := "ws" + strings.TrimPrefix(baseURL, "http") + "/ws/daemon"
	conn, _, err := websocket.DefaultDialer.Dial(url, http.Header{})
	if err != nil {
		t.Fatalf("dial %s: %v", url, err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	payload, err := json.Marshal(map[string]string{"daemon_id": daemonID, "token": "test-token"})
	if err != nil {
		t.Fatalf("marshal auth payload: %v", err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, []byte(frameJSON(t, Frame{Type: TypeAuth, Payload: payload}))); err != nil {
		t.Fatalf("write auth frame: %v", err)
	}

	if err := conn.SetReadDeadline(time.Now().Add(3 * time.Second)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}
	if _, _, err := conn.ReadMessage(); err != nil {
		t.Fatalf("read auth ack: %v", err)
	}
	return conn
}

func frameJSON(t *testing.T, f Frame) string {
	t.Helper()
	b, err := json.Marshal(f)
	if err != nil {
		t.Fatalf("marshal frame: %v", err)
	}
	return string(b)
}
