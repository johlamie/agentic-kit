# TOKENS — Sceau
> Justification humaine de `design/system.json`. Valeurs recopiées telles quelles
> dans `globals.css` (`:root`, `.dark`, `@theme inline`), comme dans `mocks/core.html`.

## Baseline
shadcn/ui (new-york, v4) sur Tailwind CSS v4, icônes lucide-react. Next.js.

Ce qui rend Sceau reconnaissable sans quitter la base : un vert profond
institutionnel, Fraunces pour les noms, des angles nets et le sceau.

## Color roles
| Variable | Light (oklch) | Dark (oklch) | Décision |
|---|---|---|---|
| `--background` / `--foreground` | 0.985 0.004 165 / 0.22 0.02 170 | 0.17 0.012 170 / 0.95 0.008 165 | neutres légèrement teintés vers l'accent |
| `--card`, `--popover` | 1 0 0 | 0.21 0.014 170 | la fiche se détache du fond par un blanc pur |
| `--primary` / `--primary-foreground` | 0.42 0.085 168 / 0.985 0.005 165 | 0.72 0.1 165 / 0.2 0.03 170 | vert registre ; contraste AA ≥ 7:1 sur blanc |
| `--secondary`, `--muted`, `--accent` | 0.955 0.012 165 · 0.96 0.008 165 · 0.95 0.02 165 | 0.26 0.015 170 · 0.26 0.015 170 · 0.28 0.02 168 | surfaces des pastilles de la traçabilité |
| `--muted-foreground` | 0.5 0.02 170 | 0.7 0.015 170 | libellés ; AA sur card |
| `--destructive` | 0.55 0.19 27 | 0.68 0.17 25 | révocation uniquement |
| `--warning` (ajout projet) | 0.62 0.13 70 | 0.78 0.12 75 | « Introuvable » : ni succès ni fraude |
| `--border`, `--input` | 0.91 0.012 165 | blanc 12 % / 15 % | filets de la fiche |
| `--ring` | = primary | = primary | |

## Radius
`--radius: 0.375rem` : net et administratif. sm 4 px, md 6 px, lg 8 px, xl 10 px.

## Type
| Key | Use |
|---|---|
| `xs` | badges de verdict |
| `sm` | libellés, textes d'aide, boutons |
| `base` | valeurs de la fiche, champs |
| `lg` | intitulé du diplôme, marque |
| `2xl` | titre de l'état Introuvable (phrase longue) |
| `4xl` | nom du titulaire, titre d'accueil |
Weights: normal, medium. Fraunces (display, opsz 9–144, 400–500) via `next/font/google`,
classe `font-display` ; Instrument Sans (400–600) en `font-sans`.

## Spacing
Grille 4 px. Code métier : 1, 2, 3, 4, 6, 8, 12 (4 à 48 px) ; 24 (96 px) pour le haut de l'accueil.

## Elevation, motion, icons
- Ombres : `shadow-xs` sur les boutons outline et champs ; aucune sur les cartes (filets seuls).
- Motion : un seul moment, le sceau qui se trace (stroke-dashoffset, 600 ms) à l'arrivée du verdict ; désactivé si `prefers-reduced-motion`.
- Icons : lucide-react, 14 (dans les badges, via `size-3.5`), 16 (boutons, listes), 20 (bouton icône mobile).
