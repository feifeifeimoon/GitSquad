package service

import (
	"reflect"
	"testing"
)

func TestParseMentions(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    []string
	}{
		{"plain mention", "please @coder look at this", []string{"coder"}},
		{"at string start", "@coder first", []string{"coder"}},
		{"multiple mentions", "@alice and @bob both", []string{"alice", "bob"}},
		{"dedupe keeps order", "@alice @bob @alice", []string{"alice", "bob"}},
		{"with hyphens and underscores", "@senior-dev and @code_reviewer", []string{"senior-dev", "code_reviewer"}},
		{"no mention", "just text", nil},
		{"email is not a mention", "mail me at a@b.com", nil},
		{"skips fenced code block", "```\n@coder inside fence\n```\nafter @coder", []string{"coder"}},
		{"skips inline code", "use `@coder literal` and @coder", []string{"coder"}},
		{"mention with trailing punctuation", "@coder, please", []string{"coder"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ParseMentions(tt.content)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("ParseMentions(%q) = %v, want %v", tt.content, got, tt.want)
			}
		})
	}
}

func TestProcessMentions(t *testing.T) {
	matched, unmatched := processMentions("hi @coder and @ghost", []string{"coder"})
	if !reflect.DeepEqual(matched, []string{"coder"}) {
		t.Errorf("matched = %v, want [coder]", matched)
	}
	if !reflect.DeepEqual(unmatched, []string{"ghost"}) {
		t.Errorf("unmatched = %v, want [ghost]", unmatched)
	}

	matched, unmatched = processMentions("no mentions here", []string{"coder"})
	if len(matched) != 0 || len(unmatched) != 0 {
		t.Errorf("expected empty splits, got %v / %v", matched, unmatched)
	}
}
