package service

import (
	"strings"
	"testing"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

func bodyTask() v1.Task {
	return v1.Task{
		Kind:  "issue",
		Issue: &v1.TaskIssueContext{Key: "COL-3", Title: "登录后白屏"},
		Agent: v1.TaskAgentContext{Name: "coding"},
		Repo:  v1.TaskRepoContext{Owner: "feifeifeimoon", Name: "ColabDesk", DefaultBranch: "main"},
	}
}

func TestPullRequestTitleUsesTheIssueTitle(t *testing.T) {
	if got := pullRequestTitle(bodyTask()); got != "COL-3: 登录后白屏" {
		t.Errorf("title = %q, want the issue title", got)
	}
}

// An issue with no title still needs a title the log can carry.
func TestPullRequestTitleFallsBackForAnUntitledIssue(t *testing.T) {
	task := bodyTask()
	task.Issue.Title = ""
	if got := pullRequestTitle(task); got != "COL-3: changes by coding" {
		t.Errorf("title = %q, want the agent named", got)
	}
}

// A keyless issue must not produce a title that starts with a colon.
func TestPullRequestTitleWithoutAKey(t *testing.T) {
	task := bodyTask()
	task.Issue.Key = ""
	if got := pullRequestTitle(task); got != "登录后白屏" {
		t.Errorf("title = %q, want the bare title", got)
	}
}

// GitHub refuses a title with a newline (422) and one over 256 characters, so a
// multi-line or long issue title must be flattened and clamped before it is sent.
func TestPullRequestTitleIsOneClampedLine(t *testing.T) {
	task := bodyTask()
	task.Issue.Title = "登录\r\n后 \t 白屏"
	if got := pullRequestTitle(task); got != "COL-3: 登录 后 白屏" {
		t.Errorf("title = %q, want the newlines collapsed", got)
	}

	task.Issue.Title = strings.Repeat("长", 400)
	got := pullRequestTitle(task)
	if n := len([]rune(got)); n > githubTitleMax {
		t.Errorf("title is %d runes, want at most %d", n, githubTitleMax)
	}
	if !strings.HasPrefix(got, "COL-3: ") {
		t.Errorf("title = %q, want the key kept", got)
	}
}

func TestPullRequestBodyCarriesWhatTheTaskReported(t *testing.T) {
	summary := &v1.TaskSummary{
		Output:     "Fixed the null deref in the shim.",
		Branch:     "gitsquad/COL-3/abc",
		BaseBranch: "main",
		Changes:    &v1.TaskDiffStat{Files: 2, Additions: 12, Deletions: 3},
	}
	body := pullRequestBody(bodyTask(), summary, "https://app.test/orion/issues/COL-3")

	for _, want := range []string{
		"Closes COL-3",
		"## What the agent did",
		"Fixed the null deref in the shim.",
		"## Change",
		"`gitsquad/COL-3/abc` → `main`",
		"2 files · +12 −3",
		"Opened by gitsquad[bot] for **coding**.",
		"[Issue COL-3](https://app.test/orion/issues/COL-3)",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("body missing %q:\n%s", want, body)
		}
	}
	if strings.Contains(body, "Automated changes by") {
		t.Errorf("the old boilerplate is back:\n%s", body)
	}
}

func TestPullRequestBodySingularFile(t *testing.T) {
	summary := &v1.TaskSummary{Output: "x", Changes: &v1.TaskDiffStat{Files: 1, Additions: 1}}
	body := pullRequestBody(bodyTask(), summary, "")
	if !strings.Contains(body, "1 file · +1 −0") {
		t.Errorf("body = %s, want a singular file count", body)
	}
}

// A task can end without a summary, and a server that does not know its own
// frontend URL must not emit a broken link.
func TestPullRequestBodyWithoutASummaryOrIssueURL(t *testing.T) {
	body := pullRequestBody(bodyTask(), nil, "")
	if !strings.Contains(body, "Closes COL-3") {
		t.Errorf("body lost the issue line:\n%s", body)
	}
	if !strings.Contains(body, "_The agent reported no summary._") {
		t.Errorf("body = %s, want the empty-summary line", body)
	}
	if strings.Contains(body, "## Change") {
		t.Errorf("body = %s, want no change section without a change", body)
	}
	if strings.Contains(body, "[Issue COL-3]") {
		t.Errorf("body = %s, want no link without a frontend URL", body)
	}
}

func TestPullRequestBodyTruncatesALongSummary(t *testing.T) {
	long := strings.Repeat("a line of the agent's summary\n", 100)
	body := pullRequestBody(bodyTask(), &v1.TaskSummary{Output: long}, "")
	if !strings.Contains(body, "…") {
		t.Errorf("body = %s, want the truncation marked", body)
	}
	if strings.Count(body, "a line of the agent's summary") > 60 {
		t.Errorf("summary was not truncated: %d lines", strings.Count(body, "a line"))
	}
}

// A cut inside a fenced block has to close it: an unclosed fence swallows every
// section after it in the rendered body.
func TestPullRequestBodyClosesAFenceItCutThrough(t *testing.T) {
	output := "intro\n\n```go\n" + strings.Repeat("\tfmt.Println(\"x\")\n", 200)
	body := pullRequestBody(bodyTask(), &v1.TaskSummary{
		Output: output, Changes: &v1.TaskDiffStat{Files: 2, Additions: 3},
	}, "")
	if strings.Count(body, "```")%2 != 0 {
		t.Errorf("body has an unclosed fence:\n%s", body)
	}
	// Everything that follows the summary must still be there.
	if !strings.Contains(body, "## Change") || !strings.Contains(body, "Opened by gitsquad[bot]") {
		t.Errorf("body lost its later sections:\n%s", body)
	}
}

// A cut on a CRLF file must not leave the carriage return behind at the seam.
func TestPullRequestBodyTruncationDropsTheCarriageReturn(t *testing.T) {
	output := strings.Repeat("a line\r\n", 400)
	body := pullRequestBody(bodyTask(), &v1.TaskSummary{Output: output}, "")
	i := strings.Index(body, "\n\n…")
	if i < 0 {
		t.Fatalf("body has no truncation mark:\n%s", body)
	}
	if i > 0 && body[i-1] == '\r' {
		t.Error("the cut left a carriage return before the ellipsis")
	}
}

// A review task carries no issue, and the body builder must not dereference one.
func TestPullRequestBodyWithoutAnIssue(t *testing.T) {
	task := bodyTask()
	task.Issue = nil
	body := pullRequestBody(task, &v1.TaskSummary{Output: "done"}, "")
	if strings.Contains(body, "Closes") {
		t.Errorf("body = %s, want no issue line", body)
	}
	if !strings.Contains(body, "Opened by gitsquad[bot] for **coding**.") {
		t.Errorf("body = %s, want the footer", body)
	}
}
