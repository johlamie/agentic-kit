# Revue technique indépendante — Agentic Delivery Kit

Date : 6 septembre 2026. Revue statique, fondée sur la lecture du dépôt et le raisonnement, sans exécution du kit, de tests ni d’intégrations.

Ce document reprend la revue présentée dans la conversation. Elle porte sur les fichiers présents dans le checkout au moment de la lecture, dont certaines modifications locales préexistantes ; ces modifications de code et de configuration ne font pas partie du commit de ce compte rendu. L’historique consulté allait jusqu’au commit `ef382b3`.

## 1. Mon avis global

Je conserverais ce kit. Il contient une méthode de livraison pertinente pour piloter plusieurs projets, avec une vraie attention au produit, au design et à la reprise du travail.
Sa principale force est de demander des livrables vérifiables et des regards distincts, plutôt que de considérer le code produit comme un résultat suffisant.
Sa principale faiblesse est le raccordement entre **travail réalisé, preuves disponibles et autorisation de passer à la suite**.
Le Supervisor possède une infrastructure sérieuse, mais ses gates ne vérifient pas assez précisément quel livrable et quelle version ils valident.
Pour ton usage, je privilégierais des parcours plus courts et des contrôles mieux rattachés aux changements.
Je n’ajouterais aucun agent avant de corriger ces points et de rendre la validation du design plus concrète.

## 2. Ce que le kit fait bien

Les points suivants sont des **constats de lecture**, pas des garanties de fonctionnement.

