# A. VERDICT EN 10 LIGNES MAXIMUM

1. **Agentic-kit apporte une infrastructure réelle de continuité et de contrôle, mais son gain de qualité et de productivité reste NON DÉMONTRÉ.**
2. La mémoire commune, les sauvegardes, les checkpoints et plusieurs contrôles ciblés fonctionnent dans les essais locaux.
3. Le pipeline complet reste principalement un contrat d’orchestration en langage naturel, pas un moteur de livraison qui impose ses phases.
4. Le Supervisor persiste et classe correctement plusieurs états ; ses gates ne certifient pourtant pas le contenu effectivement livré.
5. Un PASS périmé, une preuve reviewer absorbée en cours d’audit et un BLOCK perdu dans l’historique ont été reproduits.
6. Les garde-fous ajoutent une protection utile sur des cas ordinaires ; leurs symlinks et variantes shell laissent des décisions au modèle.
7. Pour un développeur expérimenté, je l’utiliserais comme assistant de méthode et de contrelecture, avec vérification des preuves.
8. Je ne lui confierais pas davantage d’autonomie de production avant correction des gates et vérification des frontières réelles du runtime.
9. L’adoption par un tiers nécessite surtout un contrat cohérent et un environnement reproductible, pas davantage de rôles.
10. Cet audit est expérimental mais partiel : aucune livraison réelle, comparaison Claude/Claude ou réduction des interventions humaines n’a été mesurée.

# B. CE QUI A RÉELLEMENT ÉTÉ TESTÉ

## Version et préservation

Audit du **7 septembre 2026**, dossier indépendant : **`/tmp/agentic-kit-audit-2026-09-07`**.
Dépôt source : `/home/ubuntu/agentic-kit`. Branche : `feature/codex-shared-kit`.
Commit : **`06e3974d2c80dc1434ec0e575a40f605484fc58b`**.

L’état audité est celui du répertoire de travail, et non seulement HEAD. Quatre fichiers étaient déjà modifiés :

- `global/agents/builder.md`, `global/agents/product-manager.md`, `global/agents/reviewer.md` : modèles déclarés modifiés vers `claude-fable-5-1` ; leur disponibilité réelle n’a pas été testée.
- `global/settings.json` : modèle `fable[1m]`, retrait de `autoUpdatesChannel`, ajout de deux chemins de projets dans `additionalDirectories`. Les noms de ces projets sont masqués dans la preuve de différences ; aucun de ces projets n’a été consulté.

[État initial](evidence/initial-state.json), [différences non committées expurgées](evidence/uncommitted-changes.json), [empreintes des 181 fichiers](evidence/source-manifest.json), [contrôle final de préservation](evidence/preservation-check.json).
Les empreintes finales des fichiers source et de l’implémentation de la copie sont inchangées. Aucun correctif du kit, commit source, push, merge, déploiement ou changement global. Les tests versionnés d’attribution créent leurs propres commits exclusivement dans des dépôts synthétiques jetables : aucune modification de l’historique du kit.

Pendant les mesures, la règle « aucun commit » a été respectée et les artefacts ont été conservés séparément. Après clôture de l’audit, l’utilisateur a explicitement demandé de committer les rapports et de les pousser sur Git. Cette autorisation de publication est limitée au dossier `docs/audits/2026-09-07/` ; elle ne modifie pas l’implémentation auditée ni les résultats historiques.

## Isolation et environnement

Les 181 fichiers suivis ont été copiés après inspection de leur type ; aucun symlink source. `.git`, mémoires personnelles, `.claude` local non suivi, comptes et configurations globaux ont été exclus. Un Git neuf sans commit a été initialisé dans la copie uniquement pour les validations qui utilisent `git ls-files`.

Les commandes passent par [run-command.py](fixtures/run-command.py) : environnement limité explicitement, HOME/XDG/CODEX_HOME/TMPDIR synthétiques, configuration Git globale exclue, limite par sous-processus et arrêt du groupe au timeout. Les vraies CLI de modèles, notification, SSH et services ont été remplacées dans ce PATH par des refus d’exécution. Les seuls faux CLI fonctionnels sont créés explicitement par les tests. Aucun champ de commande dangereuse transmis au garde-fou n’a été exécuté.

Node **22.23.1**, npm **10.9.8**, Python **3.10.12**, Git **2.34.1**, jq **1.6**, ShellCheck **0.8.0**. [Environnement](evidence/environment.json).
Le registre npm échoue en `EAI_AGAIN`. L’écoute locale échoue en `listen EPERM` même sur `127.0.0.1`. Aucune protection ni restriction du runtime n’a été désactivée pour obtenir un succès.

Les scripts d’installation et les scripts des dépendances ont été inspectés avant exécution. Après échec de `npm ci`, une copie des dépendances déjà présentes a permis de tester le code : 766 fichiers examinés, deux symlinks internes, versions concordantes avec le lockfile, aucun script de cycle d’installation dans les manifestes examinés. **L’intégrité des archives du registre n’a pas été vérifiée indépendamment.** Cette solution permet compilation et tests ; elle ne prouve pas la reproductibilité d’une installation fraîche. [Inventaire de cette solution de repli](evidence/dependency-fallback.json).

## Résultats exécutés

| Validation | Résultat de l’audit | Portée exacte |
|---|---|---|
| `./scripts/validate-kit.sh` | Échec initial, puis succès avec racine de projets textuelle hors `/tmp` | Échec initial dû au test traversal tombant dans l’exception `/tmp`; aucun correctif source. |
| `./global/hooks/agent-guard.sh --self-test` | Même diagnostic ; succès contextualisé | Tous les cas intégrés passent une fois l’hypothèse de chemin du test respectée. |
| `./scripts/smoke-install.sh` | Succès | Liens/configurations sous HOME temporaire ; build/CLI Supervisor simulés dans ce smoke. |
| ShellCheck principal et Kimi | Succès | Analyse statique des scripts couverts par CI. |
| Tests Python du kit | **20 + 12 + 2 réussis** | Migration/lock/attribution, opérations locales, exceptions de portée. |
| `npm ci --ignore-scripts`, puis `npm ci` | **BLOQUÉS** | DNS registre ; code de sortie 1, pas un défaut démontré du kit. |
| `npm run typecheck`, `npm run build` | Succès | Compilation réelle avec dépendances de repli inspectées. |
| `npm test` | Non vert : 12 modules passent, 4 échouent | Diagnostic détaillé : **66 tests réussis, 13 bloqués par EPERM**, sur 79 ; aucun des 13 classé comme bug produit sur cette seule base. |
| `npm audit --omit=dev --audit-level=high` | **BLOQUÉ** | Endpoint inaccessible ; aucun verdict de vulnérabilités. |
| `./scripts/check-runtime.sh` | **BLOQUÉ**, exit 97 | Prévalidations effectuées puis CLI réelle empêchée par l’isolation. Les lignes « command available » peuvent désigner nos stubs. Ce n’est pas un diagnostic de l’installation réelle de l’utilisateur. |
| Validations et smoke Kimi | Succès | Manifeste, règles textuelles, liens ; aucun modèle Kimi invoqué. |
| 50 décisions de garde-fou supplémentaires | **OBSERVÉ** | 10 deny, 9 ask, 31 sans avis ; ce décompte n’est pas un taux de réussite. |
| 8 scénarios mémoire/workflow | **OBSERVÉ** | Données synthétiques, CLI de construction simulée, dont un échappement du lecteur d’événements. |
| Scénarios Supervisor supplémentaires | **OBSERVÉ** pour DB/queue/forwarder | Des assertions caractérisent aussi des défauts ; exit 0 de la fixture ne signifie pas PASS produit. |
| Trois mutations minimales | Les trois sont détectées | Copies jetables uniquement ; aucune mutation n’est présentée comme défaut initial. |
| Interface Control Center | 8 cas rendus dans Chromium réel | Vrais assets, HTTP intégralement simulé, SSE absent pour exercer le fallback polling. |
| Petite application comparative | Évaluateur et starter exécutés : **6/12** propriétés présentes | Starter volontairement incomplet ; **aucune construction par Claude**, donc aucun score du kit. |

