# 任务派发设计(第 9 章)

- 日期:2026-09-08
- 状态:待评审
- 前置:
  - agent 子系统设计(`docs/superpowers/specs/2026-09-02-agent-subsystem-design.md`)
  - Runtime 执行内核设计(`docs/superpowers/specs/2026-09-07-runtime-execution-design.md` v2)
- 关联章节:第 8 章 CloudShell(cloud 路由)、第 10 章 PR 回流
- 现状:第 6 章已用**内存队列**跑通「@mention → 认领 → 执行 → 回写」代码路径,本章把它升级为持久化任务 + 生命周期状态机。

## 1. 背景与目标

第 6 章的 `TaskService` 用一个带锁的 `map[daemonID][]task` 内存队列做任务派发,能跑通但有两个硬伤:

1. **重启即丢**:SaaS 进程重启后所有排队任务消失。
2. **无状态机**:认领/运行/成功/失败没有被记录,无法回答「某 daemon 下线时有哪些在途任务」,也就无法做 7.6 的「下线 → 在途任务标记 failed + Issue 回流」。

本章把任务建模为数据库实体,定义其生命周期,并把派发通知(`task_wake` / `task_available`)接上。这是本地路径真正可用的关键。

## 2. 术语表

| 术语 | 含义 |
|------|------|
| Task(任务) | 一次 @mention 派生的持久化执行单元 |
| context_snapshot | 认领时下发给 daemon 的上下文快照(issue + agent + skills + repo,不含 token) |
| 状态机 | `queued → claimed → running → succeeded/failed` + `blocked_waiting_for_daemon` |
| task_wake | SaaS → daemon 的 WS 唤醒帧(只带 task_id,不带载荷) |
| task_available | SaaS 经 heartbeat_ack 的 `pending_actions` 下发的唤醒动作 |

## 3. 范围

### Goal

- 定义 `tasks` 表与任务生命周期状态机。
- 用持久化任务替换第 6 章的内存队列,`TaskService` 对外接口不变(`Dispatch`/`Claim`/`Report`/`HasPending`)。
- 接上派发通知:`task_wake`(WS)+ `task_available`(heartbeat_ack)。
- 状态上报回流 Issue(成功 → 建 PR + `in_review`;失败 → 失败评论;下线 → 在途任务 failed + 回流)。
- 关闭 7.6 缺口(daemon 下线 → 在途任务 failed + Issue 回流)。

### Non-Goal

- **cloud 路由与 SandboxProvider = 第 8 章**。本章只做 local 路由,`runtime_mode=cloud` 留到第 8 章。
- **PR 事件回流、合并自动关 Issue = 第 10 章**。本章只做「任务成功 → 建 PR + 写 Issue」。
- **自动接力**:任务完成后不自动 @ 其他 agent(沿用第 5 章决策,`can_mention` 已删除)。
- 任务取消 UI、重试、优先级、配额——留后续。

## 4. 架构总览

```
@mention(评论/描述)
  → IssueService.dispatchForMention(已接线)
  → TaskService.Dispatch:解析 agent → 解析 runtime(daemon+provider)→ 组装快照 → 落库(status=queued)
  → 通知:daemon 在线则 WS task_wake;否则靠下次 heartbeat_ack 的 task_available
  → daemon 认领:POST /tasks/claim(标记 claimed + assigned_daemon_id,签发 token)
  → daemon 执行(Runner,第 6 章)+ 流式上报 running 事件
  → 终态:POST /tasks/:id/status(succeeded/failed)
  → TaskService.Report:更新任务状态 + 建 PR(成功)+ 写 Issue 评论/状态
```

任务状态机:

```
                Dispatch
                   │
                   ▼
               [queued] ──daemon 认领──▶ [claimed] ──daemon 上报 started──▶ [running]
                   │                                                          │
        (daemon 下线超时)                                                    │ 终态
                   │                                                          ▼
                   ▼                                                  [succeeded]/[failed]
   [blocked_waiting_for_daemon](MVP:排队时无在线 daemon 才用)
```

## 5. 关键决策

### D1:`tasks` 表持久化,`TaskService` 接口不变

新增 `tasks` 表(§6),`TaskService` 的 `Dispatch`/`Claim`/`Report`/`HasPending` 从内存队列改为数据库读写。第 6 章的 `TaskQueue` 删除。

理由:重启不丢、可查询、可做状态机;对外接口不变,第 6 章已接线的 daemon 侧零改动。

### D2:生命周期状态机(对齐 Multica 的 `agent_task_queue`)

采用 6 态 `queued → dispatched → running → completed | failed | cancelled`:

- `queued`:已入队待认领。目标 daemon 不在线时**停在 queued**(不单独设 blocked 态)。
- `dispatched`:已认领并指派 `assigned_daemon_id`。
- `running`:daemon 上报 started。
- 终态:`completed`(成功)/`failed`(失败,带 `failure_reason` 分类)/`cancelled`(用户取消,本章预留态)。

