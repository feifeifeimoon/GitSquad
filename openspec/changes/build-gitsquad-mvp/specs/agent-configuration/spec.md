## ADDED Requirements

### Requirement: Agent 配置实体

系统 SHALL 在 Workspace 下管理一组 agent 配置。每个 agent 配置 MUST 描述:唯一 @mention 名称(`name`)、角色(`role`,如 planner / coder / reviewer)、执行环境(`environment`,取值 `cloud` 或 `local`)、coder backend(`coder_backend`,如 `claude-code` / `codex`)、能力边界(`can_mention`,agent 名称列表)、启用状态(`enabled`)以及审计字段(`created_by`, `created_at`, `updated_at`)。

#### Scenario: 配置一个 local coder agent

- **WHEN** 用户在某 Workspace 添加 agent,指定 `name=coder`、`role=coder`、`environment=local`、`coder_backend=claude-code`、`can_mention=[]`、`enabled=true`
- **THEN** 系统 MUST 持久化该 agent 配置,使其可被该 Workspace 内的 Issue 通过 `@coder` 触发

### Requirement: @mention 名称在 Workspace 内唯一

系统 SHALL 保证同一 Workspace 内 agent 的 @mention 名称(role 或显式别名)唯一,以支持 @mention 解析。

#### Scenario: 重名 agent 被拒绝

- **WHEN** 用户尝试在同一 Workspace 添加与已有 agent 同名的 agent
- **THEN** 系统 MUST 拒绝并提示名称冲突

### Requirement: coder_backend 与 sandbox_provider 正交选择

系统 SHALL 将 coder_backend(驱动哪个现成编码器)与执行环境/sandbox_provider(在哪里跑)作为两个正交选择轴。用户 MUST 能独立组合二者。

#### Scenario: Codex 跑在 cloud

- **WHEN** 用户配置 `coder_backend=codex`、`environment=cloud`(并选定某 sandbox provider)
- **THEN** 系统 MUST 在任务派发时,在所选 sandbox 中启动携带 Codex 的 Runtime 镜像

#### Scenario: Claude Code 跑在 local

- **WHEN** 用户配置 `coder_backend=claude-code`、`environment=local`
- **THEN** 系统 MUST 在任务派发时,将任务派给该用户的 LocalDaemon,由 daemon 驱动用户机器上的 Claude Code

### Requirement: can_mention 字段为自动接力留接口

系统 SHALL 在 agent 配置中持久化 `can_mention` 字段。MVP MUST 将其默认值设为空数组,等价于接力模式 A(人工 @ 触发)。系统 MUST NOT 在 MVP 中因该字段非空而执行任何自动 @ 行为。

#### Scenario: MVP 默认空数组

- **WHEN** 用户创建 agent 未显式指定 `can_mention`
- **THEN** 系统 MUST 将其设为 `[]`,且该 agent 完成任务后 MUST NOT 自动 @ 其他 agent

#### Scenario: 非空值在 MVP 不触发自动接力

- **WHEN** 用户在 MVP 中手动填入 `can_mention=[reviewer]`
- **THEN** 系统 MUST 接受并持久化该值,但 MUST NOT 在 MVP 中据此执行自动接力(字段仅作为未来模式 C 的预留)

### Requirement: Agent 配置不绑定具体 daemon

系统 SHALL 将 `AgentConfig.environment=local` 解释为"任务必须由当前 User 下满足能力的 daemon 执行"。AgentConfig MUST NOT 直接保存 daemon machine id 或 runtime capability id。具体 machine/runtime 的选择 MUST 在任务派发时根据 daemon 在线状态与 RuntimeCapability 动态决定。

#### Scenario: local agent 不指定 daemon

- **WHEN** 用户在 Workspace 中创建 `environment=local` 的 agent
- **THEN** 系统 MUST 持久化该 agent 配置但不要求选择具体 daemon
- **AND** 后续派发任务时 MUST 按 User 下 DaemonMachine 与 RuntimeCapability 匹配可执行的 machine/runtime 组合

### Requirement: Agent 名称作为 @mention 主键

系统 SHALL 使用 `AgentConfig.name` 作为 Workspace 内 @mention 解析主键。`role` 仅表达职责和默认模板, MUST NOT 被当作唯一身份字段。MVP MAY 默认将 `name` 初始化为 `role`,但一旦用户显式指定 name,解析 MUST 使用 name。

#### Scenario: role 相同但 name 不同

- **WHEN** Workspace 中存在 `name=frontend-coder, role=coder` 与 `name=backend-coder, role=coder`
- **THEN** `@frontend-coder` MUST 只定位 frontend-coder
- **AND** 系统 MUST NOT 因二者 role 相同而判定冲突