# INT-016: Replace plain-text date entry with an in-plugin calendar date picker

## Status

IMPLEMENTING

## Intent type

feature

## Autonomy

medium

## Risk Tier

default

## Branch

`int/INT-016-calendar-date-picker`

## Mission

none

## Source

Manual origin — engineer requirement captured verbatim in a full-auto session on 2026-07-16: "date entry via plain text fields is hard for their thought process — they need a real calendar grid with day numbers, columns Sunday through Saturday, with next/previous month buttons, the normal way date pickers work." Acceptance (PROPOSED → ACCEPTED) pre-authorized by the engineer in that session. Behavioural contracts pinned in `src/intention.test.ts` requirements R16–R20 (authored in parallel; test file not yet landed at drafting time).

## Superseded-By

none

## Created

2026-07-16

## Modified

2026-07-16

## Linked Architecture Elements

- AE-011: UI Primitives & Design System Styling — this Intent adds a new leaf-level presentation primitive (`CalendarPicker`) to `src/ui/primitives/**`, its design-system CSS in `src/styles/*.css`, and the corresponding catalog/gallery entries (`docs/styleguide.md`, `src/views/styleguide/**`). It materially extends the primitive vocabulary and must respect the slice's chained-setter contract and domain-free boundary.
- AE-005: Modal Dialogs & Modal Factory — the picker is wired into the date fields of the task and project modals (`src/modals/**`), replacing plain-text date entry inside the dialog form layer this AE governs.

## Motivation

The person entering dates in this plugin — the vault owner planning a project — cannot comfortably reason about dates through a bare text field. Typing `YYYY-MM-DD` into a plain input forces them to hold the calendar in their head: which weekday a date falls on, how far it is from today, where a month boundary sits. That mismatch with how they actually think about scheduling makes date entry slow and error-prone, and there is no visual affordance to correct a mistake before it is committed to a task's frontmatter. Today the only alternatives are worse: an OS/browser-native `<input type="date">` breaks visual consistency with the task card and the rest of the plugin chrome, and cannot be themed to the plugin's `--pm-*` design tokens because Obsidian renders it outside the plugin's styling context.

The underlying gap is that the plugin's primitive vocabulary has no calendar-grid affordance — every date field falls back to free text. The cost of not changing is a recurring friction on the single most common data-entry action in a project manager (setting start/due dates), and a persistent visual seam wherever a native picker would otherwise appear.

## Desired Outcome

When a user focuses a date field in a task or project modal, they see a calendar grid rendered in the plugin's own styling: a month label with previous/next navigation buttons, a weekday header row reading Sun · Mon · Tue · Wed · Thu · Fri · Sat, and clickable day-number cells laid out in Sunday-through-Saturday columns. Navigating months updates both the grid and the month label. Clicking a day emits that date as a `YYYY-MM-DD` string equal to the clicked day and writes it back to the field. The picker is a reusable `CalendarPicker` primitive with the house chained-setter API, carries zero inline styles, and appears in the styleguide catalog and gallery — so date entry becomes a visual, in-plugin interaction rather than free-text typing against a native control.

## Non-Goals

- No date-range or multi-date selection — single-day selection only.
- No time-of-day / clock picker — dates remain whole-day `YYYY-MM-DD`.
- No change to the on-disk date storage format or to `src/dates.ts`' `Temporal.PlainDate` model — the picker consumes and emits the existing string format; all date math continues to route through `src/dates.ts`, never `Date` arithmetic.
- No change to `Scheduler` / dependency auto-scheduling behaviour.
- No use of, or fallback to, an OS/browser-native date input.
- Localisation of weekday labels or configurable week-start is out of scope — the header is fixed Sun–Sat per the pinned R16 contract.

## Type-specific required fields

### `feature` — Desired Outcome

