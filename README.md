# Agentic Delivery Kit — v3 "Full Agency"

Une idée entre ; un MVP déployé et accessible sort. Le système reproduit une
équipe d'agence complète : PM → recherche → choix tech → design → provisioning →
build parallèle → revue → QA E2E → déploiement → handoff → rétrospective.
Toi, tu n'interviens qu'à 4 portes de validation.

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
# dans claude : /mcp → authentifier mobbin et github (OAuth navigateur)
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
| **`ask`** | irréversible mais légitime : désinstaller une lib ou une app, montées de version en masse, migration de schéma en prod, suppression d'un projet cloud, publication sur un store | **on te demande, à chaque fois** — accepter / refuser / « non, fais plutôt ça » |
| **le juge** | tout le reste | il évalue au moment de l'appel et décide |

Le juge n'est pas un script maison : c'est le **mode auto** de Claude Code, un
second modèle qui relit chaque action. Tu le configures en français dans le bloc
`autoMode` de `settings.json` — il connaît ta VPS, pm2, nginx, et sait qu'un
projet listé comme live n'est pas un bac à sable.

```bash
claude auto-mode config      # les règles réellement appliquées
claude auto-mode critique    # une IA relit tes règles et signale les ambiguës
```

**`classifyAllShell: true`** fait passer *toute* commande shell par le juge, même
celles couvertes par une règle d'autorisation étroite. C'est ce qui ferme
structurellement le trou du wrapper : `npm run deploy` est désormais jugé sur ce
qu'il **fait**, plus sur la façon dont il est **écrit**.

### Le gardien — ce que les patterns ne savent pas dire

`global/hooks/agent-guard.sh` (~150 lignes, aucun appel LLM, ~5 ms) ajoute trois
choses impossibles à exprimer en motifs texte :

- **Deux étages d'agents.** Les 8 agents gardent exactement leurs restrictions
  d'avant : un `builder` ne peut toujours pas toucher nginx ni pousser. Seul
  l'orchestrateur passe par le juge. Le hook les distingue via le champ
  `agent_type`, présent uniquement dans un sous-agent.
- **`rm` conscient du chemin.** `Bash(rm -rf:*)` en deny bloquait aussi bien un
  `node_modules` qu'un `/etc`. Ici la cible est analysée : dans un projet →
  routine ; le dossier entier d'un projet → on te demande ; ailleurs → refusé.
- **Les projets en production.** « Déjà en ligne » est un fait, pas un motif.
  Tout projet nommé dans `~/.claude/production-projects` voit ses commandes
  modifiantes remontées vers toi.

```bash
./global/hooks/agent-guard.sh --self-test   # la table de décision, 13 cas
```

**`~/.claude/production-projects`** — une ligne par app en ligne. Le fichier est
en `deny` pour l'agent **volontairement** : toi seul y ajoutes un projet, à G4,
pour qu'il ne puisse jamais s'en retirer discrètement.

`--dangerously-skip-permissions` supprime TOUTE confirmation, y compris les
étages ci-dessus : à réserver aux environnements **jetables**. Avec le mode auto
tu n'en as plus besoin — c'est précisément ce qu'il remplace.

⚠️ **Limite connue** : `~/.claude` est un symlink vers ce repo, donc le `deny` sur
`~/.claude/**` ne couvre pas les mêmes fichiers atteints par leur chemin repo
(`~/agentic-kit/global/…`). Modifier le kit reste possible — c'est voulu — mais
garde-le comme un acte délibéré et relis le diff.

### Git & branches

Tout dev de feature ou d'évolution se fait sur `feature/<slug>`, créée hors de
`main` en Phase 0. Quand reviewer + qa sont PASS, l'orchestrateur intègre :

```bash
git checkout main && git merge feature/<slug> && git branch -d feature/<slug>
```

Autonome pour un projet pas encore en ligne. Pour un projet listé en production,
le gardien remonte le merge vers toi. Aucun GitHub requis : tout est local.

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
