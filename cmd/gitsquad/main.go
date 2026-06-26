package main

import (
	"fmt"
	"os"

	"github.com/feifeifeimoon/GitSquad/internal/server/logging"
	"github.com/feifeifeimoon/GitSquad/internal/version"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:           "gitsquad",
	Short:         "GitSquad CLI — command line tool for GitSquad.",
	Long:          "Connect GitSquad — Your autonomous developer team on GitHub.",
	SilenceUsage:  true,
	SilenceErrors: true,
}

func init() {
	rootCmd.Version = version.String()
	rootCmd.SetVersionTemplate("gitsquad {{.Version}}\n")
	rootCmd.AddCommand(daemonCmd)
}

func main() {
	logging.InitCLI()
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
