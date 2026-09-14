package service

import v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"

// EventPublisher pushes workspace events to connected browsers.
//
// A nil publisher disables realtime: the API keeps working and clients simply
// fall back to polling.
type EventPublisher interface {
	Publish(ev v1.AppEvent)
}
