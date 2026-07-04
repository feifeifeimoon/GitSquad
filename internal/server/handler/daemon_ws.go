package handler

import (
	"context"
	"encoding/json"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	"github.com/feifeifeimoon/GitSquad/internal/server/ws"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// NewDaemonWS wires up the WS hub, dispatcher, message handlers, and stale detection.
func NewDaemonWS(daemonSvc *service.DaemonService) gin.HandlerFunc {
	// Hub with built-in stale detection: connections untouched for 60s (2 heartbeat
	// cycles) are unregistered, which triggers OnDisconnect → MarkOffline.
	hub := ws.NewHub(60 * time.Second)

	disp := ws.NewDispatcher()

	hub.OnDisconnect = func(daemonID string) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		uid, _ := uuid.Parse(daemonID)
		_ = daemonSvc.MarkOffline(ctx, uid)
	}

	// HeartbeatScheduler batches last_seen_at DB writes every 60s.
	scheduler := NewHeartbeatScheduler(context.Background(), daemonSvc)

	disp.On(ws.TypeAuth, authHandler(daemonSvc))
	disp.On(ws.TypeHeartbeat, heartbeatHandler(daemonSvc, scheduler))
	disp.On(ws.TypeStatusUpdate, statusUpdateHandler(daemonSvc))
	disp.On(ws.TypeTaskWakeAck, noopHandler)
	disp.On(ws.TypeRuntimeGoneAck, noopHandler)

	return gin.WrapF(ws.Upgrade(hub, disp))
}

func authHandler(daemonSvc *service.DaemonService) ws.Handler {
	return func(conn *ws.Conn, hub *ws.Hub, frame ws.Frame) *ws.Frame {
		var payload v1.WSAuthPayload
		if err := json.Unmarshal(frame.Payload, &payload); err != nil {
			return errorFrame("invalid auth payload")
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		daemon, err := daemonSvc.AuthenticateByToken(ctx, payload.Token)
		if err != nil {
			return errorFrame("invalid token")
		}

		if daemon.ID.String() != payload.DaemonID {
			return errorFrame("daemon_id mismatch")
		}

		_ = daemonSvc.MarkOnline(ctx, daemon.ID)

		// Reconnect: silently drop the old connection so OnDisconnect does
		// not fire and flip the daemon to offline between unregister/register.
		if hub.Has(daemon.ID.String()) {
			hub.UnregisterSilent(daemon.ID.String())
		}

		hub.Register(daemon.ID.String(), conn)

		ackPayload, _ := json.Marshal(v1.WSAuthAckPayload{
			ServerTime:          time.Now().Format(time.RFC3339),
			HeartbeatIntervalMs: 30000,
		})
		return &ws.Frame{
			Type:    ws.TypeAuthAck,
			Seq:     frame.Seq,
			Payload: ackPayload,
		}
	}
}

func heartbeatHandler(daemonSvc *service.DaemonService, scheduler *HeartbeatScheduler) ws.Handler {
	return func(conn *ws.Conn, _ *ws.Hub, frame ws.Frame) *ws.Frame {
		if !conn.Authenticated {
			return nil
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		uid, _ := uuid.Parse(conn.DaemonID)

		// Batched last_seen_at update — avoids a DB write on every single heartbeat.
		scheduler.RecordHeartbeat(uid)

		actions := daemonSvc.PendingActions(ctx, uid)

		ackPayload, _ := json.Marshal(v1.WSHeartbeatAckPayload{
			PendingActions: actions,
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

func errorFrame(msg string) *ws.Frame {
	payload, _ := json.Marshal(v1.WSErrorPayload{Message: msg})
	return &ws.Frame{Type: ws.TypeError, Payload: payload}
}
