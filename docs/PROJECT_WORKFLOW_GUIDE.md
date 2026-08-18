# Guide du workflow projet

Ce guide explique comment lancer le kit, créer un projet, adopter un dépôt
existant et reprendre un travail interrompu. Claude reste l'agent principal de
construction. Le Supervisor observe ses jalons via des événements structurés et
demande à Codex un audit indépendant, sans remplacer les décisions humaines.

## 1. Modèle de fonctionnement

```text
Idée ou demande
      │
      ▼
Claude planifie et construit sur une branche dédiée
      │  hooks structurés, asynchrones
      ▼
Supervisor local ── SQLite ──> file d'audits
      │                            │
      │                            ▼
      │                     Codex en lecture seule
      │                            │
      └──────── PASS | CHALLENGE | BLOCK | HUMAN_REQUIRED
                                   │
                                   ▼
                   Claude continue, répare ou demande une décision
```

Les hooks ne lancent pas un audit coûteux après chaque outil. Ils enregistrent
les événements, regroupent les changements liés et auditent les jalons utiles :
recherche, architecture, design, tranche de code vérifiée, pré-déploiement et
fin de projet.

Les quatre portes humaines sont toujours présentes :

1. G1 : périmètre ;
2. G2 : stack et budget ;
3. G3 : direction design ;
4. G4 : exposition publique ou production.

## 2. Préparer la machine une fois

Depuis le clone du kit :

```bash
cd ~/agentic-kit
./setup/link-kit.sh
./setup/supervisor-setup.sh
./setup/codex-mcp-setup.sh --playwright --context7
agentic-supervisor doctor
```

Vérifier les deux agents et le service :

```bash
claude auth status
codex login status
agentic-supervisor status
agentic-supervisor mcp-status
pm2 status
```

Résultat minimal attendu : Claude et Codex authentifiés, daemon joignable, DB
saine, hook token configuré. Playwright doit être `OK` pour auditer une interface
réellement rendue.

Le kit global est lié dans `~/.claude/`. Il devient donc disponible dans chaque
projet ouvert avec `claude`, sans copier les agents ou les skills dans le dépôt
applicatif.

## 3. Créer un nouveau projet

### Exemple : service de vérification de diplômes

Créer un dossier vide et démarrer Claude :

```bash
mkdir -p ~/projects/diploma-qr
cd ~/projects/diploma-qr
git init -b main
claude
```

Première demande possible :

```text
Je veux créer un MVP de vérification de diplômes par QR code.
Les écoles émettent un diplôme, un recruteur le scanne sans compte et voit un
résultat vérifiable. Commence par le périmètre et ne déploie rien publiquement
sans mon accord G4.
```

La description du skill `delivery-pipeline` suffit pour déclencher le workflow.
Il n'est pas nécessaire de nommer les agents un par un.

### Déroulement attendu

#### Phase 0 — socle local

Claude crée ou confirme :

- une branche `feature/<slug>` ;
- `.claude/memory/` ;
- un `CLAUDE.md` local contenant seulement les différences du projet ;
- les règles `.gitignore` pour `.env`, dépendances et preuves volumineuses.

Vérifier à tout moment :

```bash
git branch --show-current
git status --short
```

#### Phase 1 — découverte et G1

Le product manager produit `SPEC.md`. Claude résume le périmètre, les exclusions
et les critères de succès. Répondre explicitement pour approuver ou corriger G1.
Sans approbation, le pipeline ne doit pas considérer le périmètre comme figé.

#### Phase 2 — recherche indépendante

Le researcher produit `RESEARCH.md`. Le Supervisor vérifie les affirmations,
les sources et les APIs, en privilégiant sources officielles, datasets et
endpoints structurés avant tout scraping.

```bash
agentic-supervisor audits --project "$PWD"
agentic-supervisor gate --project "$PWD" --phase research
```

Une hypothèse non prouvée retourne `CHALLENGE` ou `BLOCK` et revient au
researcher. Un fournisseur nécessitant compte, paiement ou conditions peut
retourner `HUMAN_REQUIRED` sans arrêter les autres recherches indépendantes.

#### Phase 3 — architecture et G2

L'architecte produit `TECH.md` et `ARCHITECTURE.md` : matrice de décision,
schéma, flux, frontières de sécurité, coût mensuel, rollback et plan de tranches.
Le Supervisor challenge architecture et sécurité avant G2.

```bash
agentic-supervisor gate --project "$PWD" --phase architecture
```

Même avec `PASS`, le propriétaire choisit la stack, accepte le budget et fournit
les éventuels comptes ou credentials en G2.

#### Phase 4 — design et G3

Le designer prépare deux directions crédibles. Le Supervisor audite
architecture de l'information, parcours, système visuel, responsive et intention
d'accessibilité avant G3. Il peut proposer une alternative isolée, jamais
écraser le design actif.

```bash
agentic-supervisor gate --project "$PWD" --phase design
agentic-supervisor design-score --project "$PWD"
```

