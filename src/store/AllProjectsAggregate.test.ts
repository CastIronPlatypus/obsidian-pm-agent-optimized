import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, makeDefaultFilter, makeTask, type PMSettings, type Project, type Task } from '../types'
import type { TaskSource } from './TaskSource'
import { matchesFilter } from './TaskFilter'
import { compareTask } from '../views/table/TableFilters'
import type { TableState } from '../views/table/TableRenderer'
import {
  ALL_PROJECTS_ID,
  ALL_PROJECTS_PATH,
  aggregateProjectOptions,
  buildAllProjectsProject,
  makeAggregateStore
} from './AllProjectsAggregate'

function task(id: string, over: Partial<Task> = {}): Task {
  return makeTask({ id, title: id, ...over })
}

function project(id: string, title: string, tasks: Task[]): Project {
  return {
    id,
    title,
    description: '',
    color: '#000',
    icon: '📋',
    tasks,
    customFields: [],
    teamMembers: [],
    createdAt: '',
    updatedAt: '',
    filePath: `${title}.md`,
    savedViews: [],
    taskIndex: new Map()
  }
}

function settings(over: Partial<PMSettings> = {}): PMSettings {
  return { ...DEFAULT_SETTINGS, ...over }
}

/** Two projects; p1 has a nested subtask, so we can prove subtasks get tagged too. */
function twoProjects(): { p1: Project; p2: Project } {
  const t1 = task('t1', { subtasks: [task('t1a')] })
  const p1 = project('p1', 'Alpha', [t1, task('t2')])
  const p2 = project('p2', 'Beta', [task('t3', { type: 'milestone' })])
  return { p1, p2 }
}

function fakeStore(projects: Project[], extra: Partial<TaskSource> = {}): TaskSource {
  return { loadAllProjects: vi.fn().mockResolvedValue(projects), ...extra } as unknown as TaskSource
}

describe('buildAllProjectsProject', () => {
  it('aggregates every task across projects and tags each with its owner (subtasks included)', async () => {
    const { p1, p2 } = twoProjects()
    const { project: agg, ownerById } = await buildAllProjectsProject(fakeStore([p1, p2]), settings())

    expect(agg.id).toBe(ALL_PROJECTS_ID)
    expect(agg.filePath).toBe(ALL_PROJECTS_PATH)
    // Root tasks concatenated: t1, t2 (p1) + t3 (p2).
    expect(agg.tasks.map((t) => t.id)).toEqual(['t1', 't2', 't3'])

    // Owner map covers deep subtasks, not just roots.
    expect(ownerById.get('t1')).toBe(p1)
    expect(ownerById.get('t1a')).toBe(p1)
    expect(ownerById.get('t2')).toBe(p1)
    expect(ownerById.get('t3')).toBe(p2)

    // Tasks carry their owner tag for filter/sort.
    expect(agg.tasks[0].ownerProjectId).toBe('p1')
    expect(agg.tasks[0].ownerProjectTitle).toBe('Alpha')
    expect(agg.tasks[0].subtasks[0].ownerProjectTitle).toBe('Alpha')
    expect(agg.tasks[2].ownerProjectTitle).toBe('Beta')

    // Index spans all ids including the subtask.
    expect(agg.taskIndex.get('t1a')?.task.id).toBe('t1a')
    expect(agg.taskIndex.get('t1a')?.parentId).toBe('t1')
  })

  it('seeds savedViews from settings.allProjectsSavedViews', async () => {
    const saved = [{ id: 'v1', name: 'Mine', filter: makeDefaultFilter(), sortKey: 'status', sortDir: 'asc' as const }]
    const { project: agg } = await buildAllProjectsProject(fakeStore([]), settings({ allProjectsSavedViews: saved }))
    expect(agg.savedViews).toEqual(saved)
    expect(agg.savedViews).not.toBe(saved) // copied, not aliased
  })
})

describe('aggregateProjectOptions', () => {
  it('returns distinct owner projects sorted by title', () => {
    const { p1, p2 } = twoProjects()
    const ownerById = new Map([
      ['t1', p1],
      ['t2', p1],
      ['t3', p2]
    ])
    expect(aggregateProjectOptions(ownerById)).toEqual([
      { id: 'p1', label: 'Alpha' },
      { id: 'p2', label: 'Beta' }
    ])
  })
})

