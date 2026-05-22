# GAP-D2: Desktop Rust Backend (H–N) — Anthropic / Claude Suite Parity

> **Scope:** every `apps/desktop/src-tauri/src/**/*.rs` file whose basename starts with H–N (case-insensitive) — 195 files. Read in full or in representative samples; cross-checked against the 5,022-LOC `~/Desktop/reference/src/utils/hooks.ts` Claude Code hooks engine, the 12,310-LOC `services/mcp/` MCP client, and the May-2026 Anthropic feature matrix. Only **MISSING** and **PARTIAL** items appear below; HAVE items are intentionally omitted.
> **Method:** for each Claude product surface that touches our scope (Hooks, MCP client + OAuth, MCP server, computer use, native-messaging, master-password / vault, notifications + notification center, LLM router / managed cloud / image gen, skills, intent / knowledge, sync / realtime, marketplace, mcpb, mcp-extensions, instant-demo onboarding, lib.rs/main.rs bootstrap), we line up reference behaviour against the source files in this scope and mark gaps. Effort numbers are AI-velocity engineer-days, assuming a single agent with full repo context.

---

## A. Hooks system (`core/hooks/{mod,event,executor,config}.rs`, ~134 LOC public surface; total ≈1.8 KLOC vs 5,022 LOC reference)

The reference Claude Code hooks engine ships **27 events × 6 handler types** (4 user-configurable + 2 internal) with async/HTTP/agent/prompt handlers, AsyncHookRegistry, SSRF guard, deny>ask>allow precedence, dedup, plugin/skill/agent frontmatter sources, `CLAUDE_ENV_FILE` propagation, prompt-request stdin interleaving, telemetry spans. Our `core/hooks/mod.rs` ships **12 events × 1 handler type** (command only) with a static blocklist and 10-concurrent semaphore.

### MISSING

