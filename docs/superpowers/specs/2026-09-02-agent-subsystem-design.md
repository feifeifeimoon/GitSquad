# Agent 子系统设计(Agent / Runtime / Skill)

- 日期:2026-09-02
- 状态:待评审
- 参考实现:Multica(`D:\odyssey\multica`),命名与数据模型对齐

## 1. 背景与目标

GitSquad 目前完成了 issue 黑板、workspace、GitHub App link、daemon 骨架,但「agent」这个产品核心还没有落地。本设计定义 agent 子系统的实体与关系,是后续 runtime 执行循环(第 6 章)和任务派发(第 9 章)的底座。

核心结论:**agent 是「人设」,runtime 是「执行环境」,二者通过可变绑定关联。agent 不携带 provider / coder_backend / role / environment 这些执行细节。**

### 本设计范围(Goal)

- 定义 `agent`、`agent_runtime`、`skill` 三个实体及其关系。
- 明确 daemon / workspace / agent / runtime / skill / issue 的关系模型。
- 定义命名(对齐 Multica)与校验规则。

### 非目标(Non-Goal)

- runtime **执行循环**(clone → 上下文组装 → 驱动 provider → 回写 → 报告,第 6 章):本设计只定义 runtime 实体,不定义执行内核。
- 任务派发(第 9 章)、cloud runtime(第 8 章)、Squad(未来)、`@squad` 集体提及。

## 2. 术语表(对齐 Multica)

| 概念 | 术语 | 表 |
|------|------|-----|
| 执行环境 | **Runtime** | `agent_runtimes` |
| 编码 CLI(Claude Code / Codex…) | **`provider`** | `agent_runtimes.provider` |
| 模型 | **`model`** | `agents.model` |
| 本地 / 云端 | **`runtime_mode`** | `agent_runtimes.runtime_mode` |
| 智能体 | **Agent** | `agents` |
| 技能 | **Skill** | `skills` / `skill_files` / `agent_skills` |
| 守护进程 | Daemon(用户级) | `daemons`(现有) |

`provider` 取值是 CLI 短 slug(Multica 同款):`claude`、`codex`、`opencode`、`openclaw`、`hermes`、`gemini`、`pi`、`cursor`、`kimi`、`kiro`…MVP 先支持 `claude` 与 `codex`(现有 daemon 探测适配器已覆盖)。

## 3. 实体关系模型

```
User (账号 / owner)
├── 1:N  Daemon ── 1:N  daemon_runtimes(探测到的 CLI)    用户级:这台机器有哪些 provider
└── 1:N  Workspace ── N:1  GitHubRepo                    绑定层
        ├── 1:N  AgentRuntime ── N:1  Daemon            workspace 级:执行目标 = (daemon, provider)
        │         ▲
        │         │ N:1 (runtime_id, 可变绑定)
        ├── 1:N  Agent ── M:N ── Skill                  人设 + 技能
        ├── 1:N  Skill                                   workspace 级技能库
        └── 1:N  Issue ── 1:N  IssueComment              黑板

弱关联(无 FK):
• Issue ⇄ Agent         : @mention / assigned_agents,按 name 关联
• Agent(cloud)          : 未来 spawn sandbox,不经过 Daemon
```

### 关系表

| 关系 | 基数 | 说明 |
|------|------|------|
| User → Daemon | 1:N | daemon 注册到用户(非 workspace) |
| Daemon → daemon_runtimes | 1:N | 探测到的 CLI 能力(用户级) |
| User → Workspace | 1:N | workspace 属于 user |
| Workspace → AgentRuntime | 1:N | workspace 级执行目标 |
| AgentRuntime → Daemon | N:1 | 执行目标落在哪台机器 |
| Agent → AgentRuntime | N:1 | 可变绑定(可改指到另一台 daemon 的 runtime) |
| Agent ⇄ Skill | M:N | 技能挂载 |
| Workspace → Issue | 1:N | 黑板 |
| Issue ⇄ Agent | N:M 按名 | @mention,非 FK |

