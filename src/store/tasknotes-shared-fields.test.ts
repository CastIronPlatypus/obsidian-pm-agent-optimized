import type { App } from 'obsidian'
import { describe, expect, it } from 'vitest'
import { makeFakeApp, makeMetadataCache, type FakeVault } from '../../test/fakeVault'
import { DEFAULT_SETTINGS, makeTask, type PMSettings, type Project, type Task } from '../types'
import { ProjectStore } from './ProjectStore'
import { flattenTasks } from './TaskTreeOps'

const SETTINGS: PMSettings = { ...DEFAULT_SETTINGS, taskNotesInterop: true }

function setup(): { app: App; vault: FakeVault } {
  const { app, vault } = makeFakeApp()
  ;(app as unknown as { metadataCache: unknown }).metadataCache = makeMetadataCache(vault)
  return { app: app as unknown as App, vault }
}

function diskEntry(vault: FakeVault, path: string): { content: string } {
  const files = (vault as unknown as { files: Map<string, { content: string }> }).files
  const entry = files.get(path)
  if (!entry) throw new Error('no file at ' + path)
  return entry
}

/** Rewrite a field on disk without tripping the store's self-write tracking. */
function externallySetField(vault: FakeVault, path: string, key: string, value: string): void {
  const entry = diskEntry(vault, path)
  entry.content = entry.content.replace(new RegExp(`${key}: .*`), `${key}: "${value}"`)
}

/** Rewrite a field with a raw (unquoted) value, e.g. `null` — what TaskNotes writes to clear a date. */
function externallySetRawField(vault: FakeVault, path: string, key: string, raw: string): void {
  const entry = diskEntry(vault, path)
  entry.content = entry.content.replace(new RegExp(`${key}: .*`), `${key}: ${raw}`)
}

/** Delete a frontmatter key entirely — TaskNotes removing a field. */
function externallyDeleteField(vault: FakeVault, path: string, key: string): void {
  const entry = diskEntry(vault, path)
  entry.content = entry.content.replace(new RegExp(`\\n${key}: .*`), '')
}

function taskById(project: Project, id: string): Task | null {
  for (const { task } of flattenTasks(project.tasks)) if (task.id === id) return task
  return null
}