1. **15 events** — `Setup`, `InstructionsLoaded`, `StopFailure`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `Elicitation`, `ElicitationResult`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PostCompact`, `UserPromptExpansion` (slash-cmd / @-mention expansion). Each is a different blocking-vs-observability shape — see `~/Desktop/reference/src/utils/hooks/hooksConfigManager.ts:28-265`. **Effort:** 3 d.
2. **HTTP handler** — `axios.post(hook.url)` with `allowedHttpHookUrls` allowlist, `httpHookAllowedEnvVars` interpolation with CRLF sanitiser, sandbox-proxy routing, 10-min default timeout. Reference: `~/Desktop/reference/src/utils/hooks/execHttpHook.ts:1-242`. **Effort:** 2 d.
3. **SSRF guard** — must reject 0/8, 10/8, 100.64/10 (Alibaba metadata 100.100.100.200 — easy-to-miss), 169.254/16 (cloud metadata), 172.16/12, 192.168/16, IPv6 `fc00::/7`, `fe80::/10`, `::ffff:a9fe:a9fe`. Loopback explicitly allowed for dev. Reference: `~/Desktop/reference/src/utils/hooks/ssrfGuard.ts:1-294`. **Effort:** 1 d.
4. **Prompt handler** — LLM-evaluated hook returning JSON-schema-validated `{ok, reason?}`. Routes via small-fast model (Haiku-class). `$ARGUMENTS`/`$0`/`$1` substitution. `outputFormat: json_schema` enforced server-side. Reference: `~/Desktop/reference/src/utils/hooks/execPromptHook.ts:1-211`. **Effort:** 2 d.
5. **Agent handler** — multi-turn agent loop with `MAX_AGENT_TURNS = 50`, `ALL_AGENT_DISALLOWED_TOOLS` filter, forced `permissionMode:'dontAsk'`, structured-output enforcement via synthetic `Stop` hook, transcript-file Read grant. Reference: `~/Desktop/reference/src/utils/hooks/execAgentHook.ts:1-339`. **Effort:** 3 d (depends on a sub-agent infrastructure that does not exist in our scope).
6. **AsyncHookRegistry** — `pendingHooks: Map<pid, PendingAsyncHook>`, `registerPendingAsyncHook` + `checkForAsyncHookResponses` polled by agent loop, `responseAttachmentSent` flag, `Promise.allSettled` failure isolation, `invalidateSessionEnvCache()` on SessionStart-async resolution, `asyncRewake` bypass for Stop hooks via `enqueuePendingNotification`. Without this, every slow `SessionStart` hook blocks first paint by its full duration. Reference: `~/Desktop/reference/src/utils/hooks/AsyncHookRegistry.ts:1-309`. **Effort:** 3 d.
7. **`hookSpecificOutput` permission decision schema** — `permissionDecision: allow|deny|ask`, `permissionDecisionReason`, `updatedInput` (model uses _this_ not original args), `additionalContext` (system reminder injection), `updatedMCPToolOutput` (PII redaction), `initialUserMessage` (SessionStart pre-fill), `watchPaths`, `retry` (PermissionDenied), Elicitation `action: accept|decline|cancel`. Today our executor only honours a flat `decision: 'block'` — there is no path for a hook to _modify_ a tool call. Reference: `~/Desktop/reference/src/utils/hooks.ts:489-737`. **Effort:** 2 d.
8. **deny > ask > allow precedence** when multiple hooks fire on the same event. Currently we collapse on first block (`HookExecutor::fire`). Reference: `hooks.ts:2826-2846`. **Effort:** 0.5 d.
9. **Hook dedup** by `(pluginRoot|skillRoot, command, shell, if)` so the same hook in user/project/local doesn't fire 3×. Reference: `hooks.ts:1735-1806`. **Effort:** 0.5 d.
10. **`if:` rule semantics** — reference uses `prepareIfConditionMatcher` to evaluate against _actual tool-input shape_ (e.g., a Bash hook with `if: "Bash(git *)"` only fires for git commands by parsing the bash command via tree-sitter). We have only a flat regex matcher. Reference: `hooks.ts:1390-1421`. **Effort:** 1 d.
11. **`disableAllHooks` / `allowManagedHooksOnly` / `strictPluginOnlyCustomization`** policy gates. Required for any enterprise / managed-MDM deployment. Reference: `~/Desktop/reference/src/utils/hooks/hooksConfigSnapshot.ts:18-88`. **Effort:** 0.5 d.
12. **`CLAUDE_ENV_FILE` propagation** — hooks write `export FOO=bar` to a per-event file, `getSessionEnvironmentScript()` concatenates and `bashProvider` injects into subsequent BashTool calls. Closes the env-loader / version-manager workflow gap (nvm, asdf, mise). Reference: `hooks.ts:881-926, 917-926`. **Effort:** 1 d.
13. **Prompt-request stdin interleaving** — hooks emit a JSON line that validates against `promptRequestSchema()` and the harness writes a response back to the hook's stdin. Lets hooks ask the user a question mid-execution. Reference: `hooks.ts:1068-1110`. **Effort:** 1 d.
14. **Plugin / skill / agent frontmatter hook registration** — three additional sources beyond settings.json (`registerSkillHooks.ts`, `registerFrontmatterHooks.ts`). `once: true` for skill hooks (auto-removes after first success). Agent `Stop` hooks auto-rewritten to `SubagentStop`. Reference: `~/Desktop/reference/src/utils/hooks/registerSkillHooks.ts:20-64`, `registerFrontmatterHooks.ts:18-67`. **Effort:** 1 d.
15. **`executeStatusLineCommand` + `executeFileSuggestionCommand`** — non-event command hooks for status-line and file-suggestion typeahead, both gated by `shouldSkipHookDueToTrust` with 5s timeouts. Reference: `hooks.ts:4577-4738`. **Effort:** 1 d.
16. **OTel tracing** — `startHookSpan` / `endHookSpan` with `managed_only`, `hook_source`, full `hook_definitions` JSON; gated on `isBetaTracingEnabled()`. Reference: `hooks.ts:2087-2092, 2966-2971`. Required for Team/Enterprise observability parity. **Effort:** 1 d.
17. **`tengu_run_hook` / `tengu_repl_hook_finished` / `tengu_agent_stop_hook_*` telemetry events** with `hookTypeCounts` and `pluginHookCounts` (anonymised to `'third-party'` for non-official marketplaces). Reference: `hooks.ts:2023-2034`. **Effort:** 0.5 d.
18. **Workspace-trust gate** — interactive sessions require workspace-trust dialog accepted before _any_ hook runs. Reference: `hooks.ts:267-296`. **Effort:** 0.5 d.

### PARTIAL

19. **`HookContext` env-var injection** — we expose `AGI_HOOK_TOOL_NAME`, `AGI_HOOK_TOOL_ID`, `AGI_HOOK_TOOL_ARGUMENTS`, `AGI_HOOK_SESSION_ID`. The reference puts `tool_name` / `tool_input` / `session_id` in _stdin JSON_, not env (the §5.4 doc claim of `CLAUDE_FILE_PATH` etc. is wrong — see deep-dive `m4-hooks-system.md` §6). We need a stdin-JSON path for compat; the env-var path is fine to keep but should be additive. **Effort:** 0.5 d.
20. **Defensive blocklist** — present (BLOCKED_HOOK_PATTERNS in `executor.rs:40-79`), but is a substring blacklist that flags `curl | bash` even in legitimate `bash -c "echo done > /tmp/log"` cases. Reference does not blocklist at all — workspace-trust + permission system is the design. We should keep ours but log-only when the user has explicitly approved. **Effort:** 0.5 d.

**Hooks subtotal:** 24.5 d to reach functional parity.

---

## B. MCP client (`core/mcp/manager.rs` 304 LOC, `core/mcp/extensions/`, `sys/commands/mcp.rs` 1,790 LOC, `sys/commands/mcp_oauth.rs`, `sys/commands/mcp_extensions.rs`, `sys/commands/mcpb.rs`)

Reference is 12,310 LOC (`client.ts` 3,348 + `auth.ts` 2,465 + `useManageMCPConnections.ts` 1,141 + ...). We have `core/mcp/manager.rs` doing register / start / stop / restart / health-monitor only. There is **no `auth.ts`-equivalent**.

### MISSING

21. **OAuth 2.0 stack — entire `auth.ts`** (2,465 LOC reference). Specifically:
    - **RFC 9728 → RFC 8414 metadata discovery** with three-tier fallback (`auth.ts:256-311`).
    - **PKCE** flow with `state` CSRF token (32-byte base64url), local HTTP server on dynamic port (Windows 39152–49151, others 49152–65535), fallback fixed port 3118.
    - **Paste-callback fallback** for SSH / Codespaces / no-browser environments (`auth.ts:1056-1097`). Critical for Linux + remote-control sessions.
    - **RFC 7591 Dynamic Client Registration** — auto-register the CC client when the server requires it.
    - **RFC 9068 CIMD / SEP-991 URL-based client_id** when server advertises `client_id_metadata_document_supported`.
    - **RFC 7009 token revocation** with basic+post auth-method fallback and Bearer-on-401 retry (Slack quirk).
    - **Cross-process refresh lockfile** at `~/.agiworkforce/mcp-refresh-${key}.lock` with 5 retries × jittered backoff (`auth.ts:2090-2175`).
    - **`tokens()` proactive refresh** (300s before expiry) with in-flight-promise dedup.
    - **Step-up auth detection** — fetch wrapper watches HTTP 403 + `WWW-Authenticate: insufficient_scope` and omits `refresh_token` from `tokens()` so SDK falls through to PKCE redirect (RFC 6749 §6 forbids refresh-based scope elevation).
    - **Slack 200-on-error normaliser** — Slack returns HTTP 200 with `{error:'invalid_grant'}` body; without the wrap the SDK feeds it to `OAuthTokensSchema.parse()` and produces an opaque ZodError (`auth.ts:147-191`).
    - **OS-keychain 4096-byte stdin limit fix** — discoveryState stores URLs only, not full metadata blob (`auth.ts:2007-2015`).
    - **5 invalidation scopes** — `'all' | 'client' | 'tokens' | 'verifier' | 'discovery'`.
      Without OAuth the user can never connect to Linear, Notion, GitHub remote, Atlassian, Stripe, Sentry, Slack, Google Drive, Asana, Figma, Salesforce — i.e. essentially every Claude.ai connector and every production third-party MCP server. Today our `mcp_oauth.rs` (commands 10) handles only per-connector scoped credential injection (GitHub PAT, Slack bot token, etc.) — not generic MCP-OAuth. **Effort:** 12 d.
22. **SEP-990 Cross-App Access (XAA)** — `xaa.ts` + `xaaIdpLogin.ts` two-leg chain: RFC 8693 token-exchange (id_token → ID-JAG) → RFC 7523 JWT-bearer (ID-JAG → access_token). Single IdP login → N silent MCP server auths. Required for Enterprise SSO parity. Reference: `~/Desktop/reference/src/services/mcp/xaa.ts:1-200, xaaIdpLogin.ts`. **Effort:** 4 d.
23. **8 transport variants** — reference `connectToServer` dispatches on `serverRef.type ∈ {sse, sse-ide, ws-ide, ws, http, sdk, claudeai-proxy, stdio}` with in-process linked-pair pattern for `claude-in-chrome` and `computer-use` (saves 325 MB subprocess). Our `McpServerConfig.transport` field is optional and only stdio is wired in `manager.rs`. **Effort:** 4 d.
24. **`claudeai-proxy` transport** — for org-managed claude.ai connectors, tokens routed through `MCP_PROXY_URL/{server_id}` with 401-retry (only retries when `handleOAuth401Error` returns `tokenChanged === true`, avoids stampede). Reference: `client.ts:868-904`. **Effort:** 1 d.
25. **`tools/list_changed`, `prompts/list_changed`, `resources/list_changed` notification handlers** — spec REQUIRES dynamic refresh; servers like Linear, Slack, Notion mutate their tool inventories live. We list once at connect time and never refresh. Reference: `useManageMCPConnections.ts:618-751`. **Effort:** 1 d.
26. **`elicitation` capability** — declared as `{}` (deliberately empty — Spring AI fails on unknown properties). Form + URL elicitation, two-phase consent/waiting flow for URL elicitations, `notifications/claude/elicitation/complete` with same `elicitationId`. Hook integration with `Elicitation` and `ElicitationResult` events. Reference: `~/Desktop/reference/src/services/mcp/elicitationHandler.ts:1-313`. **Effort:** 2 d.
27. **`roots` capability** — reference declares `roots:{}` so modern servers can request workspace roots. Without it, certain tool flows refuse to expose. **Effort:** 0.5 d.
28. **Connection lifecycle / reconnect / cache** —
    - `connectToServer` memoised over `getServerCacheKey(name, jsonStringify(serverRef))`.
    - 3-consecutive-terminal-error → `closeTransportAndRejectPending` (`ECONNRESET`, `ETIMEDOUT`, `EPIPE`, `EHOSTUNREACH`, `ECONNREFUSED`, `EADDRINUSE`, `Body Timeout Error`, `terminated`, `SSE stream disconnected`).
    - `client.onclose` clears 4 LRU fetch caches (`fetchToolsForClient`, `fetchResourcesForClient`, `fetchCommandsForClient`, `fetchMcpSkillsForClient`).
    - **Automatic exponential-backoff reconnect** (5 attempts, 1s → 30s cap; `MAX_RECONNECT_ATTEMPTS = 5`).
    - **Session-expired retry** (404 + JSON-RPC -32001) → `clearServerCache` + auto-acquire fresh session.
    - **15-minute negative cache** at `~/.agiworkforce/mcp-needs-auth-cache.json` to skip repeat 401 connect attempts.
      Our manager has restart_count ≤ 3 and `auto_restart_failed_servers` only — no error counter, no exponential backoff, no fetch cache invalidation, no negative cache, no session-expired retry. Reference: `client.ts:257-316, 1216-1402, 2218-2402`. **Effort:** 3 d.
29. **stdio cleanup escalation** — SIGINT (100 ms) → SIGTERM (400 ms) → SIGKILL with 600 ms failsafe — Docker-container-hosted MCP servers need explicit signals. Reference: `client.ts:1404-1570`. **Effort:** 0.5 d.
30. **Streamable-HTTP `Accept: application/json, text/event-stream` re-assertion** in `wrapFetchWithTimeout` — some runtimes/agents drop it before the wire (`client.ts:466-471, 502-510`). **Effort:** 0.5 d.
31. **Fresh-timeout per-request wrapper** — replaces stale `AbortSignal.timeout()`; uses `setTimeout`/`clearTimeout` because of Bun's lazy-GC of `AbortSignal.timeout` (`client.ts:474-550`, 2.4 KB/req leak). GET requests excluded (long-lived SSE). **Effort:** 0.5 d.
32. **Tool-name protocol** — `mcp__<normalized-server>__<normalized-tool>` per `mcpStringUtils.ts:50-52`. `recursivelySanitizeUnicode` strips zero-width/control chars. `_meta['anthropic/searchHint']` → searchHint (whitespace-collapsed); `_meta['anthropic/alwaysLoad']` → alwaysLoad. Tool annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`, `title`) → `isReadOnly`, `isConcurrencySafe`, `isDestructive`, `isOpenWorld` for UI rendering and concurrency-safe parallelism. Reference: `client.ts:1743-1998`. **Effort:** 1.5 d.
33. **Tool-result transformation** — switches on `text|audio|image|resource|resource_link` content blocks; `persistBlobToTextBlock` for audio, `maybeResizeAndDownsampleImageBuffer` for images, `getLargeOutputInstructions(filepath, originalSize, formatDescription)` when output exceeds token threshold so the model can read the file later. Reference: `client.ts:2478-2799`. Today our handler.rs returns flat text. **Effort:** 1.5 d.
34. **URL-elicitation retry loop (`callMCPToolWithUrlElicitationRetry`)** — `ErrorCode.UrlElicitationRequired = -32042` retry with 3-attempt cap, two-phase consent/waiting flow, hook fan-out before AND after user response. Reference: `client.ts:2813-3027`. **Effort:** 1 d.
35. **MCP_TOOL_TIMEOUT_MS race wrapper** — default 100,000,000 ms (~27.8 hr); env-overridable; implemented as `Promise.race` because SDK's internal timeout sometimes doesn't fire if SSE breaks mid-request. We use a flat `with_default_timeout(Duration::from_secs(300))` — too low for Cowork-class long-running tasks. Reference: `client.ts:3029-3245`. **Effort:** 0.5 d.
36. **Multi-source config merge / dedup / scope** —
    - 7 config scopes: `local | user | project | dynamic | enterprise | claudeai | managed` (`types.ts:10-20`). Today we have effectively 1 (a single JSON config file).
    - Order of precedence: plugin < user < project (approved only) < local. Then dedup by content signature (`getMcpServerSignature`).
    - Enterprise mode: if `enterprise/managed-mcp.json` exists, it's the **only** source — all others dropped.
    - `isRestrictedToPluginOnly('mcp')` — admin can lock MCP to plugin-only.
    - Allowlist + denylist with 3 entry shapes (`{serverName}`, `{serverCommand}`, `{serverUrl: <wildcard>}`); URL wildcard via `urlPatternToRegex`.
      Reference: `~/Desktop/reference/src/services/mcp/config.ts:336-1251`. **Effort:** 3 d.
