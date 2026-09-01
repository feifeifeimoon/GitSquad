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
import { Markdown } from "@/components/markdown";

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
    issueApi
      .get(id, issueId)
      .then(setIssue)
      .catch(() => router.push(`/console/workspaces/${id}`))
      .finally(() => setLoading(false));
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
        onClick={() => router.push(`/console/workspaces/${id}`)}
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
        <div className="mb-6">
          <Markdown>{issue.description}</Markdown>
        </div>
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
            <div className="text-sm">
              <Markdown>{c.content}</Markdown>
            </div>
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
