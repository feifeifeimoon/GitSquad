"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Activity,
  GitBranch,
  GitPullRequest,
  MessageSquare,
  UserCheck,
  UserRoundPlus,
} from "lucide-react";

import { ISSUE_STATUS_LABELS, type AgentState, type IssueAgent, type IssueStatus } from "@/lib/api";
import { AgentStack } from "@/components/issues/agent-chip";
import { ProviderIcon } from "@/components/provider-icon";
import { StatusIcon, STATUS_TONE } from "@/components/status-icon";
import { AgentStatusBadge } from "@/components/status-dot";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// A picture of the console, drawn in the console's own parts.
//
// This replaces a dark panel captioned "Squad control center v2.4.0" holding
// four agents with emoji faces, a CPU column and "Squad net uptime: 1,482
// hours". Every one of those numbers was invented, and none of them is a thing
// the product measures — the design system says mono is the voice of the
// machine, and it was speaking for a machine that does not exist. It also
// described the wrong product: GitSquad is a board where issues move and a
// thread where agents answer, and neither was on the page.
//
// So this is the real thing's own vocabulary. `StatusIcon`, `AgentStack`,
// `WorkspaceAvatar`, `AgentStatusBadge` and `ProviderIcon` are the production
// components; the column and card class strings are copied from
// `components/issues/board-column.tsx` and `board-card.tsx`, which the live
// board builds on dnd-kit and a workspace that a landing page does not have.
//
// Timestamps are written as labels rather than derived from `Date.now()`. A
// relative timestamp computed at render time differs between the server pass
// and hydration, and a demo that has to be re-read to stay true is worse than
// one that says "2h" and means it.

type LogLine = { op: string; text: string; note?: string };

type ThreadEntry =
  | { kind: "person"; author: string; time: string; body: string; event?: never }
  | { kind: "agent"; author: string; time: string; body: string; event?: never }
  | { kind: "event"; time: string; body: string; author?: never };

// A reviewer that types "status_change" and reads as a person, or four
// sentences the server wrote — the feed tells them apart and so does this.
const EVENT_ICON = {
  status: GitBranch,
  agents: UserRoundPlus,
  assignee: UserCheck,
  other: Activity,
} as const;

interface DemoIssue {
  key: string;
  title: string;
  status: IssueStatus;
  agents: IssueAgent[];
  pr?: { number: number; state: "open" | "merged" };
  comments: number;
  updated: string;
  run: { runtime: string; provider: string; branch?: string; tokens: string; elapsed: string };
  log: LogLine[];
  thread: (ThreadEntry & { icon?: keyof typeof EVENT_ICON })[];
}

/** The demo workspace is the product's own repository. It costs nothing and it
 * answers the first question a reader has — "what does this look like in use?"
 * — with something they can go and read. The issue keys follow from the name:
 * `deriveIssuePrefix` takes its first three letters, so GitSquad issues are GIT. */
const WORKSPACE = { name: "GitSquad", repo: "feifeifeimoon/GitSquad" };

/** An agent's picture, cut from the same renders the hero uses. The board is
 * where these characters work, and the faces are already on the page two
 * sections up; a monogram here would be a second, unrelated identity for the
 * same name. `agent-chip.tsx` draws whatever `avatar_url` it is given, so this
 * exercises the real path rather than a demo-only one. */
const AVATAR: Record<string, string> = {
  coder: "/robots/v2/avatars/tester.png",
  reviewer: "/robots/v2/avatars/inspector.png",
  planner: "/robots/v2/avatars/planner.png",
};

const agent = (name: string, state: AgentState): IssueAgent => ({
  id: `agent-${name}`,
  name,
  avatar_url: AVATAR[name] ?? "",
  state,
});

