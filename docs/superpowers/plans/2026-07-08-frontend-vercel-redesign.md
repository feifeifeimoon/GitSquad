# GitSquad Frontend — Vercel-Design Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the entire GitSquad web frontend so every surface faithfully follows the Vercel-inspired `DESIGN.md` design language — ink primary, canvas-soft body, 100px pill CTAs, stacked shadows, Geist type with negative tracking, caption-mono eyebrows, and a multi-color mesh-gradient hero backdrop.

**Architecture:** A single token layer (`globals.css`) drives all surfaces. shadcn primitives (`button`/`card`/`badge`/`input`) are realigned to spec component definitions. A new `MeshGradient` component supplies the brand's sole decoration. All pages are then rewritten to consume tokens + primitives, preserving 100% of existing auth/API/routing/state logic (only classNames + structure change). Status semantics follow spec exactly: success→`#0070f3` blue, warning→`#f5a623` amber, error→`#ee0000` red (no green).

**Tech Stack:** Next.js 16 (App Router, RSC + client islands), React 19, Tailwind v4 (`@theme inline` tokens), shadcn primitives, Geist + Geist Mono (already wired via `next/font`), lucide-react icons.

## Global Constraints

- **Faithful to `DESIGN.md`.** Ink `#171717` is the only primary CTA color. No sixth accent. No green status. Headlines sentence-case, weight 600 ceiling, negative tracking. Mono (`Geist Mono`) for code + technical eyebrows only — never body paragraphs.
- **Token source of truth:** `web/app/globals.css`. Every page consumes tokens via Tailwind utilities (`bg-canvas`, `text-ink`, `border-hairline`, `shadow-level-*`) — no hardcoded `zinc-*`/`orange-*`/`emerald-*` survive after the refactor.
- **Radius scale (fixed):** `sm`=6px (in-app buttons/inputs), `md`=8px (marketing cards), `lg`=12px (large/pricing cards), `xl`=16px, `full`=9999px (icon buttons + nav ghost pills), marketing CTA pill = `rounded-full` (~100px).
- **Marketing CTA = `rounded-full` 100px pill ~48px tall; nav/in-app buttons = `rounded-sm` 6px.** Never mix the two scales on one screen unintentionally.
- **Shadows = stacked** (`shadow-level-1..5` utility classes defined in globals.css), never single heavy drops.
- **Behavior is immutable.** Every rewrite preserves: localStorage token keys (`gitsquad_token`, `gitsquad_return_url`), `api` calls + paths, `useRouter`/`useSearchParams`/`use(params)` usage, `setInterval` timings, modal open/close + Escape + body-scroll-lock logic, sidebar drag-resize math, copy-to-clipboard. Only presentation changes.
- **Existing tests must pass.** `web/app/page.test.mjs` asserts content strings (`Your autonomous developer team on GitHub`, the lead paragraph, `Squad control center`, `Install the GitHub App`, `src="/favicon.ico"`, `alt="GitSquad logo"`, `alt="GitSquad mark"`, `size-14`, agent emojis 🔍🏗️🧹⚡, `The Janitor`) and live-agent-log internals (`"use client"`, `setInterval`, `3000`, two log messages). All preserved verbatim.
- **Commands:** build = `cd web && bun run build`; tests = `cd web && bun test`; lint = `cd web && bun run lint`. Repo root = `D:\odyssey\GitSquad`.

## File Structure

**Foundation (Task 1–2):**
- `web/app/globals.css` — token layer (colors, radius, shadows, mesh-gradient, base).
- `web/app/layout.tsx` — fix `--font-sans` var reference; keep metadata.
- `web/components/ui/button.tsx` — add `pill` / `pill-sm` sizes; align variants to ink/canvas.
- `web/components/ui/card.tsx` — `rounded-md` + `shadow-level-2`.
- `web/components/ui/badge.tsx` — `secondary` = canvas-soft, `rounded-full`.
- `web/components/ui/input.tsx` — `h-10 rounded-sm border-hairline`.
- `web/components/mesh-gradient.tsx` — NEW. Renders the `.mesh-gradient` backdrop div.

**Marketing (Task 3):**
- `web/app/page.tsx` — full rewrite (hero + dark control-center + how-it-works).
- `web/components/live-agent-log.tsx` — restyle to spec palette (cyan handles, white messages).
- `web/components/auth-button.tsx` — spec nav-cta + dropdown.

**Auth flow (Task 4):**
- `web/components/login-modal.tsx` — `ex-auth-form-card`.
- `web/app/login/page.tsx` — Suspense fallback token color.
- `web/app/daemon/auth/page.tsx` — `ex-auth-form-card` + spec status colors.

**Console (Task 5–6):**
- `web/app/console/layout.tsx` — sidebar with primary left-edge active indicator.
- `web/app/console/workspaces/page.tsx` — `card-marketing` rows.
- `web/app/console/workspaces/new/page.tsx` — spec form + repo cards.
- `web/app/console/workspaces/[id]/page.tsx` — spec cards.
- `web/app/console/daemons/page.tsx` — spec cards, blue online status, modal.
- `web/app/console/settings/page.tsx` — spec cards.

**Verify (Task 7):** build + test + lint, final commit.

---

### Task 1: Token layer + font fix + mesh-gradient component

**Files:**
- Modify: `web/app/globals.css`
- Modify: `web/app/layout.tsx`
- Create: `web/components/mesh-gradient.tsx`

**Interfaces:**
- Produces: Tailwind utility classes `bg-canvas`, `bg-canvas-soft`, `bg-canvas-soft-2`, `text-ink`, `text-body`, `text-mute`, `border-hairline`, `border-hairline-strong`, `text-link`, `bg-primary`, `text-warning`, `shadow-level-1..5`, `.mesh-gradient`; CSS vars `--primary`=#171717 etc. Consumed by all later tasks.
- Produces: `<MeshGradient className="..." />` (absolute-positioned backdrop; caller positions it).

- [ ] **Step 1: Rewrite `web/app/globals.css`**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-geist-sans);

  /* DESIGN.md brand + surface tokens */
  --color-canvas: var(--canvas);
  --color-canvas-soft: var(--canvas-soft);
  --color-canvas-soft-2: var(--canvas-soft-2);
  --color-ink: var(--ink);
  --color-body: var(--body);
  --color-mute: var(--mute);
  --color-hairline: var(--hairline);
  --color-hairline-strong: var(--hairline-strong);
  --color-link: var(--link);
  --color-link-deep: var(--link-deep);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-warning-soft: var(--warning-soft);

  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);

  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 20px;
  --radius-3xl: 24px;
  --radius-4xl: 28px;
}

