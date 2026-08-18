# Compatibility record

Vérifications finales effectuées le 2026-08-18 sur Linux x64 :

| Composant | Version observée | Syntaxe vérifiée |
|---|---:|---|
| Claude Code | 2.1.224 | lifecycle command hooks, matchers, Stop recursion, `permissions.defaultMode` |
| Codex CLI | 0.147.0 | global `--sandbox read-only` and `--ask-for-approval never` before `exec`; exec-local `--ephemeral`, JSON schema/output; MCP add/list |
| Node.js | 22.23.1 | ESM, fetch, `node:sqlite` |
| npm | 10.9.8 | `npm ci`, lockfile v3 |
| SQLite CLI | 3.37.2 | diagnostic only ; runtime via `node:sqlite` |

Sources officielles consultées pendant l'implémentation : documentation hooks,
permissions et sandbox Claude Code ; manuel Codex CLI non interactif, sandbox,
MCP et skills ; dépôts officiels Microsoft Playwright MCP, Chrome DevTools MCP
et Upstash Context7. Les scripts vérifient les binaires installés plutôt que de
présumer qu'une configuration MCP Claude s'applique à Codex.

`agentic-supervisor doctor` produit un avertissement utile lorsqu'une capacité
optionnelle manque et un échec pour Codex/daemon/DB requis. Les audits visuels
échouent explicitement en infrastructure error si Playwright manque.
