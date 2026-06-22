package app

import (
	"context"
	"testing"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/config"
)

func TestRunReturnsWhenContextCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := Run(ctx, config.Config{APIURL: "http://localhost:8080", WorkDir: ".gitsquad/workspaces"})
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
}
