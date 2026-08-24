# Issue 黑板(平台 Issue + 评论流 + @mention + 七列看板)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 openspec 第 4 章 issue-blackboard:平台 Issue 数据模型、CRUD + 评论流 API、@mention 解析与状态机,以及七列看板前端页面。

**Architecture:** 遵循现有 Handler → Service → Store(sqlc)三层。数据库用 migration.go 幂等 SQL 列表扩展(与 011 号迁移同风格);mention 解析与状态处理做成 service 层纯函数 + TDD;不引入事件总线(第 9 章直接调用预留的 `dispatchForMention` 钩子)。前端沿用 console 壳与 Vercel 设计语言,原生 HTML5 拖拽实现看板。

**Tech Stack:** Go 1.26 + Gin + pgx v5 + sqlc;Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui(radix-nova)+ lucide-react;bun(test/lint/build)

**设计文档:** `docs/superpowers/specs/2026-08-24-issue-blackboard-design.md`

## Global Constraints

- 状态枚举(仅此 7 值):`backlog / todo / in_progress / in_review / done / blocked / cancelled`,创建默认 `backlog`,非法值 API 返回 400
- 评论类型(仅此 3 值):`comment / status_change / system`;作者类型(仅此 3 值):`user / agent / system`
- 评论不可编辑、不可删除(无 UPDATE/DELETE 端点)
- 状态变更必须追加 `status_change` 评论(可审计)
- `assigned_agents` / `linked_prs` 为 TEXT[];`source_upstream_issue` 只持久化,不触发任何逻辑
- Issue 编号:`issue_prefix`(workspace 名非字母字符移除后取前 3 大写,不足则 `WS`)+ 每 workspace 递增 `issue_counter`,`issue_key` 形如 `GTS-42`
- 非 workspace owner 访问任何 issue 端点一律 404(沿用现有模式)
- 后端响应统一 `v1.SuccessResponse(data, count)` / `v1.ErrorResponse(message)` 信封
- 迁移风格:幂等 SQL(`IF NOT EXISTS` / `DO $$`),追加到 `migration.go` 列表末尾;`schema.sql` 同步更新(sqlc 的 schema 来源)
- Go 代码:禁止手写 SQL,全部走 sqlc;`go build ./...`、`go test ./...`、`go vet ./...` 必须全绿
- 前端:新增页面用 `"use client"` + `lib/api.ts` 封装;`bun run lint` 零警告;`bun run build` 通过

---

### Task 1: 数据库迁移与 sqlc schema

**Files:**
- Modify: `internal/server/database/migration.go`(在列表末尾追加 4 条迁移)
- Modify: `internal/server/store/schema.sql`(追加 DDL,与迁移同构,供 sqlc codegen)
- 生成物: `internal/server/store/db/models.go` 等(sqlc 自动重新生成)

**Interfaces:**
- Produces: `workspaces` 表新增 `issue_prefix TEXT NOT NULL DEFAULT ''`、`issue_counter INT NOT NULL DEFAULT 0` 列;新表 `issues`、`issue_comments`(字段见 DDL)

- [ ] **Step 1: 在 migration.go 追加迁移**

在 `internal/server/database/migration.go` 的 migrations 切片末尾(`011_daemon_tokens_machine_info` 之后)追加:

```go
		{name: "012_workspace_issue_numbering", sql: `ALTER TABLE workspaces
			ADD COLUMN IF NOT EXISTS issue_prefix TEXT NOT NULL DEFAULT '',
			ADD COLUMN IF NOT EXISTS issue_counter INT NOT NULL DEFAULT 0`},
		{name: "013_create_issues", sql: `CREATE TABLE IF NOT EXISTS issues (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
			number INT NOT NULL,
			title TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'backlog'
				CHECK (status IN ('backlog','todo','in_progress','in_review','done','blocked','cancelled')),
			creator_user_id UUID REFERENCES users(id),
			assigned_agents TEXT[] NOT NULL DEFAULT '{}',
			linked_prs TEXT[] NOT NULL DEFAULT '{}',
			source_upstream_issue TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			UNIQUE (workspace_id, number)
		)`},
		{name: "014_create_issue_comments", sql: `CREATE TABLE IF NOT EXISTS issue_comments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
			author_type TEXT NOT NULL CHECK (author_type IN ('user','agent','system')),
			author_id UUID,
			author_name TEXT NOT NULL DEFAULT '',
			type TEXT NOT NULL DEFAULT 'comment'
				CHECK (type IN ('comment','status_change','system')),
			content TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`},
		{name: "015_issue_prefix_backfill", sql: `DO $$
			BEGIN
				UPDATE workspaces SET issue_prefix = UPPER(LEFT(REGEXP_REPLACE(name, '[^a-zA-Z]', '', 'g'), 3)) WHERE issue_prefix = '';
				UPDATE workspaces SET issue_prefix = 'WS' WHERE issue_prefix = '';
			END $$`},
```

- [ ] **Step 2: 同步更新 schema.sql(sqlc 的 schema 来源)**

在 `internal/server/store/schema.sql` 末尾追加:

```sql
ALTER TABLE workspaces
    ADD COLUMN issue_prefix TEXT NOT NULL DEFAULT '',
    ADD COLUMN issue_counter INT NOT NULL DEFAULT 0;

CREATE TABLE issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    number INT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'backlog'
        CHECK (status IN ('backlog','todo','in_progress','in_review','done','blocked','cancelled')),
    creator_user_id UUID REFERENCES users(id),
    assigned_agents TEXT[] NOT NULL DEFAULT '{}',
    linked_prs TEXT[] NOT NULL DEFAULT '{}',
    source_upstream_issue TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, number)
);

CREATE INDEX IF NOT EXISTS idx_issues_workspace ON issues(workspace_id, created_at);

CREATE TABLE issue_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_type TEXT NOT NULL CHECK (author_type IN ('user','agent','system')),
    author_id UUID,
    author_name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'comment'
        CHECK (type IN ('comment','status_change','system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_comments_issue ON issue_comments(issue_id, created_at);
```

- [ ] **Step 3: 重新生成 sqlc 代码并验证构建**

```bash
cd /d/odyssey/GitSquad && sqlc generate && go build ./...
```
预期:无输出、退出码 0;`internal/server/store/db/models.go` 出现 `Issue`、`IssueComment` 模型与 `Workspace.IssuePrefix`、`Workspace.IssueCounter` 字段。

- [ ] **Step 4: 提交**

```bash
git add internal/server/database/migration.go internal/server/store/schema.sql internal/server/store/db/
git commit -m "feat(db): add issues and issue_comments tables with workspace numbering"
```

---

### Task 2: issues 查询(sqlc queries)

**Files:**
- Create: `internal/server/store/queries/issues.sql`
- Modify: `internal/server/store/queries/workspaces.sql`(CreateWorkspace 增加 issue_prefix)
- 生成物: `internal/server/store/db/issues.sql.go`

