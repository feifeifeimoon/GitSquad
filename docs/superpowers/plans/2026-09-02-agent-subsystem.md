# Agent 子系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 GitSquad 的 agent 子系统——agent(人设 + 可变 runtime 绑定)、agent_runtime(workspace 级执行目标)、skill(结构化技能)、model(per-agent 覆盖 + daemon 现查),以及前端 Agents/Skills 管理。

**Architecture:** 沿用 Handler → Service → Store(sqlc)分层。新表 `agent_runtimes` / `agents` / `skills` / `agent_skills` 追加到 `schema.sql` 并 `sqlc generate`;daemon 侧把 `runtimes`(探测数据)稳定化并新增按 provider 现查模型列表的能力;@mention 通过 `listAgentNames` 接线到 `agents` 表。

**Tech Stack:** Go 1.26 + Gin + sqlc(pgx/v5) + Postgres;Next.js 16 + React 19 + TypeScript 5 + Tailwind + shadcn/ui。

## Global Constraints

- 表名用复数(`agents` / `agent_runtimes` / `skills` / `agent_skills`),与现有 `users` / `workspaces` / `daemons` 一致。
- `provider` 取值是短 slug:`claude` / `codex`(废弃 `claude-code`)。
- `runtime_mode` 取值 `local` / `cloud`;MVP 只落 `local`(cloud 第 8 章)。
- agent 名格式 `^[a-z0-9][a-z0-9_-]{0,63}$`,写入前小写化,workspace 内唯一。
- daemon 用户级,agent_runtime workspace 级;选 runtime 时 daemon owner 必须 == workspace owner。
- 所有 API 用 `v1.APIResponse` 信封;`pkg/types/v1` 放共享类型;查询在 `internal/server/store/queries/*.sql`,跑 `sqlc generate` 后提交生成的 `internal/server/store/db`。
- Go 提交前跑 `go fmt ./...` + `go vet ./...`;测试 `-race`;前端 `bun run lint` 零告警。
- 每个任务结束 `git commit`(提交信息见各任务)。

---

### Task 1: 追加 schema 并重新生成 sqlc

**Files:**
- Modify: `internal/server/store/schema.sql`
- Regenerate: `internal/server/store/db/`(sqlc 产物)

**Interfaces:**
- Produces: `db.AgentRuntime` / `db.Agent` / `db.Skill` / `db.AgentSkill` 结构体(sqlc 生成),供后续任务使用。

- [ ] **Step 1: 在 schema.sql 末尾追加四张表 + 索引**

在 `internal/server/store/schema.sql` 文件末尾(`idx_issue_comments_issue` 之后)追加:

```sql
CREATE TABLE agent_runtimes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    daemon_id UUID REFERENCES daemons(id),
    name TEXT NOT NULL,
    runtime_mode TEXT NOT NULL DEFAULT 'local' CHECK (runtime_mode IN ('local','cloud')),
    provider TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online','offline')),
    device_info TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}',
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, daemon_id, provider)
);

CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    runtime_id UUID NOT NULL REFERENCES agent_runtimes(id) ON DELETE RESTRICT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name)
);

CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name)
);

CREATE TABLE agent_skills (
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (agent_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_runtimes_workspace ON agent_runtimes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_skills_workspace ON skills(workspace_id);
```

- [ ] **Step 2: 重新生成 sqlc**

Run: `sqlc generate`
Expected: 无报错,`internal/server/store/db/models.go` 出现 `AgentRuntime` / `Agent` / `Skill` / `AgentSkill`。

- [ ] **Step 3: 验证编译**

Run: `go build ./...`
Expected: exit 0。

- [ ] **Step 4: Commit**

```bash
git add internal/server/store/schema.sql internal/server/store/db/
git commit -m "feat(agents): add agent/runtime/skill schema and regenerate sqlc"
```

---

### Task 2: 添加 SQL 查询

**Files:**
- Create: `internal/server/store/queries/agents.sql`
- Create: `internal/server/store/queries/agent_runtimes.sql`
- Create: `internal/server/store/queries/skills.sql`

**Interfaces:**
- Produces(sqlc 方法):`CreateAgent` / `ListAgentsByWorkspace` / `GetAgent` / `UpdateAgent` / `DeleteAgent` / `ListAgentNamesByWorkspace`;`UpsertAgentRuntime` / `ListAgentRuntimesByWorkspace`;`CreateSkill` / `ListSkillsByWorkspace` / `GetSkill` / `UpdateSkill` / `DeleteSkill` / `ListSkillsForAgent` / `DeleteAgentSkills` / `InsertAgentSkill`。

- [ ] **Step 1: 写 `agents.sql`**

```sql
-- name: CreateAgent :one
INSERT INTO agents (workspace_id, name, description, instructions, model, runtime_id, enabled, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;

-- name: ListAgentsByWorkspace :many
SELECT a.*, ar.provider AS runtime_provider, ar.name AS runtime_name, ar.daemon_id AS runtime_daemon_id
FROM agents a
JOIN agent_runtimes ar ON ar.id = a.runtime_id
WHERE a.workspace_id = $1
ORDER BY a.created_at ASC;

-- name: GetAgent :one
SELECT a.*, ar.provider AS runtime_provider, ar.name AS runtime_name, ar.daemon_id AS runtime_daemon_id
FROM agents a
JOIN agent_runtimes ar ON ar.id = a.runtime_id
WHERE a.id = $1 AND a.workspace_id = $2;

-- name: UpdateAgent :one
UPDATE agents SET name = $3, description = $4, instructions = $5, model = $6, runtime_id = $7, enabled = $8, updated_at = now()
WHERE id = $1 AND workspace_id = $2 RETURNING *;

-- name: DeleteAgent :exec
DELETE FROM agents WHERE id = $1 AND workspace_id = $2;

-- name: ListAgentNamesByWorkspace :many
SELECT name FROM agents WHERE workspace_id = $1 AND enabled = true ORDER BY name;
```

