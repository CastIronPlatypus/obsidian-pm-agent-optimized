import { describe, expect, it } from 'vitest'
import { makeProject, makeTask, type Project, type SavedView, type Task } from '../types'
import { hydrateProjectFromFrontmatter, hydrateTaskFromFile } from './YamlHydrator'
import { parseFrontmatter } from './YamlParser'
import { serializeProject, serializeTask, taskFilePath } from './YamlSerializer'

function roundTripTask(
  t: Task,
  project: Project = makeProject('Test', 'Projects/Test.md'),
  parent: Task | null = null
) {
  const md = serializeTask(t, project, parent)
  const { frontmatter, body } = parseFrontmatter(md)
  if (!frontmatter) throw new Error('frontmatter missing')
  return hydrateTaskFromFile(frontmatter, body, 'Projects/Test_tasks/task.md')
}

function roundTripProject(p: Project) {
  const md = serializeProject(p)
  const { frontmatter, body } = parseFrontmatter(md)
  if (!frontmatter) throw new Error('frontmatter missing')
  return {
    project: hydrateProjectFromFrontmatter(frontmatter, body, p.filePath, 'Test'),
    frontmatter
  }
}

describe('task round-trip', () => {
  it('preserves core scheduling and metadata fields', () => {
    const original = makeTask({
      id: 'task-1',
      title: 'Design API',
      description: 'Draft the endpoints.',
      status: 'in-progress',
      priority: 'high',
      start: '2026-04-01',
      due: '2026-04-10',
      progress: 50,
      assignees: ['Alice', 'Bob'],
      tags: ['api', 'design'],
      dependencies: ['dep-1']
    })
    const { task, subtaskIds, parentId } = roundTripTask(original)

    expect(task.id).toBe(original.id)
    expect(task.title).toBe(original.title)
    expect(task.description).toBe(original.description)
    expect(task.status).toBe(original.status)
    expect(task.priority).toBe(original.priority)
    expect(task.start).toBe(original.start)
    expect(task.due).toBe(original.due)
    expect(task.progress).toBe(original.progress)
    expect(task.assignees).toEqual(original.assignees)
    expect(task.tags).toEqual(original.tags)
    expect(task.dependencies).toEqual(original.dependencies)
    expect(subtaskIds).toEqual([])
    expect(parentId).toBeNull()
  })

  it('records subtaskIds and parentId when present', () => {
    const child = makeTask({ id: 'child-1' })
    const parent = makeTask({ id: 'parent-1', subtasks: [child] })
    const project = makeProject('Test', 'Projects/Test.md')

    const top = roundTripTask(parent, project, null)
    expect(top.subtaskIds).toEqual(['child-1'])
    expect(top.parentId).toBeNull()

    const nested = roundTripTask(child, project, parent)
    expect(nested.subtaskIds).toEqual([])
    expect(nested.parentId).toBe('parent-1')
  })

  it('preserves recurrence, timeEstimate, and timeLogs', () => {
    const original = makeTask({
      id: 'task-2',
      recurrence: { interval: 'weekly', every: 2 },
      timeEstimate: 8,
      timeLogs: [
        { date: '2026-04-01', hours: 2, note: 'setup' },
        { date: '2026-04-02', hours: 3.5, note: 'review' }
      ]
    })
    const { task } = roundTripTask(original)
    expect(task.recurrence).toEqual(original.recurrence)
    expect(task.timeEstimate).toBe(8)
    expect(task.timeLogs).toEqual(original.timeLogs)
  })

  it('preserves a milestone type and empty start', () => {
    const original = makeTask({ id: 'm-1', type: 'milestone', start: '', due: '2026-05-01' })
    const { task } = roundTripTask(original)
    expect(task.type).toBe('milestone')
    expect(task.start).toBe('')
    expect(task.due).toBe('2026-05-01')
  })

  it('preserves custom field values', () => {
    const original = makeTask({
      id: 'task-3',
      customFields: { impact: 'high', score: 42 }
    })
    const { task } = roundTripTask(original)
    expect(task.customFields).toEqual({ impact: 'high', score: 42 })
  })

  it('subtask wikilinks derive from sub.filePath, falling back to a bare slug', () => {
    const project = makeProject('P', 'Projects/P.md')
    const legacySub = makeTask({ id: 'sub-legacy', title: 'Legacy', filePath: 'Projects/P_tasks/legacy-12345678.md' })
    const newSub = makeTask({ id: 'sub-new', title: 'Fresh One' }) // no filePath yet
    const parent = makeTask({ id: 'parent', subtasks: [legacySub, newSub] })
    const md = serializeTask(parent, project, null)
    expect(md).toContain('[[legacy-12345678|Legacy]]')
    expect(md).toContain('[[fresh-one|Fresh One]]')
  })

  it('drops auto-generated Parent wiki-link and Subtasks section from the description', () => {
    const child = makeTask({ id: 'child' })
    const parent = makeTask({ id: 'parent-x', description: 'User-written note.', subtasks: [child] })
    const { task } = roundTripTask(parent)
    expect(task.description).toBe('User-written note.')
  })

  it('defaults missing fields to safe values', () => {
    const frontmatter: Record<string, unknown> = { id: 't-x' }
    const { task } = hydrateTaskFromFile(frontmatter, '', 'path.md')
    expect(task.title).toBe('Untitled')
    expect(task.status).toBe('todo')
    expect(task.priority).toBe('medium')
    expect(task.progress).toBe(0)
    expect(task.assignees).toEqual([])
    expect(task.dependencies).toEqual([])
    expect(task.customFields).toEqual({})
  })
})

