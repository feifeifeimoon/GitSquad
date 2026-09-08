# Runtime 执行内核实施计划(第 6 章)

- 日期:2026-09-08
- 状态:待评审
- 设计文档:`docs/superpowers/specs/2026-09-07-runtime-execution-design.md`(v2)
- 参考实现:Multica(`server/pkg/agent`、`server/internal/daemon/execenv`)、Orca(`src/main/codex`)

## 总览

本计划把第 6 章设计拆成可勾选任务，按依赖顺序排列。**MVP 只做 claude 一条 provider**，跑通「@coder → 认领 → 驱动 claude → push → 建 PR → 写 Issue」的最小闭环；codex(app-server)、任务持久化/状态机(第 9 章)、CloudShell(第 8 章)都后置。

- 范围:任务契约 + 流式 `provider.Backend`(claude)+ execenv + Runner + git 模块 + daemon/SaaS 接线 + 端到端冒烟。
- 非范围:任务表/状态机、cloud sandbox、PR 回流、多 provider、session 恢复、多任务并发。

## 里程碑顺序

| 阶段 | 内容 | 依赖 |
|------|------|------|
| P0 类型契约 | `v1.Task` + 相关类型 | 无 |
| P1 流式 Backend | `provider.Backend` 接口 + claude 适配器 | P0 |
| P2 execenv | per-task 环境准备 + brief/skill 注入 | P0 |
| P3 git 模块 | clone/fetch/branch/commit/push/diff | 无 |
| P4 Runner 内核 | 编排 + 产物收集 + Reporter | P1+P2+P3 |
| P5 daemon 接线 | 认领/执行/上报 + FIFO 执行器 | P0+P4 |
| P6 SaaS 接线 | 任务组装 + 内存队列 + 建 PR + 回写 | P0 |
| P7 冒烟 | local 路径端到端 | 全部 |

P1–P3 相互独立，可并行；P4 汇合三者；P5/P6 可并行，最后 P7 联调。

---

## P0 类型契约

- [ ] **0.1** 新增 `pkg/types/v1/task.go`：`Task` / `TaskIssueContext` / `TaskRepoContext` / `TaskAgentContext` / `TaskSkill` / `TaskComment`(按设计 §6.1)。注意 `Task.InstallationToken` 是**认领时才签发**的字段，入队结构不含它(见 P6)。
- [ ] **0.2** 新增 `pkg/types/v1/task_status.go`(或并入 task.go)：任务状态常量(`queued/claimed/running/succeeded/failed`)与进度事件上报结构(`started/succeeded/failed` + 产物摘要)。
- [ ] **0.3** 单测:JSON 序列化/反序列化往返、omitempty 字段行为。

## P1 流式 Backend

- [ ] **1.1** 新增 `internal/daemon/provider/backend.go`：`Backend` 接口 + `Session`/`Message`/`MessageType`/`Result`/`TokenUsage`/`ExecOptions`/`Config`(按设计 §6.2，对标 `multica/agent.go` 的命名与语义)。
- [ ] **1.2** 新增 `internal/daemon/provider/registry.go`：`New(kind, exePath) (Backend, error)` 按 provider 路由到具体实现；kind 与 `runtime_specs.go` 的 `RuntimeSpec.Kind` 对齐(`claude`/`codex`)。
- [ ] **1.3** 新增 `internal/daemon/provider/claude.go`：子进程 `claude -p --output-format stream-json --input-format stream-json --verbose --strict-mcp-config --permission-mode bypassPermissions --disallowedTools AskUserQuestion [--model …] [--max-turns …] [--append-system-prompt …]`；stdin 写 stream-json 输入，stdout 逐行解析 JSONL 并翻译成 `Message` 事件(至少覆盖 `text/thinking/tool_use/status/result`)。进程组启动、`exec.CommandContext` + 进程组 kill。
- [ ] **1.4** 单测 `claude_test.go`:用假 `claude` 脚本输出 JSONL 事件，断言 Message 翻译、Result 终态、超时 kill、坏 JSONL 容错。
- [ ] **1.5** (后置)codex app-server 适配器:`codex app-server --listen stdio://` JSON-RPC 握手，本阶段不做，只留 registry 空位。