每次迁移落时间戳(`dispatched_at`/`started_at`/`completed_at`),供审计与超时判定。

### D3:上下文快照落 `context_snapshot` JSONB,不含 installation token

`Dispatch` 时把 `v1.Task`(issue 快照 + repo + agent + skills,`InstallationToken` 置空)序列化进 `context_snapshot`。认领时读出、签发新 token、组装完整 `v1.Task` 返回。

理由:token 短效(约 1h)不能落库;快照落库让任务可重放/审计,也避免 daemon 认领时再 N 次读表。

### D4:local 路由到 daemon,cloud 留第 8 章

`Dispatch` 按 `agent_runtime.daemon_id` 决定目标任务;`runtime_mode=cloud` 的 agent 暂不派发(第 8 章)。daemon owner 必须等于 workspace owner(沿用第 5 章配置时隔离)。

注:Multica 的任务按 `agent_id` 键控、经 `daemon_connection` 在派发时动态解析 daemon(支持多机 failover);GitSquad 的 agent 经 `runtime_id → agent_runtime.daemon_id` **静态绑定单 daemon**,所以任务直接存 `assigned_daemon_id`。这是更简化的取舍,代价是 daemon 下线时任务只能等它回来,不能换机。MVP 接受该限制。

### D5:派发通知 = WS `task_wake` + heartbeat_ack `task_available`

入队后:若目标 daemon 在线且有 WS 连接,立即发 `task_wake`(只带 task_id);否则等 daemon 下次心跳,由 `PendingActions` 返回 `task_available`。两种都是唤醒信号,daemon 一律经 HTTP `POST /tasks/claim` 拉取(沿用第 6 章 D7)。

### D6:终态回流 Issue

- `succeeded`:建 PR + agent 评论 + Issue 状态 `in_review`(第 6 章已实现,本章把任务状态一并更新)。
- `failed`:系统评论「{agent} 任务失败: {error}」,Issue 状态保留 `in_progress`。
- `running`/进度事件:MVP 不落 Issue 评论(无任务日志表),仅更新任务状态。

### D7:daemon 下线 → 在途任务 failed + 回流(关闭 7.6)

daemon 下线检测(现有 WS 陈旧连接驱逐 → `MarkOffline`)触发时,把该 daemon 的 `claimed`/`running` 任务标记 `failed`,并对每个关联 Issue 追加系统评论。MVP 不自动迁移到 cloud。

### D8:MVP 不自动接力

任务完成不自动 @ 其他 agent。所有接力由人类显式 @ 触发(第 5 章决策延续)。

### D9:认领原子性

`Claim` 用 `SELECT ... FOR UPDATE SKIP LOCKED` 取该 daemon 最早的一条 `queued` 任务并置 `dispatched` + `assigned_daemon_id`,避免两个 daemon 认领同一任务。

### D10:借鉴 Multica 的护栏与日志(优先级/失败分类/进度事件/去重)

- **`priority` + `result JSONB` + `failure_reason`**:任务带优先级;终态产物统一放 `result`(branch/pr_number/diff_stat/test);失败用 `failure_reason`(`agent_error`/`timeout`/`runtime_offline`/`manual`)分类,而非只存 `error` 文本。
- **`task_messages` 进度事件表**:running 期间的 text/thinking/tool 事件落表,供前端展示 agent 干活过程(解决「进度事件丢弃」的缺口)。
- **同一 issue 最多一个 pending 任务**:`idx_one_pending_task_per_issue` 部分唯一索引,防重复 @mention 重复建任务(幂等护栏)。
- **partial 轮询索引**:`idx_tasks_pending` 只扫 pending,`priority DESC, created_at ASC` 保证按优先级 + FIFO。

## 6. 数据模型

```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','dispatched','running','completed','failed','cancelled')),
    assigned_daemon_id UUID REFERENCES daemons(id),
    provider TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    priority INT NOT NULL DEFAULT 0,
    context JSONB NOT NULL DEFAULT '{}',      -- 认领时下发的快照(不含 installation token)
    result JSONB,                              -- 终态产物 {branch, pr_number, diff_stat, test}
    error TEXT NOT NULL DEFAULT '',
    failure_reason TEXT,                       -- agent_error | timeout | runtime_offline | manual
    dispatched_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 高效轮询:按 daemon + 优先级 + 入队顺序,只扫 pending 任务
CREATE INDEX idx_tasks_pending
    ON tasks(assigned_daemon_id, priority DESC, created_at ASC)
    WHERE status IN ('queued','dispatched');

-- 生命周期护栏:同一 issue 最多一个 pending 任务(防重复 @mention 重复建任务)
CREATE UNIQUE INDEX idx_one_pending_task_per_issue
    ON tasks(issue_id)
    WHERE status IN ('queued','dispatched');

CREATE INDEX idx_tasks_workspace ON tasks(workspace_id, created_at);
CREATE INDEX idx_tasks_issue ON tasks(issue_id);
```

