# AE-009: TaskNotes Interop

## Status

PROPOSED

## Subtype

Interface Surface

## Classification

Supporting

## Created

2026-07-16

## Modified

2026-07-16

## Linked Artifacts

- **Related ADRs:** none
- **Related WSs:** none
- **Related ICs:** none
- **Related IBs:** none
- **Related Intents:** INT-009
- **Owners:** Jeff Haskin

## Implements

- `src/integrations/**`

## Purpose and Scope

TaskNotes Interop is the adapter layer that lets Project Manager interoperate with a second, independently-developed Obsidian community plugin — TaskNotes — without taking a hard dependency on it. It owns the entire boundary between the two plugins: discovering whether TaskNotes is installed, negotiating its runtime API version and capabilities, and translating TaskNotes' data shapes (statuses, priorities, task records, RRULE recurrence, wikilink references) into Project Manager's own `types.ts` model. It exists as a coherent unit because all of this knowledge — the foreign API surface, its field semantics, and the pure functions that map foreign records into native `Task`/`StatusConfig`/`PriorityConfig` objects — is TaskNotes-specific and must be quarantined behind a narrow, feature-detected seam so the rest of the plugin never references TaskNotes directly.

The slice divides cleanly into two concerns: a runtime-access-and-palette module (`tasknotes.ts`) that reaches into the host `App` to locate the TaskNotes plugin and upsert its status/priority palettes into settings, and a pure import-mapping module (`tasknotesImport.ts`) that, given already-resolved TaskNotes task records, builds a parent/child task forest with dependency edges. The two are deliberately split so the mapping logic stays free of `App`/vault coupling and is unit-testable in isolation.

## Responsibilities

- Detect whether the TaskNotes plugin is installed and enabled via the host `app.plugins.getPlugin('tasknotes')` registry, defensively narrowing an `unknown` plugin object (`isTaskNotesInstalled`).
- Gate access to the TaskNotes runtime API behind version and capability checks — returning the API only when `apiVersion === 1` and `hasCapability('catalog.read')` holds, so callers get `null` for missing plugins or versions predating TaskNotes 4.10 (`getTaskNotesApi`).
- Define the typed contract for the consumed slice of the foreign API (`TaskNotesApi`) and its data records (`TaskNotesStatus`, `TaskNotesPriority`, `TaskNotesTaskInfo`, `TaskNotesDependency`), documenting that field names arrive already normalized by TaskNotes' own field mapping.
- Upsert TaskNotes' ordered status and priority palettes into Project Manager's settings palettes — patching matching entries in place, inserting unknown ones so relative TaskNotes order carries over, and never disturbing entries TaskNotes does not know (`importTaskNotesPalettes`, `upsertPalette`).
- Backfill missing palette entries for status/priority values that imported tasks actually use but settings do not yet define, keeping imported tasks visible in status-driven views (`ensurePaletteEntries`).
- Resolve a TaskNotes reference — a `[[wikilink]]` (stripping alias/heading) or a plain vault path — to a concrete vault file path, first by direct path lookup then via `metadataCache.getFirstLinkpathDest` (`resolveTaskNotesRef`).
- Map an individual TaskNotes task record into a native `Task` via `makeTask`: title fallback from filename, status/priority defaults, `scheduled`/`due`/`completedDate` truncated to `YYYY-MM-DD`, tag stripping of the task/archive tags, time-estimate conversion from minutes to rounded hours, and created/modified/archived carry-over (`mapItemToTask`).
- Translate a simple RRULE (`FREQ` plus optional `INTERVAL`) into the native `Recurrence` model, dropping rules it cannot represent (`mapRecurrence`).
- Build a task forest from a selection of resolved import items: turn `projects` links between imported tasks into parent/child edges (first match wins, cycle-forming adoptions kept as roots), and `blockedBy` references between imported tasks into dependency id lists, dropping references to notes outside the selection (`buildImportForest`).

## Boundaries and Non-Goals

**Inside the boundary:**
- Feature-detection and version/capability negotiation with the TaskNotes plugin.
- The typed description of the foreign API and record shapes this plugin consumes.
- Pure translation of TaskNotes statuses, priorities, task records, recurrence, and link references into Project Manager's native model.
- In-memory palette upsert semantics against the `PMSettings` palettes.

**Outside the boundary (non-goals):**
- Persisting anything to disk. This slice produces in-memory objects and mutates the passed-in settings object; writing task files is the store's job (`ProjectStore.importForest`) — separating it keeps the mapping logic pure and free of vault/self-write concerns.
- Driving the import UX — selecting which TaskNotes files to import, resolving each file's references against the vault, and reporting results — which lives in `ImportModal` and `settings.ts`. This AE supplies the primitives those callers compose, not the workflow.
- Writing back to TaskNotes or keeping the two plugins in sync. Interop here is a one-directional, on-demand import/adopt operation, not a live bridge, because Project Manager owns its own Markdown-file storage model.

## Three-tier Boundaries

