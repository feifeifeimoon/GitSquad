---
version: alpha
name: gitsquad-design-system
description: The design language for the GitSquad web console — a stark ink-on-canvas engineering surface, broken at hero scale by a mesh gradient in the brand's own colours (the mark's navy and cyan, the banner's blue and amber) that is the entire decorative system, paired with a geometric sans for narrative text and a monospaced face for technical labels, status data, and code.

colors:
  primary: "#171717"
  on-primary: "#ffffff"
  ink: "#171717"
  body: "#4d4d4d"
  mute: "#888888"
  hairline: "#ebebeb"
  hairline-strong: "#a1a1a1"
  chrome: "#ffffff"
  page: "#fafafa"
  canvas: "#ffffff"
  canvas-soft: "#f5f5f5"
  canvas-soft-2: "#efefef"
  link: "#0070f3"
  link-deep: "#0761d1"
  link-bg-soft: "#d3e5ff"
  success: "#0070f3"
  error: "#ee0000"
  error-soft: "#f7d4d6"
  warning: "#f5a623"
  warning-soft: "#ffefcf"
  warning-deep: "#ab570a"
  violet: "#7928ca"
  violet-soft: "#d8ccf1"
  cyan-soft: "#aaffec"
  cyan-deep: "#29bc9b"
  # The hero's four lights, sampled from the two things that already define the
  # brand: the icon (navy shell, cyan eyes) and docs/assets/banner.png (its
  # repository blue, its machinery amber).
  brand-navy: "#061029"
  brand-blue: "#1f6fd0"
  brand-cyan: "#34a6d1"
  brand-amber: "#f5a623"
  # ::selection is {colors.ink} on {colors.canvas}, so it inverts with the
  # theme instead of staying dark-on-dark.
  selection-bg: "{colors.ink}"
  selection-fg: "{colors.canvas}"
  # Semantic layer consumed by the vendored shadcn/Radix primitives. These are
  # the names those components reference internally, mapped onto the brand
  # ladder above so a primitive styled out of the box still lands on-brand.
  background: "{colors.page}"
  foreground: "#171717"
  card: "#ffffff"
  card-foreground: "#171717"
  popover: "#ffffff"
  popover-foreground: "#171717"
  secondary: "#fafafa"
  secondary-foreground: "#171717"
  muted: "#f5f5f5"
  muted-foreground: "#888888"
  accent: "#f5f5f5"
  accent-foreground: "#171717"
  destructive: "#ee0000"
  border: "#ebebeb"
  input: "#ebebeb"
  ring: "#a1a1a1"

typography:
  display-xl:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 48px
    fontWeight: 600
    lineHeight: 48px
    letterSpacing: -2.4px
  display-lg:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 32px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: -1.28px
  display-md:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.96px
  display-sm:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.6px
  body-lg:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
  body-md:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-md-strong:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
  body-sm:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: -0.28px
  body-sm-strong:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: -0.28px
  caption:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  caption-mono:
    fontFamily: Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  code:
    fontFamily: Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
  button-md:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  button-lg:
    fontFamily: Geist, Inter, system-ui, -apple-system, sans-serif
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  2xl: 20px
  3xl: 24px
  4xl: 28px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 40px
  3xl: 48px
  4xl: 64px
  5xl: 96px

components:
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    height: 64px
    padding: "{spacing.sm} {spacing.lg}"
  nav-link:
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: "{spacing.xs} {spacing.sm}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.full}"
    padding: "0px {spacing.lg}"
    height: 48px
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.full}"
    shadow: "Level 1"
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.sm}"
    height: 32px
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.sm}"
    height: 32px
  button-destructive:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    height: 32px
  icon-button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.sm}"
  form-input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.sm}"
    height: 32px
  badge-secondary:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.body}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "0px {spacing.xs}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
    shadow: "Level 2"
  card-soft:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  panel-settings:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
    shadow: "Level 2"
  modal-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
    shadow: "Level 5"
  dropdown-surface:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    shadow: "Level 4"
  table-container:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    shadow: "Level 2"
  table-header-cell:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.mute}"
    typography: "{typography.caption-mono}"
    rowBorder: "{colors.hairline}"
  data-table-cell:
    typography: "{typography.body-sm}"
    cellPadding: "{spacing.xs} {spacing.sm}"
    rowBorder: "{colors.hairline}"
  app-shell-sidebar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    width: 240px
  app-shell-nav-row:
    textColor: "{colors.body}"
    activeIndicator: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs} {spacing.sm}"
  sidebar-section-label:
    textColor: "{colors.mute}"
    typography: "{typography.caption}"
    transform: uppercase
    letterSpacing: wide
  board-column:
    backgroundColor: "{colors.canvas-soft-2}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.xl}"
    width: 288px
  board-card:
    backgroundColor: "{colors.card}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sm}"
    shadow: "Level 1"
  status-badge:
    typography: "{typography.caption}"
    structure: "dot + written label"
  empty-state:
    backgroundColor: "{colors.card}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.md}"
    padding: "{spacing.3xl}"
  toast:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm} {spacing.md}"
    typography: "{typography.body-sm}"
  kbd-hint:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.mute}"
    borderColor: "{colors.hairline}"
    typography: "{typography.caption-mono}"
    rounded: "{rounded.xs}"
  hero-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-xl}"
    padding: "{spacing.5xl} {spacing.lg}"
    decoration: "mesh gradient + blueprint grid, top 560px, both masked to transparent"
  squad:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.caption-mono}"
    note: "three figures cut out of the banner, scattered in the hero's margins"
    motion: "a lift on hover, CSS only"
  robot:
    source: "generated renders with a real alpha channel"
    note: "the banner's own renders on transparency — no drawing, nothing at runtime"
    files: "web/public/robots/v2/{inspector,tester,planner}.png"
  product-band:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    padding: "{spacing.5xl} {spacing.lg}"
  why-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    padding: "{spacing.5xl} {spacing.lg}"
  how-it-works-band:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    padding: "{spacing.5xl} {spacing.lg}"
    structure: "one hairline grid of 3 steps, not 3 shadowed cards"
  closing-band:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    padding: "{spacing.5xl} {spacing.lg}"
    note: "pinned dark with a `dark` wrapper, never `bg-primary`"
  marketing-footer:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    note: "pinned dark; three link columns and a clamp() wordmark"
  demo-board:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.xl}"
    shadow: "Level 3"
    note: "window chrome, board row on {colors.page}, then one issue's thread and run"
  cta-primary-pill:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.full}"
    height: 48px
  cta-secondary-pill:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline-strong}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.full}"
    height: 48px
  nav-cta-pill:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    height: 32px
  code-editor-mockup:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
    shadow: "Level 3"
  link-inline:
    textColor: "{colors.link}"
    typography: "{typography.body-md}"
---

## Overview

