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
