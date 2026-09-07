# Synthèse de l’audit indépendant — 7 septembre 2026

**Agentic-kit fournit des mécanismes utiles de continuité et de contrelecture, mais son gain de qualité, d’efficacité et d’autonomie reste non démontré.** Je l’utiliserais avec un développeur expérimenté qui vérifie les preuves ; je ne prendrais pas ses PASS actuels comme autorisation suffisante de livrer.

L’audit a identifié **14 constats : 12 reproduits et 2 établis par inspection**, dont trois élevés. Les priorités sont un PASS non lié au code courant, les preuves reviewer arrivant pendant un audit qui peuvent ne pas être consommées, et le hook Stop qui ne bloque plus sur ERROR. Des limites de symlinks/commandes, de persistance des sorties et de traitement d’erreurs complètent ces constats.

Les points solides ont également été vérifiés : 34 tests Python réussis, compilation TypeScript réussie, **66 tests Supervisor réussis et 13 bloqués par les sockets locales**, trois mutations détectées et huit cas dans un navigateur réel avec HTTP simulé. Mémoire/sauvegardes, persistance des demandes humaines, plusieurs garde-fous ordinaires et rendu responsive/clavier ont des preuves concrètes.

`npm ci` et le contrôle de vulnérabilités ont été bloqués par DNS. Aucun vrai parcours Claude, comparaison avec/sans kit, accès de compte, Telegram ou déploiement. Le protocole comparatif, un starter et un évaluateur indépendant sont fournis ; le starter volontairement incomplet obtient 6/12, ce qui n’est pas une note du kit.

L’implémentation auditée correspond au commit `06e3974d2c80dc1434ec0e575a40f605484fc58b`, branche `feature/codex-shared-kit`, avec les quatre modifications initiales préservées. Aucun commit n’a été effectué pendant les mesures. L’utilisateur a ensuite autorisé explicitement la publication de ce dossier de rapports par commit et push.

Rapports versionnés dans `docs/audits/2026-09-07/`. Dossier original des mesures : `/tmp/agentic-kit-audit-2026-09-07/`.

- [Rapport complet](AUDIT_REPORT.md)
- [Constats structurés](FINDINGS.json)
- [Commandes et résultats](TEST_RESULTS.md)
- [Protocole comparatif](fixtures/comparison/PROTOCOL.md)
- `evidence/` : journaux, mesures, empreintes et huit captures
- `fixtures/` : scénarios supplémentaires et tests reproductibles

La prochaine amélioration la plus rentable est de lier chaque validation au candidat exact et aux preuves réellement consommées, puis de mesurer l’apport du kit à modèle et tâche identiques.
