import type { App } from 'obsidian'
import type { PMSettings, PriorityConfig, StatusConfig } from '../types'
import { getTaskNotesPlugin } from './tasknotes'

/**
 * Phase 2 of the TaskNotes integration — the "setup moment". Two config-only,
 * fully-reversible alignments give the two plugins one shared vocabulary:
 *
 *  - Adopt TaskNotes' status / priority lists into PM's palette (adopt-list-only:
 *    we swap the catalog, never rewrite a task's stored value).
 *  - Point TaskNotes' `fieldMapping` at PM's frontmatter key names, so TaskNotes
 *    reads the `start` / `createdAt` / `updatedAt` keys PM already writes.
 *
 * Both touch *settings* — PM's own, or TaskNotes' — and never a task file, so
 * every apply snapshots the exact prior value and Revert restores it byte-for-byte.
 */

/**
 * TaskNotes' `fieldMapping` maps its internal field name → the frontmatter key it
 * reads. These three defaults diverge from what PM writes; the rest (`title`,
 * `status`, `priority`, `due`, `contexts`, `projects`, …) already match PM's keys.
 * Opt 4 rewrites exactly these, pointing TaskNotes at PM's names.
 */
export const PM_FIELD_MAPPING: Readonly<Record<string, string>> = {
  scheduled: 'start',
  dateCreated: 'createdAt',
  dateModified: 'updatedAt'
}

// ─── Reading TaskNotes' catalogs ──────────────────────────────────────────────

export interface TaskNotesStatusOption {
  value: string
  label: string
  color: string
  isCompleted: boolean
}

export interface TaskNotesPriorityOption {
  value: string
  label: string
  color: string
}

function tnSettings(app: App): Record<string, unknown> | null {
  const plugin = getTaskNotesPlugin(app)
  const settings = plugin?.settings
  return settings && typeof settings === 'object' ? settings : null
}

/** TaskNotes' custom status list, or null when unavailable. Entries lacking a string value are skipped. */
export function readTaskNotesStatuses(app: App): TaskNotesStatusOption[] | null {
  const raw = tnSettings(app)?.customStatuses
  if (!Array.isArray(raw)) return null
  const out: TaskNotesStatusOption[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.value !== 'string' || !e.value) continue
    out.push({
      value: e.value,
      label: typeof e.label === 'string' && e.label ? e.label : e.value,
      color: typeof e.color === 'string' ? e.color : '',
      isCompleted: e.isCompleted === true
    })
  }
  return out.length ? out : null
}

/** TaskNotes' custom priority list, or null when unavailable. */
export function readTaskNotesPriorities(app: App): TaskNotesPriorityOption[] | null {
  const raw = tnSettings(app)?.customPriorities
  if (!Array.isArray(raw)) return null
  const out: TaskNotesPriorityOption[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.value !== 'string' || !e.value) continue
    out.push({
      value: e.value,
      label: typeof e.label === 'string' && e.label ? e.label : e.value,
      color: typeof e.color === 'string' ? e.color : ''
    })
  }
  return out.length ? out : null
}

const FALLBACK_COLOR = '#8a94a0'

export function taskNotesStatusesToConfig(options: TaskNotesStatusOption[]): StatusConfig[] {
  return options.map((o) => ({
    id: o.value,
    label: o.label,
    color: o.color || FALLBACK_COLOR,
    icon: '',
    complete: o.isCompleted
  }))
}

export function taskNotesPrioritiesToConfig(options: TaskNotesPriorityOption[]): PriorityConfig[] {
  return options.map((o) => ({
    id: o.value,
    label: o.label,
    color: o.color || FALLBACK_COLOR,
    icon: ''
  }))
}

// ─── Divergence checks ────────────────────────────────────────────────────────

