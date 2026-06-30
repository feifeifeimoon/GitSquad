package handler

import (
	"context"
	"encoding/json"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	"github.com/feifeifeimoon/GitSquad/internal/server/ws"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// NewDaemonWS wires up the WS hub, dispatcher, message handlers, and stale detection.
func NewDaemonWS(daemonSvc *service.DaemonService) gin.HandlerFunc {
	hub := ws.NewHub()
	disp := ws.NewDispatcher()

	// When a daemon disconnects (for any reason), mark it offline in the DB.
	hub.OnDisconnect = func(daemonID string) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		uid, _ := uuid.Parse(daemonID)
		_ = daemonSvc.MarkOffline(ctx, uid)
	}

	disp.On(ws.TypeAuth, authHandler(daemonSvc))
	disp.On(ws.TypeHeartbeat, heartbeatHandler(daemonSvc))
	disp.On(ws.TypeStatusUpdate, statusUpdateHandler(daemonSvc))
	disp.On(ws.TypeTaskWakeAck, noopHandler)
	disp.On(ws.TypeRuntimeGoneAck, noopHandler)

	go staleWatcher(hub)

	return gin.WrapF(ws.HandleWS(hub, disp))
}

func authHandler(daemonSvc *service.DaemonService) ws.Handler {
	return func(conn *ws.Conn, hub *ws.Hub, frame ws.Frame) *ws.Frame {
		var payload struct {
			DaemonID string `json:"daemon_id"`
			Token    string `json:"token"`
		}
		if err := json.Unmarshal(frame.Payload, &payload); err != nil {
			return errorFrame("invalid auth payload")
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		daemon, err := daemonSvc.AuthenticateByToken(ctx, payload.Token)
		if err != nil {
			return errorFrame("invalid token")
		}

		// Verify the claimed daemon ID matches the token's daemon.
		if daemon.ID.String() != payload.DaemonID {
			return errorFrame("daemon_id mismatch")
		}

		_ = daemonSvc.MarkOnline(ctx, daemon.ID)

		conn.DaemonID = daemon.ID.String()
		conn.UserID = daemon.UserID.String()
		hub.Register(daemon.ID.String(), conn)

		ackPayload, _ := json.Marshal(map[string]interface{}{
			"server_time":           time.Now().Format(time.RFC3339),
			"heartbeat_interval_ms": 30000,
		})
		return &ws.Frame{
			Type:    ws.TypeAuthAck,
			Seq:     frame.Seq,
			Payload: ackPayload,
		}
	}
}

func heartbeatHandler(daemonSvc *service.DaemonService) ws.Handler {
	return func(conn *ws.Conn, _ *ws.Hub, frame ws.Frame) *ws.Frame {
		if !conn.Authenticated {
			return nil
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		uid, _ := uuid.Parse(conn.DaemonID)
		_ = daemonSvc.MarkOnline(ctx, uid)

		ackPayload, _ := json.Marshal(map[string]interface{}{
			"server_time":   time.Now().Format(time.RFC3339),
			"pending_tasks": 0,
		})
		return &ws.Frame{
			Type:    ws.TypeHeartbeatAck,
			Seq:     frame.Seq,
			Payload: ackPayload,
		}
	}
}

func statusUpdateHandler(daemons *service.DaemonService) ws.Handler {
	return func(conn *ws.Conn, _ *ws.Hub, _ ws.Frame) *ws.Frame {
		if !conn.Authenticated {
			return nil
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		uid, _ := uuid.Parse(conn.DaemonID)
		_ = daemons.MarkOnline(ctx, uid)
		return nil
	}
}

func noopHandler(conn *ws.Conn, hub *ws.Hub, frame ws.Frame) *ws.Frame {
	return nil
}

// ── Helpers ────────────────────────────────────────────────────────────

func staleWatcher(hub *ws.Hub) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		for _, id := range hub.StaleDaemons(90 * time.Second) {
			// OnDisconnect calls MarkOffline, so just unregister to trigger it.
			hub.Unregister(id)
		}
	}
}

func errorFrame(msg string) *ws.Frame {
	payload, _ := json.Marshal(map[string]string{"message": msg})
	return &ws.Frame{Type: ws.TypeError, Payload: payload}
}
