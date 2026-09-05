#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CHAIN_CMD="${AGI_PREPUSH_CHAIN_CMD:-pnpm check:llm-operability}"
WORKTREE_PARENT="${AGI_PREPUSH_WORKTREE_PARENT:-${TMPDIR:-/tmp}/agi-prepush-worktree}"
STALE_MINUTES=120
EMPTY_TREE_SHA=4b825dc642cb6eb9a060e54bf8d69288fbee4904

mkdir -p "$WORKTREE_PARENT"
git -C "$REPO_ROOT" worktree prune >/dev/null 2>&1 || true
find "$WORKTREE_PARENT" -mindepth 1 -maxdepth 1 -type d -name 'run-*' -mmin "+$STALE_MINUTES" -exec rm -rf {} + 2>/dev/null || true
WORKTREE_DIR="$(mktemp -d "$WORKTREE_PARENT/run-XXXXXX")"

cleanup() {
  local status=$?
  git -C "$REPO_ROOT" worktree remove --force "$WORKTREE_DIR" >/dev/null 2>&1 || rm -rf "$WORKTREE_DIR"
  git -C "$REPO_ROOT" worktree prune >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT INT TERM

git -C "$REPO_ROOT" worktree add --quiet --detach "$WORKTREE_DIR" HEAD
if [ "$(git -C "$WORKTREE_DIR" rev-parse --is-bare-repository)" = "true" ]; then
  if [ "$(git -C "$REPO_ROOT" config --get extensions.worktreeConfig 2>/dev/null)" != "true" ]; then
    git -C "$REPO_ROOT" config extensions.worktreeConfig true
  fi
  git -C "$WORKTREE_DIR" config --worktree core.bare false
fi

while IFS= read -r pkg_dir; do
  [ -n "$pkg_dir" ] || continue
  [ -d "$pkg_dir/node_modules" ] || continue
  if [ "$pkg_dir" = "$REPO_ROOT" ]; then
    rel_node_modules="node_modules"
  else
    rel_node_modules="${pkg_dir#"$REPO_ROOT"/}/node_modules"
  fi
  target="$WORKTREE_DIR/$rel_node_modules"
  mkdir -p "$target"
  while IFS= read -r -d '' entry; do
    ln -sfn "$entry" "$target/$(basename "$entry")"
  done < <(find "$pkg_dir/node_modules" -mindepth 1 -maxdepth 1 -print0)
done < <(cd "$REPO_ROOT" && pnpm -r list --depth -1 --parseable 2>/dev/null)

cd "$WORKTREE_DIR"
eval "$CHAIN_CMD"

if [ -n "${AGI_PREPUSH_DIFF_CMD:-}" ]; then
  eval "$AGI_PREPUSH_DIFF_CMD"
else
  if DIFF_RANGE="$(git -C "$REPO_ROOT" rev-parse --verify --quiet '@{upstream}' 2>/dev/null)"; then
    :
  elif DIFF_RANGE="$(git -C "$REPO_ROOT" rev-parse --verify --quiet HEAD~1 2>/dev/null)"; then
    :
  else
    DIFF_RANGE="$EMPTY_TREE_SHA"
  fi
  git diff --check "$DIFF_RANGE"
fi
