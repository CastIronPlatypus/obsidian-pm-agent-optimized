import { today } from './dates'
import type { TaskNotesDependency } from './integrations/tasknotes'
import type { TaskIndex } from './store/TaskIndex'

export type TaskStatus = string
export type TaskPriority = string
export type GanttGranularity = 'day' | 'week' | 'month' | 'quarter'
export type GanttWeekLabel = 'weekNumber' | 'dateRange' | 'both'
export type ViewMode = 'table' | 'gantt' | 'kanban'
export type DueDateFilter = 'any' | 'overdue' | 'this-week' | 'this-month' | 'no-date'
export type TaskType = 'task' | 'milestone' | 'subtask'

export interface Recurrence {
  interval: 'daily' | 'weekly' | 'monthly' | 'yearly'
  every: number // e.g. every 2 weeks
  endDate?: string // YYYY-MM-DD
}

export interface TimeLog {
  date: string // YYYY-MM-DD
  hours: number
  note: string
}

/**
 * A TaskNotes-style time-tracking session: precise ISO start/end timestamps
 * rather than PM's per-day hour aggregate (`TimeLog`). `endTime` absent = the
 * session is still running. Canonical only when `taskNotesTimeSync` is on; PM
 * derives hours from these for its own UI. See `converge-time-tracking` task.
 */
export interface TimeEntry {
  startTime: string // ISO 8601 datetime
  endTime?: string // ISO 8601 datetime; absent = running
  description: string
}

/** PM stores estimates in hours; TaskNotes in minutes. Convert across the bridge. */
export const MINUTES_PER_HOUR = 60

export interface CustomFieldDef {
  id: string
  name: string
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'person' | 'checkbox' | 'url'
  options?: string[] // for select / multiselect
  icon?: string // emoji or lucide icon name
}

export interface Task {
  id: string
  title: string
  description: string
  type: TaskType // 'task' or 'milestone' (zero-duration)
  status: TaskStatus
  priority: TaskPriority
  start: string // YYYY-MM-DD, empty string = unset
  due: string // YYYY-MM-DD, empty string = unset
  progress: number // 0–100
  completed: string // YYYY-MM-DD, empty string = not completed; stamped when status becomes complete
  assignees: string[]
  tags: string[]
  subtasks: Task[]
  dependencies: string[] // task IDs
  recurrence?: Recurrence
  timeEstimate?: number // hours
  timeLogs?: TimeLog[]
  /**
   * TaskNotes-style time sessions, only populated when `taskNotesTimeSync` is on.
   * When present these are the canonical time record and `timeLogs` is unused.
   */
  timeEntries?: TimeEntry[]
  customFields: Record<string, unknown>
  /**
   * Frontmatter keys written by another plugin (TaskNotes) or by the user, kept
   * verbatim so our writes don't destroy them. Never read by our own code.
   */
  foreign?: Record<string, unknown>
  /**
   * TaskNotes' RFC 9253 `blockedBy` array as read from frontmatter, kept verbatim
   * so we can regenerate it on write without losing each entry's `reltype`/`gap`.
   * Our flat `dependencies[]` holds just the uids (all the Gantt renders today);
   * this preserves the full relation model for lossless round-trips. Runtime only,
   * only present when the file carried a parseable `blockedBy`.
   */
  taskNotesBlockedBy?: TaskNotesDependency[]
  /** UI state, persisted per project in plugin settings (data.json), not in frontmatter. */
  collapsed: boolean
  createdAt: string
  updatedAt: string
  filePath?: string // vault path to this task's .md file
  archived?: boolean // runtime only — derived from file location in Archive/ subfolder
  /**
   * Runtime only — true when this is a TaskNotes note living *outside* our
   * `_tasks/` folder, ingested via its `projects[]` wikilink. Signals the save
   * path to leave the file where it is rather than relocate it into `_tasks/`.
   */
  external?: boolean
}