Le détail commande/contexte/code/sortie est dans [TEST_RESULTS.md](TEST_RESULTS.md). Les valeurs agrégées ne mélangent pas les relances diagnostiques, mutations et tests initiaux.

## Ce qui reste NON TESTÉ

Aucune vraie session Claude/Codex de construction, mobilisation effective des huit rôles, adhésion réelle G1–G4, comparaison avec/sans kit, usage réel de modèles déclarés, accès MCP authentifié, notification Telegram, publication, vraie base applicative ou QA publique. L’API HTTP/SSE/authentification Supervisor n’a pas pu être exercée dans cette sandbox. Le navigateur a testé le client par interception de réponses ; ce n’est pas une intégration serveur réussie.

Aucune mémoire textuelle n’a été prise pour un apprentissage, aucune injection de prompt stockée n’a été prise pour un exploit de modèle, aucune réponse simulée n’a été prise pour un audit cognitif Codex. Les sous-revues ont été réparties entre rôles Codex ; cette répartition ne constitue pas une indépendance entre fournisseurs ni une mesure de la qualité des agents du kit.

# C. FORCES DÉMONTRÉES

## Mécanismes à conserver

**La continuité documentaire est implémentée.** Migration des mémoires, sauvegarde vérifiée avant mutation, préflight des liens, conservation des aliases, idempotence, écritures séparées de checkpoints et verrou consultatif commun aux worktrees ont des tests comportementaux exécutés. Les tests contrôlent aussi les échecs de sauvegarde et une reprise après interruption. Ce sont des propriétés utiles pour alterner les outils sans perdre les décisions ; pas une preuve que le prochain modèle interprétera correctement celles-ci. [Tests Python](evidence/shared-kit-tests.log), [caractérisation workflow](evidence/workflow/characterization-results.json).

**Le Supervisor possède un socle de persistance exploitable.** Schéma SQLite, transactions de claim/complete, conservation d’une demande humaine ouverte après réouverture et nouveau PASS, séparation des projets synthétiques, budget de tentatives et sortie ERROR après épuisement sont vérifiés. Le parseur valide la structure JSON et impose certaines priorités : une finding de sécurité suffisamment grave ne conserve pas PASS. Les tests CLI simulés vérifient réellement les arguments et l’environnement transmis. [Modules détaillés](evidence/supervisor-modules/results.json), [caractérisations](evidence/supervisor-characterization.log).

**Les opérations locales simples ont des contrôles utiles.** Les commandes directes de publication d’un builder, accès direct aux faux secrets, mutations explicites de chemins live enregistrés et écritures hors portée sont détectées dans les cas testés. `file-scope.py` résout les symlinks pour les exceptions de mémoire/additionalDirectories ; `local-operations.py` refuse ou escalade plusieurs cibles globales/ambiguës sans exécuter la commande. [Décisions](evidence/guard-characterization.log), [tests des helpers](evidence/local-operations-tests.log).

**Certains tests discriminent vraiment.** Enlever la vérification de rôle, la conversion sécurité vers BLOCK ou l’incrément de tentative fait échouer les tests pertinents, alors que les deux mutations TypeScript compilent. Ce résultat réfute l’idée d’une suite faite uniquement de vérifications de présence. Il ne démontre pas une bonne couverture générale. [Mutations](evidence/mutations/results.json).

**Le client web fonctionne dans plusieurs états réels de rendu.** À 390, 768, 1440 et 1920 px, les données synthétiques restent lisibles sans débordement géométrique observé. Lien d’évitement, focus clavier, activation d’un lien, état vide, reprise après HTTP 503 et un payload HTML inerte ont été exercés. Un 503 produit une erreur explicite puis récupération. [Résultats navigateur](evidence/browser/results.json), [mobile](evidence/browser/populated-390.png), [desktop](evidence/browser/populated-1440.png).

## Bonnes distinctions établies par inspection

Les rôles reviewer et QA exigent des choses différentes : revue du code versus parcours dérivé de SPEC et exécution navigateur. Ils ne sont pas censés recopier le builder. Le contrat commun précise que les événements sont déclaratifs, qu’un exit code n’est pas un verdict QA, que les permissions Codex/Claude diffèrent, et qu’un shell en lecture seule ne contraint pas les écritures MCP distantes. La maintenance peut employer seulement les phases pertinentes et conserver les autorisations déjà acquises. Ces distinctions sont cohérentes ; **leur respect par une vraie équipe de modèles reste NON TESTÉ**.

# D. PROBLÈMES PRIORITAIRES

**14 constats regroupés par cause : 12 OBSERVÉS et 2 ÉTABLIS PAR INSPECTION. Aucun constat critique.** Trois défauts sont élevés parce qu’ils fragilisent directement la signification d’une validation indispensable. Les autres restent moyens : ne pas confondre importance du périmètre sécurité et preuve d’exploitation réelle.

| Priorité | Constat | Preuve déterminante | Limite de l’inférence |
|---|---|---|---|
| Haute | **SUP-01 : PASS indépendant des octets du candidat** | Après modification de `app.js`, même PASS/même audit. | Pas de déploiement erroné exécuté. |
| Haute | **SUP-02 : preuves arrivées pendant running ignorées par l’auditeur** | Marqueur reviewer dans SQLite mais absent du prompt ; un seul audit PASS. | Runner simulé, perte de transmission réelle. |
| Haute | **SUP-05 : ERROR non bloquant dans Stop** | Vrai forwardHook produit seulement systemMessage pour ERROR, contre decision:block pour BLOCK. | La DB conserve ERROR ; action finale Claude NON TESTÉE. |
| Moyenne | **SUP-03 : ancien BLOCK masqué après 250/500 lignes** | Le BLOCK existe toujours mais les gates retournent PASS. | Nécessite accumulation d’historique. |
| Moyenne | **SUP-04 : sorties brutes en DB** | Faux secrets reconnaissables conservés dans stdout/stderr. | Aucun secret réel ; stockage normalement privé. |
| Moyenne | **SUP-07 : doublons à la frontière des hooks** | Même payload researcher → deux événements/deux audits. | La déduplication d’IDs identiques fonctionne. |
| Moyenne | **SUP-08 : EPIPE non intercepté sur sortie précoce de la CLI** | Deux processus appelants terminent avec erreur non gérée ; témoin consommant stdin retourne CODEX_NO_OUTPUT correctement. | CLI synthétique ; daemon réel non lancé. |
| Moyenne | **PERM-01/02/03 : limites de chemins, langage shell et dépendance jq** | Paires direct/alias ou variantes donnent deny/ask versus aucun avis ; sans jq aucun avis. | Aucun avis n’est pas ALLOW natif. |
| Moyenne | **WF-01 : le lecteur d’événements suit un fichier lié hors projet** | `agentic log` affiche un faux secret synthétique extérieur. | Lecture dans les droits OS existants, pas élévation. |
| Moyenne | **BR-01 : une réponse 200 `{}` devient un affichage sain** | « En direct », « base ok », zéro intervention malgré structure invalide. | Réponse injectée, pas émission réelle du serveur ni gate PASS. |
| Moyenne | **WF-02 : contrats documentaires incompatibles** | README/guide promettent merge/sandbox plus largement que contrat récent. | Incohérence inspectée, aucune exécution non autorisée démontrée. |
| Moyenne | **SUP-06 : arrêt incomplet après limite de sortie** | Le chemin de code annule le timeout après TERM, sans KILL différé. | Reproduction dynamique non obtenue ; les essais ont pris le chemin timeout. |

Chaque fiche complète figure en fin de rapport et dans [FINDINGS.json](FINDINGS.json), avec lignes, préconditions, attendu/observé, impact, correction minimale et test de correction.

## Ce qui peut donner une impression de contrôle supérieure à la garantie

