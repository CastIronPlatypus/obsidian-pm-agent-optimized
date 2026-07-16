# INT-007: Shared Domain Types & Utilities

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

- AE-007: Shared Domain Types & Utilities — this Intent is the retroactive-adoption record for the AE itself; it establishes the AE's initial LOCKED state against the codebase as it stood at adoption time.

## Motivation

The shared domain slice — `src/types.ts`, `src/dates.ts`, `src/utils.ts`, `src/env.d.ts`, and the `dates.test.ts` that guards the date layer — is the plugin's definitional core: the `Task`/`Project`/`FilterState`/`SavedView` shapes and their `DEFAULT_*` palettes, the entity constructors (`makeTask`, `makeProject`, `makeId`, `makeDefaultFilter`), the timezone-safe `Temporal`-backed date layer (`today`/`parsePlainDate`/`formatDate`/`relativeDue`), and the stateless config-resolution, formatting, color, and DOM helpers that everything else leans on. It is simultaneously the most widely-imported code in the repository and, until now, entirely uncovered by spec: the store, every view, every modal, the UI component layers, the commands, and `main.ts` all consume these types and helpers, yet the only description of what a `Task` *is*, why dates must route through `Temporal`, or why `archived`/`collapsed` are runtime-only and must never be persisted, lived implicitly in the source. Anyone changing a downstream subsystem — or onboarding to the plugin at all — currently has to reconstruct the intended contracts (leaf-status in the import graph, null-tolerant date parsing, injectable `from` for deterministic `relativeDue` tests) by reading the modules and inferring intent. That reconstruction cost is paid on every touch of the codebase, which makes this the highest-leverage slice to bring under spec first in this retroactive adoption pass.

## Desired Outcome

This slice is now described by a LOCKED Architecture Element (AE-007) that any future Intent must link against — the shared vocabulary's boundaries, responsibilities, dependency-leaf constraint, and date/runtime-state invariants are captured as spec rather than folklore, so downstream changes have a stable, cited contract to reference.

## Non-Goals

- This Intent makes no code change.
- It does not retroactively spec every other subsystem — sibling Intents cover those in the same adoption pass.

## Type-specific required fields

### `documentation` — Coverage-Gap

**Coverage-Gap:** No AE, WS, IC, or Intent covered `["src/types.ts","src/dates.ts","src/dates.test.ts","src/utils.ts","src/env.d.ts"]` prior to this Intent (confirmed via `dekspec dev archeology coverage`, run 2026-07-16 against commit 511ec7b). This Intent closes that gap.

## Components affected

- `src/types.ts`
- `src/dates.ts`
- `src/dates.test.ts`
- `src/utils.ts`
- `src/env.d.ts`

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
| 2026-07-16 | Substantive | Retroactive adoption: Intent authored and locked directly against the current (already-shipped, CI-green) state of `["src/types.ts","src/dates.ts","src/dates.test.ts","src/utils.ts","src/env.d.ts"]` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted adoption Intents stay mutable while we work in this repo. | 60890286+jeffhaskin@users.noreply.github.com |
| 2026-07-16 | Substantive | retroactive-adoption intent; describes shipped subsystem; locked at engineer direction, reversible via --unlock | Claude (engineer-directed) |
