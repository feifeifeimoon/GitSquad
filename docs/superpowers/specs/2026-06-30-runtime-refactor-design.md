# Runtime 重构设计文档

> 日期: 2026-06-30 | 状态: 待评审

## 1. 目标

1. **命名统一**: 将项目中 `Capability` / `Backends` / `Runtime` 三种叫法统一为 `Runtime`
2. **共享类型提取**: 将 server 和 daemon 共用的类型提取到 `pkg/types/`
3. **CLI 抽象层**: 定义 `Runtime` 接口 + 注册表，先实现 Claude Code / Codex 的检测适配器，执行接口留槽

---

## 2. 当前状态 vs 目标状态

### 2.1 命名对比

| 位置 | 当前 | 目标 |
|------|------|------|
| `scan.go` 结构体 | `Capability` | `pkgtypes.Runtime` |
| `scan.go` JSON field | `"capabilities"` | `"runtimes"` |
| `scan.go` upload endpoint | `PUT .../capabilities` | `PUT .../runtimes` |
| `handler/daemon.go` 路由 | `/capabilities` | `/runtimes` |
| `handler/daemon.go` 方法 | `PutCapabilities` | `PutRuntimes` |
| `app.go` 函数 | `capabilitySummary()` | `runtimeSummary()` |
| `app.go` heartbeat key | `"capability_summary"` | `"runtime_summary"` |
| `app.go` count 函数 | `countAvailable` 过滤 `"coder_backend"` + `status` | 直接 `len(runtimes)`，只上报可用的 |
| 前端 `page.tsx` 标签 (×2) | `Backends` | `Runtimes` |
| 前端过滤条件 | `c.kind === "coder_backend"` | 无需过滤，全部展示 |
| 前端状态展示 | `available` / 其他显示不同图标 | 全是可用，统一图标 |
| `scan.go` Print 标签 | `Backends:` | `Runtimes:` |
| `scan.go` Print 状态标记 | `✓` / `✗` | 只有 `✓` |
| `kind` 值 | `"coder_backend"` / `"tool"` + `name` | `"claude"` / `"codex"` / `"git"`（kind 即标识） |
| Runtime 结构体 | `Kind` + `Name` + `Status` + `Diagnostics` | 仅 `Kind`, `ExecutablePath`, `Version`, `MaxConcurrency` |

### 2.2 数据库

数据库表 `runtimes` 不变。`kind` 列的存储值由分类值（`"coder_backend"`）变为标识值（`"claude"`, `"codex"` 等），列定义不变。MVP 阶段无存量数据，直接改。

---

## 3. 目标包结构

```
GitSquad/
├── pkg/                           ← 新增
│   └── types/
│       ├── runtime.go             ← 共享 Runtime 类型 + Kind/Status 常量
│       └── response.go            ← 共享 APIResponse 信封
│
├── internal/
│   ├── server/
│   │   ├── types/
│   │   │   ├── runtime.go         ← ServerRuntime，嵌入 pkg/types.Runtime
│   │   │   ├── daemon.go          ← Daemon, DaemonToken, DaemonWithRuntimes（不动）
│   │   │   ├── user.go            ← User（不动）
│   │   │   └── response.go        ← 删除（内容已迁至 pkg/types/）
│   │   ├── handler/
│   │   │   ├── daemon.go          ← PutCapabilities → PutRuntimes，类型引用更新
│   │   │   ├── routes.go          ← PUT /:id/capabilities → /:id/runtimes
│   │   │   └── daemon_ws.go       ← 不变
│   │   ├── service/
│   │   │   └── daemon.go          ← ReplaceRuntimes 参数类型改为 []pkgtypes.Runtime
│   │   └── ws/
│   │       └── hub.go             ← Frame 类型不变
│   │
│   └── daemon/
│       └── app/
│           ├── runtime.go         ← 新增：Runtime 接口 + Executor + Registry
│           ├── runtime_claude.go  ← 新增：Claude Code 适配器
│           ├── runtime_codex.go   ← 新增：Codex CLI 适配器
│           ├── scan.go            ← 重构：删除 Capability/knownCLIs，用 Registry 驱动
│           └── app.go             ← capabilitySummary → runtimeSummary
│
└── web/
    └── app/console/daemons/
        └── page.tsx               ← Backends → Runtimes, 不再按 kind 过滤（kind 即标识）
```

---

## 4. 类型定义

### 4.1 `pkg/types/runtime.go`

