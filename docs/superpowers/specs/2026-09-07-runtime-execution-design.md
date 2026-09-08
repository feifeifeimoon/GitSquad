# Runtime 执行内核设计(第 6 章)

- 日期:2026-09-07
- 状态:待评审
- 前置:
  - agent 子系统设计(`docs/superpowers/specs/2026-09-02-agent-subsystem-design.md`)
  - daemon runtime 探测重写(openspec change `daemon-runtime-detection`)
- 参考实现:Multica(驱动本地编码器)、Orca(agent-hooks 的 CLI 探测与派发)
- 关联章节:第 9 章任务派发(生成/路由任务)、第 10 章 PR 回流

## 1. 背景与目标

GitSquad 目前已落地平台侧(issue 黑板、workspace、GitHub App link、daemon 骨架)与 agent 配置(agent/runtime/skill)。但「agent 真正动手改代码」这一环还是空的:daemon 收到 `task_wake`/`task_available` 后只有 `// TODO: claim and execute task`,client 没有任务接口,SaaS 侧 `dispatchForMention` 是空 seam,也没有任务表。

本章定义 **Runtime 执行内核**——一套与部署位置无关的代码,让 agent 从「认领任务」一路走到「提 PR + 回写 Issue」。它是第 8 章 CloudShell、第 9 章任务派发的共同底座。

核心结论:**Runtime 内核 = 薄壳,驱动现成编码器(Claude Code / Codex)完成代码改动;GitSquad 负责把任务上下文灌进去、把产物和 PR 收回来。agent loop 由编码器自己跑,GitSquad 不重建。**

## 2. 术语表

| 术语 | 含义 |
|------|------|
| Task(任务) | 一次 @mention 派生的最小执行单元,携带 Issue 上下文 + agent 快照 + repo 凭证 |
| Runtime 内核 | 与 Shell 无关的执行循环:clone → 组装上下文 → 驱动 → 收集 → 回写 → 报告 |
| Shell | 两种外壳:LocalShell(常驻 daemon,拉模式)、CloudShell(临时 sandbox,推模式) |
| CoderBackend | 编码 CLI 的适配器(`claude` / `codex` / `agy`) |
| provider | 编码 CLI 短标识(`claude` / `codex`),见 agent 子系统设计 |
| workdir | daemon 的工作目录根(`~/.gitsquad/workspaces`) |
| installation token | GitHub App 短期凭证,用于 clone 与 push |

## 3. 范围

### Goal

- 定义 Runtime 内核的执行步骤与组件接口(clone、上下文组装、驱动、产物收集、回写、进度报告)。
- 定义任务输入契约(`v1.Task`),作为与第 9 章的边界。
- 定义 `CoderBackend` 适配器接口,并落地至少一个 provider(优先 `claude`,其次 `codex`)。
- 把执行循环接进现有 daemon 事件循环(认领 → 执行 → 报告),并把 SaaS 侧的 `dispatchForMention`/`PendingActions`/PR 创建打通到「最小可跑通」。

### Non-Goal

- **任务持久化/路由/生命周期状态机 = 第 9 章**。本设计只定 `v1.Task` 输入契约与执行语义,不建任务表、不做队列。
- **CloudShell + SandboxProvider = 第 8 章**。本设计只要求 Runtime 内核与 Shell 解耦,不实现 sandbox。
- **PR 事件回流、合并自动关闭 Issue = 第 10 章**。本设计只做到「push 分支 → SaaS 建 PR → 写 Issue 评论/状态」。
- 自动接力(`can_mention` 已删除)、模型选择 UI(第 5 章已做 daemon 现查,本设计只消费 `model` 字段)。
- fork / upstream 同步、计费、用量日志(第 11 章)。

## 4. 架构总览

```
SaaS
 ├─ Issue 黑板(@mention → dispatchForMention → 组装任务快照)
 ├─ 任务派发(第 9 章:入队 + WS task_wake / heartbeat_ack task_available)
 ├─ GitHub App service(发 installation token、建 PR、写 Issue 回写)
 └─ daemon 端点(认领任务 / 回报进度)

Daemon(LocalShell)                          Runtime 内核(共享,与 Shell 无关)
 ├─ WS 读循环(task_wake / task_available)      Runner.Run(ctx, task)
 ├─ 认领 HTTP 客户端                              ├─ 1. clone(per-workspace 持久 + per-task 分支)
 ├─ 心跳(active_tasks)                           ├─ 2. 组装上下文(prompt = issue + agent + skills)
 └─ 顺序执行器(max_concurrency=1)                 ├─ 3. 驱动 CoderBackend(headless)
                                                 ├─ 4. 收集产物(diff / test / logs)
                                                 ├─ 5. git commit + push(installation token)
                                                 └─ 6. 回报成功/失败 + 产物摘要
```

