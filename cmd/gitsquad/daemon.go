package main

import (
	"context"
	"errors"
	"os"
	"os/signal"
	"syscall"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/app"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	"github.com/spf13/cobra"
)

var daemonCmd = &cobra.Command{
	Use:   "daemon",
	Short: "Run the GitSquad local daemon.",
	Long:  "Run the GitSquad local daemon that connects local workspaces to GitSquad SaaS.",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
		defer stop()

		err := app.Run(ctx, daemonconfig.Load())
		if errors.Is(err, context.Canceled) {
			return nil
		}
		return err
	},
}
