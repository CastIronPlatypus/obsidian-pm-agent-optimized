# Implementation Brief: Self-describing status/priority palettes

**Spec:** `dekspec/working-specs/WS-005-self-describing-palettes.md`
**Intent:** `dekspec/intents/INT-017-self-describing-palettes.md`
**Source AEs:** AE-001
**Depends on:** none
**Production gate:** none
**Status:** ACCEPTED

## Goal

Every project save materializes the resolved status/priority palette (`configFor`) into the project frontmatter `config.statuses`/`config.priorities`, tagged `config.materialized: true` (including for legacy projects with no config block); the resolver re-derives materialized blocks from the global palette while genuine overrides still win; and ingestion normalizes case-variant known status/priority ids to canonical while preserving unknown values — proven green by R22–R25 in `src/intention.test.ts`.

## Out of Scope

- An up-front migration that rewrites every existing project file (materialization is write-through).
- A per-project palette-editing UI beyond the existing override mechanism.
- Any change to the genuine-override resolution fallback chain (regression-preserved, R25).
- Task-side palette materialization or any task-frontmatter schema change beyond normalizing existing `status`/`priority` on ingestion.
- Destroying an unknown ingested `status`/`priority` value.

## Files to Modify

| File | Change |
|------|--------|
| `src/types.ts` | Add optional `materialized?: boolean` to `ProjectConfig` (and, if needed, to `ResolvedProjectConfig`'s serialized shape). |
| `src/store/YamlSerializer.ts` | On serialize, write the resolved palette into `config.statuses`/`config.priorities` for every project and set `config.materialized: true` for materialized blocks; keep genuine overrides untagged. Thread the effective palette (statuses + priorities) into `serializeProject`. |
| `src/store/YamlHydrator.ts` | Read `config.materialized` in `hydrateProjectConfig` so the resolver can distinguish materialized blocks from overrides. |
| `src/store/ProjectConfig.ts` | In `resolveProjectConfig`, treat `config.statuses`/`config.priorities` as an authoritative override **only** when `materialized !== true`; when `materialized === true`, fall back to the global palette (re-derive). Genuine-override semantics unchanged. |
| `src/store/ProjectStore.ts` | Supply the effective palette (`configFor`) to `serializeProject` at every project-save site; in `ingestExternalTask`, validate/normalize the incoming `status`/`priority` against the effective palette (blank → default, case-variant → canonical id, unknown → preserved). |
| `src/intention.test.ts` | (Owned by the test worker — not modified here; R22–R25 are the acceptance oracle.) |

## Reuse Inventory

| Capability | Location | Use instead of reimplementing |
|------------|----------|-------------------------------|
| Resolved palette (fallback chain + in-use extras) | `src/store/ProjectConfig.ts` (`resolveProjectConfig`), `ProjectStore.configFor` | reuse to compute the palette to materialize and to validate ingestion |
| Frontmatter (de)serialization | `src/store/YamlSerializer.ts`, `src/store/YamlParser.ts`, `src/store/YamlHydrator.ts` | reuse for the `config` block + `materialized` marker |
| Self-write suppression | `src/store/ProjectStore.ts` (`markSelfWrite`) | already covers the project-file save path; no new marking needed for materialization |

## Domain Constraints

| Constraint | Value |
|------------|-------|
| Read path | a config block is an override only when `materialized !== true` |
| Do not touch | genuine-override resolution semantics |
| Preserve | unknown ingested `status`/`priority` values |

## Do Not Touch

| Function/File | Reason |
|---------------|--------|
| Genuine-override branch of `resolveProjectConfig` | Regression — overrides must resolve exactly as today (R25) |
| Task frontmatter schema (beyond normalizing existing `status`/`priority`) | Non-goal per INT-017 |
| `src/intention.test.ts` | Owned by the parallel test worker (R22–R25 oracle) |

## Governing ADRs

| ADR | Title |
|-----|-------|
| none | — |

## Constraints & Decisions

- **Materialize on save:** The project serializer writes the resolved palette into `config.statuses`/`config.priorities` for every project, not just overridden ones; `serializeProjectConfig`'s "omit empty override" behavior is superseded by write-through materialization plus the marker.
- **Round-trip-safety marker:** A materialized block carries `config.materialized: true`. The resolver treats a block as a deliberate override only when the flag is not `true`; a materialized block is re-derived from the global palette on load, so a later global-palette edit re-propagates on the next save.
- **Override preservation:** A genuine override (untagged) resolves through `configFor` unchanged and is not re-tagged materialized on save (R25).
- **Ingestion validation:** In `ingestExternalTask`, blank `status`/`priority` → default (unchanged, R4); a case-variant of a known palette id → the canonical id; an unknown value → preserved verbatim while the task still loads (R24).

## Test Promotion Criteria

Promotion refs: WS-005 Rules 1–4 (R22–R25 in `src/intention.test.ts`).

## Done When

- [ ] A saved project's frontmatter carries `config.statuses` with the effective ids and `config.materialized: true` (R22) — verified by intention test.
- [ ] A legacy project with no config block gains the materialized palette on first save (R23) — verified by intention test.
- [ ] Ingestion normalizes a case-variant known status id to canonical and preserves an unknown value while still loading the task (R24) — verified by intention test.
- [ ] An explicit per-project override still wins through `configFor` after a materialization round-trip and is not re-tagged materialized (R25) — verified by intention test.
- [ ] All pre-existing tests continue to pass, and `pnpm check` / `pnpm check:submission` / `pnpm build` stay green — verified by full oracle run.

## Open Issues

None — no open issues.

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | IB authored at ACCEPTED under INT-017 `--decompose`. No dekbeads CLI present — bead-level work captured as the Done When task list above. Round-trip-safety marker (`config.materialized`) and unknown-value preservation carried from the Intent/WS. | Claude (U13, engineer-directed) |