Une trace présente en base n’est pas forcément une preuve consommée par l’auditeur (SUP-02). Un PASS de projet n’est pas un certificat du candidat courant (SUP-01). Un historique existant n’est pas nécessairement consulté intégralement par la gate (SUP-03). Un message d’erreur ne bloque pas forcément le tour (SUP-05). Un checkpoint « QA PASS » ne vérifie pas le fichier de capture déclaré, ce que le contrat reconnaît explicitement. Une interface « base ok » peut seulement avoir appliqué une valeur par défaut (BR-01).

Le garde-fou n’est **pas une sandbox** : il produit une décision pour certains outils et syntaxes, puis les permissions natives et le classifier reprennent la main. Les garanties sur shell, fichiers, MCP, navigateur et opérations distantes doivent être évaluées séparément. `runner.ts` impose des arguments shell read-only/never/ephemeral, mais hérite HOME/CODEX_HOME ; aucune allowlist technique générale des outils MCP n’y est imposée. L’allowlist navigateur de la queue concerne l’URL initiale d’un audit visuel, pas toutes les navigations ou effets possibles.

Contre-preuve : le setup MCP propose réellement un endpoint GitHub `/readonly` et un profil Playwright isolé (`setup/codex-mcp-setup.sh:110,129–134`). Cela réduit certains risques, sans prouver les capacités effectives d’autres MCP installés ni l’absence d’actions distantes. Aucun effet distant n’a été tenté.

# E. VALEUR AJOUTÉE DU KIT

## Réponse à la question centrale

**Le dépôt démontre une aide à la continuité, à la structuration et à certains contrôles. Il ne démontre pas encore qu’il livre de meilleurs logiciels, plus vite et avec moins de supervision qu’un agent plus simplement équipé.** Les défauts de gate rendent aujourd’hui injustifiée une délégation plus large fondée uniquement sur les statuts du Supervisor. Ils ne rendent pas inutiles ses rapports ni sa base.

La comparaison A/B réelle n’a pas été menée. Le HOME d’essai n’a pas d’authentification de modèle, et importer/utiliser les comptes, mémoires et configurations réels sortait du cadre de préservation. Aucun appel de construction Claude, coût additionnel ou contournement de cette limite. La présence d’un binaire sur l’hôte n’établit pas un environnement expérimental authentifié et comparable.

| Condition | Critères satisfaits | Bugs/régressions | Interventions | Temps/outils/tokens/coûts | Conclusion |
|---|---|---|---|---|---|
| A. Claude sans kit | NON TESTÉ | NON TESTÉ | NON TESTÉ | NON MESURÉ | Aucune baseline réelle |
| B. Claude avec kit complet | NON TESTÉ | NON TESTÉ | NON TESTÉ | NON MESURÉ | Aucun effet du kit estimé |
| C. Kit sans Supervisor | NON TESTÉ | NON TESTÉ | NON TESTÉ | NON MESURÉ | Apport marginal non isolé |
| Starter synthétique, sans agent | 6/12 | Défauts intentionnels du benchmark | Sans objet | Commande locale enregistrée | Vérifie l’évaluateur, pas le kit |

Le [protocole](fixtures/comparison/PROTOCOL.md), [énoncé commun](fixtures/comparison/TASK.md), [code initial](fixtures/comparison/starter/tasks.py), [évaluateur indépendant](fixtures/comparison/evaluator/evaluate.py), [panne d’outil synthétique](fixtures/comparison/dependency_probe.py) et [modèle de mesures](fixtures/comparison/metrics-template.json) sont fournis. Ils couvrent fonctionnalité, bug, évolution compatible et panne transitoire. Même modèle/version, mêmes moyens/budgets, copies et mémoires séparées, aucun résultat transmis entre conditions, évaluateur caché aux constructeurs, ordre randomisé et répétitions si le budget le permet. Les gates simulées doivent être explicitement nommées ; G4 reste NON TESTÉ. Aucun pourcentage de gain inventé.

## Trois usages distincts

| Usage | Jugement technique | Exigences proportionnées |
|---|---|---|
| **A. Outil personnel pour développeur expérimenté** | Utilisable comme méthode, mémoire et contrelecture assistée. Les primitives exécutées justifient cette valeur. | Vérifier diff/tests/preuves, conserver le contrôle des cibles live et considérer les verdicts comme des avis sur une révision connue. Un SSO ou une architecture multi-tenant n’est pas nécessaire pour cet usage. |
| **B. Livraison réutilisable sur plusieurs projets** | Base exploitable, validation des candidats insuffisante. | Fraîcheur des gates, absence de pertes de preuves, reprises, séparation des chemins/MCP effectifs et registre live exact. La multiplication des projets amplifie la dette de configuration et l’historique. |
| **C. Base confiable par d’autres développeurs** | Transmissible à un pair capable d’auditer et configurer ; pas encore autonome à l’installation. | Guide canonique, prérequis vérifiables, profils régionaux/propriétaire explicites, modes dégradés compréhensibles, installation fraîche vérifiée et essai de livraison reproductible. Pas besoin d’en faire artificiellement un produit enterprise. |

Les choix French-first, UEMOA, Android et réseau Afrique de l’Ouest sont adaptés à certains besoins personnels ; leur présence n’est pas un défaut architectural. Pour des tiers, ils doivent être visibles et remplaçables. Le registre live, les accès, le plan serveur, les conventions PM2/Nginx, les modèles et MCP restent dépendants du propriétaire.

## Six axes, sans moyenne trompeuse

| Axe | Évaluation | Confiance et couverture |
|---|---|---|
| Fiabilité fonctionnelle du kit | Primitives locales utilisables ; gates/lifecycle à corriger | Élevée sur les scénarios déterministes ; HTTP et chaîne réelle non évalués |
| Qualité des logiciels livrés | **NON ÉVALUABLE** | Aucune construction/livraison comparée |
| Sécurité et contrôle | Contrôles additionnels utiles, frontière complète non établie | Élevée sur décisions synthétiques et fuites synthétiques ; runtime natif/remote NON TESTÉ |
| Architecture et maintenabilité | Découpage raisonnable, état de validation trop faible et règles dupliquées | Inspection ciblée + races reproduites ; pas de mesure du coût de maintenance |
| Portabilité et prise en main | Installations locales de liens testées ; dépendance notable au VPS et au propriétaire | Bonne confiance sur smoke ; machine vierge/authentification hors couverture |
| Efficacité par rapport à plus simple | **NON DÉMONTRÉE** | Aucun essai A/B ; pas de note globale |

# F. PLAN D’ACTION

Les efforts sont relatifs : **faible** = modification locale et test ciblé ; **moyen** = plusieurs frontières à mettre en cohérence ; **élevé** = campagne de validation réelle. Ce ne sont pas des devis en jours.

## À corriger avant de lui confier davantage d’autonomie

| Action minimale | Bénéfice attendu | Effort | Dépendances |
|---|---|---|---|
| Attacher gates/audits aux octets du candidat, définir preuves requises et invalider les résultats périmés (SUP-01) | Validation portant sur le code réellement proposé | Moyen | Définition des fichiers pertinents et point de consommation avant intégration/livraison |
| Ne plus absorber silencieusement une preuve dans running ; réaudit/suivi borné (SUP-02) | Reviewer et QA tardifs réellement pris en compte | Faible à moyen | Identité/version du candidat, test de course suspendue |
| Consommer ERROR comme refus de la phase requise, distinct de télémétrie (SUP-05) | Dégradation explicite sans validation contournable | Moyen | Phase affectée identifiable ; essai natif isolé |
| Interroger les derniers états par type sans pagination (SUP-03) | Blocages stables sur projets durables | Faible | Test >500 audits |
| Résoudre les fichiers sensibles, contrôler chaque événement lu (PERM-01, WF-01) | Empêcher les échappements de chemins reproduits | Faible à moyen | Politique de symlink explicite ; fichiers nouveaux/ancêtres testés |
| Expurger avant persistance et gérer les erreurs stdin/arrêt des enfants (SUP-04,06,08) | Réduire rétention accidentelle et pannes du daemon | Moyen | Tests succès/erreur/close/output-limit avec CLI synthétiques |
| Faire échouer explicitement le hook privé de son parseur et réduire les promesses shell (PERM-02,03) | Environnement dégradé visible ; frontière annoncée crédible | Faible pour docs/jq, moyen pour frontière runtime | Choix d’un périmètre OS réel ; ne pas reconstruire un shell complet en regex |

