# INT-019: Ship an agent-first `pm` CLI that runs the unmodified plugin store over a real filesystem

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

Engineer requirement, full-auto session 2026-07-16 — the engineer co-manages projects with an AI agent through plain Markdown and wants the agent to operate the vault directly from a shell: discover, read cheaply, create, edit, restructure, depend, schedule, and analyze projects/milestones/tasks/subtasks — deterministically, non-interactively, and machine-parse-optimized. The full command surface is specified in `docs/cli-design.md` (kept untracked pending review) and refined by the engineer. The load-bearing constraint is the REUSE THESIS: the CLI must run the plugin's UNMODIFIED `src/store` over a Node filesystem-backed vault adapter (`NodeVaultAdapter`, the real-fs analog of `test/fakeVault.ts`), so id-minting, folder association, the scheduler, `moveProject`, bidirectional rename, and the INT-017/018/020/021 hardening all come for free. Acceptance (PROPOSED → ACCEPTED) pre-authorized by the engineer for this session ("engineer-directed full-auto 2026-07-16"). Behavioral contract pinned in `cli/pm.test.ts` requirements R41–R46 (authored by the test worker; the assertions land red-first via feature-detection).

## Superseded-By

none

## Created

2026-07-16

## Modified

2026-07-16

## Linked Architecture Elements

- AE-013: Agent-first `pm` CLI — the NEW container this Intent creates under `cli/**`: the `obsidian` shim, `NodeVaultAdapter` (real-fs `App`), `PmContext`, handle resolution, the JSON envelope + renderers, argv dispatch, one module per verb group, and the `bin/pm.ts` entry. This is where all new I/O and presentation code lands.
- AE-001: Task & Project Persistence Store — reused UNMODIFIED. Every CLI mutation delegates to a real, tested `TaskSource`/`ProjectStore` method (`discoverProjects`, `createProject`, `insertTask`, `updateTask`, `moveTask`, `moveProject`, `renameProject`, `archiveTask`, `duplicateTask`, `scheduleAfterChange`, `wouldCreateCycle`, `configFor`, `findTaskFileConflict`, …). The CLI writes no YAML and re-implements no invariant; this Intent does NOT modify AE-001.

## Motivation

The engineer runs their vault as a portfolio co-managed with an AI collaborator. Today the AI can only touch the vault by hand-writing Markdown files and relying on the plugin's ingestion/self-heal to legitimize them — there is no deterministic, non-interactive, machine-parse-optimized surface for an agent to discover, read cheaply, create, edit, restructure, depend, and analyze projects the way the Obsidian UI can. The plugin's entire domain model already lives in `src/store/**` and reaches Obsidian only through a narrow `vault`/`fileManager`/`metadataCache` slice; `test/fakeVault.ts` proves that slice can be furnished off-Obsidian. The unclosed gap is that there is no real-filesystem adapter + command layer to let an agent drive that store from a shell. The cost of not closing it is an agent that scaffolds blindly with `echo > file.md` and cannot cheaply scan, safely mutate, or reason about dependencies/schedule — everything the store already does well is unreachable headless.

## Desired Outcome

A headless `pm` CLI, shipped as a separate `cli/**` package, lets an agent fully operate the vault:

- **Reuse thesis proven end-to-end (R41).** A `NodeVaultAdapter` + `obsidian` shim furnish a real-filesystem `App`; `PmContext` constructs the UNMODIFIED `ProjectStore` over it; a project + task created through the store round-trip through real disk and back into a fresh context.
- **Create, machine-parse-optimized (R42).** `new task --project X --parent Y` mints an id, places the file in the INT-020 nested layout, wires `parentId` + the INT-021 sentinel backlink, and returns the id in a stable JSON envelope so the agent chains without a second lookup.
- **Token-frugal scanning + content awareness (R43).** `tree <handle> --sub` works on ANY item, emits the nested subtree with a status glyph legend and the INT-021 `✎N` content symbol (a managed-backlink-only note shows no content; prose shows `✎N`).
- **Situational read views (R44).** `today` returns lineage-shaped due-today items with a single optional overdue pointer (present only when overdue work exists); the `--json` envelope is stable.
- **Safe, cascading mutation (R45).** `set <id> due=…` writes through `updateTask` and runs the dependency scheduler once, cascading to dependents; `--dry-run` computes and reports the effect without writing.
- **Declarative project-as-code (R46).** `apply <spec>` idempotently upserts a whole nested tree by client `key`, and a re-run of the identical spec is a no-op.

