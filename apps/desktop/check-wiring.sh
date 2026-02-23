#!/bin/bash
# Cross-check: every invoke('cmd_name') call-site in TS should have a matching entry in lib.rs
# Usage: bash apps/desktop/check-wiring.sh
set -e
MISSING=0
TS_INVOKES=$(grep -rh "invoke('" apps/desktop/src/ --include="*.ts" --include="*.tsx" | grep -oE "'[a-z_]+'" | sort -u | tr -d "'")
for cmd in $TS_INVOKES; do
  if ! grep -q "$cmd" apps/desktop/src-tauri/src/lib.rs 2>/dev/null; then
    echo "MISSING: $cmd"
    MISSING=1
  fi
done
if [ "$MISSING" -eq 0 ]; then
  echo "OK: All invoke() commands are registered in lib.rs"
fi
exit $MISSING