export interface Project {
  id: string
  title: string
  description: string
  color: string // hex
  icon: string // emoji
  tasks: Task[]
  customFields: CustomFieldDef[]
  teamMembers: string[]
  createdAt: string
  updatedAt: string
  filePath: string // resolved vault path
  savedViews: SavedView[]
  /** Per-project overrides for the global settings. Absent fields inherit. */
  config?: ProjectConfig
  /** Transient id → {task, parentId} index. Rebuilt on load, maintained by store mutators. Not serialized. */
  taskIndex: TaskIndex
}

export interface FilterState {
  text: string
  statuses: TaskStatus[]
  priorities: TaskPriority[]
  assignees: string[]
  tags: string[]
  dueDateFilter: DueDateFilter
  showArchived: boolean
}

export interface SavedView {
  id: string
  name: string
  filter: FilterState
  sortKey: string
  sortDir: 'asc' | 'desc'
  viewMode?: ViewMode
}

export interface PerProjectFilter {
  filter: FilterState
  activeSavedViewId: string | null
}

export interface StatusConfig {
  id: string
  label: string
  color: string
  icon: string
  complete: boolean
}

/**
 * The settings a project may override in its own file. Every field is
 * optional; an absent field falls back to the global plugin settings.
 */
export interface ProjectConfig {
  statuses?: StatusConfig[]
  priorities?: PriorityConfig[]
  defaultView?: ViewMode
  autoSchedule?: boolean
  kanbanShowSubtasks?: boolean
  kanbanShowDescriptionPreview?: boolean
}

/**
 * A project's configuration with every fallback applied, as returned by
 * `TaskSource.configFor`. Views and modals read this instead of the global
 * settings so alternative task sources can supply their own catalogs.
 */
export interface ResolvedProjectConfig {
  statuses: StatusConfig[]
  priorities: PriorityConfig[]
  defaultView: ViewMode
  autoSchedule: boolean
  kanbanShowSubtasks: boolean
  kanbanShowDescriptionPreview: boolean
}

export interface PriorityConfig {
  id: TaskPriority
  label: string
  color: string
  icon: string
}

/**
 * One reversible alignment PM has applied against TaskNotes. `appliedAt` is an
 * ISO timestamp; `prev` is the exact value we overwrote, so Revert restores it
 * byte-for-byte. Absent field = that alignment has not been applied.
 */
export interface TaskNotesAlignment {
  /** Prior PM status palette, before adopting TaskNotes' list. */
  statuses?: { appliedAt: string; prev: StatusConfig[] }
  /** Prior PM priority palette, before adopting TaskNotes' list. */
  priorities?: { appliedAt: string; prev: PriorityConfig[] }
  /** Prior values of the TaskNotes fieldMapping keys we pointed at PM's names. */
  fieldMapping?: { appliedAt: string; prev: Record<string, string> }
  /** Prior value of TaskNotes' storeTitleInFilename, before we turned it off. */
  titleStorage?: { appliedAt: string; prev: boolean }
  /**
   * When the one-shot time-shape migration ran. Unlike the other alignments this
   * one rewrites task files (`timeLogs`→`timeEntries`, hours→minutes) and is
   * one-way, so there's no `prev` — the `appliedAt` stamp only guards against a
   * second run doubling the estimates.
   */
  timeSync?: { appliedAt: string }
}

