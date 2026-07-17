# INT-020: Give each project its own folder (nested layout) and migrate legacy projects on load

## Status

IMPLEMENTING

## Intent type

feature

## Autonomy

full-auto

## Risk Tier

schema-migration

## Branch

`int/INT-020-project-folder-restructure`

## Mission

none

## Source

Engineer requirement, full-auto session 2026-07-16 — the engineer co-manages projects with an AI agent through plain Markdown, and wants each project to live in its OWN folder so that folder is free for the user's (or the AI's) free-form content alongside the plugin-managed files. Today a project is `<path>/<Name>.md` with a SIBLING `<path>/<Name>_tasks/` folder; there is nowhere to file freeform project content without it colliding with plugin storage. Acceptance (PROPOSED → ACCEPTED) pre-authorized by the engineer for this session ("engineer-directed full-auto 2026-07-16"). Behavioral contract pinned in `src/intention.test.ts` requirements R33–R36 (authored in parallel by the test worker; the assertions land red-first).

## Superseded-By

none

## Created

2026-07-16

## Modified

2026-07-16

## Linked Architecture Elements

- AE-001: Task & Project Persistence Store — revises the on-disk storage layout the store creates and resolves. `createProject` now creates a per-project folder `<path>/<Name>/` containing the project note `<path>/<Name>/<Name>.md` and the nested tasks folder `<path>/<Name>/<Name>_tasks/` (the `_tasks` folder KEEPS its `<Name>_tasks` name — it only moves one level down). `projectDirectory` keeps its INT-014 meaning (the directory the project is filed under, which now CONTAINS the per-project folder). `moveProject` relocates the whole per-project folder (note + `<Name>_tasks/` + any freeform content). Ingestion and rename path-matching resolve against the nested `<Name>_tasks/` location. All of this rides inside the existing dirty-tracking / self-write-suppression machinery.
- AE-006: Plugin Entry, Settings & Lifecycle — adds a migration-on-load responsibility: when projects are loaded/discovered, legacy flat-layout projects (`<path>/<Name>.md` + sibling `<path>/<Name>_tasks/`) are detected and relocated into the nested layout via vault rename (so Obsidian updates links), idempotently (a no-op for a project already nested) and content-preservingly (project-note body, task association, and any existing content survive). Designed so a dry-run/report pass is exposable.

## Motivation

The plugin stores each project as a note file with a sibling `<Name>_tasks/` folder holding its task files. That flat layout leaves the project with no home of its own: a user (or the AI collaborator) who wants to file free-form content about the project — a design doc, reference material, attachments unrelated to a single task — has nowhere to put it that reads as "part of this project" without colliding with the plugin-managed `<Name>_tasks/` folder or scattering loose notes across the parent directory. The engineer running their vault as a portfolio wants each project to be a self-contained folder they can open, browse, and drop content into. The cost of not changing is a storage layout that fights the way a project is naturally thought of — as a place, not just a file — and forces the human/AI workflow to keep plugin data and human data awkwardly intermingled at the same directory level.

## Desired Outcome

Every project lives in its own folder. Creating a project titled `<Name>` under directory `<path>` produces the per-project folder `<path>/<Name>/`, the project note `<path>/<Name>/<Name>.md` inside it, and the tasks folder nested one level down as `<path>/<Name>/<Name>_tasks/` (the tasks folder KEEPS its `<Name>_tasks` name — it is not renamed, only relocated). The `path` frontmatter key keeps its INT-014 meaning: the vault-relative directory the project is filed under — the directory that CONTAINS the per-project folder — and `projectDirectory(project)` still resolves to it (blank/absent `path` falls back to the directory containing the per-project folder). Discovery still finds every `pm-project: true` file vault-wide despite the extra nesting. Moving a project via `moveProject(project, newDir)` relocates the WHOLE per-project folder — note, `<Name>_tasks/`, and any free-form content the user put inside it — under `newDir`, leaving nothing behind. Task ingestion and file/folder rename path-matching resolve against the nested `<Name>_tasks/` location so tasks stay associated.

