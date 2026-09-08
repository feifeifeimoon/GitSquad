# Runtime 执行内核设计(第 6 章)

- 日期:2026-09-08(v2 修订)
- 状态:待评审
- 前置:
  - agent 子系统设计(`docs/superpowers/specs/2026-09-02-agent-subsystem-design.md`)
  - daemon runtime 探测重写(openspec change `daemon-runtime-detection`)
- 参考实现(本版对照源码):
  - Multica:`server/pkg/agent/agent.go`(流式 Backend 接口)、`server/internal/daemon/execenv/`(per-task 执行环境)
  - Orca:`src/main/codex/*`(codex app-server JSON-RPC)
- 关联章节:第 9 章任务派发(生成/路由任务)、第 10 章 PR 回流

> v2 相对 v1 的两处根本修正:
> 1. 用**流式、会话感知的 `provider.Backend`** 取代 v1 的「`Run() → RunResult`」一次请求一次响应(v1 的 `CoderBackend` 已废弃)。
> 2. 新增 **execenv(per-task 执行环境)**:上下文不是拼成一个大 prompt,而是写进隔离任务目录的原生文件(CLAUDE.md / AGENTS.md / skill)。

## 1. 背景与目标

GitSquad 已落地平台侧(issue 黑板、workspace、GitHub App link、daemon 骨架)与 agent 配置(agent/runtime/skill)。但「agent 真正动手改代码」仍是空的:daemon 收到 `task_wake`/`task_available` 后只有 `// TODO: claim and execute task`,client 没有任务接口,SaaS 侧 `dispatchForMention` 是空 seam,没有任务表。

本章定义 **Runtime 执行内核**——一套与部署位置无关的代码,让 agent 从「认领任务」一路走到「提 PR + 回写 Issue」。它是第 8 章 CloudShell、第 9 章任务派发的共同底座。

核心结论:**Runtime 内核 = 薄壳,把任务上下文落成文件、驱动现成编码器流式干活、把产物和 PR 收回来;agent loop 由编码器自己跑,GitSquad 不重建。**

## 2. 术语表

| 术语 | 含义 |
|------|------|
| Task(任务) | 一次 @mention 派生的最小执行单元,携带 Issue 上下文 + agent 快照 + repo 凭证 |
| execenv(执行环境) | per-task 隔离目录,内含注入的上下文文件与 skill |
| brief(任务简报) | 注入到 CLAUDE.md/AGENTS.md 的受管指令块(agent 人设 + issue 摘要 + 回复指引) |
| Runtime 内核 | 与 Shell 无关的执行循环:prepare env → checkout → execute(流式) → collect → writeback → report |
| Backend | provider 的流式驱动接口(`Execute → Session`) |
| Session | 一次执行:`Messages`(事件流)+ `Result`(终态)两个通道 |
| provider | 编码 CLI 短标识(`claude` / `codex`) |
| installation token | GitHub App 短期凭证,用于 clone 与 push |

## 3. 范围

### Goal

- 定义 Runtime 内核的执行步骤与组件接口(execenv 准备、checkout、流式驱动、产物收集、回写、进度报告)。
- 定义流式 `Backend` 接口(对标 Multica 的 `agent.Backend`),落地至少一个 provider(优先 `claude`,其次 `codex`)。
- 定义 execenv:per-task 目录 + 上下文文件 + skill 原生注入。
- 定义任务输入契约(`v1.Task`),作为与第 9 章的边界。
- 把执行循环接进现有 daemon 事件循环,SaaS 侧打通「任务组装 → 派发 → PR 创建 → Issue 回写」。

### Non-Goal

- **任务持久化/路由/生命周期状态机 = 第 9 章**。本设计只定 `v1.Task` 契约与执行语义。
- **CloudShell + SandboxProvider = 第 8 章**。Runtime 内核与 Shell 解耦,不实现 sandbox。
- **PR 事件回流、合并自动关闭 Issue = 第 10 章**。本设计只到「push 分支 → SaaS 建 PR → 写 Issue」。
- **多 provider 广度**:MVP 只做 `claude` + `codex`(后者可选);不复制 Multica 的 14 个 adapter。
- **session 恢复、多轮对话、squad/autopilot/chat**:Multica 有,但 GitSquad MVP 不做(见 §11)。`Backend` 接口留 `ResumeSessionID` 缝位但不实现。
- fork/upstream 同步、计费、用量日志(第 11 章)。

