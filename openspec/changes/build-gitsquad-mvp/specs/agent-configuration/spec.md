## ADDED Requirements

> 注(2026-09-07):本 spec 已按 2026-09-02 agent 子系统设计(`docs/superpowers/specs/2026-09-02-agent-subsystem-design.md`)重写,对齐已落地实现。核心语义变化:agent 是「人设 + runtime 绑定」,不再携带 `role`/`environment`/`coder_backend`/`can_mention`;执行细节下放 runtime(`provider`/`runtime_mode`)。

### Requirement: Agent 配置实体(人设 + runtime 绑定)

系统 SHALL 在 Workspace 下管理一组 agent。每个 agent MUST 描述:唯一 @mention 名称(`name`,小写规范化)、人设(`description`、`instructions`)、可选模型覆盖(`model`,空 = 用 provider 默认)、绑定的 runtime(`runtime_id`)、启用状态(`enabled`)、头像(`avatar_url`)、运行次数(`run_count`)以及审计字段(`created_by`、`created_at`、`updated_at`)。

agent MUST NOT 直接携带 `role`/`environment`/`coder_backend`/`can_mention`——这些执行细节由绑定的 runtime(`provider`、`runtime_mode`)承担。

#### Scenario: 配置一个绑定 local runtime 的 coder agent

- **WHEN** 用户在某 Workspace 添加 agent,指定 `name=coder`、`description`/`instructions`、`daemon_id` + `provider=claude`、`enabled=true`
- **THEN** 系统 MUST 创建(或按需 upsert)该 Workspace 下对应的 `agent_runtime`,并持久化 agent 绑定到该 runtime,使其可被该 Workspace 内的 Issue 通过 `@coder` 触发

### Requirement: Agent 名称在 Workspace 内唯一且规范化

系统 SHALL 保证同一 Workspace 内 agent 名称唯一,并在写入前做小写化与格式校验(`^[a-z0-9][a-z0-9_-]{0,63}$`)。

#### Scenario: 重名 agent 被拒绝

- **WHEN** 用户尝试在同一 Workspace 添加与已有 agent 同名的 agent
- **THEN** 系统 MUST 拒绝并提示名称冲突

#### Scenario: 名称格式非法被拒绝

- **WHEN** 用户提交的 agent 名称包含空格、大写或非法字符
- **THEN** 系统 MUST 小写化后校验,不满足正则时拒绝

### Requirement: Runtime 是 workspace 级执行目标(provider × runtime_mode)

系统 SHALL 将「执行环境」建模为 workspace 级 `agent_runtime`,由 `daemon_id`(local)与 `provider` 构成。`provider`(∈ {claude, codex},MVP)是编码 CLI 短标识;`runtime_mode`(local/cloud,MVP 仅 local)表达执行位置。二者是两个正交轴,agent 通过可变绑定 `runtime_id` 指向一个 runtime。

#### Scenario: 绑定 local 的 codex

- **WHEN** 用户创建 agent 并指定 `daemon_id` + `provider=codex`
- **THEN** 系统 MUST 校验 provider 合法、daemon 属于该 Workspace 的 owner,并 upsert 出 `(workspace_id, daemon_id, provider)` 的 runtime 行后绑定

#### Scenario: daemon owner 与 workspace owner 不一致被拒绝

- **WHEN** 用户指定的 daemon 不属于该 Workspace 的 owner
- **THEN** 系统 MUST 拒绝绑定(配置时即做 owner 隔离)

### Requirement: Agent ⇄ Skill 多对多挂载

系统 SHALL 提供 workspace 级 `skill`(name/description/content)实体,并允许 agent 通过 `agent_skills` 多对多挂载技能。

#### Scenario: 为 agent 挂载技能

- **WHEN** 用户在创建/更新 agent 时提交 `skill_ids`
- **THEN** 系统 MUST 清空并重写该 agent 的 skill 挂载关系

### Requirement: enabled=false 从 @mention 匹配中排除

系统 SHALL 仅在 @mention 解析中使用 `enabled=true` 的 agent;`enabled=false` 的 agent MUST NOT 参与匹配,`@该agent` 落入 unmatched 并追加系统提示。MVP MUST NOT 执行任何自动接力(所有接力由人类显式 @ 触发)。

#### Scenario: 禁用 agent 不参与匹配

- **WHEN** 某 agent `enabled=false` 且 Issue 中出现 `@该agent`
- **THEN** 系统 MUST 将该 mention 视为 unmatched,且 MUST NOT 生成任务或自动 @ 其他 agent

### Requirement: Model 是 agent 的可选覆盖

系统 SHALL 在 agent 上持久化可选 `model` 字段(空 = 用 provider 默认)。可用模型列表由 daemon 按 provider 现查(不落库),模型 ID 字符串直传 CLI;现查失败或 provider 不支持时 fail-open 退化为仅自由输入。

#### Scenario: 未指定 model 用 provider 默认

- **WHEN** 创建 agent 未指定 `model`
- **THEN** 系统 MUST 持久化空值,执行时由 provider 使用默认模型
