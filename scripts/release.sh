#!/usr/bin/env bash
# Create the canonical desktop product tag. GitHub Actions owns validation,
# signing, artifact creation, updater ingestion, and release publication.
#
# Usage:
#   bash scripts/release.sh [version]          # validate and print the plan
#   bash scripts/release.sh [version] --yes    # create and push the tag

set -euo pipefail

VERSION=""
CONFIRM=0
for arg in "$@"; do
  case "$arg" in
    --yes) CONFIRM=1 ;;
    --help|-h)
      sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "ERROR: unknown option: $arg" >&2
      exit 2
      ;;
    *)
      if [ -n "$VERSION" ]; then
        echo "ERROR: provide at most one desktop version" >&2
        exit 2
      fi
      VERSION="$arg"
      ;;
  esac
done

if [ -z "$VERSION" ]; then
  VERSION=$(node -p "require('./apps/desktop/src-tauri/tauri.conf.json').version")
fi
VERSION="${VERSION#v-desktop-}"
VERSION="${VERSION#v}"

if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?(\+[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$'; then
  echo "ERROR: invalid desktop SemVer: $VERSION" >&2
  exit 1
fi

TAG="v-desktop-${VERSION}"
PACKAGE_VERSION=$(node -p "require('./apps/desktop/package.json').version")
TAURI_VERSION=$(node -p "require('./apps/desktop/src-tauri/tauri.conf.json').version")
CARGO_VERSION=$(sed -n 's/^version = "\([^"]*\)"/\1/p' apps/desktop/src-tauri/Cargo.toml | head -1)
for source_version in "$PACKAGE_VERSION" "$TAURI_VERSION" "$CARGO_VERSION"; do
  if [ "$source_version" != "$VERSION" ]; then
    echo "ERROR: $TAG does not match desktop source version $source_version" >&2
    exit 1
  fi
done

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: refusing to tag a dirty working tree" >&2
  exit 1
fi
if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  echo "ERROR: local tag already exists: $TAG" >&2
  exit 1
fi
if git ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null 2>&1; then
  echo "ERROR: remote tag already exists: $TAG" >&2
  exit 1
fi

VERSION_WITHOUT_BUILD="${VERSION%%+*}"
if [[ "$VERSION_WITHOUT_BUILD" == *-* ]]; then
  CHANNEL="prerelease"
else
  CHANNEL="stable"
fi

echo "Desktop release plan"
echo "  tag:     $TAG"
echo "  channel: $CHANNEL"
echo "  commit:  $(git rev-parse HEAD)"
echo "  action:  .github/workflows/release-desktop.yml"

if [ "$CONFIRM" != "1" ]; then
  echo "Validation only; re-run with --yes to create and push the tag."
  exit 0
fi

git tag -a "$TAG" -m "Release desktop $VERSION"
git push origin "$TAG"
echo "Pushed $TAG; the canonical desktop release workflow is now responsible for publication."
