import type { Task } from '../types'
import { totalEntriesHours, totalLoggedHours } from '../store/TaskTreeOps'
import { isoToLocalInput, localInputToIso, Temporal, today } from '../dates'
import { renderAddButton } from '../ui/composites/addButton'
import { IconButton } from '../ui/primitives/IconButton'
import { ProgressBar } from '../ui/primitives/ProgressBar'

/**
 * Renders the time tracking section (estimate, progress bar, log entries) into
 * the given container. Two shapes depending on `timeShapeMinutes` (whether the
 * vault's files are in TaskNotes' minutes/`timeEntries` shape — see
 * `timeShapeIsMinutes`):
 * - false: today's-date + hours + note rows over `task.timeLogs`.
 * - true: session rows (start/end datetimes + description) over `task.timeEntries`.
 * The estimate stays in hours either way — the model is always hours.
 */
export function renderTimeTrackingPanel(container: HTMLElement, task: Task, timeShapeMinutes: boolean): void {
  if (task.type === 'milestone') return

  const timeSection = container.createDiv('pm-modal-section')
  const timeHeader = timeSection.createDiv('pm-modal-section-header')
  const logged = timeShapeMinutes ? totalEntriesHours(task) : totalLoggedHours(task)
  const est = task.timeEstimate ?? 0
  const timeLabel = est > 0 ? `Time tracking (${logged}h / ${est}h)` : `Time tracking (${logged}h logged)`
  timeHeader.createEl('h4', { text: timeLabel, cls: 'pm-modal-section-title' })

  // Estimate
  const estRow = timeSection.createDiv('pm-time-est-row')
  estRow.createSpan({ text: 'Estimate:', cls: 'pm-time-label' })
  const estInput = estRow.createEl('input', { type: 'number', cls: 'pm-prop-text pm-time-est-input' })
  estInput.value = est > 0 ? String(est) : ''
  estInput.placeholder = 'Hours'
  estInput.min = '0'
  estInput.step = '0.5'
  estInput.addEventListener('change', () => {
    const v = parseFloat(estInput.value)
    task.timeEstimate = isNaN(v) || v <= 0 ? undefined : v
  })

  // Progress bar (red once logged time exceeds the estimate)
  if (est > 0) {
    const over = logged > est
    const bar = new ProgressBar(timeSection.createDiv('pm-time-progress'))
    bar.setValue(Math.round((logged / est) * 100)).setSize('sm')
    if (over) bar.setColor('var(--color-red)')
  }

  if (timeShapeMinutes) renderSessions(timeSection, task)
  else renderLogs(timeSection, task)
}

/** Sync off: PM's per-day hour log rows over `task.timeLogs`. */
function renderLogs(section: HTMLElement, task: Task): void {
  const logList = section.createDiv('pm-time-log-list')
  const render = () => {
    logList.empty()
    if (!task.timeLogs) task.timeLogs = []
    const logs = task.timeLogs
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i]
      const row = logList.createDiv('pm-time-log-row')

      const dateInput = row.createEl('input', { type: 'date', cls: 'pm-prop-date pm-time-log-date' })
      dateInput.value = log.date
      dateInput.addEventListener('change', () => {
        log.date = dateInput.value
      })

      const hoursInput = row.createEl('input', { type: 'number', cls: 'pm-prop-text pm-time-log-hours' })
      hoursInput.value = String(log.hours)
      hoursInput.min = '0'
      hoursInput.step = '0.25'
      hoursInput.placeholder = 'Hours'
      hoursInput.addEventListener('change', () => {
        log.hours = parseFloat(hoursInput.value) || 0
      })

      const noteInput = row.createEl('input', { type: 'text', cls: 'pm-prop-text pm-time-log-note' })
      noteInput.value = log.note
      noteInput.placeholder = 'Note…'
      noteInput.addEventListener('change', () => {
        log.note = noteInput.value
      })

      new IconButton(row)
        .setIcon('x')
        .setTooltip('Remove log')
        .onClick(() => {
          logs.splice(i, 1)
          render()
        })
    }
  }
  render()

  renderAddButton(section, 'Log time', () => {
    if (!task.timeLogs) task.timeLogs = []
    task.timeLogs.push({
      date: today().toString(),
      hours: 0,
      note: ''
    })
    render()
  })
}

/** Sync on: TaskNotes-style session rows over `task.timeEntries`. */
function renderSessions(section: HTMLElement, task: Task): void {
  const list = section.createDiv('pm-time-log-list')
  const render = () => {
    list.empty()
    if (!task.timeEntries) task.timeEntries = []
    const entries = task.timeEntries
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const row = list.createDiv('pm-time-session-row')

      const startInput = row.createEl('input', { type: 'datetime-local', cls: 'pm-prop-date pm-time-session-start' })
      startInput.value = isoToLocalInput(entry.startTime)
      startInput.addEventListener('change', () => {
        entry.startTime = localInputToIso(startInput.value)
      })

      row.createSpan({ text: '→', cls: 'pm-time-session-sep' })

      const endInput = row.createEl('input', { type: 'datetime-local', cls: 'pm-prop-date pm-time-session-end' })
      endInput.value = isoToLocalInput(entry.endTime ?? '')
      endInput.addEventListener('change', () => {
        entry.endTime = endInput.value ? localInputToIso(endInput.value) : undefined
        render()
      })

      if (!entry.endTime) {
        row.createSpan({ text: 'Running', cls: 'pm-time-session-running' })
      }

      const descInput = row.createEl('input', { type: 'text', cls: 'pm-prop-text pm-time-session-desc' })
      descInput.value = entry.description
      descInput.placeholder = 'Description…'
      descInput.addEventListener('change', () => {
        entry.description = descInput.value
      })

      new IconButton(row)
        .setIcon('x')
        .setTooltip('Remove session')
        .onClick(() => {
          entries.splice(i, 1)
          render()
        })
    }
  }
  render()

  renderAddButton(section, 'Add session', () => {
    if (!task.timeEntries) task.timeEntries = []
    const now = Temporal.Now.instant().toString()
    task.timeEntries.push({
      startTime: now,
      endTime: now,
      description: ''
    })
    render()
  })
}
