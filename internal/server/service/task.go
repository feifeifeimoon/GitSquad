package service

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

// ErrAgentNotRunnable is returned when an @mention names an agent that has no
// runnable runtime (missing daemon binding).
var ErrAgentNotRunnable = errors.New("agent has no runnable runtime")

// TaskDispatcher assembles and enqueues a task for a mention of an agent.
type TaskDispatcher interface {
	Dispatch(ctx context.Context, workspaceID, issueID uuid.UUID, agentName string) error
}

// taskMeta records the context needed to write a task result back to the
// issue after the daemon reports success/failure.
type taskMeta struct {
	workspaceID     uuid.UUID
	issueID         uuid.UUID
	installationDBID uuid.UUID
	repoOwner       string
	repoName        string
	defaultBranch   string
	agentName       string
	issueKey        string
}

// TaskService assembles tasks from @mentions, queues them per daemon, and
// handles claim + progress reports. MVP uses an in-memory queue; chapter 9
// replaces it with a persisted task table + state machine.
type TaskService struct {
	store  *store.Store
	github *GitHubAppService
	queue  *TaskQueue

	metaMu sync.Mutex
	meta   map[uuid.UUID]taskMeta
}

func NewTaskService(s *store.Store, github *GitHubAppService) *TaskService {
	return &TaskService{
		store:  s,
		github: github,
		queue:  NewTaskQueue(),
		meta:   make(map[uuid.UUID]taskMeta),
	}
}

// Dispatch resolves the agent + workspace + repo, assembles a task snapshot,
// and enqueues it for the agent's daemon.
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
	inst, err := s.store.GetInstallationByDBID(ctx, ws.InstallationID)
	if err != nil {
		return fmt.Errorf("get installation: %w", err)
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

	task := v1.Task{
		ID:          uuid.New(),
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

	s.metaMu.Lock()
	s.meta[task.ID] = taskMeta{
		workspaceID:      workspaceID,
		issueID:          issueID,
		installationDBID: ws.InstallationID,
		repoOwner:        ws.RepoOwner,
		repoName:         ws.RepoName,
		defaultBranch:    "main",
		agentName:        agent.Name,
		issueKey:         task.Issue.Key,
	}
	s.metaMu.Unlock()

	s.queue.Enqueue(*agent.RuntimeDaemonID, &queuedTask{task: task, installationID: inst.InstallationID})
	return nil
}

// Claim pops the next task for daemonID and mints a fresh installation token.
// It returns (nil, nil) when the queue is empty.
func (s *TaskService) Claim(ctx context.Context, daemonID uuid.UUID) (*v1.Task, error) {
	q := s.queue.Dequeue(daemonID)
	if q == nil {
		return nil, nil
	}
	token, _, err := s.github.GetInstallationToken(ctx, q.installationID)
	if err != nil {
		return nil, fmt.Errorf("installation token: %w", err)
	}
	q.task.InstallationToken = token
	return &q.task, nil
}

// HasPending reports whether daemonID has queued tasks.
func (s *TaskService) HasPending(daemonID uuid.UUID) bool {
	return s.queue.HasPending(daemonID)
}

// Report handles a task lifecycle report from a daemon. Only terminal events
// take action; progress events are dropped (no task table to append to yet).
func (s *TaskService) Report(ctx context.Context, _ uuid.UUID, taskID uuid.UUID, report v1.TaskReport) error {
	switch report.Status {
	case v1.TaskReportSucceeded:
		return s.handleSucceeded(ctx, taskID, report)
	case v1.TaskReportFailed:
		return s.handleFailed(ctx, taskID, report)
	default:
		return nil
	}
}

func (s *TaskService) takeMeta(taskID uuid.UUID) (taskMeta, bool) {
	s.metaMu.Lock()
	defer s.metaMu.Unlock()
	m, ok := s.meta[taskID]
	if ok {
		delete(s.meta, taskID)
	}
	return m, ok
}

func (s *TaskService) handleSucceeded(ctx context.Context, taskID uuid.UUID, report v1.TaskReport) error {
	meta, ok := s.takeMeta(taskID)
	if !ok {
		return errors.New("task metadata not found")
	}
	if report.Summary == nil || report.Summary.Branch == "" {
		return s.appendComment(ctx, meta, "system", "system",
			fmt.Sprintf("%s 完成任务,但未产生代码改动。", meta.agentName))
	}

	title := meta.issueKey + ": changes by " + meta.agentName
	body := fmt.Sprintf("Closes %s\n\nAutomated changes by %s.", meta.issueKey, meta.agentName)
	prNum, err := s.github.CreatePullRequest(ctx, meta.installationDBID, meta.repoOwner, meta.repoName, report.Summary.Branch, meta.defaultBranch, title, body)
	if err != nil {
		return err
	}

	if err := s.appendComment(ctx, meta, "agent", meta.agentName,
		fmt.Sprintf("%s 完成改动,已提 PR #%d。", meta.agentName, prNum)); err != nil {
		return err
	}
	_, err = s.store.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{
		ID:          meta.issueID,
		WorkspaceID: meta.workspaceID,
		Status:      "in_review",
	})
	return err
}

func (s *TaskService) handleFailed(ctx context.Context, taskID uuid.UUID, report v1.TaskReport) error {
	meta, ok := s.takeMeta(taskID)
	if !ok {
		return errors.New("task metadata not found")
	}
	return s.appendComment(ctx, meta, "system", "system",
		fmt.Sprintf("%s 任务失败: %s", meta.agentName, report.Error))
}

func (s *TaskService) appendComment(ctx context.Context, meta taskMeta, authorType, authorName, content string) error {
	_, err := s.store.CreateComment(ctx, db.CreateCommentParams{
		IssueID:    meta.issueID,
		AuthorType: authorType,
		AuthorName: authorName,
		Type:       "comment",
		Content:    content,
	})
	return err
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
