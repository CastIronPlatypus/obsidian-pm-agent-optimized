import { describe, expect, it } from 'vitest'
import type { PMSettings } from '../types'
import { hydrateTaskFromFile } from '../store/YamlHydrator'
import { parseFrontmatter } from '../store/YamlParser'
import { makeFakeApp } from '../../test/fakeVault'
import {
  migrateTaskFileContent,
  migrateTimeShapeFrontmatter,
  runTimeSyncMigration,
  timeLogToEntry
} from './timeSyncMigration'

function taskFile(fm: string): string {
  return `---\npm-task: true\nid: "t-1"\ntitle: "Task"\n${fm}---\n\nBody line.\n`
}

describe('timeLogToEntry', () => {
  it('anchors a legacy per-day log at 09:00 local and runs it forward by its hours', () => {
    const entry = timeLogToEntry({ date: '2026-04-01', hours: 2, note: 'init' })
    if (!entry) throw new Error('entry missing')
    expect(entry.description).toBe('init')
    // 2h session, so end - start = 2 hours regardless of the local zone offset.
    const ms = Date.parse(entry.endTime as string) - Date.parse(entry.startTime)
    expect(ms).toBe(2 * 60 * 60 * 1000)
  })

  it('returns null for a log without a date', () => {
    expect(timeLogToEntry({ date: '', hours: 1, note: '' })).toBeNull()
  })
})

describe('migrateTimeShapeFrontmatter', () => {
  it('converts timeLogs to timeEntries and drops timeLogs', () => {
    const fm: Record<string, unknown> = {
      timeLogs: [
        { date: '2026-04-01', hours: 2, note: 'a' },
        { date: '2026-04-02', hours: 1, note: 'b' }
      ]
    }
    expect(migrateTimeShapeFrontmatter(fm)).toBe(true)
    expect(fm.timeLogs).toBeUndefined()
    const entries = fm.timeEntries as { description: string }[]
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.description)).toEqual(['a', 'b'])
  })

  it('multiplies timeEstimate hours into minutes', () => {
    const fm: Record<string, unknown> = { timeEstimate: 1.5 }
    expect(migrateTimeShapeFrontmatter(fm)).toBe(true)
    expect(fm.timeEstimate).toBe(90)
  })

  it('reports no change on a file with neither field', () => {
    const fm: Record<string, unknown> = { title: 'x' }
    expect(migrateTimeShapeFrontmatter(fm)).toBe(false)
  })
})

describe('migrateTaskFileContent', () => {
  it('rewrites a PM task file and preserves its body', () => {
    const out = migrateTaskFileContent(
      taskFile('timeEstimate: 8\ntimeLogs:\n  - date: "2026-04-01"\n    hours: 2\n    note: "init"\n')
    )
    if (out === null) throw new Error('expected a rewrite')
    const { frontmatter, body } = parseFrontmatter(out)
    if (!frontmatter) throw new Error('frontmatter missing')
    expect(frontmatter.timeEstimate).toBe(480)
    expect(frontmatter.timeLogs).toBeUndefined()
    expect((frontmatter.timeEntries as unknown[]).length).toBe(1)
    expect(body).toContain('Body line.')
  })

  it('ignores non-PM files', () => {
    expect(migrateTaskFileContent('---\ntags: ["task"]\ntimeEstimate: 90\n---\n\nbody')).toBeNull()
  })
})

function settingsStub(): PMSettings {
  return { taskNotesAlignment: {} } as PMSettings
}

describe('runTimeSyncMigration', () => {
  it('migrates every PM task once and is a no-op on a second run', async () => {
    const { app, vault } = makeFakeApp()
    await vault.create(
      'Projects/P_tasks/a.md',
      taskFile('timeEstimate: 8\ntimeLogs:\n  - date: "2026-04-01"\n    hours: 2\n    note: "init"\n')
    )
    await vault.create('Notes/plain.md', '---\ntags: ["note"]\n---\n\nnot a task')

    const settings = settingsStub()
    const first = await runTimeSyncMigration(app as never, settings)
    expect(first).toBe(1)
    expect(settings.taskNotesAlignment.timeSync?.appliedAt).toBeTruthy()

    const afterFirst = await vault.cachedRead(vault.getFileByPath('Projects/P_tasks/a.md') as never)
    expect(parseFrontmatter(afterFirst).frontmatter?.timeEstimate).toBe(480)

    // Second run: guarded by the stamp, so nothing is rewritten and the estimate
    // is not multiplied a second time.
    const second = await runTimeSyncMigration(app as never, settings)
    expect(second).toBe(0)
    const afterSecond = await vault.cachedRead(vault.getFileByPath('Projects/P_tasks/a.md') as never)
    expect(afterSecond).toBe(afterFirst)
  })
})

describe('collision fix (sync off + co-installed TaskNotes)', () => {
  it('does not misread a TaskNotes timeEstimate (minutes) as PM hours', () => {
    const fm: Record<string, unknown> = { title: 'TaskNotes task', tags: ['task'], timeEstimate: 90 }
    const { task } = hydrateTaskFromFile(fm, '', 'TaskNotes/Tasks/estimate.md')
    expect(task.timeEstimate).toBeUndefined()
    expect(task.foreign?.timeEstimate).toBe(90)
  })
})
