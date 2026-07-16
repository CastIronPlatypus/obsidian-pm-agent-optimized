# AE-001: Task & Project Persistence Store

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
- **Related WSs:** WS-001, WS-002, WS-003
- **Related ICs:** none
- **Related IBs:** IB-001, IB-002, IB-003
- **Related Intents:** INT-001, INT-013, INT-014, INT-015
- **Owners:** Jeff Haskin

## Implements

- `src/store/**`

## Purpose and Scope

The persistence store is the sole surface through which the rest of the plugin reads and writes vault data. It maps the in-memory `Project`/`Task` object graph onto a one-file-per-entity Markdown+YAML layout (`Projects/<Name>.md` for project metadata, `Projects/<Name>_tasks/<slug>.md` per task, an `Archive/` subfolder for archived tasks) and back. `TaskSource` (`src/store/TaskSource.ts`) defines the persistence contract every view, modal, and command programs against; `ProjectStore` (`src/store/ProjectStore.ts`) is the sole implementation. This slice exists so that no other part of the plugin has to know how data is laid out on disk, how saves are batched and serialized, or how the plugin avoids reacting to its own writes.

## Responsibilities

- Load project and task files from the vault into the in-memory `Project`/`Task` tree, self-healing orphaned or misparented tasks from each file's `parentId`.
- Persist mutations back to disk with minimal writes: frontmatter-only ("fm") vs whole-file ("full") rewrites, tracked per task via dirty-tracking, batched and written concurrently.
- Serialize concurrent saves to the same project through a per-project promise queue so overlapping mutations never race.
- Distinguish the plugin's own vault writes from external edits (self-write tracking with a time window) so file-change listeners don't reload data the plugin just wrote itself.
- Lazily hydrate task/project body text (the Markdown description) on demand, keeping the fast path (frontmatter-only reads via Obsidian's metadata cache) cheap for list/table rendering.
- Resolve effective per-project configuration (statuses, priorities, default view, auto-scheduling) by layering `Project.config` overrides over global settings (`ProjectConfig.ts`).
- Provide dependency-based auto-scheduling with cycle detection (`Scheduler.ts`) and apply computed date patches through the same save path.
- Provide task-tree structural operations — add/move/delete/clone/flatten/reorder — independent of persistence (`TaskTreeOps.ts`), and an O(1) id-indexed lookup structure maintained alongside the tree (`TaskIndex.ts`).
- Convert between the on-disk YAML/frontmatter representation and in-memory objects, including migration of an older embedded-tasks format (`YamlParser.ts`, `YamlSerializer.ts`, `YamlHydrator.ts`).
- Archive/unarchive tasks by moving their file into or out of an `Archive/` subfolder, deriving `Task.archived` from that location rather than storing it in frontmatter (`ArchiveOps.ts`).
- Apply task filters (status/priority/assignee/tag/due-date/text/archived) against the in-memory tree for view rendering (`TaskFilter.ts`).

## Boundaries and Non-Goals

**Inside the boundary:**
- All read/write access to project and task `.md` files, including frontmatter parsing/serialization, file naming/renaming, and attachment-folder management.
- The `TaskSource` contract itself — the interface views/modals/commands are written against.
- Dirty-tracking, save-queue serialization, self-write suppression, and the project-level in-memory cache.
- Dependency-based auto-scheduling and cycle detection.
- Pure task-tree operations (flatten, find, move, clone) and the task index.

**Outside the boundary (non-goals):**
- Rendering task/project data to the screen — that's the views layer (`src/views/**`), which reads through `TaskSource` and never touches the vault directly.
- Deciding what UI action triggers a mutation (a drag-drop reorder, a modal save) — that's owned by views/modals, which call into this store's mutator methods.
- Import/conversion from other plugins' data formats (TaskNotes) beyond the `TaskSource.importNoteAsTask` / `importTaskForest` entry points this store implements — the format-specific parsing itself lives in the TaskNotes integration slice.
- Alternative backend implementations of `TaskSource` (e.g., a hypothetical read-through adapter over another plugin's data) — the contract is designed to allow this, but only `ProjectStore` exists today.

*Guardrail satisfied: rendering and UI-triggering are explicitly deferred to the views/modals layers because they are presentation concerns, not persistence concerns — keeping this AE's boundary at "vault I/O and in-memory canonicalization" only.*

## Three-tier Boundaries

<!-- canonical: parsed into the IR `boundaries` field (always_do / ask_first / never_do) -->

**Always do:**
- Resolve effective per-project configuration (statuses, priorities, default view, auto-scheduling) by layering `Project.config` over global `PMSettings` through `ProjectConfig`, never by reading global settings directly.
- Tolerate missing or malformed project/task files on every load path — never assume exclusive vault access, and self-heal orphaned or misparented tasks from each file's `parentId` rather than throwing.
- Distinguish the store's own writes from external edits via self-write tracking, and serialize concurrent saves to a project through its per-project promise queue so overlapping mutations never race.

**Ask first:**
- Before changing the on-disk file layout (`Projects/<Name>.md`, `Projects/<Name>_tasks/<slug>.md`, `Archive/` folder deriving `Task.archived`) or the YAML/frontmatter representation — it is a data-migration surface that affects existing, version-controlled vaults.
- Before altering the `TaskSource` contract itself, since it is the public interface every view, modal, command, and the TaskNotes integration slice programs against.
- Before widening a frontmatter-only ("fm") write into a whole-file ("full") rewrite for a change that does not touch task body/structure — it enlarges diffs, which contradicts the stated collaboration/minimal-diff product goal.

**Never do:**
- Never render task/project data to the screen or decide which UI action triggers a mutation — presentation and UI-triggering belong to the views/modals layers, which reach the vault only through `TaskSource`.
- Never fire saves unconditionally in parallel or bypass the 16-at-a-time batching and per-project queue — save correctness and bounded failure blast radius take priority over latency.
- Never implement TaskNotes-format-specific parsing here beyond the `importNoteAsTask` / `importTaskForest` entry points — that format parsing lives in the TaskNotes integration slice.

## Relationships and Dependencies

**Consumes:** Obsidian's `Vault`/`MetadataCache`/`FileManager` APIs (file read/write/rename/trash, frontmatter processing, cached frontmatter lookups); `PMSettings` (global statuses/priorities/config defaults) supplied by the plugin at construction.

**Produces:** The in-memory `Project`/`Task` object graph (with a live `taskIndex`) that every view, modal, and command reads and mutates through `TaskSource`; persisted `.md` files with `pm-project`/`pm-task` frontmatter markers that TaskNotes (a separate community plugin) can also read when configured to.

**Depends on:** Obsidian's vault/workspace runtime (this AE has no meaning outside an Obsidian plugin host); the plugin's `PMSettings` shape (`src/types.ts`) for status/priority palettes and per-project config resolution.

**Consumed by:** `src/views/**` (Project/Dashboard/Table/Gantt/Kanban views), `src/modals/**` (task/project/import modals), `src/main.ts` (commands, undo/redo stack), and the TaskNotes integration slice (which calls store mutators to materialize converted tasks).

## Constraints and Quality Notes

- Must never assume exclusive access to the vault: files can change on disk between the store's own writes (sync conflicts, external edits, other plugins), so every load path tolerates missing/malformed files gracefully rather than throwing.
- Save correctness takes priority over save latency: writes are batched (16 concurrent) and queued per project rather than fired unconditionally in parallel, to bound the blast radius of a single failed write and keep the on-disk state consistent with in-memory state.
- Frontmatter-only writes (`processFrontMatter`) are preferred over whole-file rewrites whenever a change doesn't touch task body/structure, to minimize unnecessary diffs in version-controlled vaults (a stated product goal — see README "Collaboration over the Project").

## Open Questions / Planned Follow-ons

- [ ] No alternative `TaskSource` implementation exists yet beyond `ProjectStore`; the interface's abstraction value is currently unexercised. — **Source:** initial draft — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: AE authored and locked directly against the current (already-shipped, CI-green) state of `src/store/**` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted AEs stay mutable while we work in this repo and discover issues. | 60890286+jeffhaskin@users.noreply.github.com |
