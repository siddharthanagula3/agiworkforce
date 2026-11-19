#!/usr/bin/env bash
# scripts/launch-readiness-check.sh, Verify the repository is ready for the CLI release tag
# v-cli-<version>, where <version> is the [package] version in apps/cli/Cargo.toml.
#
# Run this right before tagging; it checks the steps of docs/runbooks/cli-release.md.
# Rust is compiled only on GitHub, so the build proof is a successful manual run of
# release-cli.yml on this commit, not a local build.
#
# Usage: bash scripts/launch-readiness-check.sh

set -u

green='\033[0;32m'
red='\033[0;31m'
yellow='\033[1;33m'
nc='\033[0m'

pass() { echo -e "  ${green}✓${nc} $1"; }
fail() { echo -e "  ${red}✗${nc} $1"; FAILS=$((FAILS + 1)); }
warn() { echo -e "  ${yellow}!${nc} $1"; }
info() { echo "    $1"; }

FAILS=0
REPO="siddharthanagula3/agiworkforce"
INSTALLER="apps/web/public/install.sh"
INSTALLER_URL="https://agiworkforce.com/install.sh"

cd "$(dirname "$0")/.." || exit 1

echo "=== CLI LAUNCH READINESS CHECK ==="
echo ""

echo "[1/7] Git state"
if [ -z "$(git status --porcelain | grep -v '\.claude/settings.local.json')" ]; then
  pass "working tree clean"
else
  fail "working tree dirty:"
  git status --short | grep -v '\.claude/settings.local.json' | head -5 | sed 's/^/      /'
fi
HEAD_SHA=$(git rev-parse HEAD)
if [ "$HEAD_SHA" = "$(git rev-parse origin/main 2>/dev/null || echo none)" ]; then
  pass "HEAD is origin/main ($HEAD_SHA)"
else
  fail "HEAD is not origin/main; tag a commit that is on main"
fi

echo ""
echo "[2/7] Version and tag"
VERSION=$(node -e '
const source = require("node:fs").readFileSync("apps/cli/Cargo.toml", "utf8");
const match = /^\[package\][\s\S]*?^version = "([^"]+)"/m.exec(source);
if (!match) process.exit(1);
console.log(match[1]);
' 2>/dev/null) || VERSION=""
if [ -z "$VERSION" ]; then
  fail "apps/cli/Cargo.toml has no [package] version"
  TAG="v-cli-<version>"
else
  TAG="v-cli-${VERSION}"
  pass "apps/cli/Cargo.toml is ${VERSION}, so the tag is ${TAG}"
  LOCKED=$(grep -A1 '^name = "agiworkforce-cli"$' Cargo.lock | sed -n 's/^version = "\(.*\)"$/\1/p')
  if [ "$LOCKED" = "$VERSION" ]; then
    pass "Cargo.lock records agiworkforce-cli ${LOCKED}"
  else
    fail "Cargo.lock records agiworkforce-cli ${LOCKED:-nothing}, not ${VERSION}"
  fi
  if [ -n "$(git ls-remote --tags origin "refs/tags/${TAG}" 2>/dev/null)" ]; then
    fail "${TAG} already exists on origin; bump the version in apps/cli/Cargo.toml"
  else
    pass "${TAG} is not taken on origin"
  fi
fi

echo ""
echo "[3/7] Release build matrix proven on this commit"
if ! command -v gh >/dev/null 2>&1; then
  fail "gh is not installed, so the release workflow runs cannot be read"
else
  DRY_RUN=$(gh run list --repo "$REPO" --workflow release-cli.yml --event workflow_dispatch \
    --commit "$HEAD_SHA" --status success --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null)
  if [ -n "$DRY_RUN" ]; then
    pass "manual release-cli.yml run ${DRY_RUN} built and smoked every archive"
  else
    fail "no successful manual release-cli.yml run on ${HEAD_SHA}"
    info "gh workflow run release-cli.yml --repo ${REPO} --ref main"
  fi
fi

echo ""
echo "[4/7] Release signing key pinned"
if pinned_key=$(node scripts/release/check-pinned-release-key.mjs 2>&1); then
  pass "$pinned_key"
else
  fail "no usable release signing key is pinned in ${INSTALLER}"
  echo "$pinned_key" | head -4 | sed 's/^/      /'
fi

echo ""
echo "[5/7] Website serves the pinned key"
pinned_keys_of() {
  node --input-type=module -e '
import { readFileSync } from "node:fs";
import { pinnedReleaseKeys } from "./scripts/lib/rollout/pinned-release-keys.mjs";
console.log(pinnedReleaseKeys(readFileSync(0, "utf8")).join("\n"));
'
}
LOCAL_KEYS=$(pinned_keys_of < "$INSTALLER")
LIVE_KEYS=$(curl -fsSL "$INSTALLER_URL" 2>/dev/null | pinned_keys_of)
if [ -z "$LOCAL_KEYS" ]; then
  fail "nothing to compare: ${INSTALLER} pins no key"
elif [ "$LOCAL_KEYS" = "$LIVE_KEYS" ]; then
  pass "${INSTALLER_URL} pins the same keys as ${INSTALLER}"
else
  fail "${INSTALLER_URL} does not pin the keys in ${INSTALLER}; deploy the web app first"
fi

echo ""
echo "[6/7] GitHub repository and secrets"
if [ "$(gh repo view "$REPO" --json visibility --jq .visibility 2>/dev/null)" = "PUBLIC" ]; then
  pass "${REPO} is public, so install.sh and agi update can download release assets"
else
  fail "${REPO} is not readable as public; release assets must download anonymously"
fi
if gh secret list --repo "$REPO" --json name --jq '.[].name' 2>/dev/null | grep -qx AGI_CLI_RELEASE_SIGNING_KEY; then
  pass "repository secret AGI_CLI_RELEASE_SIGNING_KEY is set"
else
  warn "could not confirm the repository secret AGI_CLI_RELEASE_SIGNING_KEY (listing secrets needs admin rights)"
  info "https://github.com/${REPO}/settings/secrets/actions"
fi
info "optional: secrets SENTRY_DSN_CLI, SENTRY_AUTH_TOKEN; variables SENTRY_ORG, SENTRY_PROJECT_CLI"

# A release cannot be completed while audit/registers/known-flaws.md has an open row
# or audit/blockers/ has a file.
echo ""
echo "[7/7] Known flaws and release blockers"
if audit_progress=$(node scripts/check-audit-progress.mjs 2>&1); then
  pass "$audit_progress"
else
  fail "open work is not release-clean, see audit/registers/known-flaws.md and audit/blockers/"
  echo "$audit_progress" | head -8 | sed 's/^/      /'
fi

echo ""
echo "=== SUMMARY ==="
if [ "$FAILS" -eq 0 ]; then
  echo -e "${green}ALL AUTOMATED CHECKS PASS.${nc}"
  echo ""
  echo "Next steps (docs/runbooks/cli-release.md, steps 6 to 9):"
  echo "  1. git tag ${TAG} ${HEAD_SHA}"
  echo "  2. git push origin ${TAG}"
  echo "  3. gh run watch \"\$(gh run list --workflow release-cli.yml --limit 1 --json databaseId --jq '.[0].databaseId')\""
  echo "  4. Verify the install on macOS, Linux and Windows Git Bash (runbook step 7)"
  echo "  5. Mark the CLI released in apps/web/lib/surface-status.ts and its test, then deploy the web app"
  exit 0
else
  echo -e "${red}$FAILS check(s) failed.${nc} Fix before tagging."
  exit 1
fi
