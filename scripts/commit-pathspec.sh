#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: scripts/commit-pathspec.sh -m <subject> [-m <body>]... -- <path>..." >&2
  exit 2
}

messages=()
while [ $# -gt 0 ]; do
  case "$1" in
    -m)
      [ $# -ge 2 ] || usage
      messages+=("-m" "$2")
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *)
      usage
      ;;
  esac
done
[ ${#messages[@]} -gt 0 ] || usage
[ $# -gt 0 ] || usage
paths=("$@")

git_dir="$(git rev-parse --git-dir)"
lock="$git_dir/agi-commit.lock"
for _ in $(seq 1 600); do
  if mkdir "$lock" 2>/dev/null; then
    trap 'rmdir "$lock" 2>/dev/null || true' EXIT
    break
  fi
  sleep 1
done
[ -d "$lock" ] || { echo "another commit is holding $lock" >&2; exit 1; }

git add -- "${paths[@]}"
git commit -q "${messages[@]}" -- "${paths[@]}"

committed="$(git show --name-only --format= HEAD)"
unexpected=""
while IFS= read -r file; do
  [ -n "$file" ] || continue
  matched=false
  for path in "${paths[@]}"; do
    case "$file" in
      "$path"|"$path"/*) matched=true ;;
    esac
  done
  $matched || unexpected="$unexpected $file"
done <<< "$committed"

git log --oneline -1
if [ -n "$unexpected" ]; then
  echo "warning: the hook added files outside the pathspec:$unexpected" >&2
  exit 3
fi
