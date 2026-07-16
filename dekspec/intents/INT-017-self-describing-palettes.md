# INT-017: Materialize each project's resolved status/priority palette into its own frontmatter

## Status

IMPLEMENTING

## Intent type

feature

## Autonomy

full-auto

## Risk Tier

concurrency

## Branch

`int/INT-017-self-describing-palettes`

## Mission

none

## Source

Engineer requirement captured mid-run in a full-auto session on 2026-07-16: "clean fifth intent, autopilot, full drive to implementation." Project markdown must self-describe its legal status/priority vocabulary so an AI collaborator reading only the file knows the allowed values — today the global palette lives only in the plugin's `data.json`, and per-project `config.statuses` frontmatter exists only when a user deliberately overrides it. Acceptance (PROPOSED → ACCEPTED) pre-authorized by the engineer for this session ("user-approved autopilot 2026-07-16"). Behavioural contracts pinned in `src/intention.test.ts` requirements R22–R25 (authored in parallel by the test worker; the assertions land red-first).

## Superseded-By

none

## Created

2026-07-16

## Modified

2026-07-16

## Linked Architecture Elements

- AE-001: Task & Project Persistence Store — this Intent adds a write-through materialization responsibility to the store's save path (`serializeProject` / `doSaveProject`): on every project save the RESOLVED palette (statuses + priorities via the `configFor` fallback chain) is written into the project frontmatter `config.statuses` / `config.priorities`, tagged `config.materialized: true`, including for legacy projects that never carried a config block. It revises config-resolution semantics (`resolveProjectConfig`) so a materialized block is re-derived from the global palette on load rather than misread as a deliberate override, while genuine overrides resolve exactly as today. It also extends `ingestExternalTask` to validate an incoming `status`/`priority` against the effective palette (case-normalize a known id; preserve an unknown value). All of this rides inside the existing dirty-tracking / self-write-suppression machinery so materialization writes never round-trip back through ingestion.

## Motivation

The engineer co-authors projects with an AI collaborator that manipulates the vault's Markdown files directly. For a status value to be meaningful, the collaborator must know the project's *legal* vocabulary — which status and priority ids exist, and what they mean. Today that vocabulary is invisible from the file: the authoritative palette lives only in the plugin's `data.json` (`settings.statuses` / `settings.priorities`), and a project's frontmatter carries a `config.statuses` block **only** when the user has explicitly overridden the defaults. An AI reading a plain project file therefore has no way to learn the allowed status ids; it can only guess, and a guess that mis-cases (`Todo` for `todo`) or invents a value silently corrupts the board.

The underlying gap is that the project file is not self-describing: the single most important schema an external collaborator needs — the status/priority palette — is absent from the artifact it is editing. The cost of not closing the gap is a recurring class of ingestion errors (mis-cased or invented statuses) and a permanent asymmetry where the human's tool knows the vocabulary but the file does not.

## Desired Outcome

Every project file, after the plugin saves it, carries its effective status/priority palette in its own frontmatter — `config.statuses` and `config.priorities` listing the resolved ids (and their labels/colors), tagged `config.materialized: true` so both the resolver and a human reader can tell a materialized palette from a hand-authored override. Legacy projects that never had a config block gain one on their first save (write-through backfill). A materialized palette is **not** frozen: because it is tagged, the resolver re-derives it from the current global palette on load, so a later global-palette edit re-propagates on the next save; a genuine per-project override (untagged) still wins through `configFor` exactly as before. When an externally-authored task file is ingested, its `status`/`priority` are validated against the effective palette — a blank field resolves to the default (unchanged), a case-mismatched known id is normalized to the canonical id, and an unknown value is preserved verbatim (never destroyed) while the task still loads.

## Non-Goals

- No new palette-editing UI — this Intent makes the existing resolved palette *visible in the file*; it does not add a per-project palette editor beyond the override mechanism that already exists.
- No change to the palette *model* or the resolution *fallback chain* for genuine overrides — `resolveProjectConfig`'s override semantics are preserved unchanged (regression, R25); only materialized (tagged) blocks gain re-derivation.
- No migration pass that rewrites every existing project file up front — materialization is write-through, applied the next time each project is saved for any reason.
- No task-side palette materialization and no change to the on-disk task frontmatter schema beyond the ingestion-time normalization of the existing `status`/`priority` values.
- No destruction of unknown status/priority values on ingestion — unknown values are preserved, not coerced to a default or dropped.

## Type-specific required fields

### `feature` — Desired Outcome

