# Codex Supervisor

Service d'audit indépendant pour Agentic Delivery Kit. Claude reste l'agent de
construction principal ; le Supervisor persiste ses jalons structurés, lance
Codex en lecture seule hors du chemin critique, puis rend l'une des décisions
`PASS`, `CHALLENGE`, `BLOCK` ou `HUMAN_REQUIRED`.

```text
Claude Code hooks ──HTTP loopback──> Supervisor ──queue SQLite──> Codex CLI
       ▲                                │                            │
       └──── rapport/gate local ────────┼──── Telegram (escalade) <──┘
                                        └──── UI locale /<projet>
```

Le Supervisor ne remplace ni les reviewers/QA Claude, ni les portes humaines
G1–G4, ni le système de permissions. Il ne pousse, ne déploie, ne paie, ne crée
pas de compte et n'accepte aucune condition juridique.

Pour une mise en route guidée, consulter aussi :

- [configuration et actions humaines](../docs/HUMAN_ACTIONS_AND_CONFIGURATION.md) ;
- [workflow nouveau projet, adoption et reprise](../docs/PROJECT_WORKFLOW_GUIDE.md).

## Installation

Prérequis : Node.js 22+, npm, SQLite disponible via `node:sqlite`, Codex CLI
authentifié et PM2. Depuis la racine du kit :

```bash
./setup/link-kit.sh
./setup/supervisor-setup.sh
./setup/codex-mcp-setup.sh --playwright --context7
agentic-supervisor doctor
```

`supervisor-setup.sh` est relançable : il préserve les fichiers de configuration
existants, génère une fois un token de hook privé, construit TypeScript, lie le
CLI dans `~/.local/bin`, lie les skills dans `~/.agents/skills`, puis charge le
service PM2. Il ne modifie jamais la configuration MCP Codex ; cette action reste
explicite dans le second script.

Pour préparer sans toucher à PM2 :

```bash
./setup/supervisor-setup.sh --no-start
```

Installation manuelle de développement :

```bash
cd supervisor
npm ci
npm run typecheck
npm test
npm run build
SUPERVISOR_ENV_FILE="$HOME/.config/agentic-kit/supervisor.env" npm start
```

## Exploitation

```bash
agentic-supervisor status
agentic-supervisor doctor
agentic-supervisor events --project "$PWD"
agentic-supervisor audits --project "$PWD"
agentic-supervisor requests --project "$PWD"
agentic-supervisor projects
agentic-supervisor ui --project "$PWD"
agentic-supervisor gate --project "$PWD" --phase code
agentic-supervisor wait --project "$PWD" --phase code --timeout 900
agentic-supervisor tail --project "$PWD"
agentic-supervisor retry <audit-id>
agentic-supervisor resolve <human-request-id>
agentic-supervisor mcp-status
agentic-supervisor skills
agentic-supervisor design-score --project "$PWD"
pm2 status
pm2 logs agentic-supervisor
pm2 restart agentic-supervisor
```

Codes de sortie de `gate`/`wait` : `0` PASS, `10` CHALLENGE, `20` BLOCK,
`30` HUMAN_REQUIRED, `40` PENDING/timeout, `50` erreur Supervisor. Une erreur
d'infrastructure ne devient jamais un PASS.

Un besoin humain ouvert reste `HUMAN_REQUIRED` même si un audit technique plus
récent retourne PASS. Après l'action humaine, utiliser `resolve <request-id>`
puis relancer l'audit concerné afin d'obtenir une preuve fraîche.

Audit manuel :

```bash
agentic-supervisor audit --project "$PWD" --type research
agentic-supervisor audit --project "$PWD" --type architecture
agentic-supervisor audit --project "$PWD" --type security
agentic-supervisor audit --project "$PWD" --type design
agentic-supervisor audit --project "$PWD" --type visual --url http://127.0.0.1:3000
```

## Intégration Claude → Supervisor → Codex

