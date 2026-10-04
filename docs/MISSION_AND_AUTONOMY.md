# Missions et autonomie

Donner une idée, laisser le système avancer jusqu'à la prochaine vraie décision,
et n'être sollicité que pour ce qui touche le monde réel.

## Lancer et reprendre une mission

Nouvelle mission : le projet n'existe pas encore, donc pas encore de dépôt Git.
Lance Claude Code directement depuis `~/projects` (`agentic run` exige un projet) :

```text
cd ~/projects && claude
> /mission app de vérification de diplômes
```

Claude demande le nom et le profil s'ils manquent, crée le projet
(`~/projects/<nom>`, Git, mémoire partagée), remplit
`.agentic/memory/MISSION.md`, puis enchaîne le pipeline. Il s'arrête proprement
et écrit dans MISSION.md › « En attente de toi » la question ou la commande
attendue.

Le lendemain, dans le projet : `agentic run claude` puis `/mission` (sans
argument) pour reprendre là où la mission s'est arrêtée.

Les mêmes actions existent en ligne de commande, pour toi comme pour
l'orchestrateur, qui peut décider seul de lancer une mission :

| Commande | Effet |
|---|---|
| `agentic mission start --idea "…" [--name x] [--profile …]` | crée le projet et la mission |
| `agentic mission status --project .` | profil effectif, phase, questions et demandes en attente |
| `agentic mission run --project <dossier>` | lance la mission sans session ouverte (`claude -p`) |
| `agentic approvals --project .` | demandes mises en file pendant un run sans surveillance |

## Profils

| Profil | Portes | Interdit |
|---|---|---|
| `supervised` (défaut) | tu tranches G1 à G4 ; autonomie entre les portes | — |
| `lab` | G1 à G3 tranchées par des défauts écrits (DECISIONS.md) ; G4 à toi | argent, secrets, prod sans toi |
| `local-only` | G1 à G3 à toi ; pas de G4 | déploiement, DNS, API payante, URL publique |

`lab` donne du pouvoir à l'agent : il ne s'applique qu'après
`agentic grant <projet> profile lab`, tapé par toi. Sans cela, la mission suit
`supervised` et te le signale.

## Ce qui te sollicite encore

Le garde décide selon la cible, plus selon le texte de la commande :

| Niveau | Exemples | Comportement |
|---|---|---|
| Libre | modifier, tester, committer, installer dans le projet, pousser une branche de travail | aucune question |
| Arrêt | push ou merge vers une branche protégée d'un projet en prod (main, master, prod, release…), déploiement, services, migrations, suppression d'un projet, fichier `.env` | une question, ou une file d'attente en mode sans surveillance |
| Interdit | ce qui peut couper la machine ou exposer des secrets | refus |

Dans un projet listé dans `~/.claude/production-projects`, les modifications de
fichiers et les merges demandent aussi confirmation tant que tu n'as pas indiqué
que la prod tourne ailleurs que dans ce dossier (`checkout-not-served`).

## Tes autorisations : `agentic grant`

Elles vivent dans `~/.config/agentic-kit/grants/<projet>` (un fichier par
projet, lisible seulement par toi). L'agent peut les lire, jamais les écrire ni
lancer `agentic grant` : le garde refuse.

| Commande | Effet |
|---|---|
| `agentic grant talendici checkout-not-served` | la prod ne tourne pas depuis ce dossier : modifications et merges libres |
| `agentic grant talendici push main` | autorise le push vers `main` |
| `agentic grant talendici merge develop` | autorise le merge dans `develop` si elle est protégée |
| `agentic grant talendici deploy-branch stable` | protège une branche supplémentaire |
| `agentic grant jouet profile lab` | débloque le profil `lab` |
| `agentic revoke …` / `agentic grants` | retirer / lister |

Depuis Claude Code, tape-les avec le préfixe `!` (par exemple
`! agentic grant talendici push main`). Si le garde la refuse, c'est que les
commandes `!` passent par les hooks dans ta version de Claude Code : tape-la
alors dans un terminal à côté.

Sous Codex, le garde ne tourne pas ; la consigne est donnée à l'agent et le
bac à sable de Codex empêche d'écrire hors du projet sans ton accord.

## Runs sans surveillance

`agentic mission run` et `agentic run claude -- -p …` marquent la session
« sans surveillance ». Une action du niveau « Arrêt » n'y bloque pas la
mission : elle est refusée, enregistrée dans `.agentic/approvals/` (hors Git),
recopiée dans MISSION.md, et l'agent continue le reste. À ton retour :
`agentic approvals`, puis tu réponds dans une session normale.

## Limites connues

- Les interdits de `local-only` (déploiement, DNS, API payante) reposent sur
  les consignes de la mission, pas encore sur le garde.
- Le garde lit les commandes, pas leur effet réel : un script maison qui
  déploie sous un autre nom n'est reconnu que par le juge natif de Claude Code.
- Les demandes en file se valident dans une session normale ; il n'y a pas
  encore de bouton dans l'interface du Supervisor.
