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

/** RFC 9253 defaults for a dependency PM added: finish-to-start, no lag. */
const DEFAULT_RELTYPE = 'FS'
const DEFAULT_GAP = 'P0D'

/**
 * Parse a raw `blockedBy` frontmatter value into typed entries, keeping each
 * entry's `reltype`/`gap` when present. Only entries with a non-empty string
 * `uid` survive — anything malformed is dropped, so a garbage value can't crash
 * a read. Returns [] when there's nothing usable, which the caller treats as
 * "not captured" and leaves the original value in `foreign` for verbatim passthrough.
 */
export function parseBlockedBy(value: unknown): TaskNotesDependency[] {
  if (!Array.isArray(value)) return []
  const out: TaskNotesDependency[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const e = entry as Record<string, unknown>
    if (typeof e.uid !== 'string' || !e.uid) continue
    const dep: TaskNotesDependency = { uid: e.uid }
    if (typeof e.reltype === 'string' && e.reltype) dep.reltype = e.reltype
    if (typeof e.gap === 'string' && e.gap) dep.gap = e.gap
    out.push(dep)
  }
  return out
}

/**
 * Strip a `blockedBy` uid to its inner link target: `[[Foo|Bar]]` → `Foo`,
 * `[[Foo#Sec]]` → `Foo`, plain `id` → `id`. TaskNotes writes uids as wikilinks
 * (by note name or id) while our `dependencies[]` key on the bare task id, so we
 * unwrap before resolving. Returns the input trimmed when there's nothing to strip.
 */
export function blockedByUidTarget(uid: string): string {
  return uid.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].split('#')[0].trim()
}

/**
 * Resolve a `blockedBy` uid to a bare task id. Tries the raw uid as an id, then
 * its unwrapped link target as an id, then resolves the target as a link via
 * `resolveLink` (basename/path → id). Returns the original uid when nothing
 * resolves, so an external reference survives round-trip unchanged.
 */
export function resolveBlockedByUid(
  uid: string,
  hasId: (id: string) => boolean,
  resolveLink: (inner: string) => string | undefined
): string {
  if (hasId(uid)) return uid
  const inner = blockedByUidTarget(uid)
  if (!inner) return uid
  if (hasId(inner)) return inner
  return resolveLink(inner) ?? uid
}

/**
 * Three-way reconcile of a task's `dependencies[]` when the file's `blockedBy`
 * changed on disk (e.g. TaskNotes added/removed a blocker) while PM held a stale
 * copy — run at write time so PM never resurrects a dependency TaskNotes deleted,
 * nor drops one it added.
 *   base — uids captured when the task was last read (resolved ids)
 *   disk — uids currently in the file's `blockedBy` (resolved ids)
 *   deps — PM's current in-memory `dependencies[]`
 * An entry TaskNotes removed (in base, gone from disk) drops out of deps; one it
 * added (new on disk) joins; every other id stays under PM's control. Order
 * follows deps, with TaskNotes' additions appended.
 */
export function reconcileDependencies(
  base: readonly string[],
  disk: readonly string[],
  deps: readonly string[]
): string[] {
  const diskSet = new Set(disk)
  const baseSet = new Set(base)
  const removed = new Set(base.filter((id) => !diskSet.has(id)))
  const out = deps.filter((id) => !removed.has(id))
  for (const id of disk) if (!baseSet.has(id) && !out.includes(id)) out.push(id)
  return out
}

/**
 * Rebuild `blockedBy` from our flat `dependencies[]` and the original entries we
 * captured on read. Walks `dependencies` in order so the result follows PM's list:
 * a uid still present reuses its original entry (preserving `reltype`/`gap`); a uid
 * we added gets FS/P0D defaults; an original whose uid was removed simply falls away.
 *
 * `toUid` maps a bare task id to the form written to disk — pass a resolver that
 * returns `[[note-basename]]` so TaskNotes recognises the link; the default keeps
 * the bare id. Original entries are matched by bare id, so read-side resolution
 * (see `blockedByUidTarget`) must run first for `reltype`/`gap` to be preserved.
 */
export function mergeBlockedBy(
  original: TaskNotesDependency[],
  dependencies: readonly string[],
  toUid: (id: string) => string = (id) => id
): TaskNotesDependency[] {
  const byUid = new Map(original.map((d) => [d.uid, d]))
  return dependencies.map((id) => {
    const kept = byUid.get(id)
    return kept ? { ...kept, uid: toUid(id) } : { uid: toUid(id), reltype: DEFAULT_RELTYPE, gap: DEFAULT_GAP }
  })
}

/**
 * PM-owned scalar fields that TaskNotes also writes to frontmatter, and so can
 * change under PM while it holds a stale copy. Reconciled from disk on save (see
 * `reconcileSharedField`) so PM's write doesn't clobber a TaskNotes edit. `title`
 * is excluded — it has its own `storeTitleInFilename` handling and drives renames.
 */
export const TASKNOTES_SHARED_FIELDS = ['status', 'priority', 'due', 'start'] as const

/**
 * The shared fields PM types as a date-only `YYYY-MM-DD` string ('' = unset).
 * Their disk value is shaped to that type on adoption (see `reconcileSharedField`);
 * the enum fields (`status`/`priority`) are free-form strings and pass through.
 */