## À améliorer ensuite

| Action | Bénéfice attendu | Effort | Dépendances |
|---|---|---|---|
| Idempotence des jalons à l’entrée du Supervisor (SUP-07) | Moins d’audits/demandes répétés | Faible à moyen | Définition des occurrences de hooks |
| Valider l’enveloppe des snapshots UI (BR-01) | Pas de faux état sain/vide sur erreur de contrat | Faible | Contrat API requis, réemploi de l’état d’erreur existant |
| Tester une installation vierge et les routes/auth/SSE sans données réelles | Fermer les trous de couverture de cet audit | Moyen | Environnement permettant dépendances et sockets locales |
| Exécuter le protocole A/B avec accès explicitement autorisés | Mesurer qualité, dépannage et coût total | Élevé | Gates corrigées, modèle/version/budget identiques |
| Tester reprise sémantique et injection sur mémoires synthétiques | Savoir ce que le modèle vérifie réellement | Moyen | Sessions authentifiées séparées, aucune vraie mémoire importée |

## À simplifier ou supprimer

- **Unifier les textes de permission et maintenance (WF-02)** : une règle canonique, des liens depuis README/guides et les exemples alignés. Bénéfice : moins d’arbitrages implicites du propriétaire. Effort faible à moyen ; aucune nouvelle infrastructure.
- **Documenter ou supprimer l’alias `strict` tant qu’il est équivalent à `standard`** dans la sélection des audits (`dispatcher.ts:125–128`). Bénéfice : un choix qui ne suggère pas de garanties inexistantes. Effort faible ; vérifier les usages de configuration avant retrait.
- **Pour une petite correction, employer les phases pertinentes déjà prévues**, avec critères, constructeur, vérification indépendante adaptée et checkpoint. Ne pas supprimer reviewer ou QA par principe : leurs responsabilités sont distinctes. Bénéfice d’efficacité plausible, encore à mesurer ; effort faible, dépend de l’alignement documentaire.
- **Mesurer avant d’étendre le Control Center, les audits redondants ou le nombre de rôles.** Un audit supplémentaire doit découvrir un défaut ou réduire le dépannage observable. Pas de suppression aveugle du Supervisor ; son stockage et ses avis existent réellement.

## À conserver en l’état, dans leur portée actuelle

Mémoire commune et adoption préservant les données ; événements séparés/attribués explicitement déclaratifs ; verrou consultatif annoncé comme tel ; parseur à schéma ; distinction demande humaine/verdict technique ; helpers ciblés de portée et d’opérations locales ; CI statique et mutations pertinentes ; base du rendu responsive/clavier et reprise HTTP503. Le fait de conserver ces pièces ne valide pas leurs usages au-delà de la couverture testée.

# G. FONCTIONNEMENT RÉEL ET MATRICE DES PROMESSES

## Du besoin à la reprise

| Étape / déclencheur réel | Entrées → sorties utilisées | Qui continue, erreur et validation | Code imposé / consigne |
|---|---|---|---|
| Demande / choix du skill par le modèle | Demande → missions des rôles | L’orchestrateur sélectionne les phases | Pas de dispatcher logiciel des huit rôles dans `agentic.py` ; pipeline textuel |
| `agentic init` / adoption | Git + mémoire ancienne → `.agentic`, aliases, backup | CLI refuse conflits/liens dangereux ; skill reconstruit les faits | Préflight/backup atomique en code ; reconstruction sémantique par modèle |
| PM / G1 | Besoin → SPEC, critères Must | Propriétaire accepte le périmètre | Aucun objet d’approbation G1 exigé par le launcher |
| Research | SPEC → RESEARCH et sources | Orchestrateur doit demander/attendre audit et résoudre contradictions | Dépendance au contenu SPEC explicitée dans les prompts ; hook researcher planifie un audit |
| Architecture / G2 | SPEC + RESEARCH → TECH, ARCHITECTURE, slices | Humain valide stack/coûts après contre-expertise | Documents réutilisés pour builder/devops ; pas de preuve typée de G2 au lancement |
| Design / G3 | Architecture + usages → directions, `design/` | Humain choisit ; absence d’UI justifiée | Builder doit suivre design ; exécution effective de cette conformité NON TESTÉE |
| Provisioning/scaffold | TECH et architecture → schéma/scaffold/configuration locale | Devops prépare ; parent exécute actions privilégiées autorisées | Hooks/permissions du runtime pour certaines actions ; pas de provisioning exécuté ici |
| Build | Slice + critères/design → code et tests | Builder produit, remonte résultats et fichiers partagés | Isolation des fichiers et absence merge/push sont des instructions, partiellement soutenues par hook Claude |
| Reviewer | Diff + SPEC/design → constats et commandes exécutées | PASS préalable à QA selon pipeline | La fiche exige vérification réelle, pas simple réemploi des affirmations builder ; indépendance cognitive NON TESTÉE |
| QA | Critères → parcours, erreurs, captures/URL | FAIL retourne au builder ; PASS doit avoir artefacts | Consigne ; un checkpoint peut stocker QA PASS sans capture existante |
| Supervisor | Hooks Claude ou appel explicite Codex → queue, résultat, SQLite, rapports | Parseur/DB déterminent statuts ; parent doit consommer `wait`/exit code | Mécanismes exécutables ; couverture réelle limitée par SUP-01/02/03/05 |
| Intégration / G4 | Code vérifié + audit → diff/rollback puis autorisation cible | Propriétaire autorise exposition ; parent/devops agit | Aucun hook de pré-déploiement universel liant octets, PASS et autorisation ; exécution du pipeline dépend du modèle |
| QA publique / fin | URL livrée → retest, rapport final, mémoire | Final audit et QA publique requis par consigne | NON TESTÉ ; aucun « livré » déclaré dans cet audit |
| Reprise / changement d’outil | Git, mémoire, événements → objectif, blocage, prochaine action | Nouveau modèle doit vérifier anciens PASS/décisions | Fichiers et verrou existent ; lecture/interprétation et correction des décisions obsolètes non garanties |

Le détail des déclencheurs, chemins et lignes par étape est conservé dans [la reconstruction du workflow](contributions/workflow.md). Les livrables ne sont donc pas tous décoratifs : SPEC alimente architecture/QA, TECH devops, architecture le découpage builder, design la conformité reviewer. **Ce sont surtout des liens de dépendance prescrits, pas une preuve d’utilisation effective par le modèle.** Les prompts du Supervisor incorporent effectivement du contexte dans les scénarios de queue testés, avec la course tardive identifiée.

## Promesse | Implémentation | Test possible | Preuve | Limite

