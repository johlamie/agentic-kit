# Design implémentable — du Mobbin au code conforme

Un front « générique IA » vient rarement du builder seul : le design arrivait
trop flou, le scaffold gardait le thème par défaut et personne ne pouvait faire
échouer un écran laid. La chaîne ci-dessous rend le système visuel obéissable
par le builder et vérifiable par une machine ; le goût reste jugé par l'audit
visuel du Supervisor et par vous au G3.

## Base commune, originalité structurelle

Chaque produit part de la même base moderne, celle qui donne aujourd'hui les
interfaces épurées : **shadcn/ui sur Tailwind CSS v4**, icônes lucide, tokens =
variables CSS shadcn (sur Expo : NativeWind + React Native Reusables). Ce n'est
pas un choix par projet : l'architecte l'inscrit dans TECH.md avec les versions
du moment, et une autre base n'est possible qu'avec une raison écrite, validée au G2.

L'originalité se joue au-dessus de cette base, selon le type de site :

| Axe | Exemples |
|---|---|
| Navigation | barre haute, sidebar, onglets bas, dock flottant, palette de commandes, méga-menu |
| Entrée / hero | titre, visuel produit, démo live, recherche, donnée clé |
| Structure de page | split, bento, colonnes éditoriales, liste-détail, canvas, flux, tâche unique |
| Images | direction photo, illustration, captures produit, 3D, datavis — ou aucune, volontairement |
| Typographie | police de titre, contraste d'échelle |
| Accent et rayon | `--primary`, teinte des neutres, `--radius` |
| Moment signature | une animation, une rupture de grille, une interaction |

Les deux directions du G3 partagent la base et diffèrent sur plusieurs de ces
axes, pas seulement sur la couleur. Laisser le thème shadcn par défaut intact
(neutre, rayon par défaut, sans accent) est refusé : c'est un template, pas un design.

## La chaîne

```text
SPEC + RESEARCH
  → designer (skill design-system)
      refs Mobbin décomposées en px → 2 directions RENDUES en Tailwind + shadcn
      (même base, structures différentes ; captures 390/1440)
  → G3 : vous choisissez sur des écrans, pas sur de l'ASCII
  → designer : design/ complet + system.json      ── agentic design-lint --spec = PASS
  → scaffold sans décision visuelle
  → slice 0 ui-kit (builder) : shadcn init/add, tokens = thème shadcn, écarts, route /_kit
  → slices métier : composent shadcn + le kit, KIT_GAP au lieu d'inventer
  → reviewer (design-conformance + agentic design-lint)  ── FAIL si hors système
  → qa (ui-checks.spec.ts + comparaison layout.md / mock)  ── FAIL overflow, cible < 44px
  → Supervisor visual_ux_audit PASS enregistré            ── sinon la slice n'est pas DONE
```

## Le livrable du designer (`design/`)

| Fichier | Contenu obligatoire |
|---|---|
| `DESIGN.md` | écrans ↔ étapes SPEC, hiérarchie, composants, 4 états |
| `tokens.md` | variables shadcn (clair + sombre, contraste vérifié), `--radius`, ≤6 tailles, ≤3 graisses, sous-ensemble d'espacements, icônes |
| `components.md` | composants et blocks shadcn utilisés, écarts du projet seulement, composants produit composés avec leurs états |
| `layout.md` | max-width, gouttières, colonnes, comportement 390/768/1440/1920 |
| `anti-patterns.md` | interdits par défaut + interdits du projet |
| `system.json` | les mêmes décisions, lisibles par `agentic design-lint` (dont `baseline`) |
| `refs/*.md` | une décomposition chiffrée par écran de référence |
| `mocks/core.html` | l'écran cœur rendu en Tailwind + markup shadcn, que les builders reproduisent |

`agentic design-init --project .` copie les modèles sans rien écraser. Tant
qu'il reste un `TODO(designer)`, `agentic design-lint --spec` échoue.

Les valeurs sont propres à chaque projet ; ce qui est imposé, c'est la base
shadcn/Tailwind et des échelles **fermées et courtes** pour le code métier.

## Ce que `agentic design-lint` fait échouer

| Règle | Exemple |
|---|---|
| `baseline` | `components.json` absent, ou `tailwindcss` absent de `package.json` |
| `raw-color` | `#7c3aed`, `rgb(0 0 0 / .1)` hors des fichiers de tokens |
| `arbitrary-value` | `mt-[13px]` (préfixes autorisables un par un dans system.json) |
| `default-palette` | `bg-violet-600` au lieu d'un token nommé |
| `spacing-scale` / `radius-scale` / `type-scale` | `p-5`, `rounded-xl`, `font-bold` hors échelle ; `padding: 13px` en CSS |
| `icon-family` / `icon-size` | `react-icons` quand la famille est `lucide-react` ; `size={16}` hors échelle |
| `kit-bypass` | `<button>` brut hors des dossiers du kit |
| `anti-pattern:<id>` | dégradé décoratif, `uppercase`, `style={{…}}`… |
| `unjustified-allow` | `design-lint-allow` sans raison |

Dans les dossiers du kit (`components/ui`), les fichiers shadcn gardent leur
propre anatomie (valeurs arbitraires, `rounded-md`, `font-medium`…) : seuls la
famille d'icônes et la palette du framework y sont contrôlées ; le reste du kit
répond à `components.md` et au reviewer. Vérifié sur 22 composants shadcn v4
officiels : 0 violation.

Exception ponctuelle : `design-lint-allow: <raison>` sur la ligne ; le reviewer
lit chaque raison. Un projet sans `system.json` ou sans fichier UI donne
`ERROR`, jamais `PASS`.

## Skills

- `design-system` (designer), `ui-kit` (builder, slice 0), `design-conformance`
  (reviewer) : spécifiques au kit, partagés avec Codex par lien symbolique.
- `frontend-design` : skill public d'Anthropic (Apache 2.0) copié sans
  modification pour la direction esthétique ; provenance dans `SOURCE.md`.
- Côté Supervisor : `visual-quality-audit`, `ui-ux-due-diligence`,
  `accessibility-review` classent désormais chaque constat en `local` ou
  `systemic`.

## Ce qui reste humain

- Mobbin (abonnement + OAuth) : requis pour la phase Design. S'il manque, la
  phase est bloquée ; un fallback WebSearch n'est possible qu'avec votre accord
  écrit dans DECISIONS.md.
- Le choix G3, sur captures.
- Figma / V0 : optionnels. Le kit n'en dépend pas, le mock HTML rendu
  (Tailwind + shadcn) suffit et se transpose directement en code.

## Limites

Le linter vérifie des classes et des valeurs, pas la qualité : hiérarchie,
rythme perçu et « gueule » restent l'affaire de l'audit visuel et de votre œil.
Il lit Tailwind et le CSS ; les tailles (`h-10`, `w-…`) ne sont pas
contrôlées, et les styles en objets JS ne sont signalés que par l'anti-pattern
`inline-style`.
