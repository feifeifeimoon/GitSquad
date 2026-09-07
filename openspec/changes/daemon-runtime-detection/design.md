## Context

现状链路：`Daemon.Run()` 启动时调用 `DetectRuntimes()`（`internal/daemon/detect.go`）→ `Registry.DetectAll(paths)`（`internal/daemon/runtime.go`）逐个调用 `ClaudeRuntime.Detect` / `CodexRuntime.Detect` → 每个 adapter 用 `findExe` 手写 PATH 扫描 + `runVersionCmd` 跑 `--version` → `client.Register` 上报 `PUT /api/v1/daemon/runtimes` → server `ReplaceRuntimes` 落 `runtimes` 表（`status`/`diagnostics` 被硬编码）。

两个参考对象：

- **orca**：声明式 agent 注册表 + 可注入探测选项 + execute 位/PATHEXT 正确性 + override token 校验。注意 orca 只探测**存在性**（found/missing），不跑 `--version` 拿版本号。
- **multica**：`exec.LookPath` 为主 + login shell 解析兜底（懒触发、单飞、超时保险、`command -v` + `pwd -P` 规范化、回 daemon 侧复核）+ 版本门槛 `MinVersions`。

分工：**探测架构抄 orca，shell 解析和版本门槛抄 multica**。

第一版 scope：`claude`、`codex`、`agy`（Antigravity CLI，二进制名 `agy`，版本命令 `agy --version`）。

## Goals / Non-Goals

**Goals:**

- 用声明式注册表替换硬编码适配器，第一版支持 claude / codex / agy，且加新 CLI 只加一行 spec。
- 用 `exec.LookPath` 替换手写 `findExe`，修掉 execute 位与 PATHEXT 的正确性问题。
- 补齐 login shell PATH 解析，解决「GUI 拉起的 daemon 看不到 rc 文件里的 PATH」。
- 加版本门槛与 `status`/`diagnostics` 诊断上报。
- 加周期重探，解决「运行中装新 CLI 不刷新」。
- 让探测可单元测试（依赖全部可注入）。

**Non-Goals:**

- 不实现执行能力（`Executor` 仍是占位，返回 nil，超出本 change 范围）。
- 不做模型列表探测（`ListModels` 已有，不在本次重做）。
- 不做 `agent_runtimes`（workspace 级）模型的任何改动——本 change 只动 daemon 级 `runtimes`。
- 不做「缺失 runtime 也上报」——保留 absent = missing 语义，前端已有空态。
- 不支持 fish 作为 login shell 解析目标（沿用 multica 的 POSIX shell 白名单，鱼 shell 语法不同）。

## Decisions

### 决策 1：声明式注册表替代 per-adapter `Detect`

**选择**：用一个 `RuntimeSpec` 结构描述每个 runtime，注册表是 spec 切片。探测逻辑收敛到一个共享 `Resolver`，不再为每个 runtime 写一个 `runtime_xxx.go`。

```go
// internal/daemon/runtime_specs.go
type RuntimeSpec struct {
    Kind            string   // 稳定 id："claude" | "codex" | "agy"
    CommandNames    []string // 候选二进制名，含别名；第一个命中即止
    EnvPathOverride string   // 环境变量覆盖名，如 "GITSQUAD_CLAUDE_PATH"
    VersionArgs     []string // 版本探测参数，默认 ["--version"]
    MinVersion      string   // 最低版本门槛，"" 表示不设门槛
    ExtraLocations  []string // 特殊位置 fallback（如 Codex Desktop app bundle）
}

func defaultSpecs() []RuntimeSpec {
    return []RuntimeSpec{
        {Kind: "claude", CommandNames: []string{"claude"}, EnvPathOverride: "GITSQUAD_CLAUDE_PATH", MinVersion: "2.0.0"},
        {Kind: "codex",  CommandNames: []string{"codex"},  EnvPathOverride: "GITSQUAD_CODEX_PATH",  MinVersion: "0.100.0",
         ExtraLocations: codexDesktopBundlePaths()},
        {Kind: "agy",    CommandNames: []string{"agy"},    EnvPathOverride: "GITSQUAD_AGY_PATH"}, // 暂不设门槛
    }
}
```

**理由**：orca 的 `TUI_AGENT_CONFIG_SOURCE` 证明了「稳定 id vs 实际二进制名」解耦 + 候选名/别名/前置依赖/平台门控作为数据而非代码的可维护性。GitSquad 现在是「一个 adapter = 一个名字」，加 `agy` 就得再复制一个 `runtime_agy.go`。

