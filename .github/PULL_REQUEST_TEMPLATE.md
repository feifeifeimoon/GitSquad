<!--
Title: type(scope): what it does, as a sentence the log would want — e.g.
feat(web): a slash menu in the composer, and a caret popup that stays put.
PRs are squash-merged, so this title becomes the commit subject on main.

Delete the sections that do not apply. A short, honest PR beats a filled-in one.
-->

## Why

<!-- The problem this solves, and why this approach is the right one. Link the
issue if one tracks it: `Closes #123`. -->

## What changed

<!-- The decisions a reviewer cannot read off the diff: the shape you chose, the
alternative you rejected, the trap that cost you an hour. -->

## How it was verified

<!-- The commands you ran and what they reported — `make check`, `go mod tidy`,
`bun run test`, `bun run lint`, `bun run build`, `make e2e` for a user-facing
flow. Say what you did not verify as plainly as what you did. -->

## Screenshots

<!-- Before and after for anything visible, or `N/A` when nothing moved on
screen. A short recording beats two stills for interaction changes. -->

## Not in this PR

<!-- Optional, but useful: what is deliberately left out, and what it would take.
Keeps a focused PR from looking like an unfinished one. -->

## Checklist

- [ ] `make check` passes (gofmt, vet, Staticcheck, tests), and `go mod tidy` leaves `go.mod` unchanged
- [ ] Frontend, when touched: `bun run test`, `bun run lint` and `bun run build` pass from `web/`
- [ ] New or changed behavior has tests, or the PR says why it cannot
- [ ] SQL lives in `store/queries/*.sql` and `sqlc generate` was run
- [ ] Docs updated when a command, environment variable, or workflow changed
- [ ] CI is expected to be green — the four required jobs are named in `CONTRIBUTING.md`
