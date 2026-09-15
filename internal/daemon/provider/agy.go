package provider

import (
	"bufio"
	"context"
	"encoding/json"
	"os"
	"os/exec"
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
// goes in argv (agy has no stream-json input mode wired up here), and
// --dangerously-skip-permissions is what makes it non-interactive.
func buildAgyArgs(prompt string, opts ExecOptions) []string {
	args := []string{
		"-p", prompt,
		"--output-format", "stream-json",
		"--dangerously-skip-permissions",
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

	cmd := exec.CommandContext(ctx, exe, buildAgyArgs(prompt, opts)...)
	cmd.Dir = opts.Cwd
	cmd.Env = append(os.Environ(), opts.Env...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, err
	}
	var stderr strings.Builder
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		cancel()
		return nil, err
	}

	msgs := make(chan Message, 64)
	result := make(chan Result, 1)

	go func() {
		defer cancel()
		defer close(msgs)
		defer close(result)

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
		res := finalizeResult(final, out.String(), waitErr, stderr.String(), ctx.Err(), time.Since(start))
		res.Usage = agyUsageForRun(opts.Model, turnUsage, turnsSeen, totalUsage, totalSeen)
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
