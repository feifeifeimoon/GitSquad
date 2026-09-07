## 1. 声明式注册表 + Resolver 骨架

- [ ] 1.1 新增 `internal/daemon/runtime_specs.go`：`RuntimeSpec` 结构 + `defaultSpecs()`（claude / codex / agy）+ `MinVersions`（claude 2.0.0、codex 0.100.0、agy 空）
- [ ] 1.2 新增 `internal/daemon/execpath.go`：`Resolver`（`Env`/`LookPath`/`Stat`/`ShellResolve` 可注入）+ `NewDefaultResolver()` + `Resolve(spec) (path string, err error)`，实现决策 2 的管线优先级
- [ ] 1.3 改造 `internal/daemon/runtime.go`：删除手写 `findExe`；`Registry` 改为持有 `[]RuntimeSpec` + `Resolver`，`DetectAll` 改为 `DetectAll(specs, resolver) []v1.Runtime`
- [ ] 1.4 删除 `internal/daemon/runtime_claude.go` 与 `runtime_codex.go`（逻辑并入 spec + resolver），保留 `runVersionCmd` 公共 helper
- [ ] 1.5 改造 `internal/daemon/detect.go` 的 `DetectRuntimes`：用新 resolver 探测，组装 `MachineInfo` + runtimes

## 2. login shell 解析

- [ ] 2.1 新增 `internal/daemon/shellpath.go`：`ResolveViaLoginShell(names []string) map[string]string`
- [ ] 2.2 实现 shell 白名单 `bash/zsh/sh/dash/ksh` + `isSafeCommandName`（`[A-Za-z0-9._+-]`）
- [ ] 2.3 实现脚本 builder：`unalias`/`unset -f` → `command -v` → 绝对路径校验 → `cd && pwd -P` → `printf "name\tpath"`
- [ ] 2.4 实现超时保险：`loginShellResolveTimeout = 3s` + `cmd.WaitDelay = 2s`；逐行 `filepath.IsAbs` + `exec.LookPath` 复核
- [ ] 2.5 在 `Resolver` 里接线懒触发 + `sync.Once` 单飞（happy path 不 fork shell）

## 3. 版本门槛 + 三态诊断

- [ ] 3.1 新增 `internal/daemon/version.go`：`parseSemver` + `lessThan` + `extractVersionLine` + `CheckMinVersion(spec, version)`
- [ ] 3.2 `pkg/types/v1/runtime.go` 的 `Runtime` 增加 `Status string` / `Diagnostics string`（json omitempty）
- [ ] 3.3 探测产出三态：available / error（below-min）/ error（version probe failed）；missing 不上报

## 4. 上报链路改造

- [ ] 4.1 `internal/server/service/daemon.go` 的 `ReplaceRuntimes`：持久化 `rt.Status`/`rt.Diagnostics`，移除硬编码 `available`/`nil`
- [ ] 4.2 前端 `web/app/(app)/daemons/page.tsx`：runtime 徽章按 `status` 区分可用 / 异常（error 态加提示）

## 5. 周期重探

- [ ] 5.1 daemon 配置新增 `RuntimeRefreshInterval`（默认 5m）
- [ ] 5.2 `daemon.go` 加独立 ticker，重跑 `DetectRuntimes`，与 `lastRuntime` 对比，变化时 `client.Register`

## 6. 测试

- [ ] 6.1 `execpath` 单测：env 覆盖命中 / hard-miss、LookPath 命中、shell 兜底命中、extra locations 命中、优先级顺序
- [ ] 6.2 `shellpath` 单测：白名单过滤、脚本输出解析、`isSafeCommandName`、超时降级
- [ ] 6.3 `version` 单测：semver 提取（含 Windows `chcp` 噪音）、门槛判定
- [ ] 6.4 `ReplaceRuntimes` 单测：status/diagnostics 持久化
- [ ] 6.5 删除 `runtime_claude.go`/`runtime_codex.go` 后确认 `runtime_test.go`/`detect_test.go` 更新通过

> 说明：`agy` 的 `--version` 输出格式与最低版本门槛待确认（见 design.md Open Questions），第一版不设门槛。
