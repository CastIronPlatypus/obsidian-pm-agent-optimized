// Mutation verbs: the general `set` patch, its `status`/`assign`/`due`/`priority`
// convenience wrappers, `note` (body edit), `rename` (bidirectional), `mv`
// (reparent / project folder move), `shift` (relative date move), and
// `archive`/`unarchive`. Every write delegates to a tested store mutator; the
// CLI only coerces inputs, shapes the envelope, and (default-on) runs one
// post-mutation schedule cascade.

import type { Project, Task } from '../../../src/types'
import { parsePlainDate } from '../../../src/dates'
import type { PmContext } from '../PmContext'
import { resolveHandle, type Located } from '../handles'
import { PmError, type HandlerOutput } from '../envelope'
import type { ParsedCommand } from '../args'
import { flagBool, flagStr } from '../args'
import { coercePatch, parseAssignments } from '../coerce'
import { cascadeAfterMutation, patchTriggersSchedule, previewCascade } from '../schedule'

/** Unique-preserving concat. */
function uniq(...lists: string[][]): string[] {
  return [...new Set(lists.flat())]
}

/** Apply a shallow field patch onto a cloned task tree (for dry-run preview). */
function cloneWithPatch(project: Project, taskId: string, patch: Partial<Task>): Project {
  const clone = structuredClone(project) as Project
  const stack: Task[] = [...clone.tasks]
  while (stack.length) {
    const t = stack.pop()!
    if (t.id === taskId) {
      Object.assign(t, patch)
      break
    }
    stack.push(...t.subtasks)
  }
  return clone
}

// ─── set (general patch) ────────────────────────────────────────────────────

export async function set(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const handle = cmd.positionals[0]
  if (!handle) throw new PmError('E_USAGE', 'set requires a handle')
  const raw = parseAssignments(cmd.positionals.slice(1))
  if (Object.keys(raw).length === 0) throw new PmError('E_USAGE', 'set requires at least one field=value')

  const all = await ctx.store.discoverProjects()
  const located = resolveHandle(all, handle)
  const dryRun = flagBool(cmd.flags, 'dry-run')
  const noCascade = flagBool(cmd.flags, 'no-cascade')

  if (located.kind === 'project') {
    return setProject(ctx, located.project, raw, dryRun)
  }
  return applyTaskPatch(ctx, located.project, located.task.id, coercePatch(raw), { dryRun, noCascade })
}

/** Patch a project: `title` renames it, `dir` moves it, others save in place. */
async function setProject(
  ctx: PmContext,
  project: Project,
  raw: Record<string, string>,
  dryRun: boolean
): Promise<HandlerOutput> {
  if (dryRun) return { data: { id: project.id, patch: raw }, changed_ids: [project.id] }
  if (raw.dir !== undefined) await ctx.store.moveProject(project, raw.dir)
  if (raw.title !== undefined) await ctx.store.renameProject(project, raw.title)
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'dir' || k === 'title') continue
    ;(project as unknown as Record<string, unknown>)[k] = v
  }
  if (Object.keys(raw).some((k) => k !== 'dir' && k !== 'title')) await ctx.store.saveProject(project)
  return { data: { id: project.id }, changed_ids: [project.id] }
}

/**
 * The shared task-mutation path: apply the patch through `updateTask`, then run
 * one schedule cascade (unless suppressed) and report the moved dependents.
 */
async function applyTaskPatch(
  ctx: PmContext,
  project: Project,
  taskId: string,
  patch: Partial<Task>,
  opts: { dryRun: boolean; noCascade: boolean }
): Promise<HandlerOutput> {
  const willSchedule = !opts.noCascade && patchTriggersSchedule(patch as Record<string, unknown>)

  if (opts.dryRun) {
    let scheduled: string[] = []
    if (willSchedule) {
      const preview = cloneWithPatch(project, taskId, patch)
      scheduled = previewCascade(preview, ctx.store.configFor(project).statuses, taskId)
    }
    return { data: { id: taskId, patch, scheduled }, changed_ids: uniq([taskId], scheduled) }
  }

  await ctx.store.updateTask(project, taskId, patch)
  const scheduled = willSchedule ? await cascadeAfterMutation(ctx, project, taskId) : []
  return { data: { id: taskId, scheduled }, changed_ids: uniq([taskId], scheduled) }
}

