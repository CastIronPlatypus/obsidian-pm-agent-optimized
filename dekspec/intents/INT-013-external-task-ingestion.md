# INT-013: Ingest externally-authored task files with automatic ID backfill

## Status

LOCKED

<!--
Status is DRAFT by authoring-agent policy: creation defaults to DRAFT and the
Analyse gate (`/write-intent --analyze`) is what walks DRAFT -> PROPOSED after
populating the Coverage report, Size assessment, Layer impact analysis, and
Verification predicate below. The launching session requested PROPOSED and
stated that acceptance was pre-authorized by the engineer in full-auto session
2026-07-16, but supplied no `--analyzed` evidence bundle (no populated
coverage/size/layer/verification). Per the refuse-typed policy, PROPOSED-at-
creation was declined; the pre-authorization is recorded here and in the
Amendment Log so the Accept step can honour it once `--analyze` closes the TBDs.
-->

## Intent type

feature

## Autonomy

manual

## Risk Tier

concurrency

## Branch

`int/INT-013-external-task-ingestion`

## Mission

none

## Source

Engineer task file, full-auto session 2026-07-16 (manual authoring). Acceptance pre-authorized by the engineer for this session; see Amendment Log.

## Created

2026-07-16

## Modified

2026-07-16

## Linked Architecture Elements

- AE-001: Task & Project Persistence Store — adds an external-file ingestion + ID-backfill responsibility to the store: detecting foreign `pm-task` files that appear under a project's `<Name>_tasks/` folder, backfilling `id` and other required frontmatter onto disk via `processFrontMatter` with `markSelfWrite`, resolving blank fields to defaults, and wiring the ingested tasks into `taskIds` / parent `subtaskIds` ordering — all inside the existing dirty-tracking and self-write-suppression machinery so the store does not re-ingest its own writes.
- AE-006: Plugin Entry, Settings & Lifecycle — extends the vault `create` / `modify` event subscriptions owned at the plugin-lifecycle boundary and routes qualifying events to the store's ingestion path; the self-write-suppression window must span this wiring so store-originated writes never round-trip back through ingestion.

## Motivation

The engineer co-authors projects with an AI collaborator that manipulates the vault's Markdown files directly, while the human works through the plugin's Table, Gantt, and Kanban views. Today those two workflows do not meet: when a task or milestone file is dropped into a project's `<Name>_tasks/` folder by hand or by an agent — even with correctly-shaped frontmatter — the plugin never notices it. `ProjectStore` loads and maintains tasks it created, but has no path that recognizes a foreign `pm-task` file, so the manually-added file is simply invisible to every view. The person planning the project cannot see, schedule, or track work their collaborator added, and has to re-create each task through the UI to make it real to the plugin.

The underlying gap is that ingestion is implicit in file *creation through the store* rather than in file *presence on disk*. Direct-file collaboration is a first-class use case for this engineer, and the cost of not closing the gap is a permanently split source of truth: the vault says one thing, the plugin shows another. This Intent commits the store to treating the tasks folder — not just its own mutators — as the authority on what tasks exist.

## Desired Outcome

When a well-formed `pm-task` file appears in a project's `<Name>_tasks/` folder — created or modified outside the plugin — the plugin recognizes it, backfills whatever is required to make it a fully-formed task (a unique `id` first, plus any other required frontmatter, with blank fields resolving to their defaults) by writing those values back into the file on disk, and wires it into the project's ordering so it shows up in the Table, Gantt, and Kanban views without the user re-creating it through the UI. Files with malformed frontmatter are left untouched and never crash the load, and the store's own writes are never mistaken for external additions.

## Non-Goals

- No new authoring or editing UI for external files — this Intent makes externally-authored files *visible and complete*, it does not add a "manual add" affordance to the views (that already exists through the modals).
- No two-way conflict-resolution or merge protocol for simultaneous plugin-and-agent edits of the *same* task file beyond the existing self-write suppression window; concurrent-edit reconciliation is out of scope.
- No change to the on-disk file layout, the frontmatter schema, or the YAML parser's accepted shapes — ingestion consumes the *existing* format; it does not extend it.
- No backfill of files outside a recognized project's `<Name>_tasks/` folder (loose files elsewhere in the vault are not ingested).