describe('matchesFilter — Project filter', () => {
  it('keeps only tasks whose ownerProjectId is selected', () => {
    const a = makeTask({ id: 'a', ownerProjectId: 'p1' })
    const b = makeTask({ id: 'b', ownerProjectId: 'p2' })
    const filter = { ...makeDefaultFilter(), projects: ['p1'] }
    expect(matchesFilter(a, filter)).toBe(true)
    expect(matchesFilter(b, filter)).toBe(false)
  })

  it('is a no-op when no projects are selected', () => {
    const a = makeTask({ id: 'a', ownerProjectId: 'p1' })
    expect(matchesFilter(a, makeDefaultFilter())).toBe(true)
  })

  it('does not crash on filters persisted before the projects field existed', () => {
    const legacy = makeDefaultFilter() as unknown as Record<string, unknown>
    delete legacy.projects
    expect(matchesFilter(makeTask({ id: 'a' }), legacy as never)).toBe(true)
  })
})

describe('compareTask — project sort', () => {
  const state = { sortKey: 'project', sortDir: 'asc' } as unknown as TableState
  it('orders by owner project title', () => {
    const a = makeTask({ id: 'a', ownerProjectTitle: 'Alpha' })
    const b = makeTask({ id: 'b', ownerProjectTitle: 'Beta' })
    expect(compareTask(a, b, state)).toBeLessThan(0)
    expect(compareTask(b, a, state)).toBeGreaterThan(0)
  })
})

describe('makeAggregateStore — edit redispatch', () => {
  function harness() {
    // t1 and t3 share one project instance so bulk grouping/equality is meaningful.
    const p1 = project('p1', 'Alpha', [])
    const p2 = project('p2', 'Beta', [])
    const map = new Map<string, Project>([
      ['t1', p1],
      ['t2', p2],
      ['t3', p1]
    ])
    const real = {
      updateTask: vi.fn().mockResolvedValue(undefined),
      updateTasks: vi.fn().mockResolvedValue(undefined),
      deleteTasks: vi.fn().mockResolvedValue(undefined),
      moveTask: vi.fn().mockResolvedValue(undefined),
      insertTask: vi.fn().mockResolvedValue(undefined)
    }
    const store = makeAggregateStore(real as unknown as TaskSource, (id) => map.get(id))
    return { store, real, p1, p2 }
  }

  const AGG = { id: ALL_PROJECTS_ID } as unknown as Project

  it('routes a single-task edit to its real owning project', async () => {
    const { store, real, p1 } = harness()
    await store.updateTask(AGG, 't1', { status: 'done' })
    expect(real.updateTask).toHaveBeenCalledWith(p1, 't1', { status: 'done' })
  })

  it('groups a bulk edit by owning project', async () => {
    const { store, real, p1, p2 } = harness()
    await store.updateTasks(AGG, ['t1', 't2', 't3'], { priority: 'high' })
    expect(real.updateTasks).toHaveBeenCalledWith(p1, ['t1', 't3'], { priority: 'high' })
    expect(real.updateTasks).toHaveBeenCalledWith(p2, ['t2'], { priority: 'high' })
  })

  it('refuses to reparent a task across projects, but allows same-project moves', async () => {
    const { store, real, p1 } = harness()
    await store.moveTask(AGG, 't1', 't2') // t1∈p1, t2∈p2 → cross-project
    expect(real.moveTask).not.toHaveBeenCalled()
    await store.moveTask(AGG, 't1', 't3') // both ∈ p1
    expect(real.moveTask).toHaveBeenCalledWith(p1, 't1', 't3')
  })

  it('blocks an ambiguous top-level insert (no parent → no target project)', async () => {
    const { store, real } = harness()
    await store.insertTask(AGG, makeTask({ id: 'new' }), null)
    expect(real.insertTask).not.toHaveBeenCalled()
  })

  it('passes non-mutating methods straight through to the real store', () => {
    const configFor = vi.fn().mockReturnValue({ statuses: [] })
    const store = makeAggregateStore({ configFor } as unknown as TaskSource, () => undefined)
    store.configFor(AGG)
    expect(configFor).toHaveBeenCalledWith(AGG)
  })
})
