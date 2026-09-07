## Why

当前 daemon 对 runtime 的探测是手写的 PATH 扫描（`internal/daemon/runtime.go` 的 `findExe`），它绕过了 OS 原生语义，且只读进程继承的 `PATH`。由此带来几个实际问题：

- **正确性问题**：Unix 下不校验 execute 位（只判断 `!info.IsDir()`）；Windows 硬编码 `.exe/.cmd/.bat/.ps1` 而不读 `PATHEXT`（且 `.ps1` 不能直接被 `exec.Command` 执行）。
- **找不到「终端里明明能跑」的 CLI**：`gitsquad daemon start` 是 `Setsid` 分离的子进程，从 GUI/launchd/systemd/Electron 等非交互环境拉起时，看不到只在 `~/.zshrc`/`~/.bashrc` 里注入的 PATH（fnm/nvm/volta 的 multishell 目录、Anthropic 原生安装器的 `~/.claude/local`、用户级 npm prefix）。
- **注册表是硬编码**：`DefaultRegistry()` 只挂了 Claude + Codex，每个适配器一个名字，加一个新 CLI 要新写一个 `runtime_xxx.go`。
- **没有版本门槛**：拿到 version 字符串就原样存，不校验最低版本。
- **一次性探测**：只在启动时探测一次，运行中装新 CLI 不会刷新。
- **不可测试**：`findExe` 直接依赖 `os.Getenv`/`os.Stat`/`runtime.GOOS`，没有注入点（现有测试只能测空 registry）。

本 change 参考两个成熟实现重做这条链路：

- **orca**（`src/main/agent-hooks/local-agent-cli-presence.ts`、`src/main/startup/hydrate-shell-path.ts`、`src/shared/tui-agent-config.ts`）：声明式 agent 注册表（稳定 id / 候选命令名 / 别名 / 前置依赖 / 平台门控）、可注入探测选项、execute 位 + PATHEXT 的正确处理、override 命令 token 解析与注入校验、`found/missing/unknown` 三态。
- **multica**（`server/internal/daemon/config.go` 的 `resolveAgentsViaLoginShell`、`server/pkg/agent/version.go`）：`exec.LookPath` 为主 + login shell 解析兜底（懒触发、单飞、超时保险、别名清理、`pwd -P` 规范化、回 daemon 侧复核）、版本门槛 `MinVersions`。

## What Changes

- **声明式 runtime 注册表**替代 per-adapter `Detect`。每个 runtime 一条 spec（`kind` / 候选命令名 / 别名 / env 覆盖 / 版本探测参数 / 最低版本 / 特殊位置 fallback）。第一版只支持 `claude`、`codex`、`agy`（Antigravity）。
- **探测管线**按固定优先级：env 覆盖 → `exec.LookPath` → login shell 解析（懒触发、`sync.Once` 单飞、超时保险）→ 特殊位置 fallback。只对裸命令名做 shell 兜底。
- **版本探测 + 最低版本门槛**：`claude ≥ 2.0.0`、`codex ≥ 0.100.0`（沿用 multica 的既有理由），`agy` 第一版暂不设门槛。
- **三态结果 + 诊断上报**：`status`（`available` / `error`）+ `diagnostics` 写入现有 `runtimes` 表的对应列（列已存在，当前被硬编码）。未找到的 runtime 仍保持「不上报」（absent = missing）的既有语义。
- **周期重探重报**：daemon 定期重跑探测，变化时重新 `PUT /api/v1/daemon/runtimes`（该端点本就幂等：upsert + delete-not-in）。
- **可测试性**：Resolver 的环境/`LookPath`/`stat`/shell 解析全部可注入。

## Capabilities

### New Capabilities

- `runtime-detection`: daemon 探测本机可用的 AI CLI（存在性 + 版本 + 最低版本门槛），并把能力上报给 SaaS，供前端展示与 agent 配置引用。

### Modified Capabilities

（无。现有 `hybrid-execution` / `daemon-authentication` 中「runtime check」相关的落点统一收敛到本 capability。）

## Impact

- **daemon 侧**：新增 `execpath.go`（Resolver）、`shellpath.go`（login shell 解析）、`version.go`（semver + 门槛）、`runtime_specs.go`（声明式注册表）；改造 `runtime.go`/`detect.go`；移除 `runtime_claude.go`/`runtime_codex.go`。
- **类型**：`pkg/types/v1/runtime.go` 的 `Runtime` 增加 `status`/`diagnostics` 字段。
- **server 侧**：`service/daemon.go` 的 `ReplaceRuntimes` 改为持久化上报的 `status`/`diagnostics`，不再硬编码 `available`。
- **前端**：`web/app/(app)/daemons/page.tsx` 的 runtime 徽章按 `status` 区分可用 / 异常。
- **数据库**：无 schema 变更（`runtimes.status`/`runtimes.diagnostics` 列已存在，`schema.sql:34-36`）。
- **外部依赖**：无新增。
