# AE-010: UI Composite Components

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
- **Related Intents:** INT-010
- **Owners:** Jeff Haskin

## Implements

- `src/ui/composites/**`

## Purpose and Scope

The UI Composite Components slice is the middle layer of the plugin's three-tier component system (primitives → composites → view orchestrators). It packages recurring, domain-aware fragments of interface — a Kanban card, a Kanban column, a project card, a table row, an inline-editable cell, a date control, a filterable project header — that are assembled from stateless primitives (`Chip`, `ProgressBar`, `AvatarStack`, `ChipButton`, `IconButton`, `ButtonComponent`, `Popover`) but carry knowledge of the plugin's domain vocabulary: `Task`, `Project`, `FilterState`, `SavedView`, statuses and priorities. Each composite maps a plain-data prop bag (or a small set of arguments) onto DOM under a `parentEl`, following the codebase's chained-setter/`createDiv` construction convention, and reports user intent back to its host through injected callbacks.

The slice exists as a coherent unit because these fragments are the shared building blocks the three subviews (Table, Gantt, Kanban) and the dashboard reuse rather than re-implement. A Kanban card, a due-date chip, or an inline-edit affordance must look and behave identically wherever it appears; centralizing them here — above the primitives, below the views — is what keeps that consistency and prevents the one-off elements the styleguide decision tree forbids.

## Responsibilities

- Render self-contained, domain-aware UI fragments from prop bags: `KanbanCard`, `KanbanColumn`, `ProjectCard`, `TaskRow`, and the `ProjectHeader` trio (`ProjectHeader` / `PrimaryRow` / `FilterRow`).
- Provide small stateless render helpers for reused chips and buttons: `renderDueChip` (urgency-colored due date), `renderTimeChip` (logged/estimate hours, red when over), `renderTagChip` (outline tag chip, optionally dot-colored via `stringToColor`), and `renderAddButton` (the shared ghost "+ label" add row).
- Compose primitives into task cards: priority bar, title with milestone/subtask/recurring `Chip` markers, description preview, time chip, up-to-three tag chips, progress bar, subtask-progress text, an `AvatarStack` of assignees, and a due chip.
- Own the Kanban drag-and-drop interaction at the column level — `dragover`/`dragleave`/`drop` handling, live insertion-point computation via `getDragAfterElement`, drop-target class toggling, and delegating the committed move to an injected `onDrop(taskId, newStatus)` callback.
- Drive the project header's filter surface: search input, saved-view pills with update/delete context menus, inline "+ save view" naming flow, a filter-row toggle, and per-facet filter dropdowns (status, priority, assignee, tag, due-date menu, archived toggle, clear-with-count), with in-place refresh methods (`refresh`, `notifyMutation`, `refreshVolatile`, `refreshClearButton`) that avoid full re-renders.
- Provide reusable editing affordances: `makeInlineEdit` (swap a display element for a text/date input that commits on blur/Enter and reverts on Escape), `renderDateControl` (formatted date + relative-due hint opening a popover with a native date input plus Today/Clear, committing once on close), `ActionsCell` (a reveal-on-hover `more-horizontal` icon button table cell), and `renderAddProperty` (progressive-disclosure popover listing hidden properties).
- Wire user gestures (click, contextmenu, drag lifecycle, keyboard commit/cancel) to injected callbacks and expose the constructed root as `.el`, never reaching back into the store or plugin directly.

## Boundaries and Non-Goals

**Inside the boundary:**
- Construction and layout of domain-aware fragments from primitives, plus the render helpers and editing affordances listed above.
- Local, ephemeral interaction state: drag reorder preview, popover open/close, inline-edit committed-once guards, filter-row expansion, and volatile re-rendering of the header's action area.
- Reading domain objects (`Task`, `Project`, `FilterState`, statuses, priorities) passed in as props to decide what to draw, and mutating the caller-owned `FilterState` in place before notifying via callback.
- Calling pure store selectors that derive display data from already-loaded tasks (`collectAllAssignees`, `collectAllTags`, `isFilterActive`, `countActiveFilters`).

