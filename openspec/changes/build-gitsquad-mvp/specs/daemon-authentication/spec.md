## ADDED Requirements

### Requirement: DaemonMachine 以 User 级设备身份登录(双通道认证)

系统 SHALL 支持 `gitsquad daemon login` 将当前机器上的 `gitsquad daemon` 注册为当前 User 账号下的一台 DaemonMachine。DaemonMachine MUST NOT 直接注册到 Workspace。登录流程 MUST 提供两种通道:(A)默认浏览器配对模式,(B)`--token` 直传模式用于 headless/SSH/CI 环境。两种模式 MUST 通过同一端点 `POST /api/v1/daemon/auth` 实现,Server 根据请求是否携带 `Authorization` header 自动分流。

#### Scenario: 浏览器配对模式(默认)

- **WHEN** 用户运行 `gitsquad daemon login` (不带 `--token`)
- **THEN** CLI MUST 请求 `POST /api/v1/daemon/auth`(无 Authorization header)
- **AND** Server MUST 创建一次性 pairing session(10 分钟过期),返回 `pairing_code`、`browser_url`、`expires_at`
- **AND** CLI MUST 打开浏览器并轮询 `GET /api/v1/daemon/auth/{code}` 直到确认或过期
- **AND** 用户在浏览器完成 Google OAuth 并确认设备后,CLI MUST 获得 `daemon_id` 与 `daemon_token`
- **AND** token 的 `confirmed` 状态 MUST 只能被消费一次,领取后变为 `consumed`

#### Scenario: Token 直传模式(headless/SSH/CI)

- **WHEN** 用户运行 `gitsquad daemon login --token gtsq_dm_xxxxx`
- **THEN** CLI MUST 请求 `POST /api/v1/daemon/auth` 并携带 `Authorization: Bearer gtsq_dm_xxxxx` header
- **AND** Server MUST 校验 token 有效性,创建或更新 DaemonMachine,直接返回 `daemon_id`
- **AND** 该流程 MUST 为单次请求完成,无需轮询

#### Scenario: 无浏览器环境提示

- **WHEN** `gitsquad daemon login`(无 `--token`)检测不到可用浏览器
- **THEN** CLI MUST 打印 pairing URL 供用户手动复制,并提示可改用 `gitsquad daemon login --token <token>` 方式

#### Scenario: pairing code 过期

- **WHEN** 用户未在 pairing session 过期前完成浏览器确认
- **THEN** CLI MUST 停止轮询并提示重新运行 `gitsquad daemon login`
- **AND** SaaS MUST NOT 创建可用 daemon token

#### Scenario: 用户通过环境变量提供 token

- **WHEN** 设置了 `GITSQUAD_DAEMON_TOKEN` 环境变量且运行 `gitsquad daemon login`
- **THEN** CLI MUST 自动识别环境变量并走 token 直传模式,优先于浏览器配对

### Requirement: Daemon token 权限最小化

系统 SHALL 为 daemon 颁发只代表设备身份的 daemon token(格式 `gtsq_dm_*`)。daemon token MUST 只能用于 daemon 自身认证、心跳、runtime check、任务拉取, MUST NOT 直接授予 GitHub repo 访问权限。Runtime clone repo 所需凭证 MUST 来自任务载荷中的 GitHub App installation token。Server MUST 只存储 token 的 SHA-256 hash,不存储明文。

#### Scenario: daemon token 不能访问 repo

- **WHEN** daemon 使用 daemon token 请求 repo 内容或 GitHub API 凭证
- **THEN** SaaS MUST 拒绝该请求
- **AND** 只有已派发任务载荷中携带的 installation token 能用于 clone 对应 Workspace repo

#### Scenario: 用户撤销 daemon

- **WHEN** 用户在 SaaS 中 revoke 某 daemon(通过 `DELETE /api/v1/daemon/{id}` 或 Web UI)
- **THEN** SaaS MUST 将 daemon 标记为 `revoked`,使其 token 立即失效
- **AND** SaaS MUST 通过 WS `runtime_gone` 帧通知 daemon 清理所有在途任务
- **AND** 后续 HTTP 请求或 WS 连接 MUST 被拒绝

#### Scenario: 用户在 Web UI 管理 daemon token

- **WHEN** 用户访问 `app.gitsquad.com/settings/daemons`
- **THEN** 系统 MUST 提供 daemon token 的生成、列表查看与撤销操作
- **AND** 生成的 token MUST 仅在生成时展示完整值一次,后续只展示前缀 `gtsq_dm_xxxx...`

