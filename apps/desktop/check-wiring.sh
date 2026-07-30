#!/bin/bash
# Cross-check the Desktop Tauri IPC surface. The Node implementation performs
# lexical parsing so comments and references outside generate_handler! cannot
# mask missing registrations.
set -euo pipefail

node --test apps/desktop/scripts/check-wiring.node-test.mjs
node apps/desktop/scripts/check-wiring.mjs "$@"
