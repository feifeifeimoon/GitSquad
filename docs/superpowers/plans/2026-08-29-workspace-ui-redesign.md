# Workspace UI 优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 workspace 列表页改成 Vercel 式数据表(搜索 + 排序),详情页改成 Header + Tab,并修复 DESIGN.md 合规问题。

**Architecture:** 在既有 Vercel 设计语言 token 体系内重做 `web/app/console/workspaces` 两个页面。新增 `StatusBadge` 组件和 workspace 详情共享 layout;不引入新视觉风格、不引入 radix tabs(导航 tab 用手写 nav,因为 Overview/Issues 是路由跳转)。

**Tech Stack:** Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui(radix-ui)+ lucide-react;bun(test/lint)

**设计文档:** `docs/superpowers/specs/2026-08-29-workspace-ui-redesign.md`

## Global Constraints

- 字重上限 600:UI 内禁止 `font-bold`(700),一律 `font-semibold` / `font-medium`
- 字号刻度:禁止 `text-[10px]` / `text-[13px]` 等任意值;用 12px `text-xs`(caption)/ 14px `text-sm`(body-sm)
- 计数 / repo 全名 / 日期等技术字段用 `font-mono` + `tabular-nums`
- 状态徽章走 `StatusBadge`,禁止硬编码 hex(如 `bg-[#0070f3]`)
- 空状态:canvas-soft 圆角居中 + 图标(低透明)+ 文案 + CTA,不用虚线框
- in-app 按钮 rounded-sm 6px(用 `<Button>` 默认,不变)
- 表格手写 `<table>` + Tailwind,不引 shadcn table
- 导航 tab 用手写 nav(active 用 `border-b-2 border-ink`),不引 radix tabs;tab 不带计数(避免 layout 重复拉取)
- 响应统一 `v1.SuccessResponse` 信封,前端 `lib/api.ts` 的 `fetchAPI` 自动解包
- 验证:`bun test` / `bun run lint` / `bunx tsc --noEmit` / `bun run build` 全绿

---

### Task 1: 令牌补充 + StatusBadge 组件

**Files:**
- Modify: `web/app/globals.css`(补充 DESIGN.md 语义令牌映射)
- Create: `web/components/ui/status-badge.tsx`

**Interfaces:**
- Produces: `StatusBadge` 组件,签名 `({ status, className }: { status: string; className?: string })`;三态 `active` / `degraded` / `archived`,未知状态回退 `active`。同时让 Tailwind 生成 `bg-link-bg-soft`、`text-warning-deep` 工具类。

- [ ] **Step 1: 在 globals.css 补充令牌**

在 `web/app/globals.css` 的 `@theme inline { ... }` 块内,`--color-warning-soft: var(--warning-soft);` 之后新增两行:

```css
  --color-link-bg-soft: var(--link-bg-soft);
  --color-warning-deep: var(--warning-deep);
```

在 `:root { ... }` 块内,`--warning-soft: #ffefcf;` 之后新增两行:

```css
  --link-bg-soft: #d3e5ff;
  --warning-deep: #ab570a;
```

- [ ] **Step 2: 创建 StatusBadge**

创建 `web/components/ui/status-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";

const STATUS: Record<string, { dot: string; label: string; className: string }> = {
  active: { dot: "bg-mute", label: "Active", className: "text-body" },
  degraded: { dot: "bg-warning", label: "Degraded", className: "text-warning-deep" },
  archived: { dot: "bg-mute", label: "Archived", className: "text-mute" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const s = STATUS[status] ?? STATUS.active;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        s.className,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
```

- [ ] **Step 3: 验证构建**

```bash
cd /d/odyssey/GitSquad/web && bunx tsc --noEmit
```
预期:无输出、退出码 0。

- [ ] **Step 4: 提交**

```bash
git add web/app/globals.css web/components/ui/status-badge.tsx
git commit -m "feat(web): add StatusBadge and DESIGN.md semantic tokens"
```

---

### Task 2: Workspace 列表页改数据表

**Files:**
- Modify: `web/lib/api.ts`(导出共享 `Workspace` 类型)
- Rewrite: `web/app/console/workspaces/page.tsx`

**Interfaces:**
- Consumes: `StatusBadge`(Task 1)
- Produces: 从 `lib/api.ts` 导出 `interface Workspace { id: string; name: string; status: string; repo_full_name: string; repo_owner: string; repo_name: string; repo_private: boolean; created_at: string }`(Task 3 layout 也消费)

