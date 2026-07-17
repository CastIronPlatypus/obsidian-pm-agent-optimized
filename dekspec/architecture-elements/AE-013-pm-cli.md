# AE-013: Agent-first `pm` CLI

## Status

ACCEPTED

## Subtype

Container

## Classification

Core

## Created

2026-07-16

## Modified

2026-07-16

## Linked Artifacts

- **Related ADRs:** none
- **Related WSs:** WS-009, WS-010, WS-011, WS-012
- **Related ICs:** none
- **Related IBs:** IB-009, IB-010, IB-011, IB-012
- **Related Intents:** INT-019
- **Owners:** Jeff Haskin

## Implements

- `cli/**`

## Purpose and Scope

`pm` is a headless, agent-first command-line tool that lets an AI agent (or a
human at a shell) create, read, navigate, update, restructure, and analyze the
projects / milestones / tasks / subtasks / dependencies the Obsidian "Project
Manager" plugin stores as Markdown — **by reusing the plugin's own `src/store`
domain code UNMODIFIED over a Node filesystem-backed vault adapter.** The CLI
ships as a separate package under `cli/`, outside the plugin build (`tsdown` never
sees it), and depends on the plugin sources by path.

The reuse thesis: `ProjectStore` (AE-001) talks to Obsidian only through a narrow
slice of `app.vault` / `app.fileManager` / `app.metadataCache` plus a few value
classes (`TFile`, `TFolder`, `normalizePath`, `parseYaml`, `Notice`). Nothing in
`src/store/**` reaches for the DOM, the workspace, a `Plugin` instance, or
Electron. If the CLI furnishes a real-filesystem `App` and a real-filesystem
`obsidian` module, `ProjectStore` runs unchanged on Node. `test/fakeVault.ts`
already proves the shape in-memory; `NodeVaultAdapter` is that same adapter
pointed at real disk. Consequently id-minting, folder association, the dependency
scheduler, `moveProject`, bidirectional rename, INT-017 materialized palettes,
INT-018 id-authority, INT-020 nested layout, and INT-021 backlinks/detection all
come to the CLI **for free** — the CLI writes no YAML of its own and re-implements
no invariant.

This slice exists so an agent can operate the vault deterministically and
non-interactively: every invocation reads `argv`/stdin and writes a machine-
parseable JSON envelope to stdout, diagnostics to stderr, and a meaningful integer
to `$?`. There is no TUI, no colors-by-default, no interactive prompt.

## Responsibilities

- Provide a real-filesystem `App`-like object (`NodeVaultAdapter` + an `obsidian`
  shim) satisfying the exact `vault`/`fileManager`/`metadataCache` surface the
  store needs, so the UNMODIFIED `ProjectStore` runs on Node against real disk.
