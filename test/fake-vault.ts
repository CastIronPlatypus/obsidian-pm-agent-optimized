import type { App, TAbstractFile } from 'obsidian'
import { TFile, TFolder, normalizePath } from 'obsidian'
import { stringify as stringifyYaml } from 'yaml'
import { parseFrontmatter } from '../src/store/YamlParser'

/**
 * In-memory Obsidian vault for driving a real `ProjectStore` end to end.
 *
 * The stub-only vitest setup (see `test/obsidian-stub.ts`) covers the store's
 * unit seams but never its load→edit→save→reload orchestration — which is exactly
 * where the TaskNotes-interop correctness gaps lived (rename link breakage, the
 * time-shape 60× trap, the blockedBy/shared-field clobber). This fake implements
 * enough of `vault`, `metadataCache`, and `fileManager` that those round-trips run
 * against actual files, so each fixed bug becomes a permanent regression test.
 *
 * It is deliberately faithful on the two behaviours PM leans on:
 *  - `metadataCache` reparses a file's frontmatter on every write, so the store's
 *    cache fast paths are exercised the way they are in Obsidian.
 *  - `fileManager.renameFile` rewrites inbound `[[wikilink]]` references in every
 *    other file, the way Obsidian keeps backlinks (and TaskNotes' `projects[]` /
 *    `blockedBy` uids) alive across a rename.
 */

interface FakeEvent {
  name: string
  cb: (...args: unknown[]) => void
}

/** Helpers a test uses to seed files, simulate external edits, and read back disk state. */
export interface FakeDisk {
  /** Write a task/project file from a frontmatter object (+ optional body). No self-write marker. */
  seedFile(path: string, frontmatter: Record<string, unknown>, body?: string): TFile
  /** Write raw file content verbatim. */
  seedRaw(path: string, content: string): TFile
  /** Current on-disk content, or null if the file is gone. */
  read(path: string): string | null
  /** Current parsed frontmatter, or null. */
  frontmatter(path: string): Record<string, unknown> | null
  exists(path: string): boolean
  /** Every markdown file path currently in the vault, sorted. */
  list(): string[]
  /** Simulate another plugin editing a file's frontmatter in place (no PM self-write). */
  editFrontmatter(path: string, mutate: (fm: Record<string, unknown>) => void): void
  /** Register a fake TaskNotes plugin so `getTaskNotesConfig` resolves. */
  installTaskNotes(settings?: Record<string, unknown>): void
}

export interface FakeApp {
  app: App
  disk: FakeDisk
}

function baseName(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? path : path.slice(i + 1)
}

function parentPath(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

function splitName(name: string): { basename: string; extension: string } {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? { basename: name.slice(0, dot), extension: name.slice(dot + 1) } : { basename: name, extension: '' }
}

/** Serialize a frontmatter object + body back into `---\n…\n---\nbody` form. */
function serialize(frontmatter: Record<string, unknown> | null, body: string): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) return body
  return `---\n${stringifyYaml(frontmatter)}---\n${body}`
}

/** Rewrite `[[old]]`, `[[old|alias]]`, `[[old#sec]]` link openings to point at `next`. */
function rewriteWikilinks(content: string, old: string, next: string): string {
  const esc = old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return content.replace(new RegExp(`\\[\\[${esc}(?=[\\]|#])`, 'g'), `[[${next}`)
}

