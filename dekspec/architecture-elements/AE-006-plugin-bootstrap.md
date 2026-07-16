# AE-006: Plugin Entry, Settings & Lifecycle

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
- **Related Intents:** INT-006
- **Owners:** Jeff Haskin

## Implements

- `src/main.ts`
- `src/settings.ts`
- `src/migration.ts`
- `src/components/Notifier.ts`

## Purpose and Scope

This slice is the plugin's entry point and lifecycle backbone: the `PMPlugin` class that Obsidian instantiates, plus the three collaborators it wires up that have no home of their own — the settings tab, the one-shot project-format migration, and the due-date notifier. It exists as a coherent unit because these pieces all hang directly off the `Plugin` lifecycle contract (`onload`/`onunload`), share the single canonical `PMSettings` object owned by the plugin, and none of them fit inside the store, the views, or the UI component layers. `PMPlugin` is the composition root: it constructs the `ProjectStore`, `Notifier`, and `PMViewRouter`, registers the two view types, registers every command and the ribbon/editor-menu entry points, and owns the in-memory undo/redo stacks.

The scope is deliberately thin. This AE covers *bootstrapping and cross-cutting lifecycle state* — loading and persisting settings (including in-place settings migrations), rendering the settings UI, running the old-to-new project-format migration once the vault layout is ready, and driving the hourly due-date notification loop. It does not own the behavior those entry points delegate into (persistence, rendering, scheduling), only the wiring that reaches them.

## Responsibilities

- Implement the Obsidian `Plugin` lifecycle: `onload` constructs and wires `store` (`ProjectStore`), `notifier` (`Notifier`), and `router` (`PMViewRouter`), registers the `pm-project` and `pm-dashboard` view types, conditionally registers the dev-only styleguide view under the `__STYLEGUIDE__` build flag, and starts the notifier; `onunload` stops the notifier.
- Register all user entry points: the ribbon icon, commands (open projects, new project/task/subtask, undo/redo, import notes as tasks, create task from selection, open current file as project), and the editor context-menu "Create task from selection" item — each delegating into the router, store, or `ModalFactory`.
- Load, normalize, and persist settings via `loadSettings`/`saveSettings` (Obsidian `loadData`/`saveData`), merging saved data over `DEFAULT_SETTINGS`, backfilling missing palettes and maps, and running in-place settings migrations (deriving `StatusConfig.complete` for legacy statuses; translating the retired global `ganttHideDone` toggle into per-project filter status seeding).
- Own cross-cutting UI/session state that belongs to no single view: the bounded (20-entry) undo/redo stacks with `pushUndo`/`undoLastAction`/`redoLastAction`, and the persisted collapsed-task state (`applyCollapsedState`/`persistCollapsedState`/`toggleTaskCollapsed`) stored in `settings.collapsedTasks` keyed by project path.
- Perform post-layout maintenance on `workspace.onLayoutReady`: run `migrateProjects` (rewrite old-format projects whose tasks live in frontmatter into the one-file-per-task layout, via `store.loadProject` + `store.saveProject`) and `cleanupStaleProjectFilters` (drop `projectFilters`/`collapsedTasks` entries whose project file no longer exists).
- Render the settings tab (`PMSettingTab`): general/gantt/kanban toggles, notification enable + lead-time, auto-schedule, editable team-member list, drag-reorderable status and priority palettes, and the optional TaskNotes palette-import section (gated on `isTaskNotesInstalled`). Deleting a status/priority remaps orphaned tasks to a fallback via `store.updateTasks`, skipping projects that override the palette.
- Run the due-date `Notifier`: an hourly `window.setInterval` (registered through `plugin.registerInterval`) that loads all projects, walks flattened tasks, and raises `Notice` banners for overdue and due-soon tasks — respecting `notificationsEnabled`, `notificationLeadDays`, terminal-status resolution via `store.configFor`, and a per-session dedupe set.

## Boundaries and Non-Goals

**Inside the boundary:**
- The `PMPlugin` composition root and its lifecycle hooks (`onload`/`onunload`).
- Settings persistence, normalization, and in-place settings migrations.
- Command / ribbon / editor-menu registration and the thin dispatch glue (project/task pickers, modal open-then-refresh flows).
- Undo/redo stacks and persisted collapsed-task state.
- One-shot project-file-format migration (`migrateProjects`).
- The settings tab UI (`PMSettingTab`) and the due-date notifier (`Notifier`).

**Outside the boundary (non-goals):**
- **Persistence and the data model** — this slice programs against the `TaskSource` interface (`store.loadAllProjects`, `loadProject`, `saveProject`, `updateTasks`, `configFor`, `registerCacheInvalidation`) but does not implement storage, dirty tracking, or YAML parsing. Those belong to the persistence-store AE; keeping them separate lets the entry point stay backend-agnostic.
- **View rendering and routing internals** — `PMPlugin` registers view types and calls the `PMViewRouter`, but the `ProjectView`/`DashboardView`/`SubView` rendering logic lives in the views layer. Reason: the entry point should only own *when* a view opens, not *how* it draws.
- **Modal construction** — every modal is opened through `ModalFactory` helpers; this slice never instantiates a `Modal` subclass, per the project convention, so modal internals are out of scope.
- **Scheduling and date math** — auto-schedule is only a persisted toggle here; the dependency scheduler and the `Temporal`-based date helpers are owned elsewhere. The notifier only *reads* dates through `src/dates.ts`.

## Three-tier Boundaries

<!-- canonical: parsed into the IR `boundaries` field (always_do / ask_first / never_do) -->

