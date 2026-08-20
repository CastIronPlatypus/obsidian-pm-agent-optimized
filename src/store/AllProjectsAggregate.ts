import { Notice } from 'obsidian'
import type { PMSettings, Project, StatusConfig, Task } from '../types'
import type { TaskSource } from './TaskSource'
import { resolveProjectConfig } from './ProjectConfig'
import { buildTaskIndex } from './TaskIndex'
import { formatBadgeText } from '../utils'

/**
 * The synthetic "All Projects" pseudo-project. It is never a real vault file:
 * these sentinels stand in for `Project.id` / `Project.filePath` so the router,
 * the project view, and the subview renderers can recognise aggregate mode by a
 * cheap identity check (`project.id === ALL_PROJECTS_ID`) instead of threading a
 * flag through every constructor.
 */
export const ALL_PROJECTS_ID = '__all_projects__'
export const ALL_PROJECTS_PATH = '::all-projects'
export const ALL_PROJECTS_TITLE = 'All Projects'
export const ALL_PROJECTS_ICON = '🗂️'
export const ALL_PROJECTS_COLOR = '#8a94a0'

/** Tag every node in a project's tree with its owning project and index it by id. */
function tagSubtree(tasks: Task[], project: Project, ownerById: Map<string, Project>): void {
  for (const task of tasks) {
    task.ownerProjectId = project.id
    task.ownerProjectTitle = project.title
    ownerById.set(task.id, project)
    if (task.subtasks.length) tagSubtree(task.subtasks, project, ownerById)
  }
}

/**
 * Union of every project's *resolved* statuses, deduped by id. Status ids are
 * project-scoped: two projects can reuse one id (e.g. `done`) with different
 * labels/colors/`complete` flags. A filter matches on the id, so each id can
 * appear only once — we seed with the global palette (so shared ids keep their
 * familiar global label and order), then append each project's statuses for ids
 * the global palette does not define (so a project-specific status such as
 * `status-ey7uke` surfaces with its real label, "Certified", instead of a raw id).
 */
export function unionStatuses(realProjects: Project[], settings: PMSettings): StatusConfig[] {
  const byId = new Map<string, StatusConfig>()
  for (const status of settings.statuses) if (!byId.has(status.id)) byId.set(status.id, status)
  for (const real of realProjects) {
    for (const status of resolveProjectConfig(real, settings).statuses) {
      if (!byId.has(status.id)) byId.set(status.id, status)
    }
  }
  return [...byId.values()]
}

/**
 * One entry per DISTINCT status label across every project, in first-seen order.
 * The filter lists these (so two projects that both call a status "Done" show a
 * single "Done" chip); selecting one matches any task whose resolved status has
 * that label, so `ids` carries every project-scoped id that resolves to it.
 */
export interface StatusFilterGroup {
  /** The shared display label, e.g. "Done". */
  label: string
  /** `formatBadgeText`-ready display text (icon + label) from the first status seen. */
  display: string
  /** Every status id, across all projects, whose resolved status carries this label. */
  ids: string[]
}

/**
 * Group every project's *resolved* statuses by display label. Unlike
 * {@link unionStatuses} (which dedupes by id and so cannot see two projects'
 * different ids for one shared label), this walks each project's full resolved
 * palette, so the "All Projects" status filter can offer one chip per label and
 * match it back to every underlying id.
 */
export function aggregateStatusFilterGroups(realProjects: Project[], settings: PMSettings): StatusFilterGroup[] {
  const byLabel = new Map<string, StatusFilterGroup>()
  for (const real of realProjects) {
    for (const status of resolveProjectConfig(real, settings).statuses) {
      const existing = byLabel.get(status.label)
      if (existing) {
        if (!existing.ids.includes(status.id)) existing.ids.push(status.id)
      } else {
        byLabel.set(status.label, {
          label: status.label,
          display: formatBadgeText(status.icon, status.label),
          ids: [status.id]
        })
      }
    }
  }
  return [...byLabel.values()]
}

/**
 * The statuses in effect for one task inside the aggregate: its OWN project's
 * resolved palette. Returns null outside the aggregate (no owner map) or when the
 * task's owner is unknown, so callers fall back to the aggregate union palette.
 */
export function aggregateStatusesForTask(project: Project, task: Task): StatusConfig[] | null {
  const owner = task.ownerProjectId
  if (!owner) return null
  return project.aggregateOwnerStatuses?.get(owner) ?? null
}

export interface AggregateResult {
  project: Project
  /** Maps every task/subtask id (across all projects) to its real owning project. */
  ownerById: Map<string, Project>
  /** The real projects, freshly loaded — kept alive as the redispatch targets. */
  realProjects: Project[]
}

/**
 * Build the in-memory "All Projects" aggregate: load every real project, tag its
 * tasks with their owner, and concatenate them into one synthetic `Project`. The
 * returned `ownerById` map is what the redispatch store (see
 * {@link makeAggregateStore}) uses to route each edit back to the real project.
 */
