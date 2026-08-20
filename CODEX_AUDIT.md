# Audit Codex — Agentic Delivery Kit

> Audit réalisé le 17 août 2026 sur le dépôt `agentic-kit`.
> Portée : architecture d'orchestration, configurations Claude Code et Kimi Code,
> permissions, scripts d'installation, mémoire, Git, CI, sécurité et exploitation.

## Verdict

Le concept est très bon et le projet montre une vraie expérience du terrain.
Comme playbook personnel de création de MVP, il vaut environ **8/10**. Comme
orchestrateur réellement autonome sur une VPS qui héberge des applications en
production, il vaut plutôt **4/10 dans son état actuel**.

Le projet doit être conservé et durci, pas réécrit. Ses fondations sont saines :
pipeline clair, rôles spécialisés, validations humaines pertinentes, livrables
concrets, mémoire persistante et boucle d'amélioration. Son principal défaut est
l'écart entre les garanties annoncées dans la documentation et celles réellement
appliquées par les versions actuelles des CLI.

Je ne le laisserais pas encore travailler sans surveillance sur des applications
ayant de vrais utilisateurs.

## Ce qui est réussi

- Pipeline complet et compréhensible : spec, recherche, architecture, design,
  build, revue, QA, déploiement, handoff et rétrospective.
- Quatre portes humaines bien placées : périmètre, coût, design et exposition
  publique.
- Rôles spécialisés avec des entrées, livrables et critères de retour précis.
- Definition of Done concrète : URL, données de démonstration, compte de test,
  QA publique, documentation et rollback.
- Bonne prise en compte du contexte réel : français, XOF, Android modestes,
  accessibilité et réseau lent.
- Mémoire structurée autour de `PROJECT_STATE`, `DECISIONS`, `LESSONS` et
  `CAPABILITY_GAPS`.
- Dépôt encore petit et auditable.
- Gardien accompagné d'une table de décision testée et enrichie après de vrais
  incidents.

La meilleure description actuelle du système est : **un excellent contrat
opérationnel augmenté par quelques garde-fous techniques**, mais pas encore un
moteur d'orchestration déterministe.

## Constats critiques

### P0 — Le mode auto Claude n'est pas activé

`global/settings.json` place `defaultMode` à la racine, alors que Claude Code
attend désormais `permissions.defaultMode`.

Testé avec Claude Code 2.1.224 : le kit démarre en **manual mode**, pas en auto.
Le classificateur censé constituer le troisième étage de sécurité n'est donc pas
actif par défaut. Par conséquent, `autoMode.classifyAllShell: true` ne protège pas
les commandes couvertes par les larges règles `npm run`, `npx`, `python`, `node`,
Git et déploiement.

Le validateur contrôle l'ancien emplacement `.defaultMode` et retourne PASS. Il
confirme donc une configuration incorrecte au lieu de la détecter.

Actions requises :

1. Déplacer la valeur dans `permissions.defaultMode`.
2. Supprimer l'ancien champ racine.
3. Ajouter un test CI qui démarre réellement Claude dans un HOME temporaire et
   vérifie le mode effectif.
4. Traiter les avertissements de configuration comme des erreurs de validation.

### P0 — La protection des projets live est partielle

Le hook `agent-guard.sh` n'est enregistré que pour Bash. Les opérations directes
via `Edit` ou `Write` ne passent donc pas par le gardien, alors que
`Edit(~/projects/**)` autorise les modifications de tous les projets, y compris
ceux en production.

La détection Bash repose en outre sur une liste partielle de mots-clés. Sur un
projet live simulé :

| Opération | Décision du gardien |
|---|---|
| `pm2 restart live-app` | `ask` |
| `sed -i ...` | aucune |
| `git checkout -- config.ts` | aucune |
| `cp build/app.js current/app.js` | aucune |
| modification directe avec `Edit` | hook non invoqué |

