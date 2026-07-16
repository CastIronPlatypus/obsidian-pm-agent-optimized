# AE-011: UI Primitives & Design System Styling

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
- **Related Intents:** INT-011
- **Owners:** Jeff Haskin

## Implements

- `src/ui/primitives/**`
- `src/ui/StatusBadge.ts`
- `src/ui/FormField.ts`
- `src/ui/FilterDropdown.ts`
- `src/ui/PaletteListEditor.ts`
- `src/ui/TaskContextMenu.ts`
- `src/views/styleguide/**`
- `src/styles/chrome.css`
- `src/styles/index.css`
- `src/styles/styleguide.css`
- `src/styles/utilities.css`
- `src/styles/variables.css`
- `src/styles/widgets.css`
- `docs/styleguide.md`

## Purpose and Scope

This slice is the plugin's reusable UI vocabulary: the leaf-level presentation primitives every view and modal is built from, plus the design-system CSS that gives them a consistent look inside Obsidian's theme. The primitives (`src/ui/primitives/**` — `Chip`, `ChipButton`, `Avatar`/`AvatarStack`, `IconButton`, `ProgressBar`, `CollapseToggle`, `EmptyState`, `SegmentedControl`, `ViewSwitcher`, `Popover`) share one shape: a chained-setter class modeled on Obsidian's `ButtonComponent`, whose constructor takes a `parentEl` and exposes the created root as `.el`. They import nothing from `store/` or `main`, so they carry no knowledge of tasks, projects, or persistence — they render markup and expose behavior. Alongside them sit a small set of domain-flavored render helpers (`StatusBadge`, `FormField`, `FilterDropdown`, `PaletteListEditor`, `TaskContextMenu`) that compose primitives (and Obsidian's `Menu`) into the recurring status/priority/filter/property widgets the rest of the UI reaches for.

The slice exists as a coherent unit so that no view or modal hand-rolls a badge, button, avatar, popover, or empty state, and so the design language lives in one place. The styling half (`src/styles/*.css`, bundled from `index.css`) defines the two plugin-specific theme tokens with no Obsidian equivalent (`--pm-ghost-border`, `--pm-shadow-ambient`, with dark-mode overrides) and the component CSS classes those primitives attach; everything else defers to Obsidian's own theme variables. `docs/styleguide.md` is the catalog and decision tree that governs what to reach for, and `src/views/styleguide/**` is the dev-only live gallery that renders every primitive and variant in a real Obsidian pane.

## Responsibilities

- Provide the leaf-level UI primitives — `Chip` (the unified label/badge/token), `ChipButton`, `Avatar`/`AvatarStack`, `IconButton`, `ProgressBar`, `CollapseToggle`, `EmptyState`, `SegmentedControl`, `ViewSwitcher`, `Popover` — as a uniform chained-setter API (`.setX(...)` returning `this`, root exposed as `.el`).
- Wrap Obsidian's native components where appropriate so plugin UI inherits app chrome: `ChipButton`/`EmptyState`/`SegmentedControl` build on `ButtonComponent`, `IconButton`/`ViewSwitcher` on `ExtraButtonComponent`.
- Resolve person display names from raw assignee strings, including `[[wikilink|alias]]` forms, and derive initials plus a deterministic background color (`displayName`/`initialsFor` in `Avatar.ts`, via `stringToColor`).
- Provide `Popover`, a viewport-positioned floating panel for content Obsidian's `Menu` can't host (inputs, search fields), writing its position as CSS custom properties (`--pop-top`/`--pop-left`), mounting into the enclosing `.modal` when present, closing on outside pointer-down and Escape, and degrading to a bottom sheet on phones.
- Render the status/priority badges (`renderStatusBadge`/`renderPriorityBadge`/`renderStatusDot`) as `Chip`s wired to an Obsidian `Menu` picker, resolving effective config through `utils` helpers (`getStatusConfig`, `getPriorityConfig`, `formatBadgeText`, `isIconName`) and falling back to priority chevrons.
- Provide form-building helpers (`renderPropRow`, `renderChipList`, `renderProgressSlider`) and the filter-dropdown widget (`renderFilterDropdown`, a `ChipButton` + multi-select `Menu` with a Clear affordance).
- Provide the shared palette-row editor (`PaletteListEditor`) for status/priority lists — icon input with Lucide-id suggestions (`AbstractInputSuggest` + `getIconIds`), inline label/color editing, drag-to-reorder, delete-with-minimum-one guard — reused by both settings and per-project overrides.
- Populate the standard task context `Menu` (`buildTaskContextMenu`: Edit, Add subtask, Duplicate, Archive/Unarchive, Delete) by dispatching to store mutators and `ModalFactory`.
- Define the design-system CSS: the two plugin theme tokens and root layout (`variables.css`), component styling (`widgets.css`, including `.theme-dark` token overrides), header/toolbar chrome (`chrome.css`), utility classes (`utilities.css`), the dev-gallery layout (`styleguide.css`), and the bundle entry `index.css`.
- Keep the component catalog/decision tree (`docs/styleguide.md`) and the live gallery (`StyleguideView`, gated behind `__STYLEGUIDE__`, mock data only) in sync as the canonical reference for the primitive set.