## 4. 架构总览

```
SaaS
 ├─ Issue 黑板(@mention → dispatchForMention → 组装任务快照)
 ├─ 任务派发(第 9 章:入队 + WS task_wake / heartbeat_ack task_available)
 ├─ GitHub App service(发 installation token、建 PR、写 Issue 回写)
 └─ daemon 端点(认领任务 / 回报进度)

Daemon(LocalShell)                              Runtime 内核(共享,与 Shell 无关)
 ├─ WS 读循环(task_wake / task_available)         Runner.Run(ctx, task)
 ├─ 认领 HTTP 客户端                                 ├─ 1. execenv.Prepare(写 CLAUDE.md/issue_context.md/skill)
 ├─ 心跳(active_tasks)                              ├─ 2. git checkout(clone/fetch + per-task 分支)
 └─ 顺序执行器(max_concurrency=1)                    ├─ 3. backend.Execute(trigger, opts) → Session
                                                    │      ├─ stream Messages → 上报进度
                                                    │      └─ 等 Result
                                                    ├─ 4. 收集产物(diff / test / logs)
                                                    ├─ 5. git commit + push(installation token)
                                                    └─ 6. 回报终态 + 产物摘要
```

一次任务端到端:

```
@coder → 任务入队 → task_wake → daemon 认领(拿任务快照 + installation token)
       → execenv 准备(隔离目录 + 上下文文件 + skill 注入)
       → clone/fetch → 切 per-task 分支
       → backend.Execute(短触发 prompt) → 流式上报 text/thinking/tool 事件 → 等 Result
       → 收集 diff/test/logs → commit + push → 回报成功
       → SaaS 建 PR(body 引用 Issue)+ 写 Issue 评论/状态
```

## 5. 关键决策

### D1:Runtime 内核与 Shell 的解耦点 = 「工作环境」注入

Runtime 内核只依赖注入的 `RuntimeEnv`(workdir、凭证、任务来源、上报通道),不感知 local/cloud。LocalShell 提供持久 workdir + installation token + HTTP 上报;CloudShell(第 8 章)提供干净 workdir + 启动注入任务参数 + 同样的上报通道。

理由:与 build-gitsquad-mvp design.md 决策 5 一致——差异封装在 Shell 层。

### D2:流式、会话感知的 `provider.Backend`(取代 v1 的 `CoderBackend`)

编码 CLI 不是「跑一条命令拿一个输出」,而是**流式产出事件、有会话状态**的过程。`Backend` 对齐 Multica 的 `agent.Backend`:

```go
type Backend interface {
    Execute(ctx context.Context, prompt string, opts ExecOptions) (*Session, error)
}
```

- `Session.Messages` 是事件流(agent 工作期间持续产出),`Session.Result` 是唯一终态。
- 统一事件模型 `Message{Type, Content, Tool, CallID, Input, Output, Status}`,类型 = `text / thinking / tool-use / tool-result / status / error / log`。
- 进度上报、产物收集(工具调用/测试结果)都从事件流派生,而不是事后读一个 stdout。

**已对照源码核实的调用方式**(见 §6.2):

- **claude**(`multica/server/pkg/agent/claude.go`):`claude -p --output-format stream-json --input-format stream-json --verbose --strict-mcp-config --permission-mode bypassPermissions --disallowedTools AskUserQuestion [--model …] [--effort …] [--max-turns …] [--append-system-prompt …]`。prompt 以 stream-json 写 stdin,stdout 逐行解析 JSONL 事件。
- **codex**(`multica/server/pkg/agent/codex.go` + `orca/src/main/codex/*`):`codex app-server --listen stdio://`(JSON-RPC 2.0),经 `initialize → thread/start → turn/start` 驱动;模型走 `-c model="…"`。

