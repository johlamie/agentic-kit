# Agentic Delivery Kit — v3 "Full Agency"

Une idée entre ; un MVP déployé et accessible sort. Le système reproduit une
équipe d'agence complète : PM → recherche → choix tech → design → provisioning →
build parallèle → revue → QA E2E → déploiement → handoff → rétrospective.
Toi, tu n'interviens qu'à 4 portes de validation.

## Alterner entre Claude Code et Codex

Une couche Codex reprend les huit rôles depuis les mêmes fiches d'agents et
ajoute une mémoire partagée, des checkpoints attribués et un lanceur commun :

```bash
./setup/codex-kit-setup.sh
cd ~/projects/mon-projet
agentic init
agentic run claude
# Après un checkpoint et la fermeture de Claude :
agentic run codex
```

La mémoire historique Claude est conservée via des liens de compatibilité.
`agentic init` détecte automatiquement l'ancien kit, sauvegarde et vérifie la
migration, puis met à jour l'intégration. Il préserve les liens entre CLAUDE.md
et AGENTS.md ; un projet déjà à jour n'est pas modifié.
Les conversations, permissions et authentifications restent propres à chaque
outil. Le [guide Claude/Codex](docs/CLAUDE_CODEX_WORKFLOW.md) détaille
l'installation, les commits attribués, les MCP et les limites du Supervisor.

## L'équipe (8 agents, mémoire persistante)

| Agent | Modèle | Mémoire | MCP |
|---|---|---|---|
| product-manager | opus | user | — |
| researcher | sonnet | user | websearch |
| architect | opus | project | — |
| designer | opus | user | **mobbin** |
| builder ×N | sonnet | project | context7 |
| reviewer | sonnet | project | — |
| qa | sonnet | project | **playwright** |
| devops | sonnet | user | supabase, firebase |

Mémoire `user` = apprend à travers TOUS tes projets (le PM connaît ton marché,
le devops tient la carte du serveur, le designer tes contraintes — pas tes
palettes : chaque projet a sa propre identité visuelle, tirée de références
Mobbin décomposées). Mémoire `project` = patterns propres au codebase.

## Les 4 portes (tout le reste est autonome)

- **G1** — périmètre : tu valides SPEC.md
- **G2** — stack & budget : tu valides TECH.md (matrice de décision Supabase /
  Firebase / local + coût mensuel)
- **G3** — direction design : tu choisis entre 2 directions
- **G4** — exposition publique : tu valides le déploiement

## Supervisor indépendant

Le kit inclut désormais un daemon local séparé : Claude propose et construit,
Codex vérifie indépendamment les jalons, puis rend `PASS`, `CHALLENGE`, `BLOCK`
ou `HUMAN_REQUIRED`. Les audits couvrent recherche/sources, architecture,
sécurité, code, reviewer/QA, design, frontend réellement rendu, responsive,
accessibilité, pré-déploiement et final. Ils sont asynchrones, persistés dans
SQLite et ne remplacent aucune porte G1–G4.

Le Supervisor est isolé sous `supervisor/`, lié uniquement à `127.0.0.1`, lance
Codex en sandbox lecture seule et peut notifier Telegram sans accepter de
commande distante. Les propositions de refonte restent sous
`.claude/supervisor/proposals/` et n'écrasent jamais le frontend Claude. Kimi
n'est pas relié à ce service. Voir [le guide opérationnel](supervisor/README.md).

Pendant une session Claude réelle, le même daemon sert aussi un fil d'activité
local `/<nom-projet>`. La route disparaît au dernier `SessionEnd`; aucun serveur
ni processus n'est créé par projet. Depuis un Mac, elle se consulte par tunnel
SSH sur le port 8787. `agentic-supervisor ui --project "$PWD"` retourne l'URL
exacte. Les alertes Telegram détaillées sont émises uniquement par Kriton
Supervisor à partir des hooks structurés, jamais directement par Claude.

Guides pratiques :

- [configuration et actions humaines restantes](docs/HUMAN_ACTIONS_AND_CONFIGURATION.md) ;
- [démarrer, créer, adopter ou reprendre un projet](docs/PROJECT_WORKFLOW_GUIDE.md).

## Definition of Done (non négociable)

URL publique (web) et/ou lien Expo + QR (mobile) · compte de test · données de
démo seedées · QA PASS sur la cible déployée (mobile 390px + desktop, erreurs,
3G lent) · README + guide utilisateur 1 page · limitations connues · commande
de rollback.

## Installation (VPS neuve Ubuntu 22.04)

