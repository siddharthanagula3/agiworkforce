#!/bin/bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is not installed. Install the version declared in package.json engines.node." >&2
    exit 1
fi

range=$(node -p 'require(require("node:path").resolve(process.argv[1])).engines.node' "${BASH_SOURCE[0]%/*}/../package.json")
current=$(node --version)

valid_components() {
    node -e 'process.exit(process.argv.slice(1).every(value => /^(0|[1-9][0-9]*)$/.test(value) && Number.isSafeInteger(Number(value))) ? 0 : 1)' "$@"
}

major_only=false
if [[ "$range" =~ ^([0-9]+)$ ]]; then
    minimum_major=${BASH_REMATCH[1]}
    minimum_minor=0
    minimum_patch=0
    maximum_major=$minimum_major
    major_only=true
elif [[ "$range" =~ ^\>=([0-9]+)\.([0-9]+)\.([0-9]+)[[:space:]]+\<([0-9]+)$ ]]; then
    minimum_major=${BASH_REMATCH[1]}
    minimum_minor=${BASH_REMATCH[2]}
    minimum_patch=${BASH_REMATCH[3]}
    maximum_major=${BASH_REMATCH[4]}
else
    echo "Unsupported engines.node range: $range" >&2
    exit 1
fi

if ! valid_components "$minimum_major" "$minimum_minor" "$minimum_patch" "$maximum_major"; then
    echo "Unsupported engines.node range: $range" >&2
    exit 1
fi
if [[ "$major_only" == true ]]; then
    maximum_major=$((10#$minimum_major + 1))
fi

if (( 10#$maximum_major <= 10#$minimum_major )); then
    echo "Unsupported engines.node range: $range" >&2
    exit 1
fi

if [[ ! "$current" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    echo "Cannot verify Node.js version: $current" >&2
    exit 1
fi

major=${BASH_REMATCH[1]}
minor=${BASH_REMATCH[2]}
patch=${BASH_REMATCH[3]}
if ! valid_components "$major" "$minor" "$patch"; then
    echo "Cannot verify Node.js version: $current" >&2
    exit 1
fi
if (( 10#$major < 10#$minimum_major || 10#$major >= 10#$maximum_major ||
      (10#$major == 10#$minimum_major && 10#$minor < 10#$minimum_minor) ||
      (10#$major == 10#$minimum_major && 10#$minor == 10#$minimum_minor && 10#$patch < 10#$minimum_patch) )); then
    echo "This project requires Node.js $range; current version is $current. Update Node.js before installing dependencies." >&2
    exit 1
fi

echo "Node.js version check passed ($current satisfies $range)."