export interface PMSettings {
  projectsFolder: string
  defaultView: ViewMode
  ganttGranularity: GanttGranularity
  ganttWeekLabel: GanttWeekLabel
  statuses: StatusConfig[]
  priorities: PriorityConfig[]
  globalTeamMembers: string[]
  notificationsEnabled: boolean
  notificationLeadDays: number
  autoSchedule: boolean
  kanbanShowSubtasks: boolean
  kanbanShowDescriptionPreview: boolean
  showTagColors: boolean
  saveTaskOnClose: boolean
  /**
   * When TaskNotes is installed, share task files with it: PM writes TaskNotes'
   * task identifier onto its own task files, and accepts TaskNotes-flagged,
   * project-linked notes as PM tasks. Off = strict separation.
   */
  taskNotesInterop: boolean
  /**
   * Adopt TaskNotes' time-tracking shape: `timeEntries` sessions and minute-based
   * `timeEstimate` become canonical, read/written by PM and derived to hours for
   * its UI. Off (default) = PM keeps its own `timeLogs` + hours, and a co-installed
   * TaskNotes file's `timeEntries` stays untouched in `foreign`. Only meaningful
   * with `taskNotesInterop` on. See the `converge-time-tracking` task.
   */
  taskNotesTimeSync: boolean
  /**
   * Snapshots taken when the user aligns PM's vocabulary with TaskNotes, so each
   * alignment is exactly reversible. All options here are config-only — they
   * touch settings, never task files. See `integrations/tasknotesAlignment.ts`.
   */
  taskNotesAlignment: TaskNotesAlignment
  projectFilters: Record<string, PerProjectFilter>
  /** Collapsed task ids per project file path. UI state — lives here so toggles don't rewrite task files. */
  collapsedTasks: Record<string, string[]>
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_STATUSES: StatusConfig[] = [
  { id: 'todo', label: 'To Do', color: '#8a94a0', icon: '', complete: false },
  { id: 'in-progress', label: 'In Progress', color: '#8b72be', icon: '', complete: false },
  { id: 'blocked', label: 'Blocked', color: '#c47070', icon: '', complete: false },
  { id: 'review', label: 'In Review', color: '#b8a06b', icon: '', complete: false },
  { id: 'done', label: 'Done', color: '#79b58d', icon: '', complete: true },
  { id: 'cancelled', label: 'Cancelled', color: '#767491', icon: '', complete: true }
]

export const DEFAULT_PRIORITIES: PriorityConfig[] = [
  { id: 'critical', label: 'Critical', color: '#c47070', icon: '' },
  { id: 'high', label: 'High', color: '#b8a06b', icon: '' },
  { id: 'medium', label: 'Medium', color: '#8a94a0', icon: '' },
  { id: 'low', label: 'Low', color: '#79b58d', icon: '' }
]

export const DEFAULT_SETTINGS: PMSettings = {
  projectsFolder: 'Projects',
  defaultView: 'table',
  ganttGranularity: 'week',
  ganttWeekLabel: 'weekNumber',
  statuses: DEFAULT_STATUSES,
  priorities: DEFAULT_PRIORITIES,
  globalTeamMembers: [],
  kanbanShowSubtasks: false,
  kanbanShowDescriptionPreview: false,
  showTagColors: true,
  notificationsEnabled: true,
  notificationLeadDays: 2,
  autoSchedule: true,
  saveTaskOnClose: true,
  taskNotesInterop: true,
  taskNotesTimeSync: false,
  taskNotesAlignment: {},
  projectFilters: {},
  collapsedTasks: {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString()
  return {
    id: makeId(),
    title: 'New Task',
    description: '',
    type: 'task',
    status: 'todo',
    priority: 'medium',
    start: today().toString(),
    due: '',
    progress: 0,
    completed: '',
    assignees: [],
    tags: [],
    subtasks: [],
    dependencies: [],
    customFields: {},
    collapsed: false,
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

export function makeProject(title: string, filePath: string): Project {
  const now = new Date().toISOString()
  return {
    id: makeId(),
    title,
    description: '',
    color: '#8b72be',
    icon: '📋',
    tasks: [],
    customFields: [],
    teamMembers: [],
    createdAt: now,
    updatedAt: now,
    filePath,
    savedViews: [],
    taskIndex: new Map()
  }
}

export function makeDefaultFilter(): FilterState {
  return {
    text: '',
    statuses: [],
    priorities: [],
    assignees: [],
    tags: [],
    dueDateFilter: 'any',
    showArchived: false
  }
}
