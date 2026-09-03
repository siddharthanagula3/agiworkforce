#!/usr/bin/env bash

set -euo pipefail

VERSION="${1:?usage: $0 <version>}"
TAP_DIR="${HOMEBREW_TAP_DIR:-$HOME/code/homebrew-tap}"
GITHUB_REPO="siddharthanagula3/agiworkforce"
RELEASE_TAG="v-cli-$VERSION"
RELEASE_BASE="https://github.com/$GITHUB_REPO/releases/download/$RELEASE_TAG"
CERTIFICATE_IDENTITY="https://github.com/$GITHUB_REPO/.github/workflows/release-cli.yml@refs/tags/$RELEASE_TAG"
CERTIFICATE_OIDC_ISSUER="https://token.actions.githubusercontent.com"

if [ ! -d "$TAP_DIR" ]; then
  echo "ERROR: $TAP_DIR doesn't exist."
  echo "  git clone git@github.com:siddharthanagula3/homebrew-tap.git $TAP_DIR"
  exit 1
fi

if ! command -v cosign >/dev/null 2>&1; then
  echo "ERROR: cosign is required to verify release provenance before publishing the tap." >&2
  echo "  https://docs.sigstore.dev/cosign/system_config/installation/" >&2
  exit 1
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

echo "→ Verifying the signed checksum manifest for $RELEASE_TAG..."
if ! curl -fsSL -o "$WORK_DIR/SHA256SUMS" "$RELEASE_BASE/SHA256SUMS" \
  || ! curl -fsSL -o "$WORK_DIR/SHA256SUMS.sigstore.json" "$RELEASE_BASE/SHA256SUMS.sigstore.json"; then
  echo "ERROR: release signature metadata is missing; refusing to publish unverified bytes." >&2
  exit 1
fi

if ! cosign verify-blob \
  --bundle "$WORK_DIR/SHA256SUMS.sigstore.json" \
  --certificate-identity "$CERTIFICATE_IDENTITY" \
  --certificate-oidc-issuer "$CERTIFICATE_OIDC_ISSUER" \
  "$WORK_DIR/SHA256SUMS" >/dev/null; then
  echo "ERROR: release provenance verification failed; refusing to publish." >&2
  exit 1
fi
echo "    provenance OK ($CERTIFICATE_IDENTITY)"

echo "→ Computing sha256 for each platform binary..."
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

fetch_sha() {
  local platform="$1"
  local filename="agiworkforce-$platform.tar.gz"
  local url="$RELEASE_BASE/$filename"
  local expected actual

  expected=$(awk -v f="$filename" '$2 == f || $2 == "*" f { print $1; exit }' "$WORK_DIR/SHA256SUMS")
  if [ -z "$expected" ]; then
    echo "ERROR: the signed manifest has no entry for $filename." >&2
    return 1
  fi

  echo "  fetching $url" >&2
  if ! curl -fsSL -o "$WORK_DIR/$filename" "$url"; then
    echo "ERROR: download failed for $filename." >&2
    return 1
  fi

  actual=$(sha256_of "$WORK_DIR/$filename")
  if [ "$actual" != "$expected" ]; then
    echo "ERROR: $filename does not match the signed manifest; refusing to publish." >&2
    echo "  signed:   $expected" >&2
    echo "  download: $actual" >&2
    return 1
  fi

  printf '%s\n' "$actual"
}

SHA_DARWIN_ARM64=$(fetch_sha darwin-arm64)
echo "    darwin-arm64: $SHA_DARWIN_ARM64"
SHA_DARWIN_X64=$(fetch_sha darwin-x64)
echo "    darwin-x64:   $SHA_DARWIN_X64"
SHA_LINUX_X64=$(fetch_sha linux-x64)
echo "    linux-x64:    $SHA_LINUX_X64"
SHA_LINUX_ARM64=$(fetch_sha linux-arm64)
echo "    linux-arm64:  $SHA_LINUX_ARM64"

echo ""
echo "→ Generating $TAP_DIR/Formula/agiworkforce.rb..."
mkdir -p "$TAP_DIR/Formula"
cat > "$TAP_DIR/Formula/agiworkforce.rb" <<EOF

class Agiworkforce < Formula
  desc "Multi-model AI agent for your terminal, BYOK, 25 providers, MCP, computer-use"
  homepage "https://agiworkforce.com"
  license "Proprietary"
  version "$VERSION"

  on_macos do
    if Hardware::CPU.arm?
      url "$RELEASE_BASE/agiworkforce-darwin-arm64.tar.gz"
      sha256 "$SHA_DARWIN_ARM64"
    else
      url "$RELEASE_BASE/agiworkforce-darwin-x64.tar.gz"
      sha256 "$SHA_DARWIN_X64"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "$RELEASE_BASE/agiworkforce-linux-arm64.tar.gz"
      sha256 "$SHA_LINUX_ARM64"
    else
      url "$RELEASE_BASE/agiworkforce-linux-x64.tar.gz"
      sha256 "$SHA_LINUX_X64"
    end
  end

  def install
    if File.exist?("agi")
      bin.install "agi"
    else
      bin.install "agiworkforce" => "agi"
    end
    bin.install "agiworkforce" if File.exist?("agiworkforce")
  end

  test do
    assert_match "agi", shell_output("#{bin}/agi --version")
    assert_match "ANTHROPIC", shell_output("#{bin}/agi --list-models")
    assert_predicate bin/"agiworkforce", :exist?
  end
end
EOF

echo ""
echo "→ Committing + pushing tap update..."
(
  cd "$TAP_DIR"
  git add Formula/agiworkforce.rb
  git commit -m "agiworkforce $VERSION

Auto-published by agiworkforce/scripts/update-homebrew-tap.sh.
"
  git push origin main
)

echo ""
echo "✓ Tap updated. Users can now:"
echo "  brew install siddharthanagula3/tap/agiworkforce"
echo "  brew upgrade siddharthanagula3/tap/agiworkforce"
echo "  agi --version"
