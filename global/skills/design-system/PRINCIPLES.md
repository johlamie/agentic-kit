# Design principles

The founder's taste, confirmed on real renders. They apply to every product;
each product expresses them in its own way. The shadcn/ui + Tailwind baseline
makes a screen clean; these principles make it feel right. They are the
compass. References (Mobbin, shadcn blocks, live products) are inspiration only.

1. **Clean and calm first.** Generous whitespace, few elements per screen, one
   obvious primary action. When in doubt, remove.
2. **Structure follows the audience.** Public and visitor screens read like a
   document, an editorial page or a single focused task. App shells, sidebars,
   history lists, tables and dense status banners belong to operator/admin
   screens. Never give a public screen a back-office look.
3. **Layout follows the content, per project.** Pick the arrangement that suits
   this product: single column, editorial, split, grid, list-detail, canvas…
   Columns are used when the content has distinct parts that benefit from being
   side by side (e.g. subject vs proof in Sceau), not by habit.
4. **Quiet surfaces.** Hairlines before shadows; neutrals slightly tinted
   toward the accent; one deep accent used sparingly; semantic colors only for
   states. No decoration that carries no information.
5. **Typography carries the personality.** When it fits the subject, a
   characterful display face for names and titles, a neutral sans for the UI,
   and a clear contrast of scale between them.
6. **At most one signature element, tied to the domain** (the seal in Sceau): it
   carries meaning and changes with state. It is not an ornament.
7. **States are designed, not defaulted.** Loading keeps the final geometry;
   errors say what happened and how to recover; nuance matters (not found is not
   fraud; a revoked item never shows success visuals).
8. **Mobile is the real device.** The key information is visible without
   scrolling at 390; the primary action is within thumb reach (a sticky bar when
   justified); touch targets are 44px.
9. **Plain, specific French copy.** Verbs on buttons, sentences that explain,
   no marketing filler.
10. **Restraint before shipping.** Look at the render and take one thing away.

Example of these principles applied: `examples/sceau/` (read its README first).
Specific choices there — its colors, typeface, seal, two-column split — are not
principles and are not reused by default.