**Outside the boundary (non-goals):**
- Persistence and task mutation. Composites never call `plugin.store` mutators or write the vault; they emit intent through callbacks (`onDrop`, `onSavedViewSave`, `onChange`, `onSave`) and let the host view/orchestrator perform the store operation — this keeps the layer testable, backend-agnostic, and free of self-write/dirty-tracking concerns that belong to the store AE.
- Leaf visual primitives. `Chip`, `ProgressBar`, `AvatarStack`, `ChipButton`, `IconButton`, `Popover` live in `src/ui/primitives/**` and are consumed here, not defined here; adding a new leaf element belongs to the primitives slice (and the styleguide), not this one.
- View orchestration and data loading. Deciding which project to load, opening leaves, resolving effective project config, hosting a single subview at a time, and disk-reload wiring are the responsibility of `ProjectView`/`PMViewRouter`; composites are handed finished prop bags.
- Modal lifecycle. Composites open popovers and inline inputs but never instantiate `Modal` subclasses; all modals route through `ModalFactory`.

## Relationships and Dependencies

**Consumes:** UI primitives (`Chip`, `ProgressBar`, `AvatarStack`, `ChipButton`, `IconButton`, `ButtonComponent`, `Popover`, `renderFilterDropdown`); domain types from `src/types.ts` (`Task`, `Project`, `FilterState`, `SavedView`, `StatusConfig`, `PriorityConfig`, `DueDateFilter`); pure store selectors from the `src/store` barrel and `TaskFilter` (`collectAllAssignees`, `collectAllTags`, `isFilterActive`, `countActiveFilters`); utilities (`formatDateShort`, `stringToColor`, `safeAsync`, `formatBadgeText`, `isIconName`); date helpers from `src/dates.ts` (`formatDate`, `relativeDue`, `today`); and Obsidian APIs (`setIcon`, `Menu`, `ButtonComponent`).

**Produces:** Detached DOM subtrees rooted at each composite's `.el` (or, for the render-helper functions, appended children and returned handles), plus user-intent events surfaced through injected callbacks.

**Depends on:** The caller-owned mutable `FilterState` object (mutated in place then reported via `onFilterChange`); the chained-setter primitive API and Obsidian's `createDiv`/`createSpan`/`createEl` DOM helpers; the CSS classes bundled from `src/styles/**` for all styling.

**Consumed by:** The view orchestrators — `TableView` (`TaskRow`, `ActionsCell`, `makeInlineEdit`, `renderDateControl`, `renderAddProperty`, chips), `KanbanView` (`KanbanColumn` → `KanbanCard`), `GanttView`, `DashboardView` (`ProjectCard`), and `ProjectView` (`ProjectHeader`).

## Constraints and Quality Notes

- No inline styles as a rule: styling is class-driven from `src/styles/**`; the few `setCssStyles`/CSS-custom-property assignments present are limited to injecting dynamic, data-derived color values (priority/status/project colors, row depth) that cannot be expressed as static classes.
- Composites must remain side-effect-free with respect to persistence: they may read props and call pure selectors, but all mutation flows outward through callbacks so the layer stays unit-testable and independent of any particular `TaskSource` backend.
- Import direction is strictly downward — composites import from primitives, types, dates, utils, and pure store selectors, never from `main` or view orchestrators — preserving the three-layer discipline.
- UI text is sentence case and dates are `YYYY-MM-DD` strings routed through `src/dates.ts`; date math must not use raw `Date` arithmetic.
- Interaction affordances guard against double-commit and focus theft: inline edit and inline save use a committed/saved latch, and `renderDateControl` deliberately defers commit to popover close to avoid a native date input's premature `change` firing mid-edit.
- New or changed composites should extend an existing primitive per the styleguide decision tree rather than emitting one-off elements.

## Open Questions / Planned Follow-ons

- [ ] Card assembly logic (marker chips, tag truncation to three, progress/subtask rows) is duplicated in prose between `KanbanCard` and table-side rendering; whether a shared card-content helper is worth extracting is unresolved. — **Source:** initial draft — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: AE authored and locked directly against the current (already-shipped, CI-green) state of the `src/ui/composites/**` component group at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted AEs stay mutable while we work in this repo and discover issues. | 60890286+jeffhaskin@users.noreply.github.com |
