#!/bin/bash
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file_path" ] && exit 0

basename=$(basename "$file_path")
case "$basename" in
  pnpm-lock.yaml|package-lock.json|Cargo.lock|yarn.lock)
    echo "BLOCKED: $basename is auto-generated. Use pnpm install / cargo build instead." >&2
    cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Lock files are auto-generated. Use pnpm install or cargo build."}}
EOF
    exit 0
    ;;
esac

exit 0
