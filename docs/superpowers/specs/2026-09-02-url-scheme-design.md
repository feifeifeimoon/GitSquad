# URL 方案重构设计（workspace slug + issue key，去掉 console/UUID）

> **Status:** Draft
> **Date:** 2026-09-02
> **Scope:** 前端路由 + 后端解析器 + 数据模型（workspace 加 slug）
> **参考实现:** Multica（`/d/odyssey/multica`，`[workspaceSlug]/(dashboard)` 路由 + slug/key 解析 + 保留字机制）

## 背景与目标

当前 URL 有两个 UUID，不可读、不可记、不可分享：

```
/console/workspaces/3f2e9b1c-…-9c8a/issues/7b1a0d4e-…-d4e2
```

目标是改成 Multica/Linear 风格：URL 只放可读标识，UUID 一律不出现。

## 一、Multica 是怎么做的（对齐依据）

直接读 `D:\odyssey\multica` 源码确认的结论：

1. **路由结构**：`apps/web/app/[workspaceSlug]/(dashboard)/…`，workspace slug 在根级动态段；`(landing)`、`(auth)`、`(dashboard)` 都是路由组（不产生 URL 段）。
2. **workspace 用 slug**：`db.Workspace` 有真实 `slug` 列（创建时用户提供，校验 `^[a-z0-9]+(?:-[a-z0-9]+)*$`），解析在 `middleware/workspace.go` 用 `GetWorkspaceBySlug` 把 slug 换成 UUID，handler 全程用 UUID。
3. **issue 用 `前缀-序号`**：`issue.go` 里 `identifier := issuePrefix + "-" + number`（如 `MUL-12`），解析走 `resolveIssueByIdentifier` → `splitIdentifier`（取最后一个 `-` 切成 prefix/number）→ `GetIssueByNumber`。
4. **向后兼容 UUID**：handler 先 `ParseUUID`，失败再按 `PREFIX-NUMBER` 解析；前端 analytics 注释明确「`/acme/issues/8d5c…` 和 `/acme/issues/MUL-12` 收敛为同一个东西」——即 URL 里 UUID 和 key 都接受。
5. **保留字黑名单**：`reserved_slugs.json` 单一数据源，Go 端 `//go:embed` 嵌入、TS 端 `packages/core/paths/reserved-slugs.ts` 由生成器再生成，CI 校验不漂移。
6. **路径集中管理**：`packages/core/paths/paths.ts` 提供 `workspace(slug).issueDetail(id)` 这类统一 builder + `isGlobalPath()`，路由形状改动只改一个文件。

结论：**Multica 不是「不用 UUID」，而是「URL 不用 UUID，内部仍用 UUID 做主键，slug/key 在解析层换回 UUID」**。GitSquad 要对齐的是前半句。

## 二、目标 URL 方案

| 场景 | 现在 | 目标 |
|---|---|---|
| 工作区列表 | `/console/workspaces` | `/workspaces` |
| 工作区看板 | `/console/workspaces/{uuid}` | `/{slug}` |
| Issue 详情 | `/console/workspaces/{uuid}/issues/{issue-uuid}` | `/{slug}/issues/{key}` |
| 工作区设置 | `/console/workspaces/{uuid}/settings` | `/{slug}/settings` |
| 新建工作区 | `/console/workspaces/new` | `/workspaces/new` |
| 守护进程 | `/console/daemons` | `/daemons` |
| 全局设置 | `/console/settings` | `/settings` |
| 登录 / 回调 / 配对 | `/login` `/auth/callback` `/daemon/auth` | 不变 |

示例：`/gitsquad/issues/GTS-42`。

关键点：`console` 段去掉后，`/{slug}` 提到根级，必须处理根级静态路由冲突（见「保留字」）。

## 三、数据模型

`workspaces` 新增一列（UUID 主键保持不变）：

```sql
ALTER TABLE workspaces
    ADD COLUMN slug TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_user_slug
    ON workspaces(user_id, slug) WHERE slug <> '';
```

- `slug` 是**外部标识**：小写字母数字 + 连字符，per-user 唯一，可从 name 派生、后续可改名（带 301）。
- `id`（UUID）仍是**内部主键**：join、外键、API 引用都不动。
- issue 侧**零改动**：`issues` 已有 `number` + `workspaces.issue_prefix`，`issue_key = prefix-number` 已经存在（`service/issue.go` 的 `issueKey()`），直接用于 URL。

### slug 派生（沿用现有 `deriveIssuePrefix` 风格）

