package v1

import "testing"

// The literals matter as much as the names: the issues.status CHECK constraint
// and the console's ISSUE_STATUSES list both spell them out, so renaming a
// constant must not quietly change the value that crosses the wire or reaches
// the database.
func TestIssueStatusValues(t *testing.T) {
	tests := []struct {
		constant string
		value    string
	}{
		{IssueStatusBacklog, "backlog"},
		{IssueStatusTodo, "todo"},
		{IssueStatusInProgress, "in_progress"},
		{IssueStatusInReview, "in_review"},
		{IssueStatusDone, "done"},
		{IssueStatusBlocked, "blocked"},
		{IssueStatusCancelled, "cancelled"},
	}
	for _, tt := range tests {
		if tt.constant != tt.value {
			t.Errorf("issue status constant = %q, want %q", tt.constant, tt.value)
		}
		if !ValidIssueStatus(tt.constant) {
			t.Errorf("ValidIssueStatus(%q) = false, want true", tt.constant)
		}
	}
}

func TestValidIssueStatusRejectsUnknown(t *testing.T) {
	// The statuses are lower_snake and case-sensitive, so a capitalised or
	// near-miss spelling has to be rejected rather than coerced.
	for _, s := range []string{"open", "closed", "inprogress", "in progress", "", " ", "Backlog", "DONE"} {
		if ValidIssueStatus(s) {
			t.Errorf("ValidIssueStatus(%q) = true, want false", s)
		}
	}
}
