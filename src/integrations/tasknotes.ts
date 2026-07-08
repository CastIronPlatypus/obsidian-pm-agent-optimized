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
 * Resolve a TaskNotes reference (a "[[wikilink]]" or a plain vault path) to a
 * vault file path, or null when it doesn't resolve.
 */
export function resolveTaskNotesRef(app: App, ref: string, sourcePath: string): string | null {
  const inner = ref.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].split('#')[0].trim()
  if (!inner) return null
  if (app.vault.getFileByPath(inner)) return inner
  return app.metadataCache.getFirstLinkpathDest(inner, sourcePath)?.path ?? null
}