理由:GitSquad 是编排壳,不自建 LLM 工具循环;Multica/Orca 均验证该形态。残余风险是 flag 随版本漂移——适配器做薄、版本探测已有(第 5 章),必要时按版本分叉。

### D3:execenv——上下文落成文件,不是拼 prompt

Runtime 不把「agent 人设 + issue 全文 + 评论流 + skill」拼成一个大 prompt,而是**准备一个 per-task 隔离目录**,把上下文写成编码器能原生发现的文件(对标 Multica `execenv`):

- **brief**:写入 `CLAUDE.md`(claude)或 `AGENTS.md`(codex),用 HTML 注释标记包裹受管块,支持「保留用户已有内容 + 幂等替换」。
- **issue 上下文**:写入 `.gitsquad/issue_context.md`(标题/描述/评论流快照)。
- **skill 原生注入**:claude → `{workdir}/.claude/skills/{name}/SKILL.md`;codex → per-task `CODEX_HOME/skills/{name}/`(对应 agent 子系统设计 D4)。
- **provider 配置**:codex 需要 per-task `CODEX_HOME`(config.toml / auth / skills / sandbox),claude 无额外目录。

`Execute` 的 `prompt` 只是**触发语**(issue 标题或 @mention 评论),完整上下文都在文件里。

理由:编码器(尤其 Claude Code/Codex)本就原生读取 CLAUDE.md/AGENTS.md/skills;把上下文落文件比塞进 argv 更稳(无 shell 转义/长度限制),也复用了编码器自己的上下文管理。

### D4:任务契约 = 快照(供 execenv 写文件),持久化归第 9 章

SaaS 在认领时组装 `v1.Task` 快照(issue + agent + skills + repo + installation token),daemon 拿到后交给 execenv 落盘。本设计只定 `v1.Task`(见 §6.1),**不建任务表、不做路由/状态机**——那是第 9 章。

理由:单次往返、原子一致;installation token 短效须认领时签发;daemon token 不获得 issue 读权限(只认领/回报自己的任务)。

### D5:本地工作区 = per-workspace 持久 clone + per-task 分支

LocalShell 在 `{workdir}/workspaces/{workspace_id}/` 保持持久 clone;每个任务 `git fetch --prune` 后从 default branch 切 `gitsquad/{issue_key}/{task_id}` 分支。CloudShell 每次干净 clone(第 8 章)。

理由:daemon 服务多 workspace,持久 clone 免每任务全量 clone;per-task 分支隔离并发与回滚。并发由 D9(MVP=1)兜底。

### D6:回写拆分——Runtime 负责 push,SaaS 负责建 PR + 写 Issue

- **daemon/Runtime**:clone、分支、commit、`git push`(installation token 认证)。
- **SaaS**:收到「成功 + 分支 ref + 产物摘要」后,用 GitHub App client 建 PR(PR body 引用 Issue),并在 Issue 追加评论 + 状态变更;任务标记成功。失败则追加失败评论。

理由:GitHub API 调用集中在 SaaS,daemon 只做 git push;与第 10 章 PR 回流对齐。

### D7:进度报告 = 流式事件 + HTTP 终态,WS 只做唤醒/心跳/清理

- 执行中:daemon 把 `Session.Messages` 的事件(至少 `status/text/thinking/tool-use` 摘要)流式上报 SaaS,使 Issue 评论/前端能实时看到 agent 在干嘛。
- 终态:`started/succeeded/failed` + 产物摘要走 HTTP(结构化、可重试、可审计)。
- WS 保留:`task_wake`(唤醒)、`heartbeat`(带 `active_tasks`)、`runtime_gone`(取消/清理)。

理由:与 task-dispatch spec「task_wake 只唤醒不传载荷」一致;WS 不放大帧。

### D8:并发 MVP=1,顺序执行

每个 daemon 同时只跑一个任务(沿用 `runtimes.max_concurrency`)。daemon 内维护 FIFO 队列,执行器逐个跑。

理由:MVP 正确性优先,避免同 workspace 多分支并发写冲突。

