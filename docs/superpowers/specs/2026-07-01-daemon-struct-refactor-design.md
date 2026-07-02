# Daemon App 深度重构设计

**日期:** 2026-07-01  
**状态:** 待实现  
**分支:** mvp

## 1. 概述

对 `internal/daemon/app/` 进行全面重构，引入集中式 `Daemon` 结构体管理所有状态和依赖，统一术语，修复架构缺陷。

### 动机

当前 daemon 代码存在以下结构性问题：

1. **无集中式状态管理** — `Config`、`Client`、`WSConn` 各自为政，每个函数独立创建 `client.New()`，一个 `Run` 流程中创建了至少两个 HTTP 客户端
2. **职责混乱** — `ScanResult`（数据 struct）同时承担 `Print()`(UI) 和 `Upload()`(网络) 逻辑
3. **`Status` 命令有副作用** — 纯展示命令静默上传 runtimes 到服务器
4. **主循环设计错误** — `Run` 的 for 循环只发心跳不读 WebSocket，完全不接收服务器推送的任务事件
5. **`SendHeartbeat` 接收 ctx 但不使用** — 断连时可能永久阻塞
6. **硬编码遍布** — 心跳间隔 30s、命令超时 5s、轮询间隔 2s 全部写死

---

## 2. 命名统一

全部废弃 "Capabilities" 术语，统一使用 "Runtime"。

| 之前 | 之后 |
|------|------|
| `ScanCapabilities()` | `DetectRuntimes()` |
| `ScanResult` struct | 废弃，直接返回 `[]v1.Runtime` |
| `MachineChecks` map | `MachineInfo` |
| `PrintCapabilities()` | `PrintRuntimes()` |
| `countAvailable()` / `runtimeSummary()` | `Registry.Summary()` |

机检信息（os/arch/version/workdir）从 `Config` 直接取，不需要独立数据结构。

---

## 3. 新文件结构

```
重构前:
internal/daemon/app/
├── app.go           Run() 独立函数, client 临时创建, 主循环只发心跳
├── scan.go          ScanCapabilities(), ScanResult{}, ScanResult.Upload(), Status()
├── login.go         Login(), loginByToken(), loginByPairing()
├── runtime.go       Registry, Runtime interface

重构后:
internal/daemon/app/
├── daemon.go        Daemon struct, New(), Run(), eventLoop(), handleFrame()
├── detect.go        DetectRuntimes(), PrintRuntimes(), MachineInfo
├── login.go         Daemon.Login(), loginByToken(), loginByPairing()
├── runtime.go       Registry, Runtime interface + DetectAll(), Summary()
```

---

## 4. `Daemon` 结构体

```go
// Daemon 是本地守护进程的顶层抽象，集中管理配置、HTTP 客户端、
// WebSocket 连接和运行时注册表。
type Daemon struct {
    cfg         daemonconfig.Config
    client      *client.Client
    ws          *client.WSConn
    registry    *Registry
    lastRuntime []v1.Runtime    // 最近一次扫描到的运行时列表（供 heartbeat 等复用）
}
```

| 字段 | 初始化时机 | 生命周期 |
|------|-----------|---------|
| `cfg` | `New()` | 整个进程，Login 成功后更新 |
| `client` | `New()` | 整个进程，Login 时可能重建（token 场景） |
| `ws` | `Run()` 中 `ConnectWS` | 单次连接周期，reconnect 时替换 |
| `registry` | `New()` | 整个进程，不变 |
| `lastRuntime` | `DetectRuntimes()` 调用时 | 每次扫描后更新，heartbeat 直接读取避免重复扫描 |

### 初始化

```go
func New(cfg daemonconfig.Config) *Daemon {
    return &Daemon{
        cfg:      cfg,
        client:   client.New(cfg.APIURL, cfg.Token),
        registry: DefaultRegistry(),
    }
}
```

---

## 5. CLI 层适配

```go
// 之前:
app.Run(ctx, daemonconfig.Load())
app.Login(ctx, daemonconfig.Load(), token, name)
app.Status(ctx, daemonconfig.Load())

// 之后:
d := app.New(daemonconfig.Load())
d.Run(ctx)
d.Login(ctx, token, name)
d.Status(ctx)
```

---

## 6. `DetectRuntimes` — 替代 `ScanCapabilities`

```go
type MachineInfo struct {
    OS            string
    Arch          string
    DaemonVersion string
    GitVersion    string
    WorkDir       string
}

// DetectRuntimes 扫描当前机器环境
func (d *Daemon) DetectRuntimes() (MachineInfo, []v1.Runtime) {
    info := MachineInfo{
        OS:            d.cfg.OS(),
        Arch:          d.cfg.Arch(),
        DaemonVersion: d.cfg.DaemonVersion,
        GitVersion:    d.detectGit(),
        WorkDir:       d.ensureWorkDir(),
    }
    runtimes := d.registry.DetectAll(d.pathDirs())
    return info, runtimes
}

// PrintRuntimes 格式化输出到 stdout
func PrintRuntimes(info MachineInfo, runtimes []v1.Runtime) {
    // 纯函数，只输出，无副作用
}

// Status 只扫描 + 打印，绝不 upload
func (d *Daemon) Status(ctx context.Context) error {
    info, runtimes := d.DetectRuntimes()
    PrintRuntimes(info, runtimes)
    return nil
}
```

