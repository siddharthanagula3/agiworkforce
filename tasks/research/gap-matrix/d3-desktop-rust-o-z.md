# GAP-D3 — Desktop Rust Backend (O-Z) vs Anthropic Claude Suite (May 2026)

> **Scope.** All 297 .rs files at `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/` whose basenames begin O–Z (case-insensitive). Excludes target/.
> **Method.** Cross-reference each file/module against `tasks/research/anthropic-claude-suite-may-2026.md` and the deep-dive reports under `tasks/research/deep/` (in particular `m9-services-mcp.md`, `m3-storage-auth-roots.md`, `m1-cli-print-launchers.md`, `t1-agenttool-insights-plugins-ui.md`, `t2-bash-powershell.md`, `net-bridge-remote-server.md`, `svc-services-rest.md`, `u4-permissions-swarm-settings-model.md`).
> **Output rule.** Only MISSING + PARTIAL features are listed. HAVE (full parity) features are summarised at the bottom by axis percentage.
> **Slice convention.** Citations like `oauth.rs:1193` reference our O–Z scope. Citations like `auth.ts:2090` reference the Claude-suite reference compilation.

The headline finding: **the alphabetical O–Z slice happens to contain almost every single security-critical, agent-spine, and remote-control surface** the Claude suite ships — MCP (`oauth.rs`/`protocol.rs`/`registry.rs`/`session.rs`/`transport.rs`/`tool_executor.rs`), permissions (`permissions.rs`/`policy.rs`/`prompt_injection.rs`/`secret_manager.rs`/`sandbox.rs`/`sandbox_runtime.rs`/`tool_guard.rs`), Computer Use (`observe_plan_act.rs`/`safety.rs`/`zoom.rs`/`window_manager.rs`/`visual_reasoner.rs`/`screen_watcher.rs`), terminal (`pty.rs`/`session_manager.rs`/`shells.rs`), orchestration (`orchestrator.rs ×4`/`workflow_engine.rs`/`workflow_executor.rs`/`workflow_scheduler.rs`/`subtask_executor.rs`/`swarm_bridge.rs`/`swarm_orchestrator.rs`), settings/state (`settings.rs`/`settings_v2.rs`/`state.rs`), realtime (`websocket_server.rs`/`presence.rs`/`tab_manager.rs`/`tool_stream.rs`), persistence/cache (`persistence.rs ×3`/`tool_results.rs`/`watcher_integration.rs`), billing (`stripe_client.rs`/`webhooks.rs`/`subscription.rs`), planner/agent runtime (`planner.rs ×2`/`runtime.rs`/`prompt_engineer.rs`/`process_reasoning.rs`/`reflection.rs`/`vision_planner.rs`), skills (`skill.rs`/`skill_tool.rs`/`skills.rs`), and tracing (`tracing.rs`/`redaction.rs`). These are the load-bearing axes for cross-surface parity.

Total ~93,000 LOC in scope (rough estimate from sampled file sizes — `transport.rs:2281`, `oauth.rs:1193`, `observe_plan_act.rs:1240`, `webhooks.rs:724`, `websocket_server.rs:1854`, etc.). The slice contains the engine room.

---

## A. Missing — by category

### A.1 MCP — OAuth 2.1 + DCR + advanced flows (`core/mcp/oauth.rs`)

Reference target: `services/mcp/auth.ts:2,465 LOC`, `xaa.ts`, `xaaIdpLogin.ts`, `oauthPort.ts`, `headersHelper.ts`, `claudeai.ts`. Plus `services/oauth/{index,client,auth-code-listener,crypto}.ts:998 LOC`.
Our impl: `core/mcp/oauth.rs:1,193 LOC` — single file. Provides Auth-Code + PKCE, AES-256-GCM token storage, agiworkforce:// deep-link callback, basic refresh.

**MISSING:**

1. **RFC 9728 + RFC 8414 metadata discovery chain.** No `/.well-known/oauth-protected-resource` probe; no `authorization_servers[0]` extraction; no path-aware fallback. We rely on a hardcoded `auth_url`/`token_url` config field (`oauth.rs:46-47`). Reference does three-tier fallback at `auth.ts:256-311`. **Effort: 3-5 days.**
2. **Dynamic Client Registration (RFC 7591).** Comment in our file mentions DCR but no implementation — no POST to `registration_endpoint`, no `clientInformation()` accessor, no `saveClientInformation()` persistence keyed by `serverKey`. Without DCR we cannot connect to _any_ claude.ai connector that requires per-instance registration (i.e., production Linear, Notion remote, Atlassian, Stripe MCP). Reference at `auth.ts:1482-1538`. **Effort: 3 days.**
3. **CIMD/SEP-991 client_id_metadata_document_supported.** Reference's `clientMetadataUrl()` (`auth.ts:1445-1452`) returns a public URL the AS can fetch instead of a registered client_id. Newer MCP servers prefer this. **Effort: 1 day after DCR is in.**
4. **Token revocation per RFC 7009.** Reference `revokeServerTokens` (`auth.ts:467-618`) walks `revocation_endpoint_auth_methods_supported`, prefers `client_secret_basic`, falls back on 401 to Bearer. We delete tokens locally but never call the AS. Stranded sessions on the server. **Effort: 1 day.**
5. **Cross-process refresh lock.** Reference uses `~/.claude/mcp-refresh-${sanitizedKey}.lock` w/ 5-attempt jittered backoff (`auth.ts:2090-2175`). We have a `RwLock` (`oauth.rs:21`) inside the process — multiple AGI Workforce instances will stampede the AS. **Effort: 2 days.**
6. **`saveDiscoveryState()` minimised persistence (#30337 macOS keychain 4096-byte stdin limit).** We don't persist discovery state at all; users re-discover every session, ~200 ms latency on cold start per server. Reference persists `authorizationServerUrl + resourceMetadataUrl` only (`auth.ts:1997-2035`). **Effort: 1 day.**
7. **5 invalidation scopes** (`'all' | 'client' | 'tokens' | 'verifier' | 'discovery'`). We have a single delete (`oauth.rs:db_key_*`). Granular re-auth (e.g., scope upgrade requires `verifier` invalidation but keeps client/tokens) is impossible. **Effort: 0.5 day.**
8. **Slack OAuth quirk normaliser (`normalizeOAuthErrorBody`).** Slack returns HTTP 200 for OAuth errors; reference rewrites to 400 (`auth.ts:147-191`). Without this, every Slack-connector error surfaces as opaque `request_failed`. **Effort: 0.5 day.**
9. **Step-up authentication.** Reference's `wrapFetchWithStepUpDetection` (`auth.ts:1354-1374`) watches HTTP 403 + `WWW-Authenticate: insufficient_scope` and primes the provider to omit `refresh_token` so the SDK falls through to PKCE redirect. Without this, scope upgrades trip an infinite-refresh loop (RFC 6749 §6: refresh cannot elevate scope). **Effort: 2 days.**
10. **SEP-990 / Cross-App Access (XAA).** Two-leg RFC 8693 + RFC 7523 chain (id_token → ID-JAG → access_token) for enterprise SSO across multiple MCP servers without per-server browser flows. Reference: `xaa.ts:31-34` + `xaaIdpLogin.ts`. Required for our enterprise tier. **Effort: 5-7 days; depends on RFC 8693 + JOSE crate selection.**
11. **Paste-callback fallback.** No SSH/Codespaces/headless-VM support — user cannot paste the redirect URL when localhost listener is unreachable. Reference at `auth.ts:1056-1097`. **Effort: 1 day.**
12. **OAuth port discovery with platform ranges.** Reference uses `[39152, 49151]` on Windows, `[49152, 65535]` on macOS/Linux (`oauthPort.ts:9-12`); fallback fixed port 3118; env override `MCP_OAUTH_CALLBACK_PORT`. Our impl hardcodes `agiworkforce://` deep-link only — we _bypass_ localhost loopback entirely and rely on Tauri's deep-link plugin, which is acceptable for desktop but breaks SSH/CLI parity. **Effort: 2 days.**
13. **`headersHelper.ts` — dynamic per-request headers from a shell-out helper.** With workspace-trust gate. Used for git-credential-helper-style auth. **Effort: 2 days.**
14. **Failure attribution telemetry** (`cancelled | timeout | provider_denied | state_mismatch | port_unavailable | sdk_auth_failed | token_exchange_failed | unknown`) — `auth.ts:1259-1342`. Operational visibility gap. **Effort: 1 day.**
15. **`invalidateOAuthCacheIfDiskChanged()`** mtime check on `~/.claude/.credentials.json` so a parallel instance that refreshed tokens doesn't get stomped by our cached copy. **Effort: 0.5 day.**
16. **Negative cache for "needs-auth" servers** at `~/.claude/mcp-needs-auth-cache.json` w/ 15-min TTL (`client.ts:257-316`). Without this, every CC start fans out 30+ wasted OAuth round-trips when tokens have been cleared. **Effort: 1 day.**

### A.2 MCP — protocol/transport gaps (`core/mcp/{protocol.rs, transport.rs, registry.rs, session.rs, tool_executor.rs}`)

Reference target: `services/mcp/client.ts:3,348 LOC` + `useManageMCPConnections.ts:1,141 LOC` + `config.ts:1,578 LOC`. Our slice: ~4,770 LOC across 5 files.

**MISSING:**

1. **Transport variants** — reference covers 8: `stdio`, `sse`, `sse-ide`, `ws-ide`, `ws`, `http` (Streamable-HTTP), `sdk` (in-process control channel), `claudeai-proxy`, plus the **in-process linked-pair** for `claude-in-chrome` and `computer-use` (saves ~325 MB subprocess). We have stdio + SSE only based on `transport.rs` grep. **No Streamable-HTTP, no WebSocket, no IDE-bound transports, no in-process pair, no SDK control transport.** **Effort: 7-10 days for full transport matrix.**
2. **Streamable-HTTP Accept-header guard.** Reference enforces `Accept: application/json, text/event-stream` at last-hop fetch (`client.ts:466-510`) because HTTP 406 mid-stream is a documented failure mode. Without this our HTTP MCP transport will silently 406 against spec-compliant servers. **Effort: 0.5 day.**
3. **Per-request fresh-timeout wrapper.** Reference creates a fresh AbortController + 60 s timeout per request (`client.ts:474-550`), citing the Bun-specific lazy-GC issue. Our `transport.rs` likely has a default-timeout-at-connect — review needed. **Effort: 1 day.**
4. **Connection lifecycle: 3-strikes terminal-error counter.** Reference tracks `ECONNRESET`, `ETIMEDOUT`, `EPIPE`, `EHOSTUNREACH`, `ECONNREFUSED`, `EADDRINUSE`, `Body Timeout Error`, `terminated`, `SSE stream disconnected`, `Failed to reconnect SSE stream` and after 3 consecutive errors closes (`client.ts:1266-1371`). **Effort: 1 day.**
5. **Stdio cleanup escalation.** Reference: SIGINT (100ms) → SIGTERM (400ms) → SIGKILL (600ms) — many Docker-containerised MCP servers ignore the abort signal alone (`client.ts:1404-1570`). **Effort: 1 day.**
6. **Connection batching with separate local/remote concurrency.** Reference: 3 local, 20 remote, env-overridable. Our slice likely fans out unboundedly. **Effort: 1 day.**
7. **15-minute negative cache** for 401s (see A.1 §16).
8. **`tools/list_changed`, `prompts/list_changed`, `resources/list_changed` notifications.** Reference invalidates the relevant cache and refreshes (`useManageMCPConnections.ts:618-751`). Required for live-mutating servers (Linear, Notion, Slack). Our `session.rs` declares Elicitation support (good!) but I find no `notifications/...` handler grep-wise. **Effort: 2 days.**
9. **Channel notifications + structured permission-prompt protocol** (`notifications/claude/channel`, `notifications/claude/channel/permission`, `notifications/claude/channel/permission_request`). Required for Telegram/iMessage/Discord-as-MCP-server pattern. Reference: `channelNotification.ts`, `channelPermissions.ts`. Includes the FNV-1a-base25 short-ID generator with profanity blocklist. **Effort: 3-4 days.**
10. **URL elicitation two-phase consent/waiting flow** (`UrlElicitationRequired` = -32042). We declare elicitation in `session.rs` but only the form mode based on the visible types. Reference: `client.ts:2813-3027`. **Effort: 2 days.**
11. **Tool-call retry on `McpSessionExpiredError`.** Detect 404+`-32001` or `-32000 + Connection closed` for HTTP/proxy types → `clearServerCache` + auto-reconnect (`client.ts:3217-3231`). **Effort: 1 day.**
12. **`callMCPTool` 100M-ms timeout w/ Promise.race against SDK call** because the SDK's timeout doesn't fire when SSE breaks mid-request (`client.ts:3068-3122`). **Effort: 0.5 day.**
13. **Progress forwarding** (`onprogress` → `mcp_progress` events; "still running (Ns)" every 30s). **Effort: 1 day.**
14. **Result-content transformer**: `text`/`audio`/`image` (with `maybeResizeAndDownsampleImageBuffer`) / `resource` (inline if image) / `resource_link` (`[Resource link: name] uri (description)`). Reference: `client.ts:2478-2591`. Ours handles text only based on `tool_executor.rs:401`. **Effort: 2-3 days.**
15. **Large-output disk persistence** with `getLargeOutputInstructions(filepath, originalSize, formatDescription)` so the model can read the file later. Reference: `client.ts:2767-2798`. **Effort: 2 days.**
16. **Tool-name normalization**: `mcp__<normalized-server>__<normalized-tool>` w/ `mcpInfo: {serverName, toolName}` carried separately for permission checks. We use raw IDs (see `registry.rs:create_safe_tool_id`) which is OpenAI-safe but doesn't preserve the round-trip required for MCP rule matching (e.g., `Bash` rules don't apply to `mcp__bash__exec`). **Effort: 2 days.**
17. **Tool annotations**: `readOnlyHint`, `destructiveHint`, `openWorldHint`, `title`. Reference uses these to drive concurrency-safety, UI rendering, and the auto-mode classifier collapse decision. Ours have nothing equivalent. **Effort: 1 day.**
18. **`_meta['anthropic/searchHint']` + `alwaysLoad`.** Reference reads these from the MCP tool spec to power its ToolSearch deferred-loading optimisation. **Effort: 1 day.**
19. **`InProcessTransport.createLinkedTransportPair()`.** Reference uses queueMicrotask piping to avoid 325 MB subprocess for Chrome and Computer Use MCP servers. We have a fully-out-of-process Computer Use already (different architecture) — irrelevant there, but the same trick would let us embed our `claude-in-chrome`-equivalent (apps/extension) when run inside the Tauri shell. **Effort: 3 days.**
20. **SDK control-channel transport** (in-process JSON-RPC over a host control client; `SdkControlTransport.ts:14-37`). Used by the Anthropic Agent SDK to inject tools at runtime. **Effort: 4 days.**

