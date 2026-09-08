# Predeclared hook acceptance — codex / qa

With an empty role (orchestrator) and a synthetic live-app entry, the real PreToolUse Bash hook must return ASK for npm run deploy:prod, npm run migrate:prod, ./deploy.sh and bash ./scripts/migrate.sh. In the same live project, git diff ./deploy.sh and echo ./deploy.sh must return NO_OPINION. The four deployment/migration payloads in unlisted scratch-app must return NO_OPINION. All hook processes must exit zero without stderr. NO_OPINION is not an allow decision. The payload command strings must never be executed. Source bytes must remain unchanged.
