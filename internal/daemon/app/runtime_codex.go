package app

import (
	"strings"

	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

// CodexRuntime detects the Codex CLI ("codex").
type CodexRuntime struct{}

func (r *CodexRuntime) Detect(paths []string) *pkgtypes.Runtime {
	const kind = "codex"
	exePath, err := findExe(kind, paths)
	if err != nil {
		return nil
	}

	ver, err := runVersionCmd(exePath, "version")
	if err != nil {
		return nil
	}

	return &pkgtypes.Runtime{
		Kind: kind, ExecutablePath: exePath,
		Version: strings.TrimSpace(ver), MaxConcurrency: 1,
	}
}

func (r *CodexRuntime) Executor() Executor { return nil }
