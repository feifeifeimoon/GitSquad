package daemon

import (
	"context"
	"log/slog"
	"time"
)

// runWithReconnect wraps the daemon's connect + eventLoop in a retry loop
// with exponential backoff. It never returns nil unless ctx is cancelled —
// it reconnects forever on transient failures.
func (d *Daemon) runWithReconnect(ctx context.Context) error {
	attempt := 0

	for {
		if err := ctx.Err(); err != nil {
			slog.Info("daemon shutting down")
			return nil
		}

		slog.Info("connecting", "url", d.cfg.APIURL)

		ws, err := d.client.ConnectWS(ctx, d.cfg.ID)
		if err != nil {
			attempt++
			backoff := backoffDuration(attempt)
			slog.Warn("connect failed, retrying", "attempt", attempt, "backoff", backoff, "error", err)
			if sleepCtx(ctx, backoff) != nil {
				return nil
			}
			continue
		}

		d.ws = ws
		attempt = 0
		slog.Info("daemon online")

		// Re-upload runtimes on every (re)connect — they may have changed.
		_, runtimes := d.DetectRuntimes()
		d.lastRuntime = runtimes
		slog.Info("runtimes detected", "count", len(runtimes))
		if err := d.client.PutRuntimes(ctx, d.cfg.ID, runtimes); err != nil {
			slog.Warn("upload runtimes failed", "error", err)
		}

		// Enter the event loop. Returns on disconnect or ctx cancellation.
		if err := d.eventLoop(ctx); err != nil {
			slog.Warn("connection lost", "error", err)
		}

		d.ws.Close()
		d.ws = nil

		if ctx.Err() != nil {
			return nil
		}
		// Loop back to reconnect.
	}
}

// backoffDuration returns the wait time for a given reconnection attempt.
// Sequence: 1s, 2s, 4s, 8s, 16s, 30s, 30s...
func backoffDuration(attempt int) time.Duration {
	d := time.Duration(1<<uint(attempt)) * time.Second
	if d > 30*time.Second {
		d = 30 * time.Second
	}
	return d
}

// sleepCtx sleeps for d or until ctx is cancelled.
func sleepCtx(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