### A.3 MCP — config + scope + policy (`config.ts` not in O-Z scope but the flow is)

Reference target: `services/mcp/config.ts:1,578` + `utils.ts:575`.

**MISSING:**

1. **7-source scope hierarchy.** Reference: `local | user | project | dynamic | enterprise | claudeai | managed` (`types.ts:10-20`). Our impl has nothing equivalent — see `core/mcp/registry.rs` which simply iterates a flat list. Without scopes we cannot ship project-shared `.mcp.json`, enterprise-locked policies, or claude.ai-managed connectors. **Effort: 5-7 days for full hierarchy + persistence.**
2. **Allowlist + denylist policy** w/ 3 entry shapes (`{serverName} | {serverCommand: string[]} | {serverUrl: <wildcard*pattern>}`). Reference: `config.ts:336-407`. **Effort: 2 days.**
3. **Per-project approval gate.** `.mcp.json` servers default `pending` until user approves; auto-approve only in `--dangerously-skip-permissions` mode. Reference: `utils.ts:351-406`. **RCE-class fix:** must NOT trust `sessionBypassPermissionsMode` from project settings (`utils.ts:379-385`). **Effort: 2 days.**
4. **Atomic `.mcp.json` write** (read mode → temp file → fdatasync → chmod → rename). **Effort: 0.5 day.**
5. **Env-var expansion** (`${VAR}` and `${VAR:-default}`) inside command, args, env values, URLs, headers. **Effort: 1 day.**
6. **Multi-source dedup** by content signature (`stdio:${json([command, ...args])}` or `url:${unwrapCcrProxyUrl(url)}`). Without dedup, plugin-and-manual-and-claude.ai-managed copies of the same server collide. **Effort: 1 day.**
7. **CCR-proxy URL unwrap** for claude.ai connectors (`config.ts:182-193`). N/A unless we ship an Anthropic-equivalent proxy.
8. **Official MCP registry ping** (fire-and-forget GET to `api.anthropic.com/mcp-registry/v0/servers`). N/A unless we operate an equivalent. We do have a `core/mcp/extensions/repository.rs` — the gap analysis there is in scope D2 not D3.

---

### A.4 Permissions — settings hierarchy + rule precedence (`sys/security/permissions.rs`, `sys/permissions/policy.rs`, `sys/security/policy_integration.rs`, `sys/security/policy/scope.rs`)

Reference target: `utils/permissions/{24 files, 5,400 LOC}` (deep-dive `u4-permissions-swarm-settings-model.md`).
Our `permissions.rs:354 LOC + policy.rs (sys/permissions) + policy_integration.rs:313 + scope.rs` together likely cover ~2,000 LOC.

**MISSING:**

