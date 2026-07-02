package ws

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

// Dispatch routes a frame to its handler and returns any response.
func (d *Dispatcher) Dispatch(conn *Conn, hub *Hub, frame Frame) *Frame {
	if h, ok := d.handlers[frame.Type]; ok {
		return h(conn, hub, frame)
	}
	return nil
}
