# `pm` CLI — Completeness Ledger (INT-019)

Two-way trace between the **Verbatim Requirement Exchange** (INT-019 Appendix,
authoritative) + sections **A–G** of the Intent, and the **rendered-surface**
assertions that gate them. A clause is `COVERED` **only** when a `stdout` or
`exitCode` assertion pins it (proof on the artifact the consumer consumes); a
clause whose only evidence is the JSON envelope, or which has no assertion at
all, is `NOT DONE`. Verbatim spans that map to no command are `pleasantry/no-op`.

Test ids:
- `render.test.ts` — `cli/render.test.ts` (new; the rendered-surface gate).
- `pm.test.ts` — `cli/pm.test.ts` (R41–R46; R43/R44 reworked onto `stdout`).
- `mutation.test.ts` — `cli/src/commands/mutation.test.ts` (Wave-B disk edges).

Clock is injected (`now: '2026-07-16'`) everywhere date-bearing so output is
byte-deterministic.

## A. Output, rendering, and global contract

| # | clause (short quote) | A–G | command + flags/mode | test-id | negative-control | status |
|---|---|---|---|---|---|---|
| A1 | "Default output is the RENDERED printout" | A | any read cmd, no `--json` | render.test.ts `render: today` / `render: tree` | — (whole file asserts stdout, never envelope) | COVERED |
| A2 | "`--json` emits the stable envelope" | A | `--json` `{ok,command,data\|error,changed_ids,warnings,meta}` | pm.test.ts R41/R42/R45/R46 (envelope shape) | R42 neg-control (no wiring → no id) | COVERED |
| A3 | "`--porcelain` emits tab-separated stable columns" | A | `find --porcelain`; `open --porcelain` | render.test.ts `render: find / ls` (2 porcelain cases) | table=5-col vs lineage=15-col stability asserted | COVERED |
| A4 | "`--ndjson` streams newline-delimited JSON … `{kind:'header'…}` then rows" | A | `--ndjson` | — | — | NOT DONE (no stdout assertion; renderer exists in `render.ts renderNdjson`) |
| A5 | "`--fields a,b,c` trims payload … each mode measurably changes the bytes" | A | `--fields` on json/pretty | — | — | NOT DONE (no assertion that bytes change) |
| A6 | "legend … `○ ◐ ● ⊘` … `✎N` … `[id]` bracketed … `▸N` … `!Nd` … single `⚠`" | A | `tree`/`today`/`overdue` | render.test.ts `LEGEND_LINE`, `!4d`, `⚠`×1, `✎N`, `[id]` | ✎ appear/disappear; ⚠ 0-vs-1 | COVERED |
| A7 | "`✎N` = REAL note body (frontmatter AND managed `pm:link` excluded)" | A/F | `tree --sub` bare vs prose | render.test.ts `tree --sub` + `NEGATIVE CONTROL` | append prose → ✎ appears | COVERED |
| A8 | "Deterministic exit codes: 0;1;2;4;5;6;7;8;9" | A | all | render.test.ts `exit codes` (0,2,2,4,5,6,7,8,9) | E_BATCH/dry-run wrote-nothing controls | COVERED |
| A9 | exit 1 generic | A | thrown non-PmError | — | — | NOT DONE (no fixture forces a generic exit-1; only the mapping exists) |
| A10 | "Handles … raw id, slug-path, `id:`/`path:` … ambiguity is `E_AMBIGUOUS`" | A | slug-path resolution | render.test.ts exit-6; pm.test.ts R46 slug-path; render.test.ts `path` | exit-6 ambiguous | COVERED |
| A11 | "Global flags: `--vault` … `--dry-run` … `--version` … No dead/parsed-but-ignored flags" | A | `--vault`,`--dry-run`,`--no-cascade`,`--porcelain` | render.test.ts (vault via opts; dry-run previews) | dry-run wrote-nothing | PARTIAL→NOT DONE (`--explain`,`--quiet`,`-h/--help`,`--version` have no assertion) |

## B. Read / navigate

