# Issue 黑板(平台 Issue + 评论流 + @mention + 状态机)设计

> **Status:** Draft
> **Date:** 2026-08-24
> **Scope:** openspec `build-gitsquad-mvp` 第 4 章(issue-blackboard)+ 前端最小页面(七列看板)
> **参考实现:** Multica(`/d/odyssey/multica`,issue/comment/mention/task 模块)

## 背景与目标

GitSquad 需要平台自建的 Issue 作为 agent 与人类协作的唯一黑板:不使用 GitHub issue 系统,统一在平台内创建与管理,所有参与者通过对同一 Issue 的评论流协作。本设计落地 openspec `issue-blackboard` spec 的全部 Requirement,并额外交付一个七列看板前端页面。

**交付边界(已与用户确认):**
- 后端:数据模型 + sqlc queries + service + REST API(第 4 章 4.1–4.6)
- 前端:Workspace 内 Issue 七列看板 + 详情页(列表/详情/评论/状态操作/创建)

**核心设计决策(已确认):**
- 状态集采用 **Multica 全量 7 态**:`backlog / todo / in_progress / in_review / done / blocked / cancelled`,创建默认 `backlog`
- Issue 采用 **每 workspace 顺序编号**(如 `GTS-42`,workspace 名取前 3 个大写字母为前缀)
- 评论三类型(`comment / status_change / system`)同表同流,不可编辑、不可删除

## 架构方案

**采用方案 A:按现有三层模式逐层新增(Handler → Service → Store + sqlc),不引入事件总线。**

对比过 Multica 式进程内同步事件总线(`events.Bus`,88 行,19 个发布点,3 类订阅方:realtime hub / daemon wakeup / lark outbound),结论:

1. **GitSquad 当前零消费者** —— 没有浏览器实时推送、没有 daemon 任务唤醒、没有通知集成;总线建了空转 5 个章节。
2. **核心链路无法走总线** —— mention → assigned_agents → 系统提示 → (未来)任务入队必须与评论插入保持同一请求内一致性;Multica 自己的 mention → `TaskService.EnqueueTaskForMention` 也是 handler 内直接调用,不走总线。
3. **演进成本低** —— 第 9 章落地时发布点只有约 4 个(评论创建/状态变更/任务状态/issue 创建),届时再决定直呼 realtime hub 还是加总线,机械替换,一天内。

第 9 章任务派发按 Multica 惯例直接调用 `TaskService`(经预留的 `dispatchForMention` 钩子),不依赖总线。

## 数据模型

```sql
-- workspaces 增加编号列(迁移风格:幂等,随 startup 顺序执行,参照 011 号迁移)
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS issue_prefix TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS issue_counter INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    number INT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'backlog'
        CHECK (status IN ('backlog','todo','in_progress','in_review','done','blocked','cancelled')),
    creator_user_id UUID REFERENCES users(id),
    assigned_agents TEXT[] NOT NULL DEFAULT '{}',        -- @mention 命中的 agent 名数组
    linked_prs TEXT[] NOT NULL DEFAULT '{}',             -- PR URL 数组,第 6/10 章写入
    source_upstream_issue TEXT NOT NULL DEFAULT '',      -- 预留字段,只持久化不触发逻辑
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, number)
);
CREATE INDEX IF NOT EXISTS idx_issues_workspace ON issues(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS issue_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_type TEXT NOT NULL CHECK (author_type IN ('user','agent','system')),
    author_id UUID,                                     -- user→users.id;agent→第5章 agents.id;system→NULL
    author_name TEXT NOT NULL DEFAULT '',               -- 冗余名字,防 agent 删除后历史悬空
    type TEXT NOT NULL DEFAULT 'comment'
        CHECK (type IN ('comment','status_change','system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issue_comments_issue ON issue_comments(issue_id, created_at);
```

要点:
- **编号分配**:workspace 创建时初始化 `issue_prefix`(名字字母取前 3 个大写,空则 `WS`);创建 issue 在事务内 `UPDATE workspaces SET issue_counter = issue_counter + 1 WHERE id=$1 RETURNING issue_counter`(行锁防并发重号),`number` 即计数器值,显示为 `GTS-42`。迁移时用 `DO $$ ... $$` 块为既有 workspace backfill prefix(名字字母取前 3 大写,无字母回退 `WS`)。
- **`assigned_agents` 用名字数组而非 id**:@mention 语法就是名字,名字在 workspace 内唯一(第 5 章约束),不依赖 agent 表存在。
- **评论不可编辑不可删**(spec 硬性要求);`system` 与 `status_change` 评论与普通评论同表同流,渲染时区分样式。
- **`creator_user_id` 可空**:本章只有用户创建,留空位给未来 agent 创建场景(Multica 的 creator_type/creator_id 双轨)。

## API 设计

