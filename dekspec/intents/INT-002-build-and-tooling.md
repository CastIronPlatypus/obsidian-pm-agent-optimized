# INT-002: Build, Lint & Release Tooling

## Status

LOCKED

## Intent type

documentation

## Autonomy

manual

## Risk Tier

default

## Branch

none — retroactive adoption, no code change

## Mission

none

## Source

none

## Created

2026-07-16

## Modified

2026-07-16

## Linked Architecture Elements

- AE-002: Build, Lint & Release Tooling — this Intent is the retroactive-adoption record for the AE itself; it establishes the AE's initial LOCKED state against the codebase as it stood at adoption time.

## Motivation

The plugin's entire toolchain — the pnpm script surface in `package.json`, the `tsdown` JS bundle and the hand-written `lightningcss` CSS build (`scripts/build-styles.mjs`), the two-tier lint/format gate (`oxlint`/`oxfmt` fast path plus `eslint --max-warnings 0` submission path), the `vitest` harness and its in-memory Obsidian doubles under `test/**`, and the GitHub Actions workflows that build, test, run CodeQL, and cut version-locked releases over `manifest.json`/`versions.json` — shipped with zero spec coverage. It is precisely the kind of subsystem whose design is invisible from any single file: the non-standard choices (why `tsdown` and not esbuild, why a duplicated `VAULT_PATH`/`outDir` resolution in two places, why the `neverBundle` externals set is what it is, why the submission gate runs at zero tolerance, why the test harness deliberately omits `metadataCache`) are load-bearing but undocumented, so any future engineer touching the build has to reconstruct all of it by reading config files and cross-referencing CI. That reconstruction cost recurs every time the pipeline is modified, and it is exactly the cost a spec closes. Bringing this slice under a LOCKED AE now — as part of the same adoption pass covering the persistence store and sibling subsystems — makes the toolchain's contract explicit and gives every later change a spec to link against.

## Desired Outcome

The Build, Lint & Release Tooling slice is now described by a LOCKED Architecture Element (AE-002), which any future Intent that touches these files must link against.

## Non-Goals

- This Intent makes no code change.
- It does not retroactively spec every other subsystem — sibling Intents cover those in the same adoption pass.

## Type-specific required fields

### `documentation` — Coverage-Gap

**Coverage-Gap:** No AE, WS, IC, or Intent covered `["package.json","pnpm-lock.yaml","pnpm-workspace.yaml","tsconfig.json","tsdown.config.ts","vitest.config.ts","oxlint.config.ts","eslint.config.mjs",".oxfmtrc.json",".editorconfig",".npmrc",".gitignore","scripts/**",".github/**","docs/**","manifest.json","versions.json","test/**","CHANGELOG.md","LICENSE","README.md"]` prior to this Intent (confirmed via `dekspec dev archeology coverage`, run 2026-07-16 against commit 511ec7b). This Intent closes that gap.

## Components affected

- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.json`
- `tsdown.config.ts`
- `vitest.config.ts`
- `oxlint.config.ts`
- `eslint.config.mjs`
- `.oxfmtrc.json`
- `.editorconfig`
- `.npmrc`
- `.gitignore`
- `scripts/**`
- `.github/**`
- `docs/**`
- `manifest.json`
- `versions.json`
- `test/**`
- `CHANGELOG.md`
- `LICENSE`
- `README.md`

## Verification

```yaml
verification:
  - name: typecheck-lint-format-clean
    cmd: pnpm check
  - name: full-suite-green
    cmd: pnpm test
```

Both checks were run manually on 2026-07-16 against commit `511ec7b` as the retroactive verification event for this adoption pass: `pnpm check` exited 0; `pnpm test` reported 200/200 tests passing across 12 test files.

## Outcome Verification

Not applicable in the ADR-029 red-first sense — no new code lands under this Intent. `outcome_verification_grandfathered: true` — this Intent predates code authored under the DekSpec process on this repo; it adopts code that shipped before DekSpec was introduced.

## Open Issues

_None._

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: Intent authored and locked directly against the current (already-shipped, CI-green) state of `["package.json","pnpm-lock.yaml","pnpm-workspace.yaml","tsconfig.json","tsdown.config.ts","vitest.config.ts","oxlint.config.ts","eslint.config.mjs",".oxfmtrc.json",".editorconfig",".npmrc",".gitignore","scripts/**",".github/**","docs/**","manifest.json","versions.json","test/**","CHANGELOG.md","LICENSE","README.md"]` at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted adoption Intents stay mutable while we work in this repo. | 60890286+jeffhaskin@users.noreply.github.com |
| 2026-07-16 | Substantive | retroactive-adoption intent; describes shipped subsystem; locked at engineer direction, reversible via --unlock | Claude (engineer-directed) |