## Type-specific required fields

### `feature` — Desired Outcome

The Desired Outcome above states the new behavior in user-observable terms: externally-authored, well-formed `pm-task` files become visible, complete, and ordered in all three views without manual re-entry, while malformed files are ignored and store self-writes are not re-ingested.

## Components affected

- `src/store/**`
- `src/main.ts`
- `src/**/*.test.ts`

*Note (resolved at `--analyze`, 2026-07-16): the intention-test surface `src/intention.test.ts` (encoding requirements R1–R7) is authored in parallel by another worker and was still absent from the tree at analyze time. Rather than add a non-resolving glob, the confinement set carries `src/**/*.test.ts` (which resolves to the existing colocated test files and will cover `src/intention.test.ts` once it lands). This keeps every glob resolving to an existing path while pinning the intention-test surface into the diff-confinement set.*

## Coverage report

*Populated by `--analyze` (2026-07-16). Gaps surfaced comparing the Desired Outcome against the current store/lifecycle corpus; all resolved in-Intent (no deferrals).*

| Gap | Source | Resolution | Status |
| --- | --- | --- | --- |
| No load path recognizes a foreign `pm-task` file present on disk but not created through the store | analyze — Desired Outcome vs `ProjectStore` load path | Resolve in this Intent: add an ingestion path keyed off vault `create`/`modify` events for files under `<Name>_tasks/` | open |
| No id/required-field backfill-to-disk exists for externally-authored task files | analyze — Desired Outcome vs `YamlHydrator`/`ProjectStore` write path | Resolve in this Intent: backfill unique `id` first + defaults via `processFrontMatter`, marked `markSelfWrite` | open |

## Size assessment

*Populated by `--analyze`. Hard caps per Decision #5.*

| Cap | Limit | Measured | Verdict |
| --- | --- | --- | --- |
| Implementation Units (IBs / direct beads) | ≤ 3 | 1 (IB-001) | PASS |
| Components affected | ≤ 3 | 3 (`src/store/**`, `src/main.ts`, `src/**/*.test.ts`) | PASS |
| New L1 artifacts (AEs) | ≤ 1 | 0 (AE-001, AE-006 revised only) | PASS |
| New + revised L2 artifacts (WSes + ICs) | ≤ 3 | 1 (WS-001; no IC) | PASS |
| Coverage gaps | ≤ 2 | 2 (both resolved in-Intent) | PASS |

## Layer impact analysis

*Populated by `--analyze`. WS-fan-in per IU recorded in the footnote below (consumed by `--decompose`).*

| Layer | Artifact | Action |
| --- | --- | --- |
| L1 (Architecture & Decisions) | AE-001, AE-006 | revise |
| L2 (Specification) | WS-001 (external-task-ingestion) | new |
| L3 (Implementation) | IB-001 (external-task-ingestion) | new |
| L4 (Construction) | Done-When task list in IB-001 (no dekbeads CLI in repo) | new |

*WS-fan-in per IU (analyze Step 7): IU-1 draws from WS-001 only (fan-in = 1). A single-WS IU; `--decompose` still authors IB-001 to carry the file plan + test plan for the coding session.*

## Verification

*The TESTPASS predicate. Scaffolded at DRAFT from the feature-type defaults; `--analyze` will refine and add ingestion-specific checks (R1–R7 from `src/intention.test.ts`).*

```yaml
# Verification predicate for this Intent (feature). Finalized at --analyze
# (2026-07-16). The intention-contract check exercises R1-R7 (detect, load,
# backfill id, defaults, ordering, malformed-ignored, no self-reingest) once
# src/intention.test.ts lands (authored in parallel).
verification:
  - name: typecheck-lint-format-clean
    cmd: pnpm check
  - name: full-suite-green
    cmd: pnpm test
  - name: intention-contract-r1-r7
    cmd: vitest run src/intention.test.ts
```