**关键变更：`Status()` 不再调用 `Upload()`**。用户执行 `gitsquad daemon status` 得到只读输出，没有任何网络副作用。

---

## 7. `Registry` 增强

```go
// DetectAll 对 PATH 目录执行所有已注册运行时的检测
func (r *Registry) DetectAll(paths []string) []v1.Runtime {
    var result []v1.Runtime
    for _, rt := range r.items {
        if detected := rt.Detect(paths); detected != nil {
            result = append(result, *detected)
        }
    }
    return result
}
```

Heartbeat 所需的 `RuntimeSummary` 直接从 `d.lastRuntime` 构建，不重新扫描：

```go
func runtimeSummary(runtimes []v1.Runtime) map[string]string {
    m := make(map[string]string, len(runtimes))
    for _, rt := range runtimes {
        m[rt.Kind] = rt.Version
    }
    return m
}
```

---

## 8. `Login` 重构

```go
func (d *Daemon) Login(ctx context.Context, token string, name string) error {
    if name != "" {
        d.cfg.DaemonName = name
    }

    if token != "" {
        return d.loginByToken(ctx, token)
    }
    return d.loginByPairing(ctx)
}

func (d *Daemon) loginByToken(ctx context.Context, token string) error {
    // Token 模式：需要带 token 创建 client，这是唯一合理的重建场景
    d.client = client.New(d.cfg.APIURL, token)

    resp, _, err := d.client.Auth(ctx, v1.DaemonAuthRequest{
        MachineName:   d.cfg.DaemonName,
        OS:            d.cfg.OS(),
        Arch:          d.cfg.Arch(),
        DaemonVersion: d.cfg.DaemonVersion,
        Mode:          "token",
    })
    if err != nil {
        return fmt.Errorf("token auth failed: %w", err)
    }
    return d.saveIdentity(resp.DaemonID, token)
}

func (d *Daemon) loginByPairing(ctx context.Context) error {
    // 配对模式：用空 token 创建 client
    d.client = client.New(d.cfg.APIURL, "")

    _, pairResp, err := d.client.Auth(ctx, v1.DaemonAuthRequest{
        MachineName:   d.cfg.DaemonName,
        OS:            d.cfg.OS(),
        Arch:          d.cfg.Arch(),
        DaemonVersion: d.cfg.DaemonVersion,
        Mode:          "pairing",
    })
    // ... 轮询等待确认 ...

    return d.saveIdentity(pr.DaemonID, pr.Token)
}

func (d *Daemon) saveIdentity(id, token string) error {
    d.cfg.ID = id
    d.cfg.Token = token
    return d.cfg.Save()
}
```

---

## 9. `Run` 重构 — 事件驱动主循环

### 之前：只发心跳，不读帧

```go
for {
    select {
    case <-ctx.Done():
        return nil
    case <-ticker.C:
        ws.SendHeartbeat(ctx, ...)
    }
}
```

### 之后：事件驱动循环

```go
func (d *Daemon) Run(ctx context.Context) error {
    if d.cfg.Token == "" || d.cfg.ID == "" {
        return fmt.Errorf("not logged in")
    }

    // 建立 WebSocket
    ws, err := d.client.ConnectWS(ctx, d.cfg.ID)
    if err != nil {
        return fmt.Errorf("connect: %w", err)
    }
    defer ws.Close()
    d.ws = ws

    // 检测 runtimes 并上传（复用 d.client）
    _, runtimes := d.DetectRuntimes()
    d.lastRuntime = runtimes
    if err := d.client.PutRuntimes(ctx, d.cfg.ID, runtimes); err != nil {
        slog.Warn("upload runtimes failed", "error", err)
    }

    // 进入事件循环
    return d.eventLoop(ctx)
}

func (d *Daemon) eventLoop(ctx context.Context) error {
    heartbeatTicker := time.NewTicker(d.cfg.HeartbeatInterval)
    defer heartbeatTicker.Stop()

    frames := make(chan v1.Frame, 8)
    errs := make(chan error, 1)
    go d.readFrames(ctx, frames, errs)

    for {
        select {
        case <-ctx.Done():
            return nil

        case <-heartbeatTicker.C:
            d.sendHeartbeat(ctx)

        case f := <-frames:
            d.handleFrame(ctx, f)

        case err := <-errs:
            slog.Error("websocket read error", "error", err)
            // TODO: reconnect
            return err
        }
    }
}

func (d *Daemon) readFrames(ctx context.Context, frames chan<- v1.Frame, errs chan<- error) {
    for {
        f, err := d.ws.ReadFrame()
        if err != nil {
            errs <- err
            return
        }
        select {
        case frames <- f:
        case <-ctx.Done():
            return
        }
    }
}

func (d *Daemon) handleFrame(ctx context.Context, f v1.Frame) {
    switch f.Type {
    case v1.FrameTypeHeartbeatAck:
        // 心跳 ACK，服务端确认存活

    case "task":
        // 未来：服务器分发任务
        // d.executeTask(ctx, f.Payload)

    default:
        slog.Warn("unknown frame type", "type", f.Type)
    }
}
```

