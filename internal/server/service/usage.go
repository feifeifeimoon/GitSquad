package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

// Usage query errors are sentinel values so the handler can answer 400 without
// matching on strings.
var (
	ErrUnknownRange   = errors.New("unknown usage range")
	ErrUnknownGroupBy = errors.New("unknown usage breakdown")
	ErrUnknownBucket  = errors.New("unknown usage bucket")
	ErrUnknownTimez   = errors.New("unknown timezone")
)

// All usage windows are rolling rather than calendar-aligned: "the last 24
// hours" is what an operator means when asking what a machine burned today, and
// a rolling window has no month or week boundary to get subtly wrong per
// timezone. Anchored to the request time.
const (
	UsageRange24h = "24h"
	UsageRange7d  = "7d"
	UsageRange30d = "30d"
	UsageRangeAll = "all"
)

// usageRanges maps each named window to its width. all is absent because it has
// no width — it starts at epochAllStart.
var usageRanges = map[string]time.Duration{
	UsageRange24h: 24 * time.Hour,
	UsageRange7d:  7 * 24 * time.Hour,
	UsageRange30d: 30 * 24 * time.Hour,
}

// epochAllStart is the lower bound for the "all" window. A literal instant
// rather than the zero time, which sits outside Postgres' useful range.
var epochAllStart = time.Date(1970, 1, 1, 0, 0, 0, 0, time.UTC)

// Usage breakdown dimensions.
const (
	UsageGroupAgent     = "agent"
	UsageGroupDaemon    = "daemon"
	UsageGroupWorkspace = "workspace"
	UsageGroupIssue     = "issue"
	UsageGroupModel     = "model"
)

// Usage series granularities.
const (
	UsageBucketHour = "hour"
	UsageBucketDay  = "day"
)

// UsageService answers token-usage questions over the task_usage ledger.
type UsageService struct {
	store *store.Store
}

func NewUsageService(s *store.Store) *UsageService { return &UsageService{store: s} }

// UsageQuery is a validated request for usage data.
type UsageQuery struct {
	WorkspaceID *uuid.UUID
	From        time.Time
	To          time.Time
	TZ          string
	Range       string
}

// ResolveUsageQuery validates the client's window and timezone. range is
// required; tz defaults to UTC. An unknown range or timezone is a client bug
// and reported as such rather than silently corrected, because a quietly
// substituted window would produce a chart that looks right and is not.
func ResolveUsageQuery(rangeKey, tz string, workspaceID *uuid.UUID, now time.Time) (UsageQuery, error) {
	rangeKey = strings.TrimSpace(rangeKey)
	if rangeKey == "" {
		rangeKey = UsageRange7d
	}

	var from time.Time
	switch rangeKey {
	case UsageRangeAll:
		from = epochAllStart
	case UsageRange24h, UsageRange7d, UsageRange30d:
		from = now.Add(-usageRanges[rangeKey])
	default:
		return UsageQuery{}, fmt.Errorf("%w: %q", ErrUnknownRange, rangeKey)
	}

	tz = strings.TrimSpace(tz)
	if tz == "" {
		tz = "UTC"
	}
	// LoadLocation rejects anything not in the zoneinfo database, which is also
	// our guarantee that the tz string is safe to interpolate into SQL.
	if _, err := time.LoadLocation(tz); err != nil {
		return UsageQuery{}, fmt.Errorf("%w: %q", ErrUnknownTimez, tz)
	}

	return UsageQuery{
		WorkspaceID: workspaceID,
		From:        from,
		To:          now,
		TZ:          tz,
		Range:       rangeKey,
	}, nil
}

func (q UsageQuery) window() v1.UsageWindow {
	return v1.UsageWindow{Range: q.Range, From: q.From, To: q.To, Timezone: q.TZ}
}

// DefaultBucketForRange picks the granularity a window reads best at: hours for
// a day, days for anything longer. A 24h window at day granularity would draw
// two bars and hide the shape entirely.
func DefaultBucketForRange(rangeKey string) string {
	if rangeKey == UsageRange24h {
		return UsageBucketHour
	}
	return UsageBucketDay
}

// ValidateUsageBucket checks a client-supplied granularity.
func ValidateUsageBucket(bucket string) (string, error) {
	switch strings.TrimSpace(bucket) {
	case "":
		return "", nil
	case UsageBucketHour, UsageBucketDay:
		return bucket, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrUnknownBucket, bucket)
	}
}

