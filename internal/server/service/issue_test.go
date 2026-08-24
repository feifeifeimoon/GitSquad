package service

import "testing"

func TestDeriveIssuePrefix(t *testing.T) {
	tests := []struct {
		name string
		want string
	}{
		{"GitSquad", "GIT"},
		{"My Workspace", "MYW"},
		{"Acme_2026", "ACM"},
		{"123", "WS"},
		{"", "WS"},
	}
	for _, tt := range tests {
		if got := deriveIssuePrefix(tt.name); got != tt.want {
			t.Errorf("deriveIssuePrefix(%q) = %q, want %q", tt.name, got, tt.want)
		}
	}
}

func TestValidIssueStatus(t *testing.T) {
	for _, s := range []string{"backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"} {
		if !validIssueStatus(s) {
			t.Errorf("validIssueStatus(%q) = false, want true", s)
		}
	}
	for _, s := range []string{"open", "closed", "inprogress", ""} {
		if validIssueStatus(s) {
			t.Errorf("validIssueStatus(%q) = true, want false", s)
		}
	}
}
