---
version: alpha
name: gitsquad-design-system
description: The design language for the GitSquad web console — a stark ink-on-canvas engineering surface, broken at hero scale by a multi-colour mesh gradient that is the entire decorative system, paired with a geometric sans for narrative text and a monospaced face for technical labels, status data, and code.

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
  gradient-blue: "#007cf0"
  gradient-violet: "#7928ca"
  gradient-magenta: "#ff0080"
  gradient-teal: "#00dfd8"
  gradient-amber: "#f9cb28"
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
  showcase-band-light:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.display-lg}"
    padding: "{spacing.5xl} {spacing.lg}"
  showcase-band-dark:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.display-lg}"
    padding: "{spacing.5xl} {spacing.lg}"
  code-editor-mockup:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
    shadow: "Level 3"
  nav-cta-ghost:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-sm-strong}"
    rounded: "{rounded.sm}"
    padding: "0px {spacing.xs}"
    height: 28px
  link-inline:
    textColor: "{colors.link}"
    typography: "{typography.body-md}"
---

## Overview

GitSquad is a multi-agent orchestration product: a console where a developer watches autonomous agents pick up GitHub issues, work in a repository, and report back. The interface has to carry a lot of machine state — agent reachability, task progress, token spend, live logs — without turning into a dashboard of competing widgets. The design language answers that with restraint: a near-white `{colors.canvas-soft}` body, ink-near-black `{colors.ink}` text, a quiet gray ladder that gives every divider and disabled state its own deliberate step, and exactly one loud element — the mesh gradient — which appears at hero scale only and nowhere else.

Type carries the second half of the job. Headlines are set in a geometric sans at weight 600 with aggressive negative tracking; everything that reports machine state — statuses, token counts, log lines, model identifiers, keyboard hints — is set in a monospaced face at 12–13 px. That split is the information architecture: narrative text is sans, telemetry is mono. A reader can tell at a glance which words are the product talking and which are the machine talking.

Surfaces use a four-step ladder: `{colors.canvas}` for cards and dialogs, `{colors.canvas-soft}` for the page body, `{colors.canvas-soft-2}` for inset regions (sidebar hovers, code blocks, table headers), and `{colors.primary}` for the polarity-flipped dark band. Elevation is built from stacked small shadows plus an inset hairline ring, never a single heavy drop-shadow — cards sit *on* the page rather than floating above it.

> **Provenance.** This visual language is an interpretation of the design language Vercel publishes on its marketing site — the surface ladder, the ink-primary CTA, the stacked-shadow elevation levels, the mesh gradient and the Geist type family all originate there. GitSquad adapts it to a console rather than a marketing site. The token names below are GitSquad's own (`web/app/globals.css` is the source of truth); nothing here should be read as an official Vercel specification.

**Key Characteristics:**
- A single ink primary `{colors.primary}` carries every affirmative action. There is no sixth accent colour and no green "success" hue — `{colors.success}` aliases the link blue.
- The multi-stop mesh gradient (blue / violet / magenta / teal / amber) is the only decorative chrome, and it appears at hero scale only.
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
- **Blue** (`{colors.gradient-blue}` — `#007cf0`), **Violet** (`{colors.gradient-violet}` — `#7928ca`), **Magenta** (`{colors.gradient-magenta}` — `#ff0080`), **Teal** (`{colors.gradient-teal}` — `#00dfd8`), **Amber** (`{colors.gradient-amber}` — `#f9cb28`): The five mesh-gradient stops. Treated as one object — never cropped to a single colour, never reordered, never miniaturised to a swatch or icon.
- The same five values are exposed as `--chart-1`…`--chart-5` so a future charting library inherits the brand palette.

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
- **Marketing bands**: `{spacing.5xl}` (96 px) top and bottom — `px-6 pb-24 pt-24 sm:pt-32` on the hero. The gradient needs that room.
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
- **Mesh gradient**: rendered as one absolutely-positioned element (`MeshGradient`, `aria-hidden`) with `h-[480px] opacity-50` at the top of the hero. It scales with the container and is never cropped to a frame or tiled.
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
- **`panel-settings`** — the card chrome at `p-5`, used for grouped settings sections with a heading and a description.
- **`table-container`** — `overflow-hidden rounded-lg border border-hairline shadow-level-2` wrapping a full-width table. Header cells are `{typography.caption-mono}` uppercase in `{colors.mute}` on a `{colors.canvas-soft}` row; body cells are `{typography.body-sm}` with `border-b border-hairline` rows.
- **`modal-card`** — `bg-card rounded-lg shadow-level-5`, used for dialogs and the sign-out confirmation.
- **`dropdown-surface`** — `bg-card rounded-md shadow-level-4`, used for the workspace switcher, the account menu and the repository picker.
- **`empty-state`** — a centred `Empty` primitive: media tile, `text-sm font-medium` title, `text-sm text-body` description, optional action. Used by every list that can be empty.