:root {
  /* DESIGN.md surface ladder */
  --canvas: #ffffff;
  --canvas-soft: #fafafa;
  --canvas-soft-2: #f5f5f5;
  --ink: #171717;
  --body: #4d4d4d;
  --mute: #888888;
  --hairline: #ebebeb;
  --hairline-strong: #a1a1a1;

  --background: #fafafa;
  --foreground: #171717;
  --card: #ffffff;
  --card-foreground: #171717;
  --popover: #ffffff;
  --popover-foreground: #171717;
  --primary: #171717;
  --primary-foreground: #ffffff;
  --secondary: #fafafa;
  --secondary-foreground: #171717;
  --muted: #f5f5f5;
  --muted-foreground: #888888;
  --accent: #f5f5f5;
  --accent-foreground: #171717;
  --destructive: #ee0000;
  --border: #ebebeb;
  --input: #ebebeb;
  --ring: #a1a1a1;

  --link: #0070f3;
  --link-deep: #0761d1;
  --success: #0070f3;
  --warning: #f5a623;
  --warning-soft: #ffefcf;

  --chart-1: #007cf0;
  --chart-2: #7928ca;
  --chart-3: #ff0080;
  --chart-4: #00dfd8;
  --chart-5: #f9cb28;

  --radius: 0.375rem;
  --sidebar: #ffffff;
  --sidebar-foreground: #171717;
  --sidebar-primary: #171717;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #f5f5f5;
  --sidebar-accent-foreground: #171717;
  --sidebar-border: #ebebeb;
  --sidebar-ring: #a1a1a1;
}

.dark {
  --background: #0a0a0a;
  --foreground: #ededed;
  --card: #171717;
  --card-foreground: #ededed;
  --popover: #171717;
  --popover-foreground: #ededed;
  --primary: #ededed;
  --primary-foreground: #0a0a0a;
  --secondary: #262626;
  --secondary-foreground: #ededed;
  --muted: #262626;
  --muted-foreground: #a1a1a1;
  --accent: #262626;
  --accent-foreground: #ededed;
  --destructive: #ee0000;
  --border: #ffffff14;
  --input: #ffffff26;
  --ring: #a1a1a1;
  --link: #0070f3;
  --canvas: #171717;
  --canvas-soft: #0a0a0a;
  --canvas-soft-2: #262626;
  --ink: #ededed;
  --body: #a1a1a1;
  --mute: #888888;
  --hairline: #ffffff14;
  --hairline-strong: #a1a1a1;
  --sidebar: #171717;
  --sidebar-foreground: #ededed;
  --sidebar-primary: #ededed;
  --sidebar-primary-foreground: #0a0a0a;
  --sidebar-accent: #262626;
  --sidebar-accent-foreground: #ededed;
  --sidebar-border: #ffffff14;
  --sidebar-ring: #a1a1a1;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground antialiased;
    font-feature-settings: "ss01", "ss02";
  }
  html {
    @apply font-sans;
  }
  ::selection {
    background: #171717;
    color: #f2f2f2;
  }
}