Existing vaults are not stranded: on load, the plugin detects legacy flat-layout projects (`<path>/<Name>.md` with a sibling `<path>/<Name>_tasks/`) and migrates them into the nested layout via vault rename, so Obsidian updates any links. The migration preserves the project-note body, the task association (ordering `taskIds` and each task's folder-based membership), and any existing content; it is idempotent (a project already in the nested layout is left untouched) and re-runnable (a second load is a no-op). The migration is designed so a dry-run/report can be surfaced by the implementer.

## Non-Goals

- No renaming of the `<Name>_tasks` folder — it keeps its name and only moves one level down, inside the per-project folder.
- No change to task-file naming or to the folder-based association semantics — a task still belongs to the project whose `<Name>_tasks/` folder holds it; there is no task-side `path` key.
- No change to the meaning of the project `path` frontmatter key — it still names the directory the project is filed under (now the directory that contains the per-project folder), not the per-project folder itself.
- No bulk one-shot rewrite decoupled from load — migration is applied when projects are loaded/discovered, idempotently; it does not require a separate manual pass (though a dry-run/report may be exposed).
- No change to the per-task Archive / attachments layout relative to the tasks folder — those travel with `<Name>_tasks/` unchanged.

## Type-specific required fields

### `feature` — Desired Outcome

The new behavior is user-observable and contract-pinned: (R33) `createProject` produces the nested per-project-folder layout — the note and `<Name>_tasks/` both inside `<path>/<Name>/`, nothing at the old flat `<path>/<Name>.md`; (R34) a legacy flat-layout project is migrated to the nested layout on load, preserving its tasks and project-note body; (R35) after the restructure tasks still associate (folder-based) and load into the tree from the nested `<Name>_tasks/`; (R36) `moveProject` moves the entire per-project folder (note + `<Name>_tasks/` + freeform content) to a new directory. See the Desired Outcome above for the full user-facing narrative.

## Components affected

- `src/store/ProjectStore.ts` — `createProject` (nested layout), `projectTaskFolder` / directory resolution, `discoverProjects` (migration-on-load entrypoint), `moveProject` (folder-level move), ingestion + rename path-matching (`ingestExternalTask` / `handleExternalTaskChange` / `renameProject` / `handleExternalRename` / `rebindRenamedProject`), plus a new migration pass.
- `src/store/TaskSource.ts` — any new migration/dry-run surface exposed on the interface.
- `src/store/vaultFs.ts` — folder-creation / move helpers reused by the migration and the nested-layout create.

*Distinct from Linked Architecture Elements.* Components describe blast radius (where the diff lands); AEs describe spec-graph shape (which architectural slices this Intent revises). Both are required.

## Coverage report

*Populated by inline `--analyze` (2026-07-16, full-auto session) against the pinned R33–R36 contract.*

| Gap | Source | Resolution | Status |
| --- | --- | --- | --- |
| `createProject` writes the flat layout (note + sibling `<Name>_tasks/`); no per-project folder exists | analyze — contract R33 vs `ProjectStore.createProject` | Resolve in this Intent: create `<path>/<Name>/` and write the note + nested `<Name>_tasks/` inside it | open |
| No migration path exists for legacy flat-layout projects; a load leaves them flat | analyze — contract R34 vs `ProjectStore` load path | Resolve in this Intent: add an idempotent migration pass invoked on load/discovery that relocates flat → nested via vault rename, preserving body + tasks | open |
| Ingestion / rename path-matching resolves the tasks folder from the flat sibling location; after restructure tasks would be orphaned | analyze — contract R35 vs `ingestExternalTask` / `rebindRenamedProject` | Resolve in this Intent: resolve `<Name>_tasks/` at the nested location so folder-based association survives | open |
| `moveProject` moves the flat note + sibling tasks folder, not a per-project folder with freeform content | analyze — contract R36 vs `ProjectStore.moveProject` | Resolve in this Intent: move the whole per-project folder (note + `<Name>_tasks/` + freeform content) | open |

## Size assessment

*Populated by inline `--analyze`. Hard caps per Decision #5.*

| Cap | Limit | Measured | Verdict |
| --- | --- | --- | --- |
| Implementation Units (IBs / direct beads) | ≤ 3 | 1 | PASS |
| Components affected | ≤ 3 | 3 (AE-001, AE-006) + vaultFs helper | PASS |
| New L1 artifacts (AEs) | ≤ 1 | 0 | PASS |
| New + revised L2 artifacts (WSes + ICs) | ≤ 3 | 1 (WS-007) | PASS |
| Coverage gaps | ≤ 4 | 4, all resolved-in-Intent | PASS (no deferrals) |

## Layer impact analysis

*Populated by inline `--analyze`. Explicit "none" preferred over omission.*

| Layer | Artifact | Action |
| --- | --- | --- |
| L1 (Architecture & Decisions) | AE-001, AE-006 | revise |
| L2 (Specification) | WS-007 (nested layout + migration) | new |
| L3 (Implementation) | IB-007 | new |
| L4 (Construction) | beads | new — captured as IB Done-When task lists (no dekbeads CLI in repo) |

## Verification

```yaml
# Verification predicate for INT-020 (feature). All checks must pass for --testpass.
verification:
  - name: typecheck-lint-format-clean
    cmd: pnpm check
  - name: full-suite-green
    cmd: pnpm test
  - name: intention-contract-r33-r36
    cmd: vitest run src/intention.test.ts -t "Feature 7"
  - name: check-submission
    cmd: pnpm check:submission
  - name: build
    cmd: pnpm build
```

## Outcome Verification

On `createProject('Nested Home', 'Areas/Ops')` the store creates `Areas/Ops/Nested Home/` containing `Areas/Ops/Nested Home/Nested Home.md` and `Areas/Ops/Nested Home/Nested Home_tasks/`, persists `path: Areas/Ops`, and `projectDirectory` resolves to `Areas/Ops` — with nothing at the old flat `Areas/Ops/Nested Home.md`. A legacy flat-layout project (`Projects/Legacy Proj.md` + `Projects/Legacy Proj_tasks/`) loaded by discovery is relocated to `Projects/Legacy Proj/Legacy Proj.md` + `Projects/Legacy Proj/Legacy Proj_tasks/`, preserving the note body and its tasks; a re-load is a no-op. Its tasks still load into the tree (folder-based association survived). `moveProject(project, 'Areas/Portfolio')` relocates the whole `Movable/` folder — note, `Movable_tasks/`, and any freeform content — under `Areas/Portfolio/`, leaving nothing behind, and updates `path`/`projectDirectory` to `Areas/Portfolio`. These are the red-first outcome tests R33 (create nested), R34 (migrate on load), R35 (association survives), and R36 (folder-level move) in `src/intention.test.ts`.

## Open Issues

- [ ] Whether the migration exposes a user-facing dry-run/report command or runs silently on load with a summary Notice — the store surface is designed to support a dry-run; the command wiring is deferred to the implementer — **Source:** initial draft — **Severity:** `P3`
- [ ] Fallback semantics for a project whose per-project folder name differs from its title (user hand-renamed the folder) — treated as legacy/parent-folder fallback for now — **Source:** initial draft — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
| --- | --- | --- | --- |
| 2026-07-16 | Substantive | Intent authored at PROPOSED; inline `--analyze` performed against the pinned R33–R36 contract (Coverage/Size/Layer/Verification populated), acceptance pre-authorized by engineer in full-auto session. | Claude (intent-authoring agent) |
| 2026-07-16 | Substantive | Promoted PROPOSED to ACCEPTED via /write-intent --accept. Engineer acceptance pre-authorized for full-auto session 2026-07-16 (recorded in Source). No dekbeads CLI in repo — bead authoring gate deferred to IB Done-When task lists at --decompose. | Claude (engineer-directed, pre-authorized) |
| 2026-07-16 | Substantive | Decomposed into 1 IU (1 IB, 0 direct beads): WS-007 + IB-007. No dekbeads CLI in repo — bead work captured as IB Done-When task lists. ACCEPTED to IMPLEMENTING via /write-intent --decompose. R33–R36 authored red-first in `src/intention.test.ts`. | Claude (engineer-directed) |
