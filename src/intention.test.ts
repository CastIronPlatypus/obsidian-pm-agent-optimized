// @vitest-environment happy-dom
//
// INTENTION TEST — the RED win condition for the four features below.
//
// This file is the executable contract for a build->test->debug loop. It is
// authored BEFORE the features exist, so it MUST run to completion and fail on
// ASSERTIONS (or clean feature-detection), never on compile errors or
// import-of-nonexistent-symbol crashes. New store surfaces are probed as
// optional methods (feature-detected with `toBeTypeOf('function')` before any
// call); the calendar primitive is loaded through a runtime dynamic import so a
// missing module fails an assertion rather than crashing collection.
//
// Features under test (each a `describe`, each requirement an `it` "R<n>: ..."):
//   1. External ingestion  — pm-task files created manually/by-AI are detected,
//      backfilled on disk, and wired into project/parent ordering. (R1–R7)
//   2. Per-project dirs     — projects carry a `path` frontmatter directory;
//      discovery scans the vault; legacy projects keep working. (R8–R11)
//   3. Bi-directional renames — vault<->plugin renames stay in sync, no echo
//      loops, task folders tracked. (R12–R15)
//   4. Calendar date picker — a Sun–Sat grid primitive, plugin CSS classes
//      only, emitting YYYY-MM-DD strings, cataloged in the styleguide. (R16–R21)

import type { App, TAbstractFile } from 'obsidian'
import { TFile, TFolder } from 'obsidian'
import { beforeAll, describe, expect, it } from 'vitest'
import { FakeVault, makeFakeApp } from '../test/fakeVault'
import { findTask, parseFrontmatter, ProjectStore } from './store'
import { DEFAULT_SETTINGS, makeTask, type PMSettings, type Project, type Task } from './types'

// ─── Harness ──────────────────────────────────────────────────────────────

const SETTINGS: PMSettings = { ...DEFAULT_SETTINGS }

// `window.document` (there is no Obsidian workspace/activeDocument in the vitest
// happy-dom environment).
const doc: Document = window.document

/** New store surfaces the four features are expected to add. Probed, not imported. */
interface StoreProbe {
  ingestExternalTask?: (project: Project, file: TFile) => Promise<Task | null>
  discoverProjects?: () => Promise<Project[]>
  projectDirectory?: (project: Project) => string
  moveProject?: (project: Project, newDir: string) => Promise<void>
  renameProject?: (project: Project, newTitle: string) => Promise<void>
  handleExternalRename?: (oldPath: string, file: TFile) => Promise<void>
}

function newStore(): { store: ProjectStore; vault: FakeVault; app: App } {
  const { app, vault } = makeFakeApp()
  const store = new ProjectStore(app as unknown as App, () => SETTINGS)
  return { store, vault, app: app as unknown as App }
}

function probe(store: ProjectStore): StoreProbe {
  return store
}

function fileAt(vault: FakeVault, path: string): TFile {
  const f: TAbstractFile | null = vault.getAbstractFileByPath(path)
  if (!(f instanceof TFile)) throw new Error(`expected a file at ${path}`)
  return f
}

async function frontmatterOf(vault: FakeVault, path: string): Promise<Record<string, unknown>> {
  const content = await vault.cachedRead(fileAt(vault, path))
  return parseFrontmatter(content).frontmatter ?? {}
}

function taskFileBody(lines: string[]): string {
  return lines.join('\n')
}

// ─── Feature 1 — external task ingestion (O1, O2, M1) ───────────────────────

