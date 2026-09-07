package daemon

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// semver holds a parsed semantic version (major.minor.patch).
type semver struct {
	Major, Minor, Patch int
}

// versionRe matches version strings like "2.1.5", "v2.0.0", or
// "2.1.5 (Claude Code)" — it extracts the first three numeric components.
var versionRe = regexp.MustCompile(`v?(\d+)\.(\d+)\.(\d+)`)

// parseSemver extracts a semver from a version string.
func parseSemver(raw string) (semver, error) {
	m := versionRe.FindStringSubmatch(raw)
	if m == nil {
		return semver{}, fmt.Errorf("cannot parse version %q", raw)
	}
	major, _ := strconv.Atoi(m[1])
	minor, _ := strconv.Atoi(m[2])
	patch, _ := strconv.Atoi(m[3])
	return semver{Major: major, Minor: minor, Patch: patch}, nil
}

// lessThan returns true if v < other.
func (v semver) lessThan(other semver) bool {
	if v.Major != other.Major {
		return v.Major < other.Major
	}
	if v.Minor != other.Minor {
		return v.Minor < other.Minor
	}
	return v.Patch < other.Patch
}

// extractVersionLine pulls the version line out of a `<cli> <version-args>`
// capture, discarding leading shell noise. On Windows, npm-installed CLI shims
// emit `chcp` output like `Active code page: 65001` before the real version;
// the raw concatenation must not be persisted as the runtime version.
//
// The heuristic returns the first non-empty line containing a semver-shaped
// token. If no line carries one, it falls back to the trimmed raw output so
// unusual version formats aren't silently dropped to empty.
func extractVersionLine(raw string) string {
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if versionRe.MatchString(line) {
			return line
		}
	}
	return strings.TrimSpace(raw)
}

// CheckMinVersion returns nil when detected parses as ≥ minimum, otherwise a
// descriptive error. minimum is itself validated so a bad constant fails loud
// rather than silently skipping the gate.
func CheckMinVersion(minimum, detected string) error {
	min, err := parseSemver(minimum)
	if err != nil {
		return fmt.Errorf("invalid minimum version %q: %w", minimum, err)
	}
	v, err := parseSemver(detected)
	if err != nil {
		return fmt.Errorf("cannot parse detected version %q: %w", detected, err)
	}
	if v.lessThan(min) {
		return fmt.Errorf("%s is below minimum %s", detected, minimum)
	}
	return nil
}
