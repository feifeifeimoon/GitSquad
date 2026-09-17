package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/feifeifeimoon/GitSquad/internal/util"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

var (
	ErrAgentNotFound    = errors.New("agent not found")
	ErrAgentNameTaken   = errors.New("agent name already exists in workspace")
	ErrInvalidAgentName = errors.New("agent name must match ^[a-z0-9][a-z0-9_-]{0,63}$")
	ErrInvalidProvider  = errors.New("provider must be claude, codex, or agy")
	ErrRuntimeNotFound  = errors.New("runtime not found")
	ErrDaemonMismatch   = errors.New("daemon does not belong to this workspace owner")
	ErrSkillNotFound    = errors.New("skill not found")
	ErrSkillNameTaken   = errors.New("skill name already exists in workspace")
)

var agentNameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

// validProviders mirrors the daemon's runtime registry (see
// internal/daemon/runtime_specs.go): a provider the daemon can detect must also
// be acceptable here, otherwise the UI offers a choice the API rejects.
var validProviders = map[string]bool{"claude": true, "codex": true, "agy": true}

func normalizeAgentName(name string) (string, error) {
	n := strings.ToLower(strings.TrimSpace(name))
	if !agentNameRe.MatchString(n) {
		return "", ErrInvalidAgentName
	}
	return n, nil
}

type AgentService struct {
	store *store.Store
}

func NewAgentService(s *store.Store) *AgentService { return &AgentService{store: s} }

// resolveRuntime upserts the workspace-scoped runtime for (daemon, provider)
// after verifying the daemon belongs to the workspace owner.
func (s *AgentService) resolveRuntime(ctx context.Context, workspaceID, daemonID uuid.UUID, provider string) (uuid.UUID, error) {
	if !validProviders[provider] {
		return uuid.Nil, ErrInvalidProvider
	}
	ws, err := s.store.GetWorkspace(ctx, workspaceID)
	if err != nil {
		return uuid.Nil, ErrRuntimeNotFound
	}
	dm, err := s.store.FindDaemonByID(ctx, daemonID)
	if err != nil || dm.UserID != ws.UserID {
		return uuid.Nil, ErrDaemonMismatch
	}
	rt, err := s.store.UpsertAgentRuntime(ctx, db.UpsertAgentRuntimeParams{
		WorkspaceID: workspaceID,
		DaemonID:    &daemonID,
		Name:        provider,
		RuntimeMode: "local",
		Provider:    provider,
	})
	if err != nil {
		return uuid.Nil, fmt.Errorf("upsert runtime: %w", err)
	}
	return rt.ID, nil
}

func (s *AgentService) CreateAgent(ctx context.Context, workspaceID, userID uuid.UUID, req v1.CreateAgentRequest) (*v1.Agent, error) {
	name, err := normalizeAgentName(req.Name)
	if err != nil {
		return nil, err
	}
	daemonID, err := uuid.Parse(req.DaemonID)
	if err != nil {
		return nil, ErrDaemonMismatch
	}
	runtimeID, err := s.resolveRuntime(ctx, workspaceID, daemonID, req.Provider)
	if err != nil {
		return nil, err
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	agent, err := s.store.CreateAgent(ctx, db.CreateAgentParams{
		WorkspaceID:  workspaceID,
		Name:         name,
		Description:  req.Description,
		Instructions: req.Instructions,
		Model:        req.Model,
		RuntimeID:    runtimeID,
		Enabled:      enabled,
		AvatarUrl:    req.AvatarURL,
		CreatedBy:    &userID,
	})
	if err != nil {
		if util.IsUniqueViolation(err) {
			return nil, ErrAgentNameTaken
		}
		return nil, fmt.Errorf("create agent: %w", err)
	}
	if len(req.SkillIDs) > 0 {
		if err := s.setSkills(ctx, agent.ID, req.SkillIDs); err != nil {
			return nil, err
		}
	}
	return s.GetAgent(ctx, workspaceID, agent.ID)
}

func (s *AgentService) ListAgents(ctx context.Context, workspaceID uuid.UUID) ([]v1.Agent, error) {
	rows, err := s.store.ListAgentsByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list agents: %w", err)
	}
	out := make([]v1.Agent, 0, len(rows))
	for _, r := range rows {
		out = append(out, buildAgentView(agentRow{
			id: r.ID, workspaceID: r.WorkspaceID, runtimeID: r.RuntimeID,
			name: r.Name, description: r.Description, instructions: r.Instructions,
			model: r.Model, runtimeProvider: r.RuntimeProvider, runtimeName: r.RuntimeName,
			avatarURL: r.AvatarUrl, enabled: r.Enabled,
			runtimeDaemonID:   r.RuntimeDaemonID,
			runtimeDaemonName: r.RuntimeDaemonName, runtimeDaemonStatus: r.RuntimeDaemonStatus,
			runtimeDaemonLastSeenAt: r.RuntimeDaemonLastSeenAt,
			runningCount:            r.RunningCount, queuedCount: r.QueuedCount, totalRuns: r.TotalRuns,
			issuePrefix: r.IssuePrefix, issueNumber: r.IssueNumber, issueTitle: r.IssueTitle,
			createdAt: r.CreatedAt, updatedAt: r.UpdatedAt,
		}))
	}
	return out, nil
}