// TaskNotes (and any other plugin) writes its own frontmatter keys into the
// same task file. Reading, editing, and writing a task back must not destroy
// them — that guarantee is what lets both plugins own one file.
describe('foreign frontmatter round-trip', () => {
  const taskNotesKeys: Record<string, unknown> = {
    recurrence: 'FREQ=WEEKLY;BYDAY=MO',
    timeEntries: [
      { startTime: '2026-06-01T09:00:00Z', endTime: '2026-06-01T10:30:00Z' },
      { startTime: '2026-06-02T14:00:00Z', endTime: '2026-06-02T15:00:00Z' }
    ],
    blockedBy: [{ uid: 'other-task', reltype: 'FS', gap: 'P0D' }],
    customProperties: { foo: 'bar' },
    reminders: [],
    icsEventId: 'ics-123',
    contexts: ['@home', '@errand']
  }

  it('preserves foreign keys when a pm task is read, edited, and written back', () => {
    const fm: Record<string, unknown> = {
      'pm-task': true,
      id: 'task-fk',
      title: 'Shared task',
      status: 'todo',
      priority: 'medium',
      ...taskNotesKeys
    }

    const { task } = hydrateTaskFromFile(fm, '', 'Projects/Test_tasks/shared.md')
    task.title = 'Renamed by us'
    task.status = 'in-progress'

    const md = serializeTask(task, makeProject('Test', 'Projects/Test.md'), null)
    const { frontmatter } = parseFrontmatter(md)
    if (!frontmatter) throw new Error('frontmatter missing')

    expect(frontmatter.title).toBe('Renamed by us')
    expect(frontmatter.status).toBe('in-progress')
    for (const [key, value] of Object.entries(taskNotesKeys)) {
      expect(frontmatter[key]).toEqual(value)
    }
  })

  it('preserves foreign keys on a TaskNotes-shaped file with no pm-task marker', () => {
    const fm: Record<string, unknown> = {
      title: 'TaskNotes inbox item',
      status: 'open',
      priority: 'normal',
      due: '2026-06-30',
      tags: ['task'],
      dateCreated: '2026-06-01T08:00:00Z',
      dateModified: '2026-06-01T08:00:00Z',
      ...taskNotesKeys
    }

    const { task } = hydrateTaskFromFile(fm, '', 'TaskNotes/Tasks/inbox.md')
    const md = serializeTask(task, makeProject('Test', 'Projects/Test.md'), null)
    const { frontmatter } = parseFrontmatter(md)
    if (!frontmatter) throw new Error('frontmatter missing')

    // Our own fields pass through untranslated — status/priority alignment is a later phase.
    expect(frontmatter.status).toBe('open')
    expect(frontmatter.priority).toBe('normal')
    expect(frontmatter.due).toBe('2026-06-30')
    expect(frontmatter.tags).toEqual(['task'])
    expect(frontmatter.dateCreated).toBe('2026-06-01T08:00:00Z')
    for (const [key, value] of Object.entries(taskNotesKeys)) {
      expect(frontmatter[key]).toEqual(value)
    }
  })

  it('keeps a string recurrence foreign rather than coercing it into our object shape', () => {
    const { task } = hydrateTaskFromFile({ id: 't-rec', recurrence: 'FREQ=DAILY' }, '', 'Projects/Test_tasks/rec.md')
    expect(task.recurrence).toBeUndefined()

    const md = serializeTask(task, makeProject('Test', 'Projects/Test.md'), null)
    const { frontmatter } = parseFrontmatter(md)
    expect(frontmatter?.recurrence).toBe('FREQ=DAILY')
  })

  it('lets our own object recurrence win over the foreign passthrough', () => {
    const { task } = hydrateTaskFromFile(
      { id: 't-rec2', recurrence: { interval: 'weekly', every: 2 } },
      '',
      'Projects/Test_tasks/rec2.md'
    )
    expect(task.recurrence).toEqual({ interval: 'weekly', every: 2 })

    const md = serializeTask(task, makeProject('Test', 'Projects/Test.md'), null)
    const { frontmatter } = parseFrontmatter(md)
    expect(frontmatter?.recurrence).toEqual({ interval: 'weekly', every: 2 })
  })

  it('never lets a foreign key shadow a field we own', () => {
    const { task } = hydrateTaskFromFile(
      { id: 't-own', title: 'Mine', progress: 10, ...taskNotesKeys },
      '',
      'Projects/Test_tasks/own.md'
    )
    task.progress = 90

    const md = serializeTask(task, makeProject('Test', 'Projects/Test.md'), null)
    const { frontmatter } = parseFrontmatter(md)
    expect(frontmatter?.progress).toBe(90)
    expect(frontmatter?.id).toBe('t-own')
  })

  it('does not alias foreign containers from the source frontmatter', () => {
    const fm: Record<string, unknown> = {
      id: 't-alias',
      blockedBy: [{ uid: 'other', reltype: 'FS' }],
      customProperties: { foo: 'bar' }
    }
    const { task } = hydrateTaskFromFile(fm, '', 'Projects/Test_tasks/alias.md')
    const foreign = task.foreign
    if (!foreign) throw new Error('foreign missing')

    expect(foreign.blockedBy).not.toBe(fm.blockedBy)
    expect(foreign.customProperties).not.toBe(fm.customProperties)
    ;(foreign.blockedBy as { uid: string }[])[0].uid = 'mutated'
    expect((fm.blockedBy as { uid: string }[])[0].uid).toBe('other')
  })
})

