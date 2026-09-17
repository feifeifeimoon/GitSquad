package ws

import (
	"encoding/json"
	"sync"
	"sync/atomic"
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
//
// Lifecycle: the hub owns the connection. Close runs exactly once, signalling
// every sender to stop and closing the socket so the read loop unblocks.
// DaemonID and Authenticated are written once by the auth handler *before* the
// conn is published to the hub, so the read loop and the frame handlers can
// read them without a lock.
type Conn struct {
	DaemonID      string
	Authenticated bool

	// send carries frames to sendLoop. It is deliberately never closed: sending
	// on a closed channel panics unconditionally, and a `select` with a
	// `default` branch does not guard against that. Shutdown is signalled
	// through `done`, which is only ever closed.
	send      chan []byte
	done      chan struct{}
	closeOnce sync.Once

	// lastHeartbeat is UnixNano of the last frame received. Atomic because
	// touch() runs on the read loop while stale detection reads it from the
	// hub's ticker.
	lastHeartbeat atomic.Int64

	ws         *websocket.Conn
	hub        *Hub
	dispatcher *Dispatcher
}

func newConn(wsConn *websocket.Conn, hub *Hub, dispatcher *Dispatcher) *Conn {
	c := &Conn{
		send:       make(chan []byte, 64),
		done:       make(chan struct{}),
		ws:         wsConn,
		hub:        hub,
		dispatcher: dispatcher,
	}
	c.touch()
	return c
}

// Close shuts the connection down exactly once. Safe from any goroutine, any
// number of times, and on a conn whose peer already closed the socket.
func (c *Conn) Close() {
	c.closeOnce.Do(func() {
		close(c.done)
		if c.ws != nil {
			_ = c.ws.Close()
		}
	})
}

// Closed reports whether Close has run.
func (c *Conn) Closed() bool {
	select {
	case <-c.done:
		return true
	default:
		return false
	}
}

// trySend queues data for sendLoop. It never blocks and never panics:
// errConnClosed while the connection is shutting down, errSendFull when the
// buffer is full.
//
// A frame queued concurrently with Close may be dropped — the caller is not
// synchronised with the send loop. Delivery is best-effort by design (see
// Hub.Wake); a daemon that misses a wake still finds the work on its next
// heartbeat pull.
func (c *Conn) trySend(data []byte) error {
	select {
	case <-c.done:
		return errConnClosed
	default:
	}

	select {
	case c.send <- data:
		return nil
	default:
		return errSendFull
	}
}

// run starts the send and receive loops. It blocks until the connection is done.
func (c *Conn) run() {
	go c.sendLoop()
	c.recvLoop()
}

// recvLoop reads frames from the WebSocket and dispatches them.
func (c *Conn) recvLoop() {
	defer func() {
		// Unregister removes *this* connection only. A reconnected daemon has a
		// newer conn in the hub, and this late cleanup must not evict it — that
		// is what used to mark a live daemon offline and fail its tasks.
		c.hub.Unregister(c)
		c.Close()
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
			return
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
	defer ticker.Stop()

	for {
		select {
		case <-c.done:
			return
		case msg := <-c.send:
			if err := c.writeMessage(websocket.TextMessage, msg); err != nil {
				c.Close()
				return
			}
		case <-ticker.C:
			if err := c.writeMessage(websocket.PingMessage, nil); err != nil {
				c.Close()
				return
			}
		}
	}
}

func (c *Conn) writeMessage(messageType int, data []byte) error {
	c.ws.SetWriteDeadline(time.Now().Add(writeWait))
	return c.ws.WriteMessage(messageType, data)
}

// touch records a liveness heartbeat for this connection. Called on every
// received frame — any inbound traffic proves the daemon is still alive — and
// once at construction, so a freshly registered conn is never instantly stale.
func (c *Conn) touch() {
	c.lastHeartbeat.Store(time.Now().UnixNano())
}

// lastActivity returns the time of the last frame received.
func (c *Conn) lastActivity() time.Time {
	return time.Unix(0, c.lastHeartbeat.Load())
}
