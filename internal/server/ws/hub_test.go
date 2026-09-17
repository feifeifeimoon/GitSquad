package ws

import (
	"sync"
	"testing"
	"time"
)

func TestRegisterReplacesAndClosesPreviousConnection(t *testing.T) {
	hub := NewHub(0)
	defer hub.Close()

	var disconnects int
	hub.OnDisconnect = func(string) { disconnects++ }

	first := authenticatedConn(hub, "d1")
	hub.Register(first)

	second := authenticatedConn(hub, "d1")
	hub.Register(second)

	if !first.Closed() {
		t.Fatal("the replaced connection must be closed, not left dangling")
	}
	if current, ok := hub.current("d1"); !ok || current != second {
		t.Fatal("the newest connection must be the registered one")
	}
	if disconnects != 0 {
		t.Fatalf("replacing a connection is not a disconnect; got %d notifications", disconnects)
	}
}

// The regression that marked live daemons offline.
//
// A daemon reconnects while the server still holds its previous connection. The
// old socket is closed, the read loop exits, and its deferred cleanup runs. That
// cleanup used to remove whichever connection was registered under the daemon id
// — the live one — and then fire OnDisconnect, which marks the daemon offline and
// fails every task it is running.
func TestLateCleanupFromReplacedConnectionKeepsTheLiveOne(t *testing.T) {
	hub := NewHub(0)
	defer hub.Close()

	var mu sync.Mutex
	var notified []string
	hub.OnDisconnect = func(id string) {
		mu.Lock()
		notified = append(notified, id)
		mu.Unlock()
	}

	old := authenticatedConn(hub, "d1")
	hub.Register(old)

	live := authenticatedConn(hub, "d1")
	hub.Register(live)

	// old's read loop finally notices its socket is gone and cleans up.
	hub.Unregister(old)

	if current, ok := hub.current("d1"); !ok || current != live {
		t.Fatal("a stale cleanup evicted the live connection")
	}
	mu.Lock()
	if len(notified) != 0 {
		mu.Unlock()
		t.Fatalf("a stale cleanup must not report the daemon as disconnected: %v", notified)
	}
	mu.Unlock()

	// The live connection still reports normally when it really goes away.
	hub.Unregister(live)

	mu.Lock()
	defer mu.Unlock()
	if len(notified) != 1 || notified[0] != "d1" {
		t.Fatalf("notifications = %v, want exactly one for d1", notified)
	}
	if _, ok := hub.current("d1"); ok {
		t.Fatal("the connection should be gone after its own cleanup")
	}
}

