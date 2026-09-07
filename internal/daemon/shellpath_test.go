package daemon

import (
	"strings"
	"testing"
)

func TestIsSafeCommandName(t *testing.T) {
	valid := []string{"claude", "codex", "agy", "cursor-agent", "kiro-cli", "opencode", "a1.b_c-d+e"}
	for _, s := range valid {
		if !isSafeCommandName(s) {
			t.Errorf("isSafeCommandName(%q) = false, want true", s)
		}
	}
	invalid := []string{"", "a b", "a;b", "a|b", "a$b", "a/b", "a\\b", "a'b"}
	for _, s := range invalid {
		if isSafeCommandName(s) {
			t.Errorf("isSafeCommandName(%q) = true, want false", s)
		}
	}
}

func TestBuildLoginShellResolveScript(t *testing.T) {
	script := buildLoginShellResolveScript([]string{"claude", "codex"})
	for _, want := range []string{"command -v", "unalias", "unset -f", "pwd -P", "claude", "codex"} {
		if !strings.Contains(script, want) {
			t.Errorf("script missing %q:\n%s", want, script)
		}
	}
	// Names must be inlined into the loop word list.
	if !strings.Contains(script, "for n in claude codex; do") {
		t.Errorf("script does not inline names into the loop:\n%s", script)
	}
}