## P2 execenv

- [ ] **2.1** 新增 `internal/daemon/execenv/execenv.go`：`Env`/`PrepareParams` + `Prepare(root, p) (*Env, error)`，创建 per-task 目录 `{workdir}/tasks/{workspace_id}/{task_id}/`。
- [ ] **2.2** 新增 `internal/daemon/execenv/brief.go`：`renderBrief(provider, ctx) string`，生成受管 brief(见设计 §6.3)——`# GitSquad Agent Runtime` 头部 + `## Agent Identity`(人设)+ `## Task`(issue 摘要)+ `## Repositories` + `## Working Instructions`。
- [ ] **2.3** 新增 `internal/daemon/execenv/runtime_config.go`：把 brief 用 `<!-- BEGIN GITSQUAD-RUNTIME -->…<!-- END -->` 包裹，注入 `{root}/CLAUDE.md`(claude)或 `{root}/AGENTS.md`(codex)；保留文件内已有用户内容、幂等替换旧块。
- [ ] **2.4** 新增 `internal/daemon/execenv/context.go`：写 `{root}/.gitsquad/issue_context.md`(issue 标题/描述/评论流快照)；skill 注入 provider 原生位置(claude → `.claude/skills/{name}/SKILL.md`，codex → 后置)。
- [ ] **2.5** 单测 `execenv_test.go`/`brief_test.go`:brief 幂等注入(重复 Prepare 不产生重复块)、用户已有 CLAUDE.md 内容保留、skill 写入路径、issue_context 内容正确。

## P3 git 模块

- [ ] **3.1** 新增 `internal/daemon/runner/git.go`：`GitOps` 接口(`EnsureClone/CreateBranch/Commit/Push/Diff`)。
- [ ] **3.2** 实现 git CLI 版(用 `git` 命令，不引 go-git)：clone/fetch --prune、从 `origin/{default}` 切 `gitsquad/{issue_key}/{task_id}` 分支、commit(author=`gitsquad[bot]`+agent 名)、push(HTTPS + `x-access-token` 一次性认证)、`git diff {default}...HEAD`。
- [ ] **3.3** 集成测 `git_test.go`:临时目录 `git init` 一个裸仓库当 remote，测 clone→branch→commit→push→diff 全链路；认证用假 token 注入验证。

## P4 Runner 内核

- [ ] **4.1** 新增 `internal/daemon/runner/runner.go`：`Runner` 结构(`execenv`/`GitOps`/`provider.Backend`/`Reporter`/`workRoot`)+ `Run(ctx, task) error`，按设计 §4 的 1–6 编排:prepare env → checkout → `backend.Execute(trigger, opts)` → 流式转发 `Messages` 到 reporter + 等 `Result` → 收集产物 → commit/push → 上报终态。
- [ ] **4.2** 新增 `internal/daemon/runner/reporter.go`：`Reporter` 接口(流式事件 + 终态)；实现走 HTTP client(`tasks/:id/status`)。
- [ ] **4.3** 新增 `internal/daemon/runner/collect.go`：产物收集(diff + logs 落盘 + test 结果从 `Message{Type:tool_use}` 提取)。
- [ ] **4.4** 单测 `runner_test.go`:假 Backend/GitOps/Reporter 测步骤顺序、每步失败路径、超时/取消清理。

## P5 daemon 接线

