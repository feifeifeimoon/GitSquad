# 实时事件层设计(浏览器 WebSocket)

- 日期:2026-09-08
- 状态:待评审
- 前置:任务派发设计(第 9 章)、Runtime 执行内核(第 6 章)
- 参考:Multica `packages/core/api/ws-client.ts`(WS 客户端)+ `packages/core/realtime/use-realtime-sync.ts` + `packages/core/types/events.ts`(50+ 事件类型)

## 1. 背景与目标

现在 issue 看板/详情页都是「手动刷新 / 加载时拉一次」,agent 干活过程完全不可见(进度事件被丢弃)。目标:引入**浏览器侧 WebSocket**,让 issue、评论、agent 任务状态**实时**推到前端,用户能看到 agent 正在想什么、跑什么命令。

## 2. 范围

### Goal

- 新增 `/ws/app` 端点(用户 JWT 认证,区别于 daemon 的 `/ws/daemon`)。
- 新增 workspace 级 `AppHub`(一对多广播)。
- 定义事件类型(task/comment/issue 子集,对齐 Multica)。
- 在 `TaskService` / `IssueService` 挂发布点。
- 前端 WS 客户端 + `useRealtime` hook + issue 详情页 live 面板。

### Non-Goal

- 不迁移 daemon 侧 `/ws/daemon`(保持独立)。
- 不做 presence 在线状态(agent/daemon 在线状态)的实时推送——现有 15s 轮询保留。
- 不做消息已读/通知(inbox)系统。

## 3. 架构总览

```
SaaS
 ├─ TaskService(第 9 章):任务状态迁移 → 发布 task:* 事件 + 落 task_messages
 ├─ IssueService:评论/issue 变更 → 发布 comment:* / issue:* 事件
 └─ AppHub:workspace_id → 浏览器连接集合,广播事件帧

浏览器(每标签页一条 /ws/app)
 ├─ auth 帧(token + workspace_id)
 └─ 收 task:* / comment:* / issue:* 事件 → React 状态/缓存更新 → UI
```

## 4. 关键决策

### D1:独立 `/ws/app`,不碰 `/ws/daemon`

新端点用**用户 JWT**(`middleware.RequireAuth`)认证;daemon 端点用 daemon token。底层连接读写/帧封装/分发复用现有 `ws.Conn`/`ws.Dispatcher`/`ws.Upgrade`,但 hub 模型不同(见 D2)。

### D2:workspace 级 `AppHub`(一对多)

现有 `ws.Hub` 是 `daemon_id → 单连接`(一对一,OnDisconnect→MarkOffline)。浏览器需要 `workspace_id → 多连接`(一个 workspace 多标签页)。

新增 `ws.AppHub`:

```go
type AppHub struct {
    mu    sync.RWMutex
    conns map[uuid.UUID]map[*Conn]struct{} // workspace_id → conn set
}
// Subscribe(workspaceID, conn) / Unsubscribe / Broadcast(workspaceID, frame)
```

一个连接 MVP 先订阅一个 workspace(连接时 auth 帧带 workspace_id);未来可扩展多 workspace。

### D3:事件类型(对齐 Multica 子集)

复用现有 `v1.Frame{Type, Payload}`:

| type | payload | 触发 |
|------|---------|------|
| `task:queued` | {task_id, issue_id, agent_name} | Dispatch |
| `task:dispatched` | {task_id, issue_id, daemon_id} | Claim |
| `task:running` | {task_id, issue_id} | Report(started) |
| `task:progress` | {task_id, seq, type, content, tool, input, output} | Report(running) |
| `task:completed` | {task_id, issue_id, result} | Report(succeeded) |
| `task:failed` | {task_id, issue_id, failure_reason, error} | Report(failed) |
| `comment:created` | {comment} | AddComment |
| `issue:created` | {issue} | CreateIssue |
| `issue:updated` | {issue} | UpdateIssue |

### D4:发布点与落库

