# AE-008: Table View

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
- **Related Intents:** INT-008
- **Owners:** Jeff Haskin

## Implements

- `src/views/table/**`
- `src/styles/table.css`

## Purpose and Scope

The Table View is the spreadsheet-style rendering of a project's task tree — one of the three interchangeable `SubView` implementations hosted by `ProjectView`. It presents the filtered, sorted, hierarchy-aware set of tasks as an HTML `<table>` with per-column cells (title, status, priority, assignees, due, progress, time, plus project custom fields and an actions menu), and it turns direct edits in those cells, keyboard navigation, and multi-select bulk operations into mutations against `plugin.store`. It exists as a coherent unit because these five source files together own one self-contained concern: how a project's tasks look and behave *as a table*, distinct from the Gantt and Kanban presentations of the same underlying data.

The slice is deliberately a thin, stateful presentation layer over the store. It holds only view-local state (sort key/direction, the selection sets, the virtual-scroll window bookkeeping, cached DOM references) and delegates every persistent change back through the `TaskSource` contract. Its non-trivial internal machinery — a virtualized (windowed) tbody with row-height calibration, tree-flattening with orphan promotion under active filters, and range/shift-click selection — is all in service of rendering large task trees responsively without owning any data of record.

## Responsibilities

- Implement the `SubView` interface (`render`/`refresh`/`handleKeyDown`/`getViewState`) so `ProjectView` can mount, refresh in place, and persist/restore the table's sort state (`TableView`).
- Build the table shell — header with sortable columns, select-all checkbox, custom-field columns, and actions column — and toggle sort key/direction on header click (`TableRenderer.renderTable`).
- Flatten the project task tree, apply the active `FilterState` via `applyTaskFilterFlat`, re-group children by parent (promoting orphans whose parent was filtered out to root), sort each sibling group via `compareTask`, and produce the ordered `visibleRows` display list (`TableRenderer.fillTableBody`).
- Virtualize rendering: compute the visible `[start, end)` window from scroll position with overscan, paint only those rows bracketed by sized spacer rows, and calibrate the estimated row height once against a real painted row — keeping render cost proportional to the viewport rather than project size (`TableRenderer.computeWindow`/`renderWindowRows`).
- Render each task row and its cells, wiring inline cell edits (title, status, priority, due date, collapse toggle, add-subtask, row context menu) to `store` mutators and `onRefresh` (`TableRow.renderTaskRow`).
- Sort comparison across the six sortable keys, resolving status and priority order through the effective project config palettes (`TableFilters.compareTask`).
- Manage selection: single-row keyboard selection (arrow/j/k, enter/e to open, delete/backspace), checkbox selection with shift-click range extension, select-all tri-state, and Escape-to-clear (`TableRenderer.handleTableKeyDown`, `TableRow` selection helpers).
- Render the bulk action bar when a selection exists and translate its menu choices into a `BulkAction` union, which `TableView.handleBulkAction` dispatches to batched store operations (set status/priority/assignee/tag/due/progress, set/remove parent, archive/unarchive, delete-with-confirm) (`BulkActionBar`, `TableView.handleBulkAction`).

## Boundaries and Non-Goals

**Inside the boundary:**
- The table's DOM construction, virtualized scrolling, and row-height calibration.
- Table-local view state: sort key/direction, `selectedTaskId`/`selectedTaskIds`/`lastCheckedTaskId`, and the render-window bookkeeping.
- Client-side filter application, tree flattening, and sort ordering for display purposes.
- Selection UX (keyboard, checkbox, shift-range, select-all) and the bulk action bar UI and its action-to-mutation dispatch.
- Table-specific styling in `src/styles/table.css`.

