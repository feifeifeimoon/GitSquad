package service

import (
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

// EventPublisher pushes workspace events to connected browsers.
//
// A nil publisher disables realtime: the API keeps working and clients simply
// fall back to polling.
type EventPublisher interface {
	Publish(ev v1.AppEvent)
}

// DaemonWaker nudges a connected daemon that work is waiting, so it claims now
// instead of on its next heartbeat (up to 30s later).
//
// A wake is a hint, not a delivery guarantee: it is dropped when the daemon is
// offline or its send buffer is full, and the daemon's heartbeat pull covers
// that case.
type DaemonWaker interface {
	Wake(daemonID uuid.UUID)
}
