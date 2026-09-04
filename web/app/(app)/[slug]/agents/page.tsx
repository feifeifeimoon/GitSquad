"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Plus, Trash2, Pencil } from "lucide-react";
import { api, agentApi, skillApi, type Agent, type Skill } from "@/lib/api";
import { paths } from "@/lib/paths";
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

const labelCls = "mb-1.5 block text-xs text-mute";
const inputCls =
  "w-full rounded-sm border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none placeholder:text-mute focus:border-primary";
const textareaCls = `${inputCls} min-h-24 resize-y`;

export default function WorkspaceAgentsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [daemons, setDaemons] = useState<DaemonOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("");
  const [daemonId, setDaemonId] = useState("");
  const [provider, setProvider] = useState("");
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);

  const load = () =>
    agentApi
      .list(slug)
      .then(setAgents)
      .catch(() => router.push(paths.workspaces()))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    skillApi.list(slug).then(setSkills).catch(() => {});
  }, [slug]);

  useEffect(() => {
    api
      .get<Daemon[]>("/api/v1/daemons")
      .then((ds) =>
        setDaemons(
          (ds || [])
            .filter((d) => d.status === "online")
            .map((d) => ({
              id: d.id,
              name: d.name,
              providers: (d.runtimes || []).map((r) => r.kind),
            })),
        ),
      )
      .catch(() => {});
  }, []);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setInstructions("");
    setModel("");
    setDaemonId("");
    setProvider("");
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
    setSkillIds((a.skills || []).map((s) => s.id));
    setEnabled(a.enabled);
    setOpen(true);
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
      skill_ids: skillIds,
      enabled,
    };
    try {
      if (editing) await agentApi.update(slug, editing.id, body);
      else await agentApi.create(slug, body);
      setOpen(false);
      load();
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
      load();
      toast.success("Agent deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete agent");
    }
    setConfirmId(null);
  };

  const selectedDaemon = daemons.find((d) => d.id === daemonId);
  const toggleSkill = (id: string) =>
    setSkillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-8 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(paths.workspace(slug).settings())}
            className="flex items-center gap-1 text-sm text-body transition-colors hover:text-ink"
          >
            <ChevronLeft className="size-4" />
            Settings
          </button>
          <h1 className="text-sm font-medium text-ink">Agents</h1>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          New Agent
        </Button>
      </div>

      <div className="flex-1 px-8 pb-8">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <Empty className="rounded-lg bg-canvas-soft py-16">
            <EmptyMedia>
              <Pencil className="size-5" />
            </EmptyMedia>
            <EmptyTitle>No agents yet</EmptyTitle>
            <EmptyDescription>
              Agents are AI workers bound to a runtime. Create one to start
              mentioning it in issues.
            </EmptyDescription>
          </Empty>
        ) : (
          <div className="space-y-3">
            {agents.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-4 rounded-md border border-hairline bg-canvas p-4 shadow-level-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">@{a.name}</p>
                    {!a.enabled && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-mute">
                        disabled
                      </span>
                    )}
                  </div>
                  {a.description && (
                    <p className="mt-0.5 truncate text-xs text-body">{a.description}</p>
                  )}
                  <p className="mt-1 text-xs text-mute">
                    {a.runtime?.provider}
                    {a.runtime?.daemon_name ? ` · ${a.runtime.daemon_name}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => openEdit(a)}
                  className="text-hairline-strong transition-colors hover:text-ink"
                  title="Edit agent"
                >
                  <Pencil className="size-4" />
                </button>
                {confirmId === a.id ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-destructive">Delete?</span>
                    <button onClick={() => remove(a.id)} className="font-medium text-destructive hover:underline">
                      Yes
                    </button>
                    <button onClick={() => setConfirmId(null)} className="text-mute hover:text-body">
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmId(a.id)}
                    className="text-hairline-strong transition-colors hover:text-destructive"
                    title="Delete agent"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent className="sm:max-w-xl">
          <DialogTitle className="sr-only">
            {editing ? "Edit agent" : "Create agent"}
          </DialogTitle>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="coder"
                autoFocus
              />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Backend engineer"
              />
            </div>
            <div>
              <label className={labelCls}>Instructions</label>
              <textarea
                className={textareaCls}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="You are a senior backend engineer…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Daemon</label>
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
              </div>
              <div>
                <label className={labelCls}>Provider</label>
                <Select value={provider} onValueChange={setProvider} disabled={!selectedDaemon}>
                  <SelectTrigger className="w-full">
                    {provider || "Select provider"}
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    {(selectedDaemon?.providers || []).map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Model (optional)</label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Leave empty for provider default"
              />
            </div>
            {skills.length > 0 && (
              <div>
                <label className={labelCls}>Skills</label>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-sm border border-hairline p-2">
                  {skills.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm text-body">
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
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-body">
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
