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

// ── Pending installations ────────────────────────────────────────────────

// PendingInstallation holds GitHub App installation metadata from a webhook
// that arrived before the user's browser callback.
type PendingInstallation struct {
	InstallationID      int64
	AccountLogin        string
	AccountType         string
	RepositorySelection string
	CreatedAt           time.Time
}

type pendingEntry struct {
	data    PendingInstallation
	expires time.Time
}

// PendingInstallationStore bridges the gap between installation.created
// webhooks (no user context) and the browser callback (has user context).
// Installations live in memory for up to 10 minutes; if the callback
// never arrives the entry expires and the event remains in webhook_events.
type PendingInstallationStore struct {
	mu   sync.Mutex
	data map[int64]pendingEntry // key = GitHub installation_id
}

func NewPendingInstallationStore() *PendingInstallationStore {
	s := &PendingInstallationStore{data: make(map[int64]pendingEntry)}
	go s.reap()
	return s
}

// Set stores a pending installation with a 10-minute TTL.
func (s *PendingInstallationStore) Set(installationID int64, p PendingInstallation) {
	s.mu.Lock()
	s.data[installationID] = pendingEntry{data: p, expires: time.Now().Add(10 * time.Minute)}
	s.mu.Unlock()
}

// Get returns the pending installation or nil if not found / expired.
func (s *PendingInstallationStore) Get(installationID int64) *PendingInstallation {
	s.mu.Lock()
	e, ok := s.data[installationID]
	s.mu.Unlock()
	if !ok || time.Now().After(e.expires) {
		return nil
	}
	return &e.data
}

// UpdateSelection updates the repository_selection for a pending installation.
// Does nothing if the installation is not in the store or has expired.
func (s *PendingInstallationStore) UpdateSelection(installationID int64, selection string) {
	s.mu.Lock()
	e, ok := s.data[installationID]
	if ok && time.Now().Before(e.expires) {
		e.data.RepositorySelection = selection
		s.data[installationID] = e
	}
	s.mu.Unlock()
}

// Delete removes a pending installation from the store.
func (s *PendingInstallationStore) Delete(installationID int64) {
	s.mu.Lock()
	delete(s.data, installationID)
	s.mu.Unlock()
}

func (s *PendingInstallationStore) reap() {
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
