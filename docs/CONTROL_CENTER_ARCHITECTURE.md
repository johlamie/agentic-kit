# Centre de contrôle Kriton Supervisor — Architecture

Statut : **ratifié par le propriétaire le 20 août 2026** (réponse structurée
AskUserQuestion, persistée par le Supervisor) : direction générale approuvée
pour implémentation, D1 « racine `/` », D2 « fenêtre 7 jours », D3 « sans
jeton, risque documenté », D4 « assets `supervisor/ui/static/` », et
amendement du non-objectif §3 de la spec V2 (voir §1).
Branche : `feat/supervisor-control-center`. Base : tag `supervisor-v1.1.0-stable`.

Le centre de contrôle est la vue d'accueil multi-projets de l'interface
d'observation déjà servie par le daemon Supervisor. Il complète la vue
d'activité par projet (`/<slug>`) sans la remplacer : un seul écran qui répond
à la question « où en est la supervision, et qu'attend-on de moi ? » pour
l'ensemble des projets, depuis le tunnel SSH local existant.

## 1. Position par rapport à la spec V2

`CODEX_SUPERVISOR_IMPLEMENTATION_SPEC_V2_UI_UX.md` §3 (l. 131–152) liste
« a web dashboard » parmi les non-objectifs V1. La vue d'activité livrée en
v1.1.0 déroge déjà à cette clause ; le centre de contrôle élargit la
dérogation. Plutôt que de l'ignorer silencieusement, ce document propose
l'**amendement suivant**, à ratifier avec le reste de la conception :

> §3 amendé — reste hors périmètre : tout dashboard *public*, toute UI
> d'*action* (approbation, commande, exécution), tout backend web dédié.
> Est en périmètre depuis v1.1.0 : une UI d'**observation stricte**, servie
> par le daemon existant, loopback uniquement, lecture seule, dont la vue
> par projet et la vue d'ensemble (« centre de contrôle »).