func (s *AgentService) GetAgent(ctx context.Context, workspaceID, agentID uuid.UUID) (*v1.Agent, error) {
	r, err := s.store.GetAgent(ctx, db.GetAgentParams{ID: agentID, WorkspaceID: workspaceID})
	if err != nil {
		return nil, ErrAgentNotFound
	}
	agent := buildAgentView(agentRow{
		id: r.ID, workspaceID: r.WorkspaceID, runtimeID: r.RuntimeID,
		name: r.Name, description: r.Description, instructions: r.Instructions,
		model: r.Model, runtimeProvider: r.RuntimeProvider, runtimeName: r.RuntimeName,
		avatarURL: r.AvatarUrl, enabled: r.Enabled,
		runtimeDaemonID:   r.RuntimeDaemonID,
		runtimeDaemonName: r.RuntimeDaemonName, runtimeDaemonStatus: r.RuntimeDaemonStatus,
		runtimeDaemonLastSeenAt: r.RuntimeDaemonLastSeenAt,
		runningCount:            r.RunningCount, queuedCount: r.QueuedCount, totalRuns: r.TotalRuns,
		issuePrefix: r.IssuePrefix, issueNumber: r.IssueNumber, issueTitle: r.IssueTitle,
		createdAt: r.CreatedAt, updatedAt: r.UpdatedAt,
	})
	skills, err := s.store.ListSkillsForAgent(ctx, agentID)
	if err == nil {
		agent.Skills = toSkills(skills)
	}
	return &agent, nil
}

// ListAgentsByDaemon returns every agent bound to one of daemonID's runtimes,
// across all of the owner's workspaces. It backs the daemon detail page, where
// the grouping is per runtime rather than per workspace.
func (s *AgentService) ListAgentsByDaemon(ctx context.Context, daemonID, userID uuid.UUID) ([]v1.DaemonAgent, error) {
	rows, err := s.store.ListAgentsByDaemon(ctx, db.ListAgentsByDaemonParams{DaemonID: &daemonID, UserID: userID})
	if err != nil {
		return nil, fmt.Errorf("list agents by daemon: %w", err)
	}
	out := make([]v1.DaemonAgent, 0, len(rows))
	for _, r := range rows {
		out = append(out, v1.DaemonAgent{
			ID:            r.ID,
			WorkspaceID:   r.WorkspaceID,
			WorkspaceSlug: r.WorkspaceSlug,
			WorkspaceName: r.WorkspaceName,
			Name:          r.Name,
			AvatarURL:     r.AvatarUrl,
			Provider:      r.RuntimeProvider,
			Model:         r.Model,
			Enabled:       r.Enabled,
			RunningCount:  int(r.RunningCount),
			QueuedCount:   int(r.QueuedCount),
			TotalRuns:     int(r.TotalRuns),
			CurrentTask:   currentTask(r.IssuePrefix, r.IssueNumber, r.IssueTitle),
		})
	}
	return out, nil
}

func (s *AgentService) UpdateAgent(ctx context.Context, workspaceID, agentID uuid.UUID, req v1.UpdateAgentRequest) (*v1.Agent, error) {
	cur, err := s.store.GetAgent(ctx, db.GetAgentParams{ID: agentID, WorkspaceID: workspaceID})
	if err != nil {
		return nil, ErrAgentNotFound
	}
	params := db.UpdateAgentParams{
		ID:           agentID,
		WorkspaceID:  workspaceID,
		Name:         cur.Name,
		Description:  cur.Description,
		Instructions: cur.Instructions,
		Model:        cur.Model,
		RuntimeID:    cur.RuntimeID,
		Enabled:      cur.Enabled,
		AvatarUrl:    cur.AvatarUrl,
	}
	if req.Name != nil {
		params.Name, err = normalizeAgentName(*req.Name)
		if err != nil {
			return nil, err
		}
	}
	if req.Description != nil {
		params.Description = *req.Description
	}
	if req.Instructions != nil {
		params.Instructions = *req.Instructions
	}
	if req.Model != nil {
		params.Model = *req.Model
	}
	if req.Enabled != nil {
		params.Enabled = *req.Enabled
	}
	if req.AvatarURL != nil {
		params.AvatarUrl = *req.AvatarURL
	}
	if req.DaemonID != nil && req.Provider != nil {
		daemonID, err := uuid.Parse(*req.DaemonID)
		if err != nil {
			return nil, ErrDaemonMismatch
		}
		params.RuntimeID, err = s.resolveRuntime(ctx, workspaceID, daemonID, *req.Provider)
		if err != nil {
			return nil, err
		}
	}
	if _, err := s.store.UpdateAgent(ctx, params); err != nil {
		if util.IsUniqueViolation(err) {
			return nil, ErrAgentNameTaken
		}
		return nil, fmt.Errorf("update agent: %w", err)
	}
	if req.SkillIDs != nil {
		if err := s.setSkills(ctx, agentID, req.SkillIDs); err != nil {
			return nil, err
		}
	}
	return s.GetAgent(ctx, workspaceID, agentID)
}

