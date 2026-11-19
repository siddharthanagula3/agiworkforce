#!/bin/bash
# AGI CLI installer
# Usage: curl -fsSL https://agiworkforce.com/install.sh | bash
#
# Options:
#   --version VERSION    Install a specific version (default: the newest release)
#   --install-dir DIR    Install directory (default: ~/.agi/bin)
#   --no-modify-path     Leave shell profiles unchanged
#
# Windows needs Git Bash, MSYS2, Cygwin or WSL: PowerShell and cmd.exe cannot
# run this script.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

GITHUB_REPO="siddharthanagula3/agiworkforce"
RELEASE_FEED_URL="https://agiworkforce.com/api/releases/cli/latest"
BINARY_NAME="agi"
LEGACY_BINARY_NAME="agiworkforce"
ARCHIVE_BASENAME="agiworkforce"
DEFAULT_INSTALL_DIR="$HOME/.agi/bin"
TAG_PREFIX="v-cli-"
MIN_GLIBC_VERSION="2.35"
RELEASE_SIGNING_KEY=''

VERSION=""
MODIFY_PATH=true
INSTALL_DIR="$DEFAULT_INSTALL_DIR"
WORK_DIR=""
PATH_STATUS=""
PATH_LINE=""
PROFILE_FILE=""

fail() {
  echo -e "${RED}$1${NC}" >&2
  exit 1
}

cleanup() {
  if [ -n "$WORK_DIR" ]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version|-v)
      [ $# -ge 2 ] || fail "--version needs a value."
      VERSION="$2"
      shift 2
      ;;
    --install-dir)
      [ $# -ge 2 ] || fail "--install-dir needs a value."
      INSTALL_DIR="$2"
      shift 2
      ;;
    --no-modify-path)
      MODIFY_PATH=false
      shift
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

version_at_least() {
  awk -v have="$1" -v need="$2" 'BEGIN {
    split(have, h, "."); split(need, n, ".")
    if (h[1] + 0 != n[1] + 0) exit !(h[1] + 0 > n[1] + 0)
    exit !(h[2] + 0 >= n[2] + 0)
  }'
}

detect_platform() {
  local os arch

  case "$(uname -s)" in
    Darwin*)  os="darwin" ;;
    Linux*)   os="linux" ;;
    MINGW*|MSYS*|CYGWIN*) os="windows" ;;
    *) fail "Unsupported operating system: $(uname -s)" ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64)  arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) fail "Unsupported architecture: $(uname -m)" ;;
  esac

  if [ "$os" = "darwin" ] && [ "$arch" = "x64" ] \
    && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
    arch="arm64"
    echo -e "${YELLOW}Rosetta detected, installing the native arm64 build${NC}" >&2
  fi

  if [ "$os" = "linux" ]; then
    local libc glibc
    libc=$(ldd --version 2>&1 || true)
    case "$(printf '%s' "$libc" | tr '[:upper:]' '[:lower:]')" in
      *musl*) fail "musl-based Linux (such as Alpine) is not supported: the published builds need glibc." ;;
    esac
    glibc=$(printf '%s\n' "$libc" | awk 'NR == 1 { print $NF }')
    if [[ "$glibc" =~ ^[0-9]+\.[0-9]+$ ]] && ! version_at_least "$glibc" "$MIN_GLIBC_VERSION"; then
      fail "This Linux has glibc ${glibc}, and the published builds need glibc ${MIN_GLIBC_VERSION} or newer (Ubuntu 22.04, Debian 12 or newer). Nothing was installed."
    fi
  fi

  echo "${os}-${arch}"
}