describe('Feature 1 — external task ingestion', () => {
  it('R1: external task file detected', async () => {
    // negative-control: a plain note with no `pm-task: true` must NOT be ingested (see R6).
    const { store, vault } = newStore()
    const project = await store.createProject('Inbox', 'Projects')
    const path = 'Projects/Inbox_tasks/manual-add.md'
    await vault.create(path, taskFileBody(['---', 'pm-task: true', 'title: Manually added task', '---', '', 'A body.']))
    const file = fileAt(vault, path)

    const ingest = probe(store).ingestExternalTask
    expect(ingest, 'ProjectStore.ingestExternalTask(project, file) must exist').toBeTypeOf('function')
    if (!ingest) return
    const task = await ingest.call(store, project, file)
    expect(task).not.toBeNull()
  })

  it('R2: ingested task appears in-tree', async () => {
    // negative-control: ingest that returns a task but never adds it to project.tasks.
    const { store, vault } = newStore()
    const project = await store.createProject('Inbox', 'Projects')
    const path = 'Projects/Inbox_tasks/appears.md'
    await vault.create(path, taskFileBody(['---', 'pm-task: true', 'title: Shows up', '---', '', 'body']))

    const ingest = probe(store).ingestExternalTask
    expect(ingest).toBeTypeOf('function')
    if (!ingest) return
    const task = await ingest.call(store, project, fileAt(vault, path))
    expect(task).not.toBeNull()
    if (!task) return
    expect(findTask(project.tasks, task.id)).toBeDefined()
  })

  it('R3: missing id backfilled on disk', async () => {
    // negative-control: a file whose `id` stays blank/absent after ingestion.
    const { store, vault } = newStore()
    const project = await store.createProject('Inbox', 'Projects')
    const path = 'Projects/Inbox_tasks/no-id.md'
    // No `id` key at all — the store must backfill and persist one.
    await vault.create(path, taskFileBody(['---', 'pm-task: true', 'title: Needs an id', '---', '', 'body']))

    const ingest = probe(store).ingestExternalTask
    expect(ingest).toBeTypeOf('function')
    if (!ingest) return
    await ingest.call(store, project, fileAt(vault, path))

    // Forensic: the on-disk frontmatter now carries a non-empty id.
    const fm = await frontmatterOf(vault, path)
    const id = fm.id
    expect(typeof id).toBe('string')
    expect(typeof id === 'string' ? id.length : 0).toBeGreaterThan(0)
  })

  it('R4: blank fields get defaults', async () => {
    // negative-control: blank `status:`/`priority:` left as null/'' instead of defaults.
    const { store, vault } = newStore()
    const project = await store.createProject('Inbox', 'Projects')
    const path = 'Projects/Inbox_tasks/blanks.md'
    await vault.create(
      path,
      taskFileBody(['---', 'pm-task: true', 'title: Blank fields', 'status:', 'priority:', '---', '', 'body'])
    )

    const ingest = probe(store).ingestExternalTask
    expect(ingest).toBeTypeOf('function')
    if (!ingest) return
    const task = await ingest.call(store, project, fileAt(vault, path))
    expect(task).not.toBeNull()
    if (!task) return
    // makeTask defaults: status 'todo', priority 'medium'.
    expect(task.status).toBe('todo')
    expect(task.priority).toBe('medium')
  })

  it('R5: task wired into ordering ids', async () => {
    // negative-control: task ingested but its id never added to the project's taskIds.
    const { store, vault } = newStore()
    const project = await store.createProject('Inbox', 'Projects')
    const path = 'Projects/Inbox_tasks/ordered.md'
    await vault.create(path, taskFileBody(['---', 'pm-task: true', 'title: Ordered', '---', '', 'body']))

    const ingest = probe(store).ingestExternalTask
    expect(ingest).toBeTypeOf('function')
    if (!ingest) return
    const task = await ingest.call(store, project, fileAt(vault, path))
    expect(task).not.toBeNull()
    if (!task) return

    // Forensic: the project file's persisted taskIds include the new id.
    const fm = await frontmatterOf(vault, project.filePath)
    const taskIds = Array.isArray(fm.taskIds) ? (fm.taskIds as unknown[]).map(String) : []
    expect(taskIds).toContain(task.id)
  })

  it('R6: malformed frontmatter file ignored', async () => {
    // negative-control (this IS the negative branch): a non-pm-task note must be
    // ignored — ingest returns null, the tree is untouched, and nothing throws.
    const { store, vault } = newStore()
    const project = await store.createProject('Inbox', 'Projects')
    const before = project.tasks.length
    const path = 'Projects/Inbox_tasks/not-a-task.md'
    await vault.create(path, taskFileBody(['---', 'title: Just a note', '---', '', 'not a pm task']))

    const ingest = probe(store).ingestExternalTask
    expect(ingest).toBeTypeOf('function')
    if (!ingest) return
    const task = await ingest.call(store, project, fileAt(vault, path))
    expect(task).toBeNull()
    expect(project.tasks.length).toBe(before)
  })

  it('R7: self-writes skip re-ingestion', async () => {
    // negative-control: backfill write NOT self-marked -> the modify event re-ingests (echo).
    const { store, vault } = newStore()
    const project = await store.createProject('Inbox', 'Projects')
    const path = 'Projects/Inbox_tasks/selfmark.md'
    await vault.create(path, taskFileBody(['---', 'pm-task: true', 'title: Self mark', '---', '', 'body']))

    const ingest = probe(store).ingestExternalTask
    expect(ingest).toBeTypeOf('function')
    if (!ingest) return
    await ingest.call(store, project, fileAt(vault, path))
    // The backfill write must be self-marked so the resulting modify event is skipped.
    expect(store.consumeSelfWrite(path)).toBe(true)
  })
})