GitSquad is a multi-agent orchestration product: a console where a developer watches autonomous agents pick up GitHub issues, work in a repository, and report back. The interface has to carry a lot of machine state — agent reachability, task progress, token spend, live logs — without turning into a dashboard of competing widgets. The design language answers that with restraint: a near-white `{colors.canvas-soft}` body, ink-near-black `{colors.ink}` text, a quiet gray ladder that gives every divider and disabled state its own deliberate step, and exactly one loud element — the mesh gradient — which appears at hero scale only and nowhere else.

Type carries the second half of the job. Headlines are set in a geometric sans at weight 600 with aggressive negative tracking; everything that reports machine state — statuses, token counts, log lines, model identifiers, keyboard hints — is set in a monospaced face at 12–13 px. That split is the information architecture: narrative text is sans, telemetry is mono. A reader can tell at a glance which words are the product talking and which are the machine talking.

Surfaces use a four-step ladder: `{colors.canvas}` for cards and dialogs, `{colors.canvas-soft}` for the page body, `{colors.canvas-soft-2}` for inset regions (sidebar hovers, code blocks, table headers), and `{colors.primary}` for the polarity-flipped dark band. Elevation is built from stacked small shadows plus an inset hairline ring, never a single heavy drop-shadow — cards sit *on* the page rather than floating above it.

> **Provenance.** This visual language is an interpretation of the design language Vercel publishes on its marketing site — the surface ladder, the ink-primary CTA, the stacked-shadow elevation levels and the Geist type family all originate there. GitSquad adapts it to a console rather than a marketing site. The token names below are GitSquad's own (`web/app/globals.css` is the source of truth); nothing here should be read as an official Vercel specification.
>
> The hero's gradient used to come from there too, as a set of five pastels. It no longer does: the four lights are now sampled from GitSquad's own icon and banner (see *Primitives & Gradient*), which is the one part of this language that is not an interpretation of somebody else's.

**Key Characteristics:**
- A single ink primary `{colors.primary}` carries every affirmative action. There is no sixth accent colour and no green "success" hue — `{colors.success}` aliases the link blue.
- The mesh gradient (the mark's navy and cyan, the banner's blue and amber) is the only decorative chrome, and it appears at hero scale only, over a blueprint grid.
- Status is never communicated by colour alone. Every status renders as a dot plus a written label so it survives colour-blindness and grayscale.
- Every machine-reported value is set in `{typography.caption-mono}` or `{typography.code}`; every narrative sentence is set in the geometric sans.
- Elevation is stacked (three or four small offsets at 4–12 % black) with an inset hairline ring, never one heavy drop-shadow.
- Radius is a two-scale system: 6 px `{rounded.sm}` for in-app controls and 100 % pill for marketing CTAs. The two scales coexist deliberately and are never mixed on one screen.
- Surfaces are cycled `{colors.canvas-soft}` → `{colors.canvas}` → `{colors.primary}`; the polarity-flipped dark band is the primary depth cue between sections.

## Colors

### Brand & Accent
- **Ink** (`{colors.primary}` — `#171717`): The single primary CTA colour. Carries every affirmative button, the active nav indicator, the polarity-flipped dark band and the `::selection` background. Also the default `{colors.ink}` text colour on light surfaces.
- **Link Blue** (`{colors.link}` — `#0070f3`, dark `#3291ff`): Inline links and the "info / running" semantic. Lifted in dark mode: the light value is legible on white and muddy on `#171717`.
- **Violet** (`{colors.violet}` — `#7928ca`) and **Cyan Deep** (`{colors.cyan-deep}` — `#29bc9b`): Telemetry series colours. `{colors.violet}` marks cache-read tokens, `{colors.cyan-deep}` marks output tokens.

### Surface

Three planes, back to front. A card `{colors.canvas}` sits on a page `{colors.page}`, framed by chrome `{colors.chrome}` — which is what lets a card read as raised without a border having to say so. A board column is a *well*: a step below the page (`{colors.canvas-soft}`), so cards rise out of it.

- **Chrome** (`{colors.chrome}` — `#ffffff`): The sidebar and page chrome.
- **Page** (`{colors.page}` — `#fafafa`): What content sits on. `body` resolves to this via `--background`.
- **Canvas** (`{colors.canvas}` — `#ffffff`): Card, dialog, panel, popover, input — every raised surface.
- **Canvas Soft** (`{colors.canvas-soft}` — `#f5f5f5`): Wells and insets — a board column, a table header row, an empty state, inline code. Never a card.
- **Canvas Soft 2** (`{colors.canvas-soft-2}` — `#efefef`): A second inset step, for something sunk inside a well.
- **Hairline** (`{colors.hairline}` — `#ebebeb`): The 1 px divider used by every card border, table row, sidebar edge and input outline.
- **Hairline Strong** (`{colors.hairline-strong}` — `#a1a1a1`): The heavier divider, used for card hover borders, the sidebar resize handle on hover, blockquote rules and the focus ring.

### Text
- **Ink** (`{colors.ink}` — `#171717`): Every heading and primary body paragraph on light surfaces.
- **Body** (`{colors.body}` — `#4d4d4d`): Secondary text — supporting paragraphs, table cells, sidebar inactive rows, footer copy. Also the TipTap editor's default text colour.
- **Mute** (`{colors.mute}` — `#888888`): Lowest-priority text — sidebar section labels, placeholders, keyboard hints, empty-state supporting copy.
- **On Primary** (`{colors.on-primary}` — `#ffffff`): All text on `{colors.primary}` surfaces.

### Semantic
- **Success** (`{colors.success}` — `#0070f3`): Deliberately identical to `{colors.link}`. GitSquad has no green. "Healthy" is rendered as the link blue, which keeps the palette to ink + gray + blue + the gradient stops. It is the first segment of the token-usage chart (input tokens).
- **Warning** (`{colors.warning}` — `#f5a623`): Caution and pending. The `in_progress` status colour, the cache-write token series, and the degraded workspace dot.
- **Warning Soft** (`{colors.warning-soft}` — `#ffefcf`) / **Warning Deep** (`{colors.warning-deep}` — `#ab570a`): Soft fill and readable-text variants of warning.
- **Error** (`{colors.error}` — `#ee0000`): Destructive actions and validation failures. Bound to the `--destructive` token that the vendored shadcn primitives consume, so `Button variant="destructive"` and `aria-invalid` outlines pick it up automatically.
- **Error Soft** (`{colors.error-soft}` — `#f7d4d6`, dark `#2c1215`): The `blocked` status tint on a card edge, and the fill behind an error callout.
- **Violet Soft** (`{colors.violet-soft}` — `#d8ccf1`, dark `#241a33`): The `in_review` tint, and one of the avatar monogram backgrounds.
- **Cyan Soft** (`{colors.cyan-soft}` — `#aaffec`, dark `#0d2b26`): The `done` tint, and one of the avatar monogram backgrounds.
- **The `-soft` / `-deep` pairs are theme-aware tints**, not light-mode fills. Each is a background plus the readable text colour that belongs on it, defined in `"both"` themes; that is what makes them usable for monograms and status edges without a second palette.
- **Link Deep** (`{colors.link-deep}` — `#0761d1`) / **Link Bg Soft** (`{colors.link-bg-soft}` — `#d3e5ff`): Pressed link tone and soft informational fill.

