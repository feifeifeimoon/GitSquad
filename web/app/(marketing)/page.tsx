import { ArrowRight, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MeshGradient } from "@/components/mesh-gradient";
import { ProviderIcon } from "@/components/provider-icon";
import { DemoBoard } from "@/components/marketing/demo-board";
import { Squad } from "@/components/marketing/squad";
import { GetStartedCta } from "@/components/marketing/get-started-cta";
import { LandingFooter } from "@/components/marketing/landing-footer";
import { LandingNav } from "@/components/marketing/landing-nav";
import { anchors, links } from "@/components/marketing/links";
import { SectionHeading } from "@/components/marketing/section-heading";

// A server component on purpose. The page this replaces was `"use client"` from
// its first line to its last so that one `useState` could open the login modal
// — the whole landing page was rendered by the browser, html and all, which is
// the wrong trade for the one page a stranger is most likely to arrive on.
// Every interactive piece below is its own small client island.

const CLAIMS = [
  {
    title: "You keep your CLI",
    body: "GitSquad ships no model of its own. It drives the coding CLI already installed and signed in on the host, so the tool loop and the billing stay where they already are.",
  },
  {
    title: "Work runs on your machine",
    body: "The daemon dials out, clones the repository into its own work directory and runs the agent there. There is nothing of ours to host, and the checkout is one you picked.",
  },
  {
    title: "Every step stays on the issue",
    body: "Progress, decisions and token cost are recorded on the issue itself, so the thread is the audit trail rather than a log somewhere else that you have to go and find.",
  },
];

const STEPS = [
  {
    title: "Install the app, pair a machine",
    body: "Choose the repositories your agents can see, then pair the machine that runs them. The daemon dials out, so there is no inbound port to open.",
    mono: "gitsquad daemon login",
  },
  {
    title: "Mention an agent on an issue",
    body: "Create an issue and tag an agent. It plans against the repository, edits code in a checkout on your machine, and reports progress on the issue as it goes.",
    mono: "@coder take this one",
  },
  {
    title: "Review the pull request",
    body: "The work lands on a branch as a pull request, with the decisions and the token cost sitting on the issue that asked for it.",
    mono: "gh pr view 212",
  },
];

const RUNTIMES = [
  { provider: "claude", name: "Claude Code", status: "Ready" },
  { provider: "agy", name: "Antigravity", status: "Ready" },
  { provider: "codex", name: "Codex", status: "Detected, no adapter yet" },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-canvas-soft text-ink">
      <LandingNav />
      <Hero />
      <ProductBand />
      <WhyBand />
      <HowItWorksBand />
      <ClosingCta />
      <LandingFooter />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-hairline bg-canvas">
      {/* Two layers, one atmosphere: a blueprint grid for the engineering
          surface the banner puts its robots on, and the brand's own light over
          it. Both are masked so the band dissolves into the page instead of
          stopping on the blur's edge — the grid radially from the headline, the
          glow downward before the lead paragraph. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
      >
        <div className="blueprint-grid absolute inset-0 [mask-image:radial-gradient(72%_64%_at_50%_0%,black,transparent)]" />
        <MeshGradient className="absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black_8%,transparent)]" />
      </div>
      <div className="relative mx-auto flex max-w-[1200px] flex-col items-center px-6 pb-16 pt-20 text-center sm:pt-28">
        <Badge
          variant="secondary"
          className="rounded-full bg-canvas px-3 py-1 text-caption text-body shadow-level-1"
        >
          <Sparkles className="size-3" />
          Open source · Apache-2.0
        </Badge>

        <h1 className="mt-6 max-w-4xl text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-ink sm:text-5xl lg:text-6xl">
          Your autonomous developer team on GitHub.
        </h1>

        <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-body">
          Mention an agent on an issue and it plans against the repository, edits
          code in a checkout on your machine, and opens a pull request — with the
          progress, the decisions and the token cost recorded on the issue
          itself.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <GetStartedCta>
            Get started free
            <ArrowRight className="size-4" />
          </GetStartedCta>
          <SecondaryCta href={links.github}>
            Star on GitHub
            <ArrowRight className="size-3.5" />
          </SecondaryCta>
        </div>

        {/* Not the claim band's headline a second time: the band below argues
            that GitSquad is an orchestration shell, and saying it here too read
            as a copy-paste rather than an echo. This is the fact underneath it. */}
        <p className="mt-6 font-mono text-caption text-mute">
          The tool loop stays in the CLI you already have.
        </p>
      </div>

      {/* Last in the band, so the robots are on top of the content column rather
          than under it. The column is a positioned box that spans the whole
          1200px — a transparent one, but transparent still takes the pointer, so
          a robot standing in the margin behind it never received a hover. */}
      <Squad />
    </section>
  );
}

function ProductBand() {
  return (
    <section
      id={anchors.product}
      className="scroll-mt-16 border-b border-hairline bg-canvas-soft"
    >
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <SectionHeading
          eyebrow="Product"
          title="One issue, from mention to merged."
          lead="The board is the product. Issues move through it as agents work, and every run leaves its trail on the issue that asked for it."
        />
        <div className="mt-12">
          <DemoBoard />
        </div>
      </div>
    </section>
  );
}

