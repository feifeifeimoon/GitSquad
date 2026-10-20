package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/feifeifeimoon/GitSquad/internal/util"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ReviewService owns the repo-level review automation: it decides which PR
// events deserve a review, writes the in-flight ledger row, and queues the
// review task on the workspace's reviewer agent. The task lifecycle writes the
// result back (see the review branch of TaskService.Report).
type ReviewService struct {
	store     *store.Store
	tasks     *TaskService
	github    *GitHubAppService
	publisher EventPublisher
	appName   string
}

func NewReviewService(s *store.Store, tasks *TaskService, appName string) *ReviewService {
	if appName == "" {
		appName = "gitsquad"
	}
	return &ReviewService{store: s, tasks: tasks, appName: appName}
}

// SetGitHub wires the review writer in; nil makes every completion fail
// visibly instead of silently losing the review.
func (s *ReviewService) SetGitHub(g *GitHubAppService) { s.github = g }

// SetPublisher wires the console's realtime feed; nil is fine.
func (s *ReviewService) SetPublisher(p EventPublisher) { s.publisher = p }

const (
	reviewMaxFiles = 100
	reviewMaxLines = 5000
)

var (
	ErrReviewInProgress   = errors.New("a review is already in progress")
	ErrReviewDisabled     = errors.New("pull request review is not enabled")
	ErrPullRequestNotOpen = errors.New("pull request is not open")
)

