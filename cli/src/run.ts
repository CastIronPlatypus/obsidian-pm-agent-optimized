// `runPm(argv, opts)` — pure dispatch. Parses argv, builds the PmContext,
// routes to a handler, selects the output mode, and returns `{ exitCode, stdout,
// envelope }`. It NEVER throws for a command error: any thrown `PmError` (or
// unexpected error) becomes an `ok:false` envelope with the pinned exit code.
// `bin/pm.ts` is the only place that touches `process.exit`.
//
// Output modes: the DEFAULT is the rendered pretty printout. `--json` emits the
// stable envelope; `--porcelain` a TSV; `--ndjson` a newline-delimited stream.

import { createPmContext } from './PmContext'
import {
  EXIT,
  PmError,
  errorEnvelope,
  okEnvelope,
  type HandlerOutput,
  type PmEnvelope,
  type PmResult
} from './envelope'
import { parseArgs, type FlagMap, type ParsedCommand } from './args'
import type { PmContext } from './PmContext'
import { renderNdjson, renderPorcelain, renderPretty } from './render'
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

type OutMode = 'pretty' | 'json' | 'porcelain' | 'ndjson'

function outMode(flags: FlagMap): OutMode {
  if (flags.json === true) return 'json'
  if (flags.porcelain === true) return 'porcelain'
  if (flags.ndjson === true) return 'ndjson'
  return 'pretty'
}

/** Pretty confirmation for a mutation that returned no view. */
function renderConfirmation(env: PmEnvelope): string {
  const lines: string[] = []
  const changed = env.changed_ids ?? []
  const idPart = changed.length ? '  →  ' + changed.map((i) => `[${i}]`).join(' ') : ''
  lines.push(`✓ ${env.command}${idPart}`)
  if (env.meta?.dry_run) lines.push('(dry run — nothing written)')
  for (const w of env.warnings ?? []) lines.push(`⚠ ${w.message}`)
  return lines.join('\n')
}

function okStdout(env: PmEnvelope, out: HandlerOutput, mode: OutMode): string {
  if (mode === 'json') return JSON.stringify(env)
  if (out.view) {
    if (mode === 'porcelain') return renderPorcelain(out.view)
    if (mode === 'ndjson') return renderNdjson(out.view)
    return renderPretty(out.view)
  }
  // No view (a simple mutation): confirmation in pretty; TSV/NDJSON fall back to
  // a compact machine line; JSON handled above.
  if (mode === 'porcelain') return (env.changed_ids ?? []).join('\t')
  if (mode === 'ndjson') return JSON.stringify({ ok: true, command: env.command, changed_ids: env.changed_ids ?? [] })
  return renderConfirmation(env)
}

function errStdout(env: PmEnvelope, mode: OutMode): string {
  if (mode === 'json') return JSON.stringify(env)
  const e = env.error
  const ids = e?.ids?.length ? ` (${e.ids.join(', ')})` : ''
  return `✗ ${e?.code ?? 'ERROR'}: ${e?.message ?? 'unknown error'}${ids}`
}

export async function runPm(argv: string[], opts: { vault?: string; cwd?: string } = {}): Promise<PmResult> {
  const startedAt = Date.now()
  const cmd = parseArgs(argv)
  const mode = outMode(cmd.flags)
  const vaultFlag = typeof cmd.flags.vault === 'string' ? cmd.flags.vault : undefined
  const vault = opts.vault ?? vaultFlag
  const dryRun = cmd.flags['dry-run'] === true
  const envOpts = { command: cmd.command, vault, dryRun, startedAt }

  const fail = (code: string, message: string, ids?: string[], exit = EXIT.USAGE): PmResult => {
    const env = errorEnvelope(envOpts, { code, message, ids })
    return { exitCode: exit, stdout: errStdout(env, mode), envelope: env }
  }

  if (!cmd.command) return fail('E_USAGE', 'no command given')

  const handler = HANDLERS[cmd.command]
  if (!handler) return fail('E_USAGE', `unknown command "${cmd.command}"`)

  try {
    const ctx = await createPmContext({ vault: vault ?? '', cwd: opts.cwd })
    envOpts.vault = ctx.vaultRoot
    const out = await handler(ctx, cmd)
    const env = okEnvelope(envOpts, out.data, { changed_ids: out.changed_ids, warnings: out.warnings })
    return { exitCode: EXIT.OK, stdout: okStdout(env, out, mode), envelope: env }
  } catch (e) {
    if (e instanceof PmError) {
      const env = errorEnvelope(envOpts, { code: e.code, message: e.message, ids: e.ids })
      return { exitCode: e.exitCode, stdout: errStdout(env, mode), envelope: env }
    }
    const message = e instanceof Error ? e.message : String(e)
    const env = errorEnvelope(envOpts, { code: 'GENERIC', message })
    return { exitCode: EXIT.GENERIC, stdout: errStdout(env, mode), envelope: env }
  }
}
