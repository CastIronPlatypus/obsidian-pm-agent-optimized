// `apply <spec>` — declarative, idempotent project-as-code upsert.
//
// A spec (YAML/JSON) describes a whole nested project. Every node carries a
// client-supplied stable `key`; `apply` maps each key to a real minted id and
// persists that mapping in a CLI-owned sidecar so re-applying an unchanged spec
// is a NO-OP (create missing → update changed → leave equal). The store's tested
// mutators (`createProject`/`insertTask`/`updateTask`/`moveProject`/
// `renameProject`/`archiveTask`) do all the writing; `apply` only diffs and
// orchestrates.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { Project, Task } from '../../../src/types'
import { makeTask } from '../../../src/types'
import { findTaskById } from '../../../src/store'
import type { PmContext } from '../PmContext'
import { PmError, type HandlerOutput } from '../envelope'
import type { ParsedCommand } from '../args'
import { flagBool } from '../args'
import { cascadeAfterMutation } from '../schedule'

// ─── Spec shape ─────────────────────────────────────────────────────────────

interface SpecNode {
  key?: string
  title: string
  status?: string
  priority?: string
  due?: string
  start?: string
  type?: Task['type']
  assignees?: string[]
  tags?: string[]
  depends_on?: string[]
  subtasks?: SpecNode[]
}

interface Spec {
  project: { key?: string; title: string; dir?: string; icon?: string; color?: string; description?: string }
  tasks?: SpecNode[]
}

// ─── key→id sidecar (CLI-owned, survives store frontmatter rewrites) ────────

interface KeyEntry {
  projectId: string
  tasks: Record<string, string>
}
type KeyMap = Record<string, KeyEntry>

function keyMapPath(vaultRoot: string): string {
  return join(vaultRoot, '.obsidian', 'plugins', 'project-manager', 'pm-cli-keys.json')
}

function loadKeyMap(vaultRoot: string): KeyMap {
  try {
    return JSON.parse(readFileSync(keyMapPath(vaultRoot), 'utf8')) as KeyMap
  } catch {
    return {}
  }
}

function saveKeyMap(vaultRoot: string, map: KeyMap): void {
  const p = keyMapPath(vaultRoot)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(map, null, 2))
}

// ─── Spec traversal + diffing ───────────────────────────────────────────────

/** A flattened spec node paired with its parent key (null at the top level). */
interface FlatNode {
  node: SpecNode
  key: string
  parentKey: string | null
}

/** Pre-order flatten of the spec forest, tracking each node's (parent) key. */
function flattenSpec(nodes: SpecNode[] | undefined, parentKey: string | null, out: FlatNode[]): void {
  for (const node of nodes ?? []) {
    const key = node.key ?? node.title
    out.push({ node, key, parentKey })
    if (node.subtasks?.length) flattenSpec(node.subtasks, key, out)
  }
}

/** The subset of spec-declared scalar/array fields, for building/diffing a Task. */
function specPatch(node: SpecNode): Partial<Task> {
  const patch: Partial<Task> = {}
  if (node.title !== undefined) patch.title = node.title
  if (node.status !== undefined) patch.status = node.status
  if (node.priority !== undefined) patch.priority = node.priority
  if (node.due !== undefined) patch.due = node.due
  if (node.start !== undefined) patch.start = node.start
  if (node.type !== undefined) patch.type = node.type
  if (node.assignees !== undefined) patch.assignees = node.assignees
  if (node.tags !== undefined) patch.tags = node.tags
  return patch
}

/** Fields of `patch` that differ from `task`; empty means the node is up to date. */
function diffPatch(task: Task, patch: Partial<Task>): Partial<Task> {
  const out: Partial<Task> = {}
  for (const [k, v] of Object.entries(patch)) {
    const current = (task as unknown as Record<string, unknown>)[k]
    if (Array.isArray(v)) {
      const a = [...v].sort().join(' ')
      const b = Array.isArray(current) ? [...(current as string[])].sort().join(' ') : ''
      if (a !== b) (out as Record<string, unknown>)[k] = v
    } else if (current !== v) {
      ;(out as Record<string, unknown>)[k] = v
    }
  }
  return out
}

// ─── The apply orchestration ────────────────────────────────────────────────

