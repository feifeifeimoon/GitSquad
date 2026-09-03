"use client";

export function CreateWorkspaceAside() {
  return (
    <aside className="hidden w-80 shrink-0 lg:block">
      <h2 className="text-balance text-2xl font-semibold leading-tight tracking-[-0.04em] text-ink">
        Your autonomous team, ready in minutes.
      </h2>
      <p className="mt-3 text-pretty text-sm leading-6 text-body">
        Import a repository and GitSquad&apos;s agents start planning, coding,
        and reviewing — shipping pull requests while you sleep.
      </p>

      {/* Squad runtime mockup */}
      <div className="mt-8 overflow-hidden rounded-md bg-primary text-left shadow-level-3">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-white/20" />
            <span className="size-2.5 rounded-full bg-white/20" />
            <span className="size-2.5 rounded-full bg-white/20" />
          </div>
          <p className="font-mono text-xs uppercase tracking-wide text-white/40">
            squad runtime
          </p>
        </div>
        <div className="space-y-2.5 px-4 py-4 font-mono text-xs">
          <p className="text-white/80">
            <span className="text-cyan-soft">●</span> @planner — drafting
            implementation plan
          </p>
          <p className="text-white/80">
            <span className="text-link">●</span> @coder — editing
            src/runtime/agent.go
          </p>
          <p className="text-white/80">
            <span className="text-violet-soft">●</span> @reviewer — scanning
            PR #482
          </p>
        </div>
        <div className="border-t border-white/10 px-4 py-2.5 font-mono text-xs text-white/40">
          Status: <span className="text-link">nominal</span> · 3 agents active
        </div>
      </div>

      {/* Steps */}
      <ul className="mt-8 space-y-4">
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary font-mono text-xs font-semibold text-white">
            1
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Plan</p>
            <p className="mt-0.5 text-sm leading-5 text-body">
              Issues become step-by-step plans.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary font-mono text-xs font-semibold text-white">
            2
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Code</p>
            <p className="mt-0.5 text-sm leading-5 text-body">
              Agents push to a branch and open a PR.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary font-mono text-xs font-semibold text-white">
            3
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Review</p>
            <p className="mt-0.5 text-sm leading-5 text-body">
              Every diff checked before merge.
            </p>
          </div>
        </li>
      </ul>
    </aside>
  );
}
