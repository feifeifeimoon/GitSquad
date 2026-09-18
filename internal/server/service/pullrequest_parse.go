package service

import (
	"regexp"
	"strings"
)

// The two ways a PR can be recognised as belonging to a GitSquad issue. Both are
// deliberately narrow: a PR that merely mentions an issue key is not linked, so
// a passing reference ("this PR is unrelated to GTS-42") can never keep an issue
// open, and a link a human removed is never re-created behind their back.

// closingKeywordRe matches an explicit closing declaration: Closes/Fixes/Resolves
// followed by an issue key. GitHub's own `Closes #12` means "close PR #12 in this
// repository" — it knows nothing about our issues, so the key has to be ours.
var closingKeywordRe = regexp.MustCompile(`(?i)\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+([A-Za-z][A-Za-z0-9]*-\d+)\b`)

// issueKeyRe matches a GitSquad issue key on its own (PREFIX-NUMBER).
var issueKeyRe = regexp.MustCompile(`^([A-Za-z][A-Za-z0-9]*)-(\d+)$`)

// parseIssueKeysFromText returns the issue keys a PR title/body explicitly says
// it closes. Order is preserved and duplicates are dropped.
func parseIssueKeysFromText(text string) []string {
	var keys []string
	seen := map[string]bool{}
	for _, m := range closingKeywordRe.FindAllStringSubmatch(text, -1) {
		key := strings.ToUpper(m[1])
		if seen[key] {
			continue
		}
		seen[key] = true
		keys = append(keys, key)
	}
	return keys
}

// parseIssueKeyFromBranch reads the issue key out of the platform's own branch
// convention: gitsquad/<KEY>/<taskID>. A PR opened on top of a branch we created
// is the issue's line of work even when nobody wrote a closing keyword, which is
// what makes a human opening their own PR from that branch work.
func parseIssueKeyFromBranch(branch string) (string, bool) {
	parts := strings.Split(strings.TrimSpace(branch), "/")
	if len(parts) < 2 || parts[0] != "gitsquad" {
		return "", false
	}
	key := strings.ToUpper(parts[1])
	if !issueKeyRe.MatchString(key) {
		return "", false
	}
	return key, true
}
