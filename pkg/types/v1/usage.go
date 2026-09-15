package v1

import "time"

// UnknownModel is the usage key used when a provider reports tokens without
// naming the model. Shared so the daemon and the server cannot disagree on it.
const UnknownModel = "unknown"

// TokenBuckets are the four mutually exclusive token counts a run consumes.
// InputTokens excludes both cache buckets, so the four sum to the run's total
// without counting a cached token twice. No derived figures (totals, rates) are
// carried on the wire: they are one helper away on the client, and sending them
// would create a second place for the same number to be wrong.
type TokenBuckets struct {
	InputTokens      int64 `json:"input_tokens"`
	OutputTokens     int64 `json:"output_tokens"`
	CacheReadTokens  int64 `json:"cache_read_tokens"`
	CacheWriteTokens int64 `json:"cache_write_tokens"`
}

// UsageWindow echoes the boundaries the server actually aggregated over, so the
// client labels the range with the same numbers rather than recomputing them
// (and the effective timezone, which may differ from what was requested).
type UsageWindow struct {
	Range    string    `json:"range"`
	From     time.Time `json:"from"`
	To       time.Time `json:"to"`
	Timezone string    `json:"timezone"`
}

// UsageSummary is the headline figure for a window plus its coverage.
//
// RunsTotal counts runs that finished in the window; RunsWithUsage counts those
// that reported tokens. The gap is usage we never received — a daemon that died
// mid-task, a provider that does not report tokens, or a run predating the
// ledger. Those runs are not free, so a UI showing only token sums would
// understate spend without saying so.
type UsageSummary struct {
	TokenBuckets
	RunsWithUsage int `json:"runs_with_usage"`
	RunsTotal     int `json:"runs_total"`
}

// UsagePoint is one bucket of the trend series. Bucket is a calendar label
// ("2026-09-15", or "2026-09-15T14:00" at hour granularity) already cut in the
// window's timezone.
type UsagePoint struct {
	Bucket string `json:"bucket"`
	TokenBuckets
	RunCount int `json:"run_count"`
}

// UsageBreakdownRow is one row of a leaderboard: a dimension value and what it
// consumed. Key identifies the dimension value (an id, or a provider/model
// pair); Label is what to render.
type UsageBreakdownRow struct {
	Key           string `json:"key"`
	Label         string `json:"label"`
	AvatarURL     string `json:"avatar_url,omitempty"`
	WorkspaceSlug string `json:"workspace_slug,omitempty"`
	TokenBuckets
	RunCount int `json:"run_count"`
}

// UsageSummaryResponse is the answer to GET /api/v1/usage/summary.
type UsageSummaryResponse struct {
	Window  UsageWindow  `json:"window"`
	Summary UsageSummary `json:"summary"`
}

// UsageSeriesResponse is the answer to GET /api/v1/usage/series.
type UsageSeriesResponse struct {
	Window UsageWindow  `json:"window"`
	Bucket string       `json:"bucket"`
	Points []UsagePoint `json:"points"`
}

// UsageBreakdownResponse is the answer to GET /api/v1/usage/breakdown.
type UsageBreakdownResponse struct {
	Window  UsageWindow         `json:"window"`
	GroupBy string              `json:"group_by"`
	Rows    []UsageBreakdownRow `json:"rows"`
}
