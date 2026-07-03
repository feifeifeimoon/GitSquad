package ws

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
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
	TypeStatusUpdate   = v1.FrameTypeStatusUpdate
	TypeStatusAck      = v1.FrameTypeStatusAck
	TypeServerShutdown = v1.FrameTypeServerShutdown
	TypeError          = v1.FrameTypeError
)

// Hub is a connection pool of authenticated daemon WebSocket connections.
// When staleTimeout > 0, a background goroutine periodically evicts
// connections that haven't been touched within the timeout window.
type Hub struct {
	mu           sync.RWMutex
	conns        map[string]*Conn // daemon_id → conn
	OnDisconnect func(daemonID string)

	staleTimeout time.Duration
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
		ctx:          ctx,
		cancel:       cancel,
	}
	if staleTimeout > 0 {
		go h.runStaleDetection()
	}
	return h
}

// Close stops the built-in stale detector. The Hub remains usable for
// in-flight operations but stale connections will no longer be evicted.
func (h *Hub) Close() {
	h.cancel()
}

func (h *Hub) Register(daemonID string, conn *Conn) {
	h.mu.Lock()
	conn.DaemonID = daemonID
	conn.Authenticated = true
	conn.touch()
	h.conns[daemonID] = conn
	h.mu.Unlock()
	slog.Info("WS daemon connected", "daemon_id", daemonID)
}

func (h *Hub) Unregister(daemonID string) {
	h.unregister(daemonID, true)
}

// UnregisterSilent removes the connection without calling OnDisconnect.
// Use this for reconnection scenarios where the daemon is immediately
// re-registered — avoids a spurious offline→online status flip.
func (h *Hub) UnregisterSilent(daemonID string) {
	h.unregister(daemonID, false)
}

func (h *Hub) unregister(daemonID string, notify bool) {
	h.mu.Lock()
	_, existed := h.conns[daemonID]
	delete(h.conns, daemonID)
	h.mu.Unlock()
	if existed {
		slog.Info("WS daemon disconnected", "daemon_id", daemonID)
		if notify && h.OnDisconnect != nil {
			h.OnDisconnect(daemonID)
		}
	}
}

func (h *Hub) Send(daemonID string, frame Frame) error {
	h.mu.RLock()
	conn, ok := h.conns[daemonID]
	h.mu.RUnlock()
	if !ok {
		return errNotConnected
	}

	data, err := json.Marshal(frame)
	if err != nil {
		return err
	}

	select {
	case conn.send <- data:
		return nil
	default:
		return errSendFull
	}
}

func (h *Hub) IsOnline(daemonID string) bool {
	h.mu.RLock()
	conn, ok := h.conns[daemonID]
	h.mu.RUnlock()
	return ok && conn.Authenticated
}

// Has returns true if a connection is registered (authenticated or not).
func (h *Hub) Has(daemonID string) bool {
	h.mu.RLock()
	_, ok := h.conns[daemonID]
	h.mu.RUnlock()
	return ok
}

// StaleDaemons returns IDs of connections whose last activity exceeds the
// given timeout. Thread-safe, delegated by the built-in stale detector.
func (h *Hub) StaleDaemons(timeout time.Duration) []string {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var stale []string
	now := time.Now()
	for id, conn := range h.conns {
		if now.Sub(conn.lastHeartbeat) > timeout {
			stale = append(stale, id)
		}
	}
	return stale
}

func (h *Hub) runStaleDetection() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-h.ctx.Done():
			return
		case <-ticker.C:
			for _, id := range h.StaleDaemons(h.staleTimeout) {
				h.Unregister(id)
			}
		}
	}
}
