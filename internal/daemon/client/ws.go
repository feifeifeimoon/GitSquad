package client

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gorilla/websocket"
)

// WSConn wraps a WebSocket connection with daemon-specific framing helpers.
type WSConn struct {
	conn *websocket.Conn
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

// ReadFrame reads the next text frame from the WebSocket.
func (ws *WSConn) ReadFrame() (v1.Frame, error) {
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
	data, err := json.Marshal(f)
	if err != nil {
		return err
	}
	return ws.conn.WriteMessage(websocket.TextMessage, data)
}

// SendHeartbeat sends a heartbeat frame with the given payload.
func (ws *WSConn) SendHeartbeat(ctx context.Context, payload any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return ws.WriteFrame(v1.Frame{Type: v1.FrameTypeHeartbeat, Payload: b})
}

// Close closes the underlying WebSocket connection.
func (ws *WSConn) Close() error {
	return ws.conn.Close()
}