func (s *UsageService) Summary(ctx context.Context, userID uuid.UUID, q UsageQuery) (*v1.UsageSummaryResponse, error) {
	row, err := s.store.SummarizeUsage(ctx, db.SummarizeUsageParams{
		UserID:      userID,
		FromAt:      q.From,
		ToAt:        q.To,
		WorkspaceID: q.WorkspaceID,
	})
	if err != nil {
		return nil, fmt.Errorf("summarize usage: %w", err)
	}
	return &v1.UsageSummaryResponse{
		Window: q.window(),
		Summary: v1.UsageSummary{
			TokenBuckets: v1.TokenBuckets{
				InputTokens:      row.InputTokens,
				OutputTokens:     row.OutputTokens,
				CacheReadTokens:  row.CacheReadTokens,
				CacheWriteTokens: row.CacheWriteTokens,
			},
			RunsWithUsage: int(row.RunsWithUsage),
			RunsTotal:     int(row.RunsTotal),
		},
	}, nil
}

func (s *UsageService) Series(ctx context.Context, userID uuid.UUID, q UsageQuery, bucket string) (*v1.UsageSeriesResponse, error) {
	rows, err := s.store.ListUsageSeries(ctx, db.ListUsageSeriesParams{
		UserID:      userID,
		FromAt:      q.From,
		ToAt:        q.To,
		WorkspaceID: q.WorkspaceID,
		Bucket:      bucket,
		Tz:          q.TZ,
	})
	if err != nil {
		return nil, fmt.Errorf("list usage series: %w", err)
	}
	points := make([]v1.UsagePoint, 0, len(rows))
	for _, r := range rows {
		points = append(points, v1.UsagePoint{
			Bucket: r.Bucket,
			TokenBuckets: v1.TokenBuckets{
				InputTokens:      r.InputTokens,
				OutputTokens:     r.OutputTokens,
				CacheReadTokens:  r.CacheReadTokens,
				CacheWriteTokens: r.CacheWriteTokens,
			},
			RunCount: int(r.RunCount),
		})
	}
	return &v1.UsageSeriesResponse{Window: q.window(), Bucket: bucket, Points: points}, nil
}

// Breakdown dispatches to the query for one dimension. Each dimension has its
// own query rather than one query switching on a parameter: they group and
// label different joins, and keeping them apart means each one stays readable
// and independently optimisable.
func (s *UsageService) Breakdown(ctx context.Context, userID uuid.UUID, q UsageQuery, groupBy string) (*v1.UsageBreakdownResponse, error) {
	filter := usageFilter{UserID: userID, FromAt: q.From, ToAt: q.To, WorkspaceID: q.WorkspaceID}

	var rows []v1.UsageBreakdownRow
	switch groupBy {
	case UsageGroupAgent:
		got, err := s.store.ListUsageByAgent(ctx, filter.agent())
		if err != nil {
			return nil, fmt.Errorf("list usage by agent: %w", err)
		}
		for _, r := range got {
			rows = append(rows, v1.UsageBreakdownRow{
				Key:          r.AgentID.String(),
				Label:        r.AgentName,
				AvatarURL:    r.AgentAvatarUrl,
				TokenBuckets: buckets(r.InputTokens, r.OutputTokens, r.CacheReadTokens, r.CacheWriteTokens),
				RunCount:     int(r.RunCount),
			})
		}

	case UsageGroupDaemon:
		got, err := s.store.ListUsageByDaemon(ctx, filter.daemon())
		if err != nil {
			return nil, fmt.Errorf("list usage by daemon: %w", err)
		}
		for _, r := range got {
			// A run whose daemon was never assigned (or has since been removed)
			// still gets a row, so the rows keep summing to the total.
			key := "unassigned"
			if r.DaemonID != nil {
				key = r.DaemonID.String()
			}
			rows = append(rows, v1.UsageBreakdownRow{
				Key:          key,
				Label:        r.DaemonName,
				TokenBuckets: buckets(r.InputTokens, r.OutputTokens, r.CacheReadTokens, r.CacheWriteTokens),
				RunCount:     int(r.RunCount),
			})
		}

	case UsageGroupWorkspace:
		got, err := s.store.ListUsageByWorkspace(ctx, filter.workspace())
		if err != nil {
			return nil, fmt.Errorf("list usage by workspace: %w", err)
		}
		for _, r := range got {
			rows = append(rows, v1.UsageBreakdownRow{
				Key:           r.WorkspaceID.String(),
				Label:         r.WorkspaceName,
				WorkspaceSlug: r.WorkspaceSlug,
				TokenBuckets:  buckets(r.InputTokens, r.OutputTokens, r.CacheReadTokens, r.CacheWriteTokens),
				RunCount:      int(r.RunCount),
			})
		}

	case UsageGroupIssue:
		got, err := s.store.ListUsageByIssue(ctx, filter.issue())
		if err != nil {
			return nil, fmt.Errorf("list usage by issue: %w", err)
		}
		for _, r := range got {
			rows = append(rows, v1.UsageBreakdownRow{
				Key:           r.IssueID.String(),
				Label:         fmt.Sprintf("%s-%d: %s", r.IssuePrefix, r.IssueNumber, r.IssueTitle),
				WorkspaceSlug: r.WorkspaceSlug,
				TokenBuckets:  buckets(r.InputTokens, r.OutputTokens, r.CacheReadTokens, r.CacheWriteTokens),
				RunCount:      int(r.RunCount),
			})
		}

	case UsageGroupModel:
		got, err := s.store.ListUsageByModel(ctx, filter.model())
		if err != nil {
			return nil, fmt.Errorf("list usage by model: %w", err)
		}
		for _, r := range got {
			// Keyed by both halves because the same model id served by two
			// providers is two rows; labelling with the model alone would look
			// like a duplicate.
			rows = append(rows, v1.UsageBreakdownRow{
				Key:          r.Provider + "/" + r.Model,
				Label:        r.Model,
				TokenBuckets: buckets(r.InputTokens, r.OutputTokens, r.CacheReadTokens, r.CacheWriteTokens),
				RunCount:     int(r.RunCount),
			})
		}

	default:
		return nil, fmt.Errorf("%w: %q", ErrUnknownGroupBy, groupBy)
	}

	if rows == nil {
		rows = []v1.UsageBreakdownRow{}
	}
	return &v1.UsageBreakdownResponse{Window: q.window(), GroupBy: groupBy, Rows: rows}, nil
}

