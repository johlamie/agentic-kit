# Configuration et actions humaines restantes

Ce guide regroupe les opérations qui ne doivent pas être automatisées sans le
propriétaire : authentifications, secrets, comptes, choix payants, portes G1–G4
et réglages d'organisations externes. Les commandes de diagnostic sont sans
effet de bord, sauf mention explicite.

Dernière vérification de référence : **18 août 2026**, branche
`feat/codex-supervisor`.

État observé sur la machine de référence : Supervisor `RUNNING`, DB saine,
authentifications Claude/Codex valides, hook authentifié, Playwright et Context7
opérationnels, file d'exécution vide. Telegram, Chrome DevTools, GitHub MCP,
Figma et Mobbin ne sont pas configurés ; ils restent optionnels. Seule
l'authentification du CLI `gh` est expirée.

L'historique contient volontairement deux preuves de runtime sous `/tmp` : un
frontend volontairement mauvais correctement classé `BLOCK`, et une recherche
BRVM correctement classée `HUMAN_REQUIRED`. La demande BRVM ouverte
`498a8078-2394-4e7e-897b-c727f564899b` appartient à cette fixture temporaire,
pas à un projet en production. Ne la résoudre qu'après avoir confirmé ce statut,
avec `agentic-supervisor resolve <human-request-id>` ; la laisser ouverte ne
bloque aucun autre projet.

## Priorités immédiates

| Priorité | Action | État attendu |
|---|---|---|
| P0 | Traiter l'incident GitGuardian comme faux positif après vérification de son occurrence | Aucun secret réel à révoquer |
| P0 | Vérifier la nouvelle exécution GitHub Actions après le push du correctif | `offline-validation` et `supervisor-validation` verts |
| P1 | Réauthentifier `gh` sur cette machine | `gh auth status` réussit |
| Fait | Santé locale du daemon | `agentic-supervisor doctor` réussit |
| P2 | Configurer Telegram si les alertes mobiles sont souhaitées | `agentic-supervisor telegram-test` réussit |
| Selon projet | Fournir les authentifications cloud, comptes de démo et décisions G1–G4 | Jamais stockés dans Git |

## 1. Incident GitGuardian

### Ce qui s'est passé

`supervisor/tests/normalize.test.ts` contenait une fausse valeur longue dans un
exemple d'en-tête d'autorisation. Cette valeur n'accordait aucun accès, mais son
contexte et sa forme correspondaient à un détecteur générique. Le correctif :

- assemble le nom d'en-tête, le schéma et la valeur synthétique à l'exécution ;
- continue de vérifier que la valeur est remplacée par `[REDACTED]` ;
- n'ajoute ni allowlist GitGuardian, ni annotation d'ignorance, ni exclusion du
  fichier ;
- laisse donc GitGuardian protéger normalement tous les tests futurs.

### Action humaine dans GitGuardian

1. Ouvrir l'incident et vérifier que l'unique occurrence désigne bien le test et
   l'ancien commit de la branche.
2. Vérifier qu'aucune autre occurrence ne contient une vraie valeur copiée d'un
   service.
3. Après le nouveau scan, classer l'incident comme **faux positif** ou
   **test credential**, selon les libellés disponibles dans le workspace.
4. Ajouter une note courte, par exemple :

   ```text
   Synthetic redaction fixture; no credential was issued. Fixture is now assembled at runtime.
   ```

Il n'y a rien à révoquer pour l'occurrence identifiée. Si l'incident affiche une
autre valeur ou un autre fichier, arrêter la résolution, révoquer la vraie
credential chez son fournisseur, la remplacer, puis rechercher ses autres
occurrences. Ne jamais coller sa valeur dans un ticket, un chat ou un commit.

L'ancien texte synthétique restera visible dans l'historique du commit déjà
publié. Il ne faut pas réécrire l'historique d'une branche partagée pour un faux
secret : ce serait destructif pour les clones et n'apporterait aucun gain de
sécurité. Une réécriture ne se justifierait qu'après confirmation d'un secret
réel et avec une procédure coordonnée.

### Validity checks GitGuardian

Le réglage GitGuardian de validité et le job GitHub Actions
`offline-validation` sont deux choses différentes.