@layer components {
  /* Stacked-shadow elevation per DESIGN.md (Level 1–5). */
  .shadow-level-1 { box-shadow: inset 0 0 0 1px #00000014; }
  .shadow-level-2 { box-shadow: inset 0 0 0 1px #00000014, 0 1px 1px #00000005, 0 2px 2px #0000000a; }
  .shadow-level-3 { box-shadow: inset 0 0 0 1px #00000014, 0 2px 2px #0000000a, 0 8px 8px -8px #0000000a; }
  .shadow-level-4 { box-shadow: inset 0 0 0 1px #00000014, 0 2px 2px #0000000a, 0 8px 16px -4px #0000000a; }
  .shadow-level-5 { box-shadow: inset 0 0 0 1px #00000014, 0 1px 1px #00000005, 0 8px 16px -4px #0000000a, 0 24px 32px -8px #0000000f; }

  /* Multi-color mesh gradient — brand's sole decoration, hero-scale only. */
  .mesh-gradient {
    background:
      radial-gradient(40% 50% at 18% 28%, #007cf0 0%, transparent 70%),
      radial-gradient(35% 45% at 78% 18%, #7928ca 0%, transparent 70%),
      radial-gradient(45% 55% at 62% 82%, #ff0080 0%, transparent 70%),
      radial-gradient(38% 48% at 28% 72%, #00dfd8 0%, transparent 70%),
      radial-gradient(30% 40% at 92% 58%, #f9cb28 0%, transparent 70%);
    filter: blur(60px) saturate(1.1);
  }
}
```

- [ ] **Step 2: Fix font variable reference in `web/app/layout.tsx`**

The current `@theme` block references `var(--font-sans)` self-referentially; map it to the `next/font` variable `--font-geist-sans`. Replace the whole file:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GitSquad - Your autonomous developer team on GitHub",
  description: "Your autonomous developer team on GitHub",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Create `web/components/mesh-gradient.tsx`**

```tsx
export function MeshGradient({ className }: { className?: string }) {
  return <div aria-hidden className={`mesh-gradient ${className ?? ""}`} />;
}
```

- [ ] **Step 4: Verify build**

Run: `cd web && bun run build`
Expected: build succeeds (tokens compile; no page references broken yet since pages still use old classes — Tailwind v4 tolerates unknown utilities? No — unknown utilities error. Old pages use `zinc-*`/`orange-*` which are still valid Tailwind defaults, so build passes.)

- [ ] **Step 5: Commit**

```bash
git add web/app/globals.css web/app/layout.tsx web/components/mesh-gradient.tsx
git commit -m "feat(web): Vercel-design token layer + mesh-gradient component"
```

---

### Task 2: Realign shadcn primitives to spec

**Files:**
- Modify: `web/components/ui/button.tsx`
- Modify: `web/components/ui/card.tsx`
- Modify: `web/components/ui/badge.tsx`
- Modify: `web/components/ui/input.tsx`

**Interfaces:**
- Produces: `<Button size="pill">` (100px-radius marketing CTA, ~48px), `<Button size="pill-sm">` (nav/pricing pill), `<Button variant="secondary">` (white canvas). Card = `rounded-md shadow-level-2`. Badge `secondary` = canvas-soft `rounded-full`. Input = `h-10 rounded-sm border-hairline`.

- [ ] **Step 1: Rewrite `web/components/ui/button.tsx`**

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding font-sans whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        secondary:
          "bg-card text-foreground shadow-level-1 hover:bg-muted",
        outline:
          "border-border bg-card text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 gap-1.5 rounded-sm px-3 text-sm font-medium",
        sm: "h-7 gap-1 rounded-sm px-2.5 text-[0.8rem] font-medium",
        lg: "h-9 gap-1.5 rounded-sm px-4 text-sm font-medium",
        pill: "h-12 rounded-full px-6 text-base font-medium gap-2",
        "pill-sm": "h-8 rounded-full px-4 text-sm font-medium gap-1.5",
        icon: "size-8 rounded-sm",
        "icon-sm": "size-7 rounded-sm",
        "icon-lg": "size-9 rounded-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

- [ ] **Step 2: Rewrite `web/components/ui/card.tsx`**

Change `rounded-xl` → `rounded-md` and add `shadow-level-2`; keep compound structure. Replace the `Card` function's className and the footer/header rounded tokens. Full file:

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-md bg-card py-(--card-spacing) text-sm text-card-foreground shadow-level-2 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-md *:[img:last-child]:rounded-b-md",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-md px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-md border-t border-hairline bg-muted/50 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
```

- [ ] **Step 3: Rewrite `web/components/ui/badge.tsx`**

`secondary` → canvas-soft bg + body text; `rounded-full`. Full file:

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-canvas-soft text-body border-hairline",
        destructive: "bg-destructive/10 text-destructive",
        outline: "border-hairline text-foreground",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-link underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
```

- [ ] **Step 4: Rewrite `web/components/ui/input.tsx`**

`h-10 rounded-sm border-hairline` (form-input = 40px). Full file:

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-sm border border-hairline bg-card px-3 py-1 text-sm text-ink transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-mute focus-visible:border-hairline-strong focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
```

- [ ] **Step 5: Verify build**

Run: `cd web && bun run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add web/components/ui/button.tsx web/components/ui/card.tsx web/components/ui/badge.tsx web/components/ui/input.tsx
git commit -m "feat(web): realign shadcn primitives to Vercel-design spec"
```

---

### Task 3: Marketing landing page + live-agent-log + auth-button

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/components/live-agent-log.tsx`
- Modify: `web/components/auth-button.tsx`

**Interfaces:**
- Consumes: `Button` (`size="pill"`/`"pill-sm"`, `variant="secondary"`), `Badge`, `MeshGradient`, tokens.
- Produces: public homepage. **Must keep test-asserted strings** (see Global Constraints).

- [ ] **Step 1: Rewrite `web/components/live-agent-log.tsx`**

Preserve `stream` data, `setInterval`/3000, `useMemo` rotation. Restyle palette: cyan agent handles (gradient color), white messages, white/40 timestamps. Full file:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";

const stream = [
  ["16:27:00", "@janitor", "Identified pattern for code duplication in /ui"],
  ["16:27:04", "@janitor", "Updating documentation for internal API v2"],
  ["16:27:08", "@reviewer", "Updating documentation for internal API v2"],
  ["16:27:12", "@deployer", "Cleaning up stale branches older than 30 days"],
  ["16:27:16", "@architect", "Drafting workspace boundary map for runtime adapters"],
  ["16:27:20", "@reviewer", "Scanning PR #482 for security vulnerabilities"],
];

export function LiveAgentLog() {
  const [cursor, setCursor] = useState(3);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCursor((current) => (current + 1) % stream.length);
    }, 3000);

    return () => window.clearInterval(interval);
  }, []);

  const visibleLines = useMemo(
    () => Array.from({ length: 4 }, (_, index) => stream[(cursor + index) % stream.length]),
    [cursor],
  );

  return (
    <div className="h-[132px] overflow-hidden bg-black px-6 py-5 font-mono text-[12px] leading-6 sm:px-8">
      <div className="transition-transform duration-500 ease-out">
        {visibleLines.map(([time, agent, message]) => (
          <p key={time + agent + message} className="grid grid-cols-[78px_82px_1fr] gap-2 text-white/40 max-sm:grid-cols-1 max-sm:gap-0 max-sm:py-1">
            <span>[{time}]</span>
            <span className="text-[#50e3c2]">{agent}</span>
            <span className="truncate text-white/80">{message}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `web/components/auth-button.tsx`**

Preserve all logic (localStorage, `api.get("/api/v1/me")`, click-outside, logout, router). Restyle: login = `Button size="pill-sm"`; avatar button `rounded-full border-hairline`; dropdown `rounded-md border-hairline bg-canvas shadow-level-4`. Full file:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface User {
  id: string;
  login: string;
  avatar_url: string;
}

export function AuthButton({ onLoginClick }: { onLoginClick?: () => void }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("gitsquad_token");
    if (!token) return;

    api
      .get<User>("/api/v1/me")
      .then(setUser)
      .catch(() => localStorage.removeItem("gitsquad_token"));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("gitsquad_token");
    setUser(null);
    setOpen(false);
  };

  if (user) {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-full border border-hairline p-0.5 transition-colors hover:border-hairline-strong"
        >
          <Image
            src={user.avatar_url}
            alt={user.login}
            width={28}
            height={28}
            className="size-7 rounded-full"
          />
        </button>

        {open && (
          <div className="absolute right-0 top-11 w-48 rounded-md border border-hairline bg-canvas py-1 shadow-level-4 z-50">
              <div className="border-b border-hairline px-3 py-2">
                <p className="text-sm font-semibold text-ink">@{user.login}</p>
              </div>
              <button
                onClick={() => { router.push("/console"); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-body transition-colors hover:bg-muted hover:text-ink"
              >
                <LayoutDashboard className="size-3.5" />
                Console
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-body transition-colors hover:bg-muted hover:text-ink"
              >
                <LogOut className="size-3.5" />
                Logout
              </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Button
      size="pill-sm"
      onClick={() => {
        if (onLoginClick) {
          onLoginClick();
        } else {
          router.push("/login");
        }
      }}
    >
      Login
    </Button>
  );
}
```

- [ ] **Step 3: Rewrite `web/app/page.tsx`**

Preserve `agents` array, `showLoginModal` state, `LoginModal`/`AuthButton`/`LiveAgentLog` wiring, and ALL test-asserted strings. New structure: sticky nav (64px, canvas/blur, hairline border) → hero band with `MeshGradient` backdrop + mono badge + display-xl headline (period-terminated) + body-lg lead + pill CTA row → dark showcase band (bg-primary) holding the control-center table → light showcase band with 3 `card-marketing`. Full file:

```tsx
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
              <a href="/docs">
                Read the docs
                <ArrowRight className="size-3.5" />
              </a>
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
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/40">
                Squad control center v2.4.0
              </p>
            </div>

            <div className="grid border-b border-white/10 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40 sm:grid-cols-3">
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
                <div className="grid grid-cols-[1.1fr_0.8fr_1.5fr_0.45fr_0.45fr] border-b border-white/10 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40 max-md:hidden">
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
                          <p className="font-mono text-[10px] uppercase text-white/40">{agent.id}</p>
                        </div>
                      </div>
                      <span className="w-fit rounded-full bg-[#0070f3]/15 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase text-[#0070f3]">
                        <span className="mr-1 inline-block size-2 rounded-full bg-[#0070f3]" />
                        {agent.status}
                      </span>
                      <p className="truncate font-mono text-xs text-white/80">{agent.task}</p>
                      <p className="font-mono text-xs font-bold text-white">{agent.cpu}</p>
                      <p className="font-mono text-xs font-bold text-white">{agent.uptime}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <LiveAgentLog />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
              <span>
                Status: <b className="text-[#0070f3]">nominal</b>
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
```

- [ ] **Step 4: Verify build + tests**

Run: `cd web && bun run build`
Expected: build succeeds.
Run: `cd web && bun test`
Expected: all 4 tests pass (content strings preserved).

- [ ] **Step 5: Commit**

```bash
git add web/app/page.tsx web/components/live-agent-log.tsx web/components/auth-button.tsx
git commit -m "feat(web): redesign marketing landing to Vercel design language"
```

---

### Task 4: Auth flow — login modal, login page, daemon auth

**Files:**
- Modify: `web/components/login-modal.tsx`
- Modify: `web/app/login/page.tsx`
- Modify: `web/app/daemon/auth/page.tsx`

**Interfaces:**
- Consumes: `ex-auth-form-card` chrome (canvas-soft surface, `rounded-lg`, padding xl), `form-input` (h-10 rounded-sm). Status colors: success `#0070f3`, error `#ee0000`.
- Preserves: `API_URL`, `handleLogin` redirect to `/api/v1/auth/google`, `returnURL` localStorage, Escape + body-scroll-lock, daemon pairing state machine + `api.get/post` calls.

- [ ] **Step 1: Rewrite `web/components/login-modal.tsx`**

Preserve all logic. Card = canvas-soft `rounded-lg` `shadow-level-4`; Google button = white `rounded-sm` border-hairline; error = `bg-destructive/10 text-destructive`. Full file:

```tsx
"use client";

import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import Image from "next/image";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface LoginModalProps {
  mode: "modal" | "page";
  open?: boolean;
  onClose?: () => void;
  error?: string | null;
  returnURL?: string;
}

const errorMessages: Record<string, string> = {
  invalid_state: "Session expired. Please try again.",
  token_exchange_failed: "Google authentication failed. Please try again.",
  google_api_failed: "Failed to fetch Google profile. Please try again.",
  internal_error: "An internal error occurred. Please try again later.",
};

export function LoginModal({ mode, open, onClose, error, returnURL }: LoginModalProps) {
  const handleLogin = useCallback(() => {
    if (returnURL) {
      localStorage.setItem("gitsquad_return_url", returnURL);
    }
    window.location.href = `${API_URL}/api/v1/auth/google`;
  }, [returnURL]);

  // Close on Escape key (modal mode only).
  useEffect(() => {
    if (mode !== "modal" || !open || !onClose) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mode, open, onClose]);

  // Prevent body scroll when modal is open.
  useEffect(() => {
    if (mode === "modal" && open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mode, open]);

  if (mode === "modal" && !open) return null;

  const content = (
    <div className="flex flex-col items-center text-center">
      {/* Logo */}
      <div className="mb-6 flex size-14 items-center justify-center rounded-md border border-hairline bg-canvas shadow-level-2">
        <Image
          src="/favicon.ico"
          alt="GitSquad"
          width={48}
          height={48}
          className="size-11 rounded-sm"
          priority
        />
      </div>

      {/* Heading */}
      <h2 className="text-2xl font-semibold tracking-[-0.04em] text-ink">
        Welcome back
      </h2>
      <p className="mt-2 text-sm text-body">
        Log in to your GitSquad account to continue
      </p>

      {/* Error */}
      {error && (
        <div className="mt-6 w-full rounded-sm border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {errorMessages[error] || "An unexpected error occurred. Please try again."}
        </div>
      )}

      {/* Google button */}
      <button
        onClick={handleLogin}
        className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-sm border border-hairline bg-canvas px-5 py-2.5 text-sm font-medium text-ink shadow-level-1 transition-colors hover:bg-muted"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <p className="mt-4 text-xs text-mute">
        Your agent team is one click away.
      </p>
    </div>
  );

  // ── Page mode: full-page centered layout ──
  if (mode === "page") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas-soft px-6">
        <div className="w-full max-w-sm rounded-lg border border-hairline bg-canvas-soft-2 p-8 shadow-level-4">
          {content}
        </div>
      </main>
    );
  }

  // ── Modal mode: overlay with backdrop ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div className="relative w-full max-w-sm rounded-lg border border-hairline bg-canvas-soft-2 p-8 shadow-level-5">
        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-sm p-1 text-mute transition-colors hover:bg-muted hover:text-ink"
          >
            <X className="size-4" />
          </button>
        )}

        {content}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Rewrite `web/app/login/page.tsx`**

Only the Suspense fallback color changes. Full file:

```tsx
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LoginModal } from "@/components/login-modal";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const returnURL = searchParams.get("return") || undefined;

  return (
    <LoginModal
      mode="page"
      error={error}
      returnURL={returnURL}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20 text-mute">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
```

- [ ] **Step 3: Rewrite `web/app/daemon/auth/page.tsx`**

Preserve the entire state machine (`loading`/`need_login`/`confirm`/`confirming`/`confirmed`/`error`), `Promise.all` fetches, `handleConfirm`, code-splitting. Card = `ex-auth-form-card` (canvas-soft-2, rounded-lg, shadow-level-4); verification tiles `rounded-sm` border-hairline; confirmed = `#0070f3` (success, was green); error = `#ee0000`. Full file:

```tsx
"use client";

import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Check, Loader2, ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { api } from "@/lib/api";

function DaemonAuthContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("code") || "";

  const [status, setStatus] = useState<"loading" | "need_login" | "confirm" | "confirming" | "confirmed" | "error">(() => {
    if (typeof window === "undefined") return "loading";
    return localStorage.getItem("gitsquad_token") ? "loading" : "need_login";
  });
  const [error, setError] = useState("");
  const [machineName, setMachineName] = useState("");
  const [userAvatar, setUserAvatar] = useState("");
  const [userLogin, setUserLogin] = useState("");

  // Check auth and fetch pairing info on mount.
  useEffect(() => {
    const token = localStorage.getItem("gitsquad_token");
    if (!token) {
      queueMicrotask(() => setStatus("need_login"));
      return;
    }
    let cancelled = false;
    // Fetch user info and pairing info in parallel.
    Promise.all([
      api.get<{ avatar_url: string; login: string }>("/api/v1/me"),
      api.get<{ status: string; machine_name: string }>(`/api/v1/daemon/auth/${code}`),
    ])
      .then(([user, pairing]) => {
        if (cancelled) return;
        setUserAvatar(user.avatar_url);
        setUserLogin(user.login);
        setMachineName(pairing.machine_name || "Unknown device");
        setStatus("confirm");
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem("gitsquad_token");
        queueMicrotask(() => setStatus("need_login"));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = async () => {
    setStatus("confirming");
    try {
      await api.post(`/api/v1/daemon/auth/${code}/confirm`);
      setStatus("confirmed");
    } catch (err: unknown) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to confirm pairing.");
    }
  };

  const codeParts = code ? code.split("-") : [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas-soft p-4">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-hairline bg-canvas-soft-2 p-8 shadow-level-4">
          {/* Header — connection flow */}
          <div className="mb-8 flex items-center justify-center gap-4">
            <Avatar className="size-14 ring-2 ring-hairline ring-offset-2 ring-offset-canvas-soft-2">
              <AvatarImage src={userAvatar} />
              <AvatarFallback className="text-lg">
                {userLogin?.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <ArrowRight className="size-5 text-hairline-strong" />
            <div className="flex size-14 items-center justify-center rounded-md bg-muted ring-2 ring-hairline ring-offset-2 ring-offset-canvas-soft-2">
              <Image src="/favicon.ico" alt="GitSquad" width={28} height={28} className="size-7" />
            </div>
          </div>
          <h1 className="text-center text-xl font-semibold tracking-[-0.04em] text-ink">Device Activation</h1>

          {/* Need login */}
          {status === "need_login" && (
            <div className="space-y-5 text-center">
              <p className="text-sm text-body">
                Log in with your Google account to connect a daemon to GitSquad.
              </p>
              <button
                onClick={() => router.push(`/login?return=${encodeURIComponent(`/daemon/auth?code=${code}`)}`)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/85"
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Login with Google
              </button>
            </div>
          )}

          {/* Loading */}
          {status === "loading" && (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-mute" />
            </div>
          )}

          {/* Confirm */}
          {(status === "confirm" || status === "confirming") && (
            <div className="space-y-6">
              {/* Pairing code */}
              <div>
                <p className="mb-3 text-center font-mono text-xs uppercase tracking-wider text-mute">
                  Verification Code
                </p>
                <div className="flex items-center justify-center gap-2">
                  {codeParts.map((part, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {part.split("").map((ch, j) => (
                          <span
                            key={j}
                            className="flex size-10 items-center justify-center rounded-sm border border-hairline bg-canvas-soft text-lg font-bold uppercase text-ink"
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                      {i < codeParts.length - 1 && (
                        <span className="text-lg font-bold text-hairline-strong">—</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Device info */}
              <div className="rounded-sm border border-hairline bg-canvas-soft p-4 text-center">
                <p className="mb-1 text-xs text-mute">Device</p>
                <p className="text-sm font-semibold text-ink">{machineName}</p>
              </div>

              <p className="text-center text-xs text-mute">
                This device will be able to execute tasks on your behalf.
              </p>

              <button
                onClick={handleConfirm}
                disabled={status === "confirming"}
                className="w-full rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/85 disabled:opacity-50"
              >
                {status === "confirming" ? "Confirming..." : "Authorize Device"}
              </button>
            </div>
          )}

          {/* Confirmed */}
          {status === "confirmed" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#0070f3]/10">
                <Check className="size-6 text-[#0070f3]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ink">Device Connected</h2>
                <p className="mt-1 text-sm text-body">
                  You can close this page and return to your terminal.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
                <span className="text-xl font-bold text-destructive">!</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ink">Verification Failed</h2>
                <p className="mt-1 text-sm text-body">{error}</p>
              </div>
              <a
                href="/login"
                className="inline-block text-sm text-body transition-colors hover:text-ink"
              >
                Back to login
              </a>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-mute">
          GitSquad — Autonomous developer team on GitHub
        </p>
      </div>
    </main>
  );
}

export default function DaemonAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas-soft">
          <Loader2 className="size-6 animate-spin text-mute" />
        </div>
      }
    >
      <DaemonAuthContent />
    </Suspense>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd web && bun run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/components/login-modal.tsx web/app/login/page.tsx web/app/daemon/auth/page.tsx
git commit -m "feat(web): redesign auth flow to Vercel design language"
```

---

### Task 5: Console shell + workspaces pages

**Files:**
- Modify: `web/app/console/layout.tsx`
- Modify: `web/app/console/workspaces/page.tsx`
- Modify: `web/app/console/workspaces/new/page.tsx`
- Modify: `web/app/console/workspaces/[id]/page.tsx`

**Interfaces:**
- Consumes: `Button` primitive, tokens, `shadow-level-*`. Sidebar nav active state = primary left-edge indicator bar (per `ex-app-shell-row`).
- Preserves: sidebar drag-resize (`MIN_WIDTH`/`MAX_WIDTH`/`DEFAULT_WIDTH`, mouse listeners), auth gate redirect to `/login`, `api` calls, `use(params)`, archive/delete handlers.

- [ ] **Step 1: Rewrite `web/app/console/layout.tsx`**

Preserve drag-resize + auth gate. Sidebar: canvas bg, hairline border-r, active nav = `bg-muted text-ink` + primary 2px left indicator; logout modal = `ex-modal-card`. Spinner uses `border-primary border-t-transparent`. Full file:

```tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Monitor, Settings, LogOut, FolderGit2 } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface User {
  id: string;
  login: string;
  avatar_url: string;
}

const navItems = [
  { href: "/console/workspaces", label: "Workspaces", icon: FolderGit2 },
  { href: "/console/daemons", label: "Daemons", icon: Monitor },
  { href: "/console/settings", label: "Settings", icon: Settings },
];

const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 240;

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);

  useEffect(() => {
    api
      .get<User>("/api/v1/me")
      .then(setUser)
      .catch(() => router.push("/login"));
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("gitsquad_token");
    router.push("/");
  };

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setSidebarWidth(next);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div className="flex h-screen bg-canvas">
      {/* Sidebar */}
      <aside
        className="relative flex shrink-0 flex-col border-r border-hairline bg-canvas"
        style={{ width: sidebarWidth }}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b border-hairline px-5">
          <Image src="/favicon.ico" alt="GitSquad" width={20} height={20} className="size-5 rounded-sm" />
          <span className="text-sm font-semibold tracking-tight">GitSquad</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`relative flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-muted text-ink"
                    : "text-body hover:bg-muted hover:text-ink"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                )}
                <item.icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-hairline px-3 py-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="text-xs">
                {user?.login?.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                @{user?.login}
              </p>
            </div>
            <button
              onClick={() => setLogoutConfirm(true)}
              className="text-mute transition-colors hover:text-ink"
              title="Logout"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>

        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-hairline-strong"
          onMouseDown={onMouseDown}
        />
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-auto">{children}</div>

      {/* Logout confirmation */}
      {logoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="max-w-xs rounded-lg border border-hairline bg-canvas p-6 shadow-level-5">
            <p className="mb-1 text-sm font-semibold text-ink">Sign out</p>
            <p className="mb-4 text-sm text-body">Are you sure you want to sign out?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setLogoutConfirm(false)}
                className="rounded-sm px-3 py-1.5 text-sm text-body transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/85"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `web/app/console/workspaces/page.tsx`**

Preserve `api.get`/`api.delete`, archive handler, empty state. Cards: `rounded-md border-hairline bg-canvas shadow-level-2 hover:shadow-level-3`; workspace tile `bg-primary text-white rounded-sm`; status badge amber→spec (`bg-warning/15 text-warning`); spinner `border-primary border-t-transparent`. Use `Button` for CTAs. Full file:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Archive, ExternalLink, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Workspace {
  id: string;
  name: string;
  status: string;
  repo_full_name: string;
  repo_owner: string;
  repo_name: string;
  repo_private: boolean;
  created_at: string;
}

export default function WorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Workspace[]>("/api/v1/workspaces")
      .then((data) => setWorkspaces(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleArchive = async (id: string) => {
    try {
      await api.delete(`/api/v1/workspaces/${id}`);
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">Workspaces</h1>
          <p className="mt-1 text-sm text-body">
            {workspaces.length} workspace{workspaces.length !== 1 && "s"}
          </p>
        </div>
        <Button onClick={() => router.push("/console/workspaces/new")}>
          <Plus className="size-4" />
          New Workspace
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <div className="rounded-md border border-dashed border-hairline-strong p-16 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
            <Plus className="size-6 text-mute" />
          </div>
          <p className="mb-1 text-sm font-semibold text-ink">
            No workspaces yet
          </p>
          <p className="mx-auto mb-6 max-w-xs text-sm text-body">
            Link a GitHub repository and configure your agent team to get
            started.
          </p>
          <Button onClick={() => router.push("/console/workspaces/new")}>
            Create your first Workspace
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {workspaces.map((w) => (
            <div
              key={w.id}
              onClick={() => router.push(`/console/workspaces/${w.id}`)}
              className="group flex cursor-pointer items-center justify-between rounded-md border border-hairline bg-canvas p-5 shadow-level-2 transition-all hover:shadow-level-3"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary text-sm font-bold text-white">
                  {w.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">
                      {w.name}
                    </p>
                    {w.status !== "active" && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
                        {w.status}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <ExternalLink className="size-3 shrink-0 text-mute" />
                    <p className="truncate text-[13px] text-body">
                      {w.repo_full_name || w.repo_owner + "/" + w.repo_name}
                    </p>
                    {w.repo_private && (
                      <Lock className="size-3 shrink-0 text-mute" />
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleArchive(w.id);
                }}
                className="shrink-0 rounded-sm p-2 text-mute opacity-0 transition-all hover:bg-muted hover:text-ink group-hover:opacity-100"
                title="Archive workspace"
              >
                <Archive className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `web/app/console/workspaces/new/page.tsx`**

Preserve `fetchRepos`, `Promise.all`-free sequential fetch, `handleSubmit`, search filter, repo selection. Tabs = `tab-ghost`-style pills (active `bg-primary text-white`); search input `h-10 rounded-sm border-hairline`; repo cards `rounded-md border-hairline`, active = `ring-1 ring-primary`; form panel `rounded-md border-hairline bg-canvas shadow-level-2`; error `bg-destructive/10 text-destructive`. Full file:

```tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Lock, Search, Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Repo {
  id: string;
  full_name: string;
  owner: string;
  name: string;
  private: boolean;
}

interface Installation {
  id: string;
  account_login: string;
  account_type: string;
  repos: Repo[];
}

export default function NewWorkspacePage() {
  const router = useRouter();
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInstallationID, setSelectedInstallationID] = useState("");
  const [selectedRepoID, setSelectedRepoID] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [repoLoading, setRepoLoading] = useState(false);

  // Fetch repos for the selected installation.
  const fetchRepos = async (installationID: string) => {
    const existing = installations.find((i) => i.id === installationID);
    if (existing?.repos?.length) return;

    setRepoLoading(true);
    try {
      const data = await api.get<{ repos: Repo[] }>(
        `/api/v1/github/installations/${installationID}`
      );
      setInstallations((prev) =>
        prev.map((inst) =>
          inst.id === installationID
            ? { ...inst, repos: data.repos || [] }
            : inst
        )
      );
    } catch {
      // ignore
    } finally {
      setRepoLoading(false);
    }
  };

  useEffect(() => {
    api
      .get<Installation[]>("/api/v1/github/installations")
      .then((data) => {
        const list = data || [];
        setInstallations(list);
        if (list.length > 0) {
          const first = list[0].id;
          setSelectedInstallationID(first);
          // Fetch repos for first installation.
          setTimeout(() => fetchRepos(first), 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedInstallation = installations.find(
    (i) => i.id === selectedInstallationID
  );
  const repos = useMemo(() => selectedInstallation?.repos || [], [selectedInstallation?.repos]);

  const filteredRepos = useMemo(() => {
    if (!search.trim()) return repos;
    const q = search.toLowerCase();
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.owner.toLowerCase().includes(q)
    );
  }, [repos, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedInstallationID || !selectedRepoID || !name.trim()) {
      setError("All fields are required.");
      return;
    }

    setCreating(true);
    try {
      await api.post("/api/v1/workspaces", {
        installation_id: selectedInstallationID,
        repo_id: selectedRepoID,
        name: name.trim(),
      });
      router.push("/console/workspaces");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to create workspace.";
      setError(msg);
    }
    setCreating(false);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <button
        onClick={() => router.push("/console/workspaces")}
        className="mb-6 flex items-center gap-1 text-sm text-body transition-colors hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        All Workspaces
      </button>

      <h1 className="mb-2 text-2xl font-semibold tracking-[-0.04em] text-ink">
        Create a Workspace
      </h1>
      <p className="mb-8 text-sm text-body">
        Import a Git repository and configure your agent team.
      </p>

      {installations.length === 0 ? (
        <div className="rounded-md border border-hairline bg-canvas p-12 text-center shadow-level-2">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
            <Search className="size-6 text-mute" />
          </div>
          <p className="mb-1 text-sm font-semibold text-ink">
            No GitHub installations
          </p>
          <p className="text-sm text-body">
            Install the GitSquad GitHub App to connect your repositories.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {/* Account tabs */}
          {installations.length > 1 && (
            <div className="mb-6 flex gap-2">
              {installations.map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => {
                    setSelectedInstallationID(inst.id);
                    setSelectedRepoID("");
                    fetchRepos(inst.id);
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    selectedInstallationID === inst.id
                      ? "bg-primary text-white"
                      : "bg-muted text-body hover:bg-canvas-soft-2 hover:text-ink"
                  }`}
                >
                  {inst.account_login}
                </button>
              ))}
            </div>
          )}

          {/* Repo search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repositories..."
              className="h-10 w-full rounded-sm border border-hairline bg-canvas pl-9 pr-3 text-sm text-ink transition-colors placeholder:text-mute focus:border-hairline-strong focus:outline-none"
            />
          </div>

          {/* Repo cards */}
          {repoLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-mute" />
            </div>
          ) : (
            <div className="mb-8 grid max-h-96 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {filteredRepos.map((repo) => {
                const isSelected = selectedRepoID === repo.id;
                return (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => setSelectedRepoID(repo.id)}
                    className={`flex items-center gap-3 rounded-md border p-4 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-muted ring-1 ring-primary"
                        : "border-hairline bg-canvas hover:bg-muted"
                    }`}
                  >
                    <div
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-hairline-strong"
                      }`}
                    >
                      {isSelected && (
                        <Check className="size-3 text-white" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-ink">
                          {repo.name}
                        </p>
                        {repo.private && (
                          <Lock className="size-3 shrink-0 text-mute" />
                        )}
                      </div>
                      <p className="truncate text-xs text-mute">
                        {repo.owner}
                      </p>
                    </div>
                  </button>
                );
              })}
              {filteredRepos.length === 0 && !repoLoading && (
                <div className="col-span-2 py-12 text-center">
                  <p className="text-sm text-mute">
                    {search
                      ? "No repositories match your search."
                      : "No repositories found."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Name + Create */}
          {selectedRepoID && (
            <div className="space-y-4 rounded-md border border-hairline bg-canvas p-5 shadow-level-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">
                  Workspace Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. main, frontend, backend"
                  className="h-10 w-full rounded-sm border border-hairline bg-canvas px-3 text-sm text-ink transition-colors placeholder:text-mute focus:border-hairline-strong focus:outline-none"
                  required
                />
              </div>

              {error && (
                <p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={creating} className="w-full">
                {creating ? "Creating..." : "Create Workspace"}
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `web/app/console/workspaces/[id]/page.tsx`**

Preserve `use(params)`, `api.get`, redirect on catch. Status pill: active→`#0070f3` (was green), degraded→amber, else muted. Cards `rounded-md border-hairline bg-canvas shadow-level-2`. Full file:

```tsx
"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ExternalLink, Lock, Calendar } from "lucide-react";
import { api } from "@/lib/api";

interface Workspace {
  id: string;
  name: string;
  status: string;
  repo_full_name: string;
  repo_owner: string;
  repo_name: string;
  repo_private: boolean;
  created_at: string;
  updated_at: string;
}

export default function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Workspace>(`/api/v1/workspaces/${id}`)
      .then(setWorkspace)
      .catch(() => router.push("/console/workspaces"))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!workspace) return null;

  const repoFullName = workspace.repo_full_name || `${workspace.repo_owner}/${workspace.repo_name}`;

  return (
    <div className="p-8">
      <button
        onClick={() => router.push("/console/workspaces")}
        className="mb-6 flex items-center gap-1 text-sm text-body transition-colors hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        All Workspaces
      </button>

      {/* Header */}
      <div className="mb-8 flex items-start gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-primary text-lg font-bold text-white">
          {workspace.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-ink">{workspace.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                workspace.status === "active"
                  ? "bg-[#0070f3]/15 text-[#0070f3]"
                  : workspace.status === "degraded"
                  ? "bg-warning/15 text-warning"
                  : "bg-muted text-mute"
              }`}
            >
              {workspace.status}
            </span>
          </div>
        </div>
      </div>

      {/* Repo card */}
      <div className="mb-6 rounded-md border border-hairline bg-canvas p-5 shadow-level-2">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-sm bg-muted">
            {workspace.repo_private ? (
              <Lock className="size-4 text-body" />
            ) : (
              <ExternalLink className="size-4 text-body" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">{repoFullName}</p>
            <p className="text-xs text-mute">
              {workspace.repo_private ? "Private" : "Public"} repository
            </p>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-md border border-hairline bg-canvas p-5 shadow-level-2">
        <h2 className="mb-3 text-sm font-semibold text-ink">Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="mb-0.5 text-xs text-mute">Created</p>
            <div className="flex items-center gap-1.5">
              <Calendar className="size-3.5 text-mute" />
              <p className="text-body">
                {new Date(workspace.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
          <div>
            <p className="mb-0.5 text-xs text-mute">Repository</p>
            <p className="truncate text-body">{repoFullName}</p>
          </div>
        </div>
      </div>

      {/* Placeholder for future features */}
      <div className="mt-6 rounded-md border border-dashed border-hairline-strong p-10 text-center">
        <p className="mb-1 text-sm font-medium text-body">
          Issues & agent configuration
        </p>
        <p className="text-xs text-mute">
          Issue blackboard and agent team management coming in upcoming sprints.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `cd web && bun run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add web/app/console/layout.tsx web/app/console/workspaces/page.tsx web/app/console/workspaces/new/page.tsx web/app/console/workspaces/[id]/page.tsx
git commit -m "feat(web): redesign console shell + workspaces to Vercel design language"
```

---

### Task 6: Console daemons + settings

**Files:**
- Modify: `web/app/console/daemons/page.tsx`
- Modify: `web/app/console/settings/page.tsx`

**Interfaces:**
- Consumes: `Button` primitive, tokens, `shadow-level-*`. Online status → `#0070f3` (was emerald). Connect modal = `ex-modal-card` (Level 5 shadow).
- Preserves: `setInterval(fetchDaemons, 15000)`, delete-with-confirm, copy-to-clipboard, `api` calls.

- [ ] **Step 1: Rewrite `web/app/console/daemons/page.tsx`**

Preserve polling, delete confirm, copy logic. Stats cards `rounded-md border-hairline bg-canvas shadow-level-2`; online dot/chip `#0070f3` (was emerald); runtime chips `bg-[#0070f3]/10 text-[#0070f3]`; modal `rounded-lg shadow-level-5`; code block `bg-muted font-mono`; spinner `border-primary border-t-transparent`. Use `Button` for Connect. Full file:

```tsx
"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Monitor, Cpu, Trash2, Plus, Laptop, Cloud, Copy, Terminal, Check } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Runtime {
  kind: string;
  executable_path?: string;
  version?: string;
  max_concurrency: number;
}

interface Daemon {
  id: string;
  name: string;
  status: string;
  os: string;
  arch: string;
  daemon_version: string;
  last_seen_at: string | null;
  registered_at: string;
  runtimes: Runtime[];
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function DaemonsPage() {
  const [daemons, setDaemons] = useState<Daemon[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const fetchDaemons = () => {
      api
        .get<Daemon[]>("/api/v1/daemons")
        .then((data) => setDaemons(data || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    fetchDaemons();
    const interval = setInterval(fetchDaemons, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/v1/daemons/${id}`);
      setDaemons((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // ignore
    }
    setDeleting(null);
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard?.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="size-5 text-ink" />
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">Daemons</h1>
        </div>
        <Button size="sm" onClick={() => setShowConnect(true)}>
          <Plus className="size-3.5" />
          Connect Daemon
        </Button>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-md border border-hairline bg-canvas p-4 shadow-level-2">
          <div className="mb-1 flex items-center gap-2 text-sm text-body">
            <Monitor className="size-4" />
            Total
          </div>
          <p className="text-2xl font-bold text-ink">{daemons.length}</p>
        </div>
        <div className="rounded-md border border-hairline bg-canvas p-4 shadow-level-2">
          <div className="mb-1 flex items-center gap-2 text-sm text-body">
            <CheckCircle2 className="size-4 text-[#0070f3]" />
            Online
          </div>
          <p className="text-2xl font-bold text-ink">
            {daemons.filter((d) => d.status === "online").length}
          </p>
        </div>
        <div className="rounded-md border border-hairline bg-canvas p-4 shadow-level-2">
          <div className="mb-1 flex items-center gap-2 text-sm text-body">
            <Cpu className="size-4" />
            Runtimes
          </div>
          <p className="text-2xl font-bold text-ink">
            {daemons.reduce((s, d) => s + (Array.isArray(d.runtimes) ? d.runtimes.length : 0), 0)}
          </p>
        </div>
      </div>

      {daemons.length === 0 ? (
        <div className="rounded-md border border-dashed border-hairline-strong p-8 text-center">
          <p className="mb-2 text-sm text-body">No daemons registered yet.</p>
          <p className="text-xs text-mute">
            Run <code className="rounded-sm bg-muted px-1 font-mono">gitsquad daemon login</code> on your machine
            to register a daemon.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {daemons.map((d) => (
            <div key={d.id} className="overflow-hidden rounded-md border border-hairline bg-canvas shadow-level-2">
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4">
                <span
                  className={`size-2.5 rounded-full ${
                    d.status === "online" ? "bg-[#0070f3]" : "bg-hairline-strong"
                  }`}
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink">{d.name}</p>
                  <p className="text-xs text-mute">
                    {d.os}/{d.arch} · v{d.daemon_version} · registered {timeAgo(d.registered_at)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    d.status === "online"
                      ? "bg-[#0070f3]/10 text-[#0070f3]"
                      : "bg-muted text-mute"
                  }`}
                >
                  {d.status}
                </span>
              </div>

              {/* Capabilities */}
              <div className="border-t border-hairline px-5 py-3">
                <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-mute">
                  Runtimes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(Array.isArray(d.runtimes) ? d.runtimes : []).length === 0 ? (
                    <span className="text-xs text-mute">No capabilities reported.</span>
                  ) : (
                    (Array.isArray(d.runtimes) ? d.runtimes : [])
                      .map((c) => (
                        <span
                          key={c.kind}
                          className="inline-flex items-center gap-1 rounded-sm bg-[#0070f3]/10 px-2 py-1 text-xs font-medium text-[#0070f3]"
                        >
                          <CheckCircle2 className="size-3" />
                          {c.kind}
                          {c.version && (
                            <span className="text-[10px] opacity-60">{c.version}</span>
                          )}
                        </span>
                      ))
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-hairline px-5 py-2 text-[11px] text-mute">
                <span>
                  Last seen: {timeAgo(d.last_seen_at)}
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px]">{d.id.slice(0, 8)}</span>
                  {deleting === d.id ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-destructive">Remove?</span>
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="font-medium text-destructive hover:underline"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setDeleting(null)}
                        className="text-mute hover:text-body"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setDeleting(d.id)}
                      className="text-hairline-strong transition-colors hover:text-destructive"
                      title="Remove daemon"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect Daemon Modal */}
      {showConnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setShowConnect(false)}>
          <div className="mx-4 w-full max-w-lg rounded-lg border border-hairline bg-canvas shadow-level-5" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="text-base font-semibold text-ink">Connect a daemon</h2>
              <button onClick={() => setShowConnect(false)} className="text-mute hover:text-ink">
                <XCircle className="size-5" />
              </button>
            </div>

            {/* Options */}
            <div className="space-y-4 p-6">
              {/* Local */}
              <div className="rounded-md border border-hairline p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-sm bg-muted">
                    <Laptop className="size-4 text-ink" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink">Local machine</p>
                    <p className="text-xs text-mute">Run on your own hardware</p>
                  </div>
                </div>
                <div className="space-y-2 rounded-sm bg-muted p-3 font-mono text-xs text-body">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Terminal className="size-3" />
                      Step 1: Install GitSquad CLI
                    </span>
                    <button
                      onClick={() => handleCopy("curl -fsSL https://gitsquad.com/install | sh", "install")}
                      className="text-mute hover:text-ink"
                    >
                      {copied === "install" ? <Check className="size-3 text-[#0070f3]" /> : <Copy className="size-3" />}
                    </button>
                  </div>
                  <p className="text-mute">curl -fsSL https://gitsquad.com/install | sh</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Terminal className="size-3" />
                      Step 2: Login
                    </span>
                    <button
                      onClick={() => handleCopy("gitsquad daemon login", "login")}
                      className="text-mute hover:text-ink"
                    >
                      {copied === "login" ? <Check className="size-3 text-[#0070f3]" /> : <Copy className="size-3" />}
                    </button>
                  </div>
                  <p className="text-mute">gitsquad daemon login</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Terminal className="size-3" />
                      Step 3: Start the daemon
                    </span>
                    <button
                      onClick={() => handleCopy("gitsquad daemon run", "run")}
                      className="text-mute hover:text-ink"
                    >
                      {copied === "run" ? <Check className="size-3 text-[#0070f3]" /> : <Copy className="size-3" />}
                    </button>
                  </div>
                  <p className="text-mute">gitsquad daemon run</p>
                </div>
              </div>

              {/* Cloud */}
              <div className="pointer-events-none rounded-md border border-dashed border-hairline p-4 opacity-60">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-sm bg-muted">
                    <Cloud className="size-4 text-mute" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-mute">Cloud sandbox</p>
                    <p className="text-xs text-mute">Coming soon</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `web/app/console/settings/page.tsx`**

Preserve `api.get("/api/v1/me")`. Cards `rounded-md border-hairline bg-canvas shadow-level-2`; section headers `border-b border-hairline`. Full file:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Settings, User, Key } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface User {
  id: string;
  login: string;
  avatar_url: string;
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api.get<User>("/api/v1/me").then(setUser).catch(() => {});
  }, []);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-2">
        <Settings className="size-5 text-ink" />
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">Settings</h1>
      </div>

      {/* Profile */}
      <div className="mb-6 overflow-hidden rounded-md border border-hairline bg-canvas shadow-level-2">
        <div className="border-b border-hairline px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <User className="size-4" />
            Profile
          </div>
        </div>
        <div className="flex items-center gap-4 px-5 py-4">
          <Avatar className="size-14">
            <AvatarImage src={user?.avatar_url} />
            <AvatarFallback>{user?.login?.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold text-ink">@{user?.login}</p>
            <p className="text-xs text-mute">Connected via Google</p>
          </div>
        </div>
      </div>

      {/* Token management placeholder */}
      <div className="overflow-hidden rounded-md border border-hairline bg-canvas shadow-level-2">
        <div className="border-b border-hairline px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Key className="size-4" />
            Daemon Tokens
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-body">
            Generate daemon tokens for headless / SSH / CI environments.
          </p>
          <p className="mt-2 text-xs text-mute">
            Token management will be available in the next update.
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd web && bun run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add web/app/console/daemons/page.tsx web/app/console/settings/page.tsx
git commit -m "feat(web): redesign daemons + settings to Vercel design language"
```

---

### Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full build**

Run: `cd web && bun run build`
Expected: compiles with no errors; no TypeScript failures.

- [ ] **Step 2: Tests**

Run: `cd web && bun test`
Expected: all 4 tests in `app/page.test.mjs` pass (content strings preserved across `page.tsx`/`layout.tsx`/`live-agent-log.tsx`).

- [ ] **Step 3: Lint**

Run: `cd web && bun run lint`
Expected: no errors. (If lint flags unused imports introduced by rewrite, remove them and re-run.)

- [ ] **Step 4: Grep for forbidden legacy classes**

Run: `cd web && grep -rE "zinc-|orange-|emerald-|amber-100|green-100|green-600|red-50|red-200|red-600|slate-" app components --include="*.tsx" | grep -v node_modules`
Expected: no matches (all legacy palette classes purged). Note: `text-red-600` etc. should now be `text-destructive`; `bg-emerald-*` → `#0070f3` tokens. If any remain, fix them.

- [ ] **Step 5: Final commit (if any cleanup)**

```bash
git add -A web
git commit -m "chore(web): finalize Vercel-design redesign cleanup" || echo "nothing to commit"
```

## Self-Review Notes

- **Spec coverage:** DESIGN.md colors (ink/canvas/canvas-soft/hairline/body/mute/link) → globals.css. Typography (Geist negative tracking, weight 600 ceiling, sentence-case period-terminated headlines, caption-mono eyebrows) → page.tsx + all section headers. Radius scale (sm 6 / md 8 / lg 12 / pill 100 / full) → primitives + pages. Stacked shadows Level 1–5 → `.shadow-level-*`. Mesh gradient → `MeshGradient` + `.mesh-gradient` class, hero-scale only. Buttons (button-primary pill, button-secondary, nav-cta, button-primary-sm) → button.tsx variants/sizes. Cards (card-marketing rounded-md, ex-auth-form-card, ex-modal-card) → pages. Status semantics (success/link blue, warning amber, error red, no green) → all status surfaces. ✓
- **Behavior preserved:** token localStorage keys, `api` paths, router/searchParams/`use(params)`, `setInterval` timings (3000ms log, 15000ms daemon poll), modal Escape + body-scroll-lock, sidebar drag-resize math, copy-to-clipboard, delete-confirm flows. ✓
- **Tests:** all `page.test.mjs` asserted strings/classes kept verbatim in `page.tsx`/`layout.tsx`/`live-agent-log.tsx` (headline + lead paragraph + "Squad control center" + "Install the GitHub App" + favicon src/alts + `size-14` + emojis + "The Janitor" + `"use client"`/`setInterval`/`3000`/log messages). ✓
- **No placeholders.** Every step shows complete target file contents.