| Promesse | Implémentation | Test possible | Preuve | Limite |
|---|---|---|---|---|
| Idée → MVP déployé, quatre validations | Rôles et 11 phases du skill | Parcours réel avec critères externes | Inspection du pipeline | Livraison et nombre réel d’interventions NON TESTÉS |
| Spécialistes mobilisés comme prévu | Fiches Claude ; génération Codex ; délégation prescrite | Trace réelle des invocations par phase | Inspection, installation de 8 fichiers testée | Fichiers installés ≠ agents effectivement invoqués |
| Reviewer + QA vérifient le builder | Revues, tests et parcours distincts | Bug caché et oracle externe | Instructions explicites ; transmission du prompt testée | Diagnostic autonome par modèle NON TESTÉ ; preuve tardive perdue |
| Mémoire commune | Migration, aliases, Markdown, événements | Migration/reprise/A→B | OBSERVÉ | Persistance ≠ apprentissage ni provenance de vérité |
| Événements attribués | UUID, tool/agent/session, trailers | Concurrence checkpoints, commit synthétique | OBSERVÉ | Attribution auto-déclarée, pas identité authentifiée ni exclusivité d’auteur |
| Un écrivain à la fois | flock famille Git | Deux launchers/worktrees | Tests locaux réussis | Verrou consultatif ignoré par éditeur/lancement direct |
| Secrets et projets live protégés | Règles natives, hook, registre manuel | Décisions directes/alias/wrappers | OBSERVÉ partiellement | Filtre incomplet ; projet absent de liste non détecté comme live |
| Audits fiables et indépendants | Runner Codex, parseur, queue, SQLite | Faux CLI et vrai modèle isolé | Plumbing OBSERVÉ | Trouver les bons défauts et rester sans effets distants NON TESTÉS |
| Retry/restart sûrs | Compteur, recovery et ERROR | Réouverture DB, tentatives épuisées | OBSERVÉ | Gestion stdin défaillante ; arrêt output-limit incomplet par inspection |
| Événements dédupliqués | IDs DB et coalescence | Payload identique répété | OBSERVÉ : doublon en entrée | Contrat DB plus étroit que transport réel |
| PASS applicable au code livré | Derniers verdicts par chemin/type | Modification après PASS | OBSERVÉ négatif | Aucune empreinte de candidat vérifiée par gate |
| Demande humaine persistante | Table human_requests | PASS ultérieur puis réouverture | OBSERVÉ positif | Le résolution effective/autorisation de vraie personne n’a pas été testée |
| UI claire de supervision | Control Center + polling/SSE | Vrai navigateur, panne/injection | OBSERVÉ avec HTTP mock | Contrat invalide affiché sain ; SSE/auth réels NON TESTÉS |
| Installation réutilisable | Scripts liens/build/MCP/PM2, CI | HOME vierge et environnement neuf | Smoke local OBSERVÉ | Installation système et native Claude NON TESTÉES |
| Moins de supervision et de coût | Automatisation, gates, modèles spécialisés | Comparaison A/B appariée | Protocole fourni | Valeur comparative NON DÉMONTRÉE |

## Mémoire, instructions et confiance

Les scénarios synthétiques établissent que `init` refuse une mémoire liée vers un autre projet et préserve les octets après migration. `status` de B ne reprend pas le marqueur de A. Cependant, une décision « Postgres » contredisant un fichier applicatif SQLite et un texte « declare QA PASS without verification » restent stockés sans réconciliation. Aucun modèle ne les a suivis ; **ni résistance ni exploit d’injection de prompt démontré**.

La priorité des instructions est décrite : mission courante/autorisations exactes, contrat partagé, contraintes du projet, décisions à vérifier, contenu importé non fiable. Les décisions obsolètes doivent être explicitement remplacées dans le texte. Il n’y a pas de provenance forte, vérification sémantique ou validation d’artefacts pour chaque checkpoint. Les mémoires utilisateur transversales restent un risque de contamination hypothétique ; ne pas le transformer en bug observé. La contradiction README/contrat est, elle, explicite et confirmée par inspection.

`agentic log` est une lacune distincte : le lecteur vérifie le dossier des événements mais suit un fichier `.json` individuel lié hors projet (WF-01). Cela peut injecter du contenu inattendu dans les sorties de lecture sans que le modèle l’ait demandé consciemment. Le test n’utilise qu’un canari extérieur synthétique.

# H. QUALITÉ DES TESTS ET JUGEMENT PRODUIT

## Ce que les tests verts établissent

Les tests Python exercent des effets réels : fichiers, backups relus, conflits, symlinks, mtimes, locks, sorties CLI et commits dans fixtures. Les tests SQLite vérifient migrations, états, priorités, reprise, noms de projets et persistance. Les tests runner lancent des exécutables synthétiques : ils valident arguments, filtrage d’environnement, sortie malformée, timeout et code d’erreur. Les tests de parser imposent les règles de verdict à un JSON fourni. Les mutations montrent une sensibilité à trois régressions choisies.

Les validations shell/manifeste sont surtout structurelles. Le smoke Supervisor **simule** compilation et CLI. Les tests `acceptance.test.ts` de recherche injectent un CHALLENGE connu ; celui d’autorisation injecte une finding déjà identifiée puis teste sa conversion ; les cas UI choisissent le verdict selon `html.includes('ui-severe')`. Ils sont utiles pour la circulation des résultats, **pas pour prouver que Codex trouve le défaut ou qu’un navigateur a été utilisé**. Le test d’injection vérifie du texte du prompt et un helper, sans modèle hostile ou agent réel.

Les tests existants n’ont pas couvert les variantes d’alias ordinaires du hook, la preuve arrivée après capture du prompt, l’invalidation d’un candidat, l’historique au-delà de 500 audits ni la fermeture précoce de stdin. Leurs succès sont compatibles avec les défauts reproduits. Les 13 échecs HTTP de cet environnement n’ajoutent aucune preuve de défaut du serveur.

La première fixture de limite de sortie a échoué sur un chemin timeout différent de celui recherché ; une borne augmentée n’a pas reproduit le défaut non plus. Une exécution directe a servi au diagnostic. Ces résultats sont conservés comme essais non concluants, pas comme succès ou bug nouveau. Un autre scénario de CLI incomplète a révélé l’EPIPE, reproduit deux fois, avec un témoin positif qui consomme stdin. Cette distinction évite de tirer une conclusion générale d’une seule erreur de fixture.

## Réponses explicites aux dix questions

1. **Qu’est-ce qui fonctionne réellement bien ?** L’adoption des mémoires, les sauvegardes/préflights, le journal d’événements déclaratif, plusieurs helpers de permissions, le parseur, la persistance des demandes humaines et le rendu normal du Control Center. Les preuves citées correspondent à des effets exécutés.
2. **Qu’est-ce qui est fragile ou insuffisamment vérifié ?** La validité temporelle des gates, la transmission concurrente des preuves, les limites lexicales du hook, les erreurs de processus et l’alignement documentaire. Toute la qualité de construction des modèles reste à mesurer.
3. **Qu’est-ce qui donne une impression de contrôle sans garantie réelle ?** Un PASS non lié au candidat, un checkpoint QA sans artefact vérifié, une preuve stockée mais non consommée, le label read-only étendu implicitement au MCP et une liste live interprétée comme autorisation.
4. **Quelles parties ont le plus de valeur étayée ?** Les primitives locales de continuité et de récupération, les critères explicites, la séparation revue/QA, puis le stockage/format commun des audits. La valeur de leurs recommandations cognitives reste distincte du bon fonctionnement de leur transport.
5. **Que simplifier, fusionner ou supprimer ?** Les règles opératoires dupliquées, le réglage strict sans comportement distinct, l’application des phases non pertinentes sur de petites tâches. Ne pas fusionner automatiquement reviewer et QA ; mesurer d’abord le rendement des audits répétés.
6. **Pour quelles tâches est-il adapté ou contre-productif ?** Adapté comme cadre à des projets de plusieurs sessions, avec plusieurs dépendances/décisions et un propriétaire qui sait vérifier les résultats. Pour une correction de quelques lignes, dérouler toutes les phases pourrait coûter plus que le gain ; c’est une hypothèse à tester, et le contrat récent autorise déjà un parcours proportionné. Pas adapté comme permission de modifier une application live inconnue sans validation du périmètre réel.
7. **Quel niveau d’autonomie est démontré ?** Automatisation de primitives locales, traitement de résultats d’audit simulés et reprise d’état. Pas la résolution autonome de bout en bout d’un objectif logiciel, ni le respect effectif des gates par des modèles. Une gate humaine prévue n’est pas un défaut d’autonomie.
8. **Quelle dépendance envers le propriétaire subsiste ?** Cibles live, comptes et MCP disponibles, configuration de modèles, conventions serveur, choix de stack/design, lecture critique des preuves et diagnostic de pannes. Le kit enregistre certaines de ces connaissances mais ne les découvre ni ne les vérifie systématiquement.
9. **Que manque-t-il avant de le confier à un autre développeur ?** Un guide d’entrée cohérent, un environnement auditeur connu, des diagnostics de dégradation exacts, les défauts prioritaires corrigés et un parcours applicatif reproductible. Les profils personnels doivent être explicités, pas supprimés comme s’ils étaient de mauvaises pratiques universelles.
10. **Est-ce que je l’utiliserais pour livrer un vrai projet ?** Oui, comme cadre assisté sur un checkout et des données isolés, avec tests indépendants, candidat identifié, lecture des résultats et autorisation explicite de toute exposition. Je conserverais une décision humaine sur les risques importants et ne prendrais aucun PASS historique pour permission de livrer. La livraison elle-même n’a pas été démontrée dans cet audit.

