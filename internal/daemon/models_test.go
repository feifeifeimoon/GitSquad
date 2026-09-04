package daemon

import "testing"

func TestParseModelsCodex(t *testing.T) {
	got := parseCodexModels("gpt-5.4\nclaude-sonnet-4-6\ngpt-5.5")
	if len(got) != 3 || got[0].ID != "gpt-5.4" || got[2].ID != "gpt-5.5" {
		t.Fatalf("unexpected models: %+v", got)
	}
	if got[0].Provider != "codex" {
		t.Fatalf("expected codex provider, got %q", got[0].Provider)
	}
}

func TestParseClaudeModels(t *testing.T) {
	got := parseClaudeModels("claude-sonnet-4-6\n\nclaude-opus-4-6")
	if len(got) != 2 || got[1].ID != "claude-opus-4-6" {
		t.Fatalf("unexpected models: %+v", got)
	}
}