- [ ] **Step 2: 写 `agent_runtimes.sql`**

```sql
-- name: UpsertAgentRuntime :one
INSERT INTO agent_runtimes (workspace_id, daemon_id, name, runtime_mode, provider)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (workspace_id, daemon_id, provider) DO UPDATE SET
    name = EXCLUDED.name, updated_at = now()
RETURNING *;

-- name: ListAgentRuntimesByWorkspace :many
SELECT ar.*, d.name AS daemon_name, d.status AS daemon_status
FROM agent_runtimes ar
LEFT JOIN daemons d ON d.id = ar.daemon_id
WHERE ar.workspace_id = $1
ORDER BY ar.created_at ASC;
```

- [ ] **Step 3: 写 `skills.sql`**

```sql
-- name: CreateSkill :one
INSERT INTO skills (workspace_id, name, description, content, created_by)
VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: ListSkillsByWorkspace :many
SELECT * FROM skills WHERE workspace_id = $1 ORDER BY name;

-- name: GetSkill :one
SELECT * FROM skills WHERE id = $1 AND workspace_id = $2;

-- name: UpdateSkill :one
UPDATE skills SET name = $3, description = $4, content = $5, updated_at = now()
WHERE id = $1 AND workspace_id = $2 RETURNING *;

-- name: DeleteSkill :exec
DELETE FROM skills WHERE id = $1 AND workspace_id = $2;

-- name: ListSkillsForAgent :many
SELECT s.* FROM skills s
JOIN agent_skills ag ON ag.skill_id = s.id
WHERE ag.agent_id = $1 ORDER BY s.name;

-- name: DeleteAgentSkills :exec
DELETE FROM agent_skills WHERE agent_id = $1;

-- name: InsertAgentSkill :exec
INSERT INTO agent_skills (agent_id, skill_id) VALUES ($1, $2);
```

- [ ] **Step 4: 重新生成 sqlc**

Run: `sqlc generate`
Expected: 无报错,`internal/server/store/db/agents.sql.go` / `agent_runtimes.sql.go` / `skills.sql.go` 生成。

- [ ] **Step 5: 验证编译**

Run: `go build ./...`
Expected: exit 0。

- [ ] **Step 6: Commit**

```bash
git add internal/server/store/queries/ internal/server/store/db/
git commit -m "feat(agents): add agent/runtime/skill sqlc queries"
```

---

### Task 3: 共享 API 类型

**Files:**
- Create: `pkg/types/v1/agent.go`

**Interfaces:**
- Produces:`v1.Agent` / `v1.AgentRuntime` / `v1.Skill` / `v1.CreateAgentRequest` / `v1.UpdateAgentRequest` / `v1.CreateSkillRequest` / `v1.UpdateSkillRequest`,供 handler/service/前端使用。

- [ ] **Step 1: 写类型文件**

```go
package v1

import (
	"time"

	"github.com/google/uuid"
)

// AgentRuntime is a workspace-scoped execution target backed by a user's
// daemon (local) or, later, a cloud sandbox.
type AgentRuntime struct {
	ID           uuid.UUID  `json:"id"`
	WorkspaceID  uuid.UUID  `json:"workspace_id"`
	DaemonID     *uuid.UUID `json:"daemon_id,omitempty"`
	Name         string     `json:"name"`
	RuntimeMode  string     `json:"runtime_mode"`
	Provider     string     `json:"provider"`
	Status       string     `json:"status"`
	DaemonName   string     `json:"daemon_name,omitempty"`
	DaemonStatus string     `json:"daemon_status,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// Agent is a configured worker persona bound to a runtime.
type Agent struct {
	ID           uuid.UUID    `json:"id"`
	WorkspaceID  uuid.UUID    `json:"workspace_id"`
	Name         string       `json:"name"`
	Description  string       `json:"description"`
	Instructions string       `json:"instructions"`
	Model        string       `json:"model"`
	RuntimeID    uuid.UUID    `json:"runtime_id"`
	Enabled      bool         `json:"enabled"`
	Skills       []Skill      `json:"skills,omitempty"`
	Runtime      *AgentRuntime `json:"runtime,omitempty"`
	CreatedAt    time.Time    `json:"created_at"`
	UpdatedAt    time.Time    `json:"updated_at"`
}

type CreateAgentRequest struct {
	Name         string   `json:"name" binding:"required"`
	Description  string   `json:"description"`
	Instructions string   `json:"instructions"`
	Model        string   `json:"model"`
	DaemonID     string   `json:"daemon_id" binding:"required"`
	Provider     string   `json:"provider" binding:"required"`
	SkillIDs     []string `json:"skill_ids"`
	Enabled      *bool    `json:"enabled"`
}

type UpdateAgentRequest struct {
	Name         *string  `json:"name"`
	Description  *string  `json:"description"`
	Instructions *string  `json:"instructions"`
	Model        *string  `json:"model"`
	DaemonID     *string  `json:"daemon_id"`
	Provider     *string  `json:"provider"`
	SkillIDs     []string `json:"skill_ids"`
	Enabled      *bool    `json:"enabled"`
}

// Skill is a workspace-scoped reusable instruction document.
type Skill struct {
	ID          uuid.UUID `json:"id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Content     string    `json:"content"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateSkillRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	Content     string `json:"content"`
}

type UpdateSkillRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Content     *string `json:"content"`
}
```

- [ ] **Step 2: 验证编译**

Run: `go build ./...`
Expected: exit 0。

- [ ] **Step 3: Commit**

```bash
git add pkg/types/v1/agent.go
git commit -m "feat(agents): add shared agent/runtime/skill API types"
```

---

### Task 4: Agent 与 Skill 服务

**Files:**
- Create: `internal/server/service/agent.go`
- Create: `internal/server/service/skill.go`

**Interfaces:**
- Consumes:`store.Store`、`db.CreateAgentParams`、`db.UpsertAgentRuntimeParams`(Task 1/2)。
- Produces:
  - `service.NewAgentService(s *store.Store) *AgentService`
  - `(*AgentService).CreateAgent(ctx, workspaceID, userID uuid.UUID, req v1.CreateAgentRequest) (*v1.Agent, error)`
  - `(*AgentService).ListAgents(ctx, workspaceID uuid.UUID) ([]v1.Agent, error)`
  - `(*AgentService).GetAgent(ctx, workspaceID, agentID uuid.UUID) (*v1.Agent, error)`
  - `(*AgentService).UpdateAgent(ctx, workspaceID, agentID uuid.UUID, req v1.UpdateAgentRequest) (*v1.Agent, error)`
  - `(*AgentService).DeleteAgent(ctx, workspaceID, agentID uuid.UUID) error`
  - `(*AgentService).ListRuntimes(ctx, workspaceID uuid.UUID) ([]v1.AgentRuntime, error)`
  - `service.NewSkillService(s *store.Store) *SkillService` + 同名 CRUD 方法
  - 错误变量:`ErrAgentNotFound` / `ErrAgentNameTaken` / `ErrInvalidAgentName` / `ErrInvalidProvider` / `ErrRuntimeNotFound` / `ErrDaemonMismatch` / `ErrSkillNotFound` / `ErrSkillNameTaken`

- [ ] **Step 1: 写校验函数与错误(放在 agent.go 顶部)**

```go
package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var (
	ErrAgentNotFound  = errors.New("agent not found")
	ErrAgentNameTaken = errors.New("agent name already exists in workspace")
	ErrInvalidAgentName = errors.New("agent name must match ^[a-z0-9][a-z0-9_-]{0,63}$")
	ErrInvalidProvider   = errors.New("provider must be claude or codex")
	ErrRuntimeNotFound   = errors.New("runtime not found")
	ErrDaemonMismatch    = errors.New("daemon does not belong to this workspace owner")
	ErrSkillNotFound     = errors.New("skill not found")
	ErrSkillNameTaken    = errors.New("skill name already exists in workspace")
)

var agentNameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

var validProviders = map[string]bool{"claude": true, "codex": true}

