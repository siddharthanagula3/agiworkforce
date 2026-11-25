#!/bin/bash
# Install dependencies and make one compiled web build in the web-lane worktree.
# Usage: install-build.sh [skip-install]
set -u
W=${AGI_CHECKOUT:-$HOME/Desktop/agiworkforce}
L=$HOME/.cache/agi-audit/web-lane/logs
mkdir -p "$L"
cd "$W" || exit 2
export TURBO_CACHE_DIR=$HOME/.cache/agi-audit/web-lane/turbo NEXT_TELEMETRY_DISABLED=1
if [ "${1:-}" != "skip-install" ]; then
  echo "install start $(date '+%H:%M:%S')"
  pnpm install --frozen-lockfile > "$L/install.log" 2>&1; rc=$?
  echo "install rc=$rc $(date '+%H:%M:%S')"
  [ $rc -ne 0 ] && { tail -15 "$L/install.log"; exit $rc; }
fi
cd apps/web || exit 2
set -a; source .env.local; set +a
export NEXT_PUBLIC_APP_URL=http://localhost:3000 NEXT_PUBLIC_SITE_URL=http://localhost:3000 NEXT_PUBLIC_SANDBOX_ORIGIN=http://localhost:3210 VERCEL_ENV=preview AGI_ALLOW_INVALID_ENV=1 NODE_OPTIONS=--max-old-space-size=8192
echo "build start $(date '+%H:%M:%S')"
pnpm --filter @agiworkforce/web build > "$L/build.log" 2>&1; rc=$?
echo "build rc=$rc $(date '+%H:%M:%S')"
tail -6 "$L/build.log"
ls -la .next/BUILD_ID 2>/dev/null
exit $rc
