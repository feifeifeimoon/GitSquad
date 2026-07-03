package ws

import (
	"encoding/json"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 120 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

// Conn represents an authenticated daemon WebSocket connection.
type Conn struct {
	DaemonID      string
	UserID        string
	Authenticated bool
	send          chan []byte
	lastHeartbeat time.Time

	ws         *websocket.Conn
	hub        *Hub
	dispatcher *Dispatcher
}

func newConn(wsConn *websocket.Conn, hub *Hub, dispatcher *Dispatcher) *Conn {
	return &Conn{
		send:       make(chan []byte, 64),
		ws:         wsConn,
		hub:        hub,
		dispatcher: dispatcher,
	}
}

// run starts the send and receive goroutines. It blocks until the connection
// closes (recvLoop returns), then shuts down the send channel so sendLoop
// can exit cleanly.
func (c *Conn) run() {
	go c.sendLoop()
	c.recvLoop()
	close(c.send)
}

// recvLoop reads frames from the WebSocket and dispatches them.
func (c *Conn) recvLoop() {
	defer func() {
		if c.DaemonID != "" {
			c.hub.Unregister(c.DaemonID)
		}
		c.ws.Close()
	}()

	c.ws.SetReadLimit(maxMessageSize)
	c.ws.SetReadDeadline(time.Now().Add(pongWait))
	c.ws.SetPongHandler(func(string) error {
		c.ws.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, msg, err := c.ws.ReadMessage()
		if err != nil {
			break
		}

		var frame Frame
		if err := json.Unmarshal(msg, &frame); err != nil {
			continue
		}

		c.touch()
		c.dispatcher.Dispatch(c, c.hub, frame)
	}
}

// sendLoop writes frames from the send channel to the WebSocket and sends
// periodic ping frames for TCP keep-alive.
func (c *Conn) sendLoop() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.ws.Close()
	}()

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

// touch records a liveness heartbeat for this connection. Called on every
// received frame — any inbound traffic proves the daemon is still alive.
func (c *Conn) touch() {
	c.lastHeartbeat = time.Now()
}
