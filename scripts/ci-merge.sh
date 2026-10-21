#!/usr/bin/env bash
# Used by the workflows. Merges <ref> into the current branch (integration) with a merge commit.
# Conflicts that are only in the generated registry index files are resolved by regenerating them.
# Usage: scripts/ci-merge.sh <ref> <message>
# Exit 0 = merged or already contained (check `git rev-parse HEAD` against origin), 10 = real conflict (merge aborted,
# conflicting files in conflicts.txt), anything else = error. Never pushes and never force-anything.
set -u
REF="$1"; MSG="$2"
# TOOLS = a checkout holding this script and gen-registry.mjs; lets CI run the newest tooling against an older integration branch.
TOOLS="${TOOLS:-$(cd "$(dirname "$0")/.." && pwd)}"
GEN="node $TOOLS/scripts/gen-registry.mjs --root ."
INDEXES="src/sim/systems/index.js src/render/systems/index.js src/ui/modules/index.js"

if git merge-base --is-ancestor "$REF" HEAD; then echo "already contains $REF"; exit 0; fi

if ! git merge --no-ff -m "$MSG" "$REF"; then
  git diff --name-only --diff-filter=U > conflicts.txt
  OTHER="$(grep -vxF -e src/sim/systems/index.js -e src/render/systems/index.js -e src/ui/modules/index.js conflicts.txt || true)"
  if [ -n "$OTHER" ]; then git merge --abort; exit 10; fi
  # only generated files conflict: rebuild them from the folders and finish the merge
  $GEN || { git merge --abort; exit 10; }
  git add $INDEXES
  git -c core.editor=true commit --no-edit || exit 1
  rm -f conflicts.txt
fi

# a clean merge can still leave a stale index (two PRs adding files): regenerate and commit if so
$GEN || exit 1
if ! git diff --quiet -- $INDEXES; then
  git add $INDEXES
  git commit -m "Regenerate registry indexes" || exit 1
fi
exit 0