<!-- canonical: parsed into the IR `boundaries` field (always_do / ask_first / never_do) -->

**Always do:**
- Gate every entry into the foreign runtime behind the version/capability check — return the API only when `apiVersion === 1` and `hasCapability('catalog.read')` hold, and narrow the `unknown` plugin object defensively before touching any field.
- Keep the mapping module (`tasknotesImport.ts`) pure and vault-agnostic — no `App`, no vault I/O, no persistence side effects — so translation stays deterministic and unit-testable in isolation.
- Make palette upserts non-destructive: patch matching entries in place, insert unknown ones so TaskNotes' relative order carries over, and leave user-authored statuses/priorities that TaskNotes doesn't define untouched.

**Ask first:**
- Before raising the pinned `apiVersion === 1` gate to accept a new TaskNotes API version or version range — it is the negotiated contract with an independently-developed foreign plugin and changing it widens the trusted surface.
- Before changing the `TaskNotesApi`/`TaskNotesTaskInfo`/`TaskNotesStatus`/`TaskNotesPriority` record contracts or how foreign fields map into `Task`/`StatusConfig`/`PriorityConfig` — these shapes are consumed by `settings.ts` and `ImportModal` and shifting them ripples beyond this slice.
- Before making interop anything other than one-directional on-demand import (e.g. writing back to TaskNotes or live sync) — that reverses this slice's stated non-goal and touches Project Manager's ownership of its own storage model.

**Never do:**
- Never persist to disk or perform vault writes from this slice — it produces in-memory objects and mutates the passed-in settings; writing task files belongs to `ProjectStore.importForest`.
- Never let TaskNotes-specific knowledge leak outside `src/integrations/**` — the rest of the plugin must not reference TaskNotes directly, and every entry point must degrade to a safe `null`/no-op when TaskNotes is absent or too old.
- Never construct a task forest that dangles or cycles — reject a parent adoption whose ancestry already includes the task (keep it a root) and silently drop parent/dependency references to notes outside the import selection.

## Relationships and Dependencies

**Consumes:** the host Obsidian `App` (`app.plugins.getPlugin`, `app.vault.getFileByPath`, `app.metadataCache.getFirstLinkpathDest`); the TaskNotes plugin's runtime API v1 (`getStatuses`, `getPriorities`, `getTask`, `getSettingsSnapshot`, `hasCapability`); `PMSettings` and its `statuses`/`priorities` palettes.

**Produces:** native `Task` objects (via `makeTask`) assembled into a `{ roots, byPath }` forest with parent/child and dependency edges; `StatusConfig`/`PriorityConfig` palette entries; resolved vault file paths; `Recurrence` values; and add/update counts summarizing a palette import.

**Depends on:** `../types` (`Task`, `Recurrence`, `PriorityConfig`, `StatusConfig`, `PMSettings`, `makeTask`) and the Obsidian `App` type. `tasknotesImport.ts` depends on `tasknotes.ts` only for the `TaskNotesTaskInfo` type; it does not touch `App` or the vault.

**Consumed by:** `src/settings.ts` (the "Import from TaskNotes" palette action, gated on `isTaskNotesInstalled`/`getTaskNotesApi`) and `src/modals/ImportModal.ts` (the task-import flow, which resolves references, calls `buildImportForest`, and hands the forest to `ProjectStore.importForest`).

## Constraints and Quality Notes

- Interop must be strictly optional: every entry point degrades to a safe `null`/no-op when TaskNotes is absent or too old, so the plugin behaves identically with or without TaskNotes installed.
- The foreign plugin is untrusted at the type level — its plugin object and API arrive as `unknown` and must be narrowed defensively; never assume the shape without the version/capability gate.
- The mapping module must remain pure and vault-agnostic: no `App`, no vault I/O, no persistence side effects, so it stays deterministic and unit-testable.
- Palette upserts must be non-destructive to entries TaskNotes does not define, preserving user-authored statuses/priorities while carrying over TaskNotes' relative ordering.
- Forest construction must not produce cycles: a parent adoption whose ancestry already includes the task is rejected and the task stays a root; dependency and parent references to notes outside the import selection are silently dropped rather than dangling.
- Dates follow the plugin-wide `YYYY-MM-DD` convention (foreign date-times are truncated, not reparsed), consistent with the rest of the codebase.

## Open Questions / Planned Follow-ons

- [ ] TaskNotes API is pinned to `apiVersion === 1`; there is no forward-compatibility path or graceful degradation for a future v2 — should the gate accept a version range? — **Source:** initial draft — **Severity:** `P3`
- [ ] `mapRecurrence` silently drops any RRULE beyond `FREQ`+`INTERVAL` (e.g. `BYDAY`, `COUNT`, `UNTIL`); imported recurring tasks lose that structure with no user-facing warning — **Source:** initial draft — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: AE authored and locked directly against the current (already-shipped, CI-green) state of `src/integrations/**` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted AEs stay mutable while we work in this repo and discover issues. | 60890286+jeffhaskin@users.noreply.github.com |