```bash
git clone <ton-repo-du-kit> ~/agentic-kit && cd ~/agentic-kit
chmod +x setup/*.sh
./setup/bootstrap-vps.sh    # système, node 22, claude code, pm2, nginx, certbot,
                            # ufw, supabase cli, firebase-tools, eas, playwright
                            # + link-kit.sh : ~/.claude/ symlinké vers le repo
claude                      # login première fois
export SUPABASE_ACCESS_TOKEN=sbp_...   # token depuis le dashboard Supabase
./setup/mcp-setup.sh        # mobbin, context7, playwright, github, supabase, firebase
./setup/supervisor-setup.sh # build, config privée, skills, daemon PM2
./setup/codex-mcp-setup.sh --playwright --context7
# Claude MCP et Codex MCP restent deux configurations indépendantes
./scripts/check-runtime.sh  # valide le kit, les binaires, Claude doctor et les MCP
```

Claude Code est installé avec son installeur natif dans le compte utilisateur,
et non avec `sudo npm -g`. Cela permet à `claude update` de fonctionner sans
droits root. Le bootstrap conserve Node/npm global uniquement pour PM2,
Firebase Tools et EAS CLI.

## Validation du kit

Avant de pousser une modification des agents, skills ou scripts :

```bash
./scripts/validate-kit.sh   # hors-ligne : JSON, Bash, manifests, templates, garde-fous
./scripts/smoke-install.sh  # installe les symlinks dans un HOME temporaire
cd supervisor && npm ci && npm run typecheck && npm test && npm run build
./scripts/check-runtime.sh  # diagnostic VPS : outils, Claude doctor, état des MCP
```

La CI GitHub reprend les deux premiers contrôles, exécute ShellCheck et vérifie
l'installation native de Claude Code sur Ubuntu 22.04. `check-runtime.sh` reste
un diagnostic de machine : il ne modifie rien, mais ses résultats MCP dépendent
des authentifications locales.

## Faire évoluer le kit (git)

`~/.claude/{CLAUDE.md,agents,skills,templates,settings.json}` sont des **symlinks**
vers `global/` du repo. Donc : tu améliores un agent ou tu ajoutes un skill →
c'est actif immédiatement ET c'est dans le repo → `git commit && git push`.

Ne sont **jamais** versionnés (`.gitignore`) : `~/.claude/agent-memory/` (mémoires
scope user : carte serveur, préférences — spécifiques à la machine) et
`settings.local.json` (overrides perso).

Ajouter un skill = un dossier + un `SKILL.md`. Ajouter un agent = un fichier `.md`.
**Soigne la `description`** : c'est le seul signal qui décide si l'agent/skill sera
déclenché. Format qui marche : *ce que ça fait* + « Use when… ».

## Qui appelle les agents ?

Claude choisit seul, en lisant la `description` de chaque agent. Tu ne nommes
jamais un agent. Deux couches de fiabilité : le tableau de l'équipe dans
`CLAUDE.md` et la séquence imposée par `delivery-pipeline`. Tu peux toujours
forcer : « fais relire ça par le reviewer ».

### Permissions — trois étages et un juge

L'agent **exécute** maintenant les commandes qui l'arrêtaient avant : déploiements,
nginx, certbot, pm2, migrations, push, merge, rm. Tu n'as plus à revenir dans le
terminal pour les taper. Ce qui le retient tient en trois étages, évalués dans
cet ordre par Claude Code :

| Étage | Contenu | Comportement |
|---|---|---|
| **`deny`** | ce qui met le serveur en PLS : `ufw`, arrêt de SSH, `mkfs`, `dd`, `apt purge`, `sudo rm`, reboot, `rm -rf /`, plus `.env`/`.ssh` et les règles de l'agent | **jamais**, par personne — même un hook qui répond « allow » ne peut pas débloquer |
| **`ask`** | règles explicites : migration de schéma en prod, suppression d'un projet cloud, publication sur un store ; contrôles contextuels : suppressions globales, mises à jour larges ou cibles ambiguës | **on te demande** quand une règle ou un contrôle l'exige — accepter / refuser / « non, fais plutôt ça » |
| **le juge** | tout le reste | il évalue au moment de l'appel et décide |

Le juge n'est pas un script maison : c'est le **mode auto** de Claude Code, un
second modèle qui relit chaque action. Tu le configures en français dans le bloc
`autoMode` de `settings.json` — il connaît ta VPS, pm2, nginx, et sait qu'un
projet listé comme live n'est pas un bac à sable.

```bash
claude auto-mode config      # les règles réellement appliquées
claude auto-mode critique    # une IA relit tes règles et signale les ambiguës
```

