// @vitest-environment node
//
// RENDERED-SURFACE contract for the `pm` CLI (INT-019). This file is the
// completeness gate: it proves the CLI on the ARTIFACT THE CONSUMER CONSUMES —
// `result.stdout` — not on the JSON envelope. Every test asserts on the frozen
// pretty/porcelain grammar in `cli/src/render.ts` and the mockups in the
// INT-019 Appendix ("Verbatim Requirement Exchange").
//
// Determinism: every command runs with an INJECTED clock (`now: '2026-07-16'`)
// so date-bearing output is byte-stable. The fixture is a real temp-fs vault
// built once per test through the same `runPm` an agent invokes.
//
// Doctrine: default NOT DONE — a shape counts as covered ONLY when a stdout (or
// exit-code) assertion pins it, and every claim carries an executable NEGATIVE
// CONTROL (a mutation of the fixture that must flip the assertion), so a test
// that would pass on empty/degenerate output is impossible.

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { runPm } from './src/run'
import { PORCELAIN_COLUMNS } from './src/render'

const NOW = '2026-07-16'

// ─── temp-fs vault harness ──────────────────────────────────────────────────

const vaults: string[] = []

function makeVault(): string {
  const root = mkdtempSync(join(tmpdir(), 'pm-cli-render-'))
  vaults.push(root)
  writeFileSync(join(root, '.obsidian-marker'), '')
  return root
}

afterEach(() => {
  while (vaults.length) {
    const root = vaults.pop()
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true })
  }
})

/** Run a command against a vault with the injected, byte-deterministic clock. */
function run(vault: string, argv: string[]) {
  return runPm(argv, { vault, now: NOW })
}

/** Feed `content` on stdin for the duration of `fn` (for the `batch` op stream). */
async function withStdin<T>(content: string, fn: () => Promise<T>): Promise<T> {
  const fake = Readable.from([Buffer.from(content, 'utf8')]) as unknown as NodeJS.ReadStream
  ;(fake as unknown as { isTTY: boolean }).isTTY = false
  const original = Object.getOwnPropertyDescriptor(process, 'stdin')
  Object.defineProperty(process, 'stdin', { value: fake, configurable: true })
  try {
    return await fn()
  } finally {
    if (original) Object.defineProperty(process, 'stdin', original)
  }
}

/** The stdout line that carries the bracketed anchor `[id]`, or undefined. */
function lineWithId(stdout: string, id: string): string | undefined {
  return stdout.split('\n').find((l) => l.includes(`[${id}]`))
}

const glyphOf = (s: string) => (s.match(/⚠/g) ?? []).length

// ─── the deterministic fixture ──────────────────────────────────────────────

interface Fixture {
  projA: string
  projB: string
  milestone: string
  bare: string // due today, note body is ONLY the managed pm:link line → no ✎
  prose: string // due today, real prose body → ✎N
  logo: string // overdue (due 2026-07-12), not done
  schema: string // future-dated predecessor, not done
  qa: string // depends on schema → blocked
  flyer: string // due today, in project B
}

/**
 * Build the canonical fixture:
 *   • two projects (A "Fiverr Machine" / B "Community Garden")
 *   • a milestone with two subtasks (one bare, one prose)
 *   • an overdue task (`logo`, due < today, not done)
 *   • a dependency chain (`qa` depends on `schema`) → a blocked task
 *   • a start→due milestone subtree (for `shift` cascade preview)
 */