### D9:超时 = 墙钟 + 语义不活动;取消走 runtime_gone

- **墙钟超时**(默认可配,如 30m):`context.WithTimeout`,到期 kill provider 进程组,回报 `failed(timeout)`。
- **语义不活动超时**(对标 Multica `SemanticInactivityTimeout`):agent 持续出事件就不算超时,只在「长时间无事件」时 kill——避免长任务被墙钟误杀。
- **服务端取消/daemon 撤销**:复用 `runtime_gone` WS 帧,daemon kill 进程、清理 workdir、回 ack。
- **daemon 下线**:第 7 章已做「陈旧连接驱逐 → MarkOffline」;任务标记 failed + Issue 回流属第 9 章。

## 6. 组件与接口设计

### 6.1 任务契约(`v1.Task`,放 `pkg/types/v1/task.go`)

```go
type Task struct {
    ID          uuid.UUID `json:"id"`
    WorkspaceID uuid.UUID `json:"workspace_id"`

    Issue TaskIssueContext `json:"issue"`
    Repo  TaskRepoContext  `json:"repo"`
    Agent TaskAgentContext `json:"agent"`

    InstallationToken string `json:"installation_token"` // 短期,clone/push 用,不落库
}

type TaskIssueContext struct {
    ID          uuid.UUID    `json:"id"`
    Key         string       `json:"key"`         // GTS-42
    Title       string       `json:"title"`
    Description string       `json:"description"`
    Comments    []TaskComment `json:"comments"`   // 截断快照
}

type TaskRepoContext struct {
    Owner         string `json:"owner"`
    Name          string `json:"name"`
    DefaultBranch string `json:"default_branch"`
}

type TaskAgentContext struct {
    Name         string      `json:"name"`
    Instructions string      `json:"instructions"`  // 写入 brief,非 argv
    Model        string      `json:"model,omitempty"`
    Provider     string      `json:"provider"`      // claude / codex
    Skills       []TaskSkill `json:"skills,omitempty"` // 注入 execenv
}
```

### 6.2 流式 Backend(`internal/daemon/provider/`,对标 `multica/agent.go`)

```go
type Backend interface {
    Kind() string
    Execute(ctx context.Context, prompt string, opts ExecOptions) (*Session, error)
}

type Session struct {
    Messages <-chan Message // 事件流,结束时关闭
    Result   <-chan Result  // 恰好一个终态,随后关闭
}

type MessageType string
const (
    MessageText       MessageType = "text"
    MessageThinking   MessageType = "thinking"
    MessageToolUse    MessageType = "tool-use"
    MessageToolResult MessageType = "tool-result"
    MessageStatus     MessageType = "status"
    MessageError      MessageType = "error"
)

type Message struct {
    Type    MessageType
    Content string
    Tool    string         // tool-use / tool-result
    CallID  string
    Input   map[string]any // tool-use
    Output  string         // tool-result
    Status  string         // status
}

type Result struct {
    Status     string // completed | failed | aborted | timeout | cancelled
    Output     string
    Error      string
    DurationMs int64
    SessionID  string
    Usage      map[string]TokenUsage // 按 model
}

type TokenUsage struct{ InputTokens, OutputTokens int64 }

type ExecOptions struct {
    Cwd          string
    Model        string
    SystemPrompt string        // agent instructions → --append-system-prompt(claude)/AGENTS.md(codex)
    MaxTurns     int
    Timeout      time.Duration // 墙钟
    SemanticInactivityTimeout time.Duration
    ResumeSessionID string      // 未来多轮恢复,留缝
    Env          []string
}
```

- `NewBackend(kind, exePath) (Backend, error)`:按 `kind` + 探测到的 `ExecutablePath` 构造。
- **claude 适配器**:子进程 `claude -p --output-format stream-json --input-format stream-json …`,stdin 写 stream-json 输入,stdout 逐行解析 JSONL → 翻译成 `Message` 事件;`--permission-mode bypassPermissions` + `--disallowedTools AskUserQuestion`(见 D2)。
- **codex 适配器**(可选,后置):子进程 `codex app-server --listen stdio://`,JSON-RPC 2.0 `initialize → thread/start → turn/start`,把 turn 事件翻译成 `Message`;模型 `-c model="…"`。
- 进程用 `exec.CommandContext` + 进程组 kill;墙钟/不活动超时由上层 Runner 的 ctx 与 watch dog 控制。

