package provider

import (
	"strings"
	"testing"
)

func TestBuildAgyArgs(t *testing.T) {
	args := buildAgyArgs("fix it", ExecOptions{})
	want := []string{"-p", "fix it", "--dangerously-skip-permissions"}
	if strings.Join(args, " ") != strings.Join(want, " ") {
		t.Fatalf("buildAgyArgs() = %v, want %v", args, want)
	}

	args = buildAgyArgs("fix it", ExecOptions{Model: "Claude Opus 4.6 (Thinking)", Cwd: "/tmp/repo"})
	joined := strings.Join(args, " ")
	for _, want := range []string{"--model Claude Opus 4.6 (Thinking)", "--add-dir /tmp/repo"} {
		if !strings.Contains(joined, want) {
			t.Errorf("args missing %q: %v", want, args)
		}
	}
}

func TestNewRegistry(t *testing.T) {
	for _, kind := range []string{"claude", "agy"} {
		b, err := New(kind, "/usr/local/bin/"+kind, nil)
		if err != nil {
			t.Fatalf("New(%q) error = %v", kind, err)
		}
		if b.Kind() != kind {
			t.Errorf("New(%q).Kind() = %q", kind, b.Kind())
		}
	}
	// Not implemented yet — must fail loudly rather than silently no-op.
	if _, err := New("codex", "", nil); err == nil {
		t.Error("New(codex) should error while the adapter is pending")
	}
}
