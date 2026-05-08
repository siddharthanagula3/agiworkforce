#!/bin/bash
# Build the Next.js web app.
#
# Note: Earlier versions of this script also built the Vite desktop SPA into
# apps/web/public/chat/ and a vercel.json rewrite served it for /chat/*.
# That architecture was replaced by the native Next.js route at
# apps/web/app/chat/[sessionId]/page.tsx, so we no longer build or ship the
# desktop SPA bundle here. The script name is kept for backwards compatibility
# with the Vercel buildCommand pin.
set -e

cd ../..

echo "Building Next.js..."
pnpm --filter web build:next-only

echo "Build complete!"
