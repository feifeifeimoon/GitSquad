//go:build !windows

package daemon

// EnsureHiddenConsole is a no-op outside Windows: only Windows hands a
// console-subsystem child a brand new console window when its parent has none.
func EnsureHiddenConsole() {}