// ─── Feature 2 — per-project directories (O3, M2) ───────────────────────────

describe('Feature 2 — per-project directories', () => {
  it('R8: project path frontmatter field', async () => {
    // negative-control: project file omits `path`, so an AI agent cannot learn its directory.
    // Pinned contract: frontmatter key `path` = vault-relative directory containing the project file.
    const { store, vault } = newStore()
    const project = await store.createProject('Ops Board', 'Areas/Ops')
    const fm = await frontmatterOf(vault, project.filePath)
    expect(fm.path).toBe('Areas/Ops')
  })

  it('R9: discovery scans vault-wide', async () => {
    // negative-control: a project file outside the configured folder is never found.
    const { store, vault } = newStore()
    const path = 'Random/Place/Wandering.md'
    await vault.create(
      path,
      taskFileBody(['---', 'pm-project: true', 'id: wander-1', 'title: Wandering', 'taskIds: []', '---', '', 'body'])
    )

    const discover = probe(store).discoverProjects
    expect(discover, 'ProjectStore.discoverProjects() must exist').toBeTypeOf('function')
    if (!discover) return
    const found = await discover.call(store)
    expect(found.some((p) => p.filePath === path)).toBe(true)
  })

  it('R10: create-project accepts custom path', async () => {
    // negative-control: createProject ignores the directory and dumps into the global folder.
    const { store, vault } = newStore()
    const dir = 'Clients/Acme'
    const project = await store.createProject('Acme Rollout', dir)
    // Files are co-located under the custom directory.
    expect(vault.getAbstractFileByPath(`${dir}/Acme Rollout_tasks`)).toBeInstanceOf(TFolder)

    const directoryOf = probe(store).projectDirectory
    expect(directoryOf, 'ProjectStore.projectDirectory(project) must exist').toBeTypeOf('function')
    if (!directoryOf) return
    expect(directoryOf.call(store, project)).toBe(dir)
  })

  it('R11: existing projects keep working', async () => {
    // negative-control: legacy project (no `path` key) fails to load or falls back to the wrong dir.
    const { store, vault } = newStore()
    await vault.create(
      'Projects/Legacy One.md',
      taskFileBody(['---', 'pm-project: true', 'id: legacy-1', 'title: Legacy One', 'taskIds: []', '---', '', 'body'])
    )
    const project = await store.loadProject(fileAt(vault, 'Projects/Legacy One.md'))
    expect(project).not.toBeNull()
    if (!project) return
    // Regression: a legacy project still loads.
    expect(project.title).toBe('Legacy One')

    // Contract fallback: absent `path` resolves to the file's actual parent folder.
    const directoryOf = probe(store).projectDirectory
    expect(directoryOf).toBeTypeOf('function')
    if (!directoryOf) return
    expect(directoryOf.call(store, project)).toBe('Projects')
  })

  it('R26: moving an existing project relocates its file and tasks folder', async () => {
    // negative-control: the `path` field changes but the project file / tasks
    // folder stay at the old location, orphaning the tasks.
    // Completeness of INT-014: the existing-project settings surface must be able
    // to re-point a project's folder; on save the WHOLE project folder moves.
    const { store, vault } = newStore()
    const created = await store.createProject('Relocatable', 'Projects')
    const project = await store.loadProject(fileAt(vault, created.filePath))
    expect(project).not.toBeNull()
    if (!project) return
    await store.insertTask(project, makeTask({ title: 'attached' }))

    const move = probe(store).moveProject
    expect(move, 'ProjectStore.moveProject(project, newDir) must exist').toBeTypeOf('function')
    if (!move) return
    await move.call(store, project, 'Areas/Portfolio')

    // Forensic: the project file + its `<Name>_tasks` folder now live under the
    // new directory, and nothing remains at the old location.
    expect(vault.getAbstractFileByPath('Areas/Portfolio/Relocatable.md')).toBeInstanceOf(TFile)
    expect(vault.getAbstractFileByPath('Areas/Portfolio/Relocatable_tasks')).toBeInstanceOf(TFolder)
    expect(vault.getAbstractFileByPath('Projects/Relocatable.md')).toBeNull()
    expect(vault.getAbstractFileByPath('Projects/Relocatable_tasks')).toBeNull()

    // The task file moved with the folder (not orphaned at the old path).
    const movedTaskPath = project.tasks[0]?.filePath ?? ''
    expect(movedTaskPath.startsWith('Areas/Portfolio/Relocatable_tasks/')).toBe(true)
    expect(vault.getAbstractFileByPath(movedTaskPath)).toBeInstanceOf(TFile)

    // The persisted `path` frontmatter + resolved directory both track the new dir.
    const fm = await frontmatterOf(vault, project.filePath)
    expect(fm.path).toBe('Areas/Portfolio')
    const directoryOf = probe(store).projectDirectory
    expect(directoryOf).toBeTypeOf('function')
    if (!directoryOf) return
    expect(directoryOf.call(store, project)).toBe('Areas/Portfolio')
  })

  it('R27: moving a project into a directory with spaces is handled literally', async () => {
    // negative-control: spaces truncate the path or split it into the wrong
    // directory, so the files are not discoverable at the intended location.
    const { store, vault } = newStore()
    const created = await store.createProject('Quarterly Plan', 'Projects')
    const project = await store.loadProject(fileAt(vault, created.filePath))
    expect(project).not.toBeNull()
    if (!project) return
    await store.insertTask(project, makeTask({ title: 'line item' }))

    const move = probe(store).moveProject
    expect(move, 'ProjectStore.moveProject(project, newDir) must exist').toBeTypeOf('function')
    if (!move) return
    const spacedDir = 'Areas/Income Projects'
    await move.call(store, project, spacedDir)

    // Files land at the LITERAL spaced path (no truncation, no wrong split) and
    // stay discoverable there; nothing is left behind at the old location.
    expect(vault.getAbstractFileByPath(`${spacedDir}/Quarterly Plan.md`)).toBeInstanceOf(TFile)
    expect(vault.getAbstractFileByPath(`${spacedDir}/Quarterly Plan_tasks`)).toBeInstanceOf(TFolder)
    expect(vault.getAbstractFileByPath('Projects/Quarterly Plan.md')).toBeNull()

    const movedTaskPath = project.tasks[0]?.filePath ?? ''
    expect(movedTaskPath.startsWith(`${spacedDir}/Quarterly Plan_tasks/`)).toBe(true)

    const fm = await frontmatterOf(vault, project.filePath)
    expect(fm.path).toBe(spacedDir)
    expect(project.filePath).toBe(`${spacedDir}/Quarterly Plan.md`)
  })
})

