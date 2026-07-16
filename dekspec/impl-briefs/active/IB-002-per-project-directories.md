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

## Test Promotion Criteria

Promotion refs: WS-002 Rules 1–4 (R8–R11 in `src/intention.test.ts`).

## Done When

- [ ] A project with `path: <dir>` resolves its directory to `<dir>` (R8) — verified by intention test.
- [ ] A project with no `path` resolves to its file's parent folder (R11) — verified by intention test.
- [ ] Discovery finds every `pm-project: true` file vault-wide (R9) — verified by intention test.
- [ ] `createProject` writes into the caller-supplied directory and persists `path` (R10) — verified by intention test.
- [ ] Create-project modal exposes a destination-directory field seeded from settings — verified by manual check.
- [ ] All pre-existing tests continue to pass — verified by full `pnpm test` run.

## Open Issues

None — no open issues.

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | IB authored at ACCEPTED under INT-014 `--decompose`. No dekbeads CLI present — bead-level work captured as the Done When task list above. | Claude (engineer-directed) |
