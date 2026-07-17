// Value coercion for CLI inputs. `coerceScalar` handles create flags; the
// `field=value` patch coercion (`parseAssignments` + `coercePatch`) feeds the
// mutation commands (`set`, `apply`) that build a typed `Partial<Task>`.

import type { Task } from '../../src/types'

/** Coerce a raw string into a scalar: number, boolean, or the trimmed string. */
export function coerceScalar(raw: string): string | number | boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw !== '' && !Number.isNaN(Number(raw)) && /^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  return raw
}

/** Split a comma list into trimmed, non-empty items. */
export function coerceList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** Parse repeated `field=value` args into a `{ field: rawValue }` map. */
export function parseAssignments(pairs: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of pairs) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    out[pair.slice(0, eq)] = pair.slice(eq + 1)
  }
  return out
}

// Field kinds, mirroring the `pm schema` shapes, so `k=v` coerces the way the
// modal would (arrays via comma lists, numbers, `YYYY-MM-DD` dates verbatim).
const ARRAY_FIELDS = new Set(['assignees', 'tags', 'dependencies', 'subtaskIds'])
const NUMBER_FIELDS = new Set(['progress', 'timeEstimate'])
const DATE_FIELDS = new Set(['due', 'start', 'completed'])
const CLEAR_TOKENS = new Set(['', 'none', 'clear', 'null'])

/**
 * Coerce a `{ field: rawValue }` map into a typed `Partial<Task>`:
 * arrays split on commas, numbers parsed, dates kept as strings (blank/`clear`
 * unsets them), and `customFields.<id>=…` folded into `customFields`.
 */
export function coercePatch(raw: Record<string, string>): Partial<Task> {
  const patch: Partial<Task> = {}
  const customFields: Record<string, unknown> = {}
  let hasCustom = false

  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('customFields.')) {
      customFields[key.slice('customFields.'.length)] = coerceScalar(value)
      hasCustom = true
      continue
    }
    if (ARRAY_FIELDS.has(key)) {
      ;(patch as Record<string, unknown>)[key] = coerceList(value)
      continue
    }
    if (NUMBER_FIELDS.has(key)) {
      const n = Number(value)
      if (!Number.isNaN(n)) (patch as Record<string, unknown>)[key] = n
      continue
    }
    if (DATE_FIELDS.has(key)) {
      ;(patch as Record<string, unknown>)[key] = CLEAR_TOKENS.has(value.trim().toLowerCase()) ? '' : value.trim()
      continue
    }
    // Plain string field (title, status, priority, description, type, …).
    ;(patch as Record<string, unknown>)[key] = value
  }

  if (hasCustom) patch.customFields = customFields
  return patch
}