一次任务的端到端流程:

```
@coder → 任务入队 → WS task_wake → daemon 认领(GET 任务 + 上下文快照)
       → clone/fetch → 切 per-task 分支 → 组装 prompt → 驱动 coder(headless)
       → 收集 diff/test/logs → commit + push → 回报成功
       → SaaS 建 PR(body 引用 Issue)+ 写 Issue 评论/状态
```

## 5. 关键决策

### D1:Runtime 内核与 Shell 的解耦点 = 「工作环境」注入

Runtime 内核只依赖一个注入的 `RuntimeEnv`(workdir、凭证、任务来源、上报通道),不感知是 local 还是 cloud。LocalShell 提供持久 workdir + installation token + HTTP 上报;CloudShell(第 8 章)提供干净 workdir + 启动注入的任务参数 + 同样的上报通道。

理由:与 build-gitsquad-mvp design.md 决策 5 一致——「Runtime 拿到的『工作环境』由 Shell 注入,Runtime 不感知来源」。

### D2:驱动现成编码器(headless),不建 agent loop

`CoderBackend` 接口屏蔽 provider 差异,每个 provider 一个适配器,负责用该 CLI 的 headless/非交互模式跑一次任务并产出结构化结果。**调用方式已对照 Orca / Multica 源码核实**:

- **claude**(参考 `multica/server/pkg/agent/claude.go:buildClaudeArgs`):
  ```
  claude -p --output-format stream-json --input-format stream-json \
         --verbose --strict-mcp-config \
         --permission-mode bypassPermissions --disallowedTools AskUserQuestion \
         [--model <model>] [--effort <level>] [--max-turns <n>] [--append-system-prompt <text>]
  ```
  prompt 不放 argv,而以 stream-json 格式写入 stdin(`--input-format stream-json`,见 `writeClaudeInput`);`--permission-mode bypassPermissions` 关闭交互授权,`--disallowedTools AskUserQuestion` 禁掉内置提问工具(无 UI 可渲染会返回空答案)。

- **codex**(参考 `multica/server/pkg/agent/codex.go` 与 `orca/src/main/codex/*`):
  ```
  codex app-server --listen stdio://
  ```
  **不是 `codex exec`**。Codex 以 `app-server` 子命令暴露 JSON-RPC 2.0(stdin/stdout),daemon 通过 `initialize` → `thread/start` → `turn/start` 驱动一次任务;模型选择走 `-c model="..."`(codex 的 app-server 不接受 `--model`)。

- **agy**(Antigravity,参考 `multica/server/pkg/agent/antigravity.go:buildAntigravityArgs`):
  ```
  agy -p <prompt> --dangerously-skip-permissions [--model <display name>] --print-timeout <dur> --log-file <tmp>
  ```
  第一版暂不设 adapter(版本/门槛未定,见 daemon-runtime-detection Open Questions)。

理由:GitSquad 是编排壳,不自建 LLM 工具循环(proposal「What Changes」);Multica/Orca 均验证了该模式。残余风险是各 CLI 的 flag 随版本漂移——缓解:适配器做薄、flag 集中在适配器内,版本探测已有(第 5 章),必要时按版本分叉。

### D3:上下文在认领时由 SaaS 组装成快照,随任务一次性下发

任务载荷携带**完整上下文快照**(Issue 标题/描述/评论流、agent 的 instructions/model、挂载 skill 内容、repo owner/name/default branch、installation token)。daemon 认领后不再二次请求 Issue 内容。

理由:(1)单次往返、原子一致,避免认领后 Issue 又变;(2)installation token 短效(约 1h),必须在认领时签发并随任务走;(3)避免给 daemon token 开 issue 读权限——daemon 只需「认领/回报」两个面向自己任务的端点。

代价:载荷较大(评论流可能长)。缓解:MVP 对评论流做截断(如最近 N 条 + 全部状态变更),完整流留后续增量拉取。

