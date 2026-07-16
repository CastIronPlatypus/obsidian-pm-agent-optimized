<!--
  Domain Glossary — terms specific to this project (Obsidian Project Manager plugin).
  Author and maintain with `/write-ggc`. Walks H2 sections (categories) for
  markdown tables: Term | Canonical Definition | NOT this | Code convention.
-->

# Domain Glossary

## Terminology

| Term | Canonical Definition | NOT this | Code convention |
|------|----------------------|----------|-----------------|
| Project Manager | This plugin (Obsidian community plugin id `project-manager`): full project management over plain-Markdown vault files with Table, Gantt, and Kanban views. | Not a generic reference to a person who manages projects; not the Obsidian app itself. | `PMPlugin`, ids prefixed `pm-` (`pm-project`, `pm-task`) |
| Project | A top-level container of tasks, persisted as one Markdown file with `pm-project: true` frontmatter plus a sibling `_tasks/` folder. | Not a task; not an Obsidian vault or folder in the generic sense. | `Project` (`src/types.ts`) |
| Task | A single unit of work, persisted as one Markdown file with `pm-task: true` frontmatter; may nest subtasks to any depth. | Not a Markdown checkbox item; not a TaskNotes note (which is a separate plugin's shape). | `Task` (`src/types.ts`) |
| Milestone | A zero-duration task (`type: milestone`) marking a key date, rendered as a diamond on the Gantt. | Not a regular task with equal start and due; not a project-level marker. | `type: 'milestone'` |
| Task Source | The persistence contract (`TaskSource`) every view, modal, and command reads and writes through; `ProjectStore` is the sole implementation. | Not the vault API; not a single backend class callers depend on directly. | `TaskSource`, `plugin.store` |
