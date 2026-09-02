"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
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
import { Plus, ChevronRight } from "lucide-react";
import {
  Issue,
  IssueStatus,
  ISSUE_STATUSES,
  issueApi,
  api,
  Workspace,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { MarkdownEditor } from "@/components/markdown-editor";
import { StatusIconLabel } from "@/components/status-icon";
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
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<IssueStatus>("backlog");
  const [creating, setCreating] = useState(false);
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

  const load = () => {
    issueApi
      .list(id)
      .then(setIssues)
      .catch(() => router.push("/console/workspaces"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id, router]);

  useEffect(() => {
    api
      .get<Workspace>(`/api/v1/workspaces/${id}`)
      .then(setWorkspace)
      .catch(() => {});
  }, [id]);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await issueApi.create(id, { title, description, status });
      setTitle("");
      setDescription("");
      setStatus("backlog");
      setOpen(false);
      load();
    } finally {
      setCreating(false);
    }
  };

  const openCreate = (initial: IssueStatus) => {
    setTitle("");
    setDescription("");
    setStatus(initial);
    setOpen(true);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setTitle("");
      setDescription("");
      setStatus("backlog");
    }
  };

  const move = async (issueId: string, status: IssueStatus) => {
    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, status } : i)),
    );
    try {
      await issueApi.update(id, issueId, { status });
    } catch {
      load(); // revert to server truth on failure
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
    return sortIssues(filterIssues(issues, filters), sort);
  }, [issues, filters, sort]);

  const activeIssue = useMemo(
    () => (activeId ? issues.find((i) => i.id === activeId) ?? null : null),
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

  const byStatus = (s: IssueStatus) =>
    visibleIssues.filter((i) => i.status === s);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-8 pb-4 pt-6">
        <IssuesToolbar
          issues={issues}
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
              issues={byStatus(status)}
              onCreate={openCreate}
              onOpen={(issueId) =>
                router.push(`/console/workspaces/${id}/issues/${issueId}`)
              }
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

      {/* Create issue dialog */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex h-[460px] max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogTitle className="sr-only">Create issue</DialogTitle>
          <div className="flex items-center gap-1.5 px-5 pr-12 pt-3 text-xs text-mute">
            <span className="truncate">{workspace?.name ?? "Workspace"}</span>
            <ChevronRight className="size-3 shrink-0 text-mute/50" />
            <span className="shrink-0 font-medium text-ink">Create issue</span>
          </div>
          <input
            autoFocus
            placeholder="Issue title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="px-5 pb-2 pt-3 text-lg font-semibold text-ink outline-none placeholder:text-mute"
          />
          <MarkdownEditor
            onChange={setDescription}
            placeholder="Describe the issue…"
            className="min-h-0 flex-1 overflow-y-auto px-5 py-3"
          />
          <div className="flex items-center justify-between border-t border-hairline px-4 py-3">
            <Select value={status} onValueChange={(v) => setStatus(v as IssueStatus)}>
              <SelectTrigger className="h-8 w-auto">
                <StatusIconLabel status={status} />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                {ISSUE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <StatusIconLabel status={s} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button disabled={!title.trim() || creating} onClick={create}>
              Create issue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
