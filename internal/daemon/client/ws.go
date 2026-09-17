package client

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gorilla/websocket"
)

const (
	// wsReadWait bounds how long the daemon waits for inbound traffic before
	// treating the socket as dead. The server answers every heartbeat with a
	// heartbeat_ack (30s interval), so reaching this means at least two acks
	// went missing. Without a read deadline a half-open socket reads as
	// connected forever — writes to a dropped TCP connection keep succeeding —
	// so the daemon never reconnects and no wake frame can reach it.
	wsReadWait = 75 * time.Second

	// wsWriteTimeout caps a single frame write so a stalled peer cannot block
	// the heartbeat loop indefinitely.
	wsWriteTimeout = 10 * time.Second
)

// WSConn wraps a WebSocket connection with daemon-specific framing helpers.
type WSConn struct {
	conn *websocket.Conn

	// writeMu serialises writers: gorilla/websocket permits one writer at a
	// time, and two goroutines write here — the heartbeat loop, and the frame
	// handler that acks runtime_gone from the read loop.
	writeMu sync.Mutex
}

// ConnectWS dials the daemon WebSocket endpoint, sends an auth frame with
// the daemon ID and token, and waits for the server's acknowledgment.
func (c *Client) ConnectWS(ctx context.Context, daemonID string) (*WSConn, error) {
	wsURL := strings.Replace(c.BaseURL, "http://", "ws://", 1)
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
	wsURL += "/ws/daemon"

	conn, resp, err := websocket.DefaultDialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		if resp != nil && resp.StatusCode == http.StatusUnauthorized {
			return nil, fmt.Errorf("websocket auth failed: unauthorized (status %d)", resp.StatusCode)
		}
		return nil, fmt.Errorf("websocket dial: %w", err)
	}

	ws := &WSConn{conn: conn}

	// Arm liveness before the first read. A pong extends the deadline, and so
	// does any inbound frame (see ReadFrame).
	_ = conn.SetReadDeadline(time.Now().Add(wsReadWait))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(wsReadWait))
	})

	// Send auth frame — server validates both daemon_id and token.
	authPayload, _ := json.Marshal(v1.WSAuthPayload{DaemonID: daemonID, Token: c.Token})
	if err := ws.WriteFrame(v1.Frame{Type: v1.FrameTypeAuth, Payload: authPayload}); err != nil {
		conn.Close()
		return nil, fmt.Errorf("send auth frame: %w", err)
	}

	// Wait for ack.
	ack, err := ws.ReadFrame()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("read auth ack: %w", err)
	}
	if ack.Type == v1.FrameTypeError {
		var ep v1.WSErrorPayload
		json.Unmarshal(ack.Payload, &ep)
		conn.Close()
		return nil, fmt.Errorf("auth failed: %s", ep.Message)
	}

	return ws, nil
}

// ReadFrame reads the next text frame from the WebSocket. It re-arms the read
// deadline first so a silent connection surfaces as an error rather than
// blocking the read loop forever.
func (ws *WSConn) ReadFrame() (v1.Frame, error) {
	_ = ws.conn.SetReadDeadline(time.Now().Add(wsReadWait))

	_, msg, err := ws.conn.ReadMessage()
	if err != nil {
		return v1.Frame{}, err
	}
	var f v1.Frame
	if err := json.Unmarshal(msg, &f); err != nil {
		return v1.Frame{}, err
	}
	return f, nil
}

// WriteFrame writes a text frame to the WebSocket.
func (ws *WSConn) WriteFrame(f v1.Frame) error {
	return ws.writeFrame(f, time.Time{})
}

// SendHeartbeat sends a heartbeat frame with the given payload.
func (ws *WSConn) SendHeartbeat(ctx context.Context, payload any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	var deadline time.Time
	if d, ok := ctx.Deadline(); ok {
		deadline = d
	}
	return ws.writeFrame(v1.Frame{Type: v1.FrameTypeHeartbeat, Payload: b}, deadline)
}

// writeFrame marshals and writes a frame. Marshalling happens outside the lock
// because it needs no access to the socket.
func (ws *WSConn) writeFrame(f v1.Frame, deadline time.Time) error {
	data, err := json.Marshal(f)
	if err != nil {
		return err
	}
	if deadline.IsZero() {
		deadline = time.Now().Add(wsWriteTimeout)
	}

	ws.writeMu.Lock()
	defer ws.writeMu.Unlock()
	_ = ws.conn.SetWriteDeadline(deadline)
	return ws.conn.WriteMessage(websocket.TextMessage, data)
}

// Close closes the underlying WebSocket connection.
func (ws *WSConn) Close() error {
	return ws.conn.Close()
}