Si GitGuardian affiche que les contrôles de validité sont désactivés, un Manager
du workspace peut les revoir dans `Settings > Secrets > General`. Leur activation
autorise GitGuardian à effectuer, quand le fournisseur le permet, un appel
externe non intrusif afin de déterminer si une credential est valide. Cette
décision dépend de la politique de l'organisation ; elle n'est pas nécessaire
pour conclure que la fixture synthétique n'est pas un secret. La documentation
officielle est disponible dans
[Validity checks](https://docs.gitguardian.com/secrets-detection/customize-detection/validity-checks).

## 2. GitHub Actions et authentification `gh`

### Diagnostic du run signalé

L'exécution publique `32118534328` a réellement lancé `offline-validation`.
Tous ses contrôles ont réussi jusqu'au smoke test final. Celui-ci a échoué avec
le code `50` parce qu'il simulait le build npm tout en lançant ensuite un binaire
qui exigeait l'artefact `dist/`. Le test local était faussement vert quand un
ancien `dist/` existait déjà.

Le correctif rend le smoke test indépendant de cet artefact. Le job séparé
`supervisor-validation` reste responsable du vrai `npm ci`, du typecheck, des
45 tests et du build. Les actions GitHub sont également épinglées sur les commits
officiels correspondant à `actions/checkout` v7.0.1 et `actions/setup-node`
v7.0.0, ce qui retire l'avertissement Node.js 20 sans élargir les permissions.

### Réauthentifier GitHub CLI

La credential actuellement enregistrée par `gh` sur la machine de référence est
expirée. Cette action est volontairement humaine :

```bash
gh auth login -h github.com
gh auth status
```

Choisir HTTPS et le flux navigateur/device proposé. Ne pas envoyer de PAT dans
un message et ne pas le placer dans le dépôt. Un token fourni manuellement doit
rester le dernier recours et être limité aux permissions nécessaires.

### Vérifier la nouvelle CI

Le push sur `feat/codex-supervisor` déclenche automatiquement le workflow :

```bash
gh run list --workflow validate.yml --branch feat/codex-supervisor --limit 5
gh run view <run-id>
gh run watch <run-id> --exit-status
```

Résultat attendu :

- `offline-validation` : PASS ;
- `supervisor-validation` : PASS ;
- `claude-native-install` : PASS ;
- `kimi-offline-validation` : job historique séparé, sans import ni connexion
  avec le Supervisor.

GitHub Actions est déjà activé sur le dépôt puisque le run signalé s'est exécuté.
Il n'est donc pas nécessaire d'élargir `GITHUB_TOKEN` : le workflow conserve
uniquement `contents: read`. Si une ruleset de branche est créée, rendre
`offline-validation` et `supervisor-validation` obligatoires avant merge. Ne pas
rendre le job Kimi obligatoire au titre du Supervisor : il appartient à une
implémentation parallèle indépendante.

## 3. Installation et santé du Supervisor

Depuis le clone du kit :

```bash
cd ~/agentic-kit
git switch feat/codex-supervisor
git pull --ff-only
./setup/link-kit.sh
./setup/supervisor-setup.sh
./setup/codex-mcp-setup.sh --playwright --context7
agentic-supervisor doctor
```

Contrôles quotidiens :

```bash
agentic-supervisor status
agentic-supervisor doctor
agentic-supervisor mcp-status
pm2 status
pm2 logs agentic-supervisor --lines 100
```

Le setup crée des fichiers privés sans les écraser :

- `~/.config/agentic-kit/supervisor.env` en mode `0600` ;
- `~/.config/agentic-kit/supervisor-hook-token` en mode `0600` ;
- `~/.local/state/agentic-kit/supervisor/` en mode `0700` ;
- la base SQLite et ses journaux sous ce dernier dossier.

Pour relancer le service :

```bash
pm2 restart agentic-supervisor
agentic-supervisor doctor
```

`pm2 save` est exécuté par l'installeur. Sur une nouvelle VPS, la restauration
automatique après reboot nécessite aussi la configuration système PM2. Lancer
`pm2 startup`, relire la commande `sudo` qu'il affiche, puis l'exécuter soi-même
si ce comportement est souhaité. Cette étape modifie le démarrage système et ne
doit pas être exécutée aveuglément.

## 4. Authentifications Claude et Codex

Ces sessions sont indépendantes. Elles ne doivent pas partager leurs fichiers
d'authentification ni copier leurs tokens :

```bash
claude auth login
claude auth status
codex login --device-auth
codex login status
```

Puis vérifier :

```bash
agentic-supervisor codex-test
agentic-supervisor doctor
```

Une connexion interactive, une 2FA, un CAPTCHA ou l'acceptation de conditions
reste toujours à effectuer par le propriétaire du compte.

## 5. Telegram, optionnel

Telegram n'est pas requis pour les audits. Sans configuration, les décisions
restent dans SQLite et `.claude/supervisor/`.

Actions humaines :

1. Créer ou choisir un bot depuis le compte Telegram du propriétaire.
2. Ouvrir le chat cible et envoyer un premier message au bot.
3. Relever le `chat_id` depuis les outils Telegram autorisés par le propriétaire.
4. Éditer localement le fichier privé, sans jamais committer les valeurs :

   ```bash
   chmod 600 "$HOME/.config/agentic-kit/supervisor.env"
   editor "$HOME/.config/agentic-kit/supervisor.env"
   ```

5. Renseigner :

   ```env
   TELEGRAM_BOT_TOKEN=<bot-token>
   TELEGRAM_CHAT_ID=<allowed-chat-id>
   ```

6. Recharger et tester :

   ```bash
   pm2 restart agentic-supervisor
   agentic-supervisor telegram-test
   agentic-supervisor doctor
   ```

Le canal est sortant uniquement. Le bot ne reçoit aucune commande d'approbation
et ne peut pas autoriser une opération Claude. Utiliser un chat privé dédié,
révoquer le token depuis Telegram en cas de doute et ne jamais afficher les
fichiers de configuration dans des logs.

## 6. MCP et capacités optionnelles

### Côté Codex Supervisor

| Capacité | Besoin | Action |
|---|---|---|
| Playwright MCP | Requis pour déclarer un audit visuel rendu | `./setup/codex-mcp-setup.sh --playwright` |
| Context7 MCP | Recommandé pour la documentation technique actuelle | `./setup/codex-mcp-setup.sh --context7` |
| Chrome DevTools MCP | Optionnel pour réseau/performance | `./setup/codex-mcp-setup.sh --chrome-devtools` |
| Figma | Optionnel, authentification humaine séparée | Ne configurer que pour un projet qui en dépend |
| Mobbin | Optionnel, peut être payant | Ne créer ni abonnement ni compte automatiquement |
| GitHub MCP | Optionnel | Ne jamais copier une credential Claude vers Codex |

Vérification :

```bash
./setup/codex-mcp-setup.sh
codex mcp list
agentic-supervisor mcp-status
agentic-supervisor browser-test
```

Un MCP manquant devient une capacité indisponible ou une erreur d'infrastructure,
jamais un faux `PASS`. Playwright doit utiliser un profil isolé sans cookies ou
credentials de production.

### Côté Claude Code

La configuration Claude est indépendante :

```bash
./setup/mcp-setup.sh
claude mcp list
```

Actions éventuellement nécessaires selon le projet :

- Mobbin : OAuth et abonnement éventuel ;
- GitHub : PAT finement limité, créé et fourni par le propriétaire ;
- Supabase : `SUPABASE_ACCESS_TOKEN`, créé par le propriétaire ;
- Firebase : `firebase login` interactif ;
- Figma : OAuth/compte si une source Figma est effectivement utilisée.

Ne configurer que les fournisseurs nécessaires au projet. Aucun échec MCP
optionnel ne doit interrompre les autres travaux indépendants.

## 7. Actions humaines pour chaque projet

Les quatre portes Claude restent obligatoires :

| Porte | Décision humaine |
|---|---|
| G1 | Approuver le périmètre de `SPEC.md` |
| G2 | Approuver stack, fournisseurs et coût mensuel |
| G3 | Choisir la direction design avant construction massive |
| G4 | Autoriser toute exposition publique, production ou publication store |

Un `PASS` du Supervisor ne remplace aucune de ces décisions. Comptes cloud,
2FA, CAPTCHA, credentials, acceptation de conditions, paiement, DNS et actions
de production restent également humains ou explicitement autorisés au cas par
cas.

Pour un audit UI authentifié, fournir un compte de démonstration à privilèges
minimaux via un canal local sûr. Ne jamais versionner le mot de passe, les
cookies ou le profil navigateur. Prévoir des données fictives et aucune donnée
personnelle réelle.

Après le premier déploiement validé en G4, le propriétaire ajoute lui-même le
nom du dossier :

```bash
echo "project-name" >> "$HOME/.claude/production-projects"
```

Le fichier est volontairement non modifiable par les agents. Vérifier son état :

```bash
./scripts/check-runtime.sh
```

## 8. Checklist avant merge

- [ ] Incident GitGuardian examiné et classé sans créer d'exception globale.
- [ ] Aucun secret réel dans le commit, le diff, les logs ou les captures.
- [ ] `gh auth status` réparé sur les machines qui doivent piloter GitHub.
- [ ] Nouvelle exécution CI entièrement verte.
- [ ] `agentic-supervisor doctor` vert.
- [ ] `agentic-supervisor mcp-status` confirme Playwright si le produit a une UI.
- [ ] Telegram testé, ou explicitement laissé non configuré.
- [ ] G1–G4, coûts, comptes et actions production laissés au propriétaire.
- [ ] Aucun MCP Kimi ou Grok ajouté au Supervisor.

## 9. Désactivation et désinstallation

Désactivation réversible des audits :

```bash
sed -i 's/^SUPERVISOR_LEVEL=.*/SUPERVISOR_LEVEL=off/' "$HOME/.config/agentic-kit/supervisor.env"
pm2 restart agentic-supervisor
```

Désinstallation de l'intégration, en conservant configuration et historique :

```bash
cd ~/agentic-kit
./supervisor/scripts/uninstall-service.sh
```

Le script ne supprime ni la base SQLite, ni les logs, ni les tokens. Examiner ces
éléments avant toute suppression manuelle. Une suppression définitive ou une
réécriture Git doit faire l'objet d'une décision séparée et explicite.
