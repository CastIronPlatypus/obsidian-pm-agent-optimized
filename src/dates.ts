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

/** Format a YYYY-MM-DD field as a short local date (e.g. "Jun 15, 2026"); '' when empty/invalid. */
export function formatDate(iso: string): string {
  const d = parsePlainDate(iso)
  return d ? d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}

/**
 * Convert an ISO instant (as stored in `TimeEntry`) to a value for a
 * `datetime-local` input: the local wall-clock time at minute precision
 * (`YYYY-MM-DDTHH:mm`). Empty string for empty/unparseable input.
 */
export function isoToLocalInput(iso: string): string {
  if (!iso) return ''
  try {
    const zdt = Temporal.Instant.from(iso).toZonedDateTimeISO(Temporal.Now.timeZoneId())
    return zdt.toPlainDateTime().toString({ smallestUnit: 'minute' })
  } catch {
    return ''
  }
}

/**
 * Convert a `datetime-local` input value (local wall time, no zone) back to an
 * ISO instant string in UTC (`…Z`). Empty string for empty/unparseable input.
 */
export function localInputToIso(value: string): string {
  if (!value) return ''
  try {
    return Temporal.PlainDateTime.from(value).toZonedDateTime(Temporal.Now.timeZoneId()).toInstant().toString()
  } catch {
    return ''
  }
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
