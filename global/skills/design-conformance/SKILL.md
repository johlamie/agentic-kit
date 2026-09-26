---
name: design-conformance
description: Check that a UI slice stays inside the project's design system and fail it when it does not. Use as reviewer on every slice that touches UI, after the builder and before qa.
---

# Design conformance (reviewer)

A screen that "works" but leaves the system is a FAIL, like a plaintext secret.

## 1. Mechanical — no judgment
Run `agentic design-lint --project .` (add `--json` for the report).
- Exit 2 (missing or incomplete design system): FAIL, route to designer.
- Exit 1: FAIL with the violation list. Rules: `raw-color`, `arbitrary-value`,
  `default-palette`, `spacing-scale`, `radius-scale`, `type-scale`,
  `icon-family`, `icon-size`, `kit-bypass`, `anti-pattern:<id>`,
  `unjustified-allow`.
- Every `design-lint-allow: <reason>` in the diff is read: a weak reason is a FAIL.

## 2. Read the diff for what the linter cannot see
- **Kit only.** Every UI element comes from the `ui_kit_dirs`. A new atom,
  a restyled kit component through `className` overrides, or a local copy of a
  kit component is a FAIL (`KIT_GAP` is the correct builder response).
- **States.** Each screen implements the states listed for it in DESIGN.md
  and each component the states in components.md. Missing = FAIL.
- **Layout.** Breakpoint behavior matches layout.md (what stacks, hides or
  moves); content max-width and gutters come from layout primitives.
- **Anti-patterns.md prose items** (card wall, one radius everywhere, numbered
  markers on non-sequences, decorative motion): present = FAIL.
- **Mock parity.** For the core screen, hierarchy and composition follow
  `design/mocks/core.html`; deviations are declared in the builder return.
- Copy lives in the i18n module; buttons name the action.

## Verdict
PASS only when the lint is PASS and no item above fails. Report: verdict, lint
summary, findings as `file:line — rule — fix`. Systemic findings (the system
itself is missing a value, a state or a component) go to the designer, not to
the builder.
