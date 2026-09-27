# ANTI-PATTERNS
> Owner: designer. What is forbidden in THIS product. Items marked (lint) are
> also regexes in `design/system.json` → `anti_patterns` and fail automatically;
> the others are checked by reviewer and by the Supervisor visual audit.
> You may remove a default only with a written reason in DECISIONS.md.

## Defaults (keep unless the brief explicitly calls for them)
- (lint) Decorative gradients (`bg-gradient-*`, `linear-gradient`) — decoration, not information.
- (lint) Inline style objects (`style={{…}}`) instead of Tailwind classes.
- Glass/blur on content surfaces (a blurred sticky header is idiomatic; blurred cards are not).
- Untouched shadcn defaults: neutral theme, default radius and no accent — the
  baseline without a decision reads as a template.
- Restyling shadcn internals from business code (long `className` overrides).
- (lint) Heavy shadows (`shadow-xl`, `shadow-2xl`) and the same soft shadow under every block.
- (lint) ALL-CAPS eyebrow labels (`uppercase`) above headings.
- (lint) Framework default palette classes (`bg-violet-500`…) — only named tokens.
- Card wall: content chopped into identical rounded cards regardless of hierarchy.
- One radius on everything regardless of hierarchy; more than the radius scale allows.
- Mixed icon families or sizes outside the icon scale.
- Default typeface chosen by habit (Inter/system) without a recorded reason.
- Numbered markers (01 / 02 / 03) on content that is not a sequence.
- Decorative entrance animations on every section.

## Project-specific
- TODO(designer): what the references and the brief rule out for this product.