**Interfaces:**
- Produces(后续 Task 使用,均为 `db.Queries` 方法):
  - `CreateIssue(ctx, CreateIssueParams) (db.Issue, error)` — Params 含 `SourceUpstreamIssue *string`(可空,预留字段)
  - `ListIssuesByWorkspace(ctx, workspaceID) ([]ListIssuesByWorkspaceRow, error)` — Row 含 `IssuePrefix string`、`CreatorName string`、`CommentsCount int64`
  - `GetIssue(ctx, GetIssueParams{ID, WorkspaceID}) (GetIssueRow, error)` — Row 同上
  - `IncrementWorkspaceIssueCounter(ctx, workspaceID) (int32, error)`
  - `GetWorkspaceNumbering(ctx, workspaceID) (string, error)` — 返回 issue_prefix
  - `AddIssueAssignedAgent(ctx, AddIssueAssignedAgentParams{ID, AgentName}) error`
  - `UpdateIssueStatus(ctx, UpdateIssueStatusParams{ID, WorkspaceID, Status}) (db.Issue, error)`
  - `UpdateIssueTitleDescription(ctx, UpdateIssueTitleDescriptionParams{ID, WorkspaceID, Title, Description}) (db.Issue, error)`
  - `CreateComment(ctx, CreateCommentParams) (db.IssueComment, error)`
  - `ListCommentsByIssue(ctx, issueID) ([]db.IssueComment, error)`

- [ ] **Step 1: 写 queries/issues.sql**

创建 `internal/server/store/queries/issues.sql`:

```sql
-- name: CreateIssue :one
INSERT INTO issues (workspace_id, number, title, description, status, creator_user_id, assigned_agents, source_upstream_issue)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;

-- name: ListIssuesByWorkspace :many
SELECT i.*, w.issue_prefix AS issue_prefix, COALESCE(u.login, '') AS creator_name,
       (SELECT count(*) FROM issue_comments c WHERE c.issue_id = i.id) AS comments_count
FROM issues i
JOIN workspaces w ON w.id = i.workspace_id
LEFT JOIN users u ON u.id = i.creator_user_id
WHERE i.workspace_id = $1
ORDER BY i.status, i.created_at DESC;

-- name: GetIssue :one
SELECT i.*, w.issue_prefix AS issue_prefix, COALESCE(u.login, '') AS creator_name,
       (SELECT count(*) FROM issue_comments c WHERE c.issue_id = i.id) AS comments_count
FROM issues i
JOIN workspaces w ON w.id = i.workspace_id
LEFT JOIN users u ON u.id = i.creator_user_id
WHERE i.id = $1 AND i.workspace_id = $2;

-- name: IncrementWorkspaceIssueCounter :one
UPDATE workspaces SET issue_counter = issue_counter + 1 WHERE id = $1 RETURNING issue_counter;

-- name: GetWorkspaceNumbering :one
SELECT issue_prefix FROM workspaces WHERE id = $1;

-- name: AddIssueAssignedAgent :exec
UPDATE issues SET assigned_agents = array_append(assigned_agents, $2), updated_at = now()
WHERE id = $1 AND NOT ($2 = ANY(assigned_agents));

-- name: UpdateIssueStatus :one
UPDATE issues SET status = $3, updated_at = now() WHERE id = $1 AND workspace_id = $2 RETURNING *;

-- name: UpdateIssueTitleDescription :one
UPDATE issues SET title = $3, description = $4, updated_at = now() WHERE id = $1 AND workspace_id = $2 RETURNING *;

-- name: CreateComment :one
INSERT INTO issue_comments (issue_id, author_type, author_id, author_name, type, content)
VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;

-- name: ListCommentsByIssue :many
SELECT * FROM issue_comments WHERE issue_id = $1 ORDER BY created_at ASC;
```

- [ ] **Step 2: 修改 workspaces.sql 的 CreateWorkspace**

把 `internal/server/store/queries/workspaces.sql` 中:

```sql
-- name: CreateWorkspace :one
INSERT INTO workspaces (user_id, installation_id, github_repo_id, name)
VALUES ($1, $2, $3, $4) RETURNING *;
```

改为:

```sql
-- name: CreateWorkspace :one
INSERT INTO workspaces (user_id, installation_id, github_repo_id, name, issue_prefix)
VALUES ($1, $2, $3, $4, $5) RETURNING *;
```

- [ ] **Step 3: 重新生成并验证**

```bash
cd /d/odyssey/GitSquad && sqlc generate && go build ./...
```
预期:退出码 0。若 `CreateWorkspace` 调用处编译失败,是预期的(service 层将在 Task 4 传入新参数),本轮只需确认 sqlc 生成与语法无误 —— 若失败来自 `internal/server/service/workspace.go`,临时在调用处补 `""` 占位并标注"Task 4 替换",保证 `go build ./...` 通过。

- [ ] **Step 4: 提交**

```bash
git add internal/server/store/queries/ internal/server/store/db/
git commit -m "feat(db): add sqlc queries for issues and comments"
```

---

### Task 3: @mention 解析器(TDD 纯函数)

**Files:**
- Create: `internal/server/service/mentions.go`
- Create: `internal/server/service/mentions_test.go`

**Interfaces:**
- Produces:
  - `ParseMentions(content string) []string` — 去重保序;跳过围栏代码块(```…```)与行内反引号(`…`)内的内容;token 语法 `@[a-zA-Z0-9_-]+`
  - `processMentions(content string, agentNames []string) (matched, unmatched []string)` — matched 保持出现顺序去重;unmatched 为其余 token(同样去重)

- [ ] **Step 1: 写失败测试**

创建 `internal/server/service/mentions_test.go`:

```go
package service

import (
	"reflect"
	"testing"
)

func TestParseMentions(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    []string
	}{
		{"plain mention", "please @coder look at this", []string{"coder"}},
		{"at string start", "@coder first", []string{"coder"}},
		{"multiple mentions", "@alice and @bob both", []string{"alice", "bob"}},
		{"dedupe keeps order", "@alice @bob @alice", []string{"alice", "bob"}},
		{"with hyphens and underscores", "@senior-dev and @code_reviewer", []string{"senior-dev", "code_reviewer"}},
		{"no mention", "just text", nil},
		{"email is not a mention", "mail me at a@b.com", nil},
		{"skips fenced code block", "```\n@coder inside fence\n```\nafter @coder", []string{"coder"}},
		{"skips inline code", "use `@coder` literal and @coder", []string{"coder"}},
		{"mention with trailing punctuation", "@coder, please", []string{"coder"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ParseMentions(tt.content)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("ParseMentions(%q) = %v, want %v", tt.content, got, tt.want)
			}
		})
	}
}

func TestProcessMentions(t *testing.T) {
	matched, unmatched := processMentions("hi @coder and @ghost", []string{"coder"})
	if !reflect.DeepEqual(matched, []string{"coder"}) {
		t.Errorf("matched = %v, want [coder]", matched)
	}
	if !reflect.DeepEqual(unmatched, []string{"ghost"}) {
		t.Errorf("unmatched = %v, want [ghost]", unmatched)
	}

	matched, unmatched = processMentions("no mentions here", []string{"coder"})
	if len(matched) != 0 || len(unmatched) != 0 {
		t.Errorf("expected empty splits, got %v / %v", matched, unmatched)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /d/odyssey/GitSquad && go test ./internal/server/service/ -run 'TestParseMentions|TestProcessMentions' -v
```
预期:FAIL(undefined: ParseMentions)。

- [ ] **Step 3: 实现解析器**

创建 `internal/server/service/mentions.go`:

```go
package service

import "regexp"

// mentionRe matches @mention tokens: @ followed by word chars, hyphen or
// underscore. The (^|[^\w]) prefix keeps emails (a@b.com) from matching —
// RE2 has no lookbehind, so the preceding char is captured in group 1.
var mentionRe = regexp.MustCompile(`(^|[^\w])@([a-zA-Z0-9_-]+)`)

// codeBlockRe matches fenced code blocks (```...```, non-greedy across lines).
var codeBlockRe = regexp.MustCompile("(?s)```.*?```")

// inlineCodeRe matches inline code spans (`...`).
var inlineCodeRe = regexp.MustCompile("`[^`\n]+`")

// ParseMentions extracts @mention tokens from content, skipping text inside
// fenced code blocks and inline code spans. Order is preserved; duplicates
// are removed.
func ParseMentions(content string) []string {
	masked := codeBlockRe.ReplaceAllString(content, "")
	masked = inlineCodeRe.ReplaceAllString(masked, "")

	var result []string
	seen := map[string]bool{}
	for _, m := range mentionRe.FindAllStringSubmatch(masked, -1) {
		name := m[2]
		if !seen[name] {
			seen[name] = true
			result = append(result, name)
		}
	}
	return result
}

// processMentions splits parsed mentions into those that exist in the
// workspace's agent list (matched) and those that do not (unmatched).
// Chapter 5 (agent config) supplies real agentNames; until then callers
// pass an empty list so every mention lands in unmatched, per spec.
func processMentions(content string, agentNames []string) (matched, unmatched []string) {
	agents := map[string]bool{}
	for _, a := range agentNames {
		agents[a] = true
	}
	for _, m := range ParseMentions(content) {
		if agents[m] {
			matched = append(matched, m)
		} else {
			unmatched = append(unmatched, m)
		}
	}
	return matched, unmatched
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /d/odyssey/GitSquad && go test ./internal/server/service/ -run 'TestParseMentions|TestProcessMentions' -v
```
预期:全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/server/service/mentions.go internal/server/service/mentions_test.go
git commit -m "feat(issue): add @mention parser with code-block skipping"
```

---

### Task 4: Issue 服务层(编号 + mention 处理 + 状态机落账)

**Files:**
- Create: `internal/server/service/issue.go`
- Create: `internal/server/service/issue_test.go`
- Modify: `internal/server/service/workspace.go`(CreateWorkspace 计算并传入 issue_prefix)

**Interfaces:**
- Consumes(Task 2 的 db.Queries 方法、Task 3 的 `processMentions`、`store.Store.ExecTx`)
- Produces:
  - `type IssueResponse struct { ID uuid.UUID; Number int32; IssueKey string; Title string; Description string; Status string; AssignedAgents []string; LinkedPRs []string; CreatorName string; CreatedAt time.Time; UpdatedAt time.Time }`(json 标签全小写下划线,如 `json:"issue_key"`)
  - `type CommentResponse struct { ID uuid.UUID; AuthorType string; AuthorName string; Type string; Content string; CreatedAt time.Time }`
  - `type IssueDetailResponse struct { IssueResponse; Comments []CommentResponse }`(内嵌,json 展平)
  - `func NewIssueService(s *store.Store) *IssueService`
  - `func (s *IssueService) CreateIssue(ctx, workspaceID, userID uuid.UUID, userLogin, title, description string) (*IssueResponse, error)`
  - `func (s *IssueService) ListIssues(ctx, workspaceID uuid.UUID) ([]IssueResponse, error)`
  - `func (s *IssueService) GetIssue(ctx, workspaceID, issueID uuid.UUID) (*IssueDetailResponse, error)`
  - `func (s *IssueService) UpdateIssue(ctx, workspaceID, issueID uuid.UUID, actorName string, status, title, description *string) (*IssueResponse, error)` — 指针为 nil 表示不改该字段;actorName 记入 status_change 评论
  - `func (s *IssueService) AddComment(ctx, workspaceID, issueID uuid.UUID, userID uuid.UUID, userLogin, content string) (*CommentResponse, error)`
  - 错误哨兵:`ErrIssueNotFound`;`ErrInvalidStatus`、`ErrEmptyTitle`、`ErrEmptyComment`(handler 转 400)
  - 纯函数:`deriveIssuePrefix(name string) string`、`validIssueStatus(s string) bool`
  - 内部钩子:`func (s *IssueService) dispatchForMention(ctx context.Context, issueID uuid.UUID, agentName string)` — 空实现,第 9 章填充

- [ ] **Step 1: 写失败测试(纯逻辑部分)**

创建 `internal/server/service/issue_test.go`:

```go
package service

import "testing"

func TestDeriveIssuePrefix(t *testing.T) {
	tests := []struct {
		name string
		want string
	}{
		{"GitSquad", "GTS"},
		{"My Workspace", "MYW"},
		{"Acme_2026", "ACM"},
		{"123", "WS"},
		{"", "WS"},
	}
	for _, tt := range tests {
		if got := deriveIssuePrefix(tt.name); got != tt.want {
			t.Errorf("deriveIssuePrefix(%q) = %q, want %q", tt.name, got, tt.want)
		}
	}
}

func TestValidIssueStatus(t *testing.T) {
	for _, s := range []string{"backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"} {
		if !validIssueStatus(s) {
			t.Errorf("validIssueStatus(%q) = false, want true", s)
		}
	}
	for _, s := range []string{"open", "closed", "inprogress", ""} {
		if validIssueStatus(s) {
			t.Errorf("validIssueStatus(%q) = true, want false", s)
		}
	}
}
```

- [ ] **Step 2: 运行确认失败**

```bash
cd /d/odyssey/GitSquad && go test ./internal/server/service/ -run 'TestDeriveIssuePrefix|TestValidIssueStatus' -v
```
预期:FAIL(undefined: deriveIssuePrefix)。

- [ ] **Step 3: 实现 service(含纯函数与 DB 流程)**

创建 `internal/server/service/issue.go`:

```go
package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/google/uuid"
)

var (
	ErrIssueNotFound  = errors.New("issue not found")
	ErrInvalidStatus  = errors.New("invalid issue status")
	ErrEmptyTitle     = errors.New("title is required")
	ErrEmptyComment   = errors.New("comment content is required")
)

var nonLetterRe = regexp.MustCompile(`[^a-zA-Z]`)

// deriveIssuePrefix derives the human-readable issue prefix for a workspace
// (e.g. "GitSquad" → "GTS"), falling back to "WS" when the name has fewer
// than 3 letters.
func deriveIssuePrefix(name string) string {
	letters := nonLetterRe.ReplaceAllString(name, "")
	if len(letters) >= 3 {
		return strings.ToUpper(letters[:3])
	}
	return "WS"
}

// issueStatuses is the canonical status set (Multica-style, 7 states).
var issueStatuses = map[string]bool{
	"backlog": true, "todo": true, "in_progress": true, "in_review": true,
	"done": true, "blocked": true, "cancelled": true,
}

func validIssueStatus(s string) bool { return issueStatuses[s] }

type IssueResponse struct {
	ID             uuid.UUID `json:"id"`
	Number         int32     `json:"number"`
	IssueKey       string    `json:"issue_key"`
	Title          string    `json:"title"`
	Description    string    `json:"description"`
	Status         string    `json:"status"`
	AssignedAgents []string  `json:"assigned_agents"`
	LinkedPRs      []string  `json:"linked_prs"`
	CreatorName    string    `json:"creator_name"`
	CommentsCount  int       `json:"comments_count"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type CommentResponse struct {
	ID         uuid.UUID `json:"id"`
	AuthorType string    `json:"author_type"`
	AuthorName string    `json:"author_name"`
	Type       string    `json:"type"`
	Content    string    `json:"content"`
	CreatedAt  time.Time `json:"created_at"`
}

type IssueDetailResponse struct {
	IssueResponse
	Comments []CommentResponse `json:"comments"`
}

type IssueService struct {
	store *store.Store
}

func NewIssueService(s *store.Store) *IssueService {
	return &IssueService{store: s}
}

// listAgentNames returns the agent names configured in a workspace.
// Chapter 5 (agent config) will back this with the agents table; until
// then it returns nothing, so every mention is treated as unmatched.
func listAgentNames(ctx context.Context, workspaceID uuid.UUID) ([]string, error) {
	return nil, nil
}

// dispatchForMention is the seam where Chapter 9 (task dispatch) hooks in:
// a matched mention should enqueue a task for the agent. Empty until then.
func (s *IssueService) dispatchForMention(ctx context.Context, issueID uuid.UUID, agentName string) {
}

func issueKey(prefix string, number int32) string {
	return fmt.Sprintf("%s-%d", prefix, number)
}

// listRowToResponse maps a ListIssuesByWorkspaceRow to the API shape.
func listRowToResponse(row db.ListIssuesByWorkspaceRow) IssueResponse {
	return IssueResponse{
		ID:             row.ID,
		Number:         row.Number,
		IssueKey:       issueKey(row.IssuePrefix, row.Number),
		Title:          row.Title,
		Description:    row.Description,
		Status:         row.Status,
		AssignedAgents: row.AssignedAgents,
		LinkedPRs:      row.LinkedPRs,
		CreatorName:    row.CreatorName,
		CommentsCount:  int(row.CommentsCount),
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
	}
}

// getRowToResponse maps a GetIssueRow to the API shape.
func getRowToResponse(row db.GetIssueRow) IssueResponse {
	return IssueResponse{
		ID:             row.ID,
		Number:         row.Number,
		IssueKey:       issueKey(row.IssuePrefix, row.Number),
		Title:          row.Title,
		Description:    row.Description,
		Status:         row.Status,
		AssignedAgents: row.AssignedAgents,
		LinkedPRs:      row.LinkedPRs,
		CreatorName:    row.CreatorName,
		CommentsCount:  int(row.CommentsCount),
		CreatedAt:      row.CreatedAt,
		UpdatedAt:      row.UpdatedAt,
	}
}

// issueResponseFrom builds an IssueResponse from a bare issue row model
// plus context fetched separately (workspace prefix, creator login).
func issueResponseFrom(issue db.Issue, prefix, creatorName string) IssueResponse {
	return IssueResponse{
		ID:             issue.ID,
		Number:         issue.Number,
		IssueKey:       issueKey(prefix, issue.Number),
		Title:          issue.Title,
		Description:    issue.Description,
		Status:         issue.Status,
		AssignedAgents: issue.AssignedAgents,
		LinkedPRs:      issue.LinkedPRs,
		CreatorName:    creatorName,
		CreatedAt:      issue.CreatedAt,
		UpdatedAt:      issue.UpdatedAt,
	}
}

// uuidPtr converts a uuid.UUID into the *uuid.UUID the sqlc-generated
// models use for nullable uuid columns.
func uuidPtr(id uuid.UUID) *uuid.UUID { return &id }

// CreateIssue creates an issue with a per-workspace sequential number,
// scans the description for @mentions, and appends system hints for
// mentions that match no agent. Runs in one transaction.
func (s *IssueService) CreateIssue(ctx context.Context, workspaceID, userID uuid.UUID, userLogin, title, description string) (*IssueResponse, error) {
	if strings.TrimSpace(title) == "" {
		return nil, ErrEmptyTitle
	}

	agents, err := listAgentNames(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list agent names: %w", err)
	}
	matched, unmatched := processMentions(description, agents)

	var resp *IssueResponse
	err = s.store.ExecTx(ctx, func(q *db.Queries) error {
		prefix, err := q.GetWorkspaceNumbering(ctx, workspaceID)
		if err != nil {
			return fmt.Errorf("%w: %v", ErrIssueNotFound, err)
		}
		number, err := q.IncrementWorkspaceIssueCounter(ctx, workspaceID)
		if err != nil {
			return fmt.Errorf("increment counter: %w", err)
		}
		issue, err := q.CreateIssue(ctx, db.CreateIssueParams{
			WorkspaceID:    workspaceID,
			Number:         number,
			Title:          title,
			Description:    description,
			Status:         "backlog",
			CreatorUserID:  uuidPtr(userID),
			AssignedAgents: matched,
		})
		if err != nil {
			return fmt.Errorf("create issue: %w", err)
		}
		for _, name := range unmatched {
			if _, err := q.CreateComment(ctx, db.CreateCommentParams{
				IssueID:    issue.ID,
				AuthorType: "system",
				AuthorName: "system",
				Type:       "system",
				Content:    "未匹配到 Workspace 中的任何 agent: @" + name,
			}); err != nil {
				return fmt.Errorf("append unmatched-mention hint: %w", err)
			}
		}
		resp = &IssueResponse{
			ID:             issue.ID,
			Number:         issue.Number,
			IssueKey:       issueKey(prefix, issue.Number),
			Title:          issue.Title,
			Description:    issue.Description,
			Status:         issue.Status,
			AssignedAgents: issue.AssignedAgents,
			LinkedPRs:      issue.LinkedPRs,
			CreatorName:    userLogin,
			CreatedAt:      issue.CreatedAt,
			UpdatedAt:      issue.UpdatedAt,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return resp, nil
}

// ListIssues returns every issue in the workspace, ordered by status then
// newest-first, for the kanban board.
func (s *IssueService) ListIssues(ctx context.Context, workspaceID uuid.UUID) ([]IssueResponse, error) {
	rows, err := s.store.ListIssuesByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list issues: %w", err)
	}
	list := make([]IssueResponse, len(rows))
	for i, row := range rows {
		list[i] = listRowToResponse(row)
	}
	return list, nil
}

// GetIssue returns the issue with its full comment stream (oldest first).
func (s *IssueService) GetIssue(ctx context.Context, workspaceID, issueID uuid.UUID) (*IssueDetailResponse, error) {
	row, err := s.store.GetIssue(ctx, db.GetIssueParams{ID: issueID, WorkspaceID: workspaceID})
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrIssueNotFound, err)
	}
	comments, err := s.store.ListCommentsByIssue(ctx, issueID)
	if err != nil {
		return nil, fmt.Errorf("list comments: %w", err)
	}
	detail := IssueDetailResponse{
		IssueResponse: getRowToResponse(row),
		Comments:      make([]CommentResponse, len(comments)),
	}
	for i, c := range comments {
		detail.Comments[i] = CommentResponse{
			ID:         c.ID,
			AuthorType: c.AuthorType,
			AuthorName: c.AuthorName,
			Type:       c.Type,
			Content:    c.Content,
			CreatedAt:  c.CreatedAt,
		}
	}
	return &detail, nil
}

// UpdateIssue applies the non-nil fields (status / title / description).
// A status change appends an immutable status_change comment naming the
// actor who triggered it.
func (s *IssueService) UpdateIssue(ctx context.Context, workspaceID, issueID uuid.UUID, actorName string, status, title, description *string) (*IssueResponse, error) {
	if status != nil && !validIssueStatus(*status) {
		return nil, ErrInvalidStatus
	}
	if title != nil && strings.TrimSpace(*title) == "" {
		return nil, ErrEmptyTitle
	}

	var resp *IssueResponse
	err := s.store.ExecTx(ctx, func(q *db.Queries) error {
		row, err := q.GetIssue(ctx, db.GetIssueParams{ID: issueID, WorkspaceID: workspaceID})
		if err != nil {
			return fmt.Errorf("%w: %v", ErrIssueNotFound, err)
		}
		if status != nil && *status != row.Status {
			updated, err := q.UpdateIssueStatus(ctx, db.UpdateIssueStatusParams{
				ID:          issueID,
				WorkspaceID: workspaceID,
				Status:      *status,
			})
			if err != nil {
				return fmt.Errorf("update status: %w", err)
			}
			if _, err := q.CreateComment(ctx, db.CreateCommentParams{
				IssueID:    issueID,
				AuthorType: "system",
				AuthorName: actorName,
				Type:       "status_change",
				Content:    fmt.Sprintf("%s 状态变更: %s → %s,由 %s 操作", issueKey(row.IssuePrefix, row.Number), row.Status, *status, actorName),
			}); err != nil {
				return fmt.Errorf("append status change comment: %w", err)
			}
			r := issueResponseFrom(updated, row.IssuePrefix, row.CreatorName)
			resp = &r
		}
		if title != nil || description != nil {
			newTitle := row.Title
			if title != nil {
				newTitle = *title
			}
			newDesc := row.Description
			if description != nil {
				newDesc = *description
			}
			updated, err := q.UpdateIssueTitleDescription(ctx, db.UpdateIssueTitleDescriptionParams{
				ID:          issueID,
				WorkspaceID: workspaceID,
				Title:       newTitle,
				Description: newDesc,
			})
			if err != nil {
				return fmt.Errorf("update fields: %w", err)
			}
			r := issueResponseFrom(updated, row.IssuePrefix, row.CreatorName)
			resp = &r
		}
		if resp == nil {
			r := issueResponseFrom(row, row.IssuePrefix, row.CreatorName)
			resp = &r
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return resp, nil
}

// AddComment appends a user comment, processes @mentions (assigning
// matched agents and hinting at unmatched ones), and fires the dispatch
// hook for matched agents. Comment insert and mention effects share one
// transaction.
func (s *IssueService) AddComment(ctx context.Context, workspaceID, issueID, userID uuid.UUID, userLogin, content string) (*CommentResponse, error) {
	if strings.TrimSpace(content) == "" {
		return nil, ErrEmptyComment
	}

	agents, err := listAgentNames(ctx, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list agent names: %w", err)
	}
	matched, unmatched := processMentions(content, agents)

	var resp *CommentResponse
	err = s.store.ExecTx(ctx, func(q *db.Queries) error {
		row, err := q.GetIssue(ctx, db.GetIssueParams{ID: issueID, WorkspaceID: workspaceID})
		if err != nil {
			return fmt.Errorf("%w: %v", ErrIssueNotFound, err)
		}
		for _, name := range matched {
			if err := q.AddIssueAssignedAgent(ctx, db.AddIssueAssignedAgentParams{
				ID:        issueID,
				AgentName: name,
			}); err != nil {
				return fmt.Errorf("assign agent: %w", err)
			}
		}
		comment, err := q.CreateComment(ctx, db.CreateCommentParams{
			IssueID:    issueID,
			AuthorType: "user",
			AuthorID:   uuidPtr(userID),
			AuthorName: userLogin,
			Type:       "comment",
			Content:    content,
		})
		if err != nil {
			return fmt.Errorf("create comment: %w", err)
		}
		for _, name := range unmatched {
			if _, err := q.CreateComment(ctx, db.CreateCommentParams{
				IssueID:    issueID,
				AuthorType: "system",
				AuthorName: "system",
				Type:       "system",
				Content:    "未匹配到 Workspace 中的任何 agent: @" + name,
			}); err != nil {
				return fmt.Errorf("append unmatched-mention hint: %w", err)
			}
		}
		resp = &CommentResponse{
			ID:         comment.ID,
			AuthorType: comment.AuthorType,
			AuthorName: comment.AuthorName,
			Type:       comment.Type,
			Content:    comment.Content,
			CreatedAt:  comment.CreatedAt,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	for _, name := range matched {
		s.dispatchForMention(ctx, issueID, name)
	}
	return resp, nil
}
```

- [ ] **Step 4: 修改 workspace service 初始化 prefix**

在 `internal/server/service/workspace.go` 的 `CreateWorkspace` 中,把 CreateWorkspace 调用改为:

```go
	w, err := s.store.CreateWorkspace(ctx, db.CreateWorkspaceParams{
		UserID:         userID,
		InstallationID: installationID,
		GithubRepoID:   repoID,
		Name:           name,
		IssuePrefix:    deriveIssuePrefix(name),
	})
```

- [ ] **Step 5: 运行测试与构建**

```bash
cd /d/odyssey/GitSquad && sqlc generate && go test ./... && go build ./... && go vet ./...
```
预期:全部 PASS / 退出码 0。若 `db.CreateWorkspaceParams` 提示缺少 `IssuePrefix`,确认 Task 2 的 workspaces.sql 已修改并重新生成。

- [ ] **Step 6: 提交**

```bash
git add internal/server/service/ internal/server/store/
git commit -m "feat(issue): issue service with numbering, mention handling, status audit comments"
```

---

### Task 5: Issue HTTP handler 与路由

**Files:**
- Create: `internal/server/handler/issue.go`
- Modify: `internal/server/handler/routes.go`

**Interfaces:**
- Consumes: `service.IssueService`(Task 4)、`service.WorkspaceService`(owner 校验)、`middleware.GetUser`、`v1.SuccessResponse/ErrorResponse`
- Produces: 路由注册(见 Step 2)

- [ ] **Step 1: 创建 handler**

创建 `internal/server/handler/issue.go`:

```go
package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type IssueHandler struct {
	issues    *service.IssueService
	workspaces *service.WorkspaceService
}

func NewIssueHandler(issues *service.IssueService, workspaces *service.WorkspaceService) *IssueHandler {
	return &IssueHandler{issues: issues, workspaces: workspaces}
}

// requireWorkspaceOwner loads the workspace and verifies it belongs to the
// authenticated user; returns false (with response written) on failure.
func (h *IssueHandler) requireWorkspaceOwner(c *gin.Context) bool {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return false
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid workspace id"))
		return false
	}
	workspace, err := h.workspaces.GetWorkspace(c.Request.Context(), id)
	if err != nil || workspace.UserID != user.ID {
		c.JSON(http.StatusNotFound, v1.ErrorResponse("workspace not found"))
		return false
	}
	return true
}

type CreateIssueRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

// Create handles POST /api/v1/workspaces/:id/issues.
func (h *IssueHandler) Create(c *gin.Context) {
	if !h.requireWorkspaceOwner(c) {
		return
	}
	var req CreateIssueRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request body"))
		return
	}
	user := middleware.GetUser(c)
	workspaceID := uuid.MustParse(c.Param("id"))
	issue, err := h.issues.CreateIssue(c.Request.Context(), workspaceID, user.ID, user.Login, req.Title, req.Description)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEmptyTitle):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("title is required"))
		default:
			slog.Error("create issue", "error", err)
			c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to create issue"))
		}
		return
	}
	c.JSON(http.StatusCreated, v1.SuccessResponse(issue, 0))
}

// List handles GET /api/v1/workspaces/:id/issues.
func (h *IssueHandler) List(c *gin.Context) {
	if !h.requireWorkspaceOwner(c) {
		return
	}
	workspaceID := uuid.MustParse(c.Param("id"))
	list, err := h.issues.ListIssues(c.Request.Context(), workspaceID)
	if err != nil {
		slog.Error("list issues", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to list issues"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(list, len(list)))
}

// Get handles GET /api/v1/workspaces/:id/issues/:issueId.
func (h *IssueHandler) Get(c *gin.Context) {
	if !h.requireWorkspaceOwner(c) {
		return
	}
	issueID, err := uuid.Parse(c.Param("issueId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid issue id"))
		return
	}
	workspaceID := uuid.MustParse(c.Param("id"))
	issue, err := h.issues.GetIssue(c.Request.Context(), workspaceID, issueID)
	if err != nil {
		if errors.Is(err, service.ErrIssueNotFound) {
			c.JSON(http.StatusNotFound, v1.ErrorResponse("issue not found"))
			return
		}
		slog.Error("get issue", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to get issue"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(issue, 0))
}

type UpdateIssueRequest struct {
	Status      *string `json:"status"`
	Title       *string `json:"title"`
	Description *string `json:"description"`
}

// Update handles PATCH /api/v1/workspaces/:id/issues/:issueId.
func (h *IssueHandler) Update(c *gin.Context) {
	if !h.requireWorkspaceOwner(c) {
		return
	}
	issueID, err := uuid.Parse(c.Param("issueId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid issue id"))
		return
	}
	var req UpdateIssueRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request body"))
		return
	}
	user := middleware.GetUser(c)
	workspaceID := uuid.MustParse(c.Param("id"))
	issue, err := h.issues.UpdateIssue(c.Request.Context(), workspaceID, issueID, user.Login, req.Status, req.Title, req.Description)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrIssueNotFound):
			c.JSON(http.StatusNotFound, v1.ErrorResponse("issue not found"))
		case errors.Is(err, service.ErrInvalidStatus):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid status"))
		case errors.Is(err, service.ErrEmptyTitle):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("title is required"))
		default:
			slog.Error("update issue", "error", err)
			c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to update issue"))
		}
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(issue, 0))
}