### D4:任务模型归第 9 章,本设计只定输入契约

本设计只定义 `v1.Task`(见 §6.1)与执行语义,**不建任务表、不做路由/生命周期状态机**。第 9 章负责:`tasks` 表、入队、按 `runtime_mode`/`provider` 路由、`task_wake` 发送、状态机(queued→claimed→running→succeeded/failed)。本设计的 `Runner` 只消费一个 `v1.Task`,不关心它从哪来。

### D5:本地工作区 = per-workspace 持久 clone + per-task 分支

LocalShell 在 `{workdir}/workspaces/{workspace_id}/` 保持一个持久 clone;每个任务 `git fetch` 后从 default branch 切出 `gitsquad/{issue_key}/{task_id}` 分支干活。CloudShell 则每次干净 clone(第 8 章)。

理由:daemon 服务多 workspace、多任务,持久 clone 避免每任务全量 clone 的冷启动;per-task 分支隔离并发与回滚。代价:本地 clone 可能过期——缓解:每次任务先 `git fetch --prune` + 重置到 `origin/{default}`。并发冲突:MVConcurrency=1(见 D8),同 workspace 无并行写。

### D6:回写拆分——Runtime 负责 push,SaaS 负责建 PR + 写 Issue

- **daemon/Runtime**:clone、分支、commit、`git push`(用 installation token 认证)。
- **SaaS**:收到「成功 + 分支 ref + 产物摘要」后,用 GitHub App client 建 PR(PR body 引用 Issue 链接),并在 Issue 追加评论 + 状态变更;任务标记成功。失败则追加失败评论 + 保留 Issue 状态。

理由:(1)GitHub API 调用(建 PR)集中在 SaaS,daemon 只做 git push,daemon token 不接触 repo 写 API;(2)与第 10 章 PR 回流对齐(SaaS 天然知道 PR 号)。代价:多一次「daemon 回报 → SaaS 建 PR」的往返;若建 PR 失败(如 branch protection),SaaS 负责回流原因(第 10 章)。

### D7:进度报告走 HTTP,WS 只做唤醒/心跳/清理

- 任务认领、进度上报(`started`/`succeeded`/`failed` + 产物摘要)走 HTTP:daemon 已有 `client.Do`,结构化载荷、可重试、可审计。
- WS 保留:`task_wake`(SaaS→daemon 唤醒)、`heartbeat`(带 `active_tasks`)、`runtime_gone`(SaaS→daemon 取消/清理)。

理由:与 task-dispatch spec 的「task_wake 只唤醒不传载荷,完整载荷 HTTP 拉取」一致。WS 不放大帧,避免控制通道被产物摘要挤占。

### D8:并发 MVP=1,顺序执行

每个 daemon 同时只跑一个任务(`max_concurrency=1`,沿用现有 `runtimes.max_concurrency`)。daemon 内维护一个 FIFO 任务队列,`task_wake`/`task_available` 只做入队唤醒,执行器逐个跑。

理由:MVP 正确性优先,避免同 workspace 多分支并发写冲突;多任务并发留后续(按 provider/daemon 扩并发)。

### D9:超时与取消

- **任务级超时**(默认可配,如 30m):daemon 用 `context.WithTimeout`,超时后 kill coder 进程组(非仅 cancel context),回报 `failed(timeout)`。
- **服务端取消/daemon 撤销**:复用现有 `runtime_gone` WS 帧——daemon 收到后 kill 进程、清理 workdir、回 `runtime_gone_ack`。
- **daemon 下线**:第 7 章已做「陈旧连接驱逐 → MarkOffline」;任务标记 failed + Issue 回流属第 9 章。

## 6. 组件与接口设计

### 6.1 任务契约(`v1.Task`,放 `pkg/types/v1/task.go`)

```go
type Task struct {
    ID          uuid.UUID     `json:"id"`
    WorkspaceID uuid.UUID     `json:"workspace_id"`

    Issue TaskIssueContext `json:"issue"`
    Repo  TaskRepoContext  `json:"repo"`
    Agent TaskAgentContext `json:"agent"`

    InstallationToken string `json:"installation_token"` // 短期,clone/push 用,不落库
}

type TaskIssueContext struct {
    ID          uuid.UUID `json:"id"`
    Key         string    `json:"key"`         // GTS-42
    Title       string    `json:"title"`
    Description string    `json:"description"`
    Comments    []TaskComment `json:"comments"` // 截断快照
}

type TaskRepoContext struct {
    Owner         string `json:"owner"`
    Name          string `json:"name"`
    DefaultBranch string `json:"default_branch"`
}

type TaskAgentContext struct {
    Name         string   `json:"name"`
    Instructions string   `json:"instructions"`
    Model        string   `json:"model,omitempty"` // 空 = provider 默认
    Provider     string   `json:"provider"`        // claude / codex
    Skills       []TaskSkill `json:"skills,omitempty"`
}
```