`global/settings.json` conserve le garde-fou `PreToolUse` et enregistre
`SessionStart`, `SessionEnd`, `UserPromptSubmit`, `SubagentStart`,
`SubagentStop`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`,
`PermissionDenied`, `Elicitation`, `ElicitationResult` et `Stop`. Un second
`PreToolUse`, limité à `AskUserQuestion|ExitPlanMode`, capture immédiatement les
décisions explicitement adressées au propriétaire. Les notifications génériques
et retardées `Notification` ne pilotent plus Telegram. Le forwarder :

1. tronque et filtre le JSON du hook ;
2. ne transporte ni réponse d'outil ni contenu complet de fichier/transcript ;
3. rédige les secrets connus ;
4. envoie en 1,5 seconde maximum vers `127.0.0.1` avec un token local ;
5. échoue ouvert si le daemon est indisponible afin de ne pas bloquer Claude.

Les chemins de transcript peuvent être conservés comme métadonnées d'attribution,
mais ils sont exclus du contexte envoyé à Codex ; l'audit lit les livrables du
projet et les événements structurés, pas les conversations brutes.

Le daemon persiste l'événement dans SQLite puis coalesce les jalons. Un
`PostToolUse` ne lance pas d'audit complet. Les fins de sous-agents déclenchent
les audits research, architecture, code, reviewer/QA, design, déploiement ; un
Stop final significatif déclenche l'audit final. Les jobs `pending`/`running`
survivent à un redémarrage et disposent d'un budget de retry borné.

Claude charge les hooks au démarrage d'une session. Après une mise à jour de
`global/settings.json`, terminer puis relancer les sessions Claude déjà ouvertes
une fois ; le daemon Supervisor, lui, peut être rechargé indépendamment.

## Vue d'activité par projet

La vue validée est servie par le daemon existant, pas par une application ou un
processus créé pour chaque projet. Un événement `SessionStart` active une route
virtuelle stable `/<slug-projet>`. `Stop` ne la ferme pas, car cet événement
signifie seulement « Claude a fini cette réponse ». `SessionEnd` ferme la session
réelle ; la route disparaît dès que la dernière session Claude du projet se
termine et toute connexion SSE ouverte reçoit `closed` puis est libérée.

SQLite porte l'état de tous les projets. Sans navigateur ouvert, un projet
n'alloue ni processus, ni timer, ni abonnement en mémoire. Une connexion SSE est
créée seulement pour un onglet réellement ouvert ; le heartbeat unique n'existe
que tant qu'au moins un onglet est connecté. Une limite globale bornée protège le
daemon. Une expiration de secours désactive aussi une session abandonnée sans
`SessionEnd` après `SUPERVISOR_ACTIVITY_SESSION_STALE_MS`.

Sur la VPS :

```bash
cd ~/projects/<project-name>
agentic-supervisor projects
agentic-supervisor ui --project "$PWD"
```

Depuis le Mac, garder ce tunnel ouvert (l'alias SSH peut être `vps1`) :

```bash
ssh -N -L 8787:127.0.0.1:8787 vps1
```

Puis ouvrir l'URL retournée par `agentic-supervisor ui`, par exemple
`http://127.0.0.1:8787/factures_platform`. La route est volontairement locale :
elle refuse les en-têtes de reverse proxy, n'est pas indexable, n'accepte aucune
commande et ne doit pas être publiée par nginx. Le prototype statique public
reste une démonstration sans données et n'est pas le runtime du Supervisor.

Codex est lancé comme processus indépendant avec :

```text
codex [--search] -c allow_login_shell=false --sandbox read-only
  --ask-for-approval never -C <project> exec --ephemeral --json
  --output-schema <schema> --output-last-message <temporary-file> -
```

Le runner ajoute aussi `-c allow_login_shell=false` avant `exec` afin qu'un
shell d'audit ne charge pas les profils utilisateur.

Les arguments sont un tableau `spawn` sans shell, l'environnement est réduit,
les sorties sont bornées, le timeout est configurable, et le JSON final est
validé strictement. Les catégories security/authorization critiques imposent
BLOCK, tout besoin humain impose HUMAN_REQUIRED, et les seuils UI empêchent un
score faible de passer.

## Audits UI/UX

`design_due_diligence` intervient avant G3 sur `SPEC.md`, `RESEARCH.md`,
`TECH.md`, `ARCHITECTURE.md` et `design/`. Il challenge personas, jobs, IA,
navigation, hiérarchie, états, système visuel, accessibilité, confiance et
distinctivité. Les références de catégorie sont des preuves, pas des modèles à
copier. G3 reste le choix de l'utilisateur.

`visual_ux_audit` intervient après QA sur le vrai frontend. Il requiert une URL
explicitement autorisée et Playwright MCP, puis teste par défaut :

