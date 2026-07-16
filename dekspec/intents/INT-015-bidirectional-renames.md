# INT-015: Keep item names and their vault file/folder names in sync bidirectionally

## Status

IMPLEMENTING

## Intent type

feature

## Autonomy

manual

## Risk Tier

concurrency

## Branch

`int/INT-015-bidirectional-renames`

## Mission

none

## Source

manual — engineer requirement captured in full-auto session 2026-07-16. Maps to intention-test requirements R12–R15 in `src/intention.test.ts` (authored in parallel). The engineer pre-authorized *acceptance* (PROPOSED → ACCEPTED) for this session; that authorization is recorded here for the `--accept` step and does not substitute for the Analyse gate, so this Intent is created at DRAFT (Coverage / Size / Layer / Verification not yet measured).

## Created

2026-07-16

## Modified

2026-07-16

## Linked Architecture Elements

- AE-001: Task & Project Persistence Store — this Intent adds a new responsibility to the store: mapping an inbound vault rename (old path → the loaded `Project`/`Task` object) onto a name update, renaming an item's file/folder through the vault API on an outbound name change, marking those outbound renames as self-writes so they do not echo, and re-binding a project's tasks when its `<Name>_tasks` folder is renamed. This materially shapes the store's file-naming/renaming boundary and its self-write suppression window.
- AE-012: Project/Dashboard View Orchestration — this Intent shapes the vault `rename` file-change listener path these views already own: a `rename` event must resolve old → new path to the loaded item and drive a name update / in-place refresh rather than a "Project not found" reload, while continuing to skip the store's own self-writes via `consumeSelfWrite`.
- AE-006: Plugin Entry, Settings & Lifecycle — this Intent may require a plugin-level (composition-root) `vault.on('rename')` registration so folder/file renames performed in Obsidian's file explorer are caught even when no `ProjectView` for the affected project is currently open. This shapes the entry point's event-registration surface.

## Motivation

A user managing projects in this plugin works in two places at once: the plugin's own views (where they edit a project, task, or milestone name) and Obsidian's file explorer (where the same items are plain Markdown files and folders — `Projects/<Name>.md`, `Projects/<Name>_tasks/<slug>.md`). Today those two surfaces drift apart. If the user renames a project folder in the file explorer, the plugin's in-memory and persisted project name goes stale — the view keeps showing the old name, or the project reads as "not found". If instead the user renames the project inside the plugin, the folder on disk keeps its old name, so the displayed name and the vault layout no longer agree. The same divergence hits tasks and milestones whenever their backing file is renamed either way.

The cost of leaving this is concrete: name drift that confuses the user about which item is which, a "not found" dead-end after a perfectly reasonable file-explorer rename, and — most damaging — a renamed `<Name>_tasks` folder that silently detaches a project's tasks, because the task files no longer sit under the path the project expects. Because every item is a plain file by design (no external service), the file system *is* a first-class editing surface, and the plugin must treat a rename there as equivalent to a rename in its own UI. There is no artifact today committing the plugin to that equivalence.

## Desired Outcome

Renaming an item's backing file or folder — a project folder, a task file, or a milestone file — through Obsidian updates that item's name both in memory and in its persisted title, and renaming any of those items inside the plugin renames its backing file/folder through the vault API. The two directions stay consistent for projects, tasks, and milestones, plugin-initiated renames are marked as self-writes so the resulting vault event does not re-trigger a second rename or write (no echo loop), and renaming a `<Name>_tasks` folder leaves its tasks still attached to their project.

## Non-Goals

- Not renaming or relocating the top-level `Projects/` folder itself, or handling a vault-root move — only per-item files/folders inside the established layout.
- Not changing the on-disk storage layout (`Projects/<Name>.md`, `Projects/<Name>_tasks/<slug>.md`, `Archive/`, per-task `attachments/`); this Intent keeps the layout and only keeps names in sync within it.
- Not resolving concurrent/external rename conflicts beyond the store's existing self-write window semantics; hardening against sync races is out of scope.
- Not adding new rename UI affordances — this wires the existing name-edit paths and the vault `rename` event, it does not design a new rename surface.

## Type-specific required fields

### `feature` — Desired Outcome

(No additional required field beyond the Desired Outcome above. The Desired Outcome describes the new behavior in user-observable terms: a rename on either surface — file explorer or plugin UI — is reflected on the other, for projects, tasks, and milestones, without echo loops and without detaching tasks.)

