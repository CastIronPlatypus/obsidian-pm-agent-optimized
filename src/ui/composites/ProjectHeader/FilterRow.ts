import { Menu } from 'obsidian'
import type { Project, FilterState, StatusConfig, PriorityConfig, DueDateFilter } from '../../../types'
import type { StatusFilterGroup } from '../../../store/AllProjectsAggregate'
import { collectAllAssignees, collectAllTags } from '../../../store'
import { countActiveFilters } from '../../../store/TaskFilter'
import { renderFilterDropdown } from '../../FilterDropdown'
import { ChipButton } from '../../primitives/ChipButton'
import { formatBadgeText } from '../../../utils'

export interface FilterRowProps {
  project: Project
  statuses: StatusConfig[]
  priorities: PriorityConfig[]
  /** Owner-project filter options; present only in the "All Projects" aggregate. */
  projectOptions?: { id: string; label: string }[]
  /** Label-grouped status chips; present only in the "All Projects" aggregate. */
  statusFilterGroups?: StatusFilterGroup[]
  filter: FilterState
  onFilterChange: () => void
  onClear: () => void
}

const DUE_LABELS: Record<DueDateFilter, string> = {
  any: 'Due date',
  overdue: 'Overdue',
  'this-week': 'This week',
  'this-month': 'This month',
  'no-date': 'No date'
}

export class FilterRow {
  el: HTMLElement
  private clearBtn: ChipButton | null = null

  constructor(
    parentEl: HTMLElement,
    private props: FilterRowProps
  ) {
    this.el = parentEl.createDiv('pm-project-header-filter')
    this.render()
  }

  private render(): void {
    this.el.empty()
    const { filter, statuses, priorities, project } = this.props

    const notify = () => {
      this.props.onFilterChange()
      this.updateClearButton()
    }

    if (this.props.statusFilterGroups?.length) {
      // Aggregate: one chip per distinct status LABEL. Selecting "Done" toggles
      // every project-scoped id that resolves to "Done", so matching stays a
      // plain id membership test while the user sees a single, deduped label.
      this.renderGroupedStatusDropdown(this.props.statusFilterGroups, notify)
    } else {
      renderFilterDropdown(
        this.el,
        'Status',
        filter.statuses,
        statuses.map((s) => ({ id: s.id, label: formatBadgeText(s.icon, s.label) })),
        (selected) => {
          filter.statuses = selected
          notify()
        }
      )
    }

    renderFilterDropdown(
      this.el,
      'Priority',
      filter.priorities,
      priorities.map((p) => ({ id: p.id, label: formatBadgeText(p.icon, p.label) })),
      (selected) => {
        filter.priorities = selected
        notify()
      }
    )

    if (this.props.projectOptions?.length) {
      renderFilterDropdown(this.el, 'Project', filter.projects ?? [], this.props.projectOptions, (selected) => {
        filter.projects = selected
        notify()
      })
    }

    const allAssignees = collectAllAssignees(project.tasks)
    if (allAssignees.length) {
      renderFilterDropdown(
        this.el,
        'Assignee',
        filter.assignees,
        allAssignees.map((a) => ({ id: a, label: a })),
        (selected) => {
          filter.assignees = selected
          notify()
        }
      )
    }

    const allTags = collectAllTags(project.tasks)
    if (allTags.length) {
      renderFilterDropdown(
        this.el,
        'Tag',
        filter.tags,
        allTags.map((t) => ({ id: t, label: t })),
        (selected) => {
          filter.tags = selected
          notify()
        }
      )
    }

    this.renderDueDateButton(notify)
    this.renderArchivedButton(notify)
    this.renderClearButton()
  }

  private renderGroupedStatusDropdown(groups: StatusFilterGroup[], notify: () => void): void {
    const { filter } = this.props
    const selected = new Set(filter.statuses)
    const isOn = (g: StatusFilterGroup) => g.ids.some((id) => selected.has(id))
    const btn = new ChipButton(this.el).setAriaLabel('Filter by Status')
    const updateLabel = () => {
      const count = groups.filter(isOn).length
      btn.setLabel(count > 0 ? `Status: ${count}` : 'Status').setActive(count > 0)
    }
    updateLabel()
    btn.onClick((e) => {
      const menu = new Menu()
      for (const g of groups) {
        menu.addItem((item) =>
          item
            .setTitle(g.display)
            .setChecked(isOn(g))
            .onClick(() => {
              const turningOff = isOn(g)
              for (const id of g.ids) {
                if (turningOff) selected.delete(id)
                else selected.add(id)
              }
              filter.statuses = [...selected]
              updateLabel()
              notify()
            })
        )
      }
      if (groups.some(isOn)) {
        menu.addSeparator()
        menu.addItem((item) =>
          item.setTitle('Clear').onClick(() => {
            for (const g of groups) for (const id of g.ids) selected.delete(id)
            filter.statuses = [...selected]
            updateLabel()
            notify()
          })
        )
      }
      menu.showAtMouseEvent(e)
    })
    btn.el.setAttribute('role', 'combobox')
  }

  private renderDueDateButton(notify: () => void): void {
    const { filter } = this.props
    const btn = new ChipButton(this.el)
    const updateLabel = () => {
      const current = filter.dueDateFilter
      btn.setLabel(current !== 'any' ? `Due: ${DUE_LABELS[current]}` : DUE_LABELS.any).setActive(current !== 'any')
    }
    updateLabel()
    btn.onClick((e) => {
      const menu = new Menu()
      const opts: DueDateFilter[] = ['any', 'overdue', 'this-week', 'this-month', 'no-date']
      for (const opt of opts) {
        menu.addItem((item) =>
          item
            .setTitle(DUE_LABELS[opt])
            .setChecked(filter.dueDateFilter === opt)
            .onClick(() => {
              filter.dueDateFilter = opt
              updateLabel()
              notify()
            })
        )
      }
      menu.showAtMouseEvent(e)
    })
  }

  private renderArchivedButton(notify: () => void): void {
    const { filter } = this.props
    const btn = new ChipButton(this.el).setLabel('Archived').setActive(filter.showArchived)
    btn.onClick(() => {
      filter.showArchived = !filter.showArchived
      btn.setActive(filter.showArchived)
      notify()
    })
  }

  private renderClearButton(): void {
    const count = countActiveFilters(this.props.filter)
    if (count === 0) {
      this.clearBtn = null
      return
    }
    this.clearBtn = new ChipButton(this.el).setLabel(`Clear (${count})`).onClick(() => {
      this.props.onClear()
    })
  }

  refreshClearButton(): void {
    this.updateClearButton()
  }

  private updateClearButton(): void {
    if (this.clearBtn) {
      this.clearBtn.el.remove()
      this.clearBtn = null
    }
    this.renderClearButton()
  }
}