任务进度事件表(对齐 Multica 的 `task_message`):

```sql
CREATE TABLE task_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    seq INT NOT NULL,
    type TEXT NOT NULL,      -- text | thinking | tool_use | tool_result | status | error
    tool TEXT,
    content TEXT,
    input JSONB,
    output TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_messages_task_seq ON task_messages(task_id, seq);
```

## 7. 组件与接口设计

### 7.1 TaskService(改造 `internal/server/service/task.go`)

对外方法不变,内部改为 DB:

- `Dispatch(ctx, workspaceID, issueID, agentName)`:解析 agent/runtime/workspace/repo/installation → 组装快照 → `CreateTask(status=queued)` → 触发通知。
- `Claim(ctx, daemonID) (*v1.Task, error)`:原子认领一条 `queued` 任务 → 置 `dispatched` → 读快照 → 签发 token → 返回完整 Task。
- `Report(ctx, daemonID, taskID, report)`:按 report.Status 迁移状态;`running` 进度事件写 `task_messages`;`completed` → 建 PR + 评论 + `in_review`;`failed` → 失败评论 + `failure_reason`。
- `HasPending(ctx, daemonID) bool`:该 daemon 是否有 `queued` 任务。
- 新增 `FailDaemonTasks(ctx, daemonID)`:daemon 下线时把其 `dispatched`/`running` 任务置 `failed`(`failure_reason=runtime_offline`)+ 回流 Issue。

### 7.2 sqlc 查询(`internal/server/store/queries/tasks.sql`)

`CreateTask` / `GetTask` / `ClaimNextTask`(FOR UPDATE SKIP LOCKED)/ `UpdateTaskStatus` / `ListQueuedByDaemon` / `FailDaemonTasks` / `HasPendingForDaemon`。

### 7.3 通知(`internal/server/handler` + `ws`)

- 入队后:经 `ws.Hub` 向目标 daemon 发 `task_wake`(若在线)。
- `DaemonService.PendingActions` 已有 `task_available` 接线(第 6 章),改为读 DB 的 `HasPending`。

## 8. 与现有系统的接线

- `IssueService.dispatchForMention`(已接线,第 6 章)不变。
- daemon 侧(第 6 章)不变:仍是 `task_wake`/`task_available` → HTTP claim → Runner → HTTP 上报。
- 唯一改动是 SaaS 的 `TaskService` 从内存队列切到 DB,以及 `DaemonService.PendingActions` 的 `HasPending` 从内存换成 DB 查询。

## 9. 错误处理与安全

- **认领原子性**:`FOR UPDATE SKIP LOCKED`,防止并发认领同一任务。
- **token 不落库**:只在认领时签发并随响应返回(沿用第 6 章)。
- **下线兜底**:daemon 下线触发 `FailDaemonTasks`,保证没有「永久 claimed/running」的僵尸任务。
- **幂等上报**:重复的终态上报(MVP)由 `Report` 幂等处理(终态不重复写评论/建 PR)。

## 10. 测试策略

- `TaskService` 单测(内存/假 store):状态机迁移、快照序列化、下线失败回流。
- `ClaimNextTask` 用 DB 集成测(需 `GITSQUAD_TEST_DATABASE_URL`)验证 SKIP LOCKED 原子性。
- `FailDaemonTasks` 集成测:下线后 claimed/running → failed + Issue 评论。
- daemon 侧不新增测试(接口不变)。

## 11. MVP 范围与后续

**MVP(本次落地):** `tasks` 表(含 priority/result/failure_reason)+ `task_messages` 表 + 状态机 + `TaskService` 切 DB + 通知接线 + `FailDaemonTasks` 下线兜底。

**后续:** cloud 路由(第 8 章)、任务取消/重试/优先级、任务日志表(承载 running 进度事件)、PR 事件回流(第 10 章)、用量埋点。

## 12. Open Questions

- **daemon 重连后如何关联回已 dispatched 任务**:daemon 重连(换 token)后,已 `dispatched`/`running` 的任务如何重新关联(靠 `assigned_daemon_id` 不变即可?还是需要 lease 到期由 sweeper 收回)。
- **幂等上报的边界**:`completed` 后又收到 `failed`(或反之)如何处理(第 6 章 `takeMeta` 已按 taskID 一次性消费天然去重,但 DB 版需确认终态迁移的幂等)。
- **lease/retry 是否现在就做**:Multica 有 `attempt`/`max_attempts`/`parent_task_id`/`last_heartbeat_at`(055)。MVP 可只做 `failure_reason` + 下线兜底,retry 机制留后续。
- **result JSONB vs 散列列**:`branch`/`pr_number` 放 `result` JSONB 还是保留散列列(便于 SQL 直接查),待实现时定。
- **task-scoped token(108)**:未来若 agent 需要回写 Issue 评论,再引入任务作用域 token(替代 daemon owner token 注入 agent)。
