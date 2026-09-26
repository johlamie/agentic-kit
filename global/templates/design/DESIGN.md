# DESIGN
> Owner: designer. Screen inventory mapped 1:1 to SPEC.md flow steps.
> Every `TODO(designer)` must be replaced before `agentic design-lint --spec` passes.

Chosen direction (G3): TODO(designer) — A or B, date, one-sentence reason.
Core mock: `design/mocks/core.html` (the reference builders reproduce).

## Navigation
TODO(designer): pattern (tabs / stack / sheet / sidebar), items, what is always reachable.

## Screens
One block per screen. Orphan screens (no SPEC step) are scope creep: flag them.

### <screen-name> — SPEC step <n>
- Job: TODO(designer) — what the user comes here to do, in one sentence.
- Hierarchy: TODO(designer) — primary / secondary / tertiary, in reading order.
- Components: TODO(designer) — names from components.md only.
- States: empty · loading · error · success — TODO(designer) copy and layout for each.
- Layout: TODO(designer) — reference to the layout.md pattern and its 390 / 1440 variant.
