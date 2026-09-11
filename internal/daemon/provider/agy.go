package provider

import (
	"context"
	"os"
	"os/exec"
	"strings"
	"time"
)

// agyBackend drives the Antigravity CLI in one-shot print mode
// (`agy -p <prompt> --dangerously-skip-permissions`).
//
// Unlike claude, agy prints plain text on stdout rather than a stream-json
// event stream, so there is no per-event progress to translate: the adapter
// surfaces the whole stdout as a single text message once the run finishes.
type agyBackend struct {
	cfg Config
}

func newAgyBackend(cfg Config) *agyBackend { return &agyBackend{cfg: cfg} }

func (b *agyBackend) Kind() string { return "agy" }

// buildAgyArgs assembles the argv for a one-shot agy invocation. The prompt
// goes in argv (agy has no stream-json input mode), and
// --dangerously-skip-permissions is what makes it non-interactive.
func buildAgyArgs(prompt string, opts ExecOptions) []string {
	args := []string{
		"-p", prompt,
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

// Execute runs agy once and returns a Session carrying the final text.
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

	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	msgs := make(chan Message, 1)
	result := make(chan Result, 1)

	go func() {
		defer cancel()
		defer close(msgs)
		defer close(result)

		start := time.Now()
		runErr := cmd.Run()
		out := strings.TrimSpace(stdout.String())
		if out != "" {
			trySend(msgs, Message{Type: MessageText, Content: out})
		}
		result <- finalizeResult(Result{}, out, runErr, stderr.String(), ctx.Err(), time.Since(start))
	}()

	return &Session{Messages: msgs, Result: result}, nil
}
