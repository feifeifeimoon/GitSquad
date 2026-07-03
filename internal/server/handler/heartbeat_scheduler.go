package handler

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
)

// HeartbeatStore is the minimal DB interface the scheduler needs.
type HeartbeatStore interface {
	DaemonHeartbeat(ctx context.Context, id uuid.UUID) error
}

// HeartbeatScheduler coalesces per-heartbeat last_seen_at updates into a
// periodic bulk flush, avoiding a DB write on every heartbeat (every 30s).
//
// The status flip (offline→online) still goes through the synchronous
// MarkOnline path — only the repeated "still alive" bumps are batched here.
type HeartbeatScheduler struct {
	mu       sync.Mutex
	recently map[uuid.UUID]time.Time
	store    HeartbeatStore
	interval time.Duration
}

// NewHeartbeatScheduler creates a scheduler and starts its background flush
// goroutine. The goroutine exits when the provided context is cancelled.
func NewHeartbeatScheduler(ctx context.Context, store HeartbeatStore) *HeartbeatScheduler {
	s := &HeartbeatScheduler{
		recently: make(map[uuid.UUID]time.Time),
		store:    store,
		interval: 60 * time.Second,
	}
	go s.flushLoop(ctx)
	return s
}

// RecordHeartbeat remembers that the daemon sent a heartbeat now.
// It does NOT write to the database — the flushLoop handles that.
func (s *HeartbeatScheduler) RecordHeartbeat(id uuid.UUID) {
	s.mu.Lock()
	s.recently[id] = time.Now()
	s.mu.Unlock()
}

func (s *HeartbeatScheduler) flushLoop(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.flush(ctx)
		}
	}
}

func (s *HeartbeatScheduler) flush(ctx context.Context) {
	s.mu.Lock()
	batch := s.recently
	s.recently = make(map[uuid.UUID]time.Time)
	s.mu.Unlock()

	for id := range batch {
		flushCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		_ = s.store.DaemonHeartbeat(flushCtx, id)
		cancel()
	}
}
