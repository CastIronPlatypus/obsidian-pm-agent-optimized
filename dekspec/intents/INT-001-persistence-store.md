# INT-001: Bring the persistence store under DekSpec

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

- AE-001: Task & Project Persistence Store — this Intent is the retroactive-adoption record for the AE itself; it establishes the AE's initial LOCKED state against the codebase as it stood at adoption time.

## Motivation

Before this Intent, `src/store/**` (`ProjectStore`, `TaskSource`, `TaskTreeOps`, `TaskIndex`, `TaskFilter`, `Scheduler`, `ArchiveOps`, the YAML parser/serializer/hydrator, `ProjectConfig`, `vaultFs`) — the module every other part of the plugin depends on for reading and writing vault data — had no architectural record at all. An engineer picking up this codebase for the first time, or an agent asked to modify save/load behavior, had to reconstruct the dirty-tracking scheme, the self-write suppression window, and the save-queue serialization purely by reading code, with no artifact stating what the store is responsible for or where its boundary sits relative to the views/modals that call it. That gap is the cost DekSpec adoption is meant to close going forward; this Intent closes it for the store specifically, as the highest-risk, most-depended-on slice in the plugin.

## Desired Outcome

`src/store/**` is described by a LOCKED Architecture Element (AE-001) that any future Intent touching the store links against, satisfying the AE-mandatory linkage requirement for downstream work in this subsystem.

## Non-Goals

- This Intent makes no code change. It does not alter `ProjectStore`'s behavior, add tests, or refactor anything under `src/store/**`.
- It does not retroactively spec every other subsystem of the plugin — that is covered by sibling Intents authored in the same adoption pass, not this one.

## Type-specific required fields

### `documentation` — Coverage-Gap

**Coverage-Gap:** No AE, WS, IC, or Intent covered `src/store/**` prior to this Intent — 100% of the persistence layer was spec-orphaned (confirmed via `dekspec dev archeology coverage`, run 2026-07-16 against commit 511ec7b, before this Intent existed). This Intent closes that gap by authoring AE-001 and this Intent record; the resulting AE now covers the module for future linkage.

## Components affected

- `src/store/**`

## Verification

```yaml
# Verification predicate for this Intent.
# This is a documentation-type, no-code-change Intent adopted retroactively
# for already-shipped code. The "test" is that the existing code this AE
# describes is genuinely green on the engineer's own CI, run for real (not
# assumed) as part of this adoption pass.
verification:
  - name: typecheck-lint-format-clean
    cmd: pnpm check
  - name: full-suite-green
    cmd: pnpm test
```

Both checks were run manually on 2026-07-16 against commit `511ec7b` as the retroactive verification event for this adoption pass (not via the `--testpass` CLI flow, since no `int/INT-NNN-slug` branch exists for pre-existing code): `pnpm check` exited 0 (types, oxlint, eslint --max-warnings 0, oxfmt --check all clean); `pnpm test` reported 200/200 tests passing across 12 test files.

## Outcome Verification

Not applicable in the ADR-029 red-first sense — no new code lands under this Intent. The observable outcome this Intent claims is documentation-only: `dekspec dev archeology coverage` no longer lists any path under `src/store/**` without a claiming Intent once this Intent's `Components affected` glob is in the tree. `outcome_verification_grandfathered: true` — this Intent predates any code authored under the DekSpec process on this repo; it exists to adopt code that shipped before DekSpec was introduced into this repository.

## Open Issues

_None._

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: Intent authored and locked directly against the current (already-shipped, CI-green) state of `src/store/**` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
