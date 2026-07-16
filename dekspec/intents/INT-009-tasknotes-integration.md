# INT-009: TaskNotes Interop

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

- AE-009: TaskNotes Interop — this Intent is the retroactive-adoption record for the AE itself; it establishes the AE's initial LOCKED state against the codebase as it stood at adoption time.

## Motivation

The `src/integrations/**` slice — the TaskNotes Interop adapter — shipped with zero spec coverage. It is the entire boundary between Project Manager and the independently-developed TaskNotes community plugin: feature-detecting whether TaskNotes is installed, gating access behind an `apiVersion === 1` / `hasCapability('catalog.read')` negotiation, defensively narrowing an untrusted `unknown` foreign plugin object, and purely translating TaskNotes' statuses, priorities, task records, RRULE recurrence, and wikilink references into Project Manager's native `types.ts` model (`makeTask`, palette upserts, `buildImportForest`). This is exactly the kind of quarantined-seam logic — foreign API assumptions, field semantics, non-destructive palette merge rules, cycle-safe forest construction — whose intent is invisible in the code itself. Today anyone touching the import flow (`settings.ts`, `ImportModal.ts`) or reasoning about how the two plugins interoperate has to reconstruct the design, the boundary rules, and the "strictly optional / degrade to null" contract by reading `tasknotes.ts` and `tasknotesImport.ts` line by line. That reconstruction cost recurs on every change to the seam and every question about what the interop is and is not allowed to do, which is why it is worth closing now with this adoption pass — before the next change to the boundary is made without a spec to anchor it.

## Desired Outcome

The TaskNotes Interop slice is now described by a LOCKED Architecture Element that names its boundary, responsibilities, and constraints, so any future Intent that touches `src/integrations/**` must link against it and reason about the change within the seam the AE defines.

## Non-Goals

- This Intent makes no code change.
- It does not retroactively spec every other subsystem — sibling Intents cover those in the same adoption pass.

## Type-specific required fields

### `documentation` — Coverage-Gap

**Coverage-Gap:** No AE, WS, IC, or Intent covered `src/integrations/**` prior to this Intent (confirmed via `dekspec dev archeology coverage`, run 2026-07-16 against commit 511ec7b). This Intent closes that gap.

## Components affected

- `src/integrations/**`

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
| 2026-07-16 | Substantive | Retroactive adoption: Intent authored and locked directly against the current (already-shipped, CI-green) state of `src/integrations/**` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted adoption Intents stay mutable while we work in this repo. | 60890286+jeffhaskin@users.noreply.github.com |
| 2026-07-16 | Substantive | retroactive-adoption intent; describes shipped subsystem; locked at engineer direction, reversible via --unlock | Claude (engineer-directed) |
