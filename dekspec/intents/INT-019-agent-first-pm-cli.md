# INT-019: Ship the COMPLETE agent-first `pm` CLI — the one-stop shop for an agent to operate the vault

## Status

LOCKED

## Intent type

feature

## Autonomy

full-auto

## Risk Tier

concurrency

## Branch

`int/INT-019-agent-first-pm-cli`

## Mission

none

## Source

Engineer requirement, full-auto sessions 2026-07-16/17. The engineer co-manages a vault-as-portfolio with an AI agent through plain Markdown and wants the agent to operate the vault entirely from a shell. **The authoritative, load-bearing specification is the engineer's VERBATIM requirement exchange, reproduced in full in the Appendix of this document ("Verbatim Requirement Exchange").** That exchange — not a paraphrase, not a phased subset — is the acceptance rubric: *literally everything discussed must be built, fully working, nothing missing or unwired.*

**Reopen note (2026-07-17):** This Intent was previously LOCKED with acceptance scoped to only R41–R46 (adapter + read-core + a slice of mutation) and explicitly deferred the rendered printouts, ~15 commands, most of the flag surface, and `watch`/`snapshot`/`restore` to "later phases." That scoping was the defect: the design doc (`docs/cli-design.md`) held the whole surface, but the Intent encoded a phase, so orchestration faithfully built a phase and reported it "done." This rewrite removes ALL phasing and encodes the entire verbatim surface as the single acceptance contract.

The load-bearing constraint remains the REUSE THESIS: the CLI runs the plugin's UNMODIFIED `src/store` over a Node filesystem-backed vault adapter (`NodeVaultAdapter`, the real-fs analog of `test/fakeVault.ts`), so id-minting, folder association, the scheduler, `moveProject`, bidirectional rename, self-describing palettes, and the INT-017/018/020/021 hardening all come for free.

## Superseded-By

none

## Created

2026-07-16

## Modified

2026-07-17

## Linked Architecture Elements

- AE-013: Agent-first `pm` CLI — the container under `cli/**`: the `obsidian` shim, `NodeVaultAdapter` (real-fs `App`), `PmContext`, handle resolution, the JSON envelope, **the rendering layer (glyphs / `✎N` / lineage / tables / graphs) that is the default human/agent-readable output**, argv dispatch, one module per verb group, and the `bin/pm.ts` entry. All new I/O and presentation code lands here.
- AE-001: Task & Project Persistence Store — reused UNMODIFIED. Every CLI mutation delegates to a real, tested `TaskSource`/`ProjectStore` method. The CLI writes no YAML and re-implements no invariant.

## Motivation

The engineer runs their vault as a portfolio co-managed with an AI collaborator. Today the agent can only touch the vault by hand-writing Markdown and relying on ingestion/self-heal. There is no deterministic, non-interactive, machine-parse-optimized surface for an agent to discover, read cheaply, create, edit, restructure, depend, schedule, and analyze projects the way the Obsidian UI can — and, critically, no **rendered printout** an agent can scan in one glance to understand a whole nested project, its statuses, which notes hold real content worth reading (`✎N`), what is due today, what is overdue, what is blocked, and what is actionable next. The plugin's domain model already lives in `src/store/**` and reaches Obsidian only through a narrow `vault`/`fileManager`/`metadataCache` slice; `test/fakeVault.ts` proves that slice can be furnished off-Obsidian. This Intent closes the gap: a real-filesystem adapter + a COMPLETE command-and-rendering layer.

## Desired Outcome

A headless `pm` CLI, shipped as a separate `cli/**` package, that is the agent's **one-stop shop** for the vault. The default output of every command is a **rendered, agent-readable printout** (not JSON); JSON/porcelain/NDJSON are opt-in. The complete surface below is the acceptance contract — every item must be built, wired, and verified against the Verbatim Requirement Exchange. **No phasing. No "nice to have." No deferral.**

### A. Output, rendering, and global contract

- **Default output is the RENDERED printout.** `--json` emits the stable envelope `{ok, command, data|error, changed_ids, warnings, meta}`; `--porcelain` emits tab-separated stable columns; `--ndjson` streams newline-delimited JSON; `--fields a,b,c` trims payload. Each mode measurably changes the bytes.
- **Every printout opens with a legend.** Status glyphs: `○` not-started (todo) · `◐` in-progress (doing) · `●` done · `⊘` blocked. Content symbol `✎N` = N lines of REAL note body (frontmatter AND the managed `<!-- pm:link -->` backlink excluded — a link-only note shows no `✎`). `[id]` is bracketed and greppable. `▸N` = child count. Lineage indentation encodes project → milestone → task → subtask. Progress rollups (e.g. `3/8 done`). `!Nd` = overdue by N days. A single `⚠` warning channel (grep-consistent).
- **Deterministic exit codes:** 0 ok; 1 generic; 2 usage; 4 `E_NO_VAULT`; 5 `E_CYCLE`; 6 `E_AMBIGUOUS`; 7 `E_NOT_FOUND`; 8 `E_CONFLICT` (via `findTaskFileConflict` pre-flight); 9 `E_BATCH`.
- **Handles** address any entity by raw id, slug-path (`project/milestone/task`), or `id:`/`path:`-prefixed form; ambiguity is `E_AMBIGUOUS`, never a silent pick.
- **Global flags** honored where applicable: `--vault`, `--json/--pretty/--porcelain/--ndjson`, `--fields`, `--depth`, `--dry-run`, `--explain`, `--no-cascade`/`--no-schedule`, `--quiet`, `-h/--help`, `--version`. No dead/parsed-but-ignored flags.

### B. Read / navigate (rendered, lineage- or table-shaped)

