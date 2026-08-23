#!/usr/bin/env bash
# Regression harness for scripts/update-homebrew-tap.sh.
#
# Stubs curl/cosign/git on PATH and serves a fake GitHub release directory so the
# publisher can be driven offline. Guards the CWE-494 fix: a tarball whose bytes
# do not match the cosign-verified SHA256SUMS manifest must never reach the tap.
#
# Usage: ./scripts/update-homebrew-tap.test.sh

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TARGET="${TAP_SCRIPT:-$SCRIPT_DIR/update-homebrew-tap.sh}"
VERSION="9.9.9"
EXPECTED_IDENTITY="https://github.com/siddharthanagula3/agiworkforce/.github/workflows/release-cli.yml@refs/tags/v-cli-$VERSION"
PLATFORMS="darwin-arm64 darwin-x64 linux-x64 linux-arm64"

FAILURES=0
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

make_stubs() {
  local bin="$ROOT/bin"
  mkdir -p "$bin"

  cat > "$bin/curl" <<'STUB'
#!/usr/bin/env bash
out=""
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
name="${url##*/}"
src="$FAKE_RELEASE_DIR/$name"
[ -f "$src" ] || exit 22
if [ -n "$out" ]; then cp "$src" "$out"; else cat "$src"; fi
STUB

  cat > "$bin/cosign" <<'STUB'
#!/usr/bin/env bash
[ "$1" = "verify-blob" ] || exit 2
shift
bundle=""; identity=""; issuer=""; blob=""
while [ $# -gt 0 ]; do
  case "$1" in
    --bundle) bundle="$2"; shift 2 ;;
    --certificate-identity) identity="$2"; shift 2 ;;
    --certificate-oidc-issuer) issuer="$2"; shift 2 ;;
    *) blob="$1"; shift ;;
  esac
done
[ -f "$bundle" ] && [ -f "$blob" ] || exit 1
[ "$identity" = "$EXPECTED_IDENTITY" ] || exit 1
[ "$issuer" = "https://token.actions.githubusercontent.com" ] || exit 1
grep -q FORGED "$bundle" && exit 1
exit 0
STUB

  cat > "$bin/git" <<'STUB'
#!/usr/bin/env bash
echo "git $*" >> "$GIT_STUB_LOG"
exit 0
STUB

  chmod +x "$bin/curl" "$bin/cosign" "$bin/git"
  printf '%s' "$bin"
}

# Builds a fake release: four tarballs plus a signed manifest that matches them.
seed_release() {
  local dir="$1"
  rm -rf "$dir"
  mkdir -p "$dir"
  local p
  : > "$dir/SHA256SUMS"
  for p in $PLATFORMS; do
    printf 'genuine payload for %s\n' "$p" > "$dir/agiworkforce-$p.tar.gz"
    printf '%s  agiworkforce-%s.tar.gz\n' "$(sha256_of "$dir/agiworkforce-$p.tar.gz")" "$p" >> "$dir/SHA256SUMS"
  done
  printf '{"signature":"VALID"}\n' > "$dir/SHA256SUMS.sigstore.json"
}

seed_tap() {
  local dir="$1"
  rm -rf "$dir"
  mkdir -p "$dir/Formula"
  printf 'SENTINEL-UNTOUCHED\n' > "$dir/Formula/agiworkforce.rb"
}

run_case() {
  local name="$1" expect="$2"
  local release="$ROOT/release" tap="$ROOT/tap" log="$ROOT/out.log"
  local status=0

  HOMEBREW_TAP_DIR="$tap" \
  FAKE_RELEASE_DIR="$release" \
  EXPECTED_IDENTITY="$EXPECTED_IDENTITY" \
  GIT_STUB_LOG="$ROOT/git.log" \
  PATH="$STUB_BIN:$PATH" \
    bash "$TARGET" "$VERSION" > "$log" 2>&1 || status=$?

  if [ "$expect" = "pass" ] && [ "$status" -ne 0 ]; then
    echo "FAIL: $name — expected success, got exit $status"
    sed 's/^/    /' "$log"
    FAILURES=$((FAILURES + 1))
    return 1
  fi
  if [ "$expect" = "fail" ] && [ "$status" -eq 0 ]; then
    echo "FAIL: $name — expected a non-zero exit, got 0"
    sed 's/^/    /' "$log"
    FAILURES=$((FAILURES + 1))
    return 1
  fi

  echo "ok: $name (exit $status)"
  return 0
}

