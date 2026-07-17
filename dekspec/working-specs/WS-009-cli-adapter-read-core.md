# Working Spec: `pm` CLI — adapter + read/nav core

## Status

ACCEPTED

## Created

2026-07-16

## Modified

2026-07-16

## Related Architecture Elements

- AE-013: Agent-first `pm` CLI — the foundation phase: the `obsidian` shim, `NodeVaultAdapter`, `PmContext`, vault/settings resolution, handle resolution, the JSON envelope + exit codes, and the read/navigation command set.
- AE-001: Task & Project Persistence Store — reused UNMODIFIED; read commands delegate to `discoverProjects` / `loadProject` / `flattenTasks` / `configFor` / `hasBodyContent` / `bodyContentLines`.

## Governing ADRs

- none

## What This Does

Furnishes a real-filesystem `App` so the UNMODIFIED `ProjectStore` runs on Node, and ships the read/navigation surface an agent scans with. `NodeVaultAdapter` is a faithful real-disk port of `test/fakeVault.ts` (`vault` + `fileManager` + `metadataCache`); the `obsidian` shim supplies `TFile`/`TFolder`/`TAbstractFile`, `parseYaml` (via the `yaml` package), `normalizePath`, and a no-op `Notice`. `PmContext` resolves the vault root (`--vault` → `PM_VAULT` → walk up for `.obsidian/` → `E_NO_VAULT`), reads `PMSettings` from the vault's `data.json` merged over `DEFAULT_SETTINGS`, constructs `new ProjectStore(app, () => settings)`, and resolves handles (id | slug-path | `id:`/`path:`). Every command emits the stable JSON envelope `{ok, command, data|error, changed_ids, warnings, meta}` (default) with `--pretty`/`--porcelain`/`--ndjson` alternates, mapped onto deterministic exit codes. Read verbs: `projects`, `tree <handle> [--sub --needs --blocks --all --depth]` (compact greppable / JSON / NDJSON, with a status glyph legend + the INT-021 `✎N` content symbol), `today`, `overdue`, `open`, `blocked`, `next`, `deps`, `path`, `show`, `find`/`ls`, `agenda`, `log`, `palette`, `schema`.

**Mechanism:** This component ports the in-memory fake vault to real disk and exposes a token-frugal, machine-parse-optimized read/navigation surface over the unmodified store.

## What This Does NOT Do

- Does not mutate the vault (create/update/restructure land in WS-010/011/012).
- Does not modify `src/store/**` — the store runs unmodified over the adapter.
- Does not write `data.json` — settings/palette are read-only.
- Does not implement live/daemon mode (`watch`), `snapshot`/`restore`, or a real (non-`null`) `metadataCache` — deferred to a follow-on Intent.

## Interfaces

### Data Interfaces

| Interface | Direction | Type / Shape / Dtype | Source or Consumer | Guarantees |
|-----------|-----------|----------------------|--------------------|------------|
| `createPmContext({vault})` | out | `Promise<PmContext>` with `{ vaultRoot, store, settings }` | CLI internals / R41 | constructs the UNMODIFIED `ProjectStore` over `NodeVaultAdapter`; real-fs round-trip (R41) |
| JSON envelope | out | `{ ok, command, data?, error?, changed_ids?, warnings?, meta? }` | stdout → agent | stable key order, ids-first, typed; exactly one of `data`/`error`; present on every command |
| `runPm(argv, {vault})` | out | `Promise<{ exitCode, stdout, envelope }>` | test/`bin/pm.ts` | pure dispatch; never throws for command errors — returns an `ok:false` envelope + nonzero exit |
| `tree` node array | out | `data.legend: string`; `data.nodes: Array<{ id, depth, parentId, status, title, type, content_lines, has_content }>` | agent | `--sub` includes the subtree; `legend` documents `○ ◐ ● ⊘`; `content_lines` from the INT-021 detector (R43) |
| `today` payload | out | `data.items: Array<{ id, title, due, lineage[] }>`; `data.overdue: pointer \| null` | agent | lineage-shaped; a single overdue pointer present ONLY when overdue work exists (R44) |
| Exit code | out | integer `$?` | shell/agent | 0 ok; 2 usage; 4 `E_NO_VAULT`; 6 `E_AMBIGUOUS`; 7 `E_NOT_FOUND` (5/8/9 in WS-010..012) |