const ISSUES: DemoIssue[] = [
  {
    key: "GIT-151",
    title: "Register more than one daemon per workspace",
    status: "backlog",
    agents: [],
    comments: 2,
    updated: "3d",
    run: { runtime: "planning", provider: "antigravity", tokens: "6.1k", elapsed: "48s" },
    log: [
      { op: "read", text: "internal/server/store/schema.sql" },
      { op: "note", text: "agent_runtimes already keys on daemon_id" },
      { op: "write", text: "plan.md", note: "3 steps" },
    ],
    thread: [
      {
        kind: "person",
        author: "Dana Ellis",
        time: "3d",
        body: "One daemon per workspace is a real limit — I want the desktop and the build box both registered against the same agents.",
      },
      {
        kind: "person",
        author: "Marcus Webb",
        time: "3d",
        body: "The runtime rows already carry a daemon id, so this may be mostly the workspace page. Worth a spike before we size it.",
      },
    ],
  },
  {
    key: "GIT-147",
    title: "Publish a changelog page for self-hosted installs",
    status: "todo",
    agents: [],
    comments: 2,
    updated: "1d",
    run: { runtime: "planning", provider: "antigravity", tokens: "3.4k", elapsed: "22s" },
    log: [
      { op: "read", text: "GET /repos/{owner}/{repo}/releases" },
      { op: "note", text: "no new table — read through and render" },
      { op: "write", text: "plan.md", note: "4 steps" },
    ],
    thread: [
      {
        kind: "person",
        author: "Marcus Webb",
        time: "1d",
        body: "Self-hosting means the release notes on GitHub are the only changelog anyone sees. Can we render them in the console?",
      },
      {
        kind: "agent",
        author: "planner",
        time: "1d",
        body: "Scoped: read the releases feed through the existing GitHub client and render it read-only. No schema change, no caching layer to start.",
      },
    ],
  },
  {
    key: "GIT-146",
    title: "Show token spend on the issue, not only on the usage page",
    status: "todo",
    agents: [],
    comments: 3,
    updated: "20h",
    run: { runtime: "planning", provider: "antigravity", tokens: "4.9k", elapsed: "31s" },
    log: [
      { op: "read", text: "internal/server/store/queries/task.sql" },
      { op: "grep", text: "tokens", note: "task rows already carry the cost" },
      { op: "write", text: "plan.md", note: "2 steps" },
    ],
    thread: [
      {
        kind: "person",
        author: "Marcus Webb",
        time: "1d",
        body: "I can see what the month cost but not which issue it went to, so the number never changes a decision.",
      },
      {
        kind: "person",
        author: "Dana Ellis",
        time: "20h",
        body: "@planner can you check whether the task rows carry the cost yet? I do not want to guess at this one.",
      },
      {
        kind: "agent",
        author: "planner",
        time: "20h",
        body: "They do. Tasks store tokens and the issue key, so this is a read-side change on the issue endpoint — about half a day.",
      },
    ],
  },
  {
    key: "GIT-142",
    title: "Requeue a task when the daemon loses its connection",
    status: "in_progress",
    agents: [agent("coder", "running")],
    pr: { number: 212, state: "open" },
    comments: 6,
    updated: "44m",
    run: {
      runtime: "claude",
      provider: "claude",
      branch: "coder/GIT-142-requeue-on-drop",
      tokens: "18.4k",
      elapsed: "2m 14s",
    },
    log: [
      { op: "read", text: "internal/daemon/runner/runner.go" },
      { op: "edit", text: "internal/daemon/runner/runner.go", note: "+38 −4" },
      { op: "bash", text: "go test ./internal/daemon/...", note: "ok 3.2s" },
      { op: "push", text: "coder/GIT-142-requeue-on-drop" },
      { op: "gh", text: "pr create", note: "#212" },
    ],
    thread: [
      {
        kind: "person",
        author: "Dana Ellis",
        time: "2h",
        body: "The runner gives up the moment the socket drops, so closing the lid leaves the issue sitting in Running forever. @coder can you take it?",
      },
      {
        kind: "agent",
        author: "coder",
        time: "2h",
        body: "On it. Plan: a heartbeat every 30 seconds, a requeue once the server has missed three of them, and a test that kills the socket mid-run.",
      },
      {
        kind: "event",
        icon: "status",
        time: "58m",
        body: "coder cloned feifeifeimoon/GitSquad at 9f2c1da",
      },
      { kind: "event", icon: "status", time: "46m", body: "coder opened pull request #212" },
      {
        kind: "agent",
        author: "coder",
        time: "44m",
        body: "Requeued and resumed. The board shows Queued rather than Running while it waits for the next heartbeat — 18.4k tokens over 2m 14s.",
      },
    ],
  },
  {
    key: "GIT-139",
    title: "Bound the activity feed to the newest fifty entries",
    status: "in_review",
    agents: [agent("reviewer", "running")],
    pr: { number: 211, state: "open" },
    comments: 4,
    updated: "2h",
    run: {
      runtime: "claude",
      provider: "claude",
      branch: "coder/GIT-139-feed-cap",
      tokens: "12.7k",
      elapsed: "1m 41s",
    },
    log: [
      { op: "read", text: "internal/server/service/issue.go" },
      { op: "edit", text: "internal/server/service/issue.go", note: "+12 −3" },
      { op: "bash", text: "go test ./internal/server/service/...", note: "ok 8.7s" },
      { op: "gh", text: "pr review 211", note: "changes requested" },
    ],
    thread: [
      {
        kind: "person",
        author: "Marcus Webb",
        time: "5h",
        body: "One of our issues has three hundred comments and the page loads all of them. Cap it.",
      },
      {
        kind: "agent",
        author: "coder",
        time: "4h",
        body: "Capped at the newest fifty with a link back to the earlier ones. Pull request #211.",
      },
      {
        kind: "event",
        icon: "assignee",
        time: "2h",
        body: "reviewer requested changes on #211",
      },
      {
        kind: "agent",
        author: "reviewer",
        time: "2h",
        body: "The cursor is the row id but the feed is ordered by created_at, so two entries in the same millisecond can repeat across a page boundary. Key the cursor on both.",
      },
    ],
  },
  {
    key: "GIT-134",
    title: "Derive agent state from the task queue",
    status: "done",
    agents: [agent("coder", "idle")],
    pr: { number: 204, state: "merged" },
    comments: 5,
    updated: "1d",
    run: { runtime: "claude", provider: "claude", tokens: "9.8k", elapsed: "1m 06s" },
    log: [
      { op: "read", text: "internal/server/service/agent.go" },
      { op: "edit", text: "internal/server/service/agent.go", note: "+24 −19" },
      { op: "edit", text: "web/components/issues/agent-chip.tsx", note: "+6 −2" },
      { op: "bash", text: "go test ./...", note: "214 passed" },
    ],
    thread: [
      {
        kind: "person",
        author: "Dana Ellis",
        time: "2d",
        body: "Agents sit on Idle while they are plainly mid-task. The browser should not be guessing this at all.",
      },
      {
        kind: "agent",
        author: "coder",
        time: "2d",
        body: "Agreed — the queue already knows. Deriving state per issue and agent on the server, and dropping the run count the card was inferring from.",
      },
      { kind: "event", icon: "status", time: "1d", body: "coder merged pull request #204" },
      { kind: "event", icon: "agents", time: "1d", body: "Dana Ellis moved GIT-134 to Done" },
    ],
  },
];

