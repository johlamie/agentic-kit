# TOKENS
> Owner: designer. Human-readable rationale for `design/system.json`, which is the
> machine-readable contract enforced by `agentic design-lint`. Both must agree.

## Baseline (shared by every project)
- **shadcn/ui on Tailwind CSS v4**, icons **lucide-react**. Tokens are the
  shadcn CSS variables in `globals.css` (`:root` and `.dark`, OKLCH values,
  mapped with `@theme inline`). Check the current shadcn and Tailwind docs
  (context7) before writing values: follow today's idiom, not memory.
- React Native / Expo: NativeWind + React Native Reusables (the shadcn port).
- Another baseline only with a written reason in DECISIONS.md (`"baseline": "custom"`).

The baseline gives the clean, current feel. **This file makes it yours**:
TODO(designer) — in one sentence, what makes this product's surface recognizable
(accent, typeface, radius personality, imagery), without leaving the baseline.

## Color roles (shadcn variables — never framework palette names)
| Variable | Light (oklch) | Dark (oklch) | Decision |
|---|---|---|---|
| `--background` / `--foreground` | TODO(designer) | | pure neutral or tinted toward the accent? |
| `--primary` / `--primary-foreground` | | | the brand accent; AA on its foreground |
| `--secondary`, `--muted`, `--accent` (+ `-foreground`) | | | |
| `--card`, `--popover` | | | same as background or a subtle surface step |
| `--border`, `--input`, `--ring` | | | |
| `--destructive` | | | |
| `--chart-1..5` | | | only if the product shows data |
Leaving the neutral shadcn defaults untouched is not a design decision: pick at
least the accent, the neutrals' tint and the ring.

## Radius
`--radius`: TODO(designer) rem (shadcn derives sm/md/lg/xl from it). 0.375 feels
sharp and technical, 0.625 is the shadcn default, 1rem+ feels soft and friendly.

## Type (≤6 sizes, ≤3 weights)
| Key | Use |
|---|---|
| TODO(designer) | e.g. `xs` badges, `sm` UI/meta, `base` body, `lg` card titles, `2xl` page titles, `4xl` hero |
Typefaces (loaded with `next/font` or equivalent): TODO(designer) — sans for UI;
optional display face for headings; why it fits this subject.

## Spacing
Tailwind's 4px grid. Business code uses the closed subset in system.json
(e.g. `2`=8 inside groups, `4`=16 in cards, `6`=24 between groups, `12`–`24`
between sections). Components keep shadcn's own anatomy.

## Elevation, motion, icons
- Shadows: shadcn's `shadow-xs`/`shadow-sm` for controls and cards; TODO(designer) the overlay level.
- Motion: TODO(designer) — the one intentional moment (page entry, reveal, confirmation).
- Icons: lucide-react, sizes TODO(designer) (e.g. 16 in buttons, 20 in inputs, 24 in navigation).
