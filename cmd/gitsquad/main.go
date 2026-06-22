package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"runtime"
	"syscall"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/app"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	"github.com/spf13/cobra"
)

var (
	version = "dev"
	commit  = "unknown"
	date    = "unknown"
)

var rootCmd = &cobra.Command{
	Use:           "gitsquad",
	Short:         "GitSquad CLI — command line tool for GitSquad.",
	Long:          "Connect GitSquad — Your autonomous developer team on GitHub.",
	SilenceUsage:  true,
	SilenceErrors: true,
}

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

func init() {
	rootCmd.Version = fmt.Sprintf("%s (commit: %s, built: %s)\ngo: %s, os/arch: %s/%s", version, commit, date, runtime.Version(), runtime.GOOS, runtime.GOARCH)
	rootCmd.SetVersionTemplate("gitsquad {{.Version}}\n")
	rootCmd.AddCommand(daemonCmd)
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