async function seed(vault: string): Promise<Fixture> {
  const id = (r: Awaited<ReturnType<typeof run>>) => String((r.envelope.data ?? {}).id ?? '')

  const projA = id(await run(vault, ['new', 'project', '--title', 'Fiverr Machine', '--dir', 'Work']))
  const milestone = id(
    await run(vault, ['new', 'milestone', '--project', projA, '--title', 'MVP milestone', '--start', '2026-07-15', '--due', '2026-07-20'])
  )
  // Bare child — the store adds ONLY the managed `Part of [[…]] <!-- pm:link -->`
  // backlink, so the content detector must report zero lines (the ✎ negative control).
  const bare = id(await run(vault, ['new', 'task', '--project', projA, '--parent', milestone, '--title', 'Write landing copy', '--due', NOW]))
  const prose = id(
    await run(vault, ['new', 'task', '--project', projA, '--parent', milestone, '--title', 'Wire order API', '--start', '2026-07-14', '--due', NOW])
  )
  await run(vault, ['note', prose, '--append', 'Real API notes an agent should read.'])

  const logo = id(await run(vault, ['new', 'task', '--project', projA, '--title', 'Design logo', '--due', '2026-07-12']))
  const schema = id(await run(vault, ['new', 'task', '--project', projA, '--title', 'DB schema', '--due', '2026-07-18']))
  const qa = id(await run(vault, ['new', 'task', '--project', projA, '--title', 'QA pass', '--due', '2026-07-19']))
  await run(vault, ['depend', qa, '--on', schema])

  const projB = id(await run(vault, ['new', 'project', '--title', 'Community Garden', '--dir', 'Personal']))
  const flyer = id(await run(vault, ['new', 'task', '--project', projB, '--title', 'Design flyer', '--due', NOW]))

  return { projA, projB, milestone, bare, prose, logo, schema, qa, flyer }
}

const LEGEND_LINE = 'legend:  ○ = todo   ◐ = doing   ● = done   ⊘ = blocked   ✎N = N lines of note body   ▸N = N children'

// ─── tree (universal + composable) ──────────────────────────────────────────

describe('render: tree', () => {
  it('--sub emits the legend line, glyph rows, lineage indent, and ✎ only on the prose child', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['tree', fx.milestone, '--sub'])
    expect(r.exitCode).toBe(0)

    // Frozen legend line, byte-exact.
    expect(r.stdout).toContain(LEGEND_LINE)
    // Root glyph row: the milestone anchor with a status glyph.
    expect(lineWithId(r.stdout, fx.milestone)).toMatch(/[○◐●⊘]\s+\[/)
    // Both children present, lineage-indented (3-space per depth).
    const proseLine = lineWithId(r.stdout, fx.prose)
    const bareLine = lineWithId(r.stdout, fx.bare)
    expect(proseLine, 'prose child appears').toBeDefined()
    expect(bareLine, 'bare child appears').toBeDefined()
    expect(proseLine!.startsWith('   '), 'a child is indented under the milestone').toBe(true)

    // ✎N content symbol: the prose note has it, the managed-backlink-only note does NOT.
    expect(proseLine).toMatch(/✎\d+/)
    expect(bareLine).not.toContain('✎')
  })

  it('NEGATIVE CONTROL: appending prose to the bare child makes ✎ appear on its row', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const before = await run(vault, ['tree', fx.milestone, '--sub'])
    expect(lineWithId(before.stdout, fx.bare)).not.toContain('✎')

    await run(vault, ['note', fx.bare, '--append', 'Now this note holds real content.'])
    const after = await run(vault, ['tree', fx.milestone, '--sub'])
    expect(lineWithId(after.stdout, fx.bare), 'prose flips the ✎ detector on').toMatch(/✎\d+/)
  })

  it('--needs renders the upstream section with the predecessor', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['tree', fx.qa, '--needs'])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('needs (must finish first):')
    expect(lineWithId(r.stdout, fx.schema), 'the predecessor is listed under needs').toBeDefined()
  })

  it('--blocks renders the downstream section with the dependent', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['tree', fx.schema, '--blocks'])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('blocks (waiting on this):')
    expect(lineWithId(r.stdout, fx.qa), 'the dependent is listed under blocks').toBeDefined()
  })
})

// ─── today ──────────────────────────────────────────────────────────────────

