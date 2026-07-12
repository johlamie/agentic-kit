#!/usr/bin/env bash
# mcp-setup.sh — Register the MCP toolbox at user scope (available in all projects).
# Commands current as of mid-2026; if one fails, check the provider's docs and /mcp.
set -uo pipefail

# --- Design references (designer agent) — requires a paid Mobbin account;
#     first use opens a browser OAuth flow (run `claude` then /mcp > authenticate)
claude mcp add --transport http --scope user mobbin https://api.mobbin.com/mcp

# --- Up-to-date library docs (builder agent)
claude mcp add --transport http --scope user context7 https://mcp.context7.com/mcp

# --- E2E browser testing (qa agent)
claude mcp add --scope user playwright -- npx -y @playwright/mcp@latest

# --- GitHub (repos, PRs, issues) — authenticates via OAuth on first use
claude mcp add --transport http --scope user github https://api.githubcopilot.com/mcp/

# --- Supabase management (devops agent) — create a Personal Access Token at
#     https://supabase.com/dashboard/account/tokens and export it first:
#     export SUPABASE_ACCESS_TOKEN=sbp_...
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  claude mcp add --scope user supabase \
    -e SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" \
    -- npx -y @supabase/mcp-server-supabase@latest
else
  echo "SKIP supabase MCP: export SUPABASE_ACCESS_TOKEN first, then rerun."
fi

# --- Firebase management (devops agent) — requires `firebase login` done
claude mcp add --scope user firebase -- npx -y firebase-tools@latest experimental:mcp

echo
echo "Registered. Verify inside claude with: /mcp  (authenticate mobbin & github there)"
echo "Note: agent 'tools:' fields reference servers as mcp__mobbin, mcp__playwright,"
echo "mcp__context7, mcp__supabase, mcp__firebase — server NAMES above must match."
