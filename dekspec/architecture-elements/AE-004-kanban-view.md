# AE-004: Kanban View

## Status

ACCEPTED

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
- **Related Intents:** INT-004
- **Owners:** Jeff Haskin

## Implements

- `src/views/KanbanView.ts`
- `src/styles/kanban.css`

## Purpose and Scope

The Kanban View is one of the three interchangeable board renderings a `ProjectView` can host (alongside Table and Gantt). It presents a project's tasks as status-partitioned columns of draggable cards, giving the user a spatial, drag-to-restatus workflow over the same task tree the other subviews render. It exists as a coherent unit because it is the sole `SubView` implementation responsible for the column-per-status layout, card composition, and drag-and-drop status mutation semantics — a self-contained slice that plugs into the `SubView` lifecycle (`render`) and delegates persistence, task-tree traversal, and card chrome to shared collaborators rather than owning any of them.

The slice pairs the orchestrating class (`KanbanView.ts`) with its dedicated stylesheet (`kanban.css`): the board/column/card box model, the horizontal-scroll column strip, the drop-target highlight, drag styling, priority bar, and the three-line description clamp. Together they define what the Kanban board *is* and how it *looks*, while deferring what a card *contains* to the `KanbanColumn` composite and what a task *is* to the store.

## Responsibilities

- Implement the `SubView` contract via `render()`, which draws the board and, when `kanbanShowDescriptionPreview` is enabled, kicks off lazy description hydration.
- Resolve the effective project configuration once per render through `store.configFor(project)` and build one `KanbanColumn` per configured status.
- Partition the project's tasks into columns by `status`, honoring `kanbanShowSubtasks` (flatten the tree vs. top-level tasks only) and the active `FilterState` via `matchesFilter`.
- Compose per-card presentation data (`KanbanCardData`): priority accent color (suppressed for medium/low), a sanitized plain-text description preview (markdown stripped, clamped to 240 chars), parent-task title for subtask cards, subtask done/total progress, logged hours, overdue flag, and the tag-color toggle.
- Lazily hydrate task note bodies (`store.loadTaskBody`) for on-board cards that lack a loaded description, then re-render once so previews fill in.
- Handle card interactions: open the task modal on click (`openTaskModal`), show the shared task context menu on right-click (`buildTaskContextMenu`), and track the in-flight drag task across drag start/end.
- Mutate task status on drop by calling `store.updateTask` with the new status (guarded against no-op and mismatched drags) and trigger the parent refresh.
- Define the board's visual structure and states in CSS: flex column strip with horizontal scroll, fixed-width columns, card body/footer layout, drop-target and dragging states, priority bar, and the multi-line description clamp.

## Boundaries and Non-Goals

**Inside the boundary:**
- The status-column board layout and its lifecycle as a `SubView`.
- Task-to-column partitioning and per-card view-model assembly.
- Drag-and-drop *intent capture* (which task, to which status) and the resulting status-update call.
- Lazy description hydration triggered by the board.
- All Kanban-specific styling in `kanban.css`.

**Outside the boundary (non-goals):**
- Rendering the card DOM itself and the column header/drop-zone wiring — owned by the `KanbanColumn` composite and the primitives it uses; this AE only supplies `KanbanCardData` and callbacks, so card internals can evolve without touching the board.
- Persistence, dirty-tracking, and file I/O — delegated entirely to `plugin.store` (`TaskSource`); the view never reads or writes vault files directly.
- Filtering, saved views, toolbar, and disk reloads — owned by the hosting `ProjectView`; the Kanban view only consumes the `FilterState` handed to it and calls the provided `onRefresh`.
- Task-tree mutation logic beyond a single status change (moving, reparenting, ordering) — not exposed by this view; drag only restatuses.
- Config/override resolution — computed by the store's `configFor`; the view never reads global settings for statuses/priorities.

## Three-tier Boundaries

<!-- canonical: parsed into the IR `boundaries` field (always_do / ask_first / never_do) -->

**Always do:**
- Resolve effective status/priority config once per `render()` through `store.configFor(project)` and build one `KanbanColumn` per configured status — never read `plugin.settings.statuses`/`priorities` directly, so per-project overrides are honored.
- Keep drop handling idempotent-safe: no-op when the drop-target status equals the task's current status or when the tracked drag task does not match the dropped id, and delegate the actual status write to `store.updateTask` rather than mutating the task in place.
- Treat task bodies as possibly-unhydrated: drive description previews through lazy `store.loadTaskBody` and re-render at most once (only when a body actually filled in) to avoid render loops.

