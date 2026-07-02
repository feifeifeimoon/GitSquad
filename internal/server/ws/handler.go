package ws

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

// HandleWS upgrades an HTTP connection to WebSocket and starts read/write pumps.
func HandleWS(hub *Hub, dispatcher *Dispatcher) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		wsConn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			slog.Info("WS upgrade failed", "error", err)
			return
		}

		conn := newConn()
		go writePump(wsConn, conn)
		readPump(wsConn, conn, hub, dispatcher)
	}
}

func readPump(ws *websocket.Conn, conn *Conn, hub *Hub, dispatcher *Dispatcher) {
	defer func() {
		if conn.DaemonID != "" {
			hub.Unregister(conn.DaemonID)
		}
		ws.Close()
	}()

	ws.SetReadLimit(maxMessageSize)
	ws.SetReadDeadline(time.Now().Add(pongWait))
	ws.SetPongHandler(func(string) error {
		ws.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			break
		}

		var frame Frame
		if err := json.Unmarshal(msg, &frame); err != nil {
			continue
		}

		conn.heartbeat()

		resp := dispatcher.Dispatch(conn, hub, frame)
		if resp != nil {
			data, _ := json.Marshal(resp)
			select {
			case conn.send <- data:
			default:
			}
		}
	}
}

func writePump(ws *websocket.Conn, conn *Conn) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		ws.Close()
	}()

	for {
		select {
		case msg, ok := <-conn.send:
			ws.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				ws.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := ws.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			ws.SetWriteDeadline(time.Now().Add(writeWait))
			if err := ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
