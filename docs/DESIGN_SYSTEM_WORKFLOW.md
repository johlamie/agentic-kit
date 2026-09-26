# Design implémentable — du Mobbin au code conforme

Un front « générique IA » vient rarement du builder seul : le design arrivait
trop flou, le scaffold gardait le thème par défaut et personne ne pouvait faire
échouer un écran laid. La chaîne ci-dessous rend le système visuel obéissable
par le builder et vérifiable par une machine ; le goût reste jugé par l'audit
visuel du Supervisor et par vous au G3.

## La chaîne

```text
SPEC + RESEARCH
  → designer (skill design-system)
      refs Mobbin décomposées en px → 2 directions RENDUES (HTML + captures 390/1440)
  → G3 : vous choisissez sur des écrans, pas sur de l'ASCII
  → designer : design/ complet + system.json      ── agentic design-lint --spec = PASS
  → scaffold sans décision visuelle
  → slice 0 ui-kit (builder) : tokens = thème, composants + états, route /_kit
  → slices métier : composent le kit, KIT_GAP au lieu d'inventer
  → reviewer (design-conformance + agentic design-lint)  ── FAIL si hors système
  → qa (ui-checks.spec.ts + comparaison layout.md / mock)  ── FAIL overflow, cible < 44px
  → Supervisor visual_ux_audit PASS enregistré            ── sinon la slice n'est pas DONE
```

## Le livrable du designer (`design/`)

| Fichier | Contenu obligatoire |
|---|---|
| `DESIGN.md` | écrans ↔ étapes SPEC, hiérarchie, composants, 4 états |
| `tokens.md` | grille 4/8, échelles fermées (espacement, ≤4 rayons, ≤6 tailles, ≤3 graisses), rôles couleur, élévation, icônes |
| `components.md` | anatomie chiffrée de CHAQUE composant et tous ses états |
| `layout.md` | max-width, gouttières, colonnes, comportement 390/768/1440/1920 |
| `anti-patterns.md` | interdits par défaut + interdits du projet |
| `system.json` | les mêmes décisions, lisibles par `agentic design-lint` |
| `refs/*.md` | une décomposition chiffrée par écran de référence |
| `mocks/core.html` | l'écran cœur rendu, que les builders reproduisent |

`agentic design-init --project .` copie les modèles sans rien écraser. Tant
qu'il reste un `TODO(designer)`, `agentic design-lint --spec` échoue.

Les valeurs sont propres à chaque projet ; ce qui est imposé, c'est qu'elles
forment des échelles **fermées et courtes**.

## Ce que `agentic design-lint` fait échouer

| Règle | Exemple |
|---|---|
| `raw-color` | `#7c3aed`, `rgb(0 0 0 / .1)` hors des fichiers de tokens |
| `arbitrary-value` | `mt-[13px]` (préfixes autorisables un par un dans system.json) |
| `default-palette` | `bg-violet-600` au lieu d'un token nommé |
| `spacing-scale` / `radius-scale` / `type-scale` | `p-5`, `rounded-xl`, `font-bold` hors échelle ; `padding: 13px` en CSS |
| `icon-family` / `icon-size` | `react-icons` quand la famille est `lucide-react` ; `size={16}` hors échelle |
| `kit-bypass` | `<button>` brut hors des dossiers du kit |
| `anti-pattern:<id>` | dégradé décoratif, `backdrop-blur`, `uppercase`… |
| `unjustified-allow` | `design-lint-allow` sans raison |

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
- Figma / V0 : optionnels. Le kit n'en dépend pas, le mock HTML rendu suffit.

## Limites

Le linter vérifie des classes et des valeurs, pas la qualité : hiérarchie,
rythme perçu et « gueule » restent l'affaire de l'audit visuel et de votre œil.
Il lit Tailwind et le CSS ; les styles en objets JS (`style={{ padding: 13 }}`)
et les tailles (`h-10`, `w-…`) ne sont pas contrôlés.
