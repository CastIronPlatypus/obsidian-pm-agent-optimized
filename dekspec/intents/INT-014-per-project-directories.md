# INT-014: Let each project declare its own vault directory

## Status

LOCKED

## Intent type

feature

## Autonomy

manual

## Risk Tier

schema-migration

## Branch

`int/INT-014-per-project-directories`

## Mission

none

## Source

Engineer requirement, full-auto session 2026-07-16 — wants a `Projects/` tree with category subfolders (income projects, community projects, …) and projects nested underneath, reorganizable over time. Contract pinned against intention-test requirements R8–R11 in `src/intention.test.ts` (authored in parallel).

## Created

2026-07-16

## Modified

2026-07-16

## Linked Architecture Elements

- AE-001: Task & Project Persistence Store — revises how `ProjectStore` locates project files (vault-wide `pm-project: true` discovery instead of a single configured root) and how `createProject` chooses the write directory (now caller-supplied), plus the frontmatter contract for the new `path` key and its fallback.
- AE-005: Modal Dialogs & Modal Factory — the create-project modal (`ProjectModal`) gains a path field so the author picks the destination directory at creation time.
- AE-006: Plugin Entry, Settings & Lifecycle — the global projects-folder setting in `PMSettings` demotes from an authoritative root to a default seed value for the new per-project path field.

## Motivation

Today the plugin treats one global "projects folder" setting as the single authoritative home for every project: discovery only scans under that configured root, and there is no per-project way to say "this project lives here." The engineer running their vault as a portfolio — income projects, community projects, and other categories — cannot express that hierarchy. They want a `Projects/` tree with category subfolders and projects nested beneath, and they expect to reorganize that tree over time. With the current model, moving a project into a category subfolder either hides it from discovery or forces a global-setting change that drags every other project with it. The cost of not changing is that the plugin's storage layout stays flat and un-foldered, actively fighting the way this user (and any user with more than a handful of projects) wants to file their work.

## Desired Outcome

A project declares the directory it lives in via its own frontmatter, and the plugin honors it. Each project's file carries a vault-relative `path` key naming the directory that contains it; when that key is blank or absent, the project falls back to the actual parent folder of its file, so nothing that exists today breaks. Project discovery finds every `pm-project: true` file anywhere in the vault rather than only under a configured root. Creating a project lets the author choose the destination directory — both as a create-project modal field and as the persisted frontmatter — and the file is written there. The former global projects-folder setting survives only as the default value seeded into that new field, no longer as the one place projects may live.

An author can also **re-point an already-created project's directory** after the fact: the existing-project settings/configure modal exposes an editable folder-path field, and on save — when the path changed — the plugin moves the whole project folder (the project file, its `<Name>_tasks/` folder, and everything under it: attachments and the Archive subfolder) so it now lives under the new folder path, and updates the project's `path` frontmatter to match. Folder names containing spaces are handled literally (the files land at the exact spaced path, discoverable afterward). This completes the reorganize-over-time promise the create-time path field only half-delivered: without a move surface on the existing-project modal, a user who restructures their vault hierarchy could set a project's directory only at creation, never afterward.

## Non-Goals

- No automatic migration or bulk re-filing of existing projects into category subfolders — existing projects keep working in place (R11); reorganizing the tree is a manual, user-driven act this Intent merely stops obstructing.
- No category/subfolder as a first-class typed concept — a "category" is just an intermediate directory in the `path`, not a new entity, view, or schema object.
- No change to the per-task storage layout (`<Project>_tasks/…`, Archive, attachments) relative to the project file; task files continue to resolve against their project's resolved directory.
- No task-side `path` key — this Intent scopes the directory contract to projects only.

## Type-specific required fields

### `feature` — Desired Outcome

The Desired Outcome above states the new behavior in user-observable terms: a project's `path` frontmatter key determines its directory, blank/absent falls back to the file's parent folder, discovery is vault-wide over `pm-project: true`, and create-project accepts a destination directory via both frontmatter and a modal field.

## Components affected

- `src/store/ProjectStore.ts`
- `src/store/TaskSource.ts`
- `src/modals/ProjectModal.ts` — amendment: the existing-project settings/configure modal path gains an editable folder-path field whose save moves the project folder.
- `src/settings.ts`
- `src/types.ts`

