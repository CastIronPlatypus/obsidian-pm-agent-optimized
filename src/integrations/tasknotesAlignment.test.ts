import type { App } from 'obsidian'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PRIORITIES, DEFAULT_SETTINGS, DEFAULT_STATUSES, type PMSettings } from '../types'
import {
  adoptFieldMapping,
  adoptPriorities,
  adoptStatuses,
  adoptTitleInFrontmatter,
  fieldMappingDiverges,
  PM_FIELD_MAPPING,
  prioritiesDiverge,
  readTaskNotesStatuses,
  revertFieldMapping,
  revertPriorities,
  revertStatuses,
  revertTitleInFrontmatter,
  statusesDiverge,
  taskNotesStatusesToConfig,
  titleStorageDiverges
} from './tasknotesAlignment'

const TN_STATUSES = [
  { id: 'none', value: 'none', label: 'None', color: '#cccccc', isCompleted: false },
  { id: 'open', value: 'open', label: 'Open', color: '#808080', isCompleted: false },
  { id: 'in-progress', value: 'in-progress', label: 'In progress', color: '#0066cc', isCompleted: false },
  { id: 'done', value: 'done', label: 'Done', color: '#00aa00', isCompleted: true }
]

const TN_PRIORITIES = [
  { id: 'none', value: 'none', label: 'None', color: '#cccccc', weight: 0 },
  { id: 'low', value: 'low', label: 'Low', color: '#00aa00', weight: 1 },
  { id: 'normal', value: 'normal', label: 'Normal', color: '#ffaa00', weight: 2 },
  { id: 'high', value: 'high', label: 'High', color: '#ff0000', weight: 3 }
]

function defaultFieldMapping(): Record<string, string> {
  return {
    title: 'title',
    status: 'status',
    scheduled: 'scheduled',
    dateCreated: 'dateCreated',
    dateModified: 'dateModified'
  }
}

/** A fake app whose TaskNotes plugin exposes a mutable settings object and a saveSettings spy. */
function makeApp(settings: Record<string, unknown> | null): {
  app: App
  saved: number
  plugin: { settings: unknown } | null
} {
  const state = { saved: 0 }
  const plugin = settings ? { settings, saveSettings: () => void state.saved++ } : null
  const app = {
    plugins: { getPlugin: (id: string) => (id === 'tasknotes' ? plugin : null) }
  } as unknown as App
  return {
    app,
    get saved() {
      return state.saved
    },
    plugin
  }
}

function freshSettings(): PMSettings {
  return { ...structuredClone(DEFAULT_SETTINGS), taskNotesAlignment: {} }
}

describe('readTaskNotesStatuses', () => {
  it('maps custom statuses, skipping entries without a value', () => {
    const { app } = makeApp({ customStatuses: [...TN_STATUSES, { label: 'junk' }] })
    expect(readTaskNotesStatuses(app)?.map((s) => s.value)).toEqual(['none', 'open', 'in-progress', 'done'])
  })

  it('is null when TaskNotes is absent', () => {
    expect(readTaskNotesStatuses(makeApp(null).app)).toBeNull()
  })
})

describe('divergence', () => {
  it('PM defaults diverge from TaskNotes lists', () => {
    expect(statusesDiverge(DEFAULT_STATUSES, TN_STATUSES)).toBe(true)
    expect(prioritiesDiverge(DEFAULT_PRIORITIES, TN_PRIORITIES)).toBe(true)
  })

  it('an adopted palette no longer diverges', () => {
    expect(statusesDiverge(taskNotesStatusesToConfig(TN_STATUSES), TN_STATUSES)).toBe(false)
  })

  it('fieldMapping diverges until every managed key points at PM names', () => {
    expect(fieldMappingDiverges(makeApp({ fieldMapping: defaultFieldMapping() }).app)).toBe(true)
    const aligned = { ...defaultFieldMapping(), ...PM_FIELD_MAPPING }
    expect(fieldMappingDiverges(makeApp({ fieldMapping: aligned }).app)).toBe(false)
  })

  it('fieldMapping does not diverge when TaskNotes is absent', () => {
    expect(fieldMappingDiverges(makeApp(null).app)).toBe(false)
  })
})

