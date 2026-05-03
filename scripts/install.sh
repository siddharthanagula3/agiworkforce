#!/bin/bash
# AGI Workforce CLI — Install Script
# Usage: curl -fsSL https://agiworkforce.com/install.sh | bash
#
# Options:
#   --version VERSION    Install a specific version (default: latest)
#   --no-modify-path     Skip adding to PATH
#   --install-dir DIR    Custom install directory (default: ~/.agiworkforce/bin)

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

GITHUB_REPO="siddharthanagula3/agiworkforce"
BINARY_NAME="agiworkforce"
DEFAULT_INSTALL_DIR="$HOME/.agiworkforce/bin"
# CLI release tags use the v-cli-X.Y.Z scheme (separate from desktop's v-desktop-*).
# Override via --tag-prefix if a future channel uses a different scheme.
TAG_PREFIX="v-cli-"

# ── Parse arguments ───────────────────────────────────────────────────────────
VERSION=""
MODIFY_PATH=true
INSTALL_DIR="$DEFAULT_INSTALL_DIR"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version|-v)    VERSION="$2"; shift 2 ;;
    --no-modify-path) MODIFY_PATH=false; shift ;;
    --install-dir)   INSTALL_DIR="$2"; shift 2 ;;
    *)               shift ;;
  esac
done

# ── Platform detection ────────────────────────────────────────────────────────
detect_platform() {
  local os arch

  case "$(uname -s)" in
    Darwin*)  os="darwin" ;;
    Linux*)   os="linux" ;;
    MINGW*|MSYS*|CYGWIN*) os="windows" ;;
    *)        echo -e "${RED}Unsupported OS: $(uname -s)${NC}"; exit 1 ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64)  arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)             echo -e "${RED}Unsupported architecture: $(uname -m)${NC}"; exit 1 ;;
  esac

  # Detect Rosetta on macOS (running x86_64 on arm64 hardware)
  if [ "$os" = "darwin" ] && [ "$arch" = "x64" ]; then
    if sysctl -n sysctl.proc_translated 2>/dev/null | grep -q 1; then
      arch="arm64"
      echo -e "${YELLOW}Rosetta detected — installing native arm64 binary${NC}"
    fi
  fi

  # Detect musl libc on Linux
  local libc=""
  if [ "$os" = "linux" ]; then
    if ldd --version 2>&1 | grep -qi musl; then
      libc="-musl"
    fi
  fi

  echo "${os}-${arch}${libc}"
}

# ── Version resolution ────────────────────────────────────────────────────────
resolve_version() {
  if [ -n "$VERSION" ]; then
    echo "$VERSION"
    return
  fi

  echo -e "${BLUE}Fetching latest CLI version...${NC}" >&2

  # CLI releases use v-cli-X.Y.Z tag scheme. /releases/latest returns the
  # newest release across ALL channels (CLI + desktop), so filter by prefix.
  local latest
  latest=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20" 2>/dev/null \
    | grep '"tag_name"' \
    | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/' \
    | grep "^${TAG_PREFIX}" \
    | head -1)

  if [ -z "$latest" ]; then
    echo -e "${YELLOW}Could not fetch latest CLI version. Defaulting to ${TAG_PREFIX}1.0.0${NC}" >&2
    echo "${TAG_PREFIX}1.0.0"
    return
  fi

  echo "$latest"
}