// ─── Feature 3 — bi-directional renames (O4, M3) ────────────────────────────

describe('Feature 3 — bi-directional renames', () => {
  it('R12: vault rename updates item name', async () => {
    // negative-control: external rename leaves the in-memory project title stale.
    const { store, vault } = newStore()
    const created = await store.createProject('Alpha', 'Projects')
    const project = await store.loadProject(fileAt(vault, created.filePath))
    expect(project).not.toBeNull()
    if (!project) return

    const oldPath = project.filePath
    await vault.rename(fileAt(vault, oldPath), 'Projects/Beta.md')

    const handle = probe(store).handleExternalRename
    expect(handle, 'ProjectStore.handleExternalRename(oldPath, file) must exist').toBeTypeOf('function')
    if (!handle) return
    await handle.call(store, oldPath, fileAt(vault, 'Projects/Beta.md'))
    expect(project.title).toBe('Beta')
  })

  it('R13: plugin rename moves file/folder', async () => {
    // negative-control: plugin rename updates memory but leaves the file at its old path.
    const { store, vault } = newStore()
    const created = await store.createProject('Gamma', 'Projects')
    const project = await store.loadProject(fileAt(vault, created.filePath))
    expect(project).not.toBeNull()
    if (!project) return
    await store.insertTask(project, makeTask({ title: 'child' }))

    const rename = probe(store).renameProject
    expect(rename, 'ProjectStore.renameProject(project, newTitle) must exist').toBeTypeOf('function')
    if (!rename) return
    await rename.call(store, project, 'Delta')

    // Forensic: the .md and its _tasks folder now live at the new path; the old ones are gone.
    expect(vault.getAbstractFileByPath('Projects/Delta.md')).toBeInstanceOf(TFile)
    expect(vault.getAbstractFileByPath('Projects/Gamma.md')).toBeNull()
    expect(vault.getAbstractFileByPath('Projects/Delta_tasks')).toBeInstanceOf(TFolder)
  })

  it('R14: rename echo loop prevented', async () => {
    // negative-control: plugin rename writes without self-marking -> the vault rename event re-renames (echo).
    const { store, vault } = newStore()
    const created = await store.createProject('Iota', 'Projects')
    const project = await store.loadProject(fileAt(vault, created.filePath))
    expect(project).not.toBeNull()
    if (!project) return

    const rename = probe(store).renameProject
    expect(rename).toBeTypeOf('function')
    if (!rename) return
    await rename.call(store, project, 'Kappa')

    // Both new and old paths are self-marked so the rename event is ignored (no echo).
    expect(store.consumeSelfWrite('Projects/Kappa.md')).toBe(true)
    expect(store.consumeSelfWrite('Projects/Iota.md')).toBe(true)
  })

  it('R15: task folder rename tracked', async () => {
    // negative-control: after a project-file rename the tasks are orphaned or still point at the old folder.
    const { store, vault } = newStore()
    const created = await store.createProject('Eta', 'Projects')
    const project = await store.loadProject(fileAt(vault, created.filePath))
    expect(project).not.toBeNull()
    if (!project) return
    await store.insertTask(project, makeTask({ title: 'attached' }))

    await vault.rename(fileAt(vault, 'Projects/Eta.md'), 'Projects/Theta.md')

    const handle = probe(store).handleExternalRename
    expect(handle).toBeTypeOf('function')
    if (!handle) return
    await handle.call(store, 'Projects/Eta.md', fileAt(vault, 'Projects/Theta.md'))

    expect(project.tasks.length).toBe(1)
    const fp = project.tasks[0]?.filePath ?? ''
    expect(fp.startsWith('Projects/Theta_tasks/')).toBe(true)
  })
})