*Distinct from Linked Architecture Elements.* Components describe blast radius (where the diff lands); AEs describe spec-graph shape (which architectural slices this Intent revises). Both are required.

## Coverage report

*Populated by inline `--analyze` (2026-07-16, full-auto session) against the pinned R8–R11 contract.*

| Gap | Source | Resolution | Status |
| --- | --- | --- | --- |
| `path` frontmatter key not modeled on `Project` / not (de)serialized by the YAML layer | analyze — contract R8 vs `src/types.ts` + store YAML modules | Resolve in this Intent: add `path` to the project type + parser/serializer with blank/absent → parent-folder fallback | open |
| Discovery is root-scoped; no vault-wide `pm-project: true` scan exists | analyze — contract R9 vs `ProjectStore` load path | Resolve in this Intent: scan `metadataCache` for `pm-project: true` anywhere | open |
| `createProject` takes no directory argument; create-project modal has no path field | analyze — contract R10 vs `TaskSource`/`ProjectStore`/`ProjectModal` | Resolve in this Intent: thread a directory arg through `createProject` and add the modal field | open |
| Regression risk: legacy projects under the default folder must keep loading | analyze — contract R11 | Resolve in this Intent via the fallback path; guarded by the parallel-authored `src/intention.test.ts` R11 case | open |
| Amendment (2026-07-16): existing-project settings modal cannot re-point an already-created project's folder; no store surface moves a project's whole folder on a path change | amendment — completeness gap vs create-project-only path field | Resolve in this amendment: add `ProjectStore.moveProject(project, newDir)` (moves project file + `<Name>_tasks/` + attachments + Archive, updates `path` frontmatter, handles spaces) + an editable folder-path field on the existing-project settings modal that calls it on save; guarded by `src/intention.test.ts` R26/R27 | open |

## Size assessment

*Populated by inline `--analyze`. Hard caps per Decision #5.*

| Cap | Limit | Measured | Verdict |
| --- | --- | --- | --- |
| Implementation Units (IBs / direct beads) | ≤ 3 | 3 | PASS |
| Components affected | ≤ 3 | 3 (AE-001, AE-005, AE-006) | PASS |
| New L1 artifacts (AEs) | ≤ 1 | 0 | PASS |
| New + revised L2 artifacts (WSes + ICs) | ≤ 3 | TBD — set at `--decompose` | PASS |
| Coverage gaps | ≤ 2 | 5 additive (4 original + 1 amendment), all resolved-in-Intent | PASS (no deferrals) |

## Layer impact analysis

*Populated by inline `--analyze`. Explicit "none" preferred over omission.*

| Layer | Artifact | Action |
| --- | --- | --- |
| L1 (Architecture & Decisions) | AE-001, AE-005, AE-006 | revise |
| L2 (Specification) | WS(es) for store discovery/createProject + modal path field | new — named at `--decompose`, not populated here |
| L3 (Implementation) | IB(s) | new — at `--decompose` |
| L4 (Construction) | beads | new — at `--decompose` |

## Verification

```yaml
# Verification predicate for INT-014 (feature). All checks must pass for --testpass.
verification:
  - name: typecheck-lint-format-clean
    cmd: pnpm check
  - name: full-suite-green
    cmd: pnpm test
  - name: intention-contract-r8-r11
    cmd: vitest run src/intention.test.ts
  # Amendment (2026-07-16): the editable-folder-path / move-on-save scope is
  # pinned by R26 (move relocates project file + tasks folder; path frontmatter
  # updated) and R27 (spaced target folder handled literally).
  - name: intention-contract-r26-r27
    cmd: vitest run src/intention.test.ts
```

### Testpass results (2026-07-16)

Diff confinement: the per-project-directory work shipped on `main` via direct commits (no `int/` branch corpus, no dekbeads tracker), so the branch-diff and bead-closure gates of `--testpass` are N/A; the Intent locks via ADR-017 Path B (all downstream WS/IC/IBs ≥ ACCEPTED). Verification predicate re-evaluated from `main`:

| Check | Cmd | Result |
| --- | --- | --- |
| typecheck-lint-format-clean | `pnpm check` | PASS (exit 0) |
| full-suite-green | `pnpm test` | PASS (255 passed, 1 skipped) |
| intention-contract-r8-r11 | `vitest run src/intention.test.ts` | PASS (20 passed, 1 skipped) |

### Testpass results — amendment re-lock (2026-07-16)

The editable-folder-path / move-on-save amendment (see Amendment Log) re-locks via the same ADR-017 Path B precedent as the original land: work shipped on `main` via direct commits (implementation commit `cf0f8fd`), no `int/` branch corpus or dekbeads tracker, so the branch-diff and bead-closure gates are N/A; WS-002 and IB-002 are ACCEPTED. The verification predicate — including the amendment's `intention-contract-r26-r27` check — re-evaluated from `main`:

| Check | Cmd | Result |
| --- | --- | --- |
| typecheck-lint-format-clean | `pnpm check` | PASS (exit 0) |
| full-suite-green | `pnpm test` | PASS (274 passed, 1 skipped) |
| intention-contract-r8-r11 | `vitest run src/intention.test.ts` | PASS |
| intention-contract-r26 | `vitest run src/intention.test.ts -t "R26"` | PASS (1 passed, 26 skipped) |
| intention-contract-r27 | `vitest run src/intention.test.ts -t "R27"` | PASS (1 passed, 26 skipped) |

## Outcome Verification

On a project whose frontmatter sets `path: Projects/Income/Q3-launch`, the store resolves that project's directory to `Projects/Income/Q3-launch` (not the global folder), while a project with no `path` key resolves to its file's actual parent folder — both surfaced by discovery's vault-wide `pm-project: true` scan. Tested by the R8–R11 cases in `src/intention.test.ts` (authored in parallel); the R8 (contract), R9 (discovery), R10 (create-in-directory), and R11 (legacy fallback) assertions are the red-first outcome tests this Intent makes green.

**Amendment (2026-07-16) — editable folder path + move on save.** On an already-created project, changing its folder path via `ProjectStore.moveProject(project, newDir)` relocates the project file AND its `<Name>_tasks/` folder (with attachments and Archive) to `newDir`, leaves nothing at the old location, updates the project's `path` frontmatter and `projectDirectory(project)` to `newDir`, and keeps its tasks attached at the new folder. A target directory containing spaces (e.g. `Areas/Income Projects`) is honored literally. These are the red-first outcome tests R26 (relocation + path update, tasks not orphaned) and R27 (spaced path handled literally) in `src/intention.test.ts`.

## Open Issues

- [ ] Confirm the decision to *demote* the global projects-folder setting to a default rather than remove it outright (Desired Outcome assumes demote-to-default) — **Source:** initial draft — **Severity:** `P3`
- [ ] Directory-picker UX for the modal path field (free-text vs folder suggester) is unspecified; defer concrete UX to the modal WS at `--decompose` — **Source:** initial draft — **Severity:** `P3`

## Post-implementation sync

*Synced 2026-07-16 (land step). Work merged to `main`; open-issue resolutions recorded below.*

- [x] Global projects-folder setting **demoted** to a create-time default (not removed); discovery scans the vault for `pm-project: true` files. Legacy projects keep working via parent-folder fallback for a blank/absent `path`.
- [x] Modal path field shipped as **plain text** (no folder suggester); autosuggest surfaced as a follow-up, not blocking.
- [x] Verification predicate green from `main` (see Testpass results).
- [x] Linked AEs (AE-001, AE-005, AE-006) at ACCEPTED — no status inversion remains.

*Amendment sync (2026-07-16) — editable folder path + move on save:*

- [x] `ProjectStore.moveProject(project, newDir)` shipped: relocates the whole project folder (project file + `<Name>_tasks/` incl. attachments and Archive) on a path change, updates the project's `path` frontmatter and resolved `projectDirectory`, and re-attaches the moved tasks (reuses the INT-015 rename/move machinery). Intermediate destination folders are auto-created; a target directory that is already occupied throws before any write (no partial move).
- [x] Existing-project settings/configure modal (`src/modals/ProjectModal.ts`) gained an editable folder-path field that calls `moveProject` on save when the path changed.
- [x] Folder paths containing spaces (and unicode) are handled literally — files land at the exact spaced path and remain discoverable.
- [x] Amendment verification green from `main`: `intention-contract-r26-r27` PASS (see amendment re-lock testpass table); full suite 274 passed / 1 skipped.