La promesse « toute modification d'un projet en production demande
confirmation » n'est donc pas techniquement garantie.

Actions requises :

1. Enregistrer le hook pour `Bash|Edit|Write|NotebookEdit`.
2. Contrôler `tool_input.file_path` pour tous les outils d'écriture.
3. Sur un projet live, autoriser seulement une petite liste d'opérations prouvées
   read-only et demander confirmation pour le reste.
4. Ajouter des tests pour les chemins relatifs, les guillemets, les redirections,
   les wrappers et les accès entre projets.

### P0 — Les secrets ne sont pas protégés contre Bash

Les règles `Read(.env)` et `Read(~/.ssh/**)` ne bloquent que l'outil de lecture.
Elles n'empêchent pas un programme lancé par Bash de lire les mêmes fichiers.
Or `cat`, `python`, `python3` et `node` sont autorisés largement.

Cette faiblesse est particulièrement importante lorsque le mode auto est inactif.

Actions requises :

- activer le sandbox Claude ;
- définir `sandbox.filesystem.denyRead` pour `.env*`, clés privées, credentials
  cloud et fichiers de service accounts ;
- compléter le hook Bash avec une vérification des chemins sensibles ;
- ne pas considérer les règles de prompts comme une frontière de sécurité.

### P0 — Le flux Git échoue sur un projet neuf

La phase 0 exécute conceptuellement :

```bash
git init
git checkout -b feature/<slug>
```

Après le premier commit, seule la branche de feature existe. La phase 7.5 tente
ensuite `git checkout main`, qui échoue. Le défaut a été reproduit dans un dépôt
temporaire isolé.

Le flux devrait être :

```bash
git init -b main
# créer le shell du projet et son commit initial
git switch -c feature/<slug>
```

La branche est également supprimée avant le déploiement et la QA publique. Si
cette QA échoue, l'instruction « rester sur la branche et retourner au build »
n'est plus applicable. La politique de branche doit décrire explicitement la
création d'une branche de correction ou retarder sa suppression.

## Port Kimi

### P0/P1 — Les hypothèses du port sont dépassées

Le port affirme que Kimi ne possède pas d'agents personnalisés ni de hooks.
Kimi Code 0.29.1 prend désormais en charge :

- des agents Markdown personnalisés ;
- `tools` et `disallowedTools` par agent ;
- des sous-agents personnalisés ;
- des hooks `PreToolUse` ;
- le travail parallèle et les skills dans les sous-agents.

Les huit rôles Kimi restent pourtant des skills injectés dans un `coder`
généraliste. Ils ne bénéficient donc pas de restrictions d'outils réellement
applicables. La restriction Git du builder Claude a aussi disparu du builder
Kimi.

Actions requises :

1. Migrer les huit rôles vers `kimi/agents/`.
2. Conserver les trois workflows comme skills.
3. Déclarer les outils autorisés et interdits par rôle.
4. Ajouter un gardien Kimi complémentaire aux permissions.
5. Marquer l'édition Kimi comme expérimentale jusqu'à cette migration.

Les hooks Kimi étant fail-open, ils doivent compléter les règles `deny` et
`ask`, jamais les remplacer.

### P1 — Les permissions Kimi comportent des trous

Les patterns MCP `mcp__context7`, `mcp__mobbin` et `mcp__playwright` sont
incomplets. Kimi attend la forme `mcp__<serveur>__*` pour couvrir tous les outils
d'un serveur.

Les règles génériques suivantes autorisent également plusieurs contournements :

- `Bash(npx*)`
- `Bash(npm run*)`
- `Bash(node*)`
- `Bash(python*)`

Par exemple, le deny `firebase deploy` ne couvre pas automatiquement
`npx firebase deploy` ou un script Node qui lance la même opération.

Kimi ne possède par ailleurs aucun registre équivalent à
`production-projects`. L'édition Kimi ne devrait pas administrer seule des
applications live avant l'ajout d'une politique de production explicite.

