package ws

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// AppHub fans workspace events out to browser connections.
//
// It is deliberately separate from Hub (the daemon pool): a daemon has exactly
// one connection keyed by daemon id, while a workspace has many browser tabs,
// and the app side only ever pushes (no per-frame dispatch table).
type AppHub struct {
	mu    sync.RWMutex
	conns map[uuid.UUID]map[*AppConn]struct{}
}

func NewAppHub() *AppHub {
	return &AppHub{conns: make(map[uuid.UUID]map[*AppConn]struct{})}
}

// Publish broadcasts a workspace event to every browser subscribed to that
// workspace. It implements service.EventPublisher. Slow consumers are dropped
// rather than allowed to block the publisher.
func (h *AppHub) Publish(ev v1.AppEvent) {
	data, err := json.Marshal(ev)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.conns[ev.WorkspaceID] {
		c.trySend(data)
	}
}

func (h *AppHub) subscribe(workspaceID uuid.UUID, c *AppConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.conns[workspaceID] == nil {
		h.conns[workspaceID] = make(map[*AppConn]struct{})
	}
	h.conns[workspaceID][c] = struct{}{}
}

func (h *AppHub) unsubscribe(workspaceID uuid.UUID, c *AppConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	set := h.conns[workspaceID]
	delete(set, c)
	if len(set) == 0 {
		delete(h.conns, workspaceID)
	}
}

// AppConn is a single browser WebSocket connection.
type AppConn struct {
	workspaceID uuid.UUID
	send        chan []byte
	ws          *websocket.Conn
}

func (c *AppConn) trySend(data []byte) {
	select {
	case c.send <- data:
	default: // slow consumer: drop this event instead of stalling the hub
	}
}

// AppAuthFunc validates the browser's auth frame and returns the workspace the
// connection may subscribe to.
type AppAuthFunc func(token, workspaceRef string) (uuid.UUID, error)

const appAuthAck = `{"type":"auth_ack"}`

// ServeApp upgrades an HTTP request into a browser WebSocket, authenticates the
// first frame, and subscribes the connection to its workspace.
func ServeApp(hub *AppHub, auth AppAuthFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsConn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			slog.Info("app WS upgrade failed", "error", err)
			return
		}
		conn := &AppConn{send: make(chan []byte, 64), ws: wsConn}
		conn.serve(hub, auth)
	}
}

func (c *AppConn) serve(hub *AppHub, auth AppAuthFunc) {
	c.ws.SetReadLimit(maxMessageSize)
	c.ws.SetReadDeadline(time.Now().Add(writeWait))

	_, msg, err := c.ws.ReadMessage()
	if err != nil {
		c.ws.Close()
		return
	}
	var f Frame
	if err := json.Unmarshal(msg, &f); err != nil || f.Type != TypeAuth {
		c.reject("expected auth frame")
		return
	}
	var p v1.WSAppAuthPayload
	if err := json.Unmarshal(f.Payload, &p); err != nil || p.Token == "" {
		c.reject("invalid auth payload")
		return
	}

	// NewAppAuth owns its own deadline; the request context does not outlive the
	// hijacked connection.
	workspaceID, err := auth(p.Token, p.WorkspaceID)
	if err != nil {
		c.reject("unauthorized")
		return
	}

	c.workspaceID = workspaceID
	hub.subscribe(workspaceID, c)
	c.trySend([]byte(appAuthAck))
	slog.Info("app WS connected", "workspace_id", workspaceID)

	go c.sendLoop()

	// Browsers send nothing after auth; the read loop just keeps the pong
	// deadline fresh and detects close.
	defer func() {
		hub.unsubscribe(c.workspaceID, c)
		close(c.send)
		c.ws.Close()
	}()

	c.ws.SetReadDeadline(time.Now().Add(pongWait))
	c.ws.SetPongHandler(func(string) error {
		c.ws.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		if _, _, err := c.ws.ReadMessage(); err != nil {
			return
		}
	}
}

func (c *AppConn) reject(reason string) {
	payload, _ := json.Marshal(v1.WSErrorPayload{Message: reason})
	data, _ := json.Marshal(Frame{Type: TypeError, Payload: payload})
	c.trySend(data)
	c.ws.Close()
}

func (c *AppConn) sendLoop() {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for {
		select {
		case msg, ok := <-c.send:
			c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.ws.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.ws.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
