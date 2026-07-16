# AE-003: Gantt View

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
- **Related Intents:** INT-003
- **Owners:** Jeff Haskin

## Implements

- `src/views/gantt/**`
- `src/styles/gantt.css`

## Purpose and Scope

The Gantt View is the timeline-based `SubView` of a project: it renders each task as a bar (or milestone diamond) positioned on a horizontal time axis, and lets the user reschedule tasks and wire up dependencies by direct manipulation. It exists as a coherent unit because the timeline is a self-contained visual language — date-to-pixel geometry, a sticky time-period header, SVG bars, dependency arrows, and drag/link interactions — that is meaningfully separable from the table and kanban presentations of the same underlying task tree. `GanttView` is the orchestrator (`implements SubView`, i.e. `render`/`refresh`/`destroy`); the rest of the slice is a set of focused renderers and interaction handlers it composes through a shared `RendererContext`.

The slice deliberately splits pure geometry (`TimelineConfig`), stateless drawing (`GanttRenderer` barrel over `GanttHeaderRenderer` and `GanttTaskBarRenderer`, plus `TaskLabelRenderer`), and stateful pointer interactions (`GanttDragHandler`, `GanttLinkHandler`) so that the coordinate math is testable in isolation and the drawing functions are reducible to `(context) → DOM/SVG`. All mutations are delegated to the store rather than performed in the view; the Gantt slice is a presentation-and-input surface, not a source of truth.

## Responsibilities

- Own the Gantt `SubView` lifecycle: build the left label panel + right scrolling timeline, wire document-level listeners, and tear them all down via a `cleanupFns` registry on `destroy`/re-render (`GanttView`).
- Compute the visible time window and coordinate system from task start/due dates — padding, granularity-driven minimum span, month-snapping, day width, and the `dateToX`/`xToDate`/`getSnapPoints`/`snapX` conversions (`TimelineConfig`).
- Render the sticky timeline header with day/week/month/quarter bands, ticks, weekend shading, and configurable week-label formatting (`GanttHeaderRenderer`), plus grid lines and the "today" line/diamond (`GanttRenderer`).
- Render task bars with status color, progress overlay, in-bar labels, recurrence indicator, and hover tooltip; milestone diamonds with header labels and guide lines; and bezier dependency arrows with an arrowhead marker (`GanttTaskBarRenderer`).
- Provide direct-manipulation editing: drag bar edges to resize and drag the whole bar to move (snapping to grid), and click an empty row to set dates — each persisting through the store and pushing an undo/redo entry (`GanttDragHandler`, `GanttTaskBarRenderer`).
- Provide dependency authoring via link dots, enforcing left/right (successor/predecessor) pairing and rejecting duplicate or cycle-forming links before saving (`GanttLinkHandler`).
- Render the left-hand HTML label column with collapse toggles, status dots, progress, add-subtask buttons, and drag-to-reorder rows (`TaskLabelRenderer`), and keep it vertically scroll-synced with the timeline.
- Expose granularity switching, expand/collapse-all, and "scroll to today" controls, persisting granularity to plugin settings and collapse state through the store.
- Own all Gantt-specific styling (`src/styles/gantt.css`).

## Boundaries and Non-Goals

**Inside the boundary:**
- Timeline geometry and coordinate conversion.
- SVG/HTML rendering of the timeline, task bars, milestones, dependency arrows, header, grid, and label column.
- Pointer/keyboard interaction state (`DragState`, `LinkState`) and the gesture handling that maps drags/clicks to store calls.
- Filter application at render time (`applyTaskFilterPromote`) and flattening/visibility of the task tree for row layout.
- Local undo/redo wiring for drag edits and the Gantt-scoped keyboard shortcuts.

**Outside the boundary (non-goals):**
- Persistence, task-file writes, dirty tracking, and self-write bookkeeping — delegated entirely to `plugin.store` (`updateTask`, `reorderTask`, `persistCollapsedState`); the view never touches the vault, because storage is the persistence-store AE's concern and mixing it in would duplicate the single source of truth.
- Dependency-based auto-scheduling and cycle detection at the data layer — the view only requests `store.scheduleAfterChange` and surfaces a `Notice`; the actual scheduling algorithm lives in `Scheduler`, kept out so its logic stays shared across all views.
- Ownership of filter state, saved views, and the toolbar/header chrome — those belong to the hosting `ProjectView` orchestrator, which passes `FilterState` and an `onRefresh` callback in.
- The Table and Kanban presentations of the same task tree — sibling subviews, intentionally separate.

## Three-tier Boundaries

<!-- canonical: parsed into the IR `boundaries` field (always_do / ask_first / never_do) -->

**Always do:**
- Route every task mutation (start/due, dependencies, row order, collapse) through `plugin.store` (`updateTask`/`reorderTask`/`persistCollapsedState`), push the undo/redo entry, and request `store.scheduleAfterChange` — the view is a presentation-and-input surface, never a source of truth.
- Register every document-level listener and per-bar handler in `cleanupFns` and run cleanup before each re-render, so listeners never leak across re-renders or leaves.
- Keep coordinate math pure in `TimelineConfig` and drawing functions stateless given a `RendererContext`; do all date arithmetic through `Temporal.PlainDate` via `dates.ts`, never raw `Date` math.

