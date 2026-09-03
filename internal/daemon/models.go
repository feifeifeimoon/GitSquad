package daemon

import (
	"context"
	"strings"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// ListModels queries a provider CLI for its supported models. It fails open:
// an unsupported provider or a CLI error returns an empty list so the caller
// can degrade to free-form model input.
func ListModels(ctx context.Context, provider, executablePath string) ([]v1.Model, error) {
	switch provider {
	case "codex":
		out, err := runVersionCmd(executablePath, "debug", "models")
		if err != nil {
			return nil, nil
		}
		return parseCodexModels(out), nil
	case "claude":
		out, err := runVersionCmd(executablePath, "model", "list")
		if err != nil {
			return nil, nil
		}
		return parseClaudeModels(out), nil
	default:
		return nil, nil
	}
}

func parseCodexModels(out string) []v1.Model {
	var models []v1.Model
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		models = append(models, v1.Model{ID: line, Label: line, Provider: "codex"})
	}
	return models
}

func parseClaudeModels(out string) []v1.Model {
	var models []v1.Model
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		models = append(models, v1.Model{ID: line, Label: line, Provider: "claude"})
	}
	return models
}