describe('project round-trip', () => {
  it('preserves core project fields', () => {
    const p = makeProject('My Project', 'Projects/MyProject.md')
    p.description = 'A great project.'
    p.color = '#ff0000'
    p.icon = '\u{1F680}'
    p.teamMembers = ['Alice', 'Bob']

    const { project } = roundTripProject(p)
    expect(project.title).toBe('My Project')
    expect(project.description).toBe('A great project.')
    expect(project.color).toBe('#ff0000')
    expect(project.icon).toBe('\u{1F680}')
    expect(project.teamMembers).toEqual(['Alice', 'Bob'])
  })

  it('preserves saved views with filter, sortKey, and sortDir', () => {
    const p = makeProject('P', 'Projects/P.md')
    const view: SavedView = {
      id: 'v1',
      name: 'High priority',
      filter: {
        text: 'api',
        statuses: ['in-progress'],
        priorities: ['high', 'critical'],
        assignees: ['Alice'],
        tags: ['design'],
        dueDateFilter: 'overdue',
        showArchived: false
      },
      sortKey: 'due',
      sortDir: 'desc'
    }
    p.savedViews = [view]

    const { project } = roundTripProject(p)
    expect(project.savedViews).toEqual([view])
  })

  it('records taskIds in the frontmatter', () => {
    const p = makeProject('P', 'Projects/P.md')
    p.tasks = [makeTask({ id: 't-1' }), makeTask({ id: 't-2' })]
    const { frontmatter } = roundTripProject(p)
    expect(frontmatter.taskIds).toEqual(['t-1', 't-2'])
  })

  it('dedups taskIds and body links when project.tasks has the same task twice', () => {
    const p = makeProject('P', 'Projects/P.md')
    const task = makeTask({ id: 't-dup', title: 'Dup', filePath: 'Projects/P_tasks/dup-tdup.md' })
    p.tasks = [task, task]
    const md = serializeProject(p)
    const { frontmatter } = parseFrontmatter(md)
    if (!frontmatter) throw new Error('frontmatter missing')
    expect(frontmatter.taskIds).toEqual(['t-dup'])
    const bulletCount = md.split('\n').filter((l) => l.startsWith('- [ ] [[dup-tdup|')).length
    expect(bulletCount).toBe(1)
  })

  it('taskFilePath returns a bare-slug path without an id suffix', () => {
    expect(taskFilePath('Bug Fix', 'Projects/P_tasks')).toBe('Projects/P_tasks/bug-fix.md')
    expect(taskFilePath('A/B:C', 'Projects/P_tasks')).toBe('Projects/P_tasks/a-b-c.md')
  })

  it('falls back to the file basename when title is missing', () => {
    const project = hydrateProjectFromFrontmatter({}, '', 'Projects/Fallback.md', 'Fallback')
    expect(project.title).toBe('Fallback')
    expect(project.id).toBe('Fallback')
  })
})

