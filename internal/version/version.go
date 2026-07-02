package version

import (
	"fmt"
	"runtime"
)

// Set via ldflags at build time.
var (
	BuildVersion = "dev"
	BuildCommit  = "unknown"
	BuildDate    = "unknown"
)

func String() string {
	return fmt.Sprintf("%s (commit: %s, built: %s)\ngo: %s, os/arch: %s/%s",
		BuildVersion, BuildCommit, BuildDate, runtime.Version(), runtime.GOOS, runtime.GOARCH)
}

func Short() string {
	return BuildVersion
}
