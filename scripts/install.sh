#!/bin/bash
# AGI Workforce CLI installer
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
RELEASE_SIGNING_KEY=''

VERSION=""
MODIFY_PATH=true
INSTALL_DIR="$DEFAULT_INSTALL_DIR"
WORK_DIR=""

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

  if [ "$os" = "linux" ] && ldd --version 2>&1 | grep -qi musl; then
    fail "musl-based Linux (such as Alpine) is not supported: the published builds need glibc."
  fi

  echo "${os}-${arch}"
}

resolve_version() {
  local requested="$VERSION"
  if [ -z "$requested" ]; then
    echo -e "${BLUE}Finding the newest CLI release...${NC}" >&2
    local feed
    if ! feed=$(curl -fsSL "$RELEASE_FEED_URL" 2>/dev/null); then
      fail "No signed AGI CLI release is published yet."
    fi
    requested=$(printf '%s' "$feed" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
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

  local key_file="${WORK_DIR}/release-signing-key.pem"
  printf '%s\n' "$RELEASE_SIGNING_KEY" > "$key_file"
  openssl dgst -sha256 -verify "$key_file" -signature "$signature" "$manifest" >/dev/null 2>&1 \
    || fail "Release signature verification failed; refusing to install."

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
  mkdir -p "$unpacked" "$INSTALL_DIR"
  extract_archive "${WORK_DIR}/${filename}" "$unpacked"
  [ -f "${unpacked}/${BINARY_NAME}${exe_suffix}" ] \
    || fail "The release archive does not contain ${BINARY_NAME}${exe_suffix}."

  echo -e "${BLUE}Installing to ${INSTALL_DIR}...${NC}"
  local name
  for name in "$BINARY_NAME" "$LEGACY_BINARY_NAME"; do
    [ -f "${unpacked}/${name}${exe_suffix}" ] || continue
    chmod +x "${unpacked}/${name}${exe_suffix}"
    mv -f "${unpacked}/${name}${exe_suffix}" "${INSTALL_DIR}/${name}${exe_suffix}"
  done
}

add_to_path() {
  local platform="$1"
  [ "$MODIFY_PATH" = "true" ] || return 0

  if [[ "$platform" == windows-* ]]; then
    echo -e "${YELLOW}PowerShell and cmd.exe do not read this shell's profile.${NC}"
    echo -e "  To use ${BOLD}agi${NC} there, add ${BOLD}${INSTALL_DIR}${NC} to your Windows PATH."
    echo ""
  fi

  if echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    return 0
  fi

  local shell_name export_line config_files
  shell_name=$(basename "${SHELL:-/bin/bash}")
  export_line="export PATH=\"${INSTALL_DIR}:\$PATH\""
  case "$shell_name" in
    fish)
      export_line="fish_add_path ${INSTALL_DIR}"
      config_files="$HOME/.config/fish/config.fish"
      ;;
    zsh) config_files="${ZDOTDIR:-$HOME}/.zshrc" ;;
    bash) config_files="$HOME/.bashrc $HOME/.bash_profile" ;;
    *) config_files="$HOME/.profile" ;;
  esac

  local config_file
  for config_file in $config_files; do
    if [ -f "$config_file" ]; then
      if ! grep -q "$INSTALL_DIR" "$config_file" 2>/dev/null; then
        printf '\n# AGI Workforce CLI\n%s\n' "$export_line" >> "$config_file"
        echo -e "${GREEN}Added ${INSTALL_DIR} to PATH in ${config_file}${NC}"
      fi
      break
    fi
  done

  export PATH="${INSTALL_DIR}:$PATH"
}

main() {
  echo ""
  echo -e "${BOLD}${CYAN}  AGI Workforce CLI installer${NC}"
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
  if ! command -v "$BINARY_NAME" >/dev/null 2>&1; then
    echo -e "  ${YELLOW}Open a new shell, or run:${NC} ${BOLD}export PATH=\"${INSTALL_DIR}:\$PATH\"${NC}"
  fi
  echo -e "  Get started: ${BOLD}agi${NC}"
  echo -e "  Help:        ${BOLD}agi --help${NC}"
  echo ""
}

main "$@"
