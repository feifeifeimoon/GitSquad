package ws

import (
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
type Hub struct {
	mu           sync.RWMutex
	conns        map[string]*Conn // daemon_id → conn
	OnDisconnect func(daemonID string)
}

func NewHub() *Hub {
	return &Hub{
		conns: make(map[string]*Conn),
	}
}

func (h *Hub) Register(daemonID string, conn *Conn) {
	h.mu.Lock()
	conn.DaemonID = daemonID
	conn.Authenticated = true
	conn.heartbeat()
	h.conns[daemonID] = conn
	h.mu.Unlock()
	slog.Info("WS daemon connected", "daemon_id", daemonID)
}

func (h *Hub) Unregister(daemonID string) {
	h.mu.Lock()
	_, existed := h.conns[daemonID]
	delete(h.conns, daemonID)
	h.mu.Unlock()
	if existed {
		slog.Info("WS daemon disconnected", "daemon_id", daemonID)
		if h.OnDisconnect != nil {
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
