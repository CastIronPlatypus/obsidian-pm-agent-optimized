# AE-005: Modal Dialogs & Modal Factory

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
- **Related WSs:** WS-002, WS-004
- **Related ICs:** none
- **Related IBs:** IB-002, IB-004
- **Related Intents:** INT-005, INT-014, INT-016
- **Owners:** Jeff Haskin

## Implements

- `src/modals/**`
- `src/ui/ModalFactory.ts`
- `src/styles/task-modal.css`
- `src/styles/task-editor.css`
- `src/styles/project-modal.css`

## Purpose and Scope

This slice is the plugin's dialog layer: every transient, overlay-based user interaction that edits a single entity or gathers a one-off decision. It groups the `Modal`/`SuggestModal` subclasses (`TaskModal`, `ProjectModal`, `ImportModal`, the picker modals, and the small confirm/prompt dialogs), the per-section render helpers those modals compose (`TaskFormFields`, `CustomFieldInputs`, `SubtasksPanel`, `TimeTrackingPanel`), the inline `[[`-autocomplete widget (`NoteLinkSuggest`), and the `ModalFactory` that is the single sanctioned entry point for opening any of them. Its stylesheets (`task-modal.css`, `task-editor.css`, `project-modal.css`) carry the scoped CSS for these overlays, which Obsidian renders outside the plugin's `.pm-root` and therefore must re-declare the `--pm-*` design tokens.

It exists as a coherent unit because these files share one job and one contract: they present a detached, cloned copy of an entity (task or project), let the user mutate it in a rich form, and — only on an explicit save (or the opt-in save-on-close) — hand the result to the persistence store and fire an `onSave` callback. Views and commands never construct these dialogs directly; they call `ModalFactory` helpers, which centralizes the 6-argument constructors, body pre-hydration, and callback wiring behind small option objects.

## Responsibilities

- Provide `ModalFactory` as the sole façade for opening dialogs: `openTaskModal`, `openProjectModal`, `openProjectPicker`, `openTaskPicker`, `openImportModal`, plus the promise-returning `confirmDialog`, `confirmDuplicateSubtasks`, and `promptText` helpers.
- Pre-hydrate an entity's on-disk body (via `store.loadTaskBody` / `store.loadProjectBody`) before opening the task/project modal, so the description renders in one paint rather than flashing empty.
- Edit a task end-to-end in `TaskModal`: a deep-cloned working copy, an autosizing title hero, the property grid, a markdown description with live preview / edit toggle, inline checkbox toggling, image paste-and-drop attachment insertion (through `store.saveTaskAttachment`), an overflow menu (open-as-note, archive/unarchive, delete-with-confirm), and Shift+Enter / save-on-close persistence.
- Route task persistence through the store's mutators — `insertTask`, `updateTask`, `moveTask` (on parent change), then `scheduleAfterChange` — and surface `TaskFileNameConflictError` as an inline title error rather than a crash.
- Render the task property form (`TaskFormFields`) with progressive disclosure of rarely-used fields, cycle-safe dependency options (`wouldCreateCycle`), assignee/tag multi-selects, and per-project custom fields (`CustomFieldInputs`); render subtasks (`SubtasksPanel`) and time tracking (`TimeTrackingPanel`) as self-contained sections.
- Create/edit projects in `ProjectModal`: icon and color pickers, description, team members, custom-field definitions, per-project status/priority palette overrides, and view/scheduling overrides — all edited on a clone and committed via `store.saveProject`.
- Run the two-phase note-import flow (`ImportModal`): vault file selection with search/select-all, default status/priority and move-vs-copy options, and delegation to `store.importNoteAsTask` / `store.importTaskForest`, including TaskNotes-sourced tasks via the integrations layer.
- Offer fuzzy pickers (`ProjectPickerModal`, `TaskPickerModal`, `TagPickerModal`) built on Obsidian's `SuggestModal`, and inline `[[` note-link autocomplete (`NoteLinkSuggest`) for description textareas.
- Own the scoped presentation of these overlays through the three stylesheets, re-declaring plugin CSS tokens because modals mount outside `.pm-root`.