### 6.3 execenv 执行环境准备(`internal/daemon/execenv/`)

```go
type Env struct {
    Root    string // 隔离目录根(含 .gitsquad/ 与 brief)
    WorkDir string // 实际工作目录(= repo checkout 目录)
}

func Prepare(root string, p PrepareParams) (*Env, error)

type PrepareParams struct {
    WorkspaceID string
    TaskID      string
    AgentName   string
    Provider    string // 决定 brief 文件名与 skill 注入路径
    Issue       TaskIssueContext
    Agent       TaskAgentContext
}
```

`Prepare` 写入:

- `{root}/CLAUDE.md`(provider=claude)或 `{root}/AGENTS.md`(provider=codex):受管 brief = agent instructions + issue 摘要 + 回复指引,用 `<!-- BEGIN GITSQUAD-RUNTIME -->…<!-- END -->` 标记包裹(幂等替换、保留用户已有内容)。
- `{root}/.gitsquad/issue_context.md`:issue 标题/描述/评论流快照。
- skills:claude → `{root}/.claude/skills/{name}/SKILL.md`;codex → per-task `CODEX_HOME/skills/{name}/`(后置)。
- codex 额外:`CODEX_HOME` 指向 per-task 目录(后置)。

### 6.4 Runner 内核(`internal/daemon/runner/`)

```go
type Runner struct {
    env      *execenv.Preparer
    git      GitOps
    backend  provider.Backend
    reporter Reporter
    workRoot string
}

func (r *Runner) Run(ctx context.Context, task v1.Task) error
```

`Run` 内部(§4 步骤 1–6):prepare env → checkout → `backend.Execute(trigger, opts)` → 流式转发 `Messages` 到 reporter + 等 `Result` → 收集产物 → commit/push → 上报终态。每步失败都 `reporter.Report(failed, …)`,并尽量清理分支/workdir。

### 6.5 Git 操作模块(`internal/daemon/runner/git.go`)

用 `git` CLI(daemon 已探测 `detectGit`,不引 go-git):

- `EnsureClone(repo, token, dst)`:无则 clone,有则 `fetch --prune`。
- `CreateBranch(dst, branch)`:切到 `origin/{default}` 再 `checkout -b`。
- `Commit(dst, message)`:author 用 `gitsquad[bot]` + agent 名。
- `Push(dst, branch, token)`:HTTPS + `x-access-token` 认证(或 `git credential` 一次性注入)。
- `Diff(dst, base)`:收集 unified diff。

### 6.6 产物收集

- **diff**:`git diff {default}...HEAD`。
- **test 结果**:优先从 `Message{Type:tool-use, Tool:"Bash"}` 事件流里提取测试命令输出;MVP 先保留 provider 输出原文。
- **logs**:provider 的 stdout/stderr 落 `{root}/{task_id}/logs.txt`;摘要随上报回传,全文不推 SaaS。

## 7. 与现有系统的接线

### 7.1 daemon 侧(`internal/daemon/daemon.go`)

- `handleTaskWake` / `handleHeartbeatAck`(task_available)从 TODO 改为「入 FIFO 队列 + 触发执行器」。
- 新增顺序执行器 goroutine:队列非空且空闲时,认领任务 → `runner.Run` → 上报。
- 心跳 `ActiveTasks` 填运行中任务 ID。
- `runtime_gone` 分支:kill 当前任务进程 + 清理,回 `runtime_gone_ack`。

### 7.2 SaaS 侧

- `issue.go` 的 `dispatchForMention`(空 seam)改为:为匹配 agent 组装 `v1.Task` 快照并入队(第 9 章持久化/路由落同一处,先内存队列跑通)。
- `daemon.go` 的 `PendingActions`(返回 nil)改为:有排队任务时下发 `task_available`。
- `github.go` 新增 `CreatePullRequest(installationDBID, owner, repo, head, base, title, body)`。
- `issue.go` 新增「任务回报处理」:成功 → 建 PR + agent 评论 + 状态 `in_review`;失败 → 失败评论。

