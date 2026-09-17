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
//
// The goroutine is deliberately not tracked or waited on: a handler still in
// flight when the connection closes writes through Conn.trySend, which drops
// the frame instead of panicking on a closed channel. Waiting would mean the
// teardown path could block on a handler's database call.
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

// writeResponse queues a response frame. trySend is the only way into a
// connection's send channel: it never blocks and never panics, dropping the
// frame when the connection has closed or its buffer is full.
func (d *Dispatcher) writeResponse(conn *Conn, resp *Frame) {
	if resp == nil {
		return
	}
	data, err := json.Marshal(resp)
	if err != nil {
		return
	}
	_ = conn.trySend(data)
}
