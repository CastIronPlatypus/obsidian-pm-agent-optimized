# Working Spec: Bidirectional file/folder rename sync

## Status

ACCEPTED

## Created

2026-07-16

## Modified

2026-07-16

## Related Architecture Elements

- AE-001: Task & Project Persistence Store — measures the store's new rename boundary: mapping an inbound vault rename (old path → loaded item) onto a name update, renaming an item's file/folder through the vault API on an outbound change, marking those outbound renames self-write, and re-binding tasks when a `<Name>_tasks` folder is renamed.
- AE-006: Plugin Entry, Settings & Lifecycle — constrains a plugin-level (composition-root) `vault.on('rename')` registration so file-explorer renames are caught even when no `ProjectView` is open.
- AE-012: Project/Dashboard View Orchestration — constrains the view-owned `rename` listener resolving old→new path to the loaded item and driving an in-place refresh rather than a "not found" reload, still skipping self-writes via `consumeSelfWrite`.

## Governing ADRs

- none

## What This Does

Renaming an item's backing file or folder — a project folder, a task file, or a milestone file (a task file whose frontmatter `type` is `milestone`) — through Obsidian updates that item's name in memory and in its persisted title. Renaming any of those items inside the plugin renames its backing file/folder through the vault API. The two directions stay consistent for projects, tasks, and milestones; plugin-initiated renames are marked self-write so the resulting vault event does not re-trigger a second rename or write (no echo loop); and renaming a `<Name>_tasks` folder leaves its tasks attached to their project.

**Mechanism:** This component resolves an inbound vault `rename` event's old path to the loaded item and updates its name, renames the backing file/folder through the vault API on an outbound name edit (marked via `markSelfWrite`), and re-binds a project's tasks after its `<Name>_tasks` folder is renamed.

## What This Does NOT Do

- **Graph consistency:** Does not rename or relocate the top-level `Projects/` folder or handle a vault-root move.
- Does not change the on-disk storage layout; it only keeps names in sync within it.
- Does not resolve concurrent/external rename conflicts beyond the existing self-write window.
- Does not add a new rename UI affordance; it wires existing name-edit paths and the vault `rename` event.

## Interfaces

### Data Interfaces

| Interface | Direction | Type / Shape / Dtype | Source or Consumer | Guarantees |
|-----------|-----------|----------------------|--------------------|------------|
| Inbound vault `rename` event | in | `{oldPath, file}` | Obsidian vault | old path resolves to the loaded item; name updated in memory + persisted title |
| Outbound rename | out | vault `FileManager`/`Vault` rename | backing file/folder | file/folder exists at new path, nothing at old; marked self-write |
| `<Name>_tasks` folder rename | in/out | folder rename | project tasks | tasks stay attached to their project |

### Dependencies

| Dependency | Interface | Failure behavior |
|------------|-----------|-----------------|
| Self-write tracking (`markSelfWrite`/`consumeSelfWrite`) | echo suppression | outbound rename event is consumed, not re-processed |
| Obsidian `vault.on('rename')` | plugin-level registration | rename caught even with no `ProjectView` open |

## Domain Constraints

| Constraint | Value | Scope | Rationale |
|------------|-------|-------|-----------|
| Do not touch | on-disk storage layout | all-IBs | Non-goal per INT-015 |
| Write path | outbound rename marked via `markSelfWrite` | all-IBs | echo-loop suppression (R14) |

## Business Rules

1. **general** A vault `rename` event maps the old path to the loaded item and updates its name in memory and persisted title. (R12)
2. **general** Renaming a loaded item via the plugin renames its backing file/folder: the folder exists at the new path and nothing remains at the old. (R13)
3. **general** A plugin-initiated rename is marked self-write so no second rename/write fires. (R14)
4. **general** Renaming a `<Name>_tasks` folder keeps its tasks attached to their project. (R15)

## Failure Behavior

| Failure | Detection | Assertion type | Behavior | Recovery |
|---------|-----------|---------------|----------|----------|
| Inbound rename to a path with no loaded item | old-path lookup miss | assert | The rename event is ignored because its old path resolves to no loaded project/task, so unrelated vault renames elsewhere never mutate plugin state or trigger a spurious refresh. | none needed |
| Outbound rename target collides with an existing file | vault rename error | raise | surface the error; name not changed | user resolves the collision |

## Open Issues

- none

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | WS authored at ACCEPTED under INT-015 `--decompose` (acceptance criteria = R12–R15 in `src/intention.test.ts`). Milestone treated as a task file with `type: milestone` (layout unchanged). | Claude (engineer-directed) |
