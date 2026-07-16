# INT-006: Plugin Entry, Settings & Lifecycle

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

- AE-006: Plugin Entry, Settings & Lifecycle — this Intent is the retroactive-adoption record for the AE itself; it establishes the AE's initial LOCKED state against the codebase as it stood at adoption time.

## Motivation

The "Plugin Entry, Settings & Lifecycle" slice is the composition root of the whole plugin — the `PMPlugin` class Obsidian instantiates, the settings tab, the one-shot old-to-new project-format migration, and the due-date notifier — yet it had zero spec coverage. Everything the rest of the plugin reaches through `plugin.*` (the wired `store`/`notifier`/`router`, the loaded-and-normalized `settings`, the bounded undo/redo stacks, the persisted collapsed-task state) is assembled here in `onload`, and all of it is currently only knowable by reading the code. Anyone who needs to reason about startup ordering (why migration and stale-filter cleanup wait for `onLayoutReady`), about the one-way in-place settings migrations (deriving `StatusConfig.complete`, translating the retired `ganttHideDone` toggle), or about the notifier's dedupe/terminal-status/try-catch invariants has to reconstruct that design by tracing `src/main.ts`, `src/settings.ts`, `src/migration.ts`, and `src/components/Notifier.ts` line by line. That reconstruction cost recurs every time this backbone is touched, and because it is the lifecycle boundary that every view, modal, and command depends on, it is exactly the slice most expensive to leave unspecified. This adoption pass closes that gap now, while the code is already shipped and CI-green, so the design is captured against a known-good baseline rather than reverse-engineered later under change pressure.

## Desired Outcome

The "Plugin Entry, Settings & Lifecycle" slice is now described by a LOCKED AE (AE-006) that any future Intent touching `src/main.ts`, `src/settings.ts`, `src/migration.ts`, or `src/components/Notifier.ts` must link against, giving that subsystem a stable, discoverable spec boundary and named constraints.

## Non-Goals

- This Intent makes no code change.
- It does not retroactively spec every other subsystem — sibling Intents cover those in the same adoption pass.

## Type-specific required fields

### `documentation` — Coverage-Gap

**Coverage-Gap:** No AE, WS, IC, or Intent covered `["src/main.ts","src/settings.ts","src/migration.ts","src/components/Notifier.ts"]` prior to this Intent (confirmed via `dekspec dev archeology coverage`, run 2026-07-16 against commit 511ec7b). This Intent closes that gap.

## Components affected

- `src/main.ts`
- `src/settings.ts`
- `src/migration.ts`
- `src/components/Notifier.ts`

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
| 2026-07-16 | Substantive | Retroactive adoption: Intent authored and locked directly against the current (already-shipped, CI-green) state of `src/main.ts`, `src/settings.ts`, `src/migration.ts`, and `src/components/Notifier.ts` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
