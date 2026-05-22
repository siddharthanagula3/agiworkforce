# PR #373 AI-Slop Master Report (2026-05-20)

10 parallel hunters, surface-scoped, read-only sweep of the 83-file security audit. Aggregated and de-duplicated. Status: PR #373 merged to main as `f594eeed9`. All findings below are now ON MAIN — follow-up work, not blockers.

## Tier A — Real bugs / behavior regressions (FIX BEFORE NEXT RELEASE)

### A1. Chrome ext + Desktop: HMAC native-messaging envelope is unimplemented on the desktop side

- Reported by: **chrome-hunter**, **cross-cut-hunter** (independent confirmation)
- `apps/extension/src/background.ts:175-250, 510-578` introduces per-session HMAC, latches into STRICT mode after first secret seen, and rejects unsigned responses
- `grep -rn "session_secret" apps/desktop/src-tauri/` → **0 results**. Desktop's `NativeResponse` struct (`apps/desktop/src-tauri/src/integrations/native_messaging/mod.rs:212-219`) has no `session_secret`, `mac`, or `timestamp` fields and no MAC-minting code
- **Impact**: once the secret latches, ALL native-messaging responses are rejected → extension↔desktop bridge breaks
- **Fix**: either implement MAC envelope on desktop or gate STRICT mode behind a feature flag until desktop ships matching code

### A2. Desktop: `parse_mcp_envelope` is dead for all live MCP calls

- Reported by: **desktop-hunter**
- `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs:266` assumes plain ASCII names like `mcp__filesystem__read_file`
- `McpExecutor::create_tool_id` always base64-encodes both segments: real wire format is `mcp__b64_ZmlsZXN5c3RlbQ__b64_cmVhZF9maWxl`
- `READ_ONLY_MCP_TOOLS` contains bare names like `"read_file"`, but every live call has `"b64_cmVhZF9maWxl"` — exact-match never fires
- **Impact**: in Safe/Plan mode, ALL MCP read-only tools now require user confirmation — opposite of the intended security fix
- **Fix**: decode the `b64_` prefix before consulting `READ_ONLY_MCP_TOOLS`

### A3. Cross-surface MCP charset mismatch

- Reported by: **cross-cut-hunter**
- `packages/mcp/src/connect.ts:37` caps tool names at 128 chars, forbids `__`
- `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs:271` caps at 256 chars, forbids extra `__`
- Both claim to "mirror" each other in comments. A 200-char legitimate tool name passes desktop, fails catalog ingest → silent divergence
- **Fix**: pick one cap; align comments

### A4. Mobile rehydrateWhenMmkvReady refactor is half-done

- Reported by: **mobile-hunter**
- New helper added at `apps/mobile/lib/mmkv.ts:157-204`. Only 3 stores migrated (desktopStatusStore, notificationPrefsStore, projectStore)
- 13 other stores carry `// TODO(audit §17): migrate to rehydrateWhenMmkvReady()` but still call the old `whenMmkvReady` pattern inline
- **Impact**: codebase is MORE inconsistent than pre-refactor
- **Fix**: complete the migration (13 mechanical store edits) OR revert the helper

### A5. Runtime: phantom-race defense in messageQueueManager

- Reported by: **runtime-chat-hunter**
- `packages/runtime/src/queue/messageQueueManager.ts:283-321` adds bounds checks against a "concurrent splice/replace via mutate()" race that **cannot happen in JS**: snapshot is a captured const array reference, no await/microtask between findBestIdx and indexed read
- New code adds 3 redundant guards + audit-ID prose comment claiming a race that doesn't exist
- Inconsistent: `findBestIdx` itself still uses `snapshot[i]!` with no guard
- **Fix**: REVERT to pre-patch (`snapshot[idx]!`)

## Tier B — Audit-doc / comment slop (~80 sites)

### B1. 80+ inline `// FIX (audit 2026-05-20, §N)` comments reference a §-numbered document that does not exist in the branch

- Reported by: **cross-cut-hunter** (confirmed via `git diff main...HEAD -- audit/audit-log.md` is empty, `grep "2026-05-20" audit/audit-log.md` is empty)
- Hot files (by audit-prose count): `tool_confirmation.rs` (7), `background.ts` (6), `mcp/connect.ts` (3), `powershell_tool.rs` (3), `download-beta/route.ts` (3), api-gateway routes (4)
- Specific sites flagged across all hunters:
  - **apps/cli**: `powershell_tool.rs:54-62, 127-135`; `apply_patch.rs:17-25`
  - **apps/desktop**: `authOrchestrator.ts:6-15`, `computerUseStore.ts:499-509`, `subscriptionGate.test.ts:1-15`
  - **apps/web**: `stores/unified/desktop-stubs.ts:461`, `stores/unified/mediaGenerationStore.ts:1`, `stores/unified/ui.ts:846-856`, `auth/desktop-token/__tests__/keysource-entropy.test.ts:124-126`, `agents/execute/route.ts:156-184`, `completion/route.ts:88`, `auth/desktop-token/route.ts:32-75`, `rate-limit.ts:14-24`, `download-beta/route.ts:35-89`
  - **apps/extension**: `background.ts:176`, `background/policy.ts:322`, `__tests__/run-page-actions-validation.test.ts:72`
  - **apps/extension-vscode**: `chatParticipant.ts:519-534`
  - **apps/mobile**: 13 stores with `TODO(audit §17)` (see A4); `mmkv.ts:160-181`; `MessageContentRenderer.tsx:185-194`
  - **packages**: `apply-patch/index.ts:75-141` (duplicate doc), `providers/google/index.ts:38-78` (commented FUTURE_AUTH_METHODS), `runtime/queue/messageQueueManager.ts` (see A5)
  - **services**: `dotfile.ts:112-120, 169-172`; `providerHealth.ts:102-108`; `llm.ts:752-757, 793`; `supabaseClients.ts:140-151`; `mcpProxy.ts:283-293`
