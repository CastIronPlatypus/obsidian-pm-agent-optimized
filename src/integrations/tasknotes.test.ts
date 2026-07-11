import type { App } from 'obsidian'
import { describe, expect, it } from 'vitest'
import {
  getTaskNotesConfig,
  hasProjectAssociation,
  hasTaskNotesMarker,
  isSharedTaskNote,
  isTaskNotesInstalled,
  mergeProjectLink,
  reconcileSharedField,
  resolveProjectLinks,
  resolveTaskNotesRef,
  stampTaskNotesMarker,
  type TaskNotesConfig
} from './tasknotes'

function makeApp(opts: { plugin?: object; files?: string[]; links?: Record<string, string> } = {}): App {
  const files = new Set(opts.files ?? [])
  return {
    plugins: { getPlugin: (id: string) => (id === 'tasknotes' ? (opts.plugin ?? null) : null) },
    vault: { getFileByPath: (path: string) => (files.has(path) ? { path } : null) },
    metadataCache: {
      getFirstLinkpathDest: (linkpath: string) => {
        const dest = opts.links?.[linkpath]
        return dest ? { path: dest } : null
      }
    }
  } as unknown as App
}

describe('isTaskNotesInstalled', () => {
  it('is true when the plugin registry returns a tasknotes plugin', () => {
    expect(isTaskNotesInstalled(makeApp({ plugin: {} }))).toBe(true)
  })

  it('is false when the plugin is absent', () => {
    expect(isTaskNotesInstalled(makeApp())).toBe(false)
  })

  it('is false when the app exposes no plugin registry', () => {
    expect(isTaskNotesInstalled({} as App)).toBe(false)
  })
})

describe('resolveTaskNotesRef', () => {
  it('resolves a plain vault path that exists', () => {
    const app = makeApp({ files: ['Projects/Refactoring.md'] })
    expect(resolveTaskNotesRef(app, 'Projects/Refactoring.md', 'Tasks/a.md')).toBe('Projects/Refactoring.md')
  })

  it('resolves a wikilink through the metadata cache', () => {
    const app = makeApp({ links: { Refactoring: 'Projects/Refactoring.md' } })
    expect(resolveTaskNotesRef(app, '[[Refactoring]]', 'Tasks/a.md')).toBe('Projects/Refactoring.md')
  })

  it('strips an alias and a heading anchor before resolving', () => {
    const app = makeApp({ links: { Refactoring: 'Projects/Refactoring.md' } })
    expect(resolveTaskNotesRef(app, '[[Refactoring#Scope|Obsidian-PM]]', 'Tasks/a.md')).toBe('Projects/Refactoring.md')
  })

  it('returns null for an unresolvable ref', () => {
    expect(resolveTaskNotesRef(makeApp(), '[[Nope]]', 'Tasks/a.md')).toBeNull()
  })

  it('returns null for an empty ref', () => {
    expect(resolveTaskNotesRef(makeApp(), '[[]]', 'Tasks/a.md')).toBeNull()
  })
})

describe('resolveProjectLinks', () => {
  it('resolves every projects[] entry, in order, deduped', () => {
    const app = makeApp({
      links: { Refactoring: 'Projects/Refactoring.md', Website: 'Projects/Website.md' }
    })
    const fm = { projects: ['[[Refactoring]]', '[[Website]]', '[[Refactoring|Alias]]'] }
    expect(resolveProjectLinks(fm, app, 'Inbox/a.md')).toEqual(['Projects/Refactoring.md', 'Projects/Website.md'])
  })

  it('drops entries that do not resolve, keeps the rest', () => {
    const app = makeApp({ links: { Refactoring: 'Projects/Refactoring.md' } })
    const fm = { projects: ['[[Nope]]', '[[Refactoring]]'] }
    expect(resolveProjectLinks(fm, app, 'Inbox/a.md')).toEqual(['Projects/Refactoring.md'])
  })

  it('returns empty for missing or non-array projects', () => {
    const app = makeApp()
    expect(resolveProjectLinks({}, app, 'Inbox/a.md')).toEqual([])
    expect(resolveProjectLinks({ projects: '[[Refactoring]]' }, app, 'Inbox/a.md')).toEqual([])
  })
})

const tagConfig: TaskNotesConfig = { identification: 'tag', taskTag: 'task', fieldName: '', fieldValue: '' }
const propConfig: TaskNotesConfig = {
  identification: 'property',
  taskTag: 'task',
  fieldName: 'kind',
  fieldValue: 'task'
}

