# INT-018: Harden the cold-load path so an AI agent can author whole projects with its own stable ids

## Status

IMPLEMENTING

## Intent type

feature

## Autonomy

full-auto

## Risk Tier

concurrency

## Branch

`int/INT-018-agent-authored-id-authority`

## Mission

none

## Source

Engineer requirement captured mid-run in a full-auto session on 2026-07-16: "sixth intent, agent-authored ID authority, autopilot through specification." The plugin already accepts an agent-supplied `id` verbatim and mints one only when the field is blank — but that minting lives **only** on the live create/modify ingest path (`ingestExternalTask`). A project opened COLD (folder-load) does not mint, dedupe, or validate ids, which makes an agent-authored nested structure (milestones / subtasks / dependencies keyed by the agent's own ids) unsafe. Acceptance (PROPOSED → ACCEPTED) pre-authorized by the engineer for this session ("engineer-directed, full-auto authority 2026-07-16"). Behavioural contracts pinned in `src/intention.test.ts` requirements R29–R32 (authored in parallel by the test worker; the assertions land red-first).

## Superseded-By

none

## Created

2026-07-16

## Modified

2026-07-16

## Linked Architecture Elements

- AE-001: Task & Project Persistence Store — this Intent adds an id-authority responsibility to the store's COLD load path (`loadTasksFromFolder` / `loadTaskFile` / `mapRawToTask`, mirroring the mint already present on `ingestExternalTask`): a blank/absent `id` is minted; a duplicate id is resolved keep-first with the collider re-minted; an id outside the safe charset/length is normalized or re-minted. Every such change is persisted back to the file (`processFrontMatter`) and `markSelfWrite`-marked so it does not echo back through the ingest listeners. It rides inside the existing dirty-tracking / self-write-suppression machinery and does not change task↔project association (still folder-based) or the minted-id format.
- AE-006: Plugin Entry, Settings & Lifecycle — a duplicate/invalid id that the store re-mints on load is surfaced to the user through the plugin's notification lifecycle (a `Notice` warning) rather than being silently dropped, so a collision that touched agent-authored data is visible.

## Motivation

The engineer co-authors projects with an AI collaborator that writes the vault's Markdown files directly. INT-013 gave the live ingest path (`ingestExternalTask`) the ability to backfill a blank id and validate a task on create/modify. But the moment a project is opened cold — the ordinary folder-load that runs on plugin start or when a leaf is restored — none of that runs:

1. **Blank-id minting is not uniform.** `mapRawToTask` passes `id: r.id` straight through and `makeTask` spreads the overrides *after* its `makeId()` default, so a blank/absent id loads as `undefined`/`''`. The task appears in memory with no stable id and the file is never repaired, so the id is not stable across reloads.
2. **Duplicate ids silently last-win.** `taskMap.set(task.id, task)` (ProjectStore) and the `TaskIndex` map both last-write-win, so two agent-authored files that share an id drop one task with no warning — data loss inside a structure the agent believes it authored.
3. **Ids are accepted unvalidated.** An arbitrary id string is used verbatim even though ids flow into slugs and filenames, so a value containing a path separator or an oversized value is a latent filename hazard.

The cost of not closing these gaps is that an AI agent cannot safely author a whole project offline (with its own ids and parent/child references) and trust the plugin to load it losslessly and stably.

## Desired Outcome

On every load path — the cold folder-load as well as the live ingest path — every task ends up with a stable, safe, unique id:

- A blank/absent id is minted and the mint is **persisted** back into the file's frontmatter (`processFrontMatter`), `markSelfWrite`-marked so the resulting modify event is not re-ingested (R29).
- Two files that share an id both survive: the first is kept, the collider is re-minted (persisted), and the collision is surfaced via a notifier warning — never a silent drop (R30). A re-minted id keeps its parent nesting intact; a nested (parentId-referenced) child whose id was blank is minted without being detached from its parent (R31).
- An id that violates the pinned safety rule (`^[A-Za-z0-9._-]{1,64}$` — safe slug/filename charset, non-empty, ≤ 64 chars) is treated exactly like a collision: normalized or re-minted, persisted, and warned; load never crashes (R32).

Association stays folder-based, the minted-id format is unchanged, and no id scheme is forced on the agent.

## Non-Goals

- No change to task↔project association — it stays folder-based (a file under `<Name>_tasks/` belongs to that project), not id-based.
- No change to the minted-id format (`makeId`) or a requirement that agents adopt any particular id scheme.
- No up-front migration pass that rewrites every existing file; id repair is applied as each project is loaded.
- No new public store method — the behavior is added inside the existing cold-load surface (`loadProject` / `loadTasksFromFolder`) and a private validation helper; the intention test probes `loadProject`'s observable behavior, not a new method.
- No change to the live `ingestExternalTask` mint/validate behavior beyond sharing the new id-authority helper (INT-013 / INT-017 contracts preserved).

## Type-specific required fields

### `feature` — Desired Outcome

The new behaviour is user-observable and contract-pinned: (R29) a cold-loaded task with a blank id gains a minted id in memory and on disk (self-write-marked); (R30) two files sharing an id both survive load — one re-minted, no silent drop; (R31) a nested (parentId) child with a blank id is minted while staying nested under its parent, and its persisted parentId still resolves; (R32) a path-separator or oversized id is normalized/re-minted (never used verbatim as a slug/filename) and load does not crash. See the Desired Outcome above for the full user-facing narrative.

## Components affected

- `src/store/YamlHydrator.ts`
- `src/store/ProjectStore.ts`
- `src/store/TaskIndex.ts`
- `src/types.ts`
- `src/intention.test.ts`

*Distinct from Linked Architecture Elements.* Components describe blast radius (where the diff lands); the AE describes spec-graph shape (which architectural slice this Intent revises).

## Coverage report

*Populated by `--analyze` (2026-07-16). Gaps surfaced comparing the Desired Outcome against the current persistence-store corpus; all resolved in-Intent.*

| Gap | Source | Resolution | Status |
| --- | --- | --- | --- |
| The cold folder-load path never mints a blank id, dedupes a duplicate id, or validates an id — only the live `ingestExternalTask` path does | analyze — Desired Outcome vs `src/store/ProjectStore.ts` (`loadTasksFromFolder`) / `src/store/YamlHydrator.ts` (`mapRawToTask`) | Resolve in this Intent: add id authority (mint blank, keep-first/re-mint collider, normalize/re-mint invalid) to the cold-load path, persisted + self-write-marked (R29–R32) | open |
| A duplicate/invalid id is resolved silently, so agent-authored data can be dropped or corrupted with no user signal | analyze — data-safety requirement vs `taskMap.set` (ProjectStore) / `buildTaskIndex` (TaskIndex) | Resolve in this Intent: surface a re-mint via the plugin notifier (a `Notice` warning) so a collision that touched authored data is visible (R30) | open |

## Size assessment

*Populated by `--analyze`. Hard caps per Decision #5.*

| Cap | Limit | Measured | Verdict |
| --- | --- | --- | --- |
| Implementation Units (IBs / direct beads) | ≤ 3 | 1 (IB-006) | PASS |
| Components affected | ≤ 3 | 5 globs (see note — one atomic "cold-load id authority" surface) | PASS (accepted-with-justification, over cap) |
| New L1 artifacts (AEs) | ≤ 1 | 0 (AE-001 + AE-006 revised only) | PASS |
| New + revised L2 artifacts (WSes + ICs) | ≤ 3 | 1 (WS-006; no IC) | PASS |
| Coverage gaps | ≤ 2 | 2 (both resolved in-Intent) | PASS |

*Component-cap justification (delegated authority, 2026-07-16):* the five globs are the mandatory atomic surface for one cohesive capability — "make the cold-load path authoritative over ids." Minting must touch the hydrator (`YamlHydrator.ts` / `mapRawToTask`) that produces the blank id and the load orchestration (`ProjectStore.ts`) that owns the task map, persistence, self-write marking, and the notifier; dedup must touch the id map in `TaskIndex.ts` / `ProjectStore.ts`; the id-validity rule is a shared helper; the intention test (`src/intention.test.ts`) pins R29–R32. Splitting mint-from-dedup would ship a load path that mints blank ids but still silently drops collisions (the exact data-loss bug), so the capability count is one. Recorded as an accepted deviation, not a silent pass.

## Layer impact analysis

*Populated by `--analyze`. WS-fan-in per IU in the footnote (consumed by `--decompose`).*

| Layer | Artifact | Action |
| --- | --- | --- |
| L1 (Architecture & Decisions) | AE-001, AE-006 | revise |
| L2 (Specification) | WS-006 (agent-authored-id-authority) | new |
| L3 (Implementation) | IB-006 (agent-authored-id-authority) | new |
| L4 (Construction) | Done-When task list in IB-006 (no dekbeads CLI in repo) | new |

*WS-fan-in per IU (analyze Step 7): IU-1 draws from WS-006 only (fan-in = 1). Blank-id minting, keep-first collision dedup, and id validation are one atomic IU authored as a single WS/IB pair.*

## Verification

*Type-default `feature` predicate, finalized at `--analyze` (2026-07-16). `check:submission` is retained because the diff lands in the plugin under the obsidianmd submission ruleset. The intention-contract check exercises R29–R32 (blank-id mint + persist, keep-first collision dedup, nested-child mint, invalid-id normalization).*

```yaml
# Verification predicate for INT-018 (feature). All checks must pass for --testpass.
verification:
  - name: typecheck-lint-format-clean
    cmd: pnpm check
  - name: submission-lint-clean
    cmd: pnpm check:submission
  - name: full-suite-green
    cmd: pnpm test
  - name: intention-contract-r29-r32
    cmd: vitest run src/intention.test.ts
```

## Outcome Verification

On a project opened cold: a task file with no `id` loads with a minted id in memory and that id is written back to the file's frontmatter, self-write-marked (R29); two task files sharing `id: dup-1` both appear in the tree — one keeps `dup-1`, the other is re-minted to a distinct id, and both files carry distinct ids on disk (R30); a parentId-referenced child authored with a blank id is minted while remaining nested under its parent, and its persisted `parentId` still resolves to the parent (R31); a task whose id contains a path separator or exceeds 64 chars loads without crashing and its resolved id satisfies `^[A-Za-z0-9._-]{1,64}$` on disk (R32). These are the R29–R32 contracts in `src/intention.test.ts`; they land red-first (cold-load mint/dedup/validate absent) per ADR-029 and are made green by the implementation without weakening any other test. `outcome_verification_grandfathered: false`.

## Open Issues

- [x] **RESOLVED (2026-07-16):** Id-validity rule pinned — an id is valid iff it matches `^[A-Za-z0-9._-]{1,64}$` (safe slug/filename charset, non-empty, ≤ 64 chars). A violating id (path separators `/`/`\`, whitespace, other punctuation, or length > 64) is treated exactly like a collision: normalized or re-minted, persisted, and warned. Chosen because ids flow into slugs/filenames, so the charset must be filename-safe and bounded. — **Source:** analyze — **Severity:** `P2` (cleared)
- [x] **RESOLVED (2026-07-16):** Collision policy pinned — keep-first, re-mint the collider (persisted), surface via a notifier warning. Deterministic keep-first avoids re-minting a stable id that other files already reference; the warning prevents a silent drop. — **Source:** analyze — **Severity:** `P2` (cleared)
- [x] **RESOLVED (2026-07-16):** Five-glob component list assessed as accepted-with-justification, not split (one atomic cold-load-id-authority capability; see Size assessment note). — **Source:** analyze — **Severity:** `P3` (cleared)

## TESTFAIL records

| Date | Failed check | Detail | Resolution |
| --- | --- | --- | --- |
| — | — | TBD — no failures recorded yet | — |

## Amendment Log

| Date | Type | Change | Author |
| --- | --- | --- | --- |
| 2026-07-16 | Substantive | Intent authored; inline `--analyze` performed against the pinned R29–R32 contract (Coverage/Size/Layer/Verification populated); id-validity rule (`^[A-Za-z0-9._-]{1,64}$`) and keep-first/re-mint collision policy pinned; 5-glob component cap accepted-with-justification (atomic cold-load-id-authority surface), all other caps PASS. Created at PROPOSED with acceptance pre-authorized by the engineer ("engineer-directed, full-auto authority 2026-07-16"). | Claude (INT-018 spec worker) |
| 2026-07-16 | Substantive | Promoted PROPOSED to ACCEPTED via /write-intent --accept. Engineer acceptance pre-authorized for full-auto session 2026-07-16 ("engineer-directed, full-auto authority 2026-07-16", recorded in Source); that recording is the authorization cited here. No dekbeads CLI in repo — bead authoring gate deferred to IB Done-When task lists at --decompose. | Claude (INT-018 spec worker, pre-authorized) |
| 2026-07-16 | Substantive | Decomposed into 1 IU (1 IB, 0 direct beads): WS-006 + IB-006. No dekbeads CLI in repo — bead work captured as IB Done-When task lists. ACCEPTED to IMPLEMENTING via /write-intent --decompose. Intention-test contract (R29–R32) authored red-first in parallel. Implementation (TDD against R29–R32) and land handed to the coding session. | Claude (INT-018 spec worker) |
