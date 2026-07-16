# AE-007: Shared Domain Types & Utilities

## Status

PROPOSED

## Subtype

Component

## Classification

Core

## Created

2026-07-16

## Modified

2026-07-16

## Linked Artifacts

- **Related ADRs:** none
- **Related WSs:** none
- **Related ICs:** none
- **Related IBs:** none
- **Related Intents:** INT-007
- **Owners:** Jeff Haskin

## Implements

- `src/types.ts`
- `src/dates.ts`
- `src/dates.test.ts`
- `src/utils.ts`
- `src/env.d.ts`

## Purpose and Scope

This slice is the plugin's shared vocabulary: the domain data model, the timezone-safe date layer, and the small pure helpers that every other layer (store, views, modals, UI components, commands) depends on. It exists as a coherent unit because these are the lowest-level, most widely-consumed modules in the codebase — the types that describe what a `Task`, `Project`, `FilterState`, and settings palette *are*, the `Temporal`-backed date functions that all `YYYY-MM-DD` reasoning routes through, and the leaf-level formatting/lookup/color/DOM helpers that carry no state and depend on nothing but Obsidian primitives. Grouping them keeps the definitional core in one place and enforces the import direction of the rest of the plugin (everything imports these; these import almost nothing).

The scope is deliberately definitional and functional, not behavioral: it declares the entity shapes and their defaults, provides the constructors (`makeTask`, `makeProject`, `makeId`, `makeDefaultFilter`) that seed valid instances, and offers stateless computation over those shapes (date parsing/formatting/relative-due, status/priority resolution, overdue checks, string-to-color, filename sanitization, icon detection, SVG creation, and the `safeAsync` error-wrapping guard). It owns none of the persistence, orchestration, or rendering that consumes it.

## Responsibilities

- Define the core domain types (`Task`, `Project`, `FilterState`, `SavedView`, `PerProjectFilter`, `Recurrence`, `TimeLog`, `CustomFieldDef`) and the configuration/settings shapes (`StatusConfig`, `PriorityConfig`, `ProjectConfig`, `ResolvedProjectConfig`, `PMSettings`) plus the string/union aliases (`TaskStatus`, `TaskPriority`, `ViewMode`, `GanttGranularity`, `GanttWeekLabel`, `DueDateFilter`, `TaskType`).
- Encode the default palettes and settings (`DEFAULT_STATUSES`, `DEFAULT_PRIORITIES`, `DEFAULT_SETTINGS`) that seed a fresh install and back every unset per-project override.
- Provide entity constructors that produce valid, fully-populated instances: `makeId` (random+time-based id), `makeTask` (with overrides), `makeProject`, and `makeDefaultFilter`.
- Own the timezone-safe date layer in `dates.ts`: re-export `Temporal`, and provide `today`, `parsePlainDate` (tolerant of empty/invalid input, returns null), `formatDate`, and `relativeDue` (with an injectable `from` for deterministic tests).
- Provide stateless helpers over the domain types in `utils.ts`: config lookup and defaulting (`isTerminalStatus`, `getDefaultStatusId`, `getDefaultPriorityId`, `getCompleteStatusId`, `statusSortOrder`, `getStatusConfig`, `getPriorityConfig`), `isTaskOverdue`, display formatting (`formatDateShort`, `formatDateLong`, `truncateTitle`, `stringifyCustomValue`, `formatBadgeText`), `sanitizeFileName`, deterministic `stringToColor`, cached `isIconName` detection, the `svgEl` factory, and the `safeAsync` async-error guard that surfaces failures as a `Notice`.
- Declare the build-time `__STYLEGUIDE__` flag ambient type (`env.d.ts`) so the styleguide-gated code typechecks.
- Guard the date layer's contract with `dates.test.ts`, which pins `relativeDue`'s overdue/today/tomorrow/within-week/beyond-week branches against a fixed `from` date.

## Boundaries and Non-Goals