```go
var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

// deriveSlug 归一化名字为 slug；名字不含任何字母/数字时返回空串，
// 由创建流程判为非法名（不静默回退到占位值）。
func deriveSlug(name string) string {
    return strings.Trim(slugRe.ReplaceAllString(strings.ToLower(name), "-"), "-")
}
```

- **`name` 就是 slug**：创建流程只收 `name`，`slug = deriveSlug(name)`，无独立 slug 输入字段。改名后 slug 随之变化（改名/重定向留待阶段 2）。
- **冲突明确报错、不追加后缀**：创建时若 `GetWorkspaceBySlug(userID, slug)` 命中，返回 `service.ErrWorkspaceSlugTaken`，handler 按现有错误约定映射为 `http.StatusBadRequest` + `v1.ErrorResponse("workspace slug already exists")`（信封字段是 `message`），前端提示「URL 已被占用，请换一个名称」，**不做 `-2`/`-3`**。
- 唯一索引是并发下的最后兜底：并发抢注触发唯一性冲突时，同样映射为 `ErrWorkspaceSlugTaken`（同一错误，不自动改 slug）。

> 与 Multica 的差异：Multica 创建时用户显式填 slug（name 与 slug 两个字段）；GitSquad 只收 `name`，slug 由 name 派生，`name` 就是 URL 里的 slug。显式 slug 输入/独立改名作为后续增强。

## 四、后端设计

### 4.1 迁移（`internal/server/database/migration.go` + `internal/server/store/schema.sql`）

**存量数据不管，直接重建库**——所以不需要回填迁移，把列加进建表语句即可（两处同步）：

- `schema.sql`：`workspaces` 建表语句加 `slug TEXT NOT NULL DEFAULT ''`，并加 `CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_user_slug ON workspaces(user_id, slug) WHERE slug <> ''`（sqlc 据此生成 `db.Workspace` 的 `Slug` 字段）。
- `migration.go`：在 `010_create_workspaces` 的 `CREATE TABLE IF NOT EXISTS workspaces` 里同样加 `slug` 列 + 该唯一索引。若不想动 `010`，等价地追加一条 `017_workspace_slug`：`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS slug TEXT NOT NULL DEFAULT ''` + 索引，**无回填**。

### 4.2 sqlc 查询（`internal/server/store/queries/*.sql`）

`workspaces.sql`：

```sql
-- name: GetWorkspaceBySlug :one
SELECT * FROM workspaces WHERE user_id = $1 AND slug = $2 AND status != 'archived';
```

`issues.sql`：

```sql
-- name: GetIssueByNumber :one
SELECT i.*, w.issue_prefix AS issue_prefix, COALESCE(u.login, '') AS creator_name,
       (SELECT count(*) FROM issue_comments c WHERE c.issue_id = i.id) AS comments_count
FROM issues i
JOIN workspaces w ON w.id = i.workspace_id
LEFT JOIN users u ON u.id = i.creator_user_id
WHERE i.workspace_id = $1 AND i.number = $2;
```

同时给 `ListWorkspacesWithRepo` 的 SELECT 补 `w.slug`（它是手写列名，`SELECT *` 的自动带）。跑 `sqlc generate`（根目录，`sqlc.yaml`）。

### 4.3 服务层（`internal/server/service/workspace.go`）

```go
// ResolveWorkspace 接受 UUID 或 slug，按 userID 范围解析，返回 UUID 主键的 workspace。
func (s *WorkspaceService) ResolveWorkspace(ctx context.Context, userID uuid.UUID, ref string) (*db.Workspace, error)
```

逻辑：`uuid.Parse(ref)` 成功 → `GetWorkspace(id)`；否则 → `GetWorkspaceBySlug(userID, ref)`。归属校验（`workspace.UserID == user.ID`）由调用方保留。

### 4.4 handler 层（重点，含一个 panic 隐患）

**`handler/workspace.go` 的 `Get`**：`uuid.Parse(c.Param("id"))` → 改 `ResolveWorkspace(ctx, user.ID, c.Param("id"))`，后面的归属校验不变。

**`handler/issue.go`**——两处，且第二处是坑：

1. `requireWorkspaceOwner` 现在返回 `bool`，通过后各 handler 直接 `uuid.MustParse(c.Param("id"))`。一旦 `:id` 是 slug，`MustParse` 会 **panic**。改为返回 `(*db.Workspace, bool)`（解析 + 归属校验），后续 `Create/List/Get/Update/AddComment` 里的 `uuid.MustParse` 全部换成返回的 `workspace.ID`。
2. `:issueId` 解析（`Get`/`Update`/`AddComment`）：先 `uuid.Parse` 成功 → 原 `GetIssue`；否则按 `splitIdentifier`（取最后一个 `-`，前段 prefix、后段 number）→ `GetIssueByNumber(workspace.ID, number)`。对齐 Multica，只接受 UUID 或 `PREFIX-NUMBER`，不接受裸数字。