### Requirement: API 收敛到 `/api/v1/daemon` 单一资源名下

系统 SHALL 将所有 daemon 相关 REST 端点收敛到 `/api/v1/daemon` 资源名下。端点 MUST 包括:

```
POST   /api/v1/daemon/auth              # 统一认证(配对 / --token)
GET    /api/v1/daemon/auth/{code}       # CLI 轮询配对状态
POST   /api/v1/daemon/auth/{code}/confirm # 浏览器确认
GET    /api/v1/daemon/{id}              # 获取 daemon 完整状态
PATCH  /api/v1/daemon/{id}              # 更新 daemon 元数据
DELETE /api/v1/daemon/{id}              # 撤销 daemon
PUT    /api/v1/daemon/{id}/capabilities # 全量上报能力列表
GET    /api/v1/daemon/{id}/tasks/pending # 拉取待执行任务
POST   /api/v1/daemon/{id}/heartbeat    # HTTP 降级心跳
```

所有 `/api/v1/daemon/{id}/*` 端点 MUST 要求 `Authorization: Bearer {daemon_token}`,且 Server MUST 交叉校验 token 对应的 daemon_id 与 URL 中的 `{id}` 一致。

#### Scenario: GET /daemon/{id} 返回完整状态

- **WHEN** daemon 请求 `GET /api/v1/daemon/{id}` 并携带有效 token
- **THEN** 响应 MUST 包含 daemon 状态(status/online/degraded)、能力列表(RuntimeCapability)、活跃任务列表、连接时间戳
- **AND** 不需要额外请求即可获取 daemon 全貌

### Requirement: WebSocket 长连接为主通信通道

系统 SHALL 使用 WebSocket 长连接(`/ws/daemon`)作为 daemon↔server 的主通信通道。WS MUST 承载:双向心跳(`heartbeat`/`heartbeat_ack`)、任务唤醒推送(`task_wake`)、runtime 清理通知(`runtime_gone`)、能力变更上报(`status_update`)以及错误通知(`error`)。WS 连接 MUST 在首次连接时通过 `auth` 帧认证;认证失败 MUST 立即关闭连接。

#### Scenario: WS 认证流程

- **WHEN** daemon 连接到 `/ws/daemon`
- **THEN** daemon MUST 首先发送 `auth` 帧包含 `daemon_id` 和 `token`
- **AND** Server MUST 校验 token 后回复 `auth_ack` 帧包含 `server_time` 和 `heartbeat_interval_ms`
- **AND** daemon MUST 在认证成功后立即发送 `status_update` 帧上报当前完整状态

#### Scenario: WS 心跳替代 HTTP 心跳

- **WHEN** WS 长连接正常建立
- **THEN** daemon MUST 每 `heartbeat_interval_ms`(默认 30s)发送 `heartbeat` 帧
- **AND** Server MUST 回复 `heartbeat_ack` 帧,其中 `pending_tasks` 字段提示 daemon 是否有待办任务
- **AND** 正常连接期间 daemon MUST NOT 发送 HTTP heartbeat

#### Scenario: WS 断开后的 HTTP 降级

- **WHEN** WS 连接断开且重连超过 5 分钟未成功
- **THEN** daemon MUST 降级为 HTTP `POST /api/v1/daemon/{id}/heartbeat` 周期性心跳
- **AND** daemon MUST 通过 HTTP `GET /api/v1/daemon/{id}/tasks/pending` 轮询任务
- **AND** WS 恢复连接后 MUST 切回 WS 心跳

### Requirement: Runtime status check 发现 machine 下的多个 runtime capabilities

系统 SHALL 提供 `gitsquad daemon status` 检查 machine 级依赖并发现该 machine 下可用的多个 runtime capabilities。status check MUST 按已知 CLI 注册表扫描 PATH,对每个检测到的 CLI(如 `claude`、`codex`、`gemini`、`opencode` 等)调用版本检测(`--version` 或等价参数)。检查结果 MUST 包含 machine 级状态(git 版本、OS/arch、workdir 可写性、daemon 版本)与 runtime capability 列表(可执行路径、版本号、状态),并能通过 `PUT /api/v1/daemon/{id}/capabilities` 全量上报 SaaS。

#### Scenario: codex backend 可用

- **WHEN** 用户配置 local agent 使用 `coder_backend=codex` 且本机 `codex` 可执行
- **THEN** status check MUST 在该 DaemonMachine 的 RuntimeCapability 列表中上报 `kind=coder_backend,name=codex,status=available,version=x.y.z`
- **AND** SaaS MAY 将需要 codex 的 local task 派发给该 daemon

