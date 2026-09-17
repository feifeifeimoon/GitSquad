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

// NewDaemonWS wires the daemon WebSocket: auth, heartbeats, wake-up delivery,
// and stale detection. The hub is owned by the caller so that the task
// dispatcher can nudge daemons on the same pool.
func NewDaemonWS(hub *ws.Hub, daemonSvc *service.DaemonService, taskSvc *service.TaskService) gin.HandlerFunc {
	disp := ws.NewDispatcher()

	hub.OnDisconnect = func(daemonID string) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		uid, _ := uuid.Parse(daemonID)
		_ = daemonSvc.MarkOffline(ctx, uid)
		// In-flight tasks can no longer report back; fail them and tell the
		// issues instead of leaving them stuck in dispatched/running.
		_ = taskSvc.FailDaemonTasks(ctx, uid)
	}

	// HeartbeatScheduler batches last_seen_at (and the online assertion that goes
	// with it) into one write every 60s. It lives for the process lifetime.
	scheduler := NewHeartbeatScheduler(context.Background(), daemonSvc)

	disp.On(ws.TypeAuth, authHandler(daemonSvc, taskSvc))
	disp.On(ws.TypeHeartbeat, heartbeatHandler(daemonSvc, scheduler))
	disp.On(ws.TypeTaskWakeAck, noopHandler)
	disp.On(ws.TypeRuntimeGoneAck, noopHandler)

	return gin.WrapF(ws.Upgrade(hub, disp))
}

func authHandler(daemonSvc *service.DaemonService, taskSvc *service.TaskService) ws.Handler {
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

		// Connecting is an immediate online assertion. The heartbeat path keeps
		// it true from here on (see the batched flush), so a status that is ever
		// flipped offline by mistake heals on its own instead of needing a new
		// connection.
		_ = daemonSvc.MarkOnline(ctx, daemon.ID)

		// Set the identity *before* publishing the connection: the hub and the
		// frame handlers read these fields without a lock, so a conn must never
		// be visible to them half-initialised.
		conn.DaemonID = daemon.ID.String()
		conn.Authenticated = true

		// Register replaces and closes any previous connection for this daemon.
		// The replacement is silent on purpose: the daemon is still connected,
		// so firing OnDisconnect here would mark it offline and fail the tasks
		// it is running.
		hub.Register(conn)

		// Work may have been queued while this daemon was offline (or while it
		// was reconnecting). Wake it now instead of making it wait for the next
		// heartbeat pull.
		if taskSvc.HasPending(ctx, daemon.ID) {
			hub.Wake(daemon.ID)
		}

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

		// The heartbeat payload carries the CLI version — hand it to the
		// batched update path so upgrades show up in the console.
		var hb v1.WSHeartbeatPayload
		_ = json.Unmarshal(frame.Payload, &hb)

		// Batched rather than written here: the flush coalesces last_seen_at *and*
		// the online assertion into one statement per daemon per interval, so a
		// heartbeat costs no DB round trip of its own.
		scheduler.RecordHeartbeat(uid, hb.DaemonVersion)

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

func noopHandler(conn *ws.Conn, hub *ws.Hub, frame ws.Frame) *ws.Frame {
	return nil
}

func errorFrame(msg string) *ws.Frame {
	payload, _ := json.Marshal(v1.WSErrorPayload{Message: msg})
	return &ws.Frame{Type: ws.TypeError, Payload: payload}
}