**`classifyAllShell: true`** demande au runtime de soumettre les commandes shell
au juge, y compris celles couvertes par une règle d'autorisation étroite.
Le kit n'inspecte pas lui-même tous les scripts derrière `npm run deploy` : la
décision finale dépend aussi du runtime et du modèle. Ce réglage ne constitue
pas une sandbox. Les opérations locales nommées, comme `npm uninstall lodash`,
passent les contrôles contextuels avant de revenir au juge.

### Le gardien — ce que les patterns ne savent pas dire

`global/hooks/agent-guard.sh` (aucun appel LLM) ajoute quatre
choses impossibles à exprimer en motifs texte :

- **Deux étages d'agents.** Le hook refuse aux sous-agents certaines commandes
  reconnues, dont les formes ordinaires de `git push` et de gestion nginx.
  Il les distingue via le champ `agent_type`. Les commandes sans décision du
  hook restent soumises aux autres contrôles du runtime.
- **`rm` conscient du chemin.** `Bash(rm -rf:*)` en deny bloquait aussi bien un
  `node_modules` qu'un `/etc`. Ici la cible est analysée : dans un projet →
  routine ; le dossier entier d'un projet → on te demande ; ailleurs → refusé.
- **Les projets en production.** « Déjà en ligne » est un fait, pas un motif.
  Le hook demande confirmation pour les mutations qu'il reconnaît sur les
  projets nommés dans `~/.claude/production-projects`.
- **La portée Write/Edit.** Le hook contrôle les chemins des outils de fichiers
  et certaines lectures shell évidentes, comme `cat .env`. Les alias par symlink
  et variantes shell ont une couverture incomplète ; voir l'audit indépendant
  dans `docs/audits/2026-09-07/AUDIT_REPORT.md`.

```bash
./global/hooks/agent-guard.sh --self-test   # table de décision complète
```

### Marquer un projet comme « en production » — à faire au premier déploiement

`~/.claude/production-projects` liste les apps qui ont de vrais utilisateurs.
**L'absence d'un projet dans cette liste ne prouve pas qu'il est jetable et
n'autorise aucun déploiement.** L'agent doit vérifier la cible et respecter la
mission autorisée ainsi que G4. Cette liste est une protection complémentaire,
déclarative ; elle ne découvre pas les applications en ligne.

**Au premier déploiement réussi d'un projet (G4), ajoute-le :**

```bash
echo "mon-projet" >> ~/.claude/production-projects
```

Une ligne par projet, le **nom du dossier** sous `~/projects/`, sans chemin. Les
lignes vides et celles commençant par `#` sont ignorées.

À partir de là, les formes reconnues de déploiement, `pm2`, migration, merge et
suppression de fichier demandent confirmation. Certains chemins explicites vers
un autre projet sont également contrôlés. Les wrappers, alias et cibles distantes
ne sont pas tous couverts : utiliser un checkout et des données de développement
physiquement séparés pour travailler sans affecter une application en ligne.

Le fichier est en `deny` pour l'agent **volontairement** : toi seul y ajoutes un
projet, pour qu'il ne puisse jamais s'en retirer discrètement. L'agent te
rappellera la ligne exacte à taper au moment du ship.

Vérifier ce qui est marqué :

```bash
./scripts/check-runtime.sh   # affiche "production-projects list present (N project(s) marked live)"
```

### Puis-je supprimer un fichier dans un autre projet ?

Oui, **si tu le demandes explicitement**. C'est une règle du classifier : agir
dans le projet courant est de la routine, aller dans un *autre* projet est une
sortie de périmètre — bloquée par défaut, sauf si ton message décrit précisément
l'action.

| Ce que tu écris | Résultat |
|---|---|
| « supprime `~/projects/B/vieux-script.ts` » | ✅ passe — action nommée |
| « nettoie mes projets » | ❌ bloqué — demande générale |
| idem, mais B est marqué en production | ⏸️ le gardien te demande confirmation d'abord |

La même logique vaut pour tout le reste : une intention **précise** de ta part
lève les blocages souples du juge. Une consigne vague, non.

`--dangerously-skip-permissions` supprime TOUTE confirmation, y compris les
étages ci-dessus : à réserver aux environnements **jetables**. Avec le mode auto
tu n'en as plus besoin — c'est précisément ce qu'il remplace.

⚠️ **Limite connue** : `~/.claude` est un symlink vers ce repo, donc le `deny` sur
`~/.claude/**` ne couvre pas les mêmes fichiers atteints par leur chemin de clone
(`<ton-clone>/global/…`). Modifier le kit reste possible — c'est voulu — mais
garde-le comme un acte délibéré et relis le diff.

