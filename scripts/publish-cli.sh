#!/usr/bin/env bash
# scripts/publish-cli.sh — Publish @agiworkforce/cli + 6 platform binaries to npm.
#
# Prerequisites:
#   - NPM_TOKEN env var (or `npm login` already done)
#   - Built binaries at target/{platform}/release/agiworkforce (one per target)
#   - You're on a clean git tree at a tagged commit (e.g. v-cli-1.0.0)
#
# Usage:
#   ./scripts/publish-cli.sh         # interactive confirm, dry-run first
#   ./scripts/publish-cli.sh --yes   # skip confirm

set -euo pipefail

VERSION=$(grep -E '^version' apps/cli/Cargo.toml | head -1 | cut -d'"' -f2)
NPM_VERSION=$(node -p "require('./apps/cli/npm/package.json').version")

if [ "$VERSION" != "$NPM_VERSION" ]; then
  echo "ERROR: Cargo.toml version ($VERSION) != npm package.json version ($NPM_VERSION)"
  exit 1
fi

echo "========================================"
echo "  Publishing @agiworkforce/cli@$VERSION"
echo "========================================"
echo ""

# Platform binary directories (created by release-cli.yml CI workflow or build-cli-binaries.sh locally)
PLATFORMS=(
  "darwin-arm64"
  "darwin-x64"
  "linux-arm64"
  "linux-x64"
  "win32-arm64"
  "win32-x64"
)

# Verify all platform binaries exist
for platform in "${PLATFORMS[@]}"; do
  bin_dir="dist/cli/$platform"
  if [ ! -d "$bin_dir" ]; then
    echo "ERROR: missing $bin_dir/ — build platform binaries first via release-cli.yml CI"
    echo "       or scripts/build-cli-binaries.sh"
    exit 1
  fi
done

if [ "${1:-}" != "--yes" ]; then
  echo "About to publish 7 packages to npm:"
  echo "  @agiworkforce/cli@$VERSION (wrapper)"
  for platform in "${PLATFORMS[@]}"; do
    echo "  @agiworkforce/cli-$platform@$VERSION (platform binary)"
  done
  echo ""
  read -rp "Proceed? [y/N] " confirm
  if [ "$confirm" != "y" ]; then
    echo "Aborted."
    exit 0
  fi
fi

# 1. Publish each platform-specific package
for platform in "${PLATFORMS[@]}"; do
  bin_dir="dist/cli/$platform"
  pkg_name="@agiworkforce/cli-$platform"
  echo ""
  echo "→ Publishing $pkg_name@$VERSION..."

  # Generate platform package.json
  cat > "$bin_dir/package.json" <<EOF
{
  "name": "$pkg_name",
  "version": "$VERSION",
  "description": "AGI Workforce CLI — native binary for $platform",
  "license": "Proprietary",
  "os": ["${platform%-*}"],
  "cpu": ["${platform##*-}"],
  "files": ["bin"],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/siddharthanagula3/agiworkforce.git"
  }
}
EOF

  (cd "$bin_dir" && npm publish --access public)
done

# 2. Publish the wrapper package (depends on platform packages via optionalDependencies)
echo ""
echo "→ Publishing @agiworkforce/cli@$VERSION (wrapper)..."
(cd apps/cli/npm && npm publish --access public)

echo ""
echo "========================================"
echo "  ✓ Published 7 packages to npm"
echo "========================================"
echo ""
echo "Verify with:"
echo "  npm view @agiworkforce/cli versions"
echo "  npm install -g @agiworkforce/cli@$VERSION"
echo "  agiworkforce --version"