37. **`getProjectMcpServerStatus` per-project approval gate** — `.mcp.json` servers default to `'pending'` until user approves. Status = `approved | rejected | pending`. RCE-class fix: `--dangerously-skip-permissions` is honoured but `sessionBypassPermissionsMode` from project settings is explicitly NOT trusted to gate auto-approval (`utils.ts:351-406`). **Effort:** 1 d.
38. **`.mcp.json` atomic write** — temp file → fdatasync → chmod → atomic rename. Today we use `serde_json::to_writer` direct. **Effort:** 0.25 d.
39. **`${VAR}` / `${VAR:-default}` env expansion** in command, args, env values, URLs, headers — used by every real-world MCP config. Reference: `~/Desktop/reference/src/services/mcp/envExpansion.ts`. **Effort:** 0.5 d.
40. **`headersHelper`** — dynamic-header generation via shell-out (git-credential-helper pattern). Trust-gate for project/local-scoped helpers. 10s timeout. Static + dynamic merge with dynamic-wins. Reference: `~/Desktop/reference/src/services/mcp/headersHelper.ts:42-138`. **Effort:** 1 d.
41. **Channel notifications** — bidirectional `notifications/claude/channel` for Telegram / iMessage / Discord-as-MCP-server with permission-relay schema (`/^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i` — 5 lowercase letters from 25-char alphabet sans `l`, FNV-1a base-25 short-id with profanity blocklist). 12s once-per-kind toast on skip. Reference: `~/Desktop/reference/src/services/mcp/channelNotification.ts`, `channelPermissions.ts`, `channelAllowlist.ts`. **Effort:** 3 d.
42. **Officical MCP registry probe** — fire-and-forget GET to `https://api.anthropic.com/mcp-registry/v0/servers?version=latest&visibility=commercial` at startup; populates `isOfficialMcpUrl(url)` set for trust-tier UI badges. Gated by `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. Reference: `~/Desktop/reference/src/services/mcp/officialRegistry.ts`. **Effort:** 0.5 d.
43. **`tengu_*` MCP telemetry events** — `tengu_mcp_server_connection_succeeded`, `tengu_mcp_server_connection_failed`, `tengu_mcp_server_needs_auth`, `tengu_mcp_session_expired`, `tengu_mcp_tool_call_auth_error`, `tengu_mcp_large_result_handled`, `tengu_mcp_oauth_flow_start/_success/_error`, `tengu_mcp_oauth_refresh_success/_failure`, `tengu_mcp_elicitation_shown/_response`, `tengu_mcp_channel_gate/_message`, `tengu_mcp_list_changed`, `tengu_mcp_servers`. We emit only `mcp_event` from `emit_mcp_event`. Reference: `client.ts:1583-1622, 3203-3228`, etc. **Effort:** 1 d.

### PARTIAL

44. **`McpExtensions` / `.mcpb` install** (`sys/commands/mcp_extensions.rs` 14 cmds, `sys/commands/mcpb.rs` 10 cmds) — covers npm-based bundle install + tool inventory + use-count, encrypted config values via `MasterPasswordEncryption`. **Missing:** desktop-extension `.mcpb` archive format (signed, ZIP-based, similar to VS Code .vsix), per-org admin allow-list / deny-list of public extensions, per-extension policy enablement (Aug-2025 admin controls). Reference: §2.3 of feature doc. **Effort:** 3 d.
45. **`mcp_oauth.rs`** (10 cmds) — handles per-connector OAuth flows (GitHub, Slack, Google Drive, Figma, Stripe, Vercel, Supabase, Sentry) with hardcoded npm-package server names. **Missing:** the generic-MCP-server OAuth path described in §21 above. The current design only works for the 8 hardcoded connectors; any custom remote MCP server is unreachable. **Effort:** subsumed in §21.

**MCP subtotal:** ~36 d to reach functional parity (the `auth.ts` port alone is the largest single line item).

---

## C. MCP server (we expose tools to the user's MCP client) — `core/mcp/server/{handlers,http_server,executor}.rs`

We expose `agi_*` tools over HTTP+JSON-RPC. Reference does **not** ship an MCP server implementation in `services/mcp/`; this is genuinely original code. However the expose-our-agent-as-an-MCP-server pattern matches the `claude mcp serve` command at `entrypoints/mcp.ts`. Cross-checked behaviours:

### MISSING

46. **stdio transport for `claude mcp serve` parity** — currently HTTP-only at `core/mcp/server/http_server.rs`. The reference `claude mcp serve` is stdio. Required so other MCP clients (Cursor, Claude Code itself, Codex) can use AGI Workforce as a subagent. **Effort:** 1.5 d.
47. **Capability negotiation per `protocolVersion`** — currently hardcodes `"2024-11-05"`. Reference handles backwards-compat through `2024-11-05`, `2025-03-25`, `2025-06-18`, `2025-12-04` (AGI parity needed for newest spec). **Effort:** 0.5 d.
48. **`prompts/list` + `prompts/get`** + **`resources/list` + `resources/read`** + **`logging/setLevel`** + **`completion/complete`** — `handlers.rs:dispatch` implements only `initialize`, `tools/list`, `tools/call`. The other 6 standard methods return `-32601 method not found`, breaking clients that probe capabilities. **Effort:** 1.5 d.
49. **`notifications/initialized`, `notifications/cancelled`** — outgoing notifications when our exposed tool catalog changes. **Effort:** 0.5 d.

**MCP server subtotal:** 4 d.

---

## D. Computer Use (`automation/computer_use/mod.rs` 75 LOC public surface; full submodule listed in mod.rs)

We ship a sophisticated Observe-Plan-Act loop with `ComputerUseAgent`, `ScreenAnalysis`, prompt-injection detector, app-permission manager (always-blocked bundles + URL hosts), zoom-around-point, window-coordinator. Cross-checked against §12 of the May-2026 feature doc.

### MISSING

50. **Anthropic `computer_20251124` tool schema parity** — full action vocabulary: `screenshot`, `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click`, `left_mouse_down`, `left_mouse_up`, `mouse_move`, `cursor_position`, `key`, `type`, `scroll`, `hold_key`, `wait`, `zoom` (with `enable_zoom: true` + `region: [x1,y1,x2,y2]`). We have most but `hold_key`, `triple_click`, `cursor_position` need verification against types.rs ComputerUseAction enum. **Effort:** 1 d.
51. **System-prompt overhead budget (466–499 tokens)** — Anthropic's tool system prompt for computer_use is fixed; we need a fixture so token-budgeting in `core/llm/llm_router.rs` can subtract correctly when the tool is enabled. **Effort:** 0.25 d.
52. **Server-side prompt-injection probe parity** — we have `safety/PromptInjectionDetector`. Reference Anthropic does this server-side on screenshots and OCR'd content before each agent action. Our local detector should mirror the documented categories (data-exfiltration, jailbreak, financial-action, file-share). **Effort:** 1 d.
53. **30-minute Dispatch session re-prompt** — Computer Use approvals last for the current session, OR 30 minutes in Dispatch-spawned sessions. We do not have a Dispatch listener wired (per FINAL_AUDIT cross-surface gap, desktop has zero `dispatchHmac`/`dispatchSalt` impl); when it lands, the 30-min timer must be enforced here. **Effort:** 0.5 d (when Dispatch exists).
54. **Sensitive-app blocklist defaults** — `ALWAYS_BLOCKED_BUNDLE_IDS` and `ALWAYS_BLOCKED_URL_HOSTS` are present in `app_permissions.rs`. Reference blocks investment/trading/crypto/banking by default; we should publish the exact default list and let admins extend. **Effort:** 0.5 d (audit + doc).
55. **Action approval lifecycle hook integration** — every `ComputerUseAction` should fire a `PreToolUse` hook with `tool_name='ComputerUse'` and the action JSON, and a `PostToolUse` after. Today actions execute through `safety::SafetyDecision` only — hooks are bypassed. **Effort:** 1 d.

**Computer Use subtotal:** 4.25 d.

---

## E. Native messaging (`integrations/native_messaging/{host,manifest,messages,mod}.rs` + `bin/native_messaging_host.rs` + `sys/commands/native_messaging.rs`)

Reference Anthropic ships `claude-in-chrome` as an MCP server, not via native-messaging-host. AGI Workforce uses native-messaging-host because we ship our own Chrome extension. The pattern is comparable to the `chrome.runtime.connectNative` flow.

### MISSING

56. **Per-message HMAC signing** — current `host.rs` reads stdin, forwards to mpsc, reads response, writes back stdout. There is no signature on the wire. A malicious local extension (or any process Chrome instructs to spawn the host) can drive the desktop with arbitrary commands. Reference Anthropic Dispatch uses `dispatchHmac`/`dispatchSalt` for the analogous mobile→desktop channel. **Effort:** 1.5 d.
57. **Origin/extension-id enforcement** — `manifest.rs::install_manifests` writes `allowed_origins`, but the host process itself does not re-verify the connecting extension ID at message time. When Chrome spawns the host it passes the origin as `argv[1]` (`chrome-extension://<id>/`); we should reject if not in the allowlist. **Effort:** 0.5 d.
58. **Backpressure on the response channel** — `wait_for_response_for_request` polls on a single mpsc; if the desktop is slow, multiple in-flight requests deadlock at `NATIVE_RESPONSE_TIMEOUT_MS = 15_000`. Reference Anthropic's MCP fan-out uses per-request request-id correlation. We have buffered_responses keyed by id but the wait loop is serial. **Effort:** 1 d.
59. **Windows MSIX compatibility** — `manifest.rs` writes registry entries (`allow_unsafe` flag set on the manifest module). MSIX-installed apps run inside a virtualized registry; our installer must use the Windows package extension manifest pattern, not direct `HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\*`. Reference: not applicable (Anthropic ships traditional `.exe` Squirrel installer for the Chrome path). **Effort:** 1.5 d.

