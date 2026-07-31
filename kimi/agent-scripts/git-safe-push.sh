#!/usr/bin/env bash
# git-safe-push.sh — the ONLY sanctioned way an agent pushes to a remote.
#
# Raw `git push` is denied in settings.json (an agent typing it is blocked
# before this script ever runs). This wrapper is allow-listed instead, and it
# enforces branch protection in code rather than by trusting the pattern the
# agent typed: main/master/production/release branches are refused outright,
# no matter how the caller tries to phrase the push.
#
# Usage: git-safe-push.sh <remote> <branch>
set -euo pipefail

remote="${1:?usage: git-safe-push.sh <remote> <branch>}"
branch="${2:?usage: git-safe-push.sh <remote> <branch>}"

case "$branch" in
  main|master|production|release|release/*)
    echo "REFUSED: '$branch' is a protected branch." >&2
    echo "Pushing/merging here is gate G5 (or G4 for the production remote):" >&2
    echo "propose the exact command to the user, do not run it yourself." >&2
    exit 1
    ;;
esac

# Push the local branch to the SAME-named remote ref, verbatim on both sides
# of the refspec. No "HEAD:main"-style aliasing is accepted, so there is no
# way to smuggle a protected target past the case statement above.
exec git push -u "$remote" "$branch:$branch"
