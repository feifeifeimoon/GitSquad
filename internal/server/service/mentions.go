package service

import "regexp"

// mentionRe matches @mention tokens: @ followed by word chars, hyphen or
// underscore. The (^|[^\w]) prefix keeps emails (a@b.com) from matching —
// RE2 has no lookbehind, so the preceding char is captured in group 1.
var mentionRe = regexp.MustCompile(`(^|[^\w])@([a-zA-Z0-9_-]+)`)

// codeBlockRe matches fenced code blocks (```...```, non-greedy across lines).
var codeBlockRe = regexp.MustCompile("(?s)```.*?```")

// inlineCodeRe matches inline code spans (`...`).
var inlineCodeRe = regexp.MustCompile("`[^`\n]+`")

// ParseMentions extracts @mention tokens from content, skipping text inside
// fenced code blocks and inline code spans. Order is preserved; duplicates
// are removed.
func ParseMentions(content string) []string {
	masked := codeBlockRe.ReplaceAllString(content, "")
	masked = inlineCodeRe.ReplaceAllString(masked, "")

	var result []string
	seen := map[string]bool{}
	for _, m := range mentionRe.FindAllStringSubmatch(masked, -1) {
		name := m[2]
		if !seen[name] {
			seen[name] = true
			result = append(result, name)
		}
	}
	return result
}

// processMentions splits parsed mentions into those that exist in the
// workspace's agent list (matched) and those that do not (unmatched).
// Chapter 5 (agent config) supplies real agentNames; until then callers
// pass an empty list so every mention lands in unmatched, per spec.
func processMentions(content string, agentNames []string) (matched, unmatched []string) {
	agents := map[string]bool{}
	for _, a := range agentNames {
		agents[a] = true
	}
	for _, m := range ParseMentions(content) {
		if agents[m] {
			matched = append(matched, m)
		} else {
			unmatched = append(unmatched, m)
		}
	}
	return matched, unmatched
}
