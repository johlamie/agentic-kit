# LAYOUT — Sceau
> QA compare les captures à ce fichier et à `mocks/core.html`.

## Structure archetype
Split-document : colonne principale (identité, fiche, actions) + colonne de
22 rem (traçabilité, aide). Pas de block shadcn de départ.

## Frame
- Content max-width: 1152 px (`max-w-6xl`). Gutters: 16 px (390, 768), 32 px (≥ 1024).
- Columns: 1 colonne < 1024 ; `grid-cols-[1fr_22rem]` ≥ 1024, gap 48 px.
- Vertical rhythm: 48 px entre colonnes/sections, 32 px entre blocs de la colonne, 24 px dans la traçabilité, 12 px dans l'en-tête de verdict.
- Top: 32 px (390) / 48 px (≥ 1024) sur les résultats ; 48 / 96 px sur l'accueil.

## Breakpoint behavior
| Pattern | 390×844 | 768×1024 | 1440×900 | 1920×1080 |
|---|---|---|---|---|
| Navigation | marque + bouton icône Vérifier | + libellé « Registre des diplômes » et « Établissements » | idem | idem, centré 1152 |
| Verdict | sceau 64 au-dessus du texte | sceau 96 à gauche du texte | sceau 128 à gauche | idem |
| Fiche | 1 colonne, cellules p-4 | 2 colonnes, p-6 | 2 colonnes | idem |
| Traçabilité | sous la fiche | sous la fiche | colonne droite | idem |
| Actions | barre collante en bas (xl + icône) | boutons sous la fiche | idem | idem |

## Hard rules
- No horizontal page scroll at 390.
- Nom du titulaire : 2 lignes max à 390 (sinon réduire l'espacement de lettres, jamais la taille sous 2xl).
- Verdict (sceau + badge) visible sans défilement à 390.
- Le contenu ne passe jamais sous la barre collante (`pb-24` sur main).