// ─── status / assign / due / priority (convenience wrappers on set) ─────────

function convenience(field: string): (ctx: PmContext, cmd: ParsedCommand) => Promise<HandlerOutput> {
  return async (ctx, cmd) => {
    const handle = cmd.positionals[0]
    if (!handle) throw new PmError('E_USAGE', `${field} requires a handle`)
    const value = cmd.positionals.slice(1).join(',')
    const all = await ctx.store.discoverProjects()
    const located = resolveHandle(all, handle)
    if (located.kind !== 'task') throw new PmError('E_NOT_FOUND', `${field} requires a task handle`)
    const patch = coercePatch({ [field]: value })
    return applyTaskPatch(ctx, located.project, located.task.id, patch, {
      dryRun: flagBool(cmd.flags, 'dry-run'),
      noCascade: flagBool(cmd.flags, 'no-cascade')
    })
  }
}

export const status = convenience('status')
export const priority = convenience('priority')
export const due = convenience('due')

/** `assign <handle> @a @b` sets the assignee list (comma/space separated). */
export async function assign(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const handle = cmd.positionals[0]
  if (!handle) throw new PmError('E_USAGE', 'assign requires a handle')
  const people = cmd.positionals.slice(1).map((p) => p.replace(/^@/, ''))
  const all = await ctx.store.discoverProjects()
  const located = resolveHandle(all, handle)
  if (located.kind !== 'task') throw new PmError('E_NOT_FOUND', 'assign requires a task handle')
  return applyTaskPatch(
    ctx,
    located.project,
    located.task.id,
    { assignees: people },
    {
      dryRun: flagBool(cmd.flags, 'dry-run'),
      noCascade: flagBool(cmd.flags, 'no-cascade')
    }
  )
}

// ─── note (body edit) ───────────────────────────────────────────────────────

export async function note(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const handle = cmd.positionals[0]
  if (!handle) throw new PmError('E_USAGE', 'note requires a handle')
  const all = await ctx.store.discoverProjects()
  const located = resolveHandle(all, handle)
  if (located.kind !== 'task') throw new PmError('E_NOT_FOUND', 'note requires a task handle')
  const { project, task } = located

  const setText = flagStr(cmd.flags, 'set')
  const appendText = flagStr(cmd.flags, 'append')
  const prependText = flagStr(cmd.flags, 'prepend')
  if (setText === undefined && appendText === undefined && prependText === undefined) {
    throw new PmError('E_USAGE', 'note requires one of --set, --append, --prepend')
  }

  await ctx.store.loadTaskBody(task)
  const current = task.description ?? ''
  let next = current
  if (setText !== undefined) next = setText
  else if (appendText !== undefined) next = current ? `${current}\n\n${appendText}` : appendText
  else if (prependText !== undefined) next = current ? `${prependText}\n\n${current}` : prependText

  if (flagBool(cmd.flags, 'dry-run')) return { data: { id: task.id, description: next }, changed_ids: [task.id] }
  await ctx.store.updateTask(project, task.id, { description: next })
  return { data: { id: task.id }, changed_ids: [task.id] }
}

// ─── rename (bidirectional) ─────────────────────────────────────────────────

export async function rename(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const handle = cmd.positionals[0]
  if (!handle) throw new PmError('E_USAGE', 'rename requires a handle')
  const title = flagStr(cmd.flags, 'title') ?? cmd.positionals.slice(1).join(' ')
  if (!title) throw new PmError('E_USAGE', 'rename requires a new title')
  const all = await ctx.store.discoverProjects()
  const located = resolveHandle(all, handle)
  const dryRun = flagBool(cmd.flags, 'dry-run')

  if (located.kind === 'project') {
    if (!dryRun) await ctx.store.renameProject(located.project, title)
    return { data: { id: located.project.id, title }, changed_ids: [located.project.id] }
  }
  if (!dryRun) await ctx.store.updateTask(located.project, located.task.id, { title })
  return { data: { id: located.task.id, title }, changed_ids: [located.task.id] }
}

// ─── mv (reparent) / mv project (folder move) ───────────────────────────────

