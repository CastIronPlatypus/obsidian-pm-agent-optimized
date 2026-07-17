# Implementation Brief: `pm` CLI — declarative apply + batch

**Spec:** `dekspec/working-specs/WS-012-cli-declarative-apply-batch.md`
**Intent:** `dekspec/intents/INT-019-agent-first-pm-cli.md`
**Source AEs:** AE-013, AE-001
**Depends on:** IB-010, IB-011
**Production gate:** none
**Status:** ACCEPTED

## Goal

An agent declares a whole nested project as code and applies it idempotently: `apply <spec>` upserts by client `key` (create missing / update changed / leave equal), and a re-run of the identical spec is a NO-OP with empty `changed_ids` (R46) — proven by R46 in `cli/pm.test.ts`.

## Out of Scope

- Single-item create/patch (IB-010) and the cascade/depend wiring (IB-011) — orchestrated, not redefined.
- Any change to `src/store/**`.
- Hard-delete under `--prune` — it archives (reversible).

## Files to Modify

| File | Change |
|------|--------|
| `cli/src/commands/apply.ts` | New. Parse the spec (`yaml`); load the project by `pmKeys` (`key`→id) or by title on first run; diff each node; CREATE missing (`createProject`/`insertTask`), `updateTask` changed fields, leave equal nodes untouched; resolve deps-by-`key` to ids post-topologically; order siblings via `reorderTask`; `dir` change → `moveProject`, title change → `renameProject`; persist the `pmKeys` map. `--dry-run` prints a `+`/`~`/`-` diff + `changed_ids`, writes nothing; `--prune` archives absent tasks. Save once per touched project; one scheduler pass. |
| `cli/src/commands/batch.ts` | New. `batch < ops.ndjson`: validate every op against `pm schema` first (any invalid → `E_BATCH`, exit 9, nothing written); apply ops to the in-memory `Project` via the same tree ops, then one `saveProject` + one `scheduleAfterChange` per touched project; emit one envelope + per-op `results[]`. |
| `cli/src/commands/portable.ts` | New. `export` (emit the `apply` shape), `import` (`importNoteAsTask`), and the compact `find` query grammar over `applyTaskFilter`. |
| `cli/src/run.ts` | Extend dispatch for `apply`/`batch`/`export`/`import`. |
| `cli/pm.test.ts` | (Owned by test worker — R46 is the oracle.) |

## Reuse Inventory

| Capability | Location | Use instead of reimplementing |
|------------|----------|-------------------------------|
| Create/patch/move/reorder | IB-010 verbs + `src/store` mutators | orchestrate — `apply`/`batch` re-implement no invariant |
| Cascade + cycle guard | IB-011 schedule wiring + `wouldCreateCycle` | reuse — one pass per touched project |
| Filter engine | `applyTaskFilter` (`src/store`) | reuse for `find` |
| Import | `importNoteAsTask` (`src/store`) | reuse for `import` |

## Domain Constraints

| Constraint | Value |
|------------|-------|
| Idempotent | re-applying the identical spec is a no-op |
| Key-keyed identity | `pmKeys` map persists `key`→id |
| Prune archives | `--prune` archives, never deletes |
| Atomic batch | any invalid op aborts the whole batch; nothing written |
| One save per project | batch/apply save once per touched project |

## Do Not Touch

| Function/File | Reason |
|---------------|--------|
| `src/store/**` | orchestrate existing mutators; no invariant re-implemented |
| `cli/pm.test.ts` | owned by the test worker |

## Governing ADRs

| ADR | Title |
|-----|-------|
| none | — |

## Constraints & Decisions

- **Idempotent upsert by `key`**; `pmKeys` map persists identity across renames.
- **`--dry-run`** = Terraform-style plan; **`--prune`** archives (never deletes).
- **`batch`** is all-or-nothing (`E_BATCH`, exit 9), one save + one schedule per project.

## Test plan

- **R46:** write a spec (project + nested subtasks with `key`s); `apply` once → nested tree on real disk in the INT-020 layout, `changed_ids` non-empty; `apply` the identical spec again → `changed_ids` empty (no-op).
- **Guard:** src-scoped `pnpm test` stays green.

## Test Promotion Criteria

Promotion refs: WS-012 Rule 1 (R46) in `cli/pm.test.ts`.

## Done When

- [ ] `apply <spec>` creates the nested tree on the first run (INT-020 layout on real disk) and is a NO-OP with empty `changed_ids` on an identical re-run (R46) — verified by intention test.
- [ ] The `key`→id mapping persists (`pmKeys`); deps-by-`key` resolve post-topologically — verified by manual check.
- [ ] `--dry-run` prints the plan and writes nothing; `--prune` archives (never deletes) — verified by manual check.
- [ ] `batch` is atomic (`E_BATCH`, exit 9); one save + one schedule per touched project — verified by manual check.

## Open Issues

- [ ] `pmKeys` location (project frontmatter vs `.obsidian/` sidecar) — leaning project frontmatter behind a flag. — **Severity:** `P2`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | IB authored at ACCEPTED under INT-019 `--decompose` (phase D). No dekbeads CLI present — bead-level work captured as the Done When task list. | Claude (engineer-directed) |
