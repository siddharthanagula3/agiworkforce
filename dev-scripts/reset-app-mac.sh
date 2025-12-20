#!/bin/bash
# ===============================================================================
# DEV-ONLY SCRIPT - NOT FOR DISTRIBUTION
# ===============================================================================
# Reset AGI Workforce App State (macOS Development Environment Only)
# This script is for developers to reset their local development environment
# ===============================================================================

set -e

echo "🧹 Resetting AGI Workforce App State..."
echo "⚠️  DEV-ONLY SCRIPT - This will delete all local app data!"
echo ""

# macOS app data directory based on bundle identifier
APP_DATA_DIR="$HOME/Library/Application Support/com.agiworkforce.desktop"

# Also clear any localStorage data stored by the webview
WEBKIT_DATA="$HOME/Library/WebKit/com.agiworkforce.desktop"

# Confirm with user
read -p "Are you sure you want to reset? (yes/no): " confirmation
if [ "$confirmation" != "yes" ]; then
    echo "❌ Reset cancelled."
    exit 0
fi

# 1. Kill any running instances
echo ""
echo "1️⃣ Killing processes..."
pkill -9 "agiworkforce" 2>/dev/null || true
pkill -9 "AGI Workforce" 2>/dev/null || true
sleep 1
echo "   ✅ Processes terminated"

# 2. Clear App Data directory
echo ""
echo "2️⃣ Clearing App Data..."
if [ -d "$APP_DATA_DIR" ]; then
    rm -rf "$APP_DATA_DIR"
    echo "   ✅ Cleared $APP_DATA_DIR"
else
    echo "   ℹ️  No data found at $APP_DATA_DIR"
fi

# 3. Clear WebKit data (webview localStorage etc)
echo ""
echo "3️⃣ Clearing WebKit Data..."
if [ -d "$WEBKIT_DATA" ]; then
    rm -rf "$WEBKIT_DATA"
    echo "   ✅ Cleared $WEBKIT_DATA"
else
    echo "   ℹ️  No WebKit data found at $WEBKIT_DATA"
fi

# 4. Clear any keychain items (optional - commented out for safety)
# echo ""
# echo "4️⃣ Clearing Keychain items..."
# security delete-generic-password -s "com.agiworkforce.desktop" 2>/dev/null || true

echo ""
echo "4️⃣ Ready to restart!"
echo ""
echo "To start dev server, run:"
echo "   pnpm dev:desktop"
echo ""
echo "✨ Reset complete! App will start fresh on next launch."
echo ""
