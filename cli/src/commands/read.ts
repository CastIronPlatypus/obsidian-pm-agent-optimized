// Read / navigation verbs. Every handler delegates computation to the store /
// pure tree ops; the CLI only shapes the envelope. No handler mutates the vault.

import { TFile } from 'obsidian'
import type { Project, Task } from '../../../src/types'
import { flattenTasks } from '../../../src/store'
import { today, parsePlainDate } from '../../../src/dates'
import type { PmContext } from '../PmContext'
import { resolveHandle, resolveProjectRef } from '../handles'
import { PmError, type HandlerOutput } from '../envelope'
import type { ParsedCommand } from '../args'
import { flagBool, flagList, flagNum, flagStr } from '../args'
import { buildTreeNodes, lineageOf, STATUS_LEGEND, type LineageEntry } from '../render'
import { directDependents, isComplete, unmetDeps } from '../schedule'

interface Located {
  project: Project
  task: Task
  parentId: string | null
}

/** Every non-archived task across every project, with its project + parent. */
function allTasks(projects: Project[]): Located[] {
  const out: Located[] = []
  for (const project of projects) {
    for (const f of flattenTasks(project.tasks)) {
      if (f.task.archived) continue
      out.push({ project, task: f.task, parentId: f.parentId })
    }
  }
  return out
}

/** A lineage-shaped item summary. */
function shape(project: Project, task: Task, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    type: task.type,
    due: task.due,
    project: project.id,
    lineage: lineageOf(project, task) as LineageEntry[],
    ...extra
  }
}

// ─── projects ─────────────────────────────────────────────────────────────────

export async function projects(ctx: PmContext): Promise<HandlerOutput> {
  const all = await ctx.store.discoverProjects()
  return {
    data: {
      projects: all.map((p) => ({
        id: p.id,
        title: p.title,
        filePath: p.filePath,
        path: p.path ?? '',
        taskCount: flattenTasks(p.tasks).length
      }))
    }
  }
}

// ─── tree ─────────────────────────────────────────────────────────────────────

export async function tree(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const handle = cmd.positionals[0]
  if (!handle) throw new PmError('E_USAGE', 'tree requires a handle')
  const all = await ctx.store.discoverProjects()
  const located = resolveHandle(all, handle)
  const depth = flagNum(cmd.flags, 'depth')

  const project = located.project
  const root = located.kind === 'task' ? located.task : null
  const nodes = await buildTreeNodes(ctx, project, root, depth !== undefined ? { depth } : {})
  return { data: { project: project.id, legend: STATUS_LEGEND, nodes } }
}

// ─── today ────────────────────────────────────────────────────────────────────

export async function todayCmd(ctx: PmContext): Promise<HandlerOutput> {
  const all = await ctx.store.discoverProjects()
  const iso = today().toString()
  const items: Record<string, unknown>[] = []
  let overdueCount = 0
  let firstOverdue: { id: string; project: string; due: string } | null = null

  for (const { project, task } of allTasks(all)) {
    if (!task.due) continue
    const statuses = ctx.store.configFor(project).statuses
    if (task.due === iso) {
      items.push(shape(project, task))
    } else if (task.due < iso && !isComplete(task, statuses)) {
      overdueCount++
      if (!firstOverdue) firstOverdue = { id: task.id, project: project.id, due: task.due }
    }
  }

  const overdue = overdueCount > 0 ? { count: overdueCount, next: firstOverdue } : null
  return { data: { items, overdue } }
}

// ─── overdue ──────────────────────────────────────────────────────────────────

export async function overdueCmd(ctx: PmContext): Promise<HandlerOutput> {
  const all = await ctx.store.discoverProjects()
  const iso = today().toString()
  const items = allTasks(all)
    .filter(({ project, task }) => task.due && task.due < iso && !isComplete(task, ctx.store.configFor(project).statuses))
    .map(({ project, task }) => shape(project, task))
  return { data: { items } }
}

// ─── open ─────────────────────────────────────────────────────────────────────

export async function open(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const all = await ctx.store.discoverProjects()
  const items = allTasks(all)
    .filter(({ project, task }) => !isComplete(task, ctx.store.configFor(project).statuses))
    .map(({ project, task }) => {
      const unmet = unmetDeps(project, task, ctx.store.configFor(project).statuses)
      return shape(project, task, { blocked: unmet.length > 0, blockedBy: unmet })
    })
  if (flagStr(cmd.flags, 'by') === 'deps') {
    items.sort((a, b) => Number(a.blocked) - Number(b.blocked))
  }
  return { data: { items } }
}

// ─── blocked ──────────────────────────────────────────────────────────────────