### Dependencies

| Dependency | Interface | Failure behavior |
|------------|-----------|-----------------|
| AE-001 `discoverProjects`/`loadProject`/`flattenTasks`/`configFor` | store read surface | a missing/malformed file is tolerated by the store (self-heal / skip), surfaced as `warnings[]` |
| AE-001 `hasBodyContent`/`bodyContentLines` (INT-021) | content detector | powers the `✎N` symbol; a note that is only the managed backlink reports 0 |
| Node `fs` / `os` / `path` | real filesystem | a missing vault root → `E_NO_VAULT` (exit 4) |
| `yaml` package | `parseYaml` in the shim | malformed YAML → the store's `parseFrontmatter` returns `{frontmatter:null}`; the file is skipped, not fatal |

## Domain Constraints

| Constraint | Value | Scope | Rationale |
|------------|-------|-------|-----------|
| Store unmodified | no change to `src/store/**` | all-IBs | the reuse thesis — id-minting/scheduler/layout/detection come for free |
| Envelope default | JSON envelope is the default output | all-IBs | agent-first parse reliability + token economy |
| `metadataCache` may miss | `getFileCache` may return `null` | WS-009 | the store treats a miss as read+parse; MVP adapter returns `null` |
| Atomic writes | `vault.process` writes via tmp-file + rename | WS-009 | the store relies on `process` atomicity |
| Deterministic | same inputs → same bytes (modulo `meta` timestamps) | all-IBs | scriptability |

## Business Rules

1. **general** `NodeVaultAdapter` satisfies the full `vault`/`fileManager`/`metadataCache` surface the store needs (a real-disk port of `test/fakeVault.ts`), so `ProjectStore` runs UNMODIFIED and a project+task round-trips through real disk (R41).
2. **general** Every command emits exactly one stable JSON envelope by default, ids-first; absence of a field is never ambiguous; a thrown error becomes an `ok:false` envelope + nonzero exit, never a stack trace.
3. **general** `tree <handle> --sub` works on ANY item (project/milestone/task/subtask), emits the nested subtree as a flat pre-order `data.nodes[]` with a `data.legend` documenting `○ ◐ ● ⊘`, and a per-node `content_lines` from the INT-021 detector — 0 for a managed-backlink-only note, ≥1 for prose (R43).
4. **general** `today` returns lineage-shaped due-today `data.items[]` and a single optional `data.overdue` pointer present ONLY when overdue work exists (R44).
5. **general** Exit codes are deterministic: 0 success, 2 usage, 4 `E_NO_VAULT`, 6 `E_AMBIGUOUS`, 7 `E_NOT_FOUND`; an unknown handle exits 7 with `error.code = 'E_NOT_FOUND'`, never a crash.

## Failure Behavior

| Failure | Detection | Assertion type | Behavior | Recovery |
|---------|-----------|---------------|----------|----------|
| Vault root not found | `PmContext` resolution | assert | `E_NO_VAULT` (exit 4) listing `--vault`/`PM_VAULT`/`.obsidian/` | caller supplies a vault |
| Unknown handle | `resolveHandle` miss | assert | `E_NOT_FOUND` (exit 7), `ok:false` | caller fixes the ref |
| Ambiguous slug | `resolveHandle` >1 match | assert | `E_AMBIGUOUS` (exit 6) listing candidate ids | caller uses the id |
| Malformed frontmatter | store `parseFrontmatter` | log | file skipped; surfaced in `warnings[]`; never fatal | none needed |

## Open Issues

- [ ] MVP `metadataCache.getFileCache` returns `null`; a real lazy cache (reserializer matching `appendYaml`) is a later-phase follow-on. — **Severity:** `P3`
- [ ] Keep `cli/**` out of the plugin `tsdown` build and the `src/`-scoped `pnpm check`/`check:submission`; the CLI carries its own `tsconfig`/lint. — **Severity:** `P2`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | WS authored at ACCEPTED under INT-019 `--decompose` (phase A; acceptance criteria = R41, R43, R44 in `cli/pm.test.ts`). | Claude (engineer-directed) |
