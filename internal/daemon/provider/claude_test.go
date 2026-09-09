package provider

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestBuildClaudeArgs(t *testing.T) {
	args := buildClaudeArgs(ExecOptions{})
	want := []string{
		"-p",
		"--output-format", "stream-json",
		"--input-format", "stream-json",
		"--verbose",
		"--strict-mcp-config",
		"--permission-mode", "bypassPermissions",
		"--disallowedTools", "AskUserQuestion",
	}
	if strings.Join(args, " ") != strings.Join(want, " ") {
		t.Fatalf("buildClaudeArgs() = %v, want %v", args, want)
	}

	args = buildClaudeArgs(ExecOptions{Model: "sonnet", MaxTurns: 3, SystemPrompt: "be terse"})
	joined := strings.Join(args, " ")
	for _, want := range []string{"--model sonnet", "--max-turns 3", "--append-system-prompt be terse"} {
		if !strings.Contains(joined, want) {
			t.Errorf("args missing %q: %v", want, args)
		}
	}
}

func TestBuildClaudeInput(t *testing.T) {
	data := buildClaudeInput("hello")
	var evt map[string]any
	if err := json.Unmarshal(data, &evt); err != nil {
		t.Fatalf("input is not valid JSON: %v", err)
	}
	if evt["type"] != "user" {
		t.Errorf("type = %v, want user", evt["type"])
	}
	msg := evt["message"].(map[string]any)
	content := msg["content"].([]any)
	block := content[0].(map[string]any)
	if block["text"] != "hello" {
		t.Errorf("text = %v, want hello", block["text"])
	}
}

func TestParseClaudeEvents(t *testing.T) {
	cases := []struct {
		line  string
		types []MessageType
	}{
		{
			`{"type":"system","subtype":"init","session_id":"sess-1"}`,
			[]MessageType{MessageStatus},
		},
		{
			`{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"},{"type":"thinking","thinking":"hmm"},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"go test"}}]}}`,
			[]MessageType{MessageText, MessageThinking, MessageToolUse},
		},
		{
			`{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"ok","is_error":false}]}}`,
			[]MessageType{MessageToolResult},
		},
	}
	for _, c := range cases {
		evt, ok := parseClaudeEvent([]byte(c.line))
		if !ok {
			t.Fatalf("parseClaudeEvent(%s) failed", c.line)
		}
		msgs := evt.messages()
		if len(msgs) != len(c.types) {
			t.Fatalf("messages() = %d events, want %d (line %s)", len(msgs), len(c.types), c.line)
		}
		for i, m := range msgs {
			if m.Type != c.types[i] {
				t.Errorf("messages()[%d].Type = %s, want %s", i, m.Type, c.types[i])
			}
		}
	}

	// tool_result content as an array of text blocks.
	evt, _ := parseClaudeEvent([]byte(`{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":[{"type":"text","text":"a"},{"type":"text","text":"b"}]}]}}`))
	msgs := evt.messages()
	if len(msgs) != 1 || msgs[0].Output != "ab" {
		t.Fatalf("tool_result array flatten = %+v, want Output=ab", msgs)
	}
}

func TestParseClaudeResult(t *testing.T) {
	evt, _ := parseClaudeEvent([]byte(`{"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"sess-1","duration_ms":5,"usage":{"input_tokens":10,"output_tokens":20}}`))
	r, ok := evt.result()
	if !ok {
		t.Fatal("result() = !ok, want ok")
	}
	if r.Status != "completed" || r.Output != "done" || r.SessionID != "sess-1" {
		t.Errorf("result() = %+v, want completed/done/sess-1", r)
	}
	if r.Usage[""].InputTokens != 10 || r.Usage[""].OutputTokens != 20 {
		t.Errorf("usage = %+v, want 10/20", r.Usage)
	}

	// error result
	evt, _ = parseClaudeEvent([]byte(`{"type":"result","subtype":"error_during_execution","is_error":true}`))
	r, ok = evt.result()
	if !ok || r.Status != "failed" {
		t.Errorf("error result = (%+v, %v), want failed", r, ok)
	}
}