全部挂在 `/api/v1/workspaces/:id/...` 下,复用 `middleware.RequireAuth` + workspace owner 校验(非 owner 一律 404,沿用现有模式)。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/workspaces/:id/issues` | 创建 `{title, description?}` → 201;title 必填;status 默认 `backlog`;返回含 `number` 与 `issue_key`(如 `GTS-42`) |
| GET | `/workspaces/:id/issues` | 看板一次拉全量,按 `(status, created_at)` 排序;返回所有 issue,前端按状态分组 |
| GET | `/workspaces/:id/issues/:issueId` | 详情 + 完整评论流(created_at asc,一次返回,不分页) |
| PATCH | `/workspaces/:id/issues/:issueId` | `{status?, title?, description?}`;状态必须合法枚举,非法 → 400 |
| POST | `/workspaces/:id/issues/:issueId/comments` | `{content}` → 201;服务端做 @mention 解析与处理 |

行为细节:
- **作者标识**:用户创建 issue/评论时,`creator_user_id`/`author_id` 填 `users.id`,`author_name` 冗余存 `users.login`(写入时快照,防未来用户/agent 改名或删除后历史悬空)。
- **状态变更落账**:任何状态变更(手动 PATCH 或未来内部触发)自动追加一条 `status_change` 评论(`GTS-42 状态变更: in_progress → in_review,由 @user 操作`),保证黑板可审计。
- **`linked_prs` 本章只读**:写入口是内部 service 方法,留给第 6/10 章 agent 提 PR 时调用,不暴露 HTTP。
- **`source_upstream_issue`**:创建/更新时接受持久化,无任何同步行为(spec 4.6)。
- **看板不设分页**,量级起来后再加游标。

## @mention 解析器

- 语法:`@([a-zA-Z0-9_-]+)`,扫描 issue 描述与评论正文;跳过围栏代码块与行内反引号代码(Multica `findSkipRegions` 的最小实现)。
- 解析器为独立纯函数 `ParseMentions(content string) []string`,便于单测。
- 处理流程(与评论/issue 插入同一请求内):
  1. 解析所有 mention token 并去重;
  2. 逐个查询 workspace 内 agent 配置(第 5 章前 agents 表不存在 → 全部判未匹配);
  3. 命中的 agent 名加入 `issue.assigned_agents`(TEXT[] 去重追加);
  4. 未匹配的名字 → 追加 `system` 评论 `未匹配到 Workspace 中的任何 agent: @xxx`(spec 硬性要求);
  5. **任务派发钩子**:预留 `dispatchForMention(issue, agentName)` 调用点,第 9 章填充,本章为空实现。

第 5 章之前任何 @ 都会判未匹配并追加系统提示 —— 行为符合 spec,第 5 章落地后自动变正确。

## 状态机

- 枚举:`backlog / todo / in_progress / in_review / done / blocked / cancelled`。
- **任意合法枚举间可转换**(看板需自由移动,如 done → todo 重新打开),不做迁移 DAG 限制;非法字符串 400。
- 触发点(in_progress = agent 开始、done = PR 合并)由第 6/9/10 章调用同一内部转换函数;本章提供手动 API + 统一落账。
- 创建默认 `backlog`(停泊语义,第 9 章据此跳过 backlog 派发)。

## 前端(七列看板)

路由:
- `/console/workspaces/[id]/issues` —— 七列看板(横向滚动):backlog / todo / in_progress / in_review / done / blocked / cancelled,每列状态名 + 数量 + 卡片
- `/console/workspaces/[id]/issues/[issueId]` —— 详情页:编号 + 标题 + 状态徽章 + 描述 + 评论流 + 评论输入框
- workspace 详情页加 Issues 入口

交互:
- 卡片:`GTS-42` 编号、标题、评论数、assigned_agents 标签(第 5 章后有数据才渲染)
- **拖拽换列 = PATCH status**,原生 HTML5 drag & drop,不引入 dnd-kit;同列内不排序(无 position 语义,按 created_at)
- 看板头部"新建 Issue"按钮 → 弹窗(标题 + 描述) → POST
- 详情页状态下拉切换;`system`/`status_change` 评论灰色/斜体样式区分
- `lib/api.ts` 加 `Issue`/`IssueComment` 类型与五个 API 函数,沿用现有 fetch 封装
- 描述 MVP 纯文本 + 保留换行,不引入 react-markdown(第 11 章打磨时再定)

## 测试

- 后端:`ParseMentions` 纯函数单测(命中/未命中/代码块跳过/去重/特殊字符);状态转换落账(任意转换 + status_change 评论生成);编号分配(事务内 counter 递增);mention → assigned_agents + 系统提示的 service 集成测试。沿用现有 service 测试组织方式。
- 前端:看板渲染与状态切换的组件级测试(现有基线低,只做关键路径)。

## 与后续章节的衔接(依赖关系)

| 后续章节 | 依赖点 | 本章预留 |
|---|---|---|
| 第 5 章 agent 配置 | agents 表、名字唯一性 | mention 校验查询点、assigned_agents 名字语义 |
| 第 6 章 Runtime 内核 | agent 写评论/状态 | author_type='agent'、status_change 评论、内部转换函数 |
| 第 9 章任务派发 | @mention → 任务 | `dispatchForMention` 钩子、backlog 跳过语义 |
| 第 10 章 PR 回流 | PR 事件 → Issue | `linked_prs` 内部写入口、system 评论类型 |
