package ws

import (
	"encoding/json"
	"log/slog"
	"sync"
	"time"
)

// Frame types.
const (
	TypeAuth           = "auth"
	TypeAuthAck        = "auth_ack"
	TypeHeartbeat      = "heartbeat"
	TypeHeartbeatAck   = "heartbeat_ack"
	TypeTaskWake       = "task_wake"
	TypeTaskWakeAck    = "task_wake_ack"
	TypeRuntimeGone    = "runtime_gone"
	TypeRuntimeGoneAck = "runtime_gone_ack"
	TypeStatusUpdate   = "status_update"
	TypeStatusAck      = "status_ack"
	TypeServerShutdown = "server_shutdown"
	TypeError          = "error"
)

type Frame struct {
	Type      string          `json:"type"`
	Seq       int64           `json:"seq,omitempty"`
	Timestamp string          `json:"timestamp,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

// Hub is a connection pool of authenticated daemon WebSocket connections.
type Hub struct {
	mu    sync.RWMutex
	conns map[string]*Conn // daemon_id → conn
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
	delete(h.conns, daemonID)
	h.mu.Unlock()
	slog.Info("WS daemon disconnected", "daemon_id", daemonID)
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
