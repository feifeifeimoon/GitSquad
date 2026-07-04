package main

import "syscall"

const (
	detachedProcess        = 0x00000008
	createBreakawayFromJob = 0x01000000
)

func daemonSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: detachedProcess | createBreakawayFromJob,
	}
}
