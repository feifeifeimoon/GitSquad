package app

import (
	"strings"

	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

// ClaudeRuntime detects the Claude Code CLI ("claude").
type ClaudeRuntime struct{}

func (r *ClaudeRuntime) Detect(paths []string) *pkgtypes.Runtime {
	const kind = "claude"
	exePath, err := findExe(kind, paths)
	if err != nil {
		return nil
	}

	ver, err := runVersionCmd(exePath, "--version")
	if err != nil {
		return nil
	}

	return &pkgtypes.Runtime{
		Kind: kind, ExecutablePath: exePath,
		Version: strings.TrimSpace(ver), MaxConcurrency: 1,
	}
}

func (r *ClaudeRuntime) Executor() Executor { return nil }
