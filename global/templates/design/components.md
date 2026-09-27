# COMPONENTS
> Owner: designer. The kit is **shadcn/ui**: list the components the screens use
> and document only what this project changes. Business slices compose these;
> a block that is neither a shadcn component nor described here is a KIT_GAP.

## From shadcn/ui (installed with `npx shadcn@latest add …`)
TODO(designer): e.g. button, input, label, form, card, dialog, sheet, dropdown-menu,
tabs, table, badge, avatar, skeleton, sonner, navigation-menu, sidebar.
Prefer a shadcn **block** (sidebar, dashboard, login, …) as the starting structure
when one matches a screen, then adapt it to the structure chosen in DESIGN.md.

## Project deviations (only what differs from shadcn)
| Component | Change | Why |
|---|---|---|
| TODO(designer) | e.g. Button: add `size="xl"` h-12 px-8 for the hero CTA | the core action must dominate on 390 |

## Composed product components
Built from shadcn parts, owned by the kit (`components/ui` or `components/kit`):
### <ProductComponent>
- Built from: TODO(designer) (e.g. Card + Badge + Avatar)
- Anatomy: padding, gap, image ratio, title size — tokens only
- States: default · hover · focus-visible · loading (Skeleton) · empty · error
- Touch target ≥ 44×44 on mobile