### Navigation

- **`nav-bar`** — the marketing top bar: 64 px tall, `bg-canvas`, hairline bottom border, logo left and a ghost CTA plus account control right.
- **`app-shell-sidebar`** — the console's left column, in three bands: a **fixed top block** (workspace switcher, then the palette trigger), a **single scrolling middle** (the destinations), and a **fixed footer** (the account). Only the middle scrolls. `bg-chrome`, `border-r border-hairline`, 200–400 px wide, drag-resized and remembered in `localStorage`.
- **`sidebar-section-label`** — `{typography.micro}` semibold uppercase in `{colors.mute}`. The only uppercase text in the product. It doubles as the group's placeholder: it is drawn whether or not the rows under it can be used.
- **`app-shell-nav-row`** — a **link**, not a button wired to the router. Middle-click, open-in-new-tab and being announced as a destination all come free, and none of them did before. `{typography.label}` in `{colors.body}`, `{rounded.sm}`, `aria-current="page"` on the active row. Active is a `bg-muted` fill with `{colors.ink}` and a heavier icon stroke; hover is the same fill at half strength, written as a *separate branch* so the active row carries no hover class at all — two greys one step apart are not a distinction. A row whose page needs a workspace and has none renders **disabled**: on screen, in place, not clickable. It used to vanish along with its whole group, taking every row below it along.
- **`nav-search-trigger`** — the palette's trigger, shaped as a **field** (`Search…` plus a `kbd-hint`) in the fixed top block. It opens a modal rather than navigating, so it must not look like the destinations it sits above.
- **`account-menu`** — the footer: avatar and handle as the trigger, opening an identity block, **Settings** (`/settings`) and a destructive **Sign out**. The account is not a nav row. The *workspace* settings are a workspace page and sit in that group. Those two used to be one row that rewrote its own href, which made `/settings` unreachable from the sidebar for anyone who had ever opened a workspace.
- **`kbd-hint`** — `font-mono text-micro` in `{colors.mute}` on a `{colors.muted}` chip with a hairline border, e.g. the ⌘K affordance on the search trigger. Decorative on a control that already has a name: `aria-hidden`, so it does not join the accessible name.

### Console-Specific Components

- **`board-column`** — `w-72` fixed, `{rounded.xl}`, `bg-canvas-soft` (a well) with a hairline, header in `{typography.label}` semibold carrying the status icon, the label, a count and a create affordance. **Colour does not fill a column.** Painting one turned a third of the viewport into the word "this is yellow" and said nothing about the work in it; the status colour belongs on the work, in the icon here and the edge on the card.
- **`board-card`** — `bg-canvas border border-hairline rounded-lg shadow-level-1`, rising to Level 2 on hover. Two lines of content: the title, then a meta row that renders only what exists — issue key, assignee, PR badge, comment count, relative time. A description preview and an "Unassigned" label were both removed: identical on nearly every card, so each cost a line of height without ever changing a decision. A 2px **status edge** runs down the left side in the status colour, so a card still says what it is once its column header has scrolled out of view or while it is being dragged. While dragging, the preview rotates 2° and takes Level 4 — the only rotation in the system.
- **`status-badge`** — a 6 px `rounded-full` dot plus a written label (`AgentStatusBadge`, `DaemonStatusBadge`). The dot is `aria-hidden`; the label carries the state. Colour never carries meaning alone.
- **`usage-series`** — the token-usage chart and its legend use, in order: input `{colors.success}` (link blue), output `{colors.cyan-deep}`, cache read `{colors.violet}`, cache write `{colors.warning}`. Percentages are floored rather than rounded so a figure can never claim a false 100 %.
- **`live-log`** — a `{colors.canvas-soft-2}` panel of `{typography.caption-mono}` lines with the newest pinned to the bottom; it is an output surface, never interactive.
- **`toast`** — the sonner surface: `bg-card rounded-md`, `{typography.body-sm}`, Level 4 shadow. Toasts report transient outcomes only; they are never the sole error surface for a failed page load.

### Marketing Components

- **`hero-band`** — `bg-canvas` with the mesh gradient behind the top ~480 px. Contents: a `badge-secondary` pill announcement, a 56 px logo tile at Level 2, the headline in `{typography.display-xl}` (sentence-case, period-terminated), a lead paragraph in `{typography.body-lg}` capped at `max-w-xl`, then a CTA row of a `pill` primary plus a `pill-sm` secondary.
- **`showcase-band-dark`** — `bg-primary text-white`, holding the control-centre mock: a `code-editor-mockup` panel alongside status rows.
- **`showcase-band-light`** — `bg-canvas-soft`, holding the 3-up "how it works" feature row.
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
