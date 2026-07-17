// Rendering helpers: the flat pre-order `tree` node array (with the INT-021
// `content_lines` signal), the status glyph legend, and lineage shaping.

import { TFile } from 'obsidian'
import type { Project, Task } from '../../src/types'
import { findParentId, findTaskById, flattenTasks } from '../../src/store'
import type { PmContext } from './PmContext'

/** The status glyph legend an agent scans by. Documents all four glyphs. */
export const STATUS_LEGEND = '○ = not started · ◐ = in progress · ● = complete · ⊘ = blocked'

export interface TreeNode {
  id: string
  depth: number
  parentId: string | null
  status: string
  title: string
  type: string
  content_lines: number
  has_content: boolean
}

/** Count the real (INT-021-detected) body lines of a task's note, 0 if none. */
async function contentLinesOf(ctx: PmContext, task: Task): Promise<number> {
  if (!task.filePath) return 0
  const file = ctx.vault.getAbstractFileByPath(task.filePath)
  if (!(file instanceof TFile)) return 0
  return ctx.store.bodyContentLines(file)
}

/**
 * Build the flat pre-order node array for a subtree rooted at `root` (or the
 * whole project when `root` is null). Each node carries the INT-021
 * `content_lines`.
 */
export async function buildTreeNodes(
  ctx: PmContext,
  project: Project,
  root: Task | null,
  opts: { depth?: number; includeRoot?: boolean } = {}
): Promise<TreeNode[]> {
  const maxDepth = opts.depth ?? Infinity
  const flat = root
    ? [
        ...(opts.includeRoot === false
          ? []
          : [{ task: root, depth: 0, parentId: findParentId(project, root.id), visible: true }]),
        ...flattenTasks(root.subtasks, opts.includeRoot === false ? 0 : 1, root.id)
      ]
    : flattenTasks(project.tasks)

  const nodes: TreeNode[] = []
  for (const f of flat) {
    if (f.depth > maxDepth) continue
    const lines = await contentLinesOf(ctx, f.task)
    nodes.push({
      id: f.task.id,
      depth: f.depth,
      parentId: f.parentId,
      status: f.task.status,
      title: f.task.title,
      type: f.task.type,
      content_lines: lines,
      has_content: lines > 0
    })
  }
  return nodes
}

export interface LineageEntry {
  id: string
  title: string
  type: 'project' | 'task' | 'milestone' | 'subtask'
}

/**
 * The ancestry of a task, project-root first down to (and excluding) the task
 * itself: `[project, …ancestors]`. Always at least the project (length ≥ 1).
 */
export function lineageOf(project: Project, task: Task): LineageEntry[] {
  const ancestors: LineageEntry[] = []
  let parentId = findParentId(project, task.id)
  while (parentId) {
    const parent = findTaskById(project, parentId)
    if (!parent) break
    ancestors.unshift({ id: parent.id, title: parent.title, type: parent.type })
    parentId = findParentId(project, parent.id)
  }
  return [{ id: project.id, title: project.title, type: 'project' }, ...ancestors]
}