```go
// Package types holds shared domain types used by both daemon (CLI) and server.
package types

// Runtime is a shared capability record reported by the daemon.
// Only available runtimes are reported — missing ones are simply absent.
// Kind is the runtime identifier (e.g. "claude", "codex", "git").
type Runtime struct {
	Kind           string `json:"kind"`
	ExecutablePath string `json:"executable_path,omitempty"`
	Version        string `json:"version,omitempty"`
	MaxConcurrency int    `json:"max_concurrency"`
}
```

### 4.2 `pkg/types/response.go`

从 `internal/server/types/response.go` 搬过来，内容不变：

```go
package types

// APIResponse is the standard envelope for all API responses.
type APIResponse struct {
	Success bool   `json:"success"`
	Data    any    `json:"data,omitempty"`
	Message string `json:"message,omitempty"`
	Count   int    `json:"count,omitempty"`
}

func SuccessResponse(data any, count int) APIResponse {
	return APIResponse{Success: true, Data: data, Count: count}
}

func ErrorResponse(message string) APIResponse {
	return APIResponse{Success: false, Message: message}
}
```

### 4.3 `internal/server/types/runtime.go`

Server 端扩展，嵌入共享类型并追加 DB 特有字段：

```go
package types

import (
	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
	"github.com/google/uuid"
)

// Runtime is the server-side view of a daemon runtime capability.
// It embeds the shared pkg/types.Runtime and adds persistence fields.
type Runtime struct {
	pkgtypes.Runtime
	ID       uuid.UUID `json:"id"`
	DaemonID uuid.UUID `json:"daemon_id"`
}
```

### 4.4 `internal/daemon/app/runtime.go`

```go
package app

import (
	"context"
	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

// Executor drives a CLI tool to execute a coding task.
// NOT YET IMPLEMENTED — returns nil in all adapters.
type Executor interface {
	// Execute runs a task instruction in the given working directory.
	// Returns a channel of structured output events.
	Execute(ctx context.Context, workDir string, instruction string) (<-chan Output, error)
}

// Output is a single event emitted during execution.
type Output struct {
	Type    string // "stdout" | "stderr" | "artifact" | "error"
	Content string
}

// Runtime is a CLI tool that the daemon can detect and (in future) execute.
type Runtime interface {
	// Detect checks whether the CLI is available on the given PATH directories.
	// Returns nil if the CLI is not found or not working.
	Detect(paths []string) *pkgtypes.Runtime

	// Executor returns the execution driver for this runtime.
	// Returns nil until execution is implemented.
	Executor() Executor
}

// Registry holds all known Runtime implementations.
type Registry struct {
	items []Runtime
}

// NewRegistry creates a registry with the given runtimes.
func NewRegistry(items ...Runtime) *Registry {
	return &Registry{items: items}
}

// All returns every registered runtime.
func (r *Registry) All() []Runtime { return r.items }

// DefaultRegistry returns the MVP set: Claude Code + Codex.
func DefaultRegistry() *Registry {
	return NewRegistry(
		&ClaudeRuntime{},
		&CodexRuntime{},
	)
}
```

### 4.5 `internal/daemon/app/runtime_claude.go`

```go
package app

import (
	"strings"

	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

// ClaudeRuntime detects the Claude Code CLI ("claude").
type ClaudeRuntime struct{}

func (r *ClaudeRuntime) Detect(paths []string) *pkgtypes.Runtime {
	const kind = "claude"
	exePath, err := findExe(kind, paths)
	if err != nil {
		return nil
	}

	ver, err := runVersionCmd(exePath, "--version")
	if err != nil {
		return nil
	}

	return &pkgtypes.Runtime{
		Kind: kind, ExecutablePath: exePath,
		Version: strings.TrimSpace(ver), MaxConcurrency: 1,
	}
}

func (r *ClaudeRuntime) Executor() Executor { return nil }
```

### 4.6 `internal/daemon/app/runtime_codex.go`

结构与 `runtime_claude.go` 对称，`exeName = "codex"`，`versionFlag = "version"`。

---

## 5. 变更清单

### 5.1 新增文件

| 文件 | 说明 |
|------|------|
| `pkg/types/runtime.go` | 共享 Runtime 类型 |
| `pkg/types/response.go` | 共享 APIResponse（从 server/types 搬过来） |
| `internal/daemon/app/runtime.go` | Runtime 接口 + Registry |
| `internal/daemon/app/runtime_claude.go` | Claude Code 适配器 |
| `internal/daemon/app/runtime_codex.go` | Codex CLI 适配器 |

### 5.2 修改文件

