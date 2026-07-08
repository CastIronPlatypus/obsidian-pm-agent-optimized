import type { App } from 'obsidian'
import { describe, expect, it } from 'vitest'
import { isTaskNotesInstalled, resolveTaskNotesRef } from './tasknotes'

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
