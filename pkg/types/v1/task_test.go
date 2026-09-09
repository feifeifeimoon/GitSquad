package v1

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestTaskJSONRoundTrip(t *testing.T) {
	task := Task{
		ID:          uuid.New(),
		WorkspaceID: uuid.New(),
		Issue: TaskIssueContext{
			ID:          uuid.New(),
			Key:         "GTS-42",
			Title:       "login null pointer",
			Description: "fix it",
			Comments: []TaskComment{
				{AuthorName: "alice", Type: "comment", Content: "@coder please fix", CreatedAt: time.Now().UTC()},
			},
		},
		Repo:  TaskRepoContext{Owner: "feifeifeimoon", Name: "demo", DefaultBranch: "main"},
		Agent: TaskAgentContext{Name: "coder", Instructions: "be conservative", Provider: "claude"},
		InstallationToken: "ghs_secret",
	}

	b, err := json.Marshal(task)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var back Task
	if err := json.Unmarshal(b, &back); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if back.ID != task.ID || back.WorkspaceID != task.WorkspaceID {
		t.Fatalf("ids mismatch: %+v", back)
	}
	if back.Issue.Key != "GTS-42" || len(back.Issue.Comments) != 1 {
		t.Fatalf("issue mismatch: %+v", back.Issue)
	}
	if back.Agent.Provider != "claude" || back.Agent.Model != "" {
		t.Fatalf("agent mismatch: %+v", back.Agent)
	}
	if back.InstallationToken != "ghs_secret" {
		t.Fatalf("installation token mismatch: %q", back.InstallationToken)
	}
}

func TestTaskOmitEmptyOptionals(t *testing.T) {
	task := Task{Agent: TaskAgentContext{Name: "coder", Provider: "claude"}}
	b, err := json.Marshal(task)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	agent, ok := m["agent"].(map[string]any)
	if !ok {
		t.Fatalf("agent field missing or wrong type: %v", m)
	}
	if _, ok := agent["model"]; ok {
		t.Error("model should be omitted when empty")
	}
	if _, ok := agent["skills"]; ok {
		t.Error("skills should be omitted when empty")
	}
}