- [ ] **5.1** `internal/daemon/client/daemon_api.go` 新增 `ClaimTask(ctx)` 与 `ReportTaskStatus(ctx, taskID, status)`，对应 `POST /api/v1/daemon/tasks/claim` 与 `POST /api/v1/daemon/tasks/:id/status`。
- [ ] **5.2** `internal/daemon/daemon.go` 新增 FIFO 任务队列 + 顺序执行器 goroutine(空闲且队列非空时认领一个 → `runner.Run` → 上报；`max_concurrency=1`)。
- [ ] **5.3** 把 `handleTaskWake` 与 `handleHeartbeatAck` 的 `task_available` 分支从 TODO 改为「入队 + 唤醒执行器」。
- [ ] **5.4** `runtime_gone` 分支：kill 当前任务进程 + 清理 workdir，回 `runtime_gone_ack`。
- [ ] **5.5** 心跳 `WSHeartbeatPayload.ActiveTasks` 填当前运行中任务 ID。
- [ ] **5.6** 单测 `daemon_test.go`:假 client/runner 测队列顺序、认领失败重试、心跳 active_tasks、runtime_gone 清理。

## P6 SaaS 接线

- [ ] **6.1** 新增 `internal/server/service/taskqueue.go`(或 `internal/server/taskqueue/`)：内存任务队列(带锁 slice/map，按 daemon 路由)，**第 9 章替换为 DB 队列**；队列元素为不含 installation token 的任务记录。
- [ ] **6.2** `internal/server/service/issue.go` 的 `dispatchForMention`(空 seam)改为：按 agent 名 + workspace 解析 agent/runtime(provider+daemon)/repo/installation，组装任务记录并入队；保留 `matched` 语义。若需「创建即触发」，同步在 `CreateIssue` 接同一 hook。
- [ ] **6.3** `internal/server/service/daemon.go` 的 `PendingActions`(返回 nil)改为：该 daemon 有排队任务时下发 `ActionTaskAvailable`(或经 WS 发 `task_wake`)。
- [ ] **6.4** 新增 handler 端点 `POST /api/v1/daemon/tasks/claim` 与 `POST /api/v1/daemon/tasks/:id/status`，走 `RequireDaemonAuth`；claim 时**签发新 installation token** 组装 `v1.Task` 返回，并校验 `task.daemon_id == 当前 daemon`。
- [ ] **6.5** `internal/server/service/github.go` 新增 `CreatePullRequest(installationDBID, owner, repo, head, base, title, body)`(用现有 `newInstallationClient`)。
- [ ] **6.6** `internal/server/service/issue.go` 新增任务回报处理：成功 → 建 PR + agent 评论 + 状态 `in_review`；失败 → 失败评论。
- [ ] **6.7** 单测:任务组装、`dispatchForMention` 入队、claim 签发 token、PR 创建(go-github httptest 打桩)、回报写 Issue。

## P7 端到端冒烟

- [ ] **7.1** 手动/脚本冒烟(本地):link → workspace → agent(claude,绑定本机 daemon)→ issue `@coder` → 观察 daemon 认领 → claude 执行 → push → SaaS 建 PR → issue 出现 agent 评论 + 状态 `in_review`。
- [ ] **7.2** 失败路径冒烟:claude 不可用/超时/被取消时,issue 出现失败评论、无 PR、daemon 进程被清理。
- [ ] **7.3** (后置)cloud 路径冒烟(第 8 章后)。

## 完成清单(每阶段后)

按 `agent.md` 要求:

```bash
go test -race $(go list ./... | grep -v '/web/')   # 本地无 cgo 时先 go test(不带 -race),CI 用 -race
go build $(go list ./... | grep -v '/web/')
go vet $(go list ./... | grep -v '/web/')
cd web && bun test && bun run lint && bun run build   # 仅前端有改动时
```

## 顺手项(独立,可随时做)

- [ ] 补 `internal/server/service/daemon_test.go`:`ReplaceRuntimes` 的 status/diagnostics 持久化单测(关闭 daemon-runtime-detection 的 6.4 缺口)。

## 后置(不在本计划)

- 任务持久化 + 生命周期状态机(第 9 章)、CloudShell + SandboxProvider(第 8 章)、codex/agy 适配器、PR 事件回流与合并关 Issue(第 10 章)、session 恢复/多轮、多任务并发、模型选择落库。
