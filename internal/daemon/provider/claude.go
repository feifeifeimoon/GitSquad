package provider

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// claudeBackend drives the Claude Code CLI in non-interactive stream-json mode
// (`claude -p --output-format stream-json --input-format stream-json`).
type claudeBackend struct {
	cfg Config
}

func newClaudeBackend(cfg Config) *claudeBackend { return &claudeBackend{cfg: cfg} }

func (b *claudeBackend) Kind() string { return "claude" }

// buildClaudeArgs assembles the argv for a one-shot Claude Code invocation.
// The prompt is written to stdin in stream-json format, not passed as an argv.
// Flags are per Multica's claude backend (server/pkg/agent/claude.go).
func buildClaudeArgs(opts ExecOptions) []string {
	args := []string{
		"-p",
		"--output-format", "stream-json",
		"--input-format", "stream-json",
		"--verbose",
		"--strict-mcp-config",
		// bypassPermissions runs autonomously with no interactive prompts;
		// AskUserQuestion is disabled because headless mode has no UI to
		// render it in.
		"--permission-mode", "bypassPermissions",
		"--disallowedTools", "AskUserQuestion",
	}
	if opts.Model != "" {
		args = append(args, "--model", opts.Model)
	}
	if opts.MaxTurns > 0 {
		args = append(args, "--max-turns", strconv.Itoa(opts.MaxTurns))
	}
	if opts.SystemPrompt != "" {
		args = append(args, "--append-system-prompt", opts.SystemPrompt)
	}
	return args
}

// buildClaudeInput encodes a single user message in Claude's stream-json
// input format.
func buildClaudeInput(prompt string) []byte {
	payload := map[string]any{
		"type": "user",
		"message": map[string]any{
			"role": "user",
			"content": []map[string]string{
				{"type": "text", "text": prompt},
			},
		},
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return []byte("")
	}
	return append(data, '\n')
}

// Execute starts `claude` and returns a Session. The prompt is fed to stdin;
// stdout JSONL lines are parsed into Message events; the final result event
// (or process exit) populates Result.
func (b *claudeBackend) Execute(ctx context.Context, prompt string, opts ExecOptions) (*Session, error) {
	exe := b.cfg.ExecutablePath
	if exe == "" {
		exe = "claude"
	}

	ctx, cancel := context.WithCancel(ctx)
	if opts.Timeout > 0 {
		ctx, cancel = context.WithTimeout(ctx, opts.Timeout)
	}

	cmd := exec.CommandContext(ctx, exe, buildClaudeArgs(opts)...)
	cmd.Dir = opts.Cwd
	cmd.Env = append(os.Environ(), opts.Env...)
	for k, v := range b.cfg.Env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	var stderr strings.Builder
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		cancel()
		return nil, fmt.Errorf("start claude: %w", err)
	}

	// Feed the user message and close stdin so the turn is complete.
	go func() {
		_, _ = io.WriteString(stdin, string(buildClaudeInput(prompt)))
		_ = stdin.Close()
	}()

	msgs := make(chan Message, 64)
	result := make(chan Result, 1)

	go func() {
		defer cancel()
		defer close(result)

		start := time.Now()
		var out strings.Builder
		var final Result
		usage := newUsageTracker(opts.Model)

		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
		for scanner.Scan() {
			evt, ok := parseClaudeEvent(scanner.Bytes())
			if !ok {
				continue
			}
			for _, m := range evt.messages() {
				if m.Type == MessageText {
					out.WriteString(m.Content)
				}
				trySend(msgs, m)
			}
			if model, u, ok := evt.assistantUsage(); ok {
				usage.addTurn(model, u)
			}
			if r, ok := evt.result(); ok {
				final = r
				if totals, ok := evt.resultUsage(usage.lastModel()); ok {
					usage.replaceTotals(totals)
				}
			}
		}
		close(msgs)

		waitErr := cmd.Wait()
		res := finalizeResult(final, out.String(), waitErr, stderr.String(), ctx.Err(), time.Since(start))
		res.Usage = usage.snapshot()
		result <- res
	}()

	return &Session{Messages: msgs, Result: result}, nil
}

// trySend delivers m to ch without blocking; if the channel is full the event
// is dropped (final output is accumulated separately in Result.Output).
func trySend(ch chan<- Message, m Message) {
	select {
	case ch <- m:
	default:
	}
}

// ── stream-json parsing ────────────────────────────────────────────────

// claudeEvent is a single stream-json line from claude stdout.
type claudeEvent struct {
	Type       string         `json:"type"`
	Subtype    string         `json:"subtype"`
	IsError    bool           `json:"is_error"`
	Message    *claudeMessage `json:"message"`
	Result     string         `json:"result"`
	SessionID  string         `json:"session_id"`
	DurationMs int64          `json:"duration_ms"`
	Usage      *claudeUsage   `json:"usage"`
	// ModelUsage is the per-model breakdown on the result event. Preferred over
	// the flat Usage above because it preserves the model dimension.
	ModelUsage map[string]claudeUsage `json:"modelUsage"`
}

