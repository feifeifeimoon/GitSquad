package execenv

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

func testParams() PrepareParams {
	return PrepareParams{
		WorkspaceID: "ws-1",
		TaskID:      "task-1",
		AgentName:   "coder",
		Provider:    "claude",
		Issue: v1.TaskIssueContext{
			Key:         "GTS-42",
			Title:       "login null pointer",
			Description: "fix the nil deref",
			Comments:    []v1.TaskComment{{AuthorName: "alice", Type: "comment", Content: "please fix"}},
		},
		Agent: v1.TaskAgentContext{
			Name:         "coder",
			Instructions: "be conservative",
			Provider:     "claude",
			Skills:       []v1.TaskSkill{{Name: "go-review", Description: "go review checklist", Content: "check for nils"}},
		},
	}
}

func TestPrepare(t *testing.T) {
	dir := t.TempDir()
	env, err := Prepare(dir, testParams())
	if err != nil {
		t.Fatalf("Prepare() error = %v", err)
	}
	if env.WorkDir != dir {
		t.Fatalf("WorkDir = %q, want %q", env.WorkDir, dir)
	}

	claude, err := os.ReadFile(filepath.Join(dir, "CLAUDE.md"))
	if err != nil {
		t.Fatalf("read CLAUDE.md: %v", err)
	}
	for _, want := range []string{runtimeMarkerBegin, "**You are: coder**", "be conservative", "GTS-42", runtimeMarkerEnd} {
		if !strings.Contains(string(claude), want) {
			t.Errorf("CLAUDE.md missing %q", want)
		}
	}

	issue, err := os.ReadFile(filepath.Join(dir, ".gitsquad", "issue_context.md"))
	if err != nil {
		t.Fatalf("read issue_context.md: %v", err)
	}
	if !strings.Contains(string(issue), "login null pointer") || !strings.Contains(string(issue), "please fix") {
		t.Errorf("issue_context.md content wrong: %s", issue)
	}

	skill, err := os.ReadFile(filepath.Join(dir, ".claude", "skills", "go-review", "SKILL.md"))
	if err != nil {
		t.Fatalf("read skill: %v", err)
	}
	if !strings.Contains(string(skill), "name: go-review") || !strings.Contains(string(skill), "check for nils") {
		t.Errorf("skill content wrong: %s", skill)
	}
}

func TestPrepareIdempotent(t *testing.T) {
	dir := t.TempDir()
	if _, err := Prepare(dir, testParams()); err != nil {
		t.Fatalf("Prepare 1: %v", err)
	}
	if _, err := Prepare(dir, testParams()); err != nil {
		t.Fatalf("Prepare 2: %v", err)
	}
	b, _ := os.ReadFile(filepath.Join(dir, "CLAUDE.md"))
	if n := strings.Count(string(b), runtimeMarkerBegin); n != 1 {
		t.Errorf("marker begin count = %d, want 1", n)
	}
}

func TestPreparePreservesUserContent(t *testing.T) {
	dir := t.TempDir()
	user := "# My Repo\n\nCustom instructions here.\n"
	if err := os.WriteFile(filepath.Join(dir, "CLAUDE.md"), []byte(user), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Prepare(dir, testParams()); err != nil {
		t.Fatalf("Prepare: %v", err)
	}
	b, _ := os.ReadFile(filepath.Join(dir, "CLAUDE.md"))
	s := string(b)
	if !strings.Contains(s, "Custom instructions here.") {
		t.Errorf("user content lost: %s", s)
	}
	if !strings.Contains(s, runtimeMarkerBegin) {
		t.Errorf("brief not injected: %s", s)
	}
}
