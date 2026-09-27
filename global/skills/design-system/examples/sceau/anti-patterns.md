# ANTI-PATTERNS — Sceau

## Defaults (kept)
- (lint) Dégradés décoratifs.
- (lint) Ombres lourdes ; ici aucune ombre sur les cartes.
- (lint) Libellés en capitales (le texte en capitales du sceau est un emblème SVG, pas un libellé).
- (lint) Objets `style={{…}}`.
- (lint) Couleurs de la palette Tailwind : uniquement les variables.
- Card wall, un rayon partout, marqueurs numérotés hors séquence, animations d'entrée partout.
- Thème shadcn par défaut laissé intact.

## Project-specific
- Aucune structure d'administration côté public : pas de sidebar, pas de liste d'historique, pas de tableau.
- Pas de bandeau plein écran coloré pour le verdict : le sceau et le badge portent le verdict.
- Un sceau vert n'apparaît jamais sur un diplôme révoqué ou introuvable.
- « Introuvable » n'est jamais rouge : ce n'est pas une preuve de fraude.
- Pas de photo du titulaire ni d'images d'illustration de diplômés.
- Pas de compteur de vérifications mis en avant comme une statistique (il reste dans la traçabilité).
