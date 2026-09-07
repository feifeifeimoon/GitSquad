package daemon

import (
	"errors"
	"os"
	"time"
)

// fakeFile is a minimal os.FileInfo used to satisfy Resolver.Stat in tests.
type fakeFile struct{ name string }

func (f fakeFile) Name() string       { return f.name }
func (f fakeFile) Size() int64        { return 0 }
func (f fakeFile) Mode() os.FileMode  { return 0 }
func (f fakeFile) ModTime() time.Time { return time.Time{} }
func (f fakeFile) IsDir() bool        { return false }
func (f fakeFile) Sys() any           { return nil }

// newTestResolver returns a resolver whose primitives all miss by default;
// individual tests override the fields they care about.
func newTestResolver() *Resolver {
	return &Resolver{
		Env:      func(string) string { return "" },
		LookPath: func(string) (string, error) { return "", errors.New("not found") },
		Stat:     func(string) (os.FileInfo, error) { return nil, errors.New("not found") },
		Shell:    nil,
	}
}
