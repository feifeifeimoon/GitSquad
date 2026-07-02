package v1

import "encoding/json"

// Frame is a WebSocket message frame exchanged between daemon and server.
type Frame struct {
	Type      string          `json:"type"`
	Seq       int64           `json:"seq,omitempty"`
	Timestamp string          `json:"timestamp,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

// Frame type constants.
const (
	FrameTypeAuth           = "auth"
	FrameTypeAuthAck        = "auth_ack"
	FrameTypeHeartbeat      = "heartbeat"
	FrameTypeHeartbeatAck   = "heartbeat_ack"
	FrameTypeTaskWake       = "task_wake"
	FrameTypeTaskWakeAck    = "task_wake_ack"
	FrameTypeRuntimeGone    = "runtime_gone"
	FrameTypeRuntimeGoneAck = "runtime_gone_ack"
	FrameTypeStatusUpdate   = "status_update"
	FrameTypeStatusAck      = "status_ack"
	FrameTypeServerShutdown = "server_shutdown"
	FrameTypeError          = "error"
)

// WS Auth / ACK payloads.

// WSAuthPayload is sent by the daemon to identify itself.
type WSAuthPayload struct {
	DaemonID string `json:"daemon_id"`
	Token    string `json:"token"`
}

// WSAuthAckPayload is the server's response to a successful auth frame.
type WSAuthAckPayload struct {
	ServerTime          string `json:"server_time"`
	HeartbeatIntervalMs int    `json:"heartbeat_interval_ms"`
}

// WS Heartbeat payloads.

// WSHeartbeatPayload is sent periodically by the daemon.
type WSHeartbeatPayload struct {
	Status         string            `json:"status"`
	DaemonVersion  string            `json:"daemon_version"`
	ActiveTasks    []string          `json:"active_tasks"`
	RuntimeSummary map[string]string `json:"runtime_summary"`
}

// WSHeartbeatAckPayload is the server's response to a heartbeat frame.
type WSHeartbeatAckPayload struct {
	ServerTime   string `json:"server_time"`
	PendingTasks int    `json:"pending_tasks"`
}

// WSErrorPayload is sent in an error frame.
type WSErrorPayload struct {
	Message string `json:"message"`
}
