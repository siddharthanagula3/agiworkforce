#!/usr/bin/env bash
# Shared helpers for AGI mobile release scripts.
# Not executed directly — sourced by release:* scripts.

set -euo pipefail

# --- Resolve paths --------------------------------------------------------

# Resolve the mobile app root relative to this file so the scripts work
# regardless of CWD (pnpm filter, npm, direct shell, CI).
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_ROOT="$(cd "${MOBILE_DIR}/../.." && pwd)"
SECRETS_DIR="${MOBILE_DIR}/secrets"

export MOBILE_DIR REPO_ROOT SECRETS_DIR

# --- Logging --------------------------------------------------------------

log()      { printf '\033[1;34m[release]\033[0m %s\n' "$*"; }
log_ok()   { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
log_warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
log_err()  { printf '\033[1;31m[err]\033[0m %s\n' "$*" >&2; }
die()      { log_err "$*"; exit 1; }

# --- Preflight ------------------------------------------------------------

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1 — see scripts/release/EAS_SIGNING_RUNBOOK.md"
}

require_env() {
  local var="$1"
  if [[ -z "${!var:-}" ]]; then
    die "missing required env var: $var — see scripts/release/EAS_SIGNING_RUNBOOK.md"
  fi
}

require_file() {
  [[ -f "$1" ]] || die "missing required file: $1 — see scripts/release/EAS_SIGNING_RUNBOOK.md"
}

# Verify the working tree is clean (EAS requireCommit will reject otherwise,
# but failing fast here gives a clearer error).
require_clean_git() {
  if [[ "${EAS_SKIP_CLEAN_CHECK:-0}" == "1" ]]; then
    log_warn "EAS_SKIP_CLEAN_CHECK=1 — skipping git clean check"
    return 0
  fi
  if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
    die "git working tree is dirty — commit or stash before release (or set EAS_SKIP_CLEAN_CHECK=1 for a local dry-run)"
  fi
}

require_eas_login() {
  if ! eas whoami >/dev/null 2>&1; then
    die "not logged in to EAS — run: eas login"
  fi
}

# --- EAS helpers ----------------------------------------------------------

eas_build() {
  local platform="$1"
  local profile="$2"
  shift 2
  log "eas build --platform ${platform} --profile ${profile} $*"
  (cd "${MOBILE_DIR}" && eas build --platform "${platform}" --profile "${profile}" --non-interactive "$@")
}

eas_submit() {
  local platform="$1"
  local profile="$2"
  shift 2
  log "eas submit --platform ${platform} --profile ${profile} $*"
  (cd "${MOBILE_DIR}" && eas submit --platform "${platform}" --profile "${profile}" --non-interactive "$@")
}