## Robustesse et maintenabilité

### P1 — Les validations donnent trop facilement confiance

Ont réussi pendant l'audit :

- `./scripts/validate-kit.sh`
- les 25 cas de `agent-guard.sh --self-test`
- `./scripts/smoke-install.sh`
- `./kimi/scripts/validate-kit.sh`
- `./kimi/scripts/smoke-install.sh`
- `kimi doctor config kimi/config/permissions.toml`

Ces validations testent surtout la syntaxe et la présence de chaînes. Elles
n'ont détecté ni le mode manuel, ni l'absence de `main`, ni les écritures live
non couvertes.

Claude Code signale aussi que les permissions `Write(path)` ne participent plus
aux vérifications de fichiers : `Edit(path)` couvre maintenant tous les outils
d'édition. Les règles `Edit` équivalentes existent, mais le validateur contrôle
encore des règles `Write` devenues inopérantes.

Il faut ajouter :

- une validation via les CLI réelles ;
- une matrice orchestrateur/sous-agent × scratch/live × Bash/Edit ;
- des tests de contournement ;
- un mini-projet de référence traversant les phases 0 à 7.5 ;
- un test d'inventaire des agents, skills et outils effectivement chargés.

### P1 — Le parallélisme partage trop d'état

Des builders parallèles dans le même worktree peuvent se gêner même avec des
fichiers fonctionnels distincts : lockfiles, installations, migrations, index
Git, fichiers générés et exécution simultanée des tests.

Chaque slice devrait disposer de son worktree et de sa branche, puis être fusionnée
dans une branche d'intégration après review et QA.

### P1 — Installation non reproductible

Les scripts utilisent plusieurs sources mouvantes : installateurs distants,
releases `latest`, paquets npm globaux et MCP lancés via `npx ...@latest`.

Cela explique en partie la dérive rapide du port Kimi. Le kit a besoin d'un
fichier de compatibilité indiquant au minimum :

- version Claude Code testée ;
- version Kimi Code testée ;
- versions Node, Playwright et MCP ;
- date de dernière vérification ;
- éventuelles versions minimales et maximales supportées.

### P1 — Gestion des MCP et secrets

Le setup Claude développe les variables shell dans les arguments de
`claude mcp add`, ce qui peut stocker les tokens littéraux dans la configuration
locale. Il faut préférer des références `${VARIABLE}` évaluées à l'exécution.

Le générateur Kimi écrit le token Supabase dans `mcp.json` puis applique
`chmod 600`. Il devrait définir `umask 077` avant la création pour éviter toute
fenêtre avec des permissions trop larges.

Les serveurs lancés avec `@latest` devraient être épinglés et les tokens limités
par dépôt, durée et permissions.

### P2 — Documentation en dérive

- Le README annonce le builder en Sonnet, mais sa définition utilise Opus 5.
- Le README et `check-runtime.sh` parlent de 13 cas du gardien ; il y en a 25.
- Le kit recommande de garder modèle et thème dans les overrides personnels,
  tout en les épinglant dans la configuration globale.
- Le projet se présente comme v3, mais ne possède ni tag, ni fichier de version,
  ni changelog formel.
- Le profil UEMOA/français/XOF est excellent pour l'usage actuel, mais devrait
  vivre dans un fichier `FOUNDER_PROFILE.md` configurable si le kit vise la
  portabilité.

## Installation et exploitation

### P1 — Bootstrap VPS risqué

Le bootstrap :

- suppose que SSH écoute sur le port 22 avant d'activer UFW ;
- exécute plusieurs téléchargements sans checksum ;
- installe des paquets npm globaux non épinglés avec sudo ;
- exécute la dernière ligne générée par `pm2 startup` via `sudo bash` ;
- masque l'échec éventuel de PM2 avec `|| true`.

Pour une VPS existante, il faut détecter le vrai port SSH, présenter le plan
firewall avant application, épingler les versions et refuser de masquer les
échecs importants.

