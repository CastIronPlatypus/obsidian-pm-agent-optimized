# Working Spec: `pm` CLI — dependencies, scheduling & analysis

## Status

ACCEPTED

## Created

2026-07-16

## Modified

2026-07-16

## Related Architecture Elements

- AE-013: Agent-first `pm` CLI — the dependency/scheduling/analysis phase: `depend`/`undepend`, `deps`, `schedule`, `next`, `critical-path`, `blockers`, `graph`, `validate`, `rollup`, `reconcile`, and the auto `scheduleAfterChange` cascade on every date/dependency/status mutation (`--no-cascade`/`--dry-run`).
- AE-001: Task & Project Persistence Store — reused UNMODIFIED; delegates to `wouldCreateCycle`, `computeSchedule`, `scheduleAfterChange`, the task index / dependents graph, and `handleExternalTaskChange`/`ingestExternalTask` (for `reconcile`).

## Governing ADRs

- none

## What This Does

Adds dependency and scheduling behavior over the store's scheduler, plus portfolio analysis. `depend <handle> --on <handle…>` guards each edge with `wouldCreateCycle(project.tasks, from, to)` and rejects a cycle-forming edge with `E_CYCLE` (exit 5) BEFORE writing, then `updateTask({dependencies})`; `undepend` removes edges. By default, any mutation of a date / dependency / status runs `scheduleAfterChange(project, changedId)` ONCE after the save (matching the plugin's "schedule after change"), moving downstream dependents; the moved ids are reported in `data.scheduled` (and folded into `changed_ids`). `--no-cascade` suppresses the pass; `--dry-run` computes the cascade against the in-memory tree and reports it without writing. Read/analysis: `deps <handle>` (needs/blocks graph), `next` (unblocked, non-terminal frontier ranked overdue → soonest due → priority), `schedule <project> [--apply]` (preview / apply date patches), `critical-path`, `blockers`, `graph` (`--dot`), `validate` (`--fix`: orphans, unknown palette values, cycles, dangling deps, collisions), `rollup`, and `reconcile` (route hand-authored `pm-task` files through `ingestExternalTask` for id backfill + wiring). This phase completes R45's cascade half (the `--dry-run` write-suppression half is WS-010).

**Mechanism:** This component wires the store's cycle guard + dependency scheduler behind `depend` and a post-mutation cascade, and exposes the graph the scheduler already builds as analysis views.

## What This Does NOT Do

- Does not create/patch single items (WS-010) or implement `apply`/`batch` (WS-012).
- Does not modify the scheduler or `src/store/**` — it wires the existing `wouldCreateCycle`/`computeSchedule`/`scheduleAfterChange`.
- Does not implement live `watch` change-streaming (deferred).

## Interfaces

### Data Interfaces

| Interface | Direction | Type / Shape / Dtype | Source or Consumer | Guarantees |
|-----------|-----------|----------------------|--------------------|------------|
| post-mutation cascade | out | `data.scheduled: string[]` (⊆ `changed_ids`) | agent | a date/dep/status mutation runs `scheduleAfterChange` once; downstream dependents are reported (R45 cascade half) |
| `depend <handle> --on <id>` | out | `changed_ids`; or `error.code='E_CYCLE'` (exit 5) | agent | each edge cycle-checked with `wouldCreateCycle` BEFORE writing |
| `--no-cascade` / `--dry-run` | in | flags | agent | `--no-cascade` skips the pass; `--dry-run` reports the cascade, writes nothing |
| `next` / `deps` / `critical-path` / `blockers` / `graph` | out | ranked lists / graph JSON (or DOT) | agent | derived from the task index + the dependency graph the scheduler builds |

### Dependencies

| Dependency | Interface | Failure behavior |
|------------|-----------|-----------------|
| AE-001 `wouldCreateCycle` | cycle guard | a cycle-forming edge → `E_CYCLE` (exit 5), nothing written |
| AE-001 `scheduleAfterChange` | schedule pass | a no-op when the project's config disables auto-scheduling; cyclic tasks are simply not rescheduled |
| AE-001 `computeSchedule` | schedule + `cycles[]` | cycles surfaced by `validate`/`schedule` as warnings; the store keeps working |
| AE-001 `ingestExternalTask` | reconcile backfill | a non-task/malformed file returns null (no throw) |
| WS-010 mutation verbs | the mutation being cascaded | the cascade runs after the WS-010 save |

## Domain Constraints

| Constraint | Value | Scope | Rationale |
|------------|-------|-------|-----------|
| Cycle-safe | `depend` guards with `wouldCreateCycle` before disk | all-IBs | `updateTask` does not itself reject cycles; the UI gates in the picker |
| Cascade default-on | date/dep/status mutations run one `scheduleAfterChange` | all-IBs | matches the plugin's schedule-after-change behavior |
| Cascade opt-out | `--no-cascade` skips the pass | all-IBs | deterministic control |
| Dry-run reports cascade | `--dry-run` computes + reports, writes nothing | all-IBs | safe planning |

## Business Rules

1. **general** A date / dependency / status mutation runs `scheduleAfterChange(project, changedId)` once by default; downstream dependents moved by the scheduler are reported in `data.scheduled` and folded into `changed_ids`, and the move is persisted (R45 cascade half).
2. **general** `depend <handle> --on <id>` cycle-checks each edge with `wouldCreateCycle` BEFORE writing; a cycle-forming edge is `E_CYCLE` (exit 5) with nothing written.
3. **general** `--no-cascade` suppresses the schedule pass; `--dry-run` reports the would-be cascade without writing.
4. **general** `next` returns the unblocked, non-terminal frontier (status non-terminal per the resolved palette; every dependency terminal or absent) ranked overdue → soonest due → priority.
5. **general** `validate` reports orphan/misparented tasks, unknown palette values, dependency cycles, dangling dependency ids, and filename collisions; `--fix` re-saves to materialize the self-heal. `reconcile` backfills hand-authored files via `ingestExternalTask`.

## Failure Behavior

| Failure | Detection | Assertion type | Behavior | Recovery |
|---------|-----------|---------------|----------|----------|
| Cycle-forming dependency | `wouldCreateCycle` | assert | `E_CYCLE` (exit 5), nothing written, offending path in `error.ids` | caller drops the edge |
| Auto-schedule disabled | project config | log | cascade is a no-op; `data.scheduled` empty; no error | none needed |
| Cyclic tasks in schedule | `computeSchedule` `cycles[]` | log | cyclic tasks not rescheduled; surfaced as `warnings[]` | caller breaks the cycle |

## Open Issues

- [ ] `critical-path` longest-path over the scheduler graph — designed-for; not gated by R41–R46. — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | WS authored at ACCEPTED under INT-019 `--decompose` (phase C; acceptance criteria = the cascade half of R45 in `cli/pm.test.ts`). | Claude (engineer-directed) |