function idSet<T extends { id: string }>(items: T[]): Set<string> {
  return new Set(items.map((i) => i.id))
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

/** True when PM's status ids don't match TaskNotes' status values (order-insensitive). */
export function statusesDiverge(pm: StatusConfig[], tn: TaskNotesStatusOption[]): boolean {
  return !sameSet(idSet(pm), new Set(tn.map((s) => s.value)))
}

/** True when PM's priority ids don't match TaskNotes' priority values. */
export function prioritiesDiverge(pm: PriorityConfig[], tn: TaskNotesPriorityOption[]): boolean {
  return !sameSet(idSet(pm), new Set(tn.map((p) => p.value)))
}

/** Read TaskNotes' fieldMapping object, or null when unavailable. */
function readFieldMapping(app: App): Record<string, unknown> | null {
  const fm = tnSettings(app)?.fieldMapping
  return fm && typeof fm === 'object' ? (fm as Record<string, unknown>) : null
}

/** True when TaskNotes' fieldMapping does not yet point every managed key at PM's name. */
export function fieldMappingDiverges(app: App): boolean {
  const fm = readFieldMapping(app)
  if (!fm) return false
  return Object.entries(PM_FIELD_MAPPING).some(([key, pmName]) => fm[key] !== pmName)
}

// ─── Apply / revert: statuses ─────────────────────────────────────────────────

/** Adopt TaskNotes' status list into PM's palette, snapshotting the prior one. No-op without TaskNotes. */
export function adoptStatuses(app: App, settings: PMSettings): boolean {
  const tn = readTaskNotesStatuses(app)
  if (!tn) return false
  settings.taskNotesAlignment.statuses = { appliedAt: new Date().toISOString(), prev: settings.statuses }
  settings.statuses = taskNotesStatusesToConfig(tn)
  return true
}

export function revertStatuses(settings: PMSettings): boolean {
  const snap = settings.taskNotesAlignment.statuses
  if (!snap) return false
  settings.statuses = snap.prev
  delete settings.taskNotesAlignment.statuses
  return true
}

// ─── Apply / revert: priorities ───────────────────────────────────────────────

export function adoptPriorities(app: App, settings: PMSettings): boolean {
  const tn = readTaskNotesPriorities(app)
  if (!tn) return false
  settings.taskNotesAlignment.priorities = { appliedAt: new Date().toISOString(), prev: settings.priorities }
  settings.priorities = taskNotesPrioritiesToConfig(tn)
  return true
}

export function revertPriorities(settings: PMSettings): boolean {
  const snap = settings.taskNotesAlignment.priorities
  if (!snap) return false
  settings.priorities = snap.prev
  delete settings.taskNotesAlignment.priorities
  return true
}

// ─── Apply / revert: field mapping (touches TaskNotes' own settings) ──────────

/**
 * Point TaskNotes' fieldMapping at PM's key names and persist it through
 * TaskNotes' own writer. Snapshots each managed key's prior value; a key that
 * was absent is recorded as such so Revert deletes rather than blanks it.
 */
export async function adoptFieldMapping(app: App, settings: PMSettings): Promise<boolean> {
  const plugin = getTaskNotesPlugin(app)
  const fm = plugin?.settings?.fieldMapping
  if (!fm || typeof fm !== 'object') return false
  const mapping = fm as Record<string, unknown>
  const prev: Record<string, string> = {}
  for (const [key, pmName] of Object.entries(PM_FIELD_MAPPING)) {
    const current = mapping[key]
    if (typeof current === 'string') prev[key] = current
    mapping[key] = pmName
  }
  settings.taskNotesAlignment.fieldMapping = { appliedAt: new Date().toISOString(), prev }
  await plugin?.saveSettings?.()
  return true
}

// ─── Apply / revert: title storage ───────────────────────────────────────────

/**
 * TaskNotes' `storeTitleInFilename` makes the *filename* the source of truth for
 * a task's title: on any edit it writes the basename-derived title back into
 * frontmatter, clobbering the `title:` PM wrote (PM names files by slug/id, not
 * title). True is the divergent, data-losing state; false lets both plugins read
 * the title from frontmatter, where they already agree (`fieldMapping.title`).
 */
export function storeTitleInFilenameIsOn(app: App): boolean | null {
  const settings = tnSettings(app)
  if (!settings) return null
  // TaskNotes' own default is on, so an unset value is treated as on.
  return settings.storeTitleInFilename !== false
}

/** True when TaskNotes would overwrite PM's frontmatter titles from the filename. */
export function titleStorageDiverges(app: App): boolean {
  return storeTitleInFilenameIsOn(app) === true
}

/** Turn TaskNotes' `storeTitleInFilename` off so titles round-trip through frontmatter. */
export async function adoptTitleInFrontmatter(app: App, settings: PMSettings): Promise<boolean> {
  const plugin = getTaskNotesPlugin(app)
  if (!plugin?.settings) return false
  const prev = plugin.settings.storeTitleInFilename !== false
  plugin.settings.storeTitleInFilename = false
  settings.taskNotesAlignment.titleStorage = { appliedAt: new Date().toISOString(), prev }
  await plugin.saveSettings?.()
  return true
}

export async function revertTitleInFrontmatter(app: App, settings: PMSettings): Promise<boolean> {
  const snap = settings.taskNotesAlignment.titleStorage
  if (!snap) return false
  const plugin = getTaskNotesPlugin(app)
  if (plugin?.settings) {
    plugin.settings.storeTitleInFilename = snap.prev
    await plugin.saveSettings?.()
  }
  delete settings.taskNotesAlignment.titleStorage
  return true
}

// ─── Revert everything (disconnecting from TaskNotes) ─────────────────────────

/**
 * Undo every reversible alignment at once, restoring PM's (and TaskNotes') prior
 * values from their snapshots. Called when the user turns off interop or when
 * TaskNotes is gone — so PM's status/priority palettes and field names return to
 * their pre-TaskNotes state instead of staying "mixed with TaskNotes".
 *
 * The one-shot `timeSync` migration is left untouched: it rewrote task files and
 * has no snapshot, so it can't be reversed here. Safe with TaskNotes uninstalled —
 * the field-mapping / title-storage reverts skip its settings and just drop the
 * stale snapshot. Returns true when at least one alignment was reverted.
 */
export async function revertAllAlignments(app: App, settings: PMSettings): Promise<boolean> {
  const statuses = revertStatuses(settings)
  const priorities = revertPriorities(settings)
  const fieldMapping = await revertFieldMapping(app, settings)
  const titleStorage = await revertTitleInFrontmatter(app, settings)
  return statuses || priorities || fieldMapping || titleStorage
}

export async function revertFieldMapping(app: App, settings: PMSettings): Promise<boolean> {
  const snap = settings.taskNotesAlignment.fieldMapping
  if (!snap) return false
  const plugin = getTaskNotesPlugin(app)
  const fm = plugin?.settings?.fieldMapping
  if (fm && typeof fm === 'object') {
    const mapping = fm as Record<string, unknown>
    for (const key of Object.keys(PM_FIELD_MAPPING)) {
      if (key in snap.prev) mapping[key] = snap.prev[key]
      else Reflect.deleteProperty(mapping, key)
    }
    await plugin?.saveSettings?.()
  }
  delete settings.taskNotesAlignment.fieldMapping
  return true
}