`handler/routes.go` 的路径本身**不用改**（`/api/v1/workspaces/:id/issues/:issueId` 保持不变），`:id`/`:issueId` 的解析在 handler 内变宽松即可——这样 API 契约不变，旧调用方无感。

### 4.5 保留字（slug 黑名单）

新建 `handler/workspace.go` 内一个 `reservedSlugs` 集合（`map[string]bool`）。GitSquad 路由少，用**内联 Go slice + TS 数组**即可，不引入 Multica 的 JSON + codegen 机制（列表小，避免过度设计）。

`CreateWorkspace` 的完整校验顺序（`name` 为唯一输入）：

1. `slug := deriveSlug(name)`；若为空（名字不含任何字母/数字）→ 返回 `service.ErrInvalidWorkspaceName`（400，明确报错不静默回退）；
2. `isReservedSlug(slug)` → 400（`v1.ErrorResponse("workspace slug is reserved")`，提示换名）；
3. `GetWorkspaceBySlug(userID, slug)` 命中 → 返回 `service.ErrWorkspaceSlugTaken`；
4. INSERT；捕获唯一性冲突（并发抢注）→ 同样映射 `ErrWorkspaceSlugTaken`，**不自动改 slug**。

服务层新增两个错误（沿用 `ErrInstallationMismatch`/`ErrRepoMismatch` 的模式）：

- `var ErrWorkspaceSlugTaken = errors.New("workspace slug already exists")`
- `var ErrInvalidWorkspaceName = errors.New("workspace name must contain at least one letter or number")`

handler `Create` 的 `switch` 里加对应两个 case（均 `http.StatusBadRequest` + `v1.ErrorResponse`）：`ErrInvalidWorkspaceName` 与 `ErrWorkspaceSlugTaken`。

保留字（根级第一段冲突 + 框架/前瞻）：

```
login, auth, daemon, daemons, workspaces, settings, new, api, _next, _vercel,
favicon.ico, manifest, robots.txt, sitemap.xml, icons,
home, homepage, dashboard, docs, about, pricing, changelog, blog, help, support,
status, admin, account, profile, billing, www
```

### 4.6 响应 JSON 补 `slug`

- `GetWorkspace`/`GetWorkspaceBySlug` 走 `SELECT *`，`slug` 自动带出（sqlc 重新生成后 `db.Workspace` 多 `Slug` 字段）。
- `ListWorkspaces` 走手写 `WorkspaceWithRepo`（`service/workspace.go`），结构体加 `Slug string json:"slug"`，映射循环补 `Slug: row.Slug`（配合 4.2 给 `ListWorkspacesWithRepo` 加的 `w.slug`）。

## 五、前端设计

### 5.1 路由组重构（`web/app/`）

```
app/
  (marketing)/page.tsx                     → /（营销首页，无外壳）
  (auth)/
    login/page.tsx
    auth/callback/page.tsx
    daemon/auth/page.tsx
  (app)/                                   → 路由组：共享侧边栏 + 登录校验，URL 不变
    layout.tsx                             ← 原 console/layout.tsx 挪来并改造
    workspaces/page.tsx
    workspaces/new/page.tsx
    workspaces/new/configure/page.tsx
    daemons/page.tsx
    settings/page.tsx
    [slug]/page.tsx                        ← 工作区看板（原 workspaces/[id]/page.tsx）
    [slug]/settings/page.tsx
    [slug]/issues/[issueKey]/page.tsx      ← Issue 详情（原 [id]/issues/[issueId]/page.tsx）
```

### 5.2 路径集中管理（`web/lib/paths.ts`，新增）

对齐 Multica 的 `packages/core/paths/paths.ts`，把散落各处的 `router.push("/console/workspaces/${id}")` 收敛：

```ts
export const paths = {
  workspaces: () => "/workspaces",
  newWorkspace: () => "/workspaces/new",
  daemons: () => "/daemons",
  settings: () => "/settings",
  workspace: (slug: string) => ({
    board: () => `/${encodeURIComponent(slug)}`,
    settings: () => `/${encodeURIComponent(slug)}/settings`,
    issue: (key: string) => `/${encodeURIComponent(slug)}/issues/${encodeURIComponent(key)}`,
  }),
};
export const RESERVED_SLUGS = new Set([...]); // 与后端保持一致
```