## Boundaries and Non-Goals

**Inside the boundary:**
- The `Modal`/`SuggestModal` subclasses under `src/modals/` and their per-section render helpers.
- `ModalFactory` as the open-a-dialog façade and its lightweight inline dialogs (confirm, duplicate-subtasks, text prompt).
- `NoteLinkSuggest` inline autocomplete and the modal-specific CSS.
- Cloning entities on open, validating form input, and invoking store mutators + `onSave` on commit.

**Outside the boundary (non-goals):**
- Persistence, scheduling, cloning-to-disk, and conflict detection themselves — these dialogs *call* `plugin.store` (a `TaskSource`) for `insertTask`/`updateTask`/`moveTask`/`saveProject`/`importNoteAsTask`/`saveTaskAttachment`/`scheduleAfterChange` but own none of that logic; it belongs to the persistence-store AE. This keeps the dialog layer a thin, replaceable presentation shell over a stable store contract.
- The reusable UI component system (`src/ui/primitives/**`, `src/ui/composites/**`, `FormField`, `StatusBadge`, `PaletteListEditor`). Modals consume these building blocks but do not define them; ownership stays with the UI-component AE so a single catalog governs styling and the import-direction rule (primitives → composites → orchestrators).
- The long-lived `ItemView` surfaces (`DashboardView`, `ProjectView`, and the Table/Gantt/Kanban subviews). Those are orchestrators that *open* modals via `ModalFactory`; they are not part of this slice.
- The TaskNotes integration internals (`src/integrations/**`). `ImportModal` calls into them but the API adapters, capability probing, and forest-building live in their own slice.

## Three-tier Boundaries

<!-- canonical: parsed into the IR `boundaries` field (always_do / ask_first / never_do) -->

**Always do:**
- Open every dialog through a `ModalFactory` helper (`openTaskModal`, `openProjectModal`, the pickers, `confirmDialog`/`promptText`) — never instantiate a `Modal`/`SuggestModal` subclass directly, so body pre-hydration, callback wiring, and the 6-argument constructor shape stay centralized.
- Edit a deep clone of the entity and mutate the caller's object only when a store mutator runs on explicit save (or opt-in save-on-close), so cancel stays non-destructive; skip new/cancelled/already-saved/empty-title entities in the save-on-close path.
- Resolve effective status/priority palettes via `store.configFor(project)`, keep UI text sentence case, use `YYYY-MM-DD` date strings, and re-declare the `--pm-*` tokens in `.pm-modal` since modals mount outside `.pm-root`.

**Ask first:**
- Before changing the `ModalFactory` façade surface — its helper signatures or option objects — since `PMViewRouter`, all views, and the `src/main.ts` command handlers open dialogs exclusively through it.
- Before altering the save/commit contract — which store mutators are called (`insertTask`/`updateTask`/`moveTask`/`scheduleAfterChange`/`saveProject`/`importNoteAsTask`), the `onSave(entity)` callback shape, or the in-flight de-dup / double-submit / `TaskFileNameConflictError`-to-inline-error handling that callers rely on.
- Before adding any in-code `style` assignment beyond the sanctioned dynamic runtime values (computed colors, avatar hashes, popover/`NoteLinkSuggest` offsets), since the no-inline-styles rule is CI-enforced and styling belongs in the scoped stylesheets.

**Never do:**
- Never implement persistence, scheduling, cloning-to-disk, conflict detection, or self-write tracking inside a modal — these dialogs call `plugin.store` (the `TaskSource`) for that logic; it belongs to the persistence-store AE.
- Never define new UI primitives or composites here (`FormField`, `StatusBadge`, `PaletteListEditor`, etc.) or bypass the primitives → composites → orchestrators import direction — modals consume the UI-component AE's catalog, they don't own it.
- Never reach into TaskNotes integration internals (`src/integrations/**`) or reintroduce a long-lived `ItemView` surface here — `ImportModal` delegates to `store.importNoteAsTask`/`store.importTaskForest`, and views live in their own slices.

