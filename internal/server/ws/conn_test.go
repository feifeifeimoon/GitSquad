package ws

import (
	"sync"
	"testing"
	"time"
)

// A connection that closes while a frame handler is still in flight must not
// take the process down.
//
// This is the regression for the old design, where run() closed the send channel
// as soon as the read loop returned and writeResponse sent into it. Sending on a
// closed channel panics unconditionally, `select` with `default` does not guard
// it, and the handler runs in its own goroutine — so one daemon disconnecting
// mid-heartbeat killed the whole server.
func TestSendAfterCloseDoesNotPanic(t *testing.T) {
	hub := NewHub(0)
	defer hub.Close()

	disp := NewDispatcher()
	conn := newConn(nil, hub, disp)
	conn.DaemonID = "d1"
	conn.Authenticated = true
	hub.Register(conn)

	conn.Close()

	// Both write paths must survive a closed connection.
	disp.writeResponse(conn, &Frame{Type: TypeHeartbeatAck})
	if err := hub.Send("d1", Frame{Type: TypeTaskWake}); err == nil {
		t.Fatal("Send on a closed connection must report an error")
	}
}

func TestTrySendReportsClosedAndFull(t *testing.T) {
	hub := NewHub(0)
	defer hub.Close()

	conn := newConn(nil, hub, nil)

	for i := 0; i < cap(conn.send); i++ {
		if err := conn.trySend([]byte("x")); err != nil {
			t.Fatalf("trySend %d on an empty buffer: %v", i, err)
		}
	}
	if err := conn.trySend([]byte("x")); err != errSendFull {
		t.Fatalf("trySend on a full buffer = %v, want errSendFull", err)
	}

	conn.Close()
	if err := conn.trySend([]byte("x")); err != errConnClosed {
		t.Fatalf("trySend on a closed connection = %v, want errConnClosed", err)
	}
}

// touch() runs on the read loop while stale detection reads the same field from
// the hub's ticker. CI runs the suite with -race; this test is what makes a
// regression to a plain time.Time field (guarded only by the hub's RLock, which
// serialises nothing against an unlocked writer) fail rather than linger.
func TestTouchIsRaceFreeWithStaleDetection(t *testing.T) {
	hub := NewHub(0)
	defer hub.Close()

	conn := newConn(nil, hub, nil)
	conn.DaemonID = "d1"
	conn.Authenticated = true
	hub.Register(conn)

	stop := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stop:
				return
			default:
				conn.touch()
			}
		}
	}()

	for i := 0; i < 2000; i++ {
		_ = hub.staleConns(time.Minute)
	}
	close(stop)
	wg.Wait()
}

func TestCloseIsIdempotent(t *testing.T) {
	hub := NewHub(0)
	defer hub.Close()

	conn := newConn(nil, hub, nil)
	conn.Close()
	conn.Close() // must not panic on the second close

	if !conn.Closed() {
		t.Fatal("Closed() = false after Close()")
	}
}

// The invariant the C3 fix rests on: the send channel is never closed.
//
// A receive from a closed channel is fine, but a send panics unconditionally —
// including from a `select` that has a `default` branch, which is what the old
// writeResponse relied on. So the fix is not to guard the send but to remove the
// close: shutdown travels through `done` instead, and `send` stays open forever.
//
// Probing with a non-blocking send is a safe assertion in one direction only:
// into an open buffer it either takes a slot or falls to `default` and never
// panics, while into a closed channel it panics whenever the send case is
// selected. Repeating makes a closed channel certain to be caught, and cannot
// produce a false failure.
func TestSendChannelIsNeverClosed(t *testing.T) {
	hub := NewHub(0)
	defer hub.Close()

	conn := newConn(nil, hub, nil)
	conn.DaemonID = "d1"
	conn.Authenticated = true
	hub.Register(conn)

	conn.Close()

	for i := 0; i < 32; i++ {
		select {
		case conn.send <- []byte("probe"):
			// The buffer took it, which proves the channel is still open.
			<-conn.send
		default:
			// Open but full, or the scheduler picked this branch.
		}
	}
}

// A frame handler still in flight when the connection closes must not take the
// process down.
//
// Non-auth frames are handled in their own goroutine, so a handler can outlive
// the connection — a heartbeat handler doing its two database calls is the
// realistic case. This drives that interleaving deterministically: the handler is
// blocked when the connection closes, and answers afterwards.
func TestFrameHandlerInFlightDuringCloseDoesNotPanic(t *testing.T) {
	hub := NewHub(0)
	defer hub.Close()

	disp := NewDispatcher()
	entered := make(chan struct{})
	release := make(chan struct{})
	disp.On(TypeHeartbeat, func(*Conn, *Hub, Frame) *Frame {
		close(entered)
		<-release
		return &Frame{Type: TypeHeartbeatAck}
	})

	conn := newConn(nil, hub, disp)
	conn.DaemonID = "d1"
	conn.Authenticated = true
	hub.Register(conn)

	go func() {
		<-entered
		conn.Close()
		close(release)
	}()

	disp.Dispatch(conn, hub, Frame{Type: TypeHeartbeat})
	<-entered
	<-release

	// Let the handler goroutine reach writeResponse.
	time.Sleep(100 * time.Millisecond)
}
