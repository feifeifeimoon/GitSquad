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

// ErrAgentNotRunnable is returned when an @mention names an agent that has no
// runnable runtime (missing daemon binding).
var ErrAgentNotRunnable = errors.New("agent has no runnable runtime")

// TaskDispatcher assembles and enqueues a task for a mention of an agent.
type TaskDispatcher interface {
	Dispatch(ctx context.Context, workspaceID, issueID uuid.UUID, agentName string) error
}

// TaskService persists tasks to the `tasks` table and drives the task
// lifecycle state machine (queued → dispatched → running → completed/failed).
type TaskService struct {
	store     *store.Store
	github    *GitHubAppService
	publisher EventPublisher
	waker     DaemonWaker
}

func NewTaskService(s *store.Store, github *GitHubAppService) *TaskService {
	return &TaskService{store: s, github: github}
}

// SetPublisher wires the realtime publisher in; nil disables realtime.
func (s *TaskService) SetPublisher(p EventPublisher) { s.publisher = p }

// SetWaker wires the daemon wake-up channel in; nil falls back to the daemon's
// heartbeat pull.
func (s *TaskService) SetWaker(w DaemonWaker) { s.waker = w }

func (s *TaskService) wake(daemonID uuid.UUID) {
	if s.waker != nil {
		s.waker.Wake(daemonID)
	}
}

// publish sends a workspace event to connected browsers (no-op when unwired).
func (s *TaskService) publish(eventType string, workspaceID, issueID uuid.UUID) {
	if s.publisher == nil {
		return
	}
	s.publisher.Publish(v1.AppEvent{Type: eventType, WorkspaceID: workspaceID, IssueID: issueID})
}

// Dispatch resolves the agent + workspace + repo, assembles a context snapshot,
// and persists a queued task for the agent's daemon.
func (s *TaskService) Dispatch(ctx context.Context, workspaceID, issueID uuid.UUID, agentName string) error {
	agents, err := s.store.ListAgentsByWorkspace(ctx, workspaceID)
	if err != nil {
		return fmt.Errorf("list agents: %w", err)
	}
	var agent *db.ListAgentsByWorkspaceRow
	for i := range agents {
		if agents[i].Name == agentName {
			agent = &agents[i]
			break
		}
	}
	if agent == nil || agent.RuntimeDaemonID == nil {
		return ErrAgentNotRunnable
	}

	ws, err := s.store.GetWorkspaceWithRepo(ctx, workspaceID)
	if err != nil {
		return fmt.Errorf("get workspace: %w", err)
	}
	issue, err := s.store.GetIssue(ctx, db.GetIssueParams{ID: issueID, WorkspaceID: workspaceID})
	if err != nil {
		return fmt.Errorf("get issue: %w", err)
	}
	comments, err := s.store.ListCommentsByIssue(ctx, issueID)
	if err != nil {
		return fmt.Errorf("list comments: %w", err)
	}
	skills, err := s.store.ListSkillsForAgent(ctx, agent.ID)
	if err != nil {
		return fmt.Errorf("list skills: %w", err)
	}

	contextTask := v1.Task{
		WorkspaceID: workspaceID,
		Issue:       buildTaskIssue(issue, comments),
		Repo:        v1.TaskRepoContext{Owner: ws.RepoOwner, Name: ws.RepoName, DefaultBranch: "main"},
		Agent: v1.TaskAgentContext{
			Name:         agent.Name,
			Instructions: agent.Instructions,
			Model:        agent.Model,
			Provider:     agent.RuntimeProvider,
			Skills:       toTaskSkills(skills),
		},
	}
	raw, err := json.Marshal(contextTask)
	if err != nil {
		return fmt.Errorf("marshal context: %w", err)
	}

	_, err = s.store.CreateTask(ctx, db.CreateTaskParams{
		WorkspaceID:      workspaceID,
		IssueID:          issueID,
		AgentID:          agent.ID,
		AssignedDaemonID: agent.RuntimeDaemonID,
		Provider:         agent.RuntimeProvider,
		Model:            agent.Model,
		Context:          raw,
	})
	// A pending task for this (issue, agent) already exists — coalesce instead
	// of failing the comment that triggered it, but still wake the daemon in
	// case it never saw the earlier wake.
	if err != nil {
		if util.IsUniqueViolation(err) {
			s.wake(*agent.RuntimeDaemonID)
			return nil
		}
		return err
	}

	// Tell the daemon to claim now rather than on its next heartbeat (up to 30s
	// later). The heartbeat pull remains the fallback if this is dropped.
	s.wake(*agent.RuntimeDaemonID)

	// Immediate feedback: without it an @mention produces no visible change
	// until a daemon claims and starts the task.
	return s.appendComment(ctx, workspaceID, issueID, "system", "system",
		fmt.Sprintf("已为 @%s 排队一个任务。", agentName))
}