type CreateCommentRequest struct {
	Content string `json:"content"`
}

// AddComment handles POST /api/v1/workspaces/:id/issues/:issueId/comments.
func (h *IssueHandler) AddComment(c *gin.Context) {
	if !h.requireWorkspaceOwner(c) {
		return
	}
	issueID, err := uuid.Parse(c.Param("issueId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid issue id"))
		return
	}
	var req CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request body"))
		return
	}
	user := middleware.GetUser(c)
	workspaceID := uuid.MustParse(c.Param("id"))
	comment, err := h.issues.AddComment(c.Request.Context(), workspaceID, issueID, user.ID, user.Login, req.Content)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrIssueNotFound):
			c.JSON(http.StatusNotFound, v1.ErrorResponse("issue not found"))
		case errors.Is(err, service.ErrEmptyComment):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("comment content is required"))
		default:
			slog.Error("add comment", "error", err)
			c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to add comment"))
		}
		return
	}
	c.JSON(http.StatusCreated, v1.SuccessResponse(comment, 0))
}
```

- [ ] **Step 2: 注册路由**

在 `internal/server/handler/routes.go` 中:
1. 构造处(`workspaceHandler := NewWorkspaceHandler(workspaceSvc)` 之后)加:

```go
	issueSvc := service.NewIssueService(s)
	issueHandler := NewIssueHandler(issueSvc, workspaceSvc)
