## ADDED Requirements

### Requirement: 统一 Agent Runtime

系统 SHALL 提供一套与部署位置无关的 Agent Runtime,作为 local 与 cloud 两种外壳共享的内核。Runtime MUST 依次完成:认证/连接 → runtime status check/能力确认 → clone repo → 组装上下文(读 Issue 黑板 + repo 代码) → 驱动 coder backend → 收集产物 → 回写(PR / Issue 评论 / 状态) → 向 SaaS 报告。Runtime MUST NOT 直接调用 LLM API(由 coder backend 完成)。

#### Scenario: Runtime 内核不感知部署位置

- **WHEN** 同一份 Runtime 代码分别运行在 LocalShell 与 CloudShell 中
- **THEN** Runtime 的核心步骤(认证、clone、上下文组装、驱动、回写)MUST 行为一致,部署位置差异由 Shell 注入的环境与凭证承担

### Requirement: LocalShell 常驻 daemon

系统 SHALL 提供常驻 LocalShell,以 daemon 形态运行于用户机器。daemon MUST 通过 `gitsquad daemon login`(浏览器配对或 `--token` 直传)注册到 User 账号(非 Workspace),服务该 User 下所有 Workspace 的 local agent。daemon MUST 使用 `gitsquad daemon status` 上报该 machine 下发现的 runtime capabilities。daemon↔server 通信 MUST 以 WebSocket 长连接(`/ws/daemon`)为主通道,承载心跳、任务唤醒推送(`task_wake`)和 runtime 清理通知(`runtime_gone`);当 WS 不可用时 MUST 降级为 HTTP 心跳 + 轮询。

#### Scenario: daemon 注册到 User

- **WHEN** 用户在本机启动 daemon 并完成认证
- **THEN** 系统 MUST 将该 daemon 注册到当前 User,标记其在线,且使其能接收该 User 所有 Workspace 中 `environment=local` 的 agent 任务

#### Scenario: daemon 通过 WS task_wake 拉模式领活

- **WHEN** 某 `environment=local` 的 agent 被 @ 派发任务
- **THEN** 系统 MUST 将任务放入该 User 的 daemon 任务队列,并通过 WS `task_wake` 帧唤醒 daemon
- **AND** daemon 收到唤醒后 MUST 通过 HTTP `GET /api/v1/daemon/{id}/tasks/pending` 拉取完整任务载荷并执行

#### Scenario: daemon 下线处理(MVP)

- **WHEN** daemon 与 SaaS 失去连接且任务在途
- **THEN** 系统 MUST 在超时后将该任务标记为 `failed`,并向关联 Issue 追加系统评论通知用户;MVP MUST NOT 自动迁移任务到 cloud
- **AND** 若 daemon 被 revoke,系统 MUST 通过 WS `runtime_gone` 帧通知 daemon 即时清理

### Requirement: CloudShell 临时 sandbox

系统 SHALL 为 `environment=cloud` 的 agent 按任务 spawn 临时 sandbox,sandbox MUST 在任务完成后销毁。SaaS MUST 以推模式主动 spawn sandbox 并灌入任务。

#### Scenario: 按任务 spawn 与销毁

- **WHEN** 某 `environment=cloud` 的 agent 被 @ 派发任务
- **THEN** 系统 MUST 通过 SandboxProvider spawn 一个携带目标 Runtime 镜像(内含选定 coder backend)的 sandbox,灌入任务;任务结束(成功或失败)后 MUST 销毁该 sandbox

#### Scenario: sandbox 超时回收

- **WHEN** 某云 sandbox 任务运行超过预设超时
- **THEN** 系统 MUST 通过 SandboxProvider kill 该 sandbox,标记任务超时失败,并回流原因到关联 Issue

### Requirement: 可插拔 SandboxProvider 接口

系统 SHALL 定义统一的 SandboxProvider 接口,抽象 cloud 执行后端。接口 MUST 至少包含:`spawn(task, runtime_image) → handle`、`logs(handle) → stream`、`kill(handle)`。系统 MUST 通过该接口接入具体厂商(Cloudflare Containers / E2B / Fly Machines / Modal 等候选),且 Runtime 与 Shell 代码 MUST NOT 与具体厂商耦合。

#### Scenario: Runtime 不耦合具体厂商

- **WHEN** 系统从 sandbox provider A 切换到 provider B
- **THEN** Runtime 代码 MUST 无需修改,仅需替换 SandboxProvider 实现

#### Scenario: MVP 选定单一 provider

- **WHEN** MVP 部署
- **THEN** 系统 MUST 接入至少一个具体的 SandboxProvider 实现以支持 cloud agent,具体选型在实现阶段 spike 后确定

### Requirement: 两种外壳差异封装在 Shell 层

系统 SHALL 将 local 与 cloud 在生命周期(持久 vs 临时)与触发方向(拉 vs 推)上的真实差异封装在各自的 Shell 实现中,Runtime 通过统一接口(如 `next_task()`)获取任务,Shell 各自实现该接口。Runtime MUST NOT 直接处理心跳/重连(local 特有)或 spawn/healthcheck/kill(cloud 特有)。

#### Scenario: Runtime 通过统一接口拿任务

- **WHEN** Runtime 在任一 Shell 中需要获取下一个任务
- **THEN** Runtime MUST 调用统一的 `next_task()` 接口;LocalShell 通过长连接队列实现,CloudShell 通过启动时注入的任务参数实现

### Requirement: Runtime status check 是 local 派发前置条件

系统 SHALL 在 local task 派发前使用 DaemonMachine 上报的 runtime status check 结果判断任务是否可执行。status check 结果 MUST 拆成 machine 级状态(GitSquad daemon 版本、OS/arch、git 可用性、工作目录可写性)与 runtime capability 列表(支持的 coder backend,如 codex/claude-code)。

#### Scenario: capability 满足任务

- **WHEN** local task 目标 agent 需要 `coder_backend=codex` 且 DaemonMachine 的 RuntimeCapability 列表包含 `kind=coder_backend,name=codex,status=available`
- **THEN** SaaS MAY 将任务放入该 daemon 的拉取队列

#### Scenario: capability 不满足任务

- **WHEN** local task 目标 agent 需要 `coder_backend=claude-code` 但没有 online DaemonMachine 上报该 runtime capability
- **THEN** SaaS MUST 阻止派发并向 Issue 回流需要运行 `gitsquad daemon status` 或安装 backend 的提示