// HandlePullRequest is called after the webhook has recorded the PR. It reads
// the workspace config, applies the filter pipeline, and queues one review.
func (s *ReviewService) HandlePullRequest(ctx context.Context, ev GitHubPullRequestEvent) error {
	pr, err := s.store.GetPullRequestByRepoNumber(ctx, db.GetPullRequestByRepoNumberParams{
		InstallationID: ev.InstallationID,
		RepoOwner:      ev.RepoOwner,
		RepoName:       ev.RepoName,
		Number:         ev.Number,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("find repository pull request: %w", err)
	}

	cfg, err := s.store.GetWorkspacePRReviewConfig(ctx, pr.WorkspaceID)
	if err != nil {
		return fmt.Errorf("get review config: %w", err)
	}
	if !cfg.PrReviewEnabled || cfg.PrReviewAgentID == nil {
		return nil
	}
	agent, err := s.store.GetAgentWithRuntime(ctx, db.GetAgentWithRuntimeParams{
		ID: *cfg.PrReviewAgentID, WorkspaceID: pr.WorkspaceID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return fmt.Errorf("get reviewer agent: %w", err)
	}
	if reason := s.shouldReview(ev, cfg, agent.Enabled); reason != "" {
		slog.Info("skip pull request review", "pr", ev.Number, "reason", reason)
		return nil
	}

	// Auto reviews are one per SHA. A manual trigger will skip this check.
	if ev.Action != "synchronize" {
		done, err := s.store.HasCompletedReviewForSHA(ctx, db.HasCompletedReviewForSHAParams{
			PullRequestID: pr.ID, HeadSha: ev.HeadSHA,
		})
		if err != nil {
			return fmt.Errorf("check reviewed sha: %w", err)
		}
		if done {
			return nil
		}
	}

	_, err = s.dispatch(ctx, pr, agent, ev, "auto")
	if errors.Is(err, ErrReviewInProgress) {
		return nil // an in-flight review already holds this PR
	}
	return err
}

// dispatch writes the ledger row and queues the task. triggerKind is auto or
// manual; the in-flight unique index is the only dedupe here.
func (s *ReviewService) dispatch(ctx context.Context, pr db.PullRequest, agent db.GetAgentWithRuntimeRow, ev GitHubPullRequestEvent, triggerKind string) (db.PrReview, error) {
	review, err := s.store.CreatePRReview(ctx, db.CreatePRReviewParams{
		WorkspaceID: pr.WorkspaceID, PullRequestID: pr.ID,
		AgentID: &agent.ID, HeadSha: ev.HeadSHA, TriggerKind: triggerKind,
	})
	if err != nil {
		if util.IsUniqueViolation(err) {
			return db.PrReview{}, ErrReviewInProgress
		}
		return db.PrReview{}, fmt.Errorf("create review ledger: %w", err)
	}
	raw, err := s.reviewTaskContext(ctx, pr, agent, ev)
	if err != nil {
		_, _ = s.store.MarkReviewFailedByID(ctx, db.MarkReviewFailedByIDParams{ID: review.ID, Error: err.Error()})
		return db.PrReview{}, err
	}
	task, err := s.tasks.EnqueueReview(ctx, db.CreateTaskParams{
		WorkspaceID: pr.WorkspaceID, IssueID: pr.IssueID, PullRequestID: &pr.ID,
		Kind: "review", AgentID: agent.ID, AssignedDaemonID: agent.RuntimeDaemonID,
		Provider: agent.RuntimeProvider, Model: agent.Model, Priority: 10, Context: raw,
	})
	if err != nil {
		_, _ = s.store.MarkReviewFailedByID(ctx, db.MarkReviewFailedByIDParams{ID: review.ID, Error: err.Error()})
		return db.PrReview{}, fmt.Errorf("enqueue review task: %w", err)
	}
	if err := s.store.SetPRReviewTask(ctx, db.SetPRReviewTaskParams{ID: review.ID, TaskID: &task.ID}); err != nil {
		return db.PrReview{}, fmt.Errorf("attach review task: %w", err)
	}
	return review, nil
}

// DispatchManual is the console's Review now: it bypasses the same-SHA dedupe
// because a human asked explicitly, but not the in-flight lock.
func (s *ReviewService) DispatchManual(ctx context.Context, workspaceID uuid.UUID, number int32) (db.PrReview, error) {
	ws, err := s.store.GetWorkspaceWithRepo(ctx, workspaceID)
	if err != nil {
		return db.PrReview{}, err
	}
	pr, err := s.store.GetPullRequestByNumber(ctx, db.GetPullRequestByNumberParams{
		WorkspaceID: workspaceID, RepoOwner: ws.RepoOwner, RepoName: ws.RepoName, Number: number,
	})
	if err != nil {
		return db.PrReview{}, err
	}
	if pr.State != "open" {
		return db.PrReview{}, ErrPullRequestNotOpen
	}
	cfg, err := s.store.GetWorkspacePRReviewConfig(ctx, workspaceID)
	if err != nil {
		return db.PrReview{}, err
	}
	if !cfg.PrReviewEnabled || cfg.PrReviewAgentID == nil {
		return db.PrReview{}, ErrReviewDisabled
	}
	agent, err := s.store.GetAgentWithRuntime(ctx, db.GetAgentWithRuntimeParams{
		ID: *cfg.PrReviewAgentID, WorkspaceID: workspaceID,
	})
	if err != nil || !agent.Enabled || agent.RuntimeDaemonID == nil {
		return db.PrReview{}, ErrReviewerNotRunnable
	}
	ev := GitHubPullRequestEvent{
		Action: "manual", RepoOwner: pr.RepoOwner, RepoName: pr.RepoName, Number: pr.Number,
		Title: pr.Title, Body: pr.Body, State: pr.State, Draft: pr.Draft,
		HeadBranch: pr.HeadBranch, BaseBranch: pr.BaseBranch, HeadSHA: pr.HeadSha,
		Author: pr.Author, AuthorAssociation: pr.AuthorAssociation, HeadRepo: pr.HeadRepo,
		Additions: int(pr.Additions), Deletions: int(pr.Deletions), ChangedFiles: int(pr.ChangedFiles),
		HTMLURL: pr.Url, UpdatedAt: pr.UpdatedAt,
	}
	return s.dispatch(ctx, pr, agent, ev, "manual")
}

// Complete writes the review back to GitHub and closes the ledger. It is the
// only path that posts a review; the daemon only reports structured data.
func (s *ReviewService) Complete(ctx context.Context, task db.Task, report v1.TaskReport) error {
	if s.github == nil {
		return s.Fail(ctx, task, v1.TaskReport{Error: "GitHub review writer is not configured"})
	}
	summary := report.Summary
	if summary == nil || summary.Review == nil {
		return s.Fail(ctx, task, v1.TaskReport{Error: "review finished without a structured result"})
	}
	full, err := taskContext(task)
	if err != nil {
		return s.Fail(ctx, task, v1.TaskReport{Error: err.Error()})
	}
	if task.PullRequestID == nil {
		return s.Fail(ctx, task, v1.TaskReport{Error: "review task has no pull request"})
	}
	pr, err := s.store.GetPullRequest(ctx, *task.PullRequestID)
	if err != nil {
		return s.Fail(ctx, task, v1.TaskReport{Error: err.Error()})
	}
	ws, err := s.store.GetWorkspaceWithRepo(ctx, task.WorkspaceID)
	if err != nil {
		return s.Fail(ctx, task, v1.TaskReport{Error: err.Error()})
	}
	inst, err := s.store.GetInstallationByDBID(ctx, ws.InstallationID)
	if err != nil {
		return s.Fail(ctx, task, v1.TaskReport{Error: err.Error()})
	}

	reviewedSHA := summary.Review.HeadSHA
	if reviewedSHA == "" {
		if full.PullRequest != nil {
			reviewedSHA = full.PullRequest.HeadSHA
		}
		slog.Warn("review has no head sha; using dispatch-time sha", "task", task.ID)
	}

	comments := append([]v1.ReviewComment(nil), summary.Review.Comments...)
	if len(comments) > 0 {
		paths, err := s.github.ListChangedPaths(ctx, inst.InstallationID, pr.RepoOwner, pr.RepoName, int(pr.Number))
		if err != nil {
			slog.Warn("list changed paths; keeping inline comments", "task", task.ID, "error", err)
		} else {
			filtered := comments[:0]
			for _, comment := range comments {
				comment.Path = normalizeReviewPath(comment.Path)
				if paths[comment.Path] {
					filtered = append(filtered, comment)
				}
			}
			comments = filtered
		}
	}

	body := formatReviewBody(full.Agent.Name, summary.Review.Summary, reviewedSHA)
	review, err := s.github.CreatePullRequestReview(ctx, inst.InstallationID, pr.RepoOwner, pr.RepoName, int(pr.Number), reviewedSHA, body, comments, true)
	if err != nil && isGitHub422(err) && len(comments) > 0 {
		dropped := len(comments)
		body += fmt.Sprintf("\n\n_%d inline comments could not be anchored to the diff._", dropped)
		review, err = s.github.CreatePullRequestReview(ctx, inst.InstallationID, pr.RepoOwner, pr.RepoName, int(pr.Number), reviewedSHA, body, nil, false)
		if err == nil {
			comments = nil
		}
	}
	if err != nil {
		msg := fmt.Sprintf("review failed: %v", err)
		_, _ = s.store.MarkReviewFailed(ctx, db.MarkReviewFailedParams{Column1: task.ID, Error: msg})
		s.comment(ctx, task, full.Agent.Name, msg, false)
		return err
	}

	reviewID := review.GetID()
	url := review.GetHTMLURL()
	if _, err := s.store.MarkReviewCompleted(ctx, db.MarkReviewCompletedParams{
		Column1: task.ID, Summary: summary.Review.Summary, Findings: int32(len(comments)),
		GithubReviewID: &reviewID, Url: url, HeadSha: reviewedSHA,
	}); err != nil {
		return err
	}
	if task.IssueID != nil {
		s.comment(ctx, task, full.Agent.Name, summary.Review.Summary+"\n\n[View the review on GitHub]("+url+")", true)
	}
	return nil
}

// Fail closes the ledger and, for a linked PR, leaves a system line on the
// issue. It does not post a failure comment on GitHub.
func (s *ReviewService) Fail(ctx context.Context, task db.Task, report v1.TaskReport) error {
	msg := report.Error
	if msg == "" {
		msg = "review failed"
	}
	if _, err := s.store.MarkReviewFailed(ctx, db.MarkReviewFailedParams{Column1: task.ID, Error: msg}); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	name := "reviewer"
	if full, err := taskContext(task); err == nil && full.Agent.Name != "" {
		name = full.Agent.Name
	}
	s.comment(ctx, task, name, "Review failed: "+msg, false)
	return nil
}

func (s *ReviewService) comment(ctx context.Context, task db.Task, agentName, content string, fromAgent bool) {
	if task.IssueID == nil {
		return
	}
	authorType := "system"
	if fromAgent {
		authorType = "agent"
	}
	if err := appendIssueComment(ctx, s.store, s.publisher, task.WorkspaceID, *task.IssueID, authorType, agentName, content); err != nil {
		slog.Warn("append review comment", "task", task.ID, "error", err)
	}
}

func formatReviewBody(agentName, summary, sha string) string {
	return fmt.Sprintf("🤖 **GitSquad review** · @%s\n\n%s\n\n<!-- gitsquad-review: %s -->",
		agentName, strings.TrimSpace(summary), sha)
}

// normalizeReviewPath turns what a model actually writes into the GitHub
// changed-path form: backslashes, a leading "./", or an absolute-looking path.
func normalizeReviewPath(path string) string {
	path = strings.ReplaceAll(strings.TrimSpace(path), "\\", "/")
	for strings.HasPrefix(path, "./") {
		path = strings.TrimPrefix(path, "./")
	}
	return strings.TrimPrefix(path, "/")
}

// SyncOpenPullRequests backfills the console's list from the repository's open
// PRs. It records rows only; it deliberately does not review anything, so
// enabling the feature never burns a quota on history.
func (s *ReviewService) SyncOpenPullRequests(ctx context.Context, workspaceID uuid.UUID) error {
	if s.github == nil {
		return errors.New("GitHub is not configured")
	}
	ws, err := s.store.GetWorkspaceWithRepo(ctx, workspaceID)
	if err != nil {
		return fmt.Errorf("get workspace repo: %w", err)
	}
	prs, err := s.github.ListOpenPullRequests(ctx, ws.InstallationID, ws.RepoOwner, ws.RepoName)
	if err != nil {
		return fmt.Errorf("list open pull requests: %w", err)
	}
	for _, pr := range prs {
		updatedAt := pr.UpdatedAt
		if _, err := s.store.RecordRepoPullRequest(ctx, db.InsertRepoPullRequestParams{
			WorkspaceID: workspaceID, RepoOwner: ws.RepoOwner, RepoName: ws.RepoName,
			Number: pr.Number, Title: pr.Title, Url: pr.URL, State: pr.State,
			Draft: pr.Draft, HeadBranch: pr.HeadBranch, BaseBranch: pr.BaseBranch,
			Author: pr.Author, MergedAt: pr.MergedAt, GithubUpdatedAt: &updatedAt,
			HeadSha: pr.HeadSHA, Body: pr.Body, Additions: int32(pr.Additions),
			Deletions: int32(pr.Deletions), ChangedFiles: int32(pr.ChangedFiles),
			AuthorAssociation: pr.AuthorAssociation, HeadRepo: pr.HeadRepo,
		}); err != nil {
			slog.Warn("backfill pull request", "workspace", workspaceID, "pr", pr.Number, "error", err)
		}
	}
	return nil
}

// shouldReview returns "" to proceed or the reason to skip. It is deliberately
// a pure decision: tests exercise the matrix without a database.
func (s *ReviewService) shouldReview(ev GitHubPullRequestEvent, cfg db.GetWorkspacePRReviewConfigRow, agentEnabled bool) string {
	if !agentEnabled {
		return "agent_disabled"
	}
	if cfg.PrReviewTrigger == "manual" {
		return "manual_only"
	}
	if ev.State != "open" {
		return "not_open"
	}
	switch ev.Action {
	case "opened", "reopened", "ready_for_review":
	case "synchronize":
		if cfg.PrReviewTrigger != "push" {
			return "push_disabled"
		}
	default:
		return "action"
	}
	if ev.Draft && cfg.PrReviewIgnoreDrafts {
		return "draft"
	}

	ourBot := strings.EqualFold(ev.Author, s.appName+"[bot]")
	if !ourBot {
		if strings.HasSuffix(strings.ToLower(ev.Author), "[bot]") && !cfg.PrReviewIncludeBots {
			return "bot"
		}
		if cfg.PrReviewAuthorScope == "collaborators" && !trustedAssociation(ev.AuthorAssociation) {
			return "author"
		}
	}
	if ev.ChangedFiles > reviewMaxFiles || ev.Additions+ev.Deletions > reviewMaxLines {
		return "too_large"
	}
	return ""
}

func trustedAssociation(a string) bool {
	switch strings.ToUpper(a) {
	case "OWNER", "MEMBER", "COLLABORATOR":
		return true
	}
	return false
}

// reviewTaskContext snapshots everything the daemon needs. A linked issue is
// included because "does this change do what GTS-42 asked?" is the review's
// advantage over a diff-only bot; an unlinked PR simply has no issue half.
func (s *ReviewService) reviewTaskContext(ctx context.Context, pr db.PullRequest, agent db.GetAgentWithRuntimeRow, ev GitHubPullRequestEvent) ([]byte, error) {
	ws, err := s.store.GetWorkspaceWithRepo(ctx, pr.WorkspaceID)
	if err != nil {
		return nil, fmt.Errorf("get workspace repo: %w", err)
	}
	skills, err := s.store.ListSkillsForAgent(ctx, agent.ID)
	if err != nil {
		return nil, fmt.Errorf("list reviewer skills: %w", err)
	}
	taskCtx := v1.Task{
		Kind:        "review",
		WorkspaceID: pr.WorkspaceID,
		PullRequest: &v1.TaskPullRequestContext{
			Number: int(pr.Number), Title: ev.Title, Body: ev.Body, Author: ev.Author,
			BaseBranch: ev.BaseBranch, HeadBranch: ev.HeadBranch, HeadSHA: ev.HeadSHA,
			Additions: ev.Additions, Deletions: ev.Deletions, ChangedFiles: ev.ChangedFiles,
		},
		Repo: v1.TaskRepoContext{
			Owner: ws.RepoOwner, Name: ws.RepoName, DefaultBranch: ws.RepoDefaultBranch,
		},
		Agent: v1.TaskAgentContext{
			Name: agent.Name, Instructions: agent.Instructions, Model: agent.Model,
			Provider: agent.RuntimeProvider, Skills: toTaskSkills(skills),
		},
	}
	if pr.IssueID != nil {
		issue, err := s.store.GetIssue(ctx, db.GetIssueParams{ID: *pr.IssueID, WorkspaceID: pr.WorkspaceID})
		if err != nil {
			return nil, fmt.Errorf("get linked issue: %w", err)
		}
		comments, err := s.store.ListCommentsByIssue(ctx, *pr.IssueID)
		if err != nil {
			return nil, fmt.Errorf("list issue comments: %w", err)
		}
		issueCtx := buildTaskIssue(issue, comments)
		taskCtx.Issue = &issueCtx
	}
	return json.Marshal(taskCtx)
}