export async function buildAllProjectsProject(store: TaskSource, settings: PMSettings): Promise<AggregateResult> {
  const realProjects = await store.loadAllProjects(settings.projectsFolder)
  const ownerById = new Map<string, Project>()
  const ownerStatuses = new Map<string, StatusConfig[]>()
  const tasks: Task[] = []
  for (const real of realProjects) {
    tagSubtree(real.tasks, real, ownerById)
    ownerStatuses.set(real.id, resolveProjectConfig(real, settings).statuses)
    tasks.push(...real.tasks)
  }
  const now = new Date().toISOString()
  const project: Project = {
    id: ALL_PROJECTS_ID,
    title: ALL_PROJECTS_TITLE,
    description: '',
    color: ALL_PROJECTS_COLOR,
    icon: ALL_PROJECTS_ICON,
    tasks,
    customFields: [],
    teamMembers: [],
    createdAt: now,
    updatedAt: now,
    filePath: ALL_PROJECTS_PATH,
    savedViews: [...settings.allProjectsSavedViews],
    taskIndex: buildTaskIndex(tasks),
    // Genuine override (not `materialized`) so `configFor` uses this union palette.
    // The union is the fallback for anything that lacks a task-scoped palette
    // (e.g. sorting, or a task whose owner project vanished); per-task display and
    // editing instead read `aggregateOwnerStatuses` for each task's OWN palette.
    config: { statuses: unionStatuses(realProjects, settings) },
    aggregateOwnerStatuses: ownerStatuses
  }
  return { project, ownerById, realProjects }
}

/**
 * Options for the Project filter dropdown: EVERY discovered project (deduped by
 * id), sorted by title. Built from the full project list — not from the task
 * owner map — so projects with no tasks are still listed.
 */
export function aggregateProjectOptions(projects: Project[]): { id: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const project of projects) {
    if (!seen.has(project.id)) seen.set(project.id, project.title)
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Wrap a real `TaskSource` so that every mutation issued against the synthetic
 * aggregate project is redispatched to the REAL owning project of the task(s)
 * involved — the aggregate has no file, so a mutation keyed to it would write to
 * a bogus `::all-projects_tasks/` folder. Reads and non-task methods pass through
 * to the real store unchanged.
 *
 * `resolveOwner` is a function (not a captured map) so the project view can swap
 * the map on refresh without rebuilding the proxy.
 */
export function makeAggregateStore(
  real: TaskSource,
  resolveOwner: (taskId: string) => Project | undefined
): TaskSource {
  const owner = (taskId: string): Project | undefined => {
    const p = resolveOwner(taskId)
    if (!p) console.warn(`[all-projects] no owner project for task ${taskId}; edit skipped`)
    return p
  }

  const groupByOwner = (ids: string[]): Map<Project, string[]> => {
    const groups = new Map<Project, string[]>()
    for (const id of ids) {
      const p = owner(id)
      if (!p) continue
      const list = groups.get(p)
      if (list) list.push(id)
      else groups.set(p, [id])
    }
    return groups
  }

  const overrides: Partial<TaskSource> = {
    async updateTask(_p, taskId, patch) {
      const p = owner(taskId)
      if (p) await real.updateTask(p, taskId, patch)
    },
    async updateTasks(_p, taskIds, patch) {
      for (const [proj, ids] of groupByOwner(taskIds)) await real.updateTasks(proj, ids, patch)
    },
    async deleteTask(_p, taskId) {
      const p = owner(taskId)
      if (p) await real.deleteTask(p, taskId)
    },
    async deleteTasks(_p, taskIds) {
      for (const [proj, ids] of groupByOwner(taskIds)) await real.deleteTasks(proj, ids)
    },
    async archiveTask(_p, taskId) {
      const p = owner(taskId)
      if (p) await real.archiveTask(p, taskId)
    },
    async unarchiveTask(_p, taskId) {
      const p = owner(taskId)
      if (p) await real.unarchiveTask(p, taskId)
    },
    async duplicateTask(_p, sourceId, includeSubtasks) {
      const p = owner(sourceId)
      return p ? real.duplicateTask(p, sourceId, includeSubtasks) : null
    },
    async insertTask(_p, task, parentId) {
      if (!parentId) {
        new Notice('Open a specific project to add a top-level task.')
        return
      }
      const p = owner(parentId)
      if (p) await real.insertTask(p, task, parentId)
    },
    async moveTask(_p, taskId, newParentId) {
      const src = owner(taskId)
      if (!src) return
      if (newParentId === null) {
        await real.moveTask(src, taskId, null)
        return
      }
      const dest = owner(newParentId)
      if (dest && dest === src) await real.moveTask(src, taskId, newParentId)
      else new Notice('Cannot move a task across projects from here.')
    },
    async moveTasks(_p, taskIds, newParentId) {
      if (newParentId === null) {
        for (const [proj, ids] of groupByOwner(taskIds)) await real.moveTasks(proj, ids, null)
        return
      }
      const dest = owner(newParentId)
      if (!dest) return
      const sameProject = taskIds.filter((id) => owner(id) === dest)
      if (sameProject.length) await real.moveTasks(dest, sameProject, newParentId)
      if (sameProject.length !== taskIds.length) {
        new Notice('Some tasks were not moved — cannot reparent across projects here.')
      }
    },
    async reorderTask(_p, taskId, targetId, position) {
      const src = owner(taskId)
      if (src && src === owner(targetId)) await real.reorderTask(src, taskId, targetId, position)
    },
    async scheduleAfterChange(_p, changedTaskId) {
      if (!changedTaskId) return 0
      const p = owner(changedTaskId)
      return p ? real.scheduleAfterChange(p, changedTaskId) : 0
    },
    async shiftTaskDates(_p, taskId, deltaDays, opts) {
      const p = owner(taskId)
      return p ? real.shiftTaskDates(p, taskId, deltaDays, opts) : 0
    },
    async saveTaskAttachment(_p, task, fileName, data) {
      const p = owner(task.id) ?? _p
      return real.saveTaskAttachment(p, task, fileName, data)
    },
    findTaskFileConflict(_p, task) {
      const p = owner(task.id)
      return p ? real.findTaskFileConflict(p, task) : null
    }
  }

  return new Proxy(real, {
    get(target, prop) {
      if (prop in overrides) return overrides[prop as keyof TaskSource]
      const value = target[prop as keyof TaskSource]
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    }
  })
}
