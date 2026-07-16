# Implementation Brief: CalendarPicker date-entry primitive

**Spec:** `dekspec/working-specs/WS-004-calendar-date-picker.md`
**Intent:** `dekspec/intents/INT-016-calendar-date-picker.md`
**Source AEs:** AE-011, AE-005
**Depends on:** none
**Production gate:** none
**Status:** ACCEPTED

## Goal

A reusable `CalendarPicker` primitive renders a Sun–Sat grid with prev/next month navigation, emits the clicked day as a `YYYY-MM-DD` string, carries zero inline styles, is catalogued in the styleguide, and is wired into the task/project modal date fields — proven green by R16–R20 in `src/intention.test.ts`.

## Out of Scope

- Date-range or multi-date selection.
- Time-of-day/clock picker.
- Any change to `src/dates.ts`' `Temporal.PlainDate` model or on-disk date format.
- Any OS/browser-native date input or fallback.
- Weekday-label localisation or configurable week-start.

## Files to Modify

| File | Change |
|------|--------|
| `src/ui/primitives/CalendarPicker.ts` (new) | New leaf primitive: chained-setter API (`.el`, `.setValue()`, `.onChange()`), Sun–Sat grid, prev/next month nav, emits `YYYY-MM-DD`. |
| `src/styles/widgets.css` | Design-system CSS for the picker (`--pm-*` tokens); no inline styles. |
| `src/styles/index.css` | `@import` the picker's styling into the bundle. |
| `docs/styleguide.md` | Catalog the primitive (component entry + usage). |
| `src/views/styleguide/StyleguideView.ts` | Add the live gallery entry (behind the `__STYLEGUIDE__` dev flag). |
| `src/modals/TaskModal.ts`, `src/modals/ProjectModal.ts` (via `ModalFactory`) | Replace plain-text date entry with `CalendarPicker` on date fields. |
| `src/intention.test.ts` | (Owned by test worker — not modified here; R16–R20 are the acceptance oracle.) |

## Reuse Inventory

| Capability | Location | Use instead of reimplementing |
|------------|----------|-------------------------------|
| Date math (`Temporal.PlainDate`) | `src/dates.ts` | reuse for month arithmetic; never `Date` arithmetic |
| Chained-setter primitive pattern | `src/ui/primitives/**` | follow existing primitive shape (constructor takes `parentEl`, exposes `.el`) |
| Modal wiring | `src/ui/ModalFactory.ts` | reuse; do not instantiate `Modal` subclasses directly |

## Domain Constraints

| Constraint | Value |
|------------|-------|
| Do not touch | on-disk date format / `src/dates.ts` model |
| Do not touch | any `element.style.*` inline styling |

## Do Not Touch

| Function/File | Reason |
|---------------|--------|
| `src/dates.ts` `Temporal.PlainDate` model | Non-goal — consume/emit existing string format |
| `Scheduler` / auto-scheduling | Non-goal per INT-016 |
| `src/intention.test.ts` | Owned by the parallel test worker |

## Governing ADRs

| ADR | Title |
|-----|-------|
| none | — |

## Constraints & Decisions

- **Header:** The weekday header row renders exactly `Sun, Mon, Tue, Wed, Thu, Fri, Sat`, fixed order, not localised (R16).
- **Navigation:** Prev/next month buttons re-render both the grid and the month label (R17).
- **Emit:** Clicking a day calls `onChange` with a `YYYY-MM-DD` string equal to that day, matching `^\d{4}-\d{2}-\d{2}$` (R18).
- **Styling:** Plugin CSS classes only; zero inline styles — any `element.style.*` fails `check:submission` (R19).
- **Catalog:** Update `docs/styleguide.md` and `StyleguideView.ts` in the same change (R20); adding a primitive without both is a convention violation.
- **Date math:** All month arithmetic routes through `src/dates.ts` (`Temporal.PlainDate`), never `Date`.

## Test Promotion Criteria

Promotion refs: WS-004 Rules 1–5 (R16–R20 in `src/intention.test.ts`).

## Done When

- [ ] The weekday header renders exactly Sun–Sat in order (R16) — verified by intention test.
- [ ] Prev/next navigation updates grid + month label (R17) — verified by intention/DOM test.
- [ ] `onChange` emits `YYYY-MM-DD` equal to the clicked day (R18) — verified by intention test.
- [ ] The component carries zero inline styles (R19) — verified by `pnpm check:submission`.
- [ ] The primitive is catalogued in `docs/styleguide.md` and `StyleguideView.ts` (R20) — verified by intention test / manual check.
- [ ] Task/project modal date fields use `CalendarPicker` — verified by manual check.
- [ ] All pre-existing tests continue to pass — verified by full `pnpm test` run.

## Open Issues

None — no open issues.

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | IB authored at ACCEPTED under INT-016 `--decompose`. No dekbeads CLI present — bead-level work captured as the Done When task list above. May need a DOM test dependency (happy-dom/jsdom) for R17 — flagged to the implementing worker. | Claude (engineer-directed) |
