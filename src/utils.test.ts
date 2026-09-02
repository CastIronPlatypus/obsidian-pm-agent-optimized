import { describe, it, expect } from 'vitest'
import { formatDateShort, formatDateLong } from './utils'

/**
 * Regression tests for the table-view due-date display bug (task
 * kzniwt6lmtj9c2bp in the Obsidian Projects Plugin project): the Due chip
 * showed the previous calendar day for users west of UTC because
 * `new Date('YYYY-MM-DD')` parses as UTC midnight and `toLocaleDateString`
 * then rendered it in local time (UTC-6 → previous day). The formatters now
 * parse via `parsePlainDate` (Temporal.PlainDate), which is
 * timezone-independent — same contract as dates.ts `formatDate`.
 */
describe('date formatters are timezone-independent (bug kzniwt6lmtj9c2bp)', () => {
  it('formatDateLong shows the picked day, not the previous day, west of UTC', () => {
    // America/Denver = Salt Lake City, the reporter's timezone (UTC-6 in Sep).
    // The suite runs under TZ=America/Denver in CI for this check.
    const out = formatDateLong('2026-09-01')
    expect(out).toMatch(/Sep/)
    expect(out).not.toMatch(/Aug/)
  })

  it('formatDateShort shows the picked day, not the previous day, west of UTC', () => {
    const out = formatDateShort('2026-09-01')
    expect(out).toMatch(/Sep/)
    expect(out).not.toMatch(/Aug/)
  })

  it('returns empty string for empty and invalid input', () => {
    expect(formatDateShort('')).toBe('')
    expect(formatDateLong('')).toBe('')
    expect(formatDateShort('not-a-date')).toBe('')
    expect(formatDateLong('not-a-date')).toBe('')
  })
})