## 4. 关键决策

### D1:agent 是「人设 + runtime 绑定」,执行细节下放 runtime

agent 只回答「它是谁、做什么」,不回答「在哪跑、用什么跑」。因此 agent 上**删除** `coder_backend`、`role`、`environment` 三个字段:

- `coder_backend` → 变成 runtime 的 `provider`
- `environment` → 变成 runtime 的 `runtime_mode`
- `role` → 由 `description` + `instructions` 表达(更灵活,不硬编码 planner/coder/reviewer)

### D2:provider 是 runtime 的属性

编码 CLI(Claude Code / Codex)是「这台机器上检测到的工具」,属于执行环境,不属于 agent。agent 通过绑定的 runtime 间接确定 provider。

### D3:daemon 用户级,runtime workspace 级

- daemon 注册到 User,服务该 user 下所有 workspace(沿用现有决策 4 与 `daemons` 表)。
- runtime 是 workspace 级执行目标(`agent_runtimes.workspace_id NOT NULL`),由「daemon + provider」构成,一台机器装了几个 CLI 就派生几个 runtime。
- 选 runtime 时只能从「该 agent 所属 workspace 的 owner == daemon 的 owner」的 daemon 中选,把派发时的 owner 隔离提前到配置时。

### D4:skill 是结构化实体,不是文本标签

skill 是 workspace 级可复用说明文档(name / description / content),M:N 挂载到 agent。未来 daemon 认领任务时把挂载的 skill 内容注入工作目录的 provider 原生位置(Claude Code → `.claude/skills/{name}/SKILL.md`,Codex → `CODEX_HOME/skills/{name}/`)。MVP 先建 `skills` + `agent_skills`,跳过 `skill_files`(多文件支持)。

### D5:Squad = 未来 User 级可复用团队

Squad 是 User 级实体,一套 agent 团队可复用到多个 workspace。**本次不建表**,只留缝:未来给 `agents` 加 `squad_id`、给 `workspaces` 加 `squad_id`,并把每个既有 workspace 的 agents 回填进一个默认 squad。详见 §12。

### D6:命名对齐 Multica

统一用 `provider`(短 slug `claude` / `codex`),**废弃 spec 里的 `claude-code`**。GitSquad 现有 daemon 探测已上报 `claude`,与服务端 `service/daemon.go` 里 `Name mirrors Kind` 的临时写法一并修正(见 §10)。

### D7:model 是 agent 的可选覆盖,按 provider 决定、支持自由输入

`agents.model`(TEXT,空 = 用 provider 默认)让 agent 在绑定的 runtime 上选择具体模型:codex 下选 gpt 系列,claude 下选 claude 系列。可用模型列表由 daemon 按 provider 从 CLI 现查(如 `codex debug models`、`claude model list`,对应 Multica 的 `agent.ListModels`),列表不落库、按需拉取;模型 ID 字符串直传给 CLI,自由输入始终可用。provider 不支持模型选择或现查失败时 fail-open 退化为仅自由输入。

## 5. 数据模型

沿用 GitSquad 现有复数表名约定(`users`、`workspaces`、`daemons`)。新表如下。