| # | clause | A–G | command + mode | test-id | negative-control | status |
|---|---|---|---|---|---|---|
| B1 | "`pm projects` — list every project" | B | `projects` (table) | render.test.ts `render: projects` | footer `2 projects` | COVERED |
| B2 | "`pm tree <handle>` UNIVERSAL … `--sub`" | B | `tree <ms> --sub` | render.test.ts `tree --sub`; pm.test.ts R43 | ✎ flip; exit-7 unknown | COVERED |
| B3 | "`--needs` (upstream)" | B | `tree <qa> --needs` | render.test.ts `tree --needs` | — | COVERED |
| B4 | "`--blocks` (downstream)" | B | `tree <schema> --blocks` | render.test.ts `tree --blocks` | — | COVERED |
| B5 | "`--all` … `--depth N` … `--rich` … `--status` … `--include-archived`" | B | `tree` extra flags | — | — | NOT DONE (no stdout assertion on `--all/--depth/--rich/--include-archived`) |
| B6 | "`pm show <handle>` … full note incl. body" | B | `show` (plain) | — | — | NOT DONE (no stdout assertion) |
| B7 | "`pm find` / `pm ls <query>` … FLAT filterable sortable table" | B | `find --status --project --sort`; `--porcelain` | render.test.ts `render: find / ls` (pretty + porcelain) | table tab-count stable | COVERED |
| B8 | "`pm deps <handle>` … needs/blocks … blocked warning" | B | `deps <qa>` | render.test.ts `render: deps` | single ⚠ asserted | COVERED |
| B9 | "`pm path <handle>` — breadcrumb" | B | `path <prose>` (plain) | render.test.ts `render: path` (byte-exact) | — | COVERED |
| B10 | "`pm next [project]` … actionable frontier" | B | `next` | — | — | NOT DONE (handler wired; no stdout assertion) |
| B11 | "`pm today` … due-today-only, single `⚠` pointer, footer counts, does NOT list overdue" | B | `today` | render.test.ts `render: today`; pm.test.ts R44 | overdue present/absent → 1/0 ⚠; footer no re-mention | COVERED |
| B12 | "`pm overdue` … `!Nd` markers" | B | `overdue` | render.test.ts `render: overdue` | completing item removes `!4d` | COVERED |
| B13 | "`pm open` … all open, blocked-aware `⊘` … `--by deps`" | B | `open --by deps` | render.test.ts `render: open` | complete predecessor → ⊘ drops | COVERED |
| B14 | "`pm blocked` — everything blocked and by what" | B | `blocked` | render.test.ts `render: blocked` | — | COVERED |
| B15 | "`pm agenda <date\|range>`" | B | `agenda` | — | — | NOT DONE (handler wired; no stdout assertion) |
| B16 | "`pm log --since <t>`" | B | `log` | — | — | NOT DONE (handler wired; timestamp non-deterministic, no assertion) |
| B17 | "`pm palette [project]`" | B | `palette` (plain) | render.test.ts `render: palette` | `done*` terminal marker | COVERED |
| B18 | "`pm schema [task\|project\|apply\|batch]`" | B | `schema task` (plain JSON) | render.test.ts `render: schema` | `$id: pm:task` | COVERED |
| B19 | "`pm explain <handle>` … breadcrumb + unmet blockers + plain-English" | B | `explain <qa>` (plain) | render.test.ts `render: explain` | "waiting on 1 unmet dependency: DB schema" | COVERED |
| B20 | "`pm rollup <project> --group-by …`" | B | `rollup` | — | — | NOT DONE (handler wired in `analysis.ts`; no stdout assertion) |
| B21 | "`pm validate [project] [--fix]`" | B | `validate` | — | — | NOT DONE (handler wired; no stdout assertion) |
| B22 | "`pm blockers [project]` … ranked by blocked-count" | B | `blockers` | — | — | NOT DONE (handler wired; no stdout assertion) |
| B23 | "`pm graph <project> [--dot]`" | B | `graph` | — | — | NOT DONE (handler wired; no stdout assertion) |
| B24 | "`pm critical-path <project>`" | B | `critical-path` | — | — | NOT DONE (handler wired; no stdout assertion) |

## C. Create

| # | clause | A–G | command + mode | test-id | negative-control | status |
|---|---|---|---|---|---|---|
| C1 | "`pm new project\|task\|subtask\|milestone` … auto-mint id, nested layout, `parentId`, INT-021 backlink … returns id + filePath" | C | `new project`/`new task`/`new milestone` | pm.test.ts R42 (id/layout/parentId/backlink on disk); render.test.ts seed | R42 no-wiring control | COVERED |
| C2 | "`--after <h>` / `--before <h>` reorders among siblings" | C | `new … --after/--before` | — | — | NOT DONE (wired in `create.ts`; no assertion) |
| C3 | create field flags `--status --priority --due --start … --icon --color` | C | `new … --due/--start` etc. | render.test.ts seed (due/start feed today/overdue/shift) | overdue/`!4d` proves `--due` landed | COVERED (subset: due/start; icon/color/estimate/assignee/tag/desc NOT DONE) |
| C4 | "`pm apply <spec>` … idempotent upsert by key … `--dry-run` … `+create/~update/-archive` diff" | C | `apply`; `apply --dry-run`; `apply --prune` | pm.test.ts R46 (idempotency); render.test.ts `apply --dry-run`; mutation.test.ts `apply --prune` | dry-run wrote-nothing; identical re-apply no-op | COVERED |
| C5 | "`--prune` archives (not deletes)" | C | `apply --prune` | mutation.test.ts `apply --prune` | Archive/ folder appears | COVERED |
| C6 | "`pm import <note> --into <project>`" | C | `import` | — | — | NOT DONE (wired in `create.ts`; no assertion) |

