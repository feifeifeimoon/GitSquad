package ws

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

// Frame is a type alias for the canonical Frame in pkg/types/v1.
type Frame = v1.Frame

// Frame type constants — mirror v1 for convenience.
const (
	TypeAuth           = v1.FrameTypeAuth
	TypeAuthAck        = v1.FrameTypeAuthAck
	TypeHeartbeat      = v1.FrameTypeHeartbeat
	TypeHeartbeatAck   = v1.FrameTypeHeartbeatAck
	TypeTaskWake       = v1.FrameTypeTaskWake
	TypeTaskWakeAck    = v1.FrameTypeTaskWakeAck
	TypeRuntimeGone    = v1.FrameTypeRuntimeGone
	TypeRuntimeGoneAck = v1.FrameTypeRuntimeGoneAck
	TypeError          = v1.FrameTypeError
)

// Hub is a connection pool of authenticated daemon WebSocket connections.
//
// It owns connection lifetime: at most one conn per daemon is registered, a
// reconnect replaces and closes the previous one, and a connection only ever
// removes itself from the pool. When staleTimeout > 0 a background goroutine
// also evicts connections that have gone silent.
type Hub struct {
	mu           sync.RWMutex
	conns        map[string]*Conn // daemon_id → the current conn
	OnDisconnect func(daemonID string)

	staleTimeout time.Duration
	staleTick    time.Duration
	ctx          context.Context
	cancel       context.CancelFunc
}

// NewHub creates a Hub and, if staleTimeout > 0, starts a built-in stale
// detection goroutine. Call Hub.Close() when the Hub is no longer needed
// to stop the goroutine.
func NewHub(staleTimeout time.Duration) *Hub {
	ctx, cancel := context.WithCancel(context.Background())
	h := &Hub{
		conns:        make(map[string]*Conn),
		staleTimeout: staleTimeout,
		staleTick:    staleCheckInterval(staleTimeout),
		ctx:          ctx,
		cancel:       cancel,
	}
	if staleTimeout > 0 {
		go h.runStaleDetection()
	}
	return h
}

// staleCheckInterval sweeps twice per timeout window, with a floor so that a
// deliberately tiny timeout in a test still gets a usable ticker.
func staleCheckInterval(staleTimeout time.Duration) time.Duration {
	tick := staleTimeout / 2
	if tick < 10*time.Millisecond {
		tick = 10 * time.Millisecond
	}
	return tick
}

// Close stops the built-in stale detector. The Hub remains usable for
// in-flight operations but stale connections will no longer be evicted.
func (h *Hub) Close() {
	h.cancel()
}

// Register publishes conn as the current connection for conn.DaemonID,
// replacing and closing whatever was registered before.
//
// The caller must set conn.DaemonID and conn.Authenticated before calling:
// the conn becomes visible only once it is fully initialised, so the read loop
// and the frame handlers read those fields without a lock.
//
// A replaced connection is dropped silently. The daemon is still connected, so
// notifying OnDisconnect would flip it offline and fail its in-flight tasks.
func (h *Hub) Register(conn *Conn) {
	conn.touch()

	h.mu.Lock()
	previous := h.conns[conn.DaemonID]
	h.conns[conn.DaemonID] = conn
	h.mu.Unlock()

	if previous != nil && previous != conn {
		// Close the replaced socket now rather than leaving its read loop
		// blocked until its read deadline. A socket that lingers for minutes
		// is what used to queue a stale cleanup behind the new connection.
		previous.Close()
		slog.Info("WS daemon reconnected", "daemon_id", conn.DaemonID)
		return
	}
	slog.Info("WS daemon connected", "daemon_id", conn.DaemonID)
}

// Unregister removes conn from the hub and notifies OnDisconnect — but only if
// conn is still the current connection for its daemon.
//
// That identity check is the point: a read loop whose socket died *after* the
// daemon reconnected runs its cleanup late, and without the check it would
// evict the live connection, mark a connected daemon offline and fail its
// running tasks.
func (h *Hub) Unregister(conn *Conn) {
	h.unregister(conn, true)
}

func (h *Hub) unregister(conn *Conn, notify bool) {
	if conn.DaemonID == "" {
		return
	}

	h.mu.Lock()
	current, ok := h.conns[conn.DaemonID]
	if !ok || current != conn {
		h.mu.Unlock()
		return
	}
	delete(h.conns, conn.DaemonID)
	h.mu.Unlock()

	slog.Info("WS daemon disconnected", "daemon_id", conn.DaemonID)
	if notify && h.OnDisconnect != nil {
		h.OnDisconnect(conn.DaemonID)
	}
}

// current returns the registered connection for a daemon.
func (h *Hub) current(daemonID string) (*Conn, bool) {
	h.mu.RLock()
	conn, ok := h.conns[daemonID]
	h.mu.RUnlock()
	return conn, ok
}

// Send queues a frame for a connected daemon. It never blocks and never panics
// on a connection that closes mid-send.
func (h *Hub) Send(daemonID string, frame Frame) error {
	conn, ok := h.current(daemonID)
	if !ok {
		return errNotConnected
	}

	data, err := json.Marshal(frame)
	if err != nil {
		return err
	}

	if err := conn.trySend(data); err != nil {
		if errors.Is(err, errConnClosed) {
			return errNotConnected
		}
		return err
	}
	return nil
}

// Wake nudges a connected daemon to claim pending work.
//
// It implements service.DaemonWaker. A wake carries no task payload — the
// daemon claims the queue over HTTP, which is where the installation token
// travels. Sending is best-effort: an offline daemon (or a full send buffer)
// drops the frame, and the heartbeat pull covers that case.
func (h *Hub) Wake(daemonID uuid.UUID) {
	payload, err := json.Marshal(v1.WSTaskWakePayload{})
	if err != nil {
		return
	}
	_ = h.Send(daemonID.String(), Frame{Type: TypeTaskWake, Payload: payload})
}

// staleConns returns the connections whose last frame arrived longer than
// timeout ago. It hands back the connections themselves, not their IDs, so the
// caller can act on the exact connection it observed.
func (h *Hub) staleConns(timeout time.Duration) []*Conn {
	h.mu.RLock()
	defer h.mu.RUnlock()

	cutoff := time.Now().Add(-timeout)
	var stale []*Conn
	for _, conn := range h.conns {
		if conn.lastActivity().Before(cutoff) {
			stale = append(stale, conn)
		}
	}
	return stale
}

func (h *Hub) runStaleDetection() {
	ticker := time.NewTicker(h.staleTick)
	defer ticker.Stop()
	for {
		select {
		case <-h.ctx.Done():
			return
		case <-ticker.C:
			for _, conn := range h.staleConns(h.staleTimeout) {
				// Close the socket, not just the map entry. Dropping the entry
				// alone leaves the daemon holding a live connection to a server
				// that has forgotten it, so it never learns to reconnect and no
				// wake can reach it.
				conn.Close()
				h.Unregister(conn)
			}
		}
	}
}
