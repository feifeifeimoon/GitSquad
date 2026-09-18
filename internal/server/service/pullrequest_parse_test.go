package service

import (
	"reflect"
	"testing"
)

func TestParseIssueKeysFromText(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{name: "closes", in: "Closes GTS-42", want: []string{"GTS-42"}},
		{name: "case and punctuation", in: "fixes gts-7.\n\nResolves: GTS-9", want: []string{"GTS-7", "GTS-9"}},
		{name: "duplicates collapse", in: "Closes GTS-1 and also closes GTS-1", want: []string{"GTS-1"}},
		{
			// The whole point of the strict rule: a passing reference must not
			// link, or it would keep the issue from ever completing.
			name: "bare mention is not a link",
			in:   "这个 PR 跟 GTS-42 无关，只是顺手改了同一段代码",
			want: nil,
		},
		{
			// GitHub's own syntax refers to GitHub issues, which we know nothing
			// about — only our keys are ours to bind.
			name: "github-native reference is ignored",
			in:   "Closes #42",
			want: nil,
		},
		{name: "no keywords", in: "GTS-42 related follow-up", want: nil},
		{name: "keyword without a key", in: "Closes the door", want: nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := parseIssueKeysFromText(tc.in); !reflect.DeepEqual(got, tc.want) {
				t.Errorf("parseIssueKeysFromText(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

func TestParseIssueKeyFromBranch(t *testing.T) {
	cases := []struct {
		branch string
		want   string
		ok     bool
	}{
		{branch: "gitsquad/GTS-42/1f2e3d", want: "GTS-42", ok: true},
		{branch: "gitsquad/gts-42/1f2e3d", want: "GTS-42", ok: true},
		{branch: "feature/login", ok: false},
		{branch: "gitsquad/not-a-key/1f2e", ok: false},
		{branch: "main", ok: false},
		{branch: "", ok: false},
	}
	for _, tc := range cases {
		got, ok := parseIssueKeyFromBranch(tc.branch)
		if ok != tc.ok || got != tc.want {
			t.Errorf("parseIssueKeyFromBranch(%q) = (%q, %v), want (%q, %v)", tc.branch, got, ok, tc.want, tc.ok)
		}
	}
}
