// @vitest-environment node
//
// Regression test for the makeTask `start = today()` auto-stamp removal
// (src/types.ts). Before the fix, every created task carried start=today. A
// task given ONLY a due date — especially one in the past — ended up with
// start far AFTER its due, and computeSchedule's `start && due` branch only
// ever shifts a span FORWARD (start >= earliestStart → no patch), so the
// dependency scheduler silently could never move it. With `start` left empty
// unless explicitly provided, the scheduler's `!start && due` branch applies:
// the due shifts forward to respect the predecessor.
//
// Drives the CLI over a REAL temp-fs vault (the same honest SUT as the rest
// of the mutation tests) and asserts against bytes on disk.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseFrontmatter } from '../../../src/store'
import { runPm } from '../run'

const vaults: string[] = []

function makeVault(): string {
  const root = mkdtempSync(join(tmpdir(), 'pm-cli-dueonly-'))
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

function fm(vault: string, rel: string): Record<string, unknown> {
  return parseFrontmatter(readFileSync(join(vault, rel), 'utf8')).frontmatter ?? {}
}

async function seedDependent(vault: string, due: string) {
  const p = await runPm(['new', 'project', '--title', 'Proj', '--dir', 'Work'], { vault })
  const projectId = String((p.envelope.data ?? {}).id ?? '')
  const a = await runPm(['new', 'task', '--project', projectId, '--title', 'A', '--due', due], { vault })
  const b = await runPm(['new', 'task', '--project', projectId, '--title', 'B', '--due', due], { vault })
  const aId = String((a.envelope.data ?? {}).id ?? '')
  const bId = String((b.envelope.data ?? {}).id ?? '')
  const bPath = String((b.envelope.data ?? {}).filePath ?? '')
  // --no-schedule so B stays at its seeded due until the shift-under-test decides.
  const r = await runPm(['depend', bId, '--on', aId, '--no-schedule'], { vault })
  expect(r.exitCode).toBe(0)
  return { aId, bPath }
}

describe('due-only tasks are schedulable (makeTask start=today stamp removed)', () => {
  it('a task created with only a PAST due date has an empty start and is rescheduled by the dependency cascade', async () => {
    const vault = makeVault()
    // 2026-07-01 is in the past relative to the suite clock (Sept 2026).
    const { aId, bPath } = await seedDependent(vault, '2026-07-01')

    // Core regression assertion: the created dependent has NO start stamp.
    const before = fm(vault, bPath)
    expect(before.due).toBe('2026-07-01')
    expect(before.start, 'no auto-stamped start: due-only task stays in the schedulable !start branch').toBe('')

    // Now the predecessor moves forward — the cascade must pull B with it.
    const shift = await runPm(['set', aId, 'due=2026-08-01'], { vault })
    expect(shift.exitCode).toBe(0)

    const after = fm(vault, bPath)
    expect(after.due, 'due-only dependent follows its predecessor via the scheduler').toBe('2026-08-02')
    expect(after.start).toBe('')
  })

  it('an explicitly-provided start is preserved verbatim (explicit control still wins)', async () => {
    const vault = makeVault()
    const p = await runPm(['new', 'project', '--title', 'Proj', '--dir', 'Work'], { vault })
    const projectId = String((p.envelope.data ?? {}).id ?? '')
    const t = await runPm(
      ['new', 'task', '--project', projectId, '--title', 'Span', '--start', '2026-08-10', '--due', '2026-08-12'],
      { vault }
    )
    const tPath = String((t.envelope.data ?? {}).filePath ?? '')
    const out = fm(vault, tPath)
    expect(out.start).toBe('2026-08-10')
    expect(out.due).toBe('2026-08-12')
  })
})