```

2. `protected` 组内(workspace 路由之后)加:

```go
			// Issue blackboard
			protected.POST("/workspaces/:id/issues", issueHandler.Create)
			protected.GET("/workspaces/:id/issues", issueHandler.List)
			protected.GET("/workspaces/:id/issues/:issueId", issueHandler.Get)
			protected.PATCH("/workspaces/:id/issues/:issueId", issueHandler.Update)
			protected.POST("/workspaces/:id/issues/:issueId/comments", issueHandler.AddComment)
```

- [ ] **Step 3: 构建验证**

```bash
cd /d/odyssey/GitSquad && go build ./... && go vet ./...
```
预期:退出码 0。

- [ ] **Step 4: 提交**

```bash
git add internal/server/handler/
git commit -m "feat(issue): REST API for issues and comments"
```

---

### Task 6: 后端收尾验证

**Files:**
- 无新增

- [ ] **Step 1: 全量验证**

```bash
cd /d/odyssey/GitSquad && go test ./... && go build ./... && go vet ./...
```
预期:全部 PASS、退出码 0。

- [ ] **Step 2: 数据库冒烟(需要本地 Postgres)**

设置 `DATABASE_URL`(如 `postgres://postgres:postgres@localhost:5432/gitsquad`)后:

```bash
cd /d/odyssey/GitSquad && go run ./cmd/server
```

