# Working Spec: Agent-authored ID authority on cold load

## Status

ACCEPTED

## Created

2026-07-16

## Modified

2026-07-16

## Related Architecture Elements

- AE-001: Task & Project Persistence Store — measures how the store's cold folder-load path mints a blank id, dedupes duplicate ids (keep-first / re-mint collider), and normalizes/re-mints an invalid id, persisting each change back to the file and marking it as a self-write.
- AE-006: Plugin Entry, Settings & Lifecycle — measures that a re-minted duplicate/invalid id is surfaced to the user through the plugin's notification lifecycle (a `Notice` warning) rather than dropped silently.

## Governing ADRs

- none

## What This Does

On the COLD folder-load path (a project opened on plugin start or leaf-restore, not the live create/modify ingest path), the store takes authority over every task's `id` so an AI agent can author a whole project as Markdown files and have it load losslessly and stably. A blank/absent id is minted; two files that share an id both survive (the first-loaded is kept, the collider is re-minted); an id outside the pinned safe rule (`^[A-Za-z0-9._-]{1,64}$`) is normalized or re-minted. Every mint/re-mint is persisted back into the file's frontmatter and `markSelfWrite`-marked so the resulting modify event is not re-ingested (no echo). A re-mint keeps parent/child nesting intact, and a duplicate/invalid id that is re-minted is surfaced via a notifier warning. Association stays folder-based and the minted-id format is unchanged.

**Mechanism:** A shared id-authority helper decides, per loaded task, whether the raw id is usable (present, valid by the rule, and not already claimed by an earlier task in the same load) or must be minted/re-minted; `loadTasksFromFolder` applies it while building the task map (keep-first), persists a changed id via `processFrontMatter` after `markSelfWrite`, and raises a `Notice` when a collision/invalid id forced a re-mint; nesting resolution (subtaskIds / parentId self-heal) runs against the post-authority ids so a re-minted parent still anchors its children.

## What This Does NOT Do

- **Association model:** Does not change task↔project association — a file under `<Name>_tasks/` still belongs to that project; ids are not used for association.
- Does not change the minted-id format (`makeId`) or force any id scheme on the agent.
- Does not run an up-front migration that rewrites every existing file; id repair is applied as each project is loaded.
- Does not add a new public store method — the behavior lives inside the existing `loadProject` / `loadTasksFromFolder` surface plus a private helper.
- Does not alter the live `ingestExternalTask` mint/validate behavior beyond sharing the id-authority helper (INT-013 / INT-017 contracts preserved).

## Interfaces

### Data Interfaces

| Interface | Direction | Type / Shape / Dtype | Source or Consumer | Guarantees |
|-----------|-----------|----------------------|--------------------|------------|
| Task `id` (cold load) | in / out | string | task `.md` frontmatter | blank → minted; duplicate → keep-first, collider re-minted; invalid (fails `^[A-Za-z0-9._-]{1,64}$`) → normalized/re-minted; change persisted + self-write-marked |
| Task `parentId` (cold load) | in / out | string | task `.md` frontmatter | re-mint preserves nesting; a re-minted parent still anchors its children |
| Re-mint warning | out | user notification | plugin notifier (`Notice`) | a duplicate/invalid id that forced a re-mint is surfaced, never silently dropped |

### Dependencies

| Dependency | Interface | Failure behavior |
|------------|-----------|-----------------|
| `makeId` | minted-id source | reused unchanged for blank/collider/invalid re-mints |
| Self-write suppression | `markSelfWrite` on the repaired task path | a load-time id-repair write must not echo back through the ingest listeners |
| `processFrontMatter` | persist the repaired id | the mint/re-mint is written back so the id is stable across reloads |
| Nesting resolution (subtaskIds / parentId self-heal in `loadTasksFromFolder`) | runs on post-authority ids | a re-minted parent still anchors its children |

## Domain Constraints

| Constraint | Value | Scope | Rationale |
|------------|-------|-------|-----------|
| Id-validity rule | `^[A-Za-z0-9._-]{1,64}$` | all-IBs | ids flow into slugs/filenames; the charset must be filename-safe and bounded (R32) |
| Collision policy | keep-first, re-mint the collider (persisted), warn | all-IBs | deterministic; never re-mint a stable id others reference; no silent drop (R30) |
| Do not touch | folder-based association; `makeId` format | all-IBs | Non-goals per INT-018 |
| Preserve | parent/child nesting across a re-mint | all-IBs | agent-authored structures stay intact (R31) |

## Business Rules

1. **general** On cold folder-load, a task with a blank/absent id gets a minted, non-empty id, persisted back to the file's frontmatter and `markSelfWrite`-marked. (R29)
2. **general** Two files sharing an id both survive load: the first-loaded keeps the id, the collider is re-minted to a distinct id (persisted); the tree contains both tasks. (R30)
3. **general** A parentId-referenced child authored with a blank id is minted while remaining nested under its parent, and its persisted `parentId` still resolves to the parent. (R31)
4. **general** An id that fails `^[A-Za-z0-9._-]{1,64}$` (path separators, oversized, etc.) is normalized or re-minted — never used verbatim as a slug/filename — and load does not crash. (R32)
5. **general** A duplicate or invalid id that forced a re-mint is surfaced to the user via a notifier warning, not dropped silently. (R30, manual-check)

## Failure Behavior

| Failure | Detection | Assertion type | Behavior | Recovery |
|---------|-----------|---------------|----------|----------|
| Two agent-authored files share an id | second task's id already claimed in the load's task map | assert | Keep the first, re-mint the collider (persisted), warn; both tasks survive in the tree | user reconciles the ids if the duplication was unintended |
| A task carries a blank/absent id | id missing or empty after hydration | assert | Mint a new id, persist it, self-write-mark the repair | none needed |
| A task carries an id that fails the safety rule | id fails `^[A-Za-z0-9._-]{1,64}$` | assert | Normalize or re-mint to a safe id (persisted, warned); load never crashes | user reconciles the id if a specific value was intended |

## Open Issues

- none

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | WS authored at ACCEPTED under INT-018 `--decompose` (acceptance criteria = R29–R32 in `src/intention.test.ts`). Id-validity rule (`^[A-Za-z0-9._-]{1,64}$`) and keep-first/re-mint collision policy pinned from the Intent. | Claude (INT-018 spec worker, engineer-directed) |