func normalizeAgentName(name string) (string, error) {
	n := strings.ToLower(strings.TrimSpace(name))
	if !agentNameRe.MatchString(n) {
		return "", ErrInvalidAgentName
	}
	return n, nil
}
```

- [ ] **Step 2: 写 AgentService 骨架 + CreateAgent**

```go
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
		CreatedBy:    &userID,
	})
	if err != nil {
		if isUniqueViolation(err) {
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
```

- [ ] **Step 3: 写其余 AgentService 方法(List/Get/Update/Delete/ListRuntimes/setSkills)**

```go
func (s *AgentService) ListAgents(ctx context.Context, workspaceID uuid.UUID) ([]v1.Agent, error) {
	rows, err := s.store.ListAgentsByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list agents: %w", err)
	}
	out := make([]v1.Agent, 0, len(rows))
	for _, r := range rows {
		out = append(out, s.toAgent(r))
	}
	return out, nil
}

func (s *AgentService) GetAgent(ctx context.Context, workspaceID, agentID uuid.UUID) (*v1.Agent, error) {
	row, err := s.store.GetAgent(ctx, db.GetAgentParams{ID: agentID, WorkspaceID: workspaceID})
	if err != nil {
		return nil, ErrAgentNotFound
	}
	agent := s.toAgent(row)
	skills, err := s.store.ListSkillsForAgent(ctx, agentID)
	if err == nil {
		agent.Skills = toSkills(skills)
	}
	return &agent, nil
}

func (s *AgentService) UpdateAgent(ctx context.Context, workspaceID, agentID uuid.UUID, req v1.UpdateAgentRequest) (*v1.Agent, error) {
	cur, err := s.store.GetAgent(ctx, db.GetAgentParams{ID: agentID, WorkspaceID: workspaceID})
	if err != nil {
		return nil, ErrAgentNotFound
	}
	params := db.UpdateAgentParams{
		ID:          agentID,
		WorkspaceID: workspaceID,
		Name:        cur.Name,
		Description: cur.Description,
		Instructions: cur.Instructions,
		Model:       cur.Model,
		RuntimeID:   cur.RuntimeID,
		Enabled:     cur.Enabled,
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
		if isUniqueViolation(err) {
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
		out = append(out, v1.AgentRuntime{
			ID:          r.ID,
			WorkspaceID: r.WorkspaceID,
			DaemonID:    r.DaemonID,
			Name:        r.Name,
			RuntimeMode: r.RuntimeMode,
			Provider:    r.Provider,
			Status:      r.Status,
			DaemonName:  r.DaemonName,
			DaemonStatus: r.DaemonStatus,
			CreatedAt:   r.CreatedAt,
			UpdatedAt:   r.UpdatedAt,
		})
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
```

- [ ] **Step 4: 写 `toAgent` / `toSkills` / `isUniqueViolation` 辅助函数**

```go
func (s *AgentService) toAgent(r db.ListAgentsByWorkspaceRow) v1.Agent {
	return v1.Agent{
		ID:           r.ID,
		WorkspaceID:  r.WorkspaceID,
		Name:         r.Name,
		Description:  r.Description,
		Instructions: r.Instructions,
		Model:        r.Model,
		RuntimeID:    r.RuntimeID,
		Enabled:      r.Enabled,
		CreatedAt:    r.CreatedAt,
		UpdatedAt:    r.UpdatedAt,
		Runtime: &v1.AgentRuntime{
			ID:        r.RuntimeID,
			Name:      r.RuntimeName,
			Provider:  r.RuntimeProvider,
			DaemonID:  r.RuntimeDaemonID,
		},
	}
}

func toSkills(rows []db.Skill) []v1.Skill {
	out := make([]v1.Skill, 0, len(rows))
	for _, r := range rows {
		out = append(out, v1.Skill{
			ID:          r.ID,
			WorkspaceID: r.WorkspaceID,
			Name:        r.Name,
			Description: r.Description,
			Content:     r.Content,
			CreatedAt:   r.CreatedAt,
			UpdatedAt:   r.UpdatedAt,
		})
	}
	return out
}
```

- [ ] **Step 5: 写 `skill.go`(SkillService CRUD)**

```go
package service

import (
	"context"
	"fmt"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

type SkillService struct{ store *store.Store }

func NewSkillService(s *store.Store) *SkillService { return &SkillService{store: s} }

func (s *SkillService) CreateSkill(ctx context.Context, workspaceID, userID uuid.UUID, req v1.CreateSkillRequest) (*v1.Skill, error) {
	if req.Name == "" {
		return nil, ErrSkillNotFound
	}
	sk, err := s.store.CreateSkill(ctx, db.CreateSkillParams{
		WorkspaceID: workspaceID,
		Name:        req.Name,
		Description: req.Description,
		Content:     req.Content,
		CreatedBy:   &userID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrSkillNameTaken
		}
		return nil, fmt.Errorf("create skill: %w", err)
	}
	return toSkill(sk), nil
}

func (s *SkillService) ListSkills(ctx context.Context, workspaceID uuid.UUID) ([]v1.Skill, error) {
	rows, err := s.store.ListSkillsByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list skills: %w", err)
	}
	return toSkills(rows), nil
}

func (s *SkillService) GetSkill(ctx context.Context, workspaceID, skillID uuid.UUID) (*v1.Skill, error) {
	sk, err := s.store.GetSkill(ctx, db.GetSkillParams{ID: skillID, WorkspaceID: workspaceID})
	if err != nil {
		return nil, ErrSkillNotFound
	}
	return toSkill(sk), nil
}

func (s *SkillService) UpdateSkill(ctx context.Context, workspaceID, skillID uuid.UUID, req v1.UpdateSkillRequest) (*v1.Skill, error) {
	cur, err := s.store.GetSkill(ctx, db.GetSkillParams{ID: skillID, WorkspaceID: workspaceID})
	if err != nil {
		return nil, ErrSkillNotFound
	}
	params := db.UpdateSkillParams{ID: skillID, WorkspaceID: workspaceID, Name: cur.Name, Description: cur.Description, Content: cur.Content}
	if req.Name != nil {
		params.Name = *req.Name
	}
	if req.Description != nil {
		params.Description = *req.Description
	}
	if req.Content != nil {
		params.Content = *req.Content
	}
	sk, err := s.store.UpdateSkill(ctx, params)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrSkillNameTaken
		}
		return nil, fmt.Errorf("update skill: %w", err)
	}
	return toSkill(sk), nil
}

func (s *SkillService) DeleteSkill(ctx context.Context, workspaceID, skillID uuid.UUID) error {
	return s.store.DeleteSkill(ctx, db.DeleteSkillParams{ID: skillID, WorkspaceID: workspaceID})
}

func toSkill(sk db.Skill) *v1.Skill {
	return &v1.Skill{
		ID:          sk.ID,
		WorkspaceID: sk.WorkspaceID,
		Name:        sk.Name,
		Description: sk.Description,
		Content:     sk.Content,
		CreatedAt:   sk.CreatedAt,
		UpdatedAt:   sk.UpdatedAt,
	}
}
```

- [ ] **Step 6: 在 service 包加 `isUniqueViolation` 辅助(若不存在)**

在 `service` 包任意 `_helper` 文件(或 agent.go 底部)加:

```go
import "github.com/jackc/pgx/v5/pgconn"

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
```

- [ ] **Step 7: 验证编译**

Run: `go build ./...`
Expected: exit 0(若 `isUniqueViolation` 与既有函数重名,改为 `isPgUniqueViolation` 并同步引用)。

- [ ] **Step 8: Commit**

```bash
git add internal/server/service/agent.go internal/server/service/skill.go
git commit -m "feat(agents): add agent and skill services with validation"
```

---

### Task 5: Handler 与路由

**Files:**
- Create: `internal/server/handler/agent.go`
- Create: `internal/server/handler/skill.go`
- Modify: `internal/server/handler/routes.go`

**Interfaces:**
- Consumes:`service.AgentService` / `service.SkillService`(Task 4)、`middleware.GetUser`。
- Produces: 路由 `GET/POST /api/v1/workspaces/:id/agents`、`GET/PATCH/DELETE /api/v1/workspaces/:id/agents/:agentId`、`GET /api/v1/workspaces/:id/runtimes`、skills 五条路由。

- [ ] **Step 1: 写 `handler/agent.go`**

```go
package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AgentHandler struct {
	agents *service.AgentService
}

func NewAgentHandler(a *service.AgentService) *AgentHandler { return &AgentHandler{agents: a} }

func (h *AgentHandler) Create(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}
	wsID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid workspace id"))
		return
	}
	var req v1.CreateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("name, daemon_id, and provider are required"))
		return
	}
	agent, err := h.agents.CreateAgent(c.Request.Context(), wsID, user.ID, req)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	c.JSON(http.StatusCreated, v1.SuccessResponse(agent, 0))
}

