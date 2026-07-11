import type { App } from 'obsidian'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, makeTask, type PMSettings, type Project, type Task } from '../types'
import { runTimeSyncMigration } from '../integrations/timeSyncMigration'
import { createFakeApp, type FakeDisk } from '../../test/fake-vault'
import { ProjectStore } from './ProjectStore'
import { flattenTasks } from './TaskTreeOps'

/**
 * Integration coverage for `ProjectStore`'s load→edit→save→reload orchestration —
 * the layer the stub-only unit suite can't reach, and where every TaskNotes-interop
 * correctness gap actually lived. Each scenario reproduces a post-ship review
 * finding and guards its fix against re-introduction. See `test/fake-vault.ts`.
 */

function settingsWith(overrides: Partial<PMSettings> = {}): PMSettings {
  return { ...DEFAULT_SETTINGS, taskNotesAlignment: {}, ...overrides }
}

function allTasks(project: Project): Task[] {
  return flattenTasks(project.tasks).map((f) => f.task)
}

function byTitle(project: Project, title: string): Task {
  const task = allTasks(project).find((t) => t.title === title)
  if (!task) {
    const have = allTasks(project)
      .map((t) => t.title)
      .join(', ')
    throw new Error(`No task titled "${title}" (have: ${have})`)
  }
  return task
}

function byId(project: Project, id: string): Task {
  const task = allTasks(project).find((t) => t.id === id)
  if (!task) throw new Error(`No task with id ${id}`)
  return task
}

