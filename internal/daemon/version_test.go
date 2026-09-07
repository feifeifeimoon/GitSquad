package daemon

import "testing"

func TestParseSemver(t *testing.T) {
	cases := []struct {
		in      string
		major   int
		minor   int
		patch   int
		wantErr bool
	}{
		{"2.1.5", 2, 1, 5, false},
		{"v2.0.0", 2, 0, 0, false},
		{"2.1.5 (Claude Code)", 2, 1, 5, false},
		{"codex-cli 0.118.0", 0, 118, 0, false},
		{"garbage", 0, 0, 0, true},
		{"", 0, 0, 0, true},
	}
	for _, c := range cases {
		got, err := parseSemver(c.in)
		if c.wantErr {
			if err == nil {
				t.Errorf("parseSemver(%q) = %+v, want error", c.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseSemver(%q) error = %v", c.in, err)
			continue
		}
		if got.Major != c.major || got.Minor != c.minor || got.Patch != c.patch {
			t.Errorf("parseSemver(%q) = %+v, want %d.%d.%d", c.in, got, c.major, c.minor, c.patch)
		}
	}
}

func TestSemverLessThan(t *testing.T) {
	a := semver{2, 0, 0}
	if !a.lessThan(semver{2, 1, 0}) {
		t.Error("2.0.0 should be < 2.1.0")
	}
	if !a.lessThan(semver{3, 0, 0}) {
		t.Error("2.0.0 should be < 3.0.0")
	}
	if a.lessThan(semver{2, 0, 0}) {
		t.Error("2.0.0 should not be < 2.0.0")
	}
}

func TestExtractVersionLine(t *testing.T) {
	// Windows npm shim noise before the real version must be discarded.
	got := extractVersionLine("Active code page: 65001\n2.1.5 (Claude Code)")
	if got != "2.1.5 (Claude Code)" {
		t.Fatalf("extractVersionLine = %q, want the version line", got)
	}

	// No semver token → fall back to trimmed raw output.
	if got := extractVersionLine("  claude version unknown  "); got != "claude version unknown" {
		t.Fatalf("extractVersionLine fallback = %q", got)
	}
}

func TestCheckMinVersion(t *testing.T) {
	if err := CheckMinVersion("2.0.0", "2.1.5"); err != nil {
		t.Errorf("CheckMinVersion(2.0.0, 2.1.5) = %v, want nil", err)
	}
	if err := CheckMinVersion("2.0.0", "2.0.0"); err != nil {
		t.Errorf("CheckMinVersion(2.0.0, 2.0.0) = %v, want nil", err)
	}
	if err := CheckMinVersion("2.0.0", "1.9.0"); err == nil {
		t.Error("CheckMinVersion(2.0.0, 1.9.0) = nil, want error")
	}
	if err := CheckMinVersion("not-a-version", "2.0.0"); err == nil {
		t.Error("CheckMinVersion with bad minimum = nil, want error")
	}
}