function WhyBand() {
  return (
    <section
      id={anchors.why}
      className="scroll-mt-16 border-b border-hairline bg-canvas"
    >
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <SectionHeading
          eyebrow="Why GitSquad"
          title="An orchestration shell, not another agent."
          lead="The interesting part of an agent is the loop, and the loop already exists in the CLI on your machine. What is missing is everything around it: the board, the routing, the execution environment and the audit trail."
        />

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {CLAIMS.map((claim, index) => (
            <div
              key={claim.title}
              className="rounded-lg border border-hairline bg-canvas p-5 shadow-level-2"
            >
              <ClaimVisual index={index} />
              <h3 className="mt-5 text-title-sm font-semibold text-ink">
                {claim.title}
              </h3>
              <p className="mt-2 text-pretty text-copy leading-6 text-body">
                {claim.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Each claim carries the evidence for itself: the runtimes it can drive, the
 * two commands it takes to start one, the trail one run leaves behind.
 *
 * All three sit in a well of the same height. The runtime list is three rows of
 * text beside brand marks and the other two are three lines of mono, so sizing
 * each to its own content left the three claim titles at three different
 * heights across the row. */
function ClaimWell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-h-[6.25rem] rounded-md bg-canvas-soft p-3 ${className}`}>
      {children}
    </div>
  );
}

function ClaimVisual({ index }: { index: number }) {
  if (index === 0) {
    return (
      <ClaimWell className="space-y-2">
        {RUNTIMES.map((runtime) => (
          <div key={runtime.provider} className="flex items-center gap-2">
            <ProviderIcon provider={runtime.provider} className="size-4" />
            <span className="text-copy text-ink">{runtime.name}</span>
            <span className="ml-auto text-caption text-mute">{runtime.status}</span>
          </div>
        ))}
      </ClaimWell>
    );
  }

  if (index === 1) {
    return (
      <ClaimWell className="space-y-1 font-mono text-[11px] leading-5 text-body">
        <p>
          <span className="text-mute">$ </span>gitsquad daemon login
        </p>
        <p className="text-mute">paired build-box · linux/amd64</p>
        <p>
          <span className="text-mute">$ </span>gitsquad daemon start
        </p>
      </ClaimWell>
    );
  }

  return (
    <ClaimWell className="space-y-1 font-mono text-[11px] leading-5">
      <p className="grid grid-cols-[2.5rem_4rem_minmax(0,1fr)] gap-2">
        <span className="text-mute">16:27</span>
        <span className="text-body">coder</span>
        <span className="truncate text-mute">opened pull request #212</span>
      </p>
      <p className="grid grid-cols-[2.5rem_4rem_minmax(0,1fr)] gap-2">
        <span className="text-mute">16:29</span>
        <span className="text-body">reviewer</span>
        <span className="truncate text-mute">requested changes</span>
      </p>
      <p className="grid grid-cols-[2.5rem_4rem_minmax(0,1fr)] gap-2">
        <span className="text-mute">16:41</span>
        <span className="text-body">coder</span>
        <span className="truncate text-mute">pushed 2 commits</span>
      </p>
    </ClaimWell>
  );
}

function HowItWorksBand() {
  return (
    <section
      id={anchors.howItWorks}
      className="scroll-mt-16 border-b border-hairline bg-canvas-soft"
    >
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <SectionHeading
          eyebrow="How it works"
          title="From issue to pull request."
          lead="One GitHub App, two commands on the machine that runs the agents, and the first issue can be in a pull request the same afternoon."
        />

        {/* Hairline grid rather than three shadowed cards: one surface divided
            into three reads as one process, where three cards read as three
            products. The rule is the container's own background showing through
            a one-pixel gap. */}
        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="flex flex-col bg-canvas p-6">
              <span className="font-mono text-caption tabular-nums text-mute">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-title-sm font-semibold text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-pretty text-copy leading-6 text-body">
                {step.body}
              </p>
              <p className="mt-5 rounded-sm bg-canvas-soft px-2.5 py-1.5 font-mono text-[11px] text-body">
                {step.mono}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="dark bg-canvas-soft text-ink">
      <div className="mx-auto max-w-[1200px] px-6 pb-20 pt-24 text-center">
        <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
          Put an agent on the next issue.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-7 text-body">
          Sign in with Google, install the GitHub App on one repository, and
          mention an agent. The daemon runs where your coding CLI already runs.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <GetStartedCta>
            Get started free
            <ArrowRight className="size-4" />
          </GetStartedCta>
          <SecondaryCta href={links.documentation}>
            Read the docs
            <ArrowRight className="size-3.5" />
          </SecondaryCta>
        </div>
      </div>
    </section>
  );
}

/** The CTA paired with the primary one.
 *
 * Transparent behind a real outline rather than the filled `secondary`: it
 * stands on a mesh gradient in the hero and on near-black in the closing band,
 * and a `bg-card` pill is the same colour as its own surface in dark mode —
 * the button vanished into the band it was supposed to sit on. */
function SecondaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="pill"
      className="border border-hairline-strong/40 backdrop-blur-sm hover:bg-muted/50"
      asChild
    >
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    </Button>
  );
}
