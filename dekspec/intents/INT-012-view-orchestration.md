# INT-012: Project/Dashboard View Orchestration

## Status

PROPOSED

## Intent type

documentation

## Autonomy

manual

## Risk Tier

default

## Branch

none — retroactive adoption, no code change

## Mission

none

## Source

none

## Created

2026-07-16

## Modified

2026-07-16

## Linked Architecture Elements

- AE-012: Project/Dashboard View Orchestration — this Intent is the retroactive-adoption record for the AE itself; it establishes the AE's initial LOCKED state against the codebase as it stood at adoption time.

## Motivation

The top-level view orchestration layer — the two registered Obsidian `ItemView`s (`DashboardView`, `ProjectView`), the `PMViewRouter` that opens leaves for them, the `SubView` contract the three per-project render modes implement, and the `ProjectListRenderer` helpers behind the dashboard — shipped with zero spec coverage. Yet it owns the plugin's most subtle lifecycle boundary: the seam between Obsidian's workspace/leaf machinery and the plugin's own rendering. Several non-obvious invariants live here and nowhere in prose — that `ProjectView` treats `setState` (not `onOpen`) as the sole project loader and must keep one-time setup idempotent because deferred leaves may restore via `setState` alone; that any vault write while these views are mounted must be self-write-marked or the file-change listeners will misread it as an external edit and trigger a spurious reload; that `refreshProject()` deliberately prefers a subview's in-place `refresh()` over destroy-and-rebuild to preserve scroll/selection; and that async dashboard renders are guarded by a render token against staleness. Today the only way to learn any of this is to reverse-engineer it by reading `ProjectView.ts` and its siblings — an expensive, error-prone reconstruction that every future change to view lifecycle, filter/saved-view state, or the reload-vs-refresh decision has to pay again. This adoption pass closes that gap now, before the next change touches these files, so the design is captured while it is still fresh and CI-green rather than rediscovered later.

## Desired Outcome

The Project/Dashboard View Orchestration slice is now described by a LOCKED Architecture Element (AE-012) that any future Intent touching these files must link against, giving the orchestration layer a durable, referenceable design of record instead of code that must be re-read to be understood.

## Non-Goals

- This Intent makes no code change.
- It does not retroactively spec every other subsystem — sibling Intents cover those in the same adoption pass.

## Type-specific required fields

### `documentation` — Coverage-Gap

**Coverage-Gap:** No AE, WS, IC, or Intent covered `["src/views/ProjectView.ts","src/views/DashboardView.ts","src/views/PMViewRouter.ts","src/views/SubView.ts","src/views/ProjectListRenderer.ts"]` prior to this Intent (confirmed via `dekspec dev archeology coverage`, run 2026-07-16 against commit 511ec7b). This Intent closes that gap.

## Components affected

- `src/views/ProjectView.ts`
- `src/views/DashboardView.ts`
- `src/views/PMViewRouter.ts`
- `src/views/SubView.ts`
- `src/views/ProjectListRenderer.ts`

## Verification

```yaml
verification:
  - name: typecheck-lint-format-clean
    cmd: pnpm check
  - name: full-suite-green
    cmd: pnpm test
```

Both checks were run manually on 2026-07-16 against commit `511ec7b` as the retroactive verification event for this adoption pass: `pnpm check` exited 0; `pnpm test` reported 200/200 tests passing across 12 test files.

## Outcome Verification

Not applicable in the ADR-029 red-first sense — no new code lands under this Intent. `outcome_verification_grandfathered: true` — this Intent predates code authored under the DekSpec process on this repo; it adopts code that shipped before DekSpec was introduced.

## Open Issues

_None._

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: Intent authored and locked directly against the current (already-shipped, CI-green) state of `["src/views/ProjectView.ts","src/views/DashboardView.ts","src/views/PMViewRouter.ts","src/views/SubView.ts","src/views/ProjectListRenderer.ts"]` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted adoption Intents stay mutable while we work in this repo. | 60890286+jeffhaskin@users.noreply.github.com |
