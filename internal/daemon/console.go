package daemon

// consoleAllocator is the OS console surface ensureHiddenConsole drives. The
// primitives are injectable so the decision logic can be unit-tested without
// touching the real console of the test process.
type consoleAllocator struct {
	// window returns the HWND of the console window the process owns, or 0
	// when it has no console at all.
	window func() uintptr
	// alloc attaches a console to the process, reporting whether it worked.
	alloc func() bool
	// hide makes a console window invisible.
	hide func(hwnd uintptr)
}

// ensureHiddenConsole gives the process a console whose window is not visible
// to the user, so that every console-subsystem child it spawns inherits a
// hidden console instead of being handed a freshly allocated visible one.
//
// A process that already owns a console is left untouched: the daemon may be
// running in the foreground of a terminal, and hiding that window would take
// away something the user asked for.
func ensureHiddenConsole(a consoleAllocator) {
	if a.window() != 0 {
		return // already has a console
	}
	if !a.alloc() {
		return // no console to be had; children keep allocating their own
	}
	// Re-read the handle: allocating a console is what mints the window, so
	// the value from before the call is always 0.
	if hwnd := a.window(); hwnd != 0 {
		a.hide(hwnd)
	}
}
