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

  // Finding: `reconcileBlockedByFromDisk` no-oped when the task carried no
  // blockedBy at read, so a blocker TaskNotes added mid-session was dropped once PM
  // also gave the task a dependency of its own — buildTaskFrontmatter regenerated
  // blockedBy from PM's deps alone, and the re-read foreign copy was skipped by
  // `key in fm`. Fix: reconcile with an empty base when the disk has blockedBy.
  it('merges a TaskNotes blocker added on disk even when the task had none at read', async () => {
    disk.installTaskNotes()
    const store = new ProjectStore(app, () => settingsWith())
    const project = await store.createProject('P', 'Projects')
    const path = project.filePath

    const oscar = makeTask({ title: 'Oscar' })
    await store.insertTask(project, oscar)
    const november = makeTask({ title: 'November' })
    await store.insertTask(project, november)
    // Mike starts blocker-free → no blockedBy is captured as a reconcile base.
    const mike = makeTask({ title: 'Mike' })
    await store.insertTask(project, mike)
    const mikePath = mike.filePath
    if (!mikePath) throw new Error('task has no file path')

    const loaded = await reload(store, path)
    expect(byId(loaded, mike.id).dependencies).toEqual([])
    expect(disk.frontmatter(mikePath)?.blockedBy).toBeUndefined()

    // TaskNotes adds November as a blocker on disk, after PM read Mike blocker-free.
    disk.editFrontmatter(mikePath, (fm) => {
      fm.blockedBy = [{ uid: '[[november]]', reltype: 'FS', gap: 'P0D' }]
    })

    // PM gives Mike its own dependency (Oscar) and saves. Without the fix, blockedBy
    // is regenerated from Oscar alone and November's blocker is silently deleted.
    await store.updateTask(loaded, mike.id, { dependencies: [oscar.id] })

    const fm = disk.frontmatter(mikePath)
    if (!fm) throw new Error('missing frontmatter')
    const uids = (fm.blockedBy as { uid: string }[]).map((b) => b.uid)
    expect(uids).toContain('[[oscar]]')
    expect(uids).toContain('[[november]]')
    expect(fm?.dependencies).toEqual([oscar.id, november.id])
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

  // ─── Time-shape traps: keyed to the migration stamp, not the live toggle ────
  // Both guard the fix for ticket eeb8c13: `readTimeEstimate`/`serializeTask` (and
  // the adoption path) derive the minutes shape from the durable
  // `taskNotesAlignment.timeSync` migration stamp, so flipping the toggle can't
  // reinterpret a migrated estimate's units (a silent 60× corruption).

  // Trap 1: after migration the files are durably in minutes shape, and toggling
  // sync back off must not make `readTimeEstimate` read those minutes as hours
  // (a 2 h estimate would otherwise surface as 120 h; timeEntries would vanish).
  it('trap 1: toggling sync off still reads migrated minutes as hours', async () => {
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

  // Trap 2: adopting a TaskNotes-authored note stamps `pm-task: true`. Without the
  // fix its foreign minutes `timeEstimate` round-tripped verbatim, so the *next*
  // load saw a pmAuthored file and read those minutes as hours — 90 min → 90 h.
  // The fix converts the foreign minutes to our hours at the adoption save.
  it('trap 2: adopting a TaskNotes note converts its estimate to hours', async () => {
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
    // PM adopts the note: this save stamps pm-task and converts the foreign 90 min
    // to our hours, so disk now holds PM's shape (1.5 h) rather than the raw minutes.
    await store.updateTask(loaded, note.id, { status: 'in-progress' })
    expect(disk.frontmatter(notePath)?.['pm-task']).toBe(true)
    expect(disk.frontmatter(notePath)?.timeEstimate).toBe(1.5)

    const after = await reload(store, path)
    // The adopted estimate reads back as 1.5 h, not a 60×-inflated 90 h.
    expect(byId(after, note.id).timeEstimate).toBe(1.5)
  })
})
