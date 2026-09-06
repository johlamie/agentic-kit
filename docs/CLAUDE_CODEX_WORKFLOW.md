# Utiliser le même kit avec Claude Code et Codex

La couche Codex fournit les huit mêmes rôles, trois skills de livraison, une
mémoire de projet commune et une attribution explicite. Claude conserve sa
configuration, ses modèles et ses hooks. Les conversations restent propres à
chaque outil.

## Installation sur une machine

Prérequis : Git, Python 3.10+, Claude Code et une version de Codex acceptant les
agents TOML dans `~/.codex/agents/` (validation locale : Codex CLI 0.153.4).
Le lanceur et son verrou utilisent POSIX/flock : Linux et macOS, ou WSL sous
Windows. L'installation ne télécharge aucun paquet et ne lance aucun modèle.

```bash
cd ~/agentic-kit
./setup/codex-kit-setup.sh
export PATH="$HOME/.local/bin:$PATH"
codex login
./setup/codex-mcp-setup.sh                 # état des MCP existants
./setup/codex-mcp-setup.sh --all-safe       # ajout explicite des outils sans auth
```

L'installateur génère les huit agents depuis `global/agents/*.md`, installe les
liens vers `codex/skills/` dans `~/.agents/skills/`, ajoute un bloc délimité à
`~/.codex/AGENTS.md` et installe `~/.local/bin/agentic`. Il préserve le contenu
personnel du fichier d'instructions, `config.toml`, les modèles et les MCP.
Un agent personnel ou un skill homonyme incompatible provoque un refus avant
l'installation : il faut le renommer ou le réconcilier explicitement.

Relancer l'installateur après avoir changé une fiche d'agent. Les corps des
fiches sont communs ; `model`, `tools` et `memory` Claude ne sont pas copiés
aveuglément dans Codex. Les modèles Codex héritent de la session par défaut.
Reviewer est configuré en lecture seule ; les autres héritent du sandbox.
Les contraintes par rôle restent des consignes, sans équivalence garantie avec
les refus du hook Claude. Les options interactives du parent peuvent modifier
les permissions effectives des sous-agents.

Les variantes de Codex qui exposent un outil de délégation générique peuvent
obtenir les consignes avec `agentic role builder` (ou un autre nom) et les
transmettre explicitement au sous-agent. Le kit ne prétend pas avoir créé un
sous-agent quand le runtime ne permet qu'une exécution séquentielle. Cette
solution ne reproduit pas automatiquement les réglages sandbox du fichier TOML.

Pour un emplacement différent, utiliser `--home /chemin/utilisateur` et/ou
`--codex-dir /chemin/config-codex`. Si ton Codex utilise un répertoire de
configuration personnalisé, passer ce même chemin à l'installateur.

## Adopter et alterner dans un projet

```bash
cd ~/projects/mon-projet
agentic init
agentic run claude
# Demander un checkpoint à Claude, puis quitter sa session.
agentic run codex
# Codex lit l'état enregistré et reprend les prochaines étapes.
```

Le projet doit déjà être un dépôt Git. **La même commande `agentic init`
initialise un nouveau projet ou met à jour un projet existant automatiquement.**
Fermer les sessions qui travaillent sur ce projet avant de l'exécuter.

- Nouveau projet : création des mémoires et de l'intégration du kit.
- Ancien kit Claude : sauvegarde, migration des mémoires existantes vers
  `.agentic/` et création de liens de compatibilité aux anciens chemins.
- Kit partagé déjà présent : actualisation des instructions gérées par le kit
  et ajout des fichiers manquants ; l'état, les décisions et les leçons sont
  conservés. Si tout est à jour, aucun fichier n'est réécrit et aucune nouvelle
  sauvegarde n'est créée.

Les règles existantes de CLAUDE.md et AGENTS.md sont conservées. Un lien entre
ces deux fichiers, comme `CLAUDE.md → AGENTS.md` dans Talendici, est préservé :
le bloc commun est ajouté une seule fois dans la cible. Les liens sortant du
projet, circulaires ou vers d'autres fichiers demandent une résolution explicite.
Aucun commit n'est créé et la branche courante reste inchangée.