// On the metadataCache fast path the store passes Obsidian's live frontmatter
// object straight into these hydrators, so the result must not share container
// references with the input or an in-place edit would corrupt the cache.
describe('hydration does not alias the source frontmatter', () => {
  it('copies task array and object containers', () => {
    const fm: Record<string, unknown> = {
      id: 't1',
      title: 'Task',
      assignees: ['Alice'],
      tags: ['api'],
      dependencies: ['dep-1'],
      customFields: { sprint: 'S1' },
      recurrence: { interval: 'weekly', every: 1 },
      timeLogs: [{ date: '2026-04-01', hours: 2, note: 'init' }]
    }

    const { task } = hydrateTaskFromFile(fm, '', 'Projects/P_tasks/task.md')
    const logs = task.timeLogs
    if (!logs) throw new Error('timeLogs missing')
    const srcLogs = fm.timeLogs as { hours: number }[]

    expect(task.assignees).not.toBe(fm.assignees)
    expect(task.tags).not.toBe(fm.tags)
    expect(task.dependencies).not.toBe(fm.dependencies)
    expect(task.customFields).not.toBe(fm.customFields)
    expect(task.recurrence).not.toBe(fm.recurrence)
    expect(logs).not.toBe(fm.timeLogs)
    expect(logs[0]).not.toBe(srcLogs[0])

    task.assignees.push('Bob')
    task.tags.push('design')
    task.dependencies.push('dep-2')
    task.customFields.priority = 'high'
    logs[0].hours = 99

    expect(fm.assignees).toEqual(['Alice'])
    expect(fm.tags).toEqual(['api'])
    expect(fm.dependencies).toEqual(['dep-1'])
    expect(fm.customFields).toEqual({ sprint: 'S1' })
    expect(srcLogs[0].hours).toBe(2)
  })

  it('copies project array containers', () => {
    const fm: Record<string, unknown> = {
      id: 'p1',
      title: 'Project',
      customFields: [{ id: 'cf1', name: 'Sprint', type: 'text' }],
      teamMembers: ['Alice']
    }

    const project = hydrateProjectFromFrontmatter(fm, '', 'Projects/P.md', 'P')

    expect(project.customFields).not.toBe(fm.customFields)
    expect(project.teamMembers).not.toBe(fm.teamMembers)

    project.customFields.push({ id: 'cf2', name: 'Points', type: 'number' })
    project.teamMembers.push('Bob')

    expect((fm.customFields as unknown[]).length).toBe(1)
    expect(fm.teamMembers).toEqual(['Alice'])
  })
})