type claudeMessage struct {
	Role    string            `json:"role"`
	Content []json.RawMessage `json:"content"`
	// Model and Usage are present on assistant turns; capturing them per turn is
	// what makes a run that times out mid-stream still report a token figure.
	Model string       `json:"model"`
	Usage *claudeUsage `json:"usage"`
}

type claudeUsage struct {
	InputTokens      int64
	OutputTokens     int64
	CacheReadTokens  int64
	CacheWriteTokens int64
}

// UnmarshalJSON tolerates both key spellings the CLI uses for token counts: the
// flat `usage` object on the result event is snake_case (`input_tokens`) while
// `modelUsage` entries are camelCase (`inputTokens`). One type covers both.
//
// It decodes through map[string]any rather than a numeric map because these
// objects carry non-integer siblings — `costUSD` is a float, `serviceTier` a
// string — and a stricter decode would fail. parseClaudeEvent would then drop
// the entire line, losing the event rather than one field.
func (u *claudeUsage) UnmarshalJSON(data []byte) error {
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		// Never fail the enclosing event over an unexpected usage shape.
		return nil
	}
	pick := func(keys ...string) int64 {
		for _, key := range keys {
			if v, ok := raw[key]; ok {
				if n, ok := numeric(v); ok {
					return n
				}
			}
		}
		return 0
	}
	u.InputTokens = pick("input_tokens", "inputTokens")
	u.OutputTokens = pick("output_tokens", "outputTokens")
	u.CacheReadTokens = pick("cache_read_input_tokens", "cacheReadInputTokens",
		"cached_input_tokens", "cachedInputTokens")
	u.CacheWriteTokens = pick("cache_creation_input_tokens", "cacheCreationInputTokens",
		"cache_write_tokens", "cacheWriteTokens")
	return nil
}

// numeric coerces a decoded JSON value to int64 when it is a token count.
func numeric(v any) (int64, bool) {
	switch n := v.(type) {
	case float64:
		return int64(n), true
	case json.Number:
		i, err := n.Int64()
		return i, err == nil
	default:
		return 0, false
	}
}

// tokenUsage converts the wire shape into the provider-neutral buckets. The
// four are already mutually exclusive in this format: input_tokens excludes
// both cache buckets.
func (u claudeUsage) tokenUsage() TokenUsage {
	return TokenUsage{
		InputTokens:      u.InputTokens,
		OutputTokens:     u.OutputTokens,
		CacheReadTokens:  u.CacheReadTokens,
		CacheWriteTokens: u.CacheWriteTokens,
	}
}

// usageTracker accumulates per-model token usage across one run.
//
// Assistant turns stream in as the agent works, so a run that times out or is
// cancelled still has a figure; the terminal result event then replaces the
// accumulation with the CLI's own totals for the whole run.
type usageTracker struct {
	byModel  map[string]TokenUsage
	lastSeen string
	fallback string
}

func newUsageTracker(configuredModel string) *usageTracker {
	fallback := configuredModel
	if fallback == "" {
		fallback = UnknownModel
	}
	return &usageTracker{byModel: map[string]TokenUsage{}, fallback: fallback}
}

// modelKey resolves which model a usage figure belongs to. The CLI omits the
// model on some events, so fall back to the most recent turn that named one,
// then to the model the agent was configured with.
func (t *usageTracker) modelKey(model string) string {
	if model != "" {
		t.lastSeen = model
		return model
	}
	if t.lastSeen != "" {
		return t.lastSeen
	}
	return t.fallback
}

// addTurn folds one streamed assistant turn in.
func (t *usageTracker) addTurn(model string, u TokenUsage) {
	if u.IsZero() {
		return
	}
	key := t.modelKey(model)
	t.byModel[key] = t.byModel[key].Add(u)
}

// replaceTotals discards the accumulated turns in favour of the CLI's own
// run totals, which already cover every turn. Replacing avoids double-counting
// the final turn.
func (t *usageTracker) replaceTotals(totals map[string]TokenUsage) {
	kept := make(map[string]TokenUsage, len(totals))
	for model, u := range totals {
		if u.IsZero() {
			continue
		}
		if model != "" {
			t.lastSeen = model
		}
		kept[model] = u
	}
	if len(kept) == 0 {
		return
	}
	t.byModel = kept
}

// snapshot returns what the run consumed. Empty means the CLI reported nothing
// — distinct from a run that genuinely used zero tokens.
func (t *usageTracker) snapshot() map[string]TokenUsage {
	if len(t.byModel) == 0 {
		return nil
	}
	out := make(map[string]TokenUsage, len(t.byModel))
	for model, u := range t.byModel {
		out[model] = u
	}
	return out
}