另开终端验证(先手动造一个 workspace 行或用现有用户登录拿 JWT;以下用 `$TOKEN` 占位):

```bash
curl -s -X POST http://localhost:8080/api/v1/workspaces/<WS_ID>/issues \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"First task","description":"hi @coder please fix"}'
# 预期 201,issue_key 形如 "GTS-1",status=backlog

curl -s -X POST http://localhost:8080/api/v1/workspaces/<WS_ID>/issues/<ISSUE_ID>/comments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"@coder do it now"}'
# 预期 201 + 评论流里出现一条 system 评论 "未匹配到 Workspace 中的任何 agent: @coder"(第 5 章前 agent 表为空)

curl -s -X PATCH http://localhost:8080/api/v1/workspaces/<WS_ID>/issues/<ISSUE_ID> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}'
# 预期 200 + 详情里多一条 status_change 评论
```

- [ ] **Step 3: 提交(如有收尾修改)**

```bash
git add -A && git commit -m "chore(issue): backend verification fixes"
```

---

### Task 7: 前端 API 层与 shadcn 组件补充

**Files:**
- Modify: `web/lib/api.ts`
- Modify: `web/components.json`(如 shadcn CLI 需要)
- 新增: `web/components/ui/dialog.tsx`、`web/components/ui/select.tsx`、`web/components/ui/textarea.tsx`(由 shadcn CLI 生成)

**Interfaces:**
- Produces(供 Task 8/9 使用):

