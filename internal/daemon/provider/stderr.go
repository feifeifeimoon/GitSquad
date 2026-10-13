package provider

import (
	"bytes"
	"log/slog"
	"regexp"
	"slices"
	"strings"
	"sync"
)

// agentStderrTailBytes bounds the stderr tail kept for a failure message: large
// enough to hold the CLI's own error lines (agy's AGY_ERROR JSON, the first
// frames of a panic), small enough that the message stays readable inside a
// task row and an issue comment.
const agentStderrTailBytes = 2048

// stderrTail keeps the tail of a child process's stderr.
//
// A coding CLI that ends a run on its own terms often explains why only on
// stderr — agy prints a structured AGY_ERROR line there and exits with code 3 —
// while the structured stream it feeds us carries nothing beyond a status word.
// Without this tail such a failure reaches the issue as "ERROR" and the reason
// dies with the process.
type stderrTail struct {
	max int

	mu  sync.Mutex
	buf []byte
}

func newStderrTail(max int) *stderrTail {
	if max <= 0 {
		max = agentStderrTailBytes
	}
	return &stderrTail{max: max}
}

func (s *stderrTail) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.buf = append(s.buf, p...)
	if len(s.buf) > s.max {
		s.buf = s.buf[len(s.buf)-s.max:]
	}
	return len(p), nil
}

// Tail returns the captured stderr as valid UTF-8 with surrounding whitespace
// removed. A byte-bounded tail can start mid-rune, so invalid fragments are
// dropped rather than stored.
func (s *stderrTail) Tail() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return strings.TrimSpace(strings.ToValidUTF8(string(s.buf), ""))
}

// stderrLogWriter mirrors a child process's stderr into the daemon log, one
// complete line at a time, at debug level.
//
// The tail kept by stderrTail is what reaches the failure message; this exists
// so an operator running with GITSQUAD_LOG_LEVEL=debug can watch the CLI's own
// diagnostics live instead of only after a task failed.
type stderrLogWriter struct {
	logger *slog.Logger
	label  string

	mu      sync.Mutex
	partial []byte
}

func newStderrLogWriter(logger *slog.Logger, label string) *stderrLogWriter {
	if logger == nil {
		logger = slog.Default()
	}
	return &stderrLogWriter{logger: logger, label: label}
}

func (w *stderrLogWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.partial = append(w.partial, p...)
	for {
		i := bytes.IndexByte(w.partial, '\n')
		if i < 0 {
			break
		}
		line := strings.TrimRight(string(w.partial[:i]), "\r")
		w.partial = w.partial[i+1:]
		if line != "" {
			w.logger.Debug(w.label, "line", line)
		}
	}
	return len(p), nil
}

var (
	agentAuthorizationHeaderRe = regexp.MustCompile(`(?im)(authorization\s*:\s*)[^\r\n]+`)
	agentJSONSecretRe          = regexp.MustCompile(`(?i)("(?:token|auth|authorization|api[_-]?key|secret|password)"\s*:\s*)"(?:\\.|[^"\\])*"`)
	agentSecretAssignmentRe    = regexp.MustCompile(`(?i)(authorization|auth|api[_-]?key|token|secret|password)(\s*[:=]\s*)([^\s,;]+)`)
)

// sanitizeDiagnostic strips terminal control characters and common secret
// shapes before CLI stderr is persisted in an error message. That message lands
// in the task row and is posted as an issue comment, so anything a proxy or the
// CLI printed along the way travels with it.
func sanitizeDiagnostic(value string) string {
	value = strings.Map(func(r rune) rune {
		if r < 0x20 && r != '\n' && r != '\t' {
			return -1
		}
		return r
	}, value)
	value = agentAuthorizationHeaderRe.ReplaceAllString(value, `${1}[REDACTED]`)
	value = agentJSONSecretRe.ReplaceAllString(value, `${1}"[REDACTED]"`)
	value = agentSecretAssignmentRe.ReplaceAllString(value, `${1}${2}[REDACTED]`)
	return value
}

// joinReason joins the parts describing one failure with "; ", dropping empties
// and exact duplicates. Failure text is read by humans and asserted by tests,
// so the shape stays flat: one line, parts in the order they were learned.
func joinReason(parts ...string) string {
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" || slices.Contains(out, p) {
			continue
		}
		out = append(out, p)
	}
	return strings.Join(out, "; ")
}

// withStderr appends the CLI's stderr tail to a failure message; the label
// names the process the text came from, since a task error can carry several
// reasons in sequence.
func withStderr(msg, label, tail string) string {
	if tail == "" {
		return strings.TrimSpace(msg)
	}
	return joinReason(msg, label+" stderr: "+sanitizeDiagnostic(tail))
}
