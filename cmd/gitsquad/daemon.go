package main

import "github.com/spf13/cobra"

var daemonCmd = &cobra.Command{
	Use:   "daemon",
	Short: "Manage the GitSquad local daemon.",
	Long:  "Register, run, and inspect the daemon that connects your machine to GitSquad.",
}

func init() {
	daemonLoginCmd.Flags().StringVar(&loginToken, "token", "", "Daemon token for headless auth")
	daemonLoginCmd.Flags().StringVar(&loginName, "name", "", "Custom device name")

	daemonCmd.AddCommand(daemonRunCmd)
	daemonCmd.AddCommand(daemonLoginCmd)
	daemonCmd.AddCommand(daemonStatusCmd)
}