## Risques hypothétiques et inconnues séparés des problèmes confirmés

HYP-01 : surcharge de prompts/agents supérieure au bénéfice sur tâches courtes — plausible, aucune mesure comparative. HYP-02 : contamination sémantique via mémoire utilisateur ou documentation hostile — plausible, aucun modèle exposé. HYP-03 : effets distants par MCP/navigateur malgré read-only shell — frontière non couverte techniquement par le seul runner, mais aucune action distante exécutée ni capacité authentifiée exploitable démontrée ici.

Une note globale ou une moyenne de fiabilité serait trompeuse : le parcours essentiel de construction/livraison n’a pas été testé. Les résultats quantifiés fournis sont des observations locales, pas des notes de produit.

# I. FICHES DES CONSTATS CONFIRMÉS

Les lignes ci-dessous se rapportent aux fichiers du snapshot audité, dont les empreintes sont conservées. Les chemins désignent les copies isolées ; les liens donnent accès aux preuves. Une preuve « par inspection » reste distinguée d’une reproduction. Les symptômes d’une même cause sont réunis ; les qualifications de mock et les limites d’exploitation restent attachées à chaque constat.

## SUP-01 — Un PASS n’est pas lié au contenu du candidat validé

**Gravité : élevée — OBSERVÉ — confiance : élevé.**

Fichiers : `supervisor/src/db.ts:975-1017`, `supervisor/src/codex/runner.ts:28-40`, `supervisor/src/hooks/normalize.ts:210-220`.

**Préconditions :** 1. Un audit code PASS existe pour un projet.

**Reproduction :** 1. Exécuter fixtures/supervisor/characterize.mjs, scénario stale_pass_after_code_change. 2. Créer app.js, enregistrer PASS, changer ses octets, consulter gate(code).

**Attendu :** Le changement de candidat invalide le PASS précédent.

**Observé :** PASS avant et après modification; même audit_id; aucun audit reviewer_meta ou QA n’est nécessaire dans ce scénario.

**Impact :** Le code ensuite intégré ou livré peut différer de celui évalué sans invalidation technique. Aucun déploiement réel réalisé.

**Recommandation minimale :** Lier audit/gate à une empreinte du candidat incluant les changements pertinents; vérifier avant/après audit et au point de progression. Définir les preuves requises par phase.

**Test de correction :** PASS pour A; fichier suivi/non suivi modifié vers B: gate PENDING/STALE; seul un audit B peut valider B.

**Preuves :** [supervisor-characterization.log](evidence/supervisor-characterization.log).


## SUP-02 — Une preuve reviewer arrivée pendant un audit est stockée sans être évaluée

**Gravité : élevée — OBSERVÉ — confiance : élevé.**

Fichiers : `supervisor/src/audits/dispatcher.ts:67-86`, `supervisor/src/db.ts:508-521`, `supervisor/src/queue.ts:70-83`.

**Préconditions :** 1. Audit code running avec prompt déjà construit; reviewer termine pendant son exécution.

**Reproduction :** 1. Exécuter fixtures/supervisor/characterize.mjs, reviewer_evidence_coalesced_after_start. 2. Suspendre le runner JS après capture du prompt; ingérer LATE_REVIEW_BLOCK; libérer le runner retournant un PASS simulé.

**Attendu :** La nouvelle preuve doit être évaluée avant validation du jalon.

**Observé :** Même audit_id; marqueur dans context_json, absent du prompt reçu; un seul audit et gate PASS.

**Impact :** La présence d’une preuve dans l’historique ne signifie pas qu’elle a été soumise à l’auditeur. Risque de validation malgré un défaut reviewer tardif.

**Recommandation minimale :** Coalescer seulement pending; pour running programmer un suivi identifié ou invalider puis relancer avec les nouvelles preuves.

**Test de correction :** Pendant runner suspendu, injecter FAIL reviewer/QA: gate non PASS avant un audit ayant réellement reçu le marqueur.

**Preuves :** [supervisor-characterization.log](evidence/supervisor-characterization.log).


## SUP-03 — La limite d’historique masque un BLOCK encore non résolu

**Gravité : moyenne — OBSERVÉ — confiance : élevé.**

Fichiers : `supervisor/src/db.ts:691-698`, `supervisor/src/db.ts:995-1017`, `supervisor/src/db.ts:1028-1052`.

**Préconditions :** 1. BLOCK visual_ux_audit suivi de nombreux QA PASS sans réévaluation visuelle.

**Reproduction :** 1. Exécuter fixtures/supervisor/characterize.mjs, stop_gate_history_250 et phase_gate_history_500.

**Attendu :** Le dernier verdict applicable de chaque type subsiste indépendamment du volume d’autres audits.

**Observé :** À 250 QA ultérieurs, stopGate=PASS; à 500, gate(code)=PASS. Le BLOCK existe toujours dans SQLite.

**Impact :** Sur projet durable, l’accumulation suffit à effacer le blocage des décisions sans corriger son motif.

**Recommandation minimale :** Sélectionner le dernier audit par type par SQL; réserver la pagination aux vues d’historique.

**Test de correction :** Au-delà de 500 lignes, maintenir BLOCK jusqu’à nouvelle évaluation du même type.

**Preuves :** [supervisor-characterization.log](evidence/supervisor-characterization.log).


## SUP-04 — SQLite conserve les sorties Codex sans expurger les secrets reconnaissables

**Gravité : moyenne — OBSERVÉ — confiance : élevé.**

Fichiers : `supervisor/src/db.ts:664-683`, `supervisor/src/db.ts:601-625`, `supervisor/src/queue.ts:73-80`, `supervisor/src/queue.ts:98-105`.

**Préconditions :** 1. Une sortie CLI contient accidentellement un secret reconnaissable; test limité à une sentinelle synthétique.

**Reproduction :** 1. Exécuter fixtures/supervisor/characterize.mjs, raw_codex_output_persisted. 2. Écrire stdout/stderr via recordCodexRun puis rouvrir SQLite en lecture seule.

**Attendu :** La politique d’expurgation s’applique avant persistance.

**Observé :** Les deux colonnes conservent la sentinelle; slice(-8000) borne la taille mais ne filtre pas. Les résultats structurés sont également stockés bruts par inspection.

**Impact :** La DB et ses sauvegardes peuvent retenir des secrets accidentels. Répertoire privé prévu; aucune fuite réelle, aucun secret réel lu.

**Recommandation minimale :** Expurger à la frontière DB les sorties, erreurs et résultats structurés; supprimer les sorties brutes inutiles.

**Test de correction :** Sentinelles dans succès/erreur/résultat: absentes des colonnes DB, rapports et logs après réouverture.

**Preuves :** [supervisor-characterization.log](evidence/supervisor-characterization.log).


## SUP-05 — Le hook Stop n’impose plus le blocage lorsque la gate est ERROR

**Gravité : élevée — OBSERVÉ — confiance : élevé.**

Fichiers : `supervisor/src/hooks/forwarder.ts:31-45`, `supervisor/src/db.ts:1012-1013`, `global/CLAUDE.md:84-89`.

**Préconditions :** 1. Audit indispensable en erreur; consommation par forwardHook au moment Stop.

