## Context

GitSquad 从零构建。README 已声明愿景("autonomous developer team on GitHub","multi-agent orchestration framework"),但仓库目前只有 README、license、banner 和一个空的 OpenSpec 工作区,没有任何实现代码。

本设计基于探索阶段达成的一系列决策。两个参考对象:
- **Multica** 的内核(issue 黑板 + 驱动用户本地编码器如 Claude Code / Codex)
- **Vercel** 的身体(SaaS + GitHub App 深度集成,Vercel 式两层分离:安装授权 + 项目绑定)

GitSquad 的差异化:深度 repo 结合(agent 具备工程师级 repo 感知)、端到端到合并(不止提 PR)、混合执行(云端 + 用户本地,任务可路由到最合适的环境)。

约束:
- MVP scope 聚焦场景 1(自有项目端到端),场景 2(开源贡献 / fork / upstream 同步)显式后置。
- GitSquad 是编排壳,不自建 agent loop——驱动现成编码器(Claude Code / Codex 等)。
- 技术栈(Layer 2,具体语言/框架/数据库/云厂商)在本文档列为候选 + 选择标准,不在本阶段敲死。

## Goals / Non-Goals

**Goals:**
- 建立可工作的端到端 MVP:用户 link repo → 创建 Workspace → 创建 Issue → @coder → agent 读 issue + repo 上下文 → 提 PR → PR 事件回流 → 合并 → issue 关闭。
- 确立核心架构骨架:平台 Issue 黑板、Workspace 抽象、混合执行(Runtime + 两种 Shell)、可插拔 SandboxProvider。
- 所有架构级技术决策(Layer 1)落到文档,为后续实现扫清歧义。
- 为所有显式后置的功能(upstream 同步、自动接力、上线 L2+)留下接口但不实现。

**Non-Goals:**
- 不自建编码器 / agent loop(驱动现成编码器)。
- 不做 fork / upstream issue 同步(场景 2)。
- 不启用自动接力(`can_mention` 字段存在但 MVP 留空)。
- 不做打 tag / 触发部署 / 回滚(MVP 只到 PR 合并)。
- 不做 GitHub issue 作为黑板(统一平台 issue)。
- 不敲定具体技术栈(Layer 2)。
- 不做计费 / 用量追踪 / 复杂权限(MVP 单用户 / 单组织)。

## Decisions

### 决策 1:协作模型 = 黑板架构,零 agent 间通信

**选择**:Issue 评论流是唯一共享状态。所有 agent(及人类)通过对同一 Issue 评论来协作。agent 之间不直接通信。

**理由**:
- 砍掉整个"agent 间通信协议"子系统(消息总线、状态同步、可审计性、人类介入通道)。
- GitHub/Multica 已验证 issue 作为协作载体的可行性。
- 副产品:人类、agent、未来 agent 全是对等参与者,任何人在 issue 里说话所有 agent 都能读到。

**被否决的替代方案**:
- agent 间直连消息协议:复杂、要 NAT/鉴权/在线状态,且失去可审计性。
- 平台中转消息总线:平台要看所有 agent 通信(隐私/性能)。

**已知代价**:
- 上下文污染:长 issue 里噪音多 → 缓解:大任务拆多 issue(MVP);未来可加 agent 侧历史摘要。
- 并发冲突:多人多 agent 同时改 → 缓解:复用 GitHub 现有并发控制(PR merge conflict / review / branch protection),不自造。

### 决策 2:Issue 统一在平台自建,不双 provider

**选择**:所有 issue 都是 GitSquad 平台 issue。不做"GitHub issue / 平台 issue"双 provider 的抽象层。

**理由**:
- 统一黑板 → agent 侧逻辑零分歧。
- 平台 issue 不受 GitHub 限制,可长出适合 agent 工作的状态机 / 工作流阶段。
- 这本身成为差异化(比 GitHub issue 更适合 agent 协作)。

**被否决的替代方案**(用户在探索阶段主动砍掉):
- `Task` 统一接口屏蔽 `provider=github|platform`:在"统一用平台 issue"决策后被砍。原因是 provider 永远是 platform,该抽象成了空转的一层(YAGNI 违规)。
- 未来 upstream 同步不需要 TaskProvider 抽象——它只是 Issue 上的一个可选导入字段 `source_upstream_issue`,视为"导入数据源"而非"另一种 issue"。

### 决策 3:Workspace = Vercel 式两层分离的组织核心