The new behaviour is user-observable and contract-pinned: (R16) the weekday header row is exactly `Sun, Mon, Tue, Wed, Thu, Fri, Sat`; (R17) previous/next month navigation updates the grid and the month label; (R18) `onChange` emits a string matching `^\d{4}-\d{2}-\d{2}$` equal to the clicked day; (R19) the component uses plugin CSS classes only with zero inline styles; (R20) it is cataloged in both `docs/styleguide.md` and `src/views/styleguide/StyleguideView.ts` in the same change. See the Desired Outcome above for the full user-facing narrative.

## Components affected

- `src/ui/primitives/**`
- `src/styles/widgets.css`
- `src/styles/index.css`
- `src/views/styleguide/**`
- `docs/styleguide.md`
- `src/modals/**`

## Coverage report

*Populated by `--analyze` (2026-07-16). Gaps surfaced comparing the Desired Outcome against the UI-primitive corpus; all resolved in-Intent.*

| Gap | Source | Resolution | Status |
| --- | --- | --- | --- |
| No calendar-grid primitive exists in `src/ui/primitives/**`; every date field falls back to free text or a native control | analyze — Desired Outcome vs AE-011 primitive vocabulary | Resolve in this Intent: add a `CalendarPicker` primitive (chained-setter API, plugin CSS only, zero inline styles) + its styleguide catalog/gallery entries (R16–R20) | open |
| Task/project modal date fields wire plain-text (or native) date entry, not the new primitive | analyze — Desired Outcome vs AE-005 modal date fields | Resolve in this Intent: wire `CalendarPicker` into the date fields of the task/project modals, emitting `YYYY-MM-DD` | open |

## Size assessment

*Populated by `--analyze`. Hard caps per Decision #5. Component cap exceeded and accepted-with-justification (see note) rather than split.*

| Cap | Limit | Measured | Verdict |
| --- | --- | --- | --- |
| Implementation Units (IBs / direct beads) | ≤ 3 | 1 (IB-004) | PASS |
| Components affected | ≤ 3 | 6 globs (see note — one atomic primitive-add surface) | PASS (accepted-with-justification, over cap) |
| New L1 artifacts (AEs) | ≤ 1 | 0 (AE-011, AE-005 revised only) | PASS |
| New + revised L2 artifacts (WSes + ICs) | ≤ 3 | 1 (WS-004; no IC) | PASS |
| Coverage gaps | ≤ 2 | 2 (both resolved in-Intent) | PASS |

*Component-cap justification (delegated authority, 2026-07-16):* the six globs are the *mandatory atomic surface* for adding a single UI primitive under this repo's hard conventions, not six independent capabilities. Per `CLAUDE.md`, adding a primitive **requires** updating `docs/styleguide.md` + `src/views/styleguide/StyleguideView.ts` in the same change, and styling **must** live in `src/styles/*.css` bundled through `src/styles/index.css`. So `src/ui/primitives/**` (the primitive), `src/styles/widgets.css` + `src/styles/index.css` (its required styling + bundle registration), `src/views/styleguide/**` + `docs/styleguide.md` (its required catalog/gallery), and `src/modals/**` (the one consumer that motivates it) together form one cohesive "add CalendarPicker" change — a single IU. Splitting primitive-from-wiring would ship a catalogued primitive no modal uses (dead on arrival) or a modal referencing a non-existent primitive (red build). The cap counts globs; the *capability* count is one. Recorded as an accepted deviation, not a silent pass.

## Layer impact analysis

*Populated by `--analyze`. WS-fan-in per IU in the footnote (consumed by `--decompose`).*

| Layer | Artifact | Action |
| --- | --- | --- |
| L1 (Architecture & Decisions) | AE-011, AE-005 | revise |
| L2 (Specification) | WS-004 (calendar-date-picker) | new |
| L3 (Implementation) | IB-004 (calendar-date-picker) | new |
| L4 (Construction) | Done-When task list in IB-004 (no dekbeads CLI in repo) | new |

*WS-fan-in per IU (analyze Step 7): IU-1 draws from WS-004 only (fan-in = 1). The primitive + styling + styleguide catalog + modal wiring are one atomic IU authored as a single WS/IB pair.*

