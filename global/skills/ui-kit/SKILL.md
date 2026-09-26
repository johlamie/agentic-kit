---
name: ui-kit
description: Build slice 0, the project's UI kit, from design/ before any business slice. Use in pipeline Phase 6 as the first builder slice of any product with a UI, and whenever the design system changes or a KIT_GAP is approved.
---

# UI kit — slice 0 (builder)

The kit makes off-system UI hard to write. Business slices compose it; they never
restyle it. Load the `frontend-design` skill for craft; `design/` is the contract.

## Inputs
`design/system.json`, `tokens.md`, `components.md`, `layout.md`,
`anti-patterns.md`, `mocks/core.html`. Refuse to start if
`agentic design-lint --spec --project .` is not PASS.

## Build
1. **Tokens as the theme, not an extension.** Put CSS variables in the
   `token_files` declared by system.json (the only files allowed raw colors).
   - Tailwind v3: define `theme.spacing`, `theme.borderRadius`, `theme.fontSize`,
     `theme.fontWeight` and `theme.colors` at the top level of `theme` (replacing
     the defaults, NOT under `extend`), so `p-5` or `rounded-xl` do not exist
     when they are off-scale.
   - Tailwind v4: in `@theme`, reset namespaces (`--color-*: initial;`,
     `--radius-*: initial;`, `--text-*: initial;`, `--font-weight-*: initial;`)
     before declaring the tokens. v4 spacing is a multiplier, so the linter is
     what enforces the spacing scale.
   - shadcn/ui or similar: regenerate components onto these tokens, delete
     unused variants, remove any default radius or palette they bring.
   - Load the chosen typefaces explicitly; never inherit a framework default.
2. **Components** in the `ui_kit_dirs`: exactly the list in components.md,
   each with every state it specifies. Include an `Icon` wrapper restricted to
   the declared family and sizes, and layout primitives (`Page`, `Stack`,
   `Section`) that encode the layout.md frame and rhythm.
3. **`/_kit` route**: renders every component in every state and the page frame,
   with real French copy. Development/preview only: it must not be reachable in
   production builds. It is QA's and the Supervisor's stable visual target.
4. **Core screen check**: reproduce `design/mocks/core.html` with the kit on a
   throwaway route or story and compare at 390 and 1440 before returning.

## Done
- `agentic design-lint --project .` PASS (0 violations, justified allows only).
- lint, typecheck, tests green.
- Return: components built, the `/_kit` URL, deviations from the mock and why.
Then reviewer (design-conformance) → qa (ui-checks on `/_kit` and the core route)
→ Supervisor `visual_ux_audit` on `/_kit`. No business slice starts before the
kit slice is DONE.

## Afterwards
A business slice that needs a block components.md does not describe stops with
`KIT_GAP: <component> — needed by <screen/step>`. The orchestrator routes it to
the designer (spec), then to a ui-kit slice (code). A KIT_GAP counts as a repair
cycle for the blocked slice.
