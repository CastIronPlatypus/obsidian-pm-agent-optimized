# Implementation Brief: Per-project vault directories

**Spec:** `dekspec/working-specs/WS-002-per-project-directories.md`
**Intent:** `dekspec/intents/INT-014-per-project-directories.md`
**Source AEs:** AE-001, AE-005, AE-006
**Depends on:** none
**Production gate:** none
**Status:** ACCEPTED

## Goal

A project resolves its directory from a `path` frontmatter key (blank/absent → file's parent folder), discovery finds every `pm-project: true` file vault-wide, and `createProject` writes into a caller-supplied directory persisted as `path` — proven green by R8–R11 in `src/intention.test.ts`.

## Out of Scope

- Auto-migrating or bulk re-filing existing projects into subfolders.
- A category/subfolder as a first-class typed entity.
- Any change to per-task storage layout relative to the project file.
- A task-side `path` key.

## Files to Modify

| File | Change |
|------|--------|
| `src/types.ts` | Add optional `path` to `Project`; demote projects-folder setting semantics in `PMSettings` doc/usage. |
| `src/store/ProjectStore.ts` | Vault-wide `pm-project: true` discovery via `metadataCache`; resolve project dir from `path` else file parent folder; thread a directory arg through `createProject`. |
| `src/store/TaskSource.ts` | Extend the `createProject` signature to accept the destination directory. |
| `src/modals/ProjectModal.ts` | Add a destination-directory field (seeded from the settings default). |
| `src/settings.ts` | Demote the global projects-folder setting to a default seed for the new field. |
| `src/intention.test.ts` | (Owned by test worker — not modified here; R8–R11 are the acceptance oracle.) |

## Reuse Inventory

| Capability | Location | Use instead of reimplementing |
|------------|----------|-------------------------------|
| Frontmatter (de)serialization | `src/store/YamlParser.ts`, `src/store/YamlSerializer.ts` | reuse for the `path` key |
| Project cache + self-write | `src/store/ProjectStore.ts` | reuse existing discovery/cache plumbing |
| Modal field primitives | `src/ui/**`, `src/ui/ModalFactory.ts` | reuse for the path field |

## Domain Constraints

| Constraint | Value |
|------------|-------|
| Read path | resolve project dir from `path`, else file parent folder |
| Do not touch | per-task storage layout relative to the project file |

## Do Not Touch

| Function/File | Reason |
|---------------|--------|
| Per-task storage layout (`<Project>_tasks/…`, Archive, attachments) | Non-goal — resolves against the project's resolved dir unchanged |
| `src/intention.test.ts` | Owned by the parallel test worker |

## Governing ADRs

| ADR | Title |
|-----|-------|
| none | — |

## Constraints & Decisions

- **Directory resolution:** A project's directory is `path` frontmatter when present and non-blank; otherwise the file's actual parent folder (legacy fallback, R11).
- **Discovery:** Scan `metadataCache` for `pm-project: true` across the whole vault; do not restrict to a configured root (R9).
- **Create:** `createProject` takes a destination directory, writes the file there, and persists it as `path` (R10).
- **Settings demotion:** The former global projects-folder setting is only the default seeded into the modal's directory field, no longer an authoritative root.
- **Task resolution:** Task files continue to resolve against the project's resolved directory; no task-side `path`.

## Amendment delta (2026-07-16) — editable folder path + move on save

*Engineer-directed completeness of INT-014 (NOT a new Intent). Adds the ability to re-point an already-created project's directory. Proven red-first by R26/R27 in `src/intention.test.ts`.*

### Files to modify (delta)

| File | Change |
|------|--------|
| `src/store/ProjectStore.ts` | Add `moveProject(project: Project, newDir: string): Promise<void>`. Mirror `renameProject`'s self-write discipline but change the **directory** instead of the basename. Compute `oldPath`/`newPath = <newDir>/<basename>.md` and `oldTaskFolder`/`newTaskFolder = <dir>/<Name>_tasks`; `ensureFolder(newDir)`; `markSelfWrite` all four paths (plus rebased task paths) up front; `renameFile` the project `.md`, then reuse the existing `rebindRenamedProject(project, oldPath, newPath, oldTaskFolder, newTaskFolder, project.title)` helper — it already cascades the `<Name>_tasks` folder rename (attachments + Archive move with it since fakeVault/Obsidian folder-rename is recursive), re-points every task `filePath`, moves per-project bookkeeping to the new cache key, and sets `project.path = parentDirOf(newPath)` then `saveProject`. Title is unchanged, so pass the current title. No-op fast path when `newDir` equals the current `projectDirectory(project)`. Throw if the destination `.md` already exists (mirror `renameProject`). |
| `src/store/TaskSource.ts` | Add `moveProject(project, newDir)` to the interface so views/modals program against it. |
| `src/modals/ProjectModal.ts` (or the existing-project settings/configure modal path) | Make the folder-path field editable when editing an existing project; on save, if the field changed vs `projectDirectory(project)`, call `store.moveProject(project, newDir)` (before/after the other field saves, in a way that the moved `filePath` is used for the remaining save). Reuse the create-time path-field primitive. |

### Sequencing

1. Land `moveProject` on `ProjectStore` + `TaskSource` (store-only; R26/R27 exercise this surface directly and go green here).
2. Wire the existing-project settings modal field → `moveProject` on save (manual-check line in Done When; not covered by the intention test, which probes the store surface).

### Test plan

- R26: create a project under `Projects/`, insert a task, `moveProject(project, 'Areas/Portfolio')`; assert the `.md` + `_tasks` folder + task file live under the new dir, nothing at the old dir, `path` frontmatter + `projectDirectory` = new dir, task still attached.
- R27: same with `newDir = 'Areas/Income Projects'` (spaces); assert files land at the literal spaced path and `project.filePath` reflects it.
- Guard: full `pnpm test` stays green (R8–R25 unaffected).

### Do not touch (delta)

- The existing `renameProject`/`handleExternalRename`/`rebindRenamedProject` behavior (R12–R15) — `moveProject` **reuses** `rebindRenamedProject`, it does not alter it.

## Test Promotion Criteria

Promotion refs: WS-002 Rules 1–4 (R8–R11 in `src/intention.test.ts`); WS-002 Rule 5 (R26–R27, amendment).

## Done When

- [ ] A project with `path: <dir>` resolves its directory to `<dir>` (R8) — verified by intention test.
- [ ] A project with no `path` resolves to its file's parent folder (R11) — verified by intention test.
- [ ] Discovery finds every `pm-project: true` file vault-wide (R9) — verified by intention test.
- [ ] `createProject` writes into the caller-supplied directory and persists `path` (R10) — verified by intention test.
- [ ] Create-project modal exposes a destination-directory field seeded from settings — verified by manual check.
- [ ] *(amendment)* `moveProject(project, newDir)` relocates the whole project folder + updates `path` (R26) and handles spaced directories (R27) — verified by intention test.
- [ ] *(amendment)* The existing-project settings modal exposes an editable folder-path field that calls `moveProject` on save — verified by manual check.
- [ ] All pre-existing tests continue to pass — verified by full `pnpm test` run.

## Open Issues

None — no open issues.

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | IB authored at ACCEPTED under INT-014 `--decompose`. No dekbeads CLI present — bead-level work captured as the Done When task list above. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Added the "Amendment delta" section (editable folder path + `moveProject(project, newDir)` file plan, sequencing, test plan) and R26/R27 Done-When rows under INT-014 completeness. | Claude (Worker V01, engineer-directed) |
