import type { App } from 'obsidian'
import { TFile } from 'obsidian'
import { describe, expect, it } from 'vitest'
import { makeFakeApp, type FakeVault } from '../../test/fakeVault'
import { DEFAULT_SETTINGS, type PMSettings } from '../types'
import { ProjectStore } from './ProjectStore'
import { parseFrontmatter } from './YamlParser'

const SETTINGS: PMSettings = { ...DEFAULT_SETTINGS }

function newStore(): { store: ProjectStore; vault: FakeVault; app: App } {
  const { app, vault } = makeFakeApp()
  const store = new ProjectStore(app as unknown as App, () => SETTINGS)
  return { store, vault, app: app as unknown as App }
}

function fileAt(vault: FakeVault, path: string): TFile {
  const f = vault.getAbstractFileByPath(path)
  if (!(f instanceof TFile)) throw new Error(`expected a file at ${path}`)
  return f
}

async function frontmatterOf(vault: FakeVault, path: string): Promise<Record<string, unknown>> {
  const content = await vault.cachedRead(fileAt(vault, path))
  return parseFrontmatter(content).frontmatter ?? {}
}

describe('per-project directories — path frontmatter', () => {
  it('persists the create directory as `path`, including nested category folders', async () => {
    const { store, vault } = newStore()
    const project = await store.createProject('Q3 Launch', 'Projects/Income/2026')
    const fm = await frontmatterOf(vault, project.filePath)
    expect(fm.path).toBe('Projects/Income/2026')
    expect(project.filePath).toBe('Projects/Income/2026/Q3 Launch.md')
    // Task folder is co-located under the same directory.
    expect(vault.getAbstractFileByPath('Projects/Income/2026/Q3 Launch_tasks')).not.toBeNull()
  })

  it('reload preserves `path` through the YAML round-trip', async () => {
    const { store, vault, app } = newStore()
    const created = await store.createProject('Rollout', 'Clients/Acme')
    const store2 = new ProjectStore(app, () => SETTINGS)
    const reloaded = await store2.loadProject(fileAt(vault, created.filePath))
    expect(reloaded?.path).toBe('Clients/Acme')
  })
})

describe('per-project directories — projectDirectory resolution', () => {
  it('returns the declared `path` when present', async () => {
    const { store } = newStore()
    const project = await store.createProject('Ops', 'Areas/Ops')
    expect(store.projectDirectory(project)).toBe('Areas/Ops')
  })

  it('falls back to the file parent folder when `path` is absent (legacy)', async () => {
    const { store, vault } = newStore()
    await vault.create(
      'Projects/Legacy.md',
      ['---', 'pm-project: true', 'id: legacy-1', 'title: Legacy', 'taskIds: []', '---', '', 'body'].join('\n')
    )
    const project = await store.loadProject(fileAt(vault, 'Projects/Legacy.md'))
    expect(project).not.toBeNull()
    if (!project) return
    expect(project.path).toBeUndefined()
    expect(store.projectDirectory(project)).toBe('Projects')
  })

  it('falls back for a blank `path` string too', async () => {
    const { store, vault } = newStore()
    await vault.create(
      'Nested/Here/Blank.md',
      ['---', 'pm-project: true', 'id: blank-1', 'title: Blank', 'path: ""', 'taskIds: []', '---', ''].join('\n')
    )
    const project = await store.loadProject(fileAt(vault, 'Nested/Here/Blank.md'))
    expect(project).not.toBeNull()
    if (!project) return
    expect(store.projectDirectory(project)).toBe('Nested/Here')
  })
})

describe('per-project directories — vault-wide discovery', () => {
  it('finds projects anywhere in the vault, not just the default folder', async () => {
    const { store } = newStore()
    await store.createProject('In Default', 'Projects')
    await store.createProject('Off Grid', 'Random/Deep/Place')

    const found = await store.discoverProjects()
    const paths = found.map((p) => p.filePath)
    expect(paths).toContain('Projects/In Default.md')
    expect(paths).toContain('Random/Deep/Place/Off Grid.md')
  })

  it('discovers two same-named projects in different folders as distinct entries', async () => {
    const { store } = newStore()
    await store.createProject('Roadmap', 'Areas/Income')
    await store.createProject('Roadmap', 'Areas/Community')

    const found = await store.discoverProjects()
    const roadmaps = found.filter((p) => p.title === 'Roadmap')
    expect(roadmaps.map((p) => p.filePath).sort()).toEqual(['Areas/Community/Roadmap.md', 'Areas/Income/Roadmap.md'])
    expect(roadmaps.map((p) => store.projectDirectory(p)).sort()).toEqual(['Areas/Community', 'Areas/Income'])
  })

  it('ignores non-project markdown files', async () => {
    const { store, vault } = newStore()
    await store.createProject('Real', 'Projects')
    await vault.create('Notes/Plain.md', ['---', 'title: just a note', '---', '', 'nothing here'].join('\n'))
    await vault.create('Notes/Task.md', ['---', 'pm-task: true', 'title: loose task', '---', ''].join('\n'))

    const found = await store.discoverProjects()
    expect(found.map((p) => p.filePath)).toEqual(['Projects/Real.md'])
  })

  it('loadAllProjects delegates to vault-wide discovery', async () => {
    const { store } = newStore()
    await store.createProject('Anywhere', 'Somewhere/Else')
    const found = await store.loadAllProjects('Projects')
    expect(found.some((p) => p.filePath === 'Somewhere/Else/Anywhere.md')).toBe(true)
  })
})