Every command emits the stable envelope `{ok, command, data|error, changed_ids, warnings, meta}` (default), honors `--dry-run`/`--explain`/`--no-cascade`, and maps outcomes onto deterministic exit codes (0 ok; 2 usage; 4 `E_NO_VAULT`; 5 `E_CYCLE`; 6 `E_AMBIGUOUS`; 7 `E_NOT_FOUND`; 8 `E_CONFLICT`; 9 `E_BATCH`; 1 generic). Nothing hard-deletes; cycles and collisions are rejected before disk.

## Non-Goals

- **No change to `src/store/**` or any plugin source.** The store runs UNMODIFIED; the CLI adds only new I/O + presentation code under `cli/**`. (If a command needs a store capability that does not exist, that is an AE-001 change under its own Intent.)
- **No TUI / colors-by-default / interactive prompts.** Ambiguity is a deterministic error, not a question.
- **No new storage format or schema migration** beyond what the store already does.
- **No writing of plugin-owned UI state** (`collapsedTasks`, `projectFilters`, saved-view selection) in `data.json` — the CLI reads settings/palette from there but does not clobber it.
- **No live/daemon mode in this Intent.** `watch --ndjson`, `snapshot`/`restore`, a real `metadataCache`, advisory locking, and shell completions are deferred to a follow-on Intent (design phase INT-023). INT-019 ships the one-shot command surface.
- **No network/sync/multi-vault federation; no alternative `TaskSource` backend.**

## Type-specific required fields

### `feature` — Desired Outcome

The new behavior is user-observable and contract-pinned in `cli/pm.test.ts`: (R41) `NodeVaultAdapter`+`PmContext` drive the unmodified `ProjectStore` against a real temp-fs vault and round-trip a project+task; (R42) `new task --project X --parent Y` creates the nested-layout file with a minted id, wired `parentId` + INT-021 backlink, and returns the id in the envelope; (R43) `tree <milestoneId> --sub` emits the nested subtree with the glyph legend + `✎N` content symbol; (R44) `today` is lineage-shaped with a single optional overdue pointer; (R45) `set <id> due=…` cascades to a dependent and `--dry-run` writes nothing; (R46) `apply <spec>` is an idempotent upsert. See the Desired Outcome above for the full narrative.

## Components affected

- `cli/src/obsidian-shim.ts` — production `obsidian` module (TFile/TFolder/TAbstractFile classes, `parseYaml` via `yaml`, `normalizePath`, `Notice`).
- `cli/src/NodeVaultAdapter.ts` — the real-fs `{ vault, fileManager, metadataCache }` (a faithful real-disk port of `test/fakeVault.ts`).
- `cli/src/PmContext.ts` — constructs `ProjectStore` over the adapter; resolves vault root + settings; handle resolution.
- `cli/src/run.ts` + `cli/src/envelope.ts` + `cli/src/render.ts` + `cli/src/handles.ts` — argv dispatch, the JSON envelope + exit codes, compact/rich/`✎N` renderers.
- `cli/src/commands/*.ts` — one module per verb group (read/nav, create, update/restructure, deps/schedule/analysis, apply/batch).
- `cli/bin/pm.ts` — the argv entry (the only `process.exit` call).
- `cli/package.json` + `cli/tsconfig.json` — the separate package (paths-aliases `obsidian` → the shim).
- `cli/pm.test.ts` — pins R41–R46 (owned by the test worker).

*Distinct from Linked Architecture Elements.* Components describe blast radius (where the diff lands); the AEs describe spec-graph shape (AE-013 new container revised/created; AE-001 reused unchanged). Both are required.

## Coverage report

*Populated by inline `--analyze` (2026-07-16, full-auto session) against the pinned R41–R46 contract.*

