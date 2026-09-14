//go:build windows

package daemon

import "syscall"

var (
	kernel32          = syscall.NewLazyDLL("kernel32.dll")
	user32            = syscall.NewLazyDLL("user32.dll")
	procAllocConsole  = kernel32.NewProc("AllocConsole")
	procConsoleWindow = kernel32.NewProc("GetConsoleWindow")
	procShowWindow    = user32.NewProc("ShowWindow")
)

// swHide is SW_HIDE: show the window as hidden.
const swHide = 0

// windowsConsole binds the allocator to the real kernel32/user32 entry points.
// Their error returns are deliberately dropped: none of these calls reports a
// failure the daemon can act on, and a console that could not be allocated only
// means children fall back to allocating their own.
var windowsConsole = consoleAllocator{
	window: func() uintptr {
		hwnd, _, _ := procConsoleWindow.Call()
		return hwnd
	},
	alloc: func() bool {
		r, _, _ := procAllocConsole.Call()
		return r != 0
	},
	hide: func(hwnd uintptr) {
		_, _, _ = procShowWindow.Call(hwnd, swHide)
	},
}

// EnsureHiddenConsole gives the daemon a console the user cannot see, so that
// every console-subsystem child it spawns — runtime version probes, git, the
// agent CLI, and whatever that CLI goes on to spawn — inherits a hidden console
// rather than making Windows allocate a visible console window on the desktop.
//
// This matters because `gitsquad daemon start` launches the daemon with
// DETACHED_PROCESS: it has no console of its own, and a console-subsystem child
// created by a process without a console is given a brand new one.
//
// It MUST run before the first child process is spawned. A child started
// earlier allocates its own visible console window and is unaffected by this
// call, which reintroduces exactly the popups this function exists to prevent.
func EnsureHiddenConsole() {
	ensureHiddenConsole(windowsConsole)
}