## Boundaries and Non-Goals

**Inside the boundary:**
- The reusable UI primitives and their chained-setter API.
- The domain-flavored render helpers that compose primitives and Obsidian `Menu`s (status/priority badges, form rows, chip lists, filter dropdown, palette editor, task context menu).
- The design-system CSS — plugin theme tokens, component classes, chrome, utilities — and its bundle entry.
- The component catalog docs and the dev-only live styleguide gallery.

**Outside the boundary (non-goals):**
- The composites layer (`src/ui/composites/**` — `TaskRow`, `KanbanCard`, `ProjectCard`, cells, `dueChip`/`tagChip`/`timeChip`, add-button/property helpers) is **not** covered here: those assemble these primitives into task/project-specific building blocks and belong to the composites slice, even though `StyleguideView` imports them to display them. This keeps the primitive layer domain-free.
- Data reads/writes and mutation logic: `TaskContextMenu` and `PaletteListEditor` invoke `plugin.store` mutators and mutate config arrays, but the persistence itself lives in the store AE (`src/store/**`); this slice only dispatches the action and renders the control.
- The orchestrator views and modals themselves (`ProjectView`, `DashboardView`, table/gantt/kanban subviews, the task/project/import modals) — they consume these primitives but own layout, state, and the `SubView` lifecycle, which are presentation-orchestration concerns rather than reusable-primitive concerns.
- The non-`variables`/`widgets`/`chrome`/`utilities`/`styleguide` stylesheets (`table.css`, `gantt.css`, `kanban.css`, `task-modal.css`, `project-modal.css`, `task-editor.css`) imported by `index.css` — those are view/modal-specific styling owned by their respective slices, not part of the shared design-system primitives.

*Guardrail satisfied: the composites layer and the orchestrator views are explicitly deferred because they carry task/project domain semantics; this AE's boundary stays at "domain-free reusable primitives plus the design-system CSS and its catalog," so the import direction (primitives → composites → views) is preserved.*

## Three-tier Boundaries

<!-- canonical: parsed into the IR `boundaries` field (always_do / ask_first / never_do) -->

**Always do:**
- Keep `src/ui/primitives/**` domain-free — no imports from `store/` or `main`, so the primitives → composites → orchestrators direction holds and the layer stays reusable without dragging in persistence.
- Follow the chained-setter contract for every primitive (constructor takes `parentEl`, exposes the root as `.el`, setters return `this`), and extend an existing primitive with a new setter/variant rather than hand-rolling a one-off element.
- Put static styling in `pm-*` CSS classes and write only dynamic per-instance values to elements — as CSS custom properties (`--pop-top`/`--pop-left`, `--pm-chip-color`, `--pm-progress-color`) wherever practical — so the class stylesheet stays the source of truth.