**Always do:**
- Merge saved `data.json` over `DEFAULT_SETTINGS` in `loadSettings`, backfilling empty palettes and the `projectFilters`/`collapsedTasks` maps, and only re-save when a migration actually changed something (the `migrated` guard).
- Keep new settings migrations additive and idempotent against already-migrated data, since migrations here are one-way and in-place — the legacy shape is gone once translated.
- Wrap the notifier's project load in try/catch that returns so a failed `loadAllProjects` never crashes the hourly interval, and honor the per-session dedupe set plus terminal-status resolution through `store.configFor`.

**Ask first:**
- Before changing what runs on `workspace.onLayoutReady` (the one-shot `migrateProjects` rewrite or `cleanupStaleProjectFilters`) — these touch existing vault files and settings maps and must stay no-op-safe on every startup.
- Before altering the `PMSettings` / `DEFAULT_SETTINGS` shape or the `data.json` persistence format, since every view, modal, and command reads it through `plugin.settings` and it is the migration surface for existing vaults.
- Before adding or removing a registered view type, command, ribbon entry, or editor-menu item — these are the plugin's public entry-point surface consumed by Obsidian and users.

**Never do:**
- Never implement persistence, dirty tracking, YAML parsing, or scheduling here — program only against the `TaskSource` interface (`loadAllProjects`, `loadProject`, `saveProject`, `updateTasks`, `configFor`); storage and the dependency scheduler belong to other slices.
- Never write collapsed or undo/redo state into task files — collapsed state lives in `data.json` keyed by project path and toggling it must not rewrite task frontmatter; the undo stack is in-memory only.
- Never instantiate a `Modal` subclass, render views directly, use inline styles in the settings tab, or write non-sentence-case UI text — modals go through `ModalFactory` and view rendering belongs to the views layer.

## Relationships and Dependencies

**Consumes:** the Obsidian API (`Plugin`, `PluginSettingTab`, `Setting`, `Notice`, `MarkdownView`, `workspace`, `metadataCache`, `vault`, `loadData`/`saveData`, `registerView`/`registerEvent`/`registerInterval`); the `TaskSource` store interface via `plugin.store`; `ModalFactory` (`openProjectModal`, `openTaskModal`, `openProjectPicker`, `openTaskPicker`, `openImportModal`); `PMViewRouter`; pure tree helpers (`flattenTasks`, `findTask`); `types` (`DEFAULT_SETTINGS`, `PMSettings`, `Project`, `Task`, `makeId`, palette configs); the TaskNotes integration (`isTaskNotesInstalled`, `getTaskNotesApi`, `importTaskNotesPalettes`); palette list editors and `IconButton` primitives; `utils` (`safeAsync`, `isTerminalStatus`); and `dates` (`Temporal`, `today`, `parsePlainDate`).

**Produces:** the wired `PMPlugin` instance (`store`, `notifier`, `router`, `settings`, undo/redo stacks) that the rest of the plugin reaches through `plugin.*`; the persisted `data.json` (`saveData`); registered view types, commands, ribbon icon, editor menu, and settings tab; `Notice` banners (notifications, migration status, palette-import results); and post-layout side effects (migrated project files written through the store, pruned settings maps).

**Depends on:** the store contract being available and correct (migration and the notifier both call `loadAllProjects`/`saveProject`/`configFor`); `DEFAULT_SETTINGS` shape in `types`; the `__STYLEGUIDE__` build-time flag; and Obsidian firing `onLayoutReady` before migration/cleanup run.

**Consumed by:** Obsidian itself (which instantiates and calls `onload`/`onunload`); every view, modal, and command handler that reads `plugin.settings`, `plugin.store`, `plugin.router`, or the undo/collapsed-state helpers; and the settings-driven `refreshProjectViews` path that re-renders open project views after a rendering-affecting setting changes.

## Constraints and Quality Notes

- `loadSettings` must remain tolerant of partial/legacy `data.json`: always merge over `DEFAULT_SETTINGS`, backfill empty palettes and the `projectFilters`/`collapsedTasks` maps, and only re-save when a migration actually changed something (the `migrated` guard) to avoid gratuitous writes.
- Settings migrations here are one-way and in-place; once `StatusConfig.complete` is derived or `ganttHideDone` is translated, the legacy shape is gone — new migrations must be additive and idempotent against already-migrated data.
- The undo/redo stack is intentionally bounded (20 entries, oldest dropped) and any new action pushed clears the redo stack; it is in-memory only and does not survive reload.
- Collapsed state is UI state persisted in `data.json` keyed by project path, never written to task files — toggling collapse must not rewrite task frontmatter.
- The notifier must never let a failed project load crash the interval (the `loadAllProjects` call is wrapped in try/catch that returns), must honor the per-session dedupe set so a banner is not repeated, and must skip terminal-status tasks resolved through the project's effective config rather than a global palette.
- Migration and stale-filter cleanup run only after `onLayoutReady` and go through `safeAsync`; they must be safe to run on every startup (no-op when nothing qualifies).
- Project conventions apply: no inline styles in the settings tab, UI text stays sentence case, and modals are opened only through `ModalFactory`.

## Open Questions / Planned Follow-ons

- [ ] Should settings migrations be versioned (e.g. a stored schema version) rather than inferred from field presence, to keep `loadSettings` from accreting ad-hoc detection over time? — **Source:** initial draft — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: AE authored and locked directly against the current (already-shipped, CI-green) state of `src/main.ts`, `src/settings.ts`, `src/migration.ts`, and `src/components/Notifier.ts` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted AEs stay mutable while we work in this repo and discover issues. | 60890286+jeffhaskin@users.noreply.github.com |
