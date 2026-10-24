package service

import (
	"testing"
	"time"
)

// The comparison window is the equally wide stretch immediately before the one
// on screen — that is what "vs previous period" means, and what the KPI cards'
// deltas divide by. All-time has nothing before the epoch, so it must not claim
// a predecessor rather than inventing one from the zero time.
func TestUsageQueryPreviousWindow(t *testing.T) {
	now := time.Date(2026, 10, 23, 12, 0, 0, 0, time.UTC)

	q, err := ResolveUsageQuery(UsageRange7d, "UTC", nil, now)
	if err != nil {
		t.Fatalf("ResolveUsageQuery: %v", err)
	}
	from, to, ok := q.previous()
	if !ok {
		t.Fatal("7d has no previous window")
	}
	if !to.Equal(q.From) {
		t.Errorf("previous ends at %v, want the current window's start %v", to, q.From)
	}
	if width := to.Sub(from); width != 7*24*time.Hour {
		t.Errorf("previous width = %v, want 168h", width)
	}
	if want := now.Add(-14 * 24 * time.Hour); !from.Equal(want) {
		t.Errorf("previous starts at %v, want %v", from, want)
	}

	all, err := ResolveUsageQuery(UsageRangeAll, "UTC", nil, now)
	if err != nil {
		t.Fatalf("ResolveUsageQuery(all): %v", err)
	}
	if _, _, ok := all.previous(); ok {
		t.Error("all-time reported a previous window")
	}
}

// A run limit is a glance, not an archive: the service clamps a caller's value
// on both ends so neither "0" nor an unbounded number can reach SQL.
func TestUsageRunLimitClamp(t *testing.T) {
	cases := []struct {
		in, want int
	}{
		{0, UsageRunLimitDefault},
		{-5, UsageRunLimitDefault},
		{5, 5},
		{UsageRunLimitMax + 1, UsageRunLimitMax},
	}
	for _, tc := range cases {
		if got := clampRunLimit(tc.in); got != tc.want {
			t.Errorf("clampRunLimit(%d) = %d, want %d", tc.in, got, tc.want)
		}
	}
}
