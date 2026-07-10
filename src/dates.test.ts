import { describe, expect, it } from 'vitest'
import { Temporal } from 'temporal-polyfill'
import { isoToLocalInput, localInputToIso, relativeDue } from './dates'

const from = Temporal.PlainDate.from('2026-06-15')

describe('relativeDue', () => {
  it('returns null for empty or invalid dates', () => {
    expect(relativeDue('', from)).toBeNull()
    expect(relativeDue('not-a-date', from)).toBeNull()
  })

  it('flags overdue dates with the day count', () => {
    expect(relativeDue('2026-06-13', from)).toEqual({ text: '2d overdue', tone: 'overdue' })
    expect(relativeDue('2026-06-14', from)).toEqual({ text: '1d overdue', tone: 'overdue' })
  })

  it('labels today and tomorrow', () => {
    expect(relativeDue('2026-06-15', from)).toEqual({ text: 'Today', tone: 'today' })
    expect(relativeDue('2026-06-16', from)).toEqual({ text: 'Tomorrow', tone: 'today' })
  })

  it('labels dates within the week', () => {
    expect(relativeDue('2026-06-18', from)).toEqual({ text: 'In 3d', tone: 'soon' })
    expect(relativeDue('2026-06-21', from)).toEqual({ text: 'In 6d', tone: 'soon' })
  })

  it('returns null beyond a week out', () => {
    expect(relativeDue('2026-06-22', from)).toBeNull()
    expect(relativeDue('2026-12-01', from)).toBeNull()
  })
})

describe('datetime-local conversion', () => {
  it('round-trips an ISO instant through a local input value', () => {
    const iso = '2026-07-10T09:00:00Z'
    const input = isoToLocalInput(iso)
    // Local wall time, minute precision, no zone suffix.
    expect(input).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    // Back to an instant referring to the same moment.
    expect(Temporal.Instant.from(localInputToIso(input)).epochMilliseconds).toBe(
      Temporal.Instant.from(iso).epochMilliseconds
    )
  })

  it('returns empty string for empty or unparseable values', () => {
    expect(isoToLocalInput('')).toBe('')
    expect(isoToLocalInput('nope')).toBe('')
    expect(localInputToIso('')).toBe('')
    expect(localInputToIso('nope')).toBe('')
  })

  it('emits a UTC (Z) instant from a local input value', () => {
    expect(localInputToIso('2026-07-10T09:00')).toMatch(/Z$/)
  })
})