| Gap | Source | Resolution | Status |
| --- | --- | --- | --- |
| No real-filesystem `App` exists, so the store cannot run headless | analyze — R41 vs `test/fakeVault.ts` (in-memory only) | Resolve in this Intent (WS-009): `obsidian` shim + `NodeVaultAdapter` + `PmContext` port the fake adapter to real disk | open |
| No command surface to create/place/wire tasks headless with a returned id | analyze — R42 vs no CLI | Resolve in this Intent (WS-010): `new` verbs delegate to `insertTask`; envelope returns the minted id + filePath | open |
| No token-frugal scanning view with status glyphs + content awareness | analyze — R43 vs no CLI; INT-021 `hasBodyContent`/`bodyContentLines` exist store-side | Resolve in this Intent (WS-009): `tree` renders the flat pre-order node array + legend + `✎N` from the INT-021 detector | open |
| No situational read views (`today`/`next`/`overdue`) | analyze — R44 vs no CLI | Resolve in this Intent (WS-009): lineage-shaped `today` with a single optional overdue pointer | open |
| No safe cascading mutation with dry-run | analyze — R45 vs no CLI; `updateTask`/`scheduleAfterChange` exist | Resolve in this Intent (WS-010 + WS-011): `set` delegates to `updateTask` then one scheduler pass; `--dry-run` writes nothing | open |
| No declarative idempotent project-as-code | analyze — R46 vs no CLI | Resolve in this Intent (WS-012): `apply` upserts by client `key`, re-run is a no-op | open |

## Size assessment

*Populated by inline `--analyze`. Hard caps per Decision #5.*

| Cap | Limit | Measured | Verdict |
| --- | --- | --- | --- |
| Implementation Units (IBs / direct beads) | ≤ 3 | 4 (IB-009..012) | ACCEPTED-WITH-JUSTIFICATION (phased CLI; see below) |
| Components affected | ≤ 3 | new `cli/**` container (many files, one package) | ACCEPTED-WITH-JUSTIFICATION (a whole new container) |
| New L1 artifacts (AEs) | ≤ 1 | 1 (AE-013; AE-001 reused unchanged) | PASS |
| New + revised L2 artifacts (WSes + ICs) | ≤ 3 | 4 (WS-009..012; no IC) | ACCEPTED-WITH-JUSTIFICATION (phased CLI) |
| Coverage gaps | ≤ 4 | 6, all resolved-in-Intent | ACCEPTED-WITH-JUSTIFICATION (no deferrals) |