resolve_version() {
  local requested="$VERSION"
  if [ -z "$requested" ]; then
    echo -e "${BLUE}Finding the newest CLI release...${NC}" >&2
    local response status
    response=$(curl -sSL -w $'\n%{http_code}' "$RELEASE_FEED_URL" 2>/dev/null) \
      || fail "Could not reach agiworkforce.com to find the newest release."
    status="${response##*$'\n'}"
    case "$status" in
      200) ;;
      404) fail "No signed AGI CLI release is published yet." ;;
      451) fail "AGI is not available in your region." ;;
      *) fail "The release feed answered HTTP ${status}." ;;
    esac
    requested=$(printf '%s' "${response%$'\n'*}" \
      | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
    [ -n "$requested" ] || fail "The release feed did not name a version."
  fi
  requested="${requested#"$TAG_PREFIX"}"
  [[ "$requested" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] \
    || fail "Invalid CLI version: $requested. Expected X.Y.Z."
  echo "${TAG_PREFIX}${requested}"
}

verify_manifest() {
  local manifest="$1" signature="$2" version="$3"

  [ -n "$RELEASE_SIGNING_KEY" ] \
    || fail "This installer carries no release signing key, so it cannot verify any release. No signed AGI CLI release is published yet."
  command -v openssl >/dev/null 2>&1 \
    || fail "openssl is required to verify the release signature. Install it, then run the installer again."

  local keys_dir="${WORK_DIR}/release-keys"
  mkdir -p "$keys_dir"
  printf '%s\n' "$RELEASE_SIGNING_KEY" \
    | awk -v dir="$keys_dir" '/-----BEGIN PUBLIC KEY-----/ { n++ } n { print > (dir "/" n ".pem") }'
  local key verified=false
  for key in "$keys_dir"/*.pem; do
    [ -e "$key" ] || continue
    if openssl dgst -sha256 -verify "$key" -signature "$signature" "$manifest" >/dev/null 2>&1; then
      verified=true
      break
    fi
  done
  [ "$verified" = true ] || fail "Release signature verification failed; refusing to install."

  if command -v cosign >/dev/null 2>&1; then
    local bundle="${WORK_DIR}/SHA256SUMS.sigstore.json"
    curl -fsSL -o "$bundle" \
      "https://github.com/${GITHUB_REPO}/releases/download/${version}/SHA256SUMS.sigstore.json" \
      || fail "The release's Sigstore bundle is missing; refusing to install."
    cosign verify-blob \
      --bundle "$bundle" \
      --certificate-identity "https://github.com/${GITHUB_REPO}/.github/workflows/release-cli.yml@refs/tags/${version}" \
      --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
      "$manifest" >/dev/null 2>&1 \
      || fail "Sigstore provenance verification failed; refusing to install."
  fi
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# The signed manifest names archives, not versions, so an older signed build
# could be served under a newer version. The binary's own version is covered by
# the signature, so it is what binds the archive to the version requested.
require_reported_version() {
  local binary="$1" name="$2" expected="$3" output reported shown
  output=$(AGIWORKFORCE_NO_UPDATE_CHECK=1 "$binary" --version </dev/null 2>/dev/null) \
    || fail "The downloaded ${name} did not run, so nothing was installed."
  reported=$(printf '%s\n' "$output" | tr -d '\r' | awk 'NF { print $NF; exit }')
  if [ "$reported" != "$expected" ]; then
    shown=$(printf '%s' "$reported" | LC_ALL=C tr -cd '0-9A-Za-z.+-' | cut -c 1-64)
    fail "Release ${expected} contains a ${name} that reports version ${shown:-none}; refusing to install it under another version. Nothing was installed."
  fi
}

extract_archive() {
  local archive="$1" destination="$2"
  case "$archive" in
    *.tar.gz) tar -xzf "$archive" -C "$destination" ;;
    *.zip)
      if command -v unzip >/dev/null 2>&1; then
        unzip -qo "$archive" -d "$destination"
      elif command -v powershell.exe >/dev/null 2>&1; then
        powershell.exe -NoProfile -NonInteractive -Command \
          "Expand-Archive -LiteralPath '$(cygpath -w "$archive")' -DestinationPath '$(cygpath -w "$destination")' -Force"
      else
        fail "unzip or PowerShell is required to extract the Windows archive."
      fi
      ;;
  esac
}

install_binaries() {
  local platform="$1" version="$2"
  local ext="tar.gz"
  local exe_suffix=""
  if [[ "$platform" == windows-* ]]; then
    ext="zip"
    exe_suffix=".exe"
  fi

  # Asset names follow release-cli.yml: agiworkforce-{platform}.{ext}
  local filename="${ARCHIVE_BASENAME}-${platform}.${ext}"
  WORK_DIR=$(mktemp -d)

  echo -e "${BLUE}Downloading ${BOLD}${BINARY_NAME}${NC}${BLUE} ${version#"$TAG_PREFIX"} for ${platform}...${NC}"
  curl -fsSL -o "${WORK_DIR}/${filename}" \
    "https://github.com/${GITHUB_REPO}/releases/download/${version}/${filename}" \
    || fail "Download failed: release ${version} has no build for ${platform}."

  if ! curl -fsSL -o "${WORK_DIR}/SHA256SUMS" \
    "https://github.com/${GITHUB_REPO}/releases/download/${version}/SHA256SUMS" \
    || ! curl -fsSL -o "${WORK_DIR}/SHA256SUMS.sig" \
      "https://github.com/${GITHUB_REPO}/releases/download/${version}/SHA256SUMS.sig"; then
    fail "Release signature metadata is missing; refusing to install unverified bytes."
  fi
  verify_manifest "${WORK_DIR}/SHA256SUMS" "${WORK_DIR}/SHA256SUMS.sig" "$version"

  local expected_checksum actual_checksum
  expected_checksum=$(awk -v name="$filename" '$2 == name || $2 == "*" name { print $1; exit }' "${WORK_DIR}/SHA256SUMS")
  [ -n "$expected_checksum" ] || fail "The signed checksum manifest does not list ${filename}."
  actual_checksum=$(sha256_of "${WORK_DIR}/${filename}")
  [ "$actual_checksum" = "$expected_checksum" ] \
    || fail "Archive checksum verification failed; refusing to install."
  echo -e "${GREEN}Verified the release signature and the archive's SHA-256 checksum.${NC}"

  local unpacked="${WORK_DIR}/unpacked"
  mkdir -p "$unpacked"
  extract_archive "${WORK_DIR}/${filename}" "$unpacked"
  [ -f "${unpacked}/${BINARY_NAME}${exe_suffix}" ] \
    || fail "The release archive does not contain ${BINARY_NAME}${exe_suffix}."

  local name
  for name in "$BINARY_NAME" "$LEGACY_BINARY_NAME"; do
    [ -f "${unpacked}/${name}${exe_suffix}" ] || continue
    chmod +x "${unpacked}/${name}${exe_suffix}"
    require_reported_version "${unpacked}/${name}${exe_suffix}" "${name}${exe_suffix}" "${version#"$TAG_PREFIX"}"
  done

  echo -e "${BLUE}Installing to ${INSTALL_DIR}...${NC}"
  mkdir -p "$INSTALL_DIR"
  for name in "$BINARY_NAME" "$LEGACY_BINARY_NAME"; do
    [ -f "${unpacked}/${name}${exe_suffix}" ] || continue
    mv -f "${unpacked}/${name}${exe_suffix}" "${INSTALL_DIR}/${name}${exe_suffix}"
  done
}

on_caller_path() {
  case ":${PATH}:" in
    *":${INSTALL_DIR}:"*) return 0 ;;
  esac
  return 1
}

profile_for_shell() {
  local shell_name="$1" platform="$2" candidate
  case "$shell_name" in
    fish) echo "${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish" ;;
    zsh) echo "${ZDOTDIR:-$HOME}/.zshrc" ;;
    bash)
      if [[ "$platform" == darwin-* ]]; then
        for candidate in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do
          if [ -f "$candidate" ]; then
            echo "$candidate"
            return 0
          fi
        done
        echo "$HOME/.bash_profile"
      else
        echo "$HOME/.bashrc"
      fi
      ;;
    *) echo "$HOME/.profile" ;;
  esac
}

add_to_path() {
  local platform="$1" shell_name
  shell_name=$(basename "${SHELL:-/bin/bash}")
  if [ "$shell_name" = "fish" ]; then
    PATH_LINE="fish_add_path \"${INSTALL_DIR}\""
  else
    PATH_LINE="export PATH=\"${INSTALL_DIR}:\$PATH\""
  fi
  PROFILE_FILE=$(profile_for_shell "$shell_name" "$platform")

  if on_caller_path; then
    PATH_STATUS="on-path"
  elif [ "$MODIFY_PATH" != "true" ]; then
    PATH_STATUS="manual"
  elif [ -f "$PROFILE_FILE" ] && grep -Fqx -- "$PATH_LINE" "$PROFILE_FILE"; then
    PATH_STATUS="present"
  elif { mkdir -p "$(dirname "$PROFILE_FILE")" && printf '\n# AGI CLI\n%s\n' "$PATH_LINE" >> "$PROFILE_FILE"; } 2>/dev/null; then
    PATH_STATUS="written"
  else
    PATH_STATUS="manual"
  fi
}

report_path() {
  local platform="$1" found
  case "$PATH_STATUS" in
    on-path)
      found=$(command -v "$BINARY_NAME" 2>/dev/null || true)
      if [ -n "$found" ] && [ "$(dirname "$found")" != "$INSTALL_DIR" ]; then
        printf '  %bAnother %s at %s comes first on your PATH.%b Run %b%s/%s%b, or remove the other one.\n' \
          "$YELLOW" "$BINARY_NAME" "$found" "$NC" "$BOLD" "$INSTALL_DIR" "$BINARY_NAME" "$NC"
      fi
      ;;
    written|present)
      if [ "$PATH_STATUS" = "written" ]; then
        printf '  Added %s to PATH in %s\n' "$INSTALL_DIR" "$PROFILE_FILE"
      else
        printf '  %s already adds %s to PATH\n' "$PROFILE_FILE" "$INSTALL_DIR"
      fi
      printf '  %bTo use %s, open a new terminal or run:%b\n' "$YELLOW" "$BINARY_NAME" "$NC"
      printf '    %b%s%b\n' "$BOLD" "$PATH_LINE" "$NC"
      ;;
    manual)
      printf '  %b%s is not on your PATH.%b Add this line to %s, then open a new terminal or run it here:\n' \
        "$YELLOW" "$INSTALL_DIR" "$NC" "$PROFILE_FILE"
      printf '    %b%s%b\n' "$BOLD" "$PATH_LINE" "$NC"
      ;;
  esac

  if [[ "$platform" == windows-* ]]; then
    local windows_dir
    windows_dir=$(cygpath -w "$INSTALL_DIR" 2>/dev/null || printf '%s' "$INSTALL_DIR")
    printf '  %bPowerShell and cmd.exe do not read this shell'"'"'s profile.%b To use %s there, add %b%s%b to your Windows PATH.\n' \
      "$YELLOW" "$NC" "$BINARY_NAME" "$BOLD" "$windows_dir" "$NC"
  fi
}

main() {
  echo ""
  echo -e "${BOLD}${CYAN}  AGI CLI installer${NC}"
  echo ""

  local platform version
  platform=$(detect_platform)
  version=$(resolve_version)

  echo -e "  Platform:  ${BOLD}${platform}${NC}"
  echo -e "  Version:   ${BOLD}${version#"$TAG_PREFIX"}${NC}"
  echo -e "  Directory: ${BOLD}${INSTALL_DIR}${NC}"
  echo ""

  install_binaries "$platform" "$version"
  add_to_path "$platform"

  echo ""
  echo -e "${GREEN}${BOLD}Installed ${BINARY_NAME} ${version#"$TAG_PREFIX"} to ${INSTALL_DIR}${NC}"
  report_path "$platform"
  echo -e "  Get started: ${BOLD}agi${NC}"
  echo -e "  Help:        ${BOLD}agi --help${NC}"
  echo ""
}

main "$@"
