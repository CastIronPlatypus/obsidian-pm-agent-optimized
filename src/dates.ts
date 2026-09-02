import { Temporal } from 'temporal-polyfill'

export { Temporal }

/** Today as a PlainDate in the user's local timezone. */
export function today(): Temporal.PlainDate {
  return Temporal.Now.plainDateISO()
}

/** Parse a YYYY-MM-DD field; returns null for empty/invalid strings. */
export function parsePlainDate(s: string): Temporal.PlainDate | null {
  if (!s) return null
  try {
    return Temporal.PlainDate.from(s)
  } catch {
    return null
  }
}

/** The shared rendering policy for plain-date fields: parse, then format locally; '' when empty/invalid. */
function formatPlainDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  const d = parsePlainDate(iso)
  return d ? d.toLocaleString(undefined, options) : ''
}

/** Format a YYYY-MM-DD field as a short local date (e.g. "Jun 15, 2026"); '' when empty/invalid. */
export function formatDate(iso: string): string {
  return formatPlainDate(iso, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Format a YYYY-MM-DD field without the year (e.g. "Jun 15"); '' when empty/invalid. */
export function formatDateShort(iso: string): string {
  return formatPlainDate(iso, { month: 'short', day: 'numeric' })
}

/** Format a YYYY-MM-DD field with a 2-digit year (e.g. "Jun 15, 26"); '' when empty/invalid. */
export function formatDateLong(iso: string): string {
  return formatPlainDate(iso, { month: 'short', day: 'numeric', year: '2-digit' })
}

export type DueTone = 'overdue' | 'today' | 'soon'

/**
 * A short relative-due label for a YYYY-MM-DD date, or null when the date is
 * empty/invalid or far enough out (more than a week) that a hint adds nothing.
 * `from` is injectable so the result is deterministic in tests.
 */
export function relativeDue(iso: string, from: Temporal.PlainDate = today()): { text: string; tone: DueTone } | null {
  const due = parsePlainDate(iso)
  if (!due) return null
  const days = from.until(due, { largestUnit: 'day' }).days
  if (days < 0) return { text: `${-days}d overdue`, tone: 'overdue' }
  if (days === 0) return { text: 'Today', tone: 'today' }
  if (days === 1) return { text: 'Tomorrow', tone: 'today' }
  if (days <= 6) return { text: `In ${days}d`, tone: 'soon' }
  return null
}