const COLUMNS: IssueStatus[] = ["backlog", "todo", "in_progress", "in_review", "done"];

const DEFAULT_KEY = "GIT-142";

export function DemoBoard() {
  const [selectedKey, setSelectedKey] = useState(DEFAULT_KEY);
  const selected = ISSUES.find((issue) => issue.key === selectedKey) ?? ISSUES[0];

  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-xl border border-hairline bg-canvas shadow-level-3">
        {/* Window chrome: the same two facts the console header carries — which
            workspace, and which repository it is looking at. */}
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
          <WorkspaceAvatar name={WORKSPACE.name} className="size-5 text-micro" />
          <span className="text-label font-semibold text-ink">{WORKSPACE.name}</span>
          <span className="font-mono text-caption text-mute">{WORKSPACE.repo}</span>
          <span className="ml-auto hidden lg:block">
            <AgentStatusBadge status="running" detail={selected.key} />
          </span>
        </div>

        {/* The board. Columns hold their width and the row scrolls, because a
            reflowed board stops being a board — the same rule the console
            follows. The row is `page` and the columns are `canvas-soft`, which is
            the console's own ladder: a column reads as a well sunk into the page,
            where sitting them on their own colour made the two indistinguishable
            and left the hairlines doing all the work.
            The columns are 272px rather than the console's 288 for one reason:
            four of 288 do not divide into this frame, so the fourth came out
            sliced through a card and read as a layout bug. The console's board is
            free to scroll because it *is* a board; this is a picture of one. */}
        <div className="flex gap-2 overflow-x-auto bg-page p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {COLUMNS.map((status) => (
            <DemoColumn
              key={status}
              status={status}
              selectedKey={selected.key}
              onSelect={setSelectedKey}
            />
          ))}
        </div>
        <div className="grid border-t border-hairline lg:grid-cols-[minmax(0,1fr)_20rem]">
          <DemoThread issue={selected} />

          <div className="border-t border-hairline p-4 lg:border-l lg:border-t-0">
            <div className="flex items-center gap-2">
              <ProviderIcon provider={selected.run.provider} className="size-3.5" />
              <span className="text-label font-semibold text-ink">Run</span>
              <span className="font-mono text-caption text-mute">{selected.run.runtime}</span>
            </div>

            <div className="mt-3 space-y-1 font-mono text-[11px] leading-5">
              {selected.log.map((line) => (
                <p key={`${line.op}-${line.text}`} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2">
                  <span className="text-mute">{line.op}</span>
                  <span className="min-w-0 text-body">
                    <span className="break-all">{line.text}</span>
                    {line.note && <span className="ml-1 text-mute">{line.note}</span>}
                  </span>
                </p>
              ))}
            </div>

            <dl className="mt-4 space-y-1.5 border-t border-hairline pt-3 text-caption">
              {selected.run.branch && (
                <div className="flex gap-2">
                  <dt className="text-mute">Branch</dt>
                  <dd className="min-w-0 flex-1 truncate text-right font-mono text-body">
                    {selected.run.branch}
                  </dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-mute">Tokens</dt>
                <dd className="flex-1 text-right font-mono tabular-nums text-body">
                  {selected.run.tokens}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-mute">Elapsed</dt>
                <dd className="flex-1 text-right font-mono tabular-nums text-body">
                  {selected.run.elapsed}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <figcaption className="mt-4 text-center text-caption text-mute">
        A demo workspace. Select a card to read its thread — board, activity and
        the run are the three surfaces one issue lives on.
      </figcaption>
    </figure>
  );
}