- **`pm projects`** — list every project.
- **`pm tree <handle>` — UNIVERSAL and composable.** Works on ANY item (project, milestone, task, sub-milestone, subtask), not just projects. Flags compose: `--sub` (children/subtree, the default lineage view), `--needs` (things it depends on, upstream), `--blocks` (things depending on it, downstream), `--all` (sub+needs+blocks), `--depth N`, `--rich` (progress/tags/assignees/priority/dep-ids), `--fields`, `--status`, `--include-archived`. Renders the legend, glyphs, `✎N`, `▸N`, lineage indentation, and progress.
- **`pm show <handle>`** — one entity's full note incl. body (`--with-body`, `--fields`).
- **`pm find` / `pm ls <query>`** — FLAT, filterable, sortable table. Filters compose freely: `--status`, `--due today|before <d>|after <d>|<from>..<to>`, `--start`, `--project`, `--milestone`, `--tag`, `--assignee`, `--type task|milestone`, `--duration >Nd|<Nd` (start→due span), `--has-notes`, free text. `--sort <col>` on any column; `--limit`.
- **`pm deps <handle>`** — dependency graph: `needs` (upstream, must finish first) and `blocks` (downstream), with a blocked warning when an upstream is unmet; `--transitive`.
- **`pm path <handle>`** — breadcrumb project › … › item.
- **`pm next [project]`** — the actionable frontier: unblocked, non-terminal, dependency-aware (ignores dates), ranked overdue → soonest due → priority; `--assignee`, `--limit`.
- **`pm today`** — due-**today**-only, lineage-shaped with ancestor context headers; a SINGLE optional `⚠ N overdue — pm overdue` pointer shown ONLY when overdue work exists (mentioned exactly once, never doubled); footer counts. Does NOT list overdue items.
- **`pm overdue`** — items due before today and not done, with `!Nd` markers.
- **`pm open`** — ALL open (not-done) work, same lineage shape as `today`, blocked-aware (`⊘ blocked by …`); `--by deps` makes dependency the primary spine.
- **`pm blocked`** — everything currently blocked and by what.
- **`pm agenda <date|range>`** — `today` generalized (e.g. `pm agenda 2026-07-20`, `pm agenda this-week`), same lineage shape.
- **`pm log --since <t>`** — what changed recently, so a resuming agent catches up.
- **`pm palette [project]`** — effective status/priority vocabulary (materialized-aware).
- **`pm schema [task|project|apply|batch]`** — JSON Schemas the CLI emits/accepts.
- **`pm explain <handle>`** — breadcrumb + unmet blockers (with statuses) + what it blocks + schedule position + a plain-English sentence.
- **`pm rollup <project> --group-by status|assignee|priority`** — aggregate stats (counts, %complete, overdue, est/logged).
- **`pm validate [project] [--fix]`** — orphan/misparent, unknown palette values, dependency cycles, dangling dep ids, tasks missing files, filename collisions; `--fix` materializes the self-heal.
- **`pm blockers [project]`** — tasks blocking the most work, ranked by blocked-count.
- **`pm graph <project> [--dot]`** — full dependency graph (nodes+edges, or DOT).
- **`pm critical-path <project>`** — longest dependency chain by duration.

### C. Create (auto-mint id, auto-place file, auto-wire parent, auto-backlink)

- **`pm new project|task|subtask|milestone <title> [--under <parent-handle>]`** — creates the entity under a named parent. `--under` (with accepted aliases `--project`, `--milestone`, `--parent`) takes a parent handle: a `task`/`subtask`/`milestone`/`sub-milestone` attaches under that parent (task/subtask → parent task or milestone; milestone/sub-milestone → project or parent milestone; a task named directly under a project attaches to the project). The store auto-mints the `id`, auto-places the file in the INT-020 nested layout, auto-wires `parentId`/`subtaskIds`, and adds the INT-021 `Part of [[Parent]] <!-- pm:link -->` backlink. Field flags: `--status --priority --due --start --assignee --tag --estimate --desc --dir --icon --color`. Returns the minted `id` + `filePath` so the agent chains without a second lookup. `--after <h>` / `--before <h>` reorders among siblings (resequencing only — it does not establish parentage).
- **`pm apply <spec.yaml|->`** — declarative project-as-code, idempotent upsert by client `key`; `--dry-run` prints a Terraform-style `+ create / ~ update / - archive` diff; `--prune` archives (not deletes) tasks absent from the spec; sibling order follows spec order; a `dir` change triggers `moveProject`, a title change `renameProject`; a re-run of an identical spec is a no-op.
- **`pm import <note> --into <project> [--move|--copy]`** — convert an existing note into a task.

### D. Update / restructure (every write through a store mutator)

- **`pm set <handle> <field>=<val> …`** — patch ANY field, typed coercion (numbers, `YYYY-MM-DD`, arrays, `customFields.<id>=…`); plus sugar `pm status`, `pm assign`, `pm due`, `pm priority`.
- **`pm depend <handle> --on <handle…>` / `pm undepend …`** — add/remove dependencies, cycle-checked via `wouldCreateCycle` → `E_CYCLE` before any write.
- **`pm mv <handle> --under <parent|root>`** — reparent. **`pm mv project <handle> --dir <folder>`** — move a project's whole folder via `moveProject`.
- **`pm rename <handle> <title>`** — bidirectional (task → `updateTask({title})` file rename + child link rewrite; project → `renameProject`).
- **`pm reorder <handle> --before|--after <sib>`** — resequence siblings.
- **`pm archive <handle>` / `pm unarchive <handle>`** — reversible (location-derived).
- **`pm dup <handle> [--with-subtasks]`** — duplicate a task/subtree.
- **`pm rm <handle> [--project]`** — trash (Obsidian `.trash/`, reversible); never hard-delete.
- **`pm note <handle> --append|--set|--prepend <text>`** — add/replace note BODY content through the store; flips the `✎` indicator on.
- **`pm shift <handle> +Nd|-Nd|+Nw|+Nm` (and `set due=…`)** — move a date and **cascade**: the item's subtree moves with it AND downstream dependents (and their dates) move via the scheduler; `--dry-run` previews the ripple, `--no-cascade` moves only the one item. Cascade is on by default (respecting each project's `autoSchedule`).

### E. Structure / analysis / declarative / live