```sql
-- Runtime:workspace 级执行目标,由用户级 daemon 探测的 provider 构成
CREATE TABLE agent_runtimes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    daemon_id    UUID REFERENCES daemons(id),            -- local 非空;cloud 为空(第8章)
    name         TEXT NOT NULL,                          -- 人类可读名
    runtime_mode TEXT NOT NULL DEFAULT 'local'
        CHECK (runtime_mode IN ('local', 'cloud')),
    provider     TEXT NOT NULL,                          -- 'claude' | 'codex' | ...
    status       TEXT NOT NULL DEFAULT 'offline'
        CHECK (status IN ('online', 'offline')),
    device_info  TEXT NOT NULL DEFAULT '',
    metadata     JSONB NOT NULL DEFAULT '{}',
    last_seen_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, daemon_id, provider)
);

-- Agent:人设 + 可变 runtime 绑定
CREATE TABLE agents (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,                          -- @mention 主键(小写规范化)
    description  TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    model        TEXT NOT NULL DEFAULT '',               -- 可选,覆盖 provider 默认模型
    runtime_id   UUID NOT NULL REFERENCES agent_runtimes(id) ON DELETE RESTRICT,
    enabled      BOOLEAN NOT NULL DEFAULT true,
    created_by   UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name)
);

-- Skill:workspace 级结构化技能
CREATE TABLE skills (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    content      TEXT NOT NULL DEFAULT '',
    created_by   UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name)
);

-- Agent ⇄ Skill 多对多挂载
CREATE TABLE agent_skills (
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (agent_id, skill_id)
);
```

### 与现有 `runtimes` 表的关系

现有 `runtimes` 表(daemon 级:daemon_id, kind, name, executable_path, version, status)存的是「这台 daemon 探测到了哪些 CLI」,在新模型里定位为**用户级探测数据**,是「runtime 选择器」的数据来源。`agent_runtimes` 则是**workspace 级执行目标**。

- 二者不合并:daemon 探测(用户级,一次)+ runtime 绑定(workspace 级,按需创建)。
- provider 值必须来自该 daemon 的探测结果(server 校验,见 §7)。
- 命名:建议把现有 `runtimes` 更名为 `daemon_runtimes` 以区别于 `agent_runtimes`(实现阶段落实)。

## 6. API 设计

沿用 Handler → Service → Store(sqlc)+ `APIResponse` 信封,端点挂在 `protected`(用户 JWT)下的 workspace 资源。

```
# Agent
GET    /api/v1/workspaces/:id/agents
POST   /api/v1/workspaces/:id/agents
GET    /api/v1/workspaces/:id/agents/:agentId
PATCH  /api/v1/workspaces/:id/agents/:agentId
DELETE /api/v1/workspaces/:id/agents/:agentId

# Runtime(只读列表,来自该 user 的 daemon 探测;绑定由创建/更新 agent 时通过 runtime_id 完成)
GET    /api/v1/workspaces/:id/runtimes

# Skill
GET    /api/v1/workspaces/:id/skills
POST   /api/v1/workspaces/:id/skills
GET    /api/v1/workspaces/:id/skills/:skillId
PATCH  /api/v1/workspaces/:id/skills/:skillId
DELETE /api/v1/workspaces/:id/skills/:skillId
```

**runtime 绑定如何落地**:`GET /runtimes` 返回该 workspace 可选的执行目标 = 该 user 各在线 daemon 探测到的 `(daemon_id, provider)` 组合。创建/更新 agent 时,请求携带 `daemon_id` + `provider`(而非让客户端自己建 runtime),service 按 `UNIQUE (workspace_id, daemon_id, provider)` **upsert** 出 `agent_runtime` 行再绑定 `agent.runtime_id`。这样 agent 改绑到另一台 daemon 时只需改请求里的 `daemon_id`,runtime 行按需创建、无冗余。

请求/响应类型放 `pkg/types/v1/agent.go`:`Agent` / `CreateAgentRequest` / `UpdateAgentRequest`(更新用指针字段区分「未传」与「置空」)。查询集中在 `internal/server/store/queries/agents.sql`,sqlc 生成。

## 7. 校验规则

| 字段 | 规则 |
|------|------|
| `agent.name` | 必填;`^[a-z0-9][a-z0-9_-]{0,63}$`;写入前小写化;workspace 内唯一 |
| `agent.runtime_id` | 必填;必须指向同 workspace 的 `agent_runtime` |
| `agent_runtime.provider` | 必填;必须是 daemon 探测到的 provider |
| `agent_runtime` owner | daemon 的 owner 必须等于 workspace 的 owner(配置时隔离) |
| `skill.name` | 必填;workspace 内唯一 |
| `enabled` | 可选,默认 `true` |

