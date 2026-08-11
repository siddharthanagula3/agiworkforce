#!/usr/bin/env bash
# Compatibility entry point for the repository-wide model-ID literal guard.
# The Node guard scans Rust, TypeScript, tests, fixtures, snapshots, comments,
# and documentation using the canonical live + retired model registries.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT/scripts/check-no-hardcoded-model-ids.mjs" "$@"
