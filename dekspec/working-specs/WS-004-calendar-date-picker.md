# Working Spec: CalendarPicker date-entry primitive

## Status

ACCEPTED

## Created

2026-07-16

## Modified

2026-07-16

## Related Architecture Elements

- AE-011: UI Primitives & Design System Styling — measures a new leaf-level `CalendarPicker` primitive (chained-setter API, domain-free, plugin CSS classes only, zero inline styles) plus its design-system CSS and styleguide catalog/gallery entries.
- AE-005: Modal Dialogs & Modal Factory — constrains wiring the picker into the date fields of the task and project modals, replacing plain-text date entry.

## Governing ADRs

- none

## What This Does

When a user focuses a date field in a task or project modal, they see a calendar grid rendered in the plugin's own styling: a month label with previous/next navigation buttons, a weekday header row reading Sun · Mon · Tue · Wed · Thu · Fri · Sat, and clickable day-number cells laid out in Sunday-through-Saturday columns. Navigating months updates both the grid and the month label. Clicking a day emits that date as a `YYYY-MM-DD` string equal to the clicked day and writes it back to the field. The picker is a reusable `CalendarPicker` primitive with the house chained-setter API, carries zero inline styles, and appears in the styleguide catalog and gallery.

**Mechanism:** This component renders a Sun–Sat calendar grid from a `Temporal.PlainDate` month (via `src/dates.ts`), re-renders grid + month label on prev/next navigation, and emits the clicked day as a `YYYY-MM-DD` string through an `onChange` chained-setter callback.

## What This Does NOT Do

- **Timeline coherence:** Does not support date-range or multi-date selection; single-day only.
- Does not add a time-of-day/clock picker; dates remain whole-day `YYYY-MM-DD`.
- Does not change the on-disk date format or `src/dates.ts`' `Temporal.PlainDate` model; all date math routes through `src/dates.ts`.
- Does not use or fall back to an OS/browser-native date input.
- Does not localise weekday labels or make week-start configurable; header is fixed Sun–Sat.

## Interfaces

### Data Interfaces

| Interface | Direction | Type / Shape / Dtype | Source or Consumer | Guarantees |
|-----------|-----------|----------------------|--------------------|------------|
| Initial value / month | in | `YYYY-MM-DD` string | modal date field | grid opens at that month |
| Weekday header | out | fixed `Sun,Mon,Tue,Wed,Thu,Fri,Sat` | rendered DOM | exact order (R16) |
| `onChange` payload | out | `YYYY-MM-DD` string | modal date field | matches `^\d{4}-\d{2}-\d{2}$`, equals clicked day (R18) |

### Dependencies

| Dependency | Interface | Failure behavior |
|------------|-----------|-----------------|
| `src/dates.ts` (`Temporal.PlainDate`) | date math | month arithmetic stays timezone-safe; no `Date` arithmetic |
| Plugin CSS (`src/styles/widgets.css`) | styling | class-based only; zero inline styles (R19) |

## Domain Constraints

| Constraint | Value | Scope | Rationale |
|------------|-------|-------|-----------|
| Do not touch | on-disk date format / `src/dates.ts` model | all-IBs | Non-goal per INT-016 |
| Do not touch | any `element.style.*` inline styling | all-IBs | zero inline styles (R19) |

## Business Rules

1. **general** The weekday header row renders exactly `Sun, Mon, Tue, Wed, Thu, Fri, Sat`. (R16)
2. **general** Previous/next month navigation updates both the grid and the month label. (R17)
3. **general** `onChange` emits a string matching `^\d{4}-\d{2}-\d{2}$` equal to the clicked day. (R18)
4. **general** The component uses plugin CSS classes only, with zero inline styles. (R19)
5. **general** The primitive is cataloged in both `docs/styleguide.md` and `src/views/styleguide/StyleguideView.ts` in the same change. (R20)

## Failure Behavior

| Failure | Detection | Assertion type | Behavior | Recovery |
|---------|-----------|---------------|----------|----------|
| Invalid initial date string | parse via `src/dates.ts` | assert | The picker opens at the current month instead of throwing, so an unparseable initial value degrades to a usable default grid rather than breaking the host modal. | user clicks a valid day |
| Inline style assignment introduced | `check:submission` lint (no-inline-style) | assert | build/lint fails | remove inline style; use a CSS class |

## Open Issues

- none

## Amendment Log

| Date | Type | Change | Author |
|------|------|--------|--------|
| 2026-07-16 | Substantive | WS authored at ACCEPTED under INT-016 `--decompose` (acceptance criteria = R16–R20 in `src/intention.test.ts`). | Claude (engineer-directed) |