describe('shared-field sync TaskNotes -> PM', () => {
  it('a fresh load reflects a priority changed on disk', async () => {
    const { app, vault } = setup()
    const store = new ProjectStore(app, () => SETTINGS)
    const project = await store.createProject('P', 'Projects')
    const task = makeTask({ title: 'T', priority: 'low' })
    await store.insertTask(project, task, null)
    const path = task.filePath as string

    externallySetField(vault, path, 'priority', 'high')

    const store2 = new ProjectStore(app, () => SETTINGS)
    const projects = await store2.loadAllProjects('Projects')
    expect(taskById(projects[0], task.id)?.priority).toBe('high')
  })

  it('an unrelated PM edit does not clobber a priority TaskNotes changed on disk', async () => {
    const { app, vault } = setup()
    const seed = new ProjectStore(app, () => SETTINGS)
    const seedProject = await seed.createProject('P', 'Projects')
    const task = makeTask({ title: 'T', priority: 'low' })
    await seed.insertTask(seedProject, task, null)
    const path = task.filePath as string

    // A fresh store = a fresh PM session that loads from disk and snapshots a base.
    const store = new ProjectStore(app, () => SETTINGS)
    const project = (await store.loadAllProjects('Projects'))[0]

    // TaskNotes changes priority while PM holds the loaded (stale) copy.
    externallySetField(vault, path, 'priority', 'high')

    // PM edits something unrelated (progress) and saves via the fast path.
    await store.updateTask(project, task.id, { progress: 50 })

    expect(vault.readSync(path)).toContain('priority: "high"')
    expect(vault.readSync(path)).toContain('progress: 50')
  })

  it('a PM priority edit still wins over the stale disk value', async () => {
    const { app, vault } = setup()
    const seed = new ProjectStore(app, () => SETTINGS)
    const seedProject = await seed.createProject('P', 'Projects')
    const task = makeTask({ title: 'T', priority: 'low' })
    await seed.insertTask(seedProject, task, null)
    const path = task.filePath as string

    const store = new ProjectStore(app, () => SETTINGS)
    const project = (await store.loadAllProjects('Projects'))[0]
    externallySetField(vault, path, 'priority', 'low') // disk still low
    await store.updateTask(project, task.id, { priority: 'high' })

    expect(vault.readSync(path)).toContain('priority: "high"')
  })

  it('reconciles status and due the same way as priority', async () => {
    const { app, vault } = setup()
    const seed = new ProjectStore(app, () => SETTINGS)
    const seedProject = await seed.createProject('P', 'Projects')
    const task = makeTask({ title: 'T', status: 'todo', due: '' })
    await seed.insertTask(seedProject, task, null)
    const path = task.filePath as string

    const store = new ProjectStore(app, () => SETTINGS)
    const project = (await store.loadAllProjects('Projects'))[0]
    externallySetField(vault, path, 'status', 'in-progress')
    externallySetField(vault, path, 'due', '2026-08-01')

    await store.updateTask(project, task.id, { progress: 10 })

    expect(vault.readSync(path)).toContain('status: "in-progress"')
    expect(vault.readSync(path)).toContain('due: "2026-08-01"')
  })

  it('does not resurrect a due date TaskNotes deleted', async () => {
    const { app, vault } = setup()
    const seed = new ProjectStore(app, () => SETTINGS)
    const seedProject = await seed.createProject('P', 'Projects')
    const task = makeTask({ title: 'T', due: '2026-08-01' })
    await seed.insertTask(seedProject, task, null)
    const path = task.filePath as string

    // Fresh session snapshots a base with due = 2026-08-01.
    const store = new ProjectStore(app, () => SETTINGS)
    const project = (await store.loadAllProjects('Projects'))[0]

    // TaskNotes clears the due date by removing the key; PM holds the stale copy.
    externallyDeleteField(vault, path, 'due')
    await store.updateTask(project, task.id, { progress: 20 })

    expect(vault.readSync(path)).toContain('due: ""')
    expect(vault.readSync(path)).not.toContain('2026-08-01')
  })

  it('does not resurrect a due date TaskNotes nulled', async () => {
    const { app, vault } = setup()
    const seed = new ProjectStore(app, () => SETTINGS)
    const seedProject = await seed.createProject('P', 'Projects')
    const task = makeTask({ title: 'T', due: '2026-08-01' })
    await seed.insertTask(seedProject, task, null)
    const path = task.filePath as string

    const store = new ProjectStore(app, () => SETTINGS)
    const project = (await store.loadAllProjects('Projects'))[0]

    externallySetRawField(vault, path, 'due', 'null')
    await store.updateTask(project, task.id, { progress: 20 })

    expect(vault.readSync(path)).toContain('due: ""')
    expect(vault.readSync(path)).not.toContain('2026-08-01')
  })

  it('adopts a due datetime from disk as a date-only value', async () => {
    const { app, vault } = setup()
    const seed = new ProjectStore(app, () => SETTINGS)
    const seedProject = await seed.createProject('P', 'Projects')
    const task = makeTask({ title: 'T', due: '' })
    await seed.insertTask(seedProject, task, null)
    const path = task.filePath as string

    const store = new ProjectStore(app, () => SETTINGS)
    const project = (await store.loadAllProjects('Projects'))[0]

    // TaskNotes sets due to a full datetime; PM stores date-only.
    externallySetField(vault, path, 'due', '2026-08-01T09:00')
    await store.updateTask(project, task.id, { progress: 10 })

    expect(vault.readSync(path)).toContain('due: "2026-08-01"')
    expect(vault.readSync(path)).not.toContain('T09:00')
  })
})