| 文件 | 改动 |
|------|------|
| `internal/daemon/app/scan.go` | 删除 `Capability` / `CLIDefinition` / `knownCLIs`；`ScanResult` 用 `[]pkgtypes.Runtime`；`ScanCapabilities` 用 `DefaultRegistry()` 驱动；`Print` 标签改 `Runtimes`；`Upload` endpoint 改 `/runtimes` |
| `internal/daemon/app/app.go` | `capabilitySummary` → `runtimeSummary`；heartbeat key 改 `"runtime_summary"` |
| `internal/server/types/runtime.go` | `Runtime` → 嵌入 `pkgtypes.Runtime` + ID/DaemonID/CheckedAt |
| `internal/server/types/response.go` | 删除（内容已迁至 pkg/types/） |
| `internal/server/handler/daemon.go` | `PutCapabilities` → `PutRuntimes`；request 类型用 `[]pkgtypes.Runtime`；response 引用更新 |
| `internal/server/handler/routes.go` | `PUT /:id/capabilities` → `PUT /:id/runtimes`；`daemon.PutCapabilities` → `daemon.PutRuntimes` |
| `internal/server/service/daemon.go` | `ReplaceRuntimes` 参数改为 `[]pkgtypes.Runtime`（daemon 只上报可用的，server 默认 status='available'）；`toRuntime` 返回值改为嵌入 `pkgtypes.Runtime` |
| `internal/server/handler/daemon_ws.go` | 引用检查（无功能变更） |
| `web/app/console/daemons/page.tsx` | 2 处 `Backends` → `Runtimes`；`Runtime` 接口去掉 `name`/`status` 字段，直接用 `kind` 展示，统一可用图标 |
| `internal/server/handler/auth.go` | `types.SuccessResponse` / `types.ErrorResponse` → `pkgtypes.xxx` |
| `internal/server/handler/user.go` | 同上 |
| `internal/server/handler/routes.go` | 同上 |

### 5.3 移除内容

- `knownCLIs` 列表中除 Claude Code / Codex 之外的 8 个 CLI（copilot, gemini, opencode, cursor, windsurf, aider, cody, q）本期移除，后续按需以独立适配器文件加回

### 5.4 共享辅助函数

- `findInPath(exeName, paths)` — 从 `scan.go` 提取到 `runtime.go`，Windows 兼容（`.exe`, `.cmd`, `.bat`, `.ps1`）
- `runCmd(exe, args...)` — 从 `scan.go` 提取到 `runtime.go`，带 5s 超时的版本检测

### 5.5 不变文件

- `internal/server/store/db/models.go` — sqlc 生成的 `Runtime` struct 保持不动，它映射 DB 列
- `internal/server/store/db/daemons.sql.go` — sqlc 生成，不动
- `internal/server/store/schema.sql` — 表结构不动
- `internal/server/ws/hub.go` — Frame type `runtime_gone` / `runtime_gone_ack` 已经叫 runtime，不动
- `database/migration.go` — `006_create_runtimes` 迁移不动

---

## 6. 接口变化（对外影响）

### 6.1 API 端点

```
PUT /api/v1/daemon/:id/capabilities  →  PUT /api/v1/daemon/:id/runtimes
```

旧端点不再可用。MVP 阶段无外部消费者，直接改。

### 6.2 JSON 数据格式

**请求体（daemon → server）** — `kind` 直接是 runtime 标识：

```json
// 之前
{"runtimes": [{"kind": "coder_backend", "name": "claude", "status": "available", ...}]}
// 之后（只上报可用的，无 status/diagnostics/name）
{"runtimes": [{"kind": "claude", "executable_path": "...", "version": "..."}]}
```

**WebSocket heartbeat payload** — key 变化：

```json
// 之前
{"capability_summary": {"claude": "available"}}
// 之后
{"runtime_summary": {"claude": "available"}}
```

---

## 7. 测试影响

- `internal/daemon/config/config_test.go` — 无影响
- `internal/server/config/config_test.go` — 无影响
- `internal/server/database/database_test.go` — 无影响
- 新增：每个 Runtime 适配器应有独立的 `_test.go`（本期打桩，执行阶段补全）

---

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 前端 `Backends` 改为 `Runtimes` 后显示名变化 | 用户量极小，直接改 |
| daemon 只上报可用 runtime，server 端不再感知 missing/degraded 状态 | 服务端 `ReplaceRuntimes` 默认写 status='available'；机器级状态（git 可用性等）仍在 `machine_checks` 中 |
| `pkg/types/` 引入新的 import path | `go mod tidy` 自动处理，单 module 无问题 |
| 删除 `internal/server/types/response.go` 导致编译错误 | 搜索所有引用，批量替换 import |

---

## 9. 后续扩展点

- `Executor` 接口实现：每个适配器补充 `Execute()` 方法
- Registry 扩展：加更多 CLI（Gemini, Copilot, Cursor...）
- Server 端 Runtime 匹配逻辑：用 `kind` 匹配 agent 配置中的 coder backend
