// `runPm(argv, opts)` — pure dispatch. Parses argv, builds the PmContext,
// routes to a handler, and returns `{ exitCode, stdout, envelope }`. It NEVER
// throws for a command error: any thrown `PmError` (or unexpected error) becomes
// an `ok:false` envelope with the pinned exit code. `bin/pm.ts` is the only
// place that touches `process.exit`.

import { createPmContext } from './PmContext'
import {
  EXIT,
  PmError,
  errorEnvelope,
  errorResult,
  okEnvelope,
  okResult,
  type HandlerOutput,
  type PmResult
} from './envelope'
import { parseArgs, type ParsedCommand } from './args'
import type { PmContext } from './PmContext'
import { newMilestone, newProject, newSubtask, newTask } from './commands/create'
import {
  archive,
  assign,
  due,
  mv,
  note,
  priority as setPriority,
  rename,
  set,
  shift,
  status,
  unarchive
} from './commands/update'
import { depend, undepend } from './commands/deps'
import { apply } from './commands/apply'
import {
  agenda,
  blocked,
  deps,
  find,
  log,
  next,
  open,
  overdueCmd,
  palette,
  pathCmd,
  projects,
  schema,
  show,
  todayCmd,
  tree
} from './commands/read'

type Handler = (ctx: PmContext, cmd: ParsedCommand) => Promise<HandlerOutput>

const HANDLERS: Record<string, Handler> = {
  projects: (ctx) => projects(ctx),
  tree,
  today: (ctx) => todayCmd(ctx),
  overdue: (ctx) => overdueCmd(ctx),
  open,
  blocked: (ctx) => blocked(ctx),
  next,
  deps,
  path: pathCmd,
  show,
  find,
  ls: find,
  agenda,
  log,
  palette,
  schema,
  'new project': newProject,
  'new task': newTask,
  'new subtask': newSubtask,
  'new milestone': newMilestone,
  set,
  status,
  assign,
  due,
  priority: setPriority,
  note,
  rename,
  mv,
  shift,
  archive,
  unarchive,
  depend,
  undepend,
  apply
}

export async function runPm(argv: string[], opts: { vault?: string; cwd?: string } = {}): Promise<PmResult> {
  const startedAt = Date.now()
  const cmd = parseArgs(argv)
  const vaultFlag = typeof cmd.flags.vault === 'string' ? cmd.flags.vault : undefined
  const vault = opts.vault ?? vaultFlag
  const dryRun = cmd.flags['dry-run'] === true
  const envOpts = { command: cmd.command, vault, dryRun, startedAt }

  if (!cmd.command) {
    return errorResult(errorEnvelope(envOpts, { code: 'E_USAGE', message: 'no command given' }))
  }

  const handler = HANDLERS[cmd.command]
  if (!handler) {
    return errorResult(errorEnvelope({ ...envOpts }, { code: 'E_USAGE', message: `unknown command "${cmd.command}"` }))
  }

  try {
    const ctx = await createPmContext({ vault: vault ?? '', cwd: opts.cwd })
    envOpts.vault = ctx.vaultRoot
    const out = await handler(ctx, cmd)
    const env = okEnvelope(envOpts, out.data, { changed_ids: out.changed_ids, warnings: out.warnings })
    return okResult(env)
  } catch (e) {
    if (e instanceof PmError) {
      const env = errorEnvelope(envOpts, { code: e.code, message: e.message, ids: e.ids })
      return { exitCode: e.exitCode, stdout: JSON.stringify(env), envelope: env }
    }
    const message = e instanceof Error ? e.message : String(e)
    const env = errorEnvelope(envOpts, { code: 'GENERIC', message })
    return { exitCode: EXIT.GENERIC, stdout: JSON.stringify(env), envelope: env }
  }
}
