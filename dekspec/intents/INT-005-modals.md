# INT-005: Modal Dialogs & Modal Factory

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

- AE-005: Modal Dialogs & Modal Factory — this Intent is the retroactive-adoption record for the AE itself; it establishes the AE's initial LOCKED state against the codebase as it stood at adoption time.

## Motivation

The plugin's entire dialog layer — the `Modal`/`SuggestModal` subclasses under `src/modals/` (`TaskModal`, `ProjectModal`, `ImportModal`, the fuzzy pickers, and the inline confirm/prompt dialogs), their per-section render helpers (`TaskFormFields`, `CustomFieldInputs`, `SubtasksPanel`, `TimeTrackingPanel`), the `NoteLinkSuggest` autocomplete widget, the `ModalFactory` façade that is the single sanctioned way to open any of them, and the scoped stylesheets (`task-modal.css`, `task-editor.css`, `project-modal.css`) — shipped and went CI-green with zero DekSpec coverage. Nothing recorded the load-bearing contract this slice actually enforces: dialogs edit a deep-cloned working copy so cancel is always non-destructive; persistence only ever runs through store mutators (`insertTask`/`updateTask`/`moveTask`/`saveProject`/`importNoteAsTask`) plus `scheduleAfterChange`; bodies are pre-hydrated before open to avoid an empty-description flash; `TaskFileNameConflictError` is translated into a recoverable inline error rather than a crash; save-on-close is opt-in and must skip new/cancelled/empty entities; and the overlays re-declare the `--pm-*` tokens because Obsidian mounts them outside `.pm-root`. Today, anyone who has to modify a modal — or understand why views never instantiate a `Modal` subclass directly — must reconstruct all of that by reading the code, because no AE, WS, IC, or Intent describes it. That reconstruction cost recurs on every change to a subtle, concurrency-sensitive UI layer, and this adoption pass closes it.

## Desired Outcome

This slice is now described by a LOCKED AE (AE-005, "Modal Dialogs & Modal Factory") that any future Intent touching `src/modals/**`, `src/ui/ModalFactory.ts`, or the modal stylesheets must link against — giving the dialog layer a durable, referenceable design record instead of code-only tribal knowledge.

## Non-Goals

- This Intent makes no code change.
- It does not retroactively spec every other subsystem — sibling Intents cover those in the same adoption pass.

## Type-specific required fields

### `documentation` — Coverage-Gap

**Coverage-Gap:** No AE, WS, IC, or Intent covered `["src/modals/**","src/ui/ModalFactory.ts","src/styles/task-modal.css","src/styles/task-editor.css","src/styles/project-modal.css"]` prior to this Intent (confirmed via `dekspec dev archeology coverage`, run 2026-07-16 against commit 511ec7b). This Intent closes that gap.

## Components affected

- `src/modals/**`
- `src/ui/ModalFactory.ts`
- `src/styles/task-modal.css`
- `src/styles/task-editor.css`
- `src/styles/project-modal.css`

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
| 2026-07-16 | Substantive | Retroactive adoption: Intent authored and locked directly against the current (already-shipped, CI-green) state of `src/modals/**`, `src/ui/ModalFactory.ts`, and the modal stylesheets (`task-modal.css`, `task-editor.css`, `project-modal.css`) at commit 511ec7b, per engineer authorization to bring pre-existing code under DekSpec without the branch/merge pipeline. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Unlocked for ongoing revision: retroactively-adopted adoption Intents stay mutable while we work in this repo. | 60890286+jeffhaskin@users.noreply.github.com |
| 2026-07-16 | Substantive | retroactive-adoption intent; describes shipped subsystem; locked at engineer direction, reversible via --unlock | Claude (engineer-directed) |
