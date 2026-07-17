# Working Spec: `pm` CLI — declarative apply + batch

## Status

ACCEPTED

## Created

2026-07-16

## Modified

2026-07-16

## Related Architecture Elements

- AE-013: Agent-first `pm` CLI — the declarative phase: `apply <spec>` (idempotent project-as-code upsert by client `key`, `--diff`/`--dry-run`/`--prune`), `batch` (atomic NDJSON op stream), `import`, `export`, and a compact query grammar for `find`.
- AE-001: Task & Project Persistence Store — reused UNMODIFIED; `apply`/`batch` orchestrate `createProject`/`insertTask`/`updateTask`/`moveTask`/`reorderTask`/`renameProject`/`moveProject`/`archiveTask`, saving once per touched project.

## Governing ADRs

- none

## What This Does

Ships declarative and batch mutation. `apply <spec.yaml|->` treats a whole nested project as code: each node carries a client-supplied stable `key`; on apply the CLI loads the project (by `key`→id mapping persisted in the project frontmatter under a `pmKeys` map, or matched by title on first run), diffs each node, and CREATES missing / `updateTask`s changed fields / leaves equal nodes untouched — so re-applying the identical spec is a NO-OP (idempotent upsert). Dependencies by `key` resolve to ids at apply time (post-topological, so forward refs work); sibling order follows spec order via `reorderTask`; a `dir` change triggers `moveProject`, a title change `renameProject`. `--dry-run` prints a Terraform-style diff (`+ create`, `~ update`, `- archive`) + `changed_ids`, writing nothing; `--prune` ARCHIVES (never deletes) tasks absent from the spec. `batch < ops.ndjson` applies one op per line as a single transaction with one scheduler pass + one save per touched project; any invalid op aborts the whole batch (`E_BATCH`, exit 9), nothing written. `export` emits the shape `apply` consumes (round-trip); `import` converts a note into a task; `find` gains a compact filter grammar over `applyTaskFilter`.

**Mechanism:** This component turns a whole nested project spec into an idempotent, key-keyed upsert (and an atomic op stream) over the store's mutators, saving once per touched project.

## What This Does NOT Do

- Does not modify `src/store/**` — `apply`/`batch` orchestrate existing mutators.
- Does not hard-delete under `--prune` — it archives (reversible).
- Does not implement live `watch`/`snapshot`/`restore` (deferred).

## Interfaces

### Data Interfaces

| Interface | Direction | Type / Shape / Dtype | Source or Consumer | Guarantees |
|-----------|-----------|----------------------|--------------------|------------|
| `apply <spec>` | out | `changed_ids: string[]`; `data.summary: { created, updated, unchanged, pruned }` | agent | idempotent upsert by `key`; first run creates, an identical re-run is a NO-OP (`changed_ids` empty) (R46) |
| `key`→id mapping | in/out | `pmKeys` map in project frontmatter | project file | keeps client keys stable across renames; deps by `key` resolve to ids at apply time |
| `apply --dry-run` | out | Terraform-style diff (`+`/`~`/`-`) + `changed_ids` | agent | computes the plan, writes nothing |
| `batch < ops.ndjson` | out | one envelope + per-op `results[]` | agent | single transaction, one save + one schedule per touched project; any invalid op → `E_BATCH` (exit 9), nothing written |

### Dependencies

| Dependency | Interface | Failure behavior |
|------------|-----------|-----------------|
| WS-010 create/mutate verbs | the mutators `apply`/`batch` orchestrate | reuse — `apply` re-implements no invariant |
| WS-011 cascade + cycle guard | one scheduler pass per touched project | `apply`/`batch` run the pass once, not per node |
| AE-001 `reorderTask` | sibling ordering | order follows spec order |
| `yaml` package | parse the `apply` spec | a malformed spec → usage error (exit 2), nothing written |

## Domain Constraints

| Constraint | Value | Scope | Rationale |
|------------|-------|-------|-----------|
| Idempotent | re-applying the identical spec is a no-op | all-IBs | upsert by `key`, not blind create (R46) |
| Key-keyed identity | `pmKeys` map persists `key`→id | all-IBs | keys stay stable across renames |
| Prune archives | `--prune` archives, never deletes | all-IBs | authoritative doc without data loss |
| Atomic batch | any invalid op aborts the whole batch | all-IBs | all-or-nothing; nothing written on `E_BATCH` |
| One save per project | batch/apply save once per touched project | all-IBs | fewer disk writes, one consistent schedule |

## Business Rules

1. **general** `apply <spec>` upserts a whole nested tree by client `key`: create missing, `updateTask` changed fields, leave equal nodes untouched — a re-run of the identical spec is a NO-OP with an empty `changed_ids` (R46).
2. **general** The `key`→id mapping is persisted (project-frontmatter `pmKeys`) so keys survive renames; deps by `key` resolve to ids post-topologically (forward refs work).
3. **general** `--dry-run` prints a `+ create` / `~ update` / `- archive` diff + `changed_ids` and writes nothing; `--prune` ARCHIVES (never deletes) tasks absent from the spec.
4. **general** `batch` applies one op per line as a single transaction with one schedule pass + one save per touched project; any invalid op aborts the whole batch (`E_BATCH`, exit 9), nothing written.
5. **general** `export` emits the shape `apply` consumes (export → edit → apply round-trips).

## Failure Behavior

| Failure | Detection | Assertion type | Behavior | Recovery |
|---------|-----------|---------------|----------|----------|
| Malformed spec | `yaml` parse | assert | usage error (exit 2), nothing written | caller fixes the spec |
| Invalid batch op | schema validation | assert | `E_BATCH` (exit 9), whole batch aborted, nothing written | caller fixes the op |
| Cycle in spec deps | `wouldCreateCycle` at apply | assert | `E_CYCLE` (exit 5), nothing written | caller drops the edge |
| `key` collides with two existing tasks | `pmKeys` lookup | assert | `E_AMBIGUOUS` (exit 6) listing candidates | caller disambiguates by id |

## Open Issues

- [ ] `pmKeys` location: project-frontmatter map (transparent, vault-native) vs a `.obsidian/` sidecar. Leaning `pmKeys` on the project file, behind a flag. — **Severity:** `P2`
- [ ] Query grammar scope for `find` (`due:<DATE`, `depends-on:INCOMPLETE`, `blocks:>0`, `me`) — designed-for; not gated by R41–R46. — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | WS authored at ACCEPTED under INT-019 `--decompose` (phase D; acceptance criteria = R46 in `cli/pm.test.ts`). | Claude (engineer-directed) |