1. **The 10-step rule-precedence pipeline** (`hasPermissionsToUseToolInner`). Reference: `permissions.ts:1158-1318`. Our `permissions.rs:check_permission` (16 fns total) is a flat lookup — no `step 1a (entire-tool deny)`, `step 1b (entire-tool ask)`, `step 1c (tool's own checkPermissions)`, `step 1d (tool-level deny in bypass)`, `step 1e (requiresUserInteraction)`, `step 1f (content-specific ask in bypass)`, `step 1g (safetyCheck for .git/.claude/.vscode/shell configs)`, `step 2a (bypass)`, `step 2b (entire-tool allow)`, `step 3 (passthrough → ask)`. **Without this the bypass mode is unsafe.** **Effort: 4-5 days; high-risk security work.**
2. **6 permission modes** — `default`, `plan`, `acceptEdits`, `bypassPermissions`, `dontAsk`, `auto`. We have `default`/`bypassPermissions` only based on the schema. Reference: `PermissionMode.ts:42-91`. **Effort: 3 days for full state machine + cycle order.**
3. **Auto-mode transcript classifier** (Sonnet-class side-call grading every pending tool call). Reference: `permissions.ts:473-956` + `anthropic.com/engineering/claude-code-auto-mode`. False-positive 0.4 %, false-negative on synthetic exfil 5.7 %. We have `prompt_injection.rs:499 LOC` (regex/structural detection — _much_ simpler) but no LLM-based classifier integration. **Effort: 7-10 days. Core differentiator.**
4. **Auto-mode block list (~20 rules)** — force-pushes, mass cloud deletion, credential exfiltration, prod deploys, permission escalation, dangerous removal, bare-repo escape, module loading, COM instantiation, WMI process spawn, encoded commands, download cradles, `Invoke-Item`, scheduled-task persistence, runtime-state hijack. Cross-platform (`Bash` + PowerShell). **Effort: 3-5 days.**
5. **`pathValidation.ts` 6-step pipeline.** Reference: `pathValidation.ts:373-485`. Strip quotes → expand `~/` → block UNC → block `~user`/`~+`/`~-`/`~N` (TOCTOU) → block `$VAR`/`%TEMP%`/`=cmd` (shell expansion) → block glob in writes → resolve to absolute. **Without these our path tools have known TOCTOU and shell-expansion attack surfaces.** **Effort: 3-4 days.**
6. **Dangerous-files / dangerous-dirs allowlist.** Reference: `DANGEROUS_FILES = ['.gitconfig', '.gitmodules', '.bashrc', '.bash_profile', '.zshrc', '.zprofile', '.profile', '.ripgreprc', '.mcp.json', '.claude.json']`, `DANGEROUS_DIRECTORIES = ['.git', '.vscode', '.idea', '.claude']`. **Effort: 1 day; trivially copy-pasteable.**
7. **Suspicious Windows path patterns** — NTFS ADS `:`, 8.3 short names `~\d`, long-path `\\?\…`, trailing dots/spaces, DOS device names `CON|PRN|AUX|NUL|COMn|LPTn`, three-or-more-dots traversal, UNC. Checked **on all platforms** because NTFS can be mounted on Linux/macOS. Reference: `filesystem.ts:537-602`. **Effort: 2 days.**
8. **`additionalDirectories` setting** with macOS `/var → /private/var`, `/tmp → /private/tmp` normalisation + case-insensitive comparison + `..` traversal rejection. Reference: `filesystem.ts:683-744`. **Effort: 2 days.**
9. **Permission-rule parser** with escape-aware paren matching (`escapeRuleContent`/`unescapeRuleContent`). Round-trip: `Bash(python -c "print(1)")` → `Bash(python -c "print\\(1\\)")`. Reference: `permissionRuleParser.ts:55-79`. **Effort: 1.5 days.**
10. **Shadowed-rule detection.** Reference: `shadowedRuleDetection.ts:111-184` — flags unreachable allow rules shadowed by tool-wide deny/ask. Helpful UX; not critical. **Effort: 1 day.**
11. **`bypassPermissionsKillswitch.ts`** — server-side circuit breaker via Statsig gate. We have nothing remote-revokable. **Effort: 1 day.**
12. **`SAFE_YOLO_ALLOWLISTED_TOOLS`** set for auto-mode auto-allow (Read/Grep/Glob/LSP/ToolSearch/ListMcpResources/etc.). **Effort: 0.5 day.**
13. **`permissionExplainer.ts`** — Haiku-class side query that returns `{explanation, reasoning, risk, riskLevel}` JSON for the permission dialog. Excellent UX; powers the "should I allow this" surface. **Effort: 2 days.**
14. **`denialTracking.ts`** — `DENIAL_LIMITS = {maxConsecutive: 3, maxTotal: 20}` after which classifier falls back to interactive prompting. **Effort: 0.5 day.**
15. **Plugin-trust message** (`pluginTrustMessage` policy-only setting). N/A until we ship plugins — see plugins gap below.

### A.5 Permissions — Bash-class shell guarding

This is technically not in our O-Z scope file-wise (`apps/desktop/src-tauri/src` may have shell-related logic in `pty.rs`, `session_manager.rs`, `shells.rs`). Let me cite what we lack:

**MISSING:**

