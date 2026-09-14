package daemon

import "testing"

// fakeConsole stands in for a process's console state. It starts out owning
// whatever window the test gives it, and mints one when alloc succeeds, so the
// allocator reads a different value before and after the allocation — the way
// the real GetConsoleWindow does.
type fakeConsole struct {
	hwnd      uintptr
	allocOK   bool
	allocated int
	hidden    []uintptr
}

const consoleWindowHWND = 0xdead0001

func (f *fakeConsole) allocator() consoleAllocator {
	return consoleAllocator{
		window: func() uintptr { return f.hwnd },
		alloc: func() bool {
			f.allocated++
			if f.allocOK {
				f.hwnd = consoleWindowHWND
			}
			return f.allocOK
		},
		hide: func(hwnd uintptr) { f.hidden = append(f.hidden, hwnd) },
	}
}

func TestEnsureHiddenConsoleAllocatesThenHidesTheNewWindow(t *testing.T) {
	f := &fakeConsole{allocOK: true}

	ensureHiddenConsole(f.allocator())

	if f.allocated != 1 {
		t.Errorf("allocated = %d, want 1 — without a console of its own the daemon's children each get their own visible one", f.allocated)
	}
	if len(f.hidden) != 1 || f.hidden[0] != consoleWindowHWND {
		t.Errorf("hidden = %v, want [%#x] — the window to hide is the one the allocation just created", f.hidden, consoleWindowHWND)
	}
}

func TestEnsureHiddenConsoleLeavesAnExistingConsoleVisible(t *testing.T) {
	const foregroundHWND = 0xbeef0002
	f := &fakeConsole{hwnd: foregroundHWND, allocOK: true}

	ensureHiddenConsole(f.allocator())

	if f.allocated != 0 {
		t.Errorf("allocated = %d, want 0 — a process that already has a console must not be given a second one", f.allocated)
	}
	if len(f.hidden) != 0 {
		t.Errorf("hidden = %v, want none — hiding this window would blank the terminal the user is running the daemon in", f.hidden)
	}
}

func TestEnsureHiddenConsoleDoesNothingWhenAllocationFails(t *testing.T) {
	f := &fakeConsole{allocOK: false}

	ensureHiddenConsole(f.allocator())

	if len(f.hidden) != 0 {
		t.Errorf("hidden = %v, want none — there is no window to hide when no console was allocated", f.hidden)
	}
}
