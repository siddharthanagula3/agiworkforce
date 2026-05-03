#!/usr/bin/env bash
# scripts/launch-readiness-check.sh — Verify everything is ready for `git tag v-cli-1.0.0`.
#
# Run this RIGHT before tagging. If everything passes, you're safe to tag.
# If any check fails, fix it before tagging.
#
# Usage: bash scripts/launch-readiness-check.sh

set -e

green='\033[0;32m'
red='\033[0;31m'
yellow='\033[1;33m'
nc='\033[0m'

pass() { echo -e "  ${green}✓${nc} $1"; }
fail() { echo -e "  ${red}✗${nc} $1"; FAILS=$((FAILS + 1)); }
warn() { echo -e "  ${yellow}!${nc} $1"; }
info() { echo "    $1"; }

FAILS=0

cd "$(dirname "$0")/.."

echo "=== LAUNCH READINESS CHECK ==="
echo ""

# 1. Git state
echo "[1/8] Git state"
if [ -z "$(git status --porcelain | grep -v '\.claude/settings.local.json')" ]; then
  pass "working tree clean"
else
  fail "working tree dirty:"
  git status --short | grep -v '\.claude/settings.local.json' | head -5 | sed 's/^/      /'
fi
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main 2>/dev/null || echo none)" ]; then
  pass "local main matches origin/main"
else
  warn "local main differs from origin/main"
  info "git push origin main first if you have unpushed commits"
fi

# 2. Cargo state
echo ""
echo "[2/8] Rust workspace"
if cargo check --workspace 2>&1 | tail -1 | grep -q "Finished"; then
  pass "cargo check --workspace green"
else
  fail "cargo check --workspace failed — fix before tagging"
fi

# 3. CLI tests
echo ""
echo "[3/8] CLI tests"
test_result=$(cargo test -p agiworkforce-cli --bin agiworkforce 2>&1 | grep "test result" | tail -1)
if echo "$test_result" | grep -q "0 failed"; then
  pass "$test_result"
else
  fail "tests failing: $test_result"
fi

# 4. Release binary
echo ""
echo "[4/8] Release binary"
cargo build --release -p agiworkforce-cli 2>&1 | tail -1 | grep -q "Finished" && pass "release build green" || fail "release build failed"
binary="./target/release/agiworkforce"
if [ -x "$binary" ]; then
  ver=$($binary --version)
  cargo_ver=$(grep -E '^version' apps/cli/Cargo.toml | head -1 | cut -d'"' -f2)
  npm_ver=$(node -p "require('./apps/cli/npm/package.json').version" 2>/dev/null)
  if echo "$ver" | grep -q "$cargo_ver"; then
    pass "binary version: $ver"
  else
    fail "binary reports $ver but Cargo.toml says $cargo_ver"
  fi
  if [ "$cargo_ver" = "$npm_ver" ]; then
    pass "Cargo.toml + npm package.json versions match ($cargo_ver)"
  else
    fail "version mismatch: Cargo.toml=$cargo_ver, npm=$npm_ver"
  fi
else
  fail "binary not found at $binary"
fi

# 5. Smoke test all 22 subcommands respond to --help
echo ""
echo "[5/8] Subcommand smoke test (22 expected)"
sub_count=$($binary -h 2>&1 | grep -E "^  [a-z]+" | wc -l | tr -d ' ')
if [ "$sub_count" = "23" ]; then
  pass "all 22 subcommands + 'help' present"
else
  fail "expected 23 subcommands+help, got $sub_count"
fi
$binary --list-models 2>&1 | grep -q "ANTHROPIC" && pass "--list-models works" || fail "--list-models broken"
$binary --dump-system-prompt 2>&1 | head -5 | grep -qE "^(You are|<|Yo|.+)" && pass "--dump-system-prompt produces output" || fail "--dump-system-prompt broken"

# 6. CI workflow files exist
echo ""
echo "[6/8] CI workflows"
for f in .github/workflows/release-cli.yml .github/workflows/ci.yml; do
  if [ -f "$f" ]; then
    pass "$f exists"
  else
    fail "$f missing"
  fi
done

# 7. Required GitHub secrets (can't actually check, but warn)
echo ""
echo "[7/8] GitHub secrets (requires manual check)"
warn "verify these secrets are set in github repo settings:"
info "https://github.com/siddharthanagula3/agiworkforce/settings/secrets/actions"
info "  - NPM_TOKEN (npm automation token)"
info "  - APPLE_CERTIFICATE + APPLE_CERTIFICATE_PASSWORD + APPLE_SIGNING_IDENTITY (for desktop, optional now)"
info "  - APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID (for notarization, optional now)"
info "  - TAURI_SIGNING_PRIVATE_KEY + TAURI_SIGNING_PRIVATE_KEY_PASSWORD (auto-update, optional now)"

# 8. Required external resources
echo ""
echo "[8/8] External resources (requires manual check)"
warn "verify these external accounts/repos exist:"
info "  - npm @agiworkforce scope: https://www.npmjs.com/settings/agiworkforce/packages"
info "    (your npm account must have publish access)"
info "  - Homebrew tap repo: https://github.com/siddharthanagula3/homebrew-tap"
info "    (must exist with at least a README)"
info "  - clone tap locally: ~/code/homebrew-tap (for update-homebrew-tap.sh)"

# Summary
echo ""
echo "=== SUMMARY ==="
if [ "$FAILS" -eq 0 ]; then
  echo -e "${green}ALL AUTOMATED CHECKS PASS.${nc}"
  echo ""
  echo "Next steps:"
  echo "  1. Confirm GitHub secrets + external resources are set up (see [7] + [8] above)"
  echo "  2. git tag v-cli-1.0.0"
  echo "  3. git push origin v-cli-1.0.0"
  echo "  4. gh run watch  # release-cli.yml runs ~15 min"
  echo "  5. ./scripts/update-homebrew-tap.sh 1.0.0"
  echo "  6. Post launch threads from docs/launch/"
  echo ""
  echo "See docs/HANDOFF.md for full launch runbook."
  exit 0
else
  echo -e "${red}$FAILS check(s) failed.${nc} Fix before tagging."
  exit 1
fi
