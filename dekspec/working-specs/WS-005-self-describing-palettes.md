# Working Spec: Self-describing status/priority palettes

## Status

ACCEPTED

## Created

2026-07-16

## Modified

2026-07-16

## Related Architecture Elements

- AE-001: Task & Project Persistence Store — measures how the store serializes a project (materializing the resolved palette into `config` on save), how it resolves config (re-deriving materialized blocks from the global palette while preserving genuine overrides), and how it validates a task's `status`/`priority` on ingestion.

## Governing ADRs

- none

## What This Does

On every project save, the store materializes the project's resolved status/priority palette (the `configFor` fallback chain) into its frontmatter `config.statuses` / `config.priorities`, tagged `config.materialized: true`, so the project file self-describes its legal vocabulary for an AI collaborator reading only the Markdown. Legacy projects with no config block gain one on their first save (write-through backfill). The `materialized` marker keeps the write-through safe: the resolver re-derives a materialized block from the current global palette on load (so later global-palette edits re-propagate on the next save), while a genuine, untagged per-project override still wins through `configFor` exactly as before. On ingestion, an incoming task's `status`/`priority` is validated against the effective palette — blank → default, case-variant of a known id → canonical id, unknown value → preserved verbatim.

**Mechanism:** The serializer writes the resolved palette plus a `materialized: true` marker into `config`; the hydrator reads the marker; the resolver honors it (materialized ⇒ re-derive from global, untagged ⇒ deliberate override); the save path supplies the effective palette; the ingestion path normalizes/validates task status and priority against that palette.

## What This Does NOT Do

- **Graph consistency:** Does not run an up-front migration that rewrites every existing project file; materialization is write-through, applied on the next save of each project.
- Does not add a per-project palette-editing UI; the existing override mechanism is unchanged.
- Does not change the resolution fallback chain for genuine overrides (regression-preserved).
- Does not materialize a task-side palette or otherwise change the task frontmatter schema beyond normalizing the existing `status`/`priority` on ingestion.
- Does not destroy an unknown status/priority value on ingestion — unknown values are preserved.

## Interfaces

### Data Interfaces

| Interface | Direction | Type / Shape / Dtype | Source or Consumer | Guarantees |
|-----------|-----------|----------------------|--------------------|------------|
| Project `config.statuses` / `config.priorities` | out | resolved palette (id/label/color/…) | project `.md` file (save) | materialized on every save from `configFor` |
| Project `config.materialized` | out / in | boolean marker | project `.md` file | `true` ⇒ materialized (resolver re-derives); absent/`false` ⇒ deliberate override |
| Ingested task `status` / `priority` | in | string id | external `pm-task` file | blank → default; case-variant of a known id → canonical id; unknown → preserved |

### Dependencies

| Dependency | Interface | Failure behavior |
|------------|-----------|-----------------|
| `resolveProjectConfig` / `configFor` | effective palette | the resolved palette is the single source for the materialized block |
| Self-write suppression | `markSelfWrite` on the saved project path | a materialization write must not round-trip back through ingestion |

## Domain Constraints

| Constraint | Value | Scope | Rationale |
|------------|-------|-------|-----------|
| Do not touch | genuine-override resolution semantics in `resolveProjectConfig` | all-IBs | Regression per INT-017 (R25) |
| Read path | a block resolves as an override only when `materialized !== true` | all-IBs | round-trip safety (R25) |
| Preserve | unknown ingested `status`/`priority` values | all-IBs | never destroy AI/user data (R24) |

## Business Rules

1. **general** On save, the resolved palette (`configFor`) is written into `config.statuses`/`config.priorities`, including for a legacy project with no prior config block. (R22, R23)
2. **general** A materialized block carries `config.materialized: true`; the resolver re-derives it from the global palette rather than treating it as a deliberate override. (R22, round-trip safety)
3. **general** A genuine per-project override (no `materialized: true`) still wins through `configFor` after a save+reload round-trip and is not re-tagged materialized. (R25)
4. **general** On ingestion, a blank `status`/`priority` resolves to its default (R4, unchanged); a case-variant of a known id normalizes to the canonical id; an unknown value is preserved verbatim while the task still loads. (R24)

## Failure Behavior

| Failure | Detection | Assertion type | Behavior | Recovery |
|---------|-----------|---------------|----------|----------|
| A written-through palette would freeze a project against later global-palette edits | `materialized` marker absent | assert | The resolver keys off `config.materialized: true` and re-derives the palette from the global settings on load, so a materialized block never freezes; only untagged overrides are authoritative. | none needed |
| Ingested task carries an unknown status/priority | value not in the effective palette | assert | The unknown value is preserved on the task (not coerced to a default or dropped); the task still loads and is wired into the tree. | user reconciles the vocabulary or adds the status to the palette |

## Open Issues

- none

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | WS authored at ACCEPTED under INT-017 `--decompose` (acceptance criteria = R22–R25 in `src/intention.test.ts`). Round-trip-safety marker (`config.materialized`) and unknown-value preservation pinned from the Intent. | Claude (U13, engineer-directed) |