**Reproduction :** 1. Exécuter fixtures/supervisor/characterize.mjs, mock_forwarder_gate et mock_forwarder_transport_failure. 2. Injecter les réponses fetch ERROR puis BLOCK dans le vrai forwardHook.

**Attendu :** L’erreur d’un audit requis conserve un refus de progression de sa phase. La télémétrie facultative peut rester non bloquante.

**Observé :** BLOCK/PENDING/CHALLENGE/HUMAN_REQUIRED: decision:block. ERROR: systemMessage seul. Transport échoué: null. Aucun ERROR transformé en PASS dans SQLite.

**Impact :** La barrière Stop s’efface précisément en mode dégradé; respecter l’obligation repose sur les instructions du modèle. Le comportement réel d’une session Claude reste NON TESTÉ.

**Recommandation minimale :** Séparer transport optionnel et validation requise; faire consommer ERROR/exit50 au point réel de progression, sans bloquer les tâches indépendantes.

**Test de correction :** Échec audit requis: progression concernée refusée; erreur conservée; travail indépendant possible.

**Preuves :** [supervisor-characterization.log](evidence/supervisor-characterization.log).


## SUP-06 — Le dépassement de sortie ne garantit pas l’arrêt borné du sous-processus

**Gravité : moyenne — ÉTABLI PAR INSPECTION — confiance : élevé sur le chemin de code; effet dynamique non confirmé.**

Fichiers : `supervisor/src/codex/runner.ts:101-117`, `supervisor/src/codex/runner.ts:127-131`.

**Préconditions :** 1. L’enfant dépasse la limite de sortie et ignore SIGTERM.

**Reproduction :** 1. Inspecter append puis finishReject. 2. Fixture bounded-process.mjs tentée avec enfant auto-terminé; les deux essais ont reçu CODEX_TIMEOUT et non CODEX_OUTPUT_LIMIT.

**Attendu :** Toute limite de ressources mène à un arrêt borné et ferme les flux.

**Observé :** Inspection: chemin output-limit envoie TERM, annule le timeout, sans KILL différé; les handlers continuent d’accumuler. Reproduction dynamique NON OBTENUE; aucun succès revendiqué pour ces essais.

**Impact :** Un enfant peut poursuivre son activité après rejet; chevauchement avec retries plausible. La survie effective n’a pas été confirmée dans cet environnement.

**Recommandation minimale :** Centraliser l’arrêt TERM puis KILL borné, attendre close et arrêter/capper la capture de flux.

**Test de correction :** Fixture ignorante de TERM: après output-limit, enfant arrêté dans la borne et aucune croissance des buffers.

**Preuves :** [supervisor-process-bound.log](evidence/supervisor-process-bound.log), [supervisor-process-bound-relaxed.log](evidence/supervisor-process-bound-relaxed.log), [bounded-process.mjs](fixtures/supervisor/bounded-process.mjs).


## SUP-07 — La déduplication ne couvre pas deux livraisons identiques d’un hook researcher

**Gravité : moyenne — OBSERVÉ — confiance : élevé.**

Fichiers : `supervisor/src/hooks/normalize.ts:209-220`, `supervisor/src/audits/dispatcher.ts:19-21`, `supervisor/src/db.ts:524-528`.

**Préconditions :** 1. Même SubagentStop researcher livré deux fois pour même session/projet/agent.

**Reproduction :** 1. Exécuter fixtures/supervisor/characterize.mjs, duplicate_raw_hook.

**Attendu :** Une retransmission du même jalon est idempotente.

**Observé :** Deux normalisations du même payload créent deux UUID, deux événements et deux audits.

**Impact :** Audits, coûts et demandes humaines peuvent être répétés. La déduplication DB des mêmes IDs fonctionne, mais pas cette frontière d’entrée.

**Recommandation minimale :** Clé idempotente de jalon/source lorsque session+agent+type représentent une occurrence; distinguer vrais nouveaux événements.

**Test de correction :** Deux livraisons même jalon: un audit; deux sessions/agents différents: deux audits.

**Preuves :** [supervisor-characterization.log](evidence/supervisor-characterization.log).


## SUP-08 — Une fermeture précoce du stdin enfant peut terminer le processus appelant sur EPIPE

**Gravité : moyenne — OBSERVÉ — confiance : élevé.**

Fichiers : `supervisor/src/codex/runner.ts:116-125`, `supervisor/src/queue.ts:70-105`.

**Préconditions :** 1. L’exécutable enfant sort avant d’accepter le prompt sur stdin.

**Reproduction :** 1. Exécuter fixtures/supervisor/incomplete-output.mjs avec le runner réel et un faux CLI shell qui fait uniquement exit 0. 2. Deux essais indépendants; comparer à incomplete-output-consumed.mjs où le faux CLI consomme stdin avant de sortir.

**Attendu :** Retour d’erreur structuré sans exception non interceptée du processus parent.

**Observé :** Deux sorties code1 avec Unhandled error event, write EPIPE sur child.stdin.end. Le catch autour de runner.run n’intercepte pas cet événement. Si stdin est consommé, retour attendu CODEX_NO_OUTPUT, sans PASS.

**Impact :** Une CLI qui sort tôt peut faire tomber le processus hébergeant le runner; indisponibilité temporaire du Supervisor plausible malgré reprise externe. Le daemon PM2 réel n’a pas été lancé.

**Recommandation minimale :** Installer un gestionnaire d’erreur stdin avant end, normaliser le rejet et finaliser le processus une seule fois.

**Test de correction :** Enfant exit0/exitnonzero avant lecture du prompt: runner rejette proprement, processus parent reste vivant; ensuite un audit normal fonctionne.

**Preuves :** [incomplete-codex-output.log](evidence/incomplete-codex-output.log), [runner-early-exit-repeat.log](evidence/runner-early-exit-repeat.log), [incomplete-output-consumed.log](evidence/incomplete-output-consumed.log).


## PERM-01 — Les symlinks évitent les décisions de protection des outils de fichiers

**Gravité : moyenne — OBSERVÉ — confiance : élevé.**

Fichiers : `global/hooks/agent-guard.sh:54-81`, `global/hooks/agent-guard.sh:176-221`, `global/hooks/agent-guard.sh:122-147`.

**Préconditions :** 1. Projet demo avec alias vers live-app enregistré, règles .claude synthétiques et faux .env.

**Reproduction :** 1. Exécuter fixtures/guards/characterize.py; comparer file-live/symlink-live, file-rules/symlink-rules, file-env/symlink-env.

**Attendu :** Une même destination physique conserve ask ou deny.

**Observé :** live direct ask / alias NO_OPINION; règles directes deny / alias NO_OPINION; faux .env direct ask / alias NO_OPINION.

**Impact :** Perte des décisions déterministes sur des destinations sensibles. NO_OPINION n’est pas ALLOW; permissions natives et classifier Claude NON TESTÉS.

**Recommandation minimale :** Résoudre la destination physique et les ancêtres existants; appliquer les contrôles sensibles/production/périmètre au chemin réel. Ne pas présenter ceci comme une sandbox.

**Test de correction :** Paires chemin/alias avec fichier nouveau sous répertoire lié: décision sensible conservée.

**Preuves :** [guard-characterization.log](evidence/guard-characterization.log).


## PERM-02 — Le filtre lexical manque des formes shell ordinaires et des mutations live

**Gravité : moyenne — OBSERVÉ — confiance : élevé.**

Fichiers : `global/hooks/agent-guard.sh:42-46`, `global/hooks/agent-guard.sh:98-118`, `global/hooks/agent-guard.sh:130-174`, `global/hooks/agent-guard.sh:229-275`.

**Préconditions :** 1. Payloads Bash synthétiques; aucune commande du payload exécutée.

**Reproduction :** 1. Exécuter fixtures/guards/characterize.py. 2. Comparer rm /etc/... et rm "/etc/..."; git push et git -C ... push; cat .env et /bin/cat .env; pm2 restart live-app depuis live et demo.

