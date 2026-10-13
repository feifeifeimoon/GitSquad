package provider

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
)

func TestStderrTailKeepsTheLastBytes(t *testing.T) {
	tail := newStderrTail(16)
	if _, err := tail.Write([]byte("0123456789")); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	if _, err := tail.Write([]byte("abcdefghij")); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	// The first four bytes are gone, the last sixteen stand: a failure message
	// wants the lines nearest the process's death, not its opening banner.
	if got := tail.Tail(); got != "456789abcdefghij" {
		t.Errorf("Tail() = %q, want the last 16 bytes", got)
	}

	// The default bound is what production uses; a zero or negative max must
	// not silently disable capture.
	if got := newStderrTail(0).max; got != agentStderrTailBytes {
		t.Errorf("newStderrTail(0).max = %d, want the default %d", got, agentStderrTailBytes)
	}
}

func TestStderrTailSurvivesAByteBoundary(t *testing.T) {
	// Cutting the buffer to N bytes can slice a multi-byte rune in half. The
	// stored text must still be valid — a task error with a torn tail is
	// unreadable and some databases reject it.
	tail := newStderrTail(5)
	if _, err := tail.Write([]byte("ab你")); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	got := tail.Tail()
	if !strings.Contains(got, "你") {
		t.Errorf("Tail() = %q, want the intact rune", got)
	}
	if strings.ContainsRune(got, '\uFFFD') {
		t.Errorf("Tail() = %q, want no replacement character", got)
	}
}

func TestStderrTailTrimsWhitespace(t *testing.T) {
	tail := newStderrTail(64)
	_, _ = tail.Write([]byte("  \n  the reason  \n\n"))
	if got := tail.Tail(); got != "the reason" {
		t.Errorf("Tail() = %q, want the trimmed line", got)
	}
	if got := newStderrTail(64).Tail(); got != "" {
		t.Errorf("Tail() with nothing written = %q, want empty", got)
	}
}

// stderr is persisted in a task row and posted as an issue comment, so the
// pieces a CLI or proxy prints along the way must not ride along.
func TestSanitizeDiagnostic(t *testing.T) {
	cases := []struct {
		name, in, want, absent string
	}{
		{
			name: "control characters are dropped",
			in:   "\x1b[31mfailed\x1b[0m",
			want: "failed",
		},
		{
			name: "an authorization header is redacted",
			in:   "Authorization: Bearer sk-live-1234\nnext line",
			want: "Authorization: [REDACTED]\nnext line",
		},
		{
			name: "a json secret is redacted",
			in:   `{"api_key":"sk-abc","note":"keep"}`,
			want: `{"api_key":"[REDACTED]","note":"keep"}`,
		},
		{
			name: "a key=value secret is redacted",
			in:   "proxy token=abc123 refused",
			want: "proxy token=[REDACTED] refused",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := sanitizeDiagnostic(tc.in)
			if strings.ContainsRune(got, '\x1b') {
				t.Errorf("sanitizeDiagnostic(%q) = %q, want no escape character", tc.in, got)
			}
			if !strings.Contains(got, strings.TrimSpace(tc.want)) {
				t.Errorf("sanitizeDiagnostic(%q) = %q, want it to contain %q", tc.in, got, tc.want)
			}
			if strings.Contains(got, "sk-live-1234") || strings.Contains(got, "sk-abc") || strings.Contains(got, "abc123") {
				t.Errorf("sanitizeDiagnostic(%q) = %q, want the secret gone", tc.in, got)
			}
		})
	}
}

func TestJoinReasonAndWithStderr(t *testing.T) {
	if got := joinReason("a", "", " b ", "a"); got != "a; b" {
		t.Errorf("joinReason() = %q, want empties dropped and duplicates collapsed", got)
	}
	if got := joinReason(); got != "" {
		t.Errorf("joinReason() = %q, want empty", got)
	}

	// No stderr means no suffix: a success message must not gain a dangling
	// label, and a failure keeps exactly what it had.
	if got := withStderr("exit status 3", "agy", ""); got != "exit status 3" {
		t.Errorf("withStderr() without a tail = %q, want the message unchanged", got)
	}
	if got := withStderr("ERROR", "agy", "AGY_ERROR: boom"); got != "ERROR; agy stderr: AGY_ERROR: boom" {
		t.Errorf("withStderr() = %q", got)
	}
	// The tail is sanitized on the way in, not at the call site.
	if got := withStderr("", "agy", "token=secret"); strings.Contains(got, "secret") {
		t.Errorf("withStderr() = %q, want the tail sanitized", got)
	}
}

func TestStderrLogWriterForwardsWholeLines(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))
	w := newStderrLogWriter(logger, "agy stderr")

	if _, err := w.Write([]byte("first\nsec")); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	// A partial line waits for its newline rather than being logged in pieces.
	if !strings.Contains(buf.String(), "first") || strings.Contains(buf.String(), "sec") {
		t.Errorf("after the first write the log holds %q, want only the complete line", buf.String())
	}
	if _, err := w.Write([]byte("ond\r\n")); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	if !strings.Contains(buf.String(), "second") {
		t.Errorf("the partial line never completed: %q", buf.String())
	}
	if strings.Contains(buf.String(), "\r") {
		t.Errorf("carriage return survived: %q", buf.String())
	}

	// Info level (the daemon default) must stay quiet — stderr is chatty and
	// the failure message is where it belongs.
	buf.Reset()
	quiet := newStderrLogWriter(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})), "claude stderr")
	_, _ = quiet.Write([]byte("noise\n"))
	if buf.Len() != 0 {
		t.Errorf("info-level logger received %q, want nothing", buf.String())
	}

	// A nil logger falls back to the default rather than panicking.
	if w := newStderrLogWriter(nil, "x"); w.logger == nil {
		t.Error("newStderrLogWriter(nil).logger = nil, want slog.Default()")
	}
}