// Claim atomically claims the oldest queued task for daemonID, mints a fresh
// installation token, and returns the full task. Returns (nil, nil) when the
// queue is empty.
func (s *TaskService) Claim(ctx context.Context, daemonID uuid.UUID) (*v1.Task, error) {
	task, err := s.store.ClaimNextTask(ctx, &daemonID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("claim task: %w", err)
	}

	full, err := s.buildClaim(ctx, task)
	if err != nil {
		// ClaimNextTask already flipped the row to dispatched. Without a token
		// the daemon cannot run the task, so hand it back to the queue instead
		// of stranding it in dispatched forever.
		_, _ = s.store.RevertTaskToQueued(ctx, task.ID)
		return nil, err
	}
	return full, nil
}

// buildClaim assembles the full task payload, minting a fresh installation token.
func (s *TaskService) buildClaim(ctx context.Context, task db.Task) (*v1.Task, error) {
	ws, err := s.store.GetWorkspaceWithRepo(ctx, task.WorkspaceID)
	if err != nil {
		return nil, fmt.Errorf("get workspace: %w", err)
	}
	inst, err := s.store.GetInstallationByDBID(ctx, ws.InstallationID)
	if err != nil {
		return nil, fmt.Errorf("get installation: %w", err)
	}
	token, _, err := s.github.GetInstallationToken(ctx, inst.InstallationID)
	if err != nil {
		return nil, fmt.Errorf("installation token: %w", err)
	}

	full, err := taskContext(task)
	if err != nil {
		return nil, err
	}
	full.ID = task.ID
	full.InstallationToken = token
	return &full, nil
}

// HasPending reports whether daemonID has queued tasks.
func (s *TaskService) HasPending(ctx context.Context, daemonID uuid.UUID) bool {
	ok, err := s.store.HasPendingForDaemon(ctx, &daemonID)
	if err != nil {
		return false
	}
	return ok
}

// Report handles a task lifecycle report from a daemon, advancing the state
// machine and writing progress messages / terminal results.
func (s *TaskService) Report(ctx context.Context, daemonID uuid.UUID, taskID uuid.UUID, report v1.TaskReport) error {
	task, err := s.store.GetTask(ctx, taskID)
	if err != nil {
		return fmt.Errorf("get task: %w", err)
	}
	if task.AssignedDaemonID == nil || *task.AssignedDaemonID != daemonID {
		return errors.New("task not assigned to this daemon")
	}

	// Usage is recorded before the lifecycle switch, and independently of it.
	// Two reasons: a report that loses the terminal CAS race still came from the
	// daemon that ran the task, so its numbers are worth keeping; and a replayed
	// report has to be able to correct usage it reported earlier.
	//
	// A failure here is logged but does not fail the report. The terminal
	// transition matters more — refusing it would strand the task in a
	// non-terminal state and leave the issue without its result, which is a far
	// worse outcome than a missing token figure.
	if len(report.Usage) > 0 {
		if err := s.recordUsage(ctx, taskID, report.Usage); err != nil {
			slog.Error("record task usage", "error", err, "task", taskID)
		}
	}

	switch report.Status {
	case v1.TaskReportStarted:
		return s.handleStarted(ctx, task)
	case v1.TaskReportRunning:
		return s.handleProgress(ctx, task, report.Progress)
	case v1.TaskReportSucceeded:
		return s.handleCompleted(ctx, task, report)
	case v1.TaskReportFailed:
		return s.handleFailed(ctx, task, report)
	default:
		return nil
	}
}