The new behaviour is user-observable and contract-pinned: (R22) a saved project's frontmatter carries `config.statuses` with the effective ids and `config.materialized: true`; (R23) a legacy project with no config block gains the materialized palette on first save; (R24) ingestion normalizes a case-mismatched known status id to its canonical form and preserves an unknown value while still loading the task; (R25) an explicit per-project override still wins through `configFor` after a materialization round-trip and is not re-tagged as materialized. See the Desired Outcome above for the full user-facing narrative.

## Components affected

- `src/store/ProjectStore.ts`
- `src/store/YamlSerializer.ts`
- `src/store/YamlHydrator.ts`
- `src/store/ProjectConfig.ts`
- `src/types.ts`
- `src/intention.test.ts`

*Distinct from Linked Architecture Elements.* Components describe blast radius (where the diff lands); the AE describes spec-graph shape (which architectural slice this Intent revises).

## Coverage report

*Populated by `--analyze` (2026-07-16). Gaps surfaced comparing the Desired Outcome against the current persistence-store corpus; all resolved in-Intent.*

| Gap | Source | Resolution | Status |
| --- | --- | --- | --- |
| The project serializer writes `config` only when the user overrides it (`serializeProjectConfig` returns null otherwise), so the resolved palette never reaches the file | analyze — Desired Outcome vs `src/store/YamlSerializer.ts` | Resolve in this Intent: on save, materialize the `configFor` palette into `config.statuses`/`config.priorities` for every project, tagged `config.materialized: true` (R22/R23) | open |
| No marker distinguishes a materialized palette from a deliberate override, so a written-through palette would be frozen (future global edits would not propagate) and overrides would be indistinguishable | analyze — round-trip-safety requirement vs `resolveProjectConfig` / `hydrateProjectConfig` | Resolve in this Intent: add a `materialized` marker; the resolver re-derives materialized blocks from the global palette and preserves genuine-override semantics unchanged (R25) | open |

## Size assessment

*Populated by `--analyze`. Hard caps per Decision #5.*

| Cap | Limit | Measured | Verdict |
| --- | --- | --- | --- |
| Implementation Units (IBs / direct beads) | ≤ 3 | 1 (IB-005) | PASS |
| Components affected | ≤ 3 | 6 globs (see note — one atomic "self-describing palette" surface) | PASS (accepted-with-justification, over cap) |
| New L1 artifacts (AEs) | ≤ 1 | 0 (AE-001 revised only) | PASS |
| New + revised L2 artifacts (WSes + ICs) | ≤ 3 | 1 (WS-005; no IC) | PASS |
| Coverage gaps | ≤ 2 | 2 (both resolved in-Intent) | PASS |

*Component-cap justification (delegated authority, 2026-07-16):* the six globs are the mandatory atomic surface for one cohesive capability — "make the project file self-describe its palette." Materialization must touch the serializer (`YamlSerializer.ts`) that writes the block, the hydrator (`YamlHydrator.ts`) that reads the marker, the resolver (`ProjectConfig.ts`) that honors it, the save orchestration (`ProjectStore.ts`) that supplies the effective palette and validates ingestion, the type (`src/types.ts`) that adds the `materialized` field, and the intention test (`src/intention.test.ts`) that pins R22–R25. Splitting write-from-read would ship a materialized block no resolver understands (frozen palettes — the exact bug the marker prevents) or a marker nothing writes (dead code). The cap counts globs; the capability count is one. Recorded as an accepted deviation, not a silent pass.

## Layer impact analysis

*Populated by `--analyze`. WS-fan-in per IU in the footnote (consumed by `--decompose`).*

| Layer | Artifact | Action |
| --- | --- | --- |
| L1 (Architecture & Decisions) | AE-001 | revise |
| L2 (Specification) | WS-005 (self-describing-palettes) | new |
| L3 (Implementation) | IB-005 (self-describing-palettes) | new |
| L4 (Construction) | Done-When task list in IB-005 (no dekbeads CLI in repo) | new |

*WS-fan-in per IU (analyze Step 7): IU-1 draws from WS-005 only (fan-in = 1). The materialization write path, the marker read/resolution path, and the ingestion validation are one atomic IU authored as a single WS/IB pair.*

## Verification

*Type-default `feature` predicate, finalized at `--analyze` (2026-07-16). `check:submission` is retained because the diff lands in the plugin under the obsidianmd submission ruleset. The intention-contract check exercises R22–R25 (materialize-on-save, legacy backfill, ingestion normalization/preservation, override regression).*