`enabled=false` 的语义:agent 从 @mention 匹配中排除(即 `@已禁用agent` 落入 unmatched 并追加系统提示),且不参与派发。

## 8. @mention 接线

`service/mentions.go` 的 `processMentions(content, agentNames)` 已预留 agent 名单参数。接线:issue service 把实参从空数组换成「该 workspace 下 `enabled=true` 的 agent name 列表」。这是 agent 子系统与既有系统的唯一耦合点。

## 9. 前端

- workspace 详情页新增 **Agents 标签**(与 Overview / Issues 并列):列表 + 新建/编辑对话框,字段 = name / description / instructions / runtime 选择器 / model 选择器 / skills 勾选 / enabled。
- Runtime 选择器:列出该 user 在线 daemon 探测到的 provider,选中即绑定对应 `agent_runtime`。
- Model 选择器:按 provider 分组展示 daemon 现查到的可用模型,附「自定义模型」自由输入框;空值 = provider 默认。
- workspace 下新增 **Skills 管理**:列表 + 新建/编辑(name / description / content)+ 在 agent 编辑里勾选挂载。
- issue 编辑器 @mention 自动补全作为可选增强,不进 MVP 核心。

## 10. Daemon 侧改动

- provider 探测适配器(现有 `runtime_claude.go` / `runtime_codex.go`)保持不变,上报 `claude` / `codex`。
- 修 `service/daemon.go` 的 `ReplaceRuntimes`:从「`ClearRuntimes` + `InsertRuntime`」改为 **upsert + 删除缺位**(与 `github.sql` 的 `DeleteReposNotInList` 同思路),保证同一 `(daemon_id, provider)` 的行 ID 稳定,不再每次重连都变。
- 取消 `Name mirrors Kind` 的临时写法:探测表只保留一个 `provider` 标识(把 `kind`/`name` 收敛为 `provider`)。
- daemon 离线 → 关联 `agent_runtimes` 标记 `status=offline`(不删除),agent 显示「不可运行」直到重新指定或 daemon 回归。
- 模型发现:daemon 新增「按 provider 现查模型列表」能力(对应 Multica 的 `agent.ListModels`),server 请求时 daemon 跑 CLI(如 `codex debug models`)回传;失败 fail-open 报空列表,前端退化为仅自由输入。

## 11. MVP 范围 / 后续

**MVP(本次落地):** agents + agent_runtimes + skills 三表;agent/runtime/skill 的 CRUD API;agent 的 `model` 字段 + daemon 现查模型列表 + 自由输入;@mention 接线;前端 Agents 标签(含 runtime/model/skills 选择)+ Skills 管理;daemon `ReplaceRuntimes` 稳定性修正 + 模型发现。

**后续(独立设计):** runtime 执行循环(第 6 章)、任务派发(第 9 章)、cloud runtime(第 8 章)、Squad、`@squad`、`skill_files` 多文件、issue 编辑器 @mention 自动补全、agent 的 live status(idle/working/offline,由 runtime/任务状态派生)。

## 12. Future:Squad(留缝)

Squad = User 级可复用团队。未来迁移(纯增量,不推翻 MVP):

1. 新建 `squads`(User 1:N)+ `squads.name`。
2. 给 `agents` 加可空 `squad_id`、给 `workspaces` 加可空 `squad_id`。
3. 为每个既有 workspace 回填一个默认 squad(把它现有 agents 挪进去)。
4. 之后新建 workspace 可选「复用已有 squad」或「新建 squad」。
5. 前端「workspace 详情页的 Agents 标签」交互路径不变,底层容器从 workspace 换成 squad 时对外 API 不做破坏性变更。
