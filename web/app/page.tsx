"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveAgentLog } from "@/components/live-agent-log";
import { AuthButton } from "@/components/auth-button";
import { LoginModal } from "@/components/login-modal";

const navItems = ["Agents", "Security", "Pricing", "Docs"];

const agents = [
  {
    icon: "🔍",
    name: "The Reviewer",
    id: "agent_001",
    status: "analyzing",
    task: "Scanning PR #482 for security vulnerabilities",
    cpu: "14.2%",
    uptime: "99.9%",
  },
  {
    icon: "🏗️",
    name: "The Architect",
    id: "agent_002",
    status: "refactoring",
    task: "Implementing microservices interface in /runtime",
    cpu: "62.8%",
    uptime: "12d 4h",
  },
  {
    icon: "🧹",
    name: "The Janitor",
    id: "agent_003",
    status: "cleaning",
    task: "Optimizing build assets and dependencies",
    cpu: "4.1%",
    uptime: "158d",
  },
  {
    icon: "⚡",
    name: "The Deployer",
    id: "agent_004",
    status: "monitoring",
    task: "Watching CI/CD pipelines for staging",
    cpu: "22.0%",
    uptime: "24/7",
  },
];


export default function Home() {
  const [showLoginModal, setShowLoginModal] = useState(false);

  return (
    <main className="min-h-screen overflow-hidden bg-white text-zinc-950">
      {/* Login modal */}
      <LoginModal
        mode="modal"
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />

      <header className="border-b border-zinc-200/80 bg-white/95">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="#" className="flex items-center gap-2 text-sm font-semibold">
            <Image
              src="/favicon.ico"
              alt="GitSquad logo"
              width={20}
              height={20}
              className="size-5 rounded"
              priority
            />
            GitSquad
          </a>

          <nav className="hidden items-center gap-8 text-xs font-medium text-zinc-500 md:flex">
            {navItems.map((item) => (
              <a key={item} href="#" className="transition-colors hover:text-zinc-950">
                {item}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <AuthButton onLoginClick={() => setShowLoginModal(true)} />
          </div>
        </div>
      </header>

      <section className="mx-auto flex max-w-7xl flex-col items-center px-5 pb-20 pt-16 text-center sm:px-8 sm:pt-20 lg:pb-24">
        <Badge className="mb-8 rounded-full border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-medium text-orange-600 hover:bg-orange-50">
          <Sparkles className="size-3" />
          Autonomous Developer Network is Live
        </Badge>

        <div className="mb-7 flex size-14 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
          <Image
            src="/favicon.ico"
            alt="GitSquad mark"
            width={48}
            height={48}
            className="size-11 rounded-xl"
            priority
          />
        </div>

        <h1 className="max-w-4xl text-balance text-5xl font-black leading-[0.94] tracking-normal text-zinc-950 sm:text-6xl lg:text-7xl">
          Your autonomous developer team on GitHub
        </h1>

        <p className="mt-7 max-w-xl text-pretty text-base leading-7 text-zinc-500 sm:text-lg">
          Git Squad is a collection of autonomous AI agents that live in your
          repository. They review code, fix bugs, and refactor architecture
          while you sleep.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button
            className="h-11 rounded-md px-5 text-sm font-semibold"
            onClick={() => setShowLoginModal(true)}
          >
            Get started free
            <ArrowRight className="size-4" />
          </Button>
          <a
            href="/docs"
            className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-950 transition-colors"
          >
            Read the docs
            <ArrowRight className="size-3.5" />
          </a>
        </div>

        <div className="mt-16 w-full max-w-6xl rounded-xl border border-zinc-800 bg-[#111214] p-3 text-left shadow-[0_34px_100px_rgba(15,23,42,0.22)]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex gap-2">
              <span className="size-2.5 rounded-full bg-red-400" />
              <span className="size-2.5 rounded-full bg-yellow-400" />
              <span className="size-2.5 rounded-full bg-green-400" />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-500">
              Squad control center v2.4.0
            </p>
          </div>

          <div className="grid border-b border-white/10 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:grid-cols-3">
            <div className="border-b border-white/10 bg-black/20 px-6 py-4 text-white sm:border-b-0 sm:border-r sm:px-8">
              Active agents
            </div>
            <div className="border-b border-white/10 px-6 py-4 sm:border-b-0 sm:border-r sm:px-8">
              Repos monitored
            </div>
            <div className="px-6 py-4 sm:px-8">Squad config</div>
          </div>

          <div className="border-b border-white/10">
            <div>
              <div className="grid grid-cols-[1.1fr_0.8fr_1.5fr_0.45fr_0.45fr] border-b border-white/10 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500 max-md:hidden">
                <span>Agent identity</span>
                <span>Status</span>
                <span>Current task</span>
                <span>CPU</span>
                <span>Uptime</span>
              </div>

              {agents.map((agent) => {
                return (
                  <div
                    key={agent.id}
                    className="grid grid-cols-[1.1fr_0.8fr_1.5fr_0.45fr_0.45fr] items-center border-b border-white/10 px-5 py-4 last:border-b-0 max-md:grid-cols-1 max-md:gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-md bg-white/10 text-base">
                        {agent.icon}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">{agent.name}</p>
                        <p className="font-mono text-[10px] uppercase text-slate-500">{agent.id}</p>
                      </div>
                    </div>
                    <span className="w-fit rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase text-emerald-300">
                      <span className="mr-1 inline-block size-2 rounded-full bg-emerald-300" />
                      {agent.status}
                    </span>
                    <p className="truncate font-mono text-xs text-sky-100/90">{agent.task}</p>
                    <p className="font-mono text-xs font-bold text-white">{agent.cpu}</p>
                    <p className="font-mono text-xs font-bold text-white">{agent.uptime}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <LiveAgentLog />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
            <span>
              Status: <b className="text-emerald-300">nominal</b>
            </span>
            <span>Squad net uptime: 1,482 hours</span>
            <span>Latency: 12ms</span>
          </div>
        </div>

      </section>

      {/* ── How it works ── */}
      <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">
            From issue to pull request in minutes
          </h2>
          <p className="mt-3 text-sm text-zinc-500">
            Set up in 60 seconds. Your first AI teammate ships code today.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <div className="group relative rounded-xl border border-zinc-200 bg-white p-6 transition-shadow hover:shadow-md">
            <span className="mb-4 inline-flex size-8 items-center justify-center rounded-lg bg-zinc-950 text-xs font-bold text-white">
              1
            </span>
            <h3 className="text-base font-semibold text-zinc-950">
              Install the GitHub App
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Install GitSquad on your repositories in one click. Choose which repos
              your agents can access, just like you&apos;d connect Vercel.
            </p>
          </div>

          <div className="group relative rounded-xl border border-zinc-200 bg-white p-6 transition-shadow hover:shadow-md">
            <span className="mb-4 inline-flex size-8 items-center justify-center rounded-lg bg-zinc-950 text-xs font-bold text-white">
              2
            </span>
            <h3 className="text-base font-semibold text-zinc-950">
              @mention an agent
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Create an issue and tag @coder, @reviewer, or @planner. Agents pick up
              tasks, discuss with you, and get to work.
            </p>
          </div>

          <div className="group relative rounded-xl border border-zinc-200 bg-white p-6 transition-shadow hover:shadow-md">
            <span className="mb-4 inline-flex size-8 items-center justify-center rounded-lg bg-zinc-950 text-xs font-bold text-white">
              3
            </span>
            <h3 className="text-base font-semibold text-zinc-950">
              Merge the pull request
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Agents push code to a branch and open a PR. Review the diff, leave
              feedback, and merge when it&apos;s ready.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