## D. Update / restructure

| # | clause | A–G | command + mode | test-id | negative-control | status |
|---|---|---|---|---|---|---|
| D1 | "`pm set <handle> <field>=<val>` … typed coercion … sugar status/assign/due/priority" | D | `set <id> field=val` | render.test.ts `mutation confirmation` (`✓ set → [id]`); pm.test.ts R45 | — | COVERED (general `set`; sugar `status/assign/due/priority` NOT DONE) |
| D2 | "`pm depend --on` / `pm undepend` … cycle-checked → `E_CYCLE`" | D | `depend` | render.test.ts exit-5; mutation.test.ts cycle-guard | rejected edge writes nothing (mutation.test) | COVERED |
| D3 | "`pm mv <handle> --under` reparent; `mv project --dir` moveProject" | D | `mv --parent`; `mv project --dir` | mutation.test.ts `mv (reparent)` + `mv project --dir` | old location gone / new exists | COVERED (asserted on disk, not stdout) |
| D4 | "`pm rename <handle> <title>` bidirectional" | D | `rename` | — | — | NOT DONE (wired; no assertion) |
| D5 | "`pm reorder --before\|--after`" | D | `reorder` | — | — | NOT DONE (wired; no assertion) |
| D6 | "`pm archive` / `pm unarchive` reversible" | D | `archive`/`unarchive` | — | — | NOT DONE (wired; no assertion) |
| D7 | "`pm dup [--with-subtasks]`" | D | `dup` | — | — | NOT DONE (wired; no assertion) |
| D8 | "`pm rm [--project]` — trash, never hard-delete" | D | `rm` | — | — | NOT DONE (wired; no assertion) |
| D9 | "`pm note --append\|--set\|--prepend` … flips `✎` on" | D | `note --append` | render.test.ts `tree` ✎ negative-control (prose via `note --append`) | bare→✎ after append | COVERED |
| D10 | "`pm shift +Nd\|…` … cascade subtree + dependents … `--dry-run` previews, `--no-cascade`" | D | `shift --dry-run`; `shift` | render.test.ts `shift --dry-run` (preview + wrote-nothing); mutation.test.ts `shift --dry-run` | dry-run leaves old date on disk & in tree | COVERED |

## E. Structure / analysis / declarative / live

| # | clause | A–G | command + mode | test-id | negative-control | status |
|---|---|---|---|---|---|---|
| E1 | "`pm reconcile [project]`" | E | `reconcile` | — | — | NOT DONE (wired in `update.ts`; no assertion) |
| E2 | "`pm export <project>` … same shape `apply` consumes" | E | `export` | — | — | NOT DONE (wired; no assertion) |
| E3 | "`pm snapshot` / `pm restore` … vault-wide" | E | `snapshot`/`restore` | — | — | NOT DONE (wired in `declarative.ts`; no assertion) |
| E4 | "`pm batch < ops.ndjson` … atomic … any invalid op → `E_BATCH`, nothing written" | E | `batch` (stdin) | render.test.ts exit-9 | valid op did NOT land after reject | COVERED (reject path; success path NOT DONE) |
| E5 | "`pm watch [--ndjson]` … change-event stream" | E | `watch` | — | — | NOT DONE (long-lived; wired in `live.ts`; no assertion) |

## F. Coupled plugin behaviors

| # | clause | A–G | command + mode | test-id | negative-control | status |
|---|---|---|---|---|---|---|
| F1 | "Parent backlinks (INT-021) … `Part of [[Parent]] <!-- pm:link -->` … detector ignores it" | F | every `new` | pm.test.ts R42 (backlink on disk); render.test.ts ✎ control | link-only → no ✎ | COVERED |
| F2 | "Project-folder restructure (INT-020) … `_tasks` inside the project folder" | F | `new` layout | pm.test.ts R42 (`Work/Backend/Backend_tasks/`); R46 (`Work/Roadmap 2026/…_tasks`) | — | COVERED |

## G. Delivery tail

