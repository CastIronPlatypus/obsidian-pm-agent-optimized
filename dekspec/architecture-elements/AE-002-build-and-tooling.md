# AE-002: Build, Lint & Release Tooling

## Status

LOCKED

## Subtype

Platform Concern

## Classification

Generic

## Created

2026-07-16

## Modified

2026-07-16

## Linked Artifacts

- **Related ADRs:** none
- **Related WSs:** none
- **Related ICs:** none
- **Related IBs:** none
- **Related Intents:** INT-002
- **Owners:** Jeff Haskin

## Implements

- `package.json`
- `tsdown.config.ts`
- `vitest.config.ts`
- `oxlint.config.ts`
- `eslint.config.mjs`
- `.oxfmtrc.json`
- `tsconfig.json`
- `scripts/**`
- `.github/**`
- `manifest.json`
- `versions.json`
- `test/**`

## Purpose and Scope

This AE covers the plugin's toolchain: the machinery that turns TypeScript source (`src/**`) and CSS source (`src/styles/**`) into the three shipped build outputs (`main.js`, `styles.css`, `manifest.json`), enforces code quality and formatting, runs the unit-test suite against an in-memory Obsidian, and cuts GitHub releases. It exists as a coherent unit because these concerns share one contract — the pnpm script surface in `package.json` — and because the same commands are invoked identically by a developer's terminal and by CI, so the local and continuous-integration definitions of "green" cannot drift.

The slice is deliberately non-standard: bundling goes through `tsdown` (not esbuild/rollup directly), CSS through a hand-written `lightningcss` script rather than a plugin, and linting is split between a fast path (`oxlint` + `oxfmt`) and a stricter submission gate (`eslint` with the full `eslint-plugin-obsidianmd` ruleset). It owns the wiring that keeps all of these consistent, environment-aware (dev vs. `PRODUCTION`, optional `VAULT_PATH` redirect), and reproducible.

## Responsibilities