// recordUsage upserts one row per provider/model pair. Overwriting rather than
// adding makes a replayed report idempotent: the daemon is the source of truth
// for its own run, so a second report corrects the first instead of doubling it.
func (s *TaskService) recordUsage(ctx context.Context, taskID uuid.UUID, usage []v1.TaskUsage) error {
	return s.store.ExecTx(ctx, func(q *db.Queries) error {
		for _, u := range usage {
			model := strings.TrimSpace(u.Model)
			if model == "" {
				// The ledger's key is (task, provider, model), so a blank model
				// would collide two different rows into one.
				model = v1.UnknownModel
			}
			if err := q.UpsertTaskUsage(ctx, db.UpsertTaskUsageParams{
				TaskID:           taskID,
				Provider:         strings.ToLower(strings.TrimSpace(u.Provider)),
				Model:            model,
				InputTokens:      u.InputTokens,
				OutputTokens:     u.OutputTokens,
				CacheReadTokens:  u.CacheReadTokens,
				CacheWriteTokens: u.CacheWriteTokens,
			}); err != nil {
				return fmt.Errorf("upsert task usage: %w", err)
			}
		}
		return nil
	})
}

// FailDaemonTasks marks a daemon's in-flight tasks failed when it goes
// offline, and writes a system comment back to each issue.
func (s *TaskService) FailDaemonTasks(ctx context.Context, daemonID uuid.UUID) error {
	failed, err := s.store.FailDaemonTasks(ctx, &daemonID)
	if err != nil {
		return fmt.Errorf("fail daemon tasks: %w", err)
	}
	for _, task := range failed {
		full, err := taskContext(task)
		if err != nil {
			continue
		}
		_ = s.appendComment(ctx, task.WorkspaceID, task.IssueID, "system", "system",
			fmt.Sprintf("%s 任务因 daemon 下线而失败。", full.Agent.Name))
	}
	return nil
}

// ── state machine handlers ─────────────────────────────────────────────

func (s *TaskService) handleStarted(ctx context.Context, task db.Task) error {
	// CAS dispatched → running. A replayed "started" report finds no row and
	// must not post a second "started" comment.
	if _, err := s.store.MarkTaskRunning(ctx, task.ID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}
	full, err := taskContext(task)
	if err != nil {
		return err
	}
	if err := s.appendComment(ctx, task.WorkspaceID, task.IssueID, "agent", full.Agent.Name,
		fmt.Sprintf("%s 开始工作。", full.Agent.Name)); err != nil {
		return err
	}
	if _, err := s.store.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{
		ID:          task.IssueID,
		WorkspaceID: task.WorkspaceID,
		Status:      "in_progress",
	}); err != nil {
		return err
	}
	s.publish(v1.AppEventIssueUpdated, task.WorkspaceID, task.IssueID)
	return nil
}

func (s *TaskService) handleProgress(ctx context.Context, task db.Task, p *v1.TaskProgress) error {
	if p == nil {
		return nil
	}
	seq, err := s.store.NextTaskMessageSeq(ctx, task.ID)
	if err != nil {
		return err
	}
	inputJSON, _ := json.Marshal(p.Input)
	_, err = s.store.InsertTaskMessage(ctx, db.InsertTaskMessageParams{
		TaskID:  task.ID,
		Seq:     seq + 1,
		Type:    p.Type,
		Tool:    util.OrNil(p.Tool),
		Content: util.OrNil(p.Content),
		Input:   inputJSON,
		Output:  util.OrNil(p.Output),
	})
	return err
}

