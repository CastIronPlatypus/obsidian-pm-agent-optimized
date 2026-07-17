// Create verbs: `new project`, `new task`, `new subtask`, `new milestone`.
// Every create delegates to the store — `createProject` / `insertTask` — so id
// minting, the INT-020 nested layout, the INT-021 managed backlink, ordering,
// and completion-stamping are all inherited, not re-coded.

import type { Task, TaskType } from '../../../src/types'
import { makeTask } from '../../../src/types'
import { findTaskById } from '../../../src/store'
import type { PmContext } from '../PmContext'
import { resolveProjectRef } from '../handles'
import { PmError, type HandlerOutput } from '../envelope'
import type { ParsedCommand } from '../args'
import { flagList, flagStr } from '../args'

/** Assemble a `Partial<Task>` from create flags. */
function overridesFromFlags(cmd: ParsedCommand, type: TaskType): Partial<Task> {
  const f = cmd.flags
  const title = flagStr(f, 'title') ?? cmd.positionals[0]
  if (!title) throw new PmError('E_USAGE', 'a --title is required')
  const overrides: Partial<Task> = { title, type }
  const status = flagStr(f, 'status')
  const priority = flagStr(f, 'priority')
  const due = flagStr(f, 'due')
  const start = flagStr(f, 'start')
  const desc = flagStr(f, 'desc')
  const estimate = flagStr(f, 'estimate')
  const assignees = flagList(f, 'assignee')
  const tags = flagList(f, 'tag')
  if (status) overrides.status = status
  if (priority) overrides.priority = priority
  if (due !== undefined && due !== '') overrides.due = due
  if (start !== undefined && start !== '') overrides.start = start
  if (desc) overrides.description = desc
  if (estimate && !Number.isNaN(Number(estimate))) overrides.timeEstimate = Number(estimate)
  if (assignees.length) overrides.assignees = assignees
  if (tags.length) overrides.tags = tags
  return overrides
}

export async function newProject(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const title = flagStr(cmd.flags, 'title') ?? cmd.positionals[0]
  if (!title) throw new PmError('E_USAGE', 'a --title is required')
  const dir = flagStr(cmd.flags, 'dir') ?? ''
  const project = await ctx.store.createProject(title, dir)
  return {
    data: { id: project.id, filePath: project.filePath, path: project.path ?? dir, title: project.title },
    changed_ids: [project.id]
  }
}

async function createTask(ctx: PmContext, cmd: ParsedCommand, type: TaskType): Promise<HandlerOutput> {
  const projectRef = flagStr(cmd.flags, 'project')
  if (!projectRef) throw new PmError('E_USAGE', 'a --project is required')
  const projects = await ctx.store.discoverProjects()
  const project = resolveProjectRef(projects, projectRef)

  const parentRef = flagStr(cmd.flags, 'parent')
  let parentId: string | null = null
  if (parentRef) {
    const parent = findTaskById(project, parentRef)
    if (!parent) throw new PmError('E_NOT_FOUND', `parent task "${parentRef}" not found in project`)
    parentId = parent.id
  }

  const task = makeTask(overridesFromFlags(cmd, type))
  await ctx.store.insertTask(project, task, parentId)
  return {
    data: { id: task.id, filePath: task.filePath ?? '', parentId, type: task.type },
    changed_ids: [task.id]
  }
}

export function newTask(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  return createTask(ctx, cmd, 'task')
}

export function newSubtask(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  return createTask(ctx, cmd, 'subtask')
}

export function newMilestone(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  return createTask(ctx, cmd, 'milestone')
}
