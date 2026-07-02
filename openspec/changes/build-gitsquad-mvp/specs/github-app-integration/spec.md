## ADDED Requirements

### Requirement: GitHub App 安装与 link

系统 SHALL 通过 GitHub App 实现授权与 repo 访问。link 流程对标 Vercel:用户安装 GitSquad GitHub App,在安装时选择授权 GitSquad 可访问的 repo 集合。

#### Scenario: 用户安装 GitHub App

- **WHEN** 用户在平台发起 link 流程并被重定向到 GitHub
- **THEN** 系统 MUST 引导用户完成 GitHub App 安装,并在安装完成后记录一条 `GitHubAppInstallation`,其中包含被授权访问的 repo 列表

#### Scenario: 用户调整授权 repo 集合

- **WHEN** 用户在 GitHub 侧更改 App 可访问的 repo 集合
- **THEN** 系统 MUST 通过 webhook 感知此变更并更新对应 `GitHubAppInstallation` 的可访问 repo 列表

### Requirement: Webhook 事件接收

系统 SHALL 订阅所需 GitHub webhook 事件以驱动 agent 协作与 PR 回流,包括但不限于 `pull_request`(创建、评论、review、合并)、`installation` / `installation_repositories`(授权变更)。

#### Scenario: 接收 PR 事件

- **WHEN** GitHub 推送 `pull_request` webhook 到系统
- **THEN** 系统 MUST 校验签名,解析事件,并据此触发 PR 事件单向回流(见 issue-blackboard 能力)

#### Scenario: 拒绝未签名 webhook

- **WHEN** 系统收到无法通过签名校验的 webhook
- **THEN** 系统 MUST 拒绝处理并记录安全日志,不产生任何副作用

### Requirement: 提 PR 能力

系统 SHALL 通过 GitHub App 凭证,代表 Workspace 内配置的 agent 在绑定的 repo 上创建分支、提交改动并发起 Pull Request。PR body MUST 引用平台 Issue 链接(弱关联)。

#### Scenario: agent 通过系统提 PR

- **WHEN** 某 agent 完成 Issue 任务并产出代码改动
- **THEN** 系统 MUST 使用 GitHub App 凭证在绑定的 repo 创建分支、提交改动,创建 PR,且 PR body 包含指向平台 Issue 的链接

### Requirement: 合并 PR 能力

系统 SHALL 通过 GitHub App 凭证合并关联 Issue 的 PR(用于实现"端到端到合并"的差异化能力)。合并 MUST 遵守 repo 的 branch protection 规则;若规则禁止,系统 MUST NOT 强制合并,而是将阻塞原因回流到 Issue。

#### Scenario: 满足 branch protection 时合并

- **WHEN** 关联 Issue 的 PR 已通过必要 review 且满足 branch protection
- **THEN** 系统 MUST 通过 GitHub App 凭证合并该 PR

#### Scenario: 不满足时回流阻塞

- **WHEN** 关联 Issue 的 PR 因 branch protection(缺少 review、CI 失败等)无法合并
- **THEN** 系统 MUST NOT 强制合并,且 MUST 将阻塞原因以系统评论形式回流到关联 Issue

### Requirement: 凭证与权限隔离

系统 SHALL 使用 GitHub App 的 installation token 访问 repo,token MUST 按 installation 隔离,绝不跨 Workspace / 跨用户复用。系统 MUST NOT 存储 GitHub 用户的个人访问令牌。

#### Scenario: 跨 repo 访问受 installation 限制

- **WHEN** 系统 代某 agent 访问 repo
- **THEN** 系统 MUST 仅使用该 Workspace 对应 installation 的 token,且仅能访问该 installation 授权的 repo 集合
