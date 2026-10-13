package provider

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildAgyArgs(t *testing.T) {
	args := buildAgyArgs("fix it", "/tmp/agy.log", ExecOptions{})
	want := []string{"-p", "fix it", "--output-format", "stream-json", "--dangerously-skip-permissions", "--log-file", "/tmp/agy.log"}
	if strings.Join(args, " ") != strings.Join(want, " ") {
		t.Fatalf("buildAgyArgs() = %v, want %v", args, want)
	}
	// stream-json output is what carries the usage object; without it this
	// provider reports no tokens at all.
	if !strings.Contains(strings.Join(args, " "), "stream-json") {
		t.Error("buildAgyArgs() must request the structured stream to get usage")
	}

	args = buildAgyArgs("fix it", "", ExecOptions{Model: "Claude Opus 4.6 (Thinking)", Cwd: "/tmp/repo"})
	joined := strings.Join(args, " ")
	for _, want := range []string{"--model Claude Opus 4.6 (Thinking)", "--add-dir /tmp/repo"} {
		if !strings.Contains(joined, want) {
			t.Errorf("args missing %q: %v", want, args)
		}
	}
	if strings.Contains(joined, "--log-file") {
		t.Errorf("args must omit --log-file when no path is given: %v", args)
	}
}

func TestNewRegistry(t *testing.T) {
	for _, kind := range []string{"claude", "agy"} {
		b, err := New(kind, "/usr/local/bin/"+kind, nil)
		if err != nil {
			t.Fatalf("New(%q) error = %v", kind, err)
		}
		if b.Kind() != kind {
			t.Errorf("New(%q).Kind() = %q", kind, b.Kind())
		}
	}
	// Not implemented yet — must fail loudly rather than silently no-op.
	if _, err := New("codex", "", nil); err == nil {
		t.Error("New(codex) should error while the adapter is pending")
	}
}

// These lines are copied verbatim from real agy stream-json output.
func TestParseAgyEvent(t *testing.T) {
	evt, ok := parseAgyEvent([]byte(`{"event":"step_update","step_update":{"conversation_id":"c1","step_index":7,"state":"DONE","step_type":"agent_response","text_delta":"\n","duration_seconds":2.83,"usage":{"input_tokens":13689,"output_tokens":44,"thinking_tokens":43,"cache_read_tokens":0,"total_tokens":13733}}}`))
	if !ok || evt.Event != "step_update" || evt.StepUpdate == nil {
		t.Fatalf("parseAgyEvent() = (%+v, %v), want a step_update", evt, ok)
	}
	su := evt.StepUpdate
	if su.StepType != "agent_response" || su.State != "DONE" || su.TextDelta != "\n" {
		t.Errorf("step_update = %+v, want agent_response/DONE", su)
	}
	if su.Usage == nil || su.Usage.InputTokens != 13689 || su.Usage.ThinkingTokens != 43 {
		t.Errorf("usage = %+v, want input 13689 / thinking 43", su.Usage)
	}

	evt, ok = parseAgyEvent([]byte(`{"event":"result","result":{"conversation_id":"c1","status":"SUCCESS","response":"yes\n","duration_seconds":5738.78,"num_turns":3,"usage":{"input_tokens":40219,"output_tokens":200,"thinking_tokens":197,"cache_read_tokens":0,"total_tokens":40419}}}`))
	if !ok || evt.Result == nil {
		t.Fatalf("parseAgyEvent() = (%+v, %v), want a result", evt, ok)
	}
	if evt.Result.NumTurns != 3 || evt.Result.Usage.TotalTokens != 40419 || evt.Result.ConversationID != "c1" {
		t.Errorf("result = %+v, want num_turns 3 / total 40419", evt.Result)
	}

	// init is recognised but carries nothing this adapter needs.
	if evt, ok := parseAgyEvent([]byte(`{"event":"init","conversation_id":"c1","init":{"cwd":"D:\tmp"}}`)); !ok || evt.Event != "init" {
		t.Errorf("parseAgyEvent(init) = (%+v, %v), want it accepted", evt, ok)
	}

	// Junk, and envelopes with no discriminator, are skipped rather than fatal.
	if _, ok := parseAgyEvent([]byte(`not json`)); ok {
		t.Error("parseAgyEvent(garbage) = ok, want !ok")
	}
	if _, ok := parseAgyEvent([]byte(`{"step_update":{"state":"DONE"}}`)); ok {
		t.Error("parseAgyEvent() without an event name = ok, want !ok")
	}
}