const SHARED_DATE_FIELDS: ReadonlySet<string> = new Set(['due', 'start'])

/** True for a shared field PM stores as a date-only `YYYY-MM-DD` string. */
export function isSharedDateField(field: string): boolean {
  return SHARED_DATE_FIELDS.has(field)
}

/**
 * Coerce a disk date value to the `YYYY-MM-DD` shape every PM consumer assumes.
 * TaskNotes may write a full datetime (`2026-07-11T09:00`) or, once parsed, a
 * `Date`; both truncate to their date. Anything unusable (a non-date scalar) reads
 * as unset. The time-of-day is intentionally dropped — PM is date-only, so PM's next
 * full-block write re-emits the date without it rather than carrying the time through.
 */
function normalizeSharedDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') return value.slice(0, 10)
  return ''
}

/**
 * Three-way reconcile of one shared scalar field on save:
 *   base — value captured when the task was last read
 *   disk — value currently in the file (TaskNotes may have changed it)
 *   mem  — PM's current in-memory value
 * PM only wins for a field it actually changed (mem ≠ base); otherwise the disk
 * value wins, so an external edit survives PM's next write. With no base captured
 * (interop was off at read, or a brand-new task) PM's value stands.
 *
 * The adopted disk value is normalized to PM's type at this trust boundary. For a
 * date field (`due`/`start`) a `null` or absent key is TaskNotes clearing the date,
 * adopted as '' — so a cleared date isn't resurrected from PM's stale copy on the
 * next save — and a datetime truncates to `YYYY-MM-DD`. An enum field (`status`/
 * `priority`) is a free-form id adopted verbatim (the alignment moment owns
 * vocabulary, so an unknown id is left alone), except a null/absent clear keeps
 * PM's value rather than blanking a typed enum.
 */
export function reconcileSharedField(field: string, base: unknown, disk: unknown, mem: unknown): unknown {
  if (base === undefined) return mem
  if (!Object.is(mem, base)) return mem
  const dateField = isSharedDateField(field)
  if (disk === undefined || disk === null) return dateField ? '' : mem
  return dateField ? normalizeSharedDate(disk) : disk
}

/**
 * The slice of TaskNotes' plugin instance we touch: its persisted `settings`
 * object and its `saveSettings` writer. Both are optional — we probe defensively
 * so a TaskNotes shape change can't throw inside PM.
 */
export interface TaskNotesPlugin {
  settings?: Record<string, unknown>
  saveSettings?: () => unknown
}

export function getTaskNotesPlugin(app: App): TaskNotesPlugin | null {
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
 * Drop TaskNotes' identifier tag from a hydrated task's tag list. In `tag` mode PM
 * stamps `config.taskTag` into every task file (see `stampTaskNotesMarker`) so the
 * note is visible to TaskNotes — it's plumbing, not a user label, so we keep it out
 * of the in-memory model and thus out of the UI. `stampTaskNotesMarker` re-adds it
 * to the frontmatter on the next save, so disk keeps carrying it. Returns the same
 * array reference when there's nothing to strip (property mode, or tag absent).
 */
export function stripMarkerTag(tags: string[], config: TaskNotesConfig): string[] {
  if (config.identification !== 'tag') return tags
  const wanted = normalizeTag(config.taskTag)
  return tags.some((t) => normalizeTag(t) === wanted) ? tags.filter((t) => normalizeTag(t) !== wanted) : tags
}

/**
 * Extract a wikilink's target basename: `[[Foo|Bar]]` → `Foo`, `[[Foo#Sec]]` →
 * `Foo`, plain `Foo` → `Foo`. Returns null for anything that isn't a non-empty
 * string. Used to dedupe project links by what they point at, not their raw form.
 */
function wikilinkTarget(entry: unknown): string | null {
  if (typeof entry !== 'string') return null
  const inner = entry.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].split('#')[0].trim()
  return inner || null
}

/**
 * Merge our project wikilink into an existing (possibly foreign) `projects[]`
 * value, deduping on target basename. Foreign entries are kept and ordered first;
 * ours is appended only when no entry already resolves to `basename`. Non-array
 * input is treated as empty, so a malformed foreign value can't throw.
 */
export function mergeProjectLink(existing: unknown, basename: string): string[] {
  const entries = Array.isArray(existing) ? existing : []
  const out: string[] = []
  let hasOurs = false
  for (const entry of entries) {
    if (typeof entry === 'string') out.push(entry)
    if (wikilinkTarget(entry) === basename) hasOurs = true
  }
  if (!hasOurs) out.push(`[[${basename}]]`)
  return out
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

/**
 * Resolve every entry of a note's `projects[]` frontmatter to a project file
 * path, deduped and in order. A multi-project note yields one entry per
 * resolvable target — the array is never truncated. Unresolvable entries are
 * dropped. Non-array / missing `projects` yields an empty list.
 */
export function resolveProjectLinks(fm: Record<string, unknown>, app: App, sourcePath: string): string[] {
  const projects = fm.projects
  if (!Array.isArray(projects)) return []
  const out: string[] = []
  for (const entry of projects) {
    if (typeof entry !== 'string') continue
    const resolved = resolveTaskNotesRef(app, entry, sourcePath)
    if (resolved && !out.includes(resolved)) out.push(resolved)
  }
  return out
}