```yaml
# Verification predicate for INT-017 (feature). All checks must pass for --testpass.
verification:
  - name: typecheck-lint-format-clean
    cmd: pnpm check
  - name: submission-lint-clean
    cmd: pnpm check:submission
  - name: full-suite-green
    cmd: pnpm test
  - name: intention-contract-r22-r25
    cmd: vitest run src/intention.test.ts
```

## Outcome Verification

On a project saved by the store, the on-disk frontmatter carries `config.statuses` whose ids equal the effective palette and `config.materialized: true` (R22); a legacy project with no config block gains that same materialized block on its first save (R23). On ingestion, a task file whose `status: Todo` mis-cases the known id `todo` loads with `status: 'todo'` (normalized), while a task file whose `status: blocked-ish` is unknown loads with `status: 'blocked-ish'` preserved (R24). A project with an explicit `config.statuses` override still resolves that override through `configFor` after a save+reload round-trip and is not re-tagged materialized (R25). These are the R22–R25 contracts in `src/intention.test.ts`; they land red-first (materialization + normalization absent) per ADR-029 and are made green by the implementation without weakening any other test. `outcome_verification_grandfathered: false`.

## Open Issues

- [x] **RESOLVED (2026-07-16):** Round-trip-safety mechanic pinned — a materialized palette carries `config.materialized: true`; the resolver treats a block as a deliberate override **only** when that flag is not `true`, so materialized blocks re-derive from the global palette on load (future global edits re-propagate) and genuine overrides resolve unchanged (R25). Chosen over a "always overwrite materialized values, preserve explicit overrides" scheme because a single self-describing marker in the file is legible to the AI collaborator the feature serves. — **Source:** analyze — **Severity:** `P2` (cleared)
- [x] **RESOLVED (2026-07-16):** Unknown-status handling pinned — an unknown (not blank, not a case-variant of a known id) `status`/`priority` on an ingested task is **preserved verbatim**, never coerced to a default or dropped; the task still loads. Blank still resolves to the default (unchanged, R4); a case-variant of a known id normalizes to the canonical id (R24). — **Source:** analyze — **Severity:** `P2` (cleared)
- [x] **RESOLVED (2026-07-16):** Six-glob component list assessed as accepted-with-justification, not split (one atomic self-describing-palette capability; see Size assessment note). — **Source:** analyze — **Severity:** `P3` (cleared)

## TESTFAIL records

| Date | Failed check | Detail | Resolution |
| --- | --- | --- | --- |
| — | — | TBD — no failures recorded yet | — |

## Post-implementation sync

*Pending — INT-017 is at IMPLEMENTING; this section is completed at the land step (U15) once the implementation lands and the verification predicate is re-evaluated from `main`.*

- [ ] Materialization write-through implemented in the save path; `config.materialized` marker written for materialized blocks only.
- [ ] Resolver re-derives materialized blocks from the global palette; genuine-override semantics unchanged (R25 green).
- [ ] Ingestion normalizes case-variant known ids and preserves unknown values (R24 green).
- [ ] Verification predicate green from `main`, including `pnpm check:submission`.
- [ ] Linked AE (AE-001) at ACCEPTED — no status inversion remains.

## Amendment Log

| Date | Type | Change | Author |
| --- | --- | --- | --- |
| 2026-07-16 | Substantive | Intent authored; inline `--analyze` performed against the pinned R22–R25 contract (Coverage/Size/Layer/Verification populated); round-trip-safety marker (`config.materialized`) and unknown-status preservation pinned; 6-glob component cap accepted-with-justification (atomic self-describing-palette surface), all other caps PASS. Created at PROPOSED with acceptance pre-authorized by the engineer ("user-approved autopilot 2026-07-16"). | Claude (U13 intent-authoring agent) |
| 2026-07-16 | Substantive | Promoted PROPOSED to ACCEPTED via /write-intent --accept. Engineer acceptance pre-authorized for full-auto session 2026-07-16 ("user-approved autopilot 2026-07-16", recorded in Source); that recording is the authorization cited here. No dekbeads CLI in repo — bead authoring gate deferred to IB Done-When task lists at --decompose. | Claude (U13, pre-authorized) |
| 2026-07-16 | Substantive | Decomposed into 1 IU (1 IB, 0 direct beads): WS-005 + IB-005. No dekbeads CLI in repo — bead work captured as IB Done-When task lists. ACCEPTED to IMPLEMENTING via /write-intent --decompose. Implementation (TDD against R22–R25) and land handed to U14/U15. | Claude (U13) |
