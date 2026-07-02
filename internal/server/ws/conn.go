package ws

import "time"

// Conn represents an authenticated daemon WebSocket connection.
type Conn struct {
	DaemonID      string
	UserID        string
	Authenticated bool
	send          chan []byte
	lastHeartbeat time.Time
}

func newConn() *Conn {
	return &Conn{
		send: make(chan []byte, 64),
	}
}

func (c *Conn) heartbeat() {
	c.lastHeartbeat = time.Now()
}

func (c *Conn) close() {
	close(c.send)
}