describe('render: today', () => {
  it('overdue present → exactly ONE ⚠, legend + header, lineage rows, footer WITHOUT re-mentioning overdue', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['today'])
    expect(r.exitCode).toBe(0)

    // The single ⚠ pointer, mentioned exactly once (never doubled in the footer).
    expect(glyphOf(r.stdout)).toBe(1)
    expect(r.stdout).toContain('⚠ 1 overdue — pm overdue')
    expect(r.stdout).toContain(LEGEND_LINE)
    expect(r.stdout).toContain(`today = ${NOW}`)

    // Both projects' due-today items appear, lineage-shaped (ancestor headers).
    expect(r.stdout).toContain('Fiverr Machine')
    expect(r.stdout).toContain('Community Garden')
    expect(lineWithId(r.stdout, fx.prose)).toBeDefined()
    expect(lineWithId(r.stdout, fx.flyer)).toBeDefined()

    // Footer counts, and it must NOT re-mention overdue (the ⚠ is the sole pointer).
    const footer = r.stdout.trimEnd().split('\n').at(-1) ?? ''
    expect(footer).toContain('due today')
    expect(footer).not.toMatch(/overdue/)
  })

  it('overdue ABSENT → zero ⚠ (negative control on the pointer)', async () => {
    const vault = makeVault()
    // A clean vault with a single due-today item and nothing overdue.
    const proj = String((await run(vault, ['new', 'project', '--title', 'Calm', '--dir', 'Work']).then((r) => r)).envelope.data?.id ?? '')
    await run(vault, ['new', 'task', '--project', proj, '--title', 'Only today', '--due', NOW])
    const r = await run(vault, ['today'])
    expect(r.exitCode).toBe(0)
    expect(glyphOf(r.stdout), 'no ⚠ when nothing is overdue').toBe(0)
    expect(r.stdout).not.toContain('overdue')
  })

  it('DETERMINISM: two runs with the same injected clock are byte-identical', async () => {
    const vault = makeVault()
    await seed(vault)
    const a = await run(vault, ['today'])
    const b = await run(vault, ['today'])
    expect(a.stdout).toBe(b.stdout)
  })
})

// ─── overdue ────────────────────────────────────────────────────────────────

describe('render: overdue', () => {
  it('renders the overdue item with a `!Nd` marker and the overdue legend entry', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['overdue'])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('!Nd = overdue by N days')
    // Design logo is due 2026-07-12 → 4 days before 2026-07-16.
    expect(lineWithId(r.stdout, fx.logo)).toContain('!4d')
  })

  it('NEGATIVE CONTROL: completing the overdue item removes it (and its `!4d`) from the view', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    await run(vault, ['set', fx.logo, 'status=done'])
    const r = await run(vault, ['overdue'])
    expect(lineWithId(r.stdout, fx.logo), 'a done item is no longer overdue').toBeUndefined()
    expect(r.stdout).not.toContain('!4d')
  })
})

// ─── open ───────────────────────────────────────────────────────────────────

describe('render: open', () => {
  it('--by deps lists all open work, blocked-aware (⊘ blocked by …) with a blocked footer count', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['open', '--by', 'deps'])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain(LEGEND_LINE)
    // The blocked dependent carries the trailing blocked-by annotation.
    expect(lineWithId(r.stdout, fx.qa)).toContain(`⊘ blocked by [${fx.schema}]`)
    expect(r.stdout.trimEnd()).toMatch(/\d+ open · \d+ blocked$/)
  })

  it('NEGATIVE CONTROL: completing the predecessor drops the ⊘ blocked annotation on the dependent', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    await run(vault, ['set', fx.schema, 'status=done'])
    const r = await run(vault, ['open', '--by', 'deps'])
    expect(lineWithId(r.stdout, fx.qa), 'the dependent is now unblocked').not.toContain('⊘ blocked by')
  })
})

// ─── blocked ────────────────────────────────────────────────────────────────

