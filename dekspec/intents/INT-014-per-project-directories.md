# INT-014: Let each project declare its own vault directory

## Status

IMPLEMENTING

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
- `src/modals/ProjectModal.ts`
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

## Size assessment

*Populated by inline `--analyze`. Hard caps per Decision #5.*

| Cap | Limit | Measured | Verdict |
| --- | --- | --- | --- |
| Implementation Units (IBs / direct beads) | ≤ 3 | 3 | PASS |
| Components affected | ≤ 3 | 3 (AE-001, AE-005, AE-006) | PASS |
| New L1 artifacts (AEs) | ≤ 1 | 0 | PASS |
| New + revised L2 artifacts (WSes + ICs) | ≤ 3 | TBD — set at `--decompose` | PASS |
| Coverage gaps | ≤ 2 | 4 additive, all resolved-in-Intent | PASS (no deferrals) |

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
```

## Outcome Verification

On a project whose frontmatter sets `path: Projects/Income/Q3-launch`, the store resolves that project's directory to `Projects/Income/Q3-launch` (not the global folder), while a project with no `path` key resolves to its file's actual parent folder — both surfaced by discovery's vault-wide `pm-project: true` scan. Tested by the R8–R11 cases in `src/intention.test.ts` (authored in parallel); the R8 (contract), R9 (discovery), R10 (create-in-directory), and R11 (legacy fallback) assertions are the red-first outcome tests this Intent makes green.

## Open Issues

- [ ] Confirm the decision to *demote* the global projects-folder setting to a default rather than remove it outright (Desired Outcome assumes demote-to-default) — **Source:** initial draft — **Severity:** `P3`
- [ ] Directory-picker UX for the modal path field (free-text vs folder suggester) is unspecified; defer concrete UX to the modal WS at `--decompose` — **Source:** initial draft — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
| --- | --- | --- | --- |
| 2026-07-16 | Substantive | Intent authored at PROPOSED; inline `--analyze` performed against the pinned R8–R11 contract (Coverage/Size/Layer/Verification populated), acceptance pre-authorized by engineer in full-auto session. | Claude (intent-authoring agent) |
| 2026-07-16 | Substantive | Promoted PROPOSED to ACCEPTED via /write-intent --accept. Engineer acceptance pre-authorized for full-auto session 2026-07-16 (recorded in Source / Amendment Log); that recording is the authorization cited here. No dekbeads CLI in repo — bead authoring gate deferred to IB Done-When task lists at --decompose. | Claude (engineer-directed, pre-authorized) |
| 2026-07-16 | Substantive | Decomposed into 1 IU (1 IB, 0 direct beads): WS-002 + IB-002. No dekbeads CLI in repo — bead work captured as IB Done-When task lists. ACCEPTED to IMPLEMENTING via /write-intent --decompose. | Claude (engineer-directed) |
