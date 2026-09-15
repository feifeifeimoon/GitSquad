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

	// error result
	evt, _ = parseClaudeEvent([]byte(`{"type":"result","subtype":"error_during_execution","is_error":true}`))
	r, ok = evt.result()
	if !ok || r.Status != "failed" {
		t.Errorf("error result = (%+v, %v), want failed", r, ok)
	}
}

func TestClaudeAssistantUsage(t *testing.T) {
	evt, _ := parseClaudeEvent([]byte(`{"type":"assistant","message":{"role":"assistant","model":"claude-sonnet-4-5","usage":{"input_tokens":3,"output_tokens":7,"cache_read_input_tokens":100,"cache_creation_input_tokens":50},"content":[{"type":"text","text":"hi"}]}}`))
	model, u, ok := evt.assistantUsage()
	if !ok {
		t.Fatal("assistantUsage() = !ok, want ok")
	}
	if model != "claude-sonnet-4-5" {
		t.Errorf("model = %q, want claude-sonnet-4-5", model)
	}
	want := TokenUsage{InputTokens: 3, OutputTokens: 7, CacheReadTokens: 100, CacheWriteTokens: 50}
	if u != want {
		t.Errorf("usage = %+v, want %+v", u, want)
	}

	// A turn that reports nothing is not a usage event.
	evt, _ = parseClaudeEvent([]byte(`{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}`))
	if _, _, ok := evt.assistantUsage(); ok {
		t.Error("assistantUsage() without usage = ok, want !ok")
	}
	// A result event is not an assistant turn.
	evt, _ = parseClaudeEvent([]byte(`{"type":"result","usage":{"input_tokens":1}}`))
	if _, _, ok := evt.assistantUsage(); ok {
		t.Error("assistantUsage() on result = ok, want !ok")
	}
}

func TestClaudeResultUsagePrefersPerModelBreakdown(t *testing.T) {
	evt, _ := parseClaudeEvent([]byte(`{"type":"result","subtype":"success","usage":{"input_tokens":1,"output_tokens":1},"modelUsage":{"claude-opus-4":{"inputTokens":100,"outputTokens":200,"cacheReadInputTokens":300,"cacheCreationInputTokens":400},"claude-sonnet-4-5":{"inputTokens":5,"outputTokens":6}}}`))
	got, ok := evt.resultUsage("fallback")
	if !ok {
		t.Fatal("resultUsage() = !ok, want ok")
	}
	if len(got) != 2 {
		t.Fatalf("resultUsage() n = %d, want 2", len(got))
	}
	if u := got["claude-opus-4"]; u.InputTokens != 100 || u.OutputTokens != 200 || u.CacheReadTokens != 300 || u.CacheWriteTokens != 400 {
		t.Errorf("opus usage = %+v, want 100/200/300/400", u)
	}

	// Without modelUsage the flat total lands on the model the run used.
	evt, _ = parseClaudeEvent([]byte(`{"type":"result","usage":{"input_tokens":10,"output_tokens":20}}`))
	got, ok = evt.resultUsage("claude-sonnet-4-5")
	if !ok || len(got) != 1 || got["claude-sonnet-4-5"].InputTokens != 10 {
		t.Errorf("flat resultUsage = %+v (ok=%v), want 10 input under claude-sonnet-4-5", got, ok)
	}

	// A result with no usage at all reports nothing, so the streamed turns win.
	evt, _ = parseClaudeEvent([]byte(`{"type":"result","subtype":"success"}`))
	if _, ok := evt.resultUsage("m"); ok {
		t.Error("resultUsage() with no usage = ok, want !ok")
	}
	// An all-zero breakdown is not a report either.
	evt, _ = parseClaudeEvent([]byte(`{"type":"result","modelUsage":{"m":{"inputTokens":0,"outputTokens":0}}}`))
	if _, ok := evt.resultUsage("m"); ok {
		t.Error("resultUsage() with all-zero modelUsage = ok, want !ok")
	}
}