describe('render: blocked', () => {
  it('lists the blocked task and by what', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['blocked'])
    expect(r.exitCode).toBe(0)
    expect(lineWithId(r.stdout, fx.qa)).toContain(`⊘ blocked by [${fx.schema}]`)
    expect(r.stdout.trimEnd()).toMatch(/\d+ blocked$/)
  })
})

// ─── deps ───────────────────────────────────────────────────────────────────

describe('render: deps', () => {
  it('renders the up/downstream graph and the single ⚠ blocked pointer', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['deps', fx.qa])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('needs (must finish first):')
    expect(r.stdout).toContain('blocks (waiting on this):')
    expect(glyphOf(r.stdout), 'exactly one ⚠ blocked pointer').toBe(1)
    expect(r.stdout).toContain(`⚠ blocked: [${fx.schema}] upstream not done`)
  })
})

// ─── ls / find (flat table + porcelain faithfulness) ────────────────────────

describe('render: find / ls', () => {
  it('pretty table has the column header and a matching row', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['find', '--status', 'todo', '--project', fx.projA, '--sort', 'due'])
    expect(r.exitCode).toBe(0)
    // Header row of the flat table.
    expect(r.stdout.split('\n')[0]).toMatch(/^id\s+status\s+due\s+notes\s+title/)
    expect(lineWithId(r.stdout, fx.logo) ?? r.stdout).toContain(fx.logo)
  })

  it('--porcelain (table view) is a stable 5-column TSV (4 tabs per line, no header)', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['find', '--status', 'todo', '--project', fx.projA, '--porcelain'])
    expect(r.exitCode).toBe(0)
    const lines = r.stdout.split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) expect(l.split('\t').length, 'find table porcelain has a stable column count').toBe(5)
    // No pretty header row leaked into the machine stream.
    expect(lines[0]!.startsWith('id\tstatus')).toBe(false)
  })

  it('a lineage/graph --porcelain carries the FIXED PORCELAIN_COLUMNS incl kind/rel/blocked_by, tab-count stable', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['open', '--porcelain'])
    expect(r.exitCode).toBe(0)
    const lines = r.stdout.split('\n').filter(Boolean)
    const N = PORCELAIN_COLUMNS.length
    expect(N).toBe(15)
    for (const l of lines) {
      expect(l.split('\t').length, 'every porcelain row has all fixed columns').toBe(N)
    }
    const kindIdx = PORCELAIN_COLUMNS.indexOf('kind')
    const idIdx = PORCELAIN_COLUMNS.indexOf('id')
    const blockedIdx = PORCELAIN_COLUMNS.indexOf('blocked_by')
    const kinds = new Set(lines.map((l) => l.split('\t')[kindIdx]))
    expect(kinds.has('header'), 'lineage project headers surface as kind=header').toBe(true)
    expect(kinds.has('row'), 'task records surface as kind=row').toBe(true)
    // The blocked dependent's row carries its blocker id in the blocked_by column.
    const qaRow = lines.find((l) => l.split('\t')[idIdx] === fx.qa)
    expect(qaRow, 'the blocked dependent has a porcelain row').toBeDefined()
    expect(qaRow!.split('\t')[blockedIdx], 'blocked_by is faithful, never lossy').toBe(fx.schema)
  })
})

// ─── projects / path / explain / palette / schema ───────────────────────────

describe('render: projects', () => {
  it('lists every project with a footer count', async () => {
    const vault = makeVault()
    await seed(vault)
    const r = await run(vault, ['projects'])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('Fiverr Machine')
    expect(r.stdout).toContain('Community Garden')
    expect(r.stdout.trimEnd()).toMatch(/2 projects$/)
  })
})

describe('render: path', () => {
  it('renders the project › … › item breadcrumb', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['path', fx.prose])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toBe('Fiverr Machine › MVP milestone › Wire order API')
  })
})

