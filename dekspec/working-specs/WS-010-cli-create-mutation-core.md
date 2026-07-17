# Working Spec: `pm` CLI — create + single-item mutation core

## Status

ACCEPTED

## Created

2026-07-16

## Modified

2026-07-16

## Related Architecture Elements

- AE-013: Agent-first `pm` CLI — the mutation phase: `new` verbs, `set`/`status`/`assign`/`due`/`rename`, `mv`/`mv project`, `archive`/`unarchive`, `rm`, `dup`, `--dry-run`, and the pre-flight conflict check.
- AE-001: Task & Project Persistence Store — reused UNMODIFIED; every mutation delegates to `createProject`/`insertTask`/`updateTask`/`moveTask`/`moveProject`/`renameProject`/`archiveTask`/`unarchiveTask`/`duplicateTask`/`deleteTask`, gated by `findTaskFileConflict`.

## Governing ADRs

- none

## What This Does

Ships the create and single-item mutation surface. Creation (`new project|task|subtask|milestone`) builds the `Task` with `makeTask(overrides)` (so `makeId`, today's `start`, `progress:0`, and timestamps match the UI) and calls `insertTask(project, task, parentId?)`; the store does auto-placement into the INT-020 nested layout, appends the id to the parent's `subtaskIds` (or the project's `taskIds`), stamps completion for a terminal initial status, and writes the INT-021 sentinel backlink. `new project` calls `createProject(title, dir)`. Mutation: `set <handle> field=value…` is the general patch verb (values coerced against the field type from `pm schema` — numbers, `YYYY-MM-DD` dates, arrays via repeated keys / comma lists / `dependencies=id`, `customFields.<id>=…`) handed to `updateTask`; `status`/`assign`/`due` are convenience wrappers; `rename` is bidirectional by entity kind (task → `updateTask({title})`; project → `renameProject`); `mv <handle> --parent <id>` → `moveTask`; `mv project <handle> --dir <path>` → `moveProject`; `archive`/`unarchive`/`dup`/`rm` delegate to their store methods (`rm` → trash, reversible). Every mutation returns the affected id(s) in `changed_ids` + the freshly minted id/filePath in `data`, honors `--dry-run` (compute + report, write nothing) and `--explain`, and pre-flights `findTaskFileConflict` (→ `E_CONFLICT`, exit 8).

**Mechanism:** This component maps create/mutate verbs onto the store's tested mutators, returning minted ids + `changed_ids` in the envelope and computing-without-writing under `--dry-run`.

## What This Does NOT Do

- Does not compute the dependency schedule itself — the post-mutation `scheduleAfterChange` pass + cascade reporting live in WS-011.
- Does not implement `depend`/`undepend` cycle guarding (WS-011) or `apply`/`batch` (WS-012).
- Does not modify `src/store/**`.
- Does not hard-delete — `rm` routes to Obsidian trash.

## Interfaces

### Data Interfaces

| Interface | Direction | Type / Shape / Dtype | Source or Consumer | Guarantees |
|-----------|-----------|----------------------|--------------------|------------|
| `new task --project X --parent Y --title …` | out | `data: { id, filePath, parentId }`, `changed_ids: [id]` | agent | mints the id, places the file in the INT-020 nested layout, wires `parentId` + the INT-021 backlink; returns the id for chaining (R42) |
| `new project --title … --dir …` | out | `data: { id, filePath }` | agent | `createProject(title, dir)`; `path: <dir>` persisted |
| `set <handle> field=value…` | out | `changed_ids: string[]`; `meta.dry_run` | agent | coerces `k=v` against the schema, delegates to `updateTask`; under `--dry-run` writes nothing (R45 dry-run half) |
| pre-flight conflict | out | `error.code = 'E_CONFLICT'` (exit 8) | agent | any create/rename calls `findTaskFileConflict` first; a collision is a clean error, not a partial write |

### Dependencies

| Dependency | Interface | Failure behavior |
|------------|-----------|-----------------|
| AE-001 `insertTask` | placement + wiring + backlink | inherits INT-020 layout + INT-021 backlink; the CLI supplies `Task` + `parentId` only |
| AE-001 `updateTask` | field patch | `patchNeedsBodyRewrite` + completion-stamping behave as the modal's whole-task save |
| AE-001 `findTaskFileConflict` | collision pre-check | returns a `TaskFileNameConflictError` → `E_CONFLICT` |
| WS-009 `PmContext` + envelope | dispatch + output | reuses the resolved store, handle resolution, and envelope |

## Domain Constraints

| Constraint | Value | Scope | Rationale |
|------------|-------|-------|-----------|
| Store unmodified | mutations delegate to store methods | all-IBs | no re-implemented invariant; INT-020/021 come for free |
| Return ids | every create/mutate returns `changed_ids` + minted id/filePath | all-IBs | agent chains without a second lookup (R42) |
| Dry-run writes nothing | `--dry-run` computes + reports only | all-IBs | safe planning; `meta.dry_run=true` |
| Reversible delete | `rm` → trash, `archive` → `Archive/` | all-IBs | no `fs.unlink` of user data |
| Conflict pre-flight | `findTaskFileConflict` before any create/rename | all-IBs | no partial write on a filename collision |

## Business Rules

1. **general** `new task --project X --parent Y --title …` mints an id, places the file in the INT-020 nested layout under the parent, wires `parentId` + the INT-021 backlink (via `insertTask`), and returns the id + filePath in the envelope's `data`/`changed_ids` (R42).
2. **general** `set <handle> field=value…` coerces `k=v` against the field type and delegates to `updateTask`; `--dry-run` computes + reports the would-be change and writes NOTHING, flagged `meta.dry_run=true` (R45 dry-run half).
3. **general** `rename` is bidirectional by entity kind (task → `updateTask({title})`; project → `renameProject`); reparent → `moveTask`; folder move → `moveProject`.
4. **general** Nothing hard-deletes: `rm` routes to Obsidian trash and `archive` moves to `Archive/` (both reversible).
5. **general** Any create/rename pre-flights `findTaskFileConflict`; a collision is `E_CONFLICT` (exit 8) with the offending path, never a partial write.

## Failure Behavior

| Failure | Detection | Assertion type | Behavior | Recovery |
|---------|-----------|---------------|----------|----------|
| Filename/title collision | `findTaskFileConflict` pre-check | assert | `E_CONFLICT` (exit 8), nothing written | caller renames |
| Bad field/value in `set` | schema coercion | assert | usage error (exit 2) naming the field | caller fixes the pair |
| Unknown project/parent handle | `resolveHandle` | assert | `E_NOT_FOUND` (exit 7) | caller fixes the ref |
| Save failure mid-write | store save-queue | log | the store re-merges its dirty snapshot for retry; surfaced in `warnings[]` | retry |

## Open Issues

- [ ] `--after`/`--before` sibling reordering on create (follow-up `reorderTask`) — designed-for, not gated by R41–R46. — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | WS authored at ACCEPTED under INT-019 `--decompose` (phase B; acceptance criteria = R42 and the `--dry-run` half of R45 in `cli/pm.test.ts`). | Claude (engineer-directed) |