**Native-messaging subtotal:** 4.5 d.

---

## F. Notifications + notification center (`sys/commands/notifications.rs` 720 LOC, `notification_center.rs` 599 LOC)

`notifications.rs` wraps `tauri-plugin-notification` for OS-level notifications with scheduled/recurring + actions. `notification_center.rs` is a SQLite-backed in-app center with priority/type/read state. Cross-check against Anthropic mobile + desktop notification semantics (§6.4 in the feature doc).

### MISSING

60. **Cowork-task-completion notifications** — Anthropic emits "task complete / failed / needs approval" with deep-link to conversation when a Cowork task crosses a state boundary. We have a NotificationType enum that includes `TaskComplete | TaskFailed`, but there is no glue from the agent loop to the in-app center for _Cowork-class_ tasks. **Effort:** 1 d.
61. **Dispatch-result notifications** — when a Dispatch session has a result, Anthropic mobile fires a push. Desktop side needs the dual: when a desktop Dispatch listener completes, surface a push back to mobile. Today nothing in `notifications.rs` is wired to a Dispatch event channel. **Effort:** 1 d.
62. **Scheduled-Cowork-task ready notifications** — recurring Cowork tasks (daily/weekly/monthly) fire at scheduled time. We have scheduled notifications but the _trigger_ is OS-time-based; we need the agent loop to check `core/scheduler/mod.rs` and only fire when the task actually reaches `running`/`completed`. **Effort:** 1 d.
63. **Notification hook** — Anthropic's `Notification` event hook fires per `notification_type` ∈ {`permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`, `elicitation_complete`, `elicitation_response`}. Today our notifications fire OS-only and our Hook system has a `Notification` event but the two are not connected. Wire `NotificationContext::with_notification(...)` into both surfaces. **Effort:** 1 d.