func (s *TaskService) handleCompleted(ctx context.Context, task db.Task, report v1.TaskReport) error {
	// CAS the terminal transition first: a replayed "completed" report finds no
	// row and must not open a second PR or post a second comment.
	if _, err := s.store.MarkTaskCompleted(ctx, task.ID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}

	full, err := taskContext(task)
	if err != nil {
		return err
	}

	summary := report.Summary
	output, branch := "", ""
	if summary != nil {
		output = strings.TrimSpace(summary.Output)
		branch = summary.Branch
	}

	// The agent's own output is the deliverable: it is what an analysis, design
	// or review task exists to produce, and for code tasks it is the summary.
	if output != "" {
		if err := s.appendComment(ctx, task.WorkspaceID, task.IssueID, "agent", full.Agent.Name, output); err != nil {
			return err
		}
	}

	result := map[string]any{}
	if branch != "" {
		ws, err := s.store.GetWorkspaceWithRepo(ctx, task.WorkspaceID)
		if err != nil {
			return err
		}
		title := full.Issue.Key + ": changes by " + full.Agent.Name
		body := fmt.Sprintf("Closes %s\n\nAutomated changes by %s.", full.Issue.Key, full.Agent.Name)
		prNum, err := s.github.CreatePullRequest(ctx, ws.InstallationID, ws.RepoOwner, ws.RepoName, branch, full.Repo.DefaultBranch, title, body)
		if err != nil {
			// The task is already terminal; surface the write-back failure
			// rather than losing it silently.
			_ = s.appendComment(ctx, task.WorkspaceID, task.IssueID, "system", "system",
				fmt.Sprintf("代码改动已推送,但建 PR 失败: %v", err))
			return err
		}
		result["pr_number"] = prNum
		if err := s.appendComment(ctx, task.WorkspaceID, task.IssueID, "agent", full.Agent.Name,
			fmt.Sprintf("已提 PR #%d。", prNum)); err != nil {
			return err
		}
	} else if output == "" {
		// Neither text nor code: worth surfacing rather than staying silent.
		if err := s.appendComment(ctx, task.WorkspaceID, task.IssueID, "system", "system",
			fmt.Sprintf("%s 完成了任务,但没有任何输出。", full.Agent.Name)); err != nil {
			return err
		}
	}

	// The agent is done; a human should look at whatever it produced — a pull
	// request or an analysis. This transition is not specific to code changes.
	if _, err := s.store.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{
		ID:          task.IssueID,
		WorkspaceID: task.WorkspaceID,
		Status:      "in_review",
	}); err != nil {
		return err
	}
	s.publish(v1.AppEventIssueUpdated, task.WorkspaceID, task.IssueID)

	raw, _ := json.Marshal(result)
	return s.store.SetTaskResult(ctx, db.SetTaskResultParams{ID: task.ID, Result: raw})
}

func (s *TaskService) handleFailed(ctx context.Context, task db.Task, report v1.TaskReport) error {
	// CAS first so a replayed failure does not duplicate the comment.
	if _, err := s.store.MarkTaskFailed(ctx, db.MarkTaskFailedParams{
		ID:            task.ID,
		Error:         report.Error,
		FailureReason: util.Ptr("agent_error"),
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}
	full, err := taskContext(task)
	if err != nil {
		return err
	}
	return s.appendComment(ctx, task.WorkspaceID, task.IssueID, "system", "system",
		fmt.Sprintf("%s 任务失败: %s", full.Agent.Name, report.Error))
}

// ── helpers ─────────────────────────────────────────────────────────────

// taskContext unmarshals the persisted context snapshot into a v1.Task.
func taskContext(task db.Task) (v1.Task, error) {
	var full v1.Task
	if err := json.Unmarshal(task.Context, &full); err != nil {
		return v1.Task{}, fmt.Errorf("unmarshal task context: %w", err)
	}
	return full, nil
}

// appendComment writes an issue comment and notifies connected browsers.
func (s *TaskService) appendComment(ctx context.Context, workspaceID, issueID uuid.UUID, authorType, authorName, content string) error {
	_, err := s.store.CreateComment(ctx, db.CreateCommentParams{
		IssueID:    issueID,
		AuthorType: authorType,
		AuthorName: authorName,
		Type:       "comment",
		Content:    content,
	})
	if err != nil {
		return err
	}
	s.publish(v1.AppEventCommentCreated, workspaceID, issueID)
	return nil
}

func buildTaskIssue(issue db.GetIssueRow, comments []db.IssueComment) v1.TaskIssueContext {
	out := v1.TaskIssueContext{
		ID:          issue.ID,
		Key:         fmt.Sprintf("%s-%d", issue.IssuePrefix, issue.Number),
		Title:       issue.Title,
		Description: issue.Description,
		Comments:    make([]v1.TaskComment, 0, len(comments)),
	}
	for _, c := range comments {
		out.Comments = append(out.Comments, v1.TaskComment{
			AuthorName: c.AuthorName,
			Type:       c.Type,
			Content:    c.Content,
			CreatedAt:  c.CreatedAt,
		})
	}
	return out
}

func toTaskSkills(skills []db.Skill) []v1.TaskSkill {
	out := make([]v1.TaskSkill, 0, len(skills))
	for _, s := range skills {
		out = append(out, v1.TaskSkill{Name: s.Name, Description: s.Description, Content: s.Content})
	}
	return out
}