Le propriétaire choisit ou demande une révision. G3 reste humain.

#### Phases 5 à 7 — scaffold, build et vérification

Claude provisionne uniquement ce qui a été autorisé, scaffold le projet, puis
répartit les tranches disjointes. Chaque tranche suit :

```text
builder → reviewer statique → QA dynamique → audit Supervisor
```

Une tranche UI est aussi inspectée dans le navigateur sur les viewports :

- `390x844` ;
- `768x1024` ;
- `1440x900` ;
- `1920x1080`.

Le fait que la page compile ne suffit pas. L'audit couvre hiérarchie, navigation,
interactions, états vide/chargement/erreur, cohérence, confiance, responsive,
clavier, contraste, labels et qualité perçue. Une interface fonctionnelle mais
générique ou pénible peut donc recevoir `CHALLENGE` ou `BLOCK`.

Suivi :

```bash
agentic-supervisor events --project "$PWD"
agentic-supervisor audits --project "$PWD"
agentic-supervisor tail --project "$PWD"
agentic-supervisor gate --project "$PWD" --phase code
```

#### Phase 7.5 — intégration locale

Après les PASS reviewer, QA et Supervisor, Claude intègre la branche dans le
`main` local. Si le projet est marqué en production, le garde demande une
validation humaine avant le merge. En cas de défaut tardif, la branche reste
isolée et `main` garde son état connu comme sain.

#### Phase 8 — pré-déploiement et G4

Avant toute exposition publique : tests, migrations, séparation des
environnements, secrets, sauvegarde, rollback, observabilité, coûts, preuves UI
et accessibilité sont audités.

```bash
agentic-supervisor gate --project "$PWD" --phase deploy
```

G4 est ensuite demandé au propriétaire. Aucun `PASS` technique n'autorise le
déploiement, le DNS, un paiement, un store ou une modification production.

Après un déploiement explicitement accepté, QA reteste la cible publique et le
Supervisor effectue l'audit final :

```bash
agentic-supervisor gate --project "$PWD" --phase final
```

#### Phases 9 et 10 — handoff et rétrospective

Le handoff contient URL, compte de démonstration transmis hors Git, guide,
limitations et rollback. `PROJECT_STATE.md` n'indique « shipped » qu'après
l'audit final requis. La rétrospective met à jour décisions, leçons et manques
de capacités.

## 4. Adopter un projet existant

### Préparer sans écraser le travail présent

```bash
cd ~/projects/existing-product
git status --short
git branch --show-current
claude
```

S'il existe des modifications non committées, les signaler dans la demande et
interdire explicitement leur écrasement. Ne pas lancer de nettoyage automatique.

Demande d'adoption :

```text
Adopte ce projet dans l'Agentic Delivery Kit. Analyse la stack, les commandes,
le déploiement, les 30 derniers commits et les tests. Crée uniquement la mémoire
d'orchestration et le CLAUDE.md delta. Préserve toutes les modifications locales
et marque chaque incertitude avec (?). Ne lance aucun déploiement.
```

Le skill `adopt-project` :

1. inspecte stack, structure, Git, TODO, tests et configuration de déploiement ;
2. crée `.claude/memory/PROJECT_STATE.md` ;
3. consigne les décisions observées dans `DECISIONS.md` avec le marqueur
   `[adopted]` ;
4. crée les templates `LESSONS.md` et `CAPABILITY_GAPS.md` ;
5. crée un `CLAUDE.md` local minimal si nécessaire ;
6. présente toutes les hypothèses `(?)` au propriétaire.

Vérifier le résultat avant commit :

```bash
git diff -- .claude CLAUDE.md
git status --short
```

Après correction des incertitudes, le commit suggéré est :

```bash
git add .claude/memory CLAUDE.md
git commit -m "chore: adopt orchestration system"
```

N'ajouter que les chemins réellement créés. Ne pas utiliser `git add -A` si le
dépôt contenait déjà du travail utilisateur sans rapport.

### Lancer une évolution après adoption

Dans la même session ou une nouvelle :

```text
Ajoute l'export PDF des rapports. Pars de main sur une branche dédiée, commence
par cadrer le périmètre de cette évolution et respecte G1 à G4.
```

Le pipeline complet s'applique à la fonctionnalité : nouvelle branche,
périmètre, recherche ciblée, architecture, design si nécessaire, build, revue,
QA et audits. Il ne redessine pas arbitrairement l'application entière.

## 5. Reprendre un projet interrompu

```bash
cd ~/projects/project-name
git status --short
claude
```

Demande de reprise :

```text
Reprends ce projet à partir de .claude/memory/PROJECT_STATE.md. Vérifie aussi
.claude/supervisor/LATEST.md et l'état Git. Résume en trois lignes : fait, en
cours, prochain jalon. Préserve le travail non committé puis continue la
prochaine étape sûre.
```