func (h *AgentHandler) List(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}
	wsID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid workspace id"))
		return
	}
	list, err := h.agents.ListAgents(c.Request.Context(), wsID)
	if err != nil {
		slog.Error("list agents", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to list agents"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(list, len(list)))
}

func (h *AgentHandler) Get(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}
	wsID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid workspace id"))
		return
	}
	agentID, err := uuid.Parse(c.Param("agentId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid agent id"))
		return
	}
	agent, err := h.agents.GetAgent(c.Request.Context(), wsID, agentID)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(agent, 0))
}

func (h *AgentHandler) Update(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}
	wsID, _ := uuid.Parse(c.Param("id"))
	agentID, err := uuid.Parse(c.Param("agentId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid agent id"))
		return
	}
	var req v1.UpdateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request body"))
		return
	}
	agent, err := h.agents.UpdateAgent(c.Request.Context(), wsID, agentID, req)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(agent, 0))
}

func (h *AgentHandler) Delete(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}
	wsID, _ := uuid.Parse(c.Param("id"))
	agentID, err := uuid.Parse(c.Param("agentId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid agent id"))
		return
	}
	if err := h.agents.DeleteAgent(c.Request.Context(), wsID, agentID); err != nil {
		slog.Error("delete agent", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to delete agent"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(map[string]bool{"deleted": true}, 0))
}

func (h *AgentHandler) ListRuntimes(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}
	wsID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid workspace id"))
		return
	}
	list, err := h.agents.ListRuntimes(c.Request.Context(), wsID)
	if err != nil {
		slog.Error("list runtimes", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to list runtimes"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(list, len(list)))
}

func (h *AgentHandler) writeErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrAgentNotFound):
		c.JSON(http.StatusNotFound, v1.ErrorResponse("agent not found"))
	case errors.Is(err, service.ErrAgentNameTaken):
		c.JSON(http.StatusConflict, v1.ErrorResponse("agent name already exists"))
	case errors.Is(err, service.ErrInvalidAgentName):
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid agent name"))
	case errors.Is(err, service.ErrInvalidProvider):
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("provider must be claude or codex"))
	case errors.Is(err, service.ErrDaemonMismatch):
		c.JSON(http.StatusForbidden, v1.ErrorResponse("daemon does not belong to you"))
	default:
		slog.Error("agent handler", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed"))
	}
}
```

- [ ] **Step 2: 写 `handler/skill.go`(同样模式,5 个方法)**

```go
package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type SkillHandler struct{ skills *service.SkillService }

func NewSkillHandler(s *service.SkillService) *SkillHandler { return &SkillHandler{skills: s} }

func (h *SkillHandler) Create(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}
	wsID, _ := uuid.Parse(c.Param("id"))
	var req v1.CreateSkillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("name is required"))
		return
	}
	sk, err := h.skills.CreateSkill(c.Request.Context(), wsID, user.ID, req)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	c.JSON(http.StatusCreated, v1.SuccessResponse(sk, 0))
}

func (h *SkillHandler) List(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}
	wsID, _ := uuid.Parse(c.Param("id"))
	list, err := h.skills.ListSkills(c.Request.Context(), wsID)
	if err != nil {
		slog.Error("list skills", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to list skills"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(list, len(list)))
}

func (h *SkillHandler) Get(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}
	wsID, _ := uuid.Parse(c.Param("id"))
	skillID, err := uuid.Parse(c.Param("skillId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid skill id"))
		return
	}
	sk, err := h.skills.GetSkill(c.Request.Context(), wsID, skillID)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(sk, 0))
}

func (h *SkillHandler) Update(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}
	wsID, _ := uuid.Parse(c.Param("id"))
	skillID, err := uuid.Parse(c.Param("skillId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid skill id"))
		return
	}
	var req v1.UpdateSkillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request body"))
		return
	}
	sk, err := h.skills.UpdateSkill(c.Request.Context(), wsID, skillID, req)
	if err != nil {
		h.writeErr(c, err)
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(sk, 0))
}

func (h *SkillHandler) Delete(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}
	wsID, _ := uuid.Parse(c.Param("id"))
	skillID, err := uuid.Parse(c.Param("skillId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid skill id"))
		return
	}
	if err := h.skills.DeleteSkill(c.Request.Context(), wsID, skillID); err != nil {
		slog.Error("delete skill", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to delete skill"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(map[string]bool{"deleted": true}, 0))
}

func (h *SkillHandler) writeErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrSkillNotFound):
		c.JSON(http.StatusNotFound, v1.ErrorResponse("skill not found"))
	case errors.Is(err, service.ErrSkillNameTaken):
		c.JSON(http.StatusConflict, v1.ErrorResponse("skill name already exists"))
	default:
		slog.Error("skill handler", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed"))
	}
}
```

- [ ] **Step 3: 在 routes.go 里接线**

在 `routes.go` 的 `SetupRoutes` 中,`issueSvc` 之后新增:

```go
agentSvc := service.NewAgentService(s)
skillSvc := service.NewSkillService(s)
agentHandler := NewAgentHandler(agentSvc)
skillHandler := NewSkillHandler(skillSvc)
```

在 `protected` 分组内、issue 路由之后新增:

```go
// Agent 配置
protected.GET("/workspaces/:id/agents", agentHandler.List)
protected.POST("/workspaces/:id/agents", agentHandler.Create)
protected.GET("/workspaces/:id/agents/:agentId", agentHandler.Get)
protected.PATCH("/workspaces/:id/agents/:agentId", agentHandler.Update)
protected.DELETE("/workspaces/:id/agents/:agentId", agentHandler.Delete)
protected.GET("/workspaces/:id/runtimes", agentHandler.ListRuntimes)