function DemoColumn({
  status,
  selectedKey,
  onSelect,
}: {
  status: IssueStatus;
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const issues = ISSUES.filter((issue) => issue.status === status);

  return (
    <div className="flex w-[272px] shrink-0 flex-col rounded-xl border border-hairline bg-canvas-soft">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <StatusIcon status={status} />
        <span className="text-label font-semibold text-ink">{ISSUE_STATUS_LABELS[status]}</span>
        <span className="text-caption tabular-nums text-mute">{issues.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2 pt-0">
        {issues.map((issue) => (
          <DemoCard
            key={issue.key}
            issue={issue}
            selected={issue.key === selectedKey}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function DemoCard({
  issue,
  selected,
  onSelect,
}: {
  issue: DemoIssue;
  selected: boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(issue.key)}
      aria-pressed={selected}
      className={cn(
        // board-card.tsx, verbatim, minus the drag handle and plus a selected
        // edge — on the live board the click leaves the page rather than
        // changing what is on it.
        "relative w-full overflow-hidden rounded-lg border bg-canvas p-3 pl-3.5 text-left shadow-level-1 transition-shadow hover:shadow-level-2",
        selected ? "border-hairline-strong" : "border-hairline",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-0.5", STATUS_TONE[issue.status].bar)}
      />

      <p className="line-clamp-2 text-copy font-medium text-ink">{issue.title}</p>

      <span className="mt-2 flex items-center gap-2">
        <span className="shrink-0 font-mono text-micro text-mute">{issue.key}</span>

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <AgentStack agents={issue.agents} />
          {issue.pr && (
            <Badge variant="outline" className="gap-1 font-mono text-[10px]">
              <GitPullRequest className="size-3" />#{issue.pr.number}
            </Badge>
          )}
          {issue.comments > 0 && (
            <span className="flex items-center gap-1 text-micro tabular-nums text-mute">
              <MessageSquare className="size-3" />
              {issue.comments}
            </span>
          )}
          <span className="text-micro tabular-nums text-mute">{issue.updated}</span>
        </span>
      </span>
    </button>
  );
}

function DemoThread({ issue }: { issue: DemoIssue }) {
  return (
    <div className="min-w-0 p-4 sm:p-5">
      {/* The identifier and the title as one run of text in one font, which is
          how the issue page's own header reads. */}
      <div className="flex items-start gap-2">
        <StatusIcon status={issue.status} className="mt-0.5 size-3.5" />
        <h3 className="min-w-0 text-title-sm font-semibold text-ink">
          {issue.key} {issue.title}
        </h3>
        <span className="ml-auto hidden shrink-0 items-center gap-1.5 self-center text-micro tabular-nums text-mute sm:flex">
          {issue.agents.find((a) => a.state === "running")?.name ?? "nobody"}
          <span aria-hidden="true">·</span>
          updated {issue.updated} ago
        </span>
      </div>

      <div className="mt-4 space-y-1">
        {issue.thread.map((entry, index) => (
          <ThreadRow key={index} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function ThreadRow({ entry }: { entry: ThreadEntry & { icon?: keyof typeof EVENT_ICON } }) {
  if (entry.kind === "event") {
    const Icon = EVENT_ICON[entry.icon ?? "other"];
    return (
      <div className="flex items-center gap-2 py-1.5 text-caption text-mute">
        <span className="flex size-4 shrink-0 items-center justify-center">
          <Icon className="size-3" />
        </span>
        <span className="min-w-0 flex-1 truncate">{entry.body}</span>
        <span className="shrink-0">{entry.time}</span>
      </div>
    );
  }

  const isAgent = entry.kind === "agent";
  return (
    <div className="flex gap-3 py-2">
      {/* Two kinds of speaker, drawn two ways. An agent wears the face it has in
          the hero; a person wears the console's monogram. Before this every
          agent was the same Bot glyph and every person the same User glyph,
          which is one avatar per *kind* in a thread whose whole point is who
          said what.
          `rounded-sm`, not a circle: a circle clips the four corners of a square
          portrait, and on a 24px robot head the corners are the hat and the chin
          — the two things that say which robot it is. It is also what
          `WorkspaceAvatar` does everywhere else in the console. */}
      {isAgent ? (
        <Image
          src={AVATAR[entry.author] ?? "/robots/v2/avatars/inspector.png"}
          alt=""
          width={24}
          height={24}
          className="size-6 shrink-0 rounded-sm"
        />
      ) : (
        <WorkspaceAvatar name={entry.author} className="size-6 shrink-0 text-micro" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-copy font-medium text-ink">
            {isAgent ? `@${entry.author}` : entry.author}
          </span>
          <span className="text-caption text-mute">{entry.time}</span>
        </div>
        <p className="mt-1.5 text-pretty text-copy leading-6 text-body">{entry.body}</p>
      </div>
    </div>
  );
}
