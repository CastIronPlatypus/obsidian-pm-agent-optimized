# AE-012: Project/Dashboard View Orchestration

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
- **Related Intents:** INT-012
- **Owners:** Jeff Haskin

## Implements

- `src/views/ProjectView.ts`
- `src/views/DashboardView.ts`
- `src/views/PMViewRouter.ts`
- `src/views/SubView.ts`
- `src/views/ProjectListRenderer.ts`

## Purpose and Scope

This slice is the top-level view orchestration layer of the Project Manager plugin: the two registered Obsidian `ItemView`s (`DashboardView` and `ProjectView`), the router (`PMViewRouter`) that opens leaves for them, the `SubView` contract that the three per-project render modes implement, and the shared project-list rendering helpers (`ProjectListRenderer`) used by the dashboard. It exists as a coherent unit because these files together own the lifecycle boundary between Obsidian's workspace/leaf machinery and the plugin's own rendering — mounting scaffolds, wiring vault file-change listeners, translating file paths into loaded `Project` objects, and hosting exactly one active subview at a time.

`ProjectView` is the orchestrator: it loads a project through the store, builds the toolbar/header/body scaffold, manages the filter and saved-view state, drives the view-mode switch (table/gantt/kanban), and mediates between plugin-initiated mutations (in-place refresh) and external vault edits (debounced disk reload). `DashboardView` is the simpler project-list surface. `PMViewRouter` is the single entry point for opening either view type as a workspace tab. The subviews themselves (Table/Gantt/Kanban internals) are out of scope — this AE covers only their common interface and how the orchestrator hosts them.

## Responsibilities

- Register and implement the two `ItemView` types — `DashboardView` (`PM_DASHBOARD_VIEW_TYPE = 'pm-dashboard'`) and `ProjectView` (`PM_PROJECT_VIEW_TYPE = 'pm-project'`) — including their view type, display text, and icon.
- Own each view's DOM scaffold (`pm-toolbar`, header mount, `pm-content` body) and tear it down on close; `ProjectView` guards this with a one-time `ensureInitialized()` run from whichever of `onOpen`/`setState` fires first, since some workspace plugins restore deferred leaves via `setState` alone.
- Load a project from its `filePath` through `plugin.store.loadProject`, apply collapsed state, resolve effective config via `store.configFor`, and render toolbar, header, and the current subview; render a "Project not found" empty state when the file is missing.
- Host exactly one `SubView` at a time and switch view modes: save/restore per-mode scroll and view state (Gantt scroll/label width, Table sort/scroll) across a destroy-and-rebuild, toggle the `pm-content--kanban` body class, and route keyboard events to the active subview via `handleKeyDown`.
- Manage per-project filter and saved-view state — load/persist filters into `settings.projectFilters`, apply/clear filters, and select/save/update/delete `SavedView`s (persisted onto the project through `store.saveProject`).
- Distinguish plugin-initiated mutations from external edits: `refreshProject()` prefers the subview's in-place `refresh()` (no disk reload, since store mutators update `project.tasks` in place before awaiting the save), while vault `modify`/`delete`/`create`/`rename` listeners trigger a debounced `loadProject()`/re-render, skipping the store's own self-writes via `consumeSelfWrite`.
- Render the dashboard project list (`ProjectListRenderer`): load all projects via `store.loadAllProjects`, compute done/total task counts, build `ProjectCard`s and the toolbar, guard against stale async renders via a render token, and provide the create/edit/delete project context actions.
- Route open requests: `PMViewRouter` opens a new workspace tab, sets its view state (passing `filePath` for projects), and reveals the leaf; `openProjectByPath` resolves a path to a `TFile` first.

## Boundaries and Non-Goals

**Inside the boundary:**
- The `ItemView` lifecycle for the dashboard and project views (open/close/setState/getState) and their DOM scaffolds.
- The `SubView` interface definition and the orchestration of switching, refreshing, destroying, and keyboard-routing subviews.
- Per-project filter and saved-view state management as surfaced through the header, and its persistence into settings and the project file.
- Vault file-change subscription and the reload-vs-in-place-refresh decision.
- Dashboard project-list rendering and its project create/edit/delete entry points.
- Leaf/tab routing for both view types.

**Outside the boundary (non-goals):**
- The internal implementation of the three render modes — `TableView`, `GanttView`, `KanbanView` — beyond the `SubView` contract they satisfy. These are their own subsystems; this AE only guarantees the hosting protocol (construct, `render`, optional `refresh`/`destroy`/`handleKeyDown`), so that a subview's internals can change without touching orchestration.
- Persistence, dirty-tracking, self-write bookkeeping, and config resolution — owned by the store (`TaskSource`/`ProjectStore`). This slice consumes that interface but never reads or writes vault files or frontmatter directly.
- Modal construction and the concrete task/project editing UI — reached only through `ModalFactory` (`openTaskModal`, `openProjectModal`); this AE triggers modals but does not own them.
- UI primitives/composites (`ProjectHeader`, `ProjectCard`, `ViewSwitcher`, `EmptyState`) beyond wiring their callbacks.