**关键变化：**

| 之前 | 之后 |
|------|------|
| 主循环只发心跳 | 主循环同时读帧、处理任务、发心跳 |
| `ReadFrame()` 从未在循环中使用 | 独立 goroutine 持续读帧，通过 channel 传入 |
| 没有帧分发机制 | `handleFrame` 按帧类型路由 |
| `ctx` 传了不用 | ctx 取消时 `readFrames` 和主循环都退出 |

---

## 10. 剩余修复

### 10.1 `SendHeartbeat` 的 ctx 生效

```go
func (ws *WSConn) SendHeartbeat(ctx context.Context, payload any) error {
    if deadline, ok := ctx.Deadline(); ok {
        ws.conn.SetWriteDeadline(deadline)
    }
    b, _ := json.Marshal(payload)
    return ws.WriteFrame(v1.Frame{Type: v1.FrameTypeHeartbeat, Payload: b})
}
```

### 10.2 HTTP Client 超时

```go
func New(baseURL, token string) *Client {
    return &Client{
        BaseURL:    strings.TrimRight(baseURL, "/"),
        Token:      token,
        HTTPClient: &http.Client{Timeout: 10 * time.Second},
    }
}
```

### 10.3 硬编码常量配置化

```go
type Config struct {
    // 现有字段 ...
    HeartbeatInterval time.Duration // 默认 30s
    VersionCmdTimeout  time.Duration // 默认 5s
    PollInterval       time.Duration // 默认 2s
}
```

### 10.4 Reconnect 预留

```go
case err := <-errs:
    slog.Error("websocket disconnected", "error", err)
    ws, reconnectErr := d.reconnect(ctx)
    if reconnectErr != nil {
        return reconnectErr
    }
    d.ws = ws
    go d.readFrames(ctx, frames, errs)
```

首次 `reconnect` 返回 `ErrNotImplemented`。

### 10.5 优雅关闭

```go
func (d *Daemon) Run(ctx context.Context) error {
    err := d.eventLoop(ctx)
    // 退出前做一次离线上报（后续实现）
    d.ws.Close()
    return err
}
```

---

## 11. 影响范围

### 修改文件

| 文件 | 变化 |
|------|------|
| `internal/daemon/app/daemon.go` | **新建** — `Daemon` struct, `New()`, `Run()`, `eventLoop()`, `handleFrame()` |
| `internal/daemon/app/detect.go` | **新建** — `DetectRuntimes()`, `PrintRuntimes()`, `MachineInfo` |
| `internal/daemon/app/scan.go` | **删除** — 逻辑迁移到 `detect.go`，`ScanResult` 废弃 |
| `internal/daemon/app/login.go` | **重写** — 改为 `Daemon` 方法 |
| `internal/daemon/app/app.go` | **删除** — 逻辑迁移到 `daemon.go` |
| `internal/daemon/app/runtime.go` | **修改** — 增加 `DetectAll()` |
| `internal/daemon/client/client.go` | **修改** — 添加 `Timeout` |
| `internal/daemon/client/ws.go` | **修改** — `SendHeartbeat` 使用 ctx deadline |
| `internal/daemon/config/config.go` | **修改** — 添加 duration 字段 |
| `cmd/gitsquad/daemon_run.go` | **修改** — `app.New(cfg).Run(ctx)` |
| `cmd/gitsquad/daemon_login.go` | **修改** — `app.New(cfg).Login(ctx, token, name)` |
| `cmd/gitsquad/daemon_status.go` | **修改** — `app.New(cfg).Status(ctx)` |

### 不变文件

- `pkg/types/v1/*` — 类型定义不受影响
- `internal/server/*` — 服务端代码不变
- `internal/daemon/app/runtime_claude.go` / `runtime_codex.go` — 实现不变

---

## 12. 测试策略

1. `Daemon.New()` 创建后各字段非 nil
2. `Registry.DetectAll()` 能检测到注册的 mock Runtime
3. `DetectRuntimes()` 返回合法的 `MachineInfo` 和 `[]Runtime`
4. `Status()` 不产生任何网络调用
5. `eventLoop` 在 ctx 取消时正常退出
6. `handleFrame` 对未知帧类型不 panic
7. `Login` token 模式正确保存 config