## Components affected

- `src/store/**`
- `src/views/**`
- `src/main.ts`
- `src/**/*.test.ts`

*Note: the parallel-authored `src/intention.test.ts` (requirements R12–R15) is the Outcome Verification surface for this Intent; it is covered by the `src/**/*.test.ts` glob once it lands. The four globs above exceed the ≤3 component cap by one. Assessed at `--analyze` (2026-07-16) as **acceptable-with-justification, not split** (see Size assessment note): the four globs are the natural layers of one cohesive capability — bidirectional rename — (store rename/self-write, view rename listener, plugin-level rename registration, and the intention-test surface), not four independent capabilities. Splitting inbound from outbound would fracture a single self-write-suppression invariant across two Intents and is judged higher-risk than the one-over-cap.*

## Coverage report

*Populated by `--analyze` (2026-07-16). Completeness gaps surfaced comparing the Desired Outcome against the store/view/lifecycle corpus; all resolved in-Intent.*

| Gap | Source | Resolution | Status |
| --- | --- | --- | --- |
| No inbound path maps a vault `rename` event (old path → loaded item) onto a name update; renames read as "not found" | analyze — Desired Outcome vs `ProjectView` rename listener + store | Resolve in this Intent: old→new path lookup drives an in-memory + persisted name update (R12/R15) | open |
| No outbound path renames the backing file/folder through the vault API when an item is renamed in the plugin, nor marks it self-write | analyze — Desired Outcome vs store rename boundary | Resolve in this Intent: rename via `FileManager`/`Vault`, marked `markSelfWrite` to suppress the echo (R13/R14) | open |

## Size assessment

*Populated by `--analyze`. Hard caps per Decision #5. Component cap exceeded by one and accepted-with-justification (see note) rather than split.*

| Cap | Limit | Measured | Verdict |
| --- | --- | --- | --- |
| Implementation Units (IBs / direct beads) | ≤ 3 | 1 (IB-003) | PASS |
| Components affected | ≤ 3 | 4 (`src/store/**`, `src/views/**`, `src/main.ts`, `src/**/*.test.ts`) | PASS (accepted-with-justification, +1 over cap) |
| New L1 artifacts (AEs) | ≤ 1 | 0 (AE-001, AE-006, AE-012 revised only) | PASS |
| New + revised L2 artifacts (WSes + ICs) | ≤ 3 | 1 (WS-003; no IC) | PASS |
| Coverage gaps | ≤ 2 | 2 (both resolved in-Intent) | PASS |

*Component-cap justification (delegated authority, 2026-07-16):* the four globs are one cohesive capability — bidirectional rename — decomposed only by the plugin's own layering (store rename + self-write, view rename listener, plugin-level `vault.on('rename')` registration, and the intention-test surface). They are a single IU family (one WS, one IB), not four capabilities. Splitting inbound from outbound would fracture the self-write-suppression invariant (an outbound rename must be marked self-write so the inbound listener does not echo it) across two Intents, which is materially higher-risk than the one-over-cap. The methodology's OVERSIZED flow is reserved for genuine multi-capability umbrellas; this is not one. Recorded as an accepted deviation, not a silent pass.

## Layer impact analysis

*Populated by `--analyze`. WS-fan-in per IU in the footnote (consumed by `--decompose`).*

| Layer | Artifact | Action |
| --- | --- | --- |
| L1 (Architecture & Decisions) | AE-001, AE-006, AE-012 | revise |
| L2 (Specification) | WS-003 (bidirectional-renames) | new |
| L3 (Implementation) | IB-003 (bidirectional-renames) | new |
| L4 (Construction) | Done-When task list in IB-003 (no dekbeads CLI in repo) | new |

*WS-fan-in per IU (analyze Step 7): IU-1 draws from WS-003 only (fan-in = 1). The three seams — inbound (R12/R15), outbound (R13/R14), and `<Name>_tasks` re-binding (R15) — are one IU sharing the self-write invariant, authored as a single WS/IB pair.*

## Verification

*The TESTPASS predicate. `--analyze` finalizes this from the feature-type default and extends it with the R12–R15 intention checks; the defaults below are placeholders for that step.*

```yaml
# Verification predicate for this Intent (feature). Finalized at --analyze
# (2026-07-16). The intention-contract check exercises R12-R15 (inbound
# rename maps + updates name, outbound rename hits vault API, self-write
# suppresses echo, <Name>_tasks folder rename keeps tasks attached).
verification:
  - name: typecheck-lint-format-clean
    cmd: pnpm check
  - name: full-suite-green
    cmd: pnpm test
  - name: intention-contract-r12-r15
    cmd: vitest run src/intention.test.ts
```