describe('getTaskNotesConfig', () => {
  it('is null when TaskNotes is not installed', () => {
    expect(getTaskNotesConfig(makeApp())).toBeNull()
  })

  it('defaults to tag-based identification with the "task" tag', () => {
    expect(getTaskNotesConfig(makeApp({ plugin: {} }))).toEqual({
      identification: 'tag',
      taskTag: 'task',
      fieldName: '',
      fieldValue: ''
    })
  })

  it('reads a custom task tag from plugin settings', () => {
    const app = makeApp({ plugin: { settings: { taskTag: 'todo' } } })
    expect(getTaskNotesConfig(app)?.taskTag).toBe('todo')
  })

  it('reads property-based identification', () => {
    const app = makeApp({
      plugin: {
        settings: { taskIdentificationMethod: 'property', taskPropertyName: 'kind', taskPropertyValue: 'task' }
      }
    })
    expect(getTaskNotesConfig(app)).toEqual({
      identification: 'property',
      taskTag: 'task',
      fieldName: 'kind',
      fieldValue: 'task'
    })
  })
})

describe('hasTaskNotesMarker', () => {
  it('matches the task tag, ignoring a leading #', () => {
    expect(hasTaskNotesMarker({ tags: ['#task', 'work'] }, tagConfig)).toBe(true)
    expect(hasTaskNotesMarker({ tags: ['task'] }, tagConfig)).toBe(true)
  })

  it('is false without the tag or with no tags', () => {
    expect(hasTaskNotesMarker({ tags: ['work'] }, tagConfig)).toBe(false)
    expect(hasTaskNotesMarker({}, tagConfig)).toBe(false)
  })

  it('matches a property value in property mode', () => {
    expect(hasTaskNotesMarker({ kind: 'task' }, propConfig)).toBe(true)
    expect(hasTaskNotesMarker({ kind: 'note' }, propConfig)).toBe(false)
  })

  it('accepts any present value when the configured value is empty', () => {
    const config: TaskNotesConfig = { identification: 'property', taskTag: 'task', fieldName: 'kind', fieldValue: '' }
    expect(hasTaskNotesMarker({ kind: 'anything' }, config)).toBe(true)
    expect(hasTaskNotesMarker({}, config)).toBe(false)
  })
})

describe('stampTaskNotesMarker', () => {
  it('appends the task tag when absent', () => {
    const fm: Record<string, unknown> = { tags: ['work'] }
    stampTaskNotesMarker(fm, tagConfig)
    expect(fm.tags).toEqual(['work', 'task'])
  })

  it('seeds a tags array when there is none', () => {
    const fm: Record<string, unknown> = {}
    stampTaskNotesMarker(fm, tagConfig)
    expect(fm.tags).toEqual(['task'])
  })

  it('is idempotent — never duplicates the tag', () => {
    const fm: Record<string, unknown> = { tags: ['#task'] }
    stampTaskNotesMarker(fm, tagConfig)
    expect(fm.tags).toEqual(['#task'])
  })

  it('sets the property in property mode without overwriting an existing value', () => {
    const fresh: Record<string, unknown> = {}
    stampTaskNotesMarker(fresh, propConfig)
    expect(fresh.kind).toBe('task')

    const existing: Record<string, unknown> = { kind: 'note' }
    stampTaskNotesMarker(existing, propConfig)
    expect(existing.kind).toBe('note')
  })
})

describe('hasProjectAssociation', () => {
  it('is true with a non-empty projectId', () => {
    expect(hasProjectAssociation({ projectId: 'abc' })).toBe(true)
    expect(hasProjectAssociation({ projectId: '' })).toBe(false)
  })

  it('is true with a non-empty projects array', () => {
    expect(hasProjectAssociation({ projects: ['[[Refactoring]]'] })).toBe(true)
    expect(hasProjectAssociation({ projects: [] })).toBe(false)
  })

  it('is false with no linkage', () => {
    expect(hasProjectAssociation({ title: 'x' })).toBe(false)
  })
})

describe('isSharedTaskNote', () => {
  it('accepts a TaskNotes task linked to a project', () => {
    expect(isSharedTaskNote({ tags: ['task'], projectId: 'p1' }, tagConfig)).toBe(true)
  })

  it('leaves a TaskNotes inbox item (no project link) alone', () => {
    expect(isSharedTaskNote({ tags: ['task'] }, tagConfig)).toBe(false)
  })

  it('ignores a project-linked note without the TaskNotes marker', () => {
    expect(isSharedTaskNote({ projectId: 'p1' }, tagConfig)).toBe(false)
  })
})

