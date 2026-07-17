# Working Spec: Project-folder restructure + legacy migration

## Status

ACCEPTED

## Created

2026-07-16

## Modified

2026-07-16

## Related Architecture Elements

- AE-001: Task & Project Persistence Store — measures the on-disk layout the store creates and resolves: a per-project folder containing the project note and a nested `<Name>_tasks/` folder, plus folder-level `moveProject` and nested-location ingestion/rename path-matching.
- AE-006: Plugin Entry, Settings & Lifecycle — constrains the migration-on-load pass that relocates legacy flat-layout projects into the nested layout, idempotently and content-preservingly.

## Governing ADRs

- none

## What This Does

Every project lives in its own folder. `createProject(title, dir)` creates a per-project folder `<dir>/<title>/` containing the project note `<dir>/<title>/<title>.md` and the nested tasks folder `<dir>/<title>/<title>_tasks/`. The `<Name>_tasks` folder keeps its name and only moves one level down. The `path` frontmatter key keeps its INT-014 meaning — the directory the project is filed under (which now CONTAINS the per-project folder) — and `projectDirectory(project)` resolves to it (blank/absent → the directory containing the per-project folder). Discovery still finds every `pm-project: true` file vault-wide. `moveProject(project, newDir)` relocates the whole per-project folder (note + `<Name>_tasks/` + freeform content) under `newDir`. Ingestion and rename path-matching resolve against the nested `<Name>_tasks/` location. On load, legacy flat-layout projects (`<dir>/<Name>.md` + sibling `<dir>/<Name>_tasks/`) are migrated to the nested layout via vault rename, preserving the note body + task association, idempotently and re-runnably.

**Mechanism:** This component creates and resolves a nested per-project-folder layout, migrates legacy flat-layout projects on load via vault rename, and moves the whole project folder on `moveProject`.

## What This Does NOT Do

- **Graph consistency:** Does not rename the `<Name>_tasks` folder — it keeps its name and only relocates one level down.
- Does not change task-file naming or the folder-based association semantics; no task-side `path` key.
- Does not change the meaning of the project `path` frontmatter key (still the directory the project is filed under).
- Does not change the per-task Archive / attachments layout relative to the tasks folder — those travel with `<Name>_tasks/`.

## Interfaces

### Data Interfaces

| Interface | Direction | Type / Shape / Dtype | Source or Consumer | Guarantees |
|-----------|-----------|----------------------|--------------------|------------|
| `createProject(title, dir)` nested layout | out | folder `<dir>/<title>/` + note `<dir>/<title>/<title>.md` + `<dir>/<title>/<title>_tasks/` | modal / command | note + tasks folder both inside the per-project folder; `path: <dir>` persisted; nothing at the old flat `<dir>/<title>.md` (R33) |
| Legacy migration on load | in→out | flat `<dir>/<Name>.md` + sibling `<dir>/<Name>_tasks/` → nested `<dir>/<Name>/…` | `discoverProjects` / load path | relocation via vault rename; note body + task association preserved; idempotent + re-runnable no-op when already nested (R34) |
| Nested task association | in | `pm-task` files under `<dir>/<Name>/<Name>_tasks/` | ingestion / cold load | folder-based association resolves against the nested tasks folder; tasks load into the tree (R35) |
| `moveProject(project, newDir)` folder move | in | new destination directory | existing-project settings modal | the WHOLE per-project folder (note + `<Name>_tasks/` incl. attachments + Archive + freeform content) moved under `newDir`; `path` frontmatter + `projectDirectory` updated; tasks stay attached; nothing left behind (R36) |
| `projectDirectory(project)` | out | vault-relative directory string | views / store | the directory containing the per-project folder; `path` when present, else the per-project folder's parent |

### Dependencies

| Dependency | Interface | Failure behavior |
|------------|-----------|-----------------|
| Obsidian `vault.rename` (recursive folder rename) | file/folder move | a target that already exists throws before any write (no partial move) |
| Obsidian `metadataCache` | frontmatter scan | files without `pm-project: true` are ignored by discovery |
| `vaultFs.ensureFolder` | intermediate folder creation | intermediate destination folders are auto-created |

## Domain Constraints

| Constraint | Value | Scope | Rationale |
|------------|-------|-------|-----------|
| Do not rename | the `<Name>_tasks` folder name | all-IBs | Non-goal per INT-020 — it only moves one level down |
| Do not change | folder-based association / task-file naming | all-IBs | Non-goal per INT-020 |
| Preserve | project-note body + task association across migration | all-IBs | migration is content-preserving (R34) |
| Idempotent | migration is a no-op when already nested | all-IBs | re-runnable safety (R34) |

## Business Rules

1. **general** `createProject(title, dir)` creates a per-project folder `<dir>/<title>/` with the note at `<dir>/<title>/<title>.md` and the nested tasks folder at `<dir>/<title>/<title>_tasks/`; nothing is written at the old flat `<dir>/<title>.md`. (R33)
2. **general** The project `path` frontmatter key stays the directory the project is filed under (the directory that contains the per-project folder), and `projectDirectory(project)` resolves to it; blank/absent `path` falls back to the directory containing the per-project folder. (R33)
3. **general** On load, a legacy flat-layout project (`<dir>/<Name>.md` + sibling `<dir>/<Name>_tasks/`) is migrated to the nested layout via vault rename, preserving the project-note body and the task association; nothing remains at the old flat locations. The migration is idempotent (no-op when already nested) and re-runnable. (R34)
4. **general** After the restructure/migration, tasks still associate with their project by folder membership and load into the tree from the nested `<Name>_tasks/` location. (R35)
5. **general** `moveProject(project, newDir)` relocates the WHOLE per-project folder — the note, the nested `<Name>_tasks/` (attachments + Archive included), and any free-form content inside the folder — under `newDir`, leaves nothing at the old location, and updates the project's `path` frontmatter and resolved `projectDirectory` to `newDir`. (R36)

## Failure Behavior

| Failure | Detection | Assertion type | Behavior | Recovery |
|---------|-----------|---------------|----------|----------|
| Migration target folder already occupied | vault rename error / pre-check | raise | surface the error; the project is left in its current (flat) layout — no partial move | user resolves the name collision |
| `moveProject` destination already exists | pre-check before any write | raise | throw before any write (no partial move) | user picks a free destination |
| Legacy project with no `path` key | absence of key | assert | The project's directory resolves to the directory containing its per-project folder (post-migration) or its note's parent folder (pre-migration), so legacy projects keep loading and rendering rather than disappearing. | none needed |

## Open Issues

- none

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | WS authored at ACCEPTED under INT-020 `--decompose` (acceptance criteria = R33–R36 in `src/intention.test.ts`). | Claude (engineer-directed) |