**选择**:
- **link(GitHub App 安装)**= 授权层,对标 Vercel。决定"能访问哪些 repo"。
- **Workspace** = 绑定层。指定一个 repo + 配置 agent 团队。issue 与 agent 都挂在 Workspace 下。
- 一个 repo 可被多个 Workspace 指向。

**理由**:Vercel 已验证的最干净模型。所有散落问题(issue 归属、agent 配置层级、repo 绑定、授权管理)归位到同一棵树。

### 决策 4:LocalDaemon 注册到 User(非 Workspace)

**选择**:用户机器上装一个 daemon,注册到 User 账号,服务该 User 下所有 Workspace 的 local agent。

**理由**:
- 符合用户直觉(一个 daemon 管所有 repo,对标 GitHub self-hosted runner 注册到 user/org)。
- 避免每 repo 一个 daemon 的资源浪费。

**已知代价**:多 Workspace 复用单 daemon 需要任务隔离设计(MVP 通过工作目录隔离解决)。

### 决策 5:混合执行 = 统一 Runtime + 两种 Shell + 可插拔 SandboxProvider

**选择**:
- **Agent Runtime(统一,一套代码)**:认证/连接 → clone repo → 组装上下文(读 issue + repo) → 驱动编码器 → 收集产物 → 回写 → 报告 SaaS。
- **两种 Shell**(特化生命周期与触发方向):
  - **LocalShell**:常驻 daemon,长连接拉模式,多任务复用,持久工作区。
  - **CloudShell**:按任务 spawn、跑完销毁,SaaS 推模式,每次干净 clone。
- **SandboxProvider 接口**(可插拔):`spawn(task, runtime_image) → handle`,`logs(handle) → stream`,`kill(handle)`。候选实现:Cloudflare Containers / E2B / Fly Machines / Modal / 自建 Firecracker。MVP 选定一家。
- **两个正交选择轴**:coder_backend(claude-code / codex / ...)× sandbox_provider(local / 具体 cloud 厂商)。用户独立组合。

**理由**:
- Runtime 统一是决策"GitSquad 不自建 agent loop"的最大红利——驱动现成编码器的"薄壳"逻辑与部署位置无关。
- cloud 与 local 差异仅在外壳(部署形态),不在 Runtime 内核。
- SandboxProvider 抽象让"未来用 Cloudflare Containers"从模糊的"后面再说"变成"接口已留好"。轻量 sandbox 赛道(Cloudflare Containers / E2B / Modal / Fly)正在爆发,各家冷启动 / 成本 / 隔离特性不同,可插拔避免 lock-in。

**被否决的替代方案**:
- 两套独立逻辑(local 一套 / cloud 一套):工程量翻倍,且未来加 provider 要重复改。
- 自建 agent loop(选项 A):工程量巨大,与 Multica / Cursor 正面竞争,违背 scope。

**已知不能假装统一的差异**(落在 Shell 层,不污染 Runtime):
- 生命周期:daemon 持续在线需心跳/重连;sandbox 按需起需 spawn/healthcheck/kill/超时回收。
- 触发方向:daemon 拉模式(连 SaaS 等活);cloud 推模式(SaaS spawn 容器灌任务)。→ SaaS 侧任务派发有两条不同路径(local 进队列 / cloud spawn)。

### 决策 6:Issue ↔ PR = 弱关联 + 单向回流

**选择**:
- agent 提 PR 时,PR body 引用平台 Issue 链接(人类 reviewer 点链接回平台看背景)。
- GitHub PR 事件(创建 / 评论 / review / 合并)通过 webhook **单向回流**到平台 Issue(作为评论/状态更新)。
- 不反向投影(平台 Issue 内容不写到 PR)。

**理由**:
- 避开双向同步死亡螺旋(冲突 / 丢字段 / 幂等死循环 / 延迟 / 删除一致性)。
- "Issue 是大脑,PR 是手脚":手脚报告给大脑(回流),大脑不向手脚投影。
- PR 合并 → 自动关闭 Issue。

**被否决的替代方案**:
- 双向绑定:同步地狱,MVP 绝对不碰。
- 双向投影:复杂度高,价值不抵成本。

### 决策 7:接力 MVP = 模式 A(人工 @),为模式 C 留接口

**选择**:
- MVP 接力模式 A:每一步由人类 @ 触发。
- agent 配置含 `can_mention: []` 字段,MVP 留空 = 模式 A;未来填值 = 模式 C(自动接力)。

