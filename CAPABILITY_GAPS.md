# Capability gaps

## 2026-08-22 — Accès distant au centre de contrôle sans tunnel manuel

Besoin exprimé par le propriétaire : consulter le centre de contrôle
(`http://127.0.0.1:8787/`) sans lancer un tunnel SSH à chaque fois,
y compris depuis un téléphone. L'exposition publique (vhost nginx sur un
domaine) a été évaluée et écartée : elle inverse le modèle de sécurité
ratifié (UI volontairement sans authentification car loopback uniquement)
et le code refuse de toute façon les requêtes proxifiées.

Option retenue pour la prochaine rétrospective : **VPN léger Tailscale ou
WireGuard**. Le Supervisor resterait privé mais joignable depuis les
appareils du VPN. Travaux à chiffrer : autoriser l'interface VPN en plus du
loopback (bind + allowlist d'hôtes), ajuster `isDirectUiRequest`, tests, et
documentation d'installation côté VPS et clients. Aucune modification de
Telegram ni des gates. Alternative moindre : page de statut publique
expurgée, distincte du centre de contrôle, si un besoin de partage externe
apparaît.

## 2026-08-20 — L'environnement d'audit Codex ne peut pas reproduire `npm test`

Constat de l'audit `a32059f1` (severity low, evidence BLOCKED) : le contrat
lecture seule de Codex empêche `npm test` du Supervisor, qui compile vers
`supervisor/dist/` (TS5033/EROFS) et dont les fixtures écrivent sur disque.
La revendication « tests verts » d'un builder reste donc invérifiable par
l'auditeur indépendant.

Proposition à évaluer à la prochaine rétrospective : offrir à l'audit un
environnement jetable autorisant uniquement les écritures de build et de
fixtures (par exemple un overlay/tmpfs sur `dist/` et le répertoire de
fixtures), sans élargir le sandbox au reste du dépôt.

## 2026-08-20 — Le daemon meurt sur SQLITE_BUSY au lieu de réessayer

Observé en dev (code du tag stable v1.1.0, hors périmètre de la tranche
centre de contrôle) : deux daemons pointant par erreur sur la même base ont
provoqué `Error: database is locked` dans `claimNextAudit()` via le tick de
la queue, et l'exception non rattrapée a tué le processus. Aucun
`PRAGMA busy_timeout` n'est configuré et le tick ne tolère pas un
`SQLITE_BUSY` transitoire. Sans gravité en production (écrivain unique via
PM2), mais un durcissement — busy_timeout court plus tick résilient — serait
une correction v1.1.x raisonnable.

## 2026-08-20 — L'audit visuel échoue sur la limite de sortie Codex

Les audits `d3e8f592` (et son retry) ont échoué avec « Codex process output
exceeded the configured limit » sur la page du centre de contrôle, alors que
l'audit `5b56641c` avait abouti plus tôt sur la même cible. Le verdict rendu
de l'UI corrigée reste donc indisponible ; les correctifs ont été vérifiés
statiquement (audit code `be4cfb9e`, evidence VERIFIED) et dynamiquement
(QA Playwright interne). Action humaine possible : relever la limite de
sortie dans la configuration privée du Supervisor puis relancer
`agentic-supervisor audit --type visual`.

## 2026-08-20 — La portée du garde de fichiers suit le cwd du shell

`hooks/agent-guard.sh` semble dériver la racine projet du répertoire courant
de la session : après un `cd supervisor/`, toute écriture vers `docs/`,
`prototypes/` ou la racine du worktree est refusée « outside the current
project scope », y compris pour les sous-agents. Contournement légitime :
revenir à la racine du worktree avant d'éditer. À fiabiliser (ancrer la
portée sur la racine git plutôt que sur `$PWD`).