export function createFakeApp(): FakeApp {
  const byPath = new Map<string, TAbstractFile>()
  const fileContent = new Map<TFile, string>()
  const fileCache = new Map<TFile, Record<string, unknown> | null>()
  const listeners: FakeEvent[] = []
  const plugins = new Map<string, unknown>()

  const root = new TFolder()
  root.path = ''
  root.name = ''
  byPath.set('', root)

  function trigger(name: string, ...args: unknown[]): void {
    for (const l of listeners) if (l.name === name) l.cb(...args)
  }

  function ensureFolder(path: string): TFolder {
    const norm = normalizePath(path)
    if (norm === '') return root
    const existing = byPath.get(norm)
    if (existing instanceof TFolder) return existing
    const parent = ensureFolder(parentPath(norm))
    const folder = new TFolder()
    folder.path = norm
    folder.name = baseName(norm)
    folder.parent = parent
    parent.children.push(folder)
    byPath.set(norm, folder)
    return folder
  }

  function reindex(file: TFile): void {
    const { frontmatter } = parseFrontmatter(fileContent.get(file) ?? '')
    fileCache.set(file, frontmatter)
  }

  function writeFile(path: string, content: string): TFile {
    const norm = normalizePath(path)
    const existing = byPath.get(norm)
    if (existing instanceof TFile) {
      fileContent.set(existing, content)
      existing.stat.mtime = Date.now()
      existing.stat.size = content.length
      reindex(existing)
      return existing
    }
    const parent = ensureFolder(parentPath(norm))
    const file = new TFile()
    file.path = norm
    file.name = baseName(norm)
    const { basename, extension } = splitName(file.name)
    file.basename = basename
    file.extension = extension
    file.parent = parent
    file.stat = { ctime: Date.now(), mtime: Date.now(), size: content.length }
    parent.children.push(file)
    byPath.set(norm, file)
    fileContent.set(file, content)
    reindex(file)
    return file
  }

  function detach(entry: TAbstractFile): void {
    const parent = entry.parent
    if (parent) parent.children = parent.children.filter((c) => c !== entry)
    byPath.delete(entry.path)
  }

  /** Move a file or folder (recursively) to a new path, keeping object identity. */
  function moveEntry(entry: TAbstractFile, newPath: string): void {
    const norm = normalizePath(newPath)
    detach(entry)
    const parent = ensureFolder(parentPath(norm))
    entry.path = norm
    entry.name = baseName(norm)
    entry.parent = parent
    parent.children.push(entry)
    byPath.set(norm, entry)
    if (entry instanceof TFile) {
      const { basename, extension } = splitName(entry.name)
      entry.basename = basename
      entry.extension = extension
    } else if (entry instanceof TFolder) {
      for (const child of [...entry.children]) moveEntry(child, `${norm}/${child.name}`)
    }
  }

  function markdownFiles(): TFile[] {
    const out: TFile[] = []
    for (const f of byPath.values()) if (f instanceof TFile && f.extension === 'md') out.push(f)
    return out
  }

  function firstLinkpathDest(linkpath: string, sourcePath: string): TFile | null {
    const inner = linkpath.split('#')[0].split('|')[0].trim()
    if (!inner) return null
    const direct = byPath.get(normalizePath(inner))
    if (direct instanceof TFile) return direct
    const withExt = byPath.get(normalizePath(inner.endsWith('.md') ? inner : inner + '.md'))
    if (withExt instanceof TFile) return withExt
    const wanted = inner.replace(/\.md$/, '')
    const matches = markdownFiles().filter((f) => f.basename === wanted)
    if (matches.length === 0) return null
    const sameFolder = matches.find((f) => parentPath(f.path) === parentPath(sourcePath))
    return sameFolder ?? matches[0]
  }

  const vault = {
    getAbstractFileByPath(path: string): TAbstractFile | null {
      return byPath.get(normalizePath(path)) ?? null
    },
    getFileByPath(path: string): TFile | null {
      const f = byPath.get(normalizePath(path))
      return f instanceof TFile ? f : null
    },
    getMarkdownFiles(): TFile[] {
      return markdownFiles()
    },
    async cachedRead(file: TFile): Promise<string> {
      return fileContent.get(file) ?? ''
    },
    async read(file: TFile): Promise<string> {
      return fileContent.get(file) ?? ''
    },
    async process(file: TFile, fn: (content: string) => string): Promise<string> {
      const next = fn(fileContent.get(file) ?? '')
      writeFile(file.path, next)
      trigger('modify', file)
      trigger('changed', file)
      return next
    },
    async create(path: string, content: string): Promise<TFile> {
      const norm = normalizePath(path)
      if (byPath.get(norm) instanceof TFile) throw new Error(`File already exists: ${norm}`)
      const file = writeFile(norm, content)
      trigger('create', file)
      trigger('changed', file)
      return file
    },
    async createBinary(path: string, _data: ArrayBuffer): Promise<TFile> {
      const file = writeFile(path, '')
      trigger('create', file)
      return file
    },
    async createFolder(path: string): Promise<TFolder> {
      const norm = normalizePath(path)
      if (byPath.get(norm) instanceof TFolder) throw new Error(`Folder already exists: ${norm}`)
      return ensureFolder(norm)
    },
    async rename(entry: TAbstractFile, newPath: string): Promise<void> {
      const oldPath = entry.path
      moveEntry(entry, newPath)
      trigger('rename', entry, oldPath)
    },
    on(name: string, cb: (...args: unknown[]) => void): FakeEvent {
      const ev: FakeEvent = { name, cb }
      listeners.push(ev)
      return ev
    }
  }

  const fileManager = {
    async processFrontMatter(file: TFile, fn: (fm: Record<string, unknown>) => void): Promise<void> {
      const { frontmatter, body } = parseFrontmatter(fileContent.get(file) ?? '')
      const fm = frontmatter ?? {}
      fn(fm)
      writeFile(file.path, serialize(fm, body))
      trigger('modify', file)
      trigger('changed', file)
    },
    async renameFile(file: TFile, newPath: string): Promise<void> {
      const oldPath = file.path
      const oldBase = file.basename
      moveEntry(file, newPath)
      const newBase = file.basename
      if (oldBase !== newBase) {
        for (const other of markdownFiles()) {
          if (other === file) continue
          const content = fileContent.get(other) ?? ''
          const rewritten = rewriteWikilinks(content, oldBase, newBase)
          if (rewritten !== content) {
            writeFile(other.path, rewritten)
            trigger('modify', other)
            trigger('changed', other)
          }
        }
      }
      trigger('rename', file, oldPath)
    },
    async trashFile(entry: TAbstractFile): Promise<void> {
      if (entry instanceof TFolder) {
        for (const child of [...entry.children]) await fileManager.trashFile(child)
      }
      detach(entry)
      if (entry instanceof TFile) {
        fileContent.delete(entry)
        fileCache.delete(entry)
      }
      trigger('delete', entry)
    }
  }

  const metadataCache = {
    getFileCache(file: TFile): { frontmatter?: Record<string, unknown> } | null {
      if (!fileCache.has(file)) return null
      const fm = fileCache.get(file)
      return { frontmatter: fm ?? undefined }
    },
    getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null {
      return firstLinkpathDest(linkpath, sourcePath)
    },
    on(name: string, cb: (...args: unknown[]) => void): FakeEvent {
      const ev: FakeEvent = { name, cb }
      listeners.push(ev)
      return ev
    }
  }

  const app = {
    vault,
    fileManager,
    metadataCache,
    plugins: {
      getPlugin(id: string): unknown {
        return plugins.get(id) ?? null
      }
    }
  } as unknown as App

  const disk: FakeDisk = {
    seedFile(path, frontmatter, body = '') {
      const file = writeFile(path, serialize(frontmatter, body))
      trigger('create', file)
      trigger('changed', file)
      return file
    },
    seedRaw(path, content) {
      const file = writeFile(path, content)
      trigger('create', file)
      trigger('changed', file)
      return file
    },
    read(path) {
      const f = byPath.get(normalizePath(path))
      return f instanceof TFile ? (fileContent.get(f) ?? '') : null
    },
    frontmatter(path) {
      const f = byPath.get(normalizePath(path))
      if (!(f instanceof TFile)) return null
      return parseFrontmatter(fileContent.get(f) ?? '').frontmatter
    },
    exists(path) {
      return byPath.has(normalizePath(path))
    },
    list() {
      return markdownFiles()
        .map((f) => f.path)
        .sort()
    },
    editFrontmatter(path, mutate) {
      const f = byPath.get(normalizePath(path))
      if (!(f instanceof TFile)) throw new Error(`No such file: ${path}`)
      const { frontmatter, body } = parseFrontmatter(fileContent.get(f) ?? '')
      const fm = frontmatter ?? {}
      mutate(fm)
      writeFile(f.path, serialize(fm, body))
      trigger('modify', f)
      trigger('changed', f)
    },
    installTaskNotes(settings = { taskIdentificationMethod: 'tag', taskTag: 'task' }) {
      plugins.set('tasknotes', { settings })
    }
  }

  return { app, disk }
}