Le contexte persistant à lire comprend :

```text
.claude/memory/PROJECT_STATE.md
.claude/memory/DECISIONS.md
.claude/memory/LESSONS.md
.claude/memory/CAPABILITY_GAPS.md
.claude/supervisor/LATEST.md
.claude/supervisor/STATE.json
```

La base SQLite conserve la file d'audits au-delà des redémarrages. Vérifier les
jalons en attente :

```bash
agentic-supervisor status
agentic-supervisor audits --project "$PWD"
agentic-supervisor requests --project "$PWD"
```

## 6. Comprendre les décisions

| Décision | Effet |
|---|---|
| `PASS` | Le contrôle indépendant permet de poursuivre la phase ; une porte humaine reste nécessaire si prévue |
| `CHALLENGE` | Claude renvoie les points ciblés à l'agent responsable, corrige et redemande un audit |
| `BLOCK` | La phase ou tranche n'est pas terminée ; ne pas la marquer DONE |
| `HUMAN_REQUIRED` | Présenter la décision étroite au propriétaire ; poursuivre seulement les travaux indépendants sûrs |
| `PENDING` | L'audit est en file ou en cours ; attendre au jalon requis |
| `ERROR` | Infrastructure indisponible ; ne jamais convertir en PASS |

Codes de sortie : `0`, `10`, `20`, `30`, `40`, `50` dans le même ordre logique.

Attendre explicitement un jalon :

```bash
agentic-supervisor wait --project "$PWD" --phase code --timeout 900
```

Relancer un audit échoué après correction de l'infrastructure :

```bash
agentic-supervisor retry <audit-id>
```

Clore une demande humaine uniquement après l'action correspondante :

```bash
agentic-supervisor resolve <human-request-id>
```

Puis demander un audit frais ; résoudre la demande ne fabrique pas un `PASS`.

## 7. Audit UI/UX manuel

Le chemin normal est automatique après le PASS reviewer/QA d'une tranche UI.
Pour demander un audit ciblé, démarrer l'application localement sur loopback et
indiquer son URL :

```bash
agentic-supervisor audit --project "$PWD" --type design
agentic-supervisor audit --project "$PWD" --type visual --url http://127.0.0.1:3000
agentic-supervisor tail --project "$PWD"
```

La cible doit appartenir à `SUPERVISOR_BROWSER_ALLOWED_HOSTS`. La configuration
par défaut autorise seulement `localhost`, `127.0.0.1` et `::1`. Ne pas élargir
l'allowlist à une cible production pour contourner G4.

Une proposition de redesign éventuelle est écrite sous :

```text
.claude/supervisor/proposals/<audit-id>/
```

Elle conserve son attribution et ne remplace jamais silencieusement le frontend
actif.

## 8. Incidents courants

### Daemon indisponible

Les hooks échouent ouverts pour ne pas bloquer la session Claude, mais aucun
jalon requis n'est validé :

```bash
pm2 restart agentic-supervisor
agentic-supervisor doctor
pm2 logs agentic-supervisor --lines 100
```

### Audits volontairement désactivés

Vérifier le fichier privé :

```bash
grep '^SUPERVISOR_LEVEL=' "$HOME/.config/agentic-kit/supervisor.env"
```

`SUPERVISOR_LEVEL=off` désactive les audits. Remettre `standard`, puis relancer
PM2 si l'intention est de réactiver le workflow.

### Codex non authentifié ou indisponible

```bash
codex login status
agentic-supervisor codex-test
```

L'authentification reste humaine. Une panne Codex devient `ERROR`, jamais
`PASS`.

### Audit visuel impossible

```bash
./setup/codex-mcp-setup.sh --playwright
agentic-supervisor browser-test
```

Vérifier ensuite que l'application écoute sur une URL locale autorisée. Une
panne navigateur n'est pas une note UI négative : c'est une preuve manquante.

### Besoin d'un service payant ou authentifié

Documenter la capacité manquante, poursuivre les parties indépendantes et
présenter au propriétaire : besoin, coût, permissions, données exposées et
alternative. Ne créer aucun compte, abonnement ou ressource payante sans accord.

## 9. Discipline Git et fin de session

- travailler sur `feature/<slug>` pour un projet applicatif ;
- ne jamais mélanger une évolution du kit et une feature produit ;
- préserver les modifications existantes qui ne font pas partie de la demande ;
- relire `git diff --check` et les tests avant commit ;
- ne pousser et ne déployer que dans le périmètre explicitement autorisé ;
- garder les credentials, cookies, `.env`, preuves navigateur sensibles et état
  machine hors Git.

Résumé de santé en fin de jalon :

```bash
git status --short
agentic-supervisor status
agentic-supervisor gate --project "$PWD" --phase code
```

Pour les actions humaines et configurations externes, consulter
[HUMAN_ACTIONS_AND_CONFIGURATION.md](HUMAN_ACTIONS_AND_CONFIGURATION.md).
