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

var daemonRunCmd = &cobra.Command{
	Use:   "run",
	Short: "Start the daemon.",
	Long:  "Start the GitSquad daemon to receive and execute local tasks.",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
		defer stop()

		d := app.New(daemonconfig.Load())
		err := d.Run(ctx)
		if errors.Is(err, context.Canceled) {
			return nil
		}
		return err
	},
}
