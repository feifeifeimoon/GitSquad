package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/database"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

// TestUsageIntegration exercises the token-usage ledger against a real Postgres:
// ingestion through the task report, idempotent re-reporting, and every read
// path the console uses. Skipped unless GITSQUAD_TEST_DATABASE_URL is set.
func TestUsageIntegration(t *testing.T) {
	dsn := os.Getenv("GITSQUAD_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("GITSQUAD_TEST_DATABASE_URL not set; skipping integration test")
	}

	ctx := context.Background()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	// t.Cleanup, not defer: the row deletes registered below run through this
	// pool, and t.Cleanup is LIFO, so a defer here would close it first.
	t.Cleanup(pool.Close)
	if err := database.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	s := store.New(pool)
	agentSvc := NewAgentService(s)
	issueSvc := NewIssueService(s, nil)
	taskSvc := NewTaskService(s, nil)
	usageSvc := NewUsageService(s)

	user, err := s.CreateUser(ctx, db.CreateUserParams{
		Login:     fmt.Sprintf("usage-user-%s", uuid.NewString()[:8]),
		AvatarUrl: nil,
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() { cleanupUserRows(t, ctx, pool, user.ID) })

	ws := createWorkspaceForTest(ctx, t, s, user.ID, "USE", fmt.Sprintf("use-%s", uuid.NewString()[:8]))

	daemon, err := NewDaemonService(s).CreateDaemon(ctx, user.ID, "usage-machine", "darwin", "arm64", "1.0.0")
	if err != nil {
		t.Fatalf("create daemon: %v", err)
	}
	agent, err := agentSvc.CreateAgent(ctx, ws.ID, user.ID, v1.CreateAgentRequest{
		Name: "coder", DaemonID: daemon.ID.String(), Provider: "claude",
	})
	if err != nil {
		t.Fatalf("CreateAgent: %v", err)
	}
	issue, err := issueSvc.CreateIssue(ctx, ws.ID, user.ID, user.Login, IssueCreate{Title: "Fix the parser"})
	if err != nil {
		t.Fatalf("CreateIssue: %v", err)
	}

	// A finished run with two models, reported through the real report path.
	task := seedTaskForUsage(ctx, t, s, ws.ID, issue.ID, agent.ID, daemon.ID)
	report := v1.TaskReport{
		Status:  v1.TaskReportSucceeded,
		Summary: &v1.TaskSummary{Output: "done"},
		Usage: []v1.TaskUsage{
			{Provider: "claude", Model: "claude-sonnet-4-5", InputTokens: 100, OutputTokens: 200, CacheReadTokens: 300, CacheWriteTokens: 40},
			{Provider: "Claude", Model: "claude-opus-4", InputTokens: 7, OutputTokens: 8},
		},
	}
	if err := taskSvc.Report(ctx, daemon.ID, task, report); err != nil {
		t.Fatalf("Report: %v", err)
	}

	now := time.Now()
	query, err := ResolveUsageQuery(UsageRange30d, "UTC", nil, now)
	if err != nil {
		t.Fatalf("ResolveUsageQuery: %v", err)
	}

	summary, err := usageSvc.Summary(ctx, user.ID, query)
	if err != nil {
		t.Fatalf("Summary: %v", err)
	}
	got := summary.Summary
	if got.InputTokens != 107 || got.OutputTokens != 208 || got.CacheReadTokens != 300 || got.CacheWriteTokens != 40 {
		t.Errorf("summary buckets = %+v, want 107/208/300/40", got.TokenBuckets)
	}
	if got.RunsWithUsage != 1 {
		t.Errorf("runs_with_usage = %d, want 1", got.RunsWithUsage)
	}
	// The run finished, so it counts in the denominator. Coverage is what keeps
	// a token sum from being read as the whole truth.
	if got.RunsTotal != 1 {
		t.Errorf("runs_total = %d, want 1", got.RunsTotal)
	}

	// A replay is a correction, not more usage.
	if err := taskSvc.Report(ctx, daemon.ID, task, report); err != nil {
		t.Fatalf("replayed Report: %v", err)
	}
	summary, err = usageSvc.Summary(ctx, user.ID, query)
	if err != nil {
		t.Fatalf("Summary after replay: %v", err)
	}
	if summary.Summary.InputTokens != 107 {
		t.Errorf("replay changed the total: input = %d, want 107", summary.Summary.InputTokens)
	}

	// A corrected report overwrites rather than adds.
	report.Usage[0].InputTokens = 5
	if err := taskSvc.Report(ctx, daemon.ID, task, report); err != nil {
		t.Fatalf("corrected Report: %v", err)
	}
	summary, err = usageSvc.Summary(ctx, user.ID, query)
	if err != nil {
		t.Fatalf("Summary after correction: %v", err)
	}
	if summary.Summary.InputTokens != 12 {
		t.Errorf("input after correction = %d, want 12 (5 + 7)", summary.Summary.InputTokens)
	}

	// The provider is lowercased on write so mixed-case reports merge instead of
	// forming a second row.
	modelRows, err := usageSvc.Breakdown(ctx, user.ID, query, UsageGroupModel)
	if err != nil {
		t.Fatalf("Breakdown(model): %v", err)
	}
	if len(modelRows.Rows) != 2 {
		t.Fatalf("model rows = %d, want 2: %+v", len(modelRows.Rows), modelRows.Rows)
	}
	for _, row := range modelRows.Rows {
		if row.Key != "claude/claude-opus-4" && row.Key != "claude/claude-sonnet-4-5" {
			t.Errorf("model key = %q, want a lowercased provider prefix", row.Key)
		}
	}

	// Every other dimension resolves and attributes to this run.
	for _, tc := range []struct {
		groupBy string
		label   string
	}{
		{UsageGroupAgent, "coder"},
		{UsageGroupDaemon, "usage-machine"},
		{UsageGroupWorkspace, ws.Name},
	} {
		res, err := usageSvc.Breakdown(ctx, user.ID, query, tc.groupBy)
		if err != nil {
			t.Fatalf("Breakdown(%s): %v", tc.groupBy, err)
		}
		if len(res.Rows) != 1 {
			t.Fatalf("%s rows = %d, want 1: %+v", tc.groupBy, len(res.Rows), res.Rows)
		}
		if res.Rows[0].Label != tc.label {
			t.Errorf("%s label = %q, want %q", tc.groupBy, res.Rows[0].Label, tc.label)
		}
		if res.Rows[0].RunCount != 1 {
			t.Errorf("%s run_count = %d, want 1", tc.groupBy, res.Rows[0].RunCount)
		}
	}

	// The issue row's label is composed from the workspace prefix and number.
	issueRows, err := usageSvc.Breakdown(ctx, user.ID, query, UsageGroupIssue)
	if err != nil {
		t.Fatalf("Breakdown(issue): %v", err)
	}
	if len(issueRows.Rows) != 1 {
		t.Fatalf("issue rows = %d, want 1", len(issueRows.Rows))
	}
	if want := fmt.Sprintf("USE-%d: Fix the parser", issue.Number); issueRows.Rows[0].Label != want {
		t.Errorf("issue label = %q, want %q", issueRows.Rows[0].Label, want)
	}
	if issueRows.Rows[0].WorkspaceSlug != ws.Slug {
		t.Errorf("issue workspace slug = %q, want %q", issueRows.Rows[0].WorkspaceSlug, ws.Slug)
	}

	// The rows must add up to the summary shown next to them.
	var rowInput int64
	for _, row := range modelRows.Rows {
		rowInput += row.InputTokens
	}
	if rowInput != summary.Summary.InputTokens {
		t.Errorf("breakdown input %d != summary input %d", rowInput, summary.Summary.InputTokens)
	}

	// The series buckets by what the caller asked for.
	series, err := usageSvc.Series(ctx, user.ID, query, UsageBucketDay)
	if err != nil {
		t.Fatalf("Series(day): %v", err)
	}
	if len(series.Points) != 1 {
		t.Fatalf("day points = %d, want 1: %+v", len(series.Points), series.Points)
	}
	if want := now.UTC().Format("2006-01-02"); series.Points[0].Bucket != want {
		t.Errorf("bucket = %q, want %q", series.Points[0].Bucket, want)
	}
	hourly, err := usageSvc.Series(ctx, user.ID, query, UsageBucketHour)
	if err != nil {
		t.Fatalf("Series(hour): %v", err)
	}
	if len(hourly.Points) != 1 || len(hourly.Points[0].Bucket) != 16 {
		t.Errorf("hour points = %+v, want one 16-character label", hourly.Points)
	}
	// Six-hour bins land on the local 00/06/12/18 grid and, like the hourly
	// series, hand back a full timestamp label.
	sixHourly, err := usageSvc.Series(ctx, user.ID, query, UsageBucketSixHour)
	if err != nil {
		t.Fatalf("Series(6h): %v", err)
	}
	if len(sixHourly.Points) != 1 || len(sixHourly.Points[0].Bucket) != 16 {
		t.Fatalf("6h points = %+v, want one 16-character label", sixHourly.Points)
	}
	switch hour := sixHourly.Points[0].Bucket[11:13]; hour {
	case "00", "06", "12", "18":
	default:
		t.Errorf("6h bucket hour = %q, want one of 00/06/12/18", hour)
	}

	// A timezone that shifts the run across a day boundary re-buckets it.
	auckland, err := ResolveUsageQuery(UsageRange30d, "Pacific/Auckland", nil, now)
	if err != nil {
		t.Fatalf("ResolveUsageQuery(Auckland): %v", err)
	}
	nzSeries, err := usageSvc.Series(ctx, user.ID, auckland, UsageBucketDay)
	if err != nil {
		t.Fatalf("Series(Auckland): %v", err)
	}
	loc, _ := time.LoadLocation("Pacific/Auckland")
	if want := now.In(loc).Format("2006-01-02"); len(nzSeries.Points) > 0 && nzSeries.Points[0].Bucket != want {
		t.Errorf("Auckland bucket = %q, want %q", nzSeries.Points[0].Bucket, want)
	}

	// A run with a daemon that is gone still gets a row, so the breakdown keeps
	// summing to the total.
	if _, err := pool.Exec(ctx, "UPDATE tasks SET assigned_daemon_id = NULL WHERE id = $1", task); err != nil {
		t.Fatalf("clear daemon: %v", err)
	}
	daemonRows, err := usageSvc.Breakdown(ctx, user.ID, query, UsageGroupDaemon)
	if err != nil {
		t.Fatalf("Breakdown(daemon) after unassign: %v", err)
	}
	if len(daemonRows.Rows) != 1 || daemonRows.Rows[0].Key != "unassigned" || daemonRows.Rows[0].Label != "unassigned" {
		t.Errorf("unassigned daemon rows = %+v, want one 'unassigned' row (usage must not vanish)", daemonRows.Rows)
	}
	// And no other user can see any of it.
	otherSummary, err := usageSvc.Summary(ctx, uuid.New(), query)
	if err != nil {
		t.Fatalf("Summary for a stranger: %v", err)
	}
	if otherSummary.Summary.InputTokens != 0 || otherSummary.Summary.RunsTotal != 0 {
		t.Errorf("usage leaked across users: %+v", otherSummary.Summary)
	}

	// An unassigned run must not be counted as reported coverage either.
	if err := taskSvc.Report(ctx, daemon.ID, task, report); err == nil {
		t.Error("Report for a task no longer assigned to the daemon = nil, want error")
	}

	// A failed run counts as a run even though it reports no tokens: the
	// outcome counters, the trend and the recent-runs list are all driven by
	// tasks, not by the ledger — otherwise the runs that told us nothing would
	// vanish from the page that exists to admit they told us nothing.
	failedTask := seedTaskForUsage(ctx, t, s, ws.ID, issue.ID, agent.ID, daemon.ID)
	if err := taskSvc.Report(ctx, daemon.ID, failedTask, v1.TaskReport{
		Status:  v1.TaskReportFailed,
		Summary: &v1.TaskSummary{Output: "gave up"},
	}); err != nil {
		t.Fatalf("failed Report: %v", err)
	}
	// The window was anchored before the failure was reported, and the windows
	// are half-open, so re-anchor to include the run that just finished.
	query, err = ResolveUsageQuery(UsageRange30d, "UTC", nil, time.Now())
	if err != nil {
		t.Fatalf("ResolveUsageQuery after failure: %v", err)
	}
	summary, err = usageSvc.Summary(ctx, user.ID, query)
	if err != nil {
		t.Fatalf("Summary after failure: %v", err)
	}
	if got := summary.Summary; got.RunsTotal != 2 || got.RunsCompleted != 1 || got.RunsFailed != 1 || got.RunsCancelled != 0 {
		t.Errorf("outcomes = total %d completed %d failed %d cancelled %d, want 2/1/1/0",
			got.RunsTotal, got.RunsCompleted, got.RunsFailed, got.RunsCancelled)
	}
	if got := summary.Summary.RunsWithUsage; got != 1 {
		t.Errorf("runs_with_usage = %d, want 1 (the failed run reported no tokens)", got)
	}
	// A finite window has a predecessor to compare against, and it is this
	// user's — not somebody else's.
	if summary.Previous == nil {
		t.Fatal("previous window missing for 30d")
	} else if p := summary.Previous; p.RunsTotal != 0 || p.InputTokens != 0 {
		t.Errorf("previous window = %+v, want an empty one", p)
	}

	// The series counts runs, not ledger rows, and carries the split the Runs
	// view stacks.
	series, err = usageSvc.Series(ctx, user.ID, query, UsageBucketDay)
	if err != nil {
		t.Fatalf("Series after failure: %v", err)
	}
	if len(series.Points) != 1 {
		t.Fatalf("day points after failure = %d, want 1: %+v", len(series.Points), series.Points)
	}
	if pt := series.Points[0]; pt.RunCount != 2 || pt.CompletedRuns != 1 || pt.FailedRuns != 1 || pt.CancelledRuns != 0 {
		t.Errorf("series point = runs %d completed %d failed %d cancelled %d, want 2/1/1/0",
			pt.RunCount, pt.CompletedRuns, pt.FailedRuns, pt.CancelledRuns)
	}

	// The recent-runs list names the agent, the issue and the outcome, and
	// keeps the run that reported nothing.
	runList, err := usageSvc.Runs(ctx, user.ID, query, 0)
	if err != nil {
		t.Fatalf("Runs: %v", err)
	}
	if len(runList.Runs) != 2 {
		t.Fatalf("runs = %d, want 2: %+v", len(runList.Runs), runList.Runs)
	}
	byStatus := make(map[string]v1.UsageRun, len(runList.Runs))
	for _, r := range runList.Runs {
		byStatus[r.Status] = r
	}
	failedRun, ok := byStatus["failed"]
	if !ok {
		t.Fatalf("no failed run in %+v", runList.Runs)
	}
	if failedRun.AgentName != "coder" || failedRun.Kind != "issue" || failedRun.WorkspaceSlug != ws.Slug {
		t.Errorf("failed run = %+v, want agent coder on workspace %q", failedRun, ws.Slug)
	}
	if want := fmt.Sprintf("USE-%d", issue.Number); failedRun.IssueKey != want {
		t.Errorf("failed run issue key = %q, want %q", failedRun.IssueKey, want)
	}
	if failedRun.IssueTitle != "Fix the parser" {
		t.Errorf("failed run issue title = %q, want %q", failedRun.IssueTitle, "Fix the parser")
	}
	completedRun, ok := byStatus["completed"]
	if !ok {
		t.Fatalf("no completed run in %+v", runList.Runs)
	}
	if completedRun.InputTokens != 12 || completedRun.CacheReadTokens != 300 {
		t.Errorf("completed run tokens = %+v, want the corrected 12 input and 300 cache read", completedRun.TokenBuckets)
	}
	// started_at is only set when the daemon reported a start, so it may be
	// absent; completed_at is the window's own boundary and never is.
	if completedRun.CompletedAt == nil {
		t.Errorf("completed run is missing its completion time: %+v", completedRun)
	}

	testUsageQueryValidation(t, now)
}

// seedTaskForUsage inserts a queued task and claims it, the same way the daemon
// path does, so the report has a task it is actually assigned.
func seedTaskForUsage(ctx context.Context, t *testing.T, s *store.Store, wsID, issueID, agentID, daemonID uuid.UUID) uuid.UUID {
	t.Helper()
	task, err := s.CreateTask(ctx, db.CreateTaskParams{
		WorkspaceID:      wsID,
		Kind:             "issue",
		IssueID:          &issueID,
		AgentID:          agentID,
		AssignedDaemonID: &daemonID,
		Provider:         "claude",
		Context:          []byte(`{}`),
	})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	claimed, err := s.ClaimNextTask(ctx, &daemonID)
	if err != nil {
		t.Fatalf("ClaimNextTask: %v", err)
	}
	if claimed.ID != task.ID {
		t.Fatalf("claimed task %s, want %s", claimed.ID, task.ID)
	}
	return task.ID
}

// testUsageQueryValidation covers the window and dimension validators: a bad
// range, timezone, bucket or dimension is a client bug that must be reported,
// not silently replaced with a default that would draw a plausible wrong chart.
func testUsageQueryValidation(t *testing.T, now time.Time) {
	t.Helper()

	if _, err := ResolveUsageQuery("fortnight", "UTC", nil, now); !errors.Is(err, ErrUnknownRange) {
		t.Errorf("unknown range err = %v, want ErrUnknownRange", err)
	}
	if _, err := ResolveUsageQuery(UsageRange7d, "Mars/Olympus", nil, now); !errors.Is(err, ErrUnknownTimez) {
		t.Errorf("unknown tz err = %v, want ErrUnknownTimez", err)
	}

	// Defaults: no range means a week, no timezone means UTC.
	q, err := ResolveUsageQuery("", "", nil, now)
	if err != nil {
		t.Fatalf("ResolveUsageQuery with defaults: %v", err)
	}
	if q.Range != UsageRange7d || q.TZ != "UTC" {
		t.Errorf("defaults = %+v, want 7d/UTC", q)
	}
	if want := now.Add(-7 * 24 * time.Hour); !q.From.Equal(want) {
		t.Errorf("7d from = %v, want %v", q.From, want)
	}

	// all has no width and starts at the epoch sentinel.
	all, err := ResolveUsageQuery(UsageRangeAll, "UTC", nil, now)
	if err != nil {
		t.Fatalf("ResolveUsageQuery(all): %v", err)
	}
	if !all.From.Equal(epochAllStart) {
		t.Errorf("all from = %v, want %v", all.From, epochAllStart)
	}

	// 24h reads best at hour granularity, a week at six-hour bins, and the
	// longer windows at day. The rule is two to three dozen columns: fewer and
	// each bar is a slab, more and the axis labels collide.
	if got := DefaultBucketForRange(UsageRange24h); got != UsageBucketHour {
		t.Errorf("24h bucket = %q, want hour", got)
	}
	if got := DefaultBucketForRange(UsageRange7d); got != UsageBucketSixHour {
		t.Errorf("7d bucket = %q, want 6h", got)
	}
	for _, r := range []string{UsageRange30d, UsageRangeAll} {
		if got := DefaultBucketForRange(r); got != UsageBucketDay {
			t.Errorf("%s bucket = %q, want day", r, got)
		}
	}

	if _, err := ValidateUsageBucket("minute"); !errors.Is(err, ErrUnknownBucket) {
		t.Errorf("unknown bucket err = %v, want ErrUnknownBucket", err)
	}
	if got, err := ValidateUsageBucket(UsageBucketSixHour); err != nil || got != UsageBucketSixHour {
		t.Errorf("ValidateUsageBucket(6h) = %q, %v; want 6h, nil", got, err)
	}
	if got, err := ValidateUsageBucket(""); err != nil || got != "" {
		t.Errorf("empty bucket = (%q, %v), want ('', nil) so the caller picks a default", got, err)
	}

	if got, err := ValidateUsageGroupBy(""); err != nil || got != UsageGroupAgent {
		t.Errorf("empty group_by = (%q, %v), want the agent default", got, err)
	}
	if _, err := ValidateUsageGroupBy("provider"); !errors.Is(err, ErrUnknownGroupBy) {
		t.Errorf("unknown group_by err = %v, want ErrUnknownGroupBy", err)
	}
}