### 6.2 CoderBackend 适配器接口(`internal/daemon/coder/`)

```go
type Backend interface {
    Kind() string // "claude" | "codex"
    // Run 在 workdir 里以 headless 模式跑一次任务,返回结果。
    Run(ctx context.Context, req RunRequest) (*RunResult, error)
}

type RunRequest struct {
    Prompt       string   // 任务指令;claude 走 stdin stream-json,codex 走 turn/start
    SystemPrompt string   // agent instructions;claude 用 --append-system-prompt,codex 用 AGENTS.md
    WorkDir      string
    Model        string   // 可选覆盖
    Env          []string // 额外环境变量
}

type RunResult struct {
    Output   string // 最终文本输出
    ExitCode int
    Logs     []byte // 原始 stdout/stderr,用于产物收集
}
```

- `NewBackend(kind, exePath) (Backend, error)`:按 `kind` + 探测到的 `ExecutablePath` 构造。
- 注册表:`claude`/`codex` 各一个实现;加新 provider 只新增一个文件。
- 实现要点(两类驱动形态,见 D2):
  - **claude**:`exec.CommandContext` 起 `claude -p --output-format stream-json --input-format stream-json ...`,stdin 写 stream-json 输入,stdout 逐行解析 JSONL 事件;进程组 kill。
  - **codex**:`exec.CommandContext` 起 `codex app-server --listen stdio://`,按 JSON-RPC 2.0 走 `initialize` → `thread/start` → `turn/start` → 等待 turn 完成;进程组 kill。

### 6.3 Runtime 内核接口(`internal/daemon/runner/`)

```go
type Runner struct {
    backend  coder.Backend
    git      GitOps
    reporter Reporter
    workRoot string
}

// Run 执行一个任务的完整生命周期,阻塞到结束。
func (r *Runner) Run(ctx context.Context, task v1.Task) error
```

`Run` 内部步骤(§4 的 1–6)。每步失败都走 `reporter.Report(task.ID, failed, ...)`,并尽量清理分支/workdir。

### 6.4 Git 操作模块(`internal/daemon/runner/git.go`)

用 `git` CLI(daemon 已探测 `detectGit`,不引 go-git 依赖):

- `EnsureClone(repo, token, dst)`:无则 clone,有则 `fetch --prune`。
- `CreateBranch(dst, branch)`:切到 `origin/{default}` 再 `checkout -b`。
- `Commit(dst, message)`:agent 提交,author 用 `gitsquad[bot]` + agent 名。
- `Push(dst, branch, token)`:HTTPS + `x-access-token` 认证(或用 `git credential` 一次性注入)。
- `Diff(dst, base)`:收集 unified diff。

### 6.5 产物收集

- **diff**:`git diff {default}...HEAD`(分支相对 default)。
- **test 结果**:优先解析 coder 输出中的测试段落;MVP 先原样保留 coder 输出里的 test 片段。
- **logs**:coder 的 stdout/stderr 落 `{workdir}/{task_id}/logs.txt`;摘要随上报回传,全文不推 SaaS(PR/commit 已承载实际改动)。

## 7. 与现有系统的接线

### 7.1 daemon 侧(`internal/daemon/daemon.go`)

- 把 `handleTaskWake` 与 `handleHeartbeatAck` 的 `task_available` 分支从 TODO 改为「入 FIFO 队列 + 触发执行器」。
- 新增顺序执行器 goroutine:队列非空且当前无运行任务时,认领一个任务 → `runner.Run` → 上报。
- 心跳的 `ActiveTasks` 填当前运行中的任务 ID 列表。
- `runtime_gone` 分支:kill 当前任务进程 + 清理,回 ack(现有 `runtime_gone_ack` 帧类型已定义)。

### 7.2 SaaS 侧

