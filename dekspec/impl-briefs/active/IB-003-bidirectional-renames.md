# Implementation Brief: Bidirectional file/folder rename sync

**Spec:** `dekspec/working-specs/WS-003-bidirectional-renames.md`
**Intent:** `dekspec/intents/INT-015-bidirectional-renames.md`
**Source AEs:** AE-001, AE-006, AE-012
**Depends on:** none
**Production gate:** none
**Status:** ACCEPTED

## Goal

An inbound vault rename maps old→new path to the loaded item and updates its name (memory + persisted title); an in-plugin rename renames the backing file/folder through the vault API marked self-write (no echo); and renaming a `<Name>_tasks` folder keeps tasks attached — proven green by R12–R15 in `src/intention.test.ts`.

## Out of Scope

- Renaming/relocating the top-level `Projects/` folder or a vault-root move.
- Any change to the on-disk storage layout.
- Concurrent/external rename conflict resolution beyond the self-write window.
- A new rename UI affordance.

## Files to Modify

| File | Change |
|------|--------|
| `src/store/ProjectStore.ts` | Inbound: map vault `rename` (old→new path) to the loaded item + update name in memory and persisted title. Outbound: rename backing file/folder via `FileManager`/`Vault`, marked `markSelfWrite`. Re-bind tasks on `<Name>_tasks` folder rename. |
| `src/main.ts` | Register a plugin-level `vault.on('rename')` so file-explorer renames are caught with no `ProjectView` open. |
| `src/views/ProjectView.ts` (and Dashboard) | Resolve a `rename` event old→new to the loaded item and drive an in-place refresh instead of a "not found" reload; skip self-writes via `consumeSelfWrite`. |
| `src/intention.test.ts` | (Owned by test worker — not modified here; R12–R15 are the acceptance oracle.) |

## Reuse Inventory

| Capability | Location | Use instead of reimplementing |
|------------|----------|-------------------------------|
| Self-write marking + consume | `src/store/ProjectStore.ts` (`markSelfWrite`/`consumeSelfWrite`) | do not rebuild echo suppression |
| Task index / re-parenting | `src/store/TaskIndex.ts`, `src/store/TaskTreeOps.ts` | reuse for re-binding tasks after folder rename |
| Vault rename API | Obsidian `FileManager.renameFile` / `Vault` | reuse; do not hand-roll path moves |

## Domain Constraints

| Constraint | Value |
|------------|-------|
| Write path | outbound rename marked via `markSelfWrite` |
| Do not touch | on-disk storage layout |

## Do Not Touch

| Function/File | Reason |
|---------------|--------|
| On-disk storage layout | Non-goal — keep layout, sync names only |
| `src/intention.test.ts` | Owned by the parallel test worker |

## Governing ADRs

| ADR | Title |
|-----|-------|
| none | — |

## Constraints & Decisions

- **Inbound mapping:** A vault `rename` event's old path is looked up against the loaded item set; on a hit, update the item's name in memory and its persisted title (R12).
- **Outbound rename:** An in-plugin name edit renames the backing file/folder through the vault API; the folder exists at the new path and nothing remains at the old (R13).
- **Self-write discipline:** Every outbound rename marks the path via `markSelfWrite`; the resulting vault event is consumed, not re-processed — no echo loop (R14).
- **Milestone parity:** A milestone is a task file with frontmatter `type: milestone`; it renames exactly as any task file — no milestone-specific path.
- **Folder/file pair ordering:** On a project rename, rename the `Projects/<Name>.md` file, then its `<Name>_tasks` folder, both marked self-write within one suppression window, so tasks stay attached (R15).
- **Registration:** A plugin-level `vault.on('rename')` catches renames even when no `ProjectView` for the affected project is open.

## Test Promotion Criteria

Promotion refs: WS-003 Rules 1–4 (R12–R15 in `src/intention.test.ts`).

## Done When

- [ ] A vault `rename` event updates the loaded item's name in memory + persisted title (R12) — verified by intention test.
- [ ] An in-plugin rename moves the backing folder to the new path with nothing left at the old (R13) — verified by intention test.
- [ ] A plugin-initiated rename is marked self-write; no second rename/write fires (R14) — verified by intention test.
- [ ] Renaming a `<Name>_tasks` folder keeps its tasks attached (R15) — verified by intention test.
- [ ] All pre-existing tests continue to pass — verified by full `pnpm test` run.

## Open Issues

None — no open issues.

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | IB authored at ACCEPTED under INT-015 `--decompose`. No dekbeads CLI present — bead-level work captured as the Done When task list above. | Claude (engineer-directed) |