- **Le cadrage produit a une utilité réelle.** Le PM demande un parcours principal, des exclusions, des critères d’acceptation et des hypothèses explicites. La recherche doit ensuite produire des conséquences utiles pour l’architecte et le designer. Cette articulation réduit conceptuellement les constructions fondées sur un brief flou. Je la conserverais. [PM](global/agents/product-manager.md?plain=1#L19), [researcher](global/agents/researcher.md?plain=1#L16).
- **Les rôles principaux sont complémentaires.** L’architecte choisit et découpe ; le designer décrit les écrans et leurs états ; le builder implémente ; le reviewer examine le code ; la QA vérifie les parcours. Le Supervisor peut remettre en cause leurs conclusions. Le problème n’est donc pas l’existence de huit spécialités, mais leur invocation systématique et la transmission de leurs preuves. [Architecte](global/agents/architect.md?plain=1#L14), [reviewer](global/agents/reviewer.md?plain=1#L16), [QA](global/agents/qa.md?plain=1#L15).
- **La qualité dépasse le happy path.** États vides, chargement, erreurs, accès sans authentification, doubles soumissions, responsive et réseau lent sont explicitement demandés. C’est particulièrement pertinent pour ton objectif d’obtenir un résultat réellement essayable. [Designer](global/agents/designer.md?plain=1#L33), [QA](global/agents/qa.md?plain=1#L17).
- **La mémoire commune Claude/Codex est une bonne décision.** Un emplacement canonique, des liens de compatibilité et un propriétaire de la mémoire partagée évitent deux historiques concurrents. L’initialisation prévoit des vérifications préalables, des sauvegardes contrôlées et la préservation des instructions existantes. Cette partie est bien conçue et je la conserverais. [Contrat partagé](shared/SESSION_CONTRACT.md?plain=1#L14), [initialisation et sauvegardes](scripts/agentic.py#L137).
- **Le socle technique du Supervisor reste raisonnable.** Un processus Node, SQLite, une file persistante et peu de dépendances : pas besoin de Redis, de services distribués ou d’un framework d’orchestration supplémentaire. Les transactions de prise en charge, reprises après interruption et tentatives bornées apportent une valeur concrète. [Base et reprise](supervisor/src/db.ts#L558), [dépendances](supervisor/package.json#L20).
- **Le Supervisor ne s’accorde pas le droit de livrer.** Son contrat interdit déploiement et modification applicative ; le runner demande une sandbox en lecture seule ; le parseur impose certains verdicts à partir des résultats structurés. La distinction entre qualité technique et décision humaine est saine. [Contrat d’audit](supervisor/prompts/SYSTEM.md?plain=1#L8), [runner](supervisor/src/codex/runner.ts#L24), [parseur](supervisor/src/codex/parser.ts#L40).
- **Le centre de contrôle peut t’aider sur plusieurs projets.** Il utilise le daemon existant, avec des lectures bornées et des abonnements liés aux navigateurs ouverts. Telegram est réservé principalement aux interventions humaines. Je garderais cette observation légère, sans lui ajouter maintenant des commandes distantes. [Vue globale](supervisor/src/activity.ts#L322), [notifications](supervisor/src/queue.ts#L85).

Voici comment les principales promesses résistent à la lecture :

| Promesse | Mécanisme présent | Cohérence théorique | Limite actuelle |
|---|---|---|---|
| Une idée devient un résultat essayable | SPEC, architecture, design, slices, QA, démonstration | Bonne chaîne de livrables | La fin du parcours est fortement assimilée à une livraison publique |
| Une bonne UI/UX | Références, tokens, états, QA et audit visuel | Plusieurs regards utiles | G3 peut porter sur des descriptions et des wireframes ASCII |
| Une contre-expertise indépendante | Exécution Codex séparée, prompts adversariaux, schéma de verdict | Réelle séparation du rôle de construction | Preuves parfois mal regroupées ; diversité de modèle non garantie pour un projet construit par Codex |
| Une reprise fiable | Mémoire commune, checkpoints, état Git observé | Solide base de continuité | Fraîcheur des décisions et des audits encore largement interprétée par le modèle |
| Seulement quatre interventions | G1–G4 et conservation des autorisations | Quatre catégories de décisions pertinentes | Permissions, authentifications et incidents ajoutent nécessairement des interventions |
| Un suivi multi-projets | SQLite, centre de contrôle, alertes | Adapté à un pilote unique | Le cycle de vie automatique reste principalement celui de Claude |

## 3. Ce qui devrait être amélioré

J’utilise les catégories demandées : **CONSTAT DE LECTURE**, **RISQUE DE CONCEPTION**, **PRÉFÉRENCE**, **INCONNU**.

Pour les recommandations : **A** = utile à ton usage actuel ; **B** = surtout utile avec davantage de projets ; **C** = principalement nécessaire pour distribuer le kit.

### 3.1 — Les gates doivent valider une version précise et un ensemble explicite de preuves

**CONSTAT DE LECTURE.** `gate()` sélectionne le dernier audit de chaque type pour un chemin de projet, dans les 500 audits récents. Il ne filtre pas par tranche, session, producteur ou révision du code. Il évalue les audits trouvés sans exiger que tous les contrôles attendus existent. En l’absence d’autres audits concernés, un audit `code` PASS peut donc suffire à faire passer la gate `code`. [Implémentation](supervisor/src/db.ts#L975).

**RISQUE DE CONCEPTION.** Deux situations deviennent possibles :

- le PASS d’une tranche récente masque le BLOCK d’une autre tranche du même type ;
- une nouvelle modification bénéficie encore d’un PASS obtenu sur une ancienne version.

À l’inverse, un ancien audit d’un autre type peut continuer à bloquer un travail sans rapport. Les champs `candidate_id` et `audit_target` existent, mais ne résolvent pas cette sélection.

**Changement recommandé.** Donner à chaque unité vérifiée un identifiant de tâche/tranche, une révision — commit et empreinte des changements non commités si nécessaire — et une liste des contrôles requis. La gate vérifie leur présence, leur périmètre et leur fraîcheur. Un contrôle non applicable doit être explicitement déclaré comme tel.

Même principe pour G1–G4 : conserver la référence du livrable ou de l’action approuvée, sans transformer cette trace en nouvelle permission.

**Bénéfice :** un PASS devient une information exploitable pour décider.

**Compromis :** quelques champs supplémentaires et des cas de tests ciblés sur les transitions.

**A — maintenant — effort moyen.**

### 3.2 — Le regroupement des preuves peut perdre leur sens pendant un audit

**CONSTAT DE LECTURE.** L’audit de code est planifié dès la fin du builder. Les preuves reviewer/QA sont ensuite attachées au dernier audit de code actif de la session, sans correspondance explicite avec la tranche. Le regroupement accepte aussi les audits déjà `running`. Or le processus Codex reçoit un prompt construit une seule fois à partir de l’objet d’audit récupéré par la queue. [Dispatcher](supervisor/src/audits/dispatcher.ts#L27), [regroupement](supervisor/src/db.ts#L504), [exécution](supervisor/src/queue.ts#L65).

**RISQUE DE CONCEPTION.** Une preuve peut apparaître dans le contexte enregistré après le départ de l’audit, sans avoir été vue par l’auditeur. Avec plusieurs builders, elle peut être rattachée à la mauvaise tranche.

Le [test de regroupement](supervisor/tests/dispatcher.test.ts#L77) documente le cas où les preuves arrivent avant la consommation de la queue ; il ne suffit pas à établir le comportement lors de cette course.

**Changement recommandé.** Déclencher l’audit de tranche sur un jalon explicite « preuves prêtes ». Figer son contexte au démarrage. Toute nouvelle preuve pertinente crée une nouvelle révision d’audit. Utiliser le même identifiant de tranche pour builder, reviewer et QA.

Étendre cette logique aux jalons : une fin de devops pendant le provisioning n’est pas nécessairement une préparation de déploiement terminée ; une fin de designer n’indique pas à elle seule si les directions ou le système final sont prêts.

**Bénéfice :** audits mieux placés, moins de doublons et attribution compréhensible.

**Compromis :** l’orchestrateur doit émettre quelques jalons structurés.

**A — maintenant — effort moyen.**

### 3.3 — Le parcours allégé existe dans les intentions, mais pas comme contrat suffisamment clair

**CONSTAT DE LECTURE.** Les pipelines Claude et Codex autorisent maintenant les seules phases pertinentes en maintenance. Pourtant, le guide projet prescrit encore le pipeline complet pour une évolution. Par ailleurs, `light` désactive certains déclenchements, tandis que `gate()` ignore cette politique ; `standard` et `strict` ont le même routage. [Pipeline](global/skills/delivery-pipeline/SKILL.md?plain=1#L6), [guide contradictoire](docs/PROJECT_WORKFLOW_GUIDE.md?plain=1#L296), [niveaux](supervisor/src/audits/dispatcher.ts#L125).

**RISQUE DE CONCEPTION.** Tu peux payer une nouvelle découverte ou une nouvelle justification de stack pour une modification qui n’en a pas besoin. Une phase désactivée peut aussi rester attendue par les instructions.

**Changement recommandé.** Définir trois parcours courts et explicites :

- **nouveau produit** : cadrage, choix structurants, design, construction, vérification ;
- **évolution** : delta de périmètre et contrôles correspondant aux changements ;
- **correctif** : reproduction, correction, non-régression, revue adaptée au risque.

Pour chacun, préciser les livrables et audits nécessaires. Distinguer aussi **« prêt à tester »** de **« livré publiquement »** : ton besoin initial peut être satisfait avant G4.

**Bénéfice :** moins de répétition et une sortie testable plus rapide à examiner.

**Compromis :** il faut décider du parcours au début de la tâche.

**A — maintenant — effort faible à moyen.**

### 3.4 — G3 devrait porter sur une interface visible ; le score UI devrait rester secondaire

**CONSTAT DE LECTURE.** Les deux directions demandées au designer peuvent se limiter à une ambiance décrite, une palette, une typographie et un wireframe ASCII. Le système détaillé arrive après ton choix. Le Supervisor utilise ensuite des seuils numériques, mais le schéma ne fixe ni dimensions obligatoires ni formule d’agrégation ; un score nul reste structurellement autorisé. [Designer](global/agents/designer.md?plain=1#L28), [schéma](supervisor/schemas/audit-result.schema.json#L65), [seuils](supervisor/src/codex/parser.ts#L55).

**RISQUE DE CONCEPTION.** Tu peux approuver une intention que l’interface construite ne traduit pas comme prévu. Puis le système peut consacrer plusieurs cycles à gagner des points sur une notation subjective.

**Changement recommandé.** Avant G3, présenter au moins l’écran principal réellement rendu, avec un état vide ou d’erreur et son comportement mobile. Une seconde direction mérite une représentation comparable seulement si le choix change substantiellement le produit.

Conserver les scores comme aide à la discussion. Les blocages devraient citer un défaut observable : action introuvable, navigation incohérente, formulaire inutilisable au clavier, débordement, erreur sans récupération. Les préférences esthétiques devraient être identifiées comme telles.

**Bénéfice :** tu valides quelque chose que tu peux juger ; les corrections arrivent avant la construction complète.

**Compromis :** un petit travail visuel est avancé dans le calendrier.

**A — maintenant — effort moyen.**

### 3.5 — Le contrôle des cibles réelles est trop dépendant de conventions locales

**CONSTAT DE LECTURE.** Le gardien reconnaît les projets via leur dossier sous `~/projects` et une liste privée alimentée manuellement. Les écritures directes et certains motifs de commandes sont contrôlés, mais ce n’est pas une analyse générale des effets du shell. Les règles Codex reconnaissent explicitement l’absence de ce hook. [Gardien](global/hooks/agent-guard.sh#L121), [motifs shell](global/hooks/agent-guard.sh#L269), [frontières Codex](codex/AGENTS.md?plain=1#L69).

Le runner du Supervisor conserve également `HOME` et éventuellement `CODEX_HOME`, sans sélectionner dans ses arguments une configuration MCP propre aux audits. L’effet réel dépend donc de la configuration externe, que je n’ai pas consultée. [Runner](supervisor/src/codex/runner.ts#L136).

**RISQUE DE CONCEPTION.** Un dossier de développement peut viser une base réelle ; l’ajout futur d’un MCP d’écriture au Codex de développement peut élargir les capacités disponibles à son auditeur. La sandbox shell ne détermine pas les permissions des services distants.

**Changement recommandé.** Matérialiser pour chaque projet un petit inventaire non secret : checkout servi, checkout de développement, environnement de données, cible de déploiement, identifiants de ressources. Rendre sa validation explicite lors du premier ship. Conserver l’approbation humaine pour les changements de cible ou de risque.

Pour le Supervisor, utiliser une configuration d’audit avec une liste explicite d’intégrations autorisées.

**Bénéfice :** moins de décisions fondées sur un nom de dossier ou ta mémoire.

**Compromis :** cet inventaire doit être actualisé lors des changements d’environnement.

**A — maintenant pour les projets déjà exposés — effort moyen.**

### 3.6 — Les sources de vérité et les templates ne suivent pas complètement le nouveau contrat

**CONSTAT DE LECTURE.** Plusieurs divergences sont directement visibles :

- Claude reçoit des fichiers liés au dépôt ; les rôles Codex sont générés ; les contrats projet sont copiés. Leur actualisation suit donc trois mécanismes différents. `kit.json` ne contient que la version de schéma. [Copies](scripts/agentic.py#L195), [génération](scripts/agentic.py#L268).
- Le template `PROJECT_STATE` ne prévoit pas explicitement les autorisations, la révision vérifiée, les preuves ou la cible, alors que les contrats demandent de les conserver. [Template](global/templates/memory/PROJECT_STATE.md?plain=1#L1).
- La QA écrit ses captures dans `qa/evidence`, tandis que les instructions globales demandent `.artifacts/screenshots`. [QA](global/agents/qa.md?plain=1#L27), [règle globale](global/CLAUDE.md?plain=1#L212).
- La configuration globale contient deux répertoires supplémentaires propres à un projet et un modèle imposé, malgré la séparation annoncée des préférences locales. [Configuration](global/settings.json#L168).

**RISQUE DE CONCEPTION.** La reprise dépend du contrat rencontré en premier. La mémoire peut être bien rédigée mais omettre les éléments qui permettent de vérifier qu’elle est encore valable.

**Changement recommandé.** Garder un contrat commun canonique, des adaptations runtime courtes et une empreinte de version dans les copies générées. Compléter le template d’état avec les quelques champs réellement utilisés pour reprendre. Déplacer les exceptions de machine dans la configuration locale.

Conserver la règle existante de remplacement explicite des décisions obsolètes. Ajouter aux connaissances transversales une provenance et une date de revalidation lorsque leur validité peut changer.

**Bénéfice :** moins de contradictions et moins de relecture à chaque reprise.

**Compromis :** une petite migration documentaire ; aucune base de mémoire supplémentaire.

**A — maintenant pour les contradictions ; B — ensuite pour l’archivage — effort moyen.**

### 3.7 — La persistance des audits ne couvre pas encore toute la chaîne d’attention humaine

**CONSTAT DE LECTURE.** Le forwarder abandonne silencieusement un envoi indisponible. Le serveur enregistre l’événement puis déclenche les audits séparément. La reprise traite les audits interrompus, sans parcours visible de rejeu des événements non traités. Les échecs Telegram sont journalisés sans file persistante de réexpédition. [Transport](supervisor/src/hooks/forwarder.ts#L22), [ingestion](supervisor/src/server.ts#L108), [reprise](supervisor/src/db.ts#L558).

Autre point : un nouveau prompt clôt toutes les demandes événementielles de certains types dans la session ; une fin de session les ferme également. Cela ne prouve pas qu’une décision métier a reçu une réponse. [Résolution](supervisor/src/db.ts#L429).

**RISQUE DE CONCEPTION.** Une intervention peut disparaître du suivi, ou une alerte ne jamais arriver. Ce n’est pas une autorisation automatique de déployer, mais cela affaiblit la promesse « je peux laisser travailler et revenir quand on a besoin de moi ».

**Changement recommandé.** D’abord, rattacher la résolution à la demande précise et distinguer réponse, annulation et abandon. Ensuite, fiabiliser les jalons critiques et les notifications avec reprise persistante dans SQLite. Inutile de garantir la livraison de chaque événement d’activité.

**Bénéfice :** moins de blocages silencieux et un tableau d’attention plus fidèle.

**Compromis :** quelques états de livraison supplémentaires et une gestion des doublons.

**A — maintenant pour la résolution ; ensuite pour la livraison persistante — effort moyen.**

### 3.8 — Deux raccordements de livraison méritent une correction locale

**CONSTAT DE LECTURE.**

La phase 0 prescrit `git init`, puis la branche feature avant tout commit initial. La phase 7.5 suppose ensuite l’existence de `main`. Dans un dépôt neuf suivant exactement ce chemin, cette branche n’a pas été matérialisée. [Phase 0](global/skills/delivery-pipeline/SKILL.md?plain=1#L38), [intégration](global/skills/delivery-pipeline/SKILL.md?plain=1#L103).

L’audit final demandé en phase 8 doit vérifier README et GUIDE, alors que leur production est placée en phase 9. [Pipeline](global/skills/delivery-pipeline/SKILL.md?plain=1#L115), [audit final](supervisor/prompts/FINAL_AUDIT.md?plain=1#L3).

**Changement recommandé.** Prévoir un commit d’amorçage avant la création de la branche de travail, avec une exception explicite à la règle générale. Préparer les documents de handoff avant l’audit final, puis remettre leur synthèse après le verdict.

**Bénéfice :** le chemin nominal devient cohérent sans improvisation de l’orchestrateur.

**Compromis :** négligeable ; ce sont des corrections d’ordre et de contrat.

**A — maintenant — effort faible.**

## 4. Ce que je simplifierais

**Le Supervisor est utile, mais trop systématique dans son usage prévu.** Je le conserverais pour challenger une dépendance externe décisive, une architecture, une frontière d’autorisation, une interface importante et une livraison. Je ne lui ferais pas relire automatiquement chaque petite intervention après plusieurs contrôles équivalents.

| Élément | Mon choix | Bénéfice et compromis | Priorité / effort |
|---|---|---|---|
| Lint, typecheck et suite complète relancés par builder puis reviewer | **Fusionner l’exécution déterministe** par révision ; le reviewer examine les résultats et reproduit les points sensibles | Moins de répétition ; exige une provenance fiable des résultats. [Consignes](global/agents/reviewer.md?plain=1#L17) | A — ensuite — moyen |
| Huit rôles sur toute tâche | **Conserver les spécialités, réduire les invocations** | Un petit correctif peut rester dans un contexte de développement avec revue ciblée ; moins de séparation des regards sur les tâches mineures | A — maintenant — faible |
| Builders parallèles dans le même checkout | **Un builder par défaut**, parallélisme explicite | Les fichiers disjoints ne séparent pas index Git, migrations, génération et i18n. Réserver ces ressources à un propriétaire ; vérifier l’ensemble intégré. Coût : moins de parallélisme théorique. [Règles builder](global/agents/builder.md?plain=1#L22) | A — maintenant — faible |
| `standard` et `strict` | **Fusionner tant qu’ils sont équivalents** | Une option en moins à comprendre ; aucune perte démontrée dans le routage actuel | A — maintenant — faible |
| Rétrospective à chaque fin de session et de phase | **Checkpoint court ; rétrospective seulement si apprentissage utile** | Moins de bruit et de suggestions de nouveaux outils ; certaines leçons devront être relevées explicitement. [Rituel](global/CLAUDE.md?plain=1#L176) | A — maintenant — faible |
| Port Kimi | **Différer sa modernisation si tu ne l’utilises pas** | Évite d’entretenir un troisième contrat divergent ; renonce temporairement à sa parité. Il n’est pas relié au Supervisor ni à la mémoire commune Claude/Codex. [Port](kimi/README.md?plain=1#L61) | Selon besoin — faible pour le geler |
| Timeline dans `prototypes/` | **Déplacer sa présentation commune dans le runtime** | Le daemon importe actuellement ses assets et transforme le HTML par remplacements textuels. Ce dossier ne peut donc pas être simplement supprimé. Une source runtime et des données de démonstration séparées rendraient le statut plus clair. [Import réel](supervisor/src/ui/assets.ts#L47) | A — ensuite — faible |

Deux autres choix relèvent surtout de la **PRÉFÉRENCE** :

- Pour un petit outil connu, une décision argumentée suffit ; une matrice chiffrée systématique Supabase/Firebase/SQLite peut ajouter du remplissage.
- Installer Firebase, EAS et les outils de déploiement uniquement si le projet les demande serait plus proportionné que le bootstrap complet. Pour toi, c’est une commodité ; pour une distribution à des tiers, cela devient une vraie question de modularité. [Bootstrap](setup/bootstrap-vps.sh#L6).

Je conserverais les protocoles partagés, mais j’éviterais de recopier leurs checklists dans les prompts, skills et guides. Une source canonique et des instructions d’invocation courtes suffisent.

Avec davantage de projets (**B**), j’ajouterais surtout une politique d’archivage, les versions de référence des outils et un suivi sommaire du coût des audits. Pour distribuer le kit (**C**), je traiterais ensuite les profils utilisateur, les installations partielles et une matrice de compatibilité plus complète. Ce ne sont pas tes premières urgences.

## 5. Mes cinq premières actions à ta place

1. **Corriger le contrat preuve → audit → gate** : même tranche, même révision, contrôles requis explicites, contexte figé au démarrage.
2. **Rendre les trois parcours officiels** : nouveau produit, évolution et correctif ; aligner les guides et réparer les deux raccordements de livraison.
3. **Faire choisir le design sur un écran réellement rendu**, puis concentrer les audits UI sur des problèmes observables.
4. **Identifier les cibles de chaque projet et isoler les capacités du Supervisor**, pour éviter que les conventions de dossiers ou les MCP personnels décident implicitement du périmètre.
5. **Consolider contrat et mémoire** : version des instructions, template de reprise utile, exceptions locales et demandes humaines correctement résolues.

Ces actions prolongent l’existant. Aucune ne nécessite de changer de framework ou de base de données.

## 6. Architecture cible raisonnable

Je garderais un orchestrateur conversationnel, les huit fiches de spécialité disponibles, la mémoire Markdown partagée et le Supervisor Node/SQLite.

J’ajouterais seulement un **contrat de travail court et structuré**, exploité par les composants existants : tâche, parcours choisi, révision, fichiers concernés, preuves, contrôles requis, cible et décisions humaines référencées.

La répartition serait explicite :

| Responsabilité | Qui la porte |
|---|---|
| Comprendre le besoin, choisir une solution, concevoir et critiquer | Le modèle, avec les rôles pertinents |
| Vérifier présence, correspondance, fraîcheur et statut des preuves | Le code |
| Accepter périmètre, coût, direction visuelle et exposition | Toi, lorsque la décision manque |
| Fournir les permissions effectives de fichiers, shell et services | Le runtime et les intégrations |
| Conserver l’objectif et permettre la reprise | Mémoire projet, checkpoints et historique |
| Donner une contre-expertise supplémentaire | Supervisor, selon le risque et le parcours |

Je distinguerais trois états de sortie : **implémenté**, **prêt à tester**, **livré et vérifié sur la cible approuvée**. Cela correspond mieux à ton besoin que d’exiger une URL publique pour tout résultat utile.

Voici le parcours mental des situations demandées, sans aucune simulation exécutée :

| Situation | Lecture du système actuel | Évolution raisonnable |
|---|---|---|
| Petit MVP | Chaîne complète cohérente, mais nombreuses productions avant le premier écran essayable | Brief court, décisions structurantes, écran pilote, parcours principal, démonstration testable |
| Nouvelle fonctionnalité | Réutilisation des décisions autorisée, mais guide encore orienté pipeline complet | Décrire le delta ; ne rouvrir architecture ou design que s’ils changent |
| Correction d’un bug | Les contrôles par slice peuvent entraîner revue, QA large et Supervisor | Reproduction, correction, test de non-régression, revue ciblée ; audit supplémentaire si risque significatif |
| Reprise après plusieurs semaines | Mémoire commune et état Git sont disponibles | Lire un état compact avec versions, cibles, décisions actives et preuves encore valides |
| Builder, reviewer et Supervisor en désaccord | Le Supervisor peut bloquer malgré un PASS, avec réparation et tentatives bornées | Comparer les preuves sur la même révision ; distinguer défaut reproductible et préférence ; te solliciter pour un vrai arbitrage |
| Outil ou service indisponible | Fallback prévu pour Mobbin ; erreur explicite pour le navigateur ; transport Supervisor ouvert en cas de panne | Continuer les travaux indépendants, conserver le contrôle requis non validé, afficher le problème et reprendre le jalon critique |

Par rapport à **un agent de développement, de bonnes instructions et quelques scripts**, le kit apporte surtout une spécialisation du cadrage et du design, une contradiction séparée, une continuité entre outils et une observation multi-projets.

Ce supplément de complexité se justifie sur les nouveaux produits et les changements importants. Sur une petite maintenance, les passages entre agents et les audits successifs peuvent coûter davantage de contexte et d’attention que le problème lui-même. Le kit devrait donc savoir revenir naturellement à ce parcours simple.

## 7. Limites de cette revue

J’ai examiné :

- les instructions globales Claude/Codex, les huit rôles, les workflows et les templates de mémoire ;
- le lanceur Python, l’initialisation, la migration, les checkpoints et la génération des rôles ;
- les hooks, contrôles de portée et scripts principaux d’installation/MCP ;
- le cœur du Supervisor : ingestion, normalisation, dispatcher, queue, base, gates, runner, prompts, schéma de résultat, artefacts, demandes humaines et notifications ;
- les raccordements de l’UI, la documentation opérationnelle, la CI et une sélection de tests de comportement ;
- le port Kimi par échantillonnage et l’historique Git récent.

Je n’ai pas lu chaque test, chaque fichier CSS ou l’intégralité de la longue spécification historique. Je n’ai pas inspecté les projets générés, les configurations privées, les mémoires personnelles ou l’infrastructure.

L’ancien [audit du 17 août](CODEX_AUDIT.md?plain=1#L3) a été consulté après l’analyse du fonctionnement actuel. Certains de ses constats sont désormais corrigés dans les fichiers, notamment `permissions.defaultMode` et le branchement du gardien sur les écritures. Je ne reprends pas ses affirmations sur les versions externes comme preuves actuelles.

**INCONNUS :** efficacité réelle des audits LLM, qualité des interfaces produites, taux de faux positifs, coût d’usage et permissions effectivement appliquées par les versions installées. Les tests existants documentent de vrais comportements déterministes, mais plusieurs utilisent un Codex simulé ; ils ne démontrent pas sa capacité réelle à repérer un défaut. [Exemples](supervisor/tests/acceptance.test.ts#L20).

Pendant la revue, aucun test, build, diagnostic, service ou intégration n’a été lancé ; aucun fichier n’a été modifié. La création et la publication du présent compte rendu ont été demandées séparément, après la revue.

À ta place, je conserverais la méthode de livraison, la mémoire partagée et le Supervisor ciblé, je changerais d’abord le lien entre livrable, preuve et verdict et je ne complexifierais pas l’orchestration tant que les parcours simples et les validations de version ne sont pas clairement définies.