**Inside the boundary:**
- The canonical type/interface definitions for tasks, projects, filters, saved views, and settings, and their `DEFAULT_*` constants.
- Pure, stateless helpers and constructors that operate on those types with no persistence or side effects (beyond `safeAsync`/`isIconName`'s intentional use of `Notice`/`setIcon` and `activeDocument`).
- The `Temporal`-based date primitives all date reasoning is expected to route through.
- The single ambient build-flag declaration and the unit test that locks the date layer.

**Outside the boundary (non-goals):**
- Persistence, dirty-tracking, and file I/O — these live in the store slice (`src/store/**`). This AE only *defines* the shapes the store reads and writes; `Task.taskIndex`/`TaskIndex` is referenced as a type import from the store, and `configFor`/`ResolvedProjectConfig` resolution is performed by the store, not here. Kept out because this slice must stay a dependency-free leaf so the store (and everything else) can import it without cycles.
- Rendering, view orchestration, and modal behavior — these consume the types and helpers but define no UI here. Kept out so the domain vocabulary stays framework- and view-agnostic.
- Config *override resolution* logic (merging `ProjectConfig` onto global `PMSettings` into `ResolvedProjectConfig`) — the shapes are declared here, but the merge is the store's `ProjectConfig` module's job.

## Relationships and Dependencies

**Consumes:** `temporal-polyfill` (via `dates.ts`) for timezone-safe `PlainDate` arithmetic; Obsidian's `Notice` and `setIcon` and the ambient `activeDocument` (via `utils.ts`) for user-facing errors, icon probing, and DOM/SVG element creation.

**Produces:** the domain type system and `DEFAULT_*` constants, factory functions for valid entities, the date-handling API surface (`today`/`parsePlainDate`/`formatDate`/`relativeDue`/re-exported `Temporal`), and the config/formatting/color/DOM helper set.

**Depends on:** `temporal-polyfill` and `obsidian` (both external, never bundled); a *type-only* import of `TaskIndex` from the store (`Task.taskIndex`) — a type-level reference, not a runtime dependency.

**Consumed by:** effectively the entire plugin — the store (`src/store/**`), views, modals, UI components, commands, and `main.ts` all import types, constructors, and helpers from this slice. It is the most widely-imported code in the repository.

## Constraints and Quality Notes

- Dates are `YYYY-MM-DD` strings at rest and in the type surface; all date math must go through the `dates.ts` `Temporal.PlainDate` helpers rather than raw `Date` arithmetic to stay timezone-safe. (`utils.ts`'s `formatDateShort`/`formatDateLong` are the legacy display-only exceptions and use `Date` purely for locale formatting.)
- Helpers here must remain pure and low-dependency: this slice is a leaf in the import graph, so it must not import from the store, views, or UI, to keep the dependency direction acyclic.
- `Task.archived` and `Task.collapsed` are documented as runtime/UI state, not frontmatter — the type definitions must keep that intent legible so consumers don't persist them into task files.
- `parsePlainDate` and the functions built on it must tolerate empty/invalid strings by returning null/'' rather than throwing, since `YYYY-MM-DD` fields are frequently unset.
- `relativeDue` keeps `from` injectable so its behavior is deterministic under test; changes to its branch boundaries must be reflected in `dates.test.ts`.

## Open Questions / Planned Follow-ons

- [ ] `utils.ts` carries two date-formatting styles — `formatDate` (Temporal-based, in `dates.ts`) and `formatDateShort`/`formatDateLong` (`Date`-based, in `utils.ts`); should the `Date`-based pair be migrated onto the Temporal layer for full timezone-safety consistency? — **Source:** initial draft — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: AE authored and locked directly against the current (already-shipped, CI-green) state of the shared domain slice (`src/types.ts`, `src/dates.ts`, `src/dates.test.ts`, `src/utils.ts`, `src/env.d.ts`) at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted AEs stay mutable while we work in this repo and discover issues. | 60890286+jeffhaskin@users.noreply.github.com |