// ─── Feature 4 — custom calendar date picker (O5, M4) ────────────────────────

interface CalendarPickerLike {
  el: HTMLElement
  setValue: (dateStr: string) => unknown
  onChange: (cb: (dateStr: string) => void) => unknown
}

// Pinned CSS class contract (plugin classes only — never an OS/browser picker):
const CLS = {
  weekday: 'pm-calendar-picker__weekday',
  day: 'pm-calendar-picker__day',
  prev: 'pm-calendar-picker__prev',
  next: 'pm-calendar-picker__next',
  title: 'pm-calendar-picker__title'
}

/**
 * Minimal polyfill of the Obsidian HTMLElement DOM extensions the primitives
 * rely on (createEl/createDiv/setText/toggleClass/...). happy-dom supplies the
 * base DOM; Obsidian's chained helpers are patched here so the primitive can be
 * instantiated in-process. Idempotent.
 */
function patchObsidianDom(): void {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown> & { __pmPatched?: boolean }
  if (proto.__pmPatched) return
  proto.__pmPatched = true
  const applyOpts = (
    el: HTMLElement,
    o?: { cls?: string | string[]; text?: string; attr?: Record<string, string | number | boolean> }
  ): void => {
    if (!o) return
    if (o.cls) {
      const classes = Array.isArray(o.cls) ? o.cls : o.cls.split(/\s+/).filter(Boolean)
      el.classList.add(...classes)
    }
    if (o.text != null) el.textContent = o.text
    if (o.attr) for (const [k, v] of Object.entries(o.attr)) if (v != null) el.setAttribute(k, String(v))
  }
  function createEl(
    this: HTMLElement,
    tag: string,
    o?: { cls?: string | string[]; text?: string; attr?: Record<string, string | number | boolean> }
  ): HTMLElement {
    const child = doc.createElement(tag)
    applyOpts(child, o)
    this.appendChild(child)
    return child
  }
  proto.createEl = createEl
  proto.createDiv = function (this: HTMLElement, o?: { cls?: string | string[]; text?: string }): HTMLElement {
    return createEl.call(this, 'div', o)
  }
  proto.createSpan = function (this: HTMLElement, o?: { cls?: string | string[]; text?: string }): HTMLElement {
    return createEl.call(this, 'span', o)
  }
  proto.setText = function (this: HTMLElement, t: string): HTMLElement {
    this.textContent = t
    return this
  }
  proto.setAttr = function (this: HTMLElement, k: string, v: string | number | boolean | null): HTMLElement {
    if (v === null) this.removeAttribute(k)
    else this.setAttribute(k, String(v))
    return this
  }
  proto.addClass = function (this: HTMLElement, ...c: string[]): HTMLElement {
    this.classList.add(...c)
    return this
  }
  proto.removeClass = function (this: HTMLElement, ...c: string[]): HTMLElement {
    this.classList.remove(...c)
    return this
  }
  proto.toggleClass = function (this: HTMLElement, c: string | string[], on?: boolean): HTMLElement {
    for (const x of Array.isArray(c) ? c : [c]) this.classList.toggle(x, on)
    return this
  }
  proto.empty = function (this: HTMLElement): HTMLElement {
    while (this.firstChild) this.removeChild(this.firstChild)
    return this
  }
}

