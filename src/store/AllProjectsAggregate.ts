import { Notice } from 'obsidian'
import type { PMSettings, Project, Task } from '../types'
import type { TaskSource } from './TaskSource'
import { buildTaskIndex } from './TaskIndex'

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
  const tasks: Task[] = []
  for (const real of realProjects) {
    tagSubtree(real.tasks, real, ownerById)
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
    taskIndex: buildTaskIndex(tasks)
  }
  return { project, ownerById, realProjects }
}

/** Distinct owner projects present in the aggregate, for the Project filter dropdown. */
export function aggregateProjectOptions(ownerById: Map<string, Project>): { id: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const project of ownerById.values()) {
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
