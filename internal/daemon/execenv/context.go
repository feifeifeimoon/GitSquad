package execenv

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// writeContextFiles writes .gitsquad/issue_context.md and the agent's skills
// into provider-native locations.
func writeContextFiles(workDir string, p PrepareParams) error {
	contextDir := filepath.Join(workDir, ".gitsquad")
	if err := os.MkdirAll(contextDir, 0o755); err != nil {
		return fmt.Errorf("create .gitsquad dir: %w", err)
	}
	if err := os.WriteFile(filepath.Join(contextDir, "issue_context.md"), []byte(renderIssueContext(p.Issue)), 0o644); err != nil {
		return fmt.Errorf("write issue_context.md: %w", err)
	}

	for _, s := range p.Agent.Skills {
		if err := writeSkill(workDir, p.Provider, s); err != nil {
			return err
		}
	}
	return nil
}

// renderIssueContext renders the raw issue snapshot (title, description,
// comment stream) that the agent reads for facts.
func renderIssueContext(issue v1.TaskIssueContext) string {
	var b strings.Builder
	if issue.Key != "" {
		fmt.Fprintf(&b, "# Issue %s\n\n", issue.Key)
	} else {
		b.WriteString("# Issue\n\n")
	}
	if issue.Title != "" {
		fmt.Fprintf(&b, "**Title:** %s\n\n", issue.Title)
	}
	if issue.Description != "" {
		b.WriteString(issue.Description)
		b.WriteString("\n\n")
	}
	if len(issue.Comments) > 0 {
		b.WriteString("## Comments\n\n")
		for _, c := range issue.Comments {
			fmt.Fprintf(&b, "**%s** (%s):\n\n%s\n\n", c.AuthorName, c.Type, c.Content)
		}
	}
	return b.String()
}

// writeSkill writes a single skill into its provider-native location.
// Claude Code discovers `.claude/skills/{name}/SKILL.md` relative to cwd.
// Codex skills live in a per-task CODEX_HOME and are deferred (chapter 6 P1.5).
func writeSkill(workDir, provider string, s v1.TaskSkill) error {
	var dir string
	switch provider {
	case "claude":
		dir = filepath.Join(workDir, ".claude", "skills", s.Name)
	case "codex":
		return nil // deferred: per-task CODEX_HOME/skills
	default:
		dir = filepath.Join(workDir, ".gitsquad", "skills", s.Name)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create skill dir: %w", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(skillMarkdown(s)), 0o644); err != nil {
		return fmt.Errorf("write skill %s: %w", s.Name, err)
	}
	return nil
}

// skillMarkdown renders a SKILL.md with YAML frontmatter.
func skillMarkdown(s v1.TaskSkill) string {
	var b strings.Builder
	b.WriteString("---\n")
	fmt.Fprintf(&b, "name: %s\n", s.Name)
	if s.Description != "" {
		fmt.Fprintf(&b, "description: %s\n", s.Description)
	}
	b.WriteString("---\n\n")
	b.WriteString(s.Content)
	return b.String()
}