**理由**:
- 模式 A 简单、可控、零意外,符合"agent 是队友"隐喻。
- 一个字段切换两种模式,未来开启自动接力不需重构,只是给字段填值。

**被否决的替代方案**:MVP 直接做模式 B(agent 自接力,互相 @)。理由:信任问题(agent 互相 @ 失控)、成本失控、循环风险。模式 C 是模式 A 与 B 的折中终态。

### 决策 8:GitSquad 不自建 agent loop,驱动现成编码器(选项 B)

**选择**:Agent Runtime 的核心是 spawn / 驱动现成编码器(Claude Code / Codex / Cursor CLI 等),GitSquad 不实现 LLM 工具循环。

**理由**:
- 工程量小一个量级。
- 复用 Multica 验证过的模式。
- 用户可选自己喜欢的编码器。
- 解锁决策 5 的 Runtime 统一性。

### 技术栈(Layer 2)候选与选择标准——本阶段不敲死

| 组件 | 候选 | 选择标准 |
|------|------|---------|
| SaaS 后端语言 | Go / TypeScript (Node) / Rust | daemon 跨平台分发友好度 / 团队熟悉度 / 生态 |
| daemon 语言 | Go / Rust / TypeScript | 单 binary 分发、跨平台、低依赖(对标 GitHub runner) |
| 数据库 | Postgres / MySQL | 标准 SQL、JSON 支持(issue 内容)、成熟托管 |
| SaaS 前端 | Next.js / Remix / SvelteKit | SSR、OAuth 集成生态、DX |
| daemon↔SaaS 通信 | WebSocket / SSE | 长连接、穿透 NAT、低延迟 |
| Sandbox(MVP) | E2B / Cloudflare Containers / Fly Machines | 冷启动、成本、隔离、API 成熟度 |
| 部署 | AWS / GCP / Cloudflare | 与 Sandbox 选择联动 |

选择标准原则:daemon 单 binary 分发是硬约束(影响 daemon 语言选择);其余以团队熟悉度和生态为先。

## Risks / Trade-offs

- **[平台 Issue 没有用户基础]** 用户已习惯 GitHub issue,要在平台重建习惯 → 缓解:平台 issue 不做"GitHub 替代品",做"agent 工作容器";核心是评论流与 @mention,不是 PM 功能堆叠。
- **[upstream 同步后置会导致场景 2 无法 MVP 验证]** 场景 2 依赖 fork + upstream issue,显式后置 → 缓解:MVP 聚焦场景 1 验证核心价值(端到端 + 混合执行);场景 2 在 Workspace/Issue 抽象成熟后加 `source_upstream_issue` 字段即可。
- **[daemon 下线导致 local agent 任务卡住]** 用户关机,任务到一半 → 缓解:MVP:任务标记 failed 并通知用户;未来:状态恢复 / 自动迁移云端。
- **[sandbox 成本失控]** cloud agent 每任务烧钱 → 缓解:SandboxProvider 超时回收;MVP 不做计费但记录用量日志,为后续计费留数据。
- **[PR 单向回流丢失字段]** GitHub PR 事件字段比平台 Issue 丰富,投影策略不当会丢信息 → 缓解:回流只投影关键事件(创建 / review 状态 / 合并),不做全字段镜像。
- **[Runtime 统一的隐藏分歧]** Runtime 声称统一,但 local/cloud 在密钥/凭证/网络环境上真实不同 → 缓解:差异封装在 Shell 层(Runtime 拿到的"工作环境"由 Shell 注入,Runtime 不感知来源)。
- **[can_mention 留接口但语义未定]** 未来模式 C 的触发规则未定义 → 缓解:MVP 明确该字段为空数组;语义在设计模式 C 时再定。

## Migration Plan

(从零构建,无迁移。)

部署步骤(实现阶段细化):
1. 部署 SaaS(API + webhook + 任务派发 + issue 存储)。
2. 注册 GitHub App,配置 webhook。
3. 打包 daemon,提供安装脚本。
4. 选定并集成一家 SandboxProvider。
5. 端到端冒烟:link → Workspace → Issue → @ → PR → 合并 → 关闭。

回滚策略:MVP 阶段每个组件独立,任一组件失败不影响其他(GitHub App 可单独卸载,daemon 可单独停止,sandbox 可禁用)。

## Resolved Decisions (实现阶段)

