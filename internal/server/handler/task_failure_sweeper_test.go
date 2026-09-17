package handler

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// recordingSweeper stands in for TaskService so the loop can be exercised
// without a database.
type recordingSweeper struct {
	mu        sync.Mutex
	graces    []time.Duration
	unbounded int
	calls     chan struct{}
}

func (r *recordingSweeper) FailSilentDaemonTasks(ctx context.Context, grace time.Duration) error {
	_, bounded := ctx.Deadline()
	r.mu.Lock()
	r.graces = append(r.graces, grace)
	if !bounded {
		r.unbounded++
	}
	r.mu.Unlock()
	select {
	case r.calls <- struct{}{}:
	default:
	}
	return nil
}

func (r *recordingSweeper) callCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.graces)
}

func (r *recordingSweeper) unboundedCalls() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.unbounded
}

func (r *recordingSweeper) firstGrace() time.Duration {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.graces) == 0 {
		return 0
	}
	return r.graces[0]
}

func TestTaskFailureSweeperSweepsWithItsGrace(t *testing.T) {
	fake := &recordingSweeper{calls: make(chan struct{}, 4)}
	const grace = 250 * time.Millisecond
	s := &TaskFailureSweeper{tasks: fake, grace: grace, interval: 5 * time.Millisecond}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go s.run(ctx)

	select {
	case <-fake.calls:
	case <-time.After(3 * time.Second):
		t.Fatal("the sweeper never swept")
	}

	// The grace is the whole point of the release path — it is what lets a
	// reconnect save its task — so it must be the configured value and not, say,
	// the interval.
	if got := fake.firstGrace(); got != grace {
		t.Fatalf("swept with grace %v, want %v", got, grace)
	}

	// The loop's context never expires, so every call has to carry its own bound;
	// an unbounded statement would wedge the release path for every daemon.
	if n := fake.unboundedCalls(); n != 0 {
		t.Fatalf("%d sweep(s) ran without a deadline", n)
	}

	// Cancelling the context stops the loop rather than leaking the ticker.
	cancel()
	time.Sleep(100 * time.Millisecond)
	stopped := fake.callCount()
	time.Sleep(150 * time.Millisecond)
	if after := fake.callCount(); after != stopped {
		t.Fatalf("the sweeper kept running after its context was cancelled: %d → %d sweeps", stopped, after)
	}
}

// A failing sweep must not end the loop: one bad statement would otherwise stop
// the release path for every daemon.
func TestTaskFailureSweeperSurvivesAFailedSweep(t *testing.T) {
	fake := &failingSweeper{}
	s := &TaskFailureSweeper{tasks: fake, grace: time.Minute, interval: 5 * time.Millisecond}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go s.run(ctx)

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if fake.calls.Load() >= 3 {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("the sweeper stopped after a failed sweep (%d calls)", fake.calls.Load())
}

type failingSweeper struct {
	calls atomic.Int32
}

func (f *failingSweeper) FailSilentDaemonTasks(context.Context, time.Duration) error {
	f.calls.Add(1)
	return errors.New("boom")
}

// The grace has to outlast every signal a reconnect depends on — the 30s
// heartbeat, the 60s batched flush, the hub's 5s disconnect grace — or the
// release path would fail work belonging to a daemon that is perfectly fine.
// The ordering is asserted rather than assumed, the same way the freshness and
// reconnect windows are kept ordered elsewhere.
func TestTaskFailureGraceOutlastsTheHeartbeatChain(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s := NewTaskFailureSweeper(ctx, &recordingSweeper{calls: make(chan struct{}, 1)})

	if s.grace <= 60*time.Second {
		t.Fatalf("grace %v is not comfortably above the 60s batched heartbeat flush", s.grace)
	}
	if s.interval <= 0 || s.interval >= s.grace {
		t.Fatalf("interval %v must be positive and shorter than the grace %v", s.interval, s.grace)
	}
}