- **Fix**: pass through batch removal of audit-ID prose; keep only non-obvious WHY lines

## Tier C — Lying / stale comments

### C1. `apps/web/app/api/auth/desktop-token/route.ts:97`

- Comment claims "rate-limited to 5/min" but route uses key `auth-verify` capped at 10/min (`lib/rate-limit.ts:148`)

### C2. `apps/web/app/api/auth/desktop-token/route.ts:69`

- Error message says "SHA-256 derivation requires ≥ 64 UTF-8 bytes" but PR migrated to scrypt

### C3. `apps/mobile/lib/mmkv.ts:173`

- Docstring claims "23 stores carry the AUDIT-FIX marker" and "remaining 20 stores"; actual counts are 16 and 13. Off by 7

### C4. `packages/mcp/src/connect.ts:38-55`

- Comment implies `isAcceptableMcpToolName` rejects allowlist-spoof names like `read_file_but_exfiltrate`, but that string passes (no `__`, valid charset). Only blocks the `mcp__server__tool` envelope-spoof shape. Allowlist spoofing is desktop-side concern

### C5. `packages/mcp/src/connect.ts:46-55`

- Cites JSON-Schema "billion-laughs" exponential expansion as the threat, but `validateMcpInputSchema` counts literal `$ref` keys — doesn't expand or follow refs. Size bound is fine; threat-model framing is wrong

### C6. `packages/apply-patch/src/index.ts:75-94`

- Doc says "Probe at module init by stat'ing `process.execPath` with case flipped." Actual behavior: lazy (cached on first call), short-circuits on typical Linux execPaths (`/usr/local/bin/node` is all-lowercase so probe===execPath triggers platform-default fallback; stat never runs)

## Tier D — Dead code / over-defensive

### D1. `services/api-gateway/src/routes/dotfile.ts:122`

- `schema?: ZodTypeAny` parameter added to `proxyFromDesktop` but all 4 call sites (`:230, :248, :264, :282`) invoke without a schema. Validation branch at `:172-184` unreachable

### D2. `apps/web/app/api/download-beta/route.ts:82-83`

- `owner?.toLowerCase() ?? ''` and `repo?.toLowerCase() ?? ''` are unreachable: `segments.length < 4` guard on `:78` proves both are defined strings. Both `?.` and `?? ''` branches dead

### D3. `apps/mobile/lib/mmkv.ts:189-200`

- Cargo-culted try/catch around `store.persist.rehydrate()` (Zustand framework call that doesn't throw under normal operation). Async `.catch` branch also speculative — `rehydrate()` returns `void` in practice

### D4. `packages/providers/google/src/index.ts:38-78`

- Commented-out `FUTURE_AUTH_METHODS` block + speculative runtime guard rejecting `authMethod === 'gcp-adc' || useVertex === true` for fields that don't exist on `GoogleAdapterConfig`

### D5. `packages/unified-chat/src/components/UserProfile.tsx:30, 32`

- `parts[0] ?? ''` and `parts[parts.length - 1] ?? ''` are dead after `parts.length === 0` early return

## Within-PR fix-of-fix chain (5 of 13 commits)

- `b0bcb2b1 → 82090d78 → 3844fa98 → f299c396` — sequence of desktop fixes
- `0df00e09 → 730079d3` — Codex-flagged Vercel guard scope (rate-limit.ts)
- `77413ee0 → 270d494b → 130f49fb` — Codex caught regressions Claude introduced (cors.ts dropping `tauri://localhost` and breaking non-macOS; `setNativeSessionSecret` accepting any ≥32-char string into `parseInt` and silently zeroing bytes)
- Pattern signal: introduce-bug → fix-in-next-commit, three independent instances in one PR

## Verified NOT slop (cleared on inspection)

- **services/api-gateway usage tracking**: SSE path (`llm.ts:758`) and non-stream path (`:794`) are mutually exclusive — no double-counting. The 30-LoC PromiseLike refactor is a real fix
- **providerHealth.ts allowlist + warn-on-reject**: real behavior change, real callers, structured logs. Keep
- **packages/mcp/src/transport.ts:62-66**: no contradiction with `types.ts`; both routes correctly enforce production-signed-manifest
- **packages/mcp validators**: within documented bounded-defense scope (depth ≤16, refs ≤64, keys ≤512), don't silently allow blocked shapes
- **apps/extension-vscode chatParticipant**: only diff is the one already-flagged audit-checklist comment; no other slop in scope
- **apps/cli powershell two-gate semantics**: code logic is correct (`if safe_mode || !env_allow_unsafe` correctly blocks except when both open); only the doc comment is confusing
- **packages/runtime mutate() updater logic**: correctly handles snapshot-generation race in a DIFFERENT location (L295-302 / L323-332); the bounds check at 283-321 is the redundant addition

## Suggested follow-up workstreams

1. **P0 fix**: A1 (MAC envelope desktop-side) + A2 (base64 decode in parse_mcp_envelope). Both are real security regressions; ship as PR with cross-surface contract test.
2. **P1 cleanup**: A4 (complete mobile rehydrate migration) + A5 (revert phantom-race defense) + all of Tier C (lying comments) + Tier D (dead code).
3. **P2 chore**: Tier B (80+ audit-ID prose comments) — single mechanical pass over the codebase to strip task references.