### Testpass results (2026-07-16)

Diff confinement: the ingestion work shipped on `main` via direct commits (this repo has no `int/` branch corpus and no dekbeads tracker), so the branch-diff and bead-closure gates of `--testpass` are N/A; the Intent locks via ADR-017 Path B (all downstream WS/IC/IBs ≥ ACCEPTED). Verification predicate re-evaluated from `main`:

| Check | Cmd | Result |
| --- | --- | --- |
| typecheck-lint-format-clean | `pnpm check` | PASS (exit 0) |
| full-suite-green | `pnpm test` | PASS (255 passed, 1 skipped) |
| intention-contract-r1-r7 | `vitest run src/intention.test.ts` | PASS (20 passed, 1 skipped) |

## Outcome Verification

The single user-observable outcome test: a well-formed `pm-task` file dropped into a loaded project's `<Name>_tasks/` folder with a blank `id` is, after ingestion, loaded into the project tree with a backfilled unique `id` written to disk and a slot in `taskIds`, and appears in the Table view. Asserted by the R1–R7 cases in `src/intention.test.ts` (authored in parallel; landed red-first per ADR-029 — the file is absent at analyze time, so the assertion starts red and is made green by the ingestion implementation). `outcome_verification_grandfathered: false`.

## Open Issues

*No blocking issues. Coverage gaps enumerated above are resolved in-Intent.*

## TESTFAIL records

*Captured-failure log on the IMPLEMENTING → TESTPASS path. None yet.*

| Date | Failed check | Detail | Resolution |
| --- | --- | --- | --- |
| TBD | TBD | TBD — populated by --testpass on failure | TBD |

## Post-implementation sync

*Synced 2026-07-16 (land step). Work merged to `main`; no tail items outstanding.*

- [x] Ingestion path implemented and wired to vault create/modify events (folded into the F3 live-event wiring at `registerCacheInvalidation`).
- [x] Verification predicate green from `main` (see Testpass results).
- [x] Linked AEs (AE-001, AE-006) raised to ACCEPTED so no status inversion remains.
- [x] No frontmatter/layout schema changes shipped (Non-Goals held).

## Amendment Log

| Date | Type | Change | Author |
| --- | --- | --- | --- |
| 2026-07-16 | Editorial | Intent created at DRAFT from engineer task file (full-auto session). PROPOSED-at-creation requested with pre-authorized acceptance, but declined for lack of an `--analyzed` evidence bundle; pre-authorization recorded for the Accept step post-analyze. | Claude (intent-authoring agent) |
| 2026-07-16 | Substantive | Analyze gate: closed Coverage/Size/Layer/Verification; added src/**/*.test.ts to confinement; all caps PASS. DRAFT to PROPOSED via /write-intent --analyze. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Promoted PROPOSED to ACCEPTED via /write-intent --accept. Engineer acceptance pre-authorized for full-auto session 2026-07-16 (recorded in Source / Amendment Log); that recording is the authorization cited here. No dekbeads CLI in repo — bead authoring gate deferred to IB Done-When task lists at --decompose. | Claude (engineer-directed, pre-authorized) |
| 2026-07-16 | Substantive | Decomposed into 1 IU (1 IB, 0 direct beads): WS-001 + IB-001. No dekbeads CLI in repo — bead work captured as IB Done-When task lists. ACCEPTED to IMPLEMENTING via /write-intent --decompose. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | All Verification checks green from main (pnpm check exit 0; pnpm test 255 passed/1 skipped; vitest src/intention.test.ts 20 passed/1 skipped R1-R7). Branch-diff/bead gates N/A — work shipped on main, no int/ branch or dekbeads corpus. IMPLEMENTING to TESTPASS via /write-intent --testpass. | Claude (U12 land agent) |
| 2026-07-16 | Substantive | Locked via ADR-017 Path B — all downstream WS-001/IB-001 >= ACCEPTED. Linked AEs AE-001/AE-006 raised to ACCEPTED (status-inversion cleared). TESTPASS to LOCKED via /write-intent --lock. | Claude (U12 land agent) |