#### Scenario: backend 缺失导致 degraded

- **WHEN** Workspace 中存在 local agent 需要 `coder_backend=claude-code` 但 daemon status 未发现 `claude-code`
- **THEN** SaaS MUST 将该 DaemonMachine 下对应 RuntimeCapability 视为 `status=missing`
- **AND** 相关任务 MUST 进入 blocked 并向 Issue 回流可操作提示,而不是派发后失败

#### Scenario: 能力变化增量通知

- **WHEN** daemon 运行期间检测到能力变化(用户安装/卸载 CLI 工具)
- **THEN** daemon MUST 通过 WS `status_update` 帧推送增量变更
- **AND** Server MUST 回复 `status_ack` 确认收到

### Requirement: Daemon 心跳和在线状态(WS 为主 + HTTP 降级)

系统 SHALL 以 WS `heartbeat`/`heartbeat_ack` 帧为主维护 daemon 在线状态。正常连接期间 daemon 通过 WS heartbeat 帧上报 DaemonMachine id、daemon 版本、runtime capability 摘要与当前执行槽位状态。Server 通过 WS heartbeat_ack 帧确认并反压 `pending_tasks` 计数。当 WS 不可用时,daemon MUST 降级为 HTTP `POST /api/v1/daemon/{id}/heartbeat`。

#### Scenario: daemon 正常在线(WS)

- **WHEN** daemon 通过 WS 定期发送 heartbeat 且 token 有效
- **THEN** SaaS MUST 回复 `heartbeat_ack` 包含 `server_time`、`pending_tasks` 和 `next_heartbeat_ms`
- **AND** SaaS MUST 更新 `last_seen_at`,保持 daemon 为 `online` 或 `degraded`

#### Scenario: daemon 超时离线

- **WHEN** SaaS 在 90 秒内(3 个心跳周期)未收到任何心跳(WS 或 HTTP)
- **THEN** SaaS MUST 将 daemon 标记为 `offline`
- **AND** in-flight local task MUST 按 MVP 策略超时后标记 `failed` 并向 Issue 追加系统评论

### Requirement: Local task 派发按 User 下 machine 和 runtime capability 匹配

系统 SHALL 在派发 `environment=local` 的任务时,按 Workspace 所属 User 查找可用 DaemonMachine,再在该 machine 下查找满足目标 agent `coder_backend` 的 RuntimeCapability。目标 DaemonMachine MUST `online`,未被 revoke;目标 RuntimeCapability MUST `available`。MVP MAY 选择第一个满足条件的 machine/runtime 组合;后续可扩展负载均衡、并发槽位和用户手动指定 machine。

#### Scenario: 找到可用 daemon

- **WHEN** `@coder` 生成 local task 且 User 下存在 online DaemonMachine 且其 RuntimeCapability 支持该 agent 的 coder backend
- **THEN** SaaS MUST 将任务放入该 DaemonMachine 可拉取的队列
- **AND** SaaS MUST 通过 WS `task_wake` 帧推送唤醒信号
- **AND** 任务载荷中 MUST 记录选中的 runtime capability

#### Scenario: 没有可用 daemon

- **WHEN** `@coder` 生成 local task 但 User 下没有满足 machine/runtime capability 的 online DaemonMachine
- **THEN** SaaS MUST 将任务标记为 `blocked_waiting_for_daemon`
- **AND** 在关联 Issue 追加系统评论说明需要启动 daemon、安装对应 runtime 或运行 status check 修复能力缺口

### Requirement: runtime_gone 即时清理通知

系统 SHALL 在 Server 端删除 runtime 行时(任务取消、超时、daemon revoke、管理员干预)通过 WS `runtime_gone` 帧即时通知对应 daemon 执行清理。Daemon MUST kill 关联的 coder backend 进程、清理工作目录,并回复 `runtime_gone_ack` 帧。

#### Scenario: 任务被用户取消

- **WHEN** 用户在 SaaS 取消一个正在 local daemon 上执行的任务
- **THEN** Server MUST 通过 WS `runtime_gone` 帧通知 daemon,包含 `task_id` 和 `reason:"task_cancelled"`
- **AND** Daemon MUST kill 对应 coder 进程、清理 workdir,并回复 `runtime_gone_ack`

#### Scenario: Daemon 被 revoke

- **WHEN** daemon 被撤销
- **THEN** Server MUST 通过 WS `runtime_gone` 帧通知 daemon(含 `reason:"daemon_revoked"`)
- **AND** Daemon MUST kill 所有在途任务、清理所有 workdir、删除本地 token、退出进程
