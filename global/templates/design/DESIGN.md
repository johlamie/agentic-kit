# DESIGN
> Owner: designer. Screen inventory mapped 1:1 to SPEC.md flow steps.
> Every `TODO(designer)` must be replaced before `agentic design-lint --spec` passes.

Chosen direction (G3): TODO(designer) — A or B, date, one-sentence reason.
Core mock: `design/mocks/core.html` (the reference builders reproduce).

## Structure — where this product is original
The baseline (shadcn/ui + Tailwind) keeps every product clean and current.
Originality lives here, chosen for this product's type and users:

| Axis | Decision (and the reference that inspired it) |
|---|---|
| Product type | TODO(designer) — landing / SaaS app / e-commerce / editorial / portfolio / mobile utility / … |
| Audience per screen | TODO(designer) — public visitor · signed-in user · operator/admin; the structure follows the audience |
| Navigation model | top bar · sidebar · bottom tabs · floating dock · command palette · mega menu · … |
| Entry / hero | what the first screen shows first, in what form (headline, product shot, live demo, search, data) |
| Page structure | split · bento · editorial columns · list-detail · canvas · feed · single focused task |
| Imagery | photo direction, illustration, product screenshots, 3D, data viz — or deliberately none |
| Typography personality | display face and scale contrast |
| Accent + radius personality | from tokens.md |
| Signature moment | the one memorable element (motion, layout break, interaction) |

The two G3 directions must differ on several of these axes, not only on color.

## Navigation
TODO(designer): pattern (tabs / stack / sheet / sidebar), items, what is always reachable.

## Screens
One block per screen. Orphan screens (no SPEC step) are scope creep: flag them.

### <screen-name> — SPEC step <n>
- Audience: TODO(designer) — public visitor, signed-in user or operator/admin.
- Job: TODO(designer) — what the user comes here to do, in one sentence.
- Hierarchy: TODO(designer) — primary / secondary / tertiary, in reading order.
- Components: TODO(designer) — names from components.md only.
- States: empty · loading · error · success — TODO(designer) copy and layout for each.
- Layout: TODO(designer) — reference to the layout.md pattern and its 390 / 1440 variant.