let CalendarPickerCtor: (new (parentEl: HTMLElement) => CalendarPickerLike) | undefined
// Source text of files that must exist / carry markers once the feature ships.
// Loaded via Vite `?raw` so the intention test needs no Node `fs` (unavailable in
// the `src/**` tsconfig scope).
let calendarSrc: string | undefined
let styleguideDoc: string | undefined
let styleguideView: string | undefined

// Runtime dynamic import: targets do not all exist until the feature is built, so
// a missing module resolves to `undefined` (a failed assertion below) rather than
// crashing collection. @vite-ignore keeps Vite from static-analyzing the paths.
async function importRaw(path: string): Promise<string | undefined> {
  try {
    // eslint-disable-next-line no-unsanitized/method -- fixed test-local path; runtime feature-detection seam
    const mod = (await import(/* @vite-ignore */ path)) as { default: string }
    return mod.default
  } catch {
    return undefined
  }
}

beforeAll(async () => {
  patchObsidianDom()
  // Variable specifier (not a literal) so tsc treats a not-yet-built module as
  // `Promise<any>` instead of an unresolved-module compile error.
  const calendarModule = './ui/primitives/CalendarPicker'
  try {
    // eslint-disable-next-line no-unsanitized/method -- fixed test-local path; runtime feature-detection seam
    const mod = (await import(/* @vite-ignore */ calendarModule)) as {
      CalendarPicker?: new (parentEl: HTMLElement) => CalendarPickerLike
    }
    CalendarPickerCtor = mod.CalendarPicker
  } catch {
    CalendarPickerCtor = undefined
  }
  calendarSrc = await importRaw('./ui/primitives/CalendarPicker.ts?raw')
  styleguideDoc = await importRaw('../docs/styleguide.md?raw')
  styleguideView = await importRaw('./views/styleguide/StyleguideView.ts?raw')
})

function mountPicker(): CalendarPickerLike {
  const root = doc.createElement('div')
  doc.body.appendChild(root)
  if (!CalendarPickerCtor) throw new Error('CalendarPicker unavailable')
  return new CalendarPickerCtor(root)
}

