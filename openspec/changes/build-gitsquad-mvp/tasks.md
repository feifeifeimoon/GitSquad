> 进度基线(2026-08-12 同步):已完成 1.1/1.3–1.6、2.2–2.4、3.1–3.2/3.4、7.1–7.3;未开始 4/5/6/8/9/10/11 章;部分完成 2.5/3.3(degraded 缺口)、7.6(仅下线检测)、7.7(仅打包)。

## 1. 技术栈敲定与项目骨架

- [x] 1.1 按 design.md 选择标准敲定 Layer 2 技术栈(SaaS 语言、daemon 语言、数据库、前端、sandbox provider),记录决策到 design.md 的 Open Questions
- [ ] 1.2 spike 选定 SandboxProvider(对 E2B / Cloudflare Containers / Fly Machines 各做最小 spawn → run → kill 验证,按冷启动/成本/API 成熟度选定 MVP 厂商)
  - 注:已延后,待第 8 章 CloudShell 开工时一并决策;仓库内目前无任何 SandboxProvider 代码
- [x] 1.3 搭建 SaaS 项目骨架(目录结构、依赖、env 配置、Postgres 连接预留;数据库迁移框架延后到 schema 稳定后引入)
- [x] 1.4 搭建 daemon 项目骨架(单 binary 构建脚本、跨平台编译验证)
- [x] 1.5 补齐 AgentConfig、DaemonMachine、RuntimeCapability、daemon login、runtime status check 与 local task capability 匹配设计
- [x] 1.6 建立 Runtime 共享模块(供 SaaS cloud shell 与 daemon 共用的内核代码,验证一套代码两种打包)

## 2. GitHub App 集成与 link

- [ ] 2.1 注册 GitSquad GitHub App,配置所需权限与 webhook 订阅(pull_request、installation、installation_repositories)
  - 注:外部操作,代码无法验证;配置项已就绪(.env: GITHUB_APP_ID / PRIVATE_KEY / NAME / WEBHOOK_SECRET),需人工确认 App 已注册且已订阅 pull_request
- [x] 2.2 实现 OAuth/安装重定向流程,落地 `GitHubAppInstallation` 记录(含授权 repo 列表)
- [x] 2.3 实现 webhook 接收端点,含签名校验(拒绝未签名请求)与事件分发
- [x] 2.4 实现 installation token 获取与按 installation 隔离的凭证管理(禁止跨 Workspace 复用)
- [ ] 2.5 处理 `installation_repositories` 事件,同步更新可访问 repo 列表;repo 被撤销授权时标记关联 Workspace 为 `degraded`
  - 进度:repo 列表同步(分页 + upsert/delete)✅;repo 撤销授权 → Workspace `degraded` ❌(后端无设置逻辑,仅前端有渲染分支)

## 3. Workspace 管理

- [x] 3.1 实现 Workspace 数据模型(id、所属 User/Org、绑定 repo、agent 团队、settings)
- [x] 3.2 实现 Workspace 创建 API:从 `GitHubAppInstallation` 可访问 repo 列表中选一个绑定
- [ ] 3.3 实现 Workspace 可访问性校验:link 前置校验、repo 取消授权降级
  - 进度:创建时校验 installation/repo 归属与前置链接条件 ✅;repo 取消授权 → `degraded` 降级 ❌(与 2.5 同一缺口)
- [x] 3.4 实现同一 repo 多 Workspace 支持(隔离 agent 团队与 Issue)
  - 注:数据库无 repo 唯一约束,天然支持多 Workspace(agent 团队与 Issue 隔离待 4/5 章落地)

## 4. 平台 Issue 黑板

- [ ] 4.1 实现 Issue 数据模型(Workspace 外键、标题/描述、状态 open/in_progress/done、`linked_prs`、`assigned_agents`、预留 `source_upstream_issue` 字段)
- [ ] 4.2 实现 Issue CRUD API(创建、读取、更新、关闭)
- [ ] 4.3 实现评论流 API(追加评论、记录作者标识人与 agent、时间戳、不可编辑历史)
- [ ] 4.4 实现 @mention 解析器:从描述/评论解析 agent 名称,校验 Workspace 内唯一性,不匹配时追加系统提示
- [ ] 4.5 实现 Issue 简单状态机(open → in_progress → done)与状态转换触发点
- [ ] 4.6 验证 MVP 不读取 `source_upstream_issue` 字段(字段持久化但不触发同步)

## 5. Agent 配置

- [ ] 5.1 实现 AgentConfig 数据模型(name、role、environment、coder_backend、can_mention、enabled、审计字段;不绑定具体 daemon)
- [ ] 5.2 实现 agent 团队管理 API(在 Workspace 下增删改查)
- [ ] 5.3 实现同 Workspace 内 agent 名称唯一性校验
- [ ] 5.4 实现 coder_backend × environment 正交组合校验与派发参数组装
- [ ] 5.5 验证 MVP 中 `can_mention` 默认空数组,非空值持久化但不触发自动接力

## 6. Agent Runtime(共享内核)

