# All Projects view

A synthetic, always-present **"All Projects"** entry on the project dashboard. Opening it
renders one aggregated view of **every task, milestone, and subtask across all projects**,
using the same table / board / Gantt machinery as a normal project — plus a **Project**
field for filtering and sorting.

## What it does

- **Always on the dashboard.** The first card in the project grid is "All Projects" (rendered
  even when there are no projects yet).
- **Aggregates everything.** Every project's task tree is concatenated into one view; each item
  is tagged with the project that owns it (its **root project** — projects are a flat set, so an
  item's owner is simply the project whose tree contains it).
- **Behaves like a normal project view.** Same view switcher (table/board/Gantt), same row menus,
  same task editor. It is **fully editable** — see redispatch below.
- **Adds a Project field where the view already supports it:**
  - **Filter** — a "Project" dropdown in the filter row, in all three views.
  - **Sort** — a sortable **Project** column in the table view (table is the only view with sorting).
  - **Grouping** — none. The plugin has no grouping mechanism, and this change adds none.
- **Persists its own saved views** (and active filter / collapsed state) across sessions, like a
  real project.

## How it works

The whole feature is built around a synthetic `Project` and a store proxy; no view or modal code
needed per-call-site changes.

### The synthetic project — `src/store/AllProjectsAggregate.ts`

- `buildAllProjectsProject(store, settings)` loads every real project, tags each task with
  `ownerProjectId` / `ownerProjectTitle` (transient fields on `Task`, never serialized), and
  concatenates them into one in-memory `Project` with sentinel identity
  (`id = ALL_PROJECTS_ID`, `filePath = ALL_PROJECTS_PATH`). It returns an `ownerById` map from
  every task id to its real owning `Project`.
- Renderers detect aggregate mode by the cheap identity check `project.id === ALL_PROJECTS_ID`
  (via `isAggregateView`) — no flags are threaded through constructors.

### Edit redispatch — the store proxy

Every store mutator persists via the project's own file/`_tasks` folder, so a mutation keyed to
the fileless aggregate would write to a bogus `::all-projects_tasks/` folder. Instead,
`makeAggregateStore(realStore, resolveOwner)` returns a `Proxy` over the real store whose mutators
resolve each `taskId` to its **real owning project** and redispatch there (grouping bulk operations
by owner). Reads and every non-mutating method pass straight through. `ProjectView` hands this
proxied store to its subviews in aggregate mode, so editing a status, date, etc. in the All Projects
view writes back to the correct source project untouched.

### Persistence — `data.json`, not a file

The aggregate has no project file, so:

- **Saved views** persist to `PMSettings.allProjectsSavedViews` (instead of the project frontmatter).
- **Active filter / collapsed state** reuse the existing `projectFilters` / `collapsedTasks` maps
  keyed by `ALL_PROJECTS_PATH`; `cleanupStaleProjectFilters` skips that sentinel key so it is not
  garbage-collected for having no on-disk file.

## Deliberate constraints (v1)

- **No grouping** is added (matches the request: don't add grouping that isn't already there).
- **No top-level "add task"** in the aggregate — a brand-new top-level task has no target project.
  Adding **subtasks** (parent known) and editing existing items work normally.
- **No cross-project reparenting** — moving a task under a parent in a *different* project is
  refused with a notice; same-project moves/reorders work.
- **Custom fields** shown in the task editor are the global set (the aggregate has none of its own).

## Key files

| Concern | File |
| --- | --- |
| Aggregate builder, owner map, store proxy, sentinels | `src/store/AllProjectsAggregate.ts` |
| Dashboard card | `src/views/ProjectListRenderer.ts` |
| Routing | `src/views/PMViewRouter.ts` (`openAllProjects`) |
| Load / rebuild / persist / toolbar gating | `src/views/ProjectView.ts` |
| Project filter dropdown | `src/ui/composites/ProjectHeader/{ProjectHeader,FilterRow}.ts` |
| Project column + sort | `src/views/table/{TableRenderer,TableRow,TableFilters}.ts` |
| Filter predicate | `src/store/TaskFilter.ts` |
| Tests | `src/store/AllProjectsAggregate.test.ts` |
