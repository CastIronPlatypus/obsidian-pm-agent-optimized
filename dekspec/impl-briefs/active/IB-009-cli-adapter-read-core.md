# Implementation Brief: `pm` CLI — adapter + read/nav core

**Spec:** `dekspec/working-specs/WS-009-cli-adapter-read-core.md`
**Intent:** `dekspec/intents/INT-019-agent-first-pm-cli.md`
**Source AEs:** AE-013, AE-001
**Depends on:** none
**Production gate:** none
**Status:** ACCEPTED

## Goal

The UNMODIFIED `ProjectStore` runs on Node over a real-fs `NodeVaultAdapter`, and an agent scans the vault cheaply: `createPmContext({vault})` round-trips a project+task through real disk (R41); `tree <handle> --sub` emits the nested subtree with a status glyph legend + the INT-021 `✎N` content symbol (R43); `today` is lineage-shaped with a single optional overdue pointer (R44) — proven by R41/R43/R44 in `cli/pm.test.ts`.

## Out of Scope

- Any mutation (create/update/restructure) — WS-010/011/012.
- Any change to `src/store/**`.
- Writing `data.json`; a real (non-`null`) `metadataCache`; live `watch` mode.

## Files to Modify

| File | Change |
|------|--------|
| `cli/src/obsidian-shim.ts` | New. Export `TFile`/`TFolder`/`TAbstractFile` classes with the `path`/`name`/`basename`/`extension`/`parent`/`children` fields the store reads; `parseYaml` (delegate to the `yaml` package); `normalizePath` (POSIX slashes, collapse `//`, strip leading/trailing `/`); a no-op `Notice` that optionally forwards to `warnings[]`. Model on `test/obsidian-stub.ts`. |
| `cli/src/NodeVaultAdapter.ts` | New. A real-disk port of `test/fakeVault.ts`: keep the `Map<path, TFile>`/`Map<path, TFolder>` mirror, hydrate it by scanning the vault dir on construction (build the folder tree eagerly, defer file reads), and mutate disk + mirror together on every write. Reuse FakeVault's logic almost verbatim (recursive folder-rename re-keying, `ensureFolderForPath`, the `processFrontMatter` split/reserialize via `appendYaml`), swapping the `Map` value source for `fs`. Writes go through tmp-file + `rename` so `vault.process` stays atomic. `metadataCache.getFileCache` returns `null` (MVP). `getMarkdownFiles()` enumerates the tree walk. |
| `cli/src/PmContext.ts` | New. `createPmContext({vault})`: resolve the vault root (`--vault` → `PM_VAULT` → walk up for `.obsidian/` → `E_NO_VAULT`), read `PMSettings` from `<vault>/.obsidian/plugins/project-manager/data.json` merged over `DEFAULT_SETTINGS` (same as `PMPlugin.loadSettings`), construct `new ProjectStore(app, () => settings)`, expose `{ vaultRoot, store, settings }` + `resolveHandle`. |
| `cli/src/handles.ts` | New. `resolveHandle(ctx, ref)`: id → slug-path → `id:`/`path:`-prefixed; `E_AMBIGUOUS` (6) / `E_NOT_FOUND` (7). |
| `cli/src/envelope.ts` | New. Build + serialize the JSON envelope; `--pretty`/`--porcelain`/`--ndjson`; the exit-code map (0/2/4/6/7; 5/8/9 for later phases). |
| `cli/src/render.ts` | New. Compact greppable tree + the flat pre-order `data.nodes[]` (id/depth/parentId/status/title/type/content_lines/has_content); the `○ ◐ ● ⊘` legend; the `✎N` symbol from `hasBodyContent`/`bodyContentLines`. |
| `cli/src/run.ts` | New. `runPm(argv, {vault})`: parse global flags + verb, dispatch to the read/nav handlers (`projects`/`tree`/`today`/`overdue`/`open`/`blocked`/`next`/`deps`/`path`/`show`/`find`/`agenda`/`log`/`palette`/`schema`), return `{ exitCode, stdout, envelope }`. Never throws for command errors. |
| `cli/src/commands/read.ts` | New. The read/nav verb handlers delegating to `discoverProjects`/`loadProject`/`flattenTasks`/`configFor`/`hasBodyContent`/`bodyContentLines`. |
| `cli/bin/pm.ts` | New. The argv entry: `runPm(process.argv.slice(2))` → write `stdout`, `process.exit(exitCode)`. The only `process.exit`. |
| `cli/package.json`, `cli/tsconfig.json` | New. Separate package; tsconfig `paths` alias `obsidian` → `./src/obsidian-shim`. Keep out of the plugin `tsdown` build + `src/`-scoped `pnpm check`. |
| `cli/pm.test.ts` | (Owned by test worker — not modified here; R41/R43/R44 are the acceptance oracle.) |

