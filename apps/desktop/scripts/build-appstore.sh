#!/bin/bash
# Build script for Mac App Store submission
# Usage: ./scripts/build-appstore.sh

set -e

echo "🍎 Building AGI Workforce for Mac App Store..."

# Check for required environment variables
if [ -z "$APPLE_TEAM_ID" ]; then
    echo "❌ Error: APPLE_TEAM_ID environment variable is not set"
    echo "   Set it to your Apple Developer Team ID (e.g., D2PR62RLT4)"
    exit 1
fi

if [ -z "$APPLE_SIGNING_IDENTITY" ]; then
    export APPLE_SIGNING_IDENTITY="Apple Distribution: AGI AUTOMATION LLC ($APPLE_TEAM_ID)"
    echo "ℹ️  Using default signing identity: $APPLE_SIGNING_IDENTITY"
fi

# Configuration
APP_NAME="AGI Workforce"
BUNDLE_ID="com.agiworkforce.desktop"
VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
BUILD_DIR="target/universal-apple-darwin/release/bundle/macos"
OUTPUT_DIR="dist/appstore"

echo "📦 Building version $VERSION..."

# Clean previous builds
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Build universal binary for App Store
echo "🔨 Building universal binary..."
cd src-tauri

# Build with App Store configuration
# --no-default-features disables shell and updater plugins
# --features "ocr,appstore" enables OCR and App Store-specific code paths
cargo tauri build \
    --bundles app \
    --target universal-apple-darwin \
    --config tauri.appstore.conf.json \
    --no-default-features \
    --features "ocr,appstore"

cd ..

# Verify the app bundle exists
if [ ! -d "$BUILD_DIR/$APP_NAME.app" ]; then
    echo "❌ Error: App bundle not found at $BUILD_DIR/$APP_NAME.app"
    exit 1
fi

echo "✅ App bundle created successfully"

# Re-sign with App Store distribution certificate
echo "🔐 Signing app for App Store distribution..."
codesign --deep --force --verify --verbose \
    --sign "$APPLE_SIGNING_IDENTITY" \
    --options runtime \
    --entitlements "src-tauri/entitlements.appstore.plist" \
    "$BUILD_DIR/$APP_NAME.app"

# Verify code signature
echo "🔍 Verifying code signature..."
codesign --verify --deep --strict --verbose=4 "$BUILD_DIR/$APP_NAME.app"

# Create PKG for App Store upload
echo "📦 Creating PKG for App Store..."
PKG_NAME="$APP_NAME-$VERSION.pkg"

xcrun productbuild \
    --sign "3rd Party Mac Developer Installer: AGI AUTOMATION LLC ($APPLE_TEAM_ID)" \
    --component "$BUILD_DIR/$APP_NAME.app" /Applications \
    "$OUTPUT_DIR/$PKG_NAME"

echo "✅ PKG created: $OUTPUT_DIR/$PKG_NAME"

# Validate the PKG
echo "🔍 Validating PKG..."
xcrun altool --validate-app \
    --file "$OUTPUT_DIR/$PKG_NAME" \
    --type macos \
    --username "$APPLE_ID" \
    --password "@keychain:AC_PASSWORD" \
    2>/dev/null || echo "⚠️  Validation requires APPLE_ID and AC_PASSWORD in keychain"

echo ""
echo "=========================================="
echo "✅ App Store Build Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Upload PKG to App Store Connect using Transporter app or:"
echo "   xcrun altool --upload-app --file \"$OUTPUT_DIR/$PKG_NAME\" --type macos"
echo ""
echo "2. Required credentials (set in Keychain or environment):"
echo "   - APPLE_ID: Your Apple ID email"
echo "   - AC_PASSWORD: App-specific password from appleid.apple.com"
echo ""
echo "3. After upload, complete App Store Connect listing:"
echo "   - Screenshots (1280x800 or 1440x900)"
echo "   - Description and keywords"
echo "   - Privacy policy URL"
echo "   - Support URL"
echo ""