export async function blocked(ctx: PmContext): Promise<HandlerOutput> {
  const all = await ctx.store.discoverProjects()
  const items: Record<string, unknown>[] = []
  for (const { project, task } of allTasks(all)) {
    const statuses = ctx.store.configFor(project).statuses
    if (isComplete(task, statuses)) continue
    const unmet = unmetDeps(project, task, statuses)
    if (unmet.length > 0) items.push(shape(project, task, { blockedBy: unmet }))
  }
  return { data: { items } }
}

// ─── next ─────────────────────────────────────────────────────────────────────

export async function next(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const all = await ctx.store.discoverProjects()
  const iso = today().toString()
  const frontier: Record<string, unknown>[] = []
  for (const { project, task } of allTasks(all)) {
    const statuses = ctx.store.configFor(project).statuses
    if (isComplete(task, statuses)) continue
    if (unmetDeps(project, task, statuses).length > 0) continue
    frontier.push(shape(project, task))
  }
  // Rank: overdue → soonest due → the rest.
  frontier.sort((a, b) => {
    const da = String(a.due ?? '')
    const db = String(b.due ?? '')
    const oa = da && da < iso ? 0 : 1
    const ob = db && db < iso ? 0 : 1
    if (oa !== ob) return oa - ob
    if (da && db) return da.localeCompare(db)
    return da ? -1 : db ? 1 : 0
  })
  const limit = flagNum(cmd.flags, 'limit')
  return { data: { items: limit !== undefined ? frontier.slice(0, limit) : frontier } }
}

// ─── deps ─────────────────────────────────────────────────────────────────────

export async function deps(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const handle = cmd.positionals[0]
  if (!handle) throw new PmError('E_USAGE', 'deps requires a handle')
  const all = await ctx.store.discoverProjects()
  const located = resolveHandle(all, handle)
  if (located.kind !== 'task') throw new PmError('E_NOT_FOUND', 'deps requires a task handle')
  const { project, task } = located
  const dependsOn = task.dependencies
  const blocks = directDependents(project, task.id).map((t) => t.id)
  return { data: { id: task.id, depends_on: dependsOn, blocks } }
}

// ─── path ─────────────────────────────────────────────────────────────────────

export async function pathCmd(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const handle = cmd.positionals[0]
  if (!handle) throw new PmError('E_USAGE', 'path requires a handle')
  const all = await ctx.store.discoverProjects()
  const located = resolveHandle(all, handle)
  if (located.kind === 'project') {
    return { data: { path: [{ id: located.project.id, title: located.project.title, type: 'project' }] } }
  }
  const crumbs = lineageOf(located.project, located.task)
  return {
    data: {
      path: [...crumbs, { id: located.task.id, title: located.task.title, type: located.task.type }]
    }
  }
}

// ─── show ─────────────────────────────────────────────────────────────────────

export async function show(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const handle = cmd.positionals[0]
  if (!handle) throw new PmError('E_USAGE', 'show requires a handle')
  const all = await ctx.store.discoverProjects()
  const located = resolveHandle(all, handle)
  const withBody = flagBool(cmd.flags, 'with-body')
  const fields = flagList(cmd.flags, 'fields')

  let entity: Record<string, unknown>
  if (located.kind === 'project') {
    if (withBody) await ctx.store.loadProjectBody(located.project)
    const p = located.project
    entity = {
      id: p.id,
      title: p.title,
      filePath: p.filePath,
      path: p.path ?? '',
      icon: p.icon,
      color: p.color,
      description: withBody ? p.description : undefined
    }
  } else {
    if (withBody) await ctx.store.loadTaskBody(located.task)
    entity = { ...located.task, parentId: located.parentId }
    entity.subtasks = undefined
    if (!withBody) entity.description = undefined
  }
  if (fields.length) {
    const trimmed: Record<string, unknown> = {}
    for (const key of fields) if (key in entity) trimmed[key] = entity[key]
    entity = trimmed
  }
  return { data: entity }
}

// ─── find / ls ────────────────────────────────────────────────────────────────

