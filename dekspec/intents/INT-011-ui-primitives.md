# INT-011: UI Primitives & Design System Styling

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

- AE-011: UI Primitives & Design System Styling — this Intent is the retroactive-adoption record for the AE itself; it establishes the AE's initial LOCKED state against the codebase as it stood at adoption time.

## Motivation

The plugin's reusable UI vocabulary — the leaf-level presentation primitives (`Chip`, `ChipButton`, `Avatar`/`AvatarStack`, `IconButton`, `ProgressBar`, `CollapseToggle`, `EmptyState`, `SegmentedControl`, `ViewSwitcher`, `Popover`), the domain-flavored render helpers built on them (`StatusBadge`, `FormField`, `FilterDropdown`, `PaletteListEditor`, `TaskContextMenu`), the design-system CSS that themes them inside Obsidian (`src/styles/{variables,widgets,chrome,utilities,styleguide,index}.css`), and the catalog/gallery that governs their use (`docs/styleguide.md`, `src/views/styleguide/**`) — shipped and hardened well before DekSpec was introduced on this repo, and carried zero spec coverage. That is the layer everything else is built from: every view and modal reaches for these primitives, the whole plugin's look derives from these tokens and classes, and the "extend an existing primitive rather than hand-roll an element" discipline (with its primitives → composites → orchestrators import direction) lives only implicitly in the code and the styleguide doc. Today, any engineer who needs to know why the primitives must stay domain-free, why only two `--pm-*` theme tokens exist, or where the boundary sits between this shared layer and the composites/view slices has to reconstruct all of it by reading the source. That reconstruction cost recurs on every change that touches the UI foundation and every review that has to judge whether a change respects the layering. This adoption pass closes the gap by bringing the slice under a LOCKED AE, so the design intent is recorded once rather than re-derived each time.

## Desired Outcome

The "UI Primitives & Design System Styling" slice is now described by a LOCKED Architecture Element (`AE-011`) that any future Intent touching these files must link against, making the reusable-primitive layer, its chained-setter contract, its domain-free boundary, and its design-system CSS a first-class, spec-governed subsystem rather than undocumented shipped code.

## Non-Goals

- This Intent makes no code change.
- It does not retroactively spec every other subsystem — sibling Intents cover those in the same adoption pass.

## Type-specific required fields

### `documentation` — Coverage-Gap

**Coverage-Gap:** No AE, WS, IC, or Intent covered `["src/ui/primitives/**","src/ui/StatusBadge.ts","src/ui/FormField.ts","src/ui/FilterDropdown.ts","src/ui/PaletteListEditor.ts","src/ui/TaskContextMenu.ts","src/views/styleguide/**","src/styles/chrome.css","src/styles/index.css","src/styles/styleguide.css","src/styles/utilities.css","src/styles/variables.css","src/styles/widgets.css","docs/styleguide.md"]` prior to this Intent (confirmed via `dekspec dev archeology coverage`, run 2026-07-16 against commit 511ec7b). This Intent closes that gap.

## Components affected

- `src/ui/primitives/**`
- `src/ui/StatusBadge.ts`
- `src/ui/FormField.ts`
- `src/ui/FilterDropdown.ts`
- `src/ui/PaletteListEditor.ts`
- `src/ui/TaskContextMenu.ts`
- `src/views/styleguide/**`
- `src/styles/chrome.css`
- `src/styles/index.css`
- `src/styles/styleguide.css`
- `src/styles/utilities.css`
- `src/styles/variables.css`
- `src/styles/widgets.css`
- `docs/styleguide.md`

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
| 2026-07-16 | Substantive | Retroactive adoption: Intent authored and locked directly against the current (already-shipped, CI-green) state of `["src/ui/primitives/**","src/ui/StatusBadge.ts","src/ui/FormField.ts","src/ui/FilterDropdown.ts","src/ui/PaletteListEditor.ts","src/ui/TaskContextMenu.ts","src/views/styleguide/**","src/styles/chrome.css","src/styles/index.css","src/styles/styleguide.css","src/styles/utilities.css","src/styles/variables.css","src/styles/widgets.css","docs/styleguide.md"]` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted adoption Intents stay mutable while we work in this repo. | 60890286+jeffhaskin@users.noreply.github.com |
