package app

import (
	"context"
	"fmt"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/config"
)

func Run(ctx context.Context, cfg config.Config) error {
	if cfg.APIURL == "" {
		return fmt.Errorf("api url is required")
	}
	if cfg.WorkDir == "" {
		return fmt.Errorf("work dir is required")
	}

	<-ctx.Done()
	return nil
}
