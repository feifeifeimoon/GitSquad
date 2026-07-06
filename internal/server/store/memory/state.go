// Package memory provides in-memory stores for transient data.
package memory

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

type entry struct {
	userID  uuid.UUID
	expires time.Time
}

// StateStore maps opaque state strings to user IDs with TTL-based expiry.
// Used for OAuth-style flows where a redirect target cannot carry auth headers
// (e.g. GitHub App installation callback).
type StateStore struct {
	mu   sync.Mutex
	data map[string]entry
}

func NewStateStore() *StateStore {
	s := &StateStore{data: make(map[string]entry)}
	go s.reap()
	return s
}

// Set stores a user ID under the given state key for ttl duration.
func (s *StateStore) Set(state string, userID uuid.UUID, ttl time.Duration) {
	s.mu.Lock()
	s.data[state] = entry{userID: userID, expires: time.Now().Add(ttl)}
	s.mu.Unlock()
}

// Pop returns the user ID for the given state and deletes the entry.
// Returns uuid.Nil if the state is unknown or expired.
func (s *StateStore) Pop(state string) uuid.UUID {
	s.mu.Lock()
	e, ok := s.data[state]
	if ok {
		delete(s.data, state)
	}
	s.mu.Unlock()
	if !ok || time.Now().After(e.expires) {
		return uuid.Nil
	}
	return e.userID
}

// reap periodically removes expired entries.
func (s *StateStore) reap() {
	for range time.Tick(time.Minute) {
		s.mu.Lock()
		now := time.Now()
		for k, v := range s.data {
			if now.After(v.expires) {
				delete(s.data, k)
			}
		}
		s.mu.Unlock()
	}
}