### Primitives & Gradient
- **Blue** (`{colors.brand-blue}` — `#1f6fd0`), **Cyan** (`{colors.brand-cyan}` — `#34a6d1`), **Navy** (`{colors.brand-navy}` — `#061029`), **Amber** (`{colors.brand-amber}` — `#f5a623`): The four hero lights. They are not a palette anyone picked off a colour wheel — each one is already in the product's own artwork:

  - **Navy** is the shell of the mark in `web/app/favicon.ico`, and the wordmark in `docs/assets/banner.png`.
  - **Cyan** is the mark's eyes. It is the average of the 45 lit pixels of `app/favicon.ico`'s single 32×32 frame, and it is the only saturated colour in the icon.
  - **Blue** is the banner's repository panel and the robots' caps.
  - **Amber** is the banner's machinery — crane, conveyor, scissor lift. It is the same value as `{colors.warning}`, which the console already uses for `in_progress`, so the warm note is not a new colour either.

  Treated as one object: composed as a canopy across the top of the hero, never cropped to a single stop, never reordered, never miniaturised to a swatch or an icon. The set they replace was five pastels (blue / violet / magenta / teal / amber) that arrived with the page's first template, and the page now has none of them.

- `--chart-1`…`--chart-5` are the reserved categorical series, in the order a chart should use them: the four colours `usage-series` already draws with — `{colors.success}`, `{colors.cyan-deep}`, `{colors.violet}`, `{colors.warning}` — plus `{colors.brand-navy}` as the neutral for a total or an "other". They were the template's five pastels, which put a palette nobody chose into the one place a future chart would look for one. Nothing consumes them yet; the console's chart draws its series from the tokens directly.

### Dark Mode

The console ships a full dark theme (`.dark`), toggled from the sidebar. It is a polarity flip of the same ladder, not a second palette:

| Token | Light | Dark |
|---|---|---|
| `{colors.chrome}` | `#ffffff` | `#0a0a0a` |
| `{colors.page}` | `#fafafa` | `#0f0f0f` |
| `{colors.canvas}` | `#ffffff` | `#171717` |
| `{colors.canvas-soft}` | `#f5f5f5` | `#0a0a0a` |
| `{colors.canvas-soft-2}` | `#efefef` | `#262626` |
| `{colors.ink}` | `#171717` | `#ededed` |
| `{colors.body}` | `#4d4d4d` | `#a1a1a1` |
| `{colors.mute}` | `#888888` | `#888888` |
| `{colors.hairline}` | `#ebebeb` | `#ffffff14` |
| `{colors.primary}` | `#171717` | `#ededed` |
| `{colors.link}` | `#0070f3` | `#3291ff` |
| `{colors.warning}` | `#f5a623` | `#f7b955` |
| `{colors.warning-soft}` | `#ffefcf` | `#2b1d08` |
| `{colors.error-soft}` | `#f7d4d6` | `#2c1215` |
| `{colors.violet}` | `#7928ca` | `#a970ff` |
| `{colors.violet-soft}` | `#d8ccf1` | `#241a33` |
| `{colors.cyan-deep}` | `#29bc9b` | `#3dd9b6` |
| `{colors.cyan-soft}` | `#aaffec` | `#0d2b26` |

Dark mode carries one deliberate difference: borders become translucent white (`#ffffff14`) instead of an opaque gray, so a hairline over a card and over the page body read the same.

**A palette is only a token set if both themes define all of it.** Every brand colour above has a dark value. It did not always: the pastel soft fills that used to paint the board columns were defined in `:root` and never in `.dark`, so `in_progress` stayed a light cream on a near-black page, with its own heading drawn in near-white on top of it. The rule that came out of that: a colour that appears in a component must be defined in both theme blocks, or it is a bug waiting for someone to flip the toggle.

Permanently-dark surfaces — the marketing showcase band, the terminal aside in the workspace wizard — are pinned with a `dark` class on their own wrapper, which scopes the dark token block to that subtree. They are mockups of a terminal: they must not follow the reader's theme, and `bg-primary` was never a way to say so, because primary inverts.

## Typography

### Font Family
Two faces carry the entire system, both loaded through `next/font/google` in `web/app/layout.tsx` and exposed to CSS as `--font-geist-sans` and `--font-geist-mono` (mapped to `--font-sans`, `--font-mono` and `--font-heading` in `globals.css`):

1. **Geist** — every display, body, button, link and label. Weights 400 / 500 / 600 are the working set; 700 or heavier never appears. Display sizes are tracked aggressively negative (`-0.04em` on the hero), body text stays neutral or slightly negative, and `body` sets `font-feature-settings: "ss01", "ss02"` to switch on Geist's geometric alternates.
2. **Geist Mono** — statuses, token counts, model identifiers, log lines, inline code, code blocks and keyboard hints. Weight 400 at 12–13 px, neutral tracking. `{typography.code}` is the only place mono appears above 13 px.

Both faces are open source under the SIL Open Font License and are fetched at build time; there is no self-hosted font binary and no proprietary face in the system.

### Type Scale

The frontmatter above names the roles; this table maps each role to the Tailwind utility actually used in the codebase, since the console is built with Tailwind v4 rather than with raw pixel values.

The console names sizes by **role**, not by Tailwind's `text-sm`/`text-base` ramp: `--text-*` in `@theme`, each with a paired line-height. `components/ui/*` (vendored shadcn) keeps Tailwind's own names so it stays diffable against the registry; app code uses the roles. `copy` rather than `body` for the 14px step because `text-body` is already the body *colour*.