1. **Tree-sitter bash AST parsing** (`parseCommandRaw` → tree-sitter bash). Three outcomes (`too-complex`, `simple`, `parse-unavailable`) drive different validation paths. We have `pty.rs` for terminal but **no command-validation AST** anywhere in the slice. **Effort: 5-7 days. Heavy; but the only sound defence against shell-quote tricks.**
2. **22-validator chain** in `bashSecurity.ts` covering `jq` `system()`, ANSI-C `$'…'`/locale `$"…"`, shell-meta-in-quotes, `$VAR` in redirect, comment-quote desync, quoted-newline + `#`, `\r` outside DQ, IFS injection, `/proc/*/environ` access, dangerous patterns (backticks/`$()`/`${}`/`$[]`/zsh `=cmd`/`<()`/`>()`/`=()`/`~[`/`(e:`/`(+`/`} always {`/`<#`), redirections, backslash-escaped whitespace, backslash-escaped operators (`\;`/`\|`/`\&`/`\<`/`\>`), unicode whitespace, mid-word hash, brace expansion, zsh dangerous commands (`zmodload`/`emulate -c`/`sysopen`/`zpty`/`ztcp`/`zsocket`/`mapfile`/`zf_*`/`fc -e`), malformed-token injection. **Effort: 7-10 days; mostly copyable as regex/AST rules.**
3. **`stripSafeWrappers`** — iterative two-phase wrapper stripping for env vars, `timeout`, `time`, `nice`, `nohup`, `stdbuf`. **Critical:** `[ \t]+` not `\s+` because `\s` matches newlines (= command separators). **Effort: 1 day.**
4. **`SAFE_ENV_VARS` allowlist** for env-var stripping in allow rules — **explicitly** excludes `PATH`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_*`, `PYTHONPATH`, `NODE_PATH`, `RUBYLIB`, `GOFLAGS`, `RUSTFLAGS`, `NODE_OPTIONS`, `HOME`, `TMPDIR`, `SHELL`, `BASH_ENV`. **Effort: 0.5 day.**
5. **`BARE_SHELL_PREFIXES`** — never auto-suggest `Bash(*:*)` rules for these (`sh`, `bash`, `zsh`, `fish`, `csh`, `tcsh`, `ksh`, `dash`, `cmd`, `powershell`, `pwsh`, `env`, `xargs`, `nice`, `stdbuf`, `nohup`, `timeout`, `time`, `sudo`, `doas`, `pkexec`). **Effort: 0.5 day.**
6. **`isCommandReadOnly`** w/ `COMMAND_ALLOWLIST` for 25+ commands w/ explicit per-flag safe sets (`xargs.safeFlags`, `git`, `file`, `sed`, `sort`, `grep`, `fd`, `ls`, `find` etc.) and `READONLY_COMMAND_REGEXES` fallback. Powers Plan-mode. **Effort: 5-7 days; data-heavy.**

### A.6 PowerShell class

Same shape, separate corpus (`tools/PowerShellTool/` 14 files, 6,700 LOC). We have **zero PowerShell-aware command validation** in our O-Z slice. **Effort: 7-10 days.** Required for Windows parity.

---

### A.7 Computer Use / Cowork-class (`automation/computer_use/*`)

Files in scope: `observe_plan_act.rs:1240`, `safety.rs:871`, `visual_reasoner.rs:715`, `window_manager.rs:1083`, `zoom.rs:616`, `session.rs`, `tests.rs`, `types.rs`. ~5,200 LOC.

We've built impressive Computer Use scaffolding (OPA loop, vision planner, OCR, screen watcher). What's missing:

**MISSING:**

1. **Local VM isolation.** Reference Cowork runs every shell + file write inside `Apple Virtualization Framework` (macOS) / `Hyper-V` (Windows) VM at `~/Library/Application Support/Claude/vm_bundles/claudevm.bundle` (macOS) or `%APPDATA%\Claude\vm_bundles\claudevm.bundle` (Windows). Our impl runs Computer Use **directly on the host** — no isolation. **Effort: HIGH (4-8 weeks). Apple Virtualization framework Rust bindings + macOS-only initially. Required for Cowork parity.** Without this, we can't ship "Cowork" the way Anthropic ships it.
2. **Network egress allowlist.** Reference: per-Cowork-task domain allowlist for shell commands (with explicit caveat that web search / fetch use Anthropic's own egress, not the local allowlist). We have nothing. **Effort: 3-5 days; depends on VM.**
3. **Approval-prompt UX with 5 variants** (read-only file allow / write file allow / shell command allow / always-allow for project / app access for Computer Use). Our `safety.rs:35 fns` covers basic block/needs-confirmation but the 5-variant UI flow is in the frontend, not backend — N/A here, but the backend must emit those payloads. **Effort: 1 day to add payload variants.**
4. **Pre-flight server-side prompt-injection probe** before each tool action (screenshot OCR, file content, web fetch). Reference: API-side scan plus auto-mode classifier. We have `prompt_injection.rs` but it's regex/structural — no LLM probe. **Effort: 5-7 days; counts toward A.4 §3.**
5. **Per-app permissions & blocklist** for sensitive apps (banking, crypto, healthcare). We have `with_app_permissions` (`safety.rs`) — implementation exists but the **default blocklist data** (the actual app bundle IDs / window-class names) is missing. **Effort: 1 day for catalogue.**
6. **Sensitive financial-app default blocklist** — Anthropic ships specific list (TD Ameritrade, Fidelity, Chase, Coinbase, etc.). **Effort: 0.5 day.**
7. **30-min re-prompt for Dispatch sessions.** Approvals expire in Dispatch-spawned sessions after 30 min. **Effort: 1 day.**
8. **VM resource caps** — Anthropic doesn't publish but uses ~2 vCPU / 1.8-2 GB RAM. **Effort: 1 day after VM ships.**
9. **Manual reset button for VM bundle** — deletes bundle, forces re-download. **Effort: 0.5 day.**
10. **`computer_20251124` action vocabulary parity.** Per Anthropic: `screenshot`, `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click`, `left_mouse_down`, `left_mouse_up`, `mouse_move`, `cursor_position`, `key`, `type`, `scroll`, `hold_key`, `wait`, `zoom` (with `enable_zoom: true` and `region: [x1,y1,x2,y2]`). Our `observe_plan_act.rs:execute_action` covers most via Enigo — confirm parity per axis (the `parse_key` fn implies key support; `triple_click` likely missing — review). **Effort: 1-2 days for parity audit + fills.**
11. **Server-side prompt-injection scan on screenshots / OCR'd content.** Reference scans every screenshot + OCR before feeding to model. **Effort: counts toward A.4 §3.**

### A.8 OCR (`automation/screen/ocr.rs`)

Our impl: `perform_ocr(path) -> Result<OcrResult>` + `parse_tsv_words(tsv)`. Tesseract-based. **96 LOC.**

**MISSING:**

1. **Resolution-adaptive sampling**. Reference Opus 4.7 ingests up to **2576 px on the long edge**. Our path passes raw bytes. Larger images get downscaled silently elsewhere; we should expose explicit `maybeResizeAndDownsampleImageBuffer` reusable from the MCP image transformer. **Effort: 1 day.**
2. **Multilingual support audit** — Tesseract default is English-only. Anthropic ships multilingual OCR (Japanese, Korean, Chinese, Arabic). **Effort: 2-3 days for traineddata management.**

---

### A.9 Realtime / Bridge / Remote Control (`integrations/realtime/{websocket_server.rs:1854, presence.rs:134}`)

Reference target: 31 files in `bridge/`, 4 in `remote/`, 3 in `server/`, 2 in `upstreamproxy/`, 1 in `coordinator/`. Total ~12K LOC of remote-control machinery — see `net-bridge-remote-server.md`.

Our `websocket_server.rs` is a server (we host the socket). Reference's bridge architecture **inverts** this: the CLI/desktop registers as a _worker_ against an external CCR cloud. **This is the central architectural gap.**

**MISSING:**

1. **Outbound bridge client** (`bridgeMain.ts:2,999`, `replBridge.ts:2,406`, `remoteBridgeCore.ts:1,008`). Required for Mobile→Desktop Dispatch parity. We have **mobile dispatch in mobile app** (per MEMORY.md) but the **desktop listener is missing** — flagged in MEMORY.md as "P1 cross-surface gap, transitional unsigned-message path expires 2026-06-05." **Effort: 6-8 weeks; counts as the #1 launch-blocker for cross-surface.**
2. **WorkSecret envelope decoding** (base64url JSON, `version=1` required, `session_ingress_token` validated). Reference: `workSecret.ts:127`. **Effort: 1 day.**
3. **Trusted-Device enrollment + persistence** — `POST /api/auth/trusted_devices` with display_name `"Claude Code on {hostname} · {platform}"`. Reference: `trustedDevice.ts:210`. Memoised secure-storage read for the macOS keychain `security` subprocess (~40 ms cost amortised). **Effort: 2 days.**
4. **JWT decode + refresh scheduler** — generation-counter pattern, 5-min buffer, 30-min fallback, 3-strike retry. Reference: `jwtUtils.ts:256`. **Effort: 2 days.**
5. **Three transport stacks** — v1 HybridTransport (WS reads + POST writes), v1 with CCR-v2 child, v2 SSE+CCRClient. **Effort: 2-3 weeks.**
6. **CCR upstream proxy / MITM-CONNECT relay** — Linux-only (Anthropic ships container-side). N/A unless we run a managed cloud; defer.
7. **Coordinator mode** — `CLAUDE_CODE_COORDINATOR_MODE=1` flips system-prompt + Worker tool list. 250-line system prompt. Required for cross-surface multi-agent dispatch. Reference: `coordinator/coordinatorMode.ts:369`. **Effort: 3-5 days for prompt + tool-set wiring (the prompt itself is mostly authored).**
8. **Direct-connect server schema** (`POST /sessions` returning `{session_id, ws_url, work_dir?}`). Reference: `server/types.ts`. Allows cross-machine `claude --server` style cowork. **Effort: 5-7 days.**
9. **`sendInterrupt` control_request from server side** — reference's `sendInterrupt` (`directConnectManager.ts:172-186`) is the only way the _client_ can tell the _agent_ to stop. Our 8787 bridge has **nothing equivalent**. **Effort: 2 days.**
10. **30+ telemetry events** — `tengu_bridge_started`, `_session_started`, `_session_done`, `_heartbeat_mode_entered`, `_reconnected`, `_token_refreshed`, `_fatal_error`, etc. Operational visibility on remote-control flow. **Effort: 1 day after bridge core lands.**
11. **WebSocket-server**: ours has solid auth-failure tracking, lockout, origin allowlist (`is_origin_allowed`, `record_auth_failure`, `is_locked_out`). **PARTIAL — no broadcast-to-team / broadcast-to-resource on the client side for collaborative editing parity. Reference Cowork pushes activity-feed events at sub-second cadence.**

### A.10 Dispatch (mobile→desktop)

**MISSING (entirely on the desktop side):**

- **QR-code pairing** — `bridgeStatusUtil.ts:163` builds the URL; reference Cowork sidebar shows the QR. Our desktop has no QR rendering for pairing. **Effort: 2 days.**
- **Dispatch HMAC + salt validation** — flagged in MEMORY.md as P1 cross-surface gap.
- **Dispatch toggle in Cowork settings** — we don't have Cowork yet; N/A pending Cowork.
- **Push-notification round-trip** — task complete / fail / needs approval → APNs/FCM. We have nothing in O-Z desktop side. **Effort: counts toward bridge.**

---

### A.11 Sandbox / sandbox_runtime (`sys/security/{sandbox.rs, sandbox_runtime.rs}`)

Our `sandbox.rs:325` + `sandbox_runtime.rs:305` implement a session-based sandbox concept: `create_session`, `is_path_allowed`, `is_host_allowed`, `update_permissions`, `set_env`, `get_working_dir`, `destroy_session`. Solid foundation.

**MISSING:**

1. **macOS Seatbelt SBPL profile** — reference and our Rust CLI both use Seatbelt (`agi-cli` has it shipped per MEMORY.md). Desktop side likely lacks the full SBPL profile generator that turns the session config into a `sandbox-exec` profile. Confirm. **Effort: 2-3 days.**
2. **Linux bubblewrap** equivalent — same status; CLI ships it, desktop should reuse via Tauri. **Effort: 2 days.**
3. **`sandbox.bwrapPath` setting + `sandbox.socatPath`** (introduced in Claude Code v2.1.133, May 2026). **Effort: 0.5 day.**
4. **Auto-mode bubblewrap-bypass mitigation** — Ona research demonstrated `/proc/self/root/usr/bin/npx` escape. Anthropic patched but the patch isn't public. **Effort: tracking + 1 day for mitigation.**
5. **`failIfUnavailable` setting** — fail closed if sandbox deps missing. **Effort: 0.5 day.**

### A.12 Prompt injection (`sys/security/prompt_injection.rs:499`)

Our impl: 16 fns covering normalise_unicode, normalise_spacing, regex pattern detection, structural anomaly check, base64 detection, jailbreak DAN.

**MISSING:**

1. **Per-tool-output classifier integration** — reference attaches the prompt-injection probe to _every_ tool's stdout/return before it enters the agent context. We have a standalone `analyze` fn but no `wrap_tool_call` integration that the agent loop calls automatically. Search shows no caller. **Effort: 2 days.**
2. **LLM-based scanner** for harder cases (regex misses obfuscated injection like steganography in screenshots). Anthropic's auto-mode classifier IS this. Counts toward A.4 §3.

### A.13 Secret manager (`sys/security/secret_manager.rs:420`)

**MISSING:**

1. **`gitleaks`-derived ruleset** — reference ports a curated subset (anthropic, OpenAI, AWS, GCP, GitHub, Slack, Stripe, NPM, Datadog, Sentry, etc.). Reference: `teamMemorySync/secretScanner.ts:23-224`. **Effort: 1-2 days for porting from the gitleaks data file.**
2. **Runtime-assembled key prefixes** so the literal byte sequences (e.g., `sk-ant-api`) don't appear in our binary — security through obscurity but useful for blue-team scanning. Reference assembles via `['sk', 'ant', 'api'].join('-')`. **Effort: 0.5 day.**
3. **`teamMemSecretGuard.ts` validateInput integration** in FileWriteTool/FileEditTool. We need to wire our scanner into the file-write hot path. **Effort: 2 days.**
4. **Secret redaction in debug logs** — reference uses 16-char + first-8 + last-4 mask (`debugUtils.ts:19-34`). Our `tracing.rs` and `redaction.rs` should do this; review needed. **Effort: 1 day if not present.**

### A.14 Tool guard (`sys/security/tool_guard.rs`)

Out of scope without reading; flagging that tool-level guard probably overlaps `core/llm/prompt_policy.rs` and `core/llm/prompt_tool_injection.rs` (also in O-Z slice) — review for completeness against reference's `tools/toolHooks.ts`.

### A.15 Permissions UI parity

The user-facing settings tabs (`Settings → Capabilities`, `Connectors`, `Privacy`) are frontend, not in O-Z scope. Backend gap: the `/agents`-equivalent slash-command surface (Library tab with "Generate with Claude" wizard). **Effort: counts toward A.16.**

### A.16 Skills (`sys/commands/skills.rs:352`, `core/skills/skill.rs:709`)

Solid foundation: Skill loader, requirements check, slash-command parsing, workspace setting, jaccard similarity scoring.

**MISSING:**

1. **Anthropic-ships official Skills** — `pdf`, `docx`, `pptx`, `xlsx`, `algorithmic-art`, `canvas-design`, `mcp-builder`, `frontend-design`. We ship none. **Effort: 1-2 weeks for the core 4 (pdf/docx/pptx/xlsx); the bundled scripts are publicly available in `anthropics/skills`.**
2. **Progressive disclosure metadata-only loading**. Reference: only `name + description` loaded at session start (~64 chars per Skill); body loaded on-demand when description matches. We load full `to_context_string()` (`skill.rs`) — review whether that includes the body. **Effort: 1 day to confirm + adjust.**
3. **Skill-creator meta-skill** for in-product skill authoring. **Effort: 3-5 days; counts as a Skill itself.**
4. **Org-wide provisioning (Team/Enterprise)** — admins default-enable a skill org-wide. Required for paid tiers. **Effort: 2-3 days.**
5. **Skills API endpoints** (`/v1/skills`) for upload/list/sync. **Effort: 1 week server + client.**
6. **Eval harness** — Anthropic's recommended ~20-query 50/50 should-trigger / should-not-trigger eval set. **Effort: 1 day.**

### A.17 Subagents / orchestration (`core/{agi/orchestrator.rs:759, swarm/orchestrator.rs:763, research/orchestrator.rs:1080}` + `sys/commands/orchestration.rs:191`, `core/swarm/swarm_orchestrator.rs`, `core/research/swarm_bridge.rs`, `core/swarm/task_decomposer.rs`, `core/swarm/result_aggregator.rs`, `core/research/subtask_executor.rs`)

We have substantial orchestration scaffolding (~3,000 LOC across 4 orchestrators).

**MISSING:**

1. **`Task`/`Agent` tool with built-in agents** (`Explore`, `Plan`, `general-purpose`). Reference: `tools/AgentTool/`. The Explore agent has a hard prompt-block enumerating forbidden ops; the Plan agent has a required "Critical Files" section. **Effort: 1-2 weeks for parity (prompts + dispatch).**
2. **One-shot agent set** (`Explore`, `Plan`) — never `SendMessage`-back, suppressed result trailers. Reference: `constants.ts:9-12`. **Effort: 0.5 day.**
3. **Subagent transcript sidecar persistence** — `${projectDir}/${sessionId}/subagents/agent-${agentId}.jsonl` + `.meta.json`. Reference: `sessionStorage.ts:247-303`. We have `core/agent/persistence.rs` etc. — review. **Effort: 2-3 days.**
4. **`agentNameRegistry` Map<name, AgentId>** for routing `SendMessage` to a still-running named subagent. Reference: `AppStateStore.ts:163`. **Effort: 1 day.**
5. **Worktree isolation per subagent** — `<gitRoot>/.claude/worktrees/agent-${earlyAgentId.slice(0,8)}/`. Reference: `worktree.ts:902-952`. We have nothing in O-Z. **Effort: 3-5 days; depends on git worktree wiring.**
6. **Stale-worktree GC** — 30-day mtime-based cleanup. Reference: `worktree.ts:1058-1136`. **Effort: 2 days.**
7. **Slim subagent context** — strip CLAUDE.md and gitStatus from Explore/Plan subagent prompts (saves "5-15 Gtok/week"). **Effort: 0.5 day; quick win.**
8. **`runForkedAgent` with cache-shared parent prompt** — required for low-cost subagent summarization, autoDream, magic-docs update. Reference: `utils/forkedAgent.ts`. **Effort: 3-4 days.**
9. **Per-agent MCP servers** — agent frontmatter `requiredMcpServers` w/ 30s readiness wait. Reference: `runAgent.ts:95-218`. **Effort: 2 days.**
10. **Skill preloading per-agent** with `formatSkillLoadingMetadata` UI signal. Reference: `runAgent.ts:577-646`. **Effort: 1 day.**
11. **Cleanup `finally` block** — MCP cleanup, file-state-cache `.clear()`, transcript-subdir clear, `AppState.todos[agentId]` delete, `killShellTasksForAgent()` for PPID=1 zombie shell reaping. Reference: `runAgent.ts:816-859`. We need to audit the equivalent in our orchestrators. **Effort: 2 days.**
12. **Async-launched subagents**: `run_in_background:true`. Reference: `LocalAgentTask.tsx:466-524`. We have `core/agent/background_agent.rs` — verify parity. **Effort: 2 days.**
13. **Plan-mode approval round-trip** — `plan_approval_response` structured message. Reference: `SendMessageTool.ts:888-908`. **Effort: 1 day.**
14. **TaskStop tool** — panic button that aborts all running agent tasks. Reference: `LocalAgentTask.tsx:309-321`. The system reminder lists `TaskStop` as a deferred tool — we declare it but may not implement. **Effort: 1 day.**

### A.18 Persistence / cache (`core/artifacts/persistence.rs`, `features/tasks/persistence.rs`, `sys/commands/chat/persistence.rs`, `data/cache/{tool_results.rs, watcher_integration.rs}`)

Reference target: `utils/sessionStorage.ts:5,105 LOC`.

**MISSING:**

1. **Per-project JSONL transcripts** at `~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl` with mode 0o600. We use SQLite (data/db). **PARTIAL — different format. Reference's JSONL has 17+ entry types (user/assistant/attachment/system/summary/custom-title/ai-title/task-summary/last-prompt/tag/agent-name/agent-color/agent-setting/mode/worktree-state/pr-link/file-history-snapshot/attribution-snapshot/content-replacement/queue-operation/speculation-accept/marble-origami-commit/marble-origami-snapshot/legacy progress).** Migrating to JSONL is unnecessary, but we need feature parity per axis. **Effort: 2-3 days per missing entry type.**
2. **Tail-window re-append for mutable metadata** — `reAppendSessionMetadata()` keeps the last 64 KB containing user-visible session-name fields so multi-GB sessions render their resume-picker entry from 128 KB of disk reads. **Effort: counts as architectural decision rather than feature; SQLite already gives us indexed reads but the **~tail-only reads for resume picker** pattern is missing.** **Effort: 1 day with SQLite indexing.**
3. **`removeMessageByUuid` fast tail path** — read last 64 KB, byte-search for `"uuid":"<target>"`, ftruncate at line start. Tombstone for orphaned-stream messages. **Effort: 1-2 days; SQLite makes this a simple `DELETE WHERE uuid=?`.**
4. **Pre-compaction skip for large transcripts** — `walkChainBeforeParse` byte-level pre-filter excises dead fork branches before parsing. **Effort: counts as optimisation; SQLite range queries cover.**
5. **Snip removals + preserved-segment relinks** for compact-boundary recovery. **Effort: 2 days.**
6. **Cycle detection** in `buildConversationChain` w/ `tengu_chain_parent_cycle` log + partial-transcript return. **Effort: 1 day.**
7. **Lite metadata reader for resume picker** — head 64 KB + tail 64 KB only. **Effort: 1 day.**
8. **Sidechain (subagent) write rules** — agent-sidechain entries bypass main-session UUID dedup set. **Effort: 1 day.**
9. **CCR v2 internal-event writer + `hydrateFromCCRv2InternalEvents`**. N/A unless we ship CCR.
10. **`shouldSkipPersistence`** gate (`cleanupPeriodDays:0`, `--no-session-persistence`, `NODE_ENV=test`, `CLAUDE_CODE_SKIP_PROMPT_HISTORY`). **Effort: 0.5 day.**

### A.19 Settings / state (`sys/commands/settings.rs`, `sys/commands/settings_v2.rs`, `data/state.rs`, `data/settings/{repository.rs, service.rs, validation.rs, tests.rs}`)

Reference target: 19 files in `utils/settings/` (~7,000 LOC). Schema in `types.ts:1148`.

**MISSING (or PARTIAL):**

1. **Settings hierarchy (5 sources): user → project → local → flag → policy.** Reference uses lodash `mergeWith` (last-wins) for everything except `policySettings` which is "first source wins." We have `settings_v2.rs` but the hierarchy implementation needs review. **Effort: 3-5 days for full hierarchy.**
2. **Plugin settings base layer** with allowlisted keys. **Effort: 1 day.**
3. **Managed-settings policy sources**: remote (sync) → admin-only MDM (HKLM Windows / macOS plist) → file-based at platform path → HKCU. Required for enterprise. **Effort: 1 week (3 platforms × parsers).**
4. **Hot-reload via filesystem watcher** with `awaitWriteFinish: stabilityThreshold 1000ms, pollInterval 500ms, atomic: true`. Reference: `changeDetector.ts:103-146`. We have `sys/filesystem/watcher.rs` — review. **Effort: 1 day if watcher exists.**
5. **Internal-write dedup** — settings writes mark themselves so the watcher ignores its own echoes (5-second window). Reference: `internalWrites.ts:17-32`. **Effort: 1 day.**
6. **MDM polling every 30 minutes** since registry/plist can't be filesystem-watched. **Effort: 0.5 day.**
7. **80+ schema keys** — `model`, `availableModels`, `modelOverrides`, `apiKeyHelper`, `awsCredentialExport`, `awsAuthRefresh`, `gcpAuthRefresh`, `xaaIdp`, `attribution.{commit,pr}`, `permissions.*`, `enableAllProjectMcpServers`, `enabledMcpjsonServers`, `disabledMcpjsonServers`, `allowedMcpServers`, `deniedMcpServers`, `worktree.symlinkDirectories`, `worktree.sparsePaths`, `disableAllHooks`, `defaultShell`, `allowManagedHooksOnly`, `allowedHttpHookUrls`, `httpHookAllowedEnvVars`, `allowManagedPermissionRulesOnly`, `allowManagedMcpServersOnly`, `strictPluginOnlyCustomization`, `statusLine`, `enabledPlugins`, `extraKnownMarketplaces`, `strictKnownMarketplaces`, `blockedMarketplaces`, `forceLoginMethod`, `forceLoginOrgUUID`, `otelHeadersHelper`, `outputStyle`, `language`, `skipWebFetchPreflight`, `sandbox.*`, `feedbackSurveyRate`, `spinnerTipsEnabled`, `effortLevel`, `advisorModel`, `fastMode`, `agent`, `companyAnnouncements`, `pluginConfigs`, `remote.defaultEnvironmentId`, `autoUpdatesChannel`, `disableDeepLinkRegistration`, `minimumVersion`, `plansDirectory`, `classifierPermissionsEnabled`, `voiceEnabled`, `assistant`, `channelsEnabled`, `allowedChannelPlugins`, `defaultView`, `prefersReducedMotion`, `autoMemoryEnabled`, `autoMemoryDirectory`, `autoDreamEnabled`, `showThinkingSummaries`, `skipDangerousModePermissionPrompt`, `skipAutoPermissionPrompt`, `useAutoModeDuringPlan`, `autoMode.*`, `disableAutoMode`, `sshConfigs`, `claudeMdExcludes`, `pluginTrustMessage`. **Effort: 1-2 weeks for full schema + migration.**
8. **`.passthrough()` semantics** — preserve unknown keys through write-modify-write cycles. Required for forward compat. **Effort: 1 day.**
9. **`updateSettingsForSource`** atomic write w/ `markInternalWrite(filePath)`. **Effort: 1 day.**
10. **Validation: `validatePermissionRule`** — empty rule, mismatched parens, MCP-rule format `mcp__server`/`mcp__server__*`/`mcp__server__tool`, non-MCP uppercase, Bash `:*` end-of-rule. **Effort: 2 days.**
11. **`forceLoginMethod` claudeai|console** + `forceLoginOrgUUID`. Required for enterprise SSO pinning. Reference: `auth.ts:1923-2000`. **Effort: 2 days.**

### A.20 Stripe billing (`sys/billing/{stripe_client.rs:1070, webhooks.rs:724}`, `sys/commands/subscription.rs`)

Solid coverage: customer create/get, subscription CRUD, invoices, usage tracking, Stripe Customer Portal, payment methods, setup intents, webhook signature verification (HMAC + timestamp freshness), event idempotency, all subscription/invoice/customer event handlers.

**MISSING (vs. Anthropic billing scope):**

1. **Apple in-app purchase / Google Play subscription** routing. Anthropic supports `apple_subscription` and `google_play_subscription` billing types (`auth.ts:1623-1643`). Required for mobile in-app upgrades. **Effort: 2-3 weeks; out-of-scope of this slice but flagged.**
2. **Per-workspace spend caps** (Team/Enterprise). **Effort: 2-3 days.**
3. **Service tiers** (`Standard | Priority | Flex | Batch`) with the 50% Batch discount. **Effort: 5 days; depends on backend pricing infra.**
4. **Compliance-API enablement** flag (separate from regular billing). **Effort: 1 day after Compliance API ships.**
5. **`overageProvisioningAllowed` gate** — true for `stripe_subscription`/`stripe_subscription_contracted`/`apple_subscription`/`google_play_subscription`. **Effort: 0.5 day.**

### A.21 Tracing / telemetry (`sys/telemetry/{tracing.rs, redaction.rs}`)

**MISSING:**

1. **`tengu_*` event taxonomy parity** — reference emits ~100+ named events (`tengu_mcp_*`, `tengu_bridge_*`, `tengu_compact_*`, `tengu_auto_mode_*`, etc.). Our taxonomy is unlikely to match — review needed. Operational visibility gap. **Effort: 1-2 days for naming alignment.**
2. **OpenTelemetry export (OTel)** — reference Cowork streams tool calls, file access, and approval states to OTel exporters when `otelHeadersHelper` is configured. Required for Team/Enterprise. **Effort: 5-7 days.**
3. **Two-marker PII discipline** — `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS` (general) vs `AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED` (privileged BQ columns w/ `_PROTO_*` prefix). PII-tagged stripped on non-1P sinks via `stripProtoFields()`. **Effort: 2 days.**
4. **`sinkKillswitch.ts`** — runtime-disable individual sinks via GrowthBook config. **Effort: 1 day.**

### A.22 Speech / voice (`features/speech/{ptt.rs, recognition.rs, tts.rs, vad.rs, wake.rs}`)

Voice mode shipping in Anthropic at "beta English-only" on web/desktop/mobile. We have a clear feature set already. Gap audit out of scope unless cited; ad-hoc:

**MISSING:**

1. **Multiple voices on mobile** (web is text-only voice currently). Reference: §6.2. **Effort: 1 week per voice.**
2. **Recordings deleted-after-transcription** policy declaration. Compliance gate. **Effort: 0.5 day.**

### A.23 Stripe — paid-tier launch is BLOCKED on Supabase migration apply

Per MEMORY.md: ship-blocker for Hobby tier is `process_stripe_event_idempotent` RPC application + verification against production Supabase DB. Code/filesystem migration is **complete**; only `supabase db push` and end-to-end webhook test remain. **Effort: 1 day, ops-gated.**

### A.24 Tray / window / updater (`sys/commands/tray.rs`, `ui/tray.rs`, `sys/commands/window.rs`, `ui/overlay/{window.rs, renderer.rs}`, `features/updater.rs`, `sys/security/updater.rs`)

**MISSING:**

1. **Code-signing / notarization on macOS** — Anthropic ships universal binary with `D2PR62RLT4` (per MEMORY.md, our identity). Apple secrets gap blocks v1.2.1 for macOS. **Effort: ops-gated; counts toward `release-desktop.yml`.**
2. **Squirrel.Mac autoupdate** parity. Anthropic uses Squirrel.Mac. Tauri's updater is `tauri-plugin-updater` — different mechanism, fine; just ensure parity on weekly cadence. **Effort: review only.**
3. **MSIX installer for Windows** with `CoworkVMService` for Hyper-V. Required for Cowork-on-Windows. Not in our roadmap until Cowork ships. **Effort: 2-3 weeks.**
4. **`claude://` deep-link** handler. We have `agiworkforce://oauth/callback` — extend for session deep-link, .mcpb extension association, etc. **Effort: 2 days.**
5. **System-tray quick-entry global shortcut** (Anthropic's default `Cmd+Shift+.`). We have `sys/commands/shortcuts.rs` — review parity. **Effort: 1 day.**
6. **`.mcpb` desktop extension installer**. Anthropic ships MCP-bundle file format for one-click install. **Effort: 5-7 days.**

### A.25 Workflows / proactive / scheduler (`features/workflows/{publishing.rs, social.rs, templates_marketplace.rs}`, `core/scheduler/{proactive.rs, tests.rs}`, `core/llm/tool_executor/scheduler_tools.rs`, `data/analytics/scheduled_reports.rs`)

**MISSING:**

1. **Cowork scheduled tasks (daily/weekly/monthly recurring)** — shipped Mar 2026 in Cowork. Counts toward Cowork. **Effort: 2-3 days after Cowork.**
2. **`/loop` slash command** (`schedule` skill exists per system reminder). Reference: §5.2 `/loop`. **Effort: 0.5 day.**
3. **Cron jitter** (`cronJitterConfig` flag-gated module). **Effort: 1 day.**
4. **`scheduled_tasks.json` cron jobs in headless mode** — reference: `print.ts:2702-2734`. Wired via `WORKLOAD_CRON` workload tag for billing-header attribution. **Effort: 2 days.**

### A.26 Live Artifacts (`core/artifacts/{persistence.rs, renderer.rs, store.rs, tests.rs, types.rs}`)

**MISSING:**

1. **Live Artifacts (auto-refresh against connected MCP servers)** — Apr 2026. **Effort: 3-5 days.**
2. **Persistent storage (20 MB per artifact, personal or shared mode)** — only on published artifacts; Pro/Max/Team/Enterprise. **Effort: 5-7 days.**
3. **Direct API calls from artifacts** — artifacts call Claude's API without the user supplying keys; usage counts against the _viewer's_ subscription. **Effort: 1-2 weeks; depends on viewer-attribution infrastructure.**
4. **MCP-connected artifacts** (Asana, Google Calendar, Slack and any custom server). **Effort: 3-5 days.**
5. **Multi-artifact tabbed viewer** with version arrows. Frontend; backend just needs versioning support — review `artifacts/persistence.rs`. **Effort: 1 day backend.**
6. **Embed code** with allowed-domains list — public artifacts can be embedded. **Effort: 2 days.**

### A.27 Web search / research (`features/search/web_search.rs`, `core/research/{orchestrator.rs:1080, report.rs, subtask_executor.rs, swarm_bridge.rs, swarm_orchestrator.rs, types.rs, web_search_config.rs}`)

Strong scaffolding here. Specific gaps:

**MISSING:**

1. **Web-search citation chips** with hover preview + numbered footnotes. Frontend; backend just emits the structured citation data — review web_search_config. **Effort: 1 day backend.**
2. **`Ask before acting` vs `Act without asking` mode** — for the equivalent of Chrome-extension Ask/Act distinction. Backend signal needed. **Effort: 1 day.**

### A.28 Trello / Outlook / one_drive / Whatsapp / Telegram / Signal / Slack / Teams (`features/messaging/*`, `features/productivity/{trello_client.rs, unified_task.rs}`, `features/calendar/{outlook_calendar.rs, timezone.rs}`, `integrations/cloud/one_drive.rs`, `integrations/api_integrations/{perplexity.rs, runway.rs, veo3.rs}`)

These are connector-level integrations. Reference's Connectors directory has 200+; we ship the listed ~10. **MISSING ~190 connectors.** Each is 1-3 days of work depending on OAuth complexity. **Effort: ongoing; not a single-sprint number.**

**Specifically MISSING from the high-traffic list:** Asana, Notion, Linear, Atlassian/Jira/Confluence, Monday.com, ClickUp, Gmail, Microsoft 365 (most), Box, Dropbox, Figma, Canva, GitHub MCP, Hex, Amplitude, Sentry, Vercel, Cloudflare, Stripe (we have billing but no Stripe-as-connector), PayPal, FactSet, S&P Capital IQ, MSCI, PitchBook, Morningstar, Chronograph, LSEG, Daloopa, Moody's, Apple Health, Google Health Connect, PubMed, Spotify, Uber, Instacart, AllTrails, Tripadvisor, Audible, Resy, OpenTable.

---

## B. Partial — features partially implemented

### B.1 OAuth (`core/mcp/oauth.rs`)

**HAVE.** PKCE + auth-code + AES-256-GCM token storage + 50-flow concurrent cap + 10-min PKCE TTL + 120s expiry buffer + deep-link callback.

**PARTIAL.** Refresh exists but lacks cross-process lock + jittered backoff + `invalidateOAuthCacheIfDiskChanged()` + race resolution. Token storage exists but lacks RFC 7009 revocation + 5-scope invalidation + Slack-quirk normaliser. Discovery is config-only (no RFC 9728/8414).

**Bridge to full parity: 4-6 weeks of focused work** per A.1.

### B.2 MCP transport (`core/mcp/transport.rs`)

**HAVE.** Stdio + SSE transports, IPv6-mapped block, blocklist for env vars, SSE event channel, danger-accept-invalid-certs in debug only.

**PARTIAL.** No Streamable-HTTP, no WebSocket, no IDE-bound, no in-process pair, no SDK control transport. Connection lifecycle missing terminal-error counter + stdio cleanup escalation + per-request fresh timeout.

**Bridge: 2-3 weeks.**

### B.3 MCP session/protocol (`core/mcp/session.rs`, `protocol.rs`)

**HAVE.** Elicitation request/response (form mode), pending-elicitations map, oneshot channel for response, proper Mutex over pending, server-name + instructions truncation hooks.

**PARTIAL.** No URL-elicitation two-phase flow, no notifications/_ handlers (`tools/list_changed`, `prompts/list_changed`, `resources/list_changed`, `notifications/claude/channel_`), no `McpSessionExpiredError` retry loop.

**Bridge: 2 weeks.**

### B.4 Permissions (`sys/security/permissions.rs`)

**HAVE.** SQLite-backed permission store, set/check/get/reset, deny/allow, pattern matching.

**PARTIAL.** Flat lookup, not the 10-step pipeline. No 6 modes. No auto-mode classifier. No `pathValidation` 6-step pipeline. No dangerous-files allowlist. No Windows path-pattern blocker. No additionalDirectories normalisation. No shadowed-rule detection. No bypassPermissionsKillswitch. No SAFE_YOLO_ALLOWLISTED_TOOLS. No permissionExplainer.

**Bridge: 6-8 weeks. This is the highest-impact security work in the slice.**

### B.5 Computer Use (`automation/computer_use/*`)

**HAVE.** Strong observe-plan-act loop, OPA result struct, vision LLM call, action parsing/execution, key parsing, wait-for-text, screen-capture coordinate translation (HiDPI-safe), session management, safety primitives (allow/block/needs_confirmation), patterns init.

**PARTIAL.** No VM isolation. No network egress allowlist. No app-blocklist data. No 30-min Dispatch re-prompt. No server-side prompt-injection probe per action.

**Bridge: 4-8 weeks for VM isolation; 2 weeks for the rest.**

### B.6 Realtime / WebSocket (`integrations/realtime/{websocket_server.rs:1854, presence.rs:134}`)

**HAVE.** Auth-failure tracking with lockout, origin allowlist (Tauri-aware), broadcast-to-user / team / resource, native CDP message execution, per-IP rate limit on auth.

**PARTIAL.** Server-only — we don't have the outbound bridge client to register with an external CCR cloud. No WorkSecret/TrustedDevice/JWT-refresh-scheduler. No coordinator mode.

**Bridge: 6-8 weeks. Counts as #1 cross-surface launch blocker.**

### B.7 Sandbox (`sys/security/{sandbox.rs:325, sandbox_runtime.rs:305}`)

**HAVE.** Session create/destroy, path/host allow checks, env set, working-dir, permission update.

**PARTIAL.** No Seatbelt SBPL profile generation. No bubblewrap wrapping. No `failIfUnavailable` setting integration. No `bwrapPath`/`socatPath` settings. No documented bubblewrap-bypass mitigation.

**Bridge: 1-2 weeks.**

### B.8 Skills (`core/skills/skill.rs:709`, `sys/commands/skills.rs:352`)

**HAVE.** Skill loader, requirements check, slash-command parsing, workspace setting, jaccard similarity, tool allowlist, named/positional argument substitution.

**PARTIAL.** No bundled official skills (pdf/docx/pptx/xlsx). Possibly no progressive disclosure (loads full context). No skill-creator meta-skill. No org-wide provisioning. No Skills API endpoints.

**Bridge: 2-3 weeks for the bundled-Skills core.**

### B.9 Stripe billing (`sys/billing/*`)

**HAVE.** Customer/subscription/invoice CRUD, payment methods, setup intents, webhooks (signature + idempotency + 6 event handlers), Customer Portal, usage tracking.

**PARTIAL.** No Apple/Google in-app purchase routing, no per-workspace spend caps, no Service tiers, no Compliance-API flag, no overageProvisioning gate.

**Bridge: 2-3 weeks for full parity (most blocked on cross-platform store SDK integration).**

### B.10 Settings hierarchy (`sys/commands/settings_v2.rs`, `data/settings/*`)

**HAVE.** Settings v2 storage layer, validation, repository, service.

**PARTIAL.** Need confirmation: 5-source hierarchy, last-wins merge, policy first-wins, hot-reload, internal-write dedup, MDM polling, full schema (~80 keys).

**Bridge: 2-3 weeks.**

### B.11 Persistence (`*persistence.rs ×3`, `data/cache/*`)

**HAVE.** SQLite-backed persistence, cache layer, watcher integration.

**PARTIAL.** No tail-window re-append for mutable metadata. No `removeMessageByUuid` fast tail path. No 17+ entry types from JSONL transcripts (most aren't applicable; some are like `pr-link`, `worktree-state`, `task-summary`). No CCR v2 internal-event writer.

**Bridge: 2-3 weeks for parity per axis.**

### B.12 Subagent orchestration (`core/{agi,swarm,research}/orchestrator.rs ×3`, `core/swarm/*`, `core/research/*`)

**HAVE.** ~3,000 LOC of orchestrator scaffolding, swarm bridge, task decomposer, result aggregator, subtask executor.

**PARTIAL.** Tool name `Agent`/`Task` not unified. No built-in agents (Explore/Plan/general-purpose). No worktree isolation per subagent. No `agentNameRegistry` Map. No slim-context Explore/Plan strip. No `runForkedAgent` w/ cache-shared parent prompt. No skill preloading per agent. No PPID=1 zombie shell reaping in cleanup `finally`. No plan-mode approval round-trip. No `TaskStop` panic button.

**Bridge: 4-6 weeks.**

### B.13 Tray + window + updater (`sys/commands/{tray.rs, window.rs}`, `ui/tray.rs`, `ui/overlay/*`, `features/updater.rs`, `sys/security/updater.rs`)

**HAVE.** Basic tray, window, updater scaffolding via Tauri plugins.

**PARTIAL.** Code-signing identity present (`D2PR62RLT4`); APPLE\_\* secrets missing (release-desktop.yml gap). No `.mcpb` extension installer. No claude://-style deep-link handler beyond OAuth callback.

**Bridge: 2-3 weeks ops + 5-7 days .mcpb installer.**

### B.14 Speech (`features/speech/*`)

**HAVE.** PTT, recognition, TTS, VAD, wake-word.

**PARTIAL.** Single-voice presumably; multi-voice on mobile pending; recordings-deleted policy declaration unclear.

**Bridge: 1-2 weeks per voice.**

### B.15 Tools — server tools (`core/llm/server_tools.rs`)

**PARTIAL.** Server-side tools (web_search, code_execution) likely wired but the renderer + structured-output handling for inline code chips, downloadable file chips, charts/visuals is frontend-bound. Backend should emit structured tool-result blocks per the reference's `transformResultContent`. **Effort: 2 days backend.**

---

## C. Per-axis percentage summary

I'll grade O–Z file coverage on a per-axis basis. Percentages estimate **functional parity vs Anthropic May-2026 baseline** (where 100 % = ship-ready against the reference). All graded conservatively.

| Axis                                              |    Score | Notes                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | -------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP transport variants** (8 in ref)             | **30 %** | stdio + SSE only. No streamable-HTTP, WS, IDE, in-process pair, SDK control. Also missing connection-lifecycle hardening.                                                                                                                                                                                                                                       |
| **MCP OAuth 2.1 + DCR + advanced flows**          | **25 %** | PKCE + token storage + refresh + concurrent-flow cap. Missing RFC 9728/8414 discovery, RFC 7591 DCR, RFC 7009 revocation, CIMD/SEP-991, paste-callback, step-up, XAA, cross-process lock, granular invalidation, headersHelper, telemetry attribution, negative cache, Slack-quirk normaliser.                                                                  |
| **MCP elicitation + notifications**               | **40 %** | Form elicitation handled. URL elicitation two-phase flow + `tools/list_changed`/`prompts/list_changed`/`resources/list_changed` + channel notifications + permission relay all missing.                                                                                                                                                                         |
| **MCP tool-call result transform**                | **25 %** | Text only. Image resize/downsample, audio persistence, resource-link rendering, large-output disk persistence + `getLargeOutputInstructions`, MCP tool-name protocol w/ `mcp__server__tool` round-trip + `mcpInfo` for permissions, annotations (`readOnlyHint`/`destructiveHint`/`openWorldHint`), `_meta['anthropic/searchHint']`/`alwaysLoad` — all missing. |
| **MCP config / scope / dedup**                    | **15 %** | Flat list. No 7-source scope hierarchy, no allowlist/denylist policy, no per-project approval gate, no atomic .mcp.json write, no env-var expansion, no content-signature dedup.                                                                                                                                                                                |
| **Permissions: rule precedence pipeline**         | **15 %** | Flat lookup; no 10-step pipeline, no 6 modes, no auto-mode classifier, no `requiresUserInteraction`, no safety check carve-outs, no shadowed-rule detection.                                                                                                                                                                                                    |
| **Permissions: path validation**                  | **20 %** | Some path traversal handling. No `pathValidation.ts` 6-step pipeline (UNC/tilde-variant/shell-expansion blocks), no Windows path-pattern blocker, no `additionalDirectories` normalisation, no symlink resolution.                                                                                                                                              |
| **Permissions: dangerous-pattern catalogue**      | **10 %** | Almost nothing data-side. `DANGEROUS_FILES`/`DANGEROUS_DIRECTORIES` lists not ported.                                                                                                                                                                                                                                                                           |
| **Bash command guarding**                         |  **5 %** | No tree-sitter AST parse, no 22-validator chain, no wrapper stripping, no `SAFE_ENV_VARS` allowlist, no `BARE_SHELL_PREFIXES` set, no `isCommandReadOnly` allowlist for plan mode.                                                                                                                                                                              |
| **PowerShell guarding**                           |  **0 %** | None.                                                                                                                                                                                                                                                                                                                                                           |
| **Computer Use action vocabulary**                | **80 %** | Have most of `computer_20251124`. Missing `triple_click` likely; review `enable_zoom` API; check `wait` semantics.                                                                                                                                                                                                                                              |
| **Computer Use VM isolation**                     |  **0 %** | No Apple Virtualization Framework, no Hyper-V VM bundles. Run-on-host only. **Critical Cowork blocker.**                                                                                                                                                                                                                                                        |
| **Computer Use safety / app-blocklist**           | **40 %** | Per-app permission scaffolding exists (`with_app_permissions`) but the catalogue of sensitive apps is empty. No 30-min Dispatch re-prompt.                                                                                                                                                                                                                      |
| **Outbound bridge / Remote Control**              |  **0 %** | We have a server (websocket_server.rs); reference has the _worker_ / _client_ side. Architectural inversion required.                                                                                                                                                                                                                                           |
| **Coordinator mode**                              |  **0 %** | Not implemented.                                                                                                                                                                                                                                                                                                                                                |
| **Direct-connect server**                         | **10 %** | We have generic websocket server; missing the structured `POST /sessions` schema + `ws_url` flow + `sendInterrupt` control_request.                                                                                                                                                                                                                             |
| **Sandbox (Seatbelt + bubblewrap)**               | **30 %** | Session-based path/host gating; no SBPL profile generation, no bwrap wrapper, no `failIfUnavailable`.                                                                                                                                                                                                                                                           |
| **Prompt injection detection**                    | **40 %** | Regex/structural detection; no LLM probe; not wired into every tool result automatically.                                                                                                                                                                                                                                                                       |
| **Secret manager + scanner**                      | **35 %** | Storage layer good. No gitleaks-derived ruleset, no FileWriteTool integration, possibly missing redaction in tracing.                                                                                                                                                                                                                                           |
| **Skills core**                                   | **55 %** | Loader, requirements, slash commands, jaccard scoring solid. Missing bundled official skills (4-8 from Anthropic), progressive disclosure check, skill-creator meta-skill, org-wide provisioning, /v1/skills API.                                                                                                                                               |
| **Subagent orchestration / Task tool**            | **35 %** | ~3,000 LOC scaffolding. Missing built-in agents (Explore/Plan), worktree-per-agent, agentNameRegistry, slim-context Explore/Plan, runForkedAgent w/ cache, skill preloading, cleanup zombie reaping, plan-mode approval, TaskStop.                                                                                                                              |
| **Worktree isolation + GC**                       |  **5 %** | Effectively absent in O-Z slice.                                                                                                                                                                                                                                                                                                                                |
| **Persistence — JSONL parity**                    | **40 %** | SQLite based; not JSONL. Most entry types missing (pr-link, worktree-state, task-summary, ai-title, etc.). No tail-window mutable metadata.                                                                                                                                                                                                                     |
| **Settings hierarchy + schema**                   | **25 %** | settings_v2 layer exists. 5-source hierarchy, ~80 keys, MDM, hot-reload, internal-write dedup all need verification or implementation.                                                                                                                                                                                                                          |
| **Stripe billing**                                | **75 %** | Solid coverage. Missing Apple/Google IAP, per-workspace spend caps, Service tiers, Compliance-API flag.                                                                                                                                                                                                                                                         |
| **Telemetry + OTel export**                       | **30 %** | Have tracing. No `tengu_*` event taxonomy parity, no OTel export, no PII-marker discipline, no sinkKillswitch.                                                                                                                                                                                                                                                  |
| **Live Artifacts + persistent storage**           | **20 %** | Renderer + persistence + store + types scaffolded. No live-refresh against MCP, no persistent storage, no direct API calls, no MCP-connected artifacts, no embed code.                                                                                                                                                                                          |
| **Connectors directory (200+)**                   | **10 %** | We ship Slack/Teams/Telegram/WhatsApp/Outlook/OneDrive/Trello/Perplexity/Runway/Veo3 + a handful. Reference ships 200+.                                                                                                                                                                                                                                         |
| **Code-signing / installer / `.mcpb`**            | **40 %** | macOS identity present; APPLE\_\* secrets missing (ops). No MSIX. No `.mcpb` extension installer.                                                                                                                                                                                                                                                               |
| **Voice / speech surface**                        | **65 %** | PTT/recognition/TTS/VAD/wake all in slice. Multi-voice + recordings-deleted policy declaration pending.                                                                                                                                                                                                                                                         |
| **Cron / scheduled tasks**                        | **40 %** | Scheduler scaffolding. No cron-jitter, no Cowork-scheduled-tasks, no /loop in headless mode.                                                                                                                                                                                                                                                                    |
| **Web search rendering / citations**              | **70 %** | Backend likely emits citation blocks; review web_search_config + structured output. Frontend-bound.                                                                                                                                                                                                                                                             |
| **OAuth multi-org pinning (`forceLoginOrgUUID`)** |  **0 %** | Not implemented. Required for enterprise.                                                                                                                                                                                                                                                                                                                       |

**Composite score across the 32 axes: ~28 %.**

Reads as: **~30 % of the May 2026 Claude-Suite functionality represented by the O-Z slice files is production-ready against the reference baseline.** This is consistent with our public-MVP "GO-WITH-CAVEATS" status (per MEMORY.md) — the local-only and BYOK paths shipped and the remaining 70 % is the Cowork-class + enterprise-hardening + bridge-class work that is paid-tier ship-blocking.

---

## D. Effort estimate roll-up

Estimated work to close the O-Z slice gaps to ship-ready parity:

| Axis                                                                                                                                                           | Effort range          | Priority                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------- |
| MCP OAuth advanced flows (RFC 9728/8414/7591/7009/CIMD + step-up + XAA + paste-callback + cross-process lock)                                                  | 4–6 weeks             | P0                              |
| MCP transport matrix (Streamable-HTTP, WS, IDE, in-process, SDK control)                                                                                       | 2–3 weeks             | P0                              |
| MCP elicitation + notifications + URL flow + channels                                                                                                          | 2 weeks               | P0                              |
| MCP tool-result transform + name protocol + annotations                                                                                                        | 2 weeks               | P0                              |
| MCP config scope hierarchy + denylist/allowlist policy                                                                                                         | 1–2 weeks             | P0                              |
| Permission 10-step pipeline + 6 modes + auto-mode classifier                                                                                                   | 4–6 weeks             | P0                              |
| `pathValidation` 6-step pipeline + Windows blockers + dangerous-files                                                                                          | 1 week                | P0                              |
| Bash AST + 22-validator chain + wrappers + safe envs                                                                                                           | 2–3 weeks             | P0                              |
| PowerShell mirror                                                                                                                                              | 2–3 weeks             | P1                              |
| Computer Use VM isolation (Apple VF + Hyper-V)                                                                                                                 | 4–8 weeks             | P0 (Cowork ship-blocker)        |
| Computer Use app-blocklist catalogue + safety polish                                                                                                           | 1 week                | P1                              |
| Outbound bridge / remote-control worker (3 transport stacks + WorkSecret + JWT scheduler + trusted-device + coordinator mode)                                  | 6–8 weeks             | P0 (cross-surface ship-blocker) |
| Direct-connect `--server` mode                                                                                                                                 | 1 week                | P1                              |
| Sandbox SBPL + bwrap + failIfUnavailable + bypass mitigations                                                                                                  | 1–2 weeks             | P0                              |
| Prompt-injection LLM probe + per-tool wiring                                                                                                                   | 1 week                | P1                              |
| Secret-manager scanner ruleset + FileWriteTool integration + log redaction                                                                                     | 1 week                | P1                              |
| Bundled skills (pdf/docx/pptx/xlsx) + skill-creator + /v1/skills API + org provisioning                                                                        | 2–3 weeks             | P0                              |
| Subagent orchestration parity (built-ins + worktree + agentNameRegistry + slim context + forkedAgent + skill preload + zombie reap + plan approval + TaskStop) | 4–6 weeks             | P0                              |
| Persistence JSONL parity / tail-window / fast tombstone / lite metadata                                                                                        | 2–3 weeks             | P1                              |
| Settings hierarchy + 80-key schema + MDM + hot-reload                                                                                                          | 2–3 weeks             | P0                              |
| Stripe Apple/Google IAP + spend caps + Service tiers                                                                                                           | 2–3 weeks             | P1                              |
| Telemetry tengu\_\* parity + OTel export + PII discipline                                                                                                      | 1–2 weeks             | P1                              |
| Live Artifacts + persistent storage + direct API calls + MCP-connected                                                                                         | 2–3 weeks             | P1                              |
| `.mcpb` extension installer                                                                                                                                    | 1 week                | P1                              |
| Connectors directory expansion (priority 25 from 200+)                                                                                                         | ongoing, ~1 week each | rolling                         |

**Total effort to close gaps in O-Z slice (non-overlapping work): ~9–12 months of one engineer-FTE-equivalent at sustained pace.** Parallel-team parallelisation can compress to 3–4 months calendar with 4-6 engineers per the "parallel agent zones, file ownership" methodology in `dev-methodology.md`.

---

## E. P0 ship-blockers in this slice

Ranked:

1. **Outbound bridge / Remote Control (cross-surface)** — without it Mobile→Desktop Dispatch silently breaks 2026-06-05 per MEMORY.md. **6-8 weeks.**
2. **MCP OAuth advanced flows (RFC 7591 DCR + RFC 9728/8414 discovery)** — without these we cannot connect to _any_ claude.ai-grade remote MCP server (Linear, Notion, GitHub, Stripe, Sentry, Atlassian). **4-6 weeks.**
3. **Permission 10-step pipeline + auto-mode classifier** — current bypass mode is unsafe without the carve-outs (steps 1a, 1d, 1f, 1g) that even bypass cannot override. **4-6 weeks.**
4. **MCP transport variants** (Streamable-HTTP at minimum). Without it our HTTP MCP servers will silently 406 against spec-compliant peers. **1 week for HTTP alone.**
5. **MCP tool-name protocol + permissions integration** — `mcp__server__tool` round-trip required for permission rule matching. **2 days.**
6. **Bundled official skills (pdf/docx/pptx/xlsx)** — Anthropic ships these in the box; we don't. Documentation/productivity table-stakes. **1-2 weeks.**

P0s 1, 2, 3 are the central blockers for paid-tier launch.

---

_GAP-D3 desktop Rust O-Z scope, compiled 2026-05-08, per the 24-team gap-matrix sprint._
