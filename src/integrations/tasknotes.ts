import type { App } from 'obsidian'

/**
 * One entry of TaskNotes' RFC 9253 `blockedBy` array. `reltype` is the relation
 * kind (FS/SS/FF/SF, default FS) and `gap` an ISO-8601 duration (default P0D).
 * Our Gantt only models flat blocking, so both are carried through untouched.
 */
export interface TaskNotesDependency {
  uid: string
  reltype?: string
  gap?: string
}

function getTaskNotesPlugin(app: App): object | null {
  const registry = (app as App & { plugins?: { getPlugin?: (id: string) => unknown } }).plugins
  const plugin = registry?.getPlugin?.('tasknotes')
  return plugin && typeof plugin === 'object' ? plugin : null
}

/** True when the TaskNotes plugin is installed and enabled, regardless of its version. */
export function isTaskNotesInstalled(app: App): boolean {
  return getTaskNotesPlugin(app) !== null
}

/**
 * How TaskNotes decides a note is a task, read straight off its settings rather
 * than its runtime API — the integration lives at the data-shape layer, so it
 * only needs to know which marker to write and read.
 *
 * `tag` mode: the note carries `taskTag` in its `tags[]` (default `task`).
 * `property` mode: the note sets `fieldName` to `fieldValue` in frontmatter.
 */
export interface TaskNotesConfig {
  identification: 'tag' | 'property'
  taskTag: string
  fieldName: string
  fieldValue: string
}

/** Strip a leading '#' so `#task` and `task` compare equal. */
function normalizeTag(tag: string): string {
  return tag.replace(/^#/, '')
}

/**
 * Read TaskNotes' task-identification settings off its plugin instance, or null
 * when TaskNotes isn't installed. Missing fields fall back to TaskNotes' own
 * defaults (tag-based, `task`).
 */
export function getTaskNotesConfig(app: App): TaskNotesConfig | null {
  const plugin = getTaskNotesPlugin(app)
  if (!plugin) return null
  const settings = ((plugin as { settings?: unknown }).settings ?? {}) as Record<string, unknown>
  const identification = settings.taskIdentificationMethod === 'property' ? 'property' : 'tag'
  const taskTag = typeof settings.taskTag === 'string' && settings.taskTag ? settings.taskTag : 'task'
  const fieldName = typeof settings.taskPropertyName === 'string' ? settings.taskPropertyName : ''
  const fieldValue = typeof settings.taskPropertyValue === 'string' ? settings.taskPropertyValue : ''
  return { identification, taskTag, fieldName, fieldValue }
}

/** True when the frontmatter already carries TaskNotes' task identifier under this config. */
export function hasTaskNotesMarker(fm: Record<string, unknown>, config: TaskNotesConfig): boolean {
  if (config.identification === 'property') {
    if (!config.fieldName) return false
    const value = fm[config.fieldName]
    if (value === undefined || value === null) return false
    // An empty configured value means "the property is present" is enough.
    if (config.fieldValue === '') return true
    // TaskNotes identifier values are scalars; anything else can't match.
    if (typeof value === 'string') return value === config.fieldValue
    if (typeof value === 'number' || typeof value === 'boolean') return String(value) === config.fieldValue
    return false
  }
  const tags = fm.tags
  if (!Array.isArray(tags)) return false
  const wanted = normalizeTag(config.taskTag)
  return tags.some((t) => typeof t === 'string' && normalizeTag(t) === wanted)
}

/**
 * True when the frontmatter ties the note to a project — either our `projectId`
 * or TaskNotes' `projects[]` wikilinks. A TaskNotes note with the task marker
 * but no project link is an inbox item and stays TaskNotes-only.
 */
export function hasProjectAssociation(fm: Record<string, unknown>): boolean {
  if (typeof fm.projectId === 'string' && fm.projectId) return true
  const projects = fm.projects
  return Array.isArray(projects) && projects.length > 0
}

/**
 * Whether a scanned note without our `pm-task` marker should still load as a PM
 * task: it must carry TaskNotes' identifier and be associated with a project.
 */
export function isSharedTaskNote(fm: Record<string, unknown>, config: TaskNotesConfig): boolean {
  return hasTaskNotesMarker(fm, config) && hasProjectAssociation(fm)
}

/**
 * Stamp TaskNotes' identifier into a frontmatter object we're about to write, so
 * a PM task is also visible to TaskNotes. Idempotent: never duplicates the tag,
 * never overwrites an existing property value.
 */
export function stampTaskNotesMarker(fm: Record<string, unknown>, config: TaskNotesConfig): void {
  if (config.identification === 'property') {
    if (!config.fieldName) return
    if (fm[config.fieldName] === undefined) fm[config.fieldName] = config.fieldValue || true
    return
  }
  const wanted = normalizeTag(config.taskTag)
  const tags = Array.isArray(fm.tags) ? (fm.tags as unknown[]) : []
  if (tags.some((t) => typeof t === 'string' && normalizeTag(t) === wanted)) return
  fm.tags = [...tags, config.taskTag]
}

/**
 * Resolve a TaskNotes reference (a "[[wikilink]]" or a plain vault path) to a
 * vault file path, or null when it doesn't resolve.
 */
export function resolveTaskNotesRef(app: App, ref: string, sourcePath: string): string | null {
  const inner = ref.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].split('#')[0].trim()
  if (!inner) return null
  if (app.vault.getFileByPath(inner)) return inner
  return app.metadataCache.getFirstLinkpathDest(inner, sourcePath)?.path ?? null
}