```ts
export type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "blocked" | "cancelled";
export interface Issue {
  id: string;
  number: number;
  issue_key: string;
  title: string;
  description: string;
  status: IssueStatus;
  assigned_agents: string[];
  linked_prs: string[];
  creator_name: string;
  comments_count: number;
  created_at: string;
  updated_at: string;
}
export interface IssueComment {
  id: string;
  author_type: "user" | "agent" | "system";
  author_name: string;
  type: "comment" | "status_change" | "system";
  content: string;
  created_at: string;
}
export interface IssueDetail extends Issue { comments: IssueComment[]; }
```

- [ ] **Step 1: 添加 shadcn 组件**

```bash
cd /d/odyssey/GitSquad/web && bunx shadcn@latest add dialog select textarea
```
预期:生成 `components/ui/dialog.tsx`、`select.tsx`、`textarea.tsx`。
若网络不可用导致 CLI 失败,回退:手写最小 dialog/select/textarea(基于 `radix-ui` 依赖,参考现有 `badge.tsx` 的 shadcn 风格)。

- [ ] **Step 2: 扩展 lib/api.ts**

在 `web/lib/api.ts` 末尾追加:

```ts
export type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "blocked" | "cancelled";

export interface Issue {
  id: string;
  number: number;
  issue_key: string;
  title: string;
  description: string;
  status: IssueStatus;
  assigned_agents: string[];
  linked_prs: string[];
  creator_name: string;
  comments_count: number;
  created_at: string;
  updated_at: string;
}

export interface IssueComment {
  id: string;
  author_type: "user" | "agent" | "system";
  author_name: string;
  type: "comment" | "status_change" | "system";
  content: string;
  created_at: string;
}

export interface IssueDetail extends Issue {
  comments: IssueComment[];
}

export const ISSUE_STATUSES: IssueStatus[] = [
  "backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled",
];

export const issueApi = {
  list: (workspaceId: string) => api.get<Issue[]>(`/api/v1/workspaces/${workspaceId}/issues`),
  get: (workspaceId: string, issueId: string) =>
    api.get<IssueDetail>(`/api/v1/workspaces/${workspaceId}/issues/${issueId}`),
  create: (workspaceId: string, body: { title: string; description?: string }) =>
    api.post<Issue>(`/api/v1/workspaces/${workspaceId}/issues`, body),
  update: (workspaceId: string, issueId: string, body: { status?: IssueStatus; title?: string; description?: string }) =>
    api.patch<Issue>(`/api/v1/workspaces/${workspaceId}/issues/${issueId}`, body),
  addComment: (workspaceId: string, issueId: string, content: string) =>
    api.post<IssueComment>(`/api/v1/workspaces/${workspaceId}/issues/${issueId}/comments`, { content }),
};

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  blocked: "Blocked",
  cancelled: "Cancelled",
};
```

- [ ] **Step 3: 验证**

```bash
cd /d/odyssey/GitSquad/web && bun run lint && bunx tsc --noEmit
```
预期:无错误。

- [ ] **Step 4: 提交**

```bash
git add web/lib/api.ts web/components/ui/ web/components.json
git commit -m "feat(web): issue API client and UI components"
```

---

### Task 8: 七列看板页

**Files:**
- Create: `web/app/console/workspaces/[id]/issues/page.tsx`
- Modify: `web/app/console/workspaces/[id]/page.tsx`(加 Issues 入口链接)

**Interfaces:**
- Consumes: Task 7 的 `issueApi`、`ISSUE_STATUSES`、`ISSUE_STATUS_LABELS`、`Issue`、`IssueStatus`;shadcn `dialog/select/textarea/button/input/badge`
- Produces: 看板页路由 `/console/workspaces/[id]/issues`

- [ ] **Step 1: 创建看板页**

创建 `web/app/console/workspaces/[id]/issues/page.tsx`:

```tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, MessageSquare, Plus } from "lucide-react";
import { api } from "@/lib/api";
import {
  Issue, IssueStatus, ISSUE_STATUSES, ISSUE_STATUS_LABELS, issueApi,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function IssuesBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const load = () => {
    issueApi.list(id).then(setIssues).catch(() => router.push(`/console/workspaces/${id}`)).finally(() => setLoading(false));
  };
  useEffect(load, [id, router]);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await issueApi.create(id, { title, description });
      setTitle("");
      setDescription("");
      load();
    } finally {
      setCreating(false);
    }
  };

  const move = async (issueId: string, status: IssueStatus) => {
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, status } : i))
    );
    try {
      await issueApi.update(id, issueId, { status });
    } catch {
      load(); // revert to server truth on failure
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const byStatus = (s: IssueStatus) =>
    issues.filter((i) => i.status === s);

  return (
    <div className="flex h-full flex-col">
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
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              New Issue
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Issue</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Textarea
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <Button disabled={!title.trim() || creating} onClick={create} className="w-full">
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto p-8">
        {ISSUE_STATUSES.map((status) => (
          <div
            key={status}
            className="flex min-h-full w-72 shrink-0 flex-col rounded-xl border bg-muted/30"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (draggingId) move(draggingId, status);
              setDraggingId(null);
            }}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-medium">{ISSUE_STATUS_LABELS[status]}</span>
              <Badge variant="secondary">{byStatus(status).length}</Badge>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-2">
              {byStatus(status).map((issue) => (
                <div
                  key={issue.id}
                  draggable
                  onDragStart={() => setDraggingId(issue.id)}
                  onClick={() => router.push(`/console/workspaces/${id}/issues/${issue.id}`)}
                  className="cursor-pointer rounded-lg border bg-card p-3 transition-shadow hover:shadow-md"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-body">{issue.issue_key}</span>
                    <span className="flex items-center gap-1 text-xs text-body">
                      <MessageSquare className="size-3" />
                      {issue.comments_count ?? 0}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium">{issue.title}</p>
                  {issue.assigned_agents.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {issue.assigned_agents.map((a) => (
                        <Badge key={a} variant="outline">{a}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

说明:`comments_count` 由后端提供(Task 2 查询带出、Task 4 的 `IssueResponse` 字段),前端直接用。

- [ ] **Step 2: workspace 详情页加入口**

在 `web/app/console/workspaces/[id]/page.tsx` 的 header 区域(返回按钮之后)加:

```tsx
      <button
        onClick={() => router.push(`/console/workspaces/${id}/issues`)}
        className="mb-6 flex items-center gap-1 text-sm text-body transition-colors hover:text-ink"
      >
        Issues →
      </button>