| Role | Utility | Size / Line-height | Use |
|---|---|---|---|
| `{typography.display-xl}` | `text-4xl sm:text-5xl lg:text-6xl` | 36→60px / 600 / `-0.04em` | Marketing hero headline only. `leading-[1.05]`. |
| `{typography.display-lg}` | `text-3xl sm:text-4xl` | 30→36px / 600 / `-0.04em` | Section headlines in marketing bands. |
| `{typography.display-md}` | `text-display` | 26px / 32px | The headline figure — a usage total. |
| `{typography.title}` | `text-title` | 19px / 26px | Page title (`PageHeader`), and the issue title on its own page. |
| `{typography.title-sm}` | `text-title-sm` | 16px / 22px | Dialog titles, KPI values, marketing card headings (`text-base`, same size). |
| `{typography.body-lg}` | `text-lg` | 18px / 400 | Marketing lead paragraph under a section headline. |
| `{typography.body-md}` | `text-base` | 16px / 400 | Default paragraph, marketing body, rendered markdown headings. |
| `{typography.copy}` | `text-copy` | 14px / 20px | The console's body size — table cells, card copy, descriptions. |
| `{typography.label}` | `text-label` | 13px / 18px | Section headings (`SectionHeading`), board column labels, form field labels. |
| `{typography.caption}` | `text-caption` | 12px / 16px | Badges, table column headings, dense metadata, KPI labels. |
| `{typography.micro}` | `text-micro` | 11px / 16px | Card meta — issue key, comment count, relative time. |
| `{typography.code}` | `font-mono text-[13px]` | 13px / 400 | Inline code and code blocks. |
| `{typography.button-md}` | `text-copy font-medium` | 14px / 500 | In-app button labels (sizes `sm` / `default` / `lg`). |
| `{typography.button-lg}` | `text-base font-medium` | 16px / 500 | Marketing pill CTAs (size `pill`). |

The page used to have two sizes and no hierarchy: a page title and a sidebar nav row were the same 14px at the same weight, so nothing led. Title, section, body and meta are four steps now, and the step is carried by size *and* colour *and* weight — never by one alone.

### Principles
- **Weight 600 is the display ceiling.** The sans never appears at 700+. The interface reads as calm partly because of this.
- **Negative tracking is part of the voice.** Display sizes use `-0.04em` down to `-0.015em`. Reverting to default tracking makes the headline look generic.
- **Sentence-case headlines, period-terminated.** "Your autonomous developer team on GitHub." — the full stop is part of the voice, not a typo.
- **Mono is the voice of the machine.** Statuses, counts, ids, logs and code. A narrative sentence is never set in mono — and neither is a label. Table column headings and KPI labels are sentence case in the sans face: mono uppercase is how you say "this is an identifier", and "Total tokens" is not one.
- **Uppercase is reserved for `{typography.caption}` labels only** — sidebar section headers ("Workspace", "Account"). Headlines are never all-caps.

## Layout

### Spacing System
- **Base unit**: 4 px. Tailwind v4's `--spacing` is `0.25rem`, and every value in the system is a multiple of it.
- **Tokens**: `{spacing.xxs}` 4 px (`1`) · `{spacing.xs}` 8 px (`2`) · `{spacing.sm}` 12 px (`3`) · `{spacing.md}` 16 px (`4`) · `{spacing.lg}` 24 px (`6`) · `{spacing.xl}` 32 px (`8`) · `{spacing.2xl}` 40 px (`10`) · `{spacing.3xl}` 48 px (`12`) · `{spacing.4xl}` 64 px (`16`) · `{spacing.5xl}` 96 px (`24`).
- **Marketing bands**: `{spacing.5xl}` (96 px) top and bottom — `px-6 pb-20 pt-20 sm:pt-28` on the hero. The gradient needs that room.
- **Card interior padding**: `{spacing.md}` to `{spacing.lg}`. Settings panels use `p-5`; the marketing feature cards use `p-6`.
- **Inline gaps**: `{spacing.xs}` to `{spacing.sm}` between siblings in a button row, nav row or chip row.

### Grid & Container
- **Marketing max width**: `max-w-[1200px]`, centred with `px-6` gutters. Headline blocks cap narrower (`max-w-4xl`) and lead paragraphs narrower still (`max-w-xl`) so the measure stays readable.
- **Console layout**: a full-height flex shell. The sidebar is a resizable fixed-width column (`240px` default) with `border-r border-hairline bg-canvas`; the main region scrolls independently. The board scrolls horizontally inside the main region.
- **Column patterns**:
  - Marketing feature row: 3-up at `md` and above, 1-up below. Titles `text-base font-semibold`, body `text-sm`.
  - Board: 7 equal fixed-width (`288px`) columns in a horizontally scrolling row — never a responsive grid, because a board column must not change width as issues move.
  - Card grids: 2-up at `md`, 3-up at `lg`, 1-up at mobile.

### Whitespace Philosophy
The mesh gradient does the decorative work, so whitespace is left to separate bands rather than to fill them. Marketing sections are generous (`{spacing.5xl}` between bands) while interiors stay tight: a heading/body stack uses `{spacing.xs}` gaps, then a wider gap before the CTA row. In the console the opposite applies — density is the point, and vertical rhythm comes from consistent `p-4`/`p-5` card padding rather than large gaps. The rule in both cases is the same: never a uniform stack of same-sized gaps.

### Responsive Strategy

Breakpoints are Tailwind v4's defaults, unmodified — `globals.css` overrides the radius and colour scales but not `--breakpoint-*`:

| Name | Width | Key Changes |
|---|---|---|
| Base | < 640px | Marketing hero stacks and drops to `text-4xl`; nav collapses; feature rows go 1-up; board columns keep their 288px width and scroll horizontally. |
| `sm` | ≥ 640px | Hero steps up to `text-5xl`; CTA row becomes horizontal (`sm:flex-row`); padding grows to `sm:pt-32`. |
| `md` | ≥ 768px | Feature rows go 3-up; card grids go 2-up. |
| `lg` | ≥ 1024px | Hero reaches `text-6xl`; card grids go 3-up; the console sidebar is shown. |
| `xl` | ≥ 1280px | Extra breathing room on wide marketing bands. |

Usage is concentrated at `sm:` (35 occurrences) and `lg:` (11) — the interface is designed mobile-and-desktop, with single-step stops in between rather than a tuned tablet layout.

#### Touch Targets
The `button-default` size is 32 px tall and the `button-lg` size 36 px, both below the 44 px recommendation, so in-app controls rely on `{spacing.xs}` padding and generous row heights to reach an adequate hit area. Marketing CTAs use the `pill` size at 48 px and comfortably clear the floor. Anything below 32 px should be treated as a defect.

#### Collapsing Strategy
- **Nav**: logo plus a ghost CTA at base; the full link row and account menu appear from `sm` up.
- **Hero**: the gradient stays centred and full-bleed at the top of the band; headline and body stack vertically at every breakpoint. There is no split-hero pattern.
- **Feature rows**: 3-up → 1-up, cards keeping their `{rounded.lg}` shape.
- **Board**: never collapses. Columns hold their width and the row scrolls, because a reflowed board stops being a board.
- **Tables**: the workspace and daemon lists switch to a card grid below `md` via an explicit view switcher the user can also drive manually.

