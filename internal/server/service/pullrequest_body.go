package service

import (
	"fmt"
	"strings"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// summaryMaxRunes bounds the agent's text in a pull request body. The full text
// is already an issue comment; the body carries enough to orient a reviewer.
const summaryMaxRunes = 1200

// githubTitleMax is GitHub's limit on a pull request title. A longer one is
// rejected with a 422, which would fail the task after its work was pushed.
const githubTitleMax = 256

// pullRequestTitle is the title of a pull request the platform opens for a task.
// The issue's own title is what a reader needs — the agent's name explains who
// wrote the change, which belongs in the body.
func pullRequestTitle(full v1.Task) string {
	key, title := issueKeyAndTitle(full)
	title = oneLine(title)
	fallback := "changes by " + full.Agent.Name
	switch {
	case key == "" && title == "":
		return truncateTitle(fallback, githubTitleMax)
	case key == "":
		return truncateTitle(title, githubTitleMax)
	case title == "":
		return truncateTitle(key+": "+fallback, githubTitleMax)
	}
	budget := githubTitleMax - len([]rune(key)) - 2
	if budget < 1 {
		return key
	}
	return key + ": " + truncateTitle(title, budget)
}

// oneLine collapses an issue title into the single line a pull request title has
// room for: GitHub refuses a title with a newline.
func oneLine(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// truncateTitle clamps without the paragraph break truncateRunes adds, which has
// no place in a title. The ellipsis counts against the limit.
func truncateTitle(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	if max < 2 {
		return "…"
	}
	return strings.TrimRight(string(r[:max-1]), " ") + "…"
}

// pullRequestBody renders the body from what the task already reported: the
// issue it closes, the agent's own summary, and git's count of the change.
// issueURL is the console page for the issue, or "" when the server does not
// know its frontend URL.
func pullRequestBody(full v1.Task, summary *v1.TaskSummary, issueURL string) string {
	key, _ := issueKeyAndTitle(full)
	var b strings.Builder
	if key != "" {
		fmt.Fprintf(&b, "Closes %s\n\n", key)
	}

	b.WriteString("## What the agent did\n\n")
	if text := agentSummary(summary); text != "" {
		b.WriteString(text)
		b.WriteString("\n\n")
	} else {
		b.WriteString("_The agent reported no summary._\n\n")
	}

	if change := changeLine(summary); change != "" {
		b.WriteString("## Change\n\n")
		b.WriteString(change)
		b.WriteString("\n\n")
	}

	fmt.Fprintf(&b, "---\n\nOpened by gitsquad[bot] for **%s**.", full.Agent.Name)
	if issueURL != "" && key != "" {
		fmt.Fprintf(&b, " · [Issue %s](%s)", key, issueURL)
	}
	b.WriteString("\n")
	return b.String()
}

// issueKeyAndTitle reads the issue a task belongs to. A review task may carry no
// issue at all, so the readers of the task context must not assume one.
func issueKeyAndTitle(full v1.Task) (key, title string) {
	if full.Issue == nil {
		return "", ""
	}
	return full.Issue.Key, strings.TrimSpace(full.Issue.Title)
}

// agentSummary is the agent's final text, bounded. It is left as markdown: the
// agents already write in it, and re-rendering it would lose the structure the
// reviewer reads.
func agentSummary(summary *v1.TaskSummary) string {
	if summary == nil {
		return ""
	}
	return truncateRunes(strings.TrimSpace(summary.Output), summaryMaxRunes)
}

// changeLine says where the work went and how big it is. Either half can be
// missing — a task that reported no branch produced no pull request, and a
// daemon that could not count the change still pushed something.
func changeLine(summary *v1.TaskSummary) string {
	if summary == nil {
		return ""
	}
	var parts []string
	branch := strings.TrimSpace(summary.Branch)
	base := strings.TrimSpace(summary.BaseBranch)
	switch {
	case branch != "" && base != "":
		parts = append(parts, fmt.Sprintf("`%s` → `%s`", branch, base))
	case branch != "":
		parts = append(parts, fmt.Sprintf("`%s`", branch))
	}
	if st := summary.Changes; st != nil && st.Files > 0 {
		parts = append(parts, fmt.Sprintf("%d %s · +%d −%d",
			st.Files, plural(st.Files, "file", "files"), st.Additions, st.Deletions))
	}
	return strings.Join(parts, " · ")
}

// truncateRunes keeps at most max runes, cutting at a line break when there is
// one so a fenced block is not severed mid-way. A cut that still lands inside an
// open fence closes it: everything after it in the body would otherwise render
// as code.
func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	cut := string(r[:max])
	if i := strings.LastIndexByte(cut, '\n'); i >= 0 {
		cut = cut[:i]
	}
	// CRLF line endings leave the carriage return behind.
	cut = strings.TrimRight(cut, " \r")
	if strings.Count(cut, "```")%2 == 1 {
		cut += "\n```"
	}
	return cut + "\n\n…"
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}
