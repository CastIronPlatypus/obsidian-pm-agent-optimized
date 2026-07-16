# INT-010: UI Composite Components

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

- AE-010: UI Composite Components — this Intent is the retroactive-adoption record for the AE itself; it establishes the AE's initial LOCKED state against the codebase as it stood at adoption time.

## Motivation

The UI Composite Components slice — the middle tier of the plugin's three-layer component system, where domain-aware fragments like `KanbanCard`, `KanbanColumn`, `ProjectCard`, `TaskRow`, and the `ProjectHeader` trio, plus the shared render helpers (`renderDueChip`, `renderTimeChip`, `renderTagChip`, `renderAddButton`) and editing affordances (`makeInlineEdit`, `renderDateControl`, `ActionsCell`, `renderAddProperty`) live — had zero spec coverage prior to this adoption pass. It is a subtle, high-leverage layer: it carries the Kanban drag-and-drop interaction, the project header's filter/saved-view surface, and the callback-out/no-persistence discipline that keeps the whole UI backend-agnostic and testable, yet none of that intent was captured anywhere. Any engineer touching a Kanban card, an inline-edit input, or a filter dropdown today has to reconstruct the boundary rules — import direction is strictly downward, mutation flows outward through callbacks, composites never call `plugin.store` or open modals directly — by reading the source and inferring the invariants. That reconstruction cost recurs on every change to this slice and every new subview that reuses these fragments; the whole point of the layer (consistency, no one-off elements) is undocumented and therefore fragile. Closing the gap now, while the code is CI-green and its shape is well understood, is cheaper than discovering the invariants the hard way later.

## Desired Outcome

This slice is now described by a LOCKED AE (`AE-010`, "UI Composite Components") that any future Intent touching `src/ui/composites/**` must link against, giving future changes a stable, reviewable statement of the layer's purpose, responsibilities, boundaries, and callback-out/no-persistence invariants to conform to.

## Non-Goals

- This Intent makes no code change.
- It does not retroactively spec every other subsystem — sibling Intents cover those in the same adoption pass.

## Type-specific required fields

### `documentation` — Coverage-Gap

**Coverage-Gap:** No AE, WS, IC, or Intent covered `src/ui/composites/**` prior to this Intent (confirmed via `dekspec dev archeology coverage`, run 2026-07-16 against commit 511ec7b). This Intent closes that gap.

## Components affected

- `src/ui/composites/**`

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
| 2026-07-16 | Substantive | Retroactive adoption: Intent authored and locked directly against the current (already-shipped, CI-green) state of `src/ui/composites/**` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted adoption Intents stay mutable while we work in this repo. | 60890286+jeffhaskin@users.noreply.github.com |
| 2026-07-16 | Substantive | retroactive-adoption intent; describes shipped subsystem; locked at engineer direction, reversible via --unlock | Claude (engineer-directed) |