func TestAgyResultStatus(t *testing.T) {
	if got := (agyResult{Status: "SUCCESS", Response: "ok", ConversationID: "conv-1"}).toResult(); got.Status != "completed" || got.Output != "ok" || got.SessionID != "conv-1" {
		t.Errorf("SUCCESS = %+v, want completed/ok", got)
	}
	got := (agyResult{Status: "ERROR"}).toResult()
	if got.Status != "failed" || got.Error != "ERROR" {
		t.Errorf("ERROR = %+v, want failed with the status surfaced", got)
	}
}

// agy writes some terminal provider failures only to its own log — the
// structured stream and the exit code can both look fine. The log is read after
// every run so this class is not recorded as a blank success.
func TestAgyLogFailure(t *testing.T) {
	dir := t.TempDir()

	path := filepath.Join(dir, "clean.log")
	if err := os.WriteFile(path, []byte("I0601 10:00:00.000000 1 server.go:1] starting\nI0601 10:00:01.000000 1 server.go:2] CLI app data directory: /tmp/app\n"), 0o600); err != nil {
		t.Fatalf("write log: %v", err)
	}
	if got := agyLogFailure(path); got != "" {
		t.Errorf("agyLogFailure(clean log) = %q, want empty", got)
	}

	// glog prefixes the line with date, pid and file; only the message matters,
	// and the LAST one wins: earlier markers can belong to a retried blip.
	path = filepath.Join(dir, "failed.log")
	body := "E0601 10:00:00.000000 1 server.go:3] agent executor error: stream error: EOF\n" +
		"I0601 10:00:01.000000 1 server.go:4] retrying\n" +
		"E0601 10:00:05.000000 1 server.go:5] agent executor error: User location is not supported\n"
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("write log: %v", err)
	}
	if got := agyLogFailure(path); got != "User location is not supported" {
		t.Errorf("agyLogFailure() = %q, want the last marker's reason", got)
	}

	// A missing log is not a failure: there is simply nothing to add.
	if got := agyLogFailure(filepath.Join(dir, "absent.log")); got != "" {
		t.Errorf("agyLogFailure(missing) = %q, want empty", got)
	}
	if got := agyLogFailure(""); got != "" {
		t.Errorf("agyLogFailure(\"\") = %q, want empty", got)
	}
}

func TestApplyAgyLogFailure(t *testing.T) {
	// The silent-failure shape: completed, nothing on stdout, reason in the log.
	res := Result{Status: "completed"}
	applyAgyLogFailure(&res, "stream error: EOF")
	if res.Status != "failed" || !strings.Contains(res.Error, "stream error: EOF") {
		t.Errorf("res = %+v, want a failure carrying the log's reason", res)
	}

	// A run that delivered its answer is trusted: the marker can belong to a
	// blip the CLI retried, and failing a complete run over that would be worse
	// than missing the guard.
	res = Result{Status: "completed", Output: "the answer"}
	applyAgyLogFailure(&res, "stream error: EOF")
	if res.Status != "completed" || res.Error != "" {
		t.Errorf("res = %+v, want the completed run untouched", res)
	}

	// A run that already failed keeps the evidence it has rather than gaining a
	// second, possibly unrelated cause.
	res = Result{Status: "failed", Error: "ERROR; exit status 3"}
	applyAgyLogFailure(&res, "stream error: EOF")
	if strings.Contains(res.Error, "stream error") {
		t.Errorf("Error = %q, want the existing failure text kept as-is", res.Error)
	}

	// No marker, nothing to do.
	res = Result{Status: "completed"}
	applyAgyLogFailure(&res, "")
	if res.Status != "completed" {
		t.Errorf("res = %+v, want no change without a marker", res)
	}
}