// Skill 管理
protected.GET("/workspaces/:id/skills", skillHandler.List)
protected.POST("/workspaces/:id/skills", skillHandler.Create)
protected.GET("/workspaces/:id/skills/:skillId", skillHandler.Get)
protected.PATCH("/workspaces/:id/skills/:skillId", skillHandler.Update)
protected.DELETE("/workspaces/:id/skills/:skillId", skillHandler.Delete)
```

- [ ] **Step 4: 验证编译**

Run: `go build ./...`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add internal/server/handler/agent.go internal/server/handler/skill.go internal/server/handler/routes.go
git commit -m "feat(agents): add agent/runtime/skill HTTP handlers and routes"
```

---

### Task 6: @mention 接线 + 校验测试

**Files:**
- Modify: `internal/server/service/issue.go`
- Test: `internal/server/service/agent_test.go`

**Interfaces:**
- Consumes:`ListAgentNamesByWorkspace`(Task 2)。
- Produces:`(*IssueService).listAgentNames(ctx, workspaceID)` 返回 enabled 的 agent 名,使 `@coder` 命中。

- [ ] **Step 1: 写失败测试(校验函数)**

`internal/server/service/agent_test.go`:

```go
package service

import "testing"

func TestNormalizeAgentName(t *testing.T) {
	cases := []struct {
		in   string
		want string
		err  error
	}{
		{"coder", "coder", nil},
		{" Coder ", "coder", nil},
		{"backend-coder", "backend-coder", nil},
		{"frontend_coder", "frontend_coder", nil},
		{"", "", ErrInvalidAgentName},
		{"bad name", "", ErrInvalidAgentName},
		{"-lead", "", ErrInvalidAgentName},
	}
	for _, c := range cases {
		got, err := normalizeAgentName(c.in)
		if err != c.err || got != c.want {
			t.Errorf("normalizeAgentName(%q) = (%q, %v), want (%q, %v)", c.in, got, err, c.want, c.err)
		}
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/server/service/ -run TestNormalizeAgentName -v`
Expected: FAIL(函数未定义)。

- [ ] **Step 3: 实现 `normalizeAgentName`(Task 4 已含,若已存在则跳过)**

确认 `service/agent.go` 中 `normalizeAgentName` 已定义(见 Task 4 Step 1)。

- [ ] **Step 4: 改 `issue.go` 的 `listAgentNames` 为方法**

把:

```go
func listAgentNames(ctx context.Context, workspaceID uuid.UUID) ([]string, error) {
	return nil, nil
}
```

改为:

```go
func (s *IssueService) listAgentNames(ctx context.Context, workspaceID uuid.UUID) ([]string, error) {
	return s.store.ListAgentNamesByWorkspace(ctx, workspaceID)
}
```

并把 `issue.go` 中两处调用 `listAgentNames(ctx, workspaceID)` 改为 `s.listAgentNames(ctx, workspaceID)`。

- [ ] **Step 5: 运行测试确认通过**

Run: `go test ./internal/server/service/ -run TestNormalizeAgentName -v`
Expected: PASS。

- [ ] **Step 6: 全量后端测试**

Run: `go test -race $(go list ./... | grep -v '/web/')`
Expected: PASS(如 `-race` 受平台限制,至少 `go test ./...` 通过)。

- [ ] **Step 7: Commit**

```bash
git add internal/server/service/issue.go internal/server/service/agent_test.go
git commit -m "feat(agents): wire @mention resolution to enabled agents"
```

---

### Task 7: daemon 侧 ReplaceRuntimes 稳定化 + provider 命名

**Files:**
- Modify: `internal/server/service/daemon.go`
- Modify: `internal/daemon/runtime_claude.go`

**Interfaces:**
- Consumes:`db.InsertRuntimeParams`(现有)、`db.ClearRuntimes`(现有)。
- Produces:`ReplaceRuntimes` 改为 upsert + 删除缺位;daemon 上报的 provider 稳定(`claude` / `codex`)。

- [ ] **Step 1: 给 `runtimes` 查询加「删除缺位」**

在 `internal/server/store/queries/daemons.sql` 追加:

```sql
-- name: DeleteRuntimesNotIn :exec
DELETE FROM runtimes
WHERE daemon_id = $1 AND name != ALL($2::text[]);
```

- [ ] **Step 2: 重新生成 sqlc**

Run: `sqlc generate`
Expected: `DeleteRuntimesNotIn` 生成。

- [ ] **Step 3: 改写 `ReplaceRuntimes`**

把 `internal/server/service/daemon.go` 的 `ReplaceRuntimes` 从「Clear + Insert」改为「upsert + 删除缺位」:

```go
func (s *DaemonService) ReplaceRuntimes(ctx context.Context, daemonID uuid.UUID, runtimes []v1.Runtime) error {
	names := make([]string, 0, len(runtimes))
	for _, rt := range runtimes {
		if _, err := q.InsertRuntime(ctx, db.InsertRuntimeParams{
			DaemonID:       daemonID,
			Kind:           rt.Kind,
			Name:           rt.Kind, // provider 标识;kind/name 收敛后仅此一处
			ExecutablePath: rt.ExecutablePath,
			Version:        rt.Version,
			Status:         "available",
			MaxConcurrency: int32(rt.MaxConcurrency),
		}); err != nil {
			return fmt.Errorf("insert runtime: %w", err)
		}
		names = append(names, rt.Kind)
	}
	if err := q.DeleteRuntimesNotIn(ctx, db.DeleteRuntimesNotInParams{DaemonID: daemonID, Column2: names}); err != nil {
		return fmt.Errorf("delete stale runtimes: %w", err)
	}
	return nil
}
```

(注意:`DeleteRuntimesNotInParams` 的实际字段名以 sqlc 生成为准,可能是 `Name`;用 `sqlc.arg` 或重写查询让 `$2` 映射为 `[]string`。若 sqlc 把 `$2::text[]` 命名成 `Column2`,按生成名调整。)

