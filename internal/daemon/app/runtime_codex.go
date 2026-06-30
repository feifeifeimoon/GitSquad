package app

import (
	"strings"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// CodexRuntime detects the Codex CLI ("codex").
type CodexRuntime struct{}

func (r *CodexRuntime) Detect(paths []string) *v1.Runtime {
	const kind = "codex"
	exePath, err := findExe(kind, paths)
	if err != nil {
		return nil
	}

	ver, err := runVersionCmd(exePath, "version")
	if err != nil {
		return nil
	}

	return &v1.Runtime{
		Kind: kind, ExecutablePath: exePath,
		Version: strings.TrimSpace(ver), MaxConcurrency: 1,
	}
}

func (r *CodexRuntime) Executor() Executor { return nil }
