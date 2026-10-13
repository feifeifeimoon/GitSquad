package provider

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// agyBackend drives the Antigravity CLI in one-shot print mode
// (`agy -p <prompt> --output-format stream-json --dangerously-skip-permissions`).
//
// The structured stream is what makes token accounting possible: agy reports a
// usage object only on it, never in plain text mode. It also turns the run into
// real progress — step_update events carrying text_delta — instead of one blob
// of stdout at the end.
//
// Its envelope differs from Claude's: the discriminator is "event" (not "type"),
// and the payload is nested under a field named after the event.
type agyBackend struct {
	cfg Config
}

func newAgyBackend(cfg Config) *agyBackend { return &agyBackend{cfg: cfg} }

func (b *agyBackend) Kind() string { return "agy" }

// buildAgyArgs assembles the argv for a one-shot agy invocation. The prompt
// goes in argv (agy has no stream-json input mode wired up here),
// --dangerously-skip-permissions is what makes it non-interactive, and
// --log-file pins the CLI's own log to a path this process owns.
func buildAgyArgs(prompt, logPath string, opts ExecOptions) []string {
	args := []string{
		"-p", prompt,
		"--output-format", "stream-json",
		"--dangerously-skip-permissions",
	}
	if logPath != "" {
		args = append(args, "--log-file", logPath)
	}
	if opts.Model != "" {
		args = append(args, "--model", opts.Model)
	}
	if opts.Cwd != "" {
		args = append(args, "--add-dir", opts.Cwd)
	}
	return args
}

// Execute runs agy once and returns a Session streaming its step updates plus
// the terminal result.
func (b *agyBackend) Execute(ctx context.Context, prompt string, opts ExecOptions) (*Session, error) {
	exe := b.cfg.ExecutablePath
	if exe == "" {
		exe = "agy"
	}

	ctx, cancel := context.WithCancel(ctx)
	if opts.Timeout > 0 {
		ctx, cancel = context.WithTimeout(ctx, opts.Timeout)
	}

	// agy writes some terminal failures only to its own log — a turn can end
	// with the reason there and nothing on the structured stream — so each run
	// gets a log file this process owns and reads once the CLI has exited.
	logFile, err := os.CreateTemp("", "gitsquad-agy-*.log")
	if err != nil {
		cancel()
		return nil, fmt.Errorf("create agy log file: %w", err)
	}
	logPath := logFile.Name()
	_ = logFile.Close()

	cmd := exec.CommandContext(ctx, exe, buildAgyArgs(prompt, logPath, opts)...)
	cmd.Dir = opts.Cwd
	cmd.Env = append(os.Environ(), opts.Env...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		_ = os.Remove(logPath)
		return nil, err
	}
	stderr := newStderrTail(agentStderrTailBytes)
	cmd.Stderr = io.MultiWriter(newStderrLogWriter(b.cfg.Logger, "agy stderr"), stderr)

	if err := cmd.Start(); err != nil {
		cancel()
		_ = os.Remove(logPath)
		return nil, err
	}

	msgs := make(chan Message, 64)
	result := make(chan Result, 1)

	go func() {
		defer cancel()
		defer close(msgs)
		defer close(result)
		defer os.Remove(logPath)

		start := time.Now()
		var out strings.Builder
		var final Result
		var turnUsage, totalUsage TokenUsage
		turnsSeen, totalSeen := false, false

		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
		for scanner.Scan() {
			evt, ok := parseAgyEvent(scanner.Bytes())
			if !ok {
				continue
			}
			if su := evt.StepUpdate; su != nil {
				if su.Usage != nil {
					if u := normalizeAgyUsage(*su.Usage); !u.IsZero() {
						turnUsage = turnUsage.Add(u)
						turnsSeen = true
					}
				}
				if su.TextDelta != "" {
					out.WriteString(su.TextDelta)
					trySend(msgs, Message{Type: MessageText, Content: su.TextDelta})
				}
			}
			if r := evt.Result; r != nil {
				final = r.toResult()
				if r.Usage != nil {
					totalUsage = normalizeAgyUsage(*r.Usage)
					totalSeen = true
				}
			}
		}

		waitErr := cmd.Wait()
		res := finalizeResult(final, out.String(), waitErr, stderr.Tail(), "agy", ctx.Err(), time.Since(start))
		res.Usage = agyUsageForRun(opts.Model, turnUsage, turnsSeen, totalUsage, totalSeen)
		applyAgyLogFailure(&res, agyLogFailure(logPath))
		result <- res
	}()

	return &Session{Messages: msgs, Result: result}, nil
}

// agyUsageForRun picks which of agy's two usage reports to bill.
//
// agy reports usage twice and they mean different things: each step_update
// carries the turn it just finished, while the result event carries a running
// total for the whole conversation. That was measured, not assumed — three
// one-turn invocations of the same conversation reported 13119, then 13411, and
// a result of 40219, which is exactly their sum.
//
// This run's own turns therefore win. Billing the result total would re-charge
// every earlier turn the moment a task resumes a conversation. The result total
// stays as the fallback for a build that stops emitting per-turn usage.
func agyUsageForRun(configuredModel string, turns TokenUsage, turnsSeen bool, total TokenUsage, totalSeen bool) map[string]TokenUsage {
	model := configuredModel
	if model == "" {
		model = UnknownModel
	}
	switch {
	case turnsSeen:
		return map[string]TokenUsage{model: turns}
	case totalSeen && !total.IsZero():
		return map[string]TokenUsage{model: total}
	default:
		return nil
	}
}

// ── log-derived failures ──────────────────────────────────────────────

