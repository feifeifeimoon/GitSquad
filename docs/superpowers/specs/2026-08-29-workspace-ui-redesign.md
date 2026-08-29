# Workspace 列表与详情 UI 优化设计

> **Status:** Approved
> **Date:** 2026-08-29
> **Scope:** `web/app/console/workspaces` 列表页 + 详情页(header/tabs/overview)+ issue 看板页头部轻改 + DESIGN.md 合规修复
> **参考:** Vercel dashboard(数据表 + 项目 header + tab)、Multica projects 页(compact header / mono 计数 / 相对时间 / hover 操作)

## 背景

当前 workspace 列表是一列全宽大卡片,详情页是松散的卡片堆(repo / issues 入口 / details),整体观感像 CRUD demo。对照 DESIGN.md 还存在若干硬编码字号、700 字重、硬编码 hex、状态语义混乱等问题。本设计在既有 Vercel 设计语言 token 体系内重做这两页,不引入新视觉风格。

## 目标

1. 列表页改为 Vercel 式数据表(搜索 + 排序 + hover 操作)。
2. 详情页改为 Header + Tab(Overview / Issues)。
3. 修复 DESIGN.md 合规问题。
4. 保持 `bun test` / `bun run lint` / `tsc --noEmit` / `bun run build` 全绿。

## 一、DESIGN.md 合规修复

| 问题 | 修复 |
|---|---|
| `font-bold`(700)用于头像缩写 | 改 `font-semibold`(品牌字重上限 600) |
| `text-[10px]` / `text-[13px]` 任意字号 | 归一到 12px `caption` / 14px `body-sm` |
| 计数 / repo 全名 / 日期用 sans | 改 `font-mono` + `tabular-nums`(技术层 mono) |
| `bg-[#0070f3]/15 text-[#0070f3]` 硬编码 hex | 走 `text-link` / `link-bg-soft` 令牌 |
| 状态用 `warning` 语义混乱 | 抽成统一 `StatusBadge` 组件 |
| 空状态大虚线框 + 圆形图标 | 改 canvas-soft + 居中图标(30% 透明)+ 文案 + CTA |

已合规、保持不变:stacked shadow(level-2/3/5)、canvas/hairline 令牌、in-app 按钮 rounded-sm 6px、负字距标题、primary #171717 CTA、mono 字体加载。

## 二、新增共享组件

- `components/ui/status-badge.tsx`:圆点 + 标签,三态:
  - `active`:中性点(mute)+ `Active`(body)
  - `degraded`:warning 点 + `Degraded`(warning-deep / warning-soft)
  - `archived`:mute 点 + `Archived`(mute / muted)
- 详情页新增 shadcn `tabs`(radix;添加时禁止其覆盖 `button.tsx`)。
- 表格不引 shadcn table,直接手写 `<table>` + Tailwind(仅一处使用)。

## 三、Workspace 列表页(数据表)

布局:

```
Workspaces                          [ + New Workspace ]
[ 搜索框 (h-8, 按名称/repo 过滤) ]

Name                  Repository        Status      Created
● acme-agent          acme/api  🔒      ● Active    2d ago      ⋮(hover)
● docs-bot            acme/docs         ● Degraded  1w ago      ⋮
```

要点:
- 表头 Name / Repository / Status / Created;Name 与 Created 可点击排序(客户端排序,上下箭头指示)。
- 整行可点进详情;hover 显示 kebab(归档),`opacity-0 → group-hover:opacity-100`。
- Name 列:24px 圆角 monogram(`font-semibold`)+ 名称 `body-sm-strong`;Repository 列带 private 锁图标;Created 用相对时间 mono。
- 空状态:canvas-soft 圆角居中(icon 30% + body-sm 文案 + CTA)。

## 四、Workspace 详情页(Header + Tab)

新增 `web/app/console/workspaces/[id]/layout.tsx` 提供共享 header + tab:

```
← All workspaces
acme-agent                          ● Active
acme/api · Private · Created Aug 24    (meta 行, mono/caption)

[ Overview ]  [ Issues (3) ]
```

- Header:回链 + 名称(display-sm 20px)+ StatusBadge + meta 行(repo · private · created)。
- Tab 栏:`Overview` → `/console/workspaces/[id]`;`Issues (n)` → `/console/workspaces/[id]/issues`;按 pathname 高亮。
- Overview 页(`[id]/page.tsx` 重构):repo 卡 + 状态/创建时间,去除散卡片堆。
- Issues 页(`[id]/issues/page.tsx` 轻改):去掉自身 "← Workspace / Issues" 标题(由共享 header + tab 提供),仅保留 "New Issue" 按钮与七列看板。

## 五、测试与验证

- 静态测试新增:列表页含搜索框 + 排序表头;详情 layout 含 tab 栏;StatusBadge 三态。
- `bun test` / `bun run lint` / `bunx tsc --noEmit` / `bun run build` 全绿。

## 范围外

- 不改 marketing / auth / daemons / settings 页。
- 不改七列看板的列/拖拽逻辑(属于 issue 黑板,已完成)。
- 不做 workspace 状态筛选(数量少,YAGNI)。