- **技术栈(任务 1.1,已敲定)**:采用 **Go 一统** —— SaaS + daemon + Runtime 共用 Go,共享同一份 Runtime 模块代码(决策 5 名副其实)。daemon 单 binary 分发是硬约束,Go 是金标准(gh CLI / self-hosted runner 同款),Go module 干净共享 Runtime。前端独立用 **Next.js**,数据库 **Postgres**。Webhook 框架用 std `net/http` + `chi`;数据库先保留 Postgres 连接预留,迁移框架延后到 schema 稳定后引入。
- **SandboxProvider(任务 1.2,决策已定,实测待凭证)**:MVP 选 **E2B** —— 它是 API-first 的代码执行 sandbox,冷启动快(~150ms)、按毫秒计费、对"驱动 CLI 编码器"场景的契合度最高。Cloudflare Containers 生态最强但仍在 beta 演进,Fly Machines 灵活但需更多自管。SandboxProvider 接口可插拔(决策 5),实测 spawn→run→kill 验证待 E2B API key 到位后补做,选型本身可逆。

## Open Questions

- **daemon 的安装与更新机制?**(对标 GitHub runner 的脚本安装 + 自更新,还是包管理器分发?)。
- **平台 Issue 的具体状态机?**(MVP 用 open/in_progress/done 三态,但 in_progress 由谁触发、是否需要更细粒度,留 tasks 阶段细化)。
- **@mention 解析的语法与命名空间?**(`@coder` 在 Workspace 内唯一?还是 `@workspace/coder`?冲突如何处理)。
- **coder_backend 驱动协议?**(Claude Code / Codex 各自的 CLI 调用方式与上下文注入方式,需要 runtime adapter 抽象)。

### 决策 9:Daemon 接入 —— 双通道认证 + WebSocket 长连接 + PATH 扫描发现

**选择**:LocalShell 不作为 Workspace 资源创建,而是通过 `gitsquad daemon login` 注册到 User 账号。登录提供双通道以覆盖桌面和 headless 两种场景。Daemon↔Server 通信以 WebSocket 长连接为主通道(承载心跳、任务唤醒、runtime_gone 清理信号),HTTP 为降级通道。所有 REST 端点收敛到 `/api/v1/daemon` 单一资源名下。Daemon 启动时扫描 PATH 发现已安装 AI CLI 工具并上报能力。

**理由**:
- daemon 是用户设备能力,不是某个 Workspace 的配置;注册到 User 才能服务多个 Workspace。
- **双通道认证**:桌面环境通过浏览器配对(对标 Claude Code / GitHub CLI 体验);headless/SSH/CI 通过预生成 token 直传(对标 GitHub self-hosted runner 的 `./config.sh --token`)。
- **WebSocket 长连接**替代 HTTP 轮询:(1)task_wake 服务器主动推送,延迟从轮询间隔降到即时;(2)heartbeat_ack 双向确认,Daemon 也能感知 Server 存活;(3)runtime_gone 信号让 Daemon 即时清理被取消/超时的任务,而非等到下次轮询才发现。
- **API 收敛**:所有 daemon 相关端点在 `/api/v1/daemon` 下,配对只是 daemon 生命周期的过渡态,不需要独立的 `daemon-pairings` 资源。
- **PATH 扫描**:在任务派发前先做 runtime status check,可以把"这台 machine 上没有 codex/claude-code/git/可写目录"这类问题提前暴露,避免任务入队后才失败。

---

#### 9.1 双通道认证

**模式 A:浏览器配对(默认,桌面环境)**

```
gitsquad daemon login

  1. POST /api/v1/daemon/auth
     → Server 创建 pairing session (10 min TTL)
     ← { pairing_code, browser_url, expires_at, poll_interval_ms }

  2. 打开 browser_url → Google OAuth(如未登录) → 确认页面

  3. CLI 轮询 GET /api/v1/daemon/auth/{code}
     ← { status:"confirmed", daemon_id, token }

  4. token 保存到 ~/.gitsquad/config.yaml
```

**模式 B:Token 直传(headless/SSH/CI)**

```
# 步骤 0:在官网 app.gitsquad.com/settings/daemons 预生成 token

gitsquad daemon login --token gtsq_dm_xxxxx

  1. POST /api/v1/daemon/auth
     Authorization: Bearer gtsq_dm_xxxxx
     Body: { machine_name, os, arch, daemon_version, mode:"token" }

  2. Server:校验 token → 反查 User → 创建/更新 DaemonMachine
     ← { daemon_id, token, status:"active" }

  3. token 保存到 ~/.gitsquad/config.yaml
```

**统一入口**:

一个端点 `POST /api/v1/daemon/auth` 根据是否带 Authorization header 自动分流:

| 请求特征 | 行为 |
|----------|------|
| 无 Authorization header | 浏览器配对模式:创建 pairing_code,返回 browser_url |
| 带 `Authorization: Bearer gtsq_dm_xxx` | Token 直传模式:校验 token,直接返回 daemon_id |

配对会话状态机:`pending → confirmed → consumed`(token 被 CLI 领走后变为 consumed,不可重复使用)。配对码 10 分钟过期,可被用户拒绝进入 `rejected`。

#### 9.2 API 收敛:`/api/v1/daemon` 为根

所有 daemon 相关端点收敛到单一资源名下:

```
POST   /api/v1/daemon/auth              统一认证入口(配对 / --token)
GET    /api/v1/daemon/auth/{code}        CLI 轮询配对状态
POST   /api/v1/daemon/auth/{code}/confirm 浏览器端用户确认

GET    /api/v1/daemon/{id}              获取 daemon 完整状态(含能力+任务)
PATCH  /api/v1/daemon/{id}              更新 daemon 元数据
DELETE /api/v1/daemon/{id}              撤销 daemon(token 立即失效)

PUT    /api/v1/daemon/{id}/capabilities 全量上报能力列表
GET    /api/v1/daemon/{id}/tasks/pending 拉取待执行任务
POST   /api/v1/daemon/{id}/heartbeat     HTTP 降级心跳(WS 不可用时)

WS     /ws/daemon                       WebSocket 长连接(主通信通道)
```

认证模型:所有 `/api/v1/daemon/{id}/*` 操作需 `Authorization: Bearer {daemon_token}`,Server 从 token 反查 daemon_id 并与 URL 中的 `{id}` 交叉校验——token 只能操作自己的 daemon。repo clone 所需 GitHub App installation token 由任务载荷注入,daemon token 不授予 repo 权限。

```
Token 种类与权限边界:
┌──────────────────┬──────────────┬──────────────────────┐
│ 类型             │ 来源         │ 权限                 │
├──────────────────┼──────────────┼──────────────────────┤
│ User Session     │ Google OAuth │ Web UI 操作          │
│ Daemon Token     │ /auth 返回   │ 心跳/任务拉取/能力上报│
│ Installation Tok │ GitHub App   │ clone repo(任务载荷内)│
└──────────────────┴──────────────┴──────────────────────┘
```

Web 端需提供 daemon token 管理页面(`/settings/daemons`):生成/列出/撤销 token。

#### 9.3 WebSocket 长连接(主通信通道)

**端点**:`wss://api.gitsquad.com/ws/daemon`

**连接流程**:TCP+TLS 升级 → Daemon 发送 `auth` 帧 → Server 校验 → 返回 `auth_ack` → 双向通信建立。

**10 种 WS 帧类型**:

```
方向          帧类型              用途                    触发时机
────────────────────────────────────────────────────────────────
DAEMON→SVR   auth                初始认证                 连接建立时
SVR→DAEMON   auth_ack            认证确认 + 心跳间隔参数   认证后
DAEMON→SVR   heartbeat           心跳 + 状态摘要(能力/任务) 每 30s
SVR→DAEMON   heartbeat_ack       心跳确认 + pending_tasks   每次 heartbeat
SVR→DAEMON   task_wake           新任务唤醒(不传载荷)      有新任务时
DAEMON→SVR   task_wake_ack       已收到唤醒               收到后即时
SVR→DAEMON   runtime_gone        服务端 runtime 被删除     发生时
DAEMON→SVR   runtime_gone_ack    已清理本地状态           清理后
DAEMON→SVR   status_update       能力变更通知              能力变化时
SVR→DAEMON   status_ack          状态更新确认             收到后
SVR→DAEMON   server_shutdown     服务器优雅关停            关停前
SVR→DAEMON   error               错误通知                 随时
DAEMON→SVR   error               错误报告                 随时
────────────────────────────────────────────────────────────────
```

**关键设计决策**:

- **task_wake 只唤醒不传载荷**:Daemon 收到 `task_wake` 后通过 HTTP `GET /api/v1/daemon/{id}/tasks/pending` 拉取完整任务。理由:载荷含 installation token 等敏感凭证,HTTP 层 TLS+统一认证更安全;HTTP 天然支持重试和 access log;避免 WS 大帧影响控制通道延迟。
- **heartbeat 双向**:Daemon 上报 liveness + 负载;Server 在 `heartbeat_ack` 中反压 `pending_tasks` 计数,Daemon 据此判断是否需要主动 fetch(如重连后有积压,即使未收到 task_wake 也能发现)。
- **heartbeat_ack 包含 `next_heartbeat_ms`**:Server 可动态调整心跳间隔(默认 30s,高负载时可拉长)。
- **runtime_gone**:Server 端删除 runtime 行时(任务取消/超时/daemon revoke/管理员干预)即时通知 Daemon kill 对应 coder 进程、清理 workdir。Daemon 清理完成后回 `runtime_gone_ack`。

**Daemon 状态机**:

```
NOT_CONFIGURED → PAIRING → CONNECTING → ONLINE ⇄ DEGRADED ⇄ RECONNECTING
                                       ↓           ↓
                                   REVOKED     AUTH_FAILED
```

**重连策略**:指数退避 1s→2s→4s→8s→16s→30s→30s(max)无限重试直到 token revoke。重连超 5 分钟降级为 HTTP 心跳 + 轮询,15 分钟无响应 Server 标记 offline 并 fail 在途任务。

#### 9.4 PATH 扫描与 Agent 发现

Daemon 维护已知 AI CLI 工具注册表,启动时扫描 PATH 并对每个找到的 CLI 调用版本检测:

```
已知 CLI 注册表:
┌──────────────┬──────────────┬────────────────┐
│ 工具名       │ 可执行文件    │ 版本参数       │
├──────────────┼──────────────┼────────────────┤
│ Claude Code  │ claude       │ --version      │
│ Codex CLI    │ codex        │ version        │
│ Copilot CLI  │ copilot      │ --version      │
│ Gemini CLI   │ gemini       │ --version      │
│ OpenCode     │ opencode     │ --version      │
│ Cursor CLI   │ cursor       │ --version      │
│ Windsurf     │ windsurf     │ --version      │
│ Aider        │ aider        │ --version      │
│ Cody CLI     │ cody         │ --version      │
│ Amazon Q     │ q            │ --version      │
└──────────────┴──────────────┴────────────────┘
```

扫描结果通过 `PUT /api/v1/daemon/{id}/capabilities` 全量上报(后续可做增量)。Daemon 运行期间每小时静默重扫,能力变化时通过 WS `status_update` 帧推送增量变更。

#### 9.5 核心实体

```text
DaemonMachine
- id
- user_id
- name                # 用户可识别的设备名
- status              # online/offline/degraded/revoked
- os/arch
- daemon_version
- work_dir
- last_seen_at
- registered_at
- revoked_at

RuntimeCapability
- id
- daemon_machine_id
- kind                # coder_backend | tool | workspace
- name                # codex / claude-code / git / workdir
- executable_path
- version
- status              # available/missing/degraded
- checked_at
- diagnostics
- max_concurrency     # MVP 固定为 1

DaemonToken
- id
- daemon_id
- token_hash          # 服务端只存 SHA-256 hash
- token_prefix        # "gtsq_dm_" 用于 CLI 展示
- issued_at
- expires_at          # null = 长期有效
- last_used_at
- revoked_at
```

#### 9.6 任务派发约束

- `AgentConfig.environment=local` 只表示任务必须由某台在线 daemon machine 上的匹配 runtime 执行,不绑定具体 daemon machine 或 runtime instance。
- SaaS 派发 local task 时,按 `Workspace.owner_user_id` 找 User 下 online 的 DaemonMachine,再在该 machine 的 RuntimeCapability 中匹配 `coder_backend`;匹配成功则通过 WS `task_wake` 推送唤醒信号;找不到则任务进入 blocked 并向 Issue 回流提示。
- daemon token 只允许访问 daemon 自身心跳、runtime check 与拉取已授权任务;repo clone 仍使用任务携带的 GitHub App installation token,避免 daemon token 变成 repo 权限。

**被否决的替代方案**:
- 手填 long-lived PAT:实现快但安全边界差,也把 GitHub 认证和 GitSquad daemon 认证混在一起。
- Workspace 级 daemon 注册:多 Workspace 重复注册,也违背"一个本机 daemon 管多个 repo"的直觉。
- 启动时跳过 status check:早期实现快,但任务失败会延迟到执行阶段,不利于用户排障。
- 纯 HTTP 轮询(不做 WS):延迟高(最小轮询间隔意味着任务唤醒最多等一个周期),且无法实现 runtime_gone 的即时清理。