#### Imagery
- **Mesh gradient**: rendered as one absolutely-positioned element (`MeshGradient`, `aria-hidden`) with `h-[560px] opacity-60` at the top of the hero, masked to transparent before the lead paragraph, over a `blueprint-grid` layer masked radially from the headline. The masks are not decoration: without the first, the wash covers the whole band and stops on the edge of its own blur, and the subhead and CTAs read through a filter; without the second, a 64 px grid runs to the page's edges and reads as graph paper. Both scale with the container and are never cropped to a frame or tiled.
- **Blueprint grid**: the banner's setting is a construction site, and a hairline grid is how an engineering surface says so without drawing any of it. It is `1px` lines at `64px` pitch in `{colors.hairline}`, so it is a grey rule on white and a light one on black without a second set of values.
- **Code editor mockup**: a dark `{colors.primary}` rectangle (`bg-[#0a0a0a]`) with mono text inside, treated as a single layout object rather than as real editable UI.
- **Provider marks**: monochrome brand SVGs (`provider-icon.tsx`) and the Google/GitHub marks at consistent optical size. Brand assets are third-party trademarks used nominatively; see the notices requirement in the review notes.

## Elevation & Depth

Implemented as five utility classes (`.shadow-level-1` … `.shadow-level-5`) defined in `globals.css`. Every level includes the inset hairline ring, so a card's edge stays crisp regardless of the background beneath it.

| Level | Treatment | Use |
|---|---|---|
| Level 1 — Inset hairline | `inset 0 0 0 1px #00000014` | Board cards, `button-secondary`, the hero announcement badge. The universal "this is a surface" cue. |
| Level 2 — Subtle drop | Level 1 + `0 1px 1px #00000005, 0 2px 2px #0000000a` | The default card: workspace and daemon cards, table containers, settings panels, the empty-state frame. |
| Level 3 — Soft stack | Level 1 + `0 2px 2px #0000000a, 0 8px 8px -8px #0000000a` | Hover state of an interactive card; the marketing code panel. |
| Level 4 — Float stack | Level 1 + `0 2px 2px #0000000a, 0 8px 16px -4px #0000000a` | Dropdown surfaces, the drag preview, the daemon pairing card. |
| Level 5 — Modal | Level 1 + `0 1px 1px #00000005, 0 8px 16px -4px #0000000a, 0 24px 32px -8px #0000000f` | Dialogs and the sign-out confirmation. |

The system uses **stacked** shadows — several small offsets layered to imitate soft light — and never a single large-blur drop. That is what keeps the elevation reading as flat-but-lifted rather than as Material.

### Decorative Depth
- **Mesh gradient as atmosphere**: the only "atmospheric" effect, applied as a flat 2-D backdrop behind the hero, never as a 3-D illustration.
- **Polarity flip as section depth**: switching a band from `{colors.canvas-soft}` to `{colors.primary}` is the chief depth cue between marketing sections. The console has one such band (the control-centre showcase).
- **Inset ring + stacked drop**: the combination produces "card sits on the page" without weight.

## Shapes

### Border Radius Scale

| Token | Utility | Value | Use |
|---|---|---|---|
| `{rounded.none}` | `rounded-none` | 0px | Full-bleed bands. |
| `{rounded.xs}` | `rounded-xs` | 4px | Inline code chips, keyboard hints. |
| `{rounded.sm}` | `rounded-sm` | 6px | Inset-step radius for buttons, inputs, selects and icon buttons (all in-app control sizes). This is the working radius of the console. |
| `{rounded.md}` | `rounded-md` | 8px | Small drop-down surfaces, empty-state frames, code blocks, the marketing badge tile. |
| `{rounded.lg}` | `rounded-lg` | 12px | The default card and modal radius — workspace cards, daemon cards, settings panels, dialogs. |
| `{rounded.xl}` | `rounded-xl` | 16px | Board columns. |
| `{rounded.2xl}` … `{rounded.4xl}` | `rounded-2xl` … `rounded-4xl` | 20 / 24 / 28px | Declared in `globals.css` for completeness; currently unused. |
| `{rounded.full}` | `rounded-full` | 9999px | Marketing pill CTAs (`size="pill"` / `"pill-sm"`), badges, status dots, avatars, the announcement banner. |

Two scales coexist and must not be mixed on one screen: an in-app control uses `{rounded.sm}`, a marketing CTA uses `{rounded.full}`.

### Geometry Notes
- **Mesh gradient**: full-bleed 2-D backdrop, never framed.
- **Board column**: `w-72` (288px) fixed, `{rounded.xl}`, `border-hairline/50` over a pastel fill.
- **Code panel**: `{rounded.md}` dark rectangle containing `{typography.code}`.
- **Status dot**: `size-1.5` (6px) `rounded-full`, always paired with a written label.
- **Sidebar resize handle**: a 4 px full-height hit area (`w-1`) that turns `{colors.hairline-strong}` on hover.

## Components

### Buttons

The `Button` primitive (`web/components/ui/button.tsx`) is a `cva` component with six variants and seven sizes. Everything interactive in the console goes through it.

**Variants**
- `default` — `bg-primary text-primary-foreground`, hover at 85 % opacity. The affirmative action.
- `secondary` — `bg-card text-foreground` with a Level 1 shadow. The paired non-committal action.
- `outline` — `bg-card` with a visible `border-border`. Lower emphasis in dense toolbars.
- `ghost` — text only, `hover:bg-muted`. Icon buttons in list rows and table rows.
- `destructive` — `bg-destructive` (`{colors.error}`) with white text. Deleting a workspace, agent or skill.
- `link` — link-coloured text with an underline on hover, for inline "view details" affordances.

**Sizes**
- `default` — `h-8 rounded-sm px-3 text-sm font-medium`. The console's standard button.
- `sm` — `h-7`, for table toolbars.
- `lg` — `h-9`, for the primary action in a page header.
- `pill` — `h-12 rounded-full px-6 text-base font-medium`. Marketing CTAs only.
- `pill-sm` — `h-8 rounded-full px-4 text-sm font-medium`. Marketing nav CTAs.
- `icon` / `icon-sm` / `icon-lg` — `size-8` / `size-7` / `size-9` square, `{rounded.sm}`.

Every button carries `active:translate-y-px` and `focus-visible:ring-3 focus-visible:ring-ring/40`, which is the system's focus treatment: a soft 3 px ring in `{colors.hairline-strong}`, never a hard outline.

### Forms

- **`form-input`** — `h-8` (32px), `bg-card`, `border-border` (hairline), `{rounded.sm}`, `text-sm`. This is the console default. `aria-invalid` swaps the border to `{colors.error}` and adds a 3 px `destructive/20` ring, so validation is visible without a separate error component.
- **Textarea** — same chrome, auto-growing via `field-sizing-content`, `min-h-16`.
- **Select** — shadcn/Radix `Select`; the trigger reuses the input chrome so a select and an input in the same form row align exactly.
- **Labels** — `text-sm font-medium text-ink`. Note: several existing forms render a bare `<label>` without `htmlFor`; new forms must associate the label with its control.

### Surfaces

