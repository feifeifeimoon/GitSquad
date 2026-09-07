package daemon

import (
	"os"
	"path/filepath"
)

// RuntimeSpec 声明一个可探测的 AI CLI 运行时。
// Kind 是稳定标识（上报/前端引用用），CommandNames 是 PATH 上的候选二进制名。
type RuntimeSpec struct {
	Kind            string
	CommandNames    []string
	EnvPathOverride string
	VersionArgs     []string
	MinVersion      string
	ExtraLocations  []string
}

// defaultSpecs 返回第一版支持的 runtime 集合：claude / codex / agy。
// 加一个新的 CLI 只需在这里追加一条 spec，无需新增适配器文件。
func defaultSpecs() []RuntimeSpec {
	return []RuntimeSpec{
		{
			Kind:            "claude",
			CommandNames:    []string{"claude"},
			EnvPathOverride: "GITSQUAD_CLAUDE_PATH",
			VersionArgs:     []string{"--version"},
			MinVersion:      "2.0.0",
		},
		{
			Kind:            "codex",
			CommandNames:    []string{"codex"},
			EnvPathOverride: "GITSQUAD_CODEX_PATH",
			VersionArgs:     []string{"--version"},
			MinVersion:      "0.100.0",
			ExtraLocations:  codexDesktopBundlePaths(),
		},
		{
			Kind:            "agy",
			CommandNames:    []string{"agy"},
			EnvPathOverride: "GITSQUAD_AGY_PATH",
			VersionArgs:     []string{"--version"},
		},
	}
}

// codexDesktopBundlePaths 返回 Codex Desktop 内置 CLI 的可能位置。
// Codex Desktop 把 CLI 打包在 macOS app 里，不装到 PATH。
func codexDesktopBundlePaths() []string {
	paths := []string{
		"/Applications/Codex.app/Contents/Resources/codex",
	}
	if home, err := os.UserHomeDir(); err == nil {
		paths = append(paths, filepath.Join(home, "Applications", "Codex.app", "Contents", "Resources", "codex"))
	}
	return paths
}