describe('Feature 4 — custom calendar date picker', () => {
  it('R16: calendar grid Sun-Sat rendered', () => {
    // negative-control: a Mon-first header (or any order other than Sun..Sat) must fail.
    // Pinned contract: weekday header row is exactly Sun,Mon,Tue,Wed,Thu,Fri,Sat.
    expect(CalendarPickerCtor, 'src/ui/primitives/CalendarPicker.ts must export class CalendarPicker').toBeTypeOf(
      'function'
    )
    if (!CalendarPickerCtor) return
    const picker = mountPicker()
    picker.setValue('2026-07-16')
    const heads = Array.from(picker.el.querySelectorAll<HTMLElement>(`.${CLS.weekday}`)).map((e) =>
      (e.textContent ?? '').trim()
    )
    expect(heads).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  })

  it('R17: prev/next month navigation', () => {
    // negative-control: prev/next buttons that leave the displayed month label unchanged.
    expect(CalendarPickerCtor).toBeTypeOf('function')
    if (!CalendarPickerCtor) return
    const picker = mountPicker()
    picker.setValue('2026-07-16')
    const title = (): string => (picker.el.querySelector(`.${CLS.title}`)?.textContent ?? '').trim()
    const before = title()

    const next = picker.el.querySelector<HTMLElement>(`.${CLS.next}`)
    expect(next, 'expected a next-month button').toBeTruthy()
    if (!next) return
    next.click()
    expect(title()).not.toBe(before)

    const prev = picker.el.querySelector<HTMLElement>(`.${CLS.prev}`)
    expect(prev, 'expected a prev-month button').toBeTruthy()
    if (!prev) return
    prev.click()
    expect(title()).toBe(before)
  })

  it('R18: picking day sets date', () => {
    // negative-control: onChange payload like '2026-7-20' or a Date object (not the pinned string shape).
    // Pinned contract: onChange receives a string matching ^\d{4}-\d{2}-\d{2}$ equal to the clicked day.
    expect(CalendarPickerCtor).toBeTypeOf('function')
    if (!CalendarPickerCtor) return
    const picker = mountPicker()
    let received: string | undefined
    picker.onChange((d) => {
      received = d
    })
    picker.setValue('2026-07-16')

    const cells = Array.from(picker.el.querySelectorAll<HTMLElement>(`.${CLS.day}`))
    const cell = cells.find(
      (c) => (c.textContent ?? '').trim() === '20' && !/adjacent|other|outside|muted/.test(c.className)
    )
    expect(cell, 'expected a clickable day cell for the 20th of the displayed month').toBeTruthy()
    if (!cell) return
    cell.click()

    expect(received).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(received).toBe('2026-07-20')
  })

  it('R19: plugin CSS classes only', () => {
    // negative-control: a source line like `el.style.left = '0'` (inline style) must fail.
    expect(calendarSrc, 'src/ui/primitives/CalendarPicker.ts must exist').toBeTypeOf('string')
    if (!calendarSrc) return
    expect(calendarSrc).not.toMatch(/\.style\s*[.[]/)
  })

  it('R20: styleguide catalog updated', () => {
    // negative-control: primitive shipped but never cataloged in the styleguide doc or gallery view.
    expect(styleguideDoc, 'docs/styleguide.md must be readable').toBeTypeOf('string')
    expect(styleguideView, 'src/views/styleguide/StyleguideView.ts must be readable').toBeTypeOf('string')
    if (!styleguideDoc || !styleguideView) return
    expect(styleguideDoc).toContain('CalendarPicker')
    expect(styleguideView).toContain('CalendarPicker')
  })

  // R21 (dates stay YYYY-MM-DD strings) is UNTESTED by design: it is already
  // proven by R18's pinned ^\d{4}-\d{2}-\d{2}$ onChange contract. See worksheet R18/R21.
  it.skip('R21: dates stay YYYY-MM-DD strings', () => {})
})

// ─── Feature 5 — self-describing status palettes (INT-017, O6, M5) ───────────
//
// Project markdown must self-describe its legal status/priority vocabulary so an
// AI reading only the file knows the allowed values. On every project save the
// store materializes the RESOLVED palette (statuses + priorities via the
// configFor fallback chain) into the project frontmatter `config.statuses` /
// `config.priorities`, tagged `config.materialized: true`. That marker is the
// round-trip-safety mechanic: a materialized block is informational (the
// resolver ignores it and re-derives from the global palette, so later global
// edits re-propagate), while a genuine user override (no `materialized: true`)
// still wins through configFor unchanged. Ingestion validates an incoming
// status/priority against the effective palette: blank → default (R4),
// case-mismatch of a known id → canonical id, unknown value → preserved.

/** Ids of the objects in `config.<key>` on a project's on-disk frontmatter. */
function paletteIds(fm: Record<string, unknown>, key: 'statuses' | 'priorities'): string[] {
  const cfg = fm.config as Record<string, unknown> | undefined
  const list = cfg?.[key]
  return Array.isArray(list) ? list.map((e) => String((e as { id?: unknown }).id)) : []
}

/** The `config.materialized` marker on a project's on-disk frontmatter, if any. */
function materializedFlag(fm: Record<string, unknown>): unknown {
  return (fm.config as Record<string, unknown> | undefined)?.materialized
}

describe('Feature 5: self-describing status palettes', () => {
  it('R22: resolved palette materialized into project frontmatter on save', async () => {
    // negative-control: project saved but frontmatter still lacks config.statuses.
    const { store, vault } = newStore()
    const project = await store.createProject('Palette Home', 'Projects')

    // Effective palette = the configFor fallback chain (global settings here).
    const effectiveStatuses = store.configFor(project).statuses.map((s) => s.id)
    const effectivePriorities = store.configFor(project).priorities.map((p) => p.id)

    // Forensic: the on-disk frontmatter now carries the resolved palette.
    const disk = await frontmatterOf(vault, project.filePath)
    expect(paletteIds(disk, 'statuses'), 'config.statuses must materialize the effective status ids').toEqual(
      expect.arrayContaining(effectiveStatuses)
    )
    expect(paletteIds(disk, 'priorities')).toEqual(expect.arrayContaining(effectivePriorities))
    // Round-trip-safety marker: a materialized block is tagged so the resolver
    // does not misread it as a deliberate override.
    expect(materializedFlag(disk)).toBe(true)
  })

  it('R23: legacy project (no config block) gains the materialized palette on first save', async () => {
    // negative-control: legacy file stays bare (no config) after save.
    const { store, vault } = newStore()
    await vault.create(
      'Projects/Legacy Palette.md',
      taskFileBody([
        '---',
        'pm-project: true',
        'id: legacy-pal-1',
        'title: Legacy Palette',
        'taskIds: []',
        '---',
        '',
        'body'
      ])
    )
    const project = await store.loadProject(fileAt(vault, 'Projects/Legacy Palette.md'))
    expect(project).not.toBeNull()
    if (!project) return

    // Precondition: the legacy file has no config block yet.
    const bare = await frontmatterOf(vault, project.filePath)
    expect(bare.config, 'legacy fixture must start without a config block').toBeUndefined()

    const effectiveStatuses = store.configFor(project).statuses.map((s) => s.id)
    await store.saveProject(project)

    // Forensic: the first save backfills the resolved palette into the bare file.
    const disk = await frontmatterOf(vault, project.filePath)
    expect(paletteIds(disk, 'statuses'), 'first save must backfill config.statuses').toEqual(
      expect.arrayContaining(effectiveStatuses)
    )
    expect(materializedFlag(disk)).toBe(true)
  })

  it('R24: ingestion normalizes case-mismatched status id, preserves unknown values', async () => {
    // negative-control: 'Todo' left unnormalized, or unknown 'blocked-ish' destroyed.
    const { store, vault } = newStore()
    const project = await store.createProject('Inbox', 'Projects')

    const ingest = probe(store).ingestExternalTask
    expect(ingest, 'ProjectStore.ingestExternalTask must exist').toBeTypeOf('function')
    if (!ingest) return

    // Case-mismatch of the known id 'todo' → normalized to the canonical id.
    const casePath = 'Projects/Inbox_tasks/case-mismatch.md'
    await vault.create(
      casePath,
      taskFileBody(['---', 'pm-task: true', 'title: Case', 'status: Todo', '---', '', 'body'])
    )
    const cased = await ingest.call(store, project, fileAt(vault, casePath))
    expect(cased).not.toBeNull()
    if (!cased) return
    expect(cased.status, "case-mismatched 'Todo' must normalize to canonical 'todo'").toBe('todo')

    // Unknown value → PRESERVED (never destroy AI/user data); the task still loads.
    const unknownPath = 'Projects/Inbox_tasks/unknown-status.md'
    await vault.create(
      unknownPath,
      taskFileBody(['---', 'pm-task: true', 'title: Unknown', 'status: blocked-ish', '---', '', 'body'])
    )
    const unknown = await ingest.call(store, project, fileAt(vault, unknownPath))
    expect(unknown, 'a task with an unknown status must still load').not.toBeNull()
    if (!unknown) return
    expect(unknown.status, "unknown 'blocked-ish' must be preserved, not destroyed").toBe('blocked-ish')
  })

  it('R25: explicit per-project override still wins through configFor after materialization', async () => {
    // negative-control (regression): override clobbered by the global palette on save.
    const { app, vault } = makeFakeApp()
    const localSettings: PMSettings = { ...DEFAULT_SETTINGS }
    const store = new ProjectStore(app as unknown as App, () => localSettings)

    // A genuine user override: a single custom status, and NO materialized marker.
    await vault.create(
      'Projects/Override.md',
      taskFileBody([
        '---',
        'pm-project: true',
        'id: override-1',
        'title: Override',
        'taskIds: []',
        'config:',
        '  statuses:',
        '    - id: custom',
        '      label: Custom',
        '      color: "#123456"',
        '      icon: ""',
        '      complete: false',
        '---',
        '',
        'body'
      ])
    )
    const project = await store.loadProject(fileAt(vault, 'Projects/Override.md'))
    expect(project).not.toBeNull()
    if (!project) return

    // Baseline: the override wins through configFor (global ids absent).
    const before = store.configFor(project).statuses.map((s) => s.id)
    expect(before, 'override must win before materialization').toContain('custom')
    expect(before, 'global-only ids must not leak into an overridden palette').not.toContain('in-progress')

    // Materialize via a save, then reload from disk.
    await store.saveProject(project)
    const reloaded = await store.loadProject(fileAt(vault, 'Projects/Override.md'))
    expect(reloaded).not.toBeNull()
    if (!reloaded) return

    // Regression: the override still wins through configFor after the round-trip.
    const after = store.configFor(reloaded).statuses.map((s) => s.id)
    expect(after, 'override must still win through configFor after materialization').toContain('custom')
    expect(after, 'materialization must not clobber the override with the global palette').not.toContain('in-progress')

    // Forensic: the override block is NOT re-tagged as materialized (so it stays
    // a deliberate override on the next round-trip).
    const disk = await frontmatterOf(vault, reloaded.filePath)
    expect(paletteIds(disk, 'statuses'), 'on-disk override must survive the save').toEqual(['custom'])
    expect(materializedFlag(disk), 'a genuine override must not be flagged materialized').not.toBe(true)
  })
})