// thinking_tokens sits inside output_tokens: a turn reporting output 85 with
// thinking 84 had total 13204 = input 13119 + output 85. Adding thinking on top
// would bill the reasoning pass twice.
func TestNormalizeAgyUsageDropsThinking(t *testing.T) {
	got := normalizeAgyUsage(agyUsage{InputTokens: 13119, OutputTokens: 85, ThinkingTokens: 84, TotalTokens: 13204})
	want := TokenUsage{InputTokens: 13119, OutputTokens: 85}
	if got != want {
		t.Errorf("normalizeAgyUsage() = %+v, want %+v", got, want)
	}
}

// Where the cached prefix sits is decided from agy's own total, because getting
// it wrong double-bills it. Both shapes are exercised here; only the zero-cache
// case has been observed from the real CLI.
func TestNormalizeAgyUsageSettlesCacheShapeFromTotal(t *testing.T) {
	// Peer bucket: the total is input + output + cache read, so nothing moves.
	peer := normalizeAgyUsage(agyUsage{InputTokens: 1000, OutputTokens: 100, CacheReadTokens: 400, TotalTokens: 1500})
	if peer.InputTokens != 1000 || peer.CacheReadTokens != 400 {
		t.Errorf("peer-bucket shape = %+v, want input 1000 kept and cache 400 kept", peer)
	}

	// Inclusive: the total is input + output with the cache read already inside
	// input, so it has to come back out.
	inclusive := normalizeAgyUsage(agyUsage{InputTokens: 1400, OutputTokens: 100, CacheReadTokens: 400, TotalTokens: 1500})
	if inclusive.InputTokens != 1000 || inclusive.CacheReadTokens != 400 {
		t.Errorf("inclusive shape = %+v, want input reduced to 1000 with cache 400 kept", inclusive)
	}

	// A total matching neither shape is left alone rather than mangled.
	if odd := normalizeAgyUsage(agyUsage{InputTokens: 1000, OutputTokens: 100, CacheReadTokens: 400, TotalTokens: 9999}); odd.InputTokens != 1000 {
		t.Errorf("unrecognised shape = %+v, want input untouched", odd)
	}

	// With no total there is nothing to compare against, so the value stands.
	if noTotal := normalizeAgyUsage(agyUsage{InputTokens: 1000, OutputTokens: 100, CacheReadTokens: 400}); noTotal.InputTokens != 1000 {
		t.Errorf("missing total = %+v, want input untouched", noTotal)
	}

	// A cache read larger than input must not produce a negative count.
	if neg := normalizeAgyUsage(agyUsage{InputTokens: 100, OutputTokens: 50, CacheReadTokens: 400, TotalTokens: 150}); neg.InputTokens != 0 {
		t.Errorf("over-large cache read = %+v, want input clamped at 0", neg)
	}
}

// agy reports usage per turn and again as a conversation total. Billing the
// total would re-charge every earlier turn as soon as a task resumes a
// conversation, so the per-turn accumulation wins.
func TestAgyUsageForRunPrefersTurnDeltas(t *testing.T) {
	turns := TokenUsage{InputTokens: 13689, OutputTokens: 44}
	total := TokenUsage{InputTokens: 40219, OutputTokens: 200}

	got := agyUsageForRun("opus", turns, true, total, true)
	if u := got["opus"]; u != turns {
		t.Errorf("with turn deltas = %+v, want this run's turns %+v, not the conversation total", u, turns)
	}

	// A build that stops emitting per-turn usage still reports something.
	got = agyUsageForRun("opus", TokenUsage{}, false, total, true)
	if u := got["opus"]; u != total {
		t.Errorf("without turn deltas = %+v, want the result total %+v", u, total)
	}

	// Nothing reported is nil, which the ledger records as unreported rather
	// than as zero tokens.
	if got := agyUsageForRun("opus", TokenUsage{}, false, TokenUsage{}, false); got != nil {
		t.Errorf("no usage = %+v, want nil", got)
	}
	// An all-zero report is not a report either.
	if got := agyUsageForRun("opus", TokenUsage{}, false, TokenUsage{}, true); got != nil {
		t.Errorf("all-zero usage = %+v, want nil", got)
	}

	// agy names no model, so the configured one stands in; without one the
	// ledger would get a blank key.
	got = agyUsageForRun("", turns, true, total, true)
	if _, ok := got[UnknownModel]; !ok {
		t.Errorf("unnamed model = %+v, want the %q key", got, UnknownModel)
	}
}