## Three-tier Boundaries

<!-- canonical: parsed into the IR `boundaries` field (always_do / ask_first / never_do) -->

**Always do:**
- Load projects through `plugin.store.loadProject` and resolve effective config via `store.configFor`, then render a "Project not found" empty state when the file is missing — never read vault files or frontmatter directly from this layer.
- Keep one-time DOM/listener setup idempotent behind `ensureInitialized()`, since either `onOpen` or `setState` may fire first for deferred leaves, and treat `setState` as the sole project loader (`onOpen` is setup-only).
- Host exactly one `SubView` at a time and, on a full `renderCurrentView()`, explicitly save and restore per-mode scroll/view state (Gantt scroll/label width, Table sort/scroll); prefer the subview's in-place `refresh()` over destroy-and-rebuild.

**Ask first:**
- Before changing the `SubView` contract (`render`/`refresh`/`destroy`/`handleKeyDown`), since it is the hosting protocol every render mode implements — a change ripples into the Table/Gantt/Kanban subsystems this AE deliberately does not own.
- Before altering the vault file-change reload policy or the coordination constants (the 300ms reload debounce, the 5s self-write window) — these are duplicated across `ProjectView` and `DashboardView` and govern the reload-vs-in-place-refresh decision.
- Before changing where filter/saved-view state persists (`settings.projectFilters` vs. the project file via `store.saveProject`), since it crosses into the settings/store data surface.

**Never do:**
- Never write vault files, frontmatter, or perform dirty-tracking/self-write bookkeeping here — that belongs to the store; this slice only consumes `TaskSource` and calls `consumeSelfWrite` to skip its own writes.
- Never construct modals or task/project editing UI directly; reach them only through `ModalFactory` (`openTaskModal`, `openProjectModal`).
- Never use inline styles (`element.style`); express layout and mode state through CSS classes (`pm-view`, `pm-root`, `pm-toolbar`, `pm-content`, `pm-content--kanban`), and never let an unguarded async dashboard render overwrite a newer one (honor the render token).

## Relationships and Dependencies

**Consumes:** `plugin.store` (`TaskSource`) for `loadProject`, `loadAllProjects`, `saveProject`, `deleteProject`, `configFor`, and `consumeSelfWrite`; `plugin.settings` (`defaultView`, `projectsFolder`, `projectFilters`, collapsed state via `applyCollapsedState`); Obsidian's `Workspace`/`WorkspaceLeaf`, `Vault` events, and `TFile`; core types (`Project`, `Task`, `ViewMode`, `FilterState`, `SavedView`, `StatusConfig`) and helpers (`truncateTitle`, `safeAsync`, `makeId`, `makeDefaultFilter`, `isTerminalStatus`).

**Produces:** Rendered dashboard and project workspace tabs; mounted subview instances; persisted filter/saved-view state; open workspace leaves via the router.

**Depends on:** the `SubView` implementations (`TableView`, `GanttView`, `KanbanView`); `ModalFactory` for all modal opens; UI composites/primitives (`ProjectHeader`, `ProjectCard`, `ViewSwitcher`, `EmptyState`); `PMPlugin` for the shared store, settings, router, and `saveSettings`.

**Consumed by:** `PMPlugin` (`src/main.ts`), which registers both view types and holds the `PMViewRouter` instance used by commands and the dashboard to open project leaves.

## Constraints and Quality Notes

- `ProjectView` treats `setState` as the sole project loader (the only place `filePath` is set and loaded); `onOpen` is setup-only. One-time DOM/listener setup must be idempotent because either entry point may fire first for deferred leaves.
- Any vault write performed while these views are mounted must be self-write-marked by the store, or the file-change listeners will treat it as an external edit and trigger a spurious reload.
- Prefer the subview's in-place `refresh()` over a full destroy-and-rebuild to preserve scroll and selection; a full `renderCurrentView()` must explicitly save and restore per-mode scroll/view state.
- No inline styles: layout and mode state are expressed via CSS classes (`pm-view`, `pm-root`, `pm-toolbar`, `pm-content`, `pm-content--kanban`), never `element.style`.
- Async dashboard renders must be guarded against staleness (render token) so a slower load cannot overwrite a newer one.
- The default view mode is applied once per file (`defaultViewAppliedFor`) so reloads do not clobber a user's manual mode switch.

## Open Questions / Planned Follow-ons

- [ ] The 300ms reload debounce and 5s self-write window are duplicated/assumed across `ProjectView` and `DashboardView` — should these coordination constants be centralized? — **Source:** initial draft — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: AE authored and locked directly against the current (already-shipped, CI-green) state of the view-orchestration files (`src/views/ProjectView.ts`, `DashboardView.ts`, `PMViewRouter.ts`, `SubView.ts`, `ProjectListRenderer.ts`) at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted AEs stay mutable while we work in this repo and discover issues. | 60890286+jeffhaskin@users.noreply.github.com |