### Portabilité

Rien dans `global/settings.json` ne nomme une machine, un domaine ou un
fournisseur : un clone frais se comporte à l'identique. Le seul bloc qui gagne à
être personnalisé est `autoMode.environment` (ton org de source control, tes
buckets, tes domaines internes) — il est marqué comme tel dans le fichier.
Les préférences personnelles (modèle, thème) vont dans
`~/.claude/settings.local.json`, qui n'est pas versionné.
Le gardien suit la même règle : il lit `~/projects` par défaut, surchargeable
via `CLAUDE_PROJECTS_ROOT`, et n'a aucun chemin en dur.

### Git & branches

Tout dev de feature ou d'évolution se fait sur `feature/<slug>`, créée hors de
`main` en Phase 0. Quand reviewer + qa sont PASS sur le candidat courant et que
les audits requis sont résolus, l'orchestrateur peut intégrer **si le workflow
Git autorisé par l'utilisateur comprend ce merge** :

```bash
git checkout main && git merge feature/<slug> && git branch -d feature/<slug>
```

Un PASS ou l'absence de statut live ne vaut pas autorisation de merge. Une
autorisation déjà donnée pour cette action et cette cible reste valable, sous
réserve des restrictions du runtime. Aucun GitHub requis : tout est local.

## Organisation

```
~/.claude/                     ← global : CLAUDE.md orchestrateur, agents/, skills/,
│                                templates/, hooks/ (agent-guard.sh),
│                                production-projects (les apps en ligne — à toi),
│                                agent-memory (scope user)
~/projects/<projet>/           ← créé par le pipeline, un par idée
├── CLAUDE.md                  ← delta uniquement (port, commandes)
├── SPEC.md  RESEARCH.md  TECH.md  ARCHITECTURE.md  GUIDE.md
├── design/  qa/evidence/
├── .claude/memory/            ← PROJECT_STATE, DECISIONS, LESSONS, CAPABILITY_GAPS
├── .claude/agent-memory/      ← mémoires scope project
└── (code : structure décidée par architect)
```

## Exemple de bout en bout — "QR codes d'authentification de diplômes"

```bash
mkdir -p ~/projects/diploma-qr && cd ~/projects/diploma-qr && claude
> Je veux une app pour créer des QR codes d'authentification de diplômes.
```
1. **PM** : questions (qui scanne ? qui émet ? volume ? offline ?) → SPEC.md → **G1**
2. **Researcher** : solutions existantes (vérification de diplômes, blockchain vs
   signature), librairies QR + signature (ex: JWS), risques → RESEARCH.md
3. **Architect** : matrice → probable Next.js + Supabase (relationnel : écoles/
   diplômes/vérifications, RLS, pas de temps réel) ; coût : free tier → **G2**
4. **Designer** : références Mobbin (flows de vérification, scanners), décomposition,
   2 directions → **G3** → design/
5. **Devops** : projet Supabase créé, schéma + RLS, compte démo, .env
6. **Builders** (parallèle) : slice émission / slice vérification par scan / slice admin
7. **Reviewer + QA** par slice (Playwright : émettre → scanner → verdict ✓)
8. **G4** → deploy `diploma-qr.tondomaine.tld` + SSL, seed, QA sur l'URL publique
9. **Handoff** : URL, compte test, guide 1 page, limitations, rollback
10. **Rétro** : leçons + gaps (ex: "MCP Sentry utile pour le monitoring → proposer")

## Projets existants

`cd` dans le repo → `claude` → « adopte ce projet » (skill adopt-project :
analyse la stack et les commits, génère les fichiers mémoire, tu valides).

## Plus tard (volontairement hors v3)

- **Headless/cron** : `claude -p "lis PROJECT_STATE.md, exécute la prochaine étape"`
  planifié la nuit — après rodage interactif seulement.
- **Dynamic Workflows** : orchestration générée par Claude, fan-out massif
  d'agents avec vérification adversariale — pour migrations/audits lourds.
- **Monitoring** (Sentry MCP), **publication stores** (EAS Submit), **paiements
  sandbox** (CinetPay/mobile money) : à ajouter par projet via la boucle
  CAPABILITY_GAPS quand le besoin devient réel.

## Coûts à connaître

Mobbin Pro ~10$/mois (MCP officiel) · Supabase/Firebase free tiers OK pour POC ·
Agents opus (PM, architect, designer) = jugement ; sonnet partout ailleurs =
volume. Le pipeline complet d'un MVP consomme beaucoup de tokens : un plan Max
est le bon réglage.
