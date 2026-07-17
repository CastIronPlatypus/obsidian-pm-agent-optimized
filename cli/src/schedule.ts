// Read-side dependency/status helpers shared by `blocked`, `next`, `open`, and
// `deps`. (The post-mutation `scheduleAfterChange` pass lives on the store and is
// wired by the mutation commands in a later wave.)

import type { Project, StatusConfig, Task } from '../../src/types'
import { findTaskById, flattenTasks } from '../../src/store'

/** True when a task's status is terminal per the project's resolved palette. */
export function isComplete(task: Task, statuses: StatusConfig[]): boolean {
  return statuses.find((s) => s.id === task.status)?.complete ?? false
}

/** The subset of a task's dependency ids that are not yet complete. */
export function unmetDeps(project: Project, task: Task, statuses: StatusConfig[]): string[] {
  return task.dependencies.filter((depId) => {
    const dep = findTaskById(project, depId)
    return dep ? !isComplete(dep, statuses) : false
  })
}

/** Tasks that depend on `taskId` (its direct dependents). */
export function directDependents(project: Project, taskId: string): Task[] {
  return flattenTasks(project.tasks)
    .map((f) => f.task)
    .filter((t) => t.dependencies.includes(taskId))
}