// Real result events carry non-token fields alongside the counts — costUSD is a
// float, serviceTier a string. A decode that choked on those would take the
// whole event down with it and silently lose the run's usage.
func TestClaudeUsageToleratesNonTokenSiblings(t *testing.T) {
	line := `{"type":"result","subtype":"success","usage":{"input_tokens":12,"output_tokens":34,"cache_read_input_tokens":56,"cache_creation_input_tokens":78,"service_tier":"standard","costUSD":0.0123,"server_tool_use":{"web_search_requests":2}},"modelUsage":{"claude-sonnet-4-5":{"inputTokens":9,"outputTokens":8,"cacheReadInputTokens":7,"cacheCreationInputTokens":6,"costUSD":0.5,"contextWindow":200000,"maxOutputTokens":64000,"webSearchRequests":1}}}`
	evt, ok := parseClaudeEvent([]byte(line))
	if !ok {
		t.Fatal("parseClaudeEvent = !ok, want ok")
	}

	// The flat object still yields its counts.
	got, ok := evt.resultUsage("m")
	if !ok {
		t.Fatal("resultUsage() = !ok, want ok")
	}
	// modelUsage wins, so this is the sonnet row, not the flat one.
	u, ok := got["claude-sonnet-4-5"]
	if !ok {
		t.Fatalf("resultUsage() = %+v, want a claude-sonnet-4-5 entry", got)
	}
	if u.InputTokens != 9 || u.OutputTokens != 8 || u.CacheReadTokens != 7 || u.CacheWriteTokens != 6 {
		t.Errorf("usage = %+v, want 9/8/7/6", u)
	}

	// An assistant turn with a nested usage object parses the same way.
	evt, ok = parseClaudeEvent([]byte(`{"type":"assistant","message":{"role":"assistant","model":"m1","usage":{"input_tokens":1,"output_tokens":2,"cache_read_input_tokens":3,"cache_creation_input_tokens":4},"content":[]}}`))
	if !ok {
		t.Fatal("assistant parse = !ok, want ok")
	}
	if _, u, ok := evt.assistantUsage(); !ok || u.CacheWriteTokens != 4 {
		t.Errorf("assistantUsage() = %+v (ok=%v), want cache write 4", u, ok)
	}

	// A null usage object is not a usage report, and must not panic.
	evt, ok = parseClaudeEvent([]byte(`{"type":"result","subtype":"success","usage":null}`))
	if !ok {
		t.Fatal("null usage parse = !ok, want ok")
	}
	if _, ok := evt.resultUsage("m"); ok {
		t.Error("resultUsage() with null usage = ok, want !ok")
	}
}

// Copied verbatim from a real Claude Code transcript on disk, including the
// nested cache_creation object. That sibling is why the usage decoder reads
// through map[string]any: it is an object where its neighbours are numbers, and
// a stricter decode would fail the line and lose the whole event with it.
func TestClaudeUsageMatchesRealTranscriptShape(t *testing.T) {
	line := `{"type":"assistant","message":{"id":"msg_01","type":"message","role":"assistant","model":"claude-opus-4-7","content":[{"type":"text","text":"hi"}],"stop_reason":null,"stop_sequence":null,"usage":{"cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":2685},"cache_creation_input_tokens":2685,"cache_read_input_tokens":30826,"input_tokens":941,"output_tokens":0}}}`
	evt, ok := parseClaudeEvent([]byte(line))
	if !ok {
		t.Fatal("parseClaudeEvent on a real transcript line = !ok, want ok")
	}
	model, u, ok := evt.assistantUsage()
	if !ok {
		t.Fatal("assistantUsage() = !ok, want ok")
	}
	if model != "claude-opus-4-7" {
		t.Errorf("model = %q, want claude-opus-4-7", model)
	}
	// output_tokens really is 0 on this turn, so the turn must still count: the
	// cache buckets carry the consumption that matters.
	want := TokenUsage{InputTokens: 941, OutputTokens: 0, CacheReadTokens: 30826, CacheWriteTokens: 2685}
	if u != want {
		t.Errorf("usage = %+v, want %+v", u, want)
	}
	if u.IsZero() {
		t.Error("a turn reporting only cache tokens came out as zero usage")
	}
}

