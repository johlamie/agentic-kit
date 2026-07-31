# Kit agentique — édition Kimi Code

Portage du « Agentic Delivery Kit » (dossier `global/`, conçu pour Claude Code)
vers **Kimi Code CLI**. L'original reste intact ; tout ce qui concerne Kimi vit
dans ce dossier `kimi/`. Même philosophie : une idée entre, un MVP déployé et
accessible sort, avec 5 portes de validation (G1 périmètre, G2 stack & budget,
G3 design, G4 exposition publique, G5 merge d'une PR — voir "Git & PRs").

Différence structurelle majeure : Kimi Code n'a **pas de sous-agents custom**
(seuls les built-ins `coder`, `explore`, `plan` existent). Les 8 rôles de
l'agence sont donc des **skills** ; pour exécuter un rôle, l'orchestrateur
dispatche un sous-agent `coder` built-in dont le prompt ordonne d'invoquer le
skill du rôle — ex. « invoke skill `builder` — you are the builder for slice X ».
Plusieurs `coder` peuvent tourner en parallèle (slices indépendantes).

## Installation (VPS neuve Ubuntu 22.04)

```bash
git clone <ton-repo-du-kit> ~/agentic-kit && cd ~/agentic-kit
chmod +x kimi/setup/*.sh kimi/scripts/*.sh kimi/agent-scripts/*.sh
./kimi/setup/bootstrap-vps.sh   # système, node 22, kimi code, pm2, nginx, certbot,
                                # ufw, supabase cli, firebase-tools, eas, playwright
                                # + link-kit.sh : ~/.kimi-code/ symlinké vers kimi/
kimi                            # login première fois
cat kimi/config/permissions.toml >> ~/.kimi-code/config.toml   # permissions (une fois)
export GITHUB_PAT=github_pat_...           # fine-grained PAT (repos/PRs/issues)
export SUPABASE_ACCESS_TOKEN=sbp_...       # token depuis le dashboard Supabase
export PREVIEW_DOMAIN=preview.tondomaine.tld   # sous-domaines de preview par branche
export CERTBOT_EMAIL=toi@exemple.com       # notifications d'expiration de certificat
./kimi/setup/mcp-setup.sh       # génère ~/.kimi-code/mcp.json (chmod 600, backup si existant)
# dans kimi : /mcp-config login mobbin   (OAuth — ouvrir l'URL sur une machine
#                                          AVEC navigateur, pas la VPS headless)
./kimi/scripts/validate-kit.sh && ./kimi/scripts/smoke-install.sh
```

`~/.kimi-code/{AGENTS.md,skills,templates,scripts}` sont des **symlinks** vers
`kimi/` (`scripts` pointe vers `kimi/agent-scripts/`, distinct de
`kimi/scripts/` qui reste la validation du kit, non symlinkée) : tu améliores
un skill → actif immédiatement ET versionné → `git commit`.
Restent locaux, jamais versionnés : `~/.kimi-code/agent-memory/`,
`~/.kimi-code/config.toml` (clés API + permissions), `~/.kimi-code/mcp.json`
(tokens, chmod 600 — régénéré par `mcp-setup.sh`, avec backup horodaté).

## L'équipe (8 rôles = 8 skills)

| Rôle (skill) | Mémoire | MCP |
|---|---|---|
| product-manager | user | — |
| researcher | user | websearch |
| architect | project | — |
| designer | user | **mobbin** |
| builder ×N | project | context7 |
| reviewer | project | — |
| qa | project | **playwright** |
| devops | user | supabase, firebase |

Mémoire `user` = `~/.kimi-code/agent-memory/<rôle>/MEMORY.md` (index + fichiers
thématiques dans le même dossier — structure importée de `~/.claude/agent-memory/`,
partagée entre projets : carte du serveur, préférences confirmées) ; mémoire
`project` = `.kimi-code/agent-memory/<rôle>.md` (patterns du codebase). Le prompt de
dispatch du sous-agent indique le chemin — voir « Delegation rules » dans
`AGENTS.md`. Plus 3 skills de workflow : `delivery-pipeline`, `adopt-project`,
`retrospective`.

## Équivalences Claude Code ↔ Kimi Code

| Claude Code (`global/`) | Kimi Code (`kimi/`) |
|---|---|
| `~/.claude/CLAUDE.md` | `~/.kimi-code/AGENTS.md` |
| `~/.claude/agents/<rôle>.md` (sous-agents custom) | `~/.kimi-code/skills/<rôle>/SKILL.md` + dispatch d'un `coder` built-in |
| frontmatter `tools:` / `memory:` / `model:` | supprimé (non supporté) ; `type: prompt` ajouté |
| `.claude/memory/` (mémoire projet) | `.kimi-code/memory/` |
| `~/.claude/agent-memory/` | `~/.kimi-code/agent-memory/` |
| `permissions` dans `settings.json` | blocs `[[permission.rules]]` à fusionner dans `~/.kimi-code/config.toml` |
| `Bash(cmd:*)` | `Bash(cmd*)` |
| `WebFetch(domain:…)` | `FetchURL` (read-only, auto-allow) |
| `claude mcp add …` | `~/.kimi-code/mcp.json` généré par `mcp-setup.sh` ; gestion interactive : `/mcp-config` |
| OAuth mobbin via `/mcp` | `/mcp-config login mobbin` |
| github : header `Authorization: Bearer …` | `bearerTokenEnvVar: "GITHUB_PAT"` (le token n'est pas écrit sur disque) |
| `curl -fsSL https://claude.ai/install.sh \| bash` | `curl -fsSL https://code.kimi.com/kimi-code/install.sh \| bash` |

## Git & PRs

Tout le travail de build se fait sur une branche `feature/<slug>` (créée hors
de `main` en Phase 0) — jamais directement sur `main`.

- **Push** : uniquement via `~/.kimi-code/scripts/git-safe-push.sh <remote> <branche>`.
  `git push` brut est dans les `deny` rules ; le wrapper lui-même refuse
  `main`/`master`/`production`/`release*` dans son code — impossible à
  contourner en bidouillant le refspec.
- **PR** : dès que reviewer + qa sont PASS sur la branche, l'orchestrateur
  pousse et ouvre une PR (MCP `github`, maintenant dans l'allowlist).
- **Preview** : le skill `devops` déploie automatiquement (pas de porte) un
  environnement par branche sur `<projet>-<branche>.$PREVIEW_DOMAIN`, protégé
  par un Basic Auth partagé (généré une fois, réutilisé pour toutes les
  previews du serveur — jamais sur le domaine de prod). Mobile : `eas build
  --profile preview` sur la branche. Tout est détruit automatiquement à la
  fermeture/au merge de la PR.
- **Revue** : le skill `reviewer` poste son verdict PASS/FAIL directement
  comme review GitHub sur la PR, en plus de son rapport local.
- **Merge = G5** : même après reviewer + qa PASS, l'agent ne merge jamais de
  sa propre initiative — il présente la PR + le lien de preview, attend le
  feu vert explicite, puis merge (squash) via le MCP `github`. Comme Kimi Code
  ne sait pas non plus filtrer un appel MCP par branche cible, c'est une règle
  procédurale dans `AGENTS.md`, au même titre que G1-G3.

## Limites connues

- **Choix du modèle par agent impossible** (`model: opus|sonnet` du frontmatter
  Claude) : Kimi Code n'a qu'un seul modèle par session. La répartition
  « opus pour le jugement, sonnet pour le volume » est perdue.
- **Mémoire d'agent non chargée automatiquement** (`memory: user|project`
  n'existe pas) : le skill ordonne de la lire, et le prompt de dispatch donne
  le chemin du fichier — c'est tout. Si le sous-agent l'oublie, rien ne l'y force.
- **Sémantique des patterns de permissions différente** : `:*` → `*`, et surtout
  Kimi Code applique la **première règle qui matche** (Claude Code : deny gagne
  toujours). Les deny sont donc listés AVANT les allow dans
  `config/permissions.toml`. À vérifier à l'usage.
- **`settings.local.json` n'a pas d'équivalent direct** : les overrides perso se
  font à la main dans `~/.kimi-code/config.toml`.
- **Pas de filtre par domaine pour le fetch web** : les 6 règles
  `WebFetch(domain:…)` deviennent un seul `allow FetchURL` (l'outil est
  read-only et auto-autorisé de toute façon).
- **`check-runtime.sh` non porté** (diagnostic machine spécifique à Claude) :
  la validation se fait par `validate-kit.sh` + `smoke-install.sh`.

## Validation du kit

```bash
./kimi/scripts/validate-kit.sh   # hors-ligne : JSON, TOML, frontmatter des 11
                                 # skills, bash -n, deny critiques, grep .claude
./kimi/scripts/smoke-install.sh  # installe les symlinks dans un HOME temporaire
```

## Organisation

```
kimi/
├── AGENTS.md                ← orchestrateur (symlinké → ~/.kimi-code/AGENTS.md)
├── skills/                  ← 11 skills : 8 rôles + 3 workflows
├── templates/memory/        ← PROJECT_STATE, DECISIONS, LESSONS, CAPABILITY_GAPS
├── config/
│   ├── permissions.toml     ← à fusionner dans ~/.kimi-code/config.toml
│   └── mcp.example.json     ← gabarit des 6 serveurs MCP, sans secrets
├── setup/                   ← link-kit.sh · mcp-setup.sh · bootstrap-vps.sh
├── agent-scripts/           ← git-safe-push.sh, preview-*.sh (symlinké → ~/.kimi-code/scripts)
└── scripts/                 ← validate-kit.sh · smoke-install.sh (pas symlinké)
```
