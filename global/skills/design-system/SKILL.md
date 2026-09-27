---
name: design-system
description: Produce an implementable, numbered design system on the shadcn/ui + Tailwind baseline, with rendered mocks, for a product with a UI. Use in pipeline Phase 4 (designer), before gate G3 and before any UI code, or when a KIT_GAP or a visual-audit CHALLENGE sends work back to design.
---

# Design system (designer)

The deliverable is a system a builder can obey and a linter can enforce, not an
essay. Numbers, not moods.

## Baseline first, originality second
- **Shared baseline**: shadcn/ui on Tailwind CSS v4, lucide-react icons, shadcn
  CSS variables as tokens (Expo: NativeWind + React Native Reusables). It is what
  makes the result clean and current. Read today's shadcn/Tailwind docs (context7)
  and shadcn blocks before designing; do not work from memory.
- **Originality** lives in the axes of DESIGN.md → "Structure": product type,
  navigation model, entry/hero, page structure, imagery, typography personality,
  accent + radius personality, one signature moment. Load the `frontend-design`
  skill for these axes; it does not override the baseline.
- Never leave the baseline untouched (neutral theme, default radius, no accent):
  that reads as a template. Never replace a shadcn component with a custom one
  unless components.md says why.

## The compass: `PRINCIPLES.md`
Read `PRINCIPLES.md` (next to this skill) before anything else, then the example
in `examples/sceau/` (its README first). The principles decide; references only
inspire. The example shows the quality bar — its colors, typeface, seal and
two-column split are Sceau's own choices, not defaults.

## 0. Preconditions
- SPEC.md, RESEARCH.md ("patterns to steal") and the architecture summary exist.
- Run `agentic design-init --project .` — it copies the templates into `design/`
  and never replaces existing files.
- References are optional inspiration, never a gate: Mobbin if available,
  shadcn blocks, live products, WebSearch. A missing source is not a blocker.

## 1. References → `design/refs/`
A few real screens relevant to the Must-flow, from any source. One
`refs/<app>-<screen>.md` per screen, following `refs/README.md`: what is worth
taking, what is not, and the decision underneath, with numbers when they matter.
State where each reference comes from; a reference never overrides the principles.

## 2. Two directions, rendered → G3
Both directions share the baseline, follow PRINCIPLES.md, and differ on
several structure axes (navigation, entry, layout, imagery), not just on color. Both serve the **same
audience** as the core screen: a public or visitor screen gets public
structures (document, editorial, focused task), never back-office ones
(sidebar + list, dense status banners, tables), which belong to operator and
admin screens. A direction that changes the audience is not an alternative. For each direction:
- a compact plan: structure axes, shadcn variables (accent, neutrals' tint,
  ring, `--radius`), typefaces and roles, reviewed against the brief: revise
  anything you would have produced for any similar product;
- `design/mocks/direction-<a|b>.html`: the **core screen** in the product's
  idiom — Tailwind v4 browser build + shadcn tokens and component markup (see
  `mocks/README.md`), real French copy and real states;
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
| `tokens.md` | shadcn variables (light + dark, contrast checked), `--radius`, type (≤6 sizes, ≤3 weights), business spacing subset, elevation, icon sizes |
| `components.md` | the shadcn components and blocks used; only the project's deviations; anatomy and states of composed product components; 44px touch target |
| `layout.md` | max-width, gutters, columns per viewport; what stacks, hides or moves at 390 / 768 / 1440 / 1920 |
| `anti-patterns.md` | the defaults plus project-specific bans; removing a default needs a reason in DECISIONS.md |
| `system.json` | the same decisions, machine-readable: `baseline`, sources, token files, UI kit dirs, scales, shadcn color names, the icon family, anti-pattern regexes |
| `mocks/core.html` | the chosen direction rebuilt with the final tokens; the reference builders reproduce |

`tokens.md` and `system.json` must agree. Scales are per project: choose values
that suit this product, but keep each scale closed and small.

## 4. Done
`agentic design-lint --spec --project .` returns PASS. Return: direction
summary, the lint verdict, the mock screenshot paths, open questions (≤3).
Memory updates are proposals to the orchestrator.
