#!/usr/bin/env bash
# scripts/publish-cli.sh, Publish @agiworkforce/cli + 6 platform binaries to npm.
#
# Every gate below is a function so scripts/publish-cli.test.mjs can run it
# against fixtures. Sourcing this file with PUBLISH_CLI_LIB_ONLY=1 defines the
# functions and returns without publishing anything.
#
# Prerequisites:
#   - NPM_TOKEN env var (or `npm login` already done)
#   - Platform binaries staged under dist/cli/<platform>/bin
#   - A clean tree checked out at the release tag (v-cli-X.Y.Z)
#
# Usage:
#   ./scripts/publish-cli.sh --dry-run   # print the plan and exit before npm
#   ./scripts/publish-cli.sh             # run every gate, then confirm
#   ./scripts/publish-cli.sh --yes       # run every gate, skip the confirm

set -euo pipefail

PLATFORMS=(
  "darwin-arm64"
  "darwin-x64"
  "linux-arm64"
  "linux-x64"
  "win32-arm64"
  "win32-x64"
)

fail() {
  echo "ERROR: $1" >&2
  return 1
}

cargo_version() {
  sed -n 's/^version = "\([^"]*\)"/\1/p' "$1/apps/cli/Cargo.toml" | head -1
}

npm_wrapper_version() {
  node -p "require('$1/apps/cli/npm/package.json').version"
}