- Construct one `PmContext` (store instance + resolved `PMSettings` from the
  vault's `data.json` merged over `DEFAULT_SETTINGS`) per invocation.
- Resolve a vault root (`--vault` flag → `PM_VAULT` env → walk up for `.obsidian/`
  → `E_NO_VAULT`).
- Resolve handles (raw id | slug-path | `id:`/`path:`-prefixed) to entities, with
  ambiguity and not-found as deterministic errors.
- Parse `argv` into a command + flags and dispatch to a verb handler; every verb
  delegates to a real, tested `TaskSource`/`ProjectStore` method.
- Emit a stable JSON envelope (`{ok, command, data|error, changed_ids, warnings,
  meta}`) by default, with `--pretty` / `--porcelain` / `--ndjson` alternates,
  and map outcomes onto deterministic exit codes.
- Honor `--dry-run` / `--explain` / `--no-cascade` on every mutation, computing
  effects against the in-memory tree and writing nothing under dry-run.
- Render token-frugal scanning views (compact greppable tree, `today`/`next`
  lineage-shaped lists) with a glyph legend and the INT-021 `✎N` content symbol.

## Boundaries and Non-Goals

**Inside the boundary:**
- The `cli/**` package: the `obsidian` shim, `NodeVaultAdapter`, `PmContext`,
  handle resolution, the envelope/renderers, argv parsing, and one module per verb
  group, plus the `bin/pm.ts` entry (the only place `process.exit` is called).
- Reading (never writing) the plugin's `data.json` for palette/settings.

**Outside the boundary:**
- Any change to `src/store/**`, `src/types.ts`, `src/dates.ts`, `src/utils.ts` —
  the store runs UNMODIFIED; the CLI adds only new I/O + presentation code.
- The Obsidian plugin runtime, views, modals, and UI primitives (`src/views/**`,
  `src/ui/**`, `src/main.ts`) — the CLI imports none of them.
- Writing UI-only state (`collapsedTasks`, `projectFilters`, saved-view selection)
  in `data.json` — those belong to the plugin.
- A network/sync/multi-vault layer, and any alternative `TaskSource` backend.

## Three-tier Boundaries

<!-- canonical: parsed into the IR `boundaries` field (always_do / ask_first / never_do) -->

**Always do:**
- Route every mutation through a real `TaskSource`/`ProjectStore` method; serialize
  no YAML and re-implement no invariant in the CLI.
- Emit exactly one stable JSON envelope per command by default (ids-first, typed,
  deterministic), map outcomes onto the pinned exit codes, and convert any thrown
  error into an `ok:false` envelope + nonzero exit rather than a stack trace.
- Archive/trash (reversible) rather than hard-delete; guard cycle-forming
  dependencies with `wouldCreateCycle` and collisions with `findTaskFileConflict`
  BEFORE touching disk.

**Ask first:**
- Before letting the CLI WRITE to `data.json` or any `.obsidian/` state — the CLI
  reads settings/palette from there but must not clobber plugin-owned UI state.
- Before adding a long-lived / daemon mode (`watch`) or an advisory lockfile — the
  one-shot, rebuild-per-process model is the default contract.
- Before changing the JSON envelope shape or an exit code — both are a consumed
  contract for scripting agents (pinned in WS-009/WS-010).

**Never do:**
- Never modify `src/store/**` to make a command work — if the store lacks a
  capability, that is an AE-001 change under its own Intent, not a CLI patch.
- Never block on an interactive prompt; ambiguity is a deterministic error, not a
  question.
- Never `fs.unlink` user data; deletion routes to Obsidian trash.

## Relationships and Dependencies

**Consumes:** AE-001's `TaskSource`/`ProjectStore` surface (every command delegates
to it); the plugin's `PMSettings` shape + `DEFAULT_SETTINGS` (`src/types.ts`),
`makeTask`, and `src/dates.ts` helpers; the vault's `data.json` (read-only) for the
resolved palette/settings; the `yaml` package (for the shim's `parseYaml`).

**Produces:** `.md` files with `pm-project`/`pm-task` frontmatter byte-identical to
plugin-authored ones (because the store writes them); a machine-parseable JSON
envelope on stdout; deterministic exit codes.

**Depends on:** Node ≥ 24 with a POSIX-ish filesystem; the plugin sources by path
(no Obsidian/Electron at runtime).

**Consumed by:** an AI agent (or human) driving the vault from a shell; scripts that
branch on the exit codes without parsing JSON.

## Constraints and Quality Notes

- The store runs UNMODIFIED: the CLI's correctness rests on the adapter faithfully
  mirroring `test/fakeVault.ts`'s already-correct logic (recursive folder rename
  re-keying, `ensureFolderForPath`, `processFrontMatter` split/reserialize via
  `appendYaml`) with the `Map` value source swapped for `fs`, and atomic writes
  (tmp-file + rename) so `vault.process` stays atomic.
- `metadataCache.getFileCache` may safely return `null` (the store treats a miss as
  "read + parse the file yourself"); the MVP adapter may return `null`
  unconditionally, deferring a real frontmatter cache to a later phase.
- Deterministic & non-interactive: same inputs → same bytes out (modulo timestamps,
  surfaced explicitly in `meta`).
- Coexistence: the store's 5-second self-write window + cache-invalidation model
  mean a `pm` write and an open Obsidian view reconcile the same way two plugin
  writes do; the CLI rebuilds fresh state per process, so it always reads the
  latest on disk.

## Open Questions / Planned Follow-ons

- [ ] `metadataCache` fidelity: MVP returns `null` (correct, slower on big vaults). A
  real lazy cache whose `processFrontMatter` reserializer matches `appendYaml`
  byte-for-byte is a later-phase follow-on. — **Source:** cli-design §9 — **Severity:** `P3`
- [ ] True concurrent writes: the self-write window handles sequential plugin↔CLI
  edits; two processes writing the same file within a tick can still last-writer-win.
  An advisory lockfile for `batch`/`apply` is deferred. — **Source:** cli-design §9 — **Severity:** `P3`
- [ ] Live mode (`watch --ndjson`), `snapshot`/`restore`, and shell completions are
  deferred to a follow-on Intent (design phase INT-023); INT-019 ships the one-shot
  command surface only. — **Source:** cli-design §10 — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | AE authored at ACCEPTED for INT-019 (agent-first `pm` CLI): a new container under `cli/**` that runs the UNMODIFIED plugin store over a real-fs `NodeVaultAdapter`. Reuse thesis, boundaries (no `src/store/**` change), envelope + exit-code contract, and deferred live-mode captured. Acceptance pre-authorized by the engineer for full-auto session 2026-07-16. | Claude (intent/AE-authoring agent) |
