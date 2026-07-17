# Implementation Brief: Project-folder restructure + legacy migration

**Spec:** `dekspec/working-specs/WS-007-project-folder-restructure.md`
**Intent:** `dekspec/intents/INT-020-project-folder-restructure.md`
**Source AEs:** AE-001, AE-006
**Depends on:** none
**Production gate:** none
**Status:** ACCEPTED

## Goal

Every project lives in its own folder: `createProject` produces `<dir>/<Name>/` with the note `<dir>/<Name>/<Name>.md` and the nested `<dir>/<Name>/<Name>_tasks/`; discovery still finds projects vault-wide; `moveProject` moves the whole per-project folder; ingestion + rename path-matching resolve the nested tasks folder; and a migration-on-load pass relocates legacy flat-layout projects into the nested layout idempotently and content-preservingly — proven green by R33–R36 in `src/intention.test.ts`.

## Out of Scope

- Renaming the `<Name>_tasks` folder (it keeps its name, only moves down one level).
- Any change to task-file naming or folder-based association semantics.
- Any change to the meaning of the project `path` frontmatter key.
- A task-side `path` key; a bulk one-shot rewrite decoupled from load.

## Files to Modify

| File | Change |
|------|--------|
| `src/store/ProjectStore.ts` | `createProject`: build the per-project folder `<dir>/<Name>/`, write the note at `<dir>/<Name>/<Name>.md` (set `project.filePath` accordingly, `path: <dir>`), and `ensureFolder` the nested `<dir>/<Name>/<Name>_tasks/`. `projectTaskFolder` continues to derive `<...>_tasks` from `filePath.replace(/\.md$/, '_tasks')` — under the nested note path this already yields `<dir>/<Name>/<Name>_tasks` unchanged. `projectDirectory`: resolve `path` when present; blank/absent falls back to the parent of the per-project folder (the note's grandparent dir) for a nested project, or the note's parent dir for an un-migrated legacy file. Add a migration pass (see below) invoked from `discoverProjects` (the on-load entrypoint). `moveProject`: move the whole per-project folder `<oldDir>/<Name>/` → `<newDir>/<Name>/` (note + `<Name>_tasks/` + any freeform content) via a folder rename; update `path`/`projectDirectory`; re-point task `filePath`s; self-write-mark all touched paths. Ingestion + rename path-matching (`ingestExternalTask` / `handleExternalTaskChange` / `renameProject` / `handleExternalRename` / `rebindRenamedProject`) resolve the nested `<Name>_tasks/` location. |
| `src/store/TaskSource.ts` | Expose any new migration/dry-run surface (e.g. `migrateLegacyProjects(options?: { dryRun?: boolean })`) on the interface if the implementer surfaces it. |
| `src/store/vaultFs.ts` | Reuse / extend folder-creation + recursive-move helpers for the nested-layout create and the folder-level migration/move. |
| `src/intention.test.ts` | (Owned by test worker — not modified here; R33–R36 are the acceptance oracle.) |

## Reuse Inventory

| Capability | Location | Use instead of reimplementing |
|------------|----------|-------------------------------|
| Recursive folder rename (attachments + Archive travel with it) | `vault.rename` (fakeVault + Obsidian) | reuse for the folder-level migration + `moveProject` |
| Rename rebind machinery (re-point task paths, cache re-key, `path` update, save) | `rebindRenamedProject` in `src/store/ProjectStore.ts` | reuse for `moveProject` and the folder-level rename |
| Self-write suppression (`markSelfWrite`/`consumeSelfWrite`) | `src/store/ProjectStore.ts` | reuse so migration/move writes do not echo-reload |
| Frontmatter (de)serialization | `src/store/YamlParser.ts`, `src/store/YamlSerializer.ts` | reuse for the `path` key / migration content preservation |
| Vault-wide discovery | `discoverProjects` in `src/store/ProjectStore.ts` | reuse as the migration-on-load entrypoint |

## Domain Constraints

| Constraint | Value |
|------------|-------|
| Do not rename | the `<Name>_tasks` folder name (only moves one level down) |
| Preserve | project-note body + task association across migration |
| Idempotent | migration is a no-op when the project is already nested |

## Do Not Touch

| Function/File | Reason |
|---------------|--------|
| Task-file naming + folder-based association semantics | Non-goal — tasks still belong to the project whose `<Name>_tasks/` folder holds them |
| The `<Name>_tasks` folder NAME | Non-goal — it keeps its name, only relocates |
| `src/intention.test.ts` | Owned by the parallel test worker |

## Governing ADRs

| ADR | Title |
|-----|-------|
| none | — |

## Constraints & Decisions

- **Nested layout:** `createProject(title, dir)` → per-project folder `<dir>/<title>/`, note `<dir>/<title>/<title>.md`, tasks `<dir>/<title>/<title>_tasks/`. The tasks folder name is unchanged; it only moves one level down (R33).
- **`path` semantics (unchanged from INT-014):** `path` = the directory the project is filed under (which now CONTAINS the per-project folder); `projectDirectory` resolves to it. Blank/absent → the directory containing the per-project folder (R33).
- **Migration on load:** `discoverProjects` detects legacy flat-layout projects (note + sibling `<Name>_tasks/`) and relocates them to the nested layout via vault rename, preserving body + tasks; idempotent + re-runnable (R34). Self-write-mark all touched paths so the resulting events do not re-ingest.
- **Association survives:** ingestion + rename path-matching resolve the nested `<Name>_tasks/` location; a migrated project's tasks load into the tree (R35).
- **Folder-level move:** `moveProject` moves the whole per-project folder (note + `<Name>_tasks/` + freeform content), updates `path`/`projectDirectory`, re-points task paths, leaves nothing behind (R36).

## Migration / dry-run test plan

- **R33 (create nested):** `createProject('Nested Home', 'Areas/Ops')`; assert `Areas/Ops/Nested Home/Nested Home.md` (TFile) + `Areas/Ops/Nested Home/Nested Home_tasks` (TFolder) exist, `Areas/Ops/Nested Home.md` is null, `path` frontmatter = `Areas/Ops`, `projectDirectory` = `Areas/Ops`.
- **R34 (migrate on load):** seed a legacy flat project (`Projects/Legacy Proj.md` with a freeform body + `taskIds: [lt-1]`, sibling `Projects/Legacy Proj_tasks/lt-1.md`); run `discoverProjects`; assert the note + task file relocated to `Projects/Legacy Proj/…`, nothing at the old flat paths, the note body + `taskIds` preserved. Re-run `discoverProjects` → no-op (idempotent).
- **R35 (association survives):** same legacy seed; after `discoverProjects` the discovered project's task loads into the tree and resolves under `Projects/Assoc Proj/Assoc Proj_tasks/`; the task file physically lives there.
- **R36 (folder move):** `createProject('Movable', 'Projects')`, insert a task, drop a freeform note inside the per-project folder, `moveProject(project, 'Areas/Portfolio')`; assert the note, `Movable_tasks/`, and the freeform note all moved under `Areas/Portfolio/Movable/`, nothing left behind, task path + `path` frontmatter + `projectDirectory` track the new dir.
- **Dry-run surface:** the migration pass is factored so a `migrateLegacyProjects({ dryRun: true })`-style call can report what WOULD move without writing (the command wiring is deferred; the store surface must support it).
- **Guard:** full `pnpm test` stays green (R1–R32 unaffected — but note R10/R13/R15/R26/R27 encode the OLD flat task-folder LOCATION; see "Assertion migration" below).

## Assertion migration (existing intention tests)

The nested layout changes where the `<Name>_tasks/` folder physically lands relative to the project note. The following EXISTING intention-test assertions encode the OLD flat sibling location and must be updated by the INT-020 implementer as part of the restructure (they assert a `_tasks` folder as a sibling of the note; under the nested layout it lives inside the per-project folder). The `path` / `projectDirectory` assertions in those tests are unaffected (they keep the INT-014 meaning):

- R10: `Clients/Acme/Acme Rollout_tasks` → `Clients/Acme/Acme Rollout/Acme Rollout_tasks`.
- R13/R15 (renames): `Projects/Delta_tasks` / `Projects/Theta_tasks/` → nested under the per-project folder.
- R26/R27 (move): `Areas/Portfolio/Relocatable_tasks` / `Areas/Income Projects/Quarterly Plan_tasks` → nested under the per-project folder.

These are a direct consequence of the restructure (not a weakening) and are squarely within INT-020's remit. The test worker authored R33–R36 additively and left R1–R32 green against the pre-restructure code; the implementer reconciles the layout-location assertions above when flipping to the nested layout.

## Test Promotion Criteria

Promotion refs: WS-007 Rules 1–2 (R33), Rule 3 (R34), Rule 4 (R35), Rule 5 (R36) in `src/intention.test.ts`.

## Done When

- [ ] `createProject` produces the nested per-project-folder layout; nothing at the old flat note path (R33) — verified by intention test.
- [ ] `path` keeps its INT-014 meaning; `projectDirectory` resolves to the directory containing the per-project folder (R33) — verified by intention test.
- [ ] A legacy flat-layout project is migrated to the nested layout on load, preserving body + tasks; idempotent + re-runnable (R34) — verified by intention test.
- [ ] Tasks still associate (folder-based) and load into the tree from the nested `_tasks/` after the restructure (R35) — verified by intention test.
- [ ] `moveProject` moves the whole per-project folder (note + `_tasks/` + freeform content) and updates `path`/`projectDirectory` (R36) — verified by intention test.
- [ ] The migration pass supports a dry-run/report — verified by manual check.
- [ ] The existing layout-location assertions (R10, R13, R15, R26, R27) are reconciled to the nested layout — verified by full `pnpm test` staying green.
- [ ] `pnpm check`, `pnpm check:submission`, `pnpm build` each exit 0 — verified by running them.

## Open Issues

None — no open issues.

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | IB authored at ACCEPTED under INT-020 `--decompose`. No dekbeads CLI present — bead-level work captured as the Done When task list above. | Claude (engineer-directed) |