describe('ProjectStore round-trips (fake vault)', () => {
  let app: App
  let disk: FakeDisk

  async function reload(store: ProjectStore, path: string): Promise<Project> {
    store.invalidateProject(path)
    const file = app.vault.getFileByPath(path)
    if (!file) throw new Error(`Project file missing: ${path}`)
    const project = await store.loadProject(file)
    if (!project) throw new Error(`Failed to reload: ${path}`)
    return project
  }

  beforeEach(() => {
    const fake = createFakeApp()
    app = fake.app
    disk = fake.disk
  })

  // Finding: renaming a task severed the `blockedBy` uid and the TaskNotes
  // subtask's `projects[]` link that pointed at its old basename, because those
  // live only in the *referrer* files, which PM doesn't re-save on the rename.
  // Fix: rename via `fileManager.renameFile` so Obsidian rewrites inbound links.
  it('keeps inbound blockedBy and TaskNotes subtask links alive across a rename', async () => {
    disk.installTaskNotes()
    const store = new ProjectStore(app, () => settingsWith())
    const project = await store.createProject('P', 'Projects')
    const path = project.filePath

    const alpha = makeTask({ title: 'Alpha' })
    await store.insertTask(project, alpha)
    const beta = makeTask({ title: 'Beta', dependencies: [alpha.id] })
    await store.insertTask(project, beta)

    // A TaskNotes-authored subtask: nested purely via its projects[] link to Alpha.
    disk.seedFile('Projects/P_tasks/child-note.md', {
      title: 'Child note',
      status: 'todo',
      tags: ['task'],
      projects: ['[[P]]', '[[alpha]]']
    })

    const before = await reload(store, path)
    expect(byTitle(before, 'Beta').dependencies).toContain(alpha.id)
    const alphaBefore = byId(before, alpha.id)
    expect(alphaBefore.subtasks.map((s) => s.title)).toContain('Child note')

    await store.updateTask(before, alpha.id, { title: 'Alpha renamed' })

    const after = await reload(store, path)
    // The blockedBy uid followed the rename → still resolves to Alpha's id.
    expect(byTitle(after, 'Beta').dependencies).toContain(alpha.id)
    // The subtask's projects[] link followed too → still nested under Alpha.
    const alphaAfter = byId(after, alpha.id)
    expect(alphaAfter.title).toBe('Alpha renamed')
    expect(alphaAfter.subtasks.map((s) => s.title)).toContain('Child note')
    // The old file is gone; the new one exists.
    expect(disk.exists('Projects/P_tasks/alpha.md')).toBe(false)
    expect(disk.exists('Projects/P_tasks/alpha-renamed.md')).toBe(true)
  })

  // Finding: PM's save regenerated the whole frontmatter block from its stale
  // in-memory copy, clobbering a status/due/blockedBy edit TaskNotes made after PM
  // read the file. Fix: reconcile the shared fields and blockedBy from disk at
  // write time, letting PM win only for fields it actually changed.
  it('does not clobber an external status/due edit made between read and save', async () => {
    disk.installTaskNotes()
    const store = new ProjectStore(app, () => settingsWith())
    const project = await store.createProject('P', 'Projects')
    const path = project.filePath

    const task = makeTask({ title: 'Shared', status: 'todo', priority: 'medium', due: '' })
    await store.insertTask(project, task)
    const taskPath = task.filePath
    if (!taskPath) throw new Error('task has no file path')

    // Reload so the store captures the shared-field base (interop on at read).
    const loaded = await reload(store, path)

    // TaskNotes edits status + due on disk while PM holds its stale copy.
    disk.editFrontmatter(taskPath, (fm) => {
      fm.status = 'in-progress'
      fm.due = '2026-09-01'
    })

    // PM edits only priority — the fm-only fast path — and must not overwrite the above.
    await store.updateTask(loaded, task.id, { priority: 'high' })

    const fm = disk.frontmatter(taskPath)
    expect(fm?.status).toBe('in-progress')
    expect(fm?.due).toBe('2026-09-01')
    expect(fm?.priority).toBe('high')
  })

  it('merges a blocker TaskNotes added on disk instead of dropping it', async () => {
    disk.installTaskNotes()
    const store = new ProjectStore(app, () => settingsWith())
    const project = await store.createProject('P', 'Projects')
    const path = project.filePath

    const xray = makeTask({ title: 'Xray' })
    await store.insertTask(project, xray)
    const zeta = makeTask({ title: 'Zeta' })
    await store.insertTask(project, zeta)
    const yankee = makeTask({ title: 'Yankee', dependencies: [xray.id] })
    await store.insertTask(project, yankee)
    const yankeePath = yankee.filePath
    if (!yankeePath) throw new Error('task has no file path')

    // Reload so Yankee's blockedBy is captured as the reconcile base.
    const loaded = await reload(store, path)
    expect(byId(loaded, yankee.id).dependencies).toEqual([xray.id])

    // TaskNotes adds Zeta as a second blocker on disk.
    disk.editFrontmatter(yankeePath, (fm) => {
      fm.blockedBy = [
        { uid: '[[xray]]', reltype: 'FS', gap: 'P0D' },
        { uid: '[[zeta]]', reltype: 'FS', gap: 'P0D' }
      ]
    })

    // PM edits an unrelated field; the reconcile must keep both blockers.
    await store.updateTask(loaded, yankee.id, { priority: 'high' })

    const fm = disk.frontmatter(yankeePath)
    if (!fm) throw new Error('missing frontmatter')
    const uids = (fm.blockedBy as { uid: string }[]).map((b) => b.uid)
    expect(uids).toContain('[[xray]]')
    expect(uids).toContain('[[zeta]]')
    expect(fm?.dependencies).toEqual([xray.id, zeta.id])
  })

  // Finding: editing a TaskNotes-authored note in PM re-slugged its filename to
  // PM's scheme, severing every wikilink hung off the old basename, and could drop
  // foreign frontmatter keys. Fix: keep a non-PM basename as-is and re-read foreign
  // keys off disk before rewriting.
  it('leaves a TaskNotes-named note filename and foreign keys intact on a PM edit', async () => {
    disk.installTaskNotes()
    const store = new ProjectStore(app, () => settingsWith())
    const project = await store.createProject('P', 'Projects')
    const path = project.filePath

    const notePath = 'Projects/P_tasks/Fix the boiler.md'
    disk.seedFile(notePath, {
      title: 'Fix the boiler',
      status: 'todo',
      tags: ['task'],
      projects: ['[[P]]'],
      contexts: ['@home'],
      icsEventId: 'ics-42'
    })

    const loaded = await reload(store, path)
    const note = byTitle(loaded, 'Fix the boiler')

    await store.updateTask(loaded, note.id, { status: 'in-progress' })

    expect(disk.exists(notePath)).toBe(true)
    expect(disk.exists('Projects/P_tasks/fix-the-boiler.md')).toBe(false)
    const fm = disk.frontmatter(notePath)
    expect(fm?.status).toBe('in-progress')
    expect(fm?.contexts).toEqual(['@home'])
    expect(fm?.icsEventId).toBe('ics-42')
  })

  // Finding: the one-shot hours→minutes time-shape migration could double-apply on
  // a second toggle-on (×60 again → corrupt estimate). Fix: guard the run behind an
  // `appliedAt` stamp. This also pins that a migrated estimate round-trips back to
  // its original hours when read with sync on.
  it('migrates the time shape once and round-trips the estimate under sync', async () => {
    disk.installTaskNotes()
    const settings = settingsWith({ taskNotesTimeSync: false })
    const store = new ProjectStore(app, () => settings)
    const project = await store.createProject('P', 'Projects')
    const path = project.filePath

    const task = makeTask({
      title: 'Timed',
      timeEstimate: 1.5,
      timeLogs: [{ date: '2026-07-01', hours: 2, note: 'work' }]
    })
    await store.insertTask(project, task)
    const taskPath = task.filePath
    if (!taskPath) throw new Error('task has no file path')

    // Sync off: PM's own shape — hours estimate, timeLogs.
    expect(disk.frontmatter(taskPath)?.timeEstimate).toBe(1.5)
    expect(Array.isArray(disk.frontmatter(taskPath)?.timeLogs)).toBe(true)

    // Flip sync on → the one-shot migration converts every PM task file.
    settings.taskNotesTimeSync = true
    expect(await runTimeSyncMigration(app, settings)).toBe(1)

    let fm = disk.frontmatter(taskPath)
    expect(fm?.timeEstimate).toBe(90) // 1.5h → 90min, exactly once
    expect(fm?.timeLogs).toBeUndefined()
    expect(Array.isArray(fm?.timeEntries)).toBe(true)

    // Reading the migrated file with sync on gives back the original hours.
    const loaded = await reload(store, path)
    expect(byId(loaded, task.id).timeEstimate).toBe(1.5)

    // A second flip-on is a guarded no-op — the estimate must not be ×60 again.
    expect(await runTimeSyncMigration(app, settings)).toBe(0)
    fm = disk.frontmatter(taskPath)
    expect(fm?.timeEstimate).toBe(90)
  })

  // ─── Known-broken repros (ticket eeb8c13) ──────────────────────────────────
  // Both assert the *correct* behaviour and so throw today, which is why they run
  // under `it.fails` (the suite stays green). When the fix lands — key the time
  // shape to the `taskNotesAlignment.timeSync` migration stamp, not the live
  // toggle — each body stops throwing and `it.fails` flips to red, signalling
  // "delete the `.fails` and promote this to a real guard."

  // Trap 1: after migration the files are durably in minutes shape, but toggling
  // sync back off makes `readTimeEstimate` key off the live toggle and read those
  // minutes as hours (2 h estimate surfaces as 120 h; timeEntries vanish).
  it.fails('trap 1: toggling sync off misreads migrated minutes as hours', async () => {
    disk.installTaskNotes()
    const settings = settingsWith({ taskNotesTimeSync: false })
    const store = new ProjectStore(app, () => settings)
    const project = await store.createProject('P', 'Projects')
    const path = project.filePath

    const task = makeTask({ title: 'Timed', timeEstimate: 2 })
    await store.insertTask(project, task)
    const taskPath = task.filePath
    if (!taskPath) throw new Error('task has no file path')

    // Flip sync on and migrate: 2 h → 120 min, stamps taskNotesAlignment.timeSync.
    settings.taskNotesTimeSync = true
    await runTimeSyncMigration(app, settings)
    expect(disk.frontmatter(taskPath)?.timeEstimate).toBe(120)

    // User flips sync back off (settings.ts allows it freely); the stamp remains.
    settings.taskNotesTimeSync = false

    const loaded = await reload(store, path)
    // Correct: the file is durably in minutes shape, so 120 min must read as 2 h.
    expect(byId(loaded, task.id).timeEstimate).toBe(2)
  })

  // Trap 2: adopting a TaskNotes-authored note stamps `pm-task: true`; its foreign
  // minutes `timeEstimate` round-trips verbatim on that save, but the *next* load
  // sees a pmAuthored file and reads those minutes as hours — 90 min → 90 h. No
  // toggle involved.
  it.fails('trap 2: adopting a TaskNotes note flips its estimate units', async () => {
    disk.installTaskNotes()
    const settings = settingsWith({ taskNotesTimeSync: false })
    const store = new ProjectStore(app, () => settings)
    const project = await store.createProject('P', 'Projects')
    const path = project.filePath

    const notePath = 'Projects/P_tasks/Groom backlog.md'
    disk.seedFile(notePath, {
      title: 'Groom backlog',
      status: 'todo',
      tags: ['task'],
      projects: ['[[P]]'],
      timeEstimate: 90 // TaskNotes minutes = 1.5 h
    })

    const loaded = await reload(store, path)
    const note = byTitle(loaded, 'Groom backlog')
    // PM adopts the note: this save stamps pm-task and round-trips the 90 verbatim.
    await store.updateTask(loaded, note.id, { status: 'in-progress' })
    expect(disk.frontmatter(notePath)?.['pm-task']).toBe(true)
    expect(disk.frontmatter(notePath)?.timeEstimate).toBe(90)

    const after = await reload(store, path)
    // Correct: adoption should have converted 90 min → 1.5 h, not reinterpreted units.
    expect(byId(after, note.id).timeEstimate).toBe(1.5)
  })
})
