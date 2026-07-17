// Value coercion for CLI inputs. Wave A uses `coerceScalar` for create flags;
// the `field=value` patch coercion (`parseAssignments`) is here for the mutation
// commands (Wave B) that extend this module.

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