- **`pm reconcile [project]`** — backfill/heal hand-authored `pm-task` files (mint id + defaults + ordering) via `ingestExternalTask`.
- **`pm export <project>`** — portable snapshot; same shape `pm apply` consumes (round-trip).
- **`pm snapshot` / `pm restore`** — vault-wide backup/restore of the PM subset.
- **`pm batch < ops.ndjson`** — atomic, all-or-nothing; one save + one scheduler pass per touched project; per-op `results[]`; any invalid op → `E_BATCH`, nothing written.
- **`pm watch [--ndjson]`** — long-lived change-event stream (filesystem-watch–backed vault events + ingestion) so an agent reacts to the human editing in Obsidian live. (The watch backend is an implementation detail — Node's `fs.watch` with no added dependency — not a pinned requirement.)

### F. Coupled plugin behaviors the CLI must honor (already shipped)

- **Parent backlinks (INT-021, done).** On every create, both plugin and CLI add a live `Part of [[Parent]] <!-- pm:link -->` wikilink to the note body — additive, always-on, never disableable — so the Obsidian graph shows the project structure. The `✎N` content detector ignores the managed `pm:link` line.
- **Project-folder restructure (INT-020, done).** Every `_tasks` folder lives inside its parent project folder, leaving room for freeform project content.

### G. Delivery tail (part of this Intent, per the final verbatim turn)

- Drive the Intent to implementation, land + lock, **reinstall the plugin**, stage/commit/push everything.
- **Vault docs cleanup:** find the second-brain notes describing how to organize tasks/projects, replace them with the new guide + a description of the new system, and describe the CLI as the **canonical** path for interacting with projects/tasks.

## Non-Goals

- **The CLI re-implements no store invariant.** All domain logic — id-minting, folder association, dependency scheduling, bidirectional rename / project move, cycle detection, and content detection — lives in `src/store/**` and is REUSED, never forked into `cli/**`. Where exposing existing store logic to the CLI required a thin, additive, backward-compatible method (e.g. `shiftTaskDates`, `bodyContentLines`/`realContentLines`, the `scheduleDownstream` shift option), it was added to the **shared** store — serving both the plugin and the CLI — with the `TaskSource` interface kept in sync. The reuse thesis is about not duplicating invariants in the shell, not about freezing the store; no CLI command carries its own copy of an invariant. (The `## Subtasks`/`## Tasks` content-detection fix additionally corrects the plugin's own `✎`/INT-021 signal.)
- **No TUI, no colors-by-default, no interactive prompts.** Ambiguity is a deterministic error, not a question. (The rendered default output is agent-readable plain text — not a TUI.)
- **No new storage format or schema migration** beyond what the store already does.
- **No writing of plugin-owned UI state** (`collapsedTasks`, `projectFilters`, saved-view selection).
- **No network / sync / multi-vault federation; no alternative `TaskSource` backend.**

> NOTE: `watch`, `snapshot`, `restore`, `export`, `batch`, `reconcile`, `validate`, `rollup`, `graph`, `critical-path`, `blockers`, `explain`, and the full rendering layer are **IN SCOPE** for this Intent. The prior "deferred to a later phase" non-goals are removed.

## Type-specific required fields

### `feature` — Desired Outcome

The new behavior is user-observable and contract-pinned in `cli/pm.test.ts` (and any colocated render test). The acceptance contract is the **entire** command-and-rendering surface in sections A–F above, verified against the Verbatim Requirement Exchange in the Appendix — asserting on the RENDERED printouts (glyphs, `✎N`, legend, lineage indentation, view shapes, table columns, exit codes), not merely on JSON data. A completeness audit (adversarial grader vs the verbatim) must show ZERO gaps before this Intent may re-lock.

## Components affected

- `cli/src/obsidian-shim.ts`, `cli/src/NodeVaultAdapter.ts`, `cli/src/PmContext.ts`, `cli/src/handles.ts` — adapter + context + handle resolution.
- `cli/src/render.ts` (+ any `render/*` split) — **the rendering layer**: pretty/porcelain/ndjson emitters; glyphs, `✎N`, legend, lineage, tables, graphs.
- `cli/src/run.ts`, `cli/src/envelope.ts`, `cli/src/args.ts`, `cli/bin/pm.ts` — dispatch, envelope + exit codes, argv/flags, entry (output-mode selection).
- `cli/src/commands/*.ts` — one module per verb group (read/nav, create, update/restructure, deps/schedule/analysis, apply/batch/declarative, live).
- `cli/src/coerce.ts`, `cli/src/schedule.ts` — typed patch coercion; scheduler cascade wiring.
- `cli/package.json`, `cli/tsconfig.json` — the separate package.
- `cli/pm.test.ts` (+ `cli/render.test.ts` if split) — the comprehensive rendered-output contract + coverage matrix.

## Verification

```yaml
verification:
  - name: typecheck-lint-format-clean
    cmd: pnpm check
  - name: submission-lint-clean
    cmd: pnpm check:submission
  - name: cli-typecheck
    cmd: tsc -p cli/tsconfig.json
  - name: full-suite-green
    cmd: pnpm test
  - name: comprehensive-cli-contract
    cmd: vitest run cli/pm.test.ts
  - name: build
    cmd: pnpm build
  - name: completeness-audit-zero-gaps
    cmd: "adversarial grader vs the Verbatim Requirement Exchange (Appendix) reports 0 missing / 0 unwired / 0 partial"
```

## Amendment Log

| Date | Type | Change | Author |
| --- | --- | --- | --- |
| 2026-07-16 | Substantive | Intent authored PROPOSED; `--analyze` against R41–R46; reuse thesis pinned; live mode deferred to INT-023. | Claude (intent-authoring agent) |
| 2026-07-16 | Substantive | PROPOSED → ACCEPTED (engineer pre-authorized full-auto). | Claude |
| 2026-07-16 | Substantive | Decomposed into WS/IB-009..012 (phased); R41–R46 authored red-first. | Claude |
| 2026-07-16 | Substantive | Wave B mutation surface implemented; R45/R46 green. | Claude (Wave B) |
| 2026-07-16 | Substantive | Verification re-evaluated; full suite green (318/1). IMPLEMENTING → TESTPASS. | Claude (land agent) |
| 2026-07-16 | Substantive | Locked via ADR-017 Path B. TESTPASS → LOCKED. | Claude (land agent) |
| 2026-07-17 | unlock | LOCKED → PROPOSED. Reopened: acceptance was a scoped MVP phase (R41–R46) that silently deferred the rendering layer, ~15 commands, most of the flag surface, and watch/snapshot/restore. The phasing itself was the defect. | Claude (transition) |
| 2026-07-17 | Substantive | REWRITTEN to encode the ENTIRE verbatim requirement surface (sections A–G) as the single acceptance contract — no phasing, no deferral. The engineer's literal requirement exchange is embedded verbatim in the Appendix as the authoritative acceptance rubric. Prior "deferred" non-goals removed; watch/snapshot/restore/export/batch/reconcile/validate/rollup/graph/critical-path/blockers/explain + full rendering layer moved IN SCOPE. Acceptance now requires an adversarial completeness audit vs the verbatim showing zero gaps before re-lock. | Claude (INT-019 rewrite, engineer-directed full-auto 2026-07-17) |
| 2026-07-17 | Substantive | Adversarial grader (round 1) found 1 dead flag + 4 fidelity defects on the shipped code; all fixed + regression-tested (--no-schedule wired; ✎ ignores the auto `## Subtasks`/`## Tasks` mirrors + project H1; shift --no-cascade truly item-only; show --fields gates body; today/open DFS order). Round 2 found the project-`✎` over-count, `--fields` breadth (show-only), `TaskSource` interface drift, a brittle date test, and a vestigial `--apply` flag — all fixed. Non-Goal reconciled to the true reuse thesis (no forked invariants) since the verbatim's cascade + content-detection behavior necessitates thin additive shared-store methods; `watch` backend de-pinned (fs.watch). | Claude (grader-loop fixes, full-auto 2026-07-17) |
| 2026-07-17 | Substantive | Full verbatim surface implemented + rendered-output tested; adversarial grader loop (3 passes) certified PASS, zero gaps. | Jeff Haskin (full-auto 2026-07-17) |
| 2026-07-17 | Substantive | Re-locked: entire pm CLI complete + verified on the rendered surface by 3 independent adversarial graders (final gate PASS, 0 gaps). 398 suite + 86 cli tests green; check/check:submission/build clean. | Jeff Haskin (full-auto 2026-07-17) |

---

## Appendix — Verbatim Requirement Exchange (AUTHORITATIVE ACCEPTANCE RUBRIC)

> This is the engineer's literal, unedited requirement exchange for the `pm` CLI, pasted into this Intent as the single source of truth. The acceptance test for INT-019 is: **everything in this exchange is built, fully working, nothing missing or unwired.** An adversarial grader audits both this Intent and the shipped code directly against this text. Do not paraphrase it; do not phase it; build all of it now.

<!-- BEGIN VERBATIM — engineer requirement exchange, pm CLI -->

**[Engineer]**

You know, what would also be good is if we built a CLI for the agent to use in order to create projects, milestones, tasks, submilestones, subtasks, et cetera. And also for it to use to look up projects, milestones, tasks, submilestones, subtasks, et cetera. And to look them up in some kind of tree view with maybe minimal information and in some kind of tree view that has more fields to it, and then maybe requesting the full note contents of any one particular item. And being able to update any of the fields about any item, project, milestone, task, etc. Etc. Etc. Something that makes it. Easy to understand how all this stuff works together. That's optimized for agentic parsing so that an agent can quickly and easily understand the entire nested tree of a project. And all its dependencies and milestones or be able to do any research it needs. Look up ID numbers, etc. Create stuff. And if we did that, it could use the plugins code itself. Everything had an ID number when it was created and and the agent. Can use all sorts of. Basically you get where I'm going with this. A CLI would be hugely important, so. Figure out brainstorm a bunch of the stuff that the CLI would need to do and other useful things it can and should or would be nice if it did. And get really creative so that the agent can use this CLI to full effects. I mean the agent can always still manually do stuff, especially if it reads the guide that we have, but I'd also like to have this CLI. And the CLI is nice because if it takes advantage of some of the plugins code, then it solves a lot of the other problems that we're trying to harden right now. Not that we should skip them, but it does make it more reliable since it automates a lot of stuff that. Would have to happen later normally.

And it doesn't need a TUI because it's intended for agentic use, not human use. So it should be optimized for that purpose.

Come up with an incredible set of features that would make the agentic use of this CLI extremely powerful. Come up with the schemas and the formats and the ways that the agent would interact with it and the requirements, etc. Make it so that this CLI is the one-stop shop for the agent to interact with any of my projects and plans and tasks, etc.

Including the ability to move stuff around. Change which directory a project is in, et cetera, et cetera.

**[Assistant]**

On it — relaunching the INT-018 builder in the **background** (it was queued as foreground; nothing was lost — the tree is still at the RED spec commit 2f8b842), and going forward I'll default to background while you're active so I stay free. I'll also keep a heartbeat so the session doesn't go idle and trip the reaper we diagnosed.

And yes — a headless `pm` CLI is the right idea, and your key insight is exactly right: **if the CLI reuses the plugin's own store code, it goes through the same validated paths — so ID minting, folder-based association, the scheduler, bidirectional rename, moveProject, and the self-describing palette all come for free, which *solves* the hardening problems by construction instead of after the fact.** Let me get both moving, then give you my brainstorm.

Both are running in the background now (INT-018 builder finishing the ID-authority hardening; a design worker drafting the full `docs/cli-design.md`). Setting a heartbeat so the session stays warm and the reaper leaves them alone:

Now, my brainstorm while those cook. Here's the vision I'd build toward — the full write-up is being drafted in `docs/cli-design.md`, but here's the shape:

## `pm` — an agent-first CLI over the plugin's own store

**The architectural keystone:** a `NodeVaultAdapter` that implements the same vault interface Obsidian gives the plugin, but backed by real filesystem calls. Point `ProjectStore` at it and the CLI inherits *everything* the plugin already does — ID minting, folder-based association, the dependency scheduler with cycle detection, bidirectional rename, `moveProject`, self-describing palettes, and the INT-018 collision/validation hardening. No logic is reimplemented, so the CLI can't drift from the plugin, and **every write goes through a validated path** — which is exactly why it dissolves the "how does an agent wire IDs" problem: the CLI mints and wires them for you at creation time.

## Command surface (grouped)

**Read / navigate** — token-efficient by design:
- `pm tree <project>` → compact greppable tree: `[id] ● todo  Design API  (due 2026-08-01)`, with `--depth`, `--fields`, `--status todo,doing`, `--rich` for the fuller view, `--json` for structured.
- `pm show <id>` → the full note (frontmatter + body) of one item.
- `pm find "status:todo due:<2026-08 depends-on:INCOMPLETE assignee:me"` → a real query language returning ids + minimal fields.
- `pm deps <id>` / `pm path <id>` → dependency graph (up/downstream, blockers, critical path) / breadcrumb `Project › Milestone › Task`.
- `pm next <project>` → what's *actionable now* (unblocked, ordered by priority/due) — an agent-planning primitive.
- `pm schema` / `pm palette <project>` → self-describing entity schemas + the legal status/priority values (ties straight into the materialized-palette feature).

**Create** — auto-mints, auto-places, auto-wires:
- `pm new task --project X --parent Y --title "..." --due ...` → returns the minted id.
- `pm apply plan.yaml` → **projects-as-code**: declare a whole nested tree (milestones/subtasks/dependencies) in one file with client-supplied `key`s; the CLI upserts idempotently, minting and wiring every id/parentId/dependency. Re-runnable.

**Update / restructure:**
- `pm set <id> status=done due=2026-09-01`, `pm depend <id> --on <id>` (cycle-checked), `pm rename <id> "..."` (bidirectional), `pm mv <id> --parent <id>` (reparent), `pm mv project <id> --dir "Areas/Income Projects"` (folder move via `moveProject`), `pm archive <id>`.

## The features that make it *powerful* for an agent

1. **Plan/apply like Terraform** — `pm diff plan.yaml` shows exactly what would change before `pm apply` commits it. An agent can propose a restructure and preview it.
2. **Atomic batch** — `pm batch < ops.ndjson`: many mutations, one scheduler pass, one save, all-or-nothing. Fast and consistent.
3. **Handle references** — address items by id *or* by a stable slug-path (`marketing/launch/write-copy`), so an agent doesn't have to look up an id before acting.
4. **Stable JSON envelope** — every response is `{ok, data, warnings, changed_ids}` with deterministic key order and exit codes, so an agent can trust the parse and know exactly what it touched.
5. **`pm explain <id>`** — a compact digest of an item's place in the tree, what it blocks, and what it's waiting on — research in one call.
6. **`pm validate` / `pm reconcile`** — integrity check (dangling parentId, dup ids, cycles, palette-invalid status) and one-shot backfill/repair — the hardening logic, exposed as a command.
7. **`pm watch`** — NDJSON change stream for long-running agents.

## How it lands relative to what we're already building

It doesn't replace the INT-018 hardening — it *rides* on it. INT-018 makes the store safe on every load path; the CLI is a second consumer of those same safe paths. So I'd sequence it as its own intent (**INT-019**), MVP-first: adapter + `tree`/`show`/`new`/`set`/`apply` + JSON envelope, then layer the power features (diff/apply, query language, `next`, `watch`) in a second phase.

The full design doc — every command's flags, stdin/stdout shape, the `apply` spec schema, example outputs, and a phased build plan framed as intents — is being written to `docs/cli-design.md` now. When it and the INT-018 builder report back, I'll show you the doc and the shipped hardening together, and you can green-light INT-019 (and tell me MVP scope vs full send). Anything you already know you want in or out, drop it now and I'll fold it into the design before it finalizes.

The CLI design doc is drafted — `docs/cli-design.md` (uncommitted; I'll review it before it goes anywhere). It grounded the reuse thesis in a real audit of exactly which Obsidian APIs `src/store` touches and confirmed the `NodeVaultAdapter` is just the real-fs analog of the existing test fake — so the approach is low-risk.

The INT-018 builder is still running in the background. Rather than interrupt you twice, I'll present both together once it lands. But the design surfaced **three decisions that are genuinely yours** and will shape the INT-019 MVP — worth chewing on:

1. **Metadata cache fidelity** — ship the MVP with the adapter re-reading/parsing files (correct, a bit slower on huge vaults), or invest up front in a lazy frontmatter cache so `apply` diffs don't churn?
2. **Concurrency** — the store's 5-second self-write window handles sequential plugin↔CLI edits, but two *same-instant* writers still race at the filesystem. Add an advisory lockfile for `batch`/`apply`, or accept last-writer-wins (which is what Obsidian itself does)?
3. **Where `apply`'s `key`→id map lives** — a `pmKeys` map in the project file's frontmatter (vault-native, transparent, but adds a field), or a sidecar file under `.obsidian/` (keeps project files clean, but hidden)?

No need to answer now — I'll fold your calls into the design when I show you the full doc alongside the shipped INT-018 hardening. If you have instincts on any of them, though, drop them and I'll bake them in.

INT-018 landed. Let me verify independently — that R29–R32 weren't weakened, the intention-test edit was only the lint fix, and it's actually pushed and rebuilt.

Verified clean — INT-018 is fully shipped:

- **R29–R32 green**, and the only change to the intention test between RED and green was removing one redundant `as string` cast (a lint fix, one line) — **no assertion was weakened**.
- **Three clean commits** (RED → green → land), pushed; `main` up to date with origin.
- **Vault rebuilt** (17:39) and the **Agent Guide corrected** — the "leave id blank / never fabricate" wording is gone. Combined with the memory I fixed earlier, agents now get the right rule: **supply your own stable, unique id** (`^[A-Za-z0-9._-]{1,64}$`); the plugin mints only for blanks, on every load path now, and re-mints collisions/invalid ids with a warning instead of silently dropping data.

So the whole hardening story is done: an agent can now author a full nested tree by hand safely — and the CLI will make that even more reliable by doing the minting/wiring for you.

The CLI design doc (`docs/cli-design.md`) is ready for your review. Before I orchestrate it as INT-019, one scope call — and I've pre-decided the three technical forks with reversible defaults so they don't block you:

- *Metadata fidelity* → **re-read/parse for MVP** (correct, simplest), add a cache later.
- *Concurrency* → **advisory lockfile on `batch`/`apply`**, last-writer-wins elsewhere (matches Obsidian).
- *`key`→id map* → **sidecar under `.obsidian/`** to keep your project files clean.

Sounds good — discussion mode. Let me stand down the build machinery so nothing fires while we talk.

Nothing building — just us. The design doc is a starting point, not a commitment; I'd rather pressure-test the shape with you than defend it.

Here are the parts where I think the real decisions live — the stuff that shapes everything downstream:

**1. Authoring model: declarative vs imperative.** The doc leans on `pm apply plan.yaml` — an agent writes a whole nested project-as-code file and the CLI reconciles it (mint ids, wire parents, upsert idempotently). That's powerful for "set up a new project in one shot" and for re-running safely. But an agent doing incremental work ("add three subtasks under this milestone") might prefer imperative one-liners. My instinct is **both**, with `apply` as the flagship — but which one do *you* picture an agent reaching for most? That answer changes what gets built first.

**2. How agents address things.** Ids are stable but opaque; the doc adds "handles" — slug-paths like `marketing/launch/write-copy` — so an agent can act without a lookup step first. Do you like that, or would you rather agents always resolve an id via `find`/`tree` and then operate purely on ids? (Handles are friendlier but introduce ambiguity edge-cases.)

**3. What "one-stop shop" actually spans.** Tasks/milestones/deps/move are obvious. But the plugin also has **custom fields, saved views, time tracking, attachments, and the status/priority palettes**. Which of those does an agent genuinely need to touch via CLI, versus leave to the UI? I'd hate to over-build surface you'll never point an agent at.

**4. The planning primitives.** `pm next` (what's actionable now) and `pm explain <id>` (where something sits, what blocks it) are my favorite ideas — they're what make an agent able to *reason* about your plan rather than just CRUD it. Do those match how you'd want an agent to think, or are you picturing the agent mostly as a data-entry/retrieval tool?

**5. Read output economy.** For agentic parsing, the default matters a lot for token cost — a compact `[id] status title (due)` tree that an agent scans, then drills into `show <id>` for detail. Does "lean by default, drill on demand" match your mental model, or do you want richer default output?

Where do you want to start? I'm happy to go deep on any one of these, or if you'd rather, I can read you the design doc's command table and we react to it line by line.

**[Engineer]**

Well, what if the tree command didn't have to be project? What if you could give it any ID and it would show the tree for that item, like the tree for just a milestone and it's subtasks or dependents? Or you could tell the tree whether to show subtasks or just dependencies or just dependencies, things it's dependent on or things that depend on it. Or all the above or any combination of that, etc. So it would work with a project. It would also work with a milestone and with a task and with subtasks and sub milestones and whatever.

We need to figure out what the printout actually looks like so it's efficient and Easily comprehensible to an agent and not overly technical while also being still very organized.

Yeah, a dependency graph would be good.

Being able to set dependencies, update dependencies. I don't know that I see anything in here where you're able to edit any of the fields in an existing item. Thank you. I also, I noticed that you have a next command for the PM CLI. I would also add a today command for the PM CLI that just shows everything for today as sort of a graph where it like shows projects and then under those it shows milestones and tasks and under the milestones it shows any of those nested items like submilestones or tasks or subtasks etc. In like a nice tree setup. Like a dependency graph, but instead of dependencies it would be. Well, I guess it would use dependencies. Actually, no, because we're talking about the today command. So yeah, it would just say it would just show what's on today organized as if in the same shape as a dependency graph, but it's organized by its lineage or whatever in a text setup. that makes it easy for an AI to understand it. That's probably going to be one of the commands my agents use the most often is the today command. Maybe also a behind command to show what we're behind on, what's overdue, or maybe you could call it overdue instead of behind. Stuff that was due on days other than today, before today, but that are not done yet, et cetera. The today command would not show overdue stuff. It would just show stuff due today, and it would show a warning telling the agent to also issue the overdue command, but it would only show that warning when there is overdue stuff. It should also come with a key. Anytime it prints out anything, it should always include a symbol with each item saying whether or not that item has actual contents in its note other than the front matter. Which would indicate to the agent that it needs to go read that thing. Now the CLI doesn't have to tell it to go read it. It just would have a key in the printout at the top. It would have the symbol and then equals and then like a sentence that says something like item has readable notes contents. Then it would show that symbol with each item that has note contents other than front matter. Then the agent can decide or not if it needs to read anything. It just tells it. That way it can avoid wasting context summoning the contents of items that don't have any.

They should also be able to request flatten the lists things that aren't trees or graphs, just a flat list of stuff. And it should have be able to support filters and. Sort everything should be not everything, but you know the flat list stuff should all be sortable. So that it could say just show me all tasks or just show me all tasks do today or just show me all tasks part of this project or just show me. All tasks that are in the backlog or of status X or do on ex date or starting ex date or that have a start date due date range longer than X or shorter than X or whatever.

Any other ideas?

**[Assistant]**

Now we're designing the thing that matters most — the printout. Let me lock the model you described and then actually mock it up, because the format is where this lives or dies.

## `tree` becomes universal

`pm tree <id>` works on **any** item, and the flags compose:

```
pm tree <id> [--sub] [--needs] [--blocks] [--all] [--depth N]
   --sub     children (milestones/tasks/subtasks) — the lineage view (default)
   --needs   things this depends on (upstream)
   --blocks  things that depend on it (downstream)
   --all     sub + needs + blocks
```

So `pm tree mstn-mvp --sub` is a milestone and its subtasks; `pm tree task-api --needs --blocks` is that task's dependency neighborhood; `pm tree proj-fiverr --all` is the whole picture. Same command, one mental model.

## What it actually looks like

Every printout opens with a **legend**, and every item carries the **content symbol** so the agent knows what's worth reading — nothing else. `pm tree mstn-mvp`:

```
legend:  ✎ has notes to read   ○ todo  ◐ doing  ● done  ⊘ blocked   ▸N children

◐ [mstn-mvp] MVP milestone            due 2026-07-20   3/8 done
   ○ [task-copy]   Write landing copy   due 2026-07-16   ✎
   ◐ [task-api]    Wire order API       due 2026-07-18   ✎ ▸2
      ○ [task-auth]    Auth flow         due 2026-07-17
      ○ [task-webhook] Webhooks                          ✎
   ○ [task-qa]     QA pass              ⊘ blocked-by task-api
```

The agent reads that in one glance: statuses, due dates, which two items (`task-copy`, `task-api`, `task-webhook`) have real notes to fetch, and what's blocked. It only spends context on `show` for the `✎` items.

## `today` — the one your agents will live in

Lineage-shaped (project → milestone → task), **due-today only**, ancestors shown as context headers even though they aren't themselves "due today." Overdue is *hidden* but flagged:

```
pm today

⚠ 3 items overdue — run `pm overdue`

legend:  ✎ has notes to read   ○ todo  ◐ doing
today = 2026-07-16

Fiverr Machine Launch
   MVP milestone
      ○ [task-copy]  Write landing copy   ✎
      ◐ [task-api]   Wire order API       ✎
Community Garden
   ○ [task-flyer]  Design flyer

2 projects · 3 due today · 3 overdue (hidden — run `pm overdue`)
```

The `⚠` line only appears when overdue items exist, exactly as you said.

## `overdue` — the companion

```
pm overdue

legend:  ✎ has notes to read   !Nd = overdue by N days
today = 2026-07-16

Fiverr Machine Launch
   MVP milestone
      ○ [task-logo]  Design logo     due 2026-07-12  !4d  ✎
      ○ [task-dns]   Configure DNS   due 2026-07-15  !1d

3 overdue across 1 project
```

## `deps` — the dependency graph

```
pm deps task-api

◐ [task-api] Wire order API

needs (must finish first):
   ● [task-schema]  DB schema      done
   ○ [task-auth]    Auth service   todo   ⊘ still blocking this

blocks (waiting on this):
   ○ [task-qa]      QA pass
   ○ [task-deploy]  Deploy         ⊘ also blocked downstream

⚠ blocked: [task-auth] upstream is not done
```

## `ls` — the flat, filterable, sortable list

For "just show me tasks matching X," no tree — a table (or `--porcelain` TSV, or `--json`):

```
pm ls --status todo --due-before 2026-07-20 --project fiverr --sort due

id            status  due         notes  title
task-dns      todo    2026-07-15  ·      Configure DNS   (!1d)
task-copy     todo    2026-07-16  ✎      Write landing copy
task-auth     todo    2026-07-17  ·      Auth service
```

Filters compose freely: `--status`, `--due today|before X|after X|range`, `--start ...`, `--project`, `--milestone`, `--tag`, `--assignee`, `--type task|milestone`, `--duration >Nd|<Nd` (your "start→due range longer/shorter than X"), `--has-notes`. Sort on any column.

## Editing exists — and I'll make it central

You're right that it was buried. The mutation surface:

- `pm set <id> status=doing due=2026-09-01 priority=high title="…"` — edit any field.
- `pm depend <id> --on <id>` / `pm undepend <id> --on <id>` — add/remove dependencies (cycle-checked via the scheduler).
- `pm mv <id> --parent <id>` (reparent) · `pm mv project <id> --dir "Areas/Income Projects"` (folder move) · `pm rename <id> "…"` (bidirectional) · `pm archive <id>`.

## Other ideas worth stealing

- **Size hint on the content symbol** — `✎24` = ~24 lines of notes, so the agent can budget context *before* deciding to read. Cheap to compute (the store already knows body length).
- **`pm agenda <date|range>`** — `today` generalized: `pm agenda 2026-07-20`, `pm agenda this-week`. Same lineage shape.
- **`pm blocked`** — everything currently blocked and by what; the natural third sibling to `today`/`overdue`.
- **`pm log --since 2h`** — what changed recently, so an agent resuming a session catches up without re-scanning everything.
- **Progress rollups** — the `3/8 done` I slipped into the milestone line; free, and great for an agent gauging state.
- **`next` vs `today` are different tools** — `next` = unblocked *actionable* work (dependency-aware, ignores dates); `today` = date-driven. Keep both; document the distinction so agents pick right.
- **One warning channel** — every `⚠` line uses the same prefix (overdue, blocked, cycle-detected), so an agent can grep warnings consistently.
- **Everything has `--json`** with the stable `{ok, data, warnings, changed_ids}` envelope — the pretty views above are for the agent to *read*; JSON is for when it wants to *parse*.

Two things I'd want your gut on: (a) status as **glyphs + legend** (compact, token-cheap) vs **spelled-out words** (zero ambiguity) — I leaned glyph; and (b) the content symbol — plain `✎`, or `✎24` with the size hint? And does the `today` lineage shape match what you pictured, or did you want dependencies woven into it too?

**[Engineer]**

You should also be able to add Contents to a note from the CLI, even though you could also just elect to add that directly to the markdown file itself, but you get what I'm saying. You could add contents to a task or a project or a milestone or whatever is already supported.

Also using the CLI to move the date of something should also move all the dates of its dependencies or the things depending on it, I guess. And all of its sub items. So if it's a task and has subtasks or if it's a task that other that sibling tasks are dependent on, or milestones, et cetera. Same for submilestones, whatever. You get it.

Yes, I like glyphs plus legend. Instead of the plain pencil, I like the idea of having the pencil with the number, with the size hint, that's good too. And the today lineage shape looks good. Although you have the overdue hint twice, which seems unnecessary and seems like you're pushing the agent to do it instead of just providing the option.

Also, I'd like to include a flag that links things. And if you create a task and the task is part of a milestone, it'll link it to the milestone. If you create a milestone and it's part of a project, it'll link it to the project note. And if you create a task directly under the project, it'll link it to the project note. If you create a task under a task, it'll link it to the task. And by link, I mean, in addition to the front matter that's already doing that, you can actually add an obsidian wiki link to the note body. And the thing that indicates which notes have contents should ignore that. Because otherwise it would just always show on everything because everything will have that in theory. That way, when I look at the obsidian graph that shows me all my connected notes, it will include my projects and tasks and stuff, which is an important part of how I personally use my obsidian. And this isn't something the agent should have to do. It's just something that both the plugin and the CLI will do. So that's by default. You can't turn it off. It'll just always happen. Anytime you create anything, it links to its parents with a wiki link. In addition to the normal front matter stuff that it's already doing. So this isn't replacing anything. It's additive. Just to make our system play nicely with the other non-PM plugin obsidian features. We also need a way to look at all open stuff, whether or not it's unblocked and whether or not it's today and whether or not it's next, just all open stuff. And that should also be, have the same or a similar shape as the today view, the today printout. And stuff should be organized by lineage and by, and be indented by, dependency, etc. And then maybe include in the key something that shows blocked stuff. Character for blocked stuff and then show that character with stuff that is currently not unblocked.

**[Assistant]**

Great additions — these sharpen it a lot. Let me fold each in.

## Add contents from the CLI — `pm note`

```
pm note task-copy --append "Draft headlines: A) ship faster  B) …"
pm note task-copy --set    "…replace whole body…"
pm note task-copy --prepend "TODO before QA: …"
```

Goes through the store, so hydration/self-write are handled, and it flips the `✎` indicator on. Yes, you *could* edit the `.md` directly — this is the sanctioned path that keeps everything consistent.

## Date moves cascade — `pm shift` / `set due`

Moving a date ripples through the **subtree** (contained items move with their parent) and **downstream dependents** (via the scheduler), and it's fully previewable:

```
pm shift task-api +3d --dry-run

[task-api] Wire order API        2026-07-18 → 2026-07-21
   ↳ [task-auth]   subtask        2026-07-17 → 2026-07-20
   ↳ [task-qa]     depends-on     2026-07-22 → 2026-07-25
   ↳ [task-deploy] depends-on     2026-07-24 → 2026-07-27
4 items would move · drop --dry-run to apply · --no-cascade to move only task-api
```

One thing for your gut: cascade **on by default** (respecting each project's `autoSchedule` flag), with `--no-cascade` to move a single item? That matches "moving a date should move the others," but I want to confirm you want it automatic rather than opt-in.

## Today — fixed (overdue mentioned once)

You're right, I double-nudged. Single neutral mention, top only:

```
pm today

⚠ 3 overdue — pm overdue

legend:  ✎N = N lines of notes to read   ○ todo  ◐ doing
today = 2026-07-16

Fiverr Machine Launch
   MVP milestone
      ○ [task-copy]  Write landing copy   ✎6
      ◐ [task-api]   Wire order API       ✎12
Community Garden
   ○ [task-flyer]  Design flyer

2 projects · 3 due today
```

The footer no longer re-mentions overdue — the `⚠` line is the single, optional pointer.

## `open` — all open work, lineage-shaped, blocked-aware

Everything not done, regardless of today/next/blocked — same shape as `today`, with a blocked glyph in the key and on any currently-blocked item:

```
pm open

legend:  ✎N notes   ○ todo  ◐ doing   ⊘ blocked (by …)
today = 2026-07-16

Fiverr Machine Launch
   MVP milestone
      ◐ [task-api]   Wire order API     due 2026-07-18  ✎12
         ○ [task-auth]  Auth flow        due 2026-07-17
      ○ [task-qa]    QA pass            ⊘ blocked by task-api
   Launch milestone
      ○ [task-dns]   Configure DNS      due 2026-07-15  (!1d)
Community Garden
   ○ [task-flyer]  Design flyer

12 open · 1 blocked
```

You said "organized by lineage *and* indented by dependency" — those are two hierarchies that can fight. My proposal: **lineage is the backbone** (project → milestone → task → subtask), and dependency shows up as the `⊘ blocked by …` annotation plus nesting a dependent under its blocker *when they share a parent*. If you'd rather flip it, `pm open --by deps` could make dependency the primary spine instead. Which feels more natural to you as the default?

## Auto-linking parents in the body — always on, additive

This one's bigger than the CLI, so let me make sure I've got it exactly: **on every create, both the plugin and the CLI add a live `[[wikilink]]` to the immediate parent in the note body** (task → its milestone / parent task / project; milestone → its project or parent milestone), *in addition to* the existing frontmatter refs. Never optional, can't be turned off, purely additive — so your Obsidian graph shows the whole project structure as connected notes. The agent never has to think about it.

The critical coupling you flagged: **the `✎` content-detector must ignore these auto-links**, or every note lights up as "has content." So the detector counts a note as having real content only *after* stripping frontmatter **and** the managed parent-link. My proposed mechanism: the plugin writes the link on a managed line with a sentinel it recognizes, e.g.

```
Part of [[MVP milestone]] <!-- pm:link -->
```

The `[[link]]` is plainly visible so the graph indexes it; the trailing `<!-- pm:link -->` marks the line as auto-managed so the detector (and the size-hint count) skips it. One thing I'd verify at build time: that the sentinel doesn't suppress graph indexing — if it does, we move the marker rather than wrap the link. Placement I'd default to the **top** of the body.

Because this changes what the plugin writes to note bodies (and touches the same content-detection the `✎` symbol and INT-013 ingestion rely on), it's really **its own plugin intent** (INT-020, "parent backlinks + content-aware detection"), with the CLI mirroring the identical rule. Good to build the plugin side first so the CLI just inherits it — same reuse thesis.

---

That's a meaningful pile of decisions now. Want me to **capture all of this into `docs/cli-design.md`** (updated command table, the mockups, the auto-link/detector rule, the cascade semantics) so it's durable and not just living in this chat? I'll keep it discussion-only — no build — but you'd have the full spec to react to. And my three open gut-checks for you: **(a)** cascade on-by-default vs opt-in, **(b)** `open` lineage-primary vs `--by deps`, **(c)** auto-link at top-of-body with the sentinel approach.

**[Engineer]**

Agreed and that's everything so write the intent with the intention tests and Then use the orchestrate intent feature to drive the intent all the way through implementation, then land the intent and lock it. Then reinstall the plugin and stage commit and push everything.

Then find any notes in obsidian in the second brain vault that talk about how to organize tasks and projects and stuff and replace them with our new guide and a description of the new system. Because anything in here other than the stuff that describes the PM plugin is way out of date and not used anymore. And make sure you describe the CLI as well as the canonical path for interacting with projects and tasks, et cetera. Also explain that.

Also as part of the intent, a project folder should be created for every underscore tasks folder, and that should always be inside of its project folder so that there's free form content in the project and then the tasks folder within that project folder, if that makes sense. The _Tasks folder can still have the project name with it. You don't have to change how that's named. Just automatically always make a parent project folder at the path for that project and then make the tasks folder under it so that we're making room for freeform content in the project.

<!-- END VERBATIM -->
