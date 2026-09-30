import Image from "next/image";

import { anchors, links } from "./links";

// The page used to stop after three bands — no closing ask, no footer, nothing
// saying what the project is licensed under or where its source lives. A
// landing page that ends mid-thought reads as a mock-up of one.
//
// The footer is pinned to the dark palette with a `dark` class rather than
// `bg-primary`: primary inverts with the reader's theme, and a footer that goes
// near-white in dark mode is the bug that produced this rule.

const COLUMNS: { title: string; items: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    items: [
      { label: "Board and thread", href: `#${anchors.product}` },
      { label: "Why GitSquad", href: `#${anchors.why}` },
      { label: "How it works", href: `#${anchors.howItWorks}` },
      { label: "Architecture", href: links.architecture },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Documentation", href: links.documentation },
      { label: "Contributing", href: links.contributing },
      { label: "Design system", href: links.design },
      { label: "Releases", href: links.releases },
    ],
  },
  {
    title: "Project",
    items: [
      { label: "GitHub", href: links.github },
      { label: "Issues", href: links.issues },
      { label: "License", href: links.license },
    ],
  },
];

export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="dark border-t border-hairline bg-canvas-soft text-ink">
      <div className="mx-auto max-w-[1200px] px-6 pt-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2 text-copy font-semibold text-ink">
              <Image
                src="/favicon.ico"
                alt=""
                width={20}
                height={20}
                className="size-5 rounded-sm"
              />
              GitSquad
            </div>
            <p className="mt-3 max-w-xs text-copy leading-6 text-body">
              Your autonomous developer team on GitHub. Open source under
              Apache-2.0, and it runs on the machine you already develop on.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-micro font-semibold uppercase tracking-[0.16em] text-mute">
                {column.title}
              </p>
              <ul className="mt-3 space-y-2">
                {column.items.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      {...(item.href.startsWith("http")
                        ? { target: "_blank", rel: "noreferrer" }
                        : {})}
                      className="text-copy text-body transition-colors hover:text-ink"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-hairline py-6 text-caption text-mute sm:flex-row sm:items-center sm:justify-between">
          <p>
            Pre-1.0 — it runs end to end, but the API and the schema still move
            between releases.
          </p>
          <p>© {year} GitSquad · Apache-2.0</p>
        </div>
      </div>

      {/* The wordmark closes the page the way the headline opened it. It is
          decoration and says so: no link, no label, hidden from the reader that
          is not looking at it. */}
      <div aria-hidden="true" className="mx-auto max-w-[1200px] px-6 pb-6">
        <p className="select-none text-[clamp(3.5rem,14vw,10rem)] font-semibold leading-[0.85] tracking-[-0.06em] text-ink/10">
          GitSquad
        </p>
      </div>
    </footer>
  );
}