**Ask first:**
- Before widening drag-and-drop beyond a single status change into reordering-within-column or reparenting (the P3 open question) — that reaches into sibling-order/parentage semantics owned by the store and changes this view's interaction contract.
- Before changing the shape of `KanbanCardData` or the callbacks handed to `KanbanColumn`, since that is the public seam between this board and the card composite that lets card internals evolve independently.
- Before altering the `pm-kanban-*` CSS class contract or Obsidian theme-variable usage in `kanban.css`, as the column/card box model is a shared surface relied on by the composite.

**Never do:**
- Never assemble card DOM or column header/drop-zone chrome inline — that belongs to the `KanbanColumn` composite; this slice only supplies `KanbanCardData` and callbacks, respecting the primitives → composites → orchestrators import direction.
- Never read or write vault files, do dirty-tracking, or resolve config overrides in the view — persistence and `configFor` belong entirely to `plugin.store`; and never own filtering, saved views, toolbar, or disk reloads, which belong to the hosting `ProjectView` (only consume the handed `FilterState` and call the provided `onRefresh`).
- Never assign inline styles or let raw markdown leak into card chrome — all presentation lives in `kanban.css`, and description previews must be sanitized plain text (code fences, inline code, links/images, list/heading and emphasis markers stripped, clamped to 240 chars).

## Relationships and Dependencies

**Consumes:** the `Project` (its `tasks`), a `FilterState`, and a `PMPlugin` handle (for `store` and `settings`) via constructor; the `ResolvedProjectConfig` from `store.configFor`; `KanbanColumn` / `KanbanCardData` from the UI composites layer; tree/aggregate helpers `flattenTasks` and `totalLoggedHours` (`TaskTreeOps`); `matchesFilter` (`TaskFilter`); utilities `isTaskOverdue`, `isTerminalStatus`, `getPriorityConfig`; `openTaskModal` (`ModalFactory`); `buildTaskContextMenu` (`TaskContextMenu`); Obsidian's `Menu`; and the CSS class contract defined in `kanban.css`.

**Produces:** the rendered `.pm-kanban-view` / `.pm-kanban-board` DOM subtree with one column per status; `KanbanCardData` objects fed to each `KanbanColumn`; status-update mutations issued through `store.updateTask`; task-modal and context-menu openings; and body-hydration requests via `store.loadTaskBody`.

**Depends on:** `plugin.store` (the `TaskSource`/`ProjectStore`) for config resolution, lazy body loading, and status persistence; the `SubView` interface contract; the `KanbanColumn` composite for card rendering and drag/drop event surfacing; and the shared modal/context-menu factories.

**Consumed by:** `ProjectView`, which instantiates the Kanban view as its active `SubView`, supplies the project/filter/refresh wiring, and calls `render()`.

## Constraints and Quality Notes

- `render()` must resolve effective config through `store.configFor(project)` and never read `plugin.settings.statuses`/`priorities` directly, so per-project overrides are honored.
- Task-file bodies must not be assumed loaded: description previews depend on lazy hydration, and hydration re-renders at most once (only when a body actually filled in) to avoid render loops.
- Drop handling must be idempotent-safe: it no-ops when the drop target status equals the current status or when the tracked drag task does not match the dropped id, delegating the actual write to the store rather than mutating the task in place.
- Card DOM must be produced only through the `KanbanColumn` composite, never assembled inline, per the primitives → composites → orchestrators import direction.
- No inline styles: all Kanban presentation lives in `kanban.css` under the `pm-kanban-*` class namespace and relies on Obsidian theme variables (e.g. `--background-secondary`, `--interactive-accent`, `--text-muted`) for light/dark theme fidelity.
- Description previews must be rendered as sanitized plain text (fenced code, inline code, links/images, list/heading markers, and emphasis markers stripped) so raw markdown never leaks into card chrome.

## Open Questions / Planned Follow-ons

- [ ] Should drag-and-drop support reordering within a column or reparenting, not just status changes, given the store already models sibling order and parentage? — **Source:** initial draft — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: AE authored and locked directly against the current (already-shipped, CI-green) state of `src/views/KanbanView.ts` and `src/styles/kanban.css` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted AEs stay mutable while we work in this repo and discover issues. | 60890286+jeffhaskin@users.noreply.github.com |
| 2026-07-16 | Substantive | Raised to ACCEPTED so foundation Intents can lock without status inversion; retroactive-adoption AE, reversible via reverse transition. | Claude (engineer-directed) |
