import type { App } from 'obsidian'
import { MINUTES_PER_HOUR, type PMSettings, type TimeEntry } from '../types'
import { appendYaml, parseFrontmatter, TASK_FRONTMATTER_KEY } from '../store/YamlParser'
import { Temporal } from '../dates'

/**
 * Commit (c) of "Converge time tracking shape with TaskNotes": the one-shot
 * migration that runs when the user flips `taskNotesTimeSync` on. It rewrites
 * every PM task file from PM's own time shape (`timeLogs` per-day hour rows +
 * an hours `timeEstimate`) into TaskNotes' shape (`timeEntries` sessions +
 * a minutes `timeEstimate`), so both plugins read and write the same fields.
 *
 * One-way by design: disabling the toggle stops syncing but does not convert
 * `timeEntries` back. The whole run is guarded by `taskNotesAlignment.timeSync`
 * so a second flip-on can't double the estimates.
 */

/** Clock hour a migrated per-day log's session starts at (local wall time). */
const SESSION_START_HOUR = 9

/**
 * Convert a legacy per-day `TimeLog` into a TaskNotes-style session. Legacy logs
 * carry no clock times, so we anchor each at 09:00 local on its date and run it
 * forward by its logged hours. Returns null for a log with no usable date.
 */
export function timeLogToEntry(log: { date: string; hours: number; note: string }): TimeEntry | null {
  if (!log.date) return null
  let start: Temporal.ZonedDateTime
  try {
    start = Temporal.PlainDate.from(log.date)
      .toPlainDateTime({ hour: SESSION_START_HOUR })
      .toZonedDateTime(Temporal.Now.timeZoneId())
  } catch {
    return null
  }
  const minutes = Math.max(0, Math.round(log.hours * MINUTES_PER_HOUR))
  const end = start.add({ minutes })
  return {
    startTime: start.toInstant().toString(),
    endTime: end.toInstant().toString(),
    description: log.note
  }
}

/**
 * Rewrite one PM task's frontmatter in place from PM's time shape to TaskNotes':
 * `timeLogs` become `timeEntries` sessions and the hours `timeEstimate` becomes
 * minutes. Returns true when anything changed. Not idempotent on its own — a
 * second ×60 would corrupt the estimate — so the caller guards the whole run.
 */
export function migrateTimeShapeFrontmatter(fm: Record<string, unknown>): boolean {
  let changed = false

  if (typeof fm.timeEstimate === 'number') {
    fm.timeEstimate = Math.round(fm.timeEstimate * MINUTES_PER_HOUR)
    changed = true
  }

  if (Array.isArray(fm.timeLogs)) {
    const sessions: TimeEntry[] = []
    for (const raw of fm.timeLogs) {
      if (!raw || typeof raw !== 'object') continue
      const log = raw as Record<string, unknown>
      const entry = timeLogToEntry({
        date: typeof log.date === 'string' ? log.date : '',
        hours: typeof log.hours === 'number' ? log.hours : 0,
        note: typeof log.note === 'string' ? log.note : ''
      })
      if (entry) sessions.push(entry)
    }
    delete fm.timeLogs
    if (sessions.length) {
      const existing = Array.isArray(fm.timeEntries) ? (fm.timeEntries as TimeEntry[]) : []
      fm.timeEntries = [...existing, ...sessions]
    }
    changed = true
  }

  return changed
}

/**
 * Apply the migration to a task file's raw content, returning the new content or
 * null when the file is not a PM task or needs no change. Reserializes through
 * PM's own YAML writer — the same one every task save already uses — so foreign
 * keys and the body carry through untouched.
 */
export function migrateTaskFileContent(content: string): string | null {
  const { frontmatter, body } = parseFrontmatter(content)
  if (!frontmatter || frontmatter[TASK_FRONTMATTER_KEY] !== true) return null
  if (!migrateTimeShapeFrontmatter(frontmatter)) return null
  const lines: string[] = ['---']
  appendYaml(lines, frontmatter, 0)
  lines.push('---', '')
  if (body) lines.push(body, '')
  return lines.join('\n')
}

/**
 * Run the one-shot migration across the vault and stamp `appliedAt`. A no-op if
 * it already ran (the stamp is present). Returns how many task files were
 * rewritten. Reads every markdown file cheaply first and only opens a rewrite on
 * the ones that actually change.
 */
export async function runTimeSyncMigration(app: App, settings: PMSettings): Promise<number> {
  if (settings.taskNotesAlignment.timeSync) return 0

  let migrated = 0
  for (const file of app.vault.getMarkdownFiles()) {
    try {
      const content = await app.vault.cachedRead(file)
      if (migrateTaskFileContent(content) === null) continue
      await app.vault.process(file, (fresh) => migrateTaskFileContent(fresh) ?? fresh)
      migrated++
    } catch (e) {
      console.error(`[PM] Time-sync migration failed for ${file.path}:`, e)
    }
  }

  settings.taskNotesAlignment.timeSync = { appliedAt: new Date().toISOString() }
  return migrated
}