func (s *AgentService) DeleteAgent(ctx context.Context, workspaceID, agentID uuid.UUID) error {
	return s.store.DeleteAgent(ctx, db.DeleteAgentParams{ID: agentID, WorkspaceID: workspaceID})
}

func (s *AgentService) ListRuntimes(ctx context.Context, workspaceID uuid.UUID) ([]v1.AgentRuntime, error) {
	rows, err := s.store.ListAgentRuntimesByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list runtimes: %w", err)
	}
	out := make([]v1.AgentRuntime, 0, len(rows))
	for _, r := range rows {
		rt := v1.AgentRuntime{
			ID:          r.ID,
			WorkspaceID: r.WorkspaceID,
			DaemonID:    r.DaemonID,
			Name:        r.Name,
			RuntimeMode: r.RuntimeMode,
			Provider:    r.Provider,
			DaemonStatus: liveStatus(
				util.Value(r.DaemonStatus),
				r.DaemonLastSeenAt,
			),
			CreatedAt: r.CreatedAt,
			UpdatedAt: r.UpdatedAt,
		}
		if r.DaemonName != nil {
			rt.DaemonName = *r.DaemonName
		}
		out = append(out, rt)
	}
	return out, nil
}

func (s *AgentService) setSkills(ctx context.Context, agentID uuid.UUID, skillIDs []string) error {
	return s.store.ExecTx(ctx, func(q *db.Queries) error {
		if err := q.DeleteAgentSkills(ctx, agentID); err != nil {
			return err
		}
		for _, id := range skillIDs {
			skillID, err := uuid.Parse(id)
			if err != nil {
				continue
			}
			if err := q.InsertAgentSkill(ctx, db.InsertAgentSkillParams{AgentID: agentID, SkillID: skillID}); err != nil {
				return err
			}
		}
		return nil
	})
}

// agentRow is the column set every agent query selects. The three queries
// (by workspace, by id, by daemon) return the same joined shape, so the view
// builder takes this instead of twenty positional arguments.
type agentRow struct {
	id, workspaceID, runtimeID             uuid.UUID
	name, description, instructions        string
	model, runtimeProvider, runtimeName    string
	avatarURL                              string
	enabled                                bool
	runtimeDaemonID                        *uuid.UUID
	runtimeDaemonName, runtimeDaemonStatus *string
	runtimeDaemonLastSeenAt                *time.Time
	runningCount, queuedCount, totalRuns   int32
	issuePrefix                            string
	issueNumber                            int32
	issueTitle                             string
	createdAt, updatedAt                   time.Time
}

// buildAgentView assembles the v1.Agent view from a joined query row.
func buildAgentView(r agentRow) v1.Agent {
	return v1.Agent{
		ID:           r.id,
		WorkspaceID:  r.workspaceID,
		Name:         r.name,
		Description:  r.description,
		Instructions: r.instructions,
		Model:        r.model,
		RuntimeID:    r.runtimeID,
		Enabled:      r.enabled,
		AvatarURL:    r.avatarURL,
		RunningCount: int(r.runningCount),
		QueuedCount:  int(r.queuedCount),
		TotalRuns:    int(r.totalRuns),
		CurrentTask:  currentTask(r.issuePrefix, r.issueNumber, r.issueTitle),
		CreatedAt:    r.createdAt,
		UpdatedAt:    r.updatedAt,
		Runtime: &v1.AgentRuntime{
			ID:         r.runtimeID,
			Name:       r.runtimeName,
			Provider:   r.runtimeProvider,
			DaemonID:   r.runtimeDaemonID,
			DaemonName: util.Value(r.runtimeDaemonName),
			// Resolved here rather than handed to the client as a timestamp to
			// compare against its own clock.
			DaemonStatus: liveStatus(util.Value(r.runtimeDaemonStatus), r.runtimeDaemonLastSeenAt),
		},
	}
}

// currentTask builds the in-flight task reference, or nil when the query's
// current-task lateral matched nothing (which it signals with empty columns).
func currentTask(prefix string, number int32, title string) *v1.AgentCurrentTask {
	if prefix == "" && title == "" {
		return nil
	}
	return &v1.AgentCurrentTask{
		IssueKey:   fmt.Sprintf("%s-%d", prefix, number),
		IssueTitle: title,
	}
}