// A silent connection is evicted *and* closed.
//
// Dropping only the map entry left the daemon holding a live socket to a server
// that had forgotten it: no wake could reach it (Send reported "not connected")
// and, because the socket never dropped, the daemon never learned to reconnect.
func TestStaleConnectionIsClosedAndReported(t *testing.T) {
	hub := NewHub(20 * time.Millisecond)
	defer hub.Close()

	notified := make(chan string, 4)
	hub.OnDisconnect = func(id string) { notified <- id }

	conn := authenticatedConn(hub, "d1")
	hub.Register(conn)

	select {
	case id := <-notified:
		if id != "d1" {
			t.Fatalf("notified %q, want d1", id)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("a silent connection was never evicted")
	}

	if !conn.Closed() {
		t.Fatal("eviction must close the socket so the daemon notices")
	}
	if _, ok := hub.current("d1"); ok {
		t.Fatal("an evicted connection must be removed from the hub")
	}
	if n := len(notified); n != 0 {
		t.Fatalf("an eviction must report the daemon exactly once; %d extra notifications", n)
	}
}

// Register publishes the connection the caller prepared: the hub must not be the
// thing that fills in DaemonID, because that write would race the read loop.
func TestRegisterUsesTheCallersIdentity(t *testing.T) {
	hub := NewHub(0)
	defer hub.Close()

	conn := authenticatedConn(hub, "d7")
	hub.Register(conn)

	current, ok := hub.current("d7")
	if !ok || current != conn {
		t.Fatal("the connection was not published under its own daemon id")
	}
	if !conn.Authenticated {
		t.Fatal("Register must not clear the caller's authentication flag")
	}
}

func authenticatedConn(hub *Hub, daemonID string) *Conn {
	conn := newConn(nil, hub, nil)
	conn.DaemonID = daemonID
	conn.Authenticated = true
	return conn
}

// ── disconnect grace ───────────────────────────────────────────────────
//
// A socket ending is not evidence that the daemon is gone. These pin the two
// halves of that: a redial inside the window must report nothing, and a daemon
// that stays away must still be reported exactly once.

func TestFastReconnectIsNotReportedAsADisconnect(t *testing.T) {
	hub := NewHub(0, WithDisconnectGrace(50*time.Millisecond))
	defer hub.Close()

	notified := make(chan string, 4)
	hub.OnDisconnect = func(id string) { notified <- id }

	first := authenticatedConn(hub, "d1")
	hub.Register(first)

	// The socket dies and the daemon redials straight away — the shape of a NAT
	// rebind or a laptop resuming from sleep.
	hub.Unregister(first)
	second := authenticatedConn(hub, "d1")
	hub.Register(second)

	// Wait well past the grace: a cancelled notification must never arrive.
	select {
	case id := <-notified:
		t.Fatalf("a reconnect inside the grace window must not report a disconnect, got %q", id)
	case <-time.After(200 * time.Millisecond):
	}

	if current, ok := hub.current("d1"); !ok || current != second {
		t.Fatal("the redialed connection must be the registered one")
	}
}

func TestDisconnectIsReportedOnceTheGraceElapses(t *testing.T) {
	hub := NewHub(0, WithDisconnectGrace(30*time.Millisecond))
	defer hub.Close()

	notified := make(chan string, 4)
	hub.OnDisconnect = func(id string) { notified <- id }

	conn := authenticatedConn(hub, "d1")
	hub.Register(conn)
	hub.Unregister(conn)

	// The pool entry goes immediately — wakes must not be queued at a dead
	// socket just because the status report is being held back.
	if _, ok := hub.current("d1"); ok {
		t.Fatal("a disconnected connection must leave the pool at once")
	}

	select {
	case id := <-notified:
		if id != "d1" {
			t.Fatalf("notified %q, want d1", id)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("a daemon that never came back was never reported as disconnected")
	}

	select {
	case id := <-notified:
		t.Fatalf("a disconnect must be reported exactly once; second report %q", id)
	case <-time.After(100 * time.Millisecond):
	}
}

// Without the option the old behaviour stands: a disconnect is reported as soon
// as it is seen. The grace is opt-in, not a silent change of default.
func TestDisconnectIsImmediateWithoutAGrace(t *testing.T) {
	hub := NewHub(0)
	defer hub.Close()

	notified := make(chan string, 4)
	hub.OnDisconnect = func(id string) { notified <- id }

	conn := authenticatedConn(hub, "d1")
	hub.Register(conn)
	hub.Unregister(conn)

	select {
	case id := <-notified:
		if id != "d1" {
			t.Fatalf("notified %q, want d1", id)
		}
	default:
		t.Fatal("Unregister must report a disconnect synchronously when no grace is configured")
	}
}

// A pending disconnect carries the connection that left. A stale timer must not
// consume the entry belonging to a newer connection, or it would report that
// newer connection's disconnect before its own window had elapsed.
func TestAPendingDisconnectIsKeyedByItsConnection(t *testing.T) {
	hub := NewHub(0, WithDisconnectGrace(time.Hour))
	defer hub.Close()

	notified := make(chan string, 4)
	hub.OnDisconnect = func(id string) { notified <- id }

	old := authenticatedConn(hub, "d1")
	hub.Register(old)
	hub.Unregister(old)

	live := authenticatedConn(hub, "d1")
	hub.Register(live) // cancels old's pending entry
	hub.Unregister(live)

	// old's timer fires late.
	hub.fireDisconnect("d1", old)

	select {
	case id := <-notified:
		t.Fatalf("a stale timer reported a disconnect it does not own: %q", id)
	case <-time.After(50 * time.Millisecond):
	}
}

// A hub that is going away reports what it was still holding rather than
// dropping it, so shutdown does not leave daemons looking connected.
func TestCloseReportsDisconnectsStillInsideTheirGrace(t *testing.T) {
	hub := NewHub(0, WithDisconnectGrace(time.Hour))

	notified := make(chan string, 4)
	hub.OnDisconnect = func(id string) { notified <- id }

	conn := authenticatedConn(hub, "d1")
	hub.Register(conn)
	hub.Unregister(conn)

	hub.Close()

	select {
	case id := <-notified:
		if id != "d1" {
			t.Fatalf("notified %q, want d1", id)
		}
	case <-time.After(time.Second):
		t.Fatal("Close must not wait out the grace window")
	}

	// The timer was stopped, so the notification does not arrive a second time.
	select {
	case id := <-notified:
		t.Fatalf("Close drained the entry and the timer fired too: %q", id)
	case <-time.After(50 * time.Millisecond):
	}
}