### PARTIAL

64. **Notification action buttons** (`notifications.rs::NotificationAction`) — supports id+title only. Reference Anthropic actions can accept multi-step inputs (e.g., quick-reply with text). `tauri-plugin-notification` supports this on macOS only; Windows path is missing. **Effort:** 1 d.

**Notifications subtotal:** 5 d.

---

## G. Master password / vault (`sys/commands/master_password.rs` 611 LOC, `sys/security/master_password.rs` 1,070 LOC)

Argon2id + HKDF + machine-key with KDF v1 → v2 migration; brute-force lockout (5/30s, 10/5min, 20=restart). Solid. Cross-check against Anthropic credential-storage pattern (OS keychain).

### MISSING

65. **OS keychain integration** — Anthropic stores OAuth tokens in macOS Keychain / Windows Credential Manager / GNOME Keyring (`getSecureStorage()` in `auth.ts:1376-2360`). We store everything in SQLCipher-encrypted SQLite. macOS keychain has a 4096-byte stdin limit fix encoded in the reference (§auth.ts:2007-2015). For local-mode parity we are fine; for production hardening, OS-keychain-fallback is the standard. **Effort:** 2 d.
66. **HIBP / breach-scan check at password setup** — reference comment in `master_password.rs:96-100` defers this to onboarding UI, but we do not currently call HIBP. Per memory `supabase-plan-constraints.md`, Supabase Free plan gates Leaked Password Protection so this is partly an upstream gap; client-side k-anonymity HIBP probe is independent and ~50 LOC. **Effort:** 0.5 d.
67. **Wrapped-credentials migration** on master-password change — current implementation preserves existing kdf_version on `change()` because re-encrypting every credential is "out of scope for this fix" (`master_password.rs:86-91`). For paid-tier launch this needs to actually migrate. **Effort:** 2 d.