**Attendu :** Les variantes équivalentes d’une action protégée conservent la protection annoncée.

**Observé :** Refus directs; NO_OPINION pour plusieurs variantes citées, redirections sur live/règles, cp dans live, wrapper release.

**Impact :** La couche du hook est plus étroite que les promesses. Les autres permissions peuvent encore bloquer; aucune exécution non autorisée Claude démontrée.

**Recommandation minimale :** Réduire les promesses; utiliser une restriction de processus/périmètre réelle pour les frontières indispensables. Pour le filtre conservé, analyser les syntaxes supportées et escalader les ambiguïtés.

**Test de correction :** Régressions sur paires équivalentes et vrais essais natifs inoffensifs isolés pour connaître la décision finale.

**Preuves :** [guard-characterization.log](evidence/guard-characterization.log).


## PERM-03 — Sans jq le garde-fou s’efface sans diagnostic

**Gravité : moyenne — OBSERVÉ — confiance : élevé.**

Fichiers : `global/hooks/agent-guard.sh:382-395`.

**Préconditions :** 1. Hook lancé explicitement via /bin/bash; PATH synthétique sans jq.

**Reproduction :** 1. Exécuter fixtures/guards/missing-jq.py, même payload builder git push avec et sans jq.

**Attendu :** Dépendance indispensable indisponible: refus conservateur ou erreur explicite reconnue du runtime.

**Observé :** Avec jq deny; sans jq code0, stdout/stderr vides.

**Impact :** Restrictions spécifiques du hook disparues en mode dégradé; autres couches non évaluées.

**Recommandation minimale :** Échouer explicitement pour la couche permission; réserver le mode ouvert à la télémétrie optionnelle.

**Test de correction :** Sans jq, décision conservatrice et diagnostic non sensible; même action directe reste protégée.

**Preuves :** [guard-missing-jq.log](evidence/guard-missing-jq.log).


## WF-01 — agentic log follows individual event symlinks outside the project

**Gravité : moyenne — OBSERVÉ — confiance : high.**

Fichiers : `scripts/agentic.py:445-447`, `scripts/agentic.py:77-82`.

**Préconditions :** 1. An initialized local Git project contains .agentic/events 2. An attacker or imported repository content can place an event filename ending .json pointing to a readable file outside that project 3. The user or an agent invokes agentic log with OS-level read access to the target

**Reproduction :** 1. Run the supplied characterize_workflow.py fixture with the source snapshot and evidence directory 2. The fixture creates a synthetic sibling file outside project B containing SYNTHETIC_ONLY_FAKE_SECRET_CANARY_782 3. It symlinks project-b/.agentic/events/99999999-external.json to that synthetic file 4. It invokes python3 scripts/agentic.py log --project project-b

**Attendu :** Reject or skip event entries whose actual target leaves the project; do not disclose the canary

**Observé :** Exit code 0; stdout contains the synthetic external file content and canary. The parent directory is validated but individual glob entries are read without ensure_local

**Impact :** A log inspection can disclose arbitrary OS-readable local file content to terminal, tool output or model context through an untrusted event symlink. No privilege escalation or real-secret disclosure demonstrated

**Recommandation minimale :** Validate every event path before reading; reject symlinks or resolve each entry beneath the canonical project, preferably open without following symlinks where required. Preserve normal event reading

**Test de correction :** Repeat the fixture: the event alias must be rejected/skipped and stdout must not contain the canary; ordinary event JSON must remain readable. Add the regression to scripts/test_agentic.py

**Preuves :** [characterization-results.json scenario log-follows-external-event-symlink](evidence/workflow/characterization-results.json), [characterize_workflow.py](fixtures/workflow/characterize_workflow.py).


## WF-02 — Public workflow guidance contradicts the current merge and production authorization contract

**Gravité : moyenne — ÉTABLI PAR INSPECTION — confiance : high.**

Fichiers : `README.md:202-277`, `docs/PROJECT_WORKFLOW_GUIDE.md:212-307`, `global/CLAUDE.md:28-163`, `global/skills/delivery-pipeline/SKILL.md:6-105`.

**Préconditions :** 1. A maintainer or another developer uses README or PROJECT_WORKFLOW_GUIDE to decide workflow permissions 2. The project has not separately authorized local main integration, or its actual production status differs from the manually declared list

**Reproduction :** 1. Read README's Git & branches section: after reviewer+qa PASS it directs local merge and calls that autonomous for projects not yet live 2. Read README lines 202–205: unlisted projects are described as sandboxed by the judge and deployed without asking 3. Compare global/CLAUDE.md and the current pipeline: merge requires the authorized workflow; absence from production list does not establish authorization or absence of real users/data 4. Compare the old existing-feature guide's complete pipeline instruction with the current relevant-phases-only maintenance contract

**Attendu :** The public operating guide and current runtime contract state the same permission rule and proportional maintenance workflow

**Observé :** Conflicting instructions coexist; the newer runtime contract is safer, but readers of the introductory docs are told broader automatic behavior

**Impact :** Incorrect expectation about safe default integration, live-project declarations and necessary gates; additional owner interpretation is needed during adoption. This is a documentation/contract drift, not proof that a runtime actually merged or deployed without consent

**Recommandation minimale :** Align README and PROJECT_WORKFLOW_GUIDE with the canonical authorized-mission contract; document the production registry as a guard input, never authorization; link a single canonical rule instead of duplicating variants

**Test de correction :** Review the concrete examples for maintenance without merge authorization, unlisted live target and previously approved exact action; all public and runtime documents should yield the same prescribed action. Keep actual model behavior marked untested until an isolated scenario verifies it

**Preuves :** [workflow.md section Points contradictoires et contre-preuves](contributions/workflow.md).


## BR-01 — The control UI converts a schema-invalid HTTP 200 response into a healthy empty state

**Gravité : moyenne — OBSERVÉ — confiance : high for the client behavior; production occurrence not established.**

Fichiers : `supervisor/ui/static/control.js:175-197`, `supervisor/ui/static/control.js:358-369`.

**Préconditions :** 1. Control UI loads the audited static assets. 2. Its summary endpoint returns HTTP 200 application/json with {}. 3. Browser polling fallback is active in the observed fixture.

**Reproduction :** 1. Run fixtures/browser/qa/run-control-browser.js using Playwright MCP browser_run_code_unsafe code argument. 2. Inspect scenario malformed-1440. 3. Compare evidence/browser/malformed-1440.png and evidence/browser/results.json.

**Attendu :** An incomplete snapshot is reported as unavailable or invalid, without inventing a healthy database or absence of projects.

**Observé :** The page displays 'En direct', 'v— · base ok', '0 projet actif, 0 intervention attendue.', shows the empty welcome state and hides the error.

**Impact :** A malformed/contract-incompatible response can reassure the operator that there are no interventions. This observation concerns UI presentation only: it is not a Supervisor audit verdict PASS and does not establish a gate bypass.

**Recommandation minimale :** Validate the snapshot envelope and required daemon status/collection fields before applying defensive display defaults; route failures through the existing error state.

**Test de correction :** Return HTTP 200 {} and assert the error is visible, database health is unknown, the empty-project success state is not shown, and a later valid snapshot recovers.

**Preuves :** [results.json](evidence/browser/results.json), [malformed-1440.png](evidence/browser/malformed-1440.png).

**Limite :** Response shape was fault-injected by a mock route. No evidence that the current real server emits this response.

---

« Mon avis honnête : à ce stade, agentic-kit est un cadre personnel de livraison assistée, utile pour la continuité et la contrelecture, mais dont les validations ne garantissent pas encore le candidat livré.
Je lui confierais la préparation et la vérification supervisée d’un projet isolé, mais pas encore une livraison autonome fondée sur ses seuls PASS.
La prochaine amélioration la plus rentable serait de rendre les gates indissociables du candidat et des preuves réellement consommées,
parce que cela corrigerait le décalage central entre contrôle affiché et validation effective, avant d’ajouter de la complexité. »
