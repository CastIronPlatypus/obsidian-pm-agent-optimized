# INT-003: Gantt View

## Status

LOCKED

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

- AE-003: Gantt View — this Intent is the retroactive-adoption record for the AE itself; it establishes the AE's initial LOCKED state against the codebase as it stood at adoption time.

## Motivation

The Gantt View slice — the timeline `SubView` that renders each task as a positioned bar or milestone diamond, computes the date-to-pixel coordinate system, draws the sticky time-period header, dependency arrows, and the left label column, and turns drag/link gestures into store mutations — shipped with zero spec coverage. Its design lives only in the code: the deliberate three-way split between pure geometry (`TimelineConfig`), stateless drawing (`GanttRenderer` / `GanttHeaderRenderer` / `GanttTaskBarRenderer` / `TaskLabelRenderer`), and stateful pointer interaction (`GanttDragHandler`, `GanttLinkHandler`); the `RendererContext` that threads state without globals; the `cleanupFns` teardown discipline that prevents listener leaks across re-renders; and the hard boundary that keeps all persistence, auto-scheduling, and cycle detection out of the view and inside the store and `Scheduler`. Today anyone touching the timeline — to add a granularity band, fix a snap-point off-by-one, or reason about why a drag reverts on store failure — has to reconstruct all of that by reading `src/views/gantt/**` and `src/styles/gantt.css` directly, with no authoritative statement of what is inside the boundary versus deliberately delegated. That reconstruction cost recurs on every change and every review, and it is worth closing now, as part of a repo-wide adoption pass, by binding the slice to a LOCKED AE.

## Desired Outcome

The Gantt View slice is now described by a LOCKED Architecture Element (`AE-003`, "Gantt View") that any future Intent touching `src/views/gantt/**` or `src/styles/gantt.css` must link against, giving the timeline subsystem a durable, authoritative design record instead of code-only tribal knowledge.

## Non-Goals

- This Intent makes no code change.
- It does not retroactively spec every other subsystem — sibling Intents cover those in the same adoption pass.

## Type-specific required fields

### `documentation` — Coverage-Gap

**Coverage-Gap:** No AE, WS, IC, or Intent covered `["src/views/gantt/**","src/styles/gantt.css"]` prior to this Intent (confirmed via `dekspec dev archeology coverage`, run 2026-07-16 against commit 511ec7b). This Intent closes that gap.

## Components affected

- `src/views/gantt/**`
- `src/styles/gantt.css`

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
| 2026-07-16 | Substantive | Retroactive adoption: Intent authored and locked directly against the current (already-shipped, CI-green) state of `["src/views/gantt/**","src/styles/gantt.css"]` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted adoption Intents stay mutable while we work in this repo. | 60890286+jeffhaskin@users.noreply.github.com |
| 2026-07-16 | Substantive | retroactive-adoption intent; describes shipped subsystem; locked at engineer direction, reversible via --unlock | Claude (engineer-directed) |