**Ask first:**
- Before changing the `RendererContext` shape or the `TimelineConfig` geometry/snap contract (`dateToX`/`xToDate`/`getSnapPoints`/`snapX`) — the same context threads through every renderer and interaction handler in the slice.
- Before altering how the slice reads shared inputs — resolving effective `StatusConfig[]` other than via `store.configFor(project)`, or reading settings other than `ganttGranularity`/`ganttWeekLabel` — since config resolution is shared across all views.
- Before gating undo/redo or Gantt keyboard shortcuts on anything other than the Gantt leaf being the active workspace leaf, which would risk hijacking undo/redo during unrelated note edits.

**Never do:**
- Never write to the vault, do dirty tracking, self-write bookkeeping, or run the dependency scheduling/cycle-detection algorithm here — those belong to the persistence-store AE and `Scheduler`; the view only requests them.
- Never own filter state, saved views, or the toolbar/header chrome, or reach into the Table/Kanban presentations — those belong to the hosting `ProjectView` and sibling subviews.
- Never assign inline styles beyond the few runtime-computed pixel dimensions (label-panel resize handle, sticky-header sizing, scrollbar spacer); all other visual styling lives in `src/styles/gantt.css`.

## Relationships and Dependencies

**Consumes:** `Project.tasks` (the in-memory tree), the effective `StatusConfig[]` resolved once per render via `store.configFor(project)`, the incoming `FilterState`, and plugin settings (`ganttGranularity`, `ganttWeekLabel`). All date values are `YYYY-MM-DD` strings parsed into `Temporal.PlainDate` via `dates.ts`.

**Produces:** the rendered Gantt DOM/SVG (sticky header SVG + body SVG + left label panel); store mutations (`updateTask` for start/due/dependencies, `reorderTask` for row reordering); `scheduleAfterChange` requests after each edit; undo/redo entries pushed to `plugin.pushUndo`; and persisted UI state (granularity via `plugin.saveSettings`, collapse via `plugin.persistCollapsedState`/`toggleTaskCollapsed`).

**Depends on:** the store (`TaskSource`/`ProjectStore`) for all mutation and config resolution; `TaskTreeOps.flattenTasks`; `TaskFilter.applyTaskFilterPromote`; `ui/ModalFactory.openTaskModal`; UI primitives/composites (`SegmentedControl`, `CollapseToggle`, `IconButton`, `renderAddButton`, `renderStatusDot`); `dates.ts` (`Temporal`, `today`, `parsePlainDate`); `utils` (`svgEl`, `safeAsync`, `getStatusConfig`); and `PMPlugin` (settings, undo/redo stack, active-leaf detection). Obsidian's `ButtonComponent` and `Notice` are external.

**Consumed by:** `ProjectView`, which instantiates `GanttView` as the active `SubView`, supplies the container, project, filter, and refresh callback, and hosts it alongside the table/kanban subviews (reached via `PMViewRouter`).

## Constraints and Quality Notes

- Coordinate math is isolated in `TimelineConfig` as pure functions; drawing functions are stateless given a `RendererContext`, so the same context object threads geometry, targets, and callbacks through every renderer without hidden globals.
- Interaction state is confined to two plain mutable structs (`DragState`, `LinkState`) created by factory functions and reset explicitly (`cancelLink`, drag flags), rather than being spread across closures.
- Every document-level listener and per-bar handler registers a teardown in `cleanupFns`, and re-render runs cleanup first — the view must not leak listeners across re-renders or leaves.
- Undo/redo and the Gantt keyboard shortcuts fire only when the Gantt leaf is the active workspace leaf, to avoid hijacking undo/redo while the user edits an unrelated note.
- All date arithmetic goes through `Temporal.PlainDate` (via `dates.ts`) to stay timezone-safe; raw `Date` math is avoided.
- Store failures on every mutating gesture are caught, revert the optimistic SVG change where applicable, and surface a user `Notice` rather than throwing.
- The slice sets a few element dimensions imperatively (`style.width`/`style.height`) for runtime-computed pixel geometry — the label-panel resize handle, sticky-header sizing, and scrollbar spacer — where the value is not expressible as a static CSS class; all visual styling otherwise lives in `src/styles/gantt.css`.

## Open Questions / Planned Follow-ons

- [ ] The renderers are not directly unit-tested (view code is excluded from coverage); consider extracting more assertions around `TimelineConfig` geometry and snap behavior to lock the coordinate contract. — **Source:** initial draft — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: AE authored and locked directly against the current (already-shipped, CI-green) state of the Gantt View slice (`src/views/gantt/**` and `src/styles/gantt.css`) at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted AEs stay mutable while we work in this repo and discover issues. | 60890286+jeffhaskin@users.noreply.github.com |
