package provider

import (
	"fmt"
	"log/slog"
)

// New returns a Backend for the given provider kind. The executable path is
// normally the detected path from daemon runtime detection (RuntimeSpec.Kind
// → ExecutablePath).
//
// Supported kinds: "claude". "codex" is pending (see the chapter 6 plan P1.5).
func New(kind, executablePath string, logger *slog.Logger) (Backend, error) {
	if logger == nil {
		logger = slog.Default()
	}
	cfg := Config{ExecutablePath: executablePath, Logger: logger}
	switch kind {
	case "claude":
		return newClaudeBackend(cfg), nil
	default:
		return nil, fmt.Errorf("unknown provider: %q (supported: claude)", kind)
	}
}