## Relationships and Dependencies

**Consumes:** `plugin.store` (the `TaskSource` implementation) for all reads/mutations; `plugin.settings` for global palettes, team members, and flags such as `saveTaskOnClose`; Obsidian primitives (`Modal`, `SuggestModal`, `ButtonComponent`, `ExtraButtonComponent`, `Menu`, `MarkdownRenderer`, `Notice`, `setIcon`, `setTooltip`, `prepareFuzzySearch`, `TFile`); domain types and factories from `src/types.ts` (`Task`, `Project`, `makeTask`, `makeProject`, `makeId`); pure tree/scheduling helpers (`flattenTasks`, `totalLoggedHours`, `wouldCreateCycle`, `rebuildTaskIndex`, `TaskFileNameConflictError`); utilities (`safeAsync`, `getDefaultStatusId`/`getDefaultPriorityId`, `getPriorityConfig`, `stringToColor`, `stringifyCustomValue`); the UI component system (`FormField`, `StatusBadge`, `PaletteListEditor`, `ui/composites/properties`, `addButton`, `Avatar`, `IconButton`, `ProgressBar`); the TaskNotes integrations (`integrations/tasknotes`, `integrations/tasknotesImport`); and `src/dates.ts` (`today`).

**Produces:** Committed entity mutations (persisted indirectly via store mutators) and `onSave(entity)` callback invocations that let callers refresh their views; user-facing `Notice` messages; task attachments written into the vault; and the transient DOM overlays themselves.

**Depends on:** the persistence-store AE (the `TaskSource` contract, cloning/save semantics, self-write tracking, and `configFor` palette resolution); the UI-component AE (primitives/composites and their CSS token contract); the domain type model in `src/types.ts`; and the TaskNotes integration slice for import.

**Consumed by:** `PMViewRouter` and the views (`DashboardView`, `ProjectView`, and the Table/Gantt/Kanban subviews) and the command handlers registered in `src/main.ts`, all of which open dialogs exclusively through `ModalFactory` rather than instantiating a `Modal` subclass directly.

## Constraints and Quality Notes

- Dialogs are opened only through `ModalFactory`; direct instantiation of a `Modal` subclass is disallowed by project convention so open-time concerns (body hydration, callback wiring, argument shape) stay centralized.
- Modals edit a deep clone of the entity and never mutate the caller's object until a store mutator runs, so cancel is always non-destructive.
- No inline styles: styling lives in the scoped stylesheets; the only in-code style assignments are genuinely dynamic runtime values (computed colors, avatar hashes, popover positions) that cannot be expressed statically. Because modals mount outside `.pm-root`, `.pm-modal` re-declares the `--pm-*` tokens.
- UI text is sentence case, dates are `YYYY-MM-DD` strings, and effective status/priority palettes are always resolved via `store.configFor(project)` rather than reading global settings directly.
- Save paths must tolerate concurrency and conflicts: `TaskModal` de-duplicates in-flight persistence, guards against double-submit, and translates a filename conflict into an inline, recoverable error.
- Save-on-close is opt-in (`settings.saveTaskOnClose`) and must skip new/cancelled/already-saved tasks and empty titles, to avoid writing accidental or invalid entities.

## Open Questions / Planned Follow-ons

- [ ] Should the near-identical clone-edit-commit lifecycle in `TaskModal` and `ProjectModal` be factored into a shared base or helper to reduce drift? — **Source:** initial draft — **Severity:** `P3`
- [ ] `NoteLinkSuggest` positioning writes computed pixel offsets directly to `style`; confirm this remains the only viable approach under the no-inline-styles rule as the styleguide evolves. — **Source:** initial draft — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: AE authored and locked directly against the current (already-shipped, CI-green) state of `src/modals/**`, `src/ui/ModalFactory.ts`, and the modal stylesheets (`task-modal.css`, `task-editor.css`, `project-modal.css`) at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted AEs stay mutable while we work in this repo and discover issues. | 60890286+jeffhaskin@users.noreply.github.com |
