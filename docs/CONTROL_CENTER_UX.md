# Centre de contrôle Kriton Supervisor — Spécification UX

Statut : **ratifié par le propriétaire le 20 août 2026** (voir le relevé de
décisions dans le document jumeau `docs/CONTROL_CENTER_ARCHITECTURE.md`).

## 1. Intention

Un opérateur unique ouvre le centre de contrôle par tunnel SSH, souvent après
une notification Telegram ou en revenant à son poste. Il doit répondre en
moins de dix secondes à trois questions, dans cet ordre :

1. **Qu'est-ce qui m'attend ?** (demandes humaines ouvertes)
2. **Qu'est-ce qui tourne, et dans quel état ?** (projets actifs, verdicts)
3. **Que s'est-il passé récemment ?** (projets inactifs résumés)

Tout le reste est secondaire. L'écran est un poste d'observation, pas un
tableau de bord marketing : aucune action, aucune statistique décorative.

## 2. Principes

- **Hériter, pas réinventer** : mêmes tokens, même palette sémantique, même
  registre typographique et rédactionnel que le fil d'activité. Un opérateur
  qui passe de `/` à `/<slug>` ne doit percevoir aucun changement d'univers.
- **S'auto-appliquer la spec** : la spec §82 liste les anti-patterns d'UI
  générique que le Supervisor sanctionne (grilles de cartes gratuites,
  dégradés arbitraires, héros vides, graphiques décoratifs, hiérarchie
  faible, états manquants). Le centre de contrôle sera audité par ses propres
  règles : liste opérationnelle dense, hiérarchie nette, tous les états
  conçus.
- **La priorité est verticale** : ce qui exige l'humain est en haut,
  toujours, même si c'est vide (la section affirme alors explicitement
  qu'aucune intervention n'est attendue — l'absence est une information).

## 3. Architecture de l'information

```text
/                                  ← centre de contrôle (nouvel écran)
└── /<slug>                        ← fil d'activité projet (existant, inchangé)
      breadcrumb « Projets › <slug> » : « Projets » devient un lien vers /
```

Navigation totale : deux niveaux, zéro menu. Le breadcrumb existant de la vue
projet devient cliquable vers `/` — seule retouche demandée à l'écran actuel.

## 4. Structure de l'écran

```text
┌──────────────────────────────────────────────────────────────────┐
│ topbar   K · Kriton Supervisor            [santé : daemon · file │
│          Projets                            · flux · Telegram]   │
├──────────────────────────────────────────────────────────────────┤
│ h1  Centre de contrôle              ● en direct · MAJ il y a 3 s │
│                                                                  │
│ SECTION 1 — Intervention attendue (n)                            │
│ ┌ [HUMAN_REQUIRED] factures_platform · il y a 12 min ──────────┐ │
│ │ Autorisation demandée : accès clé API facturation            │ │
│ │ Action attendue : répondre dans la session Claude            │ │
│ └───────────────────────────────────────────────────────────────┘ │
│ (vide → « Aucune intervention attendue. »)                       │
│                                                                  │
│ SECTION 2 — Projets actifs (n)                                   │
│ ┌ ● factures_platform ── CHALLENGE · Code · il y a 4 min ──────┐ │
│ │ 2 sessions · file 1 en cours / 0 en attente · 1 intervention │ │
│ └─────────────────────────────────────── ouvrir le fil ─────────┘ │
│                                                                  │
│ SECTION 3 — Récemment supervisés (7 jours)                       │
│   livraison-agent    PASS · Audit final      hier 18:42          │
│   brvm-agent         BLOCK · Sécurité        lun. 14:10          │
│   (rangées atténuées, non cliquables, motif expliqué au survol)  │
└──────────────────────────────────────────────────────────────────┘
```

### Composants

- **Rangée d'attention** : réutilise la carte d'événement `human` du fil
  (liseré violet `--human`, badge uppercase), enrichie du nom de projet.
  Cliquer ouvre le fil du projet, ancré sur l'événement. Tri : la plus
  ancienne d'abord (c'est elle qui bloque depuis le plus longtemps).
