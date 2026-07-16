# Implementation Brief: Agent-authored ID authority on cold load

**Spec:** `dekspec/working-specs/WS-006-agent-authored-id-authority.md`
**Intent:** `dekspec/intents/INT-018-agent-authored-id-authority.md`
**Source AEs:** AE-001, AE-006
**Depends on:** none
**Production gate:** none
**Status:** ACCEPTED

## Goal

The COLD folder-load path takes authority over every task's `id`: a blank/absent id is minted; two files sharing an id both survive (keep-first, re-mint the collider); an id failing `^[A-Za-z0-9._-]{1,64}$` is normalized or re-minted. Each change is persisted via `processFrontMatter` and `markSelfWrite`-marked (no echo), a re-mint preserves parent/child nesting, and a re-mint that touched agent-authored data is surfaced via a notifier warning — proven green by R29–R32 in `src/intention.test.ts`, with the live `ingestExternalTask` path sharing the same id-authority helper.

## Out of Scope

- Any change to task↔project association (stays folder-based) or to the `makeId` format.
- An up-front migration that rewrites every existing file (id repair is applied as each project loads).
- A new public store method — the behavior lives inside `loadProject` / `loadTasksFromFolder` plus a private helper.
- Changing the live `ingestExternalTask` mint/validate contract beyond sharing the helper (INT-013 / INT-017 preserved).

## Files to Modify

| File | Change |
|------|--------|
| `src/store/YamlHydrator.ts` | Stop letting a blank `id` become `undefined`/`''`: in `mapRawToTask`, do not force `id` from `r.id` when it is absent/blank (let `makeTask`'s `makeId()` default stand), or expose the raw id so the store's id-authority pass can decide. Keep container-copy semantics unchanged. |
| `src/store/ProjectStore.ts` | Add a private id-authority helper (mint blank; validate against `^[A-Za-z0-9._-]{1,64}$`; keep-first dedup against the current load's task map). Apply it in `loadTasksFromFolder` while populating `taskMap` (before the `taskMap.set(task.id, task)` at ~L440), so a duplicate/invalid/blank id is resolved before it is used as a key or for nesting. Persist a changed id via `markSelfWrite(path)` + `processFrontMatter` (mirror `ingestExternalTask`'s discipline). Raise a `Notice` warning when a collision/invalid id forced a re-mint. Have `ingestExternalTask` reuse the same helper. |
| `src/store/TaskIndex.ts` | Ensure `buildTaskIndex` / `indexAddSubtree` are fed post-authority (de-duplicated) ids so the index never last-wins over a collision. No signature change expected; verify the map is keyed by the authoritative id. |
| `src/types.ts` | If a shared id-validity predicate/constant is exported for reuse, add it here (e.g. `ID_PATTERN`); otherwise no change beyond reusing `makeId`. |
| `src/intention.test.ts` | (Owned by the test worker — not modified here; R29–R32 are the acceptance oracle.) |

## Reuse Inventory

| Capability | Location | Use instead of reimplementing |
|------------|----------|-------------------------------|
| Minted-id source | `src/types.ts` (`makeId`) | reuse for blank/collider/invalid re-mints — do not invent a new format |
| Backfill-persist discipline (self-write + processFrontMatter) | `src/store/ProjectStore.ts` (`ingestExternalTask`, `markSelfWrite`) | mirror it for the cold-load id repair |
| Nesting resolution (subtaskIds / parentId self-heal) | `src/store/ProjectStore.ts` (`loadTasksFromFolder`) | run against post-authority ids; do not rewrite the self-heal |
| Task hydration + container copy | `src/store/YamlHydrator.ts` (`mapRawToTask`, `hydrateTaskFromFile`) | reuse; only the id-defaulting behavior changes |
| User notification | `Notice` (already used in `ProjectStore`) / AE-006 lifecycle | reuse for the re-mint warning |

## Domain Constraints

| Constraint | Value |
|------------|-------|
| Id-validity rule | `^[A-Za-z0-9._-]{1,64}$` |
| Collision policy | keep-first, re-mint the collider (persisted), warn |
| Do not touch | folder-based association; `makeId` format |
| Preserve | parent/child nesting across a re-mint |

## Do Not Touch

| Function/File | Reason |
|---------------|--------|
| Folder-based association logic (`projectTaskFolder`, ordering via `taskIds`/`subtaskIds`) | Non-goal per INT-018 — ids are not used for association |
| `makeId` format | Non-goal — the minted-id format is unchanged |
| Live `ingestExternalTask` mint/validate contract (R3, R4, R7, R24) | Preserve INT-013 / INT-017 behavior; only share the new helper |
| `src/intention.test.ts` | Owned by the parallel test worker (R29–R32 oracle) |

## Governing ADRs

| ADR | Title |
|-----|-------|
| none | — |

## Constraints & Decisions

- **Uniform mint:** Blank-id minting must run on the cold folder-load path, not only in `ingestExternalTask`. The root cause is `mapRawToTask` forcing `id: r.id` combined with `makeTask` spreading overrides after its `makeId()` default; the fix must ensure a blank/absent id resolves to a minted id.
- **Keep-first dedup:** When a task's id is already claimed by an earlier task in the same load, re-mint the later one (the collider), not the first — so a stable id other files reference is not disturbed. Both tasks survive; neither is dropped from `taskMap` / the index.
- **Validate before use:** An id failing `^[A-Za-z0-9._-]{1,64}$` is treated like a collision (normalize or re-mint) *before* it is used as a map key, a slug, or a filename; load never crashes on an invalid id.
- **Persist + suppress:** Every mint/re-mint is written back via `processFrontMatter` after `markSelfWrite(path)`, so the id is stable across reloads and the repair write does not echo through the ingest listeners.
- **Nesting-safe:** Nesting resolution runs on post-authority ids; a re-minted parent still anchors its children, and a re-minted/minted child stays under its parent with a persisted `parentId` that resolves.
- **Surface, don't drop:** A duplicate/invalid id that forced a re-mint raises a `Notice` warning (AE-006 lifecycle), so a collision touching agent-authored data is visible.

## Test Promotion Criteria

Promotion refs: WS-006 Rules 1–5 (R29–R32 in `src/intention.test.ts`).

## Done When

- [ ] A cold-loaded task with a blank/absent id gains a minted, non-empty id in memory and on disk, and the repair write is self-write-marked (R29) — verified by intention test.
- [ ] Two files sharing an id both survive load — the first keeps the id, the collider is re-minted to a distinct id (persisted on disk), and both appear in the tree (R30) — verified by intention test.
- [ ] A parentId-referenced child with a blank id is minted while staying nested under its parent, and its persisted `parentId` still resolves (R31) — verified by intention test.
- [ ] A path-separator or oversized id is normalized/re-minted (satisfying `^[A-Za-z0-9._-]{1,64}$` in memory and on disk) and load does not crash (R32) — verified by intention test.
- [ ] A re-minted duplicate/invalid id raises a notifier warning (manual-check, not probed by the test).
- [ ] The live `ingestExternalTask` contracts (R3, R4, R7, R24) and all other pre-existing tests continue to pass; `pnpm check` / `pnpm check:submission` / `pnpm build` stay green — verified by full oracle run.

## Open Issues

None — no open issues.

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | IB authored at ACCEPTED under INT-018 `--decompose`. No dekbeads CLI present — bead-level work captured as the Done When task list above. Id-validity rule (`^[A-Za-z0-9._-]{1,64}$`), keep-first/re-mint collision policy, and the notifier-warning surface carried from the Intent/WS. | Claude (INT-018 spec worker, engineer-directed) |