export async function apply(ctx: PmContext, cmd: ParsedCommand): Promise<HandlerOutput> {
  const specPath = cmd.positionals[0]
  if (!specPath) throw new PmError('E_USAGE', 'apply requires a spec path')
  const dryRun = flagBool(cmd.flags, 'dry-run') || flagBool(cmd.flags, 'diff')
  const prune = flagBool(cmd.flags, 'prune')

  let spec: Spec
  try {
    spec = parseYaml(readFileSync(specPath, 'utf8')) as Spec
  } catch (e) {
    throw new PmError('E_USAGE', `could not read spec "${specPath}": ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!spec?.project?.title) throw new PmError('E_USAGE', 'spec requires project.title')

  const keyMap = loadKeyMap(ctx.vaultRoot)
  const projectKey = spec.project.key ?? spec.project.title
  const entry: KeyEntry = keyMap[projectKey] ?? { projectId: '', tasks: {} }

  const changed: string[] = []
  const plan: string[] = []

  const flat: FlatNode[] = []
  flattenSpec(spec.tasks, null, flat)

  // ── Resolve (or create) the project ──
  const all = await ctx.store.discoverProjects()
  let project =
    (entry.projectId ? all.find((p) => p.id === entry.projectId) : undefined) ??
    all.find((p) => p.title === spec.project.title)

  if (!project) {
    plan.push(`+ project ${spec.project.title}`)
    for (const { node } of flat) plan.push(`+ task ${node.title}`)
    if (dryRun) {
      return { data: { plan, dry_run: true }, changed_ids: [projectKey, ...flat.map((f) => f.key)] }
    }
    project = await ctx.store.createProject(spec.project.title, spec.project.dir ?? '')
    changed.push(project.id)
  } else if (!dryRun) {
    // Existing project: apply `dir` (move) / `title` (rename) drift.
    if (spec.project.dir && normalize(spec.project.dir) !== normalize(ctx.store.projectDirectory(project))) {
      await ctx.store.moveProject(project, spec.project.dir)
      changed.push(project.id)
    }
    if (spec.project.title !== project.title) {
      await ctx.store.renameProject(project, spec.project.title)
      changed.push(project.id)
    }
  }

  entry.projectId = project.id

  // ── Upsert each task node (pre-order, parents before children) ──
  const keyToId: Record<string, string> = { ...entry.tasks }
  const specKeys = new Set(flat.map((f) => f.key))

  for (const { node, key, parentKey } of flat) {
    const parentId = parentKey ? (keyToId[parentKey] ?? null) : null
    const existing = keyToId[key] ? findTaskById(project, keyToId[key]!) : null

    if (existing) {
      const patch = diffPatch(existing, specPatch(node))
      if (Object.keys(patch).length > 0) {
        plan.push(`~ task ${node.title}`)
        if (!dryRun) await ctx.store.updateTask(project, existing.id, patch)
        changed.push(existing.id)
      }
    } else {
      plan.push(`+ task ${node.title}`)
      if (dryRun) {
        changed.push(key)
        keyToId[key] = key // placeholder so children resolve in the plan
      } else {
        const task = makeTask(specPatch(node))
        await ctx.store.insertTask(project, task, parentId)
        keyToId[key] = task.id
        changed.push(task.id)
      }
    }
  }

  if (dryRun) return { data: { project: project.id, plan, dry_run: true }, changed_ids: [...new Set(changed)] }

  // ── Resolve deps-by-key (post-topological) and wire only changed edges ──
  for (const { node, key } of flat) {
    if (!node.depends_on?.length) continue
    const taskId = keyToId[key]
    const task = taskId ? findTaskById(project, taskId) : null
    if (!task || !taskId) continue
    const resolved = node.depends_on.map((k) => keyToId[k] ?? k)
    const next = [...new Set([...task.dependencies, ...resolved])]
    if (next.sort().join(' ') !== [...task.dependencies].sort().join(' ')) {
      await ctx.store.updateTask(project, taskId, { dependencies: next })
      changed.push(taskId)
    }
  }

  // ── Prune: archive previously-managed tasks now absent from the spec ──
  if (prune) {
    for (const [oldKey, oldId] of Object.entries(entry.tasks)) {
      if (specKeys.has(oldKey)) continue
      const stale = findTaskById(project, oldId)
      if (stale && !stale.archived) {
        await ctx.store.archiveTask(project, oldId)
        changed.push(oldId)
      }
      delete keyToId[oldKey]
    }
  }

  // ── One scheduler pass per touched project when something changed ──
  if (changed.length > 0) {
    const moved = await cascadeAfterMutation(ctx, project)
    for (const id of moved) if (!changed.includes(id)) changed.push(id)
  }

  entry.tasks = keyToId
  keyMap[projectKey] = entry
  saveKeyMap(ctx.vaultRoot, keyMap)

  return { data: { project: project.id }, changed_ids: [...new Set(changed)] }
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '')
}