# ── Download with progress ────────────────────────────────────────────────────
download_binary() {
  local platform="$1"
  local version="$2"
  local ext="tar.gz"

  if [[ "$platform" == windows-* ]]; then
    ext="zip"
  fi

  # release-cli.yml produces archives named agiworkforce-{platform}.{ext}
  # (no version in filename — version is in the tag/path). Match that.
  local filename="${BINARY_NAME}-${platform}.${ext}"
  local url="https://github.com/${GITHUB_REPO}/releases/download/${version}/${filename}"
  local tmpdir
  tmpdir=$(mktemp -d)

  echo -e "${BLUE}Downloading ${BOLD}${BINARY_NAME}${NC}${BLUE} ${version} for ${platform}...${NC}"
  echo -e "${CYAN}  ${url}${NC}"

  if ! curl -fsSL --progress-bar -o "${tmpdir}/${filename}" "$url" 2>&1; then
    echo -e "${RED}Download failed.${NC}"
    echo ""
    echo "This could mean:"
    echo "  - The version ${version} doesn't have pre-built binaries yet"
    echo "  - Your platform (${platform}) is not supported"
    echo ""
    echo "You can build from source instead:"
    echo "  cargo install --git https://github.com/${GITHUB_REPO} agiworkforce-cli"
    rm -rf "$tmpdir"
    exit 1
  fi

  # Extract
  mkdir -p "$INSTALL_DIR"
  echo -e "${BLUE}Installing to ${INSTALL_DIR}...${NC}"

  if [ "$ext" = "tar.gz" ]; then
    tar -xzf "${tmpdir}/${filename}" -C "$INSTALL_DIR"
  else
    unzip -qo "${tmpdir}/${filename}" -d "$INSTALL_DIR"
  fi

  chmod +x "${INSTALL_DIR}/${BINARY_NAME}" 2>/dev/null || true
  rm -rf "$tmpdir"
}

# ── PATH modification ─────────────────────────────────────────────────────────
add_to_path() {
  if [ "$MODIFY_PATH" != "true" ]; then
    return
  fi

  # Already in PATH?
  if echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    return
  fi

  local shell_name
  shell_name=$(basename "${SHELL:-/bin/bash}")
  local export_line="export PATH=\"${INSTALL_DIR}:\$PATH\""

  local config_files=""
  case "$shell_name" in
    fish)
      export_line="fish_add_path ${INSTALL_DIR}"
      config_files="$HOME/.config/fish/config.fish"
      ;;
    zsh)
      config_files="${ZDOTDIR:-$HOME}/.zshrc"
      ;;
    bash)
      config_files="$HOME/.bashrc $HOME/.bash_profile"
      ;;
    *)
      config_files="$HOME/.profile"
      ;;
  esac

  for config_file in $config_files; do
    if [ -f "$config_file" ]; then
      if ! grep -q "$INSTALL_DIR" "$config_file" 2>/dev/null; then
        echo "" >> "$config_file"
        echo "# AGI Workforce CLI" >> "$config_file"
        echo "$export_line" >> "$config_file"
        echo -e "${GREEN}Added to PATH in ${config_file}${NC}"
      fi
      break
    fi
  done

  # Also add to current session
  export PATH="${INSTALL_DIR}:$PATH"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${BOLD}${CYAN}  AGI Workforce CLI Installer${NC}"
  echo -e "  ${BLUE}One app, every AI model, full desktop control${NC}"
  echo ""

  local platform version

  platform=$(detect_platform)
  version=$(resolve_version)

  echo -e "  Platform:  ${BOLD}${platform}${NC}"
  echo -e "  Version:   ${BOLD}${version}${NC}"
  echo -e "  Directory: ${BOLD}${INSTALL_DIR}${NC}"
  echo ""

  download_binary "$platform" "$version"
  add_to_path

  # Verify installation
  if command -v "$BINARY_NAME" &>/dev/null; then
    local installed_version
    installed_version=$("$BINARY_NAME" --version 2>/dev/null || echo "unknown")
    echo ""
    echo -e "${GREEN}${BOLD}Installation complete!${NC}"
    echo -e "  ${installed_version}"
    echo ""
    echo -e "  Get started: ${BOLD}agiworkforce${NC}"
    echo -e "  Quick run:   ${BOLD}agiworkforce exec \"explain this codebase\"${NC}"
    echo -e "  Help:        ${BOLD}agiworkforce --help${NC}"
  else
    echo ""
    echo -e "${GREEN}${BOLD}Binary installed to ${INSTALL_DIR}/${BINARY_NAME}${NC}"
    echo ""
    echo -e "  ${YELLOW}Restart your shell or run:${NC}"
    echo -e "  ${BOLD}export PATH=\"${INSTALL_DIR}:\$PATH\"${NC}"
    echo ""
    echo -e "  Then: ${BOLD}agiworkforce --help${NC}"
  fi

  echo ""
}

main "$@"
