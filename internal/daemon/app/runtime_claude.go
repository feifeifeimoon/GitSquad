package app

import (
	"strings"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// ClaudeRuntime detects the Claude Code CLI ("claude").
type ClaudeRuntime struct{}

func (r *ClaudeRuntime) Detect(paths []string) *v1.Runtime {
	const kind = "claude"
	exePath, err := findExe(kind, paths)
	if err != nil {
		return nil
	}

	ver, err := runVersionCmd(exePath, "--version")
	if err != nil {
		return nil
	}

	return &v1.Runtime{
		Kind: kind, ExecutablePath: exePath,
		Version: strings.TrimSpace(ver), MaxConcurrency: 1,
	}
}

func (r *ClaudeRuntime) Executor() Executor { return nil }