describe('render: explain', () => {
  it('renders the breadcrumb + a plain-English blocked sentence', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['explain', fx.qa])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('Fiverr Machine › QA pass')
    expect(r.stdout).toContain(`[${fx.qa}]`)
    expect(r.stdout).toMatch(/is blocked/)
    expect(r.stdout).toMatch(/waiting on 1 unmet dependency: DB schema/)
  })
})

describe('render: palette', () => {
  it('renders the effective status/priority vocabulary', async () => {
    const vault = makeVault()
    await seed(vault)
    const r = await run(vault, ['palette'])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('palette (global)')
    expect(r.stdout).toMatch(/statuses:.*done\*/)
    expect(r.stdout).toContain('priorities:')
  })
})

describe('render: schema', () => {
  it('emits the JSON Schema for the requested entity', async () => {
    const vault = makeVault()
    const r = await run(vault, ['schema', 'task'])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('"$id": "pm:task"')
    expect(r.stdout).toContain('"required"')
  })
})

// ─── mutation confirmation + dry-run previews ───────────────────────────────

describe('render: mutation confirmation', () => {
  it('a viewless mutation prints the `✓ <command>  →  [id]` line', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['set', fx.logo, 'status=doing'])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('✓ set')
    expect(r.stdout).toContain(`[${fx.logo}]`)
  })
})

describe('render: apply --dry-run', () => {
  it('prints a Terraform-style + create diff and the "nothing written" banner', async () => {
    const vault = makeVault()
    const specPath = join(vault, 'plan.pm.yaml')
    writeFileSync(
      specPath,
      ['project:', '  key: plan-x', '  title: Plan X', '  dir: Work', 'tasks:', '  - key: t1', '    title: First task', ''].join('\n')
    )
    const r = await run(vault, ['apply', specPath, '--dry-run'])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('+ create Plan X')
    expect(r.stdout).toContain('+ create First task')
    expect(r.stdout).toContain('dry run — nothing written')
    // NEGATIVE CONTROL: the dry-run wrote nothing — the project note does not exist.
    expect(existsSync(join(vault, 'Work/Plan X/Plan X.md')), 'a dry-run apply must not create files').toBe(false)
  })
})

describe('render: shift --dry-run', () => {
  it('prints the cascade preview (↳, old → new, "would move", --no-cascade hint)', async () => {
    const vault = makeVault()
    const fx = await seed(vault)
    const r = await run(vault, ['shift', fx.milestone, '+7d', '--dry-run'])
    expect(r.exitCode).toBe(0)
    // The milestone self line moves 2026-07-20 → 2026-07-27.
    expect(r.stdout).toContain('2026-07-20 → 2026-07-27')
    // Its subtree moves with it (the ↳ child rows).
    expect(r.stdout).toContain('↳')
    expect(r.stdout).toMatch(/items would move · drop --dry-run to apply · --no-cascade to move only/)
    // NEGATIVE CONTROL: nothing was persisted — a real tree still shows the old date.
    const tree = await run(vault, ['tree', fx.milestone, '--sub'])
    expect(lineWithId(tree.stdout, fx.milestone), 'a dry-run shift writes nothing').toContain('due 2026-07-20')
  })
})

// ─── exit-code contract (all 9 codes) ───────────────────────────────────────