- **`card`** — `bg-card border border-hairline rounded-lg shadow-level-2`. The workhorse: workspace cards, daemon cards, skill rows, runtime rows.
- **`panel-settings`** — one card per **section**, not per setting: `rounded-lg border border-hairline bg-canvas shadow-level-2`, with `divide-y divide-hairline` between the rows inside it. `SettingSection` draws it.
- **`setting-row`** — `flex gap-4 px-5 py-3.5`: what it is on the left (label in `{colors.ink}`, description in `{colors.mute}`), how to change it on the right. The stacked label-above-value form cost a card and two gaps per fact and turned a four-fact page into four screens. `leading` is for a row whose value *is* a picture (an avatar reads as part of the label); `align` centres a label against a button and pins it to the top against a description that wraps.
- A settings page holds **one scope**. The workspace's settings and the account's are two pages with two titles; nothing renders one inside the other, and the account's own sections never appear at the top of a page reached from the workspace's.
- **`table-container`** — `overflow-hidden rounded-lg border border-hairline shadow-level-2` wrapping a full-width table. Header cells are `{typography.caption-mono}` uppercase in `{colors.mute}` on a `{colors.canvas-soft}` row; body cells are `{typography.body-sm}` with `border-b border-hairline` rows.
- **`modal-card`** — `bg-card rounded-lg shadow-level-5`, used for dialogs and the sign-out confirmation.
- **`dropdown-surface`** — `bg-card rounded-md shadow-level-4`, used for the workspace switcher, the account menu and the repository picker.
- **`empty-state`** — a centred `Empty` primitive: media tile, `text-sm font-medium` title, `text-sm text-body` description, optional action. Used by every list that can be empty.

### Navigation

- **`nav-bar`** — the marketing top bar: 64 px tall, `bg-canvas`, hairline bottom border, the logo in `{colors.ink}` left, the in-page destinations centred and hidden below `md`, then three controls right. The **GitHub mark** is an icon rather than a fourth nav word: it is the one destination in this bar that leaves the page, and its label names the artifact (`GitSquad on GitHub`) because the word alone leaves a screen reader guessing at what the link is for. `GitHubMark` is inlined in `currentColor` for a measured reason — the SVG asset it replaces had `fill="black"` baked in, and a mark loaded through `<img>` cannot inherit `currentColor`, so it was black on a near-black card in dark mode. Then the theme control (`ThemeToggle`), the console's own button wearing the nav's shape: the page has followed `prefers-color-scheme` from the start, but a visitor had no way to say otherwise without changing an operating-system setting. Then the `nav-cta-pill`, which is the account control: signed out it says "Get started" and opens the Google flow, signed in it is the reader's avatar and the way back to the console. One control rather than a sign-in link and a sign-up button that do the same thing.
- **`app-shell-sidebar`** — the console's left column, in three bands: a **fixed top block** (workspace switcher, then the palette trigger), a **single scrolling middle** (the destinations), and a **fixed footer** (the account). Only the middle scrolls. `bg-chrome`, `border-r border-hairline`, 200–400 px wide, drag-resized and remembered in `localStorage`.
- **`sidebar-section-label`** — `{typography.micro}` semibold uppercase in `{colors.mute}`. The only uppercase text in the product. It doubles as the group's placeholder: it is drawn whether or not the rows under it can be used.
- **`app-shell-nav-row`** — a **link**, not a button wired to the router. Middle-click, open-in-new-tab and being announced as a destination all come free, and none of them did before. `{typography.label}` in `{colors.body}`, `{rounded.sm}`, `aria-current="page"` on the active row. Active is a `bg-muted` fill with `{colors.ink}` and a heavier icon stroke; hover is the same fill at half strength, written as a *separate branch* so the active row carries no hover class at all — two greys one step apart are not a distinction. A row whose page needs a workspace and has none renders **disabled**: on screen, in place, not clickable. It used to vanish along with its whole group, taking every row below it along.
- **`nav-search-trigger`** — the palette's trigger, shaped as a **field** (`Search…` plus a `kbd-hint`) in the fixed top block. It opens a modal rather than navigating, so it must not look like the destinations it sits above.
- **`account-menu`** — the footer: avatar and handle as the trigger, opening an identity block, **Settings** (`/settings`) and a destructive **Sign out**. The account is not a nav row. The *workspace* settings are a workspace page and sit in that group. Those two used to be one row that rewrote its own href, which made `/settings` unreachable from the sidebar for anyone who had ever opened a workspace.
- **`kbd-hint`** — `font-mono text-micro` in `{colors.mute}` on a `{colors.muted}` chip with a hairline border, e.g. the ⌘K affordance on the search trigger. Decorative on a control that already has a name: `aria-hidden`, so it does not join the accessible name.

### Console-Specific Components

