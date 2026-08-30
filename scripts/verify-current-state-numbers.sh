#!/usr/bin/env bash
# Re-derive every load-bearing number in AGIWORKFORCE_CURRENT_STATE.md from the repo.
# Read-only. Run from the repo root. Any line marked MISMATCH needs the report corrected.
set -uo pipefail
cd "${1:-/Users/siddhartha/Desktop/agiworkforce}"

pass=0; fail=0
chk() { # chk <label> <expected> <actual>
  if [ "$2" = "$3" ]; then printf '  OK       %-52s %s\n' "$1" "$3"; pass=$((pass+1));
  else printf '  MISMATCH %-52s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

echo "== revision =="
echo "  HEAD    $(git rev-parse --short=12 HEAD)  branch=$(git rev-parse --abbrev-ref HEAD)"
echo "  dirty   $(git status --porcelain | wc -l | tr -d ' ') files"

echo "== workspace scale =="
chk "pnpm -r list entries (incl. root)" 50 "$(pnpm -r list --depth -1 --json 2>/dev/null | jq 'length' 2>/dev/null || echo '?')"
chk "web API route files" 254 "$(find apps/web/app/api -name route.ts | wc -l | tr -d ' ')"
chk "web page.tsx files" 177 "$(find apps/web/app -name 'page.tsx' | wc -l | tr -d ' ')"
chk "neon migrations" 152 "$(ls apps/web/db/neon/*.sql | wc -l | tr -d ' ')"
chk "distinct CREATE TABLE" 136 "$(grep -hoiE 'create table (if not exists )?[a-z0-9_."]+' apps/web/db/neon/*.sql | sed -E 's/^[Cc][Rr][Ee][Aa][Tt][Ee] [Tt][Aa][Bb][Ll][Ee] ([Ii][Ff] [Nn][Oo][Tt] [Ee][Xx][Ii][Ss][Tt][Ss] )?//' | tr -d '"' | sed 's/^public\.//' | sort -u | wc -l | tr -d ' ')"
chk "ENABLE ROW LEVEL SECURITY (tables)" 84 "$(grep -hoiE 'alter table (public\.)?[a-z_]+ enable row level security' apps/web/db/neon/*.sql | sed -E 's/.*table (public\.)?//I;s/ enable.*//I' | sort -u | wc -l | tr -d ' ')"
chk "vercel crons" 14 "$(jq '.crons|length' vercel.json)"
chk "cron route handlers" 14 "$(find apps/web/app/api/cron -name route.ts | wc -l | tr -d ' ')"

echo "== registry =="
R=packages/ai/model-registry/generated/registry.json
chk "models" 36 "$(jq '.models|length' $R)"
chk "routes" 36 "$(jq '.routes|length' $R)"
chk "harnesses" 23 "$(jq '.harnesses|length' $R)"
chk "runtimeProfiles" 14 "$(jq '.runtimeProfiles|length' $R)"
chk "routing slots" 40 "$(jq '.policies.auto.slots|length' $R)"
chk "task types" 11 "$(jq '.policies.auto.tasks|length' $R)"
chk "task families" 12 "$(jq '.policies.auto.taskFamilies|length' $R)"
chk "slots reachable via tierAllowedSlots" 18 "$(jq '[.policies.auto.tierAllowedSlots[]|.[]]|unique|length' $R)"
chk "routes with local/on_device trustMode" 0 "$(jq '[.routes|to_entries[]|select(.value.trustModes|index("local") or index("on_device"))]|length' $R)"
chk "harnesses with zero routes" 7 "$(jq '((.harnesses|keys)-([.routes[].harnessId]|unique))|length' $R)"
chk "models.json models" 36 "$(jq '.models|length' packages/contracts/types/src/models.json)"

echo "== auto conformance fixture =="
F=packages/ai/routing/src/__tests__/fixtures/auto-route-conformance.json
chk "total pinned cases" 1412 "$(jq 'keys|length' $F)"
chk "local cases, all unavailable" 308 "$(jq '[to_entries[]|select((.key|split("|")[4])=="local" and (.value|split(";")[0])=="unavailable")]|length' $F)"
chk "local cases selected" 0 "$(jq '[to_entries[]|select((.key|split("|")[4])=="local" and (.value|split(";")[0])=="selected")]|length' $F)"
chk "on_device cases selected" 0 "$(jq '[to_entries[]|select((.key|split("|")[4])=="on_device" and (.value|split(";")[0])=="selected")]|length' $F)"

