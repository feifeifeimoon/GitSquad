"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { AuthButton } from "@/components/auth-button";
import { GitHubMark } from "@/components/github-mark";
import { LoginModal } from "@/components/login-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { anchors, links } from "./links";

// Three destinations, and every one of them goes somewhere. The bar this
// replaced offered Agents, Security, Pricing and Docs — four names pointing at
// a bare hash, because none of those pages exist yet. A nav item that leads
// nowhere is worse than a missing one: it is a promise the product has not made.
//
// GitHub is not one of them: it is an icon on the right, where every developer
// tool keeps it, rather than a fourth word in a row of three.
const NAV_ITEMS = [
  { label: "Product", href: `#${anchors.product}` },
  { label: "Why GitSquad", href: `#${anchors.why}` },
  { label: "How it works", href: `#${anchors.howItWorks}` },
];

export function LandingNav() {
  const [showLoginModal, setShowLoginModal] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-6 px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-copy font-semibold text-ink">
          <Image
            src="/favicon.ico"
            alt="GitSquad logo"
            width={20}
            height={20}
            className="size-5 rounded-sm"
            priority
          />
          GitSquad
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="rounded-full px-3 py-1.5 text-copy text-body transition-colors hover:bg-muted hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* The theme control, the source, and the ask. The GitHub mark is an
            icon rather than a fourth nav word: it is the one destination in this
            bar that leaves the page, and the shape says so before the word does.
            Its label names the artifact — "GitSquad on GitHub" — because
            "GitHub" alone leaves a screen reader with a link whose purpose is a
            guess. */}
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={links.github}
            target="_blank"
            rel="noreferrer"
            aria-label="GitSquad on GitHub"
            title="GitSquad on GitHub"
            className="flex size-8 items-center justify-center rounded-full text-body transition-colors hover:bg-muted hover:text-ink"
          >
            <GitHubMark className="size-4" />
          </a>

          <ThemeToggle className="flex size-8 items-center justify-center rounded-full hover:bg-muted hover:text-ink" />

          {/* The account control doubles as the CTA: signed out it opens the
              Google flow, signed in it is the avatar and the way to the console. */}
          <AuthButton
            size="pill-sm"
            signedOutLabel="Get started"
            onLoginClick={() => setShowLoginModal(true)}
          />
        </div>
      </div>

      <LoginModal
        mode="modal"
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />
    </header>
  );
}
