package app

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// ── Executor (placeholder) ───────────────────────────────────────────

// Executor drives a CLI tool to execute a coding task.
// NOT YET IMPLEMENTED — returns nil in all adapters.
type Executor interface {
	// Execute runs a task instruction in the given working directory.
	Execute(ctx context.Context, workDir string, instruction string) (<-chan Output, error)
}

// Output is a single event emitted during execution.
type Output struct {
	Type    string // "stdout" | "stderr" | "artifact" | "error"
	Content string
}

// ── Runtime interface ────────────────────────────────────────────────

// Runtime is a CLI tool that the daemon can detect and (in future) execute.
type Runtime interface {
	// Detect checks whether the CLI is available on the given PATH directories.
	// Returns nil if the CLI is not found or not working.
	Detect(paths []string) *v1.Runtime

	// Executor returns the execution driver for this runtime.
	// Returns nil until execution is implemented.
	Executor() Executor
}

// ── Registry ─────────────────────────────────────────────────────────

// Registry holds all known Runtime implementations.
type Registry struct {
	items []Runtime
}

// NewRegistry creates a registry with the given runtimes.
func NewRegistry(items ...Runtime) *Registry {
	return &Registry{items: items}
}

// All returns every registered runtime.
func (r *Registry) All() []Runtime { return r.items }

// DefaultRegistry returns the MVP set: Claude Code + Codex.
func DefaultRegistry() *Registry {
	return NewRegistry(
		&ClaudeRuntime{},
		&CodexRuntime{},
	)
}

// ── Shared helpers ───────────────────────────────────────────────────

func findExe(exeName string, paths []string) (string, error) {
	exts := []string{""}
	if runtime.GOOS == "windows" {
		exts = []string{".exe", ".cmd", ".bat", ".ps1"}
	}
	for _, dir := range paths {
		for _, ext := range exts {
			full := filepath.Join(dir, exeName+ext)
			if info, err := os.Stat(full); err == nil && !info.IsDir() {
				return full, nil
			}
		}
	}
	return "", fmt.Errorf("%s not found", exeName)
}

func runVersionCmd(exe string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var buf bytes.Buffer
	cmd := exec.CommandContext(ctx, exe, args...)
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	return buf.String(), cmd.Run()
}
