## ADDED Requirements

### Requirement: 声明式 runtime 注册表（第一版 claude / codex / agy）

系统 SHALL 用声明式注册表描述可探测的 AI CLI，第一版 MUST 支持 `claude`、`codex`、`agy`（Antigravity）。每个 runtime MUST 由一条 spec 描述，字段包括 `kind`（稳定标识）、`command_names`（候选二进制名，含别名）、`env_path_override`（环境变量覆盖名）、`version_args`（版本探测参数，默认 `--version`）、`min_version`（最低版本门槛，空串表示不设门槛）、`extra_locations`（特殊位置 fallback）。加一个新的 runtime MUST NOT 需要新写一个适配器文件。

#### Scenario: 加新 CLI 只加一条 spec

- **WHEN** 需要支持一个新的 CLI（例如 `opencode`）
- **THEN** 开发者 MUST 只需在注册表里新增一条 spec（kind、command_names、env 覆盖名等）
- **AND** MUST NOT 需要新增 `runtime_opencode.go` 或复制探测逻辑

### Requirement: 探测管线固定优先级

系统 SHALL 对每个 runtime 按固定优先级解析可执行文件，第一个命中即返回：1) 环境变量覆盖（`GITSQUAD_<KIND>_PATH`），2) `exec.LookPath` 遍历候选命令名，3) login shell 解析兜底，4) 特殊位置 fallback。shell 兜底 MUST 只对裸命令名生效；env 覆盖指向一个含路径分隔符、但文件不存在的路径时 MUST hard-miss（不得静默回退到其他二进制）。

#### Scenario: 裸命令名在 PATH 上直接命中

- **WHEN** `claude` 在 daemon 进程的 `PATH` 上可直接解析
- **THEN** 探测 MUST 通过 `exec.LookPath` 命中
- **AND** MUST NOT fork login shell（懒触发，happy path 零 shell 开销）

#### Scenario: GUI 拉起的 daemon 看不到 rc 文件里的 PATH

- **WHEN** daemon 从 launchd/systemd/GUI 环境拉起，`exec.LookPath("claude")` 失败
- **AND** `claude` 位于只在 `~/.zshrc` 注入的目录（如 fnm/nvm multishell 或 `~/.claude/local`）
- **THEN** 系统 MUST 通过 login shell 解析到 `claude` 的 canonical 绝对路径
- **AND** 该路径 MUST 通过 daemon 侧 `exec.LookPath` 复核后才被采纳

#### Scenario: env 覆盖指向不存在的绝对路径

- **WHEN** 设置 `GITSQUAD_CLAUDE_PATH=/nonexistent/claude`
- **THEN** 探测 MUST 判定该 runtime 不可用（hard-miss）
- **AND** MUST NOT 回退到 PATH 上的同名二进制

#### Scenario: 特殊位置 fallback

- **WHEN** `codex` 不在 PATH 上，但存在 Codex Desktop 内置的 app bundle 路径
- **THEN** 系统 MUST 通过 `extra_locations` 命中该路径

### Requirement: login shell 解析的超时与安全

系统 SHALL 用 `$SHELL -ilc` 触发 login shell 解析，且 MUST 满足：shell 解释器白名单 `bash/zsh/sh/dash/ksh`；解析脚本先 `unalias`/`unset -f` 去除别名与 shell 函数遮蔽，再 `command -v`；只信任绝对路径，并用 `cd dirname && pwd -P` 规范化 symlink；命令名 MUST 通过 `[A-Za-z0-9._+-]` 白名单校验后才内联进脚本。解析 MUST 有超时上限，broken rc 文件 MUST NOT 阻塞 daemon 启动。

#### Scenario: broken rc 文件不阻塞启动

- **WHEN** 用户的 rc 文件里有后台进程占着 stdout 管道或长时间挂起
- **THEN** login shell 解析 MUST 在超时上限内放弃（默认 3s + `WaitDelay` 2s）
- **AND** daemon MUST 继续启动，回退到「无 shell 兜底」的行为

#### Scenario: 别名遮蔽真实二进制

- **WHEN** `~/.zshrc` 里定义了 `alias claude=...`，而真实 `claude` 二进制在 PATH 更后面的目录
- **THEN** 解析脚本 MUST 通过 `unalias` 去除别名，使 `command -v claude` 命中真实二进制路径

### Requirement: 版本探测与最低版本门槛

系统 SHALL 对每个探测到的 runtime 运行 `version_args`（默认 `--version`）获取版本，并 MUST 从输出中提取 semver token（无 semver token 时回退到整行 trim）。系统 MUST 对设置了 `min_version` 的 runtime 校验版本，低于门槛时 MUST 上报为 `error` 状态并附诊断信息。

#### Scenario: 版本达标

- **WHEN** 探测到 `claude` 且版本 ≥ 2.0.0
- **THEN** 该 runtime MUST 以 `status: available` 上报，`diagnostics` 为空

#### Scenario: 版本低于门槛

- **WHEN** 探测到 `codex` 且版本 < 0.100.0
- **THEN** 该 runtime MUST 以 `status: error` 上报
- **AND** `diagnostics` MUST 包含类似 `codex <version> is below minimum 0.100.0` 的说明

#### Scenario: 版本探测失败

- **WHEN** 二进制存在但 `--version` 执行失败或无法解析
- **THEN** 该 runtime MUST 以 `status: error` 上报，`diagnostics` 说明版本探测失败

### Requirement: 三态诊断上报到 runtimes 表

系统 SHALL 把探测结果的状态写入 `runtimes.status` 与 `runtimes.diagnostics` 列（不再硬编码 `available`）。未找到的 runtime MUST 保持不上报（absent = missing）。`v1.Runtime` 类型 MUST 增加 `status` 与 `diagnostics` 字段。

#### Scenario: 服务端持久化状态

- **WHEN** daemon 上报一条 `status: error` 的 runtime
- **THEN** server 的 `ReplaceRuntimes` MUST 把 `error` 与诊断信息写入对应列
- **AND** MUST NOT 覆盖为 `available`

#### Scenario: 未找到的 runtime 不上报

- **WHEN** 本机没有安装 `agy`
- **THEN** daemon MUST NOT 上报 `agy`（`runtimes` 表中无对应记录）
- **AND** 前端 daemons 页 MUST 显示空态而非 error 态

### Requirement: 周期重探重报

系统 SHALL 在 daemon 运行期间周期性重跑 runtime 探测，检测到能力集合变化时 MUST 重新上报。上报端点 MUST 保持幂等（upsert + delete-not-in）。

#### Scenario: 运行中安装新 CLI

- **WHEN** daemon 启动时没有 `agy`，运行中用户安装了 `agy` 并加入 PATH
- **THEN** 下一个探测周期 MUST 发现 `agy`
- **AND** daemon MUST 重新上报，前端 daemons 页刷新后显示 `agy`

### Requirement: 探测可测试性

Resolver 的环境变量读取、`LookPath`、`stat`、shell 解析 MUST 全部可注入，以便单元测试覆盖 PATHEXT、execute 位、env 覆盖 hard-miss、shell 兜底懒触发与版本门槛。

#### Scenario: 纯单元测试 shell 兜底

- **WHEN** 注入 `LookPath` 返回失败、`ShellResolve` 返回 `{"claude": "/opt/bin/claude"}`
- **THEN** 探测结果 MUST 命中 `/opt/bin/claude`
- **AND** MUST NOT 依赖真实 shell 或真实文件系统
