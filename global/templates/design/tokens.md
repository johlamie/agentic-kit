# TOKENS
> Owner: designer. Human-readable rationale for `design/system.json`, which is the
> machine-readable contract enforced by `agentic design-lint`. Both must agree.
> Numbers, not moods: every value below is a closed list.

## Grid
Base grid: TODO(designer) 4 or 8 px. Every spacing value is a multiple of it.

## Spacing (closed scale)
| Key | px | Use |
|---|---|---|
| TODO(designer) | | e.g. `2`=8 inside controls, `4`=16 card padding, `6`=24 between groups, `12`=48 between sections |

## Radius (≤4 steps + none/full)
| Key | px | Use |
|---|---|---|
| TODO(designer) | | e.g. `sm`=8 controls, `lg`=16 surfaces, `full` avatars/pills |

## Type (≤6 sizes, ≤3 weights)
| Key | size/line-height | weight | Use |
|---|---|---|---|
| TODO(designer) | | | e.g. `sm` 14/20 meta, `base` 16/24 body, `xl` 20/28 titles |
Typefaces: TODO(designer) — family, role, why it fits this subject (not a default).

## Color roles (named tokens, never framework palette names)
| Token | Light | Dark | Role | Contrast checked against |
|---|---|---|---|---|
| TODO(designer) | | | e.g. `primary`, `surface`, `ink`, `muted`, `border`, `danger`, `success` | |

## Elevation, z-index, motion
- Shadows: TODO(designer) — at most 2 levels, with the exact values.
- z-index: TODO(designer) — base / sticky / overlay / toast.
- Motion: TODO(designer) — durations and the one place motion is used on purpose.

## Icons
Family: TODO(designer) (exactly one package). Sizes: TODO(designer) (e.g. 20 in controls, 24 in navigation).