## Amendment Log

| Date | Type | Change | Author |
| --- | --- | --- | --- |
| 2026-07-16 | Substantive | Intent authored at PROPOSED; inline `--analyze` performed against the pinned R8–R11 contract (Coverage/Size/Layer/Verification populated), acceptance pre-authorized by engineer in full-auto session. | Claude (intent-authoring agent) |
| 2026-07-16 | Substantive | Promoted PROPOSED to ACCEPTED via /write-intent --accept. Engineer acceptance pre-authorized for full-auto session 2026-07-16 (recorded in Source / Amendment Log); that recording is the authorization cited here. No dekbeads CLI in repo — bead authoring gate deferred to IB Done-When task lists at --decompose. | Claude (engineer-directed, pre-authorized) |
| 2026-07-16 | Substantive | Decomposed into 1 IU (1 IB, 0 direct beads): WS-002 + IB-002. No dekbeads CLI in repo — bead work captured as IB Done-When task lists. ACCEPTED to IMPLEMENTING via /write-intent --decompose. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | All Verification checks green from main (pnpm check exit 0; pnpm test 255 passed/1 skipped; vitest src/intention.test.ts 20 passed/1 skipped R8-R11). Branch-diff/bead gates N/A — work shipped on main. IMPLEMENTING to TESTPASS via /write-intent --testpass. | Claude (U12 land agent) |
| 2026-07-16 | Substantive | Locked via ADR-017 Path B — all downstream WS-002/IB-002 >= ACCEPTED. Linked AEs AE-001/AE-005/AE-006 at ACCEPTED. TESTPASS to LOCKED via /write-intent --lock. | Claude (U12 land agent) |
| 2026-07-16 | Substantive | Unlocked LOCKED to PROPOSED to admit the committed-scope amendment below (engineer-directed, user-directed 2026-07-16, full-auto authority): the create-project modal ships a folder-path field but the existing-project settings/configure modal has no way to re-point an already-created project's folder. Blast radius surfaced: WS-002 (ACCEPTED), IB-002 (ACCEPTED). | jeffhaskin1@gmail.com |
| 2026-07-16 | Substantive | Amended scope (retroactive, engineer-directed completeness of INT-014 — NOT a new Intent): added the editable-folder-path / move-on-save capability to Desired Outcome, Components (existing-project settings modal), a 5th coverage row, Outcome Verification, and the Verification predicate (intention-contract-r26-r27). New store surface pinned: `ProjectStore.moveProject(project, newDir)` — moves the whole project folder (project file + `<Name>_tasks/` incl. attachments + Archive) on a path change, updates `path` frontmatter, handles spaces. Guarded red-first by `src/intention.test.ts` R26/R27 (authored this change). WS-002 + IB-002 amended in lockstep with the delta. Status set to IMPLEMENTING (delta already decomposed inline under delegated authority; the analyze/decompose caps re-checked and still PASS). The next (implement) + land workers re-lock via ADR-017 Path B once R26/R27 are green. | Claude (Worker V01, engineer-directed) |
| 2026-07-16 | Substantive | Amendment implemented on `main` (commit `cf0f8fd`): `ProjectStore.moveProject` (target-occupied throws before any write; intermediate folders auto-created via `ensureFolder`; spaces/unicode honored literally; tasks re-attached via the shared `rebindRenamedProject` INT-015 machinery) + editable folder-path field on the existing-project settings modal. Amendment predicate re-evaluated from `main`: `pnpm check` exit 0; `pnpm test` 274 passed/1 skipped; `vitest src/intention.test.ts -t "R26"`/`-t "R27"` each 1 passed/26 skipped. Branch-diff/bead gates N/A — work shipped on main. IMPLEMENTING to LOCKED via ADR-017 Path B (WS-002/IB-002 >= ACCEPTED; linked AEs AE-001/AE-005/AE-006 at ACCEPTED — no status inversion). | Claude (land agent, engineer-directed) |
| 2026-07-16 | Substantive | ADR-017 Path B re-lock: amendment R26/R27 green from main | 60890286+jeffhaskin@users.noreply.github.com |