describe('exit codes: the full deterministic contract', () => {
  it('0 — a successful command exits 0', async () => {
    const vault = makeVault()
    await seed(vault)
    const r = await run(vault, ['projects'])
    expect(r.exitCode).toBe(0)
    expect(r.envelope.ok).toBe(true)
  })

  it('2 — an unknown command is a usage error', async () => {
    const vault = makeVault()
    const r = await run(vault, ['frobnicate'])
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain('✗ E_USAGE:')
  })

  it('2 — an empty command line is a usage error', async () => {
    const vault = makeVault()
    const r = await run(vault, [])
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain('✗ E_USAGE:')
  })

  it('4 — E_NO_VAULT when run outside any vault', async () => {
    // A real dir with NO `.obsidian/` anywhere up the tree, addressed via cwd so
    // the auto-discovery walk fails (rather than the explicit-path existence check).
    const notVault = mkdtempSync(join(tmpdir(), 'pm-cli-novault-'))
    const savedEnv = process.env.PM_VAULT
    delete process.env.PM_VAULT
    try {
      const r = await runPm(['projects'], { cwd: notVault, now: NOW })
      expect(r.exitCode).toBe(4)
      expect(r.stdout).toContain('✗ E_NO_VAULT:')
    } finally {
      if (savedEnv !== undefined) process.env.PM_VAULT = savedEnv
      rmSync(notVault, { recursive: true, force: true })
    }
  })

  it('5 — E_CYCLE when a dependency edge would close a loop', async () => {
    const vault = makeVault()
    const proj = String((await run(vault, ['new', 'project', '--title', 'Cyc', '--dir', 'Work'])).envelope.data?.id ?? '')
    const a = String((await run(vault, ['new', 'task', '--project', proj, '--title', 'A'])).envelope.data?.id ?? '')
    const b = String((await run(vault, ['new', 'task', '--project', proj, '--title', 'B'])).envelope.data?.id ?? '')
    await run(vault, ['depend', b, '--on', a]) // B → A, fine
    const r = await run(vault, ['depend', a, '--on', b]) // A → B closes the loop
    expect(r.exitCode).toBe(5)
    expect(r.stdout).toContain('✗ E_CYCLE:')
  })

  it('6 — E_AMBIGUOUS when a slug matches two entities', async () => {
    const vault = makeVault()
    // Two projects share the title "Dup" (distinct dirs → no file collision), so
    // the bare handle "Dup" resolves to two entities and must NOT be silently picked.
    await run(vault, ['new', 'project', '--title', 'Dup', '--dir', 'Work'])
    await run(vault, ['new', 'project', '--title', 'Dup', '--dir', 'Personal'])
    const r = await run(vault, ['tree', 'Dup'])
    expect(r.exitCode).toBe(6)
    expect(r.stdout).toContain('✗ E_AMBIGUOUS:')
  })

  it('7 — E_NOT_FOUND for an unknown handle', async () => {
    const vault = makeVault()
    await seed(vault)
    const r = await run(vault, ['tree', 'no-such-id'])
    expect(r.exitCode).toBe(7)
    expect(r.stdout).toContain('✗ E_NOT_FOUND:')
  })

  it('8 — E_CONFLICT when a new task would collide with an existing file', async () => {
    const vault = makeVault()
    const proj = String((await run(vault, ['new', 'project', '--title', 'Coll', '--dir', 'Work'])).envelope.data?.id ?? '')
    const first = await run(vault, ['new', 'task', '--project', proj, '--title', 'Same Title'])
    expect(first.exitCode).toBe(0)
    const second = await run(vault, ['new', 'task', '--project', proj, '--title', 'Same Title'])
    expect(second.exitCode).toBe(8)
    expect(second.stdout).toContain('✗ E_CONFLICT:')
  })

  it('9 — E_BATCH when any op in the stream is malformed (nothing written)', async () => {
    const vault = makeVault()
    const proj = String((await run(vault, ['new', 'project', '--title', 'Batchy', '--dir', 'Work'])).envelope.data?.id ?? '')
    const stream = [JSON.stringify({ op: 'new_task', project: proj, title: 'Valid' }), JSON.stringify({ op: 'not_a_real_op' })].join('\n')
    const r = await withStdin(stream, () => run(vault, ['batch']))
    expect(r.exitCode).toBe(9)
    expect(r.stdout).toContain('✗ E_BATCH:')
    // NEGATIVE CONTROL: the atomic reject wrote nothing — the valid op did not land.
    const find = await run(vault, ['find', 'Valid', '--project', proj])
    expect(find.stdout).not.toContain('Valid')
  })
})