// lastModel is the most recently named model, for attributing a flat result
// total that carries no model of its own.
func (t *usageTracker) lastModel() string { return t.modelKey("") }

// claudeContentBlock is one entry in a message's content array. Not every
// field is set for every block type.
type claudeContentBlock struct {
	Type      string          `json:"type"`
	Text      string          `json:"text"`
	Thinking  string          `json:"thinking"`
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Input     map[string]any  `json:"input"`
	ToolUseID string          `json:"tool_use_id"`
	Content   json.RawMessage `json:"content"`
	IsError   bool            `json:"is_error"`
}

func parseClaudeEvent(line []byte) (claudeEvent, bool) {
	var evt claudeEvent
	if err := json.Unmarshal(line, &evt); err != nil {
		return claudeEvent{}, false
	}
	return evt, true
}

// messages maps a stream-json event into zero or more unified Message events.
func (e claudeEvent) messages() []Message {
	switch e.Type {
	case "system":
		return []Message{{Type: MessageStatus, Status: e.Subtype, Content: e.SessionID}}
	case "assistant":
		if e.Message == nil {
			return nil
		}
		var out []Message
		for _, raw := range e.Message.Content {
			var b claudeContentBlock
			if err := json.Unmarshal(raw, &b); err != nil {
				continue
			}
			switch b.Type {
			case "text":
				out = append(out, Message{Type: MessageText, Content: b.Text})
			case "thinking":
				out = append(out, Message{Type: MessageThinking, Content: b.Thinking})
			case "tool_use":
				out = append(out, Message{Type: MessageToolUse, Tool: b.Name, CallID: b.ID, Input: b.Input})
			}
		}
		return out
	case "user":
		if e.Message == nil {
			return nil
		}
		var out []Message
		for _, raw := range e.Message.Content {
			var b claudeContentBlock
			if err := json.Unmarshal(raw, &b); err != nil {
				continue
			}
			if b.Type == "tool_result" {
				status := ""
				if b.IsError {
					status = "error"
				}
				out = append(out, Message{Type: MessageToolResult, CallID: b.ToolUseID, Output: toolResultText(b.Content), Status: status})
			}
		}
		return out
	default:
		return nil
	}
}

// result maps a "result" event into a final Result. Usage is filled in by the
// caller from the tracker, since the terminal totals have to be reconciled with
// whatever the streamed turns already contributed.
func (e claudeEvent) result() (Result, bool) {
	if e.Type != "result" {
		return Result{}, false
	}
	status := "completed"
	if e.Subtype != "success" || e.IsError {
		status = "failed"
	}
	return Result{
		Status:     status,
		Output:     e.Result,
		SessionID:  e.SessionID,
		DurationMs: e.DurationMs,
	}, true
}

// assistantUsage reports the usage of a streamed assistant turn.
func (e claudeEvent) assistantUsage() (string, TokenUsage, bool) {
	if e.Type != "assistant" || e.Message == nil || e.Message.Usage == nil {
		return "", TokenUsage{}, false
	}
	u := e.Message.Usage.tokenUsage()
	if u.IsZero() {
		return "", TokenUsage{}, false
	}
	return e.Message.Model, u, true
}

// resultUsage reports the run's total usage from the terminal event, keyed by
// model. The per-model map wins when present; otherwise the flat total is
// attributed to defaultModel, the only model the run is known to have used.
func (e claudeEvent) resultUsage(defaultModel string) (map[string]TokenUsage, bool) {
	if len(e.ModelUsage) > 0 {
		out := make(map[string]TokenUsage, len(e.ModelUsage))
		for model, u := range e.ModelUsage {
			if !u.tokenUsage().IsZero() {
				out[model] = u.tokenUsage()
			}
		}
		if len(out) > 0 {
			return out, true
		}
	}
	if e.Usage == nil || e.Usage.tokenUsage().IsZero() {
		return nil, false
	}
	return map[string]TokenUsage{defaultModel: e.Usage.tokenUsage()}, true
}

// toolResultText flattens a tool_result content (string or array of text
// blocks) into a single string for logging/collection.
func toolResultText(raw json.RawMessage) string {
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	var blocks []claudeContentBlock
	if err := json.Unmarshal(raw, &blocks); err != nil {
		return string(raw)
	}
	var b strings.Builder
	for _, blk := range blocks {
		if blk.Type == "text" {
			b.WriteString(blk.Text)
		}
	}
	return b.String()
}

// finalizeResult produces the final Result from a completed run.
func finalizeResult(final Result, accumulated string, waitErr error, stderr string, ctxErr error, dur time.Duration) Result {
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
		final.Status = "failed"
		if final.Error == "" {
			final.Error = strings.TrimSpace(stderr)
			if final.Error == "" {
				final.Error = waitErr.Error()
			}
		}
	}
	if final.Output == "" {
		final.Output = accumulated
	}
	final.DurationMs = dur.Milliseconds()
	return final
}