### 7.3 新端点

```
POST /api/v1/daemon/tasks/claim        daemon 认领一个待执行任务(返回完整 Task 或 204)
POST /api/v1/daemon/tasks/:id/status   daemon 上报 started/进度事件/succeeded/failed + 产物摘要
```

两者都走 `RequireDaemonAuth`,服务端校验 `task.daemon_id == 当前 daemon`。

## 8. 数据模型(草图,归第 9 章)

```
tasks(
  id, workspace_id, issue_id, agent_id,
  status,               -- queued/claimed/running/succeeded/failed
  assigned_daemon_id,
  provider, model,
  branch_ref,
  pr_number,
  context_snapshot JSONB, -- 认领时组装(issue/agent/skills),供 execenv 写文件
  created_at, updated_at
)
```

本设计不建表;第 9 章负责落地并做状态机。

## 9. 错误处理与安全

- **installation token 最小权限 + 短效**:只随任务下发,不落库、不进日志(打码)。
- **daemon token 权限边界**:只能认领/回报「自己的」任务,不能读任意 Issue。
- **进程清理**:provider 进程组启动,超时/取消 `kill -TERM` → 宽限 → `kill -KILL`。
- **execenv 隔离**:每任务独立目录;brief 用标记包裹可回滚;skill 只写进 per-task 目录,不污染用户全局。
- **错误脱敏**:上报失败原因脱敏,原始日志留 daemon 本地。

## 10. 测试策略

- `provider` 适配器:假 `claude` 脚本(输出 JSONL 事件)测流式解析、Message 翻译、超时/不活动 kill;codex 用假 app-server 测 JSON-RPC 握手。
- `execenv`:临时目录测 brief 幂等注入、skill 写入、用户内容保留。
- `runner`:假 Backend + 假 GitOps + 假 Reporter 测步骤顺序与失败路径。
- `git` 模块:临时目录 + `git init` 集成测(clone/branch/commit/push 到本地 bare repo)。
- SaaS 侧:任务组装、`dispatchForMention`、PR 创建(go-github httptest 打桩)单测。
- 遵循 `agent.md`:单测不依赖真实网络/DB,`go test -race`(CI 要求)。

## 11. MVP 范围与后续

**MVP(本次落地):** `v1.Task` 契约 + 流式 `Backend` 接口与 `claude` 适配器 + `execenv`(brief/issue_context/skill 注入)+ `Runner`(含 git 模块)+ daemon 认领/执行/流式上报接线 + SaaS 侧任务组装与 PR 创建/Issue 回写(内存队列跑通端到端)。

**后续:** `codex`(app-server)与 `agy` 适配器、任务持久化与状态机(第 9 章)、CloudShell(第 8 章)、PR 回流与合并关 Issue(第 10 章)、session 恢复/多轮对话、完整评论流增量拉取、模型选择落库、多任务并发。

## 12. Open Questions

- **版本漂移残余风险**:claude/codex 的 headless 调用已对照 Multica/Orca 源码核实(见 D2),但 flag 仍可能随版本变化——缓解:适配器做薄 + 已有版本探测,必要时按版本分叉。
- **语义不活动超时的阈值**:默认值(如 5m)与「哪些事件算活动」的判定(只算 tool/text 事件,还是含 thinking/status)。
- **流式进度上报到 SaaS 的形态**:是逐事件 POST(可能过频)还是批量/节流;是否复用 `status_update` WS 帧。
- **push 认证方式**:HTTPS token vs `git credential` 一次性注入,哪个更不易泄漏到进程参数。
- **评论流截断策略**与 **PR 标题/分支命名** 的取值(沿用 v1 待定项)。
- **CloudShell 的 Shell 注入**:第 8 章时 `RuntimeEnv` 的 cloud 变体如何注入凭证与上报通道。
