"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { api, agentApi, skillApi, type Agent, type Skill } from "@/lib/api";
import {
  agentStatus,
  AGENT_STATUS_LABEL,
  AGENT_REFRESH_MS,
  type AgentStatus,
} from "@/lib/agent-status";
import { paths } from "@/lib/paths";
import { AGENT_LIST_RAIL, AgentList } from "@/components/agents/agent-list";
import { ProviderIcon } from "@/components/provider-icon";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { PageToolbar } from "@/components/page-toolbar";
import { invalidateApi, setApiData, useApi } from "@/lib/query";
import { Field, TextArea } from "@/components/form-field";
import { InlineConfirm } from "@/components/inline-confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { toast } from "sonner";

interface DaemonRuntime {
  kind: string;
}
interface Daemon {
  id: string;
  name: string;
  status: string;
  runtimes: DaemonRuntime[];
}
interface DaemonOption {
  id: string;
  name: string;
  providers: string[];
}

const STATUS_FILTERS: Array<{ key: AgentStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "running", label: AGENT_STATUS_LABEL.running },
  { key: "queued", label: AGENT_STATUS_LABEL.queued },
  { key: "idle", label: AGENT_STATUS_LABEL.idle },
  { key: "offline", label: AGENT_STATUS_LABEL.offline },
];

