// Where the marketing page sends people who want the project rather than the
// console. The console never needs these — it talks to the API — so they live
// beside the pages that do.
//
// Every link here has to resolve. The page this replaced carried four nav items
// pointing at `#` and a "Read the docs" that 404'd, which reads as a product
// that does not exist yet.

export const GITHUB_URL = "https://github.com/feifeifeimoon/GitSquad";

export const links = {
  github: GITHUB_URL,
  documentation: `${GITHUB_URL}#readme`,
  architecture: `${GITHUB_URL}#architecture`,
  contributing: `${GITHUB_URL}/blob/main/CONTRIBUTING.md`,
  design: `${GITHUB_URL}/blob/main/DESIGN.md`,
  license: `${GITHUB_URL}/blob/main/LICENSE`,
  releases: `${GITHUB_URL}/releases`,
  issues: `${GITHUB_URL}/issues`,
} as const;

/** In-page destinations the nav and the footer both point at. */
export const anchors = {
  product: "product",
  why: "why",
  howItWorks: "how-it-works",
} as const;