Toutes les autres clauses de la spec restent inchangées et contraignantes,
en particulier §66 (aucun contournement : zéro affordance d'écriture), §31/§57
(rédaction des secrets), §5 (jamais d'exposition publique du port).

## 2. Contraintes héritées (non négociables)

- **Loopback uniquement** : mêmes gardes que la vue actuelle —
  `isLoopback()`, refus des en-têtes de proxy, contrôle `Sec-Fetch-Site`,
  host/port épinglés (`server.ts:336–354`).
- **Lecture seule absolue** : aucune route POST/PUT/DELETE côté UI. `retry`,
  `resolve`, audits manuels restent dans le CLI. Le centre de contrôle
  n'affiche que ce que SQLite sait déjà.
- **CSP stricte identique** (`server.ts:311–320`) : `default-src 'self'`,
  pas de scripts externes, `frame-ancestors 'none'`, `noindex`.
- **Rédaction** : tout texte issu des événements/audits passe par
  `redactText()` avant sérialisation, comme dans `activity.ts`.
- **Zéro ressource sans onglet ouvert** : pas de timer, pas d'abonnement,
  pas de processus par projet. La propriété prouvée par
  `tests/activity-server.test.ts:116` (1 000 projets → 0 ressource vive)
  doit rester vraie avec le centre de contrôle.
- **Le prototype public reste sans données** : la maquette
  `prototypes/supervisor-timeline/deploy/` ne reçoit jamais le moindre
  branchement réel.

## 3. Vue d'ensemble

```text
Navigateur (tunnel SSH) ──GET /──────────────► HTML centre de contrôle
        │                                        (assets /_supervisor/assets/*)
        ├─GET /_supervisor/api/control/summary─► ControlSnapshot (JSON)
        ├─SSE /_supervisor/api/control/stream──► nudges «refresh» agrégés
        └─GET /<slug>───────────────────────────► vue d'activité projet (inchangée)

Hooks Claude ─► insertEvent/dispatch ─► ActivityBus.publish(project)
                                           ├─► abonnés projet (vue slug)
                                           └─► abonnés globaux (centre de contrôle)
```

Le protocole reste celui validé pour la vue projet : **snapshot + nudge**.
Le SSE ne transporte jamais de données, seulement l'invitation à re-télécharger
le snapshot. Un seul format, un seul chemin de rédaction, pas d'état
incrémental à synchroniser.

## 4. Routes HTTP

| Route | Méthode | Réponse | Notes |
|---|---|---|---|
| `/` | GET (navigateur direct) | HTML centre de contrôle | voir décision D1 ci-dessous |
| `/health` | GET | JSON santé **inchangé** | le CLI (`cli/main.ts:128`) ne consomme que `/health` |
| `/_supervisor/api/control/summary` | GET | `ControlSnapshot` JSON | 200 toujours (liste éventuellement vide) |
| `/_supervisor/api/control/stream` | GET | SSE `refresh`/`closed` | compte dans `activityMaxStreams` |
| `/_supervisor/assets/<nom>` | GET | assets existants + nouveaux | même mécanique |
| `/<slug>`, `/_supervisor/api/projects/…` | GET | **inchangées** | vie/mort liée aux sessions actives, comme aujourd'hui |

**D1 — racine `/`.** Aujourd'hui `/` renvoie le JSON de santé (dupliqué sur
`/health`). Proposition : `/` sert le HTML du centre de contrôle pour une
requête navigateur directe (mêmes gardes `isDirectUiRequest`), et continue de
renvoyer le JSON de santé sinon (curl, outillage). Aucun consommateur connu de
`/` en JSON n'existe dans le dépôt ; `/health` reste l'API stable.
Alternative si refusée : route dédiée `/_supervisor/` et `/` inchangée.

## 5. Modèle de données — `ControlSnapshot`

```jsonc
{
  "version": 1,
  "generatedAt": "…",
  "daemon": {
    "version": "1.1.0",
    "level": "standard",
    "queue": { "pending": 0, "running": 1, "completed": 60, "failed": 0 },
    "telegram": "configured" | "not_configured",
    "activeStreams": 2
  },
  "attention": [            // demandes humaines ouvertes, tous projets, triées par ancienneté
    {
      "id": "…", "projectName": "…", "projectSlug": "…",
      "source": "permission" | "question" | "elicitation" | "audit",
      "title": "…", "reason": "…", "requestedAction": "…",
      "createdAt": "…", "safeToContinue": true
    }
  ],
  "projects": [             // actifs d'abord, puis récents inactifs
    {
      "name": "…", "slug": "…", "active": true,
      "activeSessionCount": 2, "startedAt": "…", "lastSeenAt": "…",
      "openHumanRequests": 1,
      "queue": { "pending": 0, "running": 1, "completed": 12, "failed": 0 },
      "latestAudit": { "type": "code", "decision": "CHALLENGE",
                        "status": "completed", "at": "…", "summary": "…" } | null
    }
  ]
}
```

Champs déjà disponibles via `db.ts` : `listActiveProjects`, `queueCounts`,
`projectQueueCounts`, `openHumanRequestCount`, `listHumanRequests`,
`latestAudit`. Ajouts nécessaires côté DB (lecture seule, indexés) :

- `listRecentProjects(withinMs, limit)` : projets dont `last_seen_at` est
  récent mais sans session active — nom, slug, dates, dernier audit. Aucune
  ligne d'événement n'est exposée pour un projet inactif.
- une variante de `listHumanRequests` limitée aux demandes `open`, jointe aux
  projets, plafonnée (ex. 50) et passée par `redactText`.

**D2 — profondeur d'historique.** Les projets *inactifs* apparaissent dans le
centre de contrôle en résumé (nom, dernier verdict, dernière activité) si vus
dans les `SUPERVISOR_CONTROL_RECENT_MS` derniers jours (défaut proposé :
7 jours). La **vue détaillée `/<slug>` reste réservée aux sessions actives**
(bail de sécurité existant, documenté dans
`docs/HUMAN_ACTIONS_AND_CONFIGURATION.md`). Le centre de contrôle n'affaiblit
donc pas le bail : il résume l'inactif, il ne le rouvre pas.

## 6. Extension `ActivityBus`

Ajout minimal dans `activity.ts` :

```ts
subscribeAll(listener): () => void   // abonnés globaux
publish(projectPath)                 // notifie projet + globaux (inchangé pour l'appelant)
```

Le flux SSE du centre de contrôle s'abonne via `subscribeAll` et applique un
**debounce court (~1 s)** avant d'émettre `refresh`, pour qu'une rafale de
hooks ne déclenche pas une rafale de re-téléchargements. Même heartbeat
partagé, même plafond global `activityMaxStreams`, même libération à la
fermeture de l'onglet. Contrairement aux routes projet, le flux du centre de
contrôle ne s'éteint pas quand un projet se ferme : il n'émet `closed` qu'à
l'arrêt du daemon.

## 7. Sécurité — modèle de menace de l'énumération

Les routes UI actuelles sont volontairement non authentifiées (protégées par
loopback + anti-proxy + `Sec-Fetch-Site` + slug non devinable en pratique).
Le centre de contrôle change une chose : il **énumère tous les projets** sur
une route fixe. Tout processus local (ou toute page web ouverte dans le
navigateur du poste qui réussirait à contourner `Sec-Fetch-Site`) pourrait
lire noms de projets, verdicts et titres de demandes humaines.

Position proposée (**D3**) : risque accepté en V1 sur cette machine
mono-utilisateur accédée par tunnel SSH, avec trois garde-fous :

1. le snapshot ne contient ni chemin absolu (seulement nom + slug), ni
   contenu d'événement — uniquement des résumés déjà rédigés ;
2. drapeau `SUPERVISOR_CONTROL_UI=true|false` pour désactiver la vue
   d'ensemble indépendamment des vues projet ;
3. la décision est réversible : si un jeton d'UI devient nécessaire
   (multi-utilisateur, poste partagé), il s'ajoutera en tête des routes
   `_supervisor/*` sans changer le protocole.

## 8. Architecture des assets

Constat : `supervisor/src/ui/assets.ts:5` lit les assets **dans
`prototypes/supervisor-timeline/`** et réécrit le HTML par remplacement de
chaînes — un couplage fragile déjà signalé (le prototype est en réalité une
dépendance runtime du daemon).

Proposition (**D4**) : créer `supervisor/ui/static/` versionné avec le daemon :

```text
supervisor/ui/static/
├── control.html      // centre de contrôle
├── control.css       // tokens partagés + composants de la vue d'ensemble
├── control.js        // fetch snapshot + SSE nudge, zéro innerHTML
├── shared.css        // tokens design extraits du prototype (source de vérité)
└── favicon.svg
```

- Le centre de contrôle est servi **exclusivement** depuis ce répertoire :
  pas de réécriture de chaînes, pas de mode démo, HTML écrit pour le runtime.
- La vue projet existante continue de lire le prototype **sans changement**
  dans cette itération (risque zéro sur l'existant) ; sa migration vers
  `supervisor/ui/static/` est notée comme suite logique, pas comme prérequis.
- Le prototype garde son rôle de maquette publique sans données.

## 9. Configuration

| Variable | Défaut | Rôle |
|---|---|---|
| `SUPERVISOR_CONTROL_UI` | `true` | active la vue d'ensemble (indépendant de `SUPERVISOR_ACTIVITY_UI`) |
| `SUPERVISOR_CONTROL_RECENT_MS` | `604800000` (7 j) | fenêtre des projets inactifs affichés |

Bornées et validées dans `config.ts` comme les variables existantes.

## 10. Développement isolé et tests

- **Daemon de dev** : `SUPERVISOR_ENV_FILE=.artifacts/dev/supervisor.env npm
  start` → port **8788**, état SQLite sous `.artifacts/dev/state/`, niveau
  `off`, Telegram vide. Le daemon H24 (port 8787, PM2, base et config réelles)
  n'est ni modifié, ni redémarré, ni consulté en écriture.
- **Données de démonstration** : un script de seed (`scripts/` ou test
  helper) insère événements/audits/demandes dans la base de dev via les
  méthodes existantes de `SupervisorDatabase` — jamais dans la base réelle.
- **Tests** : `supervisor/tests/control-server.test.ts` sur le modèle de
  `activity-server.test.ts` — page 200 + CSP, refus proxy 403, contenu du
  snapshot (actifs/inactifs/attention), SSE nudge + debounce, plafond de
  flux, `SUPERVISOR_CONTROL_UI=false` → 404, propriété « zéro ressource sans
  onglet ». `npm run typecheck && npm test` avant tout commit.
- **Vérification visuelle** : captures sous `.artifacts/screenshots/<run>/`
  aux quatre viewports de la spec (390×844, 768×1024, 1440×900, 1920×1080),
  jamais à la racine du projet.

## 11. Relevé de décisions (ratifiées le 20 août 2026)

| # | Décision | Proposition |
|---|---|---|
| D1 | Emplacement de la vue | `/` (HTML navigateur, JSON sinon), `/health` intact |
| D2 | Historique | inactifs résumés sur 7 j ; vue détaillée toujours active-only |
| D3 | Authentification | pas de jeton en V1, drapeau de coupure + risque documenté |
| D4 | Assets | nouveau `supervisor/ui/static/`, prototype inchangé pour la vue projet |
| §3 | Amendement spec | dérogation explicite « UI d'observation » (voir §1) |

## 12. Commandes de lancement

### Développement isolé (sans toucher le daemon H24)

```bash
cd <racine-du-worktree>
npm --prefix supervisor run build
cd supervisor && SUPERVISOR_ENV_FILE="$PWD/../.artifacts/dev/supervisor.env" node dist/src/index.js
# → http://127.0.0.1:8788/ (données de démonstration : node .artifacts/dev/seed.mjs)
```

Vérifications : `npm --prefix supervisor run typecheck`,
`npm --prefix supervisor test`, `node prototypes/supervisor-timeline/test.mjs`,
`bash scripts/validate-kit.sh`.

### Production (après merge, à l'initiative du propriétaire uniquement)

```bash
cd ~/agentic-kit && git pull && npm --prefix supervisor ci && npm --prefix supervisor run build
pm2 restart agentic-supervisor   # applique aussi les migrations d'index 003/004
```

Puis, depuis le poste de travail :

```bash
ssh -N -L 8787:127.0.0.1:8787 vps1
# navigateur → http://127.0.0.1:8787/  (centre de contrôle)
# curl sur / continue de recevoir le JSON de santé ; /health est inchangé
```

Rollback : `git checkout supervisor-v1.1.0-stable && npm --prefix supervisor
run build && pm2 restart agentic-supervisor` (les index ajoutés sont ignorés
par l'ancien code et peuvent rester).

La spécification UX associée est dans `docs/CONTROL_CENTER_UX.md`.