// usageFilter carries the window every usage query shares. sqlc gives each
// query its own params struct, so these one-line converters are what keeps the
// two shapes from drifting apart at the call sites.
type usageFilter struct {
	UserID      uuid.UUID
	FromAt      time.Time
	ToAt        time.Time
	WorkspaceID *uuid.UUID
}

func (f usageFilter) agent() db.ListUsageByAgentParams {
	return db.ListUsageByAgentParams{UserID: f.UserID, FromAt: f.FromAt, ToAt: f.ToAt, WorkspaceID: f.WorkspaceID}
}

func (f usageFilter) daemon() db.ListUsageByDaemonParams {
	return db.ListUsageByDaemonParams{UserID: f.UserID, FromAt: f.FromAt, ToAt: f.ToAt, WorkspaceID: f.WorkspaceID}
}

func (f usageFilter) issue() db.ListUsageByIssueParams {
	return db.ListUsageByIssueParams{UserID: f.UserID, FromAt: f.FromAt, ToAt: f.ToAt, WorkspaceID: f.WorkspaceID}
}

func (f usageFilter) model() db.ListUsageByModelParams {
	return db.ListUsageByModelParams{UserID: f.UserID, FromAt: f.FromAt, ToAt: f.ToAt, WorkspaceID: f.WorkspaceID}
}

// The by-workspace query groups on workspace_id itself, so it takes no
// workspace filter — narrowing it would leave a single row.
func (f usageFilter) workspace() db.ListUsageByWorkspaceParams {
	return db.ListUsageByWorkspaceParams{UserID: f.UserID, FromAt: f.FromAt, ToAt: f.ToAt}
}

// ValidateUsageGroupBy checks a client-supplied dimension.
func ValidateUsageGroupBy(groupBy string) (string, error) {
	switch strings.TrimSpace(groupBy) {
	case "":
		return UsageGroupAgent, nil
	case UsageGroupAgent, UsageGroupDaemon, UsageGroupWorkspace, UsageGroupIssue, UsageGroupModel:
		return groupBy, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrUnknownGroupBy, groupBy)
	}
}

// buckets is the single place the four counts are copied, so a new bucket
// cannot be added to the model and forgotten in one of the five breakdowns.
func buckets(input, output, cacheRead, cacheWrite int64) v1.TokenBuckets {
	return v1.TokenBuckets{
		InputTokens:      input,
		OutputTokens:     output,
		CacheReadTokens:  cacheRead,
		CacheWriteTokens: cacheWrite,
	}
}
