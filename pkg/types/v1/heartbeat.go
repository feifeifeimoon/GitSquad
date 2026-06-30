package v1

// HeartbeatResponse is returned by POST /api/v1/daemon/:id/heartbeat.
type HeartbeatResponse struct {
	ServerTime   string `json:"server_time"`
	PendingTasks int    `json:"pending_tasks"`
}
