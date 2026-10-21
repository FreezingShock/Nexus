#!/usr/bin/env sh
# Usage: scripts/ci-dry-merge.sh <into> <from>
# Prints "clean" when <from> would merge into <into> without conflicts, "registry" when only the generated registry
# indexes would conflict (scripts/ci-merge.sh regenerates those), or "conflict <file> ..." otherwise. Exits 1 on git errors.
# Reads only: the checkout, the branches and the remote are left alone.
set -u
INTO="$1"; FROM="$2"
if git merge-base --is-ancestor "$FROM" "$INTO"; then echo clean; exit 0; fi
if OUT="$(git merge-tree --write-tree --name-only "$INTO" "$FROM" 2>/dev/null)"; then echo clean; exit 0; fi
FILES="$(printf '%s\n' "$OUT" | tail -n +2 | sed '/^$/,$d')"
if [ -z "$FILES" ]; then echo error; exit 1; fi
OTHER="$(printf '%s\n' "$FILES" | grep -vxF -e src/sim/systems/index.js -e src/render/systems/index.js -e src/ui/modules/index.js || true)"
if [ -z "$OTHER" ]; then echo registry; else echo "conflict $(printf '%s\n' "$OTHER" | tr '\n' ' ' | sed 's/ $//')"; fi
