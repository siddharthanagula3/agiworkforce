#!/bin/bash
# Build the Vite chat app and copy it to public/chat/ before building Next.js
set -e

cd ../..

# Build Vite chat app with /chat/ base path
echo "Building Vite chat app..."
VITE_BUILD_TARGET=web pnpm --filter @agiworkforce/desktop exec vite build --outDir dist-web --base /chat/

# Copy to Next.js public directory
echo "Copying chat build to public/chat/..."
rm -rf apps/web/public/chat
cp -r apps/desktop/dist-web apps/web/public/chat

# Build Next.js
echo "Building Next.js..."
pnpm --filter web build

echo "Build complete!"
