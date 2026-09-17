package handler

import (
	"context"
	"log/slog"
	"time"
)

// A daemon's tasks are not failed because its socket ended. Losing contact
// proves nothing about whether the daemon is still running the task — a NAT
// rebind, a suspended laptop or a server-side read deadline all end the socket
// while the daemon keeps working, and its task results travel over HTTP, not the
// WebSocket. Only silence on the signal the daemon repeats on its own schedule
// counts, so the release path is a clock over heartbeats rather than a callback
// on disconnect.
const (
	// taskFailureGrace is how long a daemon may go without heartbeating before
	// its in-flight tasks are failed. It is deliberately far longer than the
	// heartbeat interval (30s) and the batched flush (60s): the point is to
	// survive a partition that a reconnect repairs, while still retiring work
	// whose daemon is never coming back.
	taskFailureGrace = 5 * time.Minute

	// taskFailureSweepInterval bounds how stale the check can be. Sweeping twice
	// per heartbeat-flush interval keeps the release prompt without putting the
	// query on the heartbeat path.
	taskFailureSweepInterval = 30 * time.Second

	// taskFailureCallTimeout bounds a single sweep. The loop's own context is the
	// process lifetime, so without this a statement that never returns would wedge
	// the release path for every daemon. A sweep that is cut off changes nothing
	// and is retried on the next tick.
	taskFailureCallTimeout = 10 * time.Second
)

// SilentTaskFailing is the slice of TaskService the sweeper needs. It is an
// interface so the loop can be exercised without a database.
type SilentTaskFailing interface {
	FailSilentDaemonTasks(ctx context.Context, grace time.Duration) error
}

// TaskFailureSweeper releases the in-flight tasks of daemons that have gone
// silent, on the heartbeat clock described above. It lives for the process
// lifetime and exits when the provided context is cancelled.
type TaskFailureSweeper struct {
	tasks    SilentTaskFailing
	grace    time.Duration
	interval time.Duration
}

// NewTaskFailureSweeper creates a sweeper and starts its background loop.
func NewTaskFailureSweeper(ctx context.Context, tasks SilentTaskFailing) *TaskFailureSweeper {
	s := &TaskFailureSweeper{
		tasks:    tasks,
		grace:    taskFailureGrace,
		interval: taskFailureSweepInterval,
	}
	go s.run(ctx)
	return s
}

func (s *TaskFailureSweeper) run(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Bounded separately from the loop's own context, which never expires.
			callCtx, cancel := context.WithTimeout(ctx, taskFailureCallTimeout)
			err := s.tasks.FailSilentDaemonTasks(callCtx, s.grace)
			cancel()
			if err != nil {
				// Keep sweeping: one failed statement must not stop the release
				// path for every other daemon.
				slog.Error("fail silent daemon tasks", "error", err, "grace", s.grace)
			}
		}
	}
}
