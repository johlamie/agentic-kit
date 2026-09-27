---
name: ui-kit
description: Build slice 0, the project's UI kit, by installing the shadcn/ui + Tailwind baseline and applying design/ to it, before any business slice. Use in pipeline Phase 6 as the first builder slice of any product with a UI, and whenever the design system changes or a KIT_GAP is approved.
---

# UI kit — slice 0 (builder)

The kit is **shadcn/ui on Tailwind CSS v4**, themed by `design/`. Business slices
compose it; they never restyle it. Load `frontend-design` for craft; `design/` is
the contract. Check the current shadcn and Tailwind docs (context7) first: CLI
flags and file layout change between versions.

## Inputs
`design/system.json`, `tokens.md`, `components.md`, `layout.md`,
`anti-patterns.md`, `mocks/core.html`. Refuse to start if
`agentic design-lint --spec --project .` is not PASS.

## Build
1. **Baseline.** Tailwind v4 as the framework guide says, then
   `npx shadcn@latest init`, then `npx shadcn@latest add <components>` for exactly
   the list in components.md (and the blocks it names). Keep the generated files
   in `components/ui`; they are the kit (`ui_kit_dirs`). Expo: NativeWind + React
   Native Reusables, same principle.
2. **Theme = design/.** Write the shadcn variables from tokens.md into
   `globals.css` (`:root`, `.dark`, `@theme inline`) — the only file with raw
   colors — set `--radius`, load the typefaces (`next/font` or equivalent). The
   untouched default theme is not acceptable.
3. **Deviations.** Apply only the deviations listed in components.md, inside the
   kit (a cva variant, a size), never through overrides at call sites.
   Touch floor: shadcn's default controls are 36px (`h-9`, `size-9`), under the
   44px mobile minimum. Give Button, Input, Select and icon buttons a responsive
   size in the kit (e.g. `h-11 sm:h-9`, `size-11 sm:size-9`) so every call site
   inherits it; QA's ui-checks fail at 390 otherwise.
4. **Composed product components** from components.md, built from shadcn parts,
   in the kit, with every state. Layout primitives (`Page`, `Section`, `Stack`)
   encode layout.md's frame and rhythm.
5. **`/_kit` route**: every component and composed component in every state, in
   light and dark, with real French copy. Development/preview only — never in a
   production build. It is QA's and the Supervisor's stable visual target.
6. **Core screen check**: reproduce `design/mocks/core.html` with the kit and
   compare at 390 and 1440 before returning.

## Done
- `agentic design-lint --project .` PASS: baseline installed, 0 violations.
- lint, typecheck, tests green.
- Return: components installed and added, deviations applied, the `/_kit` URL,
  differences from the mock and why.
Then reviewer (design-conformance) → qa (ui-checks on `/_kit` and the core route)
→ Supervisor `visual_ux_audit` on `/_kit`. No business slice starts before the
kit slice is DONE.

## Afterwards
A business slice needing a block that is neither a shadcn component nor in
components.md stops with `KIT_GAP: <component> — needed by <screen/step>`. The
orchestrator routes it to the designer (spec), then to a ui-kit slice (code). A
KIT_GAP counts as a repair cycle for the blocked slice. Updating shadcn
components is a ui-kit slice too, reviewed like any other.