- 390×844 (mobile) ;
- 768×1024 (tablette) ;
- 1440×900 (desktop) ;
- 1920×1080 (grand desktop).

Il inspecte les flows et états réels, le reflow/overflow, navigation, feedback,
focus/clavier, sémantique, contraste, cibles tactiles, motion, console, densité,
confiance et qualité perçue. `SUPERVISOR_BROWSER_ALLOWED_HOSTS` vaut uniquement
`localhost,127.0.0.1,::1` par défaut ; ajouter explicitement un host de staging
est nécessaire. URL absente, app arrêtée, auth de démo manquante ou MCP absent
sont des erreurs d'infrastructure distinctes du score produit.

Une refonte justifiée crée seulement :

```text
.claude/supervisor/proposals/<audit-id>/
├── metadata.json
└── PROPOSAL.md
```

Le frontend actif n'est jamais modifié ou fusionné automatiquement. Les
artefacts indiquent `producer: claude`, `auditor: codex` et l'identité d'audit.

## MCP et skills Codex

Claude et Codex ont des configurations MCP séparées. Vérifier :

```bash
codex mcp list --json
agentic-supervisor mcp-status
./setup/codex-mcp-setup.sh --playwright --context7
```

- Playwright : requis uniquement pour les audits visuels ; profil mémoire
  `--isolated`, headless, service workers bloqués, pas d'accès fichiers illimité.
- Context7 : documentation actuelle, optionnelle. Le script utilise le package
  stdio en mode basic pour éviter qu'un setup unattended ne démarre/accepte un
  OAuth. Une configuration remote existante peut afficher `not_logged_in` et
  exige alors une authentification humaine explicite.
- Chrome DevTools : réseau/console/performance, optionnel via
  `--chrome-devtools`, télémétrie et CrUX désactivés par le script.
- Figma : optionnel, seulement après configuration/authentification humaine.
- Mobbin : optionnel, serveur officiel via `--mobbin`, plan éligible et OAuth
  humain ; absence non bloquante.
- GitHub : optionnel via `--github-readonly`. Deux endpoints officiels séparés
  exposent les dépôts/PR et les Actions/CI en lecture seule. Le serveur distant
  GitHub ne prend pas en charge l'enregistrement OAuth dynamique utilisé par
  `codex mcp login` ; l'intégration reprend donc le mécanisme PAT headless de
  Claude avec un PAT finement limité **distinct**, fourni uniquement par
  `GITHUB_PAT_TOKEN`. Le Supervisor transmet ce jeton au processus hôte Codex
  pour le client MCP, puis l'exclut explicitement de l'environnement des
  commandes shell générées par le modèle. Aucun jeton n'est écrit dans le dépôt
  ou dans `~/.codex/config.toml`. La création et la saisie du PAT restent des
  actions humaines, détaillées dans
  `docs/HUMAN_ACTIONS_AND_CONFIGURATION.md`.

Les sept skills sous `supervisor/skills/` sont liés au scope utilisateur Codex :
UI/UX due diligence, visual quality, accessibility, API/source due diligence,
architecture challenge, security review et pre-deploy audit. Ils réutilisent les
protocoles neutres de `shared/protocols/` ; ils ne changent aucune permission.

## Telegram

Telegram est sortant uniquement et sert d'escalade humaine, pas de journal
d'activité. Chaque message de workflow est émis par Kriton Supervisor. Claude ne
lit pas le token, ne demande pas le token et n'appelle jamais l'API Telegram.
Les alertes proviennent des événements structurés immédiats :
`PermissionRequest`, `PreToolUse(AskUserQuestion|ExitPlanMode)`, `Elicitation`,
ainsi que des audits `HUMAN_REQUIRED`. Elles indiquent le projet, la source, la
raison, les détails disponibles et l'action attendue. Le message générique
« Claude is waiting for your input » n'est plus une source d'alerte.
Lors d'un arrêt gracieux, le daemon attend aussi les notifications déjà parties
vers Telegram avant de fermer SQLite. Une panne brutale de la machine ou une
indisponibilité Telegram peut néanmoins laisser une demande ouverte sans ID de
livraison ; `agentic-supervisor requests --project "$PWD"` reste alors la source
persistante de rattrapage.