- **`board-column`** — `w-72` fixed, `{rounded.xl}`, `bg-canvas-soft` (a well) with a hairline, header in `{typography.label}` semibold carrying the status icon, the label, a count and a create affordance. **Colour does not fill a column.** Painting one turned a third of the viewport into the word "this is yellow" and said nothing about the work in it; the status colour belongs on the work, in the icon here and the edge on the card.
- **`board-card`** — `bg-canvas border border-hairline rounded-lg shadow-level-1`, rising to Level 2 on hover. Two lines of content: the title, then a meta row that renders only what exists — issue key, assignee, PR badge, comment count, relative time. A description preview and an "Unassigned" label were both removed: identical on nearly every card, so each cost a line of height without ever changing a decision. A 2px **status edge** runs down the left side in the status colour, so a card still says what it is once its column header has scrolled out of view or while it is being dragged. While dragging, the preview rotates 2° and takes Level 4 — the only rotation in the system.
- **`issue-detail`** — **one scroll container** for the whole page, and **one centred container inside it** holding both the header row and the two-cell body (`lg:grid-cols-[minmax(0,1fr)_15rem]`); the details column is `sticky` inside that scroll rather than a second scroller. Three independent scroll regions used to mean the facts could scroll away from the issue they described, and a full-width header above a centred body gave the breadcrumb and the title two different left edges — which is what "it does not look centred" was. Reading order is title → description → activity → composer, and the composer is last because that is where the newest entry belongs.
- **`issue-heading`** — the title as an `<h1>` whose **words are the control**: clicking them opens the editor with the caret already in it, and `cursor-text` says so before the click — the gesture Linear teaches. `↵` saves, `⎋` abandons. A drag-selection is left alone (`window.getSelection()` not collapsed ⇒ copying, not editing), and the heading keeps `role=heading` rather than becoming a button: a button whose accessible name is its own text makes the title a name for *every* other button on the page — a locator for "Comment" then resolves to an issue called "Comment target". The pencil stays in the DOM for the keyboard, revealed on hover or focus, so it is not a second label beside every title.
- **`issue-description`** — the same rule: click the prose to edit it, with the caret landing in the editor. Two clicks that are not edit requests are honoured — a drag-selection, and a link (which navigates). An **empty** description keeps a visible control, because there is nothing to click yet; once there is prose, the affordance is a hover/focus-revealed pencil.
- **`activity-feed`** — **oldest first**, which is what `ListCommentsByIssue`'s `created_at ASC` means and what a timeline is: the first entry is the thing that explains the rest, and the newest lands nearest the composer. Entries are typed by `author_type`/`type`: a person or an agent gets an avatar circle and rendered markdown; a server-written event gets a quiet single-line row in `{colors.mute}` — icon, one truncated sentence, relative time — because the server writes those as whole sentences, so they read as log lines rather than as somebody speaking.
- **`activity-rail`** — one tick per entry down the right edge of the feed, from `RAIL_MIN_ENTRIES` (4) upward; below that it is furniture. The shape is multica's `ThreadMinimap`: **the rail is the scroller's viewport** (never the thread — a rail that grows with the thread is a dashed line down the whole page), the ticks are **evenly pitched and shrink** rather than the rail growing, and a `sticky` rail shorter than the viewport is bounded by the feed so a thread that already fits does not get a pointer longer than its subject. A sticky element only starts sticking once its top reaches the scroller's, so until then a centred cluster hangs a header-and-description below the middle: **half the remaining travel is applied as a `translateY`**, and it is zero the moment the rail is pinned. A **roving focus** — one tab stop, arrows and Home/End between ticks, so twenty comments are not twenty stops between the feed and the composer. The entries in the reading band are drawn at full strength, so the rail says where you are as well as where to go; kind is not in the dash (at 2 px, agent versus person read as a rendering artifact), so colour is spent on position — in view `{colors.ink}`, the rest `{colors.hairline-strong}`. **Hovering a tick shows what it leads to**: a `role="tooltip"` card beside the rail with the author, the time and the entry's first line, positioned from screen rectangles (not `offsetTop`, whose offsetParent is the transformed cluster) and clamped inside the rail. Without it the rail is a row of identical dashes and every jump is a guess. Each tick is a 5–14 px flex row, because a rail you cannot hit is not a rail.
- **`comment-composer`** — **one line at rest, a box on focus**, the way Linear's and multica's are: an empty comment box is most of what is on screen for the moments nobody is writing, and it was paying ~150 px and a hairline rule to say so. Note the resting state has to state `min-h-10` — `.tiptap-content` carries a global `min-height: 8rem` that nothing removes, only outranks. **Send is an icon button in the corner** of the box (↑, `icon-sm`, `rounded-full`) rather than a labelled button on a footer bar, and it is acknowledged where it is — spinner, then the comment arrives above. `⌘↵` / `Ctrl↵` sends, because `↵` has to stay a newline in a markdown box; the chord is caught in `editorProps.handleKeyDown` *before* the hard-break extension, which claims `Mod-Enter` for itself. Sending is not leaving: the button cancels its own `mousedown` so pressing it does not blur the box, and the editor is remounted with `autoFocus` so the caret is back where the next comment gets typed. On an issue whose thread is taller than the window it is **docked**: the wrapper is `sticky bottom-0` on an opaque `{colors.page}` band, so the comments run underneath it and the box follows the reader down the thread. No threshold to tune — `bottom-0` does nothing until the composer's own place is below the fold, which is the same thing as "there are enough comments to scroll past", and it settles back into the flow at the end. Docked, it is capped at `max-h-[45vh]` with the editor scrolling inside itself, so a draft long enough to fill the screen does not take the thread with it. The draft is kept per issue in **`sessionStorage`** — not `localStorage`, since a draft belongs to this browsing session and a half-sentence from last week reappearing under the box would be a haunting. Both rich-text boxes on the page carry an `aria-label` (`Write a comment`, `Issue description`): two nameless text boxes are as indistinguishable to a screen reader as to a test. `editorProps.attributes` **replaces** TipTap's defaults rather than merging, so restating `role="textbox"` there is part of setting the name.
- **`issue-actions`** — `Copy issue URL` and `Copy issue ID` as **icon buttons in the page's top-right corner**, which is where Linear keeps them and what the eye already reads as "actions on this thing". They were a labelled list in the details rail, where they sat under the facts and read as two more facts. Icon-only means the label has to survive as the tooltip *and* the accessible name, and it names the thing rather than the act: two copy buttons labelled "Copy" say nothing about which one you want. The copy is acknowledged in place by swapping the icon for a check rather than by a toast.
- **`status-badge`** — a 6 px `rounded-full` dot plus a written label (`AgentStatusBadge`, `DaemonStatusBadge`). The dot is `aria-hidden`; the label carries the state. Colour never carries meaning alone.
- **`usage-series`** — the token-usage chart and its legend use, in order: input `{colors.success}` (link blue), output `{colors.cyan-deep}`, cache read `{colors.violet}`, cache write `{colors.warning}`. Percentages are floored rather than rounded so a figure can never claim a false 100 %.
- **`live-log`** — a `{colors.canvas-soft-2}` panel of `{typography.caption-mono}` lines with the newest pinned to the bottom; it is an output surface, never interactive.
- **`toast`** — the sonner surface: `bg-card rounded-md`, `{typography.body-sm}`, Level 4 shadow. Toasts report transient outcomes only; they are never the sole error surface for a failed page load.

### Marketing Components

- **`squad`** — the hero's second half, and the banner's other half: the banner does not only say what the squad is made of, it shows them at work. Three figures stand in the hero's margins — two on the left, one on the right, at different heights — each captioned with what it is doing in `{typography.caption-mono}` on a `{colors.canvas}` pill. **They are scattered, not lined up**: a belt with one robot per station was tried first and rejected. **Hover plays a gesture, and a different one each** — a scan, a nod, a lift. A render is one flat layer with no magnifier inside it to sweep, but the gesture still has to differ per figure: one lift shared by three reads as one figure repeated, which is the same mistake a single crop size made.
- **`robot`** — the artwork itself, and the end of a long attempt to make one. The three are **generated renders on a real alpha channel**, in `web/public/robots/`: the **Inspector** (a cap, a magnifying glass — hunting a bug), the **Tester** (a white helmet, a multimeter and a circuit board — checking the build) and the **Planner** (a hard hat with an antenna, a clipboard — drawing a screen). The job is read off the prop, which is why these three, and why they are cut a little below the waist: cutting them at the chest to dodge scenery produced three heads under the same hat, and three heads is one figure.

  **What was tried before, and what each attempt established.** `docs/assets/banner.png` is the source of the first pair: a flattened 2688×1520 render with no alpha, standing in front of a photograph. Its robots *can* be taken off that background — `scripts/alpha-key.mjs` walks in from the border and accepts a neighbour when the local step between them is small, which crosses sky, haze and steel and stops at the figure — but the matte keeps a few percent of leftover, worst where a figure stands in front of a **white** UI panel, because a white robot against a white panel has no edge for any of it to find. Hand-drawn SVG characters (`robots.tsx`) and a Three.js scene (`squad-3d.tsx`) were tried and deleted: the first had the right palette and no volume, the second cost 140 KB gzipped to show a model that was still home-made.

  **Two traps worth keeping, both found the hard way.** The display widths are solved from the **head**, not the crop: the three figures are drawn at one scale — their heads measure 336 / 332 / 339 source pixels — but their crops are framed differently, so equal *widths* render equal heads at three different sizes, and the widest crop reads as the smallest robot. And **the path carries a version** (`web/public/robots/v2/`): the image optimizer keys on the source path with a four-hour `max-age`, so replacing a file's contents under the same name leaves the old bytes served, in the browser and on the CDN alike. Changing the path is what changes the URL.

  **And the crop keeps the figure it was aimed at, not every pixel in the rectangle.** A box drawn around one robot on a three-robot sheet clips its neighbours — a sliver of a magnifier on the right, the top of a head below — and those slivers are untouched by the key, so the tight box stretches to reach them and the file ends up wider than the robot in it. The Planner shipped that way for an afternoon: three fragments (1382, 556 and 14 px) sitting in its bottom-right corner on the live page. They are *disconnected* from the figure, which is the whole test, so the crop now keeps the largest connected component and drops the rest.
  **The lesson is about the input, not the algorithm.** The same generators will happily draw a checkerboard to mean "transparent" — and a checkerboard's light square is pure white, the same as the robot's shell, so no threshold separates them and JPEG noise takes away the pattern test that otherwise would. A JPEG cannot carry alpha; it can carry a flat keyable colour. **Ask for a transparent PNG, and if that is not available, one flat colour that appears nowhere on the figure (`#ff00ff`) — and the whole cutting problem disappears.** `scripts/alpha-key.mjs` handles all three cases; on a file that already has alpha it is only a cropping tool.
