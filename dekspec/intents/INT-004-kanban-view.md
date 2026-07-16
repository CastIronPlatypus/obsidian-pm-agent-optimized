# INT-004: Kanban View

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

- AE-004: Kanban View — this Intent is the retroactive-adoption record for the AE itself; it establishes the AE's initial LOCKED state against the codebase as it stood at adoption time.

## Motivation

The Kanban View — one of the three interchangeable board renderings a `ProjectView` can host — shipped with zero spec coverage. It is the sole `SubView` implementation responsible for the status-partitioned column layout, per-card view-model assembly, and drag-to-restatus mutation semantics, and it carries several subtle, easy-to-break invariants: it must resolve effective config through `store.configFor(project)` rather than reading global settings so per-project status/priority overrides are honored; it lazily hydrates task note bodies for description previews and must re-render at most once to avoid render loops; and its drop handler must no-op on same-status or mismatched-drag drops, delegating the actual write to `store.updateTask` rather than mutating in place. Today any engineer touching `src/views/KanbanView.ts` or its dedicated `src/styles/kanban.css` has to reconstruct all of that — the board/column/card box model, the drop-target and dragging states, the priority bar, the sanitized plain-text preview clamp, and the `KanbanColumn` composite boundary — by reading the code and its collaborators. That reconstruction cost recurs on every change and every review, and it is worth closing now with this adoption pass so the slice's design, boundaries, and constraints are captured once in a LOCKED AE instead of re-derived each time.

## Desired Outcome

This slice — the Kanban board `SubView` (`src/views/KanbanView.ts`) and its stylesheet (`src/styles/kanban.css`) — is now described by a LOCKED AE that any future Intent touching these files must link against.

## Non-Goals

- This Intent makes no code change.
- It does not retroactively spec every other subsystem — sibling Intents cover those in the same adoption pass.

## Type-specific required fields

### `documentation` — Coverage-Gap

**Coverage-Gap:** No AE, WS, IC, or Intent covered `["src/views/KanbanView.ts","src/styles/kanban.css"]` prior to this Intent (confirmed via `dekspec dev archeology coverage`, run 2026-07-16 against commit 511ec7b). This Intent closes that gap.

## Components affected

- `src/views/KanbanView.ts`
- `src/styles/kanban.css`

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
| 2026-07-16 | Substantive | Retroactive adoption: Intent authored and locked directly against the current (already-shipped, CI-green) state of `src/views/KanbanView.ts` and `src/styles/kanban.css` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted adoption Intents stay mutable while we work in this repo. | 60890286+jeffhaskin@users.noreply.github.com |