// agyExecutorErrorRe matches the marker agy writes to its own log when a turn
// ended on a provider failure. Only the last one is read: earlier markers can
// belong to a blip the CLI retried, while the final one is the one that ended
// the run.
var agyExecutorErrorRe = regexp.MustCompile(`agent executor error:\s*(.+)`)

// agyLogFailure returns the terminal provider failure agy recorded in its
// per-run log, or "" when the log names none. A missing or unreadable log is
// not itself a failure — there is simply nothing to add.
func agyLogFailure(logPath string) string {
	if logPath == "" {
		return ""
	}
	data, err := os.ReadFile(logPath)
	if err != nil {
		return ""
	}
	matches := agyExecutorErrorRe.FindAllSubmatch(data, -1)
	if len(matches) == 0 {
		return ""
	}
	return strings.TrimSpace(string(matches[len(matches)-1][1]))
}

// applyAgyLogFailure folds a log-only provider failure into the result.
//
// A marker on its own does not mean this run failed: the log also carries
// errors agy retried and recovered from — a dropped request mid-run leaves one
// behind while the turn finishes fine. So a marker only promotes a run that
// otherwise looks successful AND produced no output, which is the silent-failure
// shape this guard exists for. A run that already failed keeps the evidence it
// has rather than gaining a second, possibly unrelated cause.
func applyAgyLogFailure(res *Result, reason string) {
	if reason == "" || res.Status != "completed" || strings.TrimSpace(res.Output) != "" {
		return
	}
	res.Status = "failed"
	res.Error = "agy provider error: " + sanitizeDiagnostic(reason)
}

// ── stream-json parsing ────────────────────────────────────────────────

// agyEvent is one NDJSON line from agy stdout. The payload sits under a field
// named after the event rather than beside it.
type agyEvent struct {
	Event      string         `json:"event"`
	StepUpdate *agyStepUpdate `json:"step_update"`
	Result     *agyResult     `json:"result"`
}

type agyStepUpdate struct {
	StepIndex int       `json:"step_index"`
	State     string    `json:"state"`     // ACTIVE | DONE
	StepType  string    `json:"step_type"` // user_input | agent_response | ...
	TextDelta string    `json:"text_delta"`
	Usage     *agyUsage `json:"usage"`
}

type agyResult struct {
	ConversationID string    `json:"conversation_id"`
	Status         string    `json:"status"` // SUCCESS | ...
	Response       string    `json:"response"`
	DurationSec    float64   `json:"duration_seconds"`
	NumTurns       int       `json:"num_turns"`
	Usage          *agyUsage `json:"usage"`
}

// agyUsage is the accounting agy reports. It is derived from Gemini's usage
// metadata rather than Claude's, which is why a total is present and why
// thinking_tokens is a subset of output_tokens rather than a bucket of its own
// (measured: a turn reporting output 85 and thinking 84 had
// total 13204 = input 13119 + output 85).
type agyUsage struct {
	InputTokens     int64 `json:"input_tokens"`
	OutputTokens    int64 `json:"output_tokens"`
	ThinkingTokens  int64 `json:"thinking_tokens"`
	CacheReadTokens int64 `json:"cache_read_tokens"`
	TotalTokens     int64 `json:"total_tokens"`
}

// normalizeAgyUsage folds agy's report into the four mutually exclusive
// buckets, using agy's own total to settle where the cached prefix sits.
//
// Gemini-style usage counts cached content inside the prompt tokens, while
// Claude-style usage keeps it as a peer bucket. Choosing wrong is not cosmetic:
// treating an inclusive input as exclusive bills the cached prefix twice, and a
// cache read is usually the bulk of a long run's prompt.
//
// No non-zero cache read has been observed yet — every run measured so far
// reported 0 — so rather than guess, the shape is decided from the payload each
// time it appears. Same approach multica uses for its ACP backends.
func normalizeAgyUsage(u agyUsage) TokenUsage {
	input, cacheRead := u.InputTokens, u.CacheReadTokens
	if cacheRead > 0 && u.TotalTokens > 0 {
		switch {
		case input+u.OutputTokens+cacheRead == u.TotalTokens:
			// Peer bucket: the cached prefix is not inside input. Nothing to do.
		case input+u.OutputTokens == u.TotalTokens:
			// Already counted inside input: take it out, so the cached prefix is
			// not billed once as input and again as a cache read.
			input -= cacheRead
		}
		if input < 0 {
			input = 0
		}
	}
	// thinking_tokens is deliberately dropped: the measured turns prove it is
	// already contained in output_tokens, so adding it would double-charge the
	// reasoning pass.
	return TokenUsage{
		InputTokens:     input,
		OutputTokens:    u.OutputTokens,
		CacheReadTokens: cacheRead,
	}
}

func parseAgyEvent(line []byte) (agyEvent, bool) {
	var evt agyEvent
	if err := json.Unmarshal(line, &evt); err != nil {
		return agyEvent{}, false
	}
	if evt.Event == "" {
		return agyEvent{}, false
	}
	return evt, true
}

// toResult maps the terminal event into a Result. Only a SUCCESS status has
// been observed from this CLI, so anything else is a failure and its status
// string becomes the error.
func (r agyResult) toResult() Result {
	res := Result{
		Status:     "completed",
		Output:     r.Response,
		DurationMs: int64(r.DurationSec * 1000),
		// agy calls it a conversation; it is the same handle a later run would
		// need to resume this one.
		SessionID: r.ConversationID,
	}
	if !strings.EqualFold(r.Status, "SUCCESS") {
		res.Status = "failed"
		res.Error = r.Status
	}
	return res
}