## Outcome Verification

On renaming a loaded project via the plugin, the project's folder exists at the new path and nothing remains at the old path — asserted against real filesystem state by `src/intention.test.ts` (R13). The inbound direction (R12) asserts that a vault `rename` event maps the old path to the loaded item and updates its name in memory and in its persisted title; R14 asserts the plugin-initiated rename marks a self-write so no second rename/write fires; R15 asserts renaming a `<Name>_tasks` folder keeps its tasks attached. These tests are authored in parallel in `src/intention.test.ts`; red-first (ADR-029) timing is to be confirmed at `--testpass`. This Intent is *not* grandfathered — `outcome_verification_grandfathered: false`.

## Open Issues

- [x] **RESOLVED (2026-07-16, lead under delegated authority):** A milestone is *not* a distinct file type. Milestones are ordinary task files (`Projects/<Name>_tasks/<slug>.md`, `pm-task: true`) whose frontmatter `type` field carries the value `milestone`; the storage layout is unchanged. Bidirectional rename therefore treats a milestone exactly as any task file — no milestone-specific rename path is needed. — **Source:** initial draft → resolved at `--analyze` — **Severity:** `P1` (cleared)
- [x] **RESOLVED (2026-07-16):** Component count is 4 globs, one over the ≤3 cap. Assessed as **accepted-with-justification, not split** — see the Size assessment note (one cohesive bidirectional-rename capability across natural layers; splitting would fracture the self-write-suppression invariant). — **Source:** initial draft → resolved at `--analyze` — **Severity:** `P2` (cleared)
- [x] **RESOLVED (2026-07-16):** A plugin-level (AE-006) global `vault.on('rename')` registration **is** required, so file-explorer renames are caught even when no `ProjectView` for the affected project is open. Recorded in the Layer impact analysis (AE-006 revise) and carried into WS-003 / IB-003. — **Source:** initial draft → resolved at `--analyze` — **Severity:** `P2` (cleared)
- [ ] The `<Name>_tasks` folder rename must stay consistent with the paired `Projects/<Name>.md` project file — the ordering/atomicity of renaming the folder and the project file is a concrete implementation detail pinned in IB-003 (rename the project file, then its `_tasks` folder, both marked self-write in one suppression window; R15 asserts tasks stay attached). Non-blocking; tracked into decompose. — **Source:** initial draft — **Severity:** `P3`

**Severity key:** `P0` = production-incident / cost-runaway reserve. `P1` = critical / blocking — prevents promotion. `P2` = important / approval-blocking. `P3` = advisory / tracked-only.

## TESTFAIL records

| Date | Failed check | Detail | Resolution |
| --- | --- | --- | --- |
| YYYY-MM-DD | TBD — populate at --testpass on failure | TBD | TBD |

## Post-implementation sync

- [ ] TBD — populate at --sync (MERGED)

## Amendment Log

| Date | Type | Change | Author |
| --- | --- | --- | --- |
| 2026-07-16 | Editorial | Intent created at DRAFT (feature, manual, origin: manual). Acceptance pre-authorized by engineer for full-auto session 2026-07-16; recorded for `--accept`. Created at DRAFT rather than PROPOSED because no `--analyzed` evidence bundle (Coverage / Size / Layer / Verification) was supplied. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Analyze gate: closed Coverage/Size/Layer/Verification; P1 milestone question resolved (milestone = task with type:milestone, layout unchanged); component cap +1 accepted-with-justification (not split); plugin-level rename registration confirmed. DRAFT to PROPOSED via /write-intent --analyze. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Promoted PROPOSED to ACCEPTED via /write-intent --accept. Engineer acceptance pre-authorized for full-auto session 2026-07-16 (recorded in Source / Amendment Log); that recording is the authorization cited here. No dekbeads CLI in repo — bead authoring gate deferred to IB Done-When task lists at --decompose. | Claude (engineer-directed, pre-authorized) |
| 2026-07-16 | Substantive | Decomposed into 1 IU (1 IB, 0 direct beads): WS-003 + IB-003. No dekbeads CLI in repo — bead work captured as IB Done-When task lists. ACCEPTED to IMPLEMENTING via /write-intent --decompose. | Claude (engineer-directed) |
