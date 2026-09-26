---
name: design-system
description: Produce an implementable, numbered design system with rendered mocks for a product with a UI. Use in pipeline Phase 4 (designer), before gate G3 and before any UI code, or when a KIT_GAP or a visual-audit CHALLENGE sends work back to design.
---

# Design system (designer)

The deliverable is a system a builder can obey and a linter can enforce, not an
essay. Numbers, not moods. Load the `frontend-design` skill for aesthetic
direction; this skill adds the contract around it.

## 0. Preconditions
- SPEC.md, RESEARCH.md ("patterns to steal") and the architecture summary exist.
- Run `agentic design-init --project .` — it copies the templates into `design/`
  and never replaces existing files.
- **Mobbin is required.** If the Mobbin MCP is unavailable, stop and report
  `BLOCK: mobbin-unavailable` to the orchestrator. Continue with WebSearch
  references only if the user explicitly accepts that fallback; the orchestrator
  records the acceptance in DECISIONS.md and the gap in CAPABILITY_GAPS.md.
  Either way, every reference is decomposed with numbers.

## 1. References → `design/refs/`
6–10 real screens covering the Must-flow (onboarding, core action, empty and
error states). One `refs/<app>-<screen>.md` per screen, following
`refs/README.md`: grid, spacing rhythm, radius, type, component anatomy, color
roles, states, and the decision underneath, **measured in px**.

## 2. Two directions, rendered → G3
For each direction A and B:
- a compact token plan (4–6 named colors, typefaces and roles, spacing and radius
  scales, one layout principle), reviewed against the brief: revise anything you
  would have produced for any similar product;
- `design/mocks/direction-<a|b>.html`: the **core screen**, self-contained HTML
  with inline CSS, real French copy and real states. No external assets;
- screenshots at 390×844 and 1440×900 (browser tool / Playwright) saved to
  `design/mocks/shots/direction-<a|b>-<width>.png`. Look at them and fix what
  looks generic before handing over.

ASCII wireframes are allowed for ideation only: a direction without a rendered
mock is not ready for G3. Return the two summaries and the screenshot paths.

## 3. After the G3 choice: the system
Fill every `TODO(designer)` in:

| File | Must contain |
|---|---|
| `DESIGN.md` | screen inventory 1:1 with SPEC steps; hierarchy, components, four states, layout reference per screen |
| `tokens.md` | grid (4 or 8); closed spacing, radius (≤4 + none/full), type (≤6 sizes, ≤3 weights) scales; named color roles with contrast; elevation (≤2); icon family + sizes |
| `components.md` | anatomy of EVERY component: heights, paddings, radius, icon size and gap, all states (hover, focus-visible, active, disabled, loading), 44px touch target |
| `layout.md` | max-width, gutters, columns per viewport; what stacks, hides or moves at 390 / 768 / 1440 / 1920 |
| `anti-patterns.md` | the defaults plus project-specific bans; removing a default needs a reason in DECISIONS.md |
| `system.json` | the same decisions, machine-readable: sources, token files, UI kit dirs, scales, color names, the single icon family, anti-pattern regexes |
| `mocks/core.html` | the chosen direction rebuilt with the final tokens; the reference builders reproduce |

`tokens.md` and `system.json` must agree. Scales are per project: choose values
that suit this product, but keep each scale closed and small.

## 4. Done
`agentic design-lint --spec --project .` returns PASS. Return: direction
summary, the lint verdict, the mock screenshot paths, open questions (≤3).
Memory updates are proposals to the orchestrator.
