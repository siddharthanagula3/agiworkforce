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
# Matches bare invoke('cmd'), the common invoke<ReturnType>('cmd') generic
# form, and local wrapper functions whose name starts with "invoke" (e.g.
# invokeWithTimeout<T>('cmd', ...), invokeWithRetry<T>('cmd', ...) in
# apps/desktop/src/api/*.ts) — a prior version of this script only matched
# literal `invoke(` and undercounted real call sites by ~3x.
TS_INVOKES=$(grep -rhoE "invoke[A-Za-z]*(<[^>]*>)?\(['\"][a-z_][a-z0-9_]*['\"]" "$SRC_TS" \
  --exclude-dir="__tests__" --include="*.ts" --include="*.tsx" \
  | sed -E "s/^.*['\"]([a-z_][a-z0-9_]*)['\"]\$/\\1/" \
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
# Extract command names from inside the generate_handler![...] block only
# (not the whole file — `app.manage(...ArtifactState::with_db(...))` and
# similar non-command calls elsewhere in lib.rs also match a bare
# `crate::sys::commands::...` prefix and would otherwise leak in as phantom
# entries). Registrations use both flat (`crate::sys::commands::foo`) and
# nested module paths (`crate::sys::commands::agent::agent_stop`, or other
# top-level modules entirely, e.g. `crate::sys::billing::stripe_...`) — the
# real command/registered-fn name is always the LAST `::`-separated segment,
# not the first one after `commands::`. A prior version of this script
# matched only the first segment and only the `commands::` prefix, which
# both undercounted real registrations and miscounted nested ones (e.g.
# truncating `agent::agent_stop` to a phantom bare "agent" entry).
REG_CMDS=$(awk '/tauri::generate_handler!\[/{flag=1; next} flag && /^\s*\]\)\s*$/{flag=0} flag' "$LIB_RS" \
  | grep -oE "crate::[a-zA-Z_:]+" 2>/dev/null \
  | sed -E "s/.*:://" \
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
# 4. AUDIT-FIX: CI-3 — HITL allow-list enforcement.
# --------------------------------------------------------------------------
# .hitl-required-tools.yaml lists tools that MUST gate through
# request_confirmation_simple. We grep each handler file for that callsite;
# if any required tool has no callsite in its declared handler, fail.
# yq is not assumed available in CI, so awk extracts the YAML pairs.
HITL_YAML="apps/desktop/.hitl-required-tools.yaml"
if [ -f "$HITL_YAML" ]; then
  # Extract `tool: <name>` / `handler: <path>` pairs in order, then iterate.
  HITL_PAIRS=$(awk '
    /^[[:space:]]*-[[:space:]]*tool:[[:space:]]*/ { sub(/^[[:space:]]*-[[:space:]]*tool:[[:space:]]*/, ""); t=$0 }
    /^[[:space:]]*handler:[[:space:]]*/ { sub(/^[[:space:]]*handler:[[:space:]]*/, ""); print t "|" $0 }
  ' "$HITL_YAML")

  while IFS='|' read -r tool handler; do
    [ -z "$tool" ] && continue
    if [ ! -f "$handler" ]; then
      echo "MISSING (HITL handler file not found): $tool -> $handler"
      MISSING=1
      continue
    fi
    if ! grep -q "request_confirmation_simple" "$handler" 2>/dev/null; then
      echo "MISSING (HITL tool $tool has no request_confirmation_simple in $handler)"
      MISSING=1
    fi
  done <<EOF
$HITL_PAIRS
EOF
fi

# --------------------------------------------------------------------------

if [ "$MISSING" -eq 0 ]; then
  echo "OK: invoke() <-> #[tauri::command] <-> generate_handler! wiring is consistent."
fi
exit $MISSING
