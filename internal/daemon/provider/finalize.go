package provider

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"time"
)

// finalizeResult produces the final Result from a finished run.
//
// stderr is the CLI's captured stderr tail and label names the CLI in the
// message. A run can end three ways and the error has to describe all of them:
// the CLI reported a failure on its own stream, the process itself exited
// non-zero, or a deadline cut it off. Whatever the source, the exit status and
// the CLI's last stderr lines ride along — a provider that reports nothing but
// a status word ("ERROR") leaves an operator nothing to act on, while its own
// stderr tends to carry the actual reason.
func finalizeResult(final Result, accumulated string, waitErr error, stderr, label string, ctxErr error, dur time.Duration) Result {
	if final.Status == "" {
		final.Status = "completed"
	}
	if ctxErr != nil {
		final.Status = "timeout"
		if ctxErr == context.Canceled {
			final.Status = "cancelled"
		}
	}
	if waitErr != nil && final.Status == "completed" {
		// The stream reported nothing wrong but the process still died, so the
		// exit status is the only signal there is.
		final.Status = "failed"
	}
	if final.Status != "completed" {
		final.Error = withStderr(joinReason(final.Error, ctxReason(ctxErr), processExit(waitErr)), label, stderr)
	}
	if final.Output == "" {
		final.Output = accumulated
	}
	final.DurationMs = dur.Milliseconds()
	return final
}

// ctxReason renders the context error for a run that was cut off, so a timeout
// names the deadline instead of repeating the status back.
func ctxReason(ctxErr error) string {
	if ctxErr == nil {
		return ""
	}
	return ctxErr.Error()
}

// processExit renders the process's exit status for a failure message. The exit
// code is often the only structured signal a CLI emits — agy exits 3 for a turn
// that ended on a model error — and naming it is what lets a reader tell "the
// CLI refused" apart from "the daemon gave up".
func processExit(waitErr error) string {
	if waitErr == nil {
		return ""
	}
	var exit *exec.ExitError
	if errors.As(waitErr, &exit) {
		if code := exit.ExitCode(); code >= 0 {
			return fmt.Sprintf("exit status %d", code)
		}
		// Killed by a signal: ExitCode reports -1 and "signal: killed" is the
		// part worth keeping.
		return exit.Error()
	}
	return waitErr.Error()
}