- [ ] 6.1 实现 Runtime 认证/连接模块(daemon token / cloud task token,向 SaaS 证明身份,领取任务)
- [ ] 6.2 实现 clone repo 模块(使用任务携带的 installation 凭证 clone 到工作区)
- [ ] 6.3 实现上下文组装模块(读 Issue 黑板评论流 + 相关 repo 代码)
- [ ] 6.4 定义 coder_backend adapter 接口,实现至少一个 adapter(claude-code 或 codex CLI 驱动)
- [ ] 6.5 实现产物收集(代码 diff / 测试结果 / 日志)
- [ ] 6.6 实现回写模块(通过 GitHub App 凭证提 PR + PR body 引用 Issue;写 Issue 评论/状态)
- [ ] 6.7 实现 Runtime 与 SaaS 的进度报告(开始/进行中/成功/失败)

## 7. LocalShell daemon

- [x] 7.1 实现 `gitsquad daemon login` User 级 pairing 登录与 daemon token 本地保存
- [x] 7.2 实现 `gitsquad daemon status` runtime check 与 capabilities 上报
- [x] 7.3 实现 daemon↔SaaS 长连接(WebSocket/SSE 拉模式)与心跳/重连
- [ ] 7.4 实现 LocalShell 的 `next_task()` 接口(从长连接队列拉取任务)
  - 注:`task_wake` / `task_available` 帧类型与 `PendingActions` 通道已定义,但服务端从不发送、daemon 侧为 TODO,依赖第 9 章任务派发
- [ ] 7.5 实现多 Workspace 任务的工作目录隔离
  - 注:未实现,依赖 7.4 任务通道
- [ ] 7.6 实现 daemon 下线检测与任务超时标记 `failed` + Issue 回流通知(MVP 不自动迁移)
  - 进度:下线检测 ✅(WS 陈旧连接驱逐 → `MarkOffline`);任务超时标记 `failed` + Issue 回流 ❌(任务系统未建)
- [ ] 7.7 打包 daemon 单 binary(`gitsquad daemon`)与安装/更新脚本
  - 进度:单 binary 打包 ✅(Makefile build-cli + goreleaser + `daemon start/stop` 前后台);安装/更新脚本 ❌(前端文案引用 `curl install | sh`,仓库内无脚本)

## 8. CloudShell + SandboxProvider

- [ ] 8.1 定义 SandboxProvider 接口(spawn(task, runtime_image) → handle、logs(handle) → stream、kill(handle))
- [ ] 8.2 实现选定厂商(来自 1.2)的 SandboxProvider 具体实现
- [ ] 8.3 构建 Runtime 镜像(含选定 coder backend 的容器镜像)
- [ ] 8.4 实现 CloudShell 的 `next_task()` 接口(从启动注入的任务参数获取)
- [ ] 8.5 实现 sandbox 超时回收与失败标记
- [ ] 8.6 验证 SandboxProvider 可替换(Runtime 与 Shell 代码零修改,仅替换实现)

## 9. 任务派发

- [ ] 9.1 实现 @mention → 目标 agent 解析与任务生成(携带 Issue 上下文引用、installation 凭证、agent 配置)
- [ ] 9.2 实现 environment 路由:local → 按 User DaemonMachine + RuntimeCapability 匹配并入队;cloud → SandboxProvider spawn
- [ ] 9.3 实现任务生命周期状态机(开始/in_progress/成功/失败)与 Issue 回流评论
- [ ] 9.4 验证 MVP 不执行自动接力(任务完成后不自动 @ 其他 agent)

## 10. Issue ↔ PR 单向回流

- [ ] 10.1 实现 PR 事件(创建/评论/review/合并)webhook 处理与单向回流到关联 Issue
- [ ] 10.2 实现 PR 合并 → Issue 自动关闭(done)
- [ ] 10.3 实现 branch protection 阻塞时不强制合并,回流阻塞原因到 Issue
- [ ] 10.4 验证平台 Issue 内容不被反向投影到 PR(避免双向同步)

## 11. 端到端冒烟与打磨

- [ ] 11.1 端到端冒烟:link → Workspace → Issue → @coder → Runtime 提 PR → PR 事件回流 → 合并 → Issue 关闭
- [ ] 11.2 cloud 路径冒烟:同上但 agent `environment=cloud`
- [ ] 11.3 local 路径冒烟:同上但 agent `environment=local`,验证 daemon 拉模式与下线处理
- [ ] 11.4 用量日志埋点(sandbox 时长、任务数、token 估算),为未来计费留数据(MVP 不做计费)
- [ ] 11.5 安全审计:installation token 隔离、webhook 签名、daemon 认证、PR 凭证最小权限
- [ ] 11.6 文档:README 更新、link/Workspace/agent 配置的用户操作指引、daemon 安装指引

---

## 清单外已实现(2026-08-12 同步)

以下功能已落地但不在原任务清单中,已并入进度基线:

- Google OAuth 登录(登录页 + `/auth/callback` hash token 落地 + JWT 中间件)
- GitHub App 安装回调竞态桥接(`PendingInstallationStore` webhook→memory bridge,处理 installation.created 早于浏览器回调到达)
- 前端 Vercel 设计语言改版(营销页、登录、console 壳、workspaces、daemons、settings、daemon auth)
- Console 壳:可拖拽侧栏、workspace 列表/详情、daemon 列表(15s 轮询)与连接指引
- 后端单测覆盖 daemon / service / ws / config / client 等层;前端仅 landing 页静态断言测试
- 工程化:Makefile、goreleaser 发布配置、Dockerfile、.github 工作流
