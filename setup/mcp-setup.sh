#!/usr/bin/env bash
# mcp-setup.sh — Register the MCP toolbox at user scope (available in all projects).
# Commands current as of July 2026; if one fails, check the provider's docs and /mcp.
#
# CHANGELOG:
#   2026-07 — fixed firebase: `experimental:mcp` does not exist, correct subcommand
#             is `mcp`. Added METADATA_SERVER_DETECTION=bios-only to stop the
#             GCP-metadata network probe from hanging the MCP handshake on a
#             non-GCP VPS (reported as "failed" in /mcp). Fixed github: pure
#             OAuth fails on headless VPS with
#             "Incompatible auth server: does not support dynamic client
#             registration" (no browser to complete dynamic client registration).
#             Switched to PAT-based auth via Authorization header.
set -uo pipefail

# --- Design references (designer agent) — requires a paid Mobbin account;
#     first use opens a browser OAuth flow (run `claude` then /mcp > authenticate,
#     open the given URL on a machine WITH a browser — e.g. your Mac — not the VPS)
claude mcp add --transport http --scope user mobbin https://api.mobbin.com/mcp

# --- Up-to-date library docs (builder agent)
claude mcp add --transport http --scope user context7 https://mcp.context7.com/mcp

# --- E2E browser testing (qa agent)
claude mcp add --scope user playwright -- npx -y @playwright/mcp@latest

# --- GitHub (repos, PRs, issues) — PAT-based, headless-safe.
#     Create a fine-grained token at https://github.com/settings/tokens with
#     Contents/Pull requests/Issues: read-write, Metadata: read. Then:
#     export GITHUB_PAT=github_pat_...
if [ -n "${GITHUB_PAT:-}" ]; then
  claude mcp add --transport http --scope user github https://api.githubcopilot.com/mcp/ \
    --header "Authorization: Bearer $GITHUB_PAT"
else
  echo "SKIP github MCP: export GITHUB_PAT first (fine-grained PAT), then rerun."
  echo "  Plain OAuth fails on headless VPS: 'does not support dynamic client registration'."
fi

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

# --- Firebase management (devops agent) — requires `firebase login` done first.
#     Uses the same credentials as your authenticated Firebase CLI session.
#     METADATA_SERVER_DETECTION=bios-only: on a non-GCP VPS, firebase-tools'
#     gcp-metadata dependency otherwise pings http://metadata.google.internal
#     and hangs ~3s per retry until the MCP init handshake times out and Claude
#     Code reports the server as "failed". bios-only checks local sysfs instead.
claude mcp add --scope user firebase \
  -e METADATA_SERVER_DETECTION=bios-only \
  -- npx -y firebase-tools@latest mcp

echo
echo "Registered. Verify inside claude with: /mcp"
echo "  - mobbin: open the OAuth URL on a machine with a browser, not headless."
echo "  - github: should connect immediately (PAT, no OAuth step) if GITHUB_PAT was set."
echo "  - firebase: should connect immediately (reuses firebase CLI login)."
echo "Note: agent 'tools:' fields reference servers as mcp__mobbin, mcp__playwright,"
echo "mcp__context7, mcp__supabase, mcp__firebase — server NAMES above must match."
