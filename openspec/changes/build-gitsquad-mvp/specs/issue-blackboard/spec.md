## ADDED Requirements

### Requirement: Issue 作为协作黑板

系统 SHALL 提供平台自建 Issue 作为 agent 与人类协作的唯一黑板。Issue 不使用 GitHub 的 issue 系统,统一在 GitSquad 平台内创建与管理。所有 agent 与人类参与者通过对同一 Issue 的评论流进行协作,agent 之间不直接通信。

#### Scenario: 用户在 Workspace 创建 Issue

- **WHEN** 用户在已绑定 repo 的 Workspace 中创建一个 Issue,填写标题与描述
- **THEN** 系统 MUST 在该 Workspace 下持久化此 Issue,记录创建者、创建时间、初始状态 `open`,且此 Issue 不出现在 GitHub 的 issue 列表中

#### Scenario: Issue 黑板读写对称

- **WHEN** agent 与人类分别对同一 Issue 添加评论
- **THEN** 两类评论 MUST 以对等形式出现在同一评论流中,任何后续读取者(人或 agent)读到统一的对话历史

### Requirement: Issue 基础 CRUD

系统 SHALL 提供对 Issue 的创建、读取、更新、关闭操作。每个 Issue MUST 归属于唯一一个 Workspace。

#### Scenario: 关闭 Issue

- **WHEN** Issue 完成或被取消,具备权限的参与者将其关闭
- **THEN** 系统 MUST 将 Issue 状态置为终态(`done` 或 `closed`),且该 Issue 不再出现在活跃 Issue 列表中,但历史可查

### Requirement: Issue 评论流

系统 SHALL 支持在 Issue 下追加评论。评论 MUST 记录作者标识(人类用户或 agent)、时间戳与正文。评论 SHALL 支持 @mention 解析(见独立 Requirement)。

#### Scenario: 评论按时间追加

- **WHEN** 任意参与者向 Issue 添加评论
- **THEN** 系统 MUST 将该评论追加到评论流末尾,保留时序,不允许编辑历史评论(以维持黑板的可审计性)

### Requirement: @mention 解析与触发

系统 SHALL 解析 Issue 描述与评论中的 @mention,将被提及的 agent 标记为该 Issue 的待执行目标,并触发任务派发流程(详见 task-dispatch 能力)。

#### Scenario: 评论中 @ 某 agent

- **WHEN** 一条评论包含 `@coder` 且 Workspace 内存在名为 `coder` 的 agent 配置
- **THEN** 系统 MUST 将 `coder` 加入该 Issue 的 `assigned_agents`,并向 task-dispatch 能力派发一个以该 agent 为目标的任务

#### Scenario: @mention 指向不存在的 agent

- **WHEN** 评论包含 `@unknown` 且 Workspace 内无此 agent
- **THEN** 系统 MUST 在评论流中追加一条系统提示,说明该名称未匹配到 agent,且不派发任务

### Requirement: Issue 简单状态机

系统 SHALL 对每个 Issue 维护一个简单状态:`open` → `in_progress` → `done`(外加可选 `closed`)。MVP 不引入 label / 看板等复杂 PM 功能。

#### Scenario: Issue 进入 in_progress

- **WHEN** 某被 @ 的 agent 开始执行任务
- **THEN** 系统 MUST 将 Issue 状态从 `open` 转为 `in_progress`

#### Scenario: Issue 完成转 done

- **WHEN** Issue 关联的 PR 被合并,或具备权限的参与者手动标记完成
- **THEN** 系统 MUST 将 Issue 状态转为 `done`

### Requirement: Issue 与 PR 的弱关联

系统 SHALL 在 Issue 上维护关联 PR 列表(弱关联)。agent 提 PR 时 MUST 在 PR body 中引用 Issue 链接,并将该 PR URL 记录到 Issue 的 `linked_prs` 字段。

#### Scenario: agent 提 PR 并关联 Issue

- **WHEN** agent 完成 Issue 任务并在 GitHub 创建 PR
- **THEN** PR body MUST 包含指向平台 Issue 的链接,且系统 MUST 把该 PR URL 写入 Issue 的 `linked_prs`

### Requirement: PR 事件单向回流

系统 SHALL 通过 webhook 接收 GitHub PR 事件(创建、评论、review 状态变更、合并),并将关键事件以系统评论形式单向回流到关联的平台 Issue。系统 MUST NOT 将平台 Issue 内容反向投影到 PR。

#### Scenario: PR 合并回流关闭 Issue

- **WHEN** 关联 Issue 的 PR 在 GitHub 被合并
- **THEN** 系统 MUST 在 Issue 评论流追加一条系统评论说明 PR 已合并,并将 Issue 状态置为 `done`

#### Scenario: PR review 评论回流

- **WHEN** 人类 reviewer 在 PR 上提交 review 评论
- **THEN** 系统 MUST 将该评论以系统评论形式回流到关联 Issue,使 agent 能读到 review 反馈

### Requirement: 为 upstream 导入预留字段

系统 SHALL 在 Issue 数据模型上预留可选字段 `source_upstream_issue`(类型为指向 upstream repo issue 的引用,如 `owner/repo#100`)。MVP MUST NOT 实现该字段的同步逻辑,但字段存在以为未来场景 2(开源贡献)留口。

#### Scenario: MVP 不读取该字段

- **WHEN** Issue 被创建或更新
- **THEN** 系统 MUST 接受 `source_upstream_issue` 字段被持久化,但 MUST NOT 在 MVP 中基于该字段执行任何同步或拉取行为
