import { TFile, Menu, ButtonComponent } from 'obsidian'
import type PMPlugin from '../main'
import type { Project, Task, StatusConfig } from '../types'
import { safeAsync, isTerminalStatus } from '../utils'
import { openProjectModal } from '../ui/ModalFactory'
import { EmptyState } from '../ui/primitives/EmptyState'
import { ProjectCard } from '../ui/composites/ProjectCard'
import { ALL_PROJECTS_COLOR, ALL_PROJECTS_ICON, ALL_PROJECTS_TITLE } from '../store/AllProjectsAggregate'

export interface ProjectListContext {
  plugin: PMPlugin
  toolbarEl: HTMLElement
  contentEl: HTMLElement
  isStale: () => boolean
  openProjectFile: (file: TFile) => Promise<void>
}

export function renderProjectListToolbar(ctx: ProjectListContext): void {
  ctx.toolbarEl.empty()
  ctx.toolbarEl.createEl('h2', { text: 'Project manager', cls: 'pm-toolbar-title' })

  new ButtonComponent(ctx.toolbarEl)
    .setButtonText('+ new project')
    .setCta()
    .onClick(() => openCreateProjectModal(ctx))
}

export async function renderProjectListContent(ctx: ProjectListContext): Promise<void> {
  const projects = await ctx.plugin.store.loadAllProjects(ctx.plugin.settings.projectsFolder)
  if (ctx.isStale()) return
  ctx.contentEl.empty()

  const grid = ctx.contentEl.createDiv('pm-project-grid')

  // Always-present synthetic "All Projects" card: an aggregated view across every
  // project (see store/AllProjectsAggregate). Rendered first, even with no real
  // projects yet, so the entry is permanent.
  renderAllProjectsCard(ctx, grid, projects)

  if (projects.length === 0) {
    new EmptyState(ctx.contentEl)
      .setIcon('📋')
      .setTitle('No projects yet')
      .setBody('Create your first project to get started.')
      .setAction('+ new project', () => openCreateProjectModal(ctx))
    return
  }

  for (const project of projects) {
    const statuses = ctx.plugin.store.configFor(project).statuses
    const total = countTasks(project.tasks, false, statuses)
    const done = countTasks(project.tasks, true, statuses)
    new ProjectCard(grid, {
      title: project.title,
      icon: project.icon,
      color: project.color,
      tasksDone: done,
      tasksTotal: total,
      onClick: safeAsync(async () => {
        const file = ctx.plugin.app.vault.getAbstractFileByPath(project.filePath)
        if (file instanceof TFile) await ctx.openProjectFile(file)
      }),
      onContextMenu: (e) => openProjectContextMenu(ctx, project, e)
    })
  }
}

function renderAllProjectsCard(ctx: ProjectListContext, grid: HTMLElement, projects: Project[]): void {
  let total = 0
  let done = 0
  for (const project of projects) {
    const statuses = ctx.plugin.store.configFor(project).statuses
    total += countTasks(project.tasks, false, statuses)
    done += countTasks(project.tasks, true, statuses)
  }
  new ProjectCard(grid, {
    title: ALL_PROJECTS_TITLE,
    icon: ALL_PROJECTS_ICON,
    color: ALL_PROJECTS_COLOR,
    tasksDone: done,
    tasksTotal: total,
    onClick: safeAsync(() => ctx.plugin.router.openAllProjects()),
    // No edit/delete for the synthetic project.
    onContextMenu: () => {}
  })
}

function openCreateProjectModal(ctx: ProjectListContext): void {
  openProjectModal(ctx.plugin, {
    onSave: async (project) => {
      const file = ctx.plugin.app.vault.getAbstractFileByPath(project.filePath)
      if (file instanceof TFile) await ctx.openProjectFile(file)
    }
  })
}

function openProjectContextMenu(ctx: ProjectListContext, project: Project, e: MouseEvent): void {
  const menu = new Menu()
  menu.addItem((item) =>
    item
      .setTitle('Edit project')
      .setIcon('settings')
      .onClick(() => {
        openProjectModal(ctx.plugin, {
          project,
          onSave: async () => {
            await renderProjectListContent(ctx)
          }
        })
      })
  )
  menu.addItem((item) =>
    item
      .setTitle('Delete project')
      .setIcon('trash')
      .onClick(
        safeAsync(async () => {
          await ctx.plugin.store.deleteProject(project)
          await renderProjectListContent(ctx)
        })
      )
  )
  menu.showAtMouseEvent(e)
}

function countTasks(tasks: Task[], doneOnly: boolean, statuses: StatusConfig[]): number {
  let n = 0
  for (const t of tasks) {
    if (!doneOnly || isTerminalStatus(t.status, statuses)) n++
    n += countTasks(t.subtasks, doneOnly, statuses)
  }
  return n
}
