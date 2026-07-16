# Working Spec: External task-file ingestion with ID backfill

## Status

ACCEPTED

## Created

2026-07-16

## Modified

2026-07-16

## Related Architecture Elements

- AE-001: Task & Project Persistence Store — measures the store's new responsibility to recognize foreign `pm-task` files under a project's `<Name>_tasks/` folder, backfill required frontmatter (id first) to disk, and wire them into ordering.
- AE-006: Plugin Entry, Settings & Lifecycle — constrains the vault `create`/`modify` event wiring that routes qualifying file events into the ingestion path within the self-write-suppression window.

## Governing ADRs

- none

## What This Does

When a well-formed `pm-task` Markdown file appears under a recognized project's `<Name>_tasks/` folder — created or modified outside the plugin — the store detects it, backfills whatever required frontmatter is missing (a unique `id` first, then other required fields, blank fields resolving to defaults) by writing those values back into the file on disk, and wires the task into the project's `taskIds` / parent `subtaskIds` ordering so it appears in the Table, Gantt, and Kanban views without the user re-creating it through the UI.

**Mechanism:** This component detects a foreign `pm-task` file at the vault `create`/`modify` boundary and backfills its missing frontmatter through `processFrontMatter` (marked as a self-write) before inserting it into the in-memory project tree and its persisted ordering.

## What This Does NOT Do

- **Graph consistency:** Does not ingest loose `pm-task` files that sit outside a recognized project's `<Name>_tasks/` folder.
- Does not add any new authoring/editing UI for external files; visibility only.
- Does not extend the frontmatter schema or the YAML parser's accepted shapes; ingestion consumes the existing format.
- Does not resolve concurrent plugin-and-agent edits of the same task file beyond the existing self-write window.

## Interfaces

### Data Interfaces

| Interface | Direction | Type / Shape / Dtype | Source or Consumer | Guarantees |
|-----------|-----------|----------------------|--------------------|------------|
| Foreign `pm-task` file event | in | `TAbstractFile` path under `<Name>_tasks/` | Obsidian vault `create`/`modify` | path resolves under a loaded project's tasks folder |
| Backfilled task frontmatter | out | YAML frontmatter (`id`, required fields) | task `.md` file on disk | `id` unique within project; blank fields → defaults; path marked self-write |
| Ingested `Task` | out | in-memory `Task` | project tree + `taskIds`/`subtaskIds` | task appears in all three views |

### Dependencies

| Dependency | Interface | Failure behavior |
|------------|-----------|-----------------|
| Obsidian `Vault.process` / `processFrontMatter` | frontmatter write | malformed frontmatter file is skipped, not written |
| Self-write tracking (`markSelfWrite`/`consumeSelfWrite`) | echo suppression | store's own backfill write is not re-ingested |

## Domain Constraints

| Constraint | Value | Scope | Rationale |
|------------|-------|-------|-----------|
| Do not touch | on-disk file layout + YAML schema — reason: ingestion consumes existing format only | all-IBs | Non-goal per INT-013 |
| Write path | `processFrontMatter` marked via `markSelfWrite` | all-IBs | echo-loop suppression |

## Business Rules

1. **general** A `pm-task` file appearing under a loaded project's `<Name>_tasks/` folder with a blank/absent `id` is assigned a unique `id` written back to the file on disk. (R3)
2. **general** Required frontmatter fields left blank resolve to their type defaults on ingestion. (R4)
3. **general** An ingested task is inserted into the project's `taskIds` (or parent `subtaskIds`) ordering and becomes visible in the Table view. (R5)
4. **general** A file with malformed frontmatter is left untouched and does not crash the load. (R6)
5. **general** A backfill write performed by the store is not re-ingested as a new external addition. (R7)
6. **general** A foreign well-formed `pm-task` file is detected and loaded into the in-memory tree. (R1, R2)

## Failure Behavior

| Failure | Detection | Assertion type | Behavior | Recovery |
|---------|-----------|---------------|----------|----------|
| Malformed frontmatter in candidate file | parse returns no valid `pm-task` marker | assert | The candidate file is skipped and left untouched on disk, and the load path continues so one malformed file never aborts loading the rest of the project's tasks. | user fixes frontmatter; next event re-evaluates |
| Duplicate `id` collision on backfill | id-index lookup hit | assert | allocate a fresh unique id | none needed |

## Open Issues

- none

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | WS authored at ACCEPTED under INT-013 `--decompose` (acceptance criteria = R1–R7 in `src/intention.test.ts`). | Claude (engineer-directed) |