func TestUsageTrackerAccumulatesTurns(t *testing.T) {
	tr := newUsageTracker("configured-model")
	tr.addTurn("claude-sonnet-4-5", TokenUsage{InputTokens: 1, OutputTokens: 2, CacheReadTokens: 3})
	tr.addTurn("", TokenUsage{InputTokens: 10, OutputTokens: 20})
	// The second turn named no model, so it lands on the most recent named one.
	got := tr.snapshot()
	if len(got) != 1 {
		t.Fatalf("snapshot n = %d, want the two turns merged into one model: %+v", len(got), got)
	}
	if u := got["claude-sonnet-4-5"]; u.InputTokens != 11 || u.OutputTokens != 22 || u.CacheReadTokens != 3 {
		t.Errorf("usage = %+v, want 11/22/3", u)
	}

	// A turn with no tokens at all contributes nothing.
	tr.addTurn("claude-sonnet-4-5", TokenUsage{})
	if u := tr.snapshot()["claude-sonnet-4-5"]; u.InputTokens != 11 {
		t.Errorf("zero turn changed the total: %+v", u)
	}
}

func TestUsageTrackerFallbacks(t *testing.T) {
	// Nothing named a model, so the configured one takes it.
	tr := newUsageTracker("configured-model")
	tr.addTurn("", TokenUsage{InputTokens: 5})
	if _, ok := tr.snapshot()["configured-model"]; !ok {
		t.Errorf("snapshot = %+v, want the configured model as the key", tr.snapshot())
	}

	// No configured model either: never leave a blank key.
	tr = newUsageTracker("")
	tr.addTurn("", TokenUsage{InputTokens: 5})
	if _, ok := tr.snapshot()[UnknownModel]; !ok {
		t.Errorf("snapshot = %+v, want the %q key", tr.snapshot(), UnknownModel)
	}

	// A provider that reports nothing yields nil, which means "not reported"
	// rather than zero tokens.
	if got := newUsageTracker("m").snapshot(); got != nil {
		t.Errorf("snapshot = %+v, want nil", got)
	}
}

// The terminal totals already cover every turn, so they replace the
// accumulation instead of being added to it.
func TestUsageTrackerReplaceTotalsDoesNotDoubleCount(t *testing.T) {
	tr := newUsageTracker("m")
	tr.addTurn("claude-sonnet-4-5", TokenUsage{InputTokens: 1, OutputTokens: 2})
	tr.replaceTotals(map[string]TokenUsage{
		"claude-sonnet-4-5": {InputTokens: 100, OutputTokens: 200},
		"claude-opus-4":     {InputTokens: 7},
	})
	got := tr.snapshot()
	if len(got) != 2 {
		t.Fatalf("snapshot = %+v, want both models", got)
	}
	if u := got["claude-sonnet-4-5"]; u.InputTokens != 100 || u.OutputTokens != 200 {
		t.Errorf("sonnet = %+v, want the totals 100/200, not the accumulated 1/2", u)
	}
	if got["claude-opus-4"].InputTokens != 7 {
		t.Errorf("opus = %+v, want 7", got["claude-opus-4"])
	}

	// An all-zero replacement is not a report, so the turns stand.
	tr = newUsageTracker("m")
	tr.addTurn("claude-sonnet-4-5", TokenUsage{InputTokens: 1})
	tr.replaceTotals(map[string]TokenUsage{"claude-sonnet-4-5": {}})
	if tr.snapshot()["claude-sonnet-4-5"].InputTokens != 1 {
		t.Errorf("all-zero totals wiped the accumulation: %+v", tr.snapshot())
	}
}