- [ ] **Step 1: 在 lib/api.ts 导出 Workspace 类型**

在 `web/lib/api.ts` 末尾追加:

```ts
// ── Workspaces ─────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  status: string;
  repo_full_name: string;
  repo_owner: string;
  repo_name: string;
  repo_private: boolean;
  created_at: string;
}
```

- [ ] **Step 2: 重写列表页**

用以下完整内容覆盖 `web/app/console/workspaces/page.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Lock,
  Plus,
  Search,
} from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";

type SortField = "name" | "created_at";
type SortDir = "asc" | "desc";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function WorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    api
      .get<Workspace[]>("/api/v1/workspaces")
      .then((data) => setWorkspaces(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleArchive = async (id: string) => {
    try {
      await api.delete(`/api/v1/workspaces/${id}`);
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    } catch {
      // ignore
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = workspaces.filter((w) => {
      if (!q) return true;
      const repo = w.repo_full_name || `${w.repo_owner}/${w.repo_name}`;
      return w.name.toLowerCase().includes(q) || repo.toLowerCase().includes(q);
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortField === "name") return a.name.localeCompare(b.name) * dir;
      return (Date.parse(a.created_at) - Date.parse(b.created_at)) * dir;
    });
  }, [workspaces, search, sortField, sortDir]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="size-3" />
    ) : (
      <ChevronDown className="size-3" />
    );
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-8 pt-8">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium text-ink">Workspaces</h1>
          <span className="font-mono text-xs tabular-nums text-mute">
            {workspaces.length}
          </span>
        </div>
        <Button onClick={() => router.push("/console/workspaces/new")}>
          <Plus className="size-4" />
          New Workspace
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center pb-16">
          <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-canvas-soft">
            <Plus className="size-6 text-mute" />
          </div>
          <p className="text-sm font-medium text-ink">No workspaces yet</p>
          <p className="mt-1 max-w-xs text-center text-sm text-body">
            Link a GitHub repository and configure your agent team to get started.
          </p>
          <Button
            onClick={() => router.push("/console/workspaces/new")}
            className="mt-4"
          >
            Create your first Workspace
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center px-8 py-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-mute" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workspaces…"
                className="h-8 w-64 pl-8"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto px-8 pb-8">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="py-2 pr-4">
                    <button
                      onClick={() => toggleSort("name")}
                      className="flex items-center gap-1 text-xs font-medium text-mute transition-colors hover:text-ink"
                    >
                      Name <SortIcon field="name" />
                    </button>
                  </th>
                  <th className="py-2 pr-4 text-xs font-medium text-mute">Repository</th>
                  <th className="py-2 pr-4 text-xs font-medium text-mute">Status</th>
                  <th className="py-2 pr-4">
                    <button
                      onClick={() => toggleSort("created_at")}
                      className="flex items-center gap-1 text-xs font-medium text-mute transition-colors hover:text-ink"
                    >
                      Created <SortIcon field="created_at" />
                    </button>
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {visible.map((w) => (
                  <tr
                    key={w.id}
                    onClick={() => router.push(`/console/workspaces/${w.id}`)}
                    className="group cursor-pointer border-b border-hairline transition-colors hover:bg-canvas-soft"
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary text-xs font-semibold text-white">
                          {w.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="truncate text-sm font-medium text-ink">
                          {w.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-xs text-body">
                          {w.repo_full_name || `${w.repo_owner}/${w.repo_name}`}
                        </span>
                        {w.repo_private && (
                          <Lock className="size-3 shrink-0 text-mute" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={w.status} />
                    </td>
                    <td className="py-3 font-mono text-xs tabular-nums text-body">
                      {timeAgo(w.created_at)}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchive(w.id);
                        }}
                        className="rounded-sm p-1.5 text-mute opacity-0 transition-all hover:bg-muted hover:text-ink group-hover:opacity-100"
                        title="Archive workspace"
                      >
                        <Archive className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 && (
              <div className="py-12 text-center text-sm text-mute">
                No workspaces match your search.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 验证**

```bash
cd /d/odyssey/GitSquad/web && bun run lint && bunx tsc --noEmit
```
预期:无错误。

- [ ] **Step 4: 提交**

```bash
git add web/lib/api.ts "web/app/console/workspaces/page.tsx"
git commit -m "feat(web): workspace list as searchable sortable data table"
```

---

### Task 3: 详情页共享 layout(Header + Tab 导航)

**Files:**
- Create: `web/app/console/workspaces/[id]/layout.tsx`

**Interfaces:**
- Consumes: `Workspace` 类型(Task 2)、`StatusBadge`(Task 1)、`usePathname` / `useParams`(Next)
- Produces: workspace 详情 header + tab 导航;子页面(`page.tsx` = Overview、`issues/page.tsx` = 看板)渲染其下

- [ ] **Step 1: 创建 layout**

创建 `web/app/console/workspaces/[id]/layout.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export default function WorkspaceDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { id } = useParams<{ id: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    api
      .get<Workspace>(`/api/v1/workspaces/${id}`)
      .then(setWorkspace)
      .catch(() => router.push("/console/workspaces"));
  }, [id, router]);

  const repoFullName =
    workspace?.repo_full_name ||
    (workspace ? `${workspace.repo_owner}/${workspace.repo_name}` : "");
  const base = `/console/workspaces/${id}`;
  const tabs = [
    { href: base, label: "Overview", active: pathname === base },
    {
      href: `${base}/issues`,
      label: "Issues",
      active: pathname.startsWith(`${base}/issues`),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="px-8 pb-0 pt-6">
        <button
          onClick={() => router.push("/console/workspaces")}
          className="mb-3 flex items-center gap-1 text-xs text-mute transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          All workspaces
        </button>

        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary text-sm font-semibold text-white">
            {workspace?.name.slice(0, 2).toUpperCase() ?? ""}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-[-0.02em] text-ink">
              {workspace?.name}
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-body">
              <span className="truncate">{repoFullName}</span>
              {workspace?.repo_private && <Lock className="size-3 shrink-0 text-mute" />}
              <span className="text-mute">·</span>
              <span className="shrink-0">
                Created{" "}
                {new Date(workspace?.created_at ?? "").toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric", year: "numeric" },
                )}
              </span>
            </p>
          </div>
          <div className="ml-auto shrink-0">
            <StatusBadge status={workspace?.status ?? "active"} />
          </div>
        </div>

        <nav className="mt-4 flex gap-1 border-b border-hairline">
          {tabs.map((t) => (
            <button
              key={t.href}
              onClick={() => router.push(t.href)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                t.active
                  ? "border-ink font-medium text-ink"
                  : "border-transparent text-body hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: 验证**

```bash
cd /d/odyssey/GitSquad/web && bun run lint && bunx tsc --noEmit
```
预期:无错误。

- [ ] **Step 3: 提交**

```bash
git add "web/app/console/workspaces/[id]/layout.tsx"
git commit -m "feat(web): workspace detail header with Overview/Issues tabs"
```

---

### Task 4: Overview 页重构

**Files:**
- Rewrite: `web/app/console/workspaces/[id]/page.tsx`

**Interfaces:**
- Consumes: `Workspace`(Task 2)、`StatusBadge`(Task 1)、共享 layout(Task 3,通过 params 拿 id)

- [ ] **Step 1: 重写 Overview 页**

用以下完整内容覆盖 `web/app/console/workspaces/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { api, Workspace } from "@/lib/api";
import { StatusBadge } from "@/components/ui/status-badge";

export default function WorkspaceOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Workspace>(`/api/v1/workspaces/${id}`)
      .then(setWorkspace)
      .catch(() => router.push("/console/workspaces"))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading || !workspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const repoFullName =
    workspace.repo_full_name || `${workspace.repo_owner}/${workspace.repo_name}`;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="rounded-lg border border-hairline bg-canvas p-6 shadow-level-2">
        <h2 className="mb-4 text-sm font-medium text-ink">Overview</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-mute">Repository</dt>
            <dd className="mt-1 flex items-center gap-1.5 font-mono text-sm text-body">
              {repoFullName}
              {workspace.repo_private && <Lock className="size-3 text-mute" />}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-mute">Status</dt>
            <dd className="mt-1">
              <StatusBadge status={workspace.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-mute">Created</dt>
            <dd className="mt-1 font-mono text-sm text-body">
              {new Date(workspace.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证**

```bash
cd /d/odyssey/GitSquad/web && bun run lint && bunx tsc --noEmit
```
预期:无错误。

- [ ] **Step 3: 提交**

```bash
git add "web/app/console/workspaces/[id]/page.tsx"
git commit -m "feat(web): workspace overview tab content"
```

---

### Task 5: Issue 看板页头部轻改

**Files:**
- Modify: `web/app/console/workspaces/[id]/issues/page.tsx`(删冗余返回/标题,仅保留 New Issue 按钮)

**Interfaces:**
- Consumes: 共享 layout 已提供 header + tab;`Issue`/`issueApi`(既有)

- [ ] **Step 1: 删冗余 header**

在 `web/app/console/workspaces/[id]/issues/page.tsx` 中,把当前的 header 块:

```tsx
      <div className="flex items-center justify-between px-8 pt-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/console/workspaces/${id}`)}
            className="flex items-center gap-1 text-sm text-body transition-colors hover:text-ink"
          >
            <ChevronLeft className="size-4" />
            Workspace
          </button>
          <h1 className="text-xl font-semibold">Issues</h1>
        </div>
        <Dialog>
```

替换为:

```tsx
      <div className="flex items-center justify-between px-8 pb-4 pt-6">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-mute">
            {issues.length}
          </span>
        </div>
        <Dialog>
```

同时把顶部 import 中不再使用的 `ChevronLeft` 移除,即把:

```tsx
import { ChevronLeft, MessageSquare, Plus } from "lucide-react";
```

改为:

```tsx
import { MessageSquare, Plus } from "lucide-react";
```

- [ ] **Step 2: 验证**

```bash
cd /d/odyssey/GitSquad/web && bun run lint && bunx tsc --noEmit
```
预期:无错误(若 `router` 仍在别处使用则保留 `useRouter`;本页 `move`/`create` 未用 `router.push`,仅 `load` 的 catch 用了 `router.push`,故保留)。

- [ ] **Step 3: 提交**

```bash
git add "web/app/console/workspaces/[id]/issues/page.tsx"
git commit -m "feat(web): simplify issue board header under shared workspace layout"
```

---

### Task 6: 静态测试与全量验证

**Files:**
- Create: `web/lib/workspaces.test.mjs`
- Modify: `web/package.json`(test 脚本)

- [ ] **Step 1: 写静态测试**

创建 `web/lib/workspaces.test.mjs`:

```js
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const list = readFileSync(
  new URL("../app/console/workspaces/page.tsx", import.meta.url),
  "utf8",
);
const layout = readFileSync(
  new URL("../app/console/workspaces/[id]/layout.tsx", import.meta.url),
  "utf8",
);
const badge = readFileSync(
  new URL("../components/ui/status-badge.tsx", import.meta.url),
  "utf8",
);

test("workspace list is a searchable, sortable table", () => {
  assert.match(list, /Search/);
  assert.match(list, /Search workspaces/);
  assert.match(list, /toggleSort/);
  assert.match(list, /<table/);
  assert.match(list, /StatusBadge/);
  assert.doesNotMatch(list, /font-bold/);
  assert.doesNotMatch(list, /text-\[10px\]/);
});

test("workspace detail has header and tab navigation", () => {
  assert.match(layout, /All workspaces/);
  assert.match(layout, /StatusBadge/);
  assert.match(layout, /Overview/);
  assert.match(layout, /Issues/);
  assert.match(layout, /usePathname/);
});

test("status badge defines three states", () => {
  assert.match(badge, /active/);
  assert.match(badge, /degraded/);
  assert.match(badge, /archived/);
});
```

- [ ] **Step 2: 更新 test 脚本**

把 `web/package.json` 的 test 脚本改为:

```json
"test": "bun test app/page.test.mjs lib/issues.test.mjs lib/workspaces.test.mjs"
```

- [ ] **Step 3: 全量验证**

```bash
cd /d/odyssey/GitSquad/web && bun test && bun run lint && bunx tsc --noEmit && bun run build
```
预期:测试全过、lint 零警告、tsc 无错、build 通过。

- [ ] **Step 4: 提交**

```bash
git add web/lib/workspaces.test.mjs web/package.json
git commit -m "test(web): workspace list/detail static assertions"
```

---

## Self-Review 结果

- **Spec 覆盖**:合规修复(Task 1/2/4)、StatusBadge(Task 1)、数据表(Task 2)、Header+Tab(Task 3)、Overview(Task 4)、看板头部轻改(Task 5)、测试(Task 6)。✓
- **类型一致性**:`Workspace` 在 Task 2 定义,Task 3/4 复用;`StatusBadge` 签名在 Task 1 定义,Task 2/3/4 使用。✓
- **占位符**:无 TBD/TODO。✓
- **偏差说明**:导航 tab 用手写 nav(非 radix tabs)、tab 不带计数 —— 已在 Global Constraints 声明,属设计细化而非遗漏。✓