- Define the canonical command surface — `dev`, `build`, `check`, `check:submission`, `test`, `fix` and their sub-scripts — in `package.json` `scripts`, parallelized via `npm-run-all2` (`run-p`), so both humans and CI drive builds through one vocabulary.
- Bundle `src/main.ts` into a single CommonJS `main.js` (`tsdown.config.ts`): `es2022` target, `platform: 'node'`, no DTS, inline sourcemaps in dev and none in prod, minify only under `PRODUCTION`, and the `__STYLEGUIDE__` compile-time flag (on in dev, off in prod unless `STYLEGUIDE` is set).
- Keep Obsidian, Electron, all CodeMirror/Lezer packages, and Node builtins out of the bundle via `deps.neverBundle`, matching the "external dependency" contract these packages have at runtime.
- Compile CSS from `src/styles/index.css` to a single `styles.css` via `scripts/build-styles.mjs` (lightningcss `bundle`, minify under `PRODUCTION`, debounced `--watch` on `src/styles`).
- Redirect both build outputs into a live vault (`<VAULT_PATH>/.obsidian/plugins/project-manager/`) when `VAULT_PATH` is set, and otherwise into the repo root — implemented identically in `tsdown.config.ts` and `build-styles.mjs`.
- Type-check without emit (`tsc -noEmit -skipLibCheck`) against `tsconfig.json` (extends `@2bad/tsconfig`; bundler resolution, `isolatedModules`, DOM+ES2022 libs).
- Enforce quality via two gates: `oxlint`/`oxfmt` on the fast path (`oxlint.config.ts` extends `@2bad/axiom` and loads `eslint-plugin-obsidianmd` as a JS plugin; `.oxfmtrc.json` sets no-semi / single-quote / 120-col / no-trailing-comma), and `eslint --max-warnings 0` on the stricter submission path (`eslint.config.mjs`, full obsidianmd recommended set, with a scoped exemption of `no-static-styles-assignment` for `src/views/table/**`).
- Run the unit suite (`vitest run`) using `vitest.config.ts`: alias the `obsidian` module to `test/obsidian-stub.ts`, resolve TS path aliases, and exclude view/modal/ui/main from coverage.
- Provide the in-memory test doubles that make the suite hermetic: `test/obsidian-stub.ts` (stubbed `TFile`/`TFolder`/`normalizePath`/`parseYaml`/`Notice`/etc.) and `test/fakeVault.ts` (a `Map`-backed vault + `FakeAppLike` with `processFrontMatter`, mutation counters, and a deliberately-missing `metadataCache` to force the store's read+parse fallback).
- Gate every merge in CI: `build.yml` runs `pnpm check` + `pnpm check:submission` + `pnpm build`; `test.yml` runs `pnpm test`; both pin actions by SHA, install with `--frozen-lockfile`, and read the Node version from `package.json`.
- Cut releases (`release.yml`) on a numeric tag or `workflow_call`: verify the tag equals `manifest.json` `version` and exists in `versions.json`, refuse if the GitHub release already exists, run `pnpm check` + `pnpm build`, attest `main.js`/`manifest.json`/`styles.css` provenance, and publish those three artifacts (prerelease when the tag contains `-`).
- Run scheduled security analysis via `codeql.yml` (weekly cron, `javascript-typescript`, `security-extended,security-and-quality`).

## Boundaries and Non-Goals

**Inside the boundary:**
- The pnpm script surface and its parallelization.
- JS bundling (`tsdown.config.ts`) and CSS bundling (`scripts/build-styles.mjs`), including the `VAULT_PATH`/`PRODUCTION` environment behavior and the `__STYLEGUIDE__` flag definition.
- Lint/format/type-check configuration and the two-tier gate split.
- Vitest configuration and the test harness doubles under `test/**`.
- All GitHub Actions workflows (build, test, release, CodeQL) and the version-lockstep release checks over `manifest.json`/`versions.json`.

**Outside the boundary (non-goals):**
- The plugin's runtime source under `src/**` — this AE builds and checks that code but does not own its behavior; a bug in scheduling or persistence is a different AE's concern, because mixing runtime logic into the tooling slice would make "does it build" and "does it work" the same claim when they are distinct.
- The actual lint *rules'* correctness and the styleguide catalog — the tooling wires up `eslint-plugin-obsidianmd` and reads `docs/styleguide.md`, but the substance of UI/style conventions belongs to the UI-component AE, not here, because those rules constrain product code rather than the build pipeline.
- Individual test *cases* and their assertions — this AE owns the harness and doubles that make tests runnable and hermetic; what each `*.test.ts` asserts about store behavior is owned by the AE for the code under test, so that changing a store invariant does not read as a tooling change.

## Relationships and Dependencies

**Consumes:** TypeScript source `src/main.ts` and its imports; CSS source `src/styles/index.css`; `tsconfig.json` and `@2bad/tsconfig`; environment variables `PRODUCTION`, `VAULT_PATH`, `STYLEGUIDE`; `manifest.json` and `versions.json` (read during release verification); `pnpm-lock.yaml` (frozen-lockfile installs).

**Produces:** `main.js` (bundled CJS plugin), `styles.css` (bundled CSS), and — at release — a GitHub release publishing `main.js` + `manifest.json` + `styles.css` with build-provenance attestation. Also produces pass/fail signals: lint, format, type-check, and test results.

**Depends on:** `tsdown`, `lightningcss`, `oxlint` (+ `@2bad/axiom`, `eslint-plugin-obsidianmd`), `oxfmt`, `eslint` (+ `@typescript-eslint/parser`, `eslint-plugin-obsidianmd`), `typescript`, `vitest` (+ `@vitest/coverage-v8`, `vite-tsconfig-paths`), `npm-run-all2`, pnpm `11.5.3` on Node `>=24`; the `obsidian` package as an external (never bundled) type/runtime dependency and, in tests, its stub; GitHub Actions (`checkout`, `pnpm/action-setup`, `setup-node`, `attest-build-provenance`, `codeql-action`), all SHA-pinned.

**Consumed by:** every developer and CI job that runs a `pnpm` script; the persistence-store AE and all other `src/**` AEs, whose code only ships and stays green through this pipeline; the Obsidian community-plugin release channel, which consumes the three published artifacts.

## Constraints and Quality Notes

- Local and CI must stay identical: CI invokes the same `pnpm check` / `pnpm check:submission` / `pnpm build` / `pnpm test` a developer runs, so any gate added must be added to the script surface, not only to a workflow.
- `main.js` and `styles.css` are build *outputs*; they are never hand-edited and never treated as source.
- The `neverBundle` set must track the plugin's true externals (Obsidian, Electron, CodeMirror/Lezer, Node builtins); bundling any of them would break the plugin at runtime.
- Output-location logic must remain identical between `tsdown.config.ts` and `build-styles.mjs` so a `VAULT_PATH` build lands both artifacts in the same plugin folder.
- The submission gate runs at zero tolerance (`--max-warnings 0`); warnings are failures on that path.
- The test harness must stay hermetic — no real Obsidian, no real filesystem — via the `obsidian` alias and `FakeVault`; the intentionally-missing `metadataCache` keeps the store's fallback path under test.
- Releases must be version-locked: a tag ships only if it equals `manifest.json` `version` and is present in `versions.json`, and only if no release for that tag already exists.
- CI supply-chain hygiene: all third-party actions are pinned by commit SHA and installs use `--frozen-lockfile`.

## Open Questions / Planned Follow-ons

- [ ] Should the JS and CSS build steps share a single source of truth for the `VAULT_PATH`/`outDir` resolution rather than duplicating it in `tsdown.config.ts` and `build-styles.mjs`? — **Source:** initial draft — **Severity:** `P3`
- [ ] Coverage thresholds are all set to `0` in `vitest.config.ts`; is enforcing a real floor a planned follow-on or an intentional non-goal? — **Source:** initial draft — **Severity:** `P3`

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | Retroactive adoption: AE authored and locked directly against the current (already-shipped, CI-green) state of the build/lint/release tooling (`package.json`, `tsdown.config.ts`, `vitest.config.ts`, `oxlint.config.ts`, `eslint.config.mjs`, `.oxfmtrc.json`, `tsconfig.json`, `scripts/**`, `.github/**`, `manifest.json`, `versions.json`, `test/**`) at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
