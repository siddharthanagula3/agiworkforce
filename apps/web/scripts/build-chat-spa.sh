#!/bin/bash
# Build the desktop Vite SPA for /chat and copy to public/chat/
# This runs as part of `pnpm --filter web build` before `next build`
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(dirname "$SCRIPT_DIR")"
MONO_ROOT="$(dirname "$(dirname "$WEB_DIR")")"

echo "Building Vite chat SPA..."
cd "$MONO_ROOT"
VITE_BUILD_TARGET=web pnpm --filter @agiworkforce/desktop exec vite build --outDir dist-web --base /chat/

echo "Copying to public/chat/..."
rm -rf "$WEB_DIR/public/chat"
cp -r "$MONO_ROOT/apps/desktop/dist-web" "$WEB_DIR/public/chat"

echo "Chat SPA build complete!"
