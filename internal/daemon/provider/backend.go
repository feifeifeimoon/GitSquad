// Package provider drives coding CLIs (Claude Code, Codex, ...) in headless
// mode. It mirrors Multica's agent.Backend: Execute returns a Session whose
// Messages channel streams unified events and whose Result channel delivers
// exactly one final outcome.
package provider

import (
	"context"
	"log/slog"
	"time"
)

// Backend is the unified interface for executing a prompt via a coding CLI.
type Backend interface {
	// Kind returns the provider slug ("claude", "codex", ...).
	Kind() string
	// Execute runs a prompt and returns a Session for streaming results.
	Execute(ctx context.Context, prompt string, opts ExecOptions) (*Session, error)
}

// Session represents a running agent execution.
type Session struct {
	// Messages streams events as the agent works; closed when the agent
	// finishes (before Result is delivered).
	Messages <-chan Message
	// Result receives exactly one value — the final outcome — then closes.
	Result <-chan Result
}

// MessageType identifies the kind of a Message.
type MessageType string

const (
	MessageText       MessageType = "text"
	MessageThinking   MessageType = "thinking"
	MessageToolUse    MessageType = "tool_use"
	MessageToolResult MessageType = "tool_result"
	MessageStatus     MessageType = "status"
	MessageError      MessageType = "error"
)

// Message is a unified event emitted by an agent during execution.
type Message struct {
	Type    MessageType
	Content string         // text / error content
	Tool    string         // tool name (tool_use)
	CallID  string         // tool call id (tool_use / tool_result)
	Input   map[string]any // tool input (tool_use)
	Output  string         // tool output (tool_result)
	Status  string         // status string (status)
}

// Result is the final outcome after an agent session completes.
type Result struct {
	Status     string // completed | failed | aborted | timeout | cancelled
	Output     string // accumulated text output
	Error      string // error message if failed
	DurationMs int64
	SessionID  string
	Usage      map[string]TokenUsage // keyed by model name
}

// TokenUsage tracks token consumption for a single model.
type TokenUsage struct {
	InputTokens  int64
	OutputTokens int64
}

// ExecOptions configures a single execution.
type ExecOptions struct {
	Cwd                       string
	Model                     string
	SystemPrompt              string
	MaxTurns                  int
	Timeout                   time.Duration // wall-clock deadline
	SemanticInactivityTimeout time.Duration // reserved; not enforced in MVP
	ResumeSessionID           string        // reserved for future multi-turn resume
	Env                       []string      // extra environment variables
}

// Config configures a Backend instance.
type Config struct {
	ExecutablePath string
	Env            map[string]string
	Logger         *slog.Logger
}