describe('mergeProjectLink', () => {
  it('appends our link to an empty/absent value', () => {
    expect(mergeProjectLink(undefined, 'Refactoring')).toEqual(['[[Refactoring]]'])
    expect(mergeProjectLink([], 'Refactoring')).toEqual(['[[Refactoring]]'])
  })

  it('keeps foreign entries and appends ours', () => {
    expect(mergeProjectLink(['[[Other]]'], 'Refactoring')).toEqual(['[[Other]]', '[[Refactoring]]'])
  })

  it('does not duplicate our link, regardless of form', () => {
    expect(mergeProjectLink(['[[Refactoring]]'], 'Refactoring')).toEqual(['[[Refactoring]]'])
    expect(mergeProjectLink(['[[Refactoring|Obsidian-PM]]'], 'Refactoring')).toEqual(['[[Refactoring|Obsidian-PM]]'])
    expect(mergeProjectLink(['[[Refactoring#Tasks]]'], 'Refactoring')).toEqual(['[[Refactoring#Tasks]]'])
    expect(mergeProjectLink(['Refactoring'], 'Refactoring')).toEqual(['Refactoring'])
  })

  it('treats a non-array value as empty', () => {
    expect(mergeProjectLink('[[Refactoring]]', 'Refactoring')).toEqual(['[[Refactoring]]'])
  })

  it('drops non-string entries while preserving strings', () => {
    expect(mergeProjectLink(['[[Other]]', 42], 'Refactoring')).toEqual(['[[Other]]', '[[Refactoring]]'])
  })
})

describe('reconcileSharedField', () => {
  it('adopts the disk value when PM did not change the field', () => {
    // base = mem = 'low', TaskNotes wrote 'high' on disk
    expect(reconcileSharedField('priority', 'low', 'high', 'low')).toBe('high')
  })

  it('keeps PM value when PM changed the field (mem != base)', () => {
    expect(reconcileSharedField('priority', 'low', 'high', 'critical')).toBe('critical')
  })

  it('keeps PM value when disk is unchanged', () => {
    expect(reconcileSharedField('priority', 'low', 'low', 'low')).toBe('low')
  })

  it('keeps PM value when an enum field is absent on disk', () => {
    expect(reconcileSharedField('priority', 'low', undefined, 'low')).toBe('low')
  })

  it('keeps PM value when no base was captured', () => {
    expect(reconcileSharedField('priority', undefined, 'high', 'low')).toBe('low')
  })

  it('adopts a newly-set disk value over an unset PM field', () => {
    expect(reconcileSharedField('due', '', '2026-08-01', '')).toBe('2026-08-01')
  })

  it('adopts an unknown enum id verbatim (alignment owns vocabulary)', () => {
    expect(reconcileSharedField('status', 'todo', 'waiting', 'todo')).toBe('waiting')
  })

  it('keeps PM value when an enum is nulled on disk', () => {
    // A null status would blank a typed enum; keep PM's value instead.
    expect(reconcileSharedField('status', 'todo', null, 'todo')).toBe('todo')
  })

  it('clears a date field to "" when TaskNotes writes null', () => {
    expect(reconcileSharedField('due', '2026-08-01', null, '2026-08-01')).toBe('')
  })

  it('clears a date field to "" when TaskNotes deletes the key', () => {
    // Absence is the external edit — the cleared date must not be resurrected.
    expect(reconcileSharedField('due', '2026-08-01', undefined, '2026-08-01')).toBe('')
  })

  it('truncates a disk datetime to date-only for a date field', () => {
    expect(reconcileSharedField('due', '2026-07-10', '2026-07-11T09:00', '2026-07-10')).toBe('2026-07-11')
  })

  it('truncates a parsed Date to date-only for a date field', () => {
    const disk = new Date('2026-07-11T09:00:00Z')
    expect(reconcileSharedField('start', '2026-07-10', disk, '2026-07-10')).toBe('2026-07-11')
  })

  it('lets a PM date edit win even when TaskNotes deleted the key', () => {
    expect(reconcileSharedField('due', '2026-08-01', undefined, '2026-09-09')).toBe('2026-09-09')
  })
})
