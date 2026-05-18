#!/usr/bin/env bash
# reference-index/ci/check-structure.sh
#
# PHASE 8 CI PROTOTYPE — not yet enabled in any workflow.
#
# Fails if any source file under a "reorganized surface" lands outside the
# canonical layer-map shape:
#
#     apps/<surface>/src/{entry,core,features,platform,integrations,data,ui}/
#
# A surface is considered "reorganized" iff
# `reference-index/<surface>-ownership.json` exists. This lets the gate
# auto-activate per surface as each phase ships its reorg, without
# touching this script.
#
# Files that are explicitly OUT of scope:
#   * Surface-level config (package.json, tsconfig.json, *.config.js, ...)
#   * Expo router entry files in apps/mobile/app/  (Expo contract is sacred)
#   * Native code (apps/mobile/native/, apps/desktop/src-tauri/, apps/<*>/ios|android/)
#   * Static assets (assets/, public/)
#   * Tests (__tests__/, e2e/, playwright/)
#   * Legacy paths still listed in reference-index/temp-barrel-catalog.json
#     (those die in Phase 7 — they are tolerated until then)
#
# Intended trigger:
#   Phase 8a: nightly cron in `.github/workflows/structure-audit.yml`, warn-only.
#   Phase 8b: required check on every PR that touches `apps/<surface>/`.
#
# Requires: bash >= 4 (CI is fine; macOS users may need `brew install bash`).
#
# Exit codes:
#   0  All reorganized surfaces are clean.
#   1  At least one violation found (printed to stderr).
#   2  Usage / setup error.

set -euo pipefail

[[ "${BASH_SOURCE[0]}" == "${0}" ]] || return 0

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

ALLOWED_LAYERS_RE='^(entry|core|features|platform|integrations|data|storage|ui)$'

# Per-surface excluded sub-trees. Returns the regex for the surface or "" if
# the surface is unknown. POSIX case statement keeps this bash-3.2 friendly.
surface_excludes_for() {
  case "$1" in
    mobile)            echo '^(app|native|ios|android|assets|scripts|__tests__|__mocks__|e2e|\.expo|\.maestro)/|^[^/]+$' ;;
    desktop)           echo '^(src-tauri|public|scripts|e2e|playwright|__tests__|tests)/|^[^/]+$' ;;
    web)               echo '^(app|public|scripts|e2e|playwright|__tests__|tests|supabase|\.next)/|^[^/]+$' ;;
    cli)               echo '^(src|target|tests|benches)/|^[^/]+$' ;;
    extension)         echo '^(public|scripts|__tests__|tests|e2e)/|^[^/]+$' ;;
    extension-vscode)  echo '^(scripts|__tests__|tests|e2e|out|dist)/|^[^/]+$' ;;
    *)                 echo '' ;;
  esac
}

reorganized_surfaces=()
shopt -s nullglob
for f in reference-index/*-ownership.json; do
  base="$(basename "$f" -ownership.json)"
  reorganized_surfaces+=("$base")
done
shopt -u nullglob

if [[ ${#reorganized_surfaces[@]} -eq 0 ]]; then
  echo "[check-structure] No reorganized surfaces yet (no reference-index/*-ownership.json). Nothing to check."
  exit 0
fi

# Pull the legacy-path safelist out of temp-barrel-catalog.json if present.
# The catalog is a flat array of { old_path, new_path, ... } entries.
legacy_safelist_file="$(mktemp)"
trap 'rm -f "$legacy_safelist_file"' EXIT
if [[ -f "reference-index/temp-barrel-catalog.json" ]] && command -v jq >/dev/null 2>&1; then
  jq -r '.[].old_path' reference-index/temp-barrel-catalog.json > "$legacy_safelist_file" 2>/dev/null || true
fi

violations=0

for surface in "${reorganized_surfaces[@]}"; do
  surface_dir="apps/$surface"
  if [[ ! -d "$surface_dir" ]]; then
    echo "[check-structure] WARN: ownership map for '$surface' exists but $surface_dir does not." >&2
    continue
  fi

  excludes_re="$(surface_excludes_for "$surface")"

  # Pipe-friendly file enumeration.
  while IFS= read -r file; do
    # Path relative to surface root (strip "apps/<surface>/").
    rel="${file#$surface_dir/}"

    # Skip excluded sub-trees and root-level files.
    if [[ -n "$excludes_re" ]] && [[ "$rel" =~ $excludes_re ]]; then
      continue
    fi

    # Skip declared legacy paths.
    if [[ -s "$legacy_safelist_file" ]] && grep -Fxq "$file" "$legacy_safelist_file"; then
      continue
    fi

    # We expect the path to start with "src/<layer>/...".
    if [[ "$rel" != src/* ]]; then
      echo "VIOLATION: $file" >&2
      echo "  reason: not inside src/ (surface=$surface)" >&2
      echo "  fix:    move into apps/$surface/src/<layer>/ or add the legacy path to reference-index/temp-barrel-catalog.json" >&2
      violations=$((violations + 1))
      continue
    fi

    layer="${rel#src/}"
    layer="${layer%%/*}"
    if ! [[ "$layer" =~ $ALLOWED_LAYERS_RE ]]; then
      echo "VIOLATION: $file" >&2
      echo "  reason: layer '$layer' is not in {entry,core,features,platform,integrations,data,ui}" >&2
      echo "  fix:    move into one of the canonical layers" >&2
      violations=$((violations + 1))
    fi
  done < <(
    git ls-files -- \
      "$surface_dir/**/*.ts" \
      "$surface_dir/**/*.tsx" \
      "$surface_dir/**/*.js" \
      "$surface_dir/**/*.jsx" 2>/dev/null
  )
done

if (( violations > 0 )); then
  echo "" >&2
  echo "[check-structure] $violations violation(s) — see canonical layout in apps/<surface>/src/README.md" >&2
  exit 1
fi

echo "[check-structure] OK — ${#reorganized_surfaces[@]} surface(s) checked, no violations."
exit 0