## Reuse Inventory

| Capability | Location | Use instead of reimplementing |
|------------|----------|-------------------------------|
| In-memory vault adapter shape | `test/fakeVault.ts` | port to real fs; reuse the rename re-keying + `processFrontMatter` reserialize logic |
| `obsidian` stub classes | `test/obsidian-stub.ts` | model the production shim on it |
| `getSettings` closure + defaults merge | `src/main.ts` `loadSettings`, `DEFAULT_SETTINGS` | reuse the identical merge |
| Discovery / flatten / config / content detection | `discoverProjects`/`flattenTasks`/`configFor`/`hasBodyContent`/`bodyContentLines` (`src/store`) | reuse — the CLI renders, the store computes |

## Domain Constraints

| Constraint | Value |
|------------|-------|
| Store unmodified | no change to `src/store/**` |
| Envelope default | JSON envelope is the default output |
| Atomic writes | `vault.process` via tmp-file + rename |
| `metadataCache` may miss | `getFileCache` returns `null` (MVP) |

## Do Not Touch

| Function/File | Reason |
|---------------|--------|
| `src/store/**`, `src/types.ts`, `src/dates.ts` | the store runs UNMODIFIED — reuse thesis |
| `test/fakeVault.ts`, `test/obsidian-stub.ts` | precedents to model on, not to edit |
| `cli/pm.test.ts` | owned by the test worker |

## Governing ADRs

| ADR | Title |
|-----|-------|
| none | — |

## Constraints & Decisions

- **Reuse thesis:** furnish a real `App`; the store runs unmodified. The adapter's correctness rests on faithfully mirroring FakeVault.
- **Envelope + exit codes** are a consumed contract: 0 ok; 2 usage; 4 `E_NO_VAULT`; 6 `E_AMBIGUOUS`; 7 `E_NOT_FOUND`.
- **`tree` node shape** is pinned: `data.legend` (with `○ ◐ ● ⊘`) + `data.nodes[]` with `content_lines`.
- **`today`** is lineage-shaped; the overdue pointer is present only when overdue work exists.

## Test plan

- **R41:** `createPmContext({vault})` over a real temp dir; `store.createProject` + `store.discoverProjects`; assert bytes on real disk + a fresh context round-trips.
- **R43:** `tree <milestoneId> --sub`; assert `data.legend` has the four glyphs and per-node `content_lines` (0 for a backlink-only note, ≥1 for prose); an unknown handle → exit 7.
- **R44:** `today`; assert lineage-shaped `data.items[]` + `data.overdue` present only when overdue exists.
- **Guard:** the plugin `pnpm test` for `src/**` stays green; `cli/**` is a separate package.

## Test Promotion Criteria

Promotion refs: WS-009 Rule 1 (R41), Rule 3 (R43), Rule 4 (R44) in `cli/pm.test.ts`.

## Done When

- [ ] `createPmContext` constructs the UNMODIFIED `ProjectStore` over `NodeVaultAdapter`; a project+task round-trips through real disk (R41) — verified by intention test.
- [ ] `tree <handle> --sub` emits `data.nodes[]` + the `○ ◐ ● ⊘` legend + `✎N` from the INT-021 detector (R43) — verified by intention test.
- [ ] `today` is lineage-shaped with a single optional overdue pointer (R44) — verified by intention test.
- [ ] An unknown handle exits 7 (`E_NOT_FOUND`), never a crash — verified by intention test.
- [ ] `cli/**` stays out of the plugin build; `pnpm check`/`check:submission`/`build` (src-scoped) still exit 0 — verified by running them.

## Open Issues

- [ ] Real lazy `metadataCache` (reserializer matching `appendYaml`) — later-phase follow-on. — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | IB authored at ACCEPTED under INT-019 `--decompose` (phase A). No dekbeads CLI present — bead-level work captured as the Done When task list. | Claude (engineer-directed) |