### PARTIAL

68. **`enforce_password_complexity`** — minimum 12 chars + 3-of-4 character classes. NIST SP 800-63B-4 actually _discourages_ class rules. Reference Anthropic just measures length + entropy. We should soften this when HIBP-clean. **Effort:** 0.25 d.

**Master-password subtotal:** 4.75 d.

---

## H. LLM router + managed cloud + image gen (`core/llm/llm_router.rs` 2,542 LOC, `core/llm/providers/managed_cloud_provider.rs` 879 LOC, `core/llm/job_autofill_runtime.rs` 100 LOC, `core/llm/memory_integration.rs`, `integrations/api_integrations/image_gen.rs`)

Cross-check against Anthropic Console (§10) + Managed Agents beta (§10.7) + Claude Cookbook patterns.

### MISSING

69. **`/v1/skills` Skills API** for programmatic skill upload — Anthropic ships this for Team/Enterprise org-shared custom skills. Today our `core/skills/manager.rs` reads from `~/.agiworkforce/skills/` only; there is no upload-to-cloud path. **Effort:** 2 d.
70. **`managed-agents-2026-04-01` beta header support** in `managed_cloud_provider.rs` — multiagent sessions, Outcomes, webhook subscriptions, vault credentials, long-running sessions with full audit log, **Memory** for managed agents (filesystem-based, cross-session). Today we wire `direct_api_provider` and `managed_cloud_provider` for chat completions only — no managed-agents path. **Effort:** 3 d.
71. **Service tier selector** — Standard / Priority / Flex / Batch. Batch API gets 50% discount. Priority Tier requires committed spend. Reference: `~/Desktop/reference/src/cli/handlers/auth.ts` exposes `--tier` selection. We have no `tier` field on `LLMRequest`. **Effort:** 1 d.
72. **Fast Mode (research preview)** on Opus 4.6 with dedicated rate limits (`auth.ts:resolveFastModeFlag`). Adds a `fast_mode` field on the request schema. **Effort:** 0.5 d.
73. **Effort downgrade postmortem mitigation** — Anthropic shipped a 7 Apr 2026 + 23 Apr 2026 "high effort default on Opus 4.6 / Sonnet 4.6" change post-incident. We currently take `effort` as low/medium/high/max but do not honour Pro/Max default-high override at `provider_for_routing`. **Effort:** 0.5 d.
74. **`/v1/messages/batches` Batch API** in `managed_cloud_provider.rs` — currently we POST to `/api/llm/v1/chat/completions` synchronously. Batch runs at 50% discount and is required for cost-conscious automation. **Effort:** 1.5 d.
75. **Cost-attribution via `metadata.user_id` + `metadata.workspace_id`** — Anthropic Console allows per-workspace spend caps. We pass user_id internally but not as metadata to the upstream API. **Effort:** 0.5 d.
76. **Image generation in `image_gen.rs`** — covers dall-e/sd via direct provider; **missing** Anthropic Claude Design (Anthropic Labs, 17 Apr 2026) Skills-API-driven canvas-design / algorithmic-art Skills. These ship as Skills not as direct image-gen calls; integration goes via skills/loader.rs not image_gen.rs. **Effort:** 1 d (mainly wiring in skills/loader.rs to know about Anthropic's official image-gen skills).
77. **Long-context surcharge removal** (13 Mar 2026) — pricing logic in `cost_calculator.rs` (used by `llm_router.rs`) needs a verification pass to confirm the 1M-context surcharge removal landed. Tracked as "stale models.json + provider catalog drift" P0 in FINAL_AUDIT §2-§8 — confirms there's drift to reconcile. **Effort:** 0.5 d.

### PARTIAL

78. **Retry logic in `llm_router.rs`** — has `is_retryable_error`, exponential backoff, fallback candidates, session cost cap of $50 (SESSION_COST_SAFETY_CAP). **Missing:** rate-limit-event channel that Anthropic emits via `parallel rate-limit-event channel` (`print.ts:1129-1140`). Today we infer rate-limit purely from HTTP-429 status; we do not parse Anthropic's structured rate-limit headers (`anthropic-ratelimit-requests-remaining`, `anthropic-ratelimit-tokens-remaining`, `retry-after`). **Effort:** 1 d.
79. **`memory_integration.rs`** — has `MemoryInjectionConfig` with priority categories. **Missing:** memory-synthesis-side timestamps + auto-memory directory from Anthropic Mar 2026 release notes. Today our `MemoryManager` writes single-row entries; reference auto-memory writes to a directory tree under `~/.agiworkforce/agent-memory/<agentType>/` with project-level `.claude/agent-memory/` and local-uncommitted `.claude/agent-memory-local/`. **Effort:** 2 d.

**LLM subtotal:** 14.5 d.

---

## I. Skills (`core/skills/{loader,manager,error}.rs` ≈1.8 KLOC + `sys/commands/skills.rs` not in scope)

`loader.rs` parses `SKILL.md` with YAML frontmatter (name, description, allowed-tools, context, requires/bins, requires/env, OS allowlist). `manager.rs` initialises bundled + managed (~/.config/agiworkforce/skills/) + workspace skills, with requirement caching. Cross-check against Skills spec §1.5 + §E.1.

### MISSING

80. **Progressive disclosure** — reference loads only `name` + `description` at session start; full body and `references/` files load on demand. Our `loader.rs::SkillFrontmatter` parses the entire frontmatter eagerly and the body becomes the full system prompt. We need a `Skill::load_body_lazy()` path that the agent triggers when the skill is _invoked_, not when it's discovered. **Effort:** 2 d.
81. **Skill evaluation harness** — Anthropic recommends ~20 eval queries (~50/50 should-trigger / should-not-trigger split) per Skill. We have no test runner. Reference: `~/Desktop/reference/skill-creator` meta-skill. **Effort:** 2 d.
82. **Frontmatter `hooks:` block** — skills can declare hooks that get registered as session hooks via `registerSkillHooks.ts`. `once: true` for fire-once skill hooks. Today our `SkillFrontmatter` does not parse a hooks field. **Effort:** 1 d.
83. **Frontmatter `mcpServers:` block** — string ref or inline `{name: McpServerConfig}`. Skills can pull in their own MCP servers. **Effort:** 1 d.
84. **Frontmatter `model:`, `effort:`, `permissionMode:`, `maxTurns:`, `background:`, `memory:`, `isolation:`, `initialPrompt:`** — full agent-style frontmatter on skills (skills + agents merged in v2.1.101). Today we parse `name`, `description`, `allowed-tools`, `context` only. Reference: `~/Desktop/reference/src/utils/loadAgentsDir.ts:541-755`. **Effort:** 1 d.
85. **Marketplace install** — `claude plugin install <name>@<marketplace>` reads a Git repo with `.claude-plugin/marketplace.json`. Per `claudemarketplaces.com` 2,500+ marketplaces / 4,200+ skills / 770+ MCP servers. Today our `manager.rs` reads from local dirs only. **Effort:** 3 d.
86. **Skill tagging + version validation** (`claude plugin tag`, May 2026) — Git-tag-based release flow with `skill_version: "1.2.3"` field. **Effort:** 0.5 d.

**Skills subtotal:** 10.5 d.

---

## J. Intent / knowledge / RAG (`core/intent/mod.rs` + sys/commands/intent.rs + sys/commands/knowledge.rs)

`core/intent/mod.rs` exposes `IntentDetector`, `ToolRouter`, `QuickWinOptimizer`, `IntentCategory`, `Complexity`. `sys/commands/intent.rs` adds 100% serializable response wrappers. `knowledge.rs` (in scope) is plaintext keyword-match on a `Mutex<HashMap>` with a TODO for vector search.

### MISSING

87. **Vector-search backed `knowledge.rs`** — TODO at `knowledge_query` says "in production this would use vector similarity search." Today it's a string-contains scan. Reference Anthropic Projects use server-side RAG when knowledge exceeds context window. We have `core/embeddings/` available; just wire it. **Effort:** 1.5 d.
88. **Project-scoped knowledge with file-count limit at 30 MB/file, image cap 8000×8000 px, PDF visual analysis under 100 pages** (§1.3 of feature doc). Today our `knowledge_add` accepts arbitrary content with no validation. **Effort:** 0.5 d.
89. **Knowledge → context-window switching** — Anthropic Projects switch to RAG retrieval when knowledge exceeds active context. Today we have no context-budgeting in the knowledge subsystem. **Effort:** 1.5 d.

**Intent/knowledge subtotal:** 3.5 d.

---

## K. Sync / realtime / collaboration (`integrations/realtime/mod.rs` 9 LOC re-exports, `integrations/sync/manager.rs`)

`realtime/` has `CollaborationSession`, `Participant`, `RealtimeEvent`, `PresenceManager`, `RealtimeServer` (websocket). `sync/manager.rs` has `SyncManager` with cloud client + queue + conflict resolver + interval sync. Cross-check against Anthropic Projects org-sharing + Cowork tasks-list cross-device sync.

### MISSING

90. **OpenTelemetry exporter** — Cowork streams tool calls / file access / approval states to OTel exporters when configured (Team/Enterprise OTel support shipped at Cowork GA). Today our `sys/telemetry/` exists but does not export OTel spans for sync events. Reference: feature-doc §3.6. **Effort:** 2 d.
91. **CRDT-based conflict resolution** — `conflict.rs::ConflictResolver` has `auto_resolve_conflicts: bool` but no operational-transform / CRDT path. Anthropic Projects share-with-edit-rights requires last-write-wins-with-vector-clock at minimum. **Effort:** 3 d.
92. **EU residency option** — Anthropic offers EU data residency at 1.1× pricing. Sync targets in `cloud.rs::CloudSyncConfig` likely default to US-east; need a region selector. **Effort:** 1 d.
93. **ZDR (Zero Data Retention) toggle** — Enterprise/API option. Sync should refuse to write when ZDR is enabled and the sync target is not the user's own machine. **Effort:** 0.5 d.

**Sync/realtime subtotal:** 6.5 d.

---

## L. Marketplace (`sys/commands/marketplace.rs` ~37 cmds, features/workflows/marketplace.rs)

Workflow marketplace for AGI Workforce — publish, browse, rate, comment. Cross-check against Anthropic Plugin Marketplace + `claudemarketplaces.com`.

### MISSING

94. **Skills + MCP servers + agents marketplace categories** — current marketplace.rs handles `WorkflowCategory` only. Reference plugin marketplace has skills (4,200+), MCP servers (770+), subagents (`VoltAgent/awesome-claude-code-subagents` 100+, `wshobson/agents` 80+). **Effort:** 2 d.
95. **`marketplace.json` schema** — Git-repo-based marketplace declaration (`.claude-plugin/marketplace.json`). Today our marketplace is publish-to-our-cloud only. **Effort:** 2 d.
96. **`extraKnownMarketplaces` / `strictKnownMarketplaces`** policy keys — managed-settings can pin allowed marketplaces. **Effort:** 0.5 d.

**Marketplace subtotal:** 4.5 d.

---

## M. Onboarding instant demo (`ui/onboarding/instant_demo.rs`)

Implements 8 demo personae (inbox_manager, data_entry_specialist, code_reviewer, social_media_monitor, meeting_scheduler, expense_categorizer, file_organizer, lead_qualifier) with `SampleEmail`/`SampleCodePR`/`SampleInvoice` synthetic data. Cross-check against Anthropic Cowork onboarding (§3.1) and Mobile onboarding (§6).

### MISSING

97. **Cowork-onboarding 5-step parity** — (1) "choose a folder", (2) "connect tools", (3) "allow computer use?", (4) "keep computer awake?", (5) Tasks list view. Our instant_demo runs canned demos _instead_ of an onboarding wizard; a real new-user flow is missing. The picker is in `apps/desktop/src/components/Onboarding/OnboardingWizard.tsx` (frontend) but Rust-side glue is absent. **Effort:** 2 d.
98. **Health-data connector** (US Pro/Max iOS/Android) onboarding step — desktop is N/A for ingestion (mobile-only) but desktop should _display_ permission state. **Effort:** 0.5 d (display only).

**Onboarding subtotal:** 2.5 d.

---

## N. Bootstrap (`lib.rs` 2,777 LOC, `main.rs` 5 LOC) — `pub fn run()` entry

`lib.rs::run` registers ~70 Tauri commands across the workspace, manages SecretManager, AuthManager, MasterPasswordState, DailyBudgetGuard, TelemetryState, LLMState, BrowserStateWrapper, NativeMessagingStateWrapper, DispatchHmacState, SettingsState, SettingsServiceState, FileWatcherState, ApiState, DatabaseState, CloudState, CalendarState, etc. Cross-check against `main.tsx`'s 14-step `main()` boot sequence in M6.

### MISSING

99. **Pre-import side-effect parallelism** — reference fires `profileCheckpoint('main_tsx_entry')`, `startMdmRawRead()`, `startKeychainPrefetch()` _before any imports_ so subprocess work parallelises with the ~135 ms of imports. Our `lib.rs::run` body is fully sequential. AGI parity requires (a) a Rust profiler ready before `tauri::Builder::default()`, (b) MDM raw-read fired before any setting fetch, (c) keychain prefetch (when §65 lands) fired before SecretManager. Saves ~65–135 ms cold start. Reference: `m6-main-bootstrap.md` §1.1. **Effort:** 1 d.
100. **`migrationVersion` CAS-update CLAUDE.md migration runner** — reference runs 9–11 migrations gated by `getGlobalConfig().migrationVersion !== CURRENT_MIGRATION_VERSION = 11` and CAS-updates after running. Our `data/db/migrations.rs::run_migrations` is straight SQL migration only — there is no app-config-level migration like `migrateSonnet45ToSonnet46`, `resetProToOpusDefault`, etc. that maintains compat with model-rename eras. **Effort:** 2 d.
101. **Debugger-detection guard** — reference at `main.tsx:266-271` calls `process::exit(1)` when Node inspector is attached and the build is `"external"` (release channel). Rust analogue: detect `RUST_LOG=trace` + release build = warn; detect `gdb`/`lldb` attach = warn. **Effort:** 0.5 d.
102. **`uploadUserSettingsInBackground()`** — fires non-blocking from `preAction` hook so managed settings push back to Anthropic for fleet visibility. Today we have no remote-settings backchannel. **Effort:** 1 d.
103. **`deep-link` URL-handler bypass** — reference handles `claude://` URLs _before commander parses argv_ (`main.tsx:666-676` macOS LaunchServices check). We have `tauri_plugin_deep_link::init()` but no early-bail-before-tauri-init for command-line URL launches. **Effort:** 1 d.

**Bootstrap subtotal:** 5.5 d.

---

# Per-axis percentages (HAVE / PARTIAL / MISSING vs reference)

| Axis                          |   HAVE % | PARTIAL % | MISSING % | Notes                                                                                                                     |
| ----------------------------- | -------: | --------: | --------: | ------------------------------------------------------------------------------------------------------------------------- |
| Hooks engine                  |      22% |        8% |       70% | 1 of 6 handler types; 12 of 27 events; no AsyncHookRegistry; no permission-decision schema                                |
| MCP client                    |      15% |       10% |       75% | No OAuth; 1 of 8 transports wired; no notifications; no claudeai-proxy; no XAA                                            |
| MCP server                    |      50% |       10% |       40% | initialize/tools.list/tools.call only; no prompts/resources/logging methods                                               |
| Computer Use                  |      70% |       10% |       20% | OPA loop solid; missing Dispatch glue + hook integration                                                                  |
| Native messaging              |      60% |       10% |       30% | Works; missing HMAC + origin re-verify + MSIX path                                                                        |
| Notifications                 |      50% |       15% |       35% | OS + center solid; no Cowork/Dispatch/scheduled-Cowork glue                                                               |
| Master-password / vault       |      75% |        5% |       20% | Argon2id + KDF v1→v2 + lockout; missing OS keychain + HIBP + cred migration                                               |
| LLM router / managed cloud    |      55% |       15% |       30% | Routing/retry/cost solid; missing Batch API, Service Tiers, managed-agents beta, structured rate-limit headers            |
| Skills                        |      30% |       10% |       60% | Loader + manager + requirements OK; missing progressive disclosure, marketplace, full frontmatter, hooks/mcp/agent fields |
| Intent / knowledge            |      40% |       10% |       50% | Intent detector OK; knowledge is plaintext keyword                                                                        |
| Sync / realtime               |      35% |        5% |       60% | Cloud sync + presence + conflict scaffolding; no OTel, no CRDT, no EU residency                                           |
| Marketplace                   |      40% |        5% |       55% | Workflow-only; no Skills/MCP/agents marketplace, no `marketplace.json` schema                                             |
| Onboarding                    |      25% |        5% |       70% | 8 personae demos; no Cowork-onboarding wizard glue                                                                        |
| Bootstrap                     |      65% |       10% |       25% | 70-state managed; missing parallel pre-imports + app-config migration runner + deep-link bypass                           |
| **Weighted total (D2 scope)** | **~42%** |  **~10%** |  **~48%** |                                                                                                                           |

---

# Summary

Across the 195 H–N Rust files in the desktop backend, the largest gap clusters are:

- **Hooks (24.5 d)** — only `command` handler, 12 of 27 events, no AsyncHookRegistry, no permission-decision schema, no SSRF guard, no prompt-request stdin interleaving.
- **MCP client OAuth (12 d) + lifecycle (3 d) + multi-source config (3 d) + tool-name protocol (1.5 d)** — the entire 2,465-LOC `auth.ts` is unported. Without OAuth, the user cannot connect to Linear/Notion/GitHub remote/Atlassian/Stripe/Sentry/Slack/Drive/Asana/Figma/Salesforce — i.e. essentially every Claude.ai connector and every production third-party MCP server. This is the single largest D2 line item (≈36 d).
- **Skills (10.5 d)** — progressive disclosure, full agent-style frontmatter, marketplace install, eval harness, hooks/mcp/agent frontmatter blocks.
- **LLM router (14.5 d)** — Batch API, Service Tiers, managed-agents beta, memory-synthesis directory layout, structured rate-limit header parsing.
- **Sync / realtime (6.5 d)** — OTel exporter, CRDT path, EU residency, ZDR toggle.

Total to reach functional parity on this scope (excluding cross-cutting refactors like the macOS keychain migration that touches A–G letters too): **≈115 engineer-days at AI velocity**, with §21 (MCP OAuth) and §1–§7 (hooks event/handler/decision/async) as the critical-path items that block enterprise / paid-tier launches per FINAL_AUDIT 2026-05-05.

The **OAuth port (§21)** is also the single highest-impact intervention: it unblocks the "10+ providers in one UI" tagline being meaningful for _any_ remote MCP server, not just the 8 hardcoded connectors in `mcp_oauth.rs`. Recommend prioritising in this order: (1) MCP OAuth, (2) Hooks AsyncHookRegistry + HTTP/permission-decision, (3) Skills progressive disclosure + marketplace, (4) LLM router Batch + structured rate-limit, (5) bootstrap pre-import parallelism + app-config migrations.
