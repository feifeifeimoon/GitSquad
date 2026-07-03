package ws

import "encoding/json"

// Handler processes a WS frame and optionally returns a response frame.
// Return nil when no response is needed.
type Handler func(conn *Conn, hub *Hub, frame Frame) *Frame

// Dispatcher routes incoming frames to registered handlers by type.
type Dispatcher struct {
	handlers map[string]Handler
}

func NewDispatcher() *Dispatcher {
	return &Dispatcher{
		handlers: make(map[string]Handler),
	}
}

// On registers a handler for a given frame type.
func (d *Dispatcher) On(msgType string, h Handler) {
	d.handlers[msgType] = h
}

// Dispatch routes a frame to the matching handler and writes any response
// to the send channel. The auth frame is handled synchronously because the
// daemon blocks until it receives auth_ack. All other frames are dispatched
// in a new goroutine to avoid head-of-line blocking in the recv loop.
func (d *Dispatcher) Dispatch(conn *Conn, hub *Hub, frame Frame) {
	h, ok := d.handlers[frame.Type]
	if !ok {
		return
	}

	if frame.Type == TypeAuth {
		resp := h(conn, hub, frame)
		d.writeResponse(conn, resp)
		return
	}

	go func() {
		resp := h(conn, hub, frame)
		d.writeResponse(conn, resp)
	}()
}

func (d *Dispatcher) writeResponse(conn *Conn, resp *Frame) {
	if resp == nil {
		return
	}
	data, _ := json.Marshal(resp)
	select {
	case conn.send <- data:
	default:
	}
}