export async function mv(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const dryRun = flagBool(cmd.flags, 'dry-run')

  // `mv project <handle> --dir <path>` relocates a project's whole folder.
  if (cmd.positionals[0] === 'project') {
    const handle = cmd.positionals[1]
    if (!handle) throw new PmError('E_USAGE', 'mv project requires a project handle')
    const dir = flagStr(cmd.flags, 'dir')
    if (dir === undefined) throw new PmError('E_USAGE', 'mv project requires --dir <path>')
    const all = await ctx.store.discoverProjects()
    const located = resolveHandle(all, handle)
    if (located.kind !== 'project') throw new PmError('E_NOT_FOUND', 'mv project requires a project handle')
    if (!dryRun) await ctx.store.moveProject(located.project, dir)
    return { data: { id: located.project.id, dir }, changed_ids: [located.project.id] }
  }

  // `mv <handle> --parent <handle|root>` reparents a task.
  const handle = cmd.positionals[0]
  if (!handle) throw new PmError('E_USAGE', 'mv requires a handle')
  const parentRef = flagStr(cmd.flags, 'parent')
  if (parentRef === undefined) throw new PmError('E_USAGE', 'mv requires --parent <handle|root>')
  const all = await ctx.store.discoverProjects()
  const located = resolveHandle(all, handle)
  if (located.kind !== 'task') throw new PmError('E_NOT_FOUND', 'mv requires a task handle')

  let newParentId: string | null = null
  if (parentRef !== 'root') {
    const parent = resolveTaskInProject(located, parentRef)
    newParentId = parent.id
  }
  if (!dryRun) await ctx.store.moveTask(located.project, located.task.id, newParentId)
  return { data: { id: located.task.id, parentId: newParentId }, changed_ids: [located.task.id] }
}

/** Resolve a task handle within the SAME project as `located`. */
function resolveTaskInProject(located: Located & { kind: 'task' }, ref: string): Task {
  const inner = resolveHandle([located.project], ref)
  if (inner.kind !== 'task') throw new PmError('E_NOT_FOUND', `parent handle "${ref}" is not a task`)
  return inner.task
}

// ─── shift (relative date move) ─────────────────────────────────────────────

export async function shift(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const handle = cmd.positionals[0]
  if (!handle) throw new PmError('E_USAGE', 'shift requires a handle')
  const offset = cmd.positionals[1]
  const m = offset ? /^([+-]?\d+)d$/.exec(offset.trim()) : null
  if (!m) throw new PmError('E_USAGE', 'shift requires an offset like +7d or -3d')
  const days = Number(m[1])
  const shiftDate = (iso: string): string => parsePlainDate(iso)?.add({ days }).toString() ?? iso

  const all = await ctx.store.discoverProjects()
  const located = resolveHandle(all, handle)
  if (located.kind !== 'task') throw new PmError('E_NOT_FOUND', 'shift requires a task handle')
  const { project, task } = located

  const patch: Partial<Task> = {}
  if (task.start) patch.start = shiftDate(task.start)
  if (task.due) patch.due = shiftDate(task.due)
  if (Object.keys(patch).length === 0) throw new PmError('E_USAGE', 'the task has no start/due date to shift')

  return applyTaskPatch(ctx, project, task.id, patch, {
    dryRun: flagBool(cmd.flags, 'dry-run'),
    noCascade: flagBool(cmd.flags, 'no-cascade')
  })
}

// ─── archive / unarchive ────────────────────────────────────────────────────

export async function archive(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const handle = cmd.positionals[0]
  if (!handle) throw new PmError('E_USAGE', 'archive requires a handle')
  const all = await ctx.store.discoverProjects()
  const located = resolveHandle(all, handle)
  if (located.kind !== 'task') throw new PmError('E_NOT_FOUND', 'archive requires a task handle')
  if (!flagBool(cmd.flags, 'dry-run')) await ctx.store.archiveTask(located.project, located.task.id)
  return { data: { id: located.task.id, archived: true }, changed_ids: [located.task.id] }
}

export async function unarchive(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const handle = cmd.positionals[0]
  if (!handle) throw new PmError('E_USAGE', 'unarchive requires a handle')
  const all = await ctx.store.discoverProjects()
  const located = resolveHandle(all, handle)
  if (located.kind !== 'task') throw new PmError('E_NOT_FOUND', 'unarchive requires a task handle')
  if (!flagBool(cmd.flags, 'dry-run')) await ctx.store.unarchiveTask(located.project, located.task.id)
  return { data: { id: located.task.id, archived: false }, changed_ids: [located.task.id] }
}