assert_formula_untouched() {
  local name="$1"
  if ! grep -q SENTINEL-UNTOUCHED "$ROOT/tap/Formula/agiworkforce.rb"; then
    echo "FAIL: $name — the formula was rewritten from unverified bytes"
    FAILURES=$((FAILURES + 1))
  fi
}

assert_formula_contains() {
  local name="$1" needle="$2"
  if ! grep -q "$needle" "$ROOT/tap/Formula/agiworkforce.rb"; then
    echo "FAIL: $name — formula is missing $needle"
    FAILURES=$((FAILURES + 1))
  fi
}

STUB_BIN=$(make_stubs)

# 1. Happy path: every tarball matches the signed manifest.
seed_release "$ROOT/release"
seed_tap "$ROOT/tap"
: > "$ROOT/git.log"
if run_case "signed release publishes" pass; then
  assert_formula_contains "signed release publishes" "$(sha256_of "$ROOT/release/agiworkforce-darwin-arm64.tar.gz")"
  assert_formula_contains "signed release publishes" "version \"$VERSION\""
  grep -q 'git push origin main' "$ROOT/git.log" || {
    echo "FAIL: signed release publishes — tap was never pushed"
    FAILURES=$((FAILURES + 1))
  }
fi

# 2. Tampered artifact: bytes swapped after the manifest was signed.
#    This is the case the pre-fix script published verbatim.
seed_release "$ROOT/release"
seed_tap "$ROOT/tap"
printf 'backdoored payload\n' > "$ROOT/release/agiworkforce-darwin-x64.tar.gz"
run_case "tampered tarball is rejected" fail || true
assert_formula_untouched "tampered tarball is rejected"

# 3. Missing signature bundle.
seed_release "$ROOT/release"
seed_tap "$ROOT/tap"
rm -f "$ROOT/release/SHA256SUMS.sigstore.json"
run_case "missing sigstore bundle is rejected" fail || true
assert_formula_untouched "missing sigstore bundle is rejected"

# 4. Missing checksum manifest.
seed_release "$ROOT/release"
seed_tap "$ROOT/tap"
rm -f "$ROOT/release/SHA256SUMS"
run_case "missing checksum manifest is rejected" fail || true
assert_formula_untouched "missing checksum manifest is rejected"

# 5. Forged signature that cosign refuses.
seed_release "$ROOT/release"
seed_tap "$ROOT/tap"
printf '{"signature":"FORGED"}\n' > "$ROOT/release/SHA256SUMS.sigstore.json"
run_case "failed cosign verification is rejected" fail || true
assert_formula_untouched "failed cosign verification is rejected"

# 6. Manifest signed but silently missing a platform entry.
seed_release "$ROOT/release"
seed_tap "$ROOT/tap"
grep -v 'agiworkforce-linux-arm64.tar.gz' "$ROOT/release/SHA256SUMS" > "$ROOT/release/SHA256SUMS.tmp"
mv "$ROOT/release/SHA256SUMS.tmp" "$ROOT/release/SHA256SUMS"
run_case "unlisted platform is rejected" fail || true
assert_formula_untouched "unlisted platform is rejected"

# 7. cosign absent from PATH (skipped when a real cosign would shadow the stub).
if command -v cosign >/dev/null 2>&1; then
  echo "skip: missing cosign is rejected (a real cosign is installed)"
else
  seed_release "$ROOT/release"
  seed_tap "$ROOT/tap"
  mv "$STUB_BIN/cosign" "$ROOT/cosign.bak"
  run_case "missing cosign is rejected" fail || true
  assert_formula_untouched "missing cosign is rejected"
  mv "$ROOT/cosign.bak" "$STUB_BIN/cosign"
fi

if [ "$FAILURES" -ne 0 ]; then
  echo "$FAILURES check(s) failed."
  exit 1
fi
echo "All update-homebrew-tap.sh checks passed."
