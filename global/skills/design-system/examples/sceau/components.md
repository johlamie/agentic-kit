# COMPONENTS — Sceau
> Kit = shadcn/ui. Seuls les écarts du projet sont décrits.

## From shadcn/ui
button, input, label, form, card, badge, alert, skeleton, separator, sonner.
Pas de block shadcn : la structure document n'en a pas d'équivalent.

## Project deviations
| Component | Change | Why |
|---|---|---|
| Button, Input | `h-11 sm:h-9` (lg : `h-11 sm:h-10`), icon `size-11 sm:size-9` | cible tactile 44 px sur mobile |
| Button | size `xl` : `h-12` pleine largeur, réservé à StickyActionBar | action principale au pouce |
| Badge | variants `verified` (primary/10), `revoked` (destructive/10), `unknown` (warning/15, texte foreground) ; `rounded-sm`, icône 14 | le verdict a son propre code couleur |
| Card | `shadow-none`, `rounded-lg`, bordure seule | une pièce officielle, pas une tuile |
| Alert | variant `destructive` sur fond `destructive/5`, bordure `destructive/30` | révocation lisible sans crier |

## Composed product components (components/ui/kit)
### Seal
- Built from: SVG maison (anneau texte, rosace de 18 ellipses, pastille centrale).
- Sizes: 64 px (390), 96 px (≥ 640), 128 px (≥ 1024).
- States: `idle` (pastille primary/12, coche primary) · `valid` (primary, coche blanche) ·
  `revoked` (destructive, croix + barre diagonale) · `unknown` (muted, pointillés, sans texte ni rosace).
- Accessibility: `role="img"` + aria-label décrivant le verdict ; le badge répète le verdict en texte.
### DiplomaSheet
- Built from: Card + `<dl>` en grille 1 → 2 colonnes (≥ 640), filets internes.
- Cells: `p-4 sm:p-6`, libellé `text-sm text-muted-foreground`, valeur `font-medium`, numéros `tabular-nums`.
- States: valid · revoked (date de délivrance barrée, ligne « Révoqué le » en destructive) · loading (Skeleton h-64).
### TraceTimeline
- Built from: Card + `<ol>` ; pastille `size-8 rounded-full bg-secondary`, icône 16, `gap-6` entre étapes.
- Dernière étape accentuée : primary (vérification) ou destructive (révocation).
### VerifyForm
- Label + Input (`tracking-wide`, majuscules forcées, format XXXX-XXXX) + Button primary ; lien « Scanner le QR code » en ghost primary.
- States: vide · saisie · invalide (message sous le champ, bordure destructive) · en cours (bouton désactivé + spinner) · notfound (pré-rempli, bordure warning).
### StickyActionBar (mobile < 640)
- `fixed inset-x-0 bottom-0 border-t bg-card p-4` ; Button xl + bouton icône Copier.
### SiteHeader
- `h-16 border-b bg-card`, conteneur `max-w-6xl`, marque en Fraunces lg.
