package ws

import (
	"log/slog"
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// Upgrade performs the HTTP-to-WebSocket handshake and starts a new
// connection (send + receive loops) for the authenticated daemon.
func Upgrade(hub *Hub, dispatcher *Dispatcher) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsConn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			slog.Info("WS upgrade failed", "error", err)
			return
		}

		conn := newConn(wsConn, hub, dispatcher)
		conn.run()
	}
}
