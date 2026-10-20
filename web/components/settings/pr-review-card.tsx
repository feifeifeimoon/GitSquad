"use client";

import Link from "next/link";
import { useState } from "react";
import { agentApi, api, type Agent, type PRReviewConfig, type Workspace } from "@/lib/api";
import { setApiData, useApi } from "@/lib/query";
import { paths } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { SettingRow, SettingSection } from "@/components/settings/settings-layout";

const DEFAULT_CONFIG: PRReviewConfig = {
  enabled: false,
  agent_id: null,
  trigger: "opened",
  ignore_drafts: true,
  author_scope: "collaborators",
  include_bots: false,
  inline_comments: true,
};

const selectClass =
  "h-9 rounded-md border border-hairline bg-canvas px-2 text-copy text-ink outline-none focus-visible:border-ring";

/**
 * The workspace's reviewer configuration.
 *
 * The selected agent is the reviewer: its instructions are the rubric and its
 * skills are the checklist. Reviews run on that agent's daemon, so an offline
 * daemon is shown as "will queue", not as an error.
 */
export function PRReviewCard({ workspace }: { workspace: Workspace }) {
  const slug = workspace.slug;
  const [config, setConfig] = useState<PRReviewConfig>(
    workspace.pr_review ?? DEFAULT_CONFIG,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { data: agents } = useApi<Agent[]>(
    `/api/v1/workspaces/${slug}/agents`,
    () => agentApi.list(slug),
  );

  const runnable = (agents ?? []).filter((a) => a.enabled && a.runtime?.daemon_id);
  const selected = runnable.find((a) => a.id === config.agent_id);
  const configuredButUnavailable =
    config.agent_id !== null && agents !== undefined && !selected;
  const daemonOffline = selected !== undefined && selected.runtime?.daemon_status !== "online";

  const set = <K extends keyof PRReviewConfig>(
    key: K,
    value: PRReviewConfig[K],
  ) => setConfig((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.patch<Workspace>(
        `/api/v1/workspaces/${slug}/pr-review`,
        config,
      );
      setApiData<Workspace>(`/api/v1/workspaces/${slug}`, () => updated);
      setConfig(updated.pr_review ?? config);
      setMessage("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save review settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingSection
      title="Pull request review"
      description="A reviewer agent comments on pull requests in this repository. Reviews run on its daemon and use its provider quota."
    >
      <SettingRow
        label="Enable PR review"
        description="When off, no review is queued automatically."
      >
        <input
          type="checkbox"
          className="size-4"
          checked={config.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
          aria-label="Enable PR review"
        />
      </SettingRow>

      <SettingRow
        label="Reviewer agent"
        description={
          configuredButUnavailable
            ? "The configured reviewer is disabled or has no runnable daemon. Pick another agent."
            : daemonOffline
              ? `${selected?.runtime?.daemon_name ?? "Its daemon"} is offline; reviews will queue until it returns.`
              : "Its instructions are the review rubric; its skills are the checklist."
        }
        align="top"
      >
        <select
          className={selectClass}
          value={config.agent_id ?? ""}
          onChange={(e) => set("agent_id", e.target.value || null)}
          aria-label="Reviewer agent"
        >
          <option value="">Select an agent…</option>
          {runnable.map((agent) => (
            <option key={agent.id} value={agent.id}>
              @{agent.name}
              {agent.runtime?.daemon_name ? ` · ${agent.runtime.daemon_name}` : ""}
            </option>
          ))}
          {configuredButUnavailable && (
            <option value={config.agent_id ?? ""} disabled>
              Unavailable agent
            </option>
          )}
        </select>
      </SettingRow>

      {agents !== undefined && runnable.length === 0 && (
        <SettingRow
          label="No runnable agent"
          description="Create an enabled agent with an online daemon first."
        >
          <Button variant="outline" size="sm" asChild>
            <Link href={paths.workspace(slug).agents()}>Open agents</Link>
          </Button>
        </SettingRow>
      )}

      <SettingRow
        label="When to review"
        description="Every push re-reviews the whole PR and costs another run."
      >
        <select
          className={selectClass}
          value={config.trigger}
          onChange={(e) => set("trigger", e.target.value as PRReviewConfig["trigger"])}
          aria-label="When to review"
        >
          <option value="opened">When a PR opens</option>
          <option value="push">When a PR opens or gets new commits</option>
          <option value="manual">Only when I ask</option>
        </select>
      </SettingRow>

      <SettingRow
        label="Skip drafts"
        description="Draft pull requests are reviewed when marked ready."
      >
        <input
          type="checkbox"
          className="size-4"
          checked={config.ignore_drafts}
          onChange={(e) => set("ignore_drafts", e.target.checked)}
          aria-label="Skip draft pull requests"
        />
      </SettingRow>

      <SettingRow
        label="Authors"
        description="External and fork contributors can run code on your machine; collaborators is the safe default."
      >
        <select
          className={selectClass}
          value={config.author_scope}
          onChange={(e) =>
            set("author_scope", e.target.value as PRReviewConfig["author_scope"])
          }
          aria-label="Review authors"
        >
          <option value="collaborators">Collaborators</option>
          <option value="all">Everyone, including forks</option>
        </select>
      </SettingRow>

      <SettingRow
        label="Include other bots"
        description="GitSquad's own bot pull requests are always reviewed."
      >
        <input
          type="checkbox"
          className="size-4"
          checked={config.include_bots}
          onChange={(e) => set("include_bots", e.target.checked)}
          aria-label="Include other bots"
        />
      </SettingRow>

      <SettingRow
        label="Inline comments"
        description="Off posts the review summary only."
      >
        <input
          type="checkbox"
          className="size-4"
          checked={config.inline_comments}
          onChange={(e) => set("inline_comments", e.target.checked)}
          aria-label="Post inline comments"
        />
      </SettingRow>

      <SettingRow
        label="Save changes"
        description={error || message || "Changes apply to the next pull request event."}
      >
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </SettingRow>
    </SettingSection>
  );
}
