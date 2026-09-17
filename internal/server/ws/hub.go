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

	// disconnectGrace is how long a disconnect is held back before OnDisconnect
	// fires. See Unregister for why a socket event is not evidence on its own.
	disconnectGrace time.Duration
	pending         map[string]*pendingDisconnect

	staleTimeout time.Duration
	staleTick    time.Duration
	ctx          context.Context
	cancel       context.CancelFunc
}

// pendingDisconnect is a disconnect that has been observed but not yet believed.
// It carries the exact connection that left, so a timer that outlives its
// connection cannot report on the successor's behalf.
type pendingDisconnect struct {
	conn  *Conn
	timer *time.Timer
}

// HubOption configures a Hub at construction.
type HubOption func(*Hub)

// WithDisconnectGrace delays OnDisconnect by d. A daemon that reconnects inside
// that window is never reported as having gone away, which is what keeps a
// dropped socket followed by a fast redial from marking a live daemon offline
// and failing the tasks it is still running. Zero (the default) reports a
// disconnect as soon as it is seen.
//
// The delay only applies to the notification. A disconnected connection leaves
// the pool immediately, so wakes addressed to it are not queued at a dead socket.
func WithDisconnectGrace(d time.Duration) HubOption {
	return func(h *Hub) { h.disconnectGrace = d }
}

// NewHub creates a Hub and, if staleTimeout > 0, starts a built-in stale
// detection goroutine. Call Hub.Close() when the Hub is no longer needed
// to stop the goroutine.
func NewHub(staleTimeout time.Duration, opts ...HubOption) *Hub {
	ctx, cancel := context.WithCancel(context.Background())
	h := &Hub{
		conns:        make(map[string]*Conn),
		pending:      make(map[string]*pendingDisconnect),
		staleTimeout: staleTimeout,
		staleTick:    staleCheckInterval(staleTimeout),
		ctx:          ctx,
		cancel:       cancel,
	}
	for _, opt := range opts {
		opt(h)
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
//
// Disconnects still waiting out their grace window are reported rather than
// dropped, so a hub that is going away does not leave its daemons looking
// connected. The notifications run synchronously here.
func (h *Hub) Close() {
	h.cancel()

	h.mu.Lock()
	pending := h.pending
	h.pending = make(map[string]*pendingDisconnect)
	notify := h.OnDisconnect
	h.mu.Unlock()

	for _, p := range pending {
		p.timer.Stop()
	}
	if notify == nil {
		return
	}
	for daemonID := range pending {
		notify(daemonID)
	}
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
	// Cancel a disconnect that is still inside its grace window: the daemon came
	// back, so it was never away. Doing this under the same lock that publishes
	// the connection is what makes it airtight — a timer that has already fired
	// either finds no pending entry once it gets the lock, or notified before
	// this point, in which case the caller's MarkOnline lands after it (see
	// authHandler) and the status still ends up correct.
	returnedInsideGrace := false
	if p, ok := h.pending[conn.DaemonID]; ok {
		p.timer.Stop()
		delete(h.pending, conn.DaemonID)
		returnedInsideGrace = true
	}
	h.mu.Unlock()

	if previous != nil && previous != conn {
		// Close the replaced socket now rather than leaving its read loop
		// blocked until its read deadline. A socket that lingers for minutes
		// is what used to queue a stale cleanup behind the new connection.
		previous.Close()
		slog.Info("WS daemon reconnected", "daemon_id", conn.DaemonID, "inside_grace", returnedInsideGrace)
		return
	}
	slog.Info("WS daemon connected", "daemon_id", conn.DaemonID)
}

// Unregister removes conn from the hub and reports the disconnect — but only if
// conn is still the current connection for its daemon.
//
// That identity check is the point: a read loop whose socket died *after* the
// daemon reconnected runs its cleanup late, and without the check it would
// evict the live connection, mark a connected daemon offline and fail its
// running tasks.
//
// The pool entry goes immediately; only the report waits out the grace window
// (see WithDisconnectGrace), so a wake is never queued at a dead socket.
func (h *Hub) Unregister(conn *Conn) {
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

	// A socket ending is not by itself evidence that the daemon is gone. A NAT
	// rebind, a suspended laptop or a server-side read deadline all drop the
	// socket while the daemon keeps running its task, and a redial lands
	// sub-second later. Reporting the disconnect straight away would mark a live
	// daemon offline and fail work it is still executing, so the notification
	// waits out the grace window and is cancelled outright if the daemon
	// reconnects inside it.
	notifyFn := h.OnDisconnect
	grace := h.disconnectGrace
	immediate := notifyFn != nil && grace <= 0
	if notifyFn != nil && !immediate {
		p := &pendingDisconnect{conn: conn}
		p.timer = time.AfterFunc(grace, func() {
			h.fireDisconnect(conn.DaemonID, conn)
		})
		h.pending[conn.DaemonID] = p
	}
	h.mu.Unlock()

	// The two cases are logged differently on purpose: "socket closed" is what
	// the daemon's end of the wire did, "disconnected" is the hub's conclusion.
	// Losing that distinction is what made a live daemon's console say offline
	// while its own log said healthy.
	if immediate {
		slog.Info("WS daemon disconnected", "daemon_id", conn.DaemonID)
		notifyFn(conn.DaemonID)
		return
	}
	slog.Info("WS daemon socket closed; holding the disconnect",
		"daemon_id", conn.DaemonID, "grace", grace)
}

// fireDisconnect reports a disconnect whose grace window has elapsed. It
// re-checks the pending entry by connection identity: Register may have
// consumed it, and an id-only lookup could otherwise report a daemon that is
// connected again.
func (h *Hub) fireDisconnect(daemonID string, conn *Conn) {
	h.mu.Lock()
	p, ok := h.pending[daemonID]
	if !ok || p.conn != conn {
		h.mu.Unlock()
		return
	}
	delete(h.pending, daemonID)
	notify := h.OnDisconnect
	h.mu.Unlock()

	slog.Info("WS daemon disconnected", "daemon_id", daemonID)
	if notify != nil {
		notify(daemonID)
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