- `issue.go` 的 `dispatchForMention`(空 seam)改为:为匹配到的 agent 组装 `v1.Task` 快照并入队(第 9 章的持久化/路由落在同一处,先以内存队列跑通)。
- `daemon.go` 的 `PendingActions`(当前返回 nil)改为:有排队任务时下发 `task_available`。
- `github.go` 新增 `CreatePullRequest(installationDBID, owner, repo, head, base, title, body)`(用现有 `newInstallationClient`)。
- `issue.go` 新增「任务回报处理」:成功 → 建 PR + 追加 agent 评论 + 状态 `in_review`;失败 → 追加失败评论。

### 7.3 新端点

```
POST /api/v1/daemon/tasks/claim        daemon 认领一个待执行任务(返回完整 Task 或 204)
POST /api/v1/daemon/tasks/:id/status   daemon 上报 started/succeeded/failed + 产物摘要
```

两者都走 `RequireDaemonAuth`(daemon token),服务端校验 `task.daemon_id == 当前 daemon`。

## 8. 数据模型(草图,归第 9 章)

```
tasks(
  id, workspace_id, issue_id, agent_id,
  status,               -- queued/claimed/running/succeeded/failed
  assigned_daemon_id,   -- 认领后写入
  provider, model,
  branch_ref,           -- push 后写入
  pr_number,            -- SaaS 建 PR 后写入
  context_snapshot JSONB, -- 认领时组装的快照(issue/agent/skills 内容)
  created_at, updated_at
)
```

本设计不建表;仅给出字段以对齐 §6.1 的 `v1.Task`。第 9 章负责落地并做状态机。

## 9. 错误处理与安全

- **installation token 最小权限 + 短效**:只随任务下发,用完即弃;不落库、不进日志(日志打码)。
- **daemon token 权限边界**:只能认领/回报「自己的」任务,不能读任意 Issue;repo 写只靠任务内 installation token。
- **进程清理**:coder 用进程组启动,超时/取消时 `kill -TERM` → 宽限 → `kill -KILL`,避免僵尸子进程。
- **workdir 隔离**:每个 workspace 独立目录,任务分支隔离;取消/失败后清理分支。
- **错误不外泄**:上报失败原因做脱敏,原始日志留在 daemon 本地。

## 10. 测试策略

- `coder` 适配器:用假 `claude`/`codex` 脚本(echo/exit)测 headless 调用、JSON 解析、超时 kill。
- `runner`:用假 Backend + 假 GitOps + 假 Reporter 测步骤顺序与失败路径。
- `git` 模块:临时目录 + `git init` 集成测(clone/branch/commit/push 到本地 bare repo)。
- SaaS 侧:任务组装、`dispatchForMention`、PR 创建(用 go-github 的 httptest 打桩)单测。
- 遵循 `agent.md`:单元测试不依赖真实网络/DB,`go test -race`(CI 要求)。

## 11. MVP 范围与后续

**MVP(本次落地):** `v1.Task` 契约 + `CoderBackend` 接口与 `claude` 适配器 + `Runner` 内核(含 git 模块)+ daemon 认领/执行/上报接线 + SaaS 侧任务组装与 PR 创建/Issue 回写(内存队列跑通端到端)。

**后续:** `codex`/`agy` 适配器、任务持久化与状态机(第 9 章)、CloudShell(第 8 章)、PR 事件回流与合并自动关 Issue(第 10 章)、多任务并发、完整评论流增量拉取、模型选择落库。

## 12. Open Questions

- **版本漂移残余风险**:claude/codex 的 headless 调用方式已对照 Orca / Multica 源码核实(见 D2),但各 CLI 的 flag 仍可能随版本变化——缓解:适配器做薄 + 已有版本探测(第 5 章),必要时按版本分叉。
- **push 认证方式**:HTTPS token vs `git credential` 一次性注入,选哪个更不易泄漏到 shell 历史/进程参数。
- **评论流截断策略**:「最近 N 条 + 全部状态变更」的 N 取值。
- **PR 标题/分支命名规范**:`gitsquad/{issue_key}/{task_id}` 是否足够,是否要含 agent 名。
- **test 结果解析**:MVP 是否只保留 coder 输出原文,还是尝试结构化解析。
- **CloudShell 的 Shell 注入**:第 8 章时 `RuntimeEnv` 的 cloud 变体怎么注入凭证与上报通道。
