## ADDED Requirements

### Requirement: 两层分离——link 与 Workspace

系统 SHALL 实现 Vercel 式两层分离:link(GitHub App 安装授权,决定能访问哪些 repo)与 Workspace(从已授权 repo 中指定一个,绑定 agent 团队与 Issue)。

#### Scenario: link 先于 Workspace 创建

- **WHEN** 用户尚未安装 GitHub App 或安装后无可访问 repo
- **THEN** 系统 MUST 阻止 Workspace 创建,并引导用户先完成 link 流程

### Requirement: Workspace 创建

系统 SHALL 允许用户从其 `GitHubAppInstallation` 的可访问 repo 列表中选定一个 repo 创建 Workspace。每个 Workspace MUST 绑定唯一一个 repo,但一个 repo 可被多个 Workspace 指向。

#### Scenario: 创建 Workspace 并绑定 repo

- **WHEN** 用户选择一个已授权的 repo 并创建 Workspace
- **THEN** 系统 MUST 持久化该 Workspace,记录其绑定的 repo、所属用户/组织,并初始化空的 agent 团队与 Issue 集合

#### Scenario: 同一 repo 多 Workspace

- **WHEN** 用户对已绑定过的 repo 再次创建 Workspace
- **THEN** 系统 MUST 允许创建,两个 Workspace 各自独立维护自己的 agent 团队与 Issue

### Requirement: Workspace 作为组织核心

系统 SHALL 将 Issue 与 agent 团队配置挂载在 Workspace 下。Issue MUST 唯一归属于一个 Workspace;agent 配置 MUST 作用于其所属 Workspace。

#### Scenario: Issue 归属唯一 Workspace

- **WHEN** 用户在 Workspace A 创建 Issue
- **THEN** 该 Issue MUST 仅出现在 Workspace A 中,Workspace B 不可见(除非未来引入显式共享,MVP 不做)

### Requirement: Workspace 可访问性校验

系统 SHALL 在创建 Issue、配置 agent、触发任务前校验目标 Workspace 存在且属于当前用户/组织,且其绑定 repo 仍在 GitHub App 授权范围内。

#### Scenario: repo 被取消授权

- **WHEN** 用户在 GitHub 侧撤销了 App 对某 repo 的访问,而存在 Workspace 绑定该 repo
- **THEN** 系统 MUST 将该 Workspace 标记为 `degraded`,阻止新的 Issue 创建与任务派发,并在 UI 提示用户重新授权