# The version a release tag publishes. Anything that is not v-cli-X.Y.Z with an
# optional prerelease and build metadata is refused, so a mistyped tag cannot
# reach the registry as a version nobody meant.
version_for_tag() {
  local tag="$1"
  local version="${tag#v-cli-}"
  if [ "$tag" != "v-cli-${version}" ]; then
    fail "CLI release tags must use v-cli-X.Y.Z, not $tag"
    return 1
  fi
  if ! printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?(\+[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$'; then
    fail "invalid CLI release tag: $tag"
    return 1
  fi
  printf '%s' "$version"
}

# A prerelease version publishes to `next`, everything else to `latest`. The
# same derivation lives in scripts/lib/rollout/channels.mjs, which the workflow
# cross-checks against; they must never disagree.
expected_dist_tag() {
  local version_without_build="${1%%+*}"
  if [[ "$version_without_build" == *-* ]]; then
    printf 'next'
  else
    printf 'latest'
  fi
}

# One version, in three places. A tag that disagrees with either manifest means
# the binaries about to be published are not the ones the tag names.
assert_versions_agree() {
  local cargo="$1" npm_version="$2" tag_version="$3"
  if [ "$cargo" != "$npm_version" ]; then
    fail "Cargo.toml version ($cargo) != npm package.json version ($npm_version)"
    return 1
  fi
  if [ -n "$tag_version" ] && [ "$cargo" != "$tag_version" ]; then
    fail "release tag names $tag_version but the CLI manifests say $cargo"
    return 1
  fi
}

assert_dist_tag_matches_version() {
  local version="$1" dist_tag="$2" expected
  expected=$(expected_dist_tag "$version")
  if [ "$dist_tag" != "$expected" ]; then
    fail "npm dist-tag '$dist_tag' contradicts version $version; expected '$expected'"
    return 1
  fi
}

# A published artifact has to be reproducible from a commit. A tree with
# uncommitted or untracked work publishes bytes that exist on one machine.
assert_clean_tree() {
  local root="$1" dirty
  dirty=$(git -C "$root" status --porcelain 2>/dev/null) || {
    fail "cannot read the git status of $root"
    return 1
  }
  if [ -n "$dirty" ]; then
    fail "the tree is dirty; publish from a clean checkout of the release tag"
    return 1
  fi
}

# The commit being published must be the one the release tag points at. A
# publish from a branch head ships whatever landed after the tag was cut.
assert_release_ref() {
  local root="$1" tag="$2" tag_commit head_commit
  if [ -z "$tag" ]; then
    fail "no release tag given; publish from a checkout of v-cli-X.Y.Z"
    return 1
  fi
  tag_commit=$(git -C "$root" rev-list -n 1 "$tag" 2>/dev/null) || {
    fail "release tag $tag does not exist in this repository"
    return 1
  }
  head_commit=$(git -C "$root" rev-parse HEAD 2>/dev/null) || {
    fail "cannot resolve HEAD in $root"
    return 1
  }
  if [ "$tag_commit" != "$head_commit" ]; then
    fail "HEAD ($head_commit) is not the commit release tag $tag points at ($tag_commit)"
    return 1
  fi
}

# Someone installing this version has to be able to read what changed in it.
assert_changelog_entry() {
  local root="$1" version="$2"
  if ! grep -Fq "$version" "$root/CHANGELOG.md" 2>/dev/null; then
    fail "CHANGELOG.md has no entry naming $version"
    return 1
  fi
}

# Every platform ships or none does: a partial release leaves the wrapper
# resolving an optional dependency that was never published.
assert_platform_binaries() {
  local root="$1" platform
  for platform in "${PLATFORMS[@]}"; do
    if [ ! -d "$root/dist/cli/$platform/bin" ]; then
      fail "missing dist/cli/$platform/bin, build platform binaries first via release-cli.yml CI or scripts/build-cli-binaries.sh"
      return 1
    fi
    if [ -z "$(ls -A "$root/dist/cli/$platform/bin" 2>/dev/null)" ]; then
      fail "dist/cli/$platform/bin is empty"
      return 1
    fi
  done
}

# What the release actually consists of, recorded before it happens and again
# after, so a publish can be matched against the bytes it shipped.
publish_receipt() {
  local root="$1" version="$2" dist_tag="$3" platform
  printf '@agiworkforce/cli@%s -> npm dist-tag %s\n' "$version" "$dist_tag"
  printf 'commit %s\n' "$(git -C "$root" rev-parse HEAD 2>/dev/null || printf 'unknown')"
  for platform in "${PLATFORMS[@]}"; do
    local binary
    for binary in "$root/dist/cli/$platform/bin"/*; do
      [ -e "$binary" ] || continue
      printf '%s  %s/%s\n' \
        "$(sha256sum <"$binary" 2>/dev/null | cut -d' ' -f1 || shasum -a 256 <"$binary" | cut -d' ' -f1)" \
        "$platform" \
        "$(basename "$binary")"
    done
  done
}

write_platform_manifest() {
  local root="$1" platform="$2" version="$3"
  local bin_dir="$root/dist/cli/$platform"
  cat >"$bin_dir/package.json" <<EOF
{
  "name": "@agiworkforce/cli-$platform",
  "version": "$version",
  "description": "AGI Workforce CLI, native binary for $platform",
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
}

# Every gate, in one place, so --dry-run runs exactly what a real publish runs.
run_release_gates() {
  local root="$1" tag="$2" dist_tag="$3"
  local cargo npm_version tag_version
  cargo=$(cargo_version "$root")
  npm_version=$(npm_wrapper_version "$root")
  tag_version=$(version_for_tag "$tag")
  assert_versions_agree "$cargo" "$npm_version" "$tag_version"
  assert_dist_tag_matches_version "$cargo" "$dist_tag"
  assert_release_ref "$root" "$tag"
  assert_clean_tree "$root"
  assert_changelog_entry "$root" "$cargo"
  assert_platform_binaries "$root"
}

if [ -n "${PUBLISH_CLI_LIB_ONLY:-}" ]; then
  return 0
fi

ROOT=$(git rev-parse --show-toplevel)
RELEASE_TAG="${RELEASE_TAG:-$(git -C "$ROOT" describe --tags --exact-match 2>/dev/null || true)}"
VERSION=$(cargo_version "$ROOT")
NPM_DIST_TAG="${NPM_DIST_TAG:-$(expected_dist_tag "$VERSION")}"

run_release_gates "$ROOT" "$RELEASE_TAG" "$NPM_DIST_TAG"

for platform in "${PLATFORMS[@]}"; do
  write_platform_manifest "$ROOT" "$platform" "$VERSION"
done

echo "========================================"
echo "  @agiworkforce/cli@$VERSION -> $NPM_DIST_TAG"
echo "========================================"
echo ""
publish_receipt "$ROOT" "$VERSION" "$NPM_DIST_TAG"
echo ""
echo "Packages to publish:"
echo "  @agiworkforce/cli@$VERSION (wrapper)"
for platform in "${PLATFORMS[@]}"; do
  echo "  @agiworkforce/cli-$platform@$VERSION (platform binary)"
done

if [ "${1:-}" = "--dry-run" ]; then
  echo ""
  echo "Dry run: nothing was published."
  exit 0
fi

# Pack every tarball before the first irreversible publish, so a late packaging
# failure cannot leave a partial release. The seven writes are still not atomic.
for platform in "${PLATFORMS[@]}"; do
  (cd "$ROOT/dist/cli/$platform" && npm pack --dry-run >/dev/null)
done
(cd "$ROOT/apps/cli/npm" && npm pack --dry-run >/dev/null)

if [ "${1:-}" != "--yes" ]; then
  echo ""
  read -rp "Publish 7 packages to npm? [y/N] " confirm
  if [ "$confirm" != "y" ]; then
    echo "Aborted."
    exit 0
  fi
fi

for platform in "${PLATFORMS[@]}"; do
  echo ""
  echo "→ Publishing @agiworkforce/cli-$platform@$VERSION..."
  (cd "$ROOT/dist/cli/$platform" && npm publish --access public --tag "$NPM_DIST_TAG")
done

echo ""
echo "→ Publishing @agiworkforce/cli@$VERSION (wrapper)..."
(cd "$ROOT/apps/cli/npm" && npm publish --access public --tag "$NPM_DIST_TAG")

echo ""
echo "========================================"
echo "  Published 7 packages to npm"
echo "========================================"
echo ""
publish_receipt "$ROOT" "$VERSION" "$NPM_DIST_TAG"
echo ""
echo "Verify with:"
echo "  npm view @agiworkforce/cli versions"
echo "  npm install -g @agiworkforce/cli@$VERSION"
echo "  agi --version"