- **Rangée de projet actif** : une ligne de grille, pas une carte. De gauche
  à droite : pastille d'état (couleur du dernier verdict, `--info` si aucun
  audit), nom du projet (lien vers `/<slug>`), badge du dernier verdict +
  type d'audit, horodatage relatif du dernier signal ; seconde ligne en
  `ink-3` : sessions actives, compteurs de file (seulement `en cours` et
  `en attente` ; `failed` > 0 s'affiche en `--block`), demandes ouvertes.
- **Rangée de projet inactif** : mêmes colonnes, opacité réduite, sans lien
  (la vue détaillée exige une session active — un `title`/tooltip l'explique :
  « Fil disponible pendant une session Claude active »).
- **Badge de verdict** : mapping existant conservé tel quel —
  PASS `--pass`, CHALLENGE `--challenge`, BLOCK `--block`,
  HUMAN_REQUIRED `--human`, info `--info`, erreur/indisponible `--block`
  atténué. C'est la légende des codes de sortie 0/10/20/30/40/50 du CLI.
- **Santé du daemon (topbar)** : le `dl` compact existant, avec version,
  niveau de supervision, totaux de file, état Telegram. En cas d'anomalie
  (base en erreur, file `failed` > 0), la valeur passe dans la couleur
  sémantique correspondante — pas de bannière séparée.

## 5. États (tous conçus, aucun implicite)

| État | Comportement |
|---|---|
| Aucune intervention | Section 1 affirme « Aucune intervention attendue. » en `ink-3` |
| Aucun projet actif | Section 2 : « Aucune session Claude en cours. Le Supervisor reste à l'écoute. » |
| Aucun projet du tout | Écran d'accueil calme : marque + phrase d'état + rappel de la commande `agentic-supervisor ui --project` |
| Flux SSE perdu | Point « en direct » passe à l'orange + « reconnexion… », bascule sur re-téléchargement périodique (5 s), comme le fil |
| Daemon arrêté | Événement `closed` → état terminal « Supervision arrêtée », pas de spinner infini |
| Chargement initial | Squelette texte sobre (pas de shimmer animé), remplacé dès le premier snapshot |
| Erreur snapshot | Message d'erreur daté + nouvelle tentative automatique, compteur visible |

## 6. Responsive (viewports de la spec §85)

- **390×844** : topbar condensée (santé repliée dans un résumé une-ligne),
  rangées projet sur deux lignes empilées, cibles tactiles ≥ 44 px, aucune
  troncature d'information critique.
- **768×1024** : disposition mobile élargie, santé visible en entier.
- **1440×900 / 1920×1080** : app-shell comme le fil (`overflow` confiné aux
  sections), largeur de lecture plafonnée (~1 040 px) centrée — pas
  d'étirement pleine largeur à 1920.
- Reflow réel à chaque palier, pas un desktop rétréci (spec §89).

## 7. Accessibilité (spec §88)

- Landmarks : `header`/`main`/`section` nommées (`aria-labelledby`), un seul
  `h1`, sections en `h2`.
- **Skip-link restauré** (le prototype l'a perdu ; le centre de contrôle le
  réintroduit et la vue projet le récupérera à sa migration).
- Mises à jour : compteur global dans une zone `aria-live="polite"` unique
  (« 3 projets actifs, 1 intervention attendue ») ; jamais d'annonce par
  rangée.
- Ordre de tabulation = ordre visuel ; focus visible `#96eaff` conservé ;
  liens de rangée = vrais `<a>` (navigation clavier native).
- Couleur jamais seule : chaque verdict porte son libellé texte à côté de sa
  pastille.
- `prefers-reduced-motion` : aucune pulsation ni transition.
- Contrastes : palette existante déjà conforme sur fond navy ; toute nouvelle
  combinaison vérifiée ≥ 4,5:1.

## 8. Langage visuel et rédactionnel

- Tokens repris de `styles.css:1–27` via `shared.css` (architecture D4) :
  navy `#030711→#13233e`, encres `#f5f8ff/#d8e1f0/#8d9bb2/#617089`, statuts
  `--pass/--challenge/--block/--human/--info`, radii 22/15, Inter +
  `ui-monospace` pour horodatages, badges et compteurs.
- Sombre uniquement (`color-scheme: dark`), cohérent avec le fil.
- Un seul fond ambiant discret maximum ; pas de nouveau dégradé décoratif.
- Ton : français calme et déclaratif, sans exclamation, majuscules réservées
  aux badges (`letter-spacing` .12em). Les libellés de verdicts et d'audits
  réutilisent exactement `AUDIT_LABELS` (`activity.ts:36–47`).

## 9. Non-objectifs

- Aucune action (retry, resolve, audit manuel) — CLI uniquement (spec §66).
- Aucun graphique, aucune courbe, aucun pourcentage décoratif.
- Aucune préférence utilisateur persistée, aucun thème clair, aucun i18n.
- Aucune pagination : plafonds serveur (50 demandes, fenêtre 7 j) et l'écran
  reste une liste courte par construction.
- Aucune modification visuelle du fil projet existant hors : lien breadcrumb
  vers `/` et affichage des compteurs de file déjà présents dans le snapshot
  (amélioration optionnelle, hors périmètre du premier incrément).
