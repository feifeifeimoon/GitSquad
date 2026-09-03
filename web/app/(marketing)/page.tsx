"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveAgentLog } from "@/components/live-agent-log";
import { AuthButton } from "@/components/auth-button";
import { LoginModal } from "@/components/login-modal";
import { MeshGradient } from "@/components/mesh-gradient";

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
    <main className="min-h-screen overflow-hidden bg-canvas-soft text-ink">
      {/* Login modal */}
      <LoginModal
        mode="modal"
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />

      {/* Nav bar — 64px, canvas, hairline border */}
      <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
          <a href="#" className="flex items-center gap-2 text-sm font-semibold">
            <Image
              src="/favicon.ico"
              alt="GitSquad logo"
              width={20}
              height={20}
              className="size-5 rounded-sm"
              priority
            />
            GitSquad
          </a>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <a
                key={item}
                href="#"
                className="rounded-full px-3 py-1.5 text-sm text-body transition-colors hover:bg-muted hover:text-ink"
              >
                {item}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <AuthButton onLoginClick={() => setShowLoginModal(true)} />
          </div>
        </div>
      </header>

      {/* Hero band — mesh gradient backdrop */}
      <section className="relative overflow-hidden border-b border-hairline bg-canvas">
        <MeshGradient className="pointer-events-none absolute inset-x-0 top-0 h-[480px] opacity-50" />
        <div className="relative mx-auto flex max-w-[1200px] flex-col items-center px-6 pb-24 pt-24 text-center sm:pt-32">
          <Badge
            variant="secondary"
            className="mb-6 rounded-full bg-canvas px-3 py-1 text-xs text-body shadow-level-1"
          >
            <Sparkles className="size-3" />
            Autonomous Developer Network is Live
          </Badge>

          <div className="mb-7 flex size-14 items-center justify-center rounded-md border border-hairline bg-canvas shadow-level-2">
            <Image
              src="/favicon.ico"
              alt="GitSquad mark"
              width={48}
              height={48}
              className="size-11 rounded-sm"
              priority
            />
          </div>

          <h1 className="max-w-4xl text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-ink sm:text-5xl lg:text-6xl">
            Your autonomous developer team on GitHub.
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-lg leading-7 text-body">
            Git Squad is a collection of autonomous AI agents that live in your
            repository. They review code, fix bugs, and refactor architecture
            while you sleep.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <Button size="pill" onClick={() => setShowLoginModal(true)}>
              Get started free
              <ArrowRight className="size-4" />
            </Button>
            <Button variant="secondary" size="pill" asChild>
              <Link href="/docs">
                Read the docs
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Showcase band dark — control center */}
      <section className="bg-primary text-white">
        <div className="mx-auto max-w-[1200px] px-6 py-16">
          <div className="w-full rounded-md bg-[#0a0a0a] p-3 text-left shadow-level-3">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex gap-2">
                <span className="size-2.5 rounded-full bg-white/20" />
                <span className="size-2.5 rounded-full bg-white/20" />
                <span className="size-2.5 rounded-full bg-white/20" />
              </div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-white/40">
                Squad control center v2.4.0
              </p>
            </div>

            <div className="grid border-b border-white/10 text-xs font-semibold uppercase tracking-[0.18em] text-white/40 sm:grid-cols-3">
              <div className="border-b border-white/10 bg-white/5 px-6 py-4 text-white sm:border-b-0 sm:border-r sm:px-8">
                Active agents
              </div>
              <div className="border-b border-white/10 px-6 py-4 sm:border-b-0 sm:border-r sm:px-8">
                Repos monitored
              </div>
              <div className="px-6 py-4 sm:px-8">Squad config</div>
            </div>

            <div className="border-b border-white/10">
              <div>
                <div className="grid grid-cols-[1.1fr_0.8fr_1.5fr_0.45fr_0.45fr] border-b border-white/10 px-5 py-3 font-mono text-xs uppercase tracking-[0.16em] text-white/40 max-md:hidden">
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
                        <span className="flex size-9 items-center justify-center rounded-sm bg-white/10 text-base">
                          {agent.icon}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-white">{agent.name}</p>
                          <p className="font-mono text-xs uppercase text-white/40">{agent.id}</p>
                        </div>
                      </div>
                      <span className="w-fit rounded-full bg-link/15 px-2.5 py-1 font-mono text-xs font-semibold uppercase text-link">
                        <span className="mr-1 inline-block size-2 rounded-full bg-link" />
                        {agent.status}
                      </span>
                      <p className="truncate font-mono text-xs text-white/80">{agent.task}</p>
                      <p className="font-mono text-xs font-semibold text-white">{agent.cpu}</p>
                      <p className="font-mono text-xs font-semibold text-white">{agent.uptime}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <LiveAgentLog />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] text-white/40">
              <span>
                Status: <b className="text-link">nominal</b>
              </span>
              <span>Squad net uptime: 1,482 hours</span>
              <span>Latency: 12ms</span>
            </div>
          </div>
        </div>
      </section>

      {/* Showcase band light — how it works */}
      <section className="bg-canvas-soft">
        <div className="mx-auto max-w-[1200px] px-6 py-24">
          <div className="mb-12 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
              From issue to pull request in minutes.
            </h2>
            <p className="mt-3 text-sm text-body">
              Set up in 60 seconds. Your first AI teammate ships code today.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-md border border-hairline bg-canvas p-6 shadow-level-3">
              <span className="mb-4 inline-flex size-8 items-center justify-center rounded-sm bg-primary font-mono text-xs font-semibold text-white">
                1
              </span>
              <h3 className="text-base font-semibold text-ink">
                Install the GitHub App
              </h3>
              <p className="mt-2 text-sm leading-6 text-body">
                Install GitSquad on your repositories in one click. Choose which repos
                your agents can access, just like you&apos;d connect Vercel.
              </p>
            </div>

            <div className="rounded-md border border-hairline bg-canvas p-6 shadow-level-3">
              <span className="mb-4 inline-flex size-8 items-center justify-center rounded-sm bg-primary font-mono text-xs font-semibold text-white">
                2
              </span>
              <h3 className="text-base font-semibold text-ink">
                @mention an agent
              </h3>
              <p className="mt-2 text-sm leading-6 text-body">
                Create an issue and tag @coder, @reviewer, or @planner. Agents pick up
                tasks, discuss with you, and get to work.
              </p>
            </div>

            <div className="rounded-md border border-hairline bg-canvas p-6 shadow-level-3">
              <span className="mb-4 inline-flex size-8 items-center justify-center rounded-sm bg-primary font-mono text-xs font-semibold text-white">
                3
              </span>
              <h3 className="text-base font-semibold text-ink">
                Merge the pull request
              </h3>
              <p className="mt-2 text-sm leading-6 text-body">
                Agents push code to a branch and open a PR. Review the diff, leave
                feedback, and merge when it&apos;s ready.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
