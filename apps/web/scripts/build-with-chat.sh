#!/bin/bash
# Canonical location-independent Vercel/CI build entrypoint for the web app.
#
# Note: Earlier versions of this script also built the Vite desktop SPA into
# apps/web/public/chat/ and a vercel.json rewrite served it for /chat/*.
# That architecture was replaced by the native Next.js route at
# apps/web/app/chat/[sessionId]/page.tsx, so we no longer build or ship the
# desktop SPA bundle here. The script name remains because the live Vercel
# project invokes it, but it is now safe from either the repo root or apps/web.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

echo "Building Next.js..."
pnpm --filter @agiworkforce/web build:next-only

echo "Build complete!"
