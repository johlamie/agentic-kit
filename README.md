# Agentic Delivery Kit — v3 "Full Agency"

Une idée entre ; un MVP déployé et accessible sort. Le système reproduit une
équipe d'agence complète : PM → recherche → choix tech → design → provisioning →
build parallèle → revue → QA E2E → PR + preview → déploiement → handoff →
rétrospective.
Toi, tu n'interviens qu'à 5 portes de validation.

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

## Les 5 portes (tout le reste est autonome)

- **G1** — périmètre : tu valides SPEC.md
- **G2** — stack & budget : tu valides TECH.md (matrice de décision Supabase /
  Firebase / local + coût mensuel)
- **G3** — direction design : tu choisis entre 2 directions
- **G4** — exposition publique : tu valides le déploiement en production
- **G5** — merge : tu valides le merge d'une PR dans `main`, même après
  PASS reviewer + qa. Les previews par branche (derrière Basic Auth) ne sont
  PAS une porte : `devops` les déploie seul pour que tu aies un lien cliquable
  avant de te décider.

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
export GITHUB_PAT=github_pat_...       # PAT fine-grained (repos/PRs/issues)
export PREVIEW_DOMAIN=preview.tondomaine.tld   # sous-domaines de preview par branche
export CERTBOT_EMAIL=toi@exemple.com   # notifications d'expiration de certificat
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

## Git & PRs

Tout le travail de build se fait sur une branche `feature/<slug>` (créée hors
de `main` en Phase 0) — jamais directement sur `main`.

- **Push** : uniquement via `~/.claude/scripts/git-safe-push.sh <remote> <branche>`.
  `git push` brut est dans la `deny` list ; le wrapper lui-même refuse
  `main`/`master`/`production`/`release*` dans son code (pas juste par pattern
  matching sur ce que l'agent tape) — impossible à contourner en bidouillant
  le refspec.
- **PR** : dès que reviewer + qa sont PASS sur la branche, l'orchestrateur
  pousse et ouvre une PR (MCP `github`, câblé sur `reviewer` et `devops`).
- **Preview** : `devops` déploie automatiquement (pas de porte) un
  environnement par branche sur `<projet>-<branche>.$PREVIEW_DOMAIN`, protégé
  par un Basic Auth partagé (généré une fois, réutilisé pour toutes les
  previews du serveur — jamais sur le domaine de prod). Mobile : `eas build
  --profile preview` sur la branche, lien/QR livré de la même façon. Tout est
  détruit automatiquement à la fermeture/au merge de la PR.
- **Revue** : `reviewer` poste son verdict PASS/FAIL directement comme review
  GitHub sur la PR (approve / request changes), en plus de son rapport local.
- **Merge = G5** : même après reviewer + qa PASS, l'agent ne merge jamais de
  sa propre initiative — il te présente la PR + le lien de preview, attend ton
  feu vert explicite, puis merge (squash) via le MCP `github`. C'est la seule
  chose que le système ne peut pas techniquement bloquer par permission (le
  moteur de permissions ne sait pas filtrer un appel MCP par branche cible) —
  c'est donc une règle procédurale dans `CLAUDE.md`, au même titre que G1-G3.

## Organisation

```
~/.claude/                     ← global : CLAUDE.md orchestrateur, agents/, skills/,
│                                templates/, scripts/ (git-safe-push, preview-*),
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