- [ ] **Step 4: 确认 daemon 上报 provider 为短 slug**

`internal/daemon/runtime_claude.go` 保持 `const kind = "claude"`;`runtime_codex.go` 保持 `const kind = "codex"`。无需改动(二者已是 Multica 同款 slug)。

- [ ] **Step 5: 验证编译 + 测试**

Run: `go build ./... && go test ./internal/daemon/... ./internal/server/service/...`
Expected: exit 0。

- [ ] **Step 6: Commit**

```bash
git add internal/server/store/queries/daemons.sql internal/server/store/db/ internal/server/service/daemon.go
git commit -m "fix(daemon): stabilize runtime ids via upsert + delete-absent"
```

---

### Task 8: daemon 按 provider 现查模型列表

**Files:**
- Create: `internal/daemon/models.go`
- Test: `internal/daemon/models_test.go`

**Interfaces:**
- Consumes:`v1.Runtime`(现有)、`runVersionCmd`(现有)。
- Produces:`ListModels(ctx, provider, executablePath) ([]v1.Model, error)`,供后续 runtime 循环派发时填充 agent 模型下拉。

- [ ] **Step 1: 在 `pkg/types/v1/agent.go` 加 Model 类型**

```go
// Model is a single LLM model a provider exposes.
type Model struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Provider string `json:"provider,omitempty"`
	Default  bool   `json:"default,omitempty"`
}
```

- [ ] **Step 2: 写失败测试**

`internal/daemon/models_test.go`:

```go
package daemon

import "testing"

func TestParseModelsCodex(t *testing.T) {
	got := parseCodexModels("gpt-5.4\nclaude-sonnet-4-6\ngpt-5.5")
	if len(got) != 3 || got[0].ID != "gpt-5.4" || got[2].ID != "gpt-5.5" {
		t.Fatalf("unexpected models: %+v", got)
	}
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `go test ./internal/daemon/ -run TestParseModelsCodex -v`
Expected: FAIL。

- [ ] **Step 4: 实现 `models.go`**

```go
package daemon

import (
	"context"
	"strings"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// ListModels queries a provider CLI for its supported models. It fails open:
// an unsupported provider or a CLI error returns an empty list.
func ListModels(ctx context.Context, provider, executablePath string) ([]v1.Model, error) {
	switch provider {
	case "codex":
		out, err := runVersionCmd(executablePath, "debug", "models")
		if err != nil {
			return nil, nil
		}
		return parseCodexModels(out), nil
	case "claude":
		out, err := runVersionCmd(executablePath, "model", "list")
		if err != nil {
			return nil, nil
		}
		return parseClaudeModels(out), nil
	default:
		return nil, nil
	}
}

func parseCodexModels(out string) []v1.Model {
	var models []v1.Model
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		models = append(models, v1.Model{ID: line, Label: line, Provider: "codex"})
	}
	return models
}

func parseClaudeModels(out string) []v1.Model {
	var models []v1.Model
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		models = append(models, v1.Model{ID: line, Label: line, Provider: "claude"})
	}
	return models
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `go test ./internal/daemon/ -run TestParseModelsCodex -v`
Expected: PASS。

- [ ] **Step 6: 验证编译**

Run: `go build ./...`
Expected: exit 0。

- [ ] **Step 7: Commit**

```bash
git add internal/daemon/models.go internal/daemon/models_test.go pkg/types/v1/agent.go
git commit -m "feat(daemon): discover provider model lists on demand"
```

---

### Task 9: 前端 API 类型与方法

**Files:**
- Modify: `web/lib/api.ts`

**Interfaces:**
- Consumes:`api` 封装(现有)。
- Produces:`Agent` / `AgentRuntime` / `Skill` 类型 + `agentApi` / `runtimeApi` / `skillApi`。

- [ ] **Step 1: 在 api.ts 末尾追加**

```ts
// ── Agents ────────────────────────────────────────────────────────────

export interface AgentRuntime {
  id: string;
  workspace_id: string;
  daemon_id?: string | null;
  name: string;
  runtime_mode: "local" | "cloud";
  provider: string;
  status: "online" | "offline";
  daemon_name?: string;
  daemon_status?: string;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  instructions: string;
  model: string;
  runtime_id: string;
  enabled: boolean;
  skills?: Skill[];
  runtime?: AgentRuntime;
  created_at: string;
  updated_at: string;
}

export const agentApi = {
  list: (workspaceId: string) => api.get<Agent[]>(`/api/v1/workspaces/${workspaceId}/agents`),
  get: (workspaceId: string, agentId: string) =>
    api.get<Agent>(`/api/v1/workspaces/${workspaceId}/agents/${agentId}`),
  create: (workspaceId: string, body: {
    name: string;
    description?: string;
    instructions?: string;
    model?: string;
    daemon_id: string;
    provider: string;
    skill_ids?: string[];
    enabled?: boolean;
  }) => api.post<Agent>(`/api/v1/workspaces/${workspaceId}/agents`, body),
  update: (workspaceId: string, agentId: string, body: {
    name?: string;
    description?: string;
    instructions?: string;
    model?: string;
    daemon_id?: string;
    provider?: string;
    skill_ids?: string[];
    enabled?: boolean;
  }) => api.patch<Agent>(`/api/v1/workspaces/${workspaceId}/agents/${agentId}`, body),
  remove: (workspaceId: string, agentId: string) =>
    api.delete<{ deleted: boolean }>(`/api/v1/workspaces/${workspaceId}/agents/${agentId}`),
};

export const runtimeApi = {
  list: (workspaceId: string) => api.get<AgentRuntime[]>(`/api/v1/workspaces/${workspaceId}/runtimes`),
};

export const skillApi = {
  list: (workspaceId: string) => api.get<Skill[]>(`/api/v1/workspaces/${workspaceId}/skills`),
  create: (workspaceId: string, body: { name: string; description?: string; content?: string }) =>
    api.post<Skill>(`/api/v1/workspaces/${workspaceId}/skills`, body),
  update: (workspaceId: string, skillId: string, body: { name?: string; description?: string; content?: string }) =>
    api.patch<Skill>(`/api/v1/workspaces/${workspaceId}/skills/${skillId}`, body),
  remove: (workspaceId: string, skillId: string) =>
    api.delete<{ deleted: boolean }>(`/api/v1/workspaces/${workspaceId}/skills/${skillId}`),
};
```