- **`hero-band`** — `bg-canvas` with the masked mesh gradient and the blueprint grid behind the top 560 px. Contents: a `badge-secondary` pill announcement, the headline in `{typography.display-xl}` (sentence-case, period-terminated), a lead paragraph in `{typography.body-lg}` capped at `max-w-2xl`, a CTA row of a `cta-primary-pill` plus a `cta-secondary-pill`, one line in `{typography.caption-mono}`, and the `squad` around it. There is no logo tile, and the mark is not used as a portrait: it lives in the nav at 20 px.
- **`demo-board`** — the product band's centrepiece, and it is set in **this repository**: the workspace is GitSquad, the repo is `feifeifeimoon/GitSquad`, and the issue keys follow from the name (`deriveIssuePrefix` takes its first three letters, so GIT-*). An example the reader can go and read beats an invented one. The chrome is the workspace avatar, the name, the repo and the running agent's status badge; then a board row on `{colors.page}` holding real `board-column` wells with a hand-built card each; then one issue split into its thread and its run — tool log, branch, tokens, elapsed. Selecting a card swaps the issue below it.

  **Its columns are 272 px, not the console board's 288.** Four of 288 do not divide into this frame, so the fourth column came out sliced through a card and read as a layout bug. The console's board is free to scroll because it *is* a board; this is a picture of one, and a picture should not look broken. At 272, four fit with a sliver of the fifth showing — the same "there is more" cue the console gives, without cutting a card in half.

  **The agents wear the faces the hero shows**, cut from the same renders, so the squad above and the workers below are the same three characters rather than two unrelated sets of initials. The thread draws a person as a monogram and an agent as a portrait: one avatar per *kind* — every agent the same Bot glyph, every person the same User glyph — says nothing in a thread whose whole point is who said what. Avatars are `rounded-sm`, which is what `WorkspaceAvatar` uses everywhere else in the console; a circle clips the corners off a square portrait, and on a 24 px robot head the corners are the hat and the chin, the two things that say which robot it is.
- **`why-band`** — `bg-canvas`, a 3-up grid of claims (1-up below `md`). Each claim is a well of fixed height, a `{typography.title-sm}` heading and a `{typography.copy}` paragraph. The wells share a minimum height so the three headings land on one line across the row.
- **`how-it-works-band`** — `bg-canvas-soft`, three steps in one surface divided by hairlines (`grid gap-px bg-hairline`) rather than three shadowed cards: one process, not three products. Each step numbers itself `01`–`03` in `{typography.caption-mono}` and closes on the command it needs.
- **`closing-band`** — the polarity flip, pinned dark, holding the last ask. It and the footer share one dark region with a hairline between them.
- **`marketing-footer`** — pinned dark: brand and tagline, three link columns under `{typography.micro}` uppercase labels, a hairline, the licence and pre-1.0 status, and a wordmark at `clamp(3.5rem, 14vw, 10rem)` in `{colors.ink}` at 10 % — decoration that says so, with no link and no label.
- **`cta-primary-pill` / `cta-secondary-pill`** — the pair every band closes on. The secondary is transparent behind a `{colors.hairline-strong}` outline, not the filled `secondary` button: it stands on a mesh gradient in the hero and on near-black in the closing band, and `bg-card` is the same colour as both surfaces in dark mode, so the button disappeared into the band it was sitting on.
- **`code-editor-mockup`** — `bg-[#0a0a0a] rounded-md shadow-level-3` containing mono text. The one place the system goes darker than `{colors.primary}`.
- **`badge-secondary`** — the rounded-full announcement pill with `{typography.caption}` text on `{colors.canvas}` at Level 1.
- **`link-inline`** — `{colors.link}` text, underlined on hover.

## Do's and Don'ts

### Do
- Reserve `{colors.primary}` (`#171717`) for affirmative actions. Ink is the conversion target.
- Use `{rounded.sm}` 6 px for every in-app control and `{rounded.full}` for marketing CTAs. Pick a scale per screen and stay there.
- Set display type at weight 600 with `-0.04em`-class tracking, sentence-case and period-terminated.
- Use the mesh gradient at hero scale only, as one unbroken object.
- Layer stacked shadows with the inset hairline ring rather than a single heavy drop.
- Cycle surfaces with the polarity-flipped `{colors.primary}` band as the depth cue.
- Put every machine-reported value — status, count, id, model, log line — in a mono face.
- Pair every status dot with a written label so state survives grayscale.
- Keep the sidebar's uppercase `{typography.caption}` labels as the only all-caps text in the product.

### Don't
- Don't introduce a sixth accent colour, and don't add a green "success" hue — `{colors.success}` is the link blue by design.
- Don't render headlines in all-caps.
- Don't drop a single large-blur shadow on a card.
- Don't shrink or recolour the gradient to an icon or a single stop.
- Don't promote the sans to weight 700. The display ceiling is 600.
- Don't put body paragraphs in mono.
- Don't let a board column change width responsively — the board scrolls, it never reflows.
- Don't communicate a state with colour alone anywhere.
- Don't add a surface that depends on the pastel "soft" fills until those tokens have dark-mode variants (see the Dark Mode gap above).