Avant une modification, la commande sauvegarde les mémoires et les instructions
concernées, y compris les fichiers non commités/non suivis, dans le répertoire
Git commun : `.git/agentic-backups/init-…/` pour un dépôt ordinaire. Ce dossier
privé est hors de l'arbre de travail et n'est pas envoyé par `git push`.
Le chemin exact est affiché après l'opération. Il contient `before.tar.gz` et
un `manifest.json` avec les fichiers présents/absents et leurs empreintes.
L'archive est vérifiée avant la migration ; les mémoires sont vérifiées après.
Ces sauvegardes restent locales et sont conservées jusqu'à leur suppression
manuelle : elles ne remplacent pas une sauvegarde sur un autre support.

Si les deux emplacements contiennent déjà de la mémoire, l'initialisation
refuse la migration avant de déplacer des fichiers. Réconcilier les contenus
sans supprimer arbitrairement l'un des historiques. Si une erreur d'écriture
interrompt l'opération, la sauvegarde reste disponible et son chemin est indiqué ;
après résolution de l'erreur, relancer `agentic init`. La commande ne restaure
pas automatiquement des fichiers par-dessus des changements plus récents.

```text
mon-projet/
├── CLAUDE.md / AGENTS.md       règles propres au projet + bloc partagé
├── .agentic/
│   ├── CONTRACT.md            règles de mémoire et passation
│   ├── CODEX.md               instructions de l'orchestrateur Codex
│   ├── kit.json               version du schéma d'intégration
│   ├── memory/                état, décisions, leçons, manques
│   ├── events/                sessions, checkpoints, attribution des commits
│   └── agent-memory/          mémoire privée par rôle (ignorée par Git)
└── .claude/
    ├── memory -> ../.agentic/memory
    └── agent-memory -> ../.agentic/agent-memory
```

Versionner les documents de mémoire et les événements utiles, après relecture
pour exclure les informations privées. La mémoire utilisateur transversale
reste à son emplacement existant `~/.claude/agent-memory/<rôle>/MEMORY.md` :
Claude et Codex lisent les mêmes fichiers. Elle n'est ni copiée dans le kit ni
versionnée. Codex peut avoir besoin d'une autorisation pour y écrire ; le parent
peut aussi conserver une proposition de mise à jour à appliquer ensuite.

Le lanceur fournit l'identité de session à l'outil. Il enregistre le début,
l'état Git préexistant et la fin avec le code de sortie, sans capturer les
prompts, les fichiers ou les conversations. Il ne sait pas reconstruire le
raisonnement ni juger les tests : l'agent doit écrire un vrai checkpoint.

```bash
agentic status
agentic log
agentic checkpoint --tool codex --agent builder \
  --summary "Validation du formulaire implémentée" \
  --test "npm test: PASS" --next "Relecture puis QA navigateur" \
  --file src/form.ts
```

À l'intérieur d'une session lancée par `agentic run`, `--tool` est déduit de
l'environnement. Le checkpoint écrit un événement ; il ne remplace pas la mise
à jour de PROJECT_STATE.md par l'orchestrateur. Les sous-agents proposent leurs
changements de mémoire au parent, qui les consolide.

Pour un commit attribué, après avoir sélectionné et relu les fichiers :

```bash
git add src/form.ts
git diff --cached
agentic commit --tool codex --agent builder -m "feat: validate form"
git log -1 --format=full
```

Le commit garde ton auteur Git et porte des trailers `Agentic-Tool`,
`Agentic-Agent` et `Agentic-Session`. Ce sont des déclarations de provenance,
pas des signatures cryptographiques. Pour un travail mixte, séparer les
contributions ou ajouter leurs trailers au message. Les commits Git directs
restent possibles, mais n'ont pas ces trailers automatiques.

Le verrou du lanceur couvre aussi les worktrees liés. Deux sessions `agentic`
ne peuvent pas écrire simultanément dans la même famille de checkout. Il est
libéré à la sortie ; un lancement direct de `claude`/`codex` ou un autre éditeur
ne le respecte pas. Après un arrêt brutal, vérifier les processus, les fichiers
et les tests avant de reprendre ; un événement de fin peut manquer. Utiliser
des clones distincts pour du travail parallèle indépendant.