- [ ] **Step 2: 类型检查**

Run: `cd web && bun run lint`
Expected: 零告警。

- [ ] **Step 3: Commit**

```bash
git add web/lib/api.ts
git commit -m "feat(web): add agent/runtime/skill API client"
```

---

### Task 10: 前端 Agents 标签页与编辑对话框

**Files:**
- Create: `web/components/agents/agents-tab.tsx`
- Create: `web/components/agents/agent-dialog.tsx`
- Modify: `web/app/console/workspaces/[id]/page.tsx`(在 Overview/Issues 标签旁加 Agents 标签)

**Interfaces:**
- Consumes:`agentApi` / `runtimeApi` / `skillApi`(Task 9)、`useWorkspaceId`(参照 workspace 详情页现有取参方式)。
- Produces:`AgentsTab`(props: `workspaceId: string`)与 `AgentDialog`(props: `workspaceId`, `agent?: Agent | null`, `onClose: () => void`)。

- [ ] **Step 1: 实现 `agents-tab.tsx`**

参照 `web/app/console/workspaces/[id]/settings/page.tsx` 的列表 + 对话框模式。要点:

- `useEffect`/TanStack Query 或 `agentApi.list` + `useState` 拉取列表(项目现有前端用 `useState` + `useEffect` 的简单模式,与 `live-agent-log.tsx` 一致)。
- 空态文案「No agents yet」。
- 每行显示:name、description 摘要、runtime(provider + daemon_name)、enabled 开关。
- 右上「New agent」按钮打开 `AgentDialog`。
- 编辑按钮复用 `AgentDialog`(传入 `agent`)。

- [ ] **Step 2: 实现 `agent-dialog.tsx`**

表单字段(对照 spec §9):`name`(必填)、`description`、`instructions`(多行)、`runtime`(选择器:从 `runtimeApi.list` 拿 `(daemon_id, provider)` 组合)、`model`(选择器 + 自定义输入)、`skills`(多选,来自 `skillApi.list`)、`enabled`(开关)。提交调 `agentApi.create` 或 `agentApi.update`。

- [ ] **Step 3: 在 workspace 详情页接入 Agents 标签**

在 `web/app/console/workspaces/[id]/page.tsx` 的标签栏加第三项 `Agents`,渲染 `<AgentsTab workspaceId={id} />`。

- [ ] **Step 4: lint + 构建**

Run: `cd web && bun run lint && bun run build`
Expected: 零告警,构建成功。

- [ ] **Step 5: Commit**

```bash
git add web/components/agents/ "web/app/console/workspaces/[id]/page.tsx"
git commit -m "feat(web): add agents tab with runtime/model picker"
```

---

### Task 11: 前端 Skills 管理

**Files:**
- Create: `web/components/agents/skills-tab.tsx`
- Create: `web/components/agents/skill-dialog.tsx`
- Modify: `web/app/console/workspaces/[id]/page.tsx`(加 Skills 标签)

**Interfaces:**
- Consumes:`skillApi`(Task 9)。
- Produces:`SkillsTab`(props: `workspaceId: string`)、`SkillDialog`(props: `workspaceId`, `skill?: Skill | null`, `onClose`)。

- [ ] **Step 1: 实现 `skills-tab.tsx`** —— 列表(name/description)+「New skill」按钮 + 编辑,`skillApi.list`。
- [ ] **Step 2: 实现 `skill-dialog.tsx`** —— 表单 `name` / `description` / `content`(多行),提交 `skillApi.create` / `update`。
- [ ] **Step 3: 接入 workspace 详情页标签** —— 加 `Skills` 标签渲染 `<SkillsTab workspaceId={id} />`。
- [ ] **Step 4: lint + 构建**

Run: `cd web && bun run lint && bun run build`
Expected: 零告警,构建成功。

- [ ] **Step 5: Commit**

```bash
git add web/components/agents/ "web/app/console/workspaces/[id]/page.tsx"
git commit -m "feat(web): add skills management tab"
```

---

## Self-Review

- **Spec 覆盖**:§2 术语(provider/runtime_mode/model)在 Task 1/3 落地;§5 四张表在 Task 1;§6 API 在 Task 5;§7 校验在 Task 4;§8 @mention 在 Task 6;§9 前端在 Task 10/11;§10 daemon 改造在 Task 7/8;model(D7)在 Task 8/10。无遗漏。
- **类型一致性**:`CreateAgentParams` 字段名与 Task 1 schema 一致;`ListAgentsByWorkspaceRow` 的 `RuntimeProvider/RuntimeName/RuntimeDaemonID` 由 Task 2 查询的别名生成;`UpdateAgentParams` 字段在 Task 2 查询定义。
- **占位扫描**:无 TBD/TODO;前端 Task 10/11 因需复用现有 UI 模式而未逐行贴 TSX,但给出了确切文件、props、字段与 API 调用,足以实施。

## 执行交接

计划已存 `docs/superpowers/plans/2026-09-02-agent-subsystem.md`。两种执行方式:

1. **Subagent-Driven(推荐)**:每个任务派一个全新 subagent,任务间我做 review。
2. **Inline Execution**:在本会话用 executing-plans 批量执行、带检查点。

选哪种?
