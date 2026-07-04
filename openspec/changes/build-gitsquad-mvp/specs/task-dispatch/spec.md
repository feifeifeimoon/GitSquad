## ADDED Requirements

### Requirement: @mention 解析为目标 agent

系统 SHALL 在 Issue 描述或评论中出现 @mention 时,解析出目标 agent 名称,在所属 Workspace 的 agent 团队中定位该 agent,并生成一个待派发任务。

#### Scenario: 解析 @coder 并定位 agent

- **WHEN** Issue 评论包含 `@coder` 且 Workspace 内存在 `role=coder` 的 agent
- **THEN** 系统 MUST 生成一个以该 agent 为目标的任务,任务携带 Issue 上下文引用与目标 AgentConfig 快照

### Requirement: 按 environment 路由

系统 SHALL 根据目标 agent 的 `environment` 字段将任务路由到不同执行路径:`local` → 按 User 下 online DaemonMachine + RuntimeCapability 匹配后放入 daemon machine 可拉取队列(拉模式);`cloud` → 通过 SandboxProvider spawn 临时 sandbox(推模式)。

#### Scenario: local agent 入队列并通过 WS task_wake 推送

- **WHEN** 目标 agent `environment=local`
- **THEN** 系统 MUST 查找该 User 下 online 的 DaemonMachine,并在其 RuntimeCapability 中匹配 `coder_backend`;找到后将任务放入该 machine 可拉取队列并记录选中 runtime
- **AND** 系统 MUST 通过该 DaemonMachine 的 WS 长连接发送 `task_wake` 帧唤醒 daemon
- **AND** daemon 收到唤醒后 MUST 通过 HTTP `GET /api/v1/daemon/{id}/tasks/pending` 拉取完整任务载荷
- **AND** 若没有可用 daemon,系统 MUST 将任务标记为 `blocked_waiting_for_daemon` 并回流 Issue

#### Scenario: WS 不可用时 HTTP 轮询降级

- **WHEN** DaemonMachine 的 WS 长连接断开且超过 5 分钟未恢复
- **THEN** daemon MUST 降级为周期性 HTTP `POST /api/v1/daemon/{id}/heartbeat` 心跳
- **AND** daemon MUST 在每次心跳响应中检查 `pending_tasks` 字段,若 >0 则通过 HTTP `GET /api/v1/daemon/{id}/tasks/pending` 拉取任务
- **AND** WS 恢复连接后 MUST 切回 WS 推送模式

#### Scenario: cloud agent 触发 spawn

- **WHEN** 目标 agent `environment=cloud`
- **THEN** 系统 MUST 调用 SandboxProvider spawn 携带匹配 coder backend 的 Runtime 镜像,并将任务推入

### Requirement: 任务携带完整上下文

系统 SHALL 在派发任务时,确保任务携带 agent 工作所需的上下文引用:目标 Issue(用于读黑板评论流)、Workspace 绑定 repo 的访问凭证(GitHub App installation token,按 installation 隔离)、AgentConfig 快照(name / role / environment / coder_backend / can_mention)。

#### Scenario: agent 收到 repo 凭证

- **WHEN** 任务被派发到任一执行路径
- **THEN** 任务 MUST 携带对应 Workspace 的 GitHub App installation 凭证,使 Runtime 能 clone 并改 repo

### Requirement: 任务状态回流 Issue

系统 SHALL 在任务生命周期关键节点(开始、进行中、成功、失败)将状态以系统评论形式回流到关联 Issue,并相应更新 Issue 状态机(in_progress / done)。

#### Scenario: 任务开始回流

- **WHEN** Runtime 开始执行任务
- **THEN** 系统 MUST 在关联 Issue 追加系统评论(如"coder 已开始工作"),并将 Issue 状态置为 `in_progress`

#### Scenario: 任务失败回流

- **WHEN** 任务执行失败或超时
- **THEN** 系统 MUST 在关联 Issue 追加系统评论说明失败原因,并将 Issue 状态保留在 `in_progress`(等待用户决策),MVP MUST NOT 自动重试

### Requirement: MVP 不执行自动接力

系统 MUST NOT 在 MVP 中因 agent 的 `can_mention` 字段而在任务完成后自动 @ 其他 agent。MVP 中所有接力 MUST 由人类显式 @ 触发。

#### Scenario: 任务完成后不自动接力

- **WHEN** 某 agent 完成任务(即使其 `can_mention` 非空)
- **THEN** 系统 MUST 在关联 Issue 回流任务完成,但 MUST NOT 自动创建对其他 agent 的 @mention 任务

### Requirement: Server 端任务取消/超时通过 runtime_gone 即时通知 Daemon

系统 SHALL 在 Server 端因任务取消、超时、daemon 撤销等原因删除 runtime 行时,通过 WS `runtime_gone` 帧即时通知对应 daemon 执行清理。Daemon 收到通知后 MUST kill 对应的 coder backend 进程、清理工作目录、并回复 `runtime_gone_ack` 确认。

#### Scenario: 用户取消正在 local 执行的任务

- **WHEN** 用户在 SaaS 取消一个已派发到 local daemon 且正在执行的任务
- **THEN** Server MUST 通过 WS `runtime_gone` 帧通知 daemon(含 `task_id` 和 `reason:task_cancelled`)
- **AND** daemon MUST kill 对应的 coder 进程并清理 workdir
- **AND** daemon MUST 回复 `runtime_gone_ack` 确认清理完成

#### Scenario: Daemon 被撤销时清理所有在途任务

- **WHEN** daemon 被撤销(`DELETE /api/v1/daemon/{id}`)
- **THEN** Server MUST 通过 WS `runtime_gone` 帧通知 daemon(含 `reason:daemon_revoked`)
- **AND** daemon MUST kill 所有在途任务、清理所有 workdir、删除本地 token、退出进程

### Requirement: task_wake 只唤醒不传任务载荷

系统 SHALL 通过 WS `task_wake` 帧通知 daemon 有新任务可拉取,但 MUST NOT 在 WS 帧中直接携带完整任务载荷。完整任务载荷(含 GitHub App installation token、Issue 上下文等)MUST 通过 HTTP `GET /api/v1/daemon/{id}/tasks/pending` 获取。

#### Scenario: task_wake 唤醒 → HTTP 拉取

- **WHEN** daemon 收到 WS `task_wake` 帧
- **THEN** daemon MUST 回复 `task_wake_ack` 确认收到
- **AND** daemon MUST 调用 HTTP `GET /api/v1/daemon/{id}/tasks/pending` 拉取完整任务载荷
- **AND** 任务载荷中 MUST 包含 GitHub App installation token 用于 repo clone

#### Scenario: heartbeat_ack 中的 pending_tasks 反压

- **WHEN** daemon 收到 WS `heartbeat_ack` 且 `pending_tasks > 0`
- **THEN** daemon MUST 主动调用 HTTP `GET /api/v1/daemon/{id}/tasks/pending` 拉取任务
- **AND** 该机制覆盖 daemon 重连后积压任务未被 task_wake 通知到的场景
