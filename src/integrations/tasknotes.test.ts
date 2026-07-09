import type { App } from 'obsidian'
import { describe, expect, it } from 'vitest'
import {
  getTaskNotesConfig,
  hasProjectAssociation,
  hasTaskNotesMarker,
  isSharedTaskNote,
  isTaskNotesInstalled,
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