export async function find(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const all = await ctx.store.discoverProjects()
  const projectRef = flagStr(cmd.flags, 'project')
  const scope = projectRef ? [resolveProjectRef(all, projectRef)] : all

  const wantStatus = flagList(cmd.flags, 'status')
  const wantPriority = flagList(cmd.flags, 'priority')
  const wantAssignee = flagList(cmd.flags, 'assignee')
  const wantTag = flagList(cmd.flags, 'tag')
  const wantType = flagStr(cmd.flags, 'type')
  const wantDue = flagStr(cmd.flags, 'due')
  const wantStart = flagStr(cmd.flags, 'start')
  const wantMilestone = flagBool(cmd.flags, 'milestone')
  const hasNotes = flagBool(cmd.flags, 'has-notes')
  const text = cmd.positionals[0]?.toLowerCase()

  const items: Record<string, unknown>[] = []
  for (const { project, task } of allTasks(scope)) {
    if (wantStatus.length && !wantStatus.includes(task.status)) continue
    if (wantPriority.length && !wantPriority.includes(task.priority)) continue
    if (wantType && task.type !== wantType) continue
    if (wantMilestone && task.type !== 'milestone') continue
    if (wantDue && task.due !== wantDue) continue
    if (wantStart && task.start !== wantStart) continue
    if (wantAssignee.length && !wantAssignee.some((a) => task.assignees.includes(a))) continue
    if (wantTag.length && !wantTag.some((t) => task.tags.includes(t))) continue
    if (text && !task.title.toLowerCase().includes(text)) continue
    if (hasNotes && task.filePath) {
      const file = ctx.vault.getAbstractFileByPath(task.filePath)
      if (!(file instanceof TFile) || !(await ctx.store.hasBodyContent(file))) continue
    } else if (hasNotes) {
      continue
    }
    items.push(shape(project, task))
  }
  const limit = flagNum(cmd.flags, 'limit')
  return { data: { items: limit !== undefined ? items.slice(0, limit) : items } }
}

// ─── agenda ───────────────────────────────────────────────────────────────────

export async function agenda(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const arg = cmd.positionals[0] ?? today().toString()
  const [fromStr, toStr] = arg.includes('..') ? arg.split('..') : [arg, arg]
  const from = parsePlainDate(fromStr!)
  const to = parsePlainDate(toStr!)
  if (!from || !to) throw new PmError('E_USAGE', `invalid agenda date/range "${arg}"`)
  const all = await ctx.store.discoverProjects()
  const items = allTasks(all)
    .filter(({ task }) => task.due && task.due >= from.toString() && task.due <= to.toString())
    .map(({ project, task }) => shape(project, task))
    .sort((a, b) => String(a.due).localeCompare(String(b.due)))
  return { data: { from: from.toString(), to: to.toString(), items } }
}

// ─── log ──────────────────────────────────────────────────────────────────────

export async function log(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const since = flagStr(cmd.flags, 'since')
  const all = await ctx.store.discoverProjects()
  const items = allTasks(all)
    .filter(({ task }) => (since ? task.updatedAt >= since : true))
    .map(({ project, task }) => shape(project, task, { updatedAt: task.updatedAt }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  return { data: { items } }
}

// ─── palette ──────────────────────────────────────────────────────────────────

export async function palette(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const ref = cmd.positionals[0] ?? flagStr(cmd.flags, 'project')
  if (ref) {
    const all = await ctx.store.discoverProjects()
    const project = resolveProjectRef(all, ref)
    const cfg = ctx.store.configFor(project)
    return { data: { project: project.id, statuses: cfg.statuses, priorities: cfg.priorities } }
  }
  return { data: { statuses: ctx.settings.statuses, priorities: ctx.settings.priorities } }
}

// ─── schema ───────────────────────────────────────────────────────────────────

const TASK_SCHEMA = {
  $id: 'pm:task',
  type: 'object',
  required: ['id', 'title', 'type', 'status', 'priority'],
  properties: {
    id: { type: 'string', description: 'stable, minted by makeId()' },
    title: { type: 'string' },
    type: { enum: ['task', 'milestone', 'subtask'] },
    status: { type: 'string', 'x-palette': 'status' },
    priority: { type: 'string', 'x-palette': 'priority' },
    start: { type: 'string', pattern: '^(\\d{4}-\\d{2}-\\d{2})?$' },
    due: { type: 'string', pattern: '^(\\d{4}-\\d{2}-\\d{2})?$' },
    progress: { type: 'integer', minimum: 0, maximum: 100 },
    completed: { type: 'string' },
    assignees: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
    dependencies: { type: 'array', items: { type: 'string' } },
    subtaskIds: { type: 'array', items: { type: 'string' } },
    timeEstimate: { type: 'number' },
    customFields: { type: 'object' }
  }
}

const PROJECT_SCHEMA = {
  $id: 'pm:project',
  type: 'object',
  required: ['id', 'title'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    path: { type: 'string' },
    icon: { type: 'string' },
    color: { type: 'string' }
  }
}

export function schema(_ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const entity = cmd.positionals[0]
  if (entity === 'task') return Promise.resolve({ data: { schema: TASK_SCHEMA } })
  if (entity === 'project') return Promise.resolve({ data: { schema: PROJECT_SCHEMA } })
  return Promise.resolve({ data: { schema: { task: TASK_SCHEMA, project: PROJECT_SCHEMA } } })
}
