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
			if r, ok := evt.result(); ok {
				final = r
			}
		}
		close(msgs)

		waitErr := cmd.Wait()
		result <- finalizeResult(final, out.String(), waitErr, stderr.String(), ctx.Err(), time.Since(start))
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
	Type       string          `json:"type"`
	Subtype    string          `json:"subtype"`
	IsError    bool            `json:"is_error"`
	Message    *claudeMessage  `json:"message"`
	Result     string          `json:"result"`
	SessionID  string          `json:"session_id"`
	DurationMs int64           `json:"duration_ms"`
	Usage      *claudeUsage    `json:"usage"`
}

type claudeMessage struct {
	Role    string            `json:"role"`
	Content []json.RawMessage `json:"content"`
}

type claudeUsage struct {
	InputTokens       int64 `json:"input_tokens"`
	OutputTokens      int64 `json:"output_tokens"`
	CacheReadTokens   int64 `json:"cache_read_input_tokens"`
	CacheWriteTokens  int64 `json:"cache_creation_input_tokens"`
}

// claudeContentBlock is one entry in a message's content array. Not every
// field is set for every block type.
type claudeContentBlock struct {
	Type      string         `json:"type"`
	Text      string         `json:"text"`
	Thinking  string         `json:"thinking"`
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Input     map[string]any `json:"input"`
	ToolUseID string         `json:"tool_use_id"`
	Content   json.RawMessage `json:"content"`
	IsError   bool           `json:"is_error"`
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

// result maps a "result" event into a final Result.
func (e claudeEvent) result() (Result, bool) {
	if e.Type != "result" {
		return Result{}, false
	}
	status := "completed"
	if e.Subtype != "success" || e.IsError {
		status = "failed"
	}
	usage := map[string]TokenUsage{}
	if e.Usage != nil {
		usage[""] = TokenUsage{
			InputTokens:  e.Usage.InputTokens,
			OutputTokens: e.Usage.OutputTokens,
		}
	}
	return Result{
		Status:     status,
		Output:     e.Result,
		SessionID:  e.SessionID,
		DurationMs: e.DurationMs,
		Usage:      usage,
	}, true
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