```

(或按现有页面布局放到合适位置,保证文案为 "Issues" 指向 `/console/workspaces/${id}/issues`。)

- [ ] **Step 3: 验证**

```bash
cd /d/odyssey/GitSquad/web && bun run lint && bunx tsc --noEmit
```
预期:无错误。

- [ ] **Step 4: 提交**

```bash
git add web/app/console/workspaces/ web/lib/api.ts
git commit -m "feat(web): seven-column issue kanban board"
```

---

### Task 9: Issue 详情页(评论流)

**Files:**
- Create: `web/app/console/workspaces/[id]/issues/[issueId]/page.tsx`

**Interfaces:**
- Consumes: Task 7 的 `issueApi`、`ISSUE_STATUS_LABELS`、`IssueDetail`;shadcn `select/button/badge/textarea/input`

- [ ] **Step 1: 创建详情页**

创建 `web/app/console/workspaces/[id]/issues/[issueId]/page.tsx`:

```tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Send } from "lucide-react";
import {
  IssueDetail, IssueStatus, ISSUE_STATUSES, ISSUE_STATUS_LABELS, issueApi,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string; issueId: string }>;
}) {
  const { id, issueId } = use(params);
  const router = useRouter();
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);

  const load = () => {
    issueApi.get(id, issueId).then(setIssue).catch(() => router.push(`/console/workspaces/${id}/issues`)).finally(() => setLoading(false));
  };
  useEffect(load, [id, issueId, router]);

  const changeStatus = async (status: IssueStatus) => {
    if (!issue || status === issue.status) return;
    const updated = await issueApi.update(id, issueId, { status });
    setIssue((prev) => (prev ? { ...prev, ...updated } : prev));
    load(); // pick up the new status_change comment
  };

  const post = async () => {
    if (!content.trim()) return;
    setPosting(true);
    try {
      await issueApi.addComment(id, issueId, content);
      setContent("");
      load();
    } finally {
      setPosting(false);
    }
  };

  if (loading || !issue) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <button
        onClick={() => router.push(`/console/workspaces/${id}/issues`)}
        className="mb-6 flex items-center gap-1 text-sm text-body transition-colors hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        Issues
      </button>

      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-body">{issue.issue_key}</span>
        <Select value={issue.status} onValueChange={(v) => changeStatus(v as IssueStatus)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ISSUE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{ISSUE_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {issue.assigned_agents.map((a) => (
          <Badge key={a} variant="outline">{a}</Badge>
        ))}
      </div>

      <h1 className="mb-2 text-2xl font-semibold">{issue.title}</h1>
      {issue.description && (
        <p className="mb-6 whitespace-pre-wrap text-body">{issue.description}</p>
      )}

      <div className="space-y-3">
        {issue.comments.map((c) => (
          <div
            key={c.id}
            className={`rounded-lg border p-3 ${
              c.type !== "comment" ? "bg-muted/30 text-body" : "bg-card"
            }`}
          >
            <div className="mb-1 flex items-center gap-2 text-xs text-body">
              <span className="font-medium">
                {c.type === "system" ? "System" : c.author_name}
              </span>
              <span>{new Date(c.created_at).toLocaleString()}</span>
              {c.type !== "comment" && (
                <Badge variant="secondary">{c.type}</Badge>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm">{c.content}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <Textarea
          placeholder="Add a comment… (@mention an agent)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <Button disabled={!content.trim() || posting} onClick={post} className="shrink-0">
          <Send className="size-4" />
          Post
        </Button>
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
git add web/app/console/workspaces/
git commit -m "feat(web): issue detail page with comment stream"
```

---

### Task 10: 前端测试与整体验证

**Files:**
- Create: `web/lib/issues.test.ts`
- Modify: `web/package.json`(test 脚本)

- [ ] **Step 1: 写纯函数测试(状态分组与 key 解析)**

创建 `web/lib/issues.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ISSUE_STATUSES, Issue } from "./api";

function groupByStatus(issues: Issue[]) {
  return ISSUE_STATUSES.map((s) => ({
    status: s,
    issues: issues.filter((i) => i.status === s),
  }));
}

const makeIssue = (id: string, status: Issue["status"]): Issue => ({
  id, number: 1, issue_key: "GTS-1", title: id, description: "",
  status, assigned_agents: [], linked_prs: [], creator_name: "tester",
  comments_count: 0,
  created_at: "2026-08-24T00:00:00Z", updated_at: "2026-08-24T00:00:00Z",
});

describe("groupByStatus", () => {
  test("groups issues into all seven columns", () => {
    const groups = groupByStatus([
      makeIssue("a", "backlog"),
      makeIssue("b", "done"),
      makeIssue("c", "backlog"),
    ]);
    expect(groups.length).toBe(7);
    expect(groups[0].issues).toHaveLength(2); // backlog
    expect(groups[4].issues).toHaveLength(1); // done
  });
});
```

- [ ] **Step 2: 更新 test 脚本并运行**

把 `web/package.json` 的 test 脚本改为:

```json
"test": "bun test app/page.test.mjs lib/issues.test.ts"
```

运行:

```bash
cd /d/odyssey/GitSquad/web && bun test
```
预期:全部 PASS。

- [ ] **Step 3: 全量验证**

```bash
cd /d/odyssey/GitSquad/web && bun run lint && bun run build
cd /d/odyssey/GitSquad && go test ./... && go build ./... && go vet ./...
```
预期:全部通过、零警告。

- [ ] **Step 4: 提交**

```bash
git add web/package.json web/lib/issues.test.ts
git commit -m "test(web): issue board grouping tests"
```

---

### Task 11: 同步 openspec 进度与设计文档收尾

**Files:**
- Modify: `openspec/changes/build-gitsquad-mvp/tasks.md`
- Modify: `openspec/changes/build-gitsquad-mvp/specs/issue-blackboard/spec.md`

- [ ] **Step 1: 更新 tasks.md 第 4 章**

把 4.1–4.6 六项勾选为 `[x]`,并在清单外已实现追加一条:

```markdown
- Issue 黑板全链路:7 态状态机(backlog 默认)、GTS-42 式编号、评论三类型(user/agent/system)不可编辑、@mention 解析(代码块跳过 + 系统提示 + 派发钩子)、七列看板 + 详情页(设计文档:docs/superpowers/specs/2026-08-24-issue-blackboard-design.md)
```

- [ ] **Step 2: 更新 issue-blackboard spec.md 的状态模型**

把 spec.md 中"open → in_progress → done(外加可选 closed)"的状态描述替换为 7 态枚举,并补充编号 Requirement:

```markdown
#### Scenario: Issue 使用平台内编号

- **WHEN** 用户在 Workspace 创建 Issue
- **THEN** 系统 MUST 分配形如 `GTS-42` 的 workspace 内顺序编号(workspace 名前 3 大写字母为前缀,编号全局唯一于 workspace),且该编号用于评论互提与 PR body 引用
```

- [ ] **Step 3: 提交**

```bash
git add openspec/
git commit -m "docs: mark chapter 4 (issue blackboard) complete and sync spec"
```

---

## Self-Review 结果

- **Spec 覆盖**:4.1 数据模型(Task 1/2)、4.2 CRUD API(Task 5)、4.3 评论流(Task 4/5)、4.4 @mention 解析器(Task 3/4)、4.5 状态机(Task 4)、4.6 source_upstream_issue 持久化不触发逻辑(Task 1/4)、前端看板(Task 8)、详情页(Task 9)。✓
- **类型一致性**:`IssueResponse`/`CommentResponse`/`IssueDetailResponse` 定义一次,后续 Task 全部引用;`processMentions` 签名在 Task 3 定义、Task 4 使用;`issueApi.*` 与后端路由一一对应。✓
- **占位符**:`dispatchForMention` 为有意的空实现(第 9 章钩子,已注释),`listAgentNames` 同理;无 TBD/TODO。✓
- **已知依赖**:Task 4 依赖 Task 2 的 Row 结构(sqlc 生成 `IssuePrefix`/`CreatorName`/`CommentsCount` 字段),已把对应 SQL 修正写进 Task 4 Step 3;若 `go build` 中途报字段缺失,先 `sqlc generate` 再对照 Step 3 的 SQL。✓