Le lanceur Codex choisit `workspace-write` et `on-request` ; les options
supplémentaires après `--` sont transmises au CLI. Exemple :
`agentic run codex -- --model <modèle-disponible-sur-ton-compte>`.

## MCP et audits

Playwright, Context7, Chrome DevTools, Mobbin et GitHub sont pris en charge par
le script MCP existant. OAuth/PAT restent propres à Codex. Les agents devops
peuvent utiliser les CLI Supabase/Firebase déjà installés, avec les
autorisations nécessaires ; leurs MCP ne sont pas installés par cette couche.
Les permissions des outils distants sont distinctes du sandbox shell.

Le Supervisor conserve son intégration automatique Claude. Pour les demandes
depuis Codex, reconstruire **le CLI et le daemon** avec la nouvelle version,
puis demander et attendre explicitement les audits :

```bash
agentic-supervisor audit --project "$PWD" --type architecture --producer codex
agentic-supervisor wait --project "$PWD" --phase architecture
```

Les rapports enregistrent le producteur réel et l'auditeur Codex. Un audit
Codex d'un travail Codex est une exécution distincte, sans diversité de modèles
garantie. Les événements de session et notifications Telegram Claude ne sont
pas émulés. Les portes G1–G4 restent humaines et un audit absent/échoué ne vaut
jamais PASS. L'installation de la couche n'effectue aucun redémarrage du daemon.

## Validation et sources

```bash
python3 scripts/test_agentic.py
./scripts/validate-kit.sh
./scripts/smoke-install.sh
cd supervisor && npm run typecheck && npm test
```

Références officielles OpenAI consultées le 6 septembre 2026 :
[agents et héritage des permissions](https://learn.chatgpt.com/docs/agent-configuration/subagents),
[instructions AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
[découverte des skills](https://learn.chatgpt.com/docs/build-skills),
[configuration MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Autonomie sur les projets existants

Une mission autorise les lectures, modifications, vérifications, corrections,
mémoires et commits locaux sur la branche de travail nécessaires à son périmètre.
Consigner la demande et les autorisations réelles dans `PROJECT_STATE.md` ; ne
pas recréer G1–G3 si le périmètre, la stack et le design ne changent pas. G4 reste
nécessaire pour une nouvelle exposition publique/action de production, mais une
autorisation précise déjà donnée reste valable pour cette action et cette cible.
Les refus du runtime et les règles `ask` explicites restent prioritaires.

Le gardien Claude laisse au classificateur les suppressions de dépendances
nommées dans un projet et les mises à jour ciblées compatibles. Il demande encore
une décision pour les suppressions globales, les mises à jour larges et les
cibles ambiguës. Python exige un exécutable de virtualenv local explicite.
`supabase db reset --local` exige aussi `supabase/config.toml` et un fichier
non vide `supabase/.agentic-disposable-local` décrivant l'autorisation existante
et les données jetables concernées. Ce fichier n'accorde aucune autorisation :
ne jamais le créer pour contourner une décision manquante. Les resets Prisma,
`dropdb` et les opérations distantes restent protégés.

Les notes Markdown des huit rôles dans `~/.claude/agent-memory/` sont accessibles
en écriture sans le faux refus global du gardien. Les répertoires supplémentaires
des réglages utilisateur Claude sont reconnus ; le classificateur et les règles
natives restent applicables. Les réglages du kit et les secrets restent protégés.

Une branche Git ne sépare pas les fichiers du processus qui les sert. Pour
travailler sur un projet en production, utiliser un checkout physique distinct,
vérifier qu'il ne sert pas l'application et qu'il ne cible pas sa base réelle.
Ne jamais retirer une entrée de `~/.claude/production-projects` pour débloquer
un agent. Les changements dans un dossier déclaré live conservent les demandes
techniques du gardien. Une simple autorisation mémorisée ne désactive pas ce hook.

Ces consignes sont partagées avec Codex ; les hooks Claude ne sont pas portés
sur Codex. Son sandbox et son mécanisme d'approbation restent actifs. Relancer
`./setup/codex-kit-setup.sh` après une mise à jour du kit pour régénérer ses rôles,
et `agentic init` dans un projet pour actualiser sa copie du contrat partagé.
Les règles particulières d'un ancien projet doivent être examinées : `init`
les préserve et ne supprime jamais silencieusement une restriction locale.