所有 `router.push`/`href` 改走 `paths`，路由形状将来再变只改这一个文件。

### 5.3 外壳 layout（`(app)/layout.tsx`）

- 原来的 `wsMatch = pathname.match(/^\/console\/workspaces\/([^/]+)/)` 改为取根级第一段：`const first = pathname.split("/")[1]`，若 `first && !RESERVED_SLUGS.has(first)` 则视为 slug，按 slug 调 `GET /api/v1/workspaces/{slug}` 加载 workspace（供切换器/设置链接用）。
- 侧边栏「Workspaces / Daemons / Settings」导航项路径改为 `/workspaces` `/daemons` `/settings`；「Settings」有 workspace 上下文时 → `/{slug}/settings`，否则 `/settings`。
- 登录后落点：`/` 仍是营销页，登录成功重定向 `/workspaces`（可选优化：重定向到最后访问的 workspace）。

### 5.4 API 类型（`web/lib/api.ts`）

- `Workspace` 类型加 `slug: string`。
- `issueApi` 的 `get/update/addComment` 改为按 slug + `issue_key` 调 `/api/v1/workspaces/{slug}/issues/{key}`（后端 `:id`/`:issueId` 已兼容）。
- 看板卡片 / 表格 / 切换器的 `onOpen` 用 `workspace.slug` 拼 URL；issue 详情跳转用 `issue.issue_key`。
- 创建表单（`workspaces/new` + `configure`）：`name` 即 slug，输入框下实时预览派生 URL（如 `/acme-agent`）；提交后捕获冲突错误（`fetchAPI` 已按 `body.message` 解包）映射为 toast「URL 已被占用，请换一个名称」，不自动改值。

## 六、兼容与迁移（分阶段）

1. **本设计（阶段 1）**：后端 `:id`/`:issueId` 同时接受 UUID 与 slug/key；前端只发新 URL。旧书签/外链命中 UUID 依旧 200（不强制 301，Multica 同款），不破。
2. **阶段 2（可选）**：workspace 改名 + 显式 slug 编辑 + 旧 slug 重定向表。
3. **阶段 3（可选）**：公开分享时 slug 唯一性从 per-user 提升为全局，URL 再引入用户/团队命名空间。

## 七、边界情况

- **slug 碰撞**：创建时返回 `ErrWorkspaceSlugTaken`（400，不追加 `-2`/`-3`）；唯一索引兜底并发。无存量数据回填（直接重建库）。
- **保留字**：创建时拒绝；派生结果命中保留字时同样拒绝（提示改名）。
- **大小写/Unicode 名**：派生统一 lowercase，非 `[a-z0-9]` 转 `-`；纯非字母/数字名（slug 为空）→ 400 `ErrInvalidWorkspaceName`，不回退占位值。
- **issue 键解析**：只接受 `UUID` 或 `PREFIX-NUMBER`；裸数字、空 number、非法数字 → 404（对齐 Multica `splitIdentifier`）。
- **slug 改名后旧链接**：阶段 2 引入 slug→新 slug 重定向表前，旧 slug 404（可接受，先记录）。

## 八、测试

- **后端**：`deriveSlug`（常规名 / 纯非字母返回空串 / 边界字符 / 保留字）；`ResolveWorkspace`（UUID 命中、slug 命中、slug 不存在、跨用户 slug 隔离）；issue ref 解析（UUID / `GTS-42` / 裸数字 404 / 非法 number）；`CreateWorkspace` 空 slug 返回 `ErrInvalidWorkspaceName`、冲突返回 `ErrWorkspaceSlugTaken`（均 400，不追加 `-2`/`-3`）+ 保留字拒绝。沿用现有 `internal/server/service/*_test.go` 组织方式。
- **前端**：`lib/paths.ts` 输出与 `RESERVED_SLUGS` 一致性；`(app)/layout.tsx` 的 slug 识别（系统路由 vs workspace）。`bun test` / `bun run lint` / `bunx tsc --noEmit` / `bun run build` 全绿。

## 范围外

- 不改 marketing / auth / daemon 认证流程页面内容，只做目录归组。
- 不做显式 slug 输入、改名、重定向表（阶段 2/3）。
- 不引入 Multica 的 reserved_slugs.json + codegen 机制（当前保留字列表小，内联即可）。
- 不迁移 API 契约（`/api/v1/...` 路径不变，仅解析变宽松）。