echo "== providers / adapters =="
chk "ADAPTER_PROVIDERS entries" 11 "$(grep -cE '^  [a-z]+: \{' apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.ts)"
chk "provider packages" 14 "$(ls -d packages/ai/providers/*/ | wc -l | tr -d ' ')"
chk "SERVER_PROVIDER_CONFIG entries" 11 "$(awk '/const SERVER_PROVIDER_CONFIG/,/^};/' apps/web/lib/services/provider-adapter-service.ts | grep -cE '^  [a-z]+: \{')"
chk "SSRF host allowlist (worktree)" 18 "$(awk '/ALLOWED_MANAGED_PROVIDER_HOSTS/,/^\]\)/' packages/ai/provider-runtime/src/base-url.ts | grep -cE "^\s+'")"
chk "SSRF host allowlist (HEAD)" 17 "$(git show HEAD:packages/ai/provider-runtime/src/base-url.ts | awk '/ALLOWED_MANAGED_PROVIDER_HOSTS/,/^\]\)/' | grep -cE "^\s+'")"

echo "== connectors / tools / skills =="
chk "CONNECTOR_CAPABILITIES rows" 89 "$(grep -cE "^  '?[a-z0-9-]+'?: (mcpConnector|firstPartyConnector|deviceLocalConnector)" apps/web/lib/connectors/catalog.ts)"
chk "MCP_ENDPOINTS" 27 "$(grep -cE '^  [a-z0-9-]+: \{' apps/web/lib/connectors/mcp-endpoints.ts)"
chk "  cimd (self-service)" 8 "$(grep -c "clientRegistration: 'cimd'" apps/web/lib/connectors/mcp-endpoints.ts)"
chk "  dynamic (self-service)" 7 "$(grep -c "clientRegistration: 'dynamic'" apps/web/lib/connectors/mcp-endpoints.ts)"
chk "  preregistered (operator)" 12 "$(grep -c "clientRegistration: 'preregistered'" apps/web/lib/connectors/mcp-endpoints.ts)"
chk "PLATFORM_TOOL_METADATA tools" 14 "$(grep -cE '^  [a-z_0-9]+: \{' apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts)"
chk "bundled skills" 9 "$(find .agents/skills -name SKILL.md | wc -l | tr -d ' ')"

echo "== billing =="
chk "MANAGED_USAGE_LIMITS tiers" 9 "$(awk '/MANAGED_USAGE_LIMITS/,/^  \}\);/' apps/web/lib/billing/managed-usage-caps.ts | grep -cE "^    '?[a-z_0-9-]+'?: \{")"
chk "free monthlyUnits" 20 "$(grep -oE 'free: \{[^}]*monthlyUnits: [0-9]+' apps/web/lib/billing/managed-usage-caps.ts | grep -oE '[0-9]+$')"
chk "MICROUSD_PER_INTERNAL_USAGE_UNIT" 5_000 "$(grep -oE 'MICROUSD_PER_INTERNAL_USAGE_UNIT = [0-9_]+' apps/web/lib/server/managed-usage-policy.ts | grep -oE '[0-9_]+$')"
chk "billing capabilities" 13 "$(awk '/^> = Object.freeze\(\{/{f=1;next} f&&/^\}\);/{exit} f' packages/contracts/types/src/billing-catalog.ts | grep -cE '^  [a-z_]+:')"

echo "== dead code =="
chk "surface unreachableDebt total" 456 "$(jq '[.surfaces[].unreachableDebt.paths//[]|length]|add' scripts/config/surface-reachability-allowlist.json)"
chk "crates protocol ts bindings (tracked)" 279 "$(git ls-files crates/agiworkforce-protocol/bindings | wc -l | tr -d ' ')"
chk "generated protocol types" 281 "$(ls packages/contracts/types/src/generated/protocol/ | wc -l | tr -d ' ')"
chk "tauri command definitions" 1316 "$(grep -rho '#\[tauri::command\]' apps/desktop/src-tauri/src --include='*.rs' | wc -l | tr -d ' ')"
chk "/api/agents route files" 9 "$(ls apps/web/app/api/agents/*/route.ts apps/web/app/api/agents/*/*/route.ts 2>/dev/null | wc -l | tr -d ' ')"
chk "  ...returning 410 (1 helper + 8 inline)" 9 "$(for f in apps/web/app/api/agents/*/route.ts apps/web/app/api/agents/*/*/route.ts; do grep -lE 'retiredManagedExecutionResponse|status: 410' "$f"; done 2>/dev/null | wc -l | tr -d ' ')"

echo "== tests =="
chk "priority-level-1 test files" 15 "$(find apps/*/__tests__ -type f \( -name '*.test.*' -o -name '*.spec.*' \) 2>/dev/null | grep -c 'priority-level-1')"
chk "priority-level-2 test files" 0 "$(find apps/*/__tests__ -type f \( -name '*.test.*' -o -name '*.spec.*' \) 2>/dev/null | grep -c 'priority-level-2')"
chk "playwright e2e specs (web)" 10 "$(ls apps/web/e2e/*.spec.ts 2>/dev/null | wc -l | tr -d ' ')"

echo
echo "RESULT: $pass ok, $fail mismatched"
[ "$fail" -eq 0 ] || exit 1
