# INT-008: Table View

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

- AE-008: Table View — this Intent is the retroactive-adoption record for the AE itself; it establishes the AE's initial LOCKED state against the codebase as it stood at adoption time.

## Motivation

Before this Intent, `src/views/table/**` and `src/styles/table.css` — the spreadsheet-style `SubView` that renders a project's filtered, sorted, hierarchy-aware task tree as an HTML table and turns inline cell edits, keyboard navigation, and multi-select bulk operations into store mutations — had no architectural record at all. This is a deceptively subtle slice: an engineer or an agent asked to touch it had to reconstruct, purely by reading code, the virtualized (windowed) tbody with its once-only row-height calibration, the tree-flattening pass that promotes orphaned matches to root under an active filter, the shift-click range selection and tri-state select-all logic keyed off `visibleRows`, and the `BulkAction` dispatch that batches destructive operations against `plugin.store`. Nothing stated where the table's boundary sits — that it owns presentation and view-local state only, delegating every persistent change through the `TaskSource` contract and never touching the vault, frontmatter, or scheduler directly. That reconstruction cost is exactly what DekSpec adoption is meant to eliminate going forward; this Intent closes it for the Table View slice specifically, one of the three interchangeable presentations of the same task data.

## Desired Outcome

`src/views/table/**` and `src/styles/table.css` are described by a LOCKED Architecture Element (AE-008) that any future Intent touching the table view links against, satisfying the AE-mandatory linkage requirement for downstream work in this subsystem.

## Non-Goals

- This Intent makes no code change.
- It does not retroactively spec every other subsystem — sibling Intents cover those in the same adoption pass.

## Type-specific required fields

### `documentation` — Coverage-Gap

**Coverage-Gap:** No AE, WS, IC, or Intent covered `src/views/table/**` or `src/styles/table.css` prior to this Intent (confirmed via `dekspec dev archeology coverage`, run 2026-07-16 against commit 511ec7b). This Intent closes that gap.

## Components affected

- `src/views/table/**`
- `src/styles/table.css`

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
| 2026-07-16 | Substantive | Retroactive adoption: Intent authored and locked directly against the current (already-shipped, CI-green) state of `src/views/table/**` and `src/styles/table.css` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