## Verification

*Type-default `feature` predicate, to be confirmed/overridden at `--analyze`. All checks are recognized tools in this repo (see CLAUDE.md §Commands).*

```yaml
# Verification predicate for this Intent (feature). Finalized at --analyze
# (2026-07-16). check:submission is retained because this Intent adds a UI
# primitive under the obsidianmd submission ruleset (no inline styles,
# sentence-case UI text). The intention-contract check exercises R16-R20
# (Sun-Sat header, month nav, YYYY-MM-DD emit, zero inline styles, catalogued).
verification:
  - name: typecheck-lint-format-clean
    cmd: pnpm check
  - name: submission-lint-clean
    cmd: pnpm check:submission
  - name: full-suite-green
    cmd: pnpm test
  - name: intention-contract-r16-r20
    cmd: vitest run src/intention.test.ts
```

## Outcome Verification

On a `CalendarPicker` opened at a known month, clicking the cell for a specific day emits an `onChange` payload equal to that day formatted `YYYY-MM-DD` (matching `^\d{4}-\d{2}-\d{2}$`), and the Sun–Sat weekday header renders in that exact order. This is the R16/R18 contract in `src/intention.test.ts`; the test lands red first (component absent), is made green by the `CalendarPicker` implementation, and no other test file is modified to make it pass. Precise test path/assertion names to be fixed at `--analyze` once `src/intention.test.ts` is landed.

## Open Issues

- [x] **RESOLVED (2026-07-16):** Six-glob component list assessed as **accepted-with-justification, not split** — the six globs are the mandatory atomic surface for adding one UI primitive under this repo's conventions (see Size assessment note), a single capability/IU. — **Source:** initial draft → resolved at `--analyze` — **Severity:** `P3` (cleared)
- [x] **RESOLVED (2026-07-16):** `src/intention.test.ts` (R16–R20) is authored in parallel and still absent at analyze time; Outcome Verification pins the R16/R18 assertions (Sun–Sat header order + `YYYY-MM-DD` emit) landed red-first per ADR-029. Concrete assertion names are carried in IB-004's test plan. — **Source:** initial draft → resolved at `--analyze` — **Severity:** `P3` (cleared)

## TESTFAIL records

| Date | Failed check | Detail | Resolution |
| --- | --- | --- | --- |
| — | — | TBD — no failures recorded yet | — |

## Post-implementation sync

- [ ] TBD — populate at `--sync` after MERGED.

## Amendment Log

| Date | Type | Change | Author |
| --- | --- | --- | --- |
| 2026-07-16 | Editorial | Intent created at DRAFT with scratch-pad scaffold (feature; AE-011 + AE-005). PROPOSED requested by caller but refused — no `--analyzed` evidence bundle supplied; DRAFT default retained pending `/write-intent --analyze`. | Claude (Intent authoring agent) |
| 2026-07-16 | Substantive | Analyze gate: closed Coverage/Size/Layer/Verification; 6-glob component cap accepted-with-justification (atomic UI-primitive-add surface, not split); all other caps PASS. DRAFT to PROPOSED via /write-intent --analyze. | Claude (engineer-directed) |
| 2026-07-16 | Substantive | Promoted PROPOSED to ACCEPTED via /write-intent --accept. Engineer acceptance pre-authorized for full-auto session 2026-07-16 (recorded in Source / Amendment Log); that recording is the authorization cited here. No dekbeads CLI in repo — bead authoring gate deferred to IB Done-When task lists at --decompose. | Claude (engineer-directed, pre-authorized) |
| 2026-07-16 | Substantive | Decomposed into 1 IU (1 IB, 0 direct beads): WS-004 + IB-004. No dekbeads CLI in repo — bead work captured as IB Done-When task lists. ACCEPTED to IMPLEMENTING via /write-intent --decompose. | Claude (engineer-directed) |
