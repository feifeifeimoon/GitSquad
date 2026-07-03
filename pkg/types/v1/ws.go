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

// WSHeartbeatPayload is sent periodically by the daemon to report liveness
// and current machine state. The mere arrival of this frame proves the
// daemon is online — no separate Status field is needed.
type WSHeartbeatPayload struct {
	DaemonVersion  string            `json:"daemon_version"`
	ActiveTasks    []string          `json:"active_tasks"`
	RuntimeSummary map[string]string `json:"runtime_summary"`
}

// WSHeartbeatAckPayload is the server's response to a heartbeat frame.
// PendingActions is an extensible command channel: the server can piggyback
// instructions (task_available, runtime_rescan, shutdown, etc.) on the ack.
type WSHeartbeatAckPayload struct {
	PendingActions []PendingAction `json:"pending_actions,omitempty"`
}

// PendingAction is a command the server sends to a daemon via heartbeat ack.
type PendingAction struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// PendingAction type constants.
const (
	ActionTaskAvailable = "task_available"
	ActionRuntimeRescan = "runtime_rescan"
	ActionShutdown      = "shutdown"
)

// TaskAvailablePayload lists tasks the daemon should claim.
type TaskAvailablePayload struct {
	Tasks []TaskHint `json:"tasks"`
}

// TaskHint is a minimal reference to a pending task.
type TaskHint struct {
	TaskID   string `json:"task_id"`
	Priority int    `json:"priority,omitempty"`
}

// WSTaskWakePayload is sent in a task_wake frame to notify the daemon
// that a specific task is ready to be claimed via HTTP.
type WSTaskWakePayload struct {
	TaskID   string `json:"task_id"`
	Priority int    `json:"priority,omitempty"`
}

// WSErrorPayload is sent in an error frame.
type WSErrorPayload struct {
	Message string `json:"message"`
}