*Cap justification (delegated authority, engineer-directed full-auto 2026-07-16):* INT-019 is deliberately a LARGE, phased Intent — the CLI is a whole new container whose surface `docs/cli-design.md` explicitly phases (adapter+read core → mutation core → dependencies/scheduling → declarative/batch, the design's INT-019..022). Rather than fragment one cohesive package across several Intents, the phases are captured as FOUR ACCEPTED Working Specs + Implementation Briefs (WS/IB-009 adapter+read core; -010 create+mutation core; -011 dependencies+scheduling+analysis; -012 declarative+batch) under the ONE Intent, each ≤3 net-new components and each independently acceptance-gated by a subset of R41–R46. The over-cap counts (4 IBs, 4 WSes, 6 gaps) are recorded as an accepted deviation, not a silent pass. AE-001 is REUSED UNMODIFIED (no store change), keeping the L1 footprint to the single new AE-013.

## Layer impact analysis

*Populated by inline `--analyze`. Explicit "none" preferred over omission.*

| Layer | Artifact | Action |
| --- | --- | --- |
| L1 (Architecture & Decisions) | AE-013 (new CLI container) | new |
| L1 (Architecture & Decisions) | AE-001 (store) | reuse (unchanged) |
| L2 (Specification) | WS-009 (adapter + read/nav core) | new |
| L2 (Specification) | WS-010 (create + single-item mutation core) | new |
| L2 (Specification) | WS-011 (dependencies, scheduling & analysis) | new |
| L2 (Specification) | WS-012 (declarative apply + batch) | new |
| L3 (Implementation) | IB-009, IB-010, IB-011, IB-012 | new |
| L4 (Construction) | beads | new — captured as IB Done-When task lists (no dekbeads CLI in repo) |

## Verification

```yaml
# Verification predicate for INT-019 (feature). All checks must pass for --testpass.
verification:
  - name: typecheck-lint-format-clean
    cmd: pnpm check
  - name: submission-lint-clean
    cmd: pnpm check:submission
  - name: full-suite-green
    cmd: pnpm test
  - name: intention-contract-r41-r46
    cmd: vitest run cli/pm.test.ts -t "Feature 9"
  - name: build
    cmd: pnpm build
```

### Testpass results (2026-07-16)

Diff confinement: the `pm` CLI work shipped on `main` via direct commits (this repo has no `int/` branch corpus and no dekbeads tracker), so the branch-diff and bead-closure gates of `--testpass` are N/A; the Intent locks via ADR-017 Path B (all downstream WS-009..012 / IB-009..012 >= ACCEPTED; linked AE-013 + AE-001 both ACCEPTED — no status inversion). Verification predicate re-evaluated from `main` (Wave A commit 8f16104 + Wave B commit 95069bd):

| Check | Cmd | Result |
| --- | --- | --- |
| typecheck-lint-format-clean | `pnpm check` | PASS (exit 0) |
| submission-lint-clean | `pnpm check:submission` | PASS (exit 0) |
| build | `pnpm build` | PASS (exit 0) |
| cli-typecheck | `tsc -p cli/tsconfig.json` | PASS (exit 0) |
| intention-contract-r41-r46 | `vitest run cli/pm.test.ts -t "Feature 9"` | PASS (6 passed — R41–R46 all green) |
| full-suite-green | `pnpm test` | GREEN — 318 passed, 1 skipped (the pre-existing R21 skip) across 19 files. R41–R46 (`cli/pm.test.ts`) flipped from red-first to green in Wave B; R1–R40 (`src/intention.test.ts`) and every colocated store/CLI unit test remain green. Baseline before Wave B: 2 red (R45/R46); after: 0 red. |

Build-time note (Open Issue, P2 — `apply` key→id location): Wave B persists the `key`→id map in a CLI-owned sidecar at `<vault>/.obsidian/plugins/project-manager/pm-cli-keys.json` rather than a `pmKeys` map on the project file, because the store's `serializeProject` rewrites project frontmatter from a fixed field set (an unknown `pmKeys` key would be dropped on the next save) and AE-001 runs UNMODIFIED. The sidecar keeps identity stable across renames without touching store-owned bytes; relocating it to a vault-native `pmKeys` field remains a follow-on if the store gains a frontmatter escape hatch.

## Outcome Verification

Against a REAL temp-fs vault: `createPmContext({vault})` exposes the unmodified `ProjectStore`; `store.createProject` + `store.insertTask` write real `.md` files a fresh context round-trips back (R41). `pm new task --project X --parent Y` returns a minted id in the envelope and writes the file at `<dir>/<Project>/<Project>_tasks/<slug>.md` with `parentId` wired and a `<!-- pm:link -->` backlink to the parent (R42). `pm tree <milestoneId> --sub` emits `data.nodes[]` + a `data.legend` with `○ ◐ ● ⊘` and per-node `content_lines` reflecting the INT-021 detector — 0 for a managed-backlink-only note, ≥1 for prose (R43). `pm today` returns lineage-shaped `data.items[]` and a `data.overdue` pointer present only when overdue work exists (R44). `pm set <A> due=…` puts A in `changed_ids` and cascades B (the dependent) into `data.scheduled`/`changed_ids`, persisting B's new due; `--dry-run` sets `meta.dry_run=true` and writes nothing (R45). `pm apply <spec>` creates the nested tree on the first run and reports zero `changed_ids` on an identical re-run (R46). These are the red-first outcome tests R41–R46 in `cli/pm.test.ts`. `outcome_verification_grandfathered: false`.

## Open Issues

- [ ] **Build-time packaging (flagged to the implementer):** decide the `cli/` distribution shape — npm bin run via `node`/`tsx`, or a `tsdown`-bundled single CJS file + shebang. The plugin build (`tsdown.config.ts`) must NOT pick up `cli/**`; `pnpm check`/`build`/`check:submission` are `src/`-scoped, so keep CLI type/lint under the CLI's own `tsconfig`/config. — **Source:** cli-design §2.5 — **Severity:** `P2`
- [ ] **`metadataCache` fidelity:** MVP `NodeVaultAdapter.metadataCache.getFileCache` returns `null` (correct via the store's read+parse fallback, slower on big vaults). A real lazy cache is a later-phase follow-on. — **Source:** cli-design §9 — **Severity:** `P3`
- [ ] **`apply` key→id mapping location:** a `pmKeys` map on the project file (vault-native, transparent) vs a sidecar under `.obsidian/`. Leaning `pmKeys` on the project file. — **Source:** cli-design §9 — **Severity:** `P2`
- [ ] **Live mode deferred:** `watch`/`snapshot`/`restore`/completions are out of INT-019 (design phase INT-023). — **Source:** cli-design §10 — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
| --- | --- | --- | --- |
| 2026-07-16 | Substantive | Intent authored at PROPOSED; inline `--analyze` performed against the pinned R41–R46 contract (Coverage/Size/Layer/Verification populated). Reuse thesis (unmodified `src/store` over `NodeVaultAdapter`) pinned; JSON envelope + exit-code contract pinned; live mode deferred to INT-023. New AE-013 (CLI container); AE-001 reused unchanged. Size caps (4 IBs/4 WSes/6 gaps) accepted-with-justification (phased CLI). Acceptance pre-authorized by the engineer in full-auto session. | Claude (intent-authoring agent) |
| 2026-07-16 | Substantive | Promoted PROPOSED to ACCEPTED via /write-intent --accept. Engineer acceptance pre-authorized for full-auto session 2026-07-16 (recorded in Source). No dekbeads CLI in repo — bead authoring gate deferred to IB Done-When task lists at --decompose. | Claude (engineer-directed, pre-authorized) |
| 2026-07-16 | Substantive | Decomposed into 4 IUs (4 IBs, 0 direct beads): WS/IB-009 (adapter + read/nav core), -010 (create + single-item mutation core), -011 (dependencies + scheduling + analysis), -012 (declarative apply + batch). No dekbeads CLI in repo — bead work captured as IB Done-When task lists. ACCEPTED to IMPLEMENTING via /write-intent --decompose. R41–R46 authored red-first in `cli/pm.test.ts`. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Wave B implemented the mutation surface (`set`/`status`/`assign`/`due`/`priority`/`note`/`rename`/`mv`/`shift`/`archive`/`depend`/`undepend`/`apply`) in `cli/src/commands/{update,deps,apply}.ts` + `cli/src/coerce.ts` (typed `k=v` patch) + `cli/src/schedule.ts` (post-mutation `scheduleAfterChange` cascade wiring). Every write delegates to a tested store mutator; the scheduler cascade is default-on (`--no-cascade` opts out; `--dry-run` reports without writing); `depend` cycle-guards via `wouldCreateCycle` (E_CYCLE); `apply` upserts idempotently by client `key` via a CLI-owned sidecar. R45/R46 flipped green; colocated edge tests added in `cli/src/commands/mutation.test.ts`. Wave B commit 95069bd. | Claude (INT-019 Wave B build worker) |
| 2026-07-16 | Substantive | Verification predicate re-evaluated from main (pnpm check exit 0; pnpm check:submission exit 0; pnpm build exit 0; tsc -p cli/tsconfig.json exit 0; vitest cli/pm.test.ts -t "Feature 9" = R41-R46 6 passed). Full suite GREEN: 318 passed/1 skipped (pre-existing R21 skip), 0 red (baseline before Wave B: 2 red R45/R46). Branch-diff/bead gates N/A -- work shipped on main, no int/ branch or dekbeads corpus. IMPLEMENTING to TESTPASS via ADR-017 Path B. | Claude (INT-019 land agent) |
| 2026-07-16 | Substantive | Locked via ADR-017 Path B -- all downstream WS-009..012 / IB-009..012 >= ACCEPTED. Linked AE-013 + AE-001 both ACCEPTED (no status inversion). TESTPASS to LOCKED. | Claude (INT-019 land agent) |