export default function WorkspaceAgentsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  // Three reads, all cached: the agent list is also read by the shell's
  // workspace switch, the skills by the skills page, the daemons by the daemons
  // page — each used to be a separate request for the same bytes.
  const {
    data: agents,
    loading,
    error,
    refresh: refreshAgents,
  } = useApi<Agent[]>(`/api/v1/workspaces/${slug}/agents`, () =>
    agentApi.list(slug),
  );
  const { data: skills = [] } = useApi<Skill[]>(
    `/api/v1/workspaces/${slug}/skills`,
    () => skillApi.list(slug),
  );
  const { data: daemonRows = [] } = useApi<Daemon[]>("/api/v1/daemons", () =>
    api.get<Daemon[]>("/api/v1/daemons"),
  );
  // Safe to trust as-is: the server resolves liveness against the heartbeat
  // before it sends a row, so this filter and the daemons page can never
  // disagree about the same machine.
  const daemons: DaemonOption[] = useMemo(
    () =>
      daemonRows
        .filter((d) => d.status === "online")
        .map((d) => ({
          id: d.id,
          name: d.name,
          providers: (d.runtimes || []).map((r) => r.kind),
        })),
    [daemonRows],
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<AgentStatus | "all">("all");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("");
  const [daemonId, setDaemonId] = useState("");
  const [provider, setProvider] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Status is derived from the daemon heartbeat, so the server has to be asked
  // again on its schedule, not on the render's.
  useEffect(() => {
    const interval = setInterval(
      () => invalidateApi(`/api/v1/workspaces/${slug}/agents`),
      AGENT_REFRESH_MS,
    );
    return () => clearInterval(interval);
  }, [slug]);

  useEffect(() => {
    if (error) router.push(paths.workspaces());
  }, [error, router]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setInstructions("");
    setModel("");
    setDaemonId("");
    setProvider("");
    setAvatarUrl("");
    setAvatarError("");
    setSkillIds([]);
    setEnabled(true);
    setOpen(true);
  };

  const openEdit = (a: Agent) => {
    setEditing(a);
    setName(a.name);
    setDescription(a.description);
    setInstructions(a.instructions);
    setModel(a.model);
    setDaemonId(a.runtime?.daemon_id ?? "");
    setProvider(a.runtime?.provider ?? "");
    setAvatarUrl(a.avatar_url ?? "");
    setAvatarError("");
    setSkillIds((a.skills || []).map((s) => s.id));
    setEnabled(a.enabled);
    setOpen(true);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setAvatarError("Image must be under 1MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(reader.result as string);
      setAvatarError("");
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Name is required");
    if (!daemonId || !provider) return toast.error("Choose a daemon and provider");
    setSaving(true);
    const body = {
      name,
      description,
      instructions,
      model,
      daemon_id: daemonId,
      provider,
      avatar_url: avatarUrl,
      skill_ids: skillIds,
      enabled,
    };
    try {
      if (editing) await agentApi.update(slug, editing.id, body);
      else await agentApi.create(slug, body);
      setOpen(false);
      // Re-read through the cache so the row shows the server's version of
      // what was just written, not the optimistic one.
      refreshAgents();
      toast.success(editing ? "Agent updated" : "Agent created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save agent");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await agentApi.remove(slug, id);
      setApiData<Agent[]>(`/api/v1/workspaces/${slug}/agents`, (prev = []) =>
        prev.filter((a) => a.id !== id),
      );
      toast.success("Agent deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete agent");
    }
    setConfirmId(null);
  };

  const agentsList = useMemo(() => agents ?? [], [agents]);
  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const a of agentsList) {
      const s = agentStatus(a);
      acc[s] = (acc[s] ?? 0) + 1;
    }
    return acc;
  }, [agentsList]);

  const visible = useMemo(
    () =>
      statusFilter === "all"
        ? agentsList
        : agentsList.filter((a) => agentStatus(a) === statusFilter),
    [agentsList, statusFilter],
  );

  const selectedDaemon = daemons.find((d) => d.id === daemonId);
  const toggleSkill = (id: string) =>
    setSkillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <div className="flex h-full flex-col">
      <PageToolbar
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            New Agent
          </Button>
        }
      />

      <div className={`flex-1 px-8 pb-8 pt-6 ${AGENT_LIST_RAIL}`}>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : agentsList.length === 0 ? (
          <Empty className="rounded-lg bg-canvas-soft py-16">
            <EmptyMedia>
              <Pencil className="size-5" />
            </EmptyMedia>
            <EmptyTitle>No agents yet</EmptyTitle>
            <EmptyDescription>
              Agents are AI workers bound to a runtime. Create one to start
              mentioning it in issues.
            </EmptyDescription>
            <Button onClick={openCreate} className="mt-1">
              <Plus className="size-4" />
              Create your first agent
            </Button>
          </Empty>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {STATUS_FILTERS.map((f) => {
                const count =
                  f.key === "all" ? agentsList.length : (counts[f.key] ?? 0);
                const active = statusFilter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key)}
                    disabled={count === 0 && f.key !== "all"}
                    className={`rounded-full px-2.5 py-1 text-caption font-medium transition-colors disabled:opacity-40 ${
                      active
                        ? "bg-ink text-canvas"
                        : "bg-muted text-body hover:text-ink"
                    }`}
                  >
                    {f.label}
                    <span className={active ? "ml-1.5" : "ml-1.5 text-mute"}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <AgentList
              groups={[{ key: slug, agents: visible }]}
              // Only a real status has a "no agents are …" sentence. With "all"
              // chosen the empty case is the page's own empty state above, and
              // `AGENT_STATUS_LABEL["all"]` is not a key at all — which is why
              // this is a guard and not the expression it used to be inline,
              // where the `&&` kept it from being evaluated.
              empty={
                statusFilter === "all"
                  ? undefined
                  : `No agents are ${AGENT_STATUS_LABEL[statusFilter].toLowerCase()}.`
              }
              renderActions={(a) => (
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => openEdit(a)}
                    className="text-hairline-strong transition-colors hover:text-ink"
                    title="Edit agent"
                    aria-label="Edit agent"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <InlineConfirm
                    confirming={confirmId === a.id}
                    question="Delete?"
                    title="Delete agent"
                    onRequest={() => setConfirmId(a.id)}
                    onConfirm={() => remove(a.id)}
                    onCancel={() => setConfirmId(null)}
                  />
                </div>
              )}
            />
          </>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent className="sm:max-w-xl">
          <DialogTitle className="sr-only">
            {editing ? "Edit agent" : "Create agent"}
          </DialogTitle>
          <div className="space-y-4">
            <Field label="Avatar">
              <div className="flex items-center gap-3">
                <WorkspaceAvatar
                  name={name || "agent"}
                  avatarUrl={avatarUrl}
                  className="size-14"
                />
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Upload
                    </Button>
                    {avatarUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAvatarUrl("")}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {avatarError ? (
                    <p className="text-caption text-destructive">{avatarError}</p>
                  ) : (
                    <p className="text-caption text-mute">PNG, JPG or SVG, up to 1MB</p>
                  )}
                </div>
              </div>
            </Field>
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="coder"
                autoFocus
              />
            </Field>
            <Field label="Description">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Backend engineer"
              />
            </Field>
            <Field label="Instructions">
              <TextArea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="You are a senior backend engineer…"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Daemon">
                <Select
                  value={daemonId}
                  onValueChange={(v) => {
                    setDaemonId(v);
                    setProvider("");
                  }}
                >
                  <SelectTrigger className="w-full">
                    {selectedDaemon?.name ?? "Select daemon"}
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    {daemons.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Provider">
                <Select value={provider} onValueChange={setProvider} disabled={!selectedDaemon}>
                  <SelectTrigger className="w-full">
                    {provider ? (
                      <span className="flex items-center gap-1.5">
                        <ProviderIcon provider={provider} className="size-3.5" />
                        {provider}
                      </span>
                    ) : (
                      "Select provider"
                    )}
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    {(selectedDaemon?.providers || []).map((p) => (
                      <SelectItem key={p} value={p}>
                        <span className="flex items-center gap-1.5">
                          <ProviderIcon provider={p} className="size-3.5" />
                          {p}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Model (optional)">
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Leave empty for provider default"
              />
            </Field>
            {skills.length > 0 && (
              <Field label="Skills">
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-sm border border-hairline p-2">
                  {skills.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-copy text-body">
                      <input
                        type="checkbox"
                        checked={skillIds.includes(s.id)}
                        onChange={() => toggleSkill(s.id)}
                        className="size-4"
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </Field>
            )}
            <label className="flex items-center gap-2 text-copy text-body">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="size-4"
              />
              Enabled
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={save}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create agent"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

