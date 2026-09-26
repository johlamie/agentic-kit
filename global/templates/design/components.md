# COMPONENTS
> Owner: designer. Anatomy of EVERY component the product uses. The `ui-kit`
> slice implements exactly this list; business slices compose it and never
> create new atoms. A block the screens need but this file lacks is a KIT_GAP:
> the builder stops and the orchestrator routes it back to the designer.

Template per component (all numbers are tokens from tokens.md):

## Button
- Variants: TODO(designer) (e.g. primary, secondary, ghost, danger — no more than needed)
- Sizes: TODO(designer) height / padding-x / padding-y / radius / font size+weight
- Icon: TODO(designer) size, gap to label, position
- States: default · hover · focus-visible (ring token) · active · disabled · loading
- Touch target: ≥ 44×44 (hit area may exceed the visible box)
- Copy rule: verb that says what happens ("Enregistrer", not "Valider")

## Input / Field
TODO(designer): label position, help text, error text + color token, height, radius, states.

## Card / Surface
TODO(designer): padding, radius, border or shadow (one, not both by default), when NOT to use a card.

## Sheet / Dialog
TODO(designer): width per breakpoint, padding, header/footer anatomy, dismissal.

## EmptyState
TODO(designer): illustration or not, title + one-line direction + primary action.

## PageHeader
TODO(designer): title size, actions placement, back navigation, behavior at 390.

## (add every other component the screens use)