**被否决的替代方案**：
- 保留 `Runtime` 接口 + per-adapter `Detect(paths)`，仅把 `findExe` 换成 `exec.LookPath`。改动最小，但别名/门槛/特殊位置仍然每 adapter 复制一份，`Registry.DetectAll` 传 `[]string` PATH 的形状也不利于注入 shell 解析结果。
- 完全照搬 orca 的 `detectCmdAliases`/`detectRequiredCommands`/`detectUnsupportedRuntimes` 全套字段。第一版三个 CLI 都没有别名/前置依赖/平台门控需求，字段留到需要时再加（YAGNI）。

**已知代价**：`Runtime` 接口上的 `Executor()` 占位方法随之被移除或独立成一个小接口。当前所有 adapter 的 `Executor()` 都返回 nil，属于死代码，移除无行为损失。

### 决策 2：探测管线固定优先级，只对裸命令名做 shell 兜底

**选择**：每个 spec 的解析按以下顺序，第一个命中即返回：

1. **env 覆盖**（`GITSQUAD_<KIND>_PATH`）：设了就信它。若值是含路径分隔符（`/` 或 `\`）的显式路径，`os.Stat` 校验存在，不存在即 hard-miss（不静默回退到别的二进制）；若值是裸命令名，走 `exec.LookPath`。
2. **`exec.LookPath`** 遍历 `CommandNames`（原生解析，正确覆盖 PATHEXT / execute 位 / 相对路径）。
3. **login shell 解析**（懒触发、`sync.Once` 单飞）：对全部 spec 的裸命令名做一次 `command -v` 批解析，得到 name → canonical path，命中后回 daemon 侧 `exec.LookPath` 复核。
4. **特殊位置 fallback**（`ExtraLocations`）：`os.Stat` 存在即命中。

**理由**：multica 的 probe 循环（`config.go:200-234`）就是这个顺序，且明确「shell 兜底只救裸命令名」——操作者把 override 指到一个不存在的绝对路径时应当 hard-miss，而不是悄悄换一个二进制。懒触发 + 单飞保证 happy path（CLI 都在 PATH）不付出 fork login shell 的启动开销。

**被否决的替代方案**：
- 无条件先跑 shell 解析：把 rc 文件开销强加给所有用户（multica 注释明确反对）。
- 只靠 `exec.LookPath` 不加 shell 兜底：正是本 change 要修的「GUI 拉起看不到 rc PATH」根因。

**已知代价**：env override 的校验需要一份「含路径分隔符」判断 + token 安全校验（见决策 5），比现状多一点代码。

### 决策 3：login shell 解析移植 multica 的实现

**选择**：新增 `internal/daemon/shellpath.go`，行为对齐 multica 的 `resolveAgentsViaLoginShell`：

- `$SHELL` 取自环境变量，白名单 `bash/zsh/sh/dash/ksh`（不在白名单则直接跳过）。
- `exec.CommandContext(shell, "-ilc", script)`，`loginShellResolveTimeout = 3s` + `cmd.WaitDelay = 2s`（Go 1.20+），防止 rc 文件里 `&` 出的后台进程占着 stdout 管道卡死启动。
- 脚本：`unalias`/`unset -f` 去别名与 shell 函数遮蔽 → `command -v` → 只信绝对路径（`case "$p" in /*)`）→ `cd dirname && pwd -P` 规范化 symlink（fnm/nvm multishell 目录随 shell 退出消失，必须在 shell 存活时捕获）→ `printf "name\tpath"`。
- Go 侧逐行解析：`filepath.IsAbs` 校验 + `exec.LookPath` 复核，两条都不满足就丢弃。
- 命令名用 `isSafeCommandName` 白名单 `[A-Za-z0-9._+-]` 校验后才内联进脚本。

**理由**：multica 这套是经过实战验证的（注释里标了 fnm multishell、`alias claude=...` 阴影、broken rc 卡启动等具体坑），直接移植比重写风险低。

**被否决的替代方案**：orca 的「整段 dump PATH 再合并」方案（`hydrate-shell-path.ts`）——它对「进程 PATH 增补」更合适，但 GitSquad 要的是「按名字解析出 canonical path」，multica 的 `command -v` + `pwd -P` 逐二进制解析更精确，且不需要关心 Windows 的 `cygpath`/powershell 分支（GitSquad daemon 在 Windows 上从交互 shell 拉起时 PATH 通常是完整的；确需 Windows shell 水合时再引入 orca 的分支）。

**已知代价**：Windows 上 `$SHELL` 通常不指向 POSIX shell，白名单会让 shell 解析在 Windows 上大概率空转。第一版可接受——Windows 主路径靠 `exec.LookPath`（它会读 `PATHEXT`）。

### 决策 4：版本门槛 + 三态诊断，missing 仍不上报

**选择**：新增 `internal/daemon/version.go`，移植 multica 的 `parseSemver` / `lessThan` / `extractVersionLine`，加一个 `MinVersions` 表（`claude:2.0.0`、`codex:0.100.0`，agy 暂不设）。探测产出三态，映射到 `v1.Runtime` 新增的 `status`/`diagnostics`：

| 探测结果 | 是否上报 | `status` | `diagnostics` |
|---|---|---|---|
| 找到且版本达标 | 是 | `available` | 空 |
| 找到但版本低于门槛 | 是 | `error` | `claude 1.0.0 is below minimum 2.0.0` |
| 找到但版本探测失败 | 是 | `error` | `version probe failed: …` |
| 未找到 | 否（absent） | — | — |

**理由**：`runtimes.status`/`runtimes.diagnostics` 列已在 `schema.sql:34-36` 定义但被 `ReplaceRuntimes` 硬编码成 `available`/`nil`，本 change 把它们真正用起来，前端就能区分「可用」和「检测到但异常」而不只是绿色徽章。保留 absent = missing 语义，前端空态（`No capabilities reported.`）不受影响。

**被否决的替代方案**：把「未找到」也作为一条 `status:"missing"` 上报。会让 `daemons` 页每个 daemon 都列满三种 CLI，噪音大；且 `DeleteRuntimesNotIn` 的删除逻辑要跟着改，不值。

**已知代价**：`agy` 的版本格式与是否稳定输出 semver 未经确认，第一版不设门槛、且 `extractVersionLine` 在无 semver token 时回退到整行 trim（multica 同款容错），避免误删。

### 决策 5：Resolver 依赖全部可注入

**选择**：`Resolver` 把 `os.Getenv`、`exec.LookPath`、`os.Stat`、shell 解析都做成字段，默认绑定真实实现，测试注入 fake：

```go
// internal/daemon/execpath.go
type Resolver struct {
    Env          func(string) string                 // 默认 os.Getenv
    LookPath     func(string) (string, error)        // 默认 exec.LookPath
    Stat         func(string) (os.FileInfo, error)   // 默认 os.Stat
    ShellResolve func([]string) map[string]string    // 默认 ResolveViaLoginShell
}
```

**理由**：orca 的 `DetectOptions`（`pathEnv/platform/pathDelimiter/pathExt/fileProbe/hydratePath/homeDir` 全可注入）是它单测覆盖 PATHEXT/execute 位/`~` 展开/水合失败的关键。GitSquad 现状 `findExe` 直接依赖全局 `os`/`runtime`，导致 `detect_test.go` 只能测空 registry。

**被否决的替代方案**：用 `t.Setenv` + 真实临时目录 + 假可执行文件做集成式测试。能测但慢、且 PATHEXT/execute 位跨平台不稳定；注入式让「shell 解析返回什么」「LookPath 命中谁」都变成纯单元断言。

**已知代价**：`Resolver` 字段一多，`DetectRuntimes` 的调用点要构造默认 resolver，需要一个 `NewDefaultResolver()` 构造器收口。

## Data Flow（改造后）

```
Daemon.Run()
  └─ d.detectRuntimes()                    // 周期可重入
       ├─ Resolver.Resolve(spec)           // 决策 2 的管线
       │    ├─ env override / LookPath / shell / extra locations
       │    └─ runVersionCmd → extractVersionLine → CheckMinVersion
       └─ → []v1.Runtime{kind,path,version,status,diagnostics}
  └─ client.Register(runtimes)             // PUT /api/v1/daemon/runtimes（幂等）
       └─ server ReplaceRuntimes           // 持久化 status/diagnostics
            └─ runtimes 表
                 └─ GET /api/v1/daemons → daemons 页渲染（available / error）
```

## Open Questions

- `agy --version` 的实际输出格式与最低版本门槛值（第一版不设门槛，后续确认后补进 `MinVersions`）。
- Windows 下是否需要引入 orca 的 powershell/git-bash PATH 水合分支（第一版靠 `exec.LookPath` + `PATHEXT` 兜住，暂不做）。
