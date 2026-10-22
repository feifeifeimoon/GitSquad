"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Trash2 } from "lucide-react";
import { agentApi, api, skillApi, type Agent, type Skill } from "@/lib/api";
import { agentStatus } from "@/lib/agent-status";
import {
  HEAD_SHAPES,
  HEAD_SHAPE_LABEL,
  headShapeOf,
} from "@/lib/agent-shape";
import type { RobotHeadShape } from "@/vendor/robot-heads/types";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/query";
import { AgentHead } from "@/components/agents/agent-head";
import { ProviderIcon } from "@/components/provider-icon";
import { WorkspaceAvatar } from "@/components/workspace-avatar";
import { Field, TextArea } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { toast } from "sonner";

interface DaemonRow {
  id: string;
  name: string;
  status: string;
  runtimes: Array<{ kind: string }>;
}

/**
 * Create or edit an agent — the one form, opened from the roster's "New agent"
 * and from an agent page's "Edit".
 *
 * Mounted only while open, so a cancelled edit is never still sitting in the
 * fields next time, and so the form starts from the agent it was given without
 * an effect syncing props into state. The dialog it lives in animates in on
 * mount; the close is immediate, which is the same trade the daemon rename
 * dialog makes.
 *
 * Reading an agent no longer goes through this form: the agent's own page shows
 * the instructions and skills as text. What is left here is writing.
 */
export function AgentDialog({
  slug,
  agent,
  onClose,
  onSaved,
  onDeleted,
}: {
  slug: string;
  /** null creates a new agent; an agent edits that one. */
  agent: Agent | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const editing = agent;

  const [name, setName] = useState(agent?.name ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [instructions, setInstructions] = useState(agent?.instructions ?? "");
  const [model, setModel] = useState(agent?.model ?? "");
  const [daemonId, setDaemonId] = useState(agent?.runtime?.daemon_id ?? "");
  const [provider, setProvider] = useState(agent?.runtime?.provider ?? "");
  const [avatarUrl, setAvatarUrl] = useState(agent?.avatar_url ?? "");
  const [avatarError, setAvatarError] = useState("");
  const [headShape, setHeadShape] = useState<RobotHeadShape>(
    headShapeOf(agent?.head_shape),
  );
  const [skillIds, setSkillIds] = useState<string[]>(
    (agent?.skills || []).map((s) => s.id),
  );
  const [enabled, setEnabled] = useState(agent?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: skills = [] } = useApi<Skill[]>(
    `/api/v1/workspaces/${slug}/skills`,
    () => skillApi.list(slug),
  );
  const { data: daemonRows = [] } = useApi<DaemonRow[]>("/api/v1/daemons", () =>
    api.get<DaemonRow[]>("/api/v1/daemons"),
  );

  // Only online machines can take an agent: binding to a daemon that is down
  // would create an agent that reads Offline from the moment it exists.
  const daemons = daemonRows
    .filter((d) => d.status === "online")
    .map((d) => ({
      id: d.id,
      name: d.name,
      providers: (d.runtimes || []).map((r) => r.kind),
    }));
  const selectedDaemon = daemons.find((d) => d.id === daemonId);

  const toggleSkill = (id: string) =>
    setSkillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

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
      head_shape: headShape,
      skill_ids: skillIds,
      enabled,
    };
    try {
      if (editing) await agentApi.update(slug, editing.id, body);
      else await agentApi.create(slug, body);
      onSaved();
      toast.success(editing ? "Agent updated" : "Agent created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save agent");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    try {
      await agentApi.remove(slug, editing.id);
      toast.success("Agent deleted");
      onDeleted?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete agent");
    } finally {
      setConfirmDelete(false);
    }
  };

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogTitle className="sr-only">
          {editing ? "Edit agent" : "Create agent"}
        </DialogTitle>
        <div className="space-y-4">
          {/* One face, one field: a robot **or** a picture, never both. The
              five outlines are the same robot (one visor, one three-cell
              face), so the choice is a silhouette and nothing else; picking
              one drops the picture, and uploading a picture drops the
              selection — the roster draws whichever of the two is set.
              The big head on the left is the preview: alive, showing the
              agent's own state while editing. The row of small ones is the
              picker and they are still frames on purpose, because a click
              here means "choose me", not "poke me". */}
          <Field label="Avatar">
            <div className="flex items-start gap-4">
              <div className="flex size-24 shrink-0 items-center justify-center rounded-lg bg-canvas-soft-2">
                {avatarUrl ? (
                  <WorkspaceAvatar
                    name={name || "agent"}
                    avatarUrl={avatarUrl}
                    className="size-20"
                  />
                ) : (
                  <AgentHead
                    shape={headShape}
                    status={editing ? agentStatus(editing) : "idle"}
                    size={96}
                    interactive
                    paused={false}
                  />
                )}
              </div>
              <div className="min-w-0 space-y-2">
                <div role="group" aria-label="Robot" className="flex gap-1">
                  {HEAD_SHAPES.map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      aria-pressed={!avatarUrl && headShape === shape}
                      aria-label={HEAD_SHAPE_LABEL[shape]}
                      title={HEAD_SHAPE_LABEL[shape]}
                      onClick={() => {
                        setHeadShape(shape);
                        // 二选一: picking the robot is what drops the picture.
                        setAvatarUrl("");
                      }}
                      className={cn(
                        "rounded-md p-2 transition-colors",
                        !avatarUrl && headShape === shape
                          ? "bg-muted ring-2 ring-link"
                          : "hover:bg-muted",
                      )}
                    >
                      <AgentHead shape={shape} size={52} paused />
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload picture
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
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
                {avatarError ? (
                  <p className="text-caption text-destructive">{avatarError}</p>
                ) : (
                  <p className="text-caption text-mute">
                    A robot, or a picture instead of one — PNG, JPG or SVG, up
                    to 1MB.
                  </p>
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
                onValueChange={(value) => {
                  setDaemonId(value);
                  setProvider("");
                }}
              >
                <SelectTrigger className="w-full">
                  {selectedDaemon?.name ?? "Select daemon"}
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {daemons.map((daemon) => (
                    <SelectItem key={daemon.id} value={daemon.id}>
                      {daemon.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Provider">
              <Select
                value={provider}
                onValueChange={setProvider}
                disabled={!selectedDaemon}
              >
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
                {skills.map((skill) => (
                  <label
                    key={skill.id}
                    className="flex items-center gap-2 text-copy text-body"
                  >
                    <input
                      type="checkbox"
                      checked={skillIds.includes(skill.id)}
                      onChange={() => toggleSkill(skill.id)}
                      className="size-4"
                    />
                    {skill.name}
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
          <div className="flex items-center justify-between gap-2">
            {/* Deleting belongs where the agent is changed, not as a second
                icon on every roster row — the roster is for reading. Spelled
                out rather than a trash glyph: it is the only way to delete an
                agent now, so it should not need hovering to be found. */}
            {editing && onDeleted ? (
              confirmDelete ? (
                <span className="flex items-center gap-2 whitespace-nowrap text-caption">
                  <span className="text-destructive">Delete this agent?</span>
                  <button
                    onClick={remove}
                    className="font-medium text-destructive hover:underline"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-mute hover:text-body"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-4" />
                  Delete agent
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={save}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create agent"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
