# Implementation Brief: `pm` CLI — create + single-item mutation core

**Spec:** `dekspec/working-specs/WS-010-cli-create-mutation-core.md`
**Intent:** `dekspec/intents/INT-019-agent-first-pm-cli.md`
**Source AEs:** AE-013, AE-001
**Depends on:** IB-009
**Production gate:** none
**Status:** ACCEPTED

## Goal

An agent creates and edits items headless through the store's tested mutators: `new task --project X --parent Y --title …` mints an id, places the file in the INT-020 nested layout, wires `parentId` + the INT-021 backlink, and returns the id in the envelope (R42); `set <id> field=value… --dry-run` computes + reports the change and writes nothing (the dry-run half of R45) — proven by R42 and R45's dry-run half in `cli/pm.test.ts`.

## Out of Scope

- The post-mutation `scheduleAfterChange` cascade + `depend` (WS-011); `apply`/`batch` (WS-012).
- Any change to `src/store/**`.
- Hard-delete — `rm` routes to trash.

## Files to Modify

| File | Change |
|------|--------|
| `cli/src/commands/create.ts` | New. `new project|task|subtask|milestone`: build the `Task` with `makeTask(overrides)` from field flags (`--status --priority --due --start --assignee --tag --estimate --desc`; `milestone` sets `type:'milestone'`), then `createProject(title, dir)` / `insertTask(project, task, parentId?)`. Return `data.{id,filePath,parentId}` + `changed_ids`. Pre-flight `findTaskFileConflict`. |
| `cli/src/commands/update.ts` | New. `set <handle> k=v…` (general patch → `updateTask`, coercing per the schema: numbers, `YYYY-MM-DD`, arrays via repeated keys / comma / `dependencies=id`, `customFields.<id>=…`); convenience `status`/`assign`/`due`; `rename` (task → `updateTask({title})`, project → `renameProject`); `mv --parent` → `moveTask`; `mv project --dir` → `moveProject`; `archive`/`unarchive`/`dup`/`rm`. Honor `--dry-run` (compute + report, `meta.dry_run=true`, write nothing) + `--explain`. |
| `cli/src/run.ts` | Extend the dispatch to route the create/mutation verbs (from IB-009's read-only dispatch). |
| `cli/src/coerce.ts` | New. `k=v` → typed `Partial<Task>` against `pm schema`; array/date/number/customFields coercion. |
| `cli/pm.test.ts` | (Owned by test worker — R42 + R45 dry-run half are the oracle.) |

## Reuse Inventory

| Capability | Location | Use instead of reimplementing |
|------------|----------|-------------------------------|
| Task construction + id mint + defaults | `makeTask` (`src/types.ts`) | reuse — never mint ids or stamp defaults in the CLI |
| Placement + wiring + backlink | `insertTask` (`src/store`) | reuse — INT-020 layout + INT-021 backlink come for free |
| Field patch + completion stamp + body-rewrite decision | `updateTask` (`src/store`) | reuse |
| Bidirectional rename / reparent / folder move | `renameProject`/`moveTask`/`moveProject` (`src/store`) | reuse |
| Conflict pre-check | `findTaskFileConflict` (`src/store`) | reuse before any create/rename |

## Domain Constraints

| Constraint | Value |
|------------|-------|
| Store unmodified | mutations delegate to store methods |
| Return ids | every create/mutate returns `changed_ids` + minted id/filePath |
| Dry-run writes nothing | `--dry-run` computes + reports only (`meta.dry_run=true`) |
| Reversible delete | `rm` → trash; `archive` → `Archive/` |
| Conflict pre-flight | `findTaskFileConflict` before any create/rename |

## Do Not Touch

| Function/File | Reason |
|---------------|--------|
| `src/store/**`, `src/types.ts` | store runs UNMODIFIED |
| The scheduler cascade | belongs to WS-011/IB-011 |
| `cli/pm.test.ts` | owned by the test worker |

## Governing ADRs

| ADR | Title |
|-----|-------|
| none | — |

## Constraints & Decisions

- **`set` is the general patch verb**; convenience verbs are thin wrappers.
- **Dry-run** computes against the in-memory tree and writes nothing; `meta.dry_run=true`.
- **Conflict + reversibility**: pre-flight `findTaskFileConflict` (`E_CONFLICT`, exit 8); `rm` → trash.

## Test plan

- **R42:** `new project`, then `new task --project P --parent parentId --title …`; assert the returned id (matches the id rule), the file at `<dir>/<Project>/<Project>_tasks/<slug>.md`, frontmatter `parentId` wired, and a `<!-- pm:link -->` backlink to the parent.
- **R45 (dry-run half):** `set <A> due=… --dry-run`; assert `meta.dry_run=true` and A's on-disk `due` unchanged.
- **Guard:** src-scoped `pnpm test` stays green.

## Test Promotion Criteria

Promotion refs: WS-010 Rule 1 (R42), Rule 2 (R45 dry-run half) in `cli/pm.test.ts`.

## Done When

- [ ] `new task --project X --parent Y` mints an id, places the file in the INT-020 nested layout, wires `parentId` + the INT-021 backlink, and returns the id (R42) — verified by intention test.
- [ ] `set … --dry-run` writes nothing and flags `meta.dry_run=true` (R45 dry-run half) — verified by intention test.
- [ ] `rename`/`mv`/`mv project`/`archive`/`rm` delegate to the matching store method; `rm` routes to trash — verified by manual check + src-scoped `pnpm test` green.
- [ ] Any create/rename pre-flights `findTaskFileConflict` (`E_CONFLICT`, exit 8) — verified by manual check.

## Open Issues

- [ ] `--after`/`--before` sibling reordering on create — designed-for, not gated by R41–R46. — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | IB authored at ACCEPTED under INT-019 `--decompose` (phase B). No dekbeads CLI present — bead-level work captured as the Done When task list. | Claude (engineer-directed) |
