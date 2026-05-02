#!/bin/bash
# Cross-check the Tauri IPC wiring in three directions:
#   1. Every invoke('cmd_name') in TS must be registered in lib.rs
#   2. Every #[tauri::command] definition in src-tauri must be registered
#      in lib.rs (FIX-023 — catches "26 commands silently dead" regression)
#   3. (Reported, not blocking) commands registered in lib.rs that don't
#      appear in any invoke() call — likely leftover after a frontend
#      removal.
#
# Usage: bash apps/desktop/check-wiring.sh
set -e

LIB_RS="apps/desktop/src-tauri/src/lib.rs"
SRC_TAURI="apps/desktop/src-tauri/src"
SRC_TS="apps/desktop/src"
MISSING=0

# --------------------------------------------------------------------------
# 1. Frontend invoke() call -> lib.rs registration
# --------------------------------------------------------------------------
TS_INVOKES=$(grep -rh "invoke(" "$SRC_TS" --exclude-dir="__tests__" \
  --include="*.ts" --include="*.tsx" \
  | grep -oE "invoke\(['\"][a-z_][a-z0-9_]*['\"]" \
  | sed -E "s/invoke\(['\"]([a-z_][a-z0-9_]*)['\"]/\\1/" \
  | sort -u) || true

for cmd in $TS_INVOKES; do
  if ! grep -qw "$cmd" "$LIB_RS" 2>/dev/null; then
    echo "MISSING (frontend invoke without registration): $cmd"
    MISSING=1
  fi
done

# --------------------------------------------------------------------------
# 2. #[tauri::command] definition -> lib.rs registration (FIX-023)
# --------------------------------------------------------------------------
# Find every pub fn / pub async fn that immediately follows a
# #[tauri::command] attribute, then check it's mentioned in lib.rs.
RS_COMMANDS=$(grep -rA1 --include="*.rs" "^#\[tauri::command\]" "$SRC_TAURI" 2>/dev/null \
  | grep -oE "pub (async )?fn [a-z_][a-z0-9_]*" \
  | awk '{print $NF}' \
  | sort -u) || true

for cmd in $RS_COMMANDS; do
  if ! grep -qw "$cmd" "$LIB_RS" 2>/dev/null; then
    echo "MISSING (#[tauri::command] not in generate_handler!): $cmd"
    MISSING=1
  fi
done

# --------------------------------------------------------------------------
# 3. Advisory: lib.rs registrations that no frontend invokes
# --------------------------------------------------------------------------
# Extract command names from `crate::sys::commands::<name>,` lines inside
# the generate_handler! block. Uses a heuristic — prints a count rather
# than failing, since some commands are intentionally invoked from Rust
# (e.g. tray menu actions) and never from the frontend.
REG_CMDS=$(grep -oE "crate::sys::commands::[a-z_][a-z0-9_]*" "$LIB_RS" 2>/dev/null \
  | sed -E "s/crate::sys::commands:://" \
  | sort -u) || true

UNUSED=0
for cmd in $REG_CMDS; do
  if ! echo "$TS_INVOKES" | grep -qw "$cmd" 2>/dev/null; then
    UNUSED=$((UNUSED + 1))
  fi
done
echo "INFO: $UNUSED command(s) registered in lib.rs are not invoked from any frontend file."
echo "      (Some are expected — tray actions, native menu items, internal calls.)"

# --------------------------------------------------------------------------

if [ "$MISSING" -eq 0 ]; then
  echo "OK: invoke() <-> #[tauri::command] <-> generate_handler! wiring is consistent."
fi
exit $MISSING