describe('adopt/revert statuses & priorities', () => {
  it('adopting statuses snapshots the prior palette and swaps in TaskNotes values', () => {
    const { app } = makeApp({ customStatuses: TN_STATUSES })
    const settings = freshSettings()
    const prior = settings.statuses
    expect(adoptStatuses(app, settings)).toBe(true)
    expect(settings.statuses.map((s) => s.id)).toEqual(['none', 'open', 'in-progress', 'done'])
    expect(settings.taskNotesAlignment.statuses?.prev).toBe(prior)
  })

  it('revert restores the exact prior status palette', () => {
    const { app } = makeApp({ customStatuses: TN_STATUSES })
    const settings = freshSettings()
    const prior = settings.statuses
    adoptStatuses(app, settings)
    expect(revertStatuses(settings)).toBe(true)
    expect(settings.statuses).toBe(prior)
    expect(settings.taskNotesAlignment.statuses).toBeUndefined()
  })

  it('adopt is a no-op without TaskNotes', () => {
    const settings = freshSettings()
    expect(adoptStatuses(makeApp(null).app, settings)).toBe(false)
    expect(adoptPriorities(makeApp(null).app, settings)).toBe(false)
  })

  it('revert priorities restores the prior palette', () => {
    const { app } = makeApp({ customPriorities: TN_PRIORITIES })
    const settings = freshSettings()
    const prior = settings.priorities
    adoptPriorities(app, settings)
    expect(settings.priorities.map((p) => p.id)).toEqual(['none', 'low', 'normal', 'high'])
    revertPriorities(settings)
    expect(settings.priorities).toBe(prior)
  })
})

describe('adopt/revert field mapping', () => {
  it('points managed keys at PM names, snapshots priors, and persists through TaskNotes', async () => {
    const fm = defaultFieldMapping()
    const h = makeApp({ fieldMapping: fm })
    const settings = freshSettings()
    expect(await adoptFieldMapping(h.app, settings)).toBe(true)
    expect(fm.scheduled).toBe('start')
    expect(fm.dateCreated).toBe('createdAt')
    expect(fm.dateModified).toBe('updatedAt')
    expect(settings.taskNotesAlignment.fieldMapping?.prev).toEqual({
      scheduled: 'scheduled',
      dateCreated: 'dateCreated',
      dateModified: 'dateModified'
    })
    expect(h.saved).toBe(1)
  })

  it('revert restores the exact prior mapping values', async () => {
    const fm = defaultFieldMapping()
    const h = makeApp({ fieldMapping: fm })
    const settings = freshSettings()
    await adoptFieldMapping(h.app, settings)
    expect(await revertFieldMapping(h.app, settings)).toBe(true)
    expect(fm.scheduled).toBe('scheduled')
    expect(fm.dateCreated).toBe('dateCreated')
    expect(fm.dateModified).toBe('dateModified')
    expect(settings.taskNotesAlignment.fieldMapping).toBeUndefined()
    expect(h.saved).toBe(2)
  })

  it('revert deletes a managed key that had no prior value', async () => {
    const fm: Record<string, string> = { title: 'title' } // no scheduled/dateCreated/dateModified
    const h = makeApp({ fieldMapping: fm })
    const settings = freshSettings()
    await adoptFieldMapping(h.app, settings)
    expect(fm.scheduled).toBe('start')
    await revertFieldMapping(h.app, settings)
    expect('scheduled' in fm).toBe(false)
    expect('dateCreated' in fm).toBe(false)
  })

  it('adopt is a no-op without TaskNotes', async () => {
    const settings = freshSettings()
    expect(await adoptFieldMapping(makeApp(null).app, settings)).toBe(false)
  })
})

describe('title storage', () => {
  it('diverges when storeTitleInFilename is on (or unset), not when off', () => {
    expect(titleStorageDiverges(makeApp({ storeTitleInFilename: true }).app)).toBe(true)
    expect(titleStorageDiverges(makeApp({}).app)).toBe(true) // TaskNotes defaults to on
    expect(titleStorageDiverges(makeApp({ storeTitleInFilename: false }).app)).toBe(false)
    expect(titleStorageDiverges(makeApp(null).app)).toBe(false)
  })

  it('adopt turns it off, snapshots the prior value, and persists', async () => {
    const tn: Record<string, unknown> = { storeTitleInFilename: true }
    const h = makeApp(tn)
    const settings = freshSettings()
    expect(await adoptTitleInFrontmatter(h.app, settings)).toBe(true)
    expect(tn.storeTitleInFilename).toBe(false)
    expect(settings.taskNotesAlignment.titleStorage?.prev).toBe(true)
    expect(h.saved).toBe(1)
  })

  it('revert restores the prior value', async () => {
    const tn: Record<string, unknown> = { storeTitleInFilename: true }
    const h = makeApp(tn)
    const settings = freshSettings()
    await adoptTitleInFrontmatter(h.app, settings)
    expect(await revertTitleInFrontmatter(h.app, settings)).toBe(true)
    expect(tn.storeTitleInFilename).toBe(true)
    expect(settings.taskNotesAlignment.titleStorage).toBeUndefined()
  })

  it('adopt is a no-op without TaskNotes', async () => {
    expect(await adoptTitleInFrontmatter(makeApp(null).app, freshSettings())).toBe(false)
  })
})
