#!/usr/bin/env bash
set -euo pipefail

if [[ "${RUNNER_OS:-}" != Linux || "${RUNNER_ENVIRONMENT:-}" != github-hosted ]]; then
  echo '::error::Runner memory preparation requires a GitHub-hosted Linux runner.'
  exit 1
fi

if [[ ! "${AGI_SWAP_GIB:-}" =~ ^[1-9][0-9]?$ || ! "${AGI_MIN_FREE_GIB:-}" =~ ^[1-9][0-9]?$ ]]; then
  echo '::error::Swap and free-disk capacity must each be an integer between 1 and 99 GiB.'
  exit 1
fi

df -h "$RUNNER_TEMP"
free -h
sudo rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc \
  /opt/hostedtoolcache/CodeQL /usr/local/share/boost

available_kib=$(df -Pk "$RUNNER_TEMP" | awk 'NR == 2 {print $4}')
required_gib=$((AGI_SWAP_GIB + AGI_MIN_FREE_GIB))
required_kib=$((required_gib * 1024 * 1024))
if [[ ! "$available_kib" =~ ^[0-9]+$ ]] || ((available_kib < required_kib)); then
  echo "::error::Insufficient disk for ${AGI_SWAP_GIB} GiB swap while preserving ${AGI_MIN_FREE_GIB} GiB for the job."
  exit 1
fi

swap_file="$RUNNER_TEMP/agi-ci.swap"
if [[ -e "$swap_file" ]]; then
  echo '::error::The runner swap file already exists.'
  exit 1
fi
sudo install -m 600 /dev/null "$swap_file"
sudo fallocate -l "${AGI_SWAP_GIB}G" "$swap_file"
sudo mkswap "$swap_file"
sudo swapon "$swap_file"
df -h "$RUNNER_TEMP"
free -h
swapon --show
