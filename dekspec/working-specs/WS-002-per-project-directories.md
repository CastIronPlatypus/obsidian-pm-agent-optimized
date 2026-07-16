# Working Spec: Per-project vault directories

## Status

ACCEPTED

## Created

2026-07-16

## Modified

2026-07-16

## Related Architecture Elements

- AE-001: Task & Project Persistence Store — measures how the store locates project files (vault-wide `pm-project: true` discovery instead of one configured root) and how `createProject` chooses the write directory (caller-supplied), plus the `path` frontmatter contract and its parent-folder fallback.
- AE-005: Modal Dialogs & Modal Factory — constrains the create-project modal gaining a destination-directory field.
- AE-006: Plugin Entry, Settings & Lifecycle — constrains demoting the global projects-folder setting from an authoritative root to a default seed for the new per-project path field.

## Governing ADRs

- none

## What This Does

A project declares the directory it lives in via a vault-relative `path` frontmatter key, and the store honors it. When `path` is blank or absent, the project resolves to its file's actual parent folder, so existing projects keep working. Discovery finds every `pm-project: true` file anywhere in the vault rather than only under a configured root. Creating a project accepts a destination directory (a create-project modal field and persisted frontmatter) and writes the file there. The former global projects-folder setting survives only as the default value seeded into that field.

**Mechanism:** This component resolves a project's directory from its `path` frontmatter (falling back to the file's parent folder), discovers projects by scanning `metadataCache` for `pm-project: true` vault-wide, and writes a newly created project into a caller-supplied directory.

## What This Does NOT Do

- **Graph consistency:** Does not auto-migrate or bulk re-file existing projects into subfolders; reorganization stays a manual user act.
- Does not introduce a category/subfolder as a first-class typed entity; a category is just an intermediate directory in `path`.
- Does not change the per-task storage layout relative to the project file; task files still resolve against the project's resolved directory.
- Does not add a task-side `path` key; the directory contract is projects-only.

## Interfaces

### Data Interfaces

| Interface | Direction | Type / Shape / Dtype | Source or Consumer | Guarantees |
|-----------|-----------|----------------------|--------------------|------------|
| Project `path` frontmatter | in | vault-relative string | project `.md` file | blank/absent → file's parent folder |
| Discovered projects | in | `pm-project: true` files | `metadataCache` vault-wide scan | every such file is found regardless of folder |
| `createProject(dir, …)` | in | caller-supplied directory | modal / command | file written under `dir`; `path` persisted |

### Dependencies

| Dependency | Interface | Failure behavior |
|------------|-----------|-----------------|
| Obsidian `metadataCache` | frontmatter scan | files without `pm-project: true` are ignored |
| `PMSettings` projects-folder | default seed only | absent/blank → modal seeds a sensible default |

## Domain Constraints

| Constraint | Value | Scope | Rationale |
|------------|-------|-------|-----------|
| Do not touch | per-task storage layout relative to the project file | all-IBs | Non-goal per INT-014 |
| Read path | resolve project dir from `path` frontmatter, else file parent folder | all-IBs | legacy fallback (R11) |

## Business Rules

1. **general** A project whose frontmatter sets `path: <dir>` resolves its directory to `<dir>`, not the global folder. (R8)
2. **general** A project with no `path` key resolves to its file's actual parent folder. (R11)
3. **general** Discovery finds every `pm-project: true` file anywhere in the vault. (R9)
4. **general** `createProject` writes the new project file into the caller-supplied directory and persists that directory as `path`. (R10)

## Failure Behavior

| Failure | Detection | Assertion type | Behavior | Recovery |
|---------|-----------|---------------|----------|----------|
| `path` points to a non-existent directory on create | vault write error | raise | surface the write error; project not created | user picks a valid directory |
| Legacy project with no `path` | absence of key | assert | The project's directory resolves to its file's actual parent folder, so legacy projects with no `path` key keep loading and rendering exactly as before (R11) rather than disappearing from discovery. | none needed |

## Open Issues

- none

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | WS authored at ACCEPTED under INT-014 `--decompose` (acceptance criteria = R8–R11 in `src/intention.test.ts`). | Claude (engineer-directed) |