**Outside the boundary (non-goals):**
- Persistence and the data model. All reads come from `project.tasks` and all writes go through `plugin.store` (`updateTask(s)`, `moveTasks`, `archiveTask`, `deleteTask(s)`, `scheduleAfterChange`); this AE never touches the vault, frontmatter, dirty tracking, or scheduling logic directly — that is the persistence store's concern, invoked here only through the `TaskSource` contract.
- The reusable cell/primitive components (`ui/composites/cells/*`, `TaskRow`, `ActionsCell`, etc.) and modal orchestration (`ModalFactory`, `TaskPickerModal`) — this slice consumes those components but does not define them, so their behavior belongs to the UI component system, not here.
- Orchestration around the table: `ProjectView`'s toolbar, header, saved-views, filter editing, and the choice of which `SubView` is active. Table View receives its `FilterState`, `Project`, and `onRefresh` callback from that orchestrator and does not own them.
- The Gantt and Kanban presentations of the same tasks — sibling `SubView`s, deliberately separate so each presentation's layout logic stays isolated.

## Relationships and Dependencies

**Consumes:** `Project` (its `tasks`, `customFields`, `teamMembers`), the incoming `FilterState`, and the effective `ResolvedProjectConfig` (statuses/priorities) obtained via `plugin.store.configFor(project)`; pure store helpers `flattenTasks`/`totalLoggedHours`/`collectAllAssignees`/`collectAllTags` (`TaskTreeOps`, store barrel), `findTaskById` (`TaskIndex`), `applyTaskFilterFlat`/`isFilterActive` (`TaskFilter`); date helpers from `src/dates.ts`; UI components from `ui/composites/*` and `ui/primitives`; modal openers from `ModalFactory` and `TaskPickerModal`.

**Produces:** the rendered table DOM inside the `ProjectView` leaf; `BulkAction` command objects; store mutation calls; and, via `getViewState()`, a serializable `{ sortKey, sortDir }` snapshot for `ProjectView` to persist.

**Depends on:** `plugin.store` (the `TaskSource` implementation) for every persistent mutation and config resolution; `plugin.toggleTaskCollapsed` and `plugin.settings` (`showTagColors`, `globalTeamMembers`); the `SubView` contract; and Obsidian primitives (`Menu`, `Notice`, `ButtonComponent`, `ExtraButtonComponent`).

**Consumed by:** `ProjectView` (`PMViewRouter`'s project leaf), which instantiates `TableView`, forwards the active `FilterState`, drives `render`/`refresh`/`handleKeyDown`, and reads/writes its view state.

## Constraints and Quality Notes

- No inline styles: cell widths and the offscreen date input use classes/`setCssStyles` for measured dimensions, but visual styling lives in `src/styles/table.css` per the repo's no-`element.style.*` rule.
- Mutations are never applied to in-memory task objects directly by this slice; edits route through `store` mutators and the view then awaits `onRefresh`, keeping the store the single source of truth.
- The virtual-window and row-height calibration are guarded against feedback loops — repaint is skipped when window bounds are unchanged, and height is calibrated exactly once — so scrolling and re-rendering must not oscillate.
- `visibleRows` is the single source of truth for both the virtual window and selection/keyboard navigation; keyboard, checkbox range, and select-all logic all derive from `getVisibleTaskIds(state)` to stay consistent with what is displayed.
- Under an active filter, all matching rows are shown regardless of collapsed ancestors, and orphaned matches are promoted to root — filter visibility deliberately overrides the collapse state.
- Bulk actions clear the selection and refresh on both success and failure; destructive delete is gated behind `confirmDialog`.

## Open Questions / Planned Follow-ons

- [ ] Row-height calibration assumes roughly uniform row heights; very tall wrapped rows (long titles, many tags) could make the virtual-window math drift — worth revisiting if variable-height rows are ever needed. — **Source:** initial draft — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: AE authored and locked directly against the current (already-shipped, CI-green) state of the Table View slice (`src/views/table/**` and `src/styles/table.css`) at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted AEs stay mutable while we work in this repo and discover issues. | 60890286+jeffhaskin@users.noreply.github.com |
