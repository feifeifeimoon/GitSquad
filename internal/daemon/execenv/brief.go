package execenv

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// runtimeMarkerBegin / runtimeMarkerEnd delimit the managed brief inside the
// provider's runtime config file (CLAUDE.md / AGENTS.md). HTML comments keep
// the markers inert in every Markdown renderer.
const (
	runtimeMarkerBegin = "<!-- BEGIN GITSQUAD-RUNTIME (auto-managed; do not edit) -->"
	runtimeMarkerEnd   = "<!-- END GITSQUAD-RUNTIME -->"
)

// runtimeConfigPath returns the provider-native runtime config file name.
// claude reads CLAUDE.md; codex and agy both read AGENTS.md.
func runtimeConfigPath(provider string) string {
	if provider == "claude" {
		return "CLAUDE.md"
	}
	return "AGENTS.md"
}

// renderBrief renders the managed brief markdown: agent identity + task
// summary + working instructions. Agent instructions are passed through
// verbatim; issue facts stay out of the brief and live in issue_context.md.
func renderBrief(p PrepareParams) string {
	var b strings.Builder
	b.WriteString("# GitSquad Agent Runtime\n\n")
	b.WriteString("You are an agent in the GitSquad platform. Work in this directory. Your final output is posted to the issue as a comment, so end with a clear, self-contained conclusion.\n\n")

	b.WriteString("## Agent Identity\n\n")
	fmt.Fprintf(&b, "**You are: %s**\n\n", p.Agent.Name)
	if p.Agent.Instructions != "" {
		b.WriteString(p.Agent.Instructions)
		b.WriteString("\n\n")
	}

	b.WriteString("## Task\n\n")
	if p.Issue.Key != "" {
		fmt.Fprintf(&b, "- Issue: %s\n", p.Issue.Key)
	}
	if p.Issue.Title != "" {
		fmt.Fprintf(&b, "- Title: %s\n", p.Issue.Title)
	}
	if p.Issue.Description != "" {
		fmt.Fprintf(&b, "- Objective: %s\n", p.Issue.Description)
	}
	b.WriteString("\n")

	// Deliberately outcome-neutral: analysis, design and review tasks are as
	// valid as implementation ones, so nothing here may assume a code change.
	// The commit, the push and the pull request are the platform's — an agent
	// that did them too left nothing for the platform to commit, and the task
	// failed on the second attempt at the same commit.
	b.WriteString("## Working Instructions\n\n")
	b.WriteString("1. Do the work described in the issue above.\n")
	b.WriteString("2. Finish with your conclusion in your final output — it is posted to the issue as a comment. State what you found or did, and anything the user needs to decide.\n")
	b.WriteString("3. If — and only if — the work requires code changes: make them in this directory and run the tests. Leave the changes in the working tree and do not run `git commit` or `git push`")
	if p.Branch != "" {
		fmt.Fprintf(&b, " — the platform commits them to `%s` and opens the pull request for you.\n", p.Branch)
	} else {
		b.WriteString(" — the platform commits them and opens the pull request for you.\n")
	}

	return b.String()
}

// writeRuntimeConfig injects the managed brief into the provider's runtime
// config file, preserving user-authored content outside the managed block and
// replacing an existing block idempotently.
func writeRuntimeConfig(workDir string, p PrepareParams) error {
	path := filepath.Join(workDir, runtimeConfigPath(p.Provider))
	brief := renderBrief(p)
	block := runtimeMarkerBegin + "\n" + strings.TrimRight(brief, "\n") + "\n" + runtimeMarkerEnd + "\n"

	existing, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("read runtime config: %w", err)
	}
	content := replaceMarkerBlock(string(existing), block)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write runtime config: %w", err)
	}
	return nil
}

// replaceMarkerBlock replaces the managed block between markers with `block`,
// preserving content outside, and appends the block when no markers exist.
func replaceMarkerBlock(content, block string) string {
	start := strings.Index(content, runtimeMarkerBegin)
	end := strings.Index(content, runtimeMarkerEnd)
	if start >= 0 && end > start {
		end += len(runtimeMarkerEnd)
		return content[:start] + block + content[end:]
	}
	if strings.TrimSpace(content) == "" {
		return block
	}
	return content + "\n\n" + block
}
