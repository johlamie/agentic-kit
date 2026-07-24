#!/usr/bin/env bash
# mcp-setup.sh — Generate ~/.kimi-code/mcp.json (user scope: available in all
# projects). Kimi Code has no `mcp add` CLI command: MCP servers are declared
# in mcp.json, and the interactive entry point is /mcp-config inside kimi.
# Logic carried over from the Claude Code edition of this script;
# commands current as of July 2026 — if one fails, check the provider's docs
# and /mcp-config.
#
# CHANGELOG (inherited from the Claude Code edition):
#   2026-07 — fixed firebase: `experimental:mcp` does not exist, correct subcommand
#             is `mcp`. Added METADATA_SERVER_DETECTION=bios-only to stop the
#             GCP-metadata network probe from hanging the MCP handshake on a
#             non-GCP VPS (reported as "failed" in /mcp). Fixed github: pure
#             OAuth fails on headless VPS with
#             "Incompatible auth server: does not support dynamic client
#             registration" (no browser to complete dynamic client registration).
#             Switched to PAT-based auth — carried by `bearerTokenEnvVar` here,
#             so the token is read from the environment, never written to disk.
set -uo pipefail

KIMI_DIR="$HOME/.kimi-code"
MCP_FILE="$KIMI_DIR/mcp.json"
mkdir -p "$KIMI_DIR"

# Never overwrite an existing mcp.json silently: back it up first (it may hold
# hand-added servers or local edits).
if [ -e "$MCP_FILE" ]; then
  STAMP="$(date +%F-%H%M)"
  echo "Existing mcp.json backed up -> mcp.json.bak-$STAMP"
  cp "$MCP_FILE" "$MCP_FILE.bak-$STAMP"
fi

GITHUB_PAT="${GITHUB_PAT:-}" SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}" \
python3 - "$MCP_FILE" <<'PY'
import json, os, sys

servers = {}

# --- Design references (designer role) — requires a paid Mobbin account;
#     OAuth: inside kimi run `/mcp-config login mobbin`, then open the given
#     URL on a machine WITH a browser — e.g. your Mac — not the headless VPS.
servers["mobbin"] = {"url": "https://api.mobbin.com/mcp"}

# --- Up-to-date library docs (builder role)
servers["context7"] = {"url": "https://mcp.context7.com/mcp"}

# --- E2E browser testing (qa role)
servers["playwright"] = {"command": "npx", "args": ["-y", "@playwright/mcp@latest"]}

# --- GitHub (repos, PRs, issues) — PAT-based, headless-safe.
#     Create a fine-grained token at https://github.com/settings/tokens with
#     Contents/Pull requests/Issues: read-write, Metadata: read. Then:
#     export GITHUB_PAT=github_pat_...
#     bearerTokenEnvVar: kimi reads the token from the env var at runtime —
#     the secret is never written into mcp.json.
if os.environ.get("GITHUB_PAT"):
    servers["github"] = {
        "url": "https://api.githubcopilot.com/mcp/",
        "bearerTokenEnvVar": "GITHUB_PAT",
    }
else:
    print("SKIP github MCP: export GITHUB_PAT first (fine-grained PAT), then rerun.")
    print("  Plain OAuth fails on headless VPS: 'does not support dynamic client registration'.")

# --- Supabase management (devops role) — create a Personal Access Token at
#     https://supabase.com/dashboard/account/tokens and export it first:
#     export SUPABASE_ACCESS_TOKEN=sbp_...
#     (stdio server: the token is injected into its environment, so it IS
#     written into mcp.json — hence chmod 600 below.)
if os.environ.get("SUPABASE_ACCESS_TOKEN"):
    servers["supabase"] = {
        "command": "npx",
        "args": ["-y", "@supabase/mcp-server-supabase@latest"],
        "env": {"SUPABASE_ACCESS_TOKEN": os.environ["SUPABASE_ACCESS_TOKEN"]},
    }
else:
    print("SKIP supabase MCP: export SUPABASE_ACCESS_TOKEN first, then rerun.")

# --- Firebase management (devops role) — requires `firebase login` done first.
#     Uses the same credentials as your authenticated Firebase CLI session.
#     METADATA_SERVER_DETECTION=bios-only: on a non-GCP VPS, firebase-tools'
#     gcp-metadata dependency otherwise pings http://metadata.google.internal
#     and hangs ~3s per retry until the MCP init handshake times out and Kimi
#     Code reports the server as "failed". bios-only checks local sysfs instead.
servers["firebase"] = {
    "command": "npx",
    "args": ["-y", "firebase-tools@latest", "mcp"],
    "env": {"METADATA_SERVER_DETECTION": "bios-only"},
}

with open(sys.argv[1], "w") as f:
    json.dump({"mcpServers": servers}, f, indent=2)
    f.write("\n")
PY

# Contains the Supabase token when set: local only, never symlinked, never committed.
chmod 600 "$MCP_FILE"

echo
echo "Wrote $MCP_FILE (chmod 600). Verify inside kimi with: /mcp-config"
echo "  - mobbin: run /mcp-config login mobbin, open the OAuth URL on a machine"
echo "    with a browser, not on the headless VPS."
echo "  - github: should connect immediately (PAT via bearerTokenEnvVar) if GITHUB_PAT was set."
echo "  - firebase: should connect immediately (reuses firebase CLI login)."
echo "Note: role skills reference servers as mcp__mobbin, mcp__playwright,"
echo "mcp__context7, mcp__supabase, mcp__firebase — server NAMES above must match."