`CHALLENGE` et `BLOCK` restent dans l'interface et les rapports internes afin que
Claude les corrige sans solliciter le propriétaire. Les `PASS` sont silencieux
par défaut (`SUPERVISOR_NOTIFY_PASS=false`). Le bot n'exécute aucune commande et
une approbation se fait toujours dans la session Claude.

Action humaine : créer ou choisir un bot et un chat selon les procédures
Telegram, sans transmettre le token dans ce dépôt. Puis éditer le fichier privé :

```bash
chmod 600 "$HOME/.config/agentic-kit/supervisor.env"
editor "$HOME/.config/agentic-kit/supervisor.env"
```

```env
TELEGRAM_BOT_TOKEN=<bot-token>
TELEGRAM_CHAT_ID=<allowed-chat-id>
```

Enfin :

```bash
pm2 restart agentic-supervisor
agentic-supervisor telegram-test
```

Le token apparaît nécessairement dans le chemin HTTPS de l'API Telegram mais
n'est jamais journalisé ; erreurs, payloads et messages passent par la rédaction.
Cookies, credentials, transcripts et résultats complets ne sont pas envoyés.

## État et fichiers

- Configuration privée : `~/.config/agentic-kit/supervisor.env` (0600).
- Token de hook : `~/.config/agentic-kit/supervisor-hook-token` (0600).
- DB/logs : `~/.local/state/agentic-kit/supervisor/` (0700).
- État projet lisible par Claude : `.claude/supervisor/`.
- État canonique machine : SQLite, journal WAL.

Variables principales : `SUPERVISOR_LEVEL=off|light|standard|strict`, timeout,
concurrence, retries, seuils UI, viewports, allowlist browser et notifications.
Voir `config/supervisor.example.env`.

## Sécurité et limites

- Récepteur HTTP lié exclusivement au loopback et token comparé en temps
  constant ; corps limité à 256 KiB.
- UI d'observation en lecture seule sur loopback, CSP stricte, aucun reverse
  proxy accepté, route active uniquement pendant une vraie session Claude.
- URL de hook, MCP ou audit normalisée avant persistance : credentials intégrés,
  query string et fragment ne sont jamais recopiés dans SQLite, l'UI ou Telegram.
- Codex en lecture seule, éphémère, sans approbation et sans variables Telegram
  ou provider héritées.
- Le garde Claude conserve les deny/ask/allow existants, étend le contrôle de
  portée à Write/Edit et bloque aussi la lecture de la configuration privée du
  Supervisor par Read ou Bash.
- Texte web/repo/hook traité comme non fiable dans le contrat système.
- Aucune API Telegram entrante, aucun shell depuis un message, aucun mécanisme
  d'escalade de privilège.

Limites V1 : `node:sqlite` est encore signalé expérimental sous Node 22 ; le
sandbox Codex est le mécanisme OS fourni par la CLI, pas un conteneur dédié ; le
MCP browser tourne sur la VPS et doit rester sur profil jetable sans credentials
de production. Un conteneur navigateur séparé constitue un durcissement V1.1.
Les audits authentifiés nécessitent un compte de démo/session fourni de façon
humaine et stocké hors Git.

## Désactivation, désinstallation et rollback

Désactivation réversible :

```bash
sed -i 's/^SUPERVISOR_LEVEL=.*/SUPERVISOR_LEVEL=off/' "$HOME/.config/agentic-kit/supervisor.env"
pm2 restart agentic-supervisor
```

Désinstallation de l'intégration :

```bash
./supervisor/scripts/uninstall-service.sh
```

Le script retire uniquement le processus PM2, le lien CLI et les liens de skills
qui pointent vers ce dépôt. Il conserve volontairement configuration, token,
DB, logs et rapports. Pour un rollback Git, revenir au commit antérieur sur la
branche du kit puis relancer `./setup/link-kit.sh`; ne jamais supprimer l'historique
d'audit sans l'avoir examiné.

## Extension future d'un second producteur

V1 n'intègre ni Grok ni Kimi. Les événements/audits portent déjà `producer`,
`candidate_id` et `audit_target`. Une future intégration ajoute un adaptateur de
normalisation implémentant `EventAdapter`, l'enregistre à la composition du
serveur, puis envoie sur `/v1/events/<producer>`. Elle ne modifie ni la queue, le
runner Codex, la politique de gate ni la persistence. Toute
comparaison/arbitrage resterait une nouvelle politique explicite et humaine,
jamais une dépendance dans le cœur V1.
