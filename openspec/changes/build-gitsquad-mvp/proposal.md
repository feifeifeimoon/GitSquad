## Why

GitSquad 是一个 **SaaS + GitHub App**,目标是让用户在自己的 GitHub 项目里实现"端到端自主开发"——描述一个 issue,agent 团队接管设计、编码、测试,最终交付到合并。

当前开发者用 AI 编码助手时,仍需手动驱动每一步:拆任务、改代码、跑测试、提 PR、等 review。GitSquad 要消除这种"人在中间转运"的损耗。区别于纯 PM 思路的工具(如 Multica),GitSquad 的差异化在于 **和 GitHub repo 的深度结合**(agent 具备工程师级的 repo 感知,不止读 issue 文本)、**端到端到合并**(不止提 PR)和 **混合执行**(云端 + 用户本地,任务可路由到最合适的环境)。

## What Changes

这是一个从零构建 MVP 的 change,涵盖 GitSquad 的核心骨架:

- **平台 Issue(黑板)**:GitSquad 自建 issue 作为 agent 协作的唯一黑板。issue 不走 GitHub 的 issue 系统,统一在平台内管理。具备 CRUD、评论流、@mention 解析、简单状态(open / in_progress / done)、关联 repo 与 PR。未来支持从 upstream issue 导入(留字段 `source_upstream_issue`,MVP 不实现)。
- **GitHub App 集成**:link 流程对标 Vercel —— 安装 GitHub App 授权可访问的仓库。GitSquad 通过 webhook 接收事件,具备提 PR、合并 PR 的能力。
- **Workspace**:Vercel 式两层分离。link = 授权层(GitHub App 能访问哪些 repo);Workspace = 绑定层(指定一个 repo + 配置 agent 团队)。issue 与 agent 团队都挂在 Workspace 下。
- **Agent 配置**:每个 Workspace 配置一组 agent。agent 描述角色(planner / coder / reviewer 等)、执行环境(cloud / local)、coder backend(claude-code / codex 等)、能力边界(`can_mention` 字段,MVP 留空,为未来自动接力留接口)。
- **混合执行层**:统一一套 Agent Runtime(认证、clone、组装上下文、驱动编码器、回写),两种外壳:
  - **LocalShell**:常驻 daemon,注册到 User(非 Workspace),长连接拉模式,服务多个 Workspace 的 local agent。
  - **CloudShell**:临时 sandbox,按任务 spawn、跑完销毁,通过可插拔的 SandboxProvider 实现(候选:Cloudflare Containers / E2B / Fly Machines 等)。
- **协作模型**:黑板架构,零 agent 间通信——所有协作状态都在 Issue 的评论流里。触发方式为 @mention(以及创建即触发)。接力 MVP 走模式 A(人工 @),`can_mention` 字段为未来模式 C(自动接力)留接口但不启用。
- **Issue ↔ PR 关联**:弱关联(PR body 引用 issue)+ 单向回流(PR 事件通过 webhook 流回 issue,不反向投影,避免双向同步地狱)。PR 合并 → issue 自动关闭。
- **GitSquad 是编排壳,不自建 agent loop**:agent 的核心是驱动现成编码器(Claude Code / Codex / Cursor CLI 等),GitSquad 不重新实现 LLM 工具循环。

## Capabilities

### New Capabilities

- `issue-blackboard`: 平台自建 issue 作为协作黑板——CRUD、评论流、@mention 触发、简单状态机、与 repo/PR 的弱关联。这是整个协作模型的载体。
- `github-app-integration`: GitHub App 安装与 link 流程(对标 Vercel)、webhook 接收、提 PR / 合并 PR 能力、PR 事件回流。
- `workspace-management`: Vercel 式两层分离——GitHub App 授权层(link)+ Workspace 绑定层(repo + agent 团队)。Workspace 是 issue 与 agent 的组织核心。
- `agent-configuration`: Workspace 内配置 agent 团队(角色 / 执行环境 / coder backend / 能力边界 `can_mention`)。
- `hybrid-execution`: 统一 Agent Runtime + 两种外壳(LocalShell daemon 与 CloudShell sandbox)+ 可插拔 SandboxProvider 接口。两个正交轴:coder_backend × sandbox_provider。
- `task-dispatch`: SaaS 任务派发——从 @mention 解析出目标 agent,按 agent.environment 路由到 local daemon(队列拉取)或 cloud sandbox(SaaS spawn 推送)。

### Modified Capabilities

(无,这是从零构建的 MVP。)

## Impact

- **新增系统组件**:
  - GitSquad SaaS(API + webhook 处理 + 任务派发 + issue 存储 + sandbox provision)
  - GitSquad GitHub App(授权、webhook 订阅、PR 读写)
  - GitSquad Agent Runtime + LocalShell(用户安装的常驻 daemon)
  - GitSquad CloudShell + SandboxProvider 集成
- **外部依赖**:
  - GitHub API(via GitHub App)
  - 第三方编码器(Claude Code / Codex 等,通过 CLI 驱动)
  - Sandbox 厂商(候选见 design.md,MVP 选定一家)
- **不在 MVP 范围**(显式后置,避免 scope 蔓延):
  - fork / upstream issue 同步(场景 2,开源贡献流程)
  - 自动接力(模式 C,`can_mention` 字段留接口但不启用)
  - 上线 L2+(打 tag、触发部署、回滚)——MVP 只做到 PR 合并
  - GitHub issue 作为黑板(统一用平台 issue)
  - Task 统一接口层(已砍掉,见 design.md 的"被否决的替代方案")
- **商业/成本**:混合执行意味着成本结构特殊(云端 sandbox 烧钱、用户本地免费)。计费模型留待后续。