- `TaskService.Report` 收到 `running`+progress 时:**落 `task_messages`(第 9 章表)+ 发布 `task:progress`**;收到 started/completed/failed 时发布对应事件 + 更新任务状态。
- `IssueService.AddComment`/`CreateIssue`/`UpdateIssue` 成功后发布 `comment:created`/`issue:created`/`issue:updated`。
- 进度事件**补齐 input/output**(第 6 章 `progressFromMessage` 目前丢了 tool input/output,本设计补上 `v1.TaskProgress.Input/Output`)。

### D5:重连补拉

前端断线重连后,拉一次 `GET /api/v1/tasks/:id/messages?after=<lastSeq>` 补齐漏掉的事件(SSE/WS 共有的缺口处理)。

### D6:鉴权与归属校验

`/ws/app` 的 `auth` 帧带 JWT + workspace_id;服务端用 `userSvc` 校验 token → user,校验 workspace 归属(user 拥有该 workspace)后 `Subscribe`。

## 5. 组件设计

### 5.1 服务端

- `internal/server/ws/app_hub.go`:`AppHub`(Subscribe/Unsubscribe/Broadcast)。
- `internal/server/handler/app_ws.go`:`NewAppWS(userSvc, workspaceSvc)` 返回 gin handler:auth 帧 → 校验 → Subscribe;读循环复用 `ws.Conn`。
- 发布方:构造 `v1.Frame` 后 `appHub.Broadcast(workspaceID, frame)`。TaskService/IssueService 需要拿到 `AppHub` 引用(在 `routes.go` 注入)。

### 5.2 前端

- `web/lib/realtime.ts`:轻量 WS 客户端(连接/auth/重连/on/off),对齐 Multica 的 `ws-client.ts` 但去掉 cookie 模式。
- `web/hooks/useRealtime.ts`:`useRealtime(workspaceSlug)` 建连、订阅事件、断线补拉,暴露事件到组件。
- `web/app/(app)/[slug]/issues/[issueKey]/page.tsx`:加「Agent activity」live 面板,渲染 `task:progress` 的 text/thinking/tool(thinking 折叠、tool 显示 input.command、text 用 `Markdown`)。

## 6. 数据模型

`task_messages` 表见任务派发设计(第 9 章 §6);本设计不新增表。

## 7. 与现有系统的接线

- 复用 `ws.Conn`/`ws.Dispatcher`/`ws.Upgrade`(连接、读循环、帧分发)。
- `routes.go`:构造 `appHub` + `appWS`,注入 `TaskService`/`IssueService`。
- daemon `/ws/daemon` 完全不动。

## 8. 错误处理与安全

- `/ws/app` 鉴权失败 → 发 error 帧 + 关闭(复用现有 errorFrame 模式)。
- 广播非阻塞(drop on full),慢消费者不拖垮其他连接。
- 事件只发给「拥有该 workspace 的用户」的连接(auth 时已校验归属)。

## 9. 测试策略

- `AppHub` 单测:Subscribe/Broadcast/Unsubscribe/慢消费者 drop。
- `TaskService.Report` 单测:progress 落 `task_messages` + 发布事件;终态发布事件。
- 前端 `useRealtime` 用假 WS 客户端测订阅/重连/补拉逻辑。

## 10. MVP 范围与后续

**MVP:** `AppHub` + `/ws/app` + 发布点(TaskService/IssueService)+ `task_messages` 落库 + 前端客户端/hook + issue 详情页 live 面板。

**后续:** issue 看板实时刷新、多 workspace 订阅、presence、inbox、`task:progress` 的历史回放。

## 11. Open Questions

- **连接数上限**:一个 workspace 多标签页各占一条连接,是否需要按 user 去重/限流。
- **task:progress 的 input/output 是否截断**:tool output 可能很大(命令输出),是否需要服务端截断后再推。
- **事件 payload 是否含完整对象**:`comment:created` 推完整 comment 还是只推 id 让前端拉取(前者省一次请求,后者省带宽)。
