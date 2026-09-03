#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
HERE="$(pwd)"
VENV="${TMPDIR:-/tmp}/skill-vetting-venv"

SS="$VENV/bin/skillspector"
# A warm venv skipped the install entirely, so CI could verify a build of the
# scanner that no longer matched the source it was checking out. Reinstall
# every run; when the venv is warm this is a fast no-op resolve, and on CI
# (where TMPDIR is fresh anyway) it costs nothing.
if [ ! -x "$SS" ]; then
  echo "[skill-vetting] provisioning venv at $VENV"
  uv venv --python 3.12 --clear "$VENV" >/dev/null
else
  echo "[skill-vetting] reusing venv at $VENV"
fi
uv pip install --python "$VENV/bin/python" "$HERE" >/dev/null

scan_verdict() {
  local sample="$1" out
  out="$(mktemp)"
  "$SS" scan "$HERE/samples/$sample" --no-llm --format json --output "$out" >/dev/null 2>&1 || true
  python3 -c "import json; print(json.load(open('$out')).get('risk_assessment',{}).get('recommendation',''))"
}

mal="$(scan_verdict malicious_skill)"
safe="$(scan_verdict safe_skill)"
echo "[skill-vetting] malicious_skill -> $mal"
echo "[skill-vetting] safe_skill      -> $safe"

fail=0
if [ "$mal" != "DO_NOT_INSTALL" ]; then
  echo "❌ expected malicious_skill = DO_NOT_INSTALL, got '$mal'"; fail=1
fi
if [ "$safe" = "DO_NOT_INSTALL" ]; then
  echo "❌ expected safe_skill != DO_NOT_INSTALL, got '$safe'"; fail=1
fi
if [ "$fail" -ne 0 ]; then exit 1; fi
echo "✅ [skill-vetting] vetting gate verified: malicious blocked, safe cleared"