### P1 — Rollback et production insuffisamment matérialisés

Une commande de rollback documentée ne garantit pas qu'un rollback fonctionne.
PM2 et Nginx opérant directement sur un workspace mutable, il manque :

- des releases versionnées ;
- une bascule atomique `current -> release` ;
- un health check avant bascule ;
- des sauvegardes et un test de restauration ;
- du monitoring et des alertes ;
- une politique de logs et de rétention ;
- éventuellement une préproduction légère.

## Hygiène du dépôt

Le `.gitignore` ne couvre pas plusieurs artefacts réellement présents :

- `.claude/worktrees/`
- `.playwright-mcp/`
- captures QA à la racine
- autres preuves ou journaux temporaires

La documentation recommande `git add -A`, ce qui peut embarquer ces fichiers par
accident. Les snapshots Playwright peuvent également contenir des données
affichées dans l'application.

Il faut aussi ignorer `.env*` avec une exception explicite pour `.env.example`,
ainsi que les clés, credentials et fichiers de service accounts courants.

## Limite architecturale fondamentale

Les phases, les portes et les transitions sont aujourd'hui des instructions en
langage naturel. Aucun état exécutable ne prouve que :

- G1, G2, G3 ou G4 a été validée ;
- la validation concernait exactement la version actuellement construite ;
- tous les builders ont été relus ;
- la QA correspond au commit déployé ;
- le rollback enregistré cible la bonne release.

À moyen terme, `PROJECT_STATE.md` devrait être complété par un manifeste
machine-readable, par exemple `.agentic/state.json`, contenant les phases,
approbations, commits, artefacts, verdicts et cible déployée. Le Markdown resterait
la vue humaine ; le JSON deviendrait l'état vérifiable.

## Feuille de route recommandée

### Étape 1 — Sécurité et blocages immédiats

1. Corriger `permissions.defaultMode` et tester le mode effectif.
2. Étendre le gardien aux outils d'écriture.
3. Fermer les accès Bash aux secrets et activer le sandbox.
4. Réparer la création de `main` et la stratégie de branche post-déploiement.
5. Compléter `.gitignore`.

### Étape 2 — Fiabilité multi-agent

1. Un worktree et une branche par slice.
2. Branche d'intégration contrôlée par l'orchestrateur.
3. Matrice de tests de permissions et de rôles.
4. Mini-projet golden-path exécuté en CI ou périodiquement.
5. Registre explicite des approbations et du commit concerné.

### Étape 3 — Modernisation Kimi

1. Convertir les rôles en agents personnalisés.
2. Ajouter les restrictions d'outils par rôle.
3. Porter un gardien compatible avec les hooks Kimi.
4. Corriger les patterns MCP et les wrappers de commandes.
5. Ajouter une politique dédiée aux projets live.

### Étape 4 — Reproductibilité et production

1. Épingler les versions et publier une matrice de compatibilité.
2. Rendre les scripts d'installation idempotents et vérifiables.
3. Mettre en place releases atomiques, health checks et rollback testé.
4. Ajouter sauvegardes, monitoring et alertes.
5. Définir des budgets de tokens, limites de parallélisme et coûts par phase.

## Conclusion

Le projet n'est pas un gadget : sa structure produit, ses rôles et sa boucle
d'amélioration sont meilleurs que ceux de nombreux frameworks agentiques plus
complexes. Sa faiblesse vient du fait que la documentation, les permissions et
les hypothèses sur Claude/Kimi évoluent plus vite que les tests.

La priorité n'est pas d'ajouter davantage d'agents. Elle est de rendre
**exécutables et vérifiables** les garanties déjà écrites : mode auto réellement
actif, portes enregistrées, production protégée sur tous les outils, branches
cohérentes et versions compatibles.

Après cette passe de durcissement, le kit peut devenir une base très crédible
pour produire des MVP de manière semi-autonome, puis progressivement autonome.
