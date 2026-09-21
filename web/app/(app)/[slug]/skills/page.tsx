"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Pencil, Sparkles } from "lucide-react";
import { skillApi, type Skill } from "@/lib/api";
import { paths } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { PageHeader } from "@/components/page-header";
import { Field, TextArea } from "@/components/form-field";
import { InlineConfirm } from "@/components/inline-confirm";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function WorkspaceSkillsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");

  const load = () =>
    skillApi
      .list(slug)
      .then(setSkills)
      .catch(() => router.push(paths.workspaces()))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setContent("");
    setOpen(true);
  };

  const openEdit = (s: Skill) => {
    setEditing(s);
    setName(s.name);
    setDescription(s.description);
    setContent(s.content);
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      if (editing) await skillApi.update(slug, editing.id, { name, description, content });
      else await skillApi.create(slug, { name, description, content });
      setOpen(false);
      load();
      toast.success(editing ? "Skill updated" : "Skill created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save skill");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await skillApi.remove(slug, id);
      load();
      toast.success("Skill deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete skill");
    }
    setConfirmId(null);
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Skills"
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            New Skill
          </Button>
        }
      />

      <div className="flex-1 px-8 pb-8 pt-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : skills.length === 0 ? (
          <Empty className="rounded-lg bg-canvas-soft py-16">
            <EmptyMedia>
              <Sparkles className="size-5" />
            </EmptyMedia>
            <EmptyTitle>No skills yet</EmptyTitle>
            <EmptyDescription>
              Skills are reusable instruction docs injected into an agent&apos;s
              working directory when it runs.
            </EmptyDescription>
          </Empty>
        ) : (
          <div className="space-y-3">
            {skills.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-4 rounded-md border border-hairline bg-canvas p-4 shadow-level-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-copy font-semibold text-ink">{s.name}</p>
                  {s.description && (
                    <p className="mt-0.5 truncate text-caption text-body">{s.description}</p>
                  )}
                </div>
                <button
                  onClick={() => openEdit(s)}
                  className="text-hairline-strong transition-colors hover:text-ink"
                  title="Edit skill"
                >
                  <Pencil className="size-4" />
                </button>
                <InlineConfirm
                  confirming={confirmId === s.id}
                  question="Delete?"
                  title="Delete skill"
                  onRequest={() => setConfirmId(s.id)}
                  onConfirm={() => remove(s.id)}
                  onCancel={() => setConfirmId(null)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent className="sm:max-w-xl">
          <DialogTitle className="sr-only">
            {editing ? "Edit skill" : "Create skill"}
          </DialogTitle>
          <div className="space-y-4">
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="react-patterns"
                autoFocus
              />
            </Field>
            <Field label="Description">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Common React patterns and best practices"
              />
            </Field>
            <Field label="Content">
              <TextArea
                className="min-h-32"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="## Overview\n…"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={save}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create skill"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
