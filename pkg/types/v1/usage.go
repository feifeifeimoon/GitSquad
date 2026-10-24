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
//
// Completed, failed and cancelled partition RunsTotal: the three are the run's
// outcome, and a success rate derived from two of them has a denominator that
// reconciles with the total on the card beside it.
type UsageSummary struct {
	TokenBuckets
	RunsWithUsage int `json:"runs_with_usage"`
	RunsTotal     int `json:"runs_total"`
	RunsCompleted int `json:"runs_completed"`
	RunsFailed    int `json:"runs_failed"`
	RunsCancelled int `json:"runs_cancelled"`
}

// UsagePoint is one bucket of the trend series. Bucket is a calendar label
// ("2026-09-15", or "2026-09-15T14:00" at hour granularity) already cut in the
// window's timezone.
//
// RunCount and the outcome counts describe every run that finished in the
// bucket, including ones that reported no tokens — a run is a run whether or
// not the provider told us what it cost.
type UsagePoint struct {
	Bucket string `json:"bucket"`
	TokenBuckets
	RunCount      int `json:"run_count"`
	CompletedRuns int `json:"completed_runs"`
	FailedRuns    int `json:"failed_runs"`
	CancelledRuns int `json:"cancelled_runs"`
}

// UsageRun is one finished run in the window: who ran, what it worked on, how
// it ended, and what it reported. It is the recent-runs list's row.
//
// Kind is "issue" for a coding run and "review" for a pull-request review, so
// a review names its PR instead of an issue. Tokens are always present as
// numbers and are all zero for a run that reported none — a distinction the
// coverage note on the summary explains.
type UsageRun struct {
	ID            string     `json:"id"`
	Kind          string     `json:"kind"`
	Status        string     `json:"status"`
	AgentID       string     `json:"agent_id"`
	AgentName     string     `json:"agent_name"`
	AvatarURL     string     `json:"avatar_url,omitempty"`
	WorkspaceSlug string     `json:"workspace_slug,omitempty"`
	IssueKey      string     `json:"issue_key,omitempty"`
	IssueTitle    string     `json:"issue_title,omitempty"`
	PRNumber      int        `json:"pr_number,omitempty"`
	StartedAt     *time.Time `json:"started_at,omitempty"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
	TokenBuckets
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
//
// Previous is the equally wide window immediately before this one, when there
// is one (all-time has no predecessor). It is a whole summary rather than a
// per-figure delta so the client can compare anything on the page — spend
// percent, success-rate points — without the server deciding which deltas are
// worth showing.
type UsageSummaryResponse struct {
	Window   UsageWindow   `json:"window"`
	Summary  UsageSummary  `json:"summary"`
	Previous *UsageSummary `json:"previous,omitempty"`
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

// UsageRunsResponse is the answer to GET /api/v1/usage/runs: the window's
// finished runs, newest first.
type UsageRunsResponse struct {
	Window UsageWindow `json:"window"`
	Runs   []UsageRun  `json:"runs"`
}
