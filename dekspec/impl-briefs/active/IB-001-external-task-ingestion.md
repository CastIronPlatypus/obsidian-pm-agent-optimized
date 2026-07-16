# Implementation Brief: External task-file ingestion with ID backfill

**Spec:** `dekspec/working-specs/WS-001-external-task-ingestion.md`
**Intent:** `dekspec/intents/INT-013-external-task-ingestion.md`
**Source AEs:** AE-001, AE-006
**Depends on:** none
**Production gate:** none
**Status:** ACCEPTED

## Goal

The store recognizes a well-formed `pm-task` file dropped into a project's `<Name>_tasks/` folder, backfills missing required frontmatter (unique `id` first, blank fields → defaults) to disk as a self-write, and wires it into project/parent ordering so it appears in all three views — proven green by R1–R7 in `src/intention.test.ts`.

## Out of Scope

- New authoring/editing UI for external files — visibility only.
- Ingesting loose `pm-task` files outside a recognized `<Name>_tasks/` folder.
- Any change to on-disk layout, frontmatter schema, or the YAML parser.
- Concurrent same-file edit reconciliation beyond the existing self-write window.

## Files to Modify

| File | Change |
|------|--------|
| `src/store/ProjectStore.ts` | Add ingestion path: detect foreign `pm-task` file under a loaded project's tasks folder, backfill missing frontmatter (`id` + defaults) via `processFrontMatter` marked with `markSelfWrite`, insert into tree + `taskIds`/`subtaskIds`. |
| `src/store/YamlHydrator.ts` (or `YamlParser.ts`) | Resolve blank required fields to type defaults during ingestion. |
| `src/main.ts` | Route vault `create`/`modify` events for files under a project tasks folder into the store's ingestion entry point. |
| `src/intention.test.ts` | (Owned by test worker — not modified here; R1–R7 are the acceptance oracle.) |

## Reuse Inventory

| Capability | Location | Use instead of reimplementing |
|------------|----------|-------------------------------|
| Frontmatter write + self-write marking | `src/store/ProjectStore.ts` (`processFrontMatter`, `markSelfWrite`/`consumeSelfWrite`) | do not rebuild a write/echo-suppression path |
| YAML parse + hydration | `src/store/YamlParser.ts`, `src/store/YamlHydrator.ts` | reuse existing parse/default resolution |
| Task index insert + ordering | `src/store/TaskIndex.ts`, `src/store/TaskTreeOps.ts` | reuse tree/index mutators |

## Domain Constraints

| Constraint | Value |
|------------|-------|
| Write path | `processFrontMatter` marked via `markSelfWrite` |
| Do not touch | on-disk file layout + YAML schema |

## Do Not Touch

| Function/File | Reason |
|---------------|--------|
| YAML frontmatter schema / parser accepted shapes | Non-goal — ingestion consumes existing format |
| `src/intention.test.ts` | Owned by the parallel test worker |

## Governing ADRs

| ADR | Title |
|-----|-------|
| none | — |

## Constraints & Decisions

- **Detection scope:** Only files whose resolved path sits under a loaded project's `<Name>_tasks/` folder are ingestion candidates; loose files elsewhere are ignored.
- **Backfill order:** Assign a unique `id` first (checked against the project task index), then fill remaining required fields; blank fields resolve to their type defaults.
- **Self-write discipline:** Every backfill write marks the path via `markSelfWrite` so the resulting vault event is consumed, not re-ingested.
- **Malformed tolerance:** A candidate file that fails `pm-task` parsing is skipped; the load path must not throw.
- **Ordering:** Insert the ingested task into `taskIds` (top-level) or the parent's `subtaskIds` so it renders in Table/Gantt/Kanban.

## Test Promotion Criteria

Promotion refs: WS-001 Rules 1–6 (R1–R7 in `src/intention.test.ts`).

## Done When

- [ ] A foreign well-formed `pm-task` file is detected and loaded (R1, R2) — verified by intention test.
- [ ] A blank/absent `id` is backfilled to a unique value on disk (R3) — verified by intention test.
- [ ] Blank required fields resolve to defaults (R4) — verified by intention test.
- [ ] Ingested task appears in `taskIds` and the Table view (R5) — verified by intention test.
- [ ] A malformed file is left untouched and does not crash the load (R6) — verified by intention test.
- [ ] A store backfill write is not re-ingested (R7) — verified by intention test.
- [ ] All pre-existing tests continue to pass — verified by full `pnpm test` run.

## Open Issues

None — no open issues.

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | IB authored at ACCEPTED under INT-013 `--decompose`. No dekbeads CLI present — bead-level work captured as the Done When task list above. | Claude (engineer-directed) |
