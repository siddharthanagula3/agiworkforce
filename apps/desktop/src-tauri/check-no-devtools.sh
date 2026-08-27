#!/bin/bash
# Kept as a stable path for release jobs. The real check resolves the Cargo
# feature graph, which a grep over the manifest cannot do; pass the same
# feature arguments the bundler is given, e.g.
#   ./check-no-devtools.sh --no-default-features --features shell,updater,billing,vad
set -euo pipefail
exec node "$(dirname "$0")/../scripts/check-no-devtools.mjs" "$@"
