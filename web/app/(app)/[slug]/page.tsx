"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import {
  Issue,
  IssueStatus,
  ISSUE_STATUSES,
  issueApi,
  api,
  Workspace,
  Agent,
  agentApi,
} from "@/lib/api";
import { paths } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CreateIssueDialog } from "@/components/issues/create-issue-dialog";
import { setApiData, useApi } from "@/lib/query";
import { IssueCard } from "@/components/issues/board-card";
import { BoardColumn } from "@/components/issues/board-column";
import { IssuesToolbar } from "@/components/issues/issues-toolbar";
import {
  DEFAULT_SORT,
  EMPTY_FILTERS,
  filterIssues,
  sortIssues,
  type IssueFilters,
  type SortState,
} from "@/lib/issue-filters";

export default function WorkspaceBoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const issuesKey = `/api/v1/workspaces/${slug}/issues`;
  const { data: issues, loading, refresh: refreshIssues } = useApi<Issue[]>(
    issuesKey,
    () => issueApi.list(slug),
  );
  const { data: workspace } = useApi<Workspace>(
    `/api/v1/workspaces/${slug}`,
    () => api.get<Workspace>(`/api/v1/workspaces/${slug}`),
  );
  const { data: agents } = useApi<Agent[]>(
    `/api/v1/workspaces/${slug}/agents`,
    () => agentApi.list(slug),
  );
  // Which status a new issue should start in, and which opening of the dialog
  // this is. The counter is the dialog's key: it hands each opening a fresh
  // component (and so an empty draft) without remounting on close, which would
  // cut off the dialog's exit animation.
  const [createStatus, setCreateStatus] = useState<IssueStatus | null>(null);
  const [createSession, setCreateSession] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filters, setFilters] = useState<IssueFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [isPanning, setIsPanning] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ startX: number; scrollLeft: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Grab empty board space and drag to pan horizontally. Cards still drag
  // via dnd-kit — mousedown on a card (or any control) never starts a pan.
  const onBoardMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-issue-card], button, a, input, select")) return;
    const el = boardRef.current;
    if (!el) return;
    e.preventDefault();
    panRef.current = { startX: e.clientX, scrollLeft: el.scrollLeft };
    setIsPanning(true);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const pan = panRef.current;
      const el = boardRef.current;
      if (!pan || !el) return;
      el.scrollLeft = pan.scrollLeft - (e.clientX - pan.startX);
    };
    const onUp = () => {
      panRef.current = null;
      setIsPanning(false);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Realtime needs no wiring here: the shell holds the socket, and an event
  // invalidates this path, which re-reads it. Agent activity changes issue
  // status and comment counts, so the board stays current without a reload.
  const agentNames = useMemo(
    () => (agents ?? []).filter((a) => a.enabled).map((a) => a.name),
    [agents],
  );

  const openCreate = useCallback((initial: IssueStatus) => {
    setCreateSession((n) => n + 1);
    setCreateStatus(initial);
  }, []);

  const closeCreate = useCallback((open: boolean) => {
    if (!open) setCreateStatus(null);
  }, []);

  const openIssue = useCallback(
    (issueKey: string) => router.push(paths.workspace(slug).issue(issueKey)),
    [router, slug],
  );

  const move = async (issueId: string, status: IssueStatus) => {
    setApiData<Issue[]>(issuesKey, (current = []) =>
      current.map((i) => (i.id === issueId ? { ...i, status } : i)),
    );
    try {
      await issueApi.update(slug, issueId, { status });
    } catch {
      refreshIssues(); // revert to server truth on failure
      toast.error("Failed to move issue");
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const status = over.id as IssueStatus;
    if (ISSUE_STATUSES.includes(status)) {
      move(String(active.id), status);
    }
  };

  const visibleIssues = useMemo(() => {
    return sortIssues(filterIssues(issues ?? [], filters), sort);
  }, [issues, filters, sort]);

  // One pass into per-status arrays, memoized: the columns are memoized on
  // their array identity, so re-filtering per column on every render would both
  // cost seven passes over the board and hand every column a new array.
  const byStatus = useMemo(() => {
    const map = Object.fromEntries(
      ISSUE_STATUSES.map((s) => [s, [] as Issue[]]),
    ) as Record<IssueStatus, Issue[]>;
    for (const issue of visibleIssues) map[issue.status].push(issue);
    return map;
  }, [visibleIssues]);

  const activeIssue = useMemo(
    () => (activeId ? (issues ?? []).find((i) => i.id === activeId) ?? null : null),
    [activeId, issues],
  );

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-8 pb-4 pt-6">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-52" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="flex flex-1 gap-4 overflow-x-auto p-8 pt-0">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="w-72 shrink-0 rounded-xl border border-hairline/50 bg-muted/40 p-2"
            >
              <div className="flex items-center gap-2 px-1.5 py-2">
                <Skeleton className="size-3.5 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="ml-auto h-4 w-4" />
              </div>
              <div className="space-y-2 p-1">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-8 pb-4 pt-6">
        <IssuesToolbar
          issues={issues ?? []}
          filters={filters}
          onFiltersChange={setFilters}
          sort={sort}
          onSortChange={setSort}
        />
        <Button onClick={() => openCreate("backlog")}>
          <Plus className="size-4" />
          New Issue
        </Button>
      </div>

      <div
        ref={boardRef}
        onMouseDown={onBoardMouseDown}
        className={`flex flex-1 gap-4 overflow-x-auto p-8 pt-0 ${
          isPanning ? "cursor-grabbing select-none" : ""
        }`}
      >
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          {ISSUE_STATUSES.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              issues={byStatus[status]}
              onCreate={openCreate}
              onOpen={openIssue}
            />
          ))}
          <DragOverlay dropAnimation={null}>
            {activeIssue ? (
              <div
                className="rotate-2 cursor-grabbing rounded-lg shadow-level-4"
                style={{ width: 272 }}
              >
                <IssueCard issue={activeIssue} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <CreateIssueDialog
        key={createSession}
        slug={slug}
        workspaceName={workspace?.name ?? "Workspace"}
        open={createStatus !== null}
        initialStatus={createStatus ?? "backlog"}
        onOpenChange={closeCreate}
        onCreated={refreshIssues}
        mentionItems={agentNames}
      />
    </div>
  );
}