**Ask first:**
- Before adding a new primitive or a new plugin theme token — a primitive requires updating `docs/styleguide.md` and `StyleguideView` in the same change, and today only `--pm-ghost-border`/`--pm-shadow-ambient` are plugin-defined (everything else defers to Obsidian's theme).
- Before changing `Popover`'s modal-mount / `fixed`-position / bottom-sheet-fallback behavior or its listener teardown, since it must stay usable inside a focus-trapping modal and on phones and must always tear down its document/window listeners on close.
- Before altering the CSS bundle entry (`index.css`) or its import list, since it also pulls in view/modal stylesheets (`table.css`, `gantt.css`, `kanban.css`, `task-modal.css`, …) owned by other slices.

**Never do:**
- Never build task/project-specific composites here (`TaskRow`, `KanbanCard`, `ProjectCard`, cells, `dueChip`/`tagChip`/`timeChip`) — those carry domain semantics and belong to the composites slice, even though `StyleguideView` imports them for display.
- Never implement persistence in this slice — `TaskContextMenu` and `PaletteListEditor` only dispatch store mutators and render the control; the actual reads/writes live in the store AE (`src/store/**`).
- Never give the live gallery (`StyleguideView`, gated behind `__STYLEGUIDE__`) store or vault access — it must render from mock data only so it is safe in any vault; and never hardcode light/dark palettes instead of deferring to Obsidian's theme variables.

## Relationships and Dependencies

**Consumes:** Obsidian's UI toolkit — `ButtonComponent`, `ExtraButtonComponent`, `Menu`, `Notice`, `setIcon`, `setTooltip`, `parseLinktext`, `Platform`, `AbstractInputSuggest`, `getIconIds`, and the ambient `activeWindow`/`activeDocument`/`createDiv` helpers; `src/utils.ts` (`stringToColor`, `getStatusConfig`, `getPriorityConfig`, `formatBadgeText`, `isIconName`, `safeAsync`); type shapes from `src/types.ts` (`Task`, `Project`, `StatusConfig`, `PriorityConfig`, status/priority ids); `ModalFactory` (for the task context menu's Edit/Add/Duplicate flows); and, at CSS level, Obsidian's theme variables (`--text-*`, `--background-*`, `--interactive-accent`, `--radius-*`, `--font-*`, `--size-*`).

**Produces:** Rendered DOM elements exposed via `.el` (or returned `HTMLElement`s from the render helpers) plus the `styles.css` bundle of `pm-*` classes and the two `--pm-*` theme tokens; per-instance dynamic values (chip/badge color, progress width, avatar background, popover position) are written to elements — predominantly as CSS custom properties — while all static styling lives in the shipped CSS classes.

**Depends on:** the Obsidian plugin runtime for its component base classes, icon set, menus, and theme cascade — the primitives have no meaning outside an Obsidian pane; the plugin's status/priority config shapes for the badge and palette-editor helpers.

**Consumed by:** `src/ui/composites/**` (which build task/project widgets from these primitives), the orchestrator views (`src/views/**`, including table/gantt/kanban), the modals (`src/modals/**` via `FormField`/`Chip`/`Popover`), the plugin settings tab and project-override modal (via `PaletteListEditor`), and the dev-only `StyleguideView`.

## Constraints and Quality Notes

- Primitives must stay domain-free: nothing under `src/ui/primitives/**` may import from `store/` or `main`, preserving the primitives → composites → orchestrators import direction so the layer can be reused without dragging in persistence.
- All primitives follow the same chained-setter contract (constructor takes `parentEl`, exposes `.el`, setters return `this`) so callers extend an existing primitive with a new setter/variant rather than adding one-off elements — a new primitive requires updating both `docs/styleguide.md` and `StyleguideView` in the same change.
- Static styling belongs in CSS classes; only dynamic per-instance values (colors, progress width, popover coordinates) are written to elements, and position/color are expressed as CSS custom properties (`--pop-top`, `--pop-left`, `--pm-chip-color`, `--pm-progress-color`) wherever practical so the class stylesheet stays the source of truth.
- Styling must defer to Obsidian's theme: only the two tokens with no Obsidian equivalent (`--pm-ghost-border`, `--pm-shadow-ambient`) are plugin-defined, with explicit `.theme-dark` overrides, so the UI tracks the user's theme (light/dark, accent) without hardcoded palettes.
- `Popover` must remain usable inside a focus-trapping modal (mount into the enclosing `.modal`, position `fixed`) and on phones (bottom-sheet fallback), and must always tear down its document/window listeners on close.
- UI text stays sentence case (lint-enforced), and the live gallery must use mock data only — no store or vault access — so it renders safely in any vault.

## Open Questions / Planned Follow-ons

- [ ] The `styleguide.css` gallery rules ship as dead CSS in production because Obsidian loads a single `styles.css`; whether to strip them from prod builds is unresolved. — **Source:** initial draft — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: AE authored and locked directly against the current (already-shipped, CI-green) state of the UI primitives and design-system styling group (`src/ui/primitives/**`, the `src/ui/StatusBadge.ts`/`FormField.ts`/`FilterDropdown.ts`/`PaletteListEditor.ts`/`TaskContextMenu.ts` helpers, `src/views/styleguide/**`, the `src/styles/*.css` design-system stylesheets, and `docs/styleguide.md`) at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted AEs stay mutable while we work in this repo and discover issues. | 60890286+jeffhaskin@users.noreply.github.com |
