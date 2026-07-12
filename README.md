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

## Installation (VPS neuve Ubuntu 24.04)

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
```

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

### Permissions

`global/settings.json` contient une **allowlist** : le pipeline tourne sans
confirmation sur le routinier (npm, git commit, prisma, playwright, pm2 restart)
et **s'arrête** sur le destructif ou le public (`git push`, `certbot`, `nginx`,
`rm -rf`, `sudo`, `migrate deploy`, `eas submit`, lecture de `.env`/`.ssh`).
Les règles `deny` l'emportent toujours. C'est la porte G4, matérialisée.

`--dangerously-skip-permissions` supprime TOUTE confirmation : à réserver aux
environnements **jetables** (container recréable), typiquement pour du cron
headless. Pas sur une VPS qui héberge tes projets et tes clés.

L'agent ne peut pas réécrire ses propres règles (`deny` sur `~/.claude/**`) :
la rétrospective te propose des diffs, tu les appliques.

## Organisation

```
~/.claude/                     ← global : CLAUDE.md orchestrateur, agents/, skills/,
│                                templates/, agent-memory (scope user)
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