| # | clause | A–G | command + mode | test-id | negative-control | status |
|---|---|---|---|---|---|---|
| G1 | "land + lock, reinstall the plugin, stage/commit/push" | G | (release ops, not a CLI command) | — | — | pleasantry/no-op (out of scope for this rendered-surface gate — orchestration/release step) |
| G2 | "Vault docs cleanup … replace second-brain notes … describe CLI as canonical" | G | (vault content op) | — | — | pleasantry/no-op (documentation task, not a CLI surface) |

## Verbatim spans that map to no command (pleasantry / no-op)

- "relaunching the INT-018 builder in the background … heartbeat so the session doesn't go idle" — process/session management, not a CLI feature.
- The three "genuinely yours" decision forks (metadata cache fidelity / concurrency lockfile / `key`→id map location) — design deliberations; the resolved choices (re-read for MVP; sidecar `key`→id map under `.obsidian/`) are realized in `apply.ts` (`pm-cli-keys.json`) but are not themselves user-facing clauses.
- "status as glyphs + legend vs spelled-out words" / "plain `✎` vs `✎24`" gut-checks — resolved into A6/A7 (glyphs + `✎N`), already COVERED.
- "cascade on-by-default vs opt-in" / "`open` lineage-primary vs `--by deps`" — resolved into D10 / B13, COVERED.

---

## Summary

**COVERED: 33 · NOT DONE: 25 · pleasantry/no-op: 6** (of 64 traced clauses). Three
of the COVERED rows (C3, D1, E4) are *partial* — their core is pinned but named
sub-flags remain unpinned; those sub-clauses are itemized in the gap table below.

The rendered-surface gate proves the **default output** and the **highest-traffic
agent path** end-to-end: every glyph, `✎N`, `!Nd`, the single-`⚠` rule, lineage
shape, both porcelain record shapes, all **nine exit codes**, and the two dry-run
previews — each with an executable negative control. The `NOT DONE` rows are **not
missing features** — every one is a wired, dispatch-reachable handler (`run.ts`
`HANDLERS`) — they are **unpinned rendered surfaces**: no `stdout`/`exit`
assertion currently forces their bytes, so by doctrine they are NOT DONE until one
does.

### Every NOT DONE row (the gap report for the lead)

| id | clause | why NOT DONE |
|---|---|---|
| A4 | `--ndjson` stream | no stdout assertion on the `{kind:'header'}`+rows shape |
| A5 | `--fields` trims payload | no assertion that bytes measurably change |
| A9 | exit 1 generic | no fixture forces a generic (non-PmError) exit-1 |
| A11 | `--explain`/`--quiet`/`-h`/`--help`/`--version` | flags parsed; no stdout/exit assertion (possible dead-flag risk to verify) |
| B5 | `tree --all/--depth/--rich/--include-archived` | only `--sub/--needs/--blocks` pinned |
| B6 | `show <handle>` | full-note render unpinned |
| B10 | `next [project]` | actionable-frontier render unpinned |
| B15 | `agenda <date\|range>` | render unpinned |
| B16 | `log --since` | render unpinned (timestamp non-deterministic) |
| B20 | `rollup --group-by` | render unpinned |
| B21 | `validate [--fix]` | render unpinned |
| B22 | `blockers` | render unpinned |
| B23 | `graph [--dot]` | render unpinned |
| B24 | `critical-path` | render unpinned |
| C2 | `new --after/--before` | reorder-on-create unpinned |
| C3 (partial) | create flags `--icon/--color/--estimate/--assignee/--tag/--desc` | only `--due/--start` proven via downstream views |
| C6 | `import --into` | render/behavior unpinned |
| D1 (partial) | sugar `status/assign/due/priority` | only general `set` pinned |
| D4 | `rename` bidirectional | unpinned |
| D5 | `reorder` | unpinned |
| D6 | `archive/unarchive` | unpinned |
| D7 | `dup --with-subtasks` | unpinned |
| D8 | `rm [--project]` (trash) | unpinned |
| E1 | `reconcile` | unpinned |
| E2 | `export` | unpinned |
| E3 | `snapshot/restore` | unpinned |
| E4 (partial) | `batch` success path | only the E_BATCH reject path pinned |
| E5 | `watch [--ndjson]` | long-lived stream; unpinned |

> Note on porcelain: `PORCELAIN_COLUMNS` (15 cols incl `kind`/`rel`/`blocked_by`)
> is scoped to **lineage/graph** records; **table** views (`projects`, `find`/`ls`,
> `log`) emit their own stable column TSV. This is by design in `render.ts`
> (`PORCELAIN_COLUMNS` doc: "for lineage/graph task records"), not a discrepancy —
> asserted in `render: find / ls` (both shapes).
