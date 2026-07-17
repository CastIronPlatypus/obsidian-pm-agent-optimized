# Implementation Brief: `pm` CLI — dependencies, scheduling & analysis

**Spec:** `dekspec/working-specs/WS-011-cli-dependencies-scheduling-analysis.md`
**Intent:** `dekspec/intents/INT-019-agent-first-pm-cli.md`
**Source AEs:** AE-013, AE-001
**Depends on:** IB-010
**Production gate:** none
**Status:** ACCEPTED

## Goal

Date/dependency/status mutations cascade through the store's scheduler and the dependency graph becomes navigable/analyzable: `set <A> due=…` runs one `scheduleAfterChange` pass, cascades the dependent B into `data.scheduled`/`changed_ids`, and persists B's move (the cascade half of R45); `depend` cycle-guards each edge — proven by R45's cascade half in `cli/pm.test.ts`.

## Out of Scope

- Single-item create/patch (IB-010); `apply`/`batch` (IB-012).
- Any change to the scheduler or `src/store/**` — this wires the existing surfaces.
- Live `watch` change-streaming (deferred).

## Files to Modify

| File | Change |
|------|--------|
| `cli/src/commands/deps.ts` | New. `depend <handle> --on <id…>` — cycle-check each edge with `wouldCreateCycle` BEFORE writing (`E_CYCLE`, exit 5), then `updateTask({dependencies})`; `undepend`; `deps <handle>` (needs/blocks). |
| `cli/src/schedule.ts` | New. The post-mutation cascade: after a date/dep/status mutation, call `scheduleAfterChange(project, changedId)` once (unless `--no-cascade`); collect the moved ids into `data.scheduled` (⊆ `changed_ids`); under `--dry-run` compute + report, write nothing. |
| `cli/src/commands/update.ts` | Wire the cascade in: after a WS-010 `set`/`due`/`status` save, invoke `cli/src/schedule.ts` (default-on). |
| `cli/src/commands/analysis.ts` | New. `next` (unblocked non-terminal frontier ranked overdue → soonest due → priority), `schedule [--apply]`, `critical-path`, `blockers`, `graph [--dot]`, `validate [--fix]`, `rollup`, `reconcile` (route hand-authored files through `ingestExternalTask`). |
| `cli/src/run.ts` | Extend dispatch for the dependency/schedule/analysis verbs. |
| `cli/pm.test.ts` | (Owned by test worker — R45 cascade half is the oracle.) |

## Reuse Inventory

| Capability | Location | Use instead of reimplementing |
|------------|----------|-------------------------------|
| Cycle guard | `wouldCreateCycle` (`src/store`) | reuse before writing a dependency edge |
| Dependency scheduler | `scheduleAfterChange` / `computeSchedule` (`src/store`) | reuse — never re-implement scheduling |
| Dependents graph / index | `TaskIndex` + `computeSchedule` (`src/store`) | reuse for `next`/`blockers`/`critical-path`/`graph` |
| External ingestion | `ingestExternalTask` / `handleExternalTaskChange` (`src/store`) | reuse for `reconcile` |

## Domain Constraints

| Constraint | Value |
|------------|-------|
| Cycle-safe | `depend` guards with `wouldCreateCycle` before disk |
| Cascade default-on | date/dep/status mutations run one `scheduleAfterChange` |
| Cascade opt-out | `--no-cascade` skips the pass |
| Dry-run reports cascade | `--dry-run` computes + reports, writes nothing |

## Do Not Touch

| Function/File | Reason |
|---------------|--------|
| `src/store/Scheduler.ts`, `src/store/**` | the scheduler runs UNMODIFIED — wire it, don't rewrite it |
| `cli/pm.test.ts` | owned by the test worker |

## Governing ADRs

| ADR | Title |
|-----|-------|
| none | — |

## Constraints & Decisions

- **Cascade default-on**, matching the plugin's schedule-after-change; `--no-cascade` opts out; `--dry-run` reports without writing.
- **`depend` cycle guard** before disk — `updateTask` itself does not reject cycles.
- **`data.scheduled`** carries the moved dependents (⊆ `changed_ids`).

## Test plan

- **R45 (cascade half):** create A (due today) + B (due today) + `set B dependencies=A`; `set A due=<+30d>`; assert `[...changed_ids, ...data.scheduled]` contains B and B's on-disk `due` moved. (The `--dry-run` write-suppression half is IB-010's.)
- **Guard:** src-scoped `pnpm test` stays green.

## Test Promotion Criteria

Promotion refs: WS-011 Rule 1 (R45 cascade half) in `cli/pm.test.ts`.

## Done When

- [ ] A date/dep/status mutation runs one `scheduleAfterChange` pass; the dependent B is cascaded into `data.scheduled`/`changed_ids` and B's move is persisted (R45 cascade half) — verified by intention test.
- [ ] `--no-cascade` suppresses the pass; `--dry-run` reports the cascade without writing — verified by manual check.
- [ ] `depend` cycle-guards each edge (`E_CYCLE`, exit 5) before disk — verified by manual check.
- [ ] `next`/`deps`/`blockers`/`validate`/`reconcile` delegate to the existing store surfaces — verified by manual check + src-scoped `pnpm test` green.

## Open Issues

- [ ] `critical-path` longest-path over the scheduler graph — designed-for; not gated by R41–R46. — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | IB authored at ACCEPTED under INT-019 `--decompose` (phase C). No dekbeads CLI present — bead-level work captured as the Done When task list. | Claude (engineer-directed) |
