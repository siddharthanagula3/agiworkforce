# AGI Workforce — Repository Exploration & Risk Register

Generated: 2026-05-28 · Branch: `hardening/non-migration-2026-05-28` (isolated worktree)

Source: read-only parallel exploration (workflow wvrb2f2xq). Coverage: **14/20 areas** here; web routes/pages/features/infra, desktop frontend+state, desktop Rust core/sys, and Mobile are in the gap-fill run (wcro4rrxs).

> NOTE: explored mid-migration (concurrent supabase→neon→clerk work). Architecture/risk findings are durable; exact line numbers in web/desktop/mobile should be re-verified on the post-migration tree.

---

## ⚠️ Independent verification corrections (hardening agent)

The synthesis below is subagent-generated; claims marked "VERIFIED LIVE" were not all independently checked. Corrections from my own source reads:

- **CLI memory leak (synthesis's #1 P0): DOWNGRADED to LATENT P0.** The synthesis claimed it "leaks out-of-box on every consolidation cycle." Verified false: `extract_session_summary` (the only writer of `session_summaries/*.md`) has **zero callers repo-wide**; `consolidate` (live at `agent/chat.rs:1335`) early-returns on the empty dir, so **no cloud call fires today**. The _design_ defect is real and must be fixed before the writer is ever wired: `memory_pipeline.rs` routes both extract+consolidate through `resolve_fast_model(config)`=default cloud model (`claude-opus-4-7`) with no `validate_privacy_boundary()` and no session `privacy_mode`. Fix = thread the session privacy mode/provider into the pipeline and skip/redirect cloud for Local sessions. Conflict-free (apps/cli, not migration-touched).
- Other "verified" P1s (computer-use confirmation skip, RLS isolation gap, worker-token forgery) are in migration-owned areas; **pending my independent verification** before I treat them as fact or act.

---

## Executive summary

AGI Workforce is a seven-surface (web, desktop, mobile, CLI, Chrome ext, VS Code ext, sandbox) pnpm+cargo monorepo whose trust-boundary model (Local / BYOK / Managed-cloud) is well-designed in the type layer and well-defended on the modern live paths — but undermined by three live defects and a large stratum of polished-but-unwired or duplicated code. The single most serious finding is verified against source: the CLI's background memory consolidation (memory_pipeline.rs) routes Local-session-derived summaries to config.default.model — which ships as the cloud model claude-opus-4-7 — with no validate_privacy_boundary() call, silently uploading Local content to Anthropic out-of-box. That is a direct, shipping violation of the #1 locked rule. The second is the desktop computer-use OPA agentic loop, which skips destructive-action confirmation by default (require_confirmation:false in ComputerUseTask::default()), so a prompt-injected LLM can inject OS input unattended — and its finance/crypto URL blocklist plus per-app gate are either dead code or fail-open. The third class is fabricated/fake user-facing data and isolation: hosted tenant isolation is documented as RLS but no RLS exists (invalid SET LOCAL = $1, getUserScopedClient ignores userId); the desktop release pipeline writes 404 download URLs and a static 1.2.0 version into the updater; enterprise /organizations silently returns []; ContactSales 404s.

Architecturally the codebase is mid-migration on two axes that produce most of the debt: Supabase→Neon/Clerk (complete in code, but docs and the canonical CURRENT_DECISIONS.md tie-breaker still claim Supabase is production), and a Netlify→Vercel/Next.js move that left apps/web/core as a large dead stack pointing at non-existent /.netlify proxies. The shared engine crates, the llm-runtime retry/fallback subsystem, the central AppState store, and four CLI crate deps are all built, tested, and unwired — false resilience and maintenance traps, several with divergent duplicate copies (chrome setup.ts M-14 gate, app-server tools/call).

Production-readiness is uneven. The web live chat route, CLI send() path, and VS Code surface are genuinely demoable with real trust-boundary enforcement and good security posture. Desktop chat demos but its highest-risk capability (computer use) has the confirmation gap. CLI's default TUI has a broken approval prompt (dialoguer under raw mode). Mobile — the locked lead surface — has essentially no deep-dive coverage and four disabled security suites (auth-401, paywall, biometric), so its core flows are unverified. Test coverage is strong in Rust LLM-core and web security suites but contains skip-theater (desktop agi-safety E2E, self-healing) and runs only 2 of 13 desktop E2E projects. Managed-cloud correctly stays fail-closed behind a private-beta flag everywhere. Net: solid foundations, three must-fix live boundary/safety bugs, and a large de-fake/dead-code cleanup before any paid or cloud graduation.

---

## Top risks (23)

### 🔴 P0 — CLI background memory consolidation silently uploads Local-session content to a cloud provider

- **Area:** cli-rust / trust boundary · **File:** `apps/cli/src/memory_pipeline.rs (consolidate, ~L153/196; resolve_fast_model L405); spawned from apps/cli/src/agent/chat.rs:1338`
- **Fix:** VERIFIED LIVE: consolidate() reads session_summaries/\*.md (Local-conversation-derived) and calls stream_completion via resolve_fast_model(config) = config.default.fast_model ?? config.default.model, with NO validate_privacy_boundary(). The shipped default model is claude-opus-4-7 (a cloud Anthropic model, config.rs default_model()), so a Local/Ollama session leaks memory-derived content to Anthropic out-of-box on every consolidation cycle (chat.rs:1338 spawns it unconditionally when due). Direct violation of the locked 'never silently route Local to BYOK/cloud' rule. FIX: have consolidation (and extract_session_summary, send_btw) use the SESSION provider/privacy mode, and call validate_privacy_boundary() / skip cloud entirely when the session is Local, before any auxiliary LLM call. Batch 4.

### 🟠 P1 — Desktop computer-use OPA agentic loop skips destructive-action confirmation by default

- **Area:** desktop-automation-rust / safety · **File:** `apps/desktop/src-tauri/src/sys/commands/computer_use.rs:807 (ComputerUseTask{..default()}); types.rs:543 (require_confirmation:false); observe_plan_act.rs:370`
- **Fix:** VERIFIED LIVE: the gate is `if decision.requires_confirmation && task.require_confirmation`, and computer_use_execute_opa_task builds the task with ComputerUseTask::default() where require_confirmation:false. Direct-action IPC commands gate correctly, but the agentic loop runs needs-confirmation actions (typed `rm -rf /`, Alt+F4) unattended — an LLM influenced by attacker-controlled on-screen text can inject OS input with no prompt, and a direct invoke() bypasses any frontend gate. FIX: force require_confirmation for destructive/needs-confirmation actions in the OPA loop regardless of the field, or default it to true; enforce ComputerUseConsent server-side. Batch 3/8.

### 🟠 P1 — Hosted tenant isolation is documented as RLS but no RLS exists; service shim ignores per-user scoping

- **Area:** data-persistence + services-backend (merged) · **File:** `packages/data-layer/src/adapters/neon.ts (withUser, invalid SET LOCAL = $1); services/api-gateway/src/lib/neonClients.ts (getUserScopedClient ignores userId); apps/web/lib/server/neon-db.ts`
- **Fix:** Zero Neon migrations contain ENABLE ROW LEVEL SECURITY/CREATE POLICY; withUser() is unused and its binding SQL (SET LOCAL request.jwt.claim.sub = $1) is invalid Postgres; getUserScopedClient() returns the service-role client unchanged. Numerous routes carry false 'RLS enforces this even if the filter is dropped' comments. Isolation rests entirely on hand-written WHERE user_id = $n in every route — one omission is a silent cross-tenant leak with no DB backstop. FIX: either implement real RLS (set_config + policies) or delete all RLS machinery/claims; add a CI lint requiring a user_id predicate on every user-owned-table query; rename/remove getUserScopedClient and its misleading comments. Batch 2/8.

### 🟠 P1 — Desktop finance/crypto blocklist is dead code and per-app permission gate fails OPEN

- **Area:** desktop-automation-rust / safety · **File:** `apps/desktop/src-tauri/src/automation/computer_use/app_permissions.rs (is_always_blocked_host, zero callers); safety.rs (check_app_permission returns None=allow when foreground app unknown)`
- **Fix:** ALWAYS_BLOCKED_URL_HOSTS / is_always_blocked_host are implemented and tested but never called, so browser-tab automation (driving a Coinbase/Chase tab via extension_bridge) has NO host check despite the documented guarantee. Separately, check_app_permission() allows when get_active_window() is None (Wayland, missing xdotool, blocked Accessibility), bypassing the finance/crypto deny-list for the OPA loop. FIX: wire is_always_blocked_host into extension_bridge navigate/click/execute_script via ExtensionBridge::get_url(); make the per-app gate fail CLOSED when the foreground app is unknown. Batch 3/8.

### 🟠 P1 — Worker protocol session_ingress_token is unsigned and forgeable from URL params

- **Area:** services-backend / auth · **File:** `services/api-gateway/src/worker/assignment.ts (verifySessionIngressToken L88), heartbeat.ts:43, worker/types.ts (encodeWorkSecret = plain base64 JSON)`
- **Fix:** The 'Tier 3' work-unit credential is base64(JSON) with NO HMAC/signature; verification only checks that environment_id/work_id/exp inside the token match the request URL values the caller already supplies. Anyone learning a valid (envId, workId) pair can mint a token and ack/complete/heartbeat work — /complete writes attacker-controlled `result` into work_units.payload that the assigning client trusts. P1 (not P0) only because IDs are UUIDs; reachability depends on whether work_units are ever produced (open question — no producer found in this service). FIX: sign the token (HS256 keyed by JWT_SECRET, or HMAC over a server-side nonce on the work_unit row) and verify the signature. Confirm whether the worker protocol is enabled in the deployed gateway. Batch 4/8.

### 🟠 P1 — Tool-approval prompts are broken in the default CLI TUI surface

- **Area:** cli-rust / UX-safety · **File:** `apps/cli/src/tui/tui_app.rs:~2592 (send() under raw mode); apps/cli/src/features/exec/tools/bash.rs:71, file_ops.rs, chat.rs:472/1270 (dialoguer::Confirm)`
- **Fix:** The default TUI enables raw mode + alternate screen and never suspends it around session.send(), but interactive approvals use synchronous dialoguer::Confirm — under ratatui raw mode the prompt is drawn into the overwritten alternate screen and stdin conflicts with the TUI event loop, so a Dangerous/Unknown command confirmation hangs/garbles. The real approval_overlay widget is only shown as a hardcoded /permissions demo, not wired to tool execution. FIX: route run_command/edit_file/loop-detection confirmations through the approval_overlay widget under TUI (or suspend raw mode around dialoguer). Batch 7/3.

### 🟠 P1 — llm-runtime retry/fallback resilience subsystem is unwired shelf-ware (false resilience)

- **Area:** pkg-llm-routing · **File:** `packages/llm-runtime/src/retry.rs/retry.ts, fallback.ts, gateway.ts`
- **Fix:** withRetry, buildFallbackChain, createRetryContext, detectGateway have ZERO production consumers; adapters do single-shot streaming and on any 529/503/idle-timeout emit one error chunk and stop. The README claims each adapter wraps stream() in withRetry — it does not. No automatic retry, fallback, or context-overflow shrink ever fires on a real user request. CAUTION: crossProviderFallback's candidate list includes managed_cloud/ollama/lmstudio with no trust-tier filter — wiring it as-is would silently cross Local/BYOK→Managed (locked-rule violation). FIX: wire retry/fallback into the adapter or gateway stream loop AND add a trust-tier parameter excluding cross-boundary targets, OR delete the modules to stop implying resilience that doesn't exist. Batch 5/8.

### 🟠 P1 — Desktop release pipeline writes 404 download URLs and ships a static, never-bumped version

- **Area:** build-release-ci / de-fake · **File:** `.github/workflows/release-desktop.yml (update-database BASE_URL=/download/v${VERSION}); apps/desktop/src-tauri/tauri.conf.json (version 1.2.0)`
- **Fix:** Both tag schemes exist (v-desktop-1.2.0 AND v1.2.0); for a v-desktop tag the GitHub release assets live at /download/v-desktop-1.2.0/ but update-database upserts /download/v1.2.0 into the Neon releases table that /api/releases/check reads → 404 download links. Separately, tauri.conf.json version is hard-pinned to 1.2.0 and no workflow bumps it, so every binary self-reports 1.2.0 and the updater's current_version compare misbehaves (update loops). FIX: derive the version/tag once, use consistently for tag_name + download_url (verify 200 before upsert); bump tauri.conf.json from the release tag in-workflow. Batch 2/8.

### 🟡 P2 — Enterprise /organizations silently returns [] in production (embedded-join collapses to SELECT \*)

- **Area:** services-backend / de-fake · **File:** `services/api-gateway/src/routes/enterprise.ts; services/api-gateway/src/lib/neonClients.ts (assertColumnList)`
- **Fix:** The list query uses Supabase embedded-relationship select syntax, but neonClients.assertColumnList() returns '_' for any select containing parentheses, so the live query is SELECT _ with no nested `organization` object, and the route's .filter(row => row.organization) drops every row → organizations:[]. The unit test passes because the mock hands back a fabricated nested object. FIX: make assertColumnList throw on embedded-relationship syntax (fail loud) and rewrite the query; fix the test to reject invalid SQL. Batch 2/6.

### 🟡 P2 — Chrome in-page-panel setup.ts is a divergent duplicate; the security fix lives only in the live copy

- **Area:** ext-chrome / dead-code-trap · **File:** `apps/extension/src/inPagePanel/setup.ts (live, has M-14 allowlist gate) vs apps/extension/src/features/content/in-page-panel/setup.ts (migration target, MISSING the gate)`
- **Fix:** The flat file is labeled '@deprecated, re-export shim' but is a full 98-line implementation that content.ts imports and that contains the M-14 allowlist gate (inject FAB only on allowlisted origins). The features/ copy the comment tells devs to migrate to is MISSING that gate — a dev 'finishing the refactor' would silently regress M-14 and inject the launcher on every page. FIX: port the M-14 gate into the features/ copy, then make the flat file a true re-export shim; add a CI lint that any 'Re-export shim' file contains only export lines. Batch 5/8.

### 🟡 P2 — Plan-tier checks 503 (fail-closed) for free users instead of a clean 403 upgrade prompt

- **Area:** services-backend · **File:** `services/api-gateway/src/middleware/planGate.ts; routes/llm.ts (enforcePlanTier)`
- **Fix:** .single() returns an error when a user has zero subscription rows, which both handlers treat as a DB failure → 503 PLAN_CHECK_UNAVAILABLE (and retry loops); the `?? 'free'` fallback is dead code under .single() semantics. FIX: switch to .maybeSingle() so a missing subscription resolves to free → 403 upgrade prompt. Batch 7.

### 🟡 P2 — In-memory rate limiting is per-instance; financial limits are cosmetic under horizontal scale

- **Area:** services-backend / prod-hardening · **File:** `services/api-gateway/src/middleware/rateLimit.ts`
- **Fix:** Without RATE_LIMIT_REDIS_URL the limiter uses MemoryStore, so with N instances the effective per-user limit is N×max — including credits-deduct (5/min) and llm-completions. The multi-instance startup warning misses a default Fly.io 2-machine HA deploy. FIX: ship the Redis store and broaden the multi-instance detection before any paid tier. Batch 8.

### 🟡 P2 — Two divergent LLM routing source-of-truth tables produce inconsistent model selection

- **Area:** pkg-types-contracts / pkg-llm-routing · **File:** `packages/types/src/model-catalog.ts (TASK_TYPE_TO_SLOT*) vs packages/unified-chat/src/lib/promptClassifier.ts (separate tier×task matrix)`
- **Fix:** model-catalog routes Pro coding→coding_premium_pro (Sonnet 4.6) while the unified-chat classifier routes coding→coding_fast/coding_premium over the same SLOT_REGISTRY; routing behavior depends on which entry point a surface calls. Both pass import-time validation so it won't crash, but selections silently diverge. FIX: have promptClassifier import the shared TASK_TYPE_TO_SLOT\* maps from model-catalog; add a reachability test for orphaned slots. Batch 5/6.

### 🟡 P2 — Web ContactSales form posts to a missing /api/contact route (live broken flow)

- **Area:** web-core-backend / de-fake · **File:** `apps/web/core/integrations/marketing-endpoints.ts (submitContactForm); apps/web/features/pages/ContactSales.tsx`
- **Fix:** submitContactForm() is invoked at runtime and POSTs to /api/contact, but no app/api/contact/route.ts exists — every contact-sales submission 404s. /api/newsletter/subscribe is likewise missing. FIX: add the routes or repoint the form; quarantine/delete the rest of the dead Netlify-proxy core/ stack (add a CI lint forbidding '/.netlify/functions' literals). Batch 2/5.

### 🟡 P2 — Localhost bridge (port 8787) is reachable by any same-user process; some bridge calls are token-less

- **Area:** ext-chrome + ext-vscode + desktop (merged contract) · **File:** `apps/extension/src/background.ts (X-Bridge-Token only on /chat/stream; /pair, /status token-less); apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts (TCP 127.0.0.1:8787)`
- **Fix:** The desktop bridge WS/HTTP on 127.0.0.1:8787 is protected against other OS users (0600 token) but not against other processes of the same user; the Chrome extension only attaches the paired token to the chat-stream fetch, leaving /pair and /status answerable by a process that binds 8787 first. Mitigations (auth handshake, type/command allowlists, rate limit, plan re-validation) limit blast radius. FIX: move the bridge to a Unix socket/named pipe (already planned), and attach the bridge token to all bridge calls. Batch 8.

### 🟡 P2 — Shipped MCP/app-server advertises tools it cannot execute; the better implementation is dead

- **Area:** crates-engine / parity + dead-code · **File:** `apps/cli/src/app_server.rs (no tools/call arm); crates/agiworkforce-app-server/src/lib.rs (working ToolDispatch, never wired)`
- **Fix:** `agi mcp-server`/`agi app-server` are real subcommands whose tools/list advertises tools, but neither shipped handler has a tools/call arm (clients get -32601). The unused crate implements tools/call correctly — a source-of-truth inversion repeated across apply-patch/execpolicy/plugin-runtime, plus 4 dead CLI crate deps and an 8.2K-LOC network-proxy + 16 rama alpha crates pulled in to borrow two enums. FIX: delete apps/cli/src/app_server.rs and wire the crate with a real CliToolDispatch (or delete the dead crates and dep declarations); drop network-proxy/execpolicy from protocol's tree. Batch 5/7.

### 🟡 P2 — Central AppState store + side-effect fan-out + stateBridge is fully unwired dead code

- **Area:** pkg-runtime-chat · **File:** `packages/runtime/src/state/index.ts; apps/desktop/src/stores/bridge/stateBridge.ts (initStateBridges has zero callers)`
- **Fix:** appStateStore is only written by stateBridge, whose initStateBridges()/bridge\*() have zero callers; all 4 fan-out registrars loop over empty Sets. An elaborate, tested 'source of truth' produces no side effects in production. Related: packages/stores is an empty package still declared as a dependency by web+desktop; http.ts routeToCloud reads an 'agi-auth-token' localStorage key that no code writes. FIX: wire initStateBridges at startup with at least one handler, or delete the subsystem; remove the empty @agiworkforce/stores dep; source the cloud auth token from canonical state. Batch 5.

### 🟡 P2 — CURRENT_DECISIONS.md (the canonical conflict-resolver) contradicts code on the DB/auth boundary

- **Area:** docs-product · **File:** `docs/decisions/CURRENT_DECISIONS.md (Decision 17 'production stays on Supabase'; Decision 13 cites a deleted migration)`
- **Fix:** Decision 17 (dated 2026-05-28) claims production is still on Supabase, but data-layer factory enums only allow neon/postgres + clerk and check-neon-migrations.mjs forbids a supabase/ dir (wired into passing CI); known-flaws NEON-01 and technical-architecture say Neon-canonical. Agents are told to use CURRENT_DECISIONS as the tie-breaker, so the canonical resolver gives the wrong answer. FIX: reconcile Decisions 17/13 to Neon/Clerk per the doc's own Conflict Rule; extend check-doc-status.mjs to flag dead evidence citations and stale cross-references. Batch 2.

### 🟡 P2 — MCP tool calls execute with no permission confirmation in the CLI agent loop

- **Area:** cli-rust / safety · **File:** `apps/cli/src/agent/chat.rs:~1109 (mcp_ dispatch); apps/cli/src/agent/tools.rs:51`
- **Fix:** Tools whose name starts with mcp* are dispatched with no require_confirmation/safety classification — only PreToolUse hooks and tool_filters gate them, and MCP servers can do arbitrary destructive actions. Partly defensible (MCP is opt-in config; plan mode classifies mcp*\* as mutating). FIX: add a confirmation tier for non-read-only MCP tools, or explicitly document MCP servers as fully trusted once configured. Batch 3/7.

### ⚪ P3 — Google Imagen path hardcodes catalog-absent model IDs (violates models.json lock)

- **Area:** desktop-automation-rust · **File:** `apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs (generate_with_google_imagen)`
- **Fix:** Hardcodes imagen-3.2-flash-image / imagen-3.1-pro / imagen-3.1-nano and never calls resolve_image_model; models.json only has imagen-4 / imagen-4-fast, so the path violates the never-hardcode-model-IDs rule AND would return an API error on real calls. DALL-E/SD paths are correct. FIX: route Imagen through resolve_image_model with the catalog IDs. Batch 1.

### ⚪ P3 — --max-budget-usd is an advertised CLI cost cap that does nothing

- **Area:** cli-rust / de-fake · **File:** `apps/cli/src/lib.rs:423 (flag); sdk_io/protocol.rs:100 (BudgetExhausted reason never emitted)`
- **Fix:** The flag's doc promises a budget_exhausted status_update, but the field is never read and the event never emitted, so an SDK embedder relying on it for cost protection gets no enforcement. FIX: implement the cap (cost_ledger already tracks total_usd) or remove the flag and its doc promise. Batch 2/6.

### ⚪ P3 — classifyError matches 'timeout' substring before 429/529 status checks

- **Area:** pkg-llm-routing · **File:** `packages/llm-runtime/src/errors.ts (Branch 1 ~L359)`
- **Fix:** A 429/529 whose body text contains 'timeout' is misclassified as api_timeout (retryable but not fallbackable), dropping rate_limit/server_overload semantics; this is the one classifier on the live path. FIX: reorder so HTTP-status branches precede the generic substring match. Batch 6.

### ⚪ P3 — Multibyte/UTF-8 and operator-mapping latent bugs in unwired engine code

- **Area:** crates-engine + services-backend · **File:** `crates/agiworkforce-task-runtime/src/lib.rs (read_output byte-seek); services/api-gateway/src/lib/neonClients.ts (.not() inverted mappings)`
- **Fix:** task-runtime read_output seeks to a byte offset that can split a codepoint; neonClients .not() maps 'in'→'!=' (wrong, should expand the array). Both are behind unwired/single-correct-caller paths today. FIX: seek on char boundaries; fix or remove .not() before a second caller depends on it. Batch 6.

---

## Surface readiness

**Web** — partial — live chat route (/api/llm/v1|v2) is genuinely demoable with real Clerk/Neon/CreditService/SSRF/providerMode enforcement; but the entire apps/web/core legacy stack is dead and ContactSales 404s

- ContactSales + newsletter POST to missing /api/contact, /api/newsletter/subscribe routes (live 404)
- apps/web/core LLM/media/search stack points at non-existent /.netlify proxies — large dead/misleading surface
- document-generation feature fully implemented but unwired and would hit the dead proxy if invoked

**Desktop** — partial — chat path demoable; the highest-risk capability (computer use) ships with a confirmation-skip and fail-open/dead safety gates

- OPA agentic loop skips destructive-action confirmation by default (require_confirmation:false)
- Finance/crypto URL blocklist is dead code; per-app permission gate fails OPEN when foreground app unknown
- Release pipeline writes 404 download URLs + static 1.2.0 version into the updater (broken auto-update)
- transfer_local_to_cloud boundary command has zero unit tests

**CLI** — partial — send() agentic loop and trust-boundary enforcement are solid and well-tested, but the DEFAULT TUI surface's tool-approval prompt is broken and a Local-memory leak fires out-of-box

- Background memory consolidation silently uploads Local content to cloud (P0)
- Tool-approval prompts hang/garble under the default TUI (dialoguer vs ratatui raw mode)
- --max-budget-usd cost cap is advertised but unenforced
- mcp-server/app-server advertise tools with no tools/call handler

**Chrome extension** — demoable — strong local-only discipline (no hosted fallback, PII in storage.local, fail-closed cloud gate, CI-enforced no-cloud-IPC); blocked only by refactor-drift and bridge-auth gaps

- Divergent in-page-panel setup.ts: M-14 allowlist gate exists only in the live copy, absent from the migration target
- Consent card derives domain from active tab not the action's target tab (consent-accuracy + narrow allowlist-skip)
- Half-migrated features/ tree with empty placeholder barrels (maintenance hazard)

**VS Code extension** — demoable-with-footgun — unusually mature audit-driven security posture; chat/agent-mode/inline-completions work Local/BYOK, but one user-flippable setting hard-errors every turn

- agiWorkforce.useProviderStream=true routes every chat-participant turn to a not-wired stub that throws AGI_ACCOUNT_WEB_AUTH_NOT_WIRED
- Streaming token-cost figures are char/4 estimates, not API-reported usage (default-on streaming)
- Desktop-bridge TCP listener reachable by same-user processes (planned Unix-socket fix)

**Mobile (LEAD SURFACE)** — shell-only / insufficient evidence — no dedicated deep-dive; surfaces only via jest config with four disabled security suites, so core auth/paywall/biometric flows are UNVERIFIED

- auth-401, api-paywall, biometric-gate, healthkit jest suites disabled (features stubbed/diverged) — security-relevant flows unproven
- Compliance Article 50 + CN-HQ assertLlmGate is wired ONLY on mobile, but the rest of mobile coverage is unassessed
- No architecture-level deep-dive exists for the locked lead surface — readiness cannot be honestly asserted

**Managed Cloud (cross-surface)** — shell-only by design — correctly fail-closed behind AGI_MANAGED_COMPUTE_PRIVATE_BETA everywhere; intentionally waitlist-gated per locks

- No metering/credit ledger enforcement before the upstream call in the gateway LLM proxy (usage_events are best-effort fire-and-forget) — must be wired before private beta opens
- Worker protocol unsigned-token forgery (if the protocol is enabled in prod)
- Tenant isolation has no DB-level RLS backstop

---

## Batch alignment

## Findings mapped to the 8 hardening batches

**Batch 1 — Dependency correctness**

- Google Imagen hardcoded catalog-absent model IDs (image_gen.rs) — also a models.json-lock violation.
- network-proxy pulls 16 `rama-* = "=0.3.0-alpha.4"` exact-pinned ALPHA crates into a shipping build (supply-chain flag); build-windows-release builds the `remote-databases` feature that CI declares uncompilable against current bson/mongodb/redis.
- Provider union has 3 ids (lmstudio, minimax, ollama_cloud) absent from models.json; runway slot provider missing from providersInOrder.

**Batch 2 — De-fake user-facing data (no fabricated numbers/state)**

- Release pipeline 404 download URLs + static 1.2.0 version + hardcoded 'macOS in v1.2.1 / Windows Q3 2026 / auto-updates' release notes (P1).
- Enterprise /organizations silently returns [] (P2). Web ContactSales 404 (P2).
- CLI --max-budget-usd unenforced (P3). VS Code char/4 token-cost estimates shown as usage. Test skip-theater (desktop agi-safety/self-healing report green without verifying).
- CURRENT_DECISIONS.md fabricated Supabase-production claim + dead evidence citation; stale P0-gap #1 (DesktopShellV3) narration.

**Batch 3 — Rust crash-hardening / no-panic-or-fail-open on user paths**

- OPA destructive-action confirmation skip (P1). Per-app gate fails OPEN (P1). Finance/crypto blocklist dead (P1).
- Global automation mutex permanently poisons on any panic (os_lock.rs — recover via into_inner()).
- MCP tool calls run with no confirmation (CLI). TUI approval prompt broken under raw mode.

**Batch 4 — Auth unification**

- CLI Local-memory leak to cloud — the auth/trust-boundary check is simply absent on the auxiliary LLM path (P0).
- Worker session_ingress_token unsigned/forgeable (P1). routeToCloud auth token sourced from an unwritten localStorage key (no producer).
- ClerkAuthAdapter.refreshToken unimplemented; Neon withUser decodes JWT sub without verifying signature.

**Batch 5 — Dead-code / duplicate removal**

- llm-runtime retry/fallback/gateway subsystem unwired (P1, false resilience). three-tier promo router dead. Central AppState + stateBridge unwired. Empty @agiworkforce/stores package still depended on.
- 4 dead CLI crate deps + duplicate app-server/apply-patch/execpolicy/plugin-runtime crates (source-of-truth inversion). apps/web/core dead Netlify stack. Chrome divergent setup.ts (security-relevant). VS Code dead providerStreamClient.
- Two divergent routing tables (model-catalog vs promptClassifier).

**Batch 6 — Type-safety + tests**

- classifyError branch-ordering bug (timeout before 429/529). Opus-4.7 tokenizer constant diverges (1.18 vs models.json 0.35). neonClients .not() inverted mappings. task-runtime UTF-8 byte-seek.
- Tests: drop --lib so Rust integration tests run; add the 11 non-CI Playwright projects to CI or delete them; re-enable disabled mobile suites; add transfer_local_to_cloud + computer-use anthropic_agent inline tests; strengthen provider_tests.rs beyond struct/arithmetic assertions.
- CacheIntent/CacheObservation schemas claimed canonical in MEMORY.md but exist nowhere — reconcile doc vs reality.

**Batch 7 — Surface parity to end-to-end**

- CLI mcp-server/app-server missing tools/call (advertised capability broken). Plan-tier .single() → 503 instead of 403. CLI TUI approval not wired to approval_overlay.
- Desktop cowork/code modes descoped to chat-only (orphaned Cowork\*/CodeModeHome components) — docs over-direct agents at a deferred gap.
- VS Code useProviderStream=true hard-errors every turn (hide the setting until account-auth lands).

**Batch 8 — Production hardening (observability / rate-limit / security / perf)**

- In-memory per-instance rate limiting incl. financial limits (P2). Managed LLM proxy has no pre-call credit/ledger enforcement. Localhost:8787 bridge reachable by same-user processes (Chrome + VS Code + desktop) — move to Unix socket; attach token to all bridge calls.
- offline-queue O(n) read-modify-write with lost-write race. Artifact-sandbox CSP allows unsafe-inline/eval (guard against future allow-same-origin). Semgrep gate stuck advisory with ~41 findings. Add applied-migrations tracking + a real Neon migration runner. Make release builds depend on the full CI gate.

---

## Architecture map

## Surfaces and how they connect

Seven app surfaces under `apps/` share TypeScript contracts in `packages/` and Rust engine logic in `crates/`, with backend boundaries in `services/` and the canonical DB schema in `apps/web/db/neon`.

**Shared contract spine (the SSOT):** `packages/types` (@agiworkforce/types) is the cross-language source of truth:

- `models.json` (84 models / 25 providers) — also embedded into the Rust desktop binary via `include_str!` and mirrored by `models_config.rs`. The locked "never hardcode model IDs" rule traces here.
- `suite-contracts.ts` — the Local/BYOK/Managed vocabulary (`PrivacyMode`, `ProviderMode`, surface taxonomy synced-app vs developer-session), plus runtime guards `assertSurfaceCanSyncChats` and `validateGeneratedFileTrustBoundary` that ARE wired at call sites.
- `model-catalog.ts` — SLOT_REGISTRY + TIER_POLICIES + `resolveAutoModeModel` (the LIVE router). The Rust `protocol::projects` crate mirrors these enums.

**LLM layer (4 shared TS packages):** `packages/providers/*` (per-vendor adapters), `packages/llm-normalize` (payload policy), `packages/llm-runtime` (retry/fallback/watchdog — only the watchdog is wired), `packages/routing` (classifier wired; three-tier promo router dead). Live path: surface → `classifyTaskLocally` → `resolveAutoModeModel` → ProviderAdapter.stream → `withStreamIdleWatchdog`.

**Data flow per surface:**

- **Web:** chat UI → `/api/llm/v1|v2/chat` (Clerk auth, Neon, CreditService, providerMode gate, SSRF) → `@/lib/*`. The entire `apps/web/core/*` legacy stack (Netlify-proxy providers, client billing/abuse guards) is DEAD, consumed only for types.
- **Desktop (Tauri):** ~1000 IPC commands via `packages/api` → Rust `core/llm` (LLMRouter) + `automation/computer_use` (OPA agent → SafetyLayer → ActionExecutor → enigo). Browser automation tunnels over localhost:8787 WS to the Chrome extension. Desktop uses its own SQLite, not Neon.
- **CLI:** `AgentSession.send()` agentic loop with `PrivacyMode` + `validate_privacy_boundary()`; ships its own copies of app-server/apply-patch/plugins rather than the crates it declares.
- **Chrome/VS Code ext:** local-only "developer session" bridges to the desktop app over localhost:8787; chat never falls back to hosted APIs.
- **Mobile:** lead surface, thinnest coverage; jest disables 4 security suites.

**Backend boundary (`services/`):** `api-gateway` (Managed-cloud control plane: device auth, LLM proxy gated by `AGI_MANAGED_COMPUTE_PRIVATE_BETA`, credits, worker protocol, WS fan-out) over a hand-rolled Supabase-compatible Neon shim; `signaling-server` (WebRTC pairing relay). Both are the Managed boundary only.

**Persistence:** Neon Postgres + Clerk is the hosted boundary (Supabase removed from code; forbidden by `check-neon-migrations.mjs`). 31 hand-applied Neon migrations, no in-repo runner, **no RLS** — tenant isolation is 100% application-enforced `WHERE user_id = $n`.

**Build/CI:** `ci.yml` (serial check + 4 fan-out), `repo-operability.yml` (~18 guardrail scripts), tag-triggered Linux-only desktop release, 6-target CLI release. No turbo.json (plain `pnpm -r`).

---

## Per-area deep dives (14)

### web-core-backend (apps/web/core)

**Purpose:** apps/web/core is a self-contained "core services" layer for the web app covering AI/LLM providers + orchestration, media/search integrations, security (prompt injection, API abuse, rollout flags), in-memory rate limiting, a client-side billing/credit guard, a Clerk auth adapter, and chat persistence DB helpers. It is the LEGACY pre-Vercel-migration stack: nearly all of ai/llm, integrations, and media code targets Netlify proxy functions (/.netlify/functions/...) for server-side key handling. The app has since migrated the real chat path to Next.js API routes (app/api/llm/v1|v2/chat) backed by @/lib/\* services, leaving most of core/ consumed only for types/enums or fully orphaned.

**Architecture:** Two parallel stacks coexist. (1) The MODERN live path: chat UI -> useChatStream/useChat -> POST /api/llm/v1/chat/completions or /api/llm/v2/chat (route.ts: server-only, Clerk auth via getClerkAuthUser, Neon via getNeonDb, CreditService reservation/reconciliation, SubscriptionService tier gating, model-tier checks, CSRF, rate-limit, egress/SSRF validation, AI SDK v6 streamText with v1 LLMProviderFactory fallback). This route only pulls modelRouter from @core/ai/orchestration/model-router; all real provider calls and credit enforcement live in @/lib, not core/. (2) The LEGACY core/ stack: UnifiedLLMService/LLMClientFactory (per-request frozen instances, 7 providers) where each provider (anthropic-claude.ts etc.) does fetch('/.netlify/functions/llm-proxies/<provider>-proxy') with a browser auth token, shows sonner toasts, and uses window.location — i.e. client-side modules pointing at Netlify infra that no longer exists anywhere in the repo (no netlify/ dir, no netlify.toml, no .netlify rewrite in next.config.ts/vercel.json). UnifiedLLMService layers prompt-injection detection, in-memory API-abuse limiting, request-size checks, and a client-side credit guard (token-enforcement-service calls /api/usage and /api/usage/deduct) before each call. Security layers are gated behind isFeatureEnabled() rollout flags. Storage/chat/\* DB helpers import server-only getNeonDb but are orphaned (no consumers, no 'server-only' guard). Almost every chat-feature import of core/ is type-only (SearchResponse, MediaGenerationResult, DocumentFormat, SkillCategories).

**Trust boundary:** core/ predates the current trust-boundary model. It assumes a Netlify proxy holds provider keys server-side (keys 'removed from client', comments claim proxy handles them) — but the proxy layer is gone, so its boundary is purely aspirational dead code. The real boundary enforcement is in app/api/llm/v2/chat/route.ts, which explicitly models providerMode via ProviderModeSchema = Local | DirectByok | ManagedGateway | ManagedNative and runs resolveManagedAiGatewayProviderMode() to deny managed-gateway requests through the provider-mode gate, plus server-side Clerk/Neon/CreditService/SSRF checks. core/ itself does NOT enforce Local-vs-BYOK-vs-Managed separation; its billing/abuse/auth layers are client-side and advisory. Per repo locks (v1 = Local-only, cloud waitlist-gated), the authoritative gating must stay in the server route — core/ must not be treated as a security boundary. The web-search DuckDuckGo path makes a direct browser->api.duckduckgo.com call, bypassing any proxy/egress policy (minor, dead path).

**Key files:**

- `apps/web/core/ai/llm/unified-language-model.ts` — Legacy unified LLM facade (UnifiedLLMService + LLMClientFactory). Orchestrates per-request security/billing/abuse layers then delegates to Netlify-proxy providers. Live runtime callers only via document-generation-service, which itself has no UI caller.
- `apps/web/core/ai/llm/providers/anthropic-claude.ts` — Representative provider: fetches /.netlify/functions/llm-proxies/anthropic-proxy (dead endpoint), uses sonner toast + window.location (client-only), simulated streaming. Pattern repeats across openai/google/grok/etc.
- `apps/web/app/api/llm/v2/chat/route.ts` — MODERN live chat route. Real server-side trust-boundary enforcement: Clerk auth, subscription/tier gating, CreditService reserve+reconcile, SSRF egress check, providerMode (Local/DirectByok/ManagedGateway/ManagedNative) gate. Only consumes @core for modelRouter.
- `apps/web/core/billing/token-enforcement-service.ts` — CLIENT-SIDE credit guard: fetch('/api/usage')/('/api/usage/deduct') with browser token. Advisory only; not authoritative (real enforcement is CreditService in the route).
- `apps/web/core/security/api-abuse-prevention.ts` — In-memory per-user rate/cost/concurrency limiter (Map). Auto-starts cleanup only in browser (typeof window). Useless as a server limiter; meaningful only client-side.
- `apps/web/core/security/prompt-injection-detector.ts` — Real pattern-based injection detection (~298 pattern/regex lines). Gated behind isFeatureEnabled flag; invoked only from the legacy UnifiedLLMService path.
- `apps/web/core/auth/rate-limiter.ts` — In-memory Map rate limiter singleton with setInterval cleanup; per-process, resets on cold start. Backs api-abuse-prevention.
- `apps/web/core/auth/authentication-manager.ts` — Thin Clerk adapter; login/register/password are no-op stubs returning 'Use Clerk flow'. getCurrentUser/updateProfile hit /api/me. Genuine post-migration shim.
- `apps/web/core/integrations/web-search-handler.ts` — Search via Netlify perplexity/google proxies (dead) + direct browser call to api.duckduckgo.com. Consumed type-only by chat UI; searchAndSummarize dynamically imports the dead unifiedLLMService.
- `apps/web/core/integrations/google-veo-service.ts` — Video gen via /.netlify/functions/media-proxies/google-veo-proxy (dead). isAvailable() hardcoded true. Stale env hints (VITE_GOOGLE_API_KEY / NEXT_PUBLIC_GOOGLE_API_KEY) in error text.
- `apps/web/core/integrations/marketing-endpoints.ts` — Marketing/contact/newsletter fetches to /api/contact, /api/newsletter/subscribe, /api/blog, etc. submitContactForm is LIVE from ContactSales.tsx but /api/contact route is MISSING. Many other fns are TODO stubs.
- `apps/web/core/storage/chat/multi-agent-chat-database.ts` — Server-side Neon chat persistence (getNeonDb at module scope) but orphaned: no consumers, no 'server-only' guard. Active persistence lives in features/chat/hooks instead.
- `apps/web/features/chat/services/chat-ai-service.ts` — Confirms the live send path: header comment states streaming goes via /api/llm/v1/chat/completions and the duplicate sendMessage() (which used core) was removed for having zero callers.

**Risks:**

- 🟠 P1 ContactSales form posts to a missing /api/contact route (`apps/web/core/integrations/marketing-endpoints.ts`) — submitContactForm() is invoked at runtime by features/pages/ContactSales.tsx and fetches `${API_BASE}/api/contact` (API_BASE=''). No app/api/contact/route.ts exists, so every contact-sales submission 404s — a live, user-facing broken flow. /api/newsletter/subscribe is likewise not present.
- 🟡 P2 Entire legacy LLM/media/search stack targets non-existent Netlify proxies (`apps/web/core/ai/llm/providers/anthropic-claude.ts`) — All core providers + media/search services fetch /.netlify/functions/... but no netlify dir, netlify.toml, or .netlify rewrite exists in the repo. Any code that actually executed these would 404. Mitigated to P2 (not P0) because the live chat path uses app/api/llm/\* + @/lib instead; these modules survive mainly as type sources. Still a large dead/misleading surface that an unaware caller could re-activate into a broken flow.
- 🟡 P2 Client-side billing/credit guard is advisory and bypassable (`apps/web/core/billing/token-enforcement-service.ts`) — deductTokens/checkTokenSufficiency run in the browser and call /api/usage(/deduct) with a client-held token; a client can skip them. This is acceptable ONLY because authoritative enforcement is server-side CreditService in app/api/llm/v2/chat/route.ts. If any real spend path ever relied on this module for enforcement it would be a P0 credit-bypass — currently it does not, so P2. The deductTokens idempotency key omits a request nonce (userId:session:provider:model:in:out), so identical-shaped successive calls could collide/dedupe.
- 🟡 P2 Security layers (injection/abuse) are in-memory + flag-gated and only meaningful client-side (`apps/web/core/security/api-abuse-prevention.ts`) — api-abuse-prevention and auth/rate-limiter use per-process Map state and auto-start cleanup only under typeof window!=='undefined'. They are wired only into the legacy UnifiedLLMService and gated behind isFeatureEnabled('api_abuse_prevention'/'prompt_injection_detection'). They provide no protection on the live server route, and would be ineffective per-instance if ever run in serverless. Real RL/CSRF/SSRF protection lives in the route + @/lib.
- 🟡 P2 Orphaned server-side Neon chat DB modules without server-only guard (`apps/web/core/storage/chat/multi-agent-chat-database.ts`) — multi-agent-chat-database.ts / collaboration-database.ts call getNeonDb() at module scope (server-only DB) but have zero consumers and lack an `import 'server-only'` guard. Dead weight that, if imported into a client component, would attempt to bundle server DB access; harmless today only because nothing imports them.
- ⚪ P3 Stale provider/env guidance and hardcoded availability in media services (`apps/web/core/integrations/google-veo-service.ts`) — isAvailable() hardcoded to return true and error messages reference VITE_GOOGLE_API_KEY / NEXT_PUBLIC_GOOGLE_API_KEY and .env hints that no longer match the Vercel/proxy model. Misleading to operators/users; not on a live path.

**Gaps:**

- marketing-endpoints.ts is mostly placeholder: getBlogCategories, getResources, getPricingPlans, getSupportCategories/Articles/Faq, createSupportTicket are explicit TODO stubs ('implement once route is available'). Only blog/contact/newsletter/resources-download are wired, and contact/newsletter routes are missing.
- document-generation-service.generateDocument/enhanceDocument are fully implemented and call unifiedLLMService at runtime but have NO UI/runtime caller (only a type import in DocumentActions/DocumentMessage and a barrel re-export) — implemented-but-unwired feature that would also hit the dead Netlify proxy if invoked.
- The legacy core/ai/llm provider stack (7 providers) is an unwired shell for the live app: the production chat path is app/api/llm/v1|v2 + @/lib/llm-providers, so these providers, UnifiedLLMService, LLMClientFactory, getCachedLLMClient, and unifiedLLMService singleton are effectively dead code retained for type exports.
- storage/chat/\* (multi-agent-chat-database, collaboration-database, chat-realtime-subscriptions) are unconsumed; active chat persistence is in features/chat/hooks (use-chat-persistence, conversation-storage), not core.
- Streaming in core providers is simulated (full response yielded as two chunks) with comments noting 'Netlify proxy doesn't support true SSE streaming yet' — never completed; the real route uses AI SDK streamText.
- getGenerationStats in media-generation-handler returns averageGenerationTime: undefined ('Not yet implemented').

**Hardening opportunities:**

- Add app/api/contact/route.ts (and /api/newsletter/subscribe) or repoint submitContactForm, to fix the live broken ContactSales submission.
- Delete or quarantine the dead Netlify-proxy LLM/media/search stack (core/ai/llm/providers/_, integrations/_-service, unified-language-model legacy singleton) or reduce to type-only modules, so no future caller resurrects a 404 path.
- Add `import 'server-only'` to storage/chat/\* and billing modules that touch getNeonDb, or remove them if truly orphaned, to prevent accidental client bundling of server DB access.
- Remove/neuter the client-side billing/abuse/rate-limit modules or clearly label them advisory-only; ensure nothing ever treats token-enforcement-service or api-abuse-prevention as an authoritative spend/security gate.
- Add a nonce/requestId to deductTokens idempotency key to avoid collisions across identically-shaped requests if this module is ever revived.
- Fix stale env guidance in media services (VITE*/NEXT_PUBLIC* key text, hardcoded isAvailable() === true).
- Add a lint/CI check forbidding '/.netlify/functions' string literals so the dead proxy contract cannot silently return.

**Open questions:**

- Is apps/web/core slated for deletion in the ongoing supabase->neon->clerk migration, or is it intentionally retained as a shared type/util layer? Several modules are pure dead code today.
- Is the document-generation feature (isDocumentRequest/generateDocument) planned to be re-wired to the new /api/llm route, or abandoned? It is fully implemented but unreachable and points at the dead Netlify proxy.
- Were Netlify functions intentionally dropped (full move to Vercel) with the expectation that all core/ network calls are now dead, or is a netlify rewrite/proxy expected to be configured at deploy time outside the repo?
- Should the marketing TODO stubs (blog categories, resources, pricing-plans, support tickets/faq) be implemented or removed from the public marketing surface?

### desktop-automation-rust

**Purpose:** The Tauri desktop app's OS-automation engine: it lets an LLM observe the screen and drive the user's machine (mouse/keyboard/window control), drive a browser tab via a Chrome extension over a localhost WebSocket, generate images/video via third-party APIs, and sync files to cloud drives. The computer_use subsystem is the highest-risk surface — it grants an LLM real input-injection over the whole desktop, gated by a safety layer (prompt-injection detection, rate limiting, per-app permissions, an always-blocked financial/crypto/banking app refuse-list) and per-action user confirmation dialogs. integrations/ adds realtime collaboration, native messaging to the browser extension, and external media-generation APIs (BYOK).

**Architecture:** Two control planes for computer use coexist. (1) The LIVE path: Tauri IPC commands in src/sys/commands/computer_use.rs. Direct-action commands (computer_use_click/move_mouse/type_text) each call require_confirmation() then a \*\_inner() helper that does raw input injection via src/automation/input. The agentic command computer_use_execute_opa_task builds an OPA `ComputerUseAgent` (observe_plan_act.rs): a loop of capture screenshot -> VisualReasoner plan -> per-app permission check (safety_layer.check_app_permission, which queries WindowCoordinator::get_active_window) -> SafetyLayer.evaluate_action -> ActionExecutor.execute. (2) A SECOND agent, AnthropicComputerUseAgent (anthropic_agent.rs), implements Anthropic's computer_20251124 tool protocol via LLMRouter, but is never instantiated anywhere — exported-but-dead. ActionExecutor (action_executor.rs) is the shared executor doing HiDPI coordinate translation and enigo input. screen/capture.rs captures via xcap (cross-platform) / Win32 GDI (Windows), serialized by a global OnceLock<Mutex> in os_lock.rs. The browser path: ExtensionBridge (browser/extension_bridge.rs) serializes high-level actions to native-messaging JSON and tunnels them over a localhost WebSocket (realtime/websocket_server.rs, token-auth + per-IP lockout) to the Chrome extension; dangerous browser ops (execute_script, cookie/localStorage R/W, navigate) are gated by require_confirmation. integrations/api_integrations/image_gen.rs is a BYOK HTTP client for DALL-E / Stable Diffusion / Google Imagen. Trust boundaries: all LLM calls flow through LLMRouter (Local vs BYOK vs cloud); the automation engine itself runs locally with the user's own provider keys.

**Trust boundary:** The automation engine runs Local with the user's own provider keys; LLM traffic for computer use is forced through LLMRouter with RouterPreferences::provider = Anthropic and prefer_cloud_credits:false (anthropic_agent), so no silent Local->cloud routing was observed in this surface. The extension bridge is a genuine privilege boundary: a localhost-only WS (ws://127.0.0.1:8787) with a file-based .ipc_token, per-IP auth-failure lockout (SEV-DESK-01), and runtime token rotation — this is the better-hardened part of the area. The chief boundary concern is not Local/BYOK/cloud mixing but capability escalation: an LLM response (which may be influenced by attacker-controlled on-screen text or page content) is treated as an instruction stream that injects OS input / runs page JS. SEV-DESK-02 confirmation gates and the OPA safety layer are the mitigations, but the require_confirmation:false default in the OPA path and the fail-open per-app gate weaken them.

**Key files:**

- `apps/desktop/src-tauri/src/automation/computer_use/observe_plan_act.rs` — LIVE agentic OPA loop; the real computer-use execution path wired from IPC. Per-app permission + safety gates applied here per action.
- `apps/desktop/src-tauri/src/automation/computer_use/safety.rs` — Safety layer: prompt-injection regexes, rate limit, sandbox mode, click/type/hotkey evaluation, and check_app_permission() that consults the live foreground app.
- `apps/desktop/src-tauri/src/automation/computer_use/app_permissions.rs` — Per-app allow/deny/ask registry + hardcoded ALWAYS_BLOCKED_BUNDLE_IDS (finance/crypto/banking) and ALWAYS_BLOCKED_URL_HOSTS.
- `apps/desktop/src-tauri/src/automation/computer_use/anthropic_agent.rs` — Anthropic computer_20251124 agent — fully implemented but UNWIRED (never instantiated). Contains a weaker, foreground-app-blind check_app_permission().
- `apps/desktop/src-tauri/src/automation/computer_use/window_manager.rs` — Window enumeration/activation/launch + get_active_window (macOS osascript, Win32, Linux xdotool). Has input sanitization + validate_app_name to prevent command injection.
- `apps/desktop/src-tauri/src/automation/computer_use/action_executor.rs` — Shared action executor: enigo mouse/keyboard, HiDPI coordinate translation.
- `apps/desktop/src-tauri/src/sys/commands/computer_use.rs` — Tauri IPC surface. Direct actions gate on require_confirmation; OPA task builds agent with ComputerUseTask::default() (require_confirmation:false).
- `apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs` — LLM->browser-tab bridge over localhost WS. Gates execute_script/cookies/localStorage/navigate via require_confirmation; always targets active tab (tab_id:null).
- `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` — Localhost WS server for the extension bridge. Token auth, per-IP auth-failure lockout (SEV-DESK-01), runtime token rotation.
- `apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs` — BYOK image-gen HTTP client. DALL-E/SD use resolve_image_model; Google Imagen path hardcodes invalid model IDs and bypasses the catalog.
- `apps/desktop/src-tauri/src/automation/os_lock.rs` — Global OnceLock<Mutex> serializing all screen capture + input; returns Err on poison (does not recover).
- `apps/desktop/src-tauri/src/automation/computer_use/consent.rs` — ComputerUseConsent gate type — exported but not referenced by any IPC command (consent never enforced in Rust).

**Risks:**

- 🟠 P1 OPA agentic path skips destructive-action confirmation by default (`apps/desktop/src-tauri/src/sys/commands/computer_use.rs`) — computer_use_execute_opa_task builds ComputerUseTask with ..ComputerUseTask::default(), and types.rs sets require_confirmation:false by default. In observe_plan_act.rs the destructive-action prompt is `if decision.requires_confirmation && task.require_confirmation` — so when the safety layer returns needs_confirmation() (allowed:true) for e.g. typing `rm -rf /` or Alt+F4, the loop proceeds WITHOUT any user prompt. Unlike the direct-action IPC commands, the agentic loop has no per-action require_confirmation() dialog. An LLM (possibly prompt-injected via on-screen text) can execute destructive input unattended.
- 🟠 P1 Financial/crypto/banking URL blocklist is dead code — browser-tab path is unguarded (`apps/desktop/src-tauri/src/automation/computer_use/app_permissions.rs`) — ALWAYS_BLOCKED_URL_HOSTS and is_always_blocked_host() are only re-exported in mod.rs; grep shows zero call sites. The bundle-id list IS enforced for native apps via the OPA per-app gate, but the documented web equivalent (agent driving a Robinhood/Coinbase/Chase tab via extension_bridge navigate/click/execute_script) has no host check. The safety guarantee asserted in the doc comments does not hold for browser automation.
- 🟠 P1 Per-app permission gate fails OPEN when foreground app is unknown (`apps/desktop/src-tauri/src/automation/computer_use/safety.rs`) — check_app_permission() returns None (allow) when WindowCoordinator::get_active_window() is None — which happens on Wayland, when xdotool is absent, or when osascript/Accessibility is blocked. In that state the financial/crypto deny-list and per-app deny entries are entirely bypassed for the OPA loop, while the rest of the (weaker) safety stack still runs. Fail-open on a security control.
- 🟡 P2 Global automation mutex permanently poisons on any panic (`apps/desktop/src-tauri/src/automation/os_lock.rs`) — lock_os_automation() maps a poisoned PoisonError to Err instead of recovering via into_inner(). Any panic while holding the lock (during a capture or input op) makes every subsequent screen capture and input action fail for the process lifetime — a persistent broken-state DoS on the core user path. safety.rs's rate-limit lock already uses the into_inner() recovery pattern, so this is an inconsistency.
- 🟡 P2 Google Imagen generation uses hardcoded, catalog-absent model IDs (`apps/desktop/src-tauri/src/integrations/api_integrations/image_gen.rs`) — generate_with_google_imagen hardcodes imagen-3.2-flash-image / imagen-3.1-pro / imagen-3.1-nano and never calls resolve_image_model. models.json only has imagen-4 / imagen-4-fast (apiModelId imagen-4.0-\*). This violates the LOCKED never-hardcode-model-IDs rule AND the IDs are stale/likely invalid against the current Google API, so the Imagen path would return an API error on real calls. The DALL-E and Stable Diffusion paths correctly use resolve_image_model.
- 🟡 P2 AnthropicComputerUseAgent is fully built but never instantiated (dead path) with a divergent, weaker permission check (`apps/desktop/src-tauri/src/automation/computer_use/anthropic_agent.rs`) — 808 lines implementing the Anthropic computer_20251124 protocol, exported from mod.rs, but zero call sites. Its check_app_permission() does NOT query the live foreground app (TODO comment admits WindowCoordinator::get_active_window is unwired here) and only blocks if a denied/deny-listed entry already exists in the registry — so if this dead agent is ever wired up as-is, it ships a materially weaker gate than the OPA loop. Maintenance/security-drift hazard.
- ⚪ P3 macOS list_windows parses AppleScript output with brittle, ambiguous delimiters (`apps/desktop/src-tauri/src/automation/computer_use/window_manager.rs`) — list_windows() splits the AppleScript result on ", " then on "|"; window titles containing ", " or "|" corrupt parsing, and is_focused is heuristically set to the first entry. Produces wrong window data (wrong activation target) rather than crashing. Low impact but unreliable on macOS.
- ⚪ P3 hold_key action degraded to a single key tap (`apps/desktop/src-tauri/src/automation/computer_use/anthropic_agent.rs`) — parse_anthropic_action maps Anthropic 'hold_key' to ComputerUseAction::KeyPress (a tap), losing the hold semantics. Only matters if the dead Anthropic agent is wired up, but it is a latent correctness bug.

**Gaps:**

- consent.rs (ComputerUseConsent / CONSENT_VERSION) is exported but enforced by no Rust IPC command — there is no server-side consent gate before computer-use sessions start; any gating must be frontend-only, which an injected/automated path could skip.
- AnthropicComputerUseAgent (anthropic_agent.rs, 808 LOC) is an unwired empty-shell relative to the product: implemented + exported but never constructed; the OPA ComputerUseAgent is the only live agent.
- ALWAYS_BLOCKED_URL_HOSTS / is_always_blocked_host: implemented + tested but never called — the browser-tab financial blocklist is unwired.
- Linux foreground-app detection (get_active_window) returns bundle_id:None and depends on xdotool (X11 only); Wayland is unsupported, leaving the per-app gate ineffective there (acknowledged TODO for \_NET_ACTIVE_WINDOW/\_NET_WM_PID).
- WindowCoordinator::get_active_window_bundle_id() is referenced as a TODO in anthropic_agent.rs but not implemented; that agent's permission check is a placeholder that ignores the live foreground app.
- Midjourney image provider is an explicit stub returning an error (generate_with_midjourney).
- macOS window activation uses index-based handles and AppleScript-by-process-name (activate_window_internal), which cannot disambiguate multiple windows of the same app — best-effort only.

**Hardening opportunities:**

- Make the OPA agentic path force require_confirmation for destructive/needs-confirmation actions regardless of ComputerUseTask.require_confirmation, or default the field to true; today the field defaults to false and is the only thing gating dangerous typed commands / Alt+F4 in the loop.
- Wire is_always_blocked_host into the extension_bridge actions (navigate/click/type/execute_script) using ExtensionBridge::get_url() so the documented finance/crypto/banking protection actually applies to browser automation.
- Change the per-app gate to fail CLOSED (require approval) when get_active_window() returns None instead of allowing, at least when the registry has any deny entries or on the always-blocked categories.
- Recover the global automation mutex from poison via into_inner() (match safety.rs's pattern) so one panic doesn't permanently brick screen capture + input.
- Route Google Imagen through resolve_image_model and use the catalog's imagen-4 / imagen-4-fast IDs; remove the hardcoded imagen-3.x literals to comply with the locked models.json rule and avoid invalid-model API errors.
- Either wire AnthropicComputerUseAgent through the same safety/permission stack as the OPA loop (and implement get_active_window-based check_app_permission) or remove it to prevent security drift; right now it is dead code with a weaker gate.
- Enforce ComputerUseConsent server-side in the IPC commands (start_session / execute_opa_task) rather than relying on a frontend-only gate.
- Harden macOS list_windows parsing (use a non-ambiguous record separator from AppleScript) so window titles containing ',' or '|' don't corrupt the window list / activation target.

**Open questions:**

- Is there a frontend-side consent/confirmation flow that compensates for the missing Rust-side consent gate and the OPA require_confirmation:false default? If so, can a prompt-injected or automated invoke() bypass it by calling computer_use_execute_opa_task directly?
- Is AnthropicComputerUseAgent intended to become the production path (replacing the OPA loop)? If so, its permission gate must be brought to parity before wiring.
- Does the Chrome extension itself enforce the financial-host blocklist before executing native-messaging actions, compensating for the unwired is_always_blocked_host on the Rust side?
- Are the hardcoded imagen-3.x model IDs intentional (e.g., a specific allowlisted preview endpoint) or stale leftovers? The catalog has moved to imagen-4.
- On Wayland, is computer use intended to be disabled entirely, or does it silently run with an ineffective per-app permission gate?

### cli-rust

**Purpose:** The Rust CLI (`apps/cli`) is the engine for AGI's terminal coding agent — a Claude-Code/Codex-parity tool that runs an agentic loop (stream completion → tool calls → continue) against ~13 LLM providers (Anthropic, OpenAI-compatible, Google/Gemini, local Ollama/LM Studio, plus user-defined custom providers). It owns sessions, MCP client transports, hooks, plan mode, subagents/teams, skills, permission/safety gating, and the trust-boundary model (Local vs BYOK vs Managed cloud). It exposes both an interactive REPL (`--no-tui`) and a ratatui TUI (default), plus one-shot `agi exec`/`-p` and an NDJSON SDK protocol.

**Architecture:** Entry: `main.rs` -> `lib.rs::run_main` parses clap `Cli`, merges config, registers custom providers, dispatches subcommands (`Exec`, `Resume`, `Fork`, `Session`, `Review`, `Apply`, `Sandbox`, ...) or falls through to interactive mode (TUI default, REPL with `--no-tui`) / one-shot (`run_oneshot`). Core loop lives in `agent/` (mod.rs = `AgentSession` state + privacy boundary; chat.rs = `send()` agentic loop; executor.rs = loop/content-loop detection + arg coercion; tools.rs = MCP/team routing; prompt.rs/history.rs). `models/` holds the `Provider` enum, `detect_provider`/`provider_from_name`, `stream_completion` (streaming.rs, subscription-auth-first then provider-specific), and serialization. Tool execution is in `features/exec/tools/` (bash, file_ops, etc.) gated by `safety/` (3-tier command classification) + `permissions.rs` + `tool_filters.rs` + `path_security.rs` (workspace-root canonicalization). Trust boundary: `PrivacyMode{Local,Byok,Managed}` on the session; `validate_privacy_boundary()` is called at the top of `send()`; `claude_parity.rs` implements the reviewable `/continue-with-byok` handoff with secret redaction. Slash commands: shared parity helpers in `claude_parity.rs`, REPL dispatch in `repl/slash_commands.rs`, TUI dispatch inline in `tui/tui_app.rs`. Hooks fire at ~20 lifecycle points throughout `send()`.

**Trust boundary:** The interactive `send()` path enforces the Local/BYOK/Managed boundary well: `validate_privacy_boundary()` blocks a Local session from sending to a cloud provider, Local->BYOK requires the explicit reviewable `/continue-with-byok` handoff (with `redact_sensitive_lines` secret scanning and attached-files exclusion), `/privacy-mode managed` is private-beta-not-wired, and `cloud_exec` fails closed with no fabricated task IDs. Custom providers enforce an SSRF scheme allowlist (https anywhere, http only to loopback) blocking IMDS/internal-host exfiltration. The gap is OUTSIDE `send()`: the background `memory_pipeline::consolidate` (and `send_btw`) call `stream_completion` directly without `validate_privacy_boundary()`, and consolidation uses the _config-default_ provider rather than the session provider — so a Local session can silently leak memory-derived content to cloud (P1 above). `send_btw` (`/btw`) has the same missing check but uses the session's own provider, so lower blast radius.

**Key files:**

- `apps/cli/src/agent/chat.rs` — Agentic loop `send()`: compaction, plan-mode gating, fallback chain rotation, parallel/sequential tool dispatch, loop detection, hooks. Spawns background memory consolidation (line ~1338).
- `apps/cli/src/agent/mod.rs` — `AgentSession` state + `PrivacyMode` + `validate_privacy_boundary()` + `provider_privacy_mode()`; the central Local/BYOK/Managed trust-boundary logic.
- `apps/cli/src/models/provider_dispatch.rs` — Provider detection, key resolution, subscription auth, and the SSRF scheme-allowlist (`is_safe_provider_base_url`) for custom providers.
- `apps/cli/src/models/streaming.rs` — `stream_completion` — the actual network egress; subscription-auth-first, HTTPS enforcement for sub tokens, paywall/rate-limit classification.
- `apps/cli/src/claude_parity.rs` — Shared slash commands incl. `/continue-with-byok` reviewable handoff with `redact_sensitive_lines`, `/privacy-mode` blocking Local->BYOK.
- `apps/cli/src/memory_pipeline.rs` — Background `consolidate()` and `extract_session_summary()` call `stream_completion` with config-default provider and NO privacy-boundary check.
- `apps/cli/src/tui/tui_app.rs` — Default interactive surface. Enables raw mode + alternate screen once; calls `session.send()` without suspending raw mode (line ~2592). approval_overlay only opened as static demo from /permissions.
- `apps/cli/src/features/exec/tools/bash.rs` — `execute_run_command`: safety classification + `dialoguer::Confirm` prompt + sandbox execution.
- `apps/cli/src/safety/mod.rs` — 3-tier command safety classifier (Safe/Unknown/Dangerous) with pipe-sink/source and subshell handling.
- `apps/cli/src/path_security.rs` — Workspace-root canonicalization + symlink-escape rejection for all file tool paths; well-tested.
- `apps/cli/src/cloud.rs` — `cloud_exec` fails closed (no fabricated task IDs) — managed cloud is private-beta-not-wired.
- `apps/cli/src/lib.rs` — clap CLI surface, run_main dispatch, run_oneshot, quota banner (`fetch_remaining_pct`). Declares unused `--max-budget-usd`.

**Risks:**

- 🟠 P1 Background memory consolidation routes Local-session content to the config-default cloud provider with no privacy-boundary check (`apps/cli/src/memory_pipeline.rs`) — `agent/chat.rs:~1338` spawns a detached `tokio::spawn(MemoryPipeline::consolidate(&home, &config))` after every turn when due. `consolidate()` (memory_pipeline.rs:153) reads `session_summaries/*.md` (derived from Local conversation content) and sends them to `stream_completion` using `resolve_fast_model(config)` -> `config.default.fast_model` or `config.default.model` and `detect_provider(model)`. This is the _config_ default model/provider, NOT the session's provider, and `validate_privacy_boundary()` is never called on this path. If a user runs a Local (Ollama) session while `config.default.model` is a cloud model, their Local-derived memory is silently uploaded to a cloud provider — a direct violation of the locked rule 'Never silently route Local chats/files to BYOK or managed cloud.' `extract_session_summary` (line 48) has the same flaw but appears to have no live caller.
- 🟠 P1 Tool-approval prompts are broken in the default TUI surface (raw mode vs dialoguer) — The TUI (default surface) enables raw mode + alternate screen once at startup (tui_app.rs:410-412) and never suspends it around `session.send()` (line ~2592). But interactive approvals inside `send()` use synchronous `dialoguer::Confirm::new().interact()` — in `features/exec/tools/bash.rs:71`, `file_ops.rs`, and loop-detection at `chat.rs:472`/`chat.rs:1270`. In the default `InteractionMode::Chat` (tui_app.rs:272, `skip_permissions=false`), a Dangerous/Unknown command triggers a dialoguer prompt under ratatui raw mode: the prompt is drawn into the alternate screen ratatui overwrites and stdin handling conflicts with the TUI event loop, so the confirmation hangs/garbles. The real `approval_overlay` widget is only opened as a hardcoded demo from the `/permissions` command (tui_app.rs:1783-1794) and is NOT wired to actual tool execution. There is no TUI-awareness guard anywhere around the dialoguer calls.
- 🟠 P1 `--max-budget-usd` is an advertised cost-control flag that does nothing (`apps/cli/src/lib.rs`) — `lib.rs:423-424` declares `--max-budget-usd` with a doc comment promising it 'Returns a status_update event with reason budget_exhausted'. The corresponding `StatusUpdateReason::BudgetExhausted` exists in `sdk_io/protocol.rs:100`. But the field is never read anywhere and the event is never emitted (grep confirms no other reference). A user (or SDK embedder) relying on this cap for cost protection gets no enforcement — silent failure of a user-facing safety/cost feature.
- 🟡 P2 MCP tool calls execute with no permission confirmation (`apps/cli/src/agent/chat.rs`) — In `agent/chat.rs:~1109`, tools whose name starts with `mcp_` are dispatched via `execute_mcp_tool` (agent/tools.rs:51) with no `require_confirmation`/safety classification — only PreToolUse hooks and tool*filters gate them. MCP servers can perform arbitrary external/destructive actions (DB writes, API calls). Mitigations exist (MCP is opt-in user config, plan mode correctly classifies mcp*\* as mutating, hooks/filters can block), and in the TUI no interactive approval works anyway (see P1), so this is real but partly defensible tech-debt rather than a fresh hole.
- ⚪ P3 `!`-prefix shell commands in the REPL bypass sandbox and safety classification (`apps/cli/src/repl/mod.rs`) — `repl/mod.rs:566` runs user-typed `!cmd` directly via `std::process::Command::new("sh").arg("-c")` with no sandbox and no `classify_command`. This is user-initiated (not model-initiated) so blast radius is limited, but it is inconsistent with the sandboxed/classified path the agent's `run_command` tool uses and is worth a note.

**Gaps:**

- `--max-budget-usd` parsed but never enforced; `budget_exhausted` status event never emitted (lib.rs:424, sdk_io/protocol.rs:100).
- `memory_pipeline::extract_session_summary` (LLM-based per-session summarizer) has no live caller — appears to be dead/unwired; only `consolidate` runs in the live path.
- TUI `approval_overlay` widget exists but is only shown as a hardcoded demo via `/permissions`; it is not connected to the tool-execution approval flow.
- `/advisor` is recognized but 'dedicated advisor routing is not enabled in this build' — falls back to instructing the user to use /btw (claude_parity.rs:701).
- Managed cloud (`cloud_exec`, `/privacy-mode managed`) is intentionally private-beta-not-wired and fails closed — correct, but means the Managed trust boundary is unexercised in this build.
- NDJSON one-shot mode (`run_oneshot` JsonLine) emits only session_start -> assistant_message -> session_end; per-token deltas / tool_use events are explicitly deferred (comment at lib.rs:2466-2472).

**Hardening opportunities:**

- Call `validate_privacy_boundary()` (or skip cloud entirely when session is Local) before any auxiliary LLM call: `memory_pipeline::consolidate`, `extract_session_summary`, and `send_btw`. Better: have consolidation use the _session_ provider/privacy mode, not `config.default.model`.
- Make tool approval TUI-aware: route `run_command`/`edit_file`/loop-detection confirmations through the existing `approval_overlay` widget when running under the TUI (or suspend raw mode around dialoguer prompts), instead of unconditional `dialoguer::Confirm`.
- Either implement `--max-budget-usd` enforcement (the `cost_ledger` already tracks `total_usd`, so a check in the agentic loop is straightforward) or remove the flag and its doc promise.
- Add a confirmation/permission tier for MCP tool calls (at least for non-read-only MCP tools), or document that MCP servers are fully trusted once configured.
- Route the REPL `!cmd` path through the same sandbox used by the `run_command` tool for consistency.
- Wire the deferred NDJSON streaming events (token deltas, tool_use) so SDK embedders get the documented event stream.

**Open questions:**

- Does `config.default.model` realistically point at a cloud model while a user runs Local in practice? The severity of the consolidation leak (P1 vs P0) hinges on how commonly Local sessions coexist with a cloud config default — worth confirming against the v1 LOCAL-ONLY default config.
- Is the TUI approval breakage masked in practice because most users run AcceptEdits/BypassPermissions, or because dangerous commands are rare? Needs a manual TUI run of a model-issued `rm`-class command in default Chat mode to confirm the failure mode (hang vs auto-skip vs garble).
- Who writes the `session_summaries/*.md` files that `consolidate` consumes, given `extract_session_summary` has no live caller? If skill_learner or another path writes them, confirm whether their content is Local-conversation-derived (it appears to be).

### crates-engine

**Purpose:** The `crates/` tree holds 17 Rust "engine" crates intended to be the shared substrate for the CLI and desktop binaries: protocol type definitions, an execpolicy engine, a rama-based network MITM/proxy, an apply-patch file mutator, a task runtime, a JSON-RPC/MCP app-server, a command (slash) registry, a plugin manifest loader, a sandbox-policy enum, and a family of small utils. In practice only two crates (`sandbox-policy`, plus a thin slice of `protocol`/`command-registry`/`utils-image`) are genuinely wired into shipping binaries; the rest are leftover codex-rs-style ports that the CLI has superseded by re-implementing the same logic in its own `apps/cli/src/` modules. The trust-boundary modeling (Local / BYOK / Managed) lives in `protocol::projects` and is well-formed.

**Architecture:** Two consumers exist: `apps/cli` (binary `agi`) and `apps/desktop/src-tauri`. The desktop binary depends on exactly ONE engine crate: `sandbox-policy`. The CLI declares 8 engine-crate deps but its source only references 4 of them: `protocol` (only `custom_prompts` + `projects::ProjectSourceSurface`), `command-registry` (slash palette), `utils-image` (one call site in lib.rs), and `sandbox-policy` (re-exports `SandboxPolicy`). The other 4 declared CLI deps — `app-server`, `apply-patch`, `task-runtime`, `plugin-runtime` — are NEVER referenced in CLI source; the CLI instead ships its own local copies: `src/app_server.rs`, `src/apply_patch.rs`, `src/features/plugins/plugins.rs`, and a local `src/exec_policy.rs` (the latter duplicating the `execpolicy` crate). `protocol` (17.6K LOC, edition 2024) is the hub: it transitively pulls in `execpolicy`, `network-proxy` (8.2K LOC + 16 `rama-*` alpha crates), and the utils crates, but only borrows two small enums from network-proxy (`NetworkPolicyDecision`, `NetworkDecisionSource`) and a `Policy`/`Decision` type from execpolicy used inside protocol's own `models.rs`. Control flow into the engine is therefore shallow: CLI commands → CLI-local modules; protocol provides serde/ts-rs wire types shared with the TS packages. Sandbox ENFORCEMENT (landlock/seccomp) is not in the crates — `sandbox-policy` is a pure policy enum; enforcement lives in `apps/cli/src/platform/policy/{linux,windows}_sandbox.rs`. Linux-only deps in protocol (`landlock`, `seccompiler`) and their error variants are correctly `#[cfg(target_os = "linux")]` gated.

**Trust boundary:** Trust boundaries are modeled cleanly in protocol::projects: ProjectPrivacyMode {Local, Byok, Managed} and ProjectProviderMode {Local, DirectByok, ManagedGateway, ManagedNative} mirror the TS @agiworkforce/types contract and serialize stably. ProjectSourceSurface (the one projects type the CLI imports) separates 'synced app surfaces' (Web/Desktop/Mobile) from 'developer session surfaces' (Cli/Vscode/Chrome) via is_synced_app_surface()/is_developer_session_surface(), directly supporting the locked rule that developer (CLI/VSCode/Chrome) sessions stay distinct from synced cloud projects. sandbox-policy enforces a safe default: an unrecognized sandbox mode degrades to WorkspaceWrite, never DangerFullAccess, and DangerFullAccess must be requested by exact name. No crate in this area silently routes between Local/BYOK/Managed; the engine crates only define the vocabulary — actual routing/consent lives in the CLI/desktop. The app-server WS transport binds loopback-only unless --allow-public-listen is passed (good), though the WS endpoint has no auth (acceptable while loopback-only and non-functional).

**Key files:**

- `crates/agiworkforce-protocol/src/lib.rs` — Hub crate module map (edition 2024); 31 modules of shared wire types, ts-rs/serde, mirrors @agiworkforce/types
- `crates/agiworkforce-protocol/src/projects.rs` — Trust-boundary enums: ProjectPrivacyMode{Local,Byok,Managed}, ProjectProviderMode{Local,DirectByok,ManagedGateway,ManagedNative}, ProjectSourceSurface split into synced-app vs developer-session surfaces. Only ProjectSourceSurface is imported by CLI
- `crates/agiworkforce-protocol/src/network_policy.rs` — Thin wrapper that is the ONLY consumer of the 8.2K-LOC network-proxy crate (borrows 2 enums); NetworkPolicyDecisionPayload is itself unused by shipping binaries
- `crates/agiworkforce-app-server/src/lib.rs` — Real JSON-RPC+WS+MCP server with a ToolDispatch trait and a working tools/call dispatch (Processor::process). Declared as a CLI dep but NEVER imported — superseded by the worse CLI-local copy
- `apps/cli/src/app_server.rs` — SHIPPED app-server (invoked by Command::McpServer / Command::AppServer). Duplicate of the crate but with NO tools/call handler; advertises tools it cannot execute
- `crates/agiworkforce-apply-patch/src/lib.rs` — Security-conscious patch applier with path-traversal protection (resolve(), AUDIT-FIX C-4). Well-built but unwired — CLI uses its own src/apply_patch.rs which has independent traversal guards
- `crates/agiworkforce-network-proxy/src/certs.rs` — High-quality MITM CA key handling (atomic create-new, 0600 perms, symlink rejection). Real rama port but unreachable from any shipping binary
- `crates/sandbox-policy/src/lib.rs` — The ONE crate shared by both binaries. Clean enum with safe-default invariant (unknown mode -> WorkspaceWrite, never DangerFullAccess); fully tested
- `crates/agiworkforce-command-registry/src/lib.rs` — Genuinely wired: slash-command data types + builtin catalog, composed by apps/cli/src/command_registry.rs with skills/prompts/MCP. Good example of a properly-used crate
- `crates/agiworkforce-task-runtime/src/lib.rs` — Clean in-memory TaskRegistry + StallWatchdog, 30+ tests. Unwired (CLI never imports). read_output byte-seek can split a UTF-8 codepoint
- `crates/agiworkforce-plugin-runtime/src/lib.rs` — Plugin manifest schema (5 formats incl. Claude/Codex interop). Unwired — CLI duplicates ManifestFormat/MANIFEST_PATHS/PluginManifest in src/features/plugins/plugins.rs
- `apps/cli/Cargo.toml` — Declares 8 engine deps; 4 (app-server, apply-patch, task-runtime, plugin-runtime) are never used in CLI source
- `apps/cli/src/lib.rs` — Clap Command enum (McpServer at L541, AppServer at L543 are real user-facing subcommands) + dispatch at L1268; AppServer binding correctly refuses non-loopback without --allow-public-listen

**Risks:**

- 🟠 P1 Shipped app-server/MCP-server advertises tools it cannot execute (no tools/call) (`apps/cli/src/app_server.rs`) — Command::McpServer and Command::AppServer are real clap subcommands (lib.rs L541/L543, doc'd 'Run as MCP server'/'app server for IDE integration'). run_mcp_server advertises an 'agiworkforce_exec' tool and run_app_server's tools/list returns 12 tool names, but neither has a 'tools/call' match arm — any client invoking an advertised tool gets -32601 Unknown / Method not found. The capability is broken end-to-end. The unused agiworkforce-app-server crate actually implements tools/call via a ToolDispatch trait; the binary ships the inferior copy.
- 🟡 P2 Source-of-truth inversion: the dead app-server crate is better than the live CLI copy (`crates/agiworkforce-app-server/src/lib.rs`) — The declared-but-unused crate has the correct architecture (ToolDispatch injection + working tools/call). A future engineer fixing the MCP server will likely edit the crate (the obvious owner) and see no effect, because the binary uses apps/cli/src/app_server.rs. This duplication-with-divergence is a real maintenance trap, repeated across apply-patch, execpolicy, and plugin-runtime.
- 🟡 P2 Four CLI crate dependencies are entirely dead (`apps/cli/Cargo.toml`) — app-server, apply-patch, task-runtime, plugin-runtime are declared as path deps but never referenced in any CLI source file (verified by grep for both `use` and bare `crate::` paths). They inflate the dependency graph and build time and falsely imply wiring (the app-server crate's own doc comment claims 'the cli wires its own CliToolDispatch at construction' — no CliToolDispatch exists anywhere).
- 🟡 P2 8.2K-LOC network-proxy + 16 rama alpha crates pulled in to borrow two enums (`crates/agiworkforce-network-proxy/Cargo.toml`) — The entire MITM/SOCKS5/HTTP-proxy/cert machinery compiles into the workspace only because protocol's network_policy.rs imports NetworkPolicyDecision + NetworkDecisionSource. The proxy runtime is unreachable from any shipping binary, so the MITM CA code (good as it is) is not a runtime security surface — but the crate depends on `rama-* = "=0.3.0-alpha.4"` exact-pinned ALPHA versions, a supply-chain/maintenance quality flag for a build that ships.
- ⚪ P3 task-runtime read_output can panic on multibyte UTF-8 boundary (`crates/agiworkforce-task-runtime/src/lib.rs`) — read_output seeks to file_len - max_bytes then read_to_string; an offset landing mid-codepoint makes read_to_string return InvalidData (returned as TaskError::Io, not a panic) — but truncation is byte-based and may corrupt the first line. Behind an unwired crate, so impact is theoretical.
- ⚪ P3 AppServer silently falls back to loopback default on malformed --listen (`apps/cli/src/lib.rs`) — lib.rs L1281 unwrap_or_else: a malformed --listen value parses to DEFAULT_APP_SERVER_ADDR instead of erroring, so a user typo could bind a different address than intended (still loopback, so not a security issue). Minor UX/observability gap.

**Gaps:**

- MCP server (agi mcp-server) and app-server (agi app-server) advertise tools but implement no tools/call — the execution half of the protocol is an empty shell in the shipped code.
- agiworkforce-app-server crate: complete ToolDispatch-based server that is never constructed or wired by the CLI (no CliToolDispatch implementor exists).
- agiworkforce-apply-patch crate: fully implemented + tested patch applier, never imported (CLI uses its own src/apply_patch.rs).
- agiworkforce-task-runtime crate: complete TaskRegistry + StallWatchdog with 30+ tests, never imported by the CLI; registry is purely in-memory (Task metadata lost on restart, only the .out file persists).
- agiworkforce-plugin-runtime crate: full manifest schema, never imported (CLI duplicates the types in src/features/plugins/plugins.rs).
- agiworkforce-execpolicy crate (1.8K LOC): not used by either binary; CLI ships its own src/exec_policy.rs (which itself begins with #![allow(dead_code, unused_imports)]).
- network-proxy runtime/mitm/socks5/http_proxy/upstream (~7K LOC): no shipping consumer; only two enums escape into protocol.
- Several utils crates (utils-rustls-provider 12 LOC, utils-home-dir, utils-cache, utils-template, utils-string, utils-absolute-path) are consumed only transitively by protocol/network-proxy/execpolicy — i.e. only matter to the dead chain or to protocol's internal models.

**Hardening opportunities:**

- Either delete the 4 dead CLI crate deps (app-server, apply-patch, task-runtime, plugin-runtime) or invert the duplication so the CLI consumes the crates — currently both copies must be maintained and they have already diverged (app-server crate has tools/call, the CLI copy does not).
- Fix the shipped app-server: add a tools/call arm. The clean path is to delete apps/cli/src/app_server.rs and wire agiworkforce-app-server with a real CliToolDispatch (the crate is already built for exactly this).
- Remove agiworkforce-network-proxy and agiworkforce-execpolicy from protocol's dep tree if only two enums / one Policy type are needed — copy the small enums into protocol (or a tiny shared crate) to drop 8.2K LOC + 16 rama alpha crates and the execpolicy crate from the workspace build.
- Move the `rama-* = "=0.3.0-alpha.4"` exact alpha pins off alpha or vendor/document them; alpha pins shipping in a release build are a supply-chain risk.
- Update the workspace Cargo.toml comment (still says '44 crates') and the app-server crate doc comment (claims a CliToolDispatch that doesn't exist) so docs match reality.
- Make `agi app-server --listen <bad>` error rather than silently fall back to the loopback default (lib.rs L1281).

**Open questions:**

- Is the engine-crate set intended to become the source of truth (CLI migrates onto them) or is it intended to be pruned (CLI is the source of truth)? The workspace comment says prune; the crate doc comments say wire. The two answers imply opposite fixes for the app-server tools/call gap.
- Are `agi mcp-server` / `agi app-server` advertised as shipped capabilities (docs, parity matrix)? If yes, the missing tools/call is a launch-blocking P1; if they are internal/experimental, it is lower priority.
- Is agiworkforce-task-runtime meant to back the CLI's background-task / TaskCreate surface eventually? If so its in-memory-only persistence (Task metadata lost on process restart) needs addressing before wiring.

### ext-chrome

**Purpose:** A Manifest V3 Chrome extension that bridges web pages to the AGI Workforce desktop app for browser automation. It captures page context, executes LLM-planned DOM actions (click/type/navigate/scroll), records and replays workflows, autofills job applications (LinkedIn/Lever), and runs an in-page + side-panel chat surface. It contains NO LLM logic itself: all chat/planning routes to the local desktop bridge (HTTP localhost:8787) or the native-messaging host (com.agiworkforce.browser), never to hosted APIs. The surface is explicitly a "developer session" boundary that must never sync consumer chat history.

**Architecture:** Five build entry points (vite.config.ts rollup inputs): src/background.ts (MV3 service worker, 3080 LOC), src/content.ts (content script on http/https, 2193 LOC), src/popup.ts, src/side_panel.ts (4584 LOC), src/options.ts. Control flow: content scripts and extension pages send typed ExtensionMessages to background.handleMessage, which enforces a three-layer gate before dispatch — (1) origin allowlist (siteAllowlistCache from chrome.storage.local agi_site_allowlist), (2) EXTENSION_PAGE_ONLY_MESSAGE_TYPES for state-persisting types, (3) same-tab restriction for DOM_MUTATION types — all derived from a single declarative MESSAGE_POLICY matrix in src/background/policy.ts. Background talks to the desktop two ways: HTTP fetch to the bridge (validateBridgeUrl-gated to localhost/127.0.0.1/[::1] only) for /v1/chat/stream and /pair, and chrome.runtime.connectNative for native messaging with a negotiated per-session HMAC envelope (id|timestamp|body) that has a strict-mode downgrade guard. The desktop returns action plans (page_context -> {task_id, actions}) that are re-validated by validateShortcutActions before being forwarded to content.ts:executePlannedAction, which maps each action to a fixed switch (no eval; EXECUTE_SCRIPT is locked to a named-operation allowlist). Autonomy is gated by actionModeCache ('ask'|'act') with an inline PERMISSION_REQUIRED consent card. Page text sent as LLM context is innerText-only (not outerHTML), invisible-Unicode-stripped, and secret-redacted (sanitizePageText). Side-panel and popup render LLM markdown through renderMarkdown + DOMPurify (sanitizeHtml); the in-page panel uses textContent only. KEY ARCHITECTURAL NOTE: the tree is mid-refactor into a features/ + ui/core/platform/integrations/data layout. The live build still uses the FLAT files (background.ts, content.ts, ...). Many flat files are now thin re-export shims to features/_ (sendQueue, providerStreamClient, conversation-history, dom-helpers, platform-prompts, browserTool, inPagePanel/{launcher,panel,panelStyles,pageActions}, side_panel/voice). Others (webmcp.ts, nlweb.ts, page-metadata.ts, autofill/_, pairing.ts, background/policy.ts) remain canonical in the flat location. The ui/core/platform/integrations/data/features-popup barrels are empty documented placeholders.

**Trust boundary:** Local-only discipline is strong and actively enforced. Chat NEVER falls back to hosted APIs: handleChatMessage and handleInPagePrompt only fetch the validated local bridge or use native messaging, then show an offline message (background.ts ~2728, 2840-2882). No provider apiKey is ever read off an inbound message (the legacy apiKey destructure was removed; comment at ~2635). Autofill PII (agi*autofill_profile) and conversation history (agi_conversation_history) live exclusively in chrome.storage.local with a one-shot migrator that evacuates them out of chrome.storage.sync (which replicates to Google). The Managed-cloud boundary is waitlist-gated and fails closed: features/cloud-bridge stores only a local agi_cloud_unlocked flag, lib/waitlistService.ts returns 'not_wired'/throws WebApiConfigError unless VITE_AGI_WEB_API_BASE_URL is configured to localhost or \*.agiworkforce.com (https), and scripts/check-no-cloud-ipc-v1.mjs CI-blocks any cloud*\* IPC outside the gate. Bridge URL, gateway URL, pairing token shape, and probe origins are all validated against shared allowlists in policy.ts. NLWEB_PROBE is SSRF-guarded to the sender's own origin with credentials:'omit'.

**Key files:**

- `apps/extension/manifest.json` — MV3 manifest; hardened CSP (no unsafe-inline), host_permissions limited to localhost/127.0.0.1, nativeMessaging+sidePanel+scripting+cookies permissions
- `apps/extension/src/background.ts` — Service worker: native-messaging connect/HMAC envelope, message router with 3-layer gate, local-bridge chat streaming, autonomy consent, page-context plan execution
- `apps/extension/src/background/policy.ts` — Single source of truth: MESSAGE_POLICY matrix, validateBridgeUrl/validateGatewayUrl, validateShortcutActions (URL-scheme + size caps), safeJsonParse caps, sanitizePageText, INVISIBLE_UNICODE_RE
- `apps/extension/src/content.ts` — Content script: extractPageHtmlSafely (innerText-only), executePlannedAction switch, handleExecuteScript (named-op allowlist, no eval)
- `apps/extension/src/side_panel.ts` — Side panel chat UI; renders model output via sanitizeHtml(renderMarkdown); imports validateBridgeUrl from policy (H-02 fix)
- `apps/extension/src/side_panel/markdown.ts` — DOMPurify sanitizer (strict ALLOWED_TAGS/ATTR, http(s)|mailto only) + defense-in-depth entity-encoding markdown renderer + noopener hook
- `apps/extension/src/pairing.ts` — Desktop pairing state machine; session-storage token, shape-validated, local-bridge-only
- `apps/extension/src/autofill/filler.ts` — Job-app field filler; sanitizeProfileValue strips HTML/control chars; profile in storage.local with sync->local migrator; never auto-submits
- `apps/extension/src/lib/waitlistService.ts` — Cloud waitlist/invite-code client; fails closed (not_wired) unless web API base URL configured; CSRF-protected
- `apps/extension/src/inPagePanel/setup.ts` — DIVERGENT DUPLICATE: labeled '@deprecated re-export shim' but is a full copy; the live content.ts imports THIS, and only THIS copy has the M-14 allowlist gate
- `apps/extension/src/features/content/in-page-panel/setup.ts` — The nominal 'canonical' copy that @deprecated comments point devs toward — but it is MISSING the M-14 allowlist-gating security fix present in the flat copy
- `apps/extension/scripts/check-no-cloud-ipc-v1.mjs` — CI guard enforcing v1 local-only: blocks direct cloud\_\* IPC outside the cloud-bridge gate

**Risks:**

- 🟡 P2 in-page-panel setup.ts is a divergent duplicate; security fix lives only in the live copy and is absent from the 'canonical' target (`apps/extension/src/inPagePanel/setup.ts`) — The flat src/inPagePanel/setup.ts header says '@deprecated import from features/content/in-page-panel instead. Re-export shim' but it is NOT a shim — it is a full 98-line implementation. content.ts (line 31) imports this flat copy, which DOES contain the M-14 allowlist gate (only inject the FAB launcher on agi_site_allowlist origins). The features/content/in-page-panel/setup.ts that the comment instructs future devs to migrate to is MISSING that gate. A developer 'finishing the refactor' by switching content.ts to the features/ import (as the @deprecated note literally tells them) would silently regress M-14: the launcher would inject on every http(s) page again (fingerprint + confusing allowlist errors). Genuine drift trap, not an audit false-positive.
- 🟡 P2 Autonomy consent card derives domain from the active tab, not the action's target tab (`apps/extension/src/background.ts`) — In 'ask' mode the consent gate (~L2126-2168) computes actionDomain via chrome.tabs.query({active:true,currentWindow:true}) and checks siteAllowlistCache.has(`https://${actionDomain}`) to decide whether to prompt — even though the action plan executes on the in-scope `tabId`/`url` derived from the page-context call (L2053/2083). If the user switches tabs/windows while a bridge-planned action resolves, the card shows the wrong domain, and if the now-active tab is allowlisted while the real target tab is not, the prompt is skipped entirely. Actions still run on the correct tabId, so impact is consent-accuracy + a narrow allowlist-skip, not arbitrary execution.
- 🟡 P2 Incomplete dual-layout refactor: parallel features/ tree plus empty placeholder barrels coexist with flat live files (`apps/extension/src/features/content/index.ts`) — ui/core/platform/integrations/data/index.ts and features/popup/index.ts are empty documented placeholders ('Currently empty — files will be moved here in subsequent phases'). features/content/index.ts re-exports modules that the live content.ts does not import (it uses flat paths). The 'canonical' location is inconsistent per-file (webmcp/nlweb/page-metadata/autofill/pairing/policy are canonical-flat; platform-prompts/browserTool/dom-helpers/sendQueue/providerStreamClient are shims-to-features). Builds fine today, but the half-migrated state is a maintenance hazard and the source of the setup.ts divergence above.
- ⚪ P3 Bridge token sent only on chat-stream path; /pair and other bridge fetches are unauthenticated to the local port (`apps/extension/src/background.ts`) — X-Bridge-Token (the paired session token) is attached only to the /v1/chat/stream fetch (~L2748). pairing.ts POSTs /pair and side_panel.ts GETs /v1/status with no token. Any local process binding 8787 before the desktop app could answer /status or hand out a pairing token. validateShortcutActions re-validates bridge-supplied plans as defense-in-depth (L2104), limiting blast radius, so this is low severity and largely a desktop-side contract question.

**Gaps:**

- features/popup, ui, core, platform, integrations, data barrels are empty stubs documented as 'files will be moved here in subsequent phases' — the layered architecture they imply does not yet exist; the flat files are the real implementation.
- Cross-surface cloud-unlock inheritance from the desktop app is explicitly deferred (features/cloud-bridge/desktopBridge.ts comment): each surface tracks its own agi_cloud_unlocked flag locally; the native-bridge protocol message for it is unimplemented and needs supervisor sign-off.
- features/native-bridge/providerStreamClient.ts and sendQueue.ts are re-export shims from flat 9-line files — verify the canonical bodies actually contain logic (the flat originals are now thin); the providerStreamClient name implies provider streaming that, per the local-only boundary, should not carry hosted-provider logic on this surface.
- The desktop /pair, /v1/status, and /v1/chat/stream endpoints are an external contract owned by apps/desktop's bridge; this surface assumes their shapes (e.g. {token, fingerprint}, SSE choices[].delta.content) — not verifiable from extension code alone.

**Hardening opportunities:**

- Delete the divergent flat src/inPagePanel/setup.ts and make it a true re-export shim AFTER porting the M-14 allowlist gate into features/content/in-page-panel/setup.ts, so the two copies cannot drift and the documented migration target is the secure one.
- Fix the consent prompt to derive the domain from the in-scope page-context `url`/`tabId` rather than re-querying the active tab, eliminating the focus-change consent mismatch and the allowlist-skip edge.
- Attach the paired X-Bridge-Token to /pair and /v1/status (and any future bridge calls) so a pre-binding local process cannot answer them, or document that the desktop bridge binds before the extension can connect.
- Finish or freeze the features/ refactor: either complete the move and convert all flat files to shims, or revert the empty barrels; the current half state is the root cause of the duplication risk.
- Add a CI lint that fails if any file whose header claims 'Re-export shim' contains more than the export-\* line, to mechanically prevent the setup.ts class of drift.

**Open questions:**

- Does the desktop native host actually mint a 64-hex-char session_secret in its connect ack? If not, every install runs in the legacy no-HMAC path (one-time warn) and the response-shuffle protection is dormant.
- Is the desktop bridge guaranteed to bind localhost:8787 before the extension first fetches it, given /pair and /status are token-less? Otherwise a squatting local process is a real pre-pairing risk.
- Which module layout is the intended end state — is content.ts supposed to migrate to the features/ imports (which would regress M-14), or are the features/ copies meant to be deleted? The @deprecated comments and the live wiring currently point in opposite directions.
- providerStreamClient (features/native-bridge) — what does it stream, and does any of it touch a non-local provider in a way that could cross the local-only boundary?

### ext-vscode

**Purpose:** The VS Code extension surface ("AGI Workforce") embeds a model-agnostic AI coding assistant into VS Code: an @agi chat participant, a sidebar webview chat, agent-mode multi-file editing, inline completions, code lens, hover actions, history/context/memory trees, a model picker, and an optional localhost "desktop bridge" to the companion Tauri app. It is explicitly v1 LOCAL/BYOK-only: all LLM calls go to the user's configured AGI Workforce API endpoint with a SecretStorage-held key; managed-cloud invite/waitlist is deliberately fail-closed. The codebase shows an unusually mature, audit-driven security posture (path containment, sensitive-file denylists, prompt-injection isolation tags, CSP-locked webviews, Zod-validated message protocols).

**Architecture:** Entry: src/extension.ts activate() runs initSubsystemHealth → telemetry → modelMetrics → desktop bridge → checkpoint manager, then setupProviders() (code intel/diff/inline), setupChat() (chat participant + sidebar + trees + memory), setupCommands(). Layering is clean post-reorg (SHAPE.md): core/ (activation, command registry, telemetry, health), features/ (chat-participant, sidebar-webview, inline-completions, code-lens, hover, trees, model-picker, desktop-bridge, cloud-bridge), platform/ (VS Code API abstractions, config), integrations/ (provider routing, patch engine, tier/switch guards), data/ (conversationStore, tokenCounter, usageMeter, contextBuilder, workspaceIndexer, checkpointManager), memory/, protocol/ (Zod schemas for webview + bridge messages), utils/ (api.ts HTTP client, pathSafety). Data flow: webview→onDidReceiveMessage→parseWebviewMessage (Zod)→ChatStateManager.handleMessage→streamChatCompletion (utils/api.ts SSE)→postMessage tokens back. Chat participant builds a system prompt wrapping untrusted selection/file content in tagged regions, then streams via API with vscode.lm (Copilot) fallback. Agent mode: agentLoop.ts (UI-free LLM loop, parses @read/`patch/`edit) → agentUI.ts (Workspace-Trust gate + per-file diff review for sensitive paths + checkpoints) → patchEngine.ts (search/replace with confidence scoring, path containment, writes via WorkspaceEdit). Trust boundary enforcement is centralized: utils/api.ts validates endpoint host allowlist from global config only, pathSafety/@agiworkforce-utils resolveContained for traversal, isSensitiveFile denylist gates inline completions / @file / @read / agent reads.

**Trust boundary:** Local/BYOK is the only live boundary. LLM calls (utils/api.ts) use a SecretStorage-stored key; the endpoint is read from GLOBAL config only and validated against a host allowlist (agiworkforce.com / api / staging + localhost) so a malicious workspace .vscode/settings.json cannot exfiltrate the key (VSCODE-01). Workspace settings are deliberately ignored for security-sensitive URLs. Managed-cloud is fully gated: invite/waitlist fail closed; provider-stream path throws not-wired. platform/surface.ts asserts the 'vscode' surface can never be reclassified as chat-syncing (sync-rule compliance — conversations persist only to globalState, no platform DB client imported). Agent edits cross into the filesystem only through agentUI.ts which enforces a Workspace-Trust modal gate (VSCODE-02) plus per-file diff review for sensitive-category paths even under Accept All (PR-2B/F-03), with resolveContained path containment and isSensitiveFile denylisting at every read/write. The desktop bridge is a separate localhost trust surface with token auth, type/command allowlists, rate limiting, and workspace-contained file opens.

**Key files:**

- `apps/extension-vscode/src/extension.ts` — Activation entry point; wires subsystems, status bar, config-change listeners, first-run prompts, fire-and-forget tier fetch
- `apps/extension-vscode/src/utils/api.ts` — Core HTTP/SSE LLM client; SecretStorage key, endpoint host allowlist (global-config-only), paywall/tier parsing; streamChatCompletionViaProvider is a deliberate fail-closed stub (AGI_ACCOUNT_WEB_AUTH_NOT_WIRED)
- `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` — @agi chat participant; slash commands, untrusted-selection tagging, vscode.lm fallback, inline paywall card; documents 3 invariants (no auto-exec, hardcoded button command IDs, no shell/FS)
- `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` — Webview message router + streaming state; @file resolution with dedupe/caps/sensitive-denylist/tag-escaping (VSCODE-06), provider-switch paywall guard, attachFiles persistence
- `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` — Sidebar HTML; nonce-based CSP (default-src none, no unsafe-inline), markdown rendered via out/webview/render.js
- `apps/extension-vscode/src/webview/render.ts` — markdown-it(html:false)+DOMPurify sanitizer exposed as window.agiRender; forces target=\_blank rel=noopener on links
- `apps/extension-vscode/src/providers/agentMode/agentUI.ts` — Edit/patch approval UI; VSCODE-02 untrusted-workspace gate + PR-2B LITL per-file review for sensitive-category paths even under Accept All; checkpoints before apply
- `apps/extension-vscode/src/providers/agentMode/agentLoop.ts` — UI-free agent loop; parses @read/patch/edit, wraps file reads in <untrusted_file> tags, path-contained + sensitive-denylisted reads, iteration limit
- `apps/extension-vscode/src/integrations/patchEngine.ts` — Search/replace patch parser+applier; exact/fuzzy/aggressive matching with confidence scoring + uniqueness/min-length refusals; write path uses resolveContained + isSensitiveFile
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — localhost WS/HTTP bridge to desktop app; 0600 token (TOCTOU-safe fd read), auth handshake, inbound/outbound type allowlists, command allowlist + rate-limit + debounce, workspace-contained file-open
- `apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts` — Inline completion provider; sensitive-file + secrety-name denylist, debounce, bounded LRU cache, one-time paywall suppression
- `apps/extension-vscode/src/features/model-picker/modelConstants.ts` — Model picker/cost/context metadata derived from @agiworkforce/types (packages/types/src/models.json) — complies with no-hardcoded-model-IDs lock
- `apps/extension-vscode/src/lib/waitlistService.ts` — Cloud invite/waitlist — intentionally fail-closed stubs returning success:false (v1 LOCAL-ONLY lock)
- `apps/extension-vscode/src/protocol/webviewMessages.ts` — Zod validation for webview→ext messages (referenced; gates ChatStateManager)
- `apps/extension-vscode/src/integrations/providerStreamClient.ts` — Fully-implemented provider SSE client that is exported but never called — dead code paired with the stubbed provider-stream path

**Risks:**

- 🟡 P2 Provider-stream path is fully unwired dead code (streamFromProvider + streamChatCompletionViaProvider) (`apps/extension-vscode/src/integrations/providerStreamClient.ts`) — streamFromProvider is a complete SSE client exported from integrations/index.ts but has zero feature callers. The only consumer-facing entry, Config.useProviderStream(), routes chatParticipant to streamChatCompletionViaProvider (utils/api.ts) which unconditionally throws AGI_ACCOUNT_WEB_AUTH_NOT_WIRED. If a user toggles agiWorkforce.useProviderStream=true, every chat-participant request hard-errors instead of falling back. Intentional fail-closed per the not-wired account-auth gap, but the live setting is a user-reachable footgun and the client is maintenance-cost dead code (also references agiWorkforce.gatewayUrl which exists in package.json but is consumed by nothing).
- ⚪ P3 Streaming token-cost figures are char/4 estimates, not API-reported usage (`apps/extension-vscode/src/data/tokenCounter.ts`) — In the streaming path (utils/api.ts) addUsage is called with only bodyStr.length / responseChars; real prompt/completion token counts are used only in the non-streaming branch. The status-bar 'Tokens X/Y', showAccountUsage, and 'Est. Cost $' therefore diverge from actual provider billing whenever streaming is on (the default). Cost rates themselves are catalog-derived (models.json) and labeled 'Estimated/Approximate', so this is an accuracy note, not fabricated data.
- ⚪ P3 Desktop bridge TCP transport reachable by any same-user local process (`apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`) — Self-documented (PR-4A F-08/F-21): ws://127.0.0.1:8787 + 0600 token protects against other OS users but not other processes of the same user. Mitigations are in place (auth handshake, type allowlists, command allowlist, 30/min rate limit, no arg forwarding, workspace-contained file open), and the planned fix is a Unix socket / named pipe pending desktop-side coordination. Residual same-user local risk only; off by default (desktopBridge.enabled defaults false).
- ⚪ P3 Bridge inbound message-type allowlist hardcoded separately from Zod schema; auth_ok before allowlist check (`apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`) — ALLOWED_INBOUND_TYPES and parseBridgeInbound are two independent validation layers that must be kept in sync by hand; drift would silently drop or admit frames. Minor: the auth_ok handshake is processed after the allowlist gate (auth_ok is in the set), so ordering is correct, but the dual source-of-truth is a maintenance hazard guarded only by bridgeAllowlists.test.ts.

**Gaps:**

- Managed-cloud is an intentional empty shell: redeemInviteCode/joinWaitlist (lib/waitlistService.ts) always return success:false ('account_auth_not_wired'); the InviteCodeModal renders correctly but can never unlock anything, and openInviteCodeModal is invoked with source:'other' and no onRedeemed callback — so even a hypothetical success would not flip any unlock state. Consistent with the v1 LOCAL-ONLY + cloud-waitlist lock.
- AGI-account web auth (Clerk-backed) is not wired into the extension at all (utils/api.ts comments + waitlistService). This is the root cause behind both the dead provider-stream client and the fail-closed cloud bridge.
- agiWorkforce.gatewayUrl setting exists in package.json but has no live consumer (only the dead streamFromProvider references it).
- Hover provider (features/hover/hoverProvider.ts) is static-only: renders trusted command-link markdown, sends no code to the LLM — so it does NOT mirror inlineCompletionProvider's sensitive-file guards, but it doesn't need to (no data egress). Default-disabled (hoverEnabled=false).
- Context-files tree (contextPanelProvider.ts) only injects pinned/auto file PATHS (not contents) into prompts via getContextFiles(); a pinned sensitive file leaks its name but not its body. File-content reads go only through @file/@read paths which apply isSensitiveFile denylisting. No unescaped sensitive-content path found.

**Hardening opportunities:**

- Remove or gate the dead provider-stream code: either delete integrations/providerStreamClient.ts + the useProviderStream/gatewayUrl settings, or hide useProviderStream from package.json contributes until AGI-account auth lands, so users cannot toggle it into a guaranteed hard-error.
- Wire API-reported usage into the streaming token counter: SSE responses that include a final usage frame should feed addUsage(prompt_tokens, completion_tokens) instead of char/4 estimates, to keep status-bar/cost figures honest.
- Derive ALLOWED_INBOUND_TYPES/ALLOWED_OUTBOUND_TYPES from the same Zod bridge schema (single source of truth) rather than a hand-maintained Set, eliminating drift between the two validation layers.
- Accelerate the bridge Unix-socket/named-pipe transport (already planned) to close the same-user local-process reachability of the TCP listener.
- Consider applying the inline-completion sensitive-file guard symmetry note to any future hover/codeLens features that begin sending code to the API (currently none do).

**Open questions:**

- Is agiWorkforce.useProviderStream meant to ship enabled-able in v1 at all? Today flipping it guarantees a hard error on every chat-participant turn.
- When AGI-account (Clerk) auth lands, will streamFromProvider/providerStreamClient become the live path, or is it superseded by the existing /chat/completions client? If the latter, it should be deleted now.
- Does the backend /chat/completions SSE emit a usage frame the extension could consume for accurate streaming token accounting?
- Telemetry (core/telemetry.ts) and tier signature verification (utils/api.ts notes signatures are not yet enforced) were not deeply audited here — worth confirming telemetry redaction and that an unsigned tier response cannot escalate capability gates.

### pkg-types-contracts

**Purpose:** packages/types (@agiworkforce/types) is the cross-surface contract package: the single TypeScript source of truth for the Local/BYOK/Managed trust boundary, the canonical LLM model catalog (models.json), tier/quota policy, slot-based auto-routing, and the application-suite wire contracts (chat sync, developer sessions, generated-file manifests, remote control). Every surface (desktop, web, mobile, cli, extensions) and the Rust core mirror these types/data. It is pure types + data + deterministic helper functions with strong unit-test coverage.

**Architecture:** Barrel `src/index.ts` re-exports ~40 modules. Three pillars for this investigation: (1) suite-contracts.ts — defines PrivacyMode ('local'|'byok'|'managed'), ProviderMode ('Local'|'DirectByok'|'ManagedGateway'|'ManagedNative'), ChatExecutionMode, the surface taxonomy (SyncedAppSurface = web/desktop/mobile vs DeveloperSessionSurface = cli/vscode/chrome), display-copy maps, and conversion helpers. It also provides runtime guards `assertSurfaceCanSyncChats` (throws if a developer surface enters the synced-chat pipeline) and `validateGeneratedFileTrustBoundary`/`assertGeneratedFileTrustBoundary` (per-privacy-mode invariants: local files must stay on file://, BYOK transfers need preview+approval evidence, managed files need quota/owner/checksum/retention/deletion metadata). Both guards are genuinely wired at call sites (web+mobile conversationSync, vscode chatParticipant, services/artifacts, web artifact-publisher). (2) models.json — version 1, lastUpdated 2026-05-25, with a verificationLog entry documenting a 2026-05-25 audit of apiModelId values against live provider docs; 84 models across 25 providers, plus providers/tierAllowedModels/modelPresets/providersInOrder and canonicalization alias maps. (3) model-catalog.ts (1918 lines) — typed schema over models.json plus: alias resolution (normalizeModelId via id/apiModelId/canonicalization), modelsById (canonical-wins-over-alias logic), SLOT_REGISTRY (29 evidence-based routing slots), TIER_POLICIES (deep-frozen per-tier capability+quota matrix), and resolution helpers (resolveAutoModeModel task-aware router, getDefaultModelFor, getPickerModels, getProviderSurface). A module-load IIFE drift-check throws if any SLOT_REGISTRY.modelId is absent from modelsById, so catalog drift fails loudly at import time.

**Trust boundary:** The Local/BYOK/Managed boundary is modeled crisply and defended at runtime, not just in types. PrivacyMode/ProviderMode/ChatExecutionMode are distinct unions with explicit conversion helpers and display copy, and providerModeToPrivacyMode is the single derivation used by validators. assertSurfaceCanSyncChats enforces that only web/desktop/mobile enter the synced-chat pipeline (cli/vscode/chrome throw) and is wired into web + mobile conversationSync and the vscode chat participant — a genuine, connected guard. validateGeneratedFileTrustBoundary enforces per-mode invariants (local must be file:// + local_device scope; BYOK transfers require preview-hash + approval evidence; managed requires quota reservation, owner, checksum, TTL/retention, and deletion metadata) and has a fail-fast assert variant wired into services/artifacts and web artifact-publisher. VERIFIED CLEAN: all 21 picker-eligible models in tierAllowedModels (economy+pro_additions+flagship_additions) resolve to provider surface 'managed_cloud' — none leak through a 'hidden' provider, so no surfaced-but-unclassified user-selectable model exists. Provider-surface sets in model-catalog (MANAGED_CLOUD / BYOK={open_router,nvidia_nim} / LOCAL={ollama}) are consistent with the v1 waitlist/local-first posture.

**Key files:**

- `packages/types/src/suite-contracts.ts` — Trust-boundary vocabulary (PrivacyMode/ProviderMode/ChatExecutionMode), surface taxonomy, sync guard assertSurfaceCanSyncChats, generated-file trust-boundary validator, send-preview/project-header presentation helpers
- `packages/types/src/models.json` — Canonical model catalog data: 84 models / 25 providers / tierAllowedModels / modelPresets / canonicalization aliases / verificationLog
- `packages/types/src/model-catalog.ts` — Typed schema + alias resolution + SLOT_REGISTRY (29 slots) + TIER_POLICIES + auto-routing resolvers; module-load drift check on slot model IDs
- `packages/types/src/provider.ts` — Canonical Provider union (28 ids); documents Rust enum mirror contract
- `packages/types/src/__tests__/suite-contracts.test.ts` — Locks trust-boundary vocab, sync-guard throw behavior, generated-file boundary invariants
- `packages/types/src/__tests__/model-catalog.test.ts` — Locks slot→model resolution, tier policies, task-aware routing, US-only toggle, model-id drift IDs
- `packages/unified-chat/src/lib/promptClassifier.ts` — OUT OF PACKAGE but key consumer: a parallel tier×task→slot routing table independent of model-catalog's TASK_TYPE_TO_SLOT\* maps

**Risks:**

- 🟡 P2 Two divergent routing source-of-truth tables for SLOT_REGISTRY consumption (`packages/types/src/model-catalog.ts`) — model-catalog.ts owns TASK_TYPE_TO_SLOT / \_PRO / \_PRO_PLUS (used by resolveAutoModeModel), but packages/unified-chat/src/lib/promptClassifier.ts (lines ~194-233) defines a SEPARATE tier×task→slot matrix over the same SLOT_REGISTRY. They disagree: model-catalog routes Pro coding→coding_premium_pro (Sonnet 4.6) while the classifier routes balanced coding→coding_fast and premium coding→coding_premium. Two unsynchronized routing tables over one slot registry is a real correctness/maintenance hazard — a slot/model change in one place silently diverges from the other. Both are import-time validated against the catalog, so it will not crash, but routing behavior depends on which entry point a surface calls.
- ⚪ P3 SLOT_REGISTRY.coding_fast stores a non-canonical alias as modelId with stale pricing prose (`packages/types/src/model-catalog.ts`) — coding_fast.modelId = 'deepseek-chat', which is NOT a catalog entry — it is only a canonicalization alias that resolves to deepseek-v4-flash. Every other slot uses a canonical model id (this breaks the registry's own invariant). The slot description hardcodes 'DeepSeek V3.2: ~70% SWE-bench, $0.27/$0.42' but the resolved model is DeepSeek V4 Flash at $0.14/$0.28 — stale facts that contradict models.json (the resolved-via-alias model differs from the prose; sibling reasoning_premium prose is accurate, so this is a leftover, not systemic). getSlotForModel(deepseek-v4-flash) will not map back to coding_fast because the registry key is the alias. The module-load drift check passes only because modelsById includes alias keys. Slot descriptions are not rendered in any surface UI (grep found no consumers), so the stale pricing is internal-only.
- ⚪ P3 Provider union has 3 ids (lmstudio, minimax, ollama_cloud) absent from models.json; minimax referenced by NON_US_PROVIDERS (`packages/types/src/provider.ts`) — provider.ts declares lmstudio/minimax/ollama_cloud but models.json has no provider config or models for them. minimax appears in NON_US_PROVIDERS (model-catalog.ts) for the US-only routing toggle yet has zero routable models, so the toggle logic for it is inert. Benign forward-declaration today, but getProviderConfig/getProviderSurface for these return null/'hidden' and any future model assigned to them would be silently unselectable until wired.
- ⚪ P3 runway provider used by a routing slot but missing from providersInOrder (`packages/types/src/models.json`) — SLOT_REGISTRY.video_generation_pro_plus → runway-gen-4 (provider 'runway'), and runway has a providers entry, but it is absent from providersInOrder. getPickerModels orders by providersInOrder index and falls back to MAX_SAFE_INTEGER for unlisted providers, so runway models (if ever picker-eligible) sort last. Cosmetic ordering only; video models are not in tierAllowedModels picker sets today.

**Gaps:**

- coding_fast / coding_premium / vision_fast slots are not reachable from any TIER_POLICIES.allowedSlots, the model-catalog TASK_TYPE_TO_SLOT\* maps, DEFAULT_KIND_SLOT_PREFERENCE, or the legacy auto-mode path; they are ONLY reached via the separate packages/unified-chat promptClassifier table. So within packages/types they look dead, but they are live through the parallel routing path — reinforcing the dual-source-of-truth risk above.
- Provider union literals lmstudio/minimax/ollama_cloud are declared but have no catalog representation (placeholder/forward-declared providers).
- getProviderSurface classifies ~15 declared providers (mistral, groq, together, fireworks, cerebras, deepinfra, cohere, ai21, sambanova, azure, bedrock, etc.) as 'hidden' — they have models in models.json and modelPresets but no Local/BYOK/Managed surface assignment, so those models cannot surface in any trust-boundary-aware picker. Confirmed NOT a leak for user-selectable picker models (see trustBoundaryNotes), but it means a large slice of the catalog is currently unsurfaceable by design.

**Hardening opportunities:**

- Unify the two routing tables: have packages/unified-chat/promptClassifier import the TASK_TYPE_TO_SLOT\* maps (or a shared tier×task matrix) from model-catalog instead of maintaining its own parallel copy, eliminating silent divergence.
- Add a module-load assertion (or lint) that every SLOT_REGISTRY.modelId is a CANONICAL catalog id (present as a top-level models.json key), not merely alias-resolvable — this would have caught coding_fast='deepseek-chat'.
- Derive slot description pricing/benchmark prose from models.json at build time, or drop hardcoded $-per-M and benchmark numbers from SLOT_REGISTRY descriptions, to satisfy the repo's no-hardcoded-model-facts rule and prevent prose drift.
- Add a reachability test that flags any SLOT_REGISTRY slot not referenced by any routing table across packages (allowedSlots, both classifiers, DEFAULT_KIND_SLOT_PREFERENCE) so truly-orphaned slots are caught.
- Either remove lmstudio/minimax/ollama_cloud from the Provider union until backed by models.json, or add catalog stubs, so the union and catalog stay in lockstep; add runway to providersInOrder if its models become picker-eligible.

**Open questions:**

- Is the packages/unified-chat promptClassifier or model-catalog's resolveAutoModeModel the authoritative router at request time? Which one do production surfaces actually call, and do both run in different code paths (creating user-visible routing inconsistency)?
- Is coding_fast's stored alias 'deepseek-chat' intentional (pre-existing comment in modelsById references a deepseek-chat alias gotcha) or a leftover from a prior catalog where deepseek-chat was a real entry?
- Does the Rust models_config.rs mirror stay in sync with the 28-member Provider union and 84-model catalog, and is there CI enforcing that cross-language parity? (Out of this package's scope but anchored to its data.)

### pkg-llm-routing

**Purpose:** Four shared TypeScript packages that together form the cross-provider LLM layer: packages/providers/\* (per-vendor adapters implementing a common ProviderAdapter streaming interface for Anthropic, OpenAI, Google, Ollama, LM Studio, DeepSeek, xAI, Perplexity), packages/llm-normalize (pure cross-provider payload-policy functions: Anthropic cache_control/service_tier, OpenAI Responses vs Completions, tool-schema normalization, Gemini schema cleanup), packages/llm-runtime (retry generator, error classifier, stream idle watchdog, latched headers, gateway fingerprinting, fallback-chain resolution, history repair), and packages/routing (heuristic task classifier, Indic-script detector, and a promo/deprecation-aware three-tier model router). They are intended to be the single source of truth for model selection, request normalization, and resilient streaming across all seven surfaces.

**Architecture:** Control flow on the live path: a surface (apps/desktop/src/lib/modelRouter.ts, apps/web .../request-processor.ts, services/api-gateway providerStream.ts) classifies the task via routing.classifyTaskLocally + applyConversationContext, resolves a model via @agiworkforce/types resolveAutoModeModel (SLOT_REGISTRY/TIER_POLICIES), builds a ProviderAdapter via services/api-gateway/src/lib/providerAdapters.ts or desktop equivalents, then iterates adapter.stream(req, signal). Each adapter translates ChatRequest into vendor SDK params, applies a llm-normalize payload policy (e.g. applyAnthropicPayloadPolicyToParams), hands the SDK stream through withStreamIdleWatchdog (the one runtime primitive that IS wired everywhere), translates vendor stream events to the canonical StreamChunk discriminated union, and on throw calls classifyError to emit one {type:'error'} + {type:'stop'} chunk. Key abstractions: ProviderAdapter (from @agiworkforce/types), StreamChunk union, ClassifiedError (16-branch taxonomy), RetryContext/RouteResolution. Two parallel routers exist: the LIVE one (resolveAutoModeModel in packages/types, benchmark-aware in desktop modelRouter) and the DEAD one (resolveThreeTierModel in packages/routing). Trust boundaries (Local/BYOK/Managed) are enforced upstream by tier/slot policy and the api-gateway managedComputeGate middleware, not inside these packages.

**Trust boundary:** These packages are mostly trust-boundary-neutral pure libraries; enforcement lives upstream. The live boundary controls are resolveAutoModeModel's TIER_POLICIES + usOnly slot walking in packages/types, and the api-gateway requireManagedComputeEligibility / managedComputeGate middleware on the providerStream route. The one boundary HAZARD inside this area is fallback.ts crossProviderFallback, which would happily select managed_cloud/ollama/lmstudio targets with no tier scoping — currently safe only because the function is unwired. The Ollama and LM Studio adapters default to http://localhost:11434 / local hosts (correct Local boundary) but accept an arbitrary baseUrl override with no localhost/LAN guard, so a misconfigured baseUrl could send 'Local' traffic off-box; that is a config-time concern, not a silent cross-boundary route.

**Key files:**

- `packages/routing/src/three-tier-router.ts` — Headline promo/deprecation-aware router (resolveThreeTierModel) with DeepSeek V4-Pro promo cutoff + Kimi-K2 death reroute logic. ENTIRELY UNUSED in production — zero callers; the live path uses resolveAutoModeModel instead.
- `packages/routing/src/classify.ts` — Heuristic task classifier + estimateTokens. This IS consumed (desktop, web). Contains a tokenizer-drift inconsistency vs the catalog (hardcoded 1.18 for Opus 4.7 vs 1.35 in models.json).
- `packages/llm-runtime/src/retry.ts` — withRetry generator (exp backoff, Retry-After, context-overflow max_tokens shrink, fallback escalation). Well-built and tested but has ZERO production consumers.
- `packages/llm-runtime/src/fallback.ts` — buildFallbackChain (same-provider/economy/cross-provider). Unused in production; crossProviderFallback's provider list includes managed_cloud, ollama, lmstudio with no trust-boundary filter.
- `packages/llm-runtime/src/gateway.ts` — detectGateway + gatewayEnforcesUserSideLimits. Exported, documented as feeding the retry generator's 429-vs-fallback decision, but has ZERO consumers — gateway-aware retry is not implemented.
- `packages/llm-runtime/src/errors.ts` — 16-branch classifyError + parseContextOverflow. Genuinely consumed by every adapter and the api-gateway. Branch ordering puts generic 'timeout' substring match before 429/529 status checks.
- `packages/llm-runtime/src/watchdog.ts` — withStreamIdleWatchdog (90s per-chunk idle timeout). The one runtime primitive actually wired into all 8 adapters. EmptyStreamError exported here is unused.
- `packages/providers/anthropic/src/index.ts` — Representative adapter: uses watchdog + classifyError but NOT withRetry — single-shot stream, no retry/fallback on transient failures.
- `packages/providers/openai/src/index.ts` — Most complex adapter: dual Responses-API vs Chat-Completions routing via shouldUseOpenAIResponsesApi + compat detection; catalog merges /models list with curated metadata.
- `packages/llm-normalize/src/anthropic-payload-policy.ts` — cache_control + service_tier policy; AUDIT-FIX hardened Vertex hostname regex. Pure, consumed by anthropic adapter.
- `apps/desktop/src/lib/modelRouter.ts` — Live desktop router — delegates classification to packages/routing but does model selection via resolveAutoModeModel + benchmark pool ranking, bypassing the packages/routing three-tier router entirely.

**Risks:**

- 🟠 P1 Entire retry/fallback state machine is unwired shelf-ware (`packages/llm-runtime/src/retry.ts`) — withRetry, buildFallbackChain, createRetryContext, and FallbackTriggeredError have zero production consumers (verified by grep across apps/packages/services — only the index re-export references them). Every adapter (anthropic/openai/google/ollama/etc.) and the api-gateway providerStream route do single-shot streaming: on a transient 529/503/connection drop or StreamIdleTimeoutError they emit one error chunk and stop. No automatic retry, no model fallback, no context-overflow max_tokens shrink ever fires on a real user request. The package README explicitly claims 'each adapter wraps its stream() body in withRetry' — it does not. This is the core resilience promise of the area, built and tested but not connected to any user path.
- 🟠 P1 resolveThreeTierModel (promo/deprecation auto-reroute) is dead code; live router has no promo/deprecation safety (`packages/routing/src/three-tier-router.ts`) — The file's entire reason for existing — auto-rerouting DeepSeek V4-Pro after its 2026-05-31T15:59:00Z promo cutoff and guarding against Kimi-K2 family deprecation — is never invoked. grep confirms resolveThreeTierModel/isPromoExpired/isDeprecated/effectiveInputPrice have zero production callers. Both web and desktop resolve models through resolveAutoModeModel (packages/types model-catalog.ts), which is a pure task→slot→model map with NO promo-expiry or deprecation awareness. So the documented protection against routing users to an expired-promo-priced or deprecated model is not enforced anywhere live.
- 🟡 P2 gateway-aware 429 handling claimed but not implemented (`packages/llm-runtime/src/gateway.ts`) — detectGateway + gatewayEnforcesUserSideLimits are documented as letting the retry generator avoid a model fallback on a Helicone/LiteLLM/Portkey 429 (user-side limit, same on next model). Both functions have zero consumers. If/when withRetry is wired, a gateway 429 would still escalate to a fallback model after the overload threshold — exactly the wrong behaviour the module was written to prevent.
- 🟡 P2 crossProviderFallback can cross the Local/BYOK→Managed trust boundary (`packages/llm-runtime/src/fallback.ts`) — crossProviderFallback iterates a provider list that includes 'managed_cloud', 'ollama', and 'lmstudio' with no trust-boundary parameter or filter. If wired, a BYOK or Local request hitting a provider outage could be silently rerouted to a managed_cloud model, violating the LOCKED rule 'Never silently route Local chats/files/sessions to BYOK or managed cloud.' Latent (unwired today) but a direct trap for whoever connects it; the function signature offers no way to scope candidates to the originating trust tier.
- 🟡 P2 classifyError matches 'timeout' substring before 429/529 status (`packages/llm-runtime/src/errors.ts`) — Branch 1 (line 359) returns category api_timeout for any message containing 'timeout' BEFORE the overload (Branch 2) and rate-limit (Branch 3) status checks run. A 429/529 error whose body text contains 'timeout' is misclassified as api_timeout — which is retryable but NOT fallbackable and drops the rate_limit/server_overload semantics (and the consecutive-overload counter never increments). Low frequency but a genuine ordering bug in the one classifier that IS on the live path.
- ⚪ P3 Opus-4.7 tokenizer inflation differs between classifier and catalog (`packages/routing/src/classify.ts`) — classify.ts hardcodes TOKENS_PER_CHAR_CLAUDE_OPUS_4_7 = (1/3.5)\*1.18 (18%) while models.json stores tokenizer_drift_factor: 0.35 (35%) and three-tier-router.ts/docs reference 1.0x–1.35x. estimateTokens (consumed live for the >50K long_context guard) therefore under-estimates Opus 4.7 tokens by ~13 points vs the catalog's own figure, so long-context routing can trip late. Two sources of truth for the same constant.
- ⚪ P3 effectiveInputPrice/OutputPrice silently return 0 for unknown model IDs (`packages/routing/src/three-tier-router.ts`) — For a missing catalog entry, isDeprecated returns true (treats as deprecated) but effectiveInputPrice/OutputPrice return 0 (treats as free). Inconsistent unknown-model handling; if any future cost-estimation caller passes an alias not in models.json it would compute $0 cost. Currently unused so no live impact.

**Gaps:**

- packages/llm-runtime: withRetry, buildFallbackChain, createRetryContext, FallbackTriggeredError, detectGateway, gatewayEnforcesUserSideLimits, and EmptyStreamError are all exported, documented, and unit-tested but have NO production consumers — a large, polished but unwired subsystem. Adapters only use withStreamIdleWatchdog + classifyError.
- packages/routing: resolveThreeTierModel and the whole promo-expiry/deprecation price+reroute apparatus (isPromoExpired, isDeprecated, effectiveInputPrice, effectiveOutputPrice, tokenizerDriftFactor, ESTIMATE_INFLATION) are dead — the live model picker is resolveAutoModeModel in packages/types, which lacks these guards.
- CacheIntent / CacheObservation schemas are referenced in project MEMORY.md as the 'canonical app contract' of @agiworkforce/llm-normalize, but grep finds them nowhere in the codebase (.ts or .rs). The normalize package's index.ts exports payload-policy helpers only — the cache-intent contract does not exist.
- EmptyStreamError and its documented non-streaming-fallback policy (no_message_start / started_but_no_completion) are not implemented by any adapter — adapters never count message_start events or trigger a non-streaming retry.
- lmstudio adapter is the thinnest (single src/index.ts, no separate translate/stream/catalog modules unlike the other providers) — likely a partial/stub adapter relative to its siblings.
- Two divergent task taxonomies coexist: the canonical 11-value RoutingTaskType (packages/routing) and desktop's 5-value TaskType, bridged by a lossy ROUTING_TYPE_TO_TASK_TYPE map (e.g. long_context/simple_chat/creative_writing/research all collapse to 'general'), so desktop's benchmark routing cannot distinguish those lanes.

**Hardening opportunities:**

- Wire withRetry + buildFallbackChain into the adapter stream() bodies (or into the api-gateway providerStream loop) so transient 529/503/connection drops and StreamIdleTimeoutError actually retry/fallback instead of dying on first error — or delete the unused modules to stop them rotting and giving a false sense of resilience.
- If the three-tier promo router is the intended policy, route the live path through resolveThreeTierModel (or fold its promo-expiry + deprecation guards into resolveAutoModeModel); otherwise remove three-tier-router.ts to avoid two competing routers.
- Add a trust-tier parameter to buildFallbackChain/crossProviderFallback and exclude managed_cloud/ollama/lmstudio unless the originating request is already in that boundary, BEFORE any caller wires it.
- Reorder classifyError so HTTP-status branches (429/529/503) are checked before the generic 'timeout' substring match.
- Unify the Opus-4.7 tokenizer-drift constant: have estimateTokens read tokenizer_drift_factor from models.json instead of the hardcoded 1.18, eliminating the second source of truth.
- Either implement the EmptyStreamError non-streaming fallback in adapters or drop the export.
- Reconcile MEMORY.md's CacheIntent/CacheObservation claim with reality — either build the schemas or correct the doc/lock that calls them the canonical contract.
- Add a localhost/LAN guard or explicit user-consent step when an Ollama/LM Studio baseUrl override points off-box, to keep 'Local' genuinely local.

**Open questions:**

- Is the llm-runtime retry/fallback/gateway subsystem intended to be wired into a future orchestration layer (the README lists target consumers in apps/web/api/llm and apps/desktop/src-tauri/src/llm that don't yet call it), or is it abandoned in favor of per-surface ad-hoc retry (e.g. apps/desktop/src/utils/ipc.ts has its own withRetry)?
- Which router is canonical going forward — packages/routing/resolveThreeTierModel or packages/types/resolveAutoModeModel? The PRD lock #24 promo logic only exists in the former, but only the latter is called.
- Where (if anywhere) is the CacheIntent/CacheObservation contract supposed to live — was it renamed, deferred, or never built?
- Does the api-gateway providerStream route ever need retry/fallback, or is single-shot-plus-classify the deliberate server contract (pushing retry to clients)?

### pkg-runtime-chat (packages/runtime, unified-chat, api, stores, utils, compliance)

**Purpose:** These six packages are the cross-surface shared layer for AGI Workforce: runtime detection + capability-aware command dispatch, a canonical central-state store, offline/priority send queues (runtime); the chat UI component library, stores, hooks, and the heuristic auto-router (unified-chat); typed wrappers over ~1000 Tauri commands (api); EU AI Act / Apple compliance gates (compliance); and secret-redaction, privacy-handoff, retry/format helpers (utils). They are meant to let desktop, web, mobile, CLI and extensions share streaming chat, routing, queueing, and trust-boundary logic without copy-paste.

**Architecture:** Control flow centers on packages/runtime/src/command.ts: every Tauri command routes through command(name,args) which branches on detect.ts (isTauri/isTest/isCloudWeb). Desktop calls Tauri invoke(); web resolves a tier via registry.ts (prefix-match → cloud/desktop-preferred/desktop-only, default desktop-only) and either routeToCloud() (http.ts, POST /command with a localStorage bearer token) or throws DesktopRequiredError. packages/api/\* are thin typed facades over command(). Chat streaming: unified-chat/hooks/useChat consumes a per-surface ChatRuntime (lib/runtime.ts) implementation, drives a Zustand chatStore reducer over StreamEvents (content/thinking/tool_call/tool_result/artifact/search/done/error), and resolves model IDs via promptClassifier (zero-LLM heuristic → RoutingSlot → models.json). A separate central-state design (state/createStore + state/onChangeAppState + singleton appStateStore) is intended as the cross-surface source of truth with a 4-channel side-effect fan-out (api-cache, telemetry, persistence, model-switch) and an MAX_FANOUT_DEPTH re-entrancy guard. Offline support is two injectable factories (createOfflineQueue + createOfflineSyncManager) bound per-surface; the priority send pipeline (messageQueueManager, 3 lanes now>next>later, FIFO, AbortSignal, persistence of non-now lanes) is wrapped by unified-chat/queue/sendQueue. Compliance is dependency-free pure functions: assertLlmGate composes isDisclosureSatisfied (Article 50) + isProviderRoutingAllowed (fail-closed CN-HQ opt-in). Trust-boundary handoff (utils/privacyHandoff) builds a secret-redacted, checksummed Local→BYOK draft requiring explicit consent. Browser primitives (window/localStorage/navigator) are injected via adapter options so everything is Node-testable. agentContext (AsyncLocalStorage) is split into the runtime/node subpath to keep node:async_hooks out of web/mobile bundles.

**Trust boundary:** Local/BYOK/Managed-cloud separation is encoded but only partially enforced in this layer. The clean primitives: registry.ts tiers commands and fails closed to desktop-only for unknowns; provider-jurisdiction.isProviderRoutingAllowed fails closed (deny on missing consent) for CN-HQ providers; privacyHandoff produces a redacted+checksummed Local→BYOK draft with consentRequired=true and a secret-scan block flag — matching the lock that Local→BYOK must be an explicit consented fork with payload preview and secret scan. The connectorPermissionStore correctly splits Local (Tauri encrypted vault) vs Cloud (Neon table). The gaps: the Article 50 + CN-HQ assertLlmGate is wired only on mobile (web/desktop bypass it via their own LLM stacks), and the shared cloud transport (http.ts) is not auth-wired to canonical state. Per the v1-local-only lock, cloud is waitlist-gated, so these are latent rather than active leaks today, but the shared enforcement is inconsistent across surfaces and the doc comments overstate web coverage.

**Key files:**

- `packages/runtime/src/command.ts` — Universal capability-aware dispatcher: Tauri invoke vs routeToCloud vs DesktopRequiredError
- `packages/runtime/src/registry.ts` — Prefix→tier classification; security-relevant default = desktop-only for unknown commands
- `packages/runtime/src/http.ts` — Cloud transport; reads bearer token from localStorage 'agi-auth-token' (not from canonical auth state)
- `packages/runtime/src/state/onChangeAppState.ts` — 4-channel fan-out choke-point; registrars are empty (no consumers register them)
- `packages/runtime/src/state/index.ts` — Module-level singleton appStateStore wired with onChangeAppState
- `packages/runtime/src/queue/messageQueueManager.ts` — Race-hardened 3-lane priority send queue; well-tested, but bypassed by useChat
- `packages/runtime/src/offline-queue/index.ts` — Offline msg/tool queue with backoff; per-item read-modify-write storage during sync
- `packages/unified-chat/src/hooks/useChat.ts` — Stream-event reducer into chatStore + send pipeline + auto-routing; enqueues then immediately drains the queue
- `packages/unified-chat/src/lib/promptClassifier.ts` — Zero-LLM heuristic auto-router; English-keyword + token-count → RoutingSlot → models.json
- `packages/unified-chat/src/lib/artifact-sandbox.ts` — Shared iframe CSP/sandbox for artifact previews (allow-scripts allow-modals, connect-src none)
- `packages/unified-chat/src/lib/connectorPermissionStore.ts` — Hybrid connector tool-permission store: local Tauri vault vs cloud Neon table
- `packages/compliance/src/llm-gate.ts` — assertLlmGate: Article 50 disclosure + CN-HQ consent; wired only on mobile
- `packages/compliance/src/provider-jurisdiction.ts` — Fail-closed default-off CN-HQ provider list (deepseek/moonshot/qwen/zhipu)
- `packages/utils/src/privacyHandoff.ts` — Builds redacted, checksummed Local→BYOK handoff draft requiring consent
- `packages/utils/src/logger.ts` — Secret-redaction pattern bank (Anthropic/OpenAI/AWS/Stripe/JWT/etc.) used by privacyHandoff
- `apps/desktop/src/stores/bridge/stateBridge.ts` — Only writer of appStateStore; its initStateBridges() has ZERO callers
- `packages/stores/src/index.ts` — Empty placeholder package — exports nothing; declared as dep by web+desktop but unused

**Risks:**

- 🟡 P2 Central AppState subsystem (appStateStore + onChangeAppState fan-out + stateBridge) is unwired at runtime (`packages/runtime/src/state/index.ts`) — appStateStore is only ever written by apps/desktop/src/stores/bridge/stateBridge.ts, whose initStateBridges()/bridge\*() functions have zero callers anywhere in apps or packages (verified by grep). The 4 fan-out registrars (registerApiCacheInvalidator/Telemetry/Persistence/ModelSwitch) are also never called outside the package's own tests, so each fan-out channel loops over an empty Set. The persistence 'migration sketch' in AppStateStore.ts is explicitly deferred. Net: an elaborate, well-documented, well-tested central-state + side-effect architecture exists but is dead code in production — no surface initializes it, so it is neither the source of truth nor producing any side effects.
- 🟡 P2 Compliance LLM gate enforced only on mobile; web integration referenced in docs does not exist (`packages/compliance/src/llm-gate.ts`) — llm-gate.ts documents a web integration at apps/web/features/chat/lib/chatClient.ts, but that file is absent (only localByokHandoff.ts is there) and the only assertLlmGate/isLlmGateOpen callers are under apps/mobile. The web LLM path (apps/web/core/ai/llm/unified-language-model.ts) instantiates deepseek/qwen providers directly with no Article 50 / CN-HQ jurisdiction gate. Web/cloud is waitlist-gated per the locks so it may be acceptable today, but the shared compliance primitive is not enforced on web/desktop and the doc comment is fabricated/stale.
- 🟡 P2 routeToCloud auth token source is divorced from canonical auth state (`packages/runtime/src/http.ts`) — http.ts getAuthToken() reads localStorage 'agi-auth-token', but the canonical AuthState.accessToken lives in appStateStore / the desktop auth Zustand store, and no code path writes that exact localStorage key (no producer found). Cloud-routed commands via command()/routeToCloud would therefore send no Authorization header on web as shipped. Masked today because web uses its own apps/web/core stack instead of command(), but the shared transport's auth wiring is incorrect.
- 🟡 P2 useChat routes through the priority queue then immediately drains it — backpressure/cancel unrealized (`packages/unified-chat/src/hooks/useChat.ts`) — sendMessage enqueue()s then dequeue()s on the next line with no scheduling and no AbortSignal, so lane-cap backpressure only guards against >100 synchronous sends and the cancellation path is never exercised on the primary chat surface. The robust, well-tested messageQueueManager is reduced to a pass-through (comment admits 'Drain immediately — current behavior is direct send').
- 🟡 P2 offline-queue sync does O(n) full read-modify-write storage passes and can lose concurrent enqueues (`packages/runtime/src/offline-queue/index.ts`) — syncOfflineQueue() loads one snapshot, then per item calls clearQueuedMessage/incrementMessageRetry, each doing its own loadQueue()+saveQueue() of the entire blob. An enqueue during sync (also whole-blob read-modify-write) can be clobbered by the next clear's stale-snapshot write. Correct for small queues; lost-write/perf hazard under load. Not a crash.
- ⚪ P3 Artifact sandbox CSP permits unsafe-inline + unsafe-eval scripts (`packages/unified-chat/src/lib/artifact-sandbox.ts`) — artifact-sandbox.ts uses script-src 'unsafe-inline' 'unsafe-eval' with sandbox='allow-scripts allow-modals'. Intended for live HTML/React previews and currently contained by connect-src 'none', frame-src 'none', object-src 'none', no allow-same-origin, and no-referrer. Residual XSS-in-sandbox surface that would become dangerous if a future change adds allow-same-origin or relaxes connect-src.
- ⚪ P3 Auto-router and mode system prompts are English-only heuristics (`packages/unified-chat/src/lib/promptClassifier.ts`) — promptClassifier regex banks + chatStore MODE_SYSTEM_PROMPTS are English-only and token estimate is chars/4 (English assumption). Non-English prompts fall through to general/simple_chat and may route to weaker models — a quality gap given the India-first GTM in the locks. No correctness/security impact.

**Gaps:**

- packages/stores is an empty shell: src/index.ts exports nothing (only commented examples), yet apps/web and apps/desktop declare it as a workspace:\* dependency. Pure placeholder.
- Central state: appStateStore + onChangeAppState + the entire stateBridge (initStateBridges, 12 bridge functions) are implemented and tested but never initialized — no startup call site exists in any surface.
- onChangeAppState fan-out channels (api-cache invalidation, telemetry, settings persistence, model-switch broadcast) have no registered handlers anywhere; they fire into empty registries.
- AppStateStore persistence is an explicit 'migration sketch' / deferred — no concrete persistenceHandler is registered for desktop/web/mobile/CLI as the doc describes.
- compliance llm-gate web integration (apps/web/features/chat/lib/chatClient.ts) referenced in the source doc comment does not exist; gate is mobile-only.
- routeToCloud cloud-command auth token ('agi-auth-token' localStorage key) has no producer found in the repo, so cloud command auth via the shared transport is effectively unwired.
- ChatInterface (the legacy unified-chat top-level orchestrator) is documented as superseded and retained only for unmigrated consumers — slated for removal in lockstep with components/ChatInterface.tsx.
- reestablishContextInWorker in agentContext.ts is intentionally a documentation-only no-op pass-through (acknowledged in comments), not a functional worker re-seed mechanism.

**Hardening opportunities:**

- Either wire initStateBridges() at each surface startup and register at least one persistence/telemetry handler, or delete the appStateStore/onChangeAppState/stateBridge subsystem to remove dead, misleading 'source of truth' machinery.
- Remove the empty @agiworkforce/stores package or its workspace dependency declarations to avoid implying shared stores that don't exist.
- Make the compliance assertLlmGate a mandatory choke-point in the shared chat send path (or in packages/api chat.ts) so web/desktop cannot route to CN-HQ providers without disclosure+consent, instead of relying on each surface to remember.
- Fix routeToCloud to source the auth token from the canonical auth state (or document and enforce who writes 'agi-auth-token'), and add a test that the Authorization header is present for cloud-tier commands.
- Either realize the send-queue's deferred-send/cancellation semantics in useChat or simplify the call site so the queue isn't dead weight on the primary path.
- Batch offline-queue sync mutations into a single load→mutate→save (or pass the working snapshot through) to avoid O(n) storage passes and the concurrent-enqueue lost-write race.
- Add a guard/lint that the artifact-sandbox CSP never gains allow-same-origin or a non-'none' connect-src without review.

**Open questions:**

- Is the appStateStore/stateBridge central-state design intended to ship (and just not yet wired), or is it abandoned scaffolding? The amount of tested, documented dead code suggests an in-progress migration that stalled.
- What component is supposed to write the 'agi-auth-token' localStorage key that http.ts depends on for cloud command auth?
- Given the v1-local-only/cloud-waitlist lock, is the absence of the compliance gate on web/desktop an accepted deferral until cloud graduates, or an oversight? The fabricated chatClient.ts doc comment suggests it was assumed wired.
- Does any surface actually consume the runtime command()/routeToCloud cloud path today, or is it dormant until cloud launch (web uses apps/web/core/ai/llm instead)?

### data-persistence

**Purpose:** The hosted data-persistence boundary for AGI Workforce: a vendor-neutral `@agiworkforce/data-layer` package (DatabaseAdapter / AuthAdapter / StorageAdapter / RealtimeAdapter interfaces) plus the canonical Neon Postgres schema in `apps/web/db/neon/`. It backs all cloud account data (web chat, subscriptions, credits, teams, devices, waitlists) on Neon Postgres with Clerk for identity. The product is mid-migration from Supabase to Neon+Clerk; legacy Supabase migrations are still git-tracked but no longer the source of truth.

**Architecture:** Two layers. (1) The shared `packages/data-layer` package exposes vendor-neutral interfaces in `types.ts` and a `factory.ts` that reads env (`AGI_DATABASE_PROVIDER` default `neon`, `AGI_AUTH_PROVIDER` default `clerk`) and returns a concrete adapter. Only Neon (DB) and Clerk (auth) are implemented; `postgres` is a documented `NotImplementedError` skeleton; storage/realtime fail closed with `DataLayerConfigError`. `NeonDatabaseAdapter` wraps `@neondatabase/serverless` `Pool`, lazy-connects on first use, supports query/execute/transaction, and a `withUser(jwt)` that decodes (NOT verifies) the JWT `sub` and is meant to bind it as a session GUC for RLS. `ClerkAuthAdapter` verifies session JWTs via `@clerk/backend` `verifyToken`. (2) The web app consumes this via `apps/web/lib/server/neon-db.ts` (a process-singleton unscoped service adapter) and `neon-chat.ts`. CRITICAL: the web app never calls `withUser()` — it gets `userId` from Clerk `auth()`/`getClerkAuthUser()` and passes it as a `WHERE user_id = $n` predicate in raw SQL at every route. Tenant isolation is therefore 100% application-enforced, not DB-enforced. The 31 Neon migrations (`0001`..`0031`) define a flat `public.*` schema keyed on `user_id text` (Clerk IDs, no FK to an auth table for most), with idempotency tables for Stripe, a large PL/pgSQL function port (`0020_functions.sql`) where `auth.uid()` was deliberately replaced by `p_user_id` params and authorization moved to privileged API routes. There is no migration RUNNER in-repo; migrations are applied out-of-band (Neon CLI), with only `scripts/check-neon-migrations.mjs` validating naming and forbidding the legacy `supabase/` dirs.

**Trust boundary:** This area is the Managed-cloud trust boundary only (Neon + Clerk hosted account data); Local and BYOK do not touch it (the desktop has its own SQLite store under apps/desktop/src-tauri/migrations). The intended boundary design was DB-enforced per-user RLS via Clerk-JWT GUC binding, but that was abandoned in the Neon port: isolation is now purely application-enforced (Clerk auth() -> userId -> WHERE user_id = $n) with privileged API routes calling SECURITY-relevant PL/pgSQL functions that take p_user_id params and do NO internal authz. Service-context operations (Stripe webhooks, cron) correctly use the unscoped adapter by design. The waitlist email handling flip-flopped (0026 hashed emails, 0027 restored plaintext for invite/notification ops) — a documented product decision, not a defect, but worth noting plaintext PII is now stored in cloud_managed_waitlist.

**Key files:**

- `packages/data-layer/src/adapters/neon.ts` — Neon DatabaseAdapter; pool mgmt, withUser/RLS GUC binding, transactions. Contains the invalid SET LOCAL = $1 bug and the unverified-JWT decode path.
- `packages/data-layer/src/adapters/clerk.ts` — Clerk AuthAdapter; verifyJwt via @clerk/backend, refreshToken is NotImplementedError.
- `packages/data-layer/src/adapters/postgres.ts` — Raw pg adapter — pure skeleton, every method throws NotImplementedError (documented as such).
- `packages/data-layer/src/factory.ts` — Provider selection from env/opts; neon+clerk implemented, storage/realtime/auth0/cognito fail closed.
- `packages/data-layer/src/types.ts` — Vendor-neutral interface contracts; still documents the DB as 'RLS-aware via withUser()' / auth.uid() — now fiction.
- `apps/web/lib/server/neon-db.ts` — Process-singleton UNSCOPED Neon adapter used by all web routes (never withUser).
- `apps/web/db/neon/0001_mvp_chat.sql` — web_conversations/web_messages schema; messages keyed by conversation_id (no session_id, no RLS).
- `apps/web/db/neon/0020_functions.sql` — PL/pgSQL port; auth.uid() removed in favor of p_user_id params, authorization caller-enforced.
- `apps/web/db/neon/0012_stripe.sql` — processed_stripe_events + credit_idempotency_keys idempotency tables.
- `apps/web/core/storage/chat/multi-agent-chat-database.ts` — Queries phantom columns/tables (web_messages.session_id, conversation_metadata, collaborations) that do not exist in the Neon schema.
- `scripts/check-neon-migrations.mjs` — CI guard: validates migration naming and forbids supabase/ and apps/web/supabase/ dirs from existing.
- `apps/web/db/neon/0019_identity_bridge_retired.sql` — No-op marker; identity bridge retired, Clerk IDs stored directly as text.

**Risks:**

- 🟠 P1 data-layer's documented RLS isolation layer is unwired, unenforceable, AND would emit invalid SQL if used (`packages/data-layer/src/adapters/neon.ts`) — types.ts/neon.ts extensively advertise the adapter as 'RLS-aware via withUser()' with policies reading current_setting('request.jwt.claim.sub'). But (a) ZERO neon migrations contain ENABLE ROW LEVEL SECURITY / CREATE POLICY / current_setting — no policy reads the GUC; (b) withUser() is never called anywhere in app/service code (only in JSDoc); (c) the binding statement `SET LOCAL request.jwt.claim.sub = $1` is invalid Postgres — SET/SET LOCAL cannot take a bind parameter, it would throw a syntax error. The unit tests pass only because the mock Pool accepts any SQL string, so the test validates the wrong thing. Not a live crash (dead code), but a fabricated security posture: anyone trusting the docs would believe DB-level tenant isolation exists when it does not.
- 🟠 P1 Tenant isolation depends entirely on hand-written WHERE user_id = $n in every route; one omission = cross-tenant leak (`apps/web/lib/server/neon-db.ts`) — All web routes use the unscoped getNeonDb() singleton and must manually scope every query. Audited chat routes do this correctly (ownership SELECT on web_conversations by user_id, then conversation_id-scoped message access). But there is no DB-level backstop (no RLS), so a single missing predicate on any user-owned table is a silent cross-tenant read/write. This is a structural fragility, not a confirmed live breach in the routes I sampled.
- 🟡 P2 multi-agent-chat-database.ts queries phantom columns/tables not present in the Neon schema (`apps/web/core/storage/chat/multi-agent-chat-database.ts`) — Line 221 queries `web_messages WHERE session_id = $1` but web_messages (0001) has no session_id column (it is conversation_id); lines 209/197 query conversation_metadata and collaborations tables that exist in NO neon migration. All are wrapped in try/catch so they log an error and silently degrade (message_count defaults to 0, metadata to {}), masking a real schema/code drift — message counts and metadata are always wrong, not erroring.
- 🟡 P2 check:neon-migrations CI guard currently fails: it forbids apps/web/supabase/ which still holds 50 git-tracked legacy migrations (`scripts/check-neon-migrations.mjs`) — Lines 34-39 assert supabase/ and apps/web/supabase/ must not exist, but git tracks ~50 files under apps/web/supabase/migrations (e.g. 20260105000000_optimize_rls_policies.sql). pnpm check:neon-migrations (part of check:llm-operability) would exit 1 until the in-flight migration deletes them. This is expected migration churn but the guard and tree are currently inconsistent.
- ⚪ P3 Neon withUser() decodes JWT sub WITHOUT verifying signature (`packages/data-layer/src/adapters/neon.ts`) — decodeJwtSub() base64-decodes the middle segment and trusts `sub`. The contract delegates verification to the AuthAdapter 'before withUser', but since withUser is unused this is latent; if ever wired without a prior verifyJwt() it would bind an attacker-controlled sub. Documented, but a foot-gun.

**Gaps:**

- PostgresDatabaseAdapter is a pure skeleton — every method throws NotImplementedError (honestly documented as such); the only real DB adapter is Neon.
- createStorageClient (s3/r2/b2) and createRealtimeClient (pusher/ably/self-hosted) have no implementations — all throw DataLayerConfigError (intentional fail-closed).
- createAuthClient auth0/cognito branches throw — only Clerk is implemented.
- ClerkAuthAdapter.refreshToken is NotImplementedError (delegated to Clerk middleware/native SDK).
- No in-repo migration runner: 31 Neon migrations are apply-by-hand (Neon CLI); only naming/forbidden-dir validation exists in scripts/check-neon-migrations.mjs. No applied-migration tracking table is defined in the schema.
- RLS was present in the legacy Supabase schema but was deliberately dropped in the Neon port (0020 replaced auth.uid() with caller-enforced p_user_id); the data-layer docs/types were not updated to reflect this, so they still describe RLS as the isolation mechanism.
- conversation_metadata / collaborations / agent-collaboration tables referenced by core/storage code have no corresponding Neon migration — either unmigrated features or dead code.

**Hardening opportunities:**

- Either implement DB-level RLS (ENABLE ROW LEVEL SECURITY + policies reading current_setting) and fix withUser to use set_config('request.jwt.claim.sub',$1,true), OR remove the withUser/RLS machinery and all RLS-aware claims from types.ts/neon.ts/README so the docs match the app-enforced reality. The current state is the worst of both: dead code + false security documentation.
- Fix the neon-adapter unit test mock to reject SQL that isn't valid (or at least assert the set_config form) so the SET LOCAL = $1 syntax bug cannot pass CI again.
- Add a lint/CI check that every SQL touching a user-owned table (web_conversations, user_projects, subscriptions, api_keys, etc.) includes a user_id predicate, since DB has no RLS backstop.
- Reconcile multi-agent-chat-database.ts with the schema: add the missing conversation_metadata/collaborations migrations or delete the dead queries; replace web_messages.session_id with conversation_id.
- Stop swallowing schema errors in try/catch with console.error + default values (multi-agent-chat-database) — fail loudly on missing tables/columns so drift is caught.
- Add an applied-migrations tracking table + a real runner (or adopt a migration tool) instead of apply-by-hand; today there is no record of which of 0001..0031 have run against a given Neon DB.
- Resolve the check:neon-migrations vs apps/web/supabase inconsistency before merging the migration (the guard already fails).

**Open questions:**

- Is the Supabase->Neon migration intended to keep RLS at all, or is app-enforced isolation the permanent design? If permanent, the data-layer RLS contract must be rewritten.
- Are conversation_metadata / collaborations tables planned features (need migrations) or dead code to remove?
- How are the 31 Neon migrations actually applied in CI/CD and prod (no runner in repo)? Is there idempotency/ordering tracking?
- Will the legacy apps/web/supabase/migrations (50 files) be deleted as part of the in-flight migration, and is the check:neon-migrations guard expected to gate that deletion?
- Is storing plaintext waitlist emails (0027 reversal of 0026 hashing) compatible with the stated 'managed cloud stays waitlist/private beta until retention/deletion controls are proven' rule?

### services-backend (services/api-gateway, services/signaling-server)

**Purpose:** Two deployable Node/Express server boundaries. api-gateway is the cloud control plane for mobile/desktop companion flows: device-code auth, cloud-chat + LLM proxy (managed-cloud, gated behind a private-beta flag), credits/usage, enterprise admin reads, an outbound-worker direction-inversion protocol (CLI/desktop/mobile register and long-poll for work units), and a WebSocket fan-out bridge. signaling-server is a stateless WebRTC pairing/relay for desktop<->mobile, persisting only ephemeral pairing codes in Neon. Both sit on the Managed-cloud trust boundary; Local/BYOK traffic is meant to flow through the desktop, not here.

**Architecture:** api-gateway: src/index.ts wires helmet/CORS/CSRF + body limits, then mounts ~15 routers under /api/\* and the worker protocol at /. authenticateToken (middleware/auth.ts) verifies either a gateway-issued HS256 JWT (issuer agiworkforce-api-gateway) or a Clerk token, then does a per-jti revocation check (revoked_jwts) and an account_status kill-switch check, both fail-closed with short-TTL in-memory caches. managedComputeGate fails closed unless AGI_MANAGED_COMPUTE_PRIVATE_BETA=1 + a beta header; planGate gates cloud models by subscription tier. All DB access goes through lib/neonClients.ts — a hand-rolled Supabase-API-compatible query builder (.from().select().eq()...single()) over @neondatabase/serverless, with assertIdentifier/assertColumnList allowlisting to prevent SQLi. The worker protocol (worker/registration|assignment|heartbeat) uses a 4-tier auth ladder: OAuth Bearer JWT (register), SHA256(secret+JWT_SECRET) environment_secret (poll/stop/worker-heartbeat), and a base64-JSON 'session_ingress_token' (ack/complete/work-heartbeat). A 60s background sweep marks stale workers offline and reassigns work. websocket.ts authenticates over WS via the same JWT, verifies device ownership, and fans out command/sync messages to a user's other devices with strict zod payload allowlists. signaling-server/index.ts is a single-file hardened WS relay: per-pair HMAC tokens (C2), origin checks, enumeration-safe 404s, rejection-sampled codes, in-memory session map + Neon persistence (db.ts uses parameterized Pool queries), connection-manager.ts caps per-IP connections. Express is 5.2.1, so bare async route handlers that throw AppError are auto-caught by errorHandler (asyncHandler is correctly deprecated/unused).

**Trust boundary:** These services are the Managed-cloud boundary. The managedComputeGate correctly fails closed (denies unless AGI_MANAGED_COMPUTE_PRIVATE_BETA=1 + x-agi-managed-compute-beta header), keeping AGI-held provider keys behind the private-beta gate per the locked product rule. Server-held provider keys are never echoed to clients, and llm.ts has an explicit guardrail comment forbidding forwarding req.headers (which would leak the user JWT) to upstream. resolveProvider in llm.ts only proxies anthropic/openai/google and explicitly 400s BYOK-only providers, pushing them to the desktop BYOK path — so the gateway does not silently relay BYOK traffic. The real boundary weakness is not a Local->Managed leak but the fake-RLS shim: getUserScopedClient gives no per-tenant DB isolation, so tenant separation rests entirely on explicit query filters (currently present everywhere I checked). signaling-server is privacy-minimal (stores only pairing codes/metadata, not chat content) and binds peers with HMAC pair tokens.

**Key files:**

- `services/api-gateway/src/lib/neonClients.ts` — Hand-rolled Supabase-compatible query-builder shim over Neon serverless SQL. getServiceClient = service-role; getUserScopedClient(userId) IGNORES userId and returns the same service client. assertColumnList() collapses any select containing parentheses to SELECT \*.
- `services/api-gateway/src/middleware/auth.ts` — JWT/Clerk verification + fail-closed per-jti revocation and account_status kill-switch with in-memory caches.
- `services/api-gateway/src/worker/assignment.ts` — Work poll/ack/complete/stop. verifySessionIngressToken() validates an UNSIGNED base64-JSON token by comparing env_id/work_id/exp only — forgeable from URL path params.
- `services/api-gateway/src/worker/heartbeat.ts` — Work heartbeat (same unsigned-token check) + reassignStaleWork() sweep.
- `services/api-gateway/src/worker/types.ts` — WorkSecret codec (encodeWorkSecret = plain base64 JSON, no signature) and auth-ladder type docs.
- `services/api-gateway/src/routes/enterprise.ts` — Enterprise admin reads. /organizations uses Supabase embedded-join select syntax that the neon shim cannot honor.
- `services/api-gateway/src/routes/llm.ts` — OpenAI-compatible managed-cloud LLM proxy; resolveProvider catalog-driven; enforcePlanTier via .single().
- `services/api-gateway/src/routes/cloudChat.ts` — Cloud chat CRUD + SSE LLM streaming; ownership verified via explicit user_id checks.
- `services/api-gateway/src/middleware/managedComputeGate.ts` — Fail-closed private-beta gate for AGI-held provider keys.
- `services/api-gateway/src/middleware/rateLimit.ts` — Per-route limits; in-memory MemoryStore unless RATE_LIMIT_REDIS_URL set (P1-23 multi-instance gap).
- `services/api-gateway/src/routes/deviceAuth.ts` — OAuth device-code flow (code/token/approve); approve validates Clerk bearer; mints gateway JWT.
- `services/signaling-server/src/index.ts` — Hardened single-file WebRTC pairing relay with per-pair HMAC tokens, origin checks, enumeration-safe lookups.
- `services/signaling-server/src/db.ts` — Neon Pool, parameterized queries for signaling_sessions; fails closed without NEON_DATABASE_URL.

**Risks:**

- 🟠 P1 Worker protocol Tier-3 'session_ingress_token' is unsigned and forgeable from URL params (`services/api-gateway/src/worker/assignment.ts`) — mintSessionIngressToken / encodeWorkSecret produce base64(JSON) with NO HMAC/signature. verifySessionIngressToken (assignment.ts:88, heartbeat.ts:43) only checks that environment_id/work_id/exp inside the token match the values from the request URL — values the caller already supplies. Anyone who learns a valid (environmentId, workId) pair can mint a token: base64url(JSON.stringify({environment_id,work_id,exp:future})) and ack/complete/heartbeat that work unit. /complete writes attacker-controlled `result` into work_units.payload that the assigning client then trusts. The whole 'Tier 3' layer is cosmetic — ack/complete/heartbeat carry no real credential. Mitigant: env/work IDs are UUIDs (not enumerable), so this is P1 unless an ID is exposed (poll responses, logs). The registration-path mintSessionIngressToken also omits `exp` entirely. Worker protocol is currently mounted in index.ts (lines 135-137).
- 🟠 P1 Enterprise /organizations returns empty list in production (embedded-join collapses to SELECT _) (`services/api-gateway/src/routes/enterprise.ts`) — The list query uses Supabase embedded-relationship syntax `organization:organizations ( id, name, ... )`, but neonClients.assertColumnList() returns '_' for any select string containing '(' or ')'. Verified empirically: the multiline select evaluates to SELECT _, which yields no nested `organization` object, so the route's `.filter(row => row.organization)` drops every row and returns `organizations: []`. The unit test (**tests**/routes/enterprise.test.ts) mocks db.from to hand back a row with a fabricated nested `organization` object, so the test passes while the live Neon path is broken. Durable defect: the neon shim silently degrades any embedded-relationship select to SELECT _ instead of erroring.
- 🟡 P2 getUserScopedClient(userId) ignores userId and returns the service-role client — 'RLS defense-in-depth' comments are false (`services/api-gateway/src/lib/neonClients.ts`) — getUserScopedClient just calls getServiceClient(); it sets no per-request user/session variable, so there is no row-level security in effect. Numerous routes (cloudChat, planGate, credits, llm, enterprise, mobile, sync) carry comments asserting 'RLS enforces the same predicate even if the .eq filter is dropped by a future regression' — that protection does not exist. The explicit `.eq('user_id', userId)` filters and post-fetch `row.user_id !== userId` ownership checks ARE present on every id-based read I audited (mobile/chat/agents/pair/desktop), so there is no current IDOR; but the only tenant guard is the explicit filter, and a future dropped filter would silently leak cross-tenant data. Misleading comments raise the risk a maintainer trusts non-existent RLS.
- 🟡 P2 Plan-tier checks use .single() so users with no subscription row get 503 (fail-closed) instead of a clean free-tier 403 (`services/api-gateway/src/middleware/planGate.ts`) — requireProPlan and llm.ts enforcePlanTier query subscriptions with .single(). neonClients .single() returns an error ('No rows returned') when the user has zero subscription rows, which both handlers treat as a DB failure -> 503 PLAN_CHECK_UNAVAILABLE. A brand-new/free user therefore sees a transient-error 503 (and may retry-loop) rather than the intended 403 upgrade prompt. The `subscription?.plan_tier ?? 'free'` fallback is dead code under .single() semantics — it only runs when error is null, which requires exactly one row.
- 🟡 P2 In-memory rate limiting is per-instance; limits are cosmetic under horizontal scale (`services/api-gateway/src/middleware/rateLimit.ts`) — Without RATE_LIMIT_REDIS_URL/UPSTASH_REDIS_REST_URL the limiter falls back to express-rate-limit MemoryStore, so with N instances behind a load balancer the effective per-user limit is N x max — including the financial credits-deduct (5/min) and llm-completions limits. Self-documented as P1-23 with a startup warning, but the warning only fires on explicit multi-instance hints (FLY_MACHINE_COUNT>1 / NUM_INSTANCES>1 / RATE_LIMIT_MULTI_INSTANCE=1); a plain Fly.io 2-machine HA deploy will not trigger it. Must move to Redis before paid-tier launch.
- ⚪ P3 neonClients .not() operator has inverted mappings for several operators (`services/api-gateway/src/lib/neonClients.ts`) — NeonQueryBuilder.not() maps 'neq'->'=', 'gt'->'<=', 'in'->'!=', etc. The 'in' negation in particular is wrong (NOT IN should expand the array, not become a single '!='). Only one caller exists (chat.ts:272 `.not('conversation_id','is',null)`), which hits the correctly-mapped 'is'->'IS NOT' branch, so no live bug today — but the operator is a latent footgun for future callers.

**Gaps:**

- Worker outbound protocol is wired (mounted in index.ts, has DB-backed tables worker_registrations/work_units) but there is no endpoint that CREATES work_units in this service — workers can only poll/ack/complete units; the producer side appears to live elsewhere or is not yet implemented, so the protocol is half-wired.
- mintSessionIngressToken in registration.ts (the /bridge epoch-bump path) builds a token with iat but NO exp, while assignment.ts mints one with exp; decodeWorkSecret/verify expect exp — the two token shapes are inconsistent.
- Managed-cloud LLM proxy (llm.ts, cloudChat.ts) is gated fail-closed behind AGI_MANAGED_COMPUTE_PRIVATE_BETA and emits best-effort usage_events inserts, but there is no metering/ledger/credit enforcement before the upstream call — credits routes (credits.ts) call deduct RPCs but nothing in the proxy path invokes them, so the 'managed compute stays waitlisted until ledgering is proven' rule is enforced only by the env flag, not by wired billing.
- usage_events / usage_summary inserts are 'fire-and-forget' and swallow all errors at debug level ('table may not exist'), so usage/billing telemetry may silently no-op against the current schema.
- signaling pairTokens are minted and returned by POST /pairings, but delivery of the per-role token to the correct device is delegated to the gateway (routes/mobile.ts) with only a comment — the cross-service contract that the mobile token reaches mobile out-of-band is asserted, not visibly enforced here.

**Hardening opportunities:**

- Sign the worker session_ingress_token (HS256 JWT keyed by JWT_SECRET, or HMAC over a server-side nonce stored on the work_unit row) and verify the signature in assignment.ts/heartbeat.ts; today the token provides zero cryptographic assurance.
- Make neonClients.assertColumnList throw (or the query builder reject) on embedded-relationship select syntax instead of silently degrading to SELECT \*, so migration-era Supabase-join callers fail loudly rather than returning wrong/empty data.
- Replace getUserScopedClient with either a genuinely RLS-bound connection (SET LOCAL app.user_id + RLS policies) or rename it and delete the misleading 'RLS defense-in-depth' comments so maintainers don't trust protection that isn't there.
- Switch plan/tier lookups from .single() to .maybeSingle() so a missing subscription cleanly resolves to 'free' -> 403 upgrade prompt instead of 503.
- Ship the Redis rate-limit store and broaden the multi-instance startup warning (it currently misses default Fly.io HA) before enabling paid tiers.
- Fix or remove the inverted .not() operator mappings in neonClients before a second caller depends on them.
- Wire metering/credit enforcement into the managed LLM proxy path (or keep it strictly gated) before the private beta opens, since usage_events inserts are best-effort and no ledger deduction occurs pre-call.

**Open questions:**

- Where are work_units rows produced? No route in api-gateway inserts pending work_units, so the outbound-worker protocol's producer side is either external or unimplemented — this determines whether the unsigned-token finding is currently reachable in production.
- Is the worker protocol actually enabled in the deployed gateway, or mounted-but-dormant? It is unconditionally mounted in index.ts (no feature flag), unlike managed compute.
- Are there Neon RLS policies defined on conversations/messages/subscriptions/usage_events in the migrations (apps/web/db/neon)? If so, they are inert here because the service connects with a non-RLS role via getServiceClient — worth confirming whether the role bypasses RLS by design.
- Does the gateway's routes/mobile.ts actually forward the signaling per-role pairTokens to the correct device over an authenticated channel, completing the C2 pairing-auth contract that index.ts of signaling-server only documents?

### build-release-ci

**Purpose:** The build-release-CI surface covers the GitHub Actions workflows (PR/main CI, desktop + CLI release pipelines, signaling-server deploy, a PR bot, security-pinning checks), a large suite of Node/Bash guardrail scripts under scripts/ that enforce repo-organization/boundary/hook/agent-context invariants, the Cargo + pnpm workspace config, the install/publish distribution scripts, and the Tauri desktop bundle/updater config. Its job is to gate every change through lint/typecheck/test/clippy/audit + repo-invariant checks, and to build, sign, and publish the Linux desktop AppImage, the cross-platform CLI binaries, and the signaling-server container.

**Architecture:** Two CI entry points run on every PR/push to main: ci.yml (one big serial `check` job: conflict-marker gate, JS+Rust dep audits, lint with --max-warnings=0, hardcoded-model-id gates for TS via ESLint and Rust via check-no-hardcoded-models.sh, hook-fire-site + module-reachability + extension token/cloud-IPC + hardcoded-array gates, typecheck:all, pnpm test, jsdom webview test, advisory Semgrep, package/web builds, then Rust toolchain 1.94.0 with scoped cargo test/clippy for agiworkforce-desktop+agiworkforce-cli, plus IPC-wiring check; fan-out jobs desktop-e2e/clippy-all-features/macos-smoke/windows-smoke all `needs: check`) and repo-operability.yml (runs `pnpm check:llm-operability`, the aggregate of ~18 guardrail scripts incl. check:ci-guardrails/codeowners/neon-migrations/doc-status — these are NOT independently wired into ci.yml but DO run here and in husky pre-push). Guardrail scripts are content-driven assertions: they walk apps/packages/services, parse imports/Rust mod trees, and assert presence of specific doc phrases, canonical type definitions, and file naming. The release layer has three desktop workflows: release-desktop.yml (tag `v*` triggered, Linux-only AppImage build, writes release metadata to Neon via upsert*release, publishes GitHub draft), release.yml (workflow_dispatch-only legacy 3-platform path still wired for APPLE*_ signing), and build-windows-release.yml (manual Windows NSIS build). release-cli.yml builds 6 CLI targets and publishes npm + GH release on `v-cli-_`tags. The Tauri updater (tauri.conf.json) points clients at https://www.agiworkforce.com/api/releases/{target}/{current_version}; that route reads GitHub releases/latest directly, while a sibling /api/releases/check route reads the Neon releases table the workflow populates. Verification: no turbo.json exists — the workspace uses plain`pnpm -r` (the task's mention of turbo.json is a non-existent file).

**Trust boundary:** CI is careful with secrets at the workflow level: TAURI*SIGNING*\* and NEON_DATABASE_URL are ::add-mask::'d before build/use; the release-changelog github-script reads attacker-influenceable commit subjects via env (CHANGELOG) not ${{ }} interpolation, with an explicit comment about the RCE class it prevents; release.yml validates the dispatch version against a strict semver allowlist; the PR bot triggers on issue_comment/review_comment (base-repo context) not pull_request_target, never checks out or runs PR head code, and routes comment bodies through env/API — so there is no obvious CI-secret-exfil path. The Local/BYOK/Managed-cloud product trust boundaries are enforced by guardrail scripts rather than CI runtime: eslint no-restricted-syntax blocks direct cloud DB clients + hardcoded model IDs, the extension `check:no-cloud-ipc` gate enforces v1-local-only cloud gating, and check-no-hardcoded-models.sh covers the Rust side. CI itself does not cross those boundaries.

**Key files:**

- `.github/workflows/ci.yml` — Primary PR/main gate; one serial check job + 4 fan-out jobs (e2e, all-features clippy, macOS/Windows smoke). Contains several documented continue-on-error escape hatches (Semgrep advisory, Windows test load failure).
- `.github/workflows/release-desktop.yml` — Tag-triggered Linux-only desktop release; prepare-release/validate/build-linux/update-database/publish-release. Source of the download_url tag-scheme and hardcoded-changelog issues.
- `.github/workflows/repo-operability.yml` — Runs pnpm check:llm-operability — the only CI home for ~18 guardrail scripts (ci-guardrails, codeowners, neon-migrations, doc-status, service-layer, boundaries, etc.).
- `scripts/check-ci-guardrails.mjs` — Asserts ci.yml/repo-operability.yml/release-cli.yml contain specific step strings; pins the Semgrep-advisory and audit gates in place by text match.
- `scripts/check-agent-context.mjs` — Largest guardrail (450+ lines): validates dozens of required docs, mirrored CLAUDE.md/AGENTS.md critical rules, repo-map/risk-map/lanes/commands JSON shape.
- `scripts/check-boundaries.mjs` — Walks apps/packages/services imports; blocks cross-app imports, packages importing app code, services importing UI packages, and unexported deep imports.
- `scripts/check-no-hardcoded-models.sh` — Narrow Rust model-ID gate: rejects the claude-opus-4-6-mini ghost model and literal FAST*/DEFAULT*\*\_MODEL consts. Deliberately narrow (64-file backlog acknowledged).
- `apps/desktop/src-tauri/tauri.conf.json` — Static version 1.2.0, updater endpoint + pubkey, macOS signing identity, CSP. Version is hand-edited and never bumped by any workflow.
- `scripts/release.sh` — Local macOS .dmg release helper that reads (does not write) tauri.conf.json version; ships a hand-written changelog and pushes a plain v\* tag.
- `apps/web/app/api/releases/[target]/[version]/route.ts` — Live Tauri updater endpoint — reads GitHub releases/latest directly, NOT the Neon table the release workflow writes; source-of-truth split with /api/releases/check.
- `.github/workflows/agiworkforce-bot.yml` — /agi PR bot. Safe: issue_comment trigger (base context), no PR-head checkout/exec, env-passed comment body. No RCE path.
- `Cargo.toml` — Workspace: cli + src-tauri + crates/\*; release profile (lto, opt-level z, panic=abort); conservative clippy deny-list; git patches for tungstenite forks.

**Risks:**

- 🟠 P1 release-desktop.yml writes 404 download URLs to the live Neon releases table for v-desktop-_ tags (`.github/workflows/release-desktop.yml`) — Both tag schemes exist as real tags (git shows v-desktop-1.2.0 AND v1.2.0). The workflow triggers on v_ (matches both). For a v-desktop-1.2.0 tag, get-version derives VERSION=1.2.0, the draft release keeps tag_name=v-desktop-1.2.0 (assets live at /download/v-desktop-1.2.0/), but update-database hard-codes BASE_URL=.../download/v${VERSION} = /download/v1.2.0 and upserts that into the Neon releases table. apps/web/app/api/releases/check/route.ts reads download_url from that exact table (line 116), so update clients / download page served from Neon get a 404 link. The changelog 'Full Changelog' compare URL has the same v${version} assumption.
- 🟠 P1 Desktop version is static in tauri.conf.json and never bumped by any release workflow (`apps/desktop/src-tauri/tauri.conf.json`) — version is hard-pinned to 1.2.0. No CI/release step rewrites it (release.sh only READS it; tauri-action is invoked with only `releaseId`, no version arg). Every built binary therefore reports 1.2.0 regardless of the release tag, so the Tauri updater's current_version compare misbehaves: a tagged v1.3.0 release will be offered to a 1.3.0 binary that still self-reports 1.2.0, causing repeated update prompts / install loops, or a release cut from un-bumped source silently shipping the wrong version string.
- 🟡 P2 Tag-triggered release does not depend on the full CI gate; cited windows-smoke `needs` does not exist (`.github/workflows/release-desktop.yml`) — On a v\* tag push, release-desktop.yml runs only its own lightweight validate job (lint/typecheck/test) before build-linux. It does NOT require ci.yml's check, windows-smoke, macos-smoke, clippy, or rust tests. Yet ci.yml's windows-smoke comment claims 'Released binaries can't ship without it passing — see release-desktop.yml needs: windows-smoke'. No such needs exists, so a release can be cut with red CI and a provably-false safety comment misleads maintainers.
- 🟡 P2 Auto-generated release notes contain hardcoded, misleading platform/auto-update claims (`.github/workflows/release-desktop.yml`) — Every Linux-only release body statically advertises macOS as 'Available in v1.2.1', Windows 'Coming Q3 2026', and an 'Auto-Updates: existing installations will automatically update to this version' section. These strings are templated regardless of the actual version/channel being cut, so a v1.3.x release still says macOS lands in v1.2.1, and the auto-update promise is asserted even though desktop version bumping is broken (see P1 above). Borderline fabricated user-facing data.
- 🟡 P2 build-windows-release.yml builds the remote-databases feature that CI declares uncompilable (`.github/workflows/build-windows-release.yml`) — Line 135 builds Tauri with `--features shell,updater,billing,devtools,vad,remote-databases`. ci.yml clippy-all-features (NB1) explicitly EXCLUDES remote-databases, stating the consumer code in data/database/{nosql_client,redis_client}.rs still targets prior bson 2.x/mongodb 2.x/redis 1.1 APIs and won't compile. Either the Windows installer build is broken or the CI comment is stale; nothing in CI exercises this feature combination on any platform. Latent (workflow is manual + Windows is unpaid), not a live break.
- 🟡 P2 Two release source-of-truth paths for the updater disagree (`apps/web/app/api/releases/[target]/[version]/route.ts`) — The Tauri updater endpoint (this route) reads GitHub `releases/latest` directly, while /api/releases/check reads the Neon releases table the workflow populates. Because GitHub's releases/latest returns the single most-recent non-prerelease across ALL release types, a CLI release (v-cli-\*) published after a desktop release becomes 'latest', has no asset matching PLATFORM_MAP, and the updater returns 204 (no-update) — silently starving desktop clients of a real desktop update. The two endpoints can also report different latest versions.
- ⚪ P3 Action-pin allowlist diverges between the workflow and the standalone script (`scripts/check-action-pins.sh`) — actions-pinned-check.yml allowlists actions/_, github/_, AND microsoft/_ as unpinned-OK; scripts/check-action-pins.sh allowlists only actions/_ and github/_ (ALLOWED_UNPINNED is empty). A microsoft/_ action that passes the CI workflow would fail the local script, and vice-versa — the two enforcement points are not equivalent.
- ⚪ P3 deploy-railway `if:` has ambiguous boolean precedence (`.github/workflows/deploy-signaling-server.yml`) — The condition is `(A && B || (C && D)) && E` where E is `vars.RAILWAY_PUBLIC_URL != ''`. Due to || precedence it evaluates as `(A && B) || ((C && D) && E)`, so a push to main (A&&B true) triggers the Railway deploy step even when RAILWAY_PUBLIC_URL is unset; it then fails in the health-check step using an empty URL rather than being cleanly skipped. Loud-fail, not silent, hence P3.
- ⚪ P3 release.yml is a stale divergent 3-platform manual path still wired for APPLE*\* signing (`.github/workflows/release.yml`) — release.yml is workflow_dispatch-only (no longer tag-triggered, so it does not double-draft with release-desktop.yml), but it still builds macOS/Windows/Linux via tauri-action with APPLE*\* secrets and creates its own draft release — diverging from the locked Linux-only release-desktop.yml. If invoked it produces a parallel release flow that contradicts the documented Linux-only policy and depends on secrets the desktop workflow header says are unconfigured.

**Gaps:**

- check:ci-guardrails, check:codeowners, check:neon-migrations, check:doc-status are not invoked directly in any workflow YAML — they only run inside the check:llm-operability aggregate (repo-operability.yml + husky pre-push). Not a true gap (they do run) but the wiring is indirect and easy to mis-read as dead.
- The update-database job in release-desktop.yml iterates a PLATFORMS list of 5 platforms (darwin-universal/aarch64/x86_64, windows, linux) but the Linux-only pipeline only ever produces linux-x64-artifacts, so 4 of the 5 branches always hit the 'No artifacts found' skip — dead/aspirational code retained from the old multi-platform pipeline.
- macOS/Windows desktop release is effectively unbuildable from the canonical tag pipeline: release-desktop.yml ships Linux AppImage only; macOS depends on six unconfigured APPLE\_\* secrets, Windows on an unpaid EV cert and a known windows test-load STATUS_ENTRYPOINT_NOT_FOUND failure marked continue-on-error in ci.yml.
- Semgrep security gate is in advisory mode (continue-on-error) with ~41 pre-existing findings acknowledged but not driven to zero; the gate cannot block until that backlog clears.
- Windows cargo test in ci.yml windows-smoke is continue-on-error due to an unresolved DLL/CRT entrypoint loader failure — Windows code is only check+clippy verified, never test-verified, in CI.
- check-no-hardcoded-models.sh is deliberately narrow (two specific patterns) against an acknowledged ~64-file Rust backlog of inlined model IDs, so the locked 'never hardcode model IDs' rule is only partially machine-enforced on the Rust side.
- turbo.json does not exist despite being named in the investigation scope — the monorepo uses plain `pnpm -r` orchestration, no Turborepo.

**Hardening opportunities:**

- Make release-desktop.yml build-linux actually `needs:` the ci.yml gate (or a reusable workflow_call of it) so a tagged release cannot ship with red CI, and fix or delete the false windows-smoke `needs:` comment in ci.yml.
- Derive the release VERSION/tag once and use it consistently for both the GitHub draft tag_name and the Neon download_url BASE_URL; strip the v-desktop-/v-cli- prefix uniformly so download links resolve. Add a check that the constructed download_url returns 200 before upsert.
- Bump tauri.conf.json version from the release tag inside the workflow (sed/jq before tauri-action) so built binaries self-report the released version; add a CI check that tauri.conf.json version matches the desktop package.json / tag on release.
- Template the release-notes platform/auto-update sections from actual job outputs (which platforms built, which channel) instead of hardcoding 'macOS Available in v1.2.1' / 'Coming Q3 2026' / blanket auto-update promises.
- Unify the action-pin allowlist: have actions-pinned-check.yml shell out to scripts/check-action-pins.sh (single source) so CI and local enforcement are byte-identical, and reconcile the microsoft/\* allowance.
- Reconcile the updater source of truth: have /api/releases/[target]/[version] and /api/releases/check both read the same store, and make the GitHub releases/latest lookup filter to desktop-prefixed tags so a CLI release can't shadow desktop updates.
- Either fix the remote-databases consumer code to current bson/mongodb/redis APIs (so build-windows-release.yml's feature set actually compiles and is CI-covered) or drop remote-databases from the Windows build args.
- Fix the deploy-railway `if:` precedence by parenthesizing `((A && B) || (C && D)) && E` so the RAILWAY_PUBLIC_URL guard applies on both push and dispatch paths.
- Remove the dead 4-of-5 platform branches in update-database and the divergent release.yml manual path, or clearly mark them as intentionally-retained for the future multi-platform restore.

**Open questions:**

- Which desktop tag scheme is canonical going forward — plain v* (matches release.sh + the updater's v-strip) or v-desktop-* (the 'current' scheme per the get-version comment)? The pipeline mixes both and the download_url bug hinges on this.
- Is /api/releases/check (Neon-backed) actually consumed by any shipping client/download page, or is the Tauri updater (GitHub-backed) the only live path? If the former is dead, the entire update-database job and the P1 download_url bug are inert; if live, the bug is user-facing.
- Is build-windows-release.yml expected to succeed today (i.e., is the ci.yml NB1 'remote-databases won't compile' comment stale), or is it known-broken and parked until the EV cert is purchased?
- Has the Semgrep 41-finding backlog moved at all since 2026-05-19, and is there a target date to flip the gate to blocking?
- Is the legacy release.yml intended to be deleted, or kept as the eventual macOS/Windows restore path once APPLE\_\* secrets and the EV cert land?

### tests-quality

**Purpose:** The monorepo's automated-test landscape across all seven surfaces plus shared packages and services: what is genuinely covered, where coverage is theater or absent, and how the locked Local/BYOK/Managed-cloud trust boundary is (and isn't) tested. The goal is to separate real safety/regression coverage from suites that report green without verifying anything, and to identify which core paths (LLM proxy, router, provider adapters, agent loop, computer-use) actually have meaningful tests.

**Architecture:** Two test ecosystems run side by side. (1) Rust unit tests are the real coverage backbone: apps/desktop/src-tauri has ~476 test files, apps/cli ~102, crates ~53. The LLM core is well covered — routing_logic_tests.rs (78 tests), llm_router_tests.rs (60), failure_recovery_tests.rs (43), agi security_tests.rs (15), plus cost calculator, SSE parser, token counter, cache, fallback chain, and a dedicated audit_regression_tests.rs. The agent loop, AGI orchestrator safety limits (iteration/timeout/consecutive-failure abandonment), and computer-use action_executor/safety/consent all have inline Rust tests. (2) TypeScript tests via vitest (web 174, packages 100, extensions 38+34, services 20) and jest (mobile 89). The web **tests**/security and **tests**/api suites are high quality — RT-01 provider-stream-auth and the cloud-managed waitlist security test verify auth, SSRF/path-traversal blocking, provider allowlist, credit deduction+refund, CSRF/rate-limit ordering, and no-PII-leak-on-error fail-closed behavior. The trust boundary is tested where it matters: CLI agent/mod.rs encodes the never-silent invariant (Local stays Local on model switch; validate_privacy_boundary errors until explicit BYOK), and web localByokHandoff.test.ts tests the fork-detection + redacted-payload handoff. Control flow: CI (.github/workflows/ci.yml) runs `pnpm test` (JS workspaces), then a Rust job `cargo test -p agiworkforce-desktop -p agiworkforce-cli --lib` (Linux, xvfb) and a Windows `cargo test --workspace --lib`, then a separate desktop-e2e job that builds the Vite web frontend, serves it at 127.0.0.1:5175, and runs Playwright. Crucially the desktop E2E never launches the real Tauri/Rust backend — it tests the web-rendered UI against mocked LLM and a catch-all API mock.

**Trust boundary:** The locked Local/BYOK/Managed-cloud boundary is genuinely tested where it counts. CLI: apps/cli/src/agent/mod.rs local_privacy_blocks_cloud_provider_until_explicit_byok asserts a Local session stays PrivacyMode::Local when the model is switched to a cloud model and that validate_privacy_boundary() ERRORS until set_privacy_mode(Byok) is explicitly called — a direct encoding of 'never silently route Local to BYOK/cloud'. Web: localByokHandoff.test.ts tests fork detection (only Local->Direct-BYOK is a required fork) and asserts the handoff system message carries a redacted payload (secret-scan/payload-preview requirement). Managed-cloud proxy: RT-01 verifies auth required (401), provider allowlist + path-traversal block (400), credit check (402), and credit deduction+refund. I verified the routing_logic 'unknown model -> ManagedCloud' default is a model-name->host mapping (which API hosts an already-cloud model), NOT a Local-origin auto-route — so it is not a boundary violation. Gap: the desktop transfer_local_to_cloud command, the desktop analog of the boundary crossing, has no unit tests; the invariant is proven on CLI and web but not on desktop.

**Key files:**

- `apps/desktop/e2e/agi-safety.spec.ts` — AGI safety E2E suite (iteration limits, timeout, failure abandonment, cancellation, dangerous-op approval). Nearly every assertion is guarded by test.skip(...) that fires when the UI element isn't found, so it reports green without verifying the safety mechanisms. The real coverage for these invariants is in Rust, not here.
- `apps/desktop/playwright.config.ts` — Declares 13 Playwright projects (smoke, chat, automation, agi, settings, gdpr, agi-safety, visual-regression, etc.) giving the appearance of broad E2E coverage. baseURL is the Vite dev server (web frontend), not the Tauri app.
- `.github/workflows/ci.yml` — CI. Rust jobs use --lib (excludes the tests/ integration targets). desktop-e2e job runs ONLY --project=smoke --project=self-healing — none of the agi-safety/gdpr/settings/automation suites execute in CI.
- `apps/desktop/e2e/tests/self-healing.spec.ts` — One of only two desktop E2E suites that run in CI. Comment admits the real failure->retry flow is 'a tracked product follow-up'; the test mocks a canned assistant string containing 'self-healing' and asserts it renders, with a test.skip escape when Send is gated. Verifies essentially nothing about self-healing.
- `apps/desktop/e2e/fixtures/index.ts` — Playwright fixture routes ALL **/api/** to 200 with empty []/{}. Makes the desktop E2E backend a universal yes-man — error paths, auth failures, and real data flows can never be exercised through the UI.
- `apps/web/__tests__/security/rt-01-provider-stream-auth.test.ts` — Strong managed-cloud proxy test: 401 unauth, 400 path-traversal/non-allowlist provider, 402 no-credits, credit deduction + refund on upstream error/throw, content-type assertions. Real trust-boundary coverage.
- `apps/web/__tests__/api/waitlist-cloud-managed.security.test.ts` — Strong security test for the cloud waitlist endpoint: CSRF-before-DB ordering, rate-limit ordering, fail-closed on DB errors, no PII/table-name/SQL-code leakage on any error path. Already migrated to Neon.
- `apps/cli/src/agent/mod.rs` — local_privacy_blocks_cloud_provider_until_explicit_byok (line ~1270): genuine never-silent invariant test — Local stays Local when switching to a cloud model, validate_privacy_boundary() errors until explicit set_privacy_mode(Byok). This is the canonical trust-boundary test.
- `apps/web/features/chat/lib/localByokHandoff.test.ts` — Tests Local->BYOK fork detection and the accepted-handoff system message with redacted payload (secret-scan/payload-preview requirement).
- `apps/desktop/src-tauri/src/sys/commands/chat/transfer.rs` — transfer_local_to_cloud Tauri command — the desktop boundary-crossing point. Has 0 unit tests (only input-validation guards for id/user_id).
- `apps/desktop/src-tauri/src/core/llm/tests/provider_tests.rs` — Weak provider tests: mostly struct field-assignment and trivial arithmetic (asserts 100+200==300, combinations.len()==6). No HTTP/auth/SSE/error-mapping coverage. Hardcodes model IDs as fixtures.
- `apps/desktop/src-tauri/src/core/llm/tests/routing_logic_tests.rs` — 78 routing tests (provider inference, intent/plan routing). unknown->ManagedCloud default here is a model-name->host mapping, NOT a Local-trust-boundary decision — verified not a violation.
- `apps/mobile/jest.config.js` — Disables 4 suites via testPathIgnorePatterns because features are stubbed/diverged: healthkit (stub), auth-401, api-paywall (SecureStore wiring), biometric-gate (rehydration race). Auth-failure, paywall, and biometric-gate handling are therefore currently unverified on mobile.
- `apps/desktop/src-tauri/src/automation/computer_use/anthropic_agent.rs` — 808-line computer-use agent loop (talks to Anthropic). 0 inline tests — the observe/plan/act loop itself is untested, though action_executor (7), safety (6), consent (4), and safety_patterns (29) around it are covered.

**Risks:**

- 🟡 P2 Desktop AGI safety E2E suite reports green without testing anything (skip-theater) — agi-safety.spec.ts (iteration limits, timeouts, consecutive-failure abandonment, cancellation, dangerous-op approval) guards nearly every assertion behind test.skip(!visible,...). The FIX-019 comment is honest that this avoids 'false-passing', but the net effect is zero UI coverage of safety controls presented as a passing suite. Misleading-signal tech debt, NOT 'safety untested' — the invariants are genuinely covered in Rust (failure_recovery_tests 43, security_tests 15, agi core).
- 🟡 P2 CI runs only 2 of 13 desktop E2E projects (`.github/workflows/ci.yml`) — ci.yml desktop-e2e runs --project=smoke --project=self-healing only. The agi-safety, gdpr, settings, automation, agi, chat, and visual-regression Playwright projects never execute in CI, so the 13-project config overstates effective E2E coverage. The suites exist but are dead weight unless run manually.
- 🟡 P2 self-healing.spec.ts is a false CI signal (`apps/desktop/e2e/tests/self-healing.spec.ts`) — It is one of only two E2E suites that run in CI, yet its own comment states the failure->retry flow is unimplemented; it asserts a mocked canned string renders, with a test.skip escape if Send is gated. Gives a green 'self-healing verified' signal for a flow the test author documents as absent.
- 🟡 P2 Desktop E2E catch-all API mock prevents real backend verification (`apps/desktop/e2e/fixtures/index.ts`) — fixtures/index.ts routes all /api/\*\* to 200 with empty bodies and the suite runs against the Vite web frontend, never the Tauri/Rust backend. Even the suites that do run cannot exercise auth failures, error paths, or real data flow. Acceptable as UI smoke, but the 'desktop E2E' label implies end-to-end coverage that does not exist.
- 🟡 P2 Rust integration-test directory excluded from CI by --lib (`.github/workflows/ci.yml`) — Both Rust CI jobs use --lib, which does not compile/run apps/desktop/src-tauri/tests/. The net newly-uncovered surface is integration_tests.rs, automation_db_tests.rs, and browser_automation_test.rs (mcp_integration_test.rs and automation_integration.rs are #[ignore] anyway, so they wouldn't run regardless). These DB/browser integration suites only run on manual `cargo test --test <name>`.
- 🟡 P2 Mobile auth-failure, paywall, and biometric-gate suites disabled (`apps/mobile/jest.config.js`) — jest.config.js testPathIgnorePatterns disables auth-401.test.ts, api-paywall.test.ts, biometric-gate.test.tsx, and healthkit.test.ts against stubbed/diverged wiring (per the config comment). These are security-relevant flows; they are currently UNVERIFIED (per config — not observed broken at runtime). Honestly documented as TODOs but the protection is unproven.
- ⚪ P3 Desktop transfer_local_to_cloud command has no unit tests (`apps/desktop/src-tauri/src/sys/commands/chat/transfer.rs`) — The desktop boundary-crossing command (transfer.rs) has only input-validation guards and 0 tests. The never-silent trust boundary IS tested on CLI (agent/mod.rs) and web (localByokHandoff.test.ts), so this is a surface-coverage gap on the desktop equivalent rather than an unguarded invariant.
- ⚪ P3 provider_tests.rs is low-value (struct/arithmetic assertions) (`apps/desktop/src-tauri/src/core/llm/tests/provider_tests.rs`) — Asserts trivial facts (100+200==300, array length==6, struct field round-trips) and hardcodes model IDs as fixtures. The real provider adapter logic (HTTP, auth headers, SSE streaming, error mapping) is not covered by this file; some of it is covered elsewhere (sse_parser_tests, provider_adapter_tests) but the HTTP/auth path remains thin.
- ⚪ P3 Computer-use agent loop (anthropic_agent.rs) has no inline tests (`apps/desktop/src-tauri/src/automation/computer_use/anthropic_agent.rs`) — The 808-line observe/plan/act loop that drives Anthropic computer-use has 0 inline tests. Surrounding modules (action_executor, safety, consent, safety_patterns) are tested, but the orchestration loop itself relies on #[ignore]'d display-dependent integration tests that don't run in CI.

**Gaps:**

- Desktop E2E does not test the real Tauri/Rust backend at all — it runs the web frontend against a Vite server with a catch-all 200/empty API mock and mocked LLM. No true end-to-end coverage of IPC, agent loop, or computer-use through the UI.
- agi-safety.spec.ts and the gdpr/settings/automation E2E suites are effectively unwired in CI (not in the smoke/self-healing project list) and skip-out when UI elements are absent.
- self-healing.spec.ts asserts a mocked string rather than any real recovery logic; its own comment marks the failure->retry flow as an unimplemented follow-up.
- 85 Rust tests are #[ignore]'d (display/network/LLM/AppHandle-dependent) — vision, planner live-LLM, background-agent-manager, MCP integration, automation integration, windows screen-capture. These never run in CI, so display- and network-bound paths are unverified by automation.
- apps/desktop/src-tauri/tests/ integration targets (DB, browser automation) are excluded from CI by --lib.
- Mobile: 4 suites disabled (auth-401, api-paywall, biometric-gate, healthkit) because the underlying features are stubs or have diverged wiring.
- Desktop transfer_local_to_cloud has no unit tests (the never-silent invariant is covered on CLI and web instead).
- computer-use anthropic_agent.rs orchestration loop has no inline tests.
- Not deep-inspected: services/ (api-gateway/signaling-server vitest configs) — the api-gateway sits on the managed-cloud proxy path (RT-01 mocks API_GATEWAY_URL) but its own gateway-layer tests were not assessed; and the two browser/vscode extensions beyond confirming security suites exist.

**Hardening opportunities:**

- Add the agi-safety, gdpr, and settings Playwright projects to the CI desktop-e2e run (or delete the suites) so the 13-project config reflects what actually executes; the current state implies coverage that does not run.
- Replace the test.skip(!visible,...) pattern in agi-safety.spec.ts with seeded fixtures that force the safety UI to render, so the suite verifies the controls instead of skipping; or explicitly document that safety is covered in Rust and downgrade the E2E suite to a thin smoke check.
- Drop --lib from the Rust CI test invocation (or add a dedicated `cargo test --test integration_tests --test automation_db_tests --test browser_automation_test` step) so the DB/browser integration targets run.
- Add desktop unit tests for transfer_local_to_cloud asserting the boundary-crossing requires explicit user context (mirror the CLI privacy-mode test).
- Re-enable the disabled mobile suites (auth-401, api-paywall, biometric-gate) once wiring lands, or convert them to xfail-style tracked tests so regressions in those security flows surface.
- Add inline tests for the computer-use anthropic_agent.rs observe/plan/act loop with a mocked Anthropic client, since the highest-risk automation path currently has none.
- Strengthen provider_tests.rs beyond struct/arithmetic assertions to cover auth-header construction, SSE chunk parsing, and upstream error mapping.
- Add a CI step that runs the #[ignore]'d display/network tests under xvfb on a scheduled (nightly) job so they don't rot entirely.

**Open questions:**

- Are the 11 non-CI Playwright projects (agi-safety, gdpr, settings, automation, etc.) run anywhere — a nightly job, a release gate, or only ad hoc locally? Nothing in ci.yml invokes them.
- Do the services/ api-gateway and signaling-server vitest suites cover the managed-cloud proxy path that RT-01 stubs via API_GATEWAY_URL, or is that hop untested end to end?
- Is there a planned re-enable date for the disabled mobile auth/paywall/biometric suites, and are those features expected to ship before the unverified gate becomes a release blocker?
- Does any test cover the desktop transfer_local_to_cloud consent/preview UX, or is the boundary relying solely on CLI + web coverage plus the desktop command's input validation?

### docs-product

**Purpose:** The docs-product layer is AGI Workforce's "agent operating system" and product source-of-truth: a tiered set of human/agent-readable Markdown plus machine-readable JSON maps that define what v1 is (a six-surface OpenAI/Anthropic-style app suite differentiated by Local/BYOK/Managed trust boundaries), the locked product/safety rules, the parity targets vs ChatGPT/Claude, and the operating procedure for 15+ parallel coding agents. It is explicitly designed to be the durable navigation/decision layer so agents do not hallucinate from stale plans. Its accuracy directly drives what every implementation agent builds, so doc-vs-code drift here is the primary risk class.

**Architecture:** duplicate-removed

**Trust boundary:** The docs encode Local / BYOK / Managed Cloud as three separate trust boundaries with strong, consistent rules across source-of-truth.md, AGENTS.md, technical-architecture.md, and CURRENT_DECISIONS: Local never silently routes to BYOK/Managed; Local->BYOK must be an explicit fork (context selection, secret scan, payload preview, provider label, consent) that preserves the original Local thread and stores only redacted payload+hash evidence (not cloned messages); Managed Cloud stays waitlist/private-beta until metering/fraud/refund/chargeback/retention/deletion/provider-terms controls are proven; Web/Mobile v1 do not expose BYOK; CLI/VS Code/Chrome stay workspace/task-scoped and out of app-chat sync absent explicit redacted handoff. These rules are mirrored into CLAUDE.md and guarded by check:agent-context. The boundary documentation is the most coherent part of this area. The contradiction risk is orthogonal: it is about the DB/auth backend posture (Supabase vs Neon/Clerk), not the user-facing trust modes.

**Key files:**

- `AGENTS.md` — Canonical tool-neutral agent entry point; locked read order, critical rules, repo map, non-negotiables, bug-finding workflow. Accurate and consistent with code.
- `docs/current/source-of-truth.md` — Compact product lock: trust modes, surface roles, competitive baseline, UX/settings IA lock, and the 13-item P0 Gap List. Mostly accurate but P0 gap #1 (DesktopShellV3 cowork/code placeholders) is stale vs code.
- `docs/current/parity-implementation-matrix.md` — Implementation-facing feature x surface x status matrix; the primary build spec for agents. Repeats the stale DesktopShellV3 placeholder status (Desktop Surface table).
- `docs/current/byok-open-model-provider-strategy.md` — BYOK/open-model provider+model priority map. Strongest-grounded doc: catalog claims verified exactly against models.json.
- `docs/decisions/CURRENT_DECISIONS.md` — Designated conflict-resolution index (21 locked decisions). Contains a self-contradiction: Decision 17 says production is still on Supabase and Decision 13 cites a deleted supabase/migrations file, contradicting code + sibling current docs + an enforced guard.
- `docs/agent-context/known-flaws.md` — Drift ledger to prevent duplicate bug discovery. NEON-01 asserts Neon is the only DB path and legacy roots were removed — correct vs code, but contradicts CURRENT_DECISIONS Decision 17.
- `docs/agent-context/repo-map.json` — Machine-readable surface/owner/check map; consistent with AGENTS.md repo map and real paths.
- `docs/agent-context/doc-status.json` — Classifies current vs historical docs; all 17 currentSourcesOfTruth and 7 evidence paths exist.
- `docs/agent-context/lanes.json` — Write-lane map for parallel agents; sampled concrete paths all exist (no path drift).
- `PLAN.md` — Active transition strategy + parity matrix. Dated 2026-05-23 (older than the 05-28 current docs). All listed deliverable files verified to exist.
- `TODO.md` — Active execution queue. R28 deferred backlog explicitly lists Cowork-mode UI and Code-mode UI as descoped — the real status behind P0 gap #1.
- `scripts/check-doc-status.mjs` — Doc guardrail; only validates presence of Status/Owner/Last updated header markers, not freshness or content. Root cause of why prose drift passes CI.
- `packages/data-layer/src/factory.ts` — Ground truth for DB/auth posture: DatabaseProvider enum is ['neon','postgres'] (default neon), AuthProvider is ['auth0','clerk','cognito'] (default clerk). Supabase is not a selectable provider — disproves CURRENT_DECISIONS Decision 17.
- `scripts/check-neon-migrations.mjs` — Enforces Neon as canonical and forbids the supabase directory from existing (obfuscated as 'supa'+'base' to dodge greps); wired into check:llm-operability.

**Risks:**

- 🟠 P1 CURRENT_DECISIONS.md (the conflict-resolver) contradicts code and its own sibling current docs on the DB/auth boundary (`docs/decisions/CURRENT_DECISIONS.md`) — Decision 17 (dated 2026-05-28) states 'production stays on the existing Supabase path until Clerk/Neon are verified.' But the code already removed Supabase: packages/data-layer/src/factory.ts only allows DatabaseProvider ['neon','postgres'] (default neon) and AuthProvider ['auth0','clerk','cognito'] (default clerk); scripts/check-neon-migrations.mjs actively forbids a supabase/ directory and is wired into the passing check:llm-operability. AGENTS.md, technical-architecture.md, known-flaws.md NEON-01, and packages/data-layer/README.md all assert Neon-canonical. Agents are explicitly told to consult CURRENT_DECISIONS 'when a decision conflict appears,' so the canonical tie-breaker gives the wrong answer. This is a durable doc defect, not the in-flight import churn to ignore: the migration is already enforced in CI and the provider enums, so the doc simply was not updated per its own Conflict Rule (line 105).
- 🟡 P2 Dead evidence citation in the conflict-resolution index — CURRENT_DECISIONS.md Decision 13 cites 'supabase/migrations/20260521100000_enterprise_control_plane_foundation.sql' as evidence, but that file and the entire supabase/migrations/ directory no longer exist (verified by ls; the dir is guarded against re-creation by check-neon-migrations.mjs). A canonical decision doc pointing at a deleted file erodes trust in the evidence-backed-claims discipline the repo is built on.
- 🟡 P2 P0 Gap #1 is stale: source-of-truth + parity-matrix describe DesktopShellV3 as routing cowork/code to placeholders, but it was descoped to chat-only (`docs/current/source-of-truth.md`) — source-of-truth.md line 210 and parity-implementation-matrix.md Desktop Surface rows (both dated 2026-05-28) say DesktopShellV3.tsx 'still routes cowork and code to placeholders' as the #1 P0 gap. The actual file declares V3Mode = 'chat' only, with a comment that 'the old separate Code/Cowork mode tabs are intentionally not exposed.' TODO.md (older, 05-23) already lists W2a-03 Cowork-mode UI and W2a-04 Code-mode UI as R28 deferred backlog. The Cowork\* subpage components (CoworkHome/Projects/Scheduled/Dispatch/Artifacts) and CodeModeHome.tsx do exist but are unwired at the shell. Net: the gap was descoped+deferred, not 'broken placeholder routing,' and the newest docs narrate an obsolete state — over-directing agents toward a gap that was intentionally cut.
- ⚪ P3 Doc-freshness guardrail validates header markers only, not content or recency (`scripts/check-doc-status.mjs`) — scripts/check-doc-status.mjs requires only 'Status:', 'Owner', 'Last updated:' markers on current docs. It does not check that 'Last updated' is recent or that content matches code, which is the structural reason the Supabase/Neon and DesktopShellV3 drifts pass CI while the repo presents a green check:llm-operability. This is the common root cause behind the higher-severity findings.
- ⚪ P3 PLAN.md and TODO.md are dated 2026-05-23, older than the 2026-05-28 current docs, yet listed as co-equal current sources — doc-status.json and CURRENT_DECISIONS both list PLAN.md/TODO.md as current sources of truth, but their content reflects the R27 Phase D state (05-23) while source-of-truth/PRD/matrix advanced to 05-28. The PLAN.md parity matrix still labels everything 'Partial/Early' generically. Low impact because the read-order prioritizes docs/current over PLAN.md, but it widens the surface for the kind of drift seen in the P0-gap finding.

**Gaps:**

- P0 Gap #1 (Desktop cowork/code modes routing to real surfaces) is documented as a live gap but was actually descoped to a chat-only DesktopShellV3 and deferred to R28 (TODO.md W2a-03/W2a-04). The Cowork\*/CodeModeHome subpage components exist but are orphaned/unwired at the shell — neither 'done' nor 'placeholder,' which the docs do not capture.
- BYOK provider catalog is intentionally incomplete and the byok strategy doc says so honestly: 9 declared providers (together, fireworks, cerebras, deepinfra, cohere, ai21, sambanova, azure, bedrock) plus ollama have provider definitions but zero model entries in models.json, so the BYOK selector cannot claim full support for them. Verified true.
- Storage and realtime providers in packages/data-layer are deliberately unwired ('no default is wired yet' per README) — the Supabase->Neon/Clerk migration is complete for DB+auth but partial overall, which the higher-level current docs (technical-architecture, known-flaws NEON-01) gloss as a finished cutover.
- Many parity-matrix rows are 'Partial/Missing/Gated' with no per-row evidence link or tracked sub-task, so completion state is asserted prose rather than verified — e.g., memory import-from-other-providers (Missing), visual design workspace (Missing/Gated), global app search (Partial/Missing), AI-powered artifacts (Missing/Gated). These are stated gaps but lack the end-to-end evidence the docs' own Definition-of-Done demands.

**Hardening opportunities:**

- Extend scripts/check-doc-status.mjs (or add a new check) to validate that current-doc 'Last updated' is not older than the newest doc it cross-references, and to flag evidence citations (file paths inside docs/decisions and PLAN.md) that no longer resolve on disk — this would have caught both the dead supabase/migrations citation and the stale DesktopShellV3 P0-gap.
- Reconcile CURRENT_DECISIONS.md Decision 17 + Decision 13 with the actual Neon/Clerk-default code state per the doc's own Conflict Rule (verify code, then update doc in the same change); align with known-flaws NEON-01 and technical-architecture.md.
- Update source-of-truth.md P0 Gap #1 and parity-implementation-matrix.md Desktop rows to reflect that cowork/code modes were descoped to chat-only and deferred (TODO.md R28), and note the orphaned Cowork\*/CodeModeHome components so they are not mistaken for wired features.
- Add a lightweight per-row evidence column (file path + verification command/date) to parity-implementation-matrix.md so Partial/Missing/Gated statuses are falsifiable, matching the doc's own Implementation Definition of Done.
- Bump PLAN.md/TODO.md 'Last updated' and parity status when current docs advance, or demote them below docs/current explicitly in doc-status.json to reduce co-equal-source confusion.

**Open questions:**

- Is CURRENT_DECISIONS Decision 17 deliberately conservative (production runtime still points at Supabase via env even though the data-layer code path was removed), or simply un-updated? I could not read apps/web/.env.example (permission-denied) to confirm the deployed env posture; the data-layer factory enums strongly indicate Supabase is no longer a code path, but the live deployment env was not verifiable from the docs-product files.
- Coverage gaps I did not fully read (outside the stated focus, low risk): docs/current/provider-capability-matrix.md, docs/current/agent-and-repo-operability.md, full docs/current/agi-product-requirements.md body (only header + structure + drift-scan), and the full 362-line lanes.json (sampled concrete paths only — all resolved).
- Should the agi-product-requirements PRD (Decision 21 BYOK Native-First default) be reconciled with the parity-matrix auto-routing row that says routing must be explicit? I did not deep-read the PRD section to confirm they are consistent.

---

# Gap-fill exploration (web · desktop FE+Rust · MOBILE lead surface) — 12/12

Source: workflow wcro4rrxs. Risk tally (gap-fill deep-dives): 3 P0 / 14 P1 / 21 P2 / 17 P3.

## Gap-fill synthesis

Synthesis of 12 read-only deep-dives across Web, Desktop (FE + Rust core/sys), and Mobile (the locked lead surface), with the most verdict-flipping facts spot-verified in the repo.

TRUST-BOUNDARY CONTRAST (the strongest cross-surface story): The three surfaces enforce the Local/BYOK/Managed-Cloud boundary very differently. (1) MOBILE is exemplary — fail-closed via three independent layers (lib/v1FeatureFlags.ts master switch, \_layout.tsx gating every cloud-egress effect on `FEATURES.x && session` where session is permanently null in v1, and chatExecutionStore branching to on-device localGenerate with streamChat re-asserting assertRemoteChatAllowed at the HTTPS chokepoint). No silent Local→cloud path; the entire dispatch/WebRTC/companion subsystem is unreachable. (2) WEB is the right shape — there is no Local trust boundary to violate (chat always streams to /api/llm/v1/chat/completions), the v1 LLM gateway is Bearer-only with a server-side active-subscription gate (auth-gate.ts → 403 subscription_required/inactive, VERIFIED), and managed credits/checkout are waitlist/private-beta flag-gated. (3) DESKTOP has the one genuine enforcement gap: the managed-cloud subscription/budget gate is keyed off REQUEST SHAPE (request_uses_managed_cloud) in chat_send_message, but the ACTUAL provider is chosen later in candidates()/run_nonstreaming_chat. VERIFIED: send_message_execution.rs:1496-1514 silently redirects an unconfigured-provider request to ManagedCloud (reason "fallback-redirect-to-managed-cloud") via invoke_candidate, and ensure_managed_cloud_provider registers ManagedCloud for ANY token-holder with zero subscription check; check_cloud_access() even returns true when Stripe is uninitialized (the normal v1 state). The desktop billing backstop is the web backend 403 — but that fires AFTER the Local conversation payload has already been POSTed to managed cloud, so it neutralizes the unbilled-compute/waitlist-bypass sub-claims but NOT the locked "never silently route Local→cloud / secret-scan+consent+payload-preview before content leaves the device" invariant. Local content egresses with no pre-flight consent on a reachable Local/Auto path.

CRASH CLASS: VERIFIED three byte-slice panics on user-reachable Rust paths — orchestrator.rs:623 (&text[..10000] on PDF-extracted attachment text on the live chat path), code_executor.rs:538 (&code[..code.len().min(100)]) and :787 (&code[..4000]). The .min() caps prevent length overflow but not landing mid-codepoint, so multibyte input (smart quotes, accents, non-Latin — routine in PDFs/code) panics the task. autonomous.rs uses char-safe truncate_str, proving the team knows the correct idiom.

FABRICATED USER-FACING DATA (deduped to one class): the only LIVE/mounted instance is desktop UsageDashboard rendering analyticsQueries.queryCategoryData('features') hardcoded percentages with no demo label beside genuinely-real Tauri tiles (P1). The rest are latent/unmounted, one wire-up away: web features/analytics/AnalyticsDashboard (fabricated metrics + fake named users, exported as "canonical" but unrouted) and desktop v3 CodeModeHome (fake 612 sessions / 134.6M tokens / Math.random heatmap) + PluginMarketplace (fake 84k/203k installs, fake authors).

LOOKS-DONE-BUT-DEAD FLOWS (the NEW-risk payload a backend-only review misses): council frontend invokes Tauri command llm_council_query that does not exist anywhere in src-tauri (runtime command-not-found); DailyBudgetGuard (FIX-007 anti-prompt-injection daily cap) is entirely unwired (reserve_or_reject has zero callers) so BudgetStatusWidget shows a perpetual $0/$25 false signal; email-trigger poll loop is a stub that never matches or fires; web API-keys settings panel always errors ("not yet available via API"); web support email POSTs to a dead /.netlify/\* endpoint in a Vercel app; web support FAQ/ticket-detail return empty despite existing API routes.

READINESS: all three surfaces are PARTIAL, none is shell-only, none is fully clean end-to-end. Mobile boundary safety is the best of the three; desktop has the only live boundary defect; web is structurally sound on routing but riddled with dead full-stack flows.

## New top risks (10)

### 🔴 P0 — UTF-8 byte-slice panics crash live chat-attachment and code-exec paths

- **Area:** Desktop (Rust core/agi) · `apps/desktop/src-tauri/src/core/agi/orchestrator.rs (and core/agi/executors/code_executor.rs)`
- **Fix:** Replace &text[..10000] (orchestrator.rs:623), &code[..code.len().min(100)] (code_executor.rs:538), and &code[..4000] (code_executor.rs:787) with char-boundary-safe truncation (reuse autonomous.rs::truncate_str / char_indices). Add a regression test with multibyte input. These panic the agent task on a PDF attachment in chat or any multibyte code; .min() guards length, not codepoint boundaries.

### 🔴 P0 — Silent Local->cloud content egress on desktop violates the locked never-silent / pre-flight-consent invariant

- **Area:** Desktop (Rust sys/chat) · `apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs`
- **Fix:** run_nonstreaming_chat (lines 1496-1514) silently redirects an unconfigured/Local/Auto request to ManagedCloud via invoke_candidate, and ensure_managed_cloud_provider registers cloud for any token-holder. The Local conversation payload is transmitted to managed cloud BEFORE the web backend's 403 fires, so the backend gate does not protect content egress. Fail closed with a provider-not-configured error, or require explicit consent + secret-scan + payload-preview before any redirect. Re-derive the managed-cloud gate from the FINAL routed candidate, not request shape, and require check_cloud_access in the ManagedCloud inference path. (Billing/waitlist-bypass sub-claim is downgraded: web auth-gate.ts 403s non-subscribed users, so no unbilled compute — but content already left the device.)

### 🟠 P1 — Live, mounted UsageDashboard renders fabricated feature-usage analytics as real (plus latent unmounted siblings)

- **Area:** Desktop FE / Web FE (fabricated-data class) · `apps/desktop/src/services/analyticsQueries.ts (rendered by features/analytics/UsageDashboard.tsx)`
- **Fix:** queryCategoryData('features') returns hardcoded percentages shown unlabeled beside real Tauri metrics. Back it with a real analytics_get_feature_usage command or hide the card. Then neutralize the latent siblings one wire-up away: web features/analytics/AnalyticsDashboard.tsx (fake metrics + named users, exported as canonical but unrouted) and desktop v3 CodeModeHome.tsx / PluginMarketplace.tsx (fabricated stats/install counts). Add a CI lint flagging hardcoded numeric literals returned from query*/get* functions.

### 🟠 P1 — Multiple looks-finished features are dead end-to-end (frontend wired to nonexistent/unwired backends)

- **Area:** Cross-surface (Desktop + Web full-stack flows) · `apps/desktop/src/api/council.ts + apps/desktop/src-tauri/src/core/llm/daily_budget.rs`
- **Fix:** Backend-only review misses these. (a) council.ts invokes llm_council_query which does not exist in src-tauri -> runtime command-not-found; register the command or remove the surface. (b) DailyBudgetGuard.reserve_or_reject has zero callers; wire it into route_with_retry or delete it and BudgetStatusWidget (it shows a false $0/$25 security signal). (c) email-trigger poll loop never fires (gate the register API or finish Gmail sync). (d) web API-keys panel always errors; (e) web support email hits a dead /.netlify/\* endpoint and FAQ/ticket methods return empty despite live routes. Audit for the 'presents-as-working' anti-pattern before launch.

### 🟠 P1 — Mobile first-run local-chat dead-ends: onboarding model download is a no-op for the v1 default

- **Area:** Mobile (lead surface) · `apps/mobile/app/(public)/onboarding.tsx`
- **Fix:** VERIFIED: onboarding handleStartDownload only downloads when downloadUrl+checksum+format are all present, but the default Qwen3-4B catalog entry exposes only an executorchPreset (no top-level fields), so onboarding finishes WITHOUT downloading. resolveLocalModelRef (model-picker/localModelRuntime.ts) does NOT provision — it throws 'not downloaded yet' unless the model is already installed OR an active system runtime (Apple Foundation Models / Gemini Nano) covers the device. Either populate the catalog fields for the default model or have onboarding drive the executorchPreset provisioning path, so the lead surface's core demo lands a working model on first run.

### 🟡 P2 — Web tenant isolation is WHERE-clause-only; no RLS backstop despite documented adapter contract

- **Area:** Web infra (Neon data layer) · `apps/web/lib/server/neon-chat.ts + packages/data-layer/src/adapters/neon.ts`
- **Fix:** The Neon adapter documents a withUser()/SET LOCAL RLS contract but the chat path (~102 call sites) never binds it, and apps/web/db/neon has ZERO CREATE POLICY statements. web_messages has no user_id column and is queried by conversation_id alone behind an application-level ownership pre-check. Spot-checked routes filter correctly today, but a single future query skipping the pre-check is an immediate cross-tenant leak with no DB backstop. Enable Postgres RLS, add a user_id column to web_messages, and add a CI lint that fails per-user queries lacking a user_id predicate.

### 🟡 P2 — Desktop Stripe/billing IPC surface and v3 live-checkout scaffolding ship in default build against the waitlist lock

- **Area:** Desktop (Rust sys/billing + FE v3) · `apps/desktop/src-tauri/Cargo.toml`
- **Fix:** default = [shell,updater,billing,vad] compiles ~17 Stripe IPC commands (inert until billing_initialize). Separately, unmounted v3 Pricing/SpendStackImporter/DowngradeFlow wire live Stripe openCheckout(), which the v1 cloud-waitlist lock forbids if ever mounted (the mounted PlansModal correctly routes to external waitlist URLs). Gate the billing feature out of the default build until waitlist controls are proven, and delete/hard-gate the v3 live-checkout components so they cannot be mounted.

### 🟡 P2 — Desktop AgentOrchestrator never transitions to Completed; chat agent tasks always read as timed out

- **Area:** Desktop (Rust core/agi) · `apps/desktop/src-tauri/src/core/agi/orchestrator.rs`
- **Fix:** AgentStatus.status is set Running at spawn and only ever written to Failed/Paused/Resumed; nothing flips it to Completed. process_instruction polls for Completed for 120s and returns 'timed out' even on success, and after cleanup_goal the goal is removed so get_agent_status returns None / stale progress. Wire the worker to set AgentState::Completed at terminal state before cleanup.

### 🟡 P2 — Mobile dispatch HMAC is transitional (unsigned accepted) and taskResult is an unvalidated cast

- **Area:** Mobile (companion/WebRTC, currently dead in v1) · `apps/mobile/stores/connectionStore.ts`
- **Fix:** Inbound dispatch_response/dispatch_status_update use raw `as TaskResult` (vs strict parseAgent for agents), and unsigned envelopes are accepted with only a warn until DISPATCH_HMAC_REQUIRED_AFTER 2026-06-05. Unreachable in v1 (FEATURES.dispatch false), so defense-in-depth only — but must land per-field validation and the HMAC-required cutover BEFORE companion/dispatch unlocks. Also add an internal FEATURES.dispatch guard inside the backgroundFetch TaskManager handler.

### ⚪ P3 — Web has no central auth boundary; admin page lacks a role check

- **Area:** Web (App Router) · `apps/web/proxy.ts + apps/web/app/admin/layout.tsx`
- **Fix:** proxy.ts does CSP-nonce only (no auth.protect/createRouteMatcher); each protected surface must add its own auth()+redirect layout, so a new authenticated route that forgets the gate ships silently public. /admin checks only userId, not admin role (mitigated: body is static, API routes enforce role). Add a createRouteMatcher-based defense-in-depth net and a role check on /admin. Also gate/remove the ungated prod-shipped /dev/inline-toolcall-demo.

## Surface readiness (web/desktop/mobile)

**Web** — PARTIAL — demoable chat end-to-end, but multiple dead full-stack flows and an unenforced tenant-isolation design

- Several settings/support features present as working but are dead: API-keys panel always errors, support email hits a dead /.netlify/\* endpoint, FAQ/ticket-detail return empty despite live routes (P1 class)
- features/analytics/AnalyticsDashboard.tsx fabricates metrics + named users; exported as 'canonical' though currently unrouted (latent P1)
- Tenant isolation is WHERE-clause-only with no RLS backstop and web_messages has no user_id column (P2) — not a live leak today but fragile
- Confirm /billing and /settings/billing live Stripe checkout is feature-flagged off per the managed-cloud waitlist lock (only /pricing confirmed routing to WaitlistForm)
- Decentralized per-layout auth gating with no proxy-level net; /admin lacks a role check (P3)

**Desktop** — PARTIAL — happy-path local/BYOK chat works, but a live crash class, a real trust-boundary defect, and broken core navigation

- P0 byte-slice panics on PDF-attachment chat path and code-exec path (orchestrator.rs:623, code_executor.rs:538/787)
- P0 silent Local->cloud content egress: unconfigured/Auto request redirected to ManagedCloud before the backend 403, with no consent/secret-scan/payload-preview (send_message_execution.rs:1496)
- 5 of 6 expanded v3 Sidebar nav items are silent no-ops (Sidebar emits view keys App.tsx onNavigateView does not handle) — broken core nav in the live shell
- Mounted UsageDashboard shows fabricated feature-usage analytics unlabeled (P1)
- Council feature broken (frontend calls nonexistent llm_council_query); DailyBudgetGuard unwired so budget widget shows false $0 (P1 class)
- AgentOrchestrator never sets Completed so chat agent tasks read as timed out even on success (P2)
- Large volume of shipped-but-dark v3 scaffolding (~40 unmounted components incl. live-Stripe Pricing) is latent risk + bundle bloat

**Mobile** — PARTIAL — trust-boundary safety is excellent (best of the three) and fail-closed, but first-run local-chat demo dead-ends on the documented path

- P1: onboarding model download is a no-op for the default Qwen3-4B (catalog lacks downloadUrl/checksum/format); resolveLocalModelRef does not provision, so first-run chat only works on devices with an active system runtime (Apple FM / Gemini Nano) or after a manual Models-screen download — VERIFIED
- TLS pins are placeholders (PLACEHOLDER*REPLACE_BEFORE_LAUNCH*\*); release builds are blocked by the fail-loud pinning guard until ops provisions SPKI hashes in both JS PINS_BY_HOST and native config (ops gap, not code defect)
- authSession.ts is a v1 stub (always null) — entire cloud-account path unimplemented; acceptable for local-only v1 but blocks any cloud feature
- Dispatch HMAC-required cutover (2026-06-05) not yet active and taskResult validation missing — must land before companion/dispatch unlocks (currently dead via FEATURES gate)
- Unprompted auto-TTS on every completed assistant message in chat/[id].tsx if useVoicePlayback has no internal enable gate (P3, unconfirmed); pervasive hardcoded color literals violate the no-hardcoded-colors rule (P3)

## Gap-fill per-area deep dives (12)

### web-api-routes (apps/web/app/api)

**Purpose:** Next.js App Router API surface for the AGI web app: the managed-cloud OpenAI-compatible LLM gateway (v1 chat completions, v2 AI-SDK chat, legacy llm/completion + completion ghost-text), credit/usage metering, Stripe billing (checkout, portal, credit-topup, webhook), subscriptions, projects/memory/chat persistence, settings/teams/2FA, media generation, share, device-link auth, and waitlist signup. It is the primary trust boundary for managed-cloud (Bearer/Clerk) traffic and Stripe-funded billing.

**Architecture:** Routes are thin handlers wrapped in withErrorHandler; the LLM v1 path is decomposed into lib modules (auth-gate -> request-processor -> stream-transform/response-builder). Cross-cutting guards are consistently applied: Clerk auth via getClerkAuthUser/auth(), requireCsrfToken on state-changing routes, withRateLimit (per-key), CORS+security headers, egress-policy SSRF validation on image_url and custom provider base URLs. Billing/credits flow through two service classes: SubscriptionService (subscription + allocateCreditsForPeriod/resetCreditsForNewPeriod) and CreditService (getBalance/checkAvailable/deductCredits with idempotency keys + a reservation->reconcile->refund pattern). assertQuota/reconcileUsage provide a tier-aware quota layer above raw credits (fail-open to credit-only on error). DB access is via getNeonDb() (Neon) using the data-layer DatabaseAdapter; the supabase->neon->clerk migration is in flight, so CreditService/SubscriptionService methods are polymorphic, accepting either (userId, ...) or (dbAdapter, userId, ...) as the first arg(s) -- so the v1-vs-v2 call-shape difference is intentional, not a bug. Managed-cloud billing/credits are correctly gated behind waitlist/private-beta flags per the locked product rules.

**Trust boundary:** The LLM v1 gate is Bearer-token-only by design (auth-gate.ts rejects cookie callers), keeping the managed-cloud API distinct from the web UI's session-cookie path. v2 adds an explicit providerMode trust-boundary gate (resolveManagedAiGatewayProviderMode) that denies disallowed Local/BYOK/Managed routing combinations -- consistent with the locked rule that Local/BYOK/Managed Cloud are separate boundaries and Local must never silently route to cloud. Managed credits and paid plans are correctly waitlist/private-beta gated (credit-topup behind AGI_MANAGED_CREDITS_PRIVATE_BETA, checkout hard-rejects waitlisted plans). userId is always derived from the verified Clerk session, never from the request body (explicitly noted in usage/deduct). No evidence of silent Local->cloud routing in this surface.

**Key files:**

- `apps/web/app/api/llm/v1/chat/completions/route.ts` — Primary OpenAI-compatible chat gateway; orchestrates auth-gate -> processRequest -> provider dispatch with refund-on-failure
- `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts` — Bearer-only auth + CSRF + rate-limit + active-subscription gate for the LLM API (rejects cookie-style callers)
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` — Body/SSRF validation, local task classifier, tier/model access, assertQuota gate, credit estimation + reservation, tool injection
- `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts` — Anthropic->OpenAI SSE transform + final credit reconciliation/usage recording in flush()
- `apps/web/app/api/llm/v2/chat/route.ts` — Parallel AI-SDK chat path with providerMode trust-boundary gate, context compaction, v1 fallback, full credit reserve/reconcile
- `apps/web/lib/services/credit-service.ts` — Polymorphic credit ledger (getBalance/checkAvailable/deductCredits) backed by Neon stored procs; migration shim accepts userId-first or db-first calls
- `apps/web/app/api/stripe-webhook/route.ts` — HMAC-verified, idempotent, rate-limited Stripe webhook with generic error bodies (Node runtime)
- `apps/web/app/api/credit-topup/route.ts` — Stripe Checkout for managed credits; gated behind AGI_MANAGED_CREDITS_PRIVATE_BETA flag per lock
- `apps/web/app/api/checkout/route.ts` — Subscription checkout, hard-gated to reject when paid plans are waitlisted
- `apps/web/app/api/cron/reset-credits/route.ts` — CRON_SECRET-protected monthly credit reset (dev bypass requires explicit co-flag + loopback host)
- `apps/web/app/api/auth/desktop-token/route.ts` — AES-256-GCM encrypted 60s desktop session-transfer token (scrypt KDF, entropy gate)
- `apps/web/app/api/device/poll/route.ts` — Device-link polling with FOR UPDATE row-lock one-time token consumption
- `apps/web/app/api/completion/route.ts` — Ghost-text autocomplete; auth+rate-limited LLM call with strong prompt-injection fencing but NO credit metering
- `apps/web/app/api/billing/analytics/route.ts` — Real per-user analytics aggregated from credit_transactions (user-scoped)
- `apps/web/app/api/memory/route.ts` — User-scoped memory CRUD with bounds clamping and validation

**Risks:**

- 🟡 P2 Top-level /api/completion makes an unmetered LLM call (no credit reservation/deduction) (`apps/web/app/api/completion/route.ts`) — completion/route.ts authenticates + rate-limits but never reserves or deducts credits before calling LLMProviderFactory.sendRequest. Abuse is bounded (Haiku model, max_tokens=150, prompt-completion rate limit), so it is cost-capped rather than a hole, but it is the only chat-style LLM route with zero billing accounting.
- 🟡 P2 Desktop-token 'one-time nonce for replay prevention' is not actually enforced (`apps/web/app/api/auth/desktop-token/route.ts`) — desktop-token/route.ts generates a nonce and embeds it in the encrypted payload but there is no server-side nonce store or burn-on-consume check. Real replay protection is the 60s TTL + AES-GCM integrity; within that window the same encrypted token could be replayed. Doc comment overstates the protection. Low blast radius due to short TTL.
- 🟡 P2 Streaming reconciliation can silently under/over-charge if it throws after stream completes (`apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts`) — stream-transform.ts flush() reconciles estimated vs actual cost; if deductCredits throws it only logs 'CRITICAL ... may require manual adjustment'. The v1-fallback streaming path in v2 explicitly charges the estimate as final because token counts are unavailable. Both are acknowledged tradeoffs but mean ledger drift is possible without an automated repair job.
- ⚪ P3 assertQuota fails open to credit-only flow on gate error (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`) — request-processor.ts catches assertQuota errors and proceeds on the legacy credit-only path. This is intentional resilience, but a persistent quota-service outage would let users bypass tier quotas as long as raw credits remain.

**Gaps:**

- Did not read device/approve, device/link full bodies, settings/_ (2FA, api-keys, team, org), teams/_, agents/_, projects/_, media/video, share/[token], or admin/sso routes in depth -- sampled via grep only; guard patterns (auth+CSRF+rate-limit) appear consistent but per-route authz (team-member role checks, project ownership) was not individually verified.
- Did not confirm whether webhooks/directory-sync and admin/sso/security/directory-sync are wired stubs vs production (flagged by TODO/not-implemented grep on webhooks/directory-sync); portal's TODO was a benign deprecation note, but directory-sync was not opened.
- Did not trace SubscriptionService.allocateCreditsForPeriod / resetCreditsForNewPeriod internals or the Neon stored procs (deduct_credits, get_credit_balance, check_credits_available) for atomicity/double-spend guarantees -- these are the real ledger correctness boundary.
- Did not verify whether any automated job reconciles the 'manual adjustment' ledger-drift cases logged by stream-transform and v2 reconciliation failures.

**Hardening:**

- Add credit metering (or an explicit free-quota counter) to /api/completion ghost-text, or document it as intentionally free and bound it with a per-user daily cap rather than just IP rate limiting.
- Implement actual nonce burn for desktop-token (persist + check-once on consume) or correct the doc comment to stop claiming replay prevention the code does not provide.
- Add an automated reconciliation/repair job (or alert) for the 'may require manual adjustment' ledger-drift paths in stream-transform and v2 reconciliation catch blocks.
- Consider making assertQuota fail-closed (or degrade to a stricter cap) for flagship-tier requests instead of fully fail-open to credit-only, to prevent tier-quota bypass during a quota-service outage.
- Audit the dispersed inline auth/CSRF/rate-limit boilerplate -- the LLM v1 lib decomposition is a good model; a shared withAuthenticatedHandler wrapper would reduce per-route drift risk across the ~90 handlers.

### web-app-pages

**Purpose:** The Next.js App Router surface for apps/web: the marketing site (~100 static/marketing routes), authenticated product surfaces (chat, settings, billing, admin, projects, connectors), auth flows (login/signup/forgot-password via Clerk, plus a CLI/device OAuth approval page), public shared-session viewer, and i18n. proxy.ts is the Vercel routing middleware. v1 product posture is LOCAL-only with managed cloud waitlist-gated.

**Architecture:** App Router with 134 page.tsx and 24 layout.tsx files. Auth is NOT enforced in proxy.ts: proxy.ts wraps clerkMiddleware solely to mint a per-request CSP nonce (forwarded via x-nonce header, read in root layout for script-src). It calls neither auth.protect() nor createRouteMatcher, so it does zero route gating. Instead each protected surface gates itself in its own layout.tsx via `const { userId } = await auth(); if (!userId) redirect('/login?redirectTo=...')` with `export const dynamic = 'force-dynamic'` (confirmed in chat/, settings/, billing/, admin/). Root layout wraps everything in ClerkProvider + Providers + GA4 (only when NEXT_PUBLIC_GA_TRACKING_ID set) and injects JSON-LD. Chat is client-only (dynamic import, ssr:false) behind the layout gate. Login uses Clerk <SignIn> with getSafeRedirectUrl() open-redirect protection (allowlist + relative-only fallback). Many short pages are intentional redirect() shims (/chats->/chat, /chat-multi->/chat, /marketplace->/apps, /settings->/settings/general). Public unauthenticated routes: marketing pages, /share/[token] (token-regex-validated, parameterized Neon queries), /auth/device (device-code approval with explicit consent warning).

**Trust boundary:** Local/BYOK/Managed-cloud trust boundaries are surfaced in product copy (AdminConsolePage, billing) but enforcement lives below this layer (API routes, stores), not in app/ pages. No evidence in the page/layout tier of silent Local->cloud routing. Auth boundary is decentralized: proxy.ts is NOT a trust boundary (CSP only); the real gate is each layout's auth()+redirect. CSP is reasonably strict (nonce-based script-src, frame-ancestors 'none', object-src 'none') with a documented style-src 'unsafe-inline' exception and a sandbox-origin frame-src allowance. Open-redirect is guarded via lib/safe-redirect.ts. Public /share/[token] is token-gated with regex validation + parameterized SQL.

**Key files:**

- `apps/web/proxy.ts` — Vercel routing middleware. clerkMiddleware used ONLY to set CSP nonce + CSP header; performs NO auth gating. Matcher excludes stripe-webhook and audio-transcription paths to preserve raw body for HMAC/multipart.
- `apps/web/app/layout.tsx` — Root layout: ClerkProvider, font setup, reads x-nonce for CSP-safe inline JSON-LD scripts, conditional GA4.
- `apps/web/app/admin/layout.tsx` — Admin gate checks only userId (any signed-in user), NOT admin role.
- `apps/web/features/admin/pages/AdminConsolePage.tsx` — Admin page body: static read-only 'enterprise readiness ledger' built from @agiworkforce/types constants; no tenant data, no mutations.
- `apps/web/app/settings/layout.tsx` — Settings gate (userId redirect) + sidebar nav; NAV_ITEMS list.
- `apps/web/app/billing/page.tsx + billing/layout.tsx` — Authenticated billing dashboard with live Stripe checkout/portal (BillingDashboard, token analytics); gated on userId only.
- `apps/web/app/chat/page.tsx + chat/layout.tsx` — Core chat: client-only WebChatPage (ssr:false) behind userId-redirect layout gate.
- `apps/web/app/login/page.tsx` — Clerk SignIn with getSafeRedirectUrl open-redirect protection.
- `apps/web/lib/safe-redirect.ts` — Open-redirect guard: blocks //, validates against ALLOWED_HOSTS, falls back to relative path.
- `apps/web/app/share/[token]/page.tsx` — Public shared-session viewer; 24-char token regex + parameterized Neon SQL; well-hardened.
- `apps/web/app/auth/device/page.tsx` — CLI/device OAuth approval with explicit 'you are authorizing this device to act as you' consent warning.
- `apps/web/app/dev/inline-toolcall-demo/page.tsx` — Dev-only synthetic-data UI smoke harness, ungated, ships to prod.

**Risks:**

- 🟡 P2 No central auth boundary; gating is per-route in layouts, easy to forget — proxy.ts does zero auth gating (only CSP nonce). Every protected surface must independently add an auth()+redirect layout. A new authenticated route under app/ that omits its own layout gate would be silently public. There is no createRouteMatcher/auth.protect() safety net, so coverage depends on per-directory discipline. File: apps/web/proxy.ts.
- ⚪ P3 /admin page viewable by any signed-in user (no role check) — app/admin/layout.tsx checks only userId, not admin/owner role. Lower severity because AdminConsolePage renders only static policy constants (no tenant data, no mutations) and the real app/api/admin/\* routes DO enforce org admin/owner role. Still, the 'admin' surface is reachable by any authenticated account. File: apps/web/app/admin/layout.tsx.
- ⚪ P3 Live Stripe checkout/billing portal exposed in product UI vs waitlist-gated managed-cloud lock — /billing (BillingDashboard) and /settings/billing surface real Stripe checkout/portal redirects for paid tiers. Product lock keeps managed cloud/subscriptions waitlist/private-beta until ledger/abuse/refund controls proven; marketing /pricing correctly routes to WaitlistForm, but the authenticated billing pages still wire live checkout. Likely in-flight; flag to confirm it is feature-flagged off. Files: apps/web/app/billing/page.tsx, apps/web/features/billing/pages/BillingDashboard.tsx.
- ⚪ P3 Dev demo route /dev/inline-toolcall-demo ships ungated to production — Static synthetic-data UI smoke harness with no auth gate or env guard; publicly reachable in prod. No data exposure (hand-crafted props), so purely cosmetic/debt. File: apps/web/app/dev/inline-toolcall-demo/page.tsx.

**Gaps:**

- Did not read every one of the 134 pages; sampled chat/settings/billing/admin/auth/share/dev plus all sub-25-line pages (confirmed redirect shims). Did not deeply inspect marketing routes (about, careers, blog, compare, features/\*, solutions, use-cases) beyond directory listing.
- Did not verify whether BillingDashboard checkout is feature-flagged/disabled at runtime (would need to read features/billing/services/stripe-payments + any flag); only confirmed the UI wires checkout/portal calls.
- settings/byok, settings/sync, plugins pages matched a 'Coming soon/TODO/return null' grep but I did not open them to distinguish intentional placeholder UI from dead stubs.
- Did not trace where the per-route auth() gate is absent across all 100 route dirs; characterized the pattern from the 4 protected surfaces I read, but a full audit of which app/ dirs lack a gate layout was not performed.
- Concurrent supabase->neon->clerk migration in progress; some import churn (e.g. getNeonDb in share page) may shift. Focused on durable structure.

**Hardening:**

- Add a createRouteMatcher-based auth.protect() in proxy.ts (or a shared protected-segment layout) as a defense-in-depth net so a new authenticated route cannot ship publicly by forgetting its layout gate.
- Add an admin/owner role check (not just userId) to app/admin/layout.tsx, or move /admin behind the same role gate the api/admin/\* routes already enforce.
- Gate or remove /dev/inline-toolcall-demo from production builds (env check or move under a non-shipped path).
- Confirm /billing and /settings/billing checkout flows are feature-flagged off until managed-cloud waitlist lock is lifted; consider routing to WaitlistForm like /pricing does.
- Track the style-src 'unsafe-inline' CSP exception (already noted in proxy.ts comment) toward nonce-based styles.

### web-features-components

**Purpose:** Feature UIs and shared components for the AGI Workforce web app (apps/web): the chat surface (193 files — composer, message list, artifacts, sidebar, dialogs, stores), settings (AI provider config, user settings, 2FA, API keys), projects (knowledge files, sidebar), analytics, support, connectors, billing, teams, plugins, plus marketing/static pages and a shared shadcn-based UI kit under components/ui.

**Architecture:** Feature-sliced architecture under apps/web/features/_ with per-feature barrels (index.ts), pages/, components/, hooks/, services/, and Zustand stores/. Data fetching goes through React Query hooks (e.g. features/settings/hooks/use-settings-queries.ts) that delegate to a service layer (e.g. features/settings/services/user-preferences.ts) which calls Next.js route handlers under app/api/_. Chat streaming bypasses the service class and goes directly through useChatStream -> /api/llm/v1/chat/completions (SSE). Shared UI lives in components/ui (shadcn) consumed via @shared/ui/_ aliases. Project state is local-first (Zustand + localStorage persist: agi-projects, agi-project-meta-web), consistent with the v1 LOCAL-ONLY policy. App-dir route pages (app/_/page.tsx) thinly wrap feature page components. Web appears cloud/BYOK-oriented with no Local trust boundary on this surface, so no silent Local->cloud routing risk was found here.

**Trust boundary:** No Local->BYOK->Managed-cloud trust boundary exists on the web surface; chat streams to /api/llm/v1/chat/completions with no local mode to silently route away from. No silent Local->cloud routing risk found in features/ or components/. AIConfiguration stores provider API keys and tests them via /api/settings/test-provider (BYOK path) — keys transit the browser to the server; 2FA TOTP secrets are explicitly kept server-side (TODO comments enforce no plaintext browser transit), which is the correct boundary.

**Key files:**

- `apps/web/features/analytics/pages/AnalyticsDashboard.tsx` — Fully fabricated analytics dashboard: buildMockData() invents executions/tokens/costs, model distribution, top tools, 40 fake activity rows, and a named-user team leaderboard ('Priya S.', 'Marcus T.', etc.). Exported from the analytics barrel as 'Canonical Web analytics feature' but NOT routed in app/.
- `apps/web/features/settings/services/user-preferences.ts` — Settings service. 2FA methods hit real routes (/api/settings/2fa/\*), but getAPIKeys() always returns [] and createAPIKey()/deleteAPIKey() always return error 'API key management not yet available via API'. Many TODO'd methods for profile/preferences/org/team routes that do not exist.
- `apps/web/features/settings/pages/UserSettings.tsx` — Renders ApiKeysPanel + create form wired to the stubbed createAPIKey mutation, so the API-keys section is a dead shell that always errors on submit. 2FA panel and data export/delete are real.
- `apps/web/features/settings/hooks/use-settings-queries.ts` — React Query hooks; ~10 TODOs noting missing org/team/activity/audit-log API routes the hooks would call.
- `apps/web/features/support/services/support-service.ts` — Support service. Ticket create/list hit /api/support (real), but getFaqs()/searchFaqs() hardcode return {data: []} and getTicket()/reply are 'Not implemented' DESPITE existing app/api/support/faqs and [id] routes. sendEmailNotification() POSTs to /.netlify/functions/notifications/send-email — a dead endpoint in a Vercel/Next app.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` — Artifact preview — real: copy, multi-format download (html/txt/md), version switching, fullscreen, open-in-new-tab handlers all wired.
- `apps/web/features/projects/components/KnowledgeFilesPanel.tsx` — Real file upload to Vercel Blob (put) + /api/projects/[id]/knowledge-files; not a stub.
- `apps/web/features/chat/components/tokens/TokenAnalyticsDashboard.tsx` — The analytics dashboard actually routed (via app/billing/page.tsx); appears prop-driven/real (no mock generators), unlike features/analytics/AnalyticsDashboard.tsx.

**Risks:**

- 🟠 P1 Fabricated analytics dashboard exported as canonical feature (dormant landmine) (`apps/web/features/analytics/pages/AnalyticsDashboard.tsx`) — features/analytics/pages/AnalyticsDashboard.tsx renders entirely invented metrics, costs, and a named-user leaderboard (Priya S., Marcus T., etc.). It is exported from features/analytics/index.ts as the 'Canonical Web analytics feature' but is NOT routed in app/, so not currently on a user path (hence P1, not P0). Risk: anyone wiring @features/analytics to a route ships fabricated user-facing data and fake employee names.
- 🟠 P1 API Keys settings section is a dead shell that always fails (`apps/web/features/settings/services/user-preferences.ts`) — UserSettings renders ApiKeysPanel with a functional-looking 'Create API Key' form, but settingsService.createAPIKey() unconditionally returns error 'API key management not yet available via API' and getAPIKeys() always returns []. Users see a fully-presented management UI where create/list/delete silently no-op or error.
- 🟠 P1 Support email notifications POST to a dead Netlify endpoint (`apps/web/features/support/services/support-service.ts`) — support-service.ts sendEmailNotification()/sendStatusUpdateNotification() fetch /.netlify/functions/notifications/send-email. This is a Vercel/Next.js project (per CLAUDE.md proxy.ts rule) with no Netlify functions; the call 404s, so support/ticket email notifications fail silently (caught and logged).
- 🟡 P2 Support FAQ/ticket-detail methods return empty despite existing API routes (`apps/web/features/support/services/support-service.ts`) — getFaqs()/searchFaqs() hardcode {data: []} and getTicket()/reply return 'Not implemented', yet app/api/support/faqs and app/api/support/[id] (+ /replies) route handlers exist. The UI consuming these shows perpetually-empty FAQs / no ticket detail even though the backend may serve them.
- 🟡 P2 Settings hooks reference ~10 nonexistent API routes (`apps/web/features/settings/hooks/use-settings-queries.ts`) — use-settings-queries.ts and user-preferences.ts carry TODOs for /api/settings/organization, /team, /activity, /audit-logs, /preferences, /profile, /api-keys routes that are not implemented. Any settings tabs surfacing org/team/activity/audit data are unwired or empty.
- ⚪ P3 Intentional 'Coming Soon' staging in connectors and v3 shell (`apps/web/features/chat/v3/WebShellV3.tsx`) — ConnectorsPage MCP-server registration, ConnectorCard phase>1 badges, and WebShellV3 'Cowork/Code mode coming soon' are intentional staging (labeled, not pretending to work) — false-positive for dead buttons; recorded for completeness, not a bug.

**Gaps:**

- Did not fully trace the chat send/stream path (useChatStream -> /api/llm/v1/chat/completions) for token accounting or error handling; only confirmed no Local trust boundary exists on web.
- 'Memory' surface lives OUTSIDE assigned dirs at app/features/memory/page.tsx and app/settings/memory/page.tsx (not features/ or components/); not inspected.
- Did not open the shared components/ui kit (44 dirs) or the large 2096-line ConnectorsPage.tsx beyond grep; OAuth-connector flows and the 1218-line ChatComposerNew unexamined in depth.
- Did not verify whether app/api/support/faqs route handlers actually return data (only confirmed the client service ignores them).
- TokenAnalyticsDashboard (the routed dashboard) was confirmed non-mock by grep but not read line-by-line for prop-source correctness.

**Hardening:**

- Remove or clearly gate features/analytics/AnalyticsDashboard.tsx (and its barrel export) so fabricated metrics/named users can never be routed to production; or back it with /api/usage/analytics like app/settings/usage/page.tsx already does.
- Either implement /api/settings/api-keys routes or hide/disable the ApiKeysPanel create UI so it does not present as functional.
- Replace the /.netlify/functions/\* support email call with the project's actual Vercel/Next email route, or remove it and surface a real failure path.
- Wire support-service getFaqs/getTicket to the existing app/api/support/faqs and [id] routes instead of returning empty/Not-implemented.

### web-infra (apps/web/shared, apps/web/lib, apps/web/stores)

**Purpose:** Shared infrastructure for the Next.js web surface: server-side data access (Neon Postgres via a vendor-neutral data-layer adapter), auth/CSRF/rate-limit/error-handling security primitives, client-side Zustand stores for chat/auth/billing/UI, and the cross-device conversation sync + Local->BYOK handoff flows. shared/ui is the shadcn-style component library (out of scope for risk analysis).

**Architecture:** Server data path: route handlers call getNeonDb()/getNeonChatDb() (lib/server/neon-db.ts, neon-chat.ts) which return a singleton DatabaseAdapter from @agiworkforce/data-layer (NeonDatabaseAdapter wrapping @neondatabase/serverless Pool). Auth is Clerk: api-auth.ts resolves a user via Clerk session cookie OR a verified Bearer JWT (verifyToken from @clerk/backend); auth-guards.ts layers role checks from Clerk publicMetadata. CSRF (lib/csrf.ts) uses HMAC tokens with secret rotation, anchored cookie parsing, constant-time compare, and a cryptographically-verified Bearer-bypass. rate-limit.ts is Upstash Redis with per-endpoint failClosed config and a fail-fast guard requiring Redis in production runtime. error-handler.ts maps AppError to generic client messages, only exposing an allowlist of safe codes (prevents SQL/Neon detail leakage). Client: TWO chat store systems coexist (legacy stores/chatStore.ts + unified/chat/chatStore.ts), both actively imported. auth/billing live in stores/unified/auth.ts (hydrates from /api/me). conversationSync.ts drives 3-device sync over REST with last-write-wins; Realtime is removed (subscribe is a no-op stub). Local->BYOK handoff (features/chat/lib/localByokHandoff.ts) implements the locked trust-boundary rule with context selection, redaction, size cap, and explicit accept.

**Trust boundary:** Local / BYOK / Managed Cloud separation is respected in this area: localByokHandoff.ts implements the locked Local->BYOK rule (explicit fork, context selection, redaction via buildLocalToByokHandoffDraft, 90k-char preview cap, explicit accept message) with no silent routing. conversationSync constructor calls assertSurfaceCanSyncChats(origin) to fail-fast if a developer surface tries to enroll in consumer chat sync. The primary trust-boundary WEAKNESS here is not cloud routing but intra-cloud tenant isolation: the Neon adapter's RLS design is unenforced (no DB policies), so user-to-user isolation rests entirely on application-level WHERE filters (see P1).

**Key files:**

- `apps/web/lib/server/neon-db.ts` — Singleton Neon DatabaseAdapter factory (the live DB entry point for all web routes)
- `apps/web/lib/server/neon-chat.ts` — Chat DB accessor + requireCurrentUserId (Clerk auth) for the chat data path
- `packages/data-layer/src/adapters/neon.ts` — NeonDatabaseAdapter; documents an RLS-via-SET-LOCAL withUser() contract that the web app largely does not use and no migration enforces
- `apps/web/lib/api-auth.ts` — Clerk session + Bearer-JWT auth resolution for API routes
- `apps/web/lib/csrf.ts` — HMAC CSRF with secret rotation, anchored cookie parse, verified Bearer-bypass (well-audited)
- `apps/web/lib/rate-limit.ts` — Upstash Redis rate limiter; per-endpoint failClosed; prod fail-fast; IP-key uses rightmost XFF
- `apps/web/lib/error-handler.ts` — Maps errors to generic responses; allowlists safe codes to prevent SQL/service detail leakage
- `apps/web/lib/conversationSync.ts` — REST-based 3-device sync, last-write-wins merge; Realtime removed (no-op subscribe)
- `apps/web/features/chat/lib/localByokHandoff.ts` — Local->BYOK fork with redaction/consent - enforces the locked trust-boundary rule
- `apps/web/stores/unified/chat/chatStore.ts` — Unified chat store (1653 lines) - one of two coexisting chat stores
- `apps/web/stores/chatStore.ts` — Legacy chat store (505 lines) still imported by chat pages/hooks alongside the unified one
- `apps/web/stores/unified/auth.ts` — Clerk-backed auth+billing Zustand store; hydrates from /api/me
- `apps/web/lib/secure-random.ts` — Isomorphic CSPRNG; throws instead of falling back to Math.random (ESLint-enforced)

**Risks:**

- 🟠 P1 Tenant isolation on the chat/data path is WHERE-clause-only; no RLS backstop exists (`apps/web/lib/server/neon-chat.ts + packages/data-layer/src/adapters/neon.ts + apps/web/db/neon`) — The Neon adapter documents and implements an RLS contract (withUser() -> SET LOCAL request.jwt.claim.sub) but the chat path calls getNeonChatDb()/getNeonDb() in the raw service context (~102 call sites in app/api) so RLS is never bound. withUser() is used by only 5 service files. A grep of apps/web/db/neon found ZERO CREATE POLICY / ROW LEVEL SECURITY statements, so the DB provides no backstop: every per-row authorization depends solely on a hand-written WHERE user_id = $1. The routes spot-checked (conversations list, memory [id] GET/PUT/DELETE, bookmarks all verbs, messages POST via conversation-ownership pre-check) all filter correctly, so this is not a live leak today - but web_messages has no user_id column and is queried/mutated by conversation_id alone, relying on an ownership pre-check on web_conversations. A single future query against web_messages (or any table) by id/conversation_id that skips the ownership check is an immediate cross-tenant data leak with no RLS to catch it. Fragile, security-critical, and the documented design intent (RLS) is unfulfilled.
- 🟡 P2 Dual chat-store systems coexist and are both actively imported (`apps/web/stores/chatStore.ts + apps/web/stores/unified/chat/chatStore.ts`) — Legacy stores/chatStore.ts (505 LOC, imported by UnifiedChatPage, WebChatPage, useChatStream, useConversations, CommandPalette, ChatSettings, localByokHandoff) and unified/chat/chatStore.ts (1653 LOC, imported by WebSidebar, use-unified-adapter, session persistence) both drive chat state. This split-brain risks divergent message/conversation state between components reading different stores, and roughly doubles the surface for the migration. Needs consolidation to one canonical store.
- 🟡 P2 5 service files call withUser(jwt) which decodes sub WITHOUT verifying the JWT signature (`packages/data-layer/src/adapters/neon.ts (decodeJwtSub) consumed by apps/web/lib/services/*`) — NeonDatabaseAdapter.withUser() explicitly does NOT verify the JWT - it only base64-decodes the middle segment to read sub. This is only sound if the caller verified the token upstream first. If any of the 5 consuming services (organization, subscription, audit, waitlist, api-key) ever receives an unverified/attacker-supplied token, RLS context would be bound to a forged sub. Verify each call site sources the jwt from a Clerk-verified context. (Not confirmed as exploitable in this pass - flagged for the auth review.)
- ⚪ P3 conversationSync merge is last-write-wins with no vector clock; ties favor remote (`apps/web/lib/conversationSync.ts`) — Cross-device sync resolves conflicts purely by updated_at timestamp (remote wins on tie). Clock skew across web/mobile/desktop can silently drop the loser's edits. Acceptable for chat metadata but worth documenting as a known data-loss edge for the 3-device story.

**Gaps:**

- Did not read the unified chat store internals (1653 LOC) deeply - could not fully confirm whether legacy and unified stores write to the same persisted localStorage key (would worsen the split-brain P2).
- Did not trace where the jwt passed to withUser() in the 5 service files originates (P2 above) - needs the auth-review agent to confirm it is always Clerk-verified before binding.
- Did not verify the Neon DB role's permissions: if the connection role bypasses RLS (likely, given no policies exist) that confirms WHERE-only isolation, but the role grants in apps/web/db/neon were not inspected.
- Did not enumerate all ~102 getNeonChatDb/getNeonDb call sites to confirm every one includes a user_id/ownership predicate - spot-checked 5 routes only; a full sweep is needed to upgrade/downgrade the P1.
- shared/ui component library was not reviewed for risks (out of scope per focus); shared/ui/missing-modules.d.ts suggests some ambient module stubs worth a glance.

**Hardening:**

- Enable Postgres RLS on web_conversations, web_messages, user_memories, message_bookmarks and route chat queries through adapter.withUser(verifiedJwt) so the documented adapter contract becomes a real backstop instead of dead code.
- Add a user_id column to web_messages (or a CI lint) so message-level queries can filter directly rather than depending on an upstream ownership pre-check.
- Consolidate the legacy and unified chat stores into one canonical store to remove split-brain risk.
- Add a CI grep/lint that fails any getNeonDb/getNeonChatDb query string touching a per-user table without a user_id predicate, until RLS lands.
- Document and ideally signature-verify the jwt before any withUser() call in apps/web/lib/services/\*.

### desktop-fe-features

**Purpose:** React feature components for the AGI desktop (Tauri) app under apps/desktop/src/features. Houses the v3 desktop shell (composer-first chat), the chat surface, settings modals, artifacts workbench, MCP management, connectors, and a large amount of cowork/code/marketplace/billing scaffolding built to a design spec but not yet wired into the live app.

**Architecture:** The live desktop UI is gated by feature flag DESKTOP_CHAT_V3 (default-on, enabledForAll, with localOverride kill-switch). When on, App.tsx mounts DesktopShellV3, which renders ONLY: v3 Sidebar (collapsible 64/240px) + the real chat from @agiworkforce/unified-chat (ChatInterface) + EmptyChat (greeting + QuickChips) + CapModal (budget hard-stop). The actual chat UX, streaming, and message rendering live in the unified-chat package, OUTSIDE this area; the in-repo features/chat/\* dir (index.tsx 1728 lines, ChatInputArea, MessageBubble, ArtifactRenderer) appears to be the older/legacy path. The v3 barrel (features/v3/index.ts) exports ~40 components but most are unmounted: CodeModeHome, CoworkHome/Dispatch/Projects/Scheduled/Artifacts, ArtifactWorkspace, Pricing, PluginMarketplace/Detail/Hub, SkillsView, ConnectorsView, Composer, ActiveChat, flow modals (Pause/Downgrade/Cancel) — none have an external JSX mount; they are shipped-but-dark scaffolding. Sidebar nav clicks are forwarded via onNavigateView to App.tsx, which routes a subset to settings dialogs. Artifacts: features/chat/artifacts/HtmlArtifact runs user HTML/JS in a sandboxed iframe (sandbox="allow-scripts allow-modals", CSP injected, connect-src none); features/artifacts/publishAdapter writes file:// locally only (respects v1 local-only). MCP credential manager stores secrets in the OS keychain. State via Zustand stores (chat, agentTaskStore, mcpServersStore, budgetStore, auth).

**Trust boundary:** v1 local-only + cloud-waitlist boundary is respected on the MOUNTED paths: publishAdapter writes file:// locally only with cloud deferred; the mounted PlansModal routes paid tiers to external pricing/waitlist URLs via shell rather than in-app purchase. The boundary is at risk only in dead code: v3 Pricing.tsx / SpendStackImporter / DowngradeFlow wire live Stripe openCheckout(), which would violate the cloud-waitlist lock if ever mounted. No silent Local->cloud routing observed in this area (chat routing lives in unified-chat, out of scope). HtmlArtifact correctly isolates user JS (no allow-same-origin, connect-src none). MCP secrets are stated to live in the OS keychain.

**Key files:**

- `apps/desktop/src/features/v3/DesktopShellV3.tsx` — Live v3 shell. Renders Sidebar + unified-chat ChatInterface + EmptyChat + CapModal only; explicitly does NOT expose Code/Cowork mode tabs (V3Mode is locked to 'chat').
- `apps/desktop/src/features/v3/Sidebar.tsx` — Mounted sidebar. handleNavClick (L151-164) maps nav items to view strings (cowork-scheduled, cowork-artifacts, cowork-dispatch, customize-home, artifacts, voice-settings) that App.tsx's onNavigateView does not handle -> dead clicks.
- `apps/desktop/src/App.tsx` — Mounts DesktopShellV3 (L1362) behind isV3DesktopChatEnabled; onNavigateView switch (L1372-1384) only handles customize/connectors/skills/projects/pricing/billing/byok with no else branch.
- `apps/desktop/src/features/v3/CodeModeHome.tsx` — Unmounted. Hardcoded fabricated usage stats (612 sessions, 697,587 messages, 134.6M tokens, 'Opus 4.7' favorite) + Math.random heatmap + fake model-usage bars presented as real user data.
- `apps/desktop/src/features/v3/PluginMarketplace.tsx` — Unmounted. Static CATALOG with fabricated install counts (84k/203k), fake authors ('Anthropic'/'Partners'), and hardcoded installed:true flags. PluginDetail.tsx shares the same fabricated installs.
- `apps/desktop/src/features/v3/Pricing.tsx` — Unmounted. Full pricing grid with live Stripe openCheckout() across tiers; SpendStackImporter/DowngradeFlow also call openCheckout. Live billing UI conflicts with v1-local-only + cloud-waitlist lock, but is not reachable.
- `apps/desktop/src/features/pricing/PlansModal.tsx` — The billing modal that IS mounted (App.tsx open-plans-modal event). Routes paid tiers to external pricing/waitlist URLs via shell rather than in-app Stripe — respects the cloud-waitlist lock.
- `apps/desktop/src/features/chat/artifacts/HtmlArtifact.tsx` — Sandboxed HTML/JS preview iframe. sandbox=allow-scripts allow-modals (no allow-same-origin), CSP with connect-src none / frame-src none injected. Security trade-offs documented.
- `apps/desktop/src/features/artifacts/publishAdapter.ts` — Tauri publish adapter; local file:// write only, cloud publish deferred per v1-local-only lock.
- `apps/desktop/src/services/featureFlags.ts` — DESKTOP_CHAT_V3 default enabled:true/enabledForAll:true (L205-211); makes the v3 shell the live path for all users.

**Risks:**

- 🟡 P2 Mounted v3 Sidebar nav items are silent no-ops (`apps/desktop/src/features/v3/Sidebar.tsx`) — Sidebar IS mounted in DesktopShellV3. handleNavClick emits view strings cowork-scheduled, cowork-artifacts, cowork-dispatch, customize-home, artifacts, voice-settings; App.tsx onNavigateView (no else branch) only handles a different key set. 5 of 6 expanded sidebar nav items click into nothing on the real user path — broken core navigation in the live shell.
- 🟡 P2 Fabricated user-facing usage stats one wire-up from shipping (`apps/desktop/src/features/v3/CodeModeHome.tsx`) — Hardcoded fake session/message/token totals and a Math.random heatmap presented as the user's real activity. Currently unmounted, so not yet user-facing (not P0), but the component is fully built and DESKTOP_CHAT_V3 is default-on; a single onNavigateView route to CodeModeHome would ship fabricated data to every user.
- 🟡 P2 Fabricated marketplace catalog (fake installs/authors/installed flags) (`apps/desktop/src/features/v3/PluginMarketplace.tsx`) — Static CATALOG fabricates install counts (84k/203k), authors ('Anthropic'/'Partners'), and installed:true. PluginDetail repeats it. Unmounted today, but same latent risk: becomes fabricated user-facing data the moment the view is wired.
- 🟡 P2 Unmounted live-Stripe pricing/checkout conflicts with cloud-waitlist lock (`apps/desktop/src/features/v3/Pricing.tsx`) — Pricing/SpendStackImporter/DowngradeFlow call openCheckout() for in-app Stripe purchases, which the v1-local-only + cloud-waitlist lock forbids until ledgering/abuse/refund controls are proven. Mitigated only by being unmounted; the actually-mounted PlansModal correctly routes to external waitlist URLs.
- ⚪ P3 Large quantity of shipped-but-dark v3 scaffolding (`apps/desktop/src/features/v3/index.ts`) — ~40 v3 components are barrel-exported but have zero external mounts (Cowork\* views, ArtifactWorkspace, Composer, ActiveChat, SkillsView, ConnectorsView, PluginsHub, flow modals). Tech-debt/bundle bloat and a maintenance hazard: contributors may assume these are live and reachable.

**Gaps:**

- Sidebar emits nav view keys (cowork-scheduled, cowork-artifacts, cowork-dispatch, customize-home, artifacts, voice-settings) that App.tsx onNavigateView does not handle and that map to components which are never mounted — the cowork/code/artifact-workspace surfaces are unreachable in v1.
- Did not trace the live chat experience itself (ChatInterface lives in @agiworkforce/unified-chat, a separate package/area) — cannot assert the streaming/message-render path is clean from this area alone.
- Did not read every settings modal under features/settings (~50 files); only confirmed structure exists. ComputerUseConsentDialog / AutomationPermissions and OAuthCredentialsPanel were not inspected for consent/secret correctness.
- Did not verify MCPCredentialManager keychain claims against the Rust backend command it invokes; only confirmed the UI states secrets go to the system keychain.
- Severity note: task P0 'fabricated user-facing data' requires data to reach a user; the fabricated stats/catalog/pricing all live in unmounted components, so rated P2 (latent, default-on flag, one wire-up away) not P0. The one genuine live-path defect is the Sidebar nav no-op. The live shell (DesktopShellV3 + EmptyChat + CapModal) is otherwise clean.

**Hardening:**

- Add an exhaustive switch / default warn-log in App.tsx onNavigateView so unmapped Sidebar nav keys fail loudly instead of silently, and reconcile Sidebar's view-string vocabulary with what App.tsx actually handles.
- Either wire the cowork/code/artifact-workspace views (and replace fabricated CodeModeHome stats / PluginMarketplace catalog with real store-backed data) or remove the unmounted components and their barrel exports to shrink the bundle and remove the latent fabricated-data risk.
- Gate or delete the live-Stripe v3 Pricing/SpendStackImporter/DowngradeFlow path so it cannot be mounted while the cloud-waitlist lock is in force.
- Trim features/v3/index.ts to export only mounted components so reachability is discoverable from the barrel.

### desktop-fe-state (apps/desktop/src: stores, services, api, hooks, lib)

**Purpose:** The frontend state + IPC layer for the Tauri desktop app. Zustand stores hold UI/domain state; a thin api/ layer wraps Rust Tauri commands; services/ provide cross-cutting helpers (analytics, cache, dispatch/HMAC, subscription, waitlist); lib/ holds the central tauri-mock invoke router, routing/classification, and stream/runtime utilities. This layer is the boundary between React UI and the Rust core.

**Architecture:** see above

**Trust boundary:** Local->cloud boundary is respected in the desktop surface. tauri-mock.invoke only routes commands to the cloud HTTP API when isCloudWeb (the web build of the shared codebase, where isTauri is false), never inside the packaged desktop app. In a real desktop build invoke always hits the local Rust core; if a command somehow has no handler it throws a 'requires desktop app' error rather than silently fabricating or routing to cloud. cloudApi uses CSRF + bearer token + credentials:'include' and an empty base URL in web mode. No evidence of silent Local-session-to-cloud leakage in this layer. dispatch.ts keeps mobile-control-message crypto in Rust.

**Key files:**

- `apps/desktop/src/lib/tauri-mock.ts` — Central invoke/listen/emit router and the real-vs-cloud-vs-mock runtime gate (2452 lines). The single most important file for understanding what is wired to real Tauri vs fabricated.
- `apps/desktop/src/lib/runtimeEnvironment.ts` — Defines isTauri/isTestEnvironment/isCloudWeb — the trust-boundary discriminators used everywhere.
- `apps/desktop/src/services/analyticsQueries.ts` — Mix of real Tauri-backed queries and HARDCODED fabricated analytics (retention cohorts, funnels, category breakdowns, error stats, Math.random perf metrics).
- `apps/desktop/src/features/analytics/UsageDashboard.tsx` — Consumer that renders fabricated queryCategoryData('features') in the user-facing Analytics Dashboard with no demo/sample label.
- `apps/desktop/src/api/orchestrator.ts` — Clean multi-agent + workflow command wrappers; real invoke under isTauri, console.debug mocks only in browser.
- `apps/desktop/src/api/artifacts.ts` — 24 artifact CRUD/stream/version commands, all wired to real invoke via ArtifactResponse envelope.
- `apps/desktop/src/services/cacheService.ts` — Cache stats/clear/configure over real invoke with safe empty-default fallbacks on error.
- `apps/desktop/src/services/dispatch.ts` — Mobile->desktop control-message HMAC verify/sign; crypto delegated to Rust, dedup/replay handled, transitional-unsigned cutoff enforced.
- `apps/desktop/src/api/cloudApi.ts` — Cloud web HTTP client (CSRF + bearer + credentials:'include'); base URL empty in web, API_BASE_URL only under isTauri.
- `apps/desktop/src/lib/cloudChatStream.ts` — Bridges cloud SSE into synthetic Tauri events so stream hooks work identically in web mode.

**Risks:**

- 🟠 P1 Fabricated feature-usage analytics rendered as real in UsageDashboard — services/analyticsQueries.ts queryCategoryData('features') returns hardcoded percentages (Parallel Execution 35%, Browser Automation 28%, Code Completion 18%, ...). UsageDashboard.tsx (the production Analytics Dashboard) renders this with no 'sample/demo' label alongside genuinely real Tauri-backed tiles (system/app metrics, DAU series, top events), so users see invented numbers presented as their actual usage. This is user-facing fabricated data.
- 🟡 P2 Dead fabricated analytics exports invite future misuse — queryRetentionRate, queryConversionFunnel, queryErrorStats, queryPerformanceMetrics (uses Math.random) return fully hardcoded cohort/funnel/error/perf numbers. They are not currently consumed by the dashboard (only queryCategoryData is), but they remain exported and look like real query functions, so any future wiring would silently surface fabricated metrics. Should be deleted or clearly marked/gated.
- ⚪ P3 queryUsageStats etc. swallow Tauri errors into zeroed defaults — cacheService and analyticsQueries catch invoke failures and return DEFAULT\_\*/empty stats. Reasonable for resilience, but a persistently failing backend renders as all-zero metrics with no error surfaced to the user, which can read as 'no usage' rather than 'analytics unavailable'.

**Gaps:**

- Did not read every store (~70) or every api/\*.ts (~58); sampled the highest-signal ones. Other stores may hold their own local fallbacks worth a deeper pass.
- Did not trace whether queryUsageStats/queryTimeSeriesData backend commands (analytics_get_usage_stats, analytics_get_metric_trends) are actually implemented in the Rust core — verified only the TS side calls real invoke.
- Did not exhaustively confirm every persist() store uses safe storage (storageFallback.ts exists but not read in full).
- Concurrent supabase->neon->clerk migration may be churning auth.ts/cloudApi imports; treated import churn as transient per instructions.

**Hardening:**

- Delete or hard-gate the fabricated analytics functions in analyticsQueries.ts; route the feature-breakdown chart to a real Tauri command (e.g. analytics_get_feature_usage) or hide the card until backed by real data.
- Add an explicit 'analytics unavailable' UI state distinct from genuine zero so swallowed invoke errors are not shown as zeroed real metrics.
- Consider a lint/CI guard that flags hardcoded numeric literals returned from functions named query*/get* in services/ to prevent reintroducing fabricated data.
- Add a unit test asserting tauri-mock.invoke throws (not fabricates) in the non-test, non-cloud-web path to lock the trust-boundary gate.

### desktop-core-agi

**Purpose:** The AGI/agent core for the Tauri desktop app: a goal-driven autonomous agent system. AGICore plans a goal into steps, executes them via a registry of tool executors (file/code/git/browser/terminal/deploy/etc.), reflects on outcomes, and learns. AgentOrchestrator manages a pool of AGICore agents. AutonomousAgent is a parallel task-based agent with approval gating, budget caps, self-healing/replanning. Orchestration provides workflow execution and email-triggered workflows.

**Architecture:** Two parallel agent stacks coexist. (1) core/agi: AGICore (core.rs) owns planner+executor+reflection+learning+resource_manager; submit_goal spawns a tokio task running achieve_goal's plan/execute/reflect loop (5min hard timeout, iteration cap, pause/cancel via atomics + JoinHandle.abort). AGIExecutor (executor.rs) dispatches each step through a ToolExecutionGuard security check, then ExecutorRegistry to a concrete ToolExecutor, with a result cache and hook/event emission. Code runs in SandboxManager (sandbox.rs): execve-style arg passing (no shell), workspace-confined HOME/TMP, kill_on_drop. AgentOrchestrator (orchestrator.rs) wraps multiple AGICores with per-agent AgentStatus and resource locks. (2) core/agent: AutonomousAgent (autonomous.rs) runs a separate Task/TaskStep model with ApprovalController escalation, per-task/session USD budget caps, LLM replanning, checkpoint persistence. Orchestration layer (workflow_executor/scheduler, email_trigger_service) drives workflows. Trust boundary: each step passes ToolExecutionGuard.validate_tool_call before execution; sandbox isolates code; CodeExecutor pre-screens dangerous patterns. UI entry: chat send_message_execution -> AgentOrchestrator::process_instruction; agi.rs commands -> spawn_agent/wait_for_all.

**Trust boundary:** Per-step security is enforced: AGIExecutor.execute_tool_impl runs ToolExecutionGuard.validate_tool_call before any executor dispatch, and the sandbox uses execve-style arg passing (no shell) with workspace-confined HOME/TMP/PATH and kill_on_drop. Honest in-code caveat that network isolation is advisory. Local->cloud concern: CodeExecutor::llm_analyze hardcodes provider: Some(Provider::Anthropic) with prefer_cloud_credits:false, sending a 4000-byte slice of the user's code to a cloud LLM for analysis. Whether this respects the v1 Local-only trust boundary depends on LLMRouter enforcement (likely degrades to no candidates without cloud creds, but unverified here); the same forced-Anthropic pattern should be audited across executors. DeployExecutor and EmailTriggerService deliberately reach cloud (Vercel/Gmail), appropriate for those tools but must stay waitlist/consent-gated per locked product rules.

**Key files:**

- `apps/desktop/src-tauri/src/core/agi/core.rs` — AGICore: goal submit/achieve loop, plan-execute-reflect, cancel/pause, poisoned-mutex recovery, context-memory truncation
- `apps/desktop/src-tauri/src/core/agi/orchestrator.rs` — AgentOrchestrator: multi-agent pool, AgentStatus lifecycle, process_instruction (chat entry), PDF attachment enrichment, resource locks
- `apps/desktop/src-tauri/src/core/agi/executor.rs` — AGIExecutor: per-step security validation + ExecutorRegistry dispatch + caching + hooks
- `apps/desktop/src-tauri/src/core/agi/sandbox.rs` — SandboxManager: execve-style code execution, workspace confinement, advisory (not enforced) network isolation
- `apps/desktop/src-tauri/src/core/agi/executors/code_executor.rs` — code_execute/code_analyze: dangerous-pattern substring screen, sandbox exec, forced-Anthropic LLM analysis
- `apps/desktop/src-tauri/src/core/agi/executors/deploy_executor.rs` — deploy_project/status/list via Vercel MCP, SQLite tracking; fabricates deployment URL on missing MCP url
- `apps/desktop/src-tauri/src/core/agent/autonomous.rs` — AutonomousAgent: task queue, approval gating, budget caps, replan/self-heal, checkpoints
- `apps/desktop/src-tauri/src/core/orchestration/email_trigger_service.rs` — Email-trigger service: persists triggers but poll loop is a stub that never matches or fires workflows

**Risks:**

- 🔴 P0 UTF-8 byte-slice panic on PDF attachment text in process_instruction (`apps/desktop/src-tauri/src/core/agi/orchestrator.rs`) — ~line 622: format!("{}... (truncated)", &text[..10000]) byte-indexes PDF-extracted text. PDF text routinely contains multibyte chars (smart quotes, em-dashes, accents, non-Latin); if byte 10000 lands mid-codepoint Rust panics. On the live chat->agent attachment path (called from chat/send_message_execution.rs). Contrast autonomous.rs::truncate_str which correctly uses .chars().take(). Recurring pattern.
- 🔴 P0 More byte-slice panics in CodeExecutor on user/LLM code (`apps/desktop/src-tauri/src/core/agi/executors/code_executor.rs`) — ~line 538 "code_preview": &code[..code.len().min(100)] and ~line 787 &code[..4000] in llm_analyze both byte-slice arbitrary code. Any multibyte char straddling the cut point panics the executor task on a user code path (code_execute / code_analyze).
- 🟠 P1 Orchestrator never sets AgentState::Completed; chat tasks always appear to time out (`apps/desktop/src-tauri/src/core/agi/orchestrator.rs`) — AgentStatus.status is set Running at spawn and only ever written to Failed/Paused/Resumed - never Completed (grep confirms Completed is only read). The AGICore worker updates its own execution_contexts but nothing flips the orchestrator status. process_instruction polls for Completed for 120s and returns 'timed out' even on success; wait_for_all/get_agent_result never observe completion. Worse: once achieve_goal calls cleanup_goal the goal is removed from execution_contexts, so get_agent_status then returns None and progress/current_step go stale.
- 🟠 P1 Email-triggered workflows never fire (stub poll loop) (`apps/desktop/src-tauri/src/core/orchestration/email_trigger_service.rs`) — register_trigger persists triggers and start() spawns a 60s poll loop, but check_email_triggers never syncs Gmail nor matches: it only advances last_history_id and never calls scheduler.trigger_on_event (only in a comment). The matcher email_matches_trigger is #[cfg(test)] only. Users can register triggers that silently never execute. Mitigant: no production caller of EmailTriggerService::start or WorkflowScheduler::register_email_trigger found in sys/, so the feature may be unsurfaced - verify before shipping a UI.
- 🟠 P1 deploy_project fabricates a deployment URL on missing MCP result (`apps/desktop/src-tauri/src/core/agi/executors/deploy_executor.rs`) — call_vercel_mcp_deploy falls back to format!("https://{}.vercel.app", project_name) when the MCP response lacks url/deployment_url, yet the deploy is recorded status='deployed' and returned success:true. Unverified user-facing data presented as a live deployment link. Escalate to P0 if the UI shows it as the authoritative 'deployment is live' URL with no caveat.
- 🟡 P2 Dangerous-pattern screen is naive substring matching, bypassable (`apps/desktop/src-tauri/src/core/agi/executors/code_executor.rs`) — check_critical_patterns does lowercased substring contains() on whole code; trivially evaded by string-splitting/obfuscation (e.g. dynamically building 'os.system') and prone to false positives. Real containment relies on the sandbox (the actual trust boundary), so this is defense-in-depth tech-debt. Note sandbox network isolation is documented as advisory-only (env vars, not OS namespaces).

**Gaps:**

- Email trigger pipeline is scaffolding: Gmail Pub/Sub sync and message-to-filter matching unimplemented; production matcher is test-only.
- Two independent agent stacks (core/agi AGICore+Orchestrator vs core/agent AutonomousAgent) with overlapping responsibilities and separate Task/Goal models, status lifecycles, and budget handling - unclear which is canonical for v1; duplication risk.
- AgentOrchestrator status lifecycle is incomplete (no Completed transition), suggesting the AGICore-backed orchestrator path is not fully wired despite being invoked from chat and agi commands.
- Sandbox network isolation is advisory env-vars only on all platforms; no OS-level enforcement, so allow_network=false is not a hard guarantee.

**Hardening:**

- Replace all &str[..n] byte-slicing in orchestrator.rs and code_executor.rs with char-boundary-safe truncation (char_indices or the existing truncate_str helper).
- Wire AgentOrchestrator to set AgentState::Completed when the underlying AGICore goal reaches a terminal/achieved state (derive from goal context before cleanup, or have the worker callback into status).
- Either finish the email-trigger Gmail sync+match (move email_matches_trigger out of cfg(test) and call trigger_on_event) or gate the register/start API so users cannot create silently-dead triggers.
- Make deploy_project return success only when the MCP response yields a real URL; mark synthesized URLs as unverified instead of status='deployed'.
- Consider OS-level sandbox enforcement for network isolation, or surface clearly that allow_network=false is best-effort.
- Consolidate the two agent stacks or document the canonical one to reduce divergence.

### desktop-core-llm (apps/desktop/src-tauri/src/core/{llm,mcp,research})

**Purpose:** The desktop app's LLM layer: a central router (llm_router.rs) that selects among ~25 providers across three trust boundaries (Local/Ollama, BYOK via DirectApiProvider, Managed Cloud via ManagedCloudProvider), with retry+fallback, rate-limit circuit-breaking, caching, council fan-out, a daily spend cap, an MCP tool registry/connector catalog, and a research orchestrator that fans search subtasks across the swarm engine.

**Architecture:** LLMRouter holds a map of Provider->Box<dyn LLMProvider> and exposes candidates() + route_with_retry(). candidates() is the trust-boundary gate: if RouterPreferences.provider is Some (a pinned provider), it returns ONLY that provider and early-returns (no cloud fallback) — this is the actual mechanism preventing silent Local->cloud. If provider is None (auto/strategy routing), it builds a fallback chain that includes ManagedCloud + all BYOK providers; the router itself has no concept of a 'Local session', so boundary safety depends entirely on callers passing a pinned provider. Examined callers (background_manager.rs:159, sys/commands/agi.rs:933) both pin provider:Some(...), so they are safe. DirectApiProvider (BYOK) sends to provider APIs with the user's key and has solid SSRF protection (validate_provider_base_url: blocks private/link-local IPs, AWS IMDS, enforces HTTPS off-loopback, loopback HTTP allow-listed to known model-server ports). ManagedCloudProvider proxies through the AGI backend with a bearer access token, transforms requests to OpenAI or Anthropic shape. cost_calculator/daily_budget/council/research sit alongside. MCP: McpToolRegistry is a thin delegation layer over McpClient (resolve tool id -> call_tool); connectors.rs is a large static catalog of ~50 connector manifests with OAuth/API-key placeholders.

**Trust boundary:** Local/BYOK/Managed are enforced primarily by the pinned-provider early-return in candidates() (L852-866): a request with provider:Some(X) routes only to X with NO fallback, so a Local/Ollama-pinned chat cannot silently fall to cloud. All examined callers (background_manager.rs, sys/commands/agi.rs) pin provider:Some, so no silent Local->cloud path was found. The structural weakness is that the router has no first-class 'this session is Local-only' flag — auto-routing (provider:None) freely includes ManagedCloud + BYOK in the fallback chain, so correctness depends on every caller remembering to pin. DirectApiProvider (BYOK) keys are sent only to the user-configured base_url, which is SSRF-validated. ManagedCloud uses a separate keyring bearer token. No cross-contamination of credentials between providers was observed.

**Key files:**

- `apps/desktop/src-tauri/src/core/llm/llm_router.rs` — Central router. candidates() (L844) enforces pinned-provider isolation via early return (L852-866); route_with_retry() (L1299) prefilters unreachable providers + iterates fallback chain. No user-path panics (only an always-valid regex .expect at L2078).
- `apps/desktop/src-tauri/src/core/llm/daily_budget.rs` — DailyBudgetGuard (FIX-007) — per-user/day SQLite spend cap. Well-written and tested, but UNWIRED (see risks).
- `apps/desktop/src-tauri/src/core/llm/providers/direct_api_provider.rs` — BYOK provider. Strong SSRF guard (validate_provider_base_url) + correct per-provider auth header placement (Google/Anthropic keys via header not URL).
- `apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs` — Managed-cloud proxy provider. Default impl removed to avoid TLS-builder panic (DESK-10). 401/402/403/405 mapped to user messages. Solid.
- `apps/desktop/src-tauri/src/core/llm/council.rs` — Parallel multi-model fan-out + consensus synthesis. Logic sound, but the frontend command it needs (llm_council_query) is absent (see risks).
- `apps/desktop/src-tauri/src/core/mcp/registry.rs` — MCP tool registry — safe delegation to McpClient, safe tool-id creation (HIGH-004), no user-path panics.
- `apps/desktop/src-tauri/src/core/mcp/connectors.rs` — Static catalog of ~50 connector manifests. The YOUR_API_KEY / <from_oauth:...> strings are placeholders/templates, NOT secret leaks.
- `apps/desktop/src-tauri/src/core/research/subtask_executor.rs` — Lightweight research-subtask executor. is_research_subtask()/execute_research_subtask() have NO callers in the swarm spawner (dead path).
- `apps/desktop/src-tauri/src/core/agent/autonomous.rs` — Per-session cost cap (L178-204) IS wired and aborts the loop when cumulative_cost exceeds effective_session_cap_usd — the functional spend guard.
- `apps/desktop/src/api/council.ts` — Frontend invokes 'llm_council_query' — a Tauri command that does not exist in src-tauri.
- `apps/desktop/src/features/layout/BudgetStatusWidget.tsx` — Polls budget_get_status every 30s; will perpetually show $0 because nothing records spend.

**Risks:**

- 🟠 P1 DailyBudgetGuard (FIX-007 anti-prompt-injection daily cap) is entirely unwired (`apps/desktop/src-tauri/src/core/llm/daily_budget.rs`) — reserve_or_reject() has ZERO callers in the whole tree; record_actual() is exposed as Tauri command budget_record_actual but is invoked by no Rust code and no frontend (only budget_get_status is called, by BudgetStatusWidget.tsx). So the documented per-user/day cap never enforces and the status widget shows a perpetual $0/$25. The module docstring claims it is 'consulted on every cost-bearing LLM call' to stop prompt-injection bleeding BYOK keys across many sessions/day — that protection does not exist. Mitigant (why P1 not P0): the per-session cap in autonomous.rs:178 IS wired and aborts a runaway loop, so a single session cannot bleed unbounded; only the cross-session daily envelope is unguarded.
- 🟠 P1 Council feature is broken — frontend calls a Tauri command that does not exist (`apps/desktop/src/api/council.ts`) — council.ts:38 invokes 'llm_council_query', but no #[tauri::command] of that name exists anywhere in src-tauri (zero hits tree-wide, and no 'council' reference in lib.rs/commands). council_query() in council.rs also has no Rust callers. So CouncilView.tsx / councilStore.ts would fail at runtime with command-not-found. Core council flow is unwired.
- 🟡 P2 Research-subtask fast path is dead code (`apps/desktop/src-tauri/src/core/research/subtask_executor.rs`) — swarm_bridge tags subtasks with the [research_subtask] prefix expecting the swarm spawner (core/swarm) to detect it via is_research_subtask() and route to the lightweight executor. The spawner never references RESEARCH_SUBTASK_PREFIX / subtask_executor / is_research_subtask (zero hits outside core/research). ResearchSwarmOrchestrator also has no callers outside its module. Within examined sites the research-swarm path is unwired, so research subtasks would either fall through to full-AGICore execution or not run as intended.
- 🟡 P2 daily_budget reserve+record API is a latent double-count footgun (`apps/desktop/src-tauri/src/core/llm/daily_budget.rs`) — Intended pairing is reserve_or_reject (records the estimate) + refund_unspent (net to actual). record_actual is for the no-reservation flow and ADDS on top. If a future caller wires both reserve_or_reject AND record_actual for the same call, spend is counted twice. Not a live bug today (both are unwired), but the API invites it; worth a doc/guard before wiring.
- ⚪ P3 Auto-routing has no Local-session awareness; boundary safety is caller-dependent (`apps/desktop/src-tauri/src/core/llm/llm_router.rs`) — When RouterPreferences.provider is None, candidates() builds a fallback chain including ManagedCloud and all BYOK providers (L937-971). The router cannot know a request originated from a Local chat. Examined callers (background_manager, agi.rs) all pin provider:Some(...), so no silent Local->cloud was found — but any future auto-routing caller that forwards a Local-origin request with provider:None would silently cross the trust boundary, violating the locked rule. Defense-in-depth would add an explicit boundary flag rather than relying on every caller to pin.

**Gaps:**

- transport.rs (86KB) and config.rs (70KB) NOT read — the <from_oauth:...> secret substitution into spawned MCP server processes and the actual stdio/process spawning live there; connector secret handling is therefore unexamined, not confirmed clean.
- research/orchestrator.rs (38KB) and research/agents.rs (24KB) NOT read — 'research swarm unwired' is scoped to the call sites I grepped; the orchestrator's own internal invocation path was not fully traced.
- provider_adapter.rs (127KB) and sse_parser.rs (70KB) NOT read — per-provider request/response adaptation and SSE parsing crash-surface unexamined (these parse untrusted provider output).
- cost_calculator.rs read only via grep — did not verify it feeds any budget recorder (consistent with budget being unwired).
- Whether llm_council_query was renamed/removed during an in-flight refactor vs. never implemented was not determined; confirmed only that it is absent now.

**Hardening:**

- Wire DailyBudgetGuard into route_with_retry (or the agent loop) so reserve_or_reject runs pre-flight and record_actual/refund_unspent run post-call — otherwise delete the module and BudgetStatusWidget to avoid a false security/UX signal.
- Add the missing llm_council_query Tauri command (mapping to council_query) and register it, or remove the council frontend surface.
- Make the swarm spawner call is_research_subtask()/execute_research_subtask() (or remove the dead research fast-path) so research subtasks actually use the lightweight executor.
- Add a first-class trust-boundary flag to RouterPreferences/LLMRequest (e.g. local_only:bool) that hard-rejects cloud/BYOK candidates regardless of strategy, rather than relying on callers to pin a provider.
- Document the reserve_or_reject + refund_unspent pairing and add a debug-assert that record_actual is not mixed with a prior reservation for the same call.

### desktop-sys-chat

**Purpose:** Tauri IPC command surface for desktop chat: the chat_send_message pipeline (request validation, provider/model resolution, billing/budget gating, prompt assembly, streaming/non-streaming LLM execution, tool loops), plus the Local<->cloud boundary commands (transfer, conversation_share, cloud CRUD) and the OS-control computer_use command surface.

**Architecture:** chat_send_message (send_message.rs) is the single user-facing entry point. It computes uses_managed_cloud from request SHAPE (request_uses_managed_cloud = explicit ManagedCloud provider OR prefer_cloud_credits), and ONLY then runs check_billing_and_budget; Local/BYOK-shaped requests skip the gate ("Skipping subscription gate"). prepare_send_message (send_message_setup.rs) loads/creates the conversation, persists the user message, assembles system+memory+OS+project+skill context, builds tools, and produces an LLMRequest + RouterPreferences. Execution (send_message_execution.rs) calls ensure_managed_cloud_provider (registers ManagedCloud for ANY authenticated user) then routes via llm_router.candidates(): an explicitly pinned provider returns early with only that candidate (no fallback), but Auto/context routing appends ManagedCloud + all configured providers as fallbacks. Cloud CRUD (cloud.rs) fails closed with ERR_CLOUD_NOT_IMPLEMENTED, so transfer_local_to_cloud is currently inert. conversation_share is a live local-content extraction path. computer_use.rs gates every IPC path behind require_confirmation.

**Trust boundary:** The Local/BYOK vs ManagedCloud trust boundary is enforced inconsistently. Routing transparency for explicit pins is partly sound (candidates() returns only the pinned provider, no fallback), but the billing/budget gate is decided on REQUEST SHAPE in chat_send_message while the ACTUAL routed provider is decided later in candidates()/run_nonstreaming_chat. ensure_managed_cloud_provider gates registration only on token presence, and managed_cloud_provider.rs gates usage only on token presence — neither checks subscription/budget. This gap (gate computed at one layer, provider chosen at another) is the structural root cause of the P0.

**Key files:**

- `apps/desktop/src-tauri/src/sys/commands/chat/send_message.rs` — chat_send_message entry; computes uses_managed_cloud from request shape and runs the subscription/budget gate only for cloud-shaped requests
- `apps/desktop/src-tauri/src/sys/commands/chat/provider_access.rs` — request_uses_managed_cloud (gate trigger), check_billing_and_budget, ensure_managed_cloud_provider (registers cloud for any authenticated user with no subscription check)
- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs` — run_nonstreaming_chat (~line 1472) explicitly redirects an unconfigured user-pinned provider to ManagedCloud (lines 1496-1530) with no re-gate; streaming/agent dispatch
- `apps/desktop/src-tauri/src/core/llm/llm_router.rs` — candidates(): pinned provider returns early (safe); Auto/context path appends ManagedCloud + all providers as fallback candidates
- `apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs` — ManagedCloud impl; auths only via get_access_token(), is_configured() true whenever a token exists; NO check_cloud_access/budget in the inference path
- `apps/desktop/src-tauri/src/sys/commands/chat/transfer.rs` — transfer_local_to_cloud / transfer_cloud_to_local; Local<->cloud move with no secret-scan/consent/payload-preview (inert today because cloud.rs fails closed)
- `apps/desktop/src-tauri/src/sys/commands/chat/share.rs` — conversation_share; live extraction of full conversation content to frontend for upload to /api/shared, no Rust-side consent/secret-scan
- `apps/desktop/src-tauri/src/sys/commands/chat/cloud.rs` — Cloud chat CRUD; all commands fail closed with ERR_CLOUD_NOT_IMPLEMENTED (good default)
- `apps/desktop/src-tauri/src/sys/commands/computer_use.rs` — OS input/screen-capture commands; every IPC path gated by require_confirmation, allow-listed dispatch, Linux-unsupported guard (a security strength)
- `apps/desktop/src-tauri/src/sys/commands/chat/types.rs` — ChatSendMessageRequest + Validate impls; enforces length caps and attachment path-traversal defense (is_safe_path)

**Risks:**

- 🔴 P0 Managed-cloud subscription/budget gate is bypassable: it keys off request shape, not the routed provider (`apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs`) — chat_send_message gates on uses_managed_cloud computed from the REQUEST (explicit ManagedCloud provider or prefer_cloud_credits). For an Auto-routing request (provider=None) or a request pinning an unconfigured non-cloud provider, the gate is skipped and logged as Local/BYOK. But ensure_managed_cloud_provider registers ManagedCloud for ANY authenticated user (token present, no subscription check), candidates() appends ManagedCloud as an Auto/fallback candidate, AND run_nonstreaming_chat (lines 1496-1530) explicitly redirects an unconfigured-pinned-provider request to ManagedCloud. managed_cloud_provider.rs has NO secondary gate (is_configured()==token exists). Net: managed-cloud inference runs with zero subscription/budget enforcement, violating the locked rule that managed cloud stays waitlist/billing-gated until ledgering/abuse/fraud controls are proven.
- 🟠 P1 Pinned-provider -> ManagedCloud redirect is a silent provider substitution (`apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs`) — When a user explicitly pins provider X that is not configured, run_nonstreaming_chat substitutes ManagedCloud instead of failing or prompting, crossing the Local/BYOK->cloud boundary without pre-flight consent/secret-scan/payload-preview. The assistant Message does carry the routed provider, so the UI may surface it after the fact, but the never-silent/consent contract is not enforced server-side. Severity hinges on whether a post-hoc provider label counts as adequate disclosure.
- 🟠 P1 conversation_share extracts full conversation content with no Rust-side consent or secret scan (`apps/desktop/src-tauri/src/sys/commands/chat/share.rs`) — conversation_share reads all role/content/created_at rows, serializes them, and returns messages_json + token to the frontend for upload to POST /api/shared. Live Local->external extraction path with no payload preview, secret scan, or consent in Rust. Frontend/IPC control (or a tool-exposed call) could exfiltrate the full local conversation. Boundary rule requires secret scan + preview + consent before Local content leaves the device; gating exists only on the unverifiable frontend side.
- 🟠 P1 transfer*local_to_cloud lacks secret-scan/consent/preview (latent, currently inert) (`apps/desktop/src-tauri/src/sys/commands/chat/transfer.rs`) — transfer_local_to_cloud reads a local conversation + messages, pushes to cloud_create*\*, then optionally deletes local rows, with none of the locked boundary controls. Inert today because cloud.rs fails closed (errors before any delete, so no data loss now), but becomes a live un-consented Local->cloud exfiltration + delete path the moment the cloud CRUD boundary is implemented. Must-fix before cloud chat persistence ships.
- ⚪ P3 transfer_cloud_to_local re-acquires a DB connection per message inside the insert loop (`apps/desktop/src-tauri/src/sys/commands/chat/transfer.rs`) — db.connection() is called once per message inside the for loop rather than hoisted, adding pool/lock churn for large conversations. Minor performance tech-debt.
- ⚪ P3 parse_cloud_timestamp silently falls back to Utc::now() on parse failure (`apps/desktop/src-tauri/src/sys/commands/chat/transfer.rs`) — Cloud->local transfer rewrites message chronology to now() when a timestamp fails to parse, masking malformed upstream data. Low impact (ordering only).

**Gaps:**

- Cannot verify from Rust whether the frontend enforces consent/secret-scan/payload-preview before calling conversation_share or before uploading to /api/shared, nor whether the routed provider label is surfaced to the user before/after the pinned->ManagedCloud redirect.
- Did not read the streaming path (spawn_streaming_chat / stream_runtime.rs) in full to confirm it has the same ungated pinned->ManagedCloud redirect as the non-streaming path; only the non-streaming redirect (lines 1496-1530) was confirmed.
- Did not trace whether ManagedCloud is registered at app startup independent of ensure_managed_cloud_provider, which would affect whether the gate bypass is reachable on the very first message of a session.
- Did not read browser.rs / automation.rs command handlers (referenced in scope) for their own confirmation gating; only browser_context.rs (prompt context injection) was in the chat module.

**Hardening:**

- Re-derive the managed-cloud gate from the FINAL routed candidate (post-candidates()), not the request shape — or re-run check_billing_and_budget inside invoke_candidate/managed_cloud_provider when provider==ManagedCloud.
- Make ensure_managed_cloud_provider and/or managed_cloud_provider.is_configured()/inference path require check_cloud_access (subscription/waitlist) in addition to token presence.
- Have run_nonstreaming_chat (and the streaming equivalent) require explicit consent before redirecting a pinned/unconfigured provider to ManagedCloud, or fail closed with a provider-not-configured error.
- Add a Rust-side secret-scan + consent gate to conversation_share and transfer_local_to_cloud before any content leaves local storage.
- Hoist the per-message db.connection() out of the transfer_cloud_to_local loop.

### desktop-sys-account-data

**Purpose:** Tauri/Rust backend for the desktop app's account/auth, generic HTTP API client, Stripe billing, and all local data persistence (SQLite/SQLCipher chat DB, drafts, settings, analytics/metrics, cache, and multi-engine DB connectors). lib.rs is the app's command registry and startup wiring.

**Architecture:** sys/account/mod.rs owns device-link auth, JWT/refresh token storage (in-memory RwLock, NOT keyring — deliberate to avoid OS prompts), credit-balance + usage-report calls to the AGI backend, and SSRF-allowlisted API base URL. sys/api is a generic reqwest-based HTTP client (used for arbitrary user-configured requests + AGI backend) with retry middleware and a 30s timeout. sys/billing is fully gated behind a `#[cfg(feature="billing")]` flag (BillingState holds an optional StripeService + WebhookHandler; commands error until `billing_initialize` is called at runtime with a Stripe key + webhook secret). data/db is the canonical local store: repository.rs (CRUD), migrations.rs (5922 lines, savepoint-wrapped), encryption.rs (SQLCipher with redacted error messages + plaintext-to-encrypted migration), models.rs. data/state/draft_manager.rs persists message drafts. data/cloud_sync.rs is a deliberate fail-closed no-op enforcing 'no silent Local->cloud sync'. All ~1430 IPC commands are registered in one flat `generate_handler!` block in lib.rs (lines 1124-2793) — the documented sole source of truth (the old macro registry was deleted).

**Trust boundary:** Local/BYOK/Managed-cloud boundaries are respected in this area. cloud*sync.rs is an intentional fail-closed no-op (spawn_sync*_ do nothing; bulk_sync reports everything as failed) so local conversations/messages are never silently pushed to cloud. account::validate_api_base_url enforces an SSRF allowlist (_.agiworkforce.com / localhost / 127.0.0.1, https-only except localhost, rejects userinfo credentials) for the AGI backend base URL. SQLCipher encrypts the local DB and redacts the key from error/log output. Billing is feature-gated and runtime-init-gated, consistent with the waitlist lock. Cloud CRUD/transfer commands exist in lib.rs (cloud\_\*, transfer_local_to_cloud) but live outside this area's files. CRASH-RISK SWEEP: all production crash vectors checked were clean — every .unwrap()/.expect() in account/api/billing/data is inside #[cfg(test)] modules (incl. migrations.rs tests ~line 5380+); the two panic! in sqlite_pool.rs (lines 173/198) guard a documented ConnectionGuard invariant with a fallible try_get() alternative; lock-poisoning everywhere uses into_inner() recovery so a poisoned mutex cannot crash a command.

**Key files:**

- `apps/desktop/src-tauri/src/sys/account/mod.rs` — Account/auth: device-link, in-memory token store, SSRF-allowlisted API base URL, credit balance + LLM usage reporting, device list/disconnect
- `apps/desktop/src-tauri/src/sys/billing/mod.rs` — Billing state + IPC commands, all behind #[cfg(feature="billing")]; check_cloud_access gate
- `apps/desktop/src-tauri/src/sys/billing/webhooks.rs` — Stripe webhook handler: HMAC constant-time verify, 300s timestamp-freshness (replay protection), idempotency table
- `apps/desktop/src-tauri/src/sys/billing/stripe_client.rs` — Stripe API client: subscriptions, invoices, usage, payment methods (1070 lines)
- `apps/desktop/src-tauri/src/sys/api/client.rs` — Generic reqwest HTTP client with retry middleware + timeouts; bearer/oauth auth
- `apps/desktop/src-tauri/src/data/db/encryption.rs` — SQLCipher PRAGMA key application + unencrypted->encrypted migration; errors redact the key
- `apps/desktop/src-tauri/src/data/db/migrations.rs` — Startup migration runner (5922 lines), savepoint-wrapped per migration
- `apps/desktop/src-tauri/src/data/state/draft_manager.rs` — Message-draft persistence; CREATE IF NOT EXISTS, parameterized SQL, mutex-guarded
- `apps/desktop/src-tauri/src/data/cloud_sync.rs` — Fail-closed no-op cloud sync; enforces no-silent-Local->cloud lock
- `apps/desktop/src-tauri/src/data/database/sqlite_pool.rs` — SQLite connection pool; ConnectionGuard with documented-invariant panics (try_get available for fallible callers)
- `apps/desktop/src-tauri/src/lib.rs` — App bootstrap + single flat generate_handler! command registry (~1430 commands, lines 1124-2793)

**Risks:**

- 🟡 P2 Stripe/billing IPC surface compiled into the default build (`apps/desktop/src-tauri/Cargo.toml`) — `default = ["shell","updater","billing","vad"]` includes `billing`, so all ~17 Stripe commands (create_customer/subscription, charge usage, payment methods, portal) are compiled and registered in lib.rs. They are inert until `billing_initialize(stripe_api_key, webhook_secret)` is invoked at runtime, so this is exposure of a payment IPC surface, not live billing. Given the locked rule that managed cloud/billing stays waitlist/private-beta until ledgering/abuse/refund controls are proven, shipping these commands enabled-by-default is worth an explicit gate review.
- ⚪ P3 account_list_devices under-reports real multi-device sessions (`apps/desktop/src-tauri/src/sys/account/mod.rs`) — The command is documented as returning 'devices connected to the current account' but synthesizes only the single current device from env signals (hostname/USER) because the backend /api/devices endpoint does not yet exist. This is NOT fabricated data (it is the real current device) but the UI will show an incomplete device list for any genuine multi-device account. Acceptable as a tracked gap; the sibling account_disconnect_device already honestly returns ERR_NOT_IMPLEMENTED rather than faking success.
- ⚪ P3 Auth tokens stored in process-memory RwLock, not OS keyring (`apps/desktop/src-tauri/src/sys/account/mod.rs`) — ACCESS_TOKEN/REFRESH_TOKEN live in static RwLock<Option<String>>. This is a deliberate, documented tradeoff to avoid keyring permission prompts; tokens are lost on restart (frontend re-pushes them) and are not persisted to disk. Lock poisoning is handled via into_inner so it cannot crash. Not data loss, but worth noting the chosen security/UX tradeoff for a credential surface.

**Gaps:**

- data/database (postgres/mysql/redis/nosql/sql connectors, query_builder, security.rs ~4500 lines), data/analytics, data/metrics, data/cache, data/settings, and config_hierarchy.rs were NOT opened due to read budget — only their line counts and the absence of non-test unwrap/panic were confirmed; their command-level correctness is unverified.
- sys/api/oauth.rs, request_template.rs, response_parser.rs read only via grep; the generic API client has retry+timeout but no SSRF allowlist of its own (the allowlist lives in account::validate_api_base_url and only constrains the AGI backend base URL, not arbitrary request_template URLs) — whether user-configured request_template targets are constrained elsewhere was not verified.
- stripe_client.rs read only via grep (1070 lines); the actual Stripe call surface and any local credit-deduction logic were not fully inspected.
- Whether the billing/Stripe IPC commands are reachable from the production UI (vs. dev-only) was not determined — no frontend invoke() call sites were checked.

**Hardening:**

- Gate the billing feature out of the default build (or behind a runtime kill-switch) until managed-cloud waitlist controls are proven, per the locked product rule.
- Add an SSRF allowlist or explicit user-consent gate for generic api/client.rs request targets if request_template lets users (or LLM-generated tool calls) hit arbitrary internal URLs.
- Consider an opt-in OS-keyring path for token storage for users who accept the prompt, while keeping the in-memory default.
- When the backend /api/devices endpoint lands, wire account_list_devices/account_disconnect_device to it so the device list is accurate rather than current-device-only.

### mobile-screens (apps/mobile/app — Expo Router lead surface)

**Purpose:** The Expo Router screen tree for AGI Mobile, the designated lead/launch surface. v1 ships LOCAL-ONLY: on-device chat against local LLMs (Qwen3-4B default via ExecuTorch/llama-rn), with all cloud/auth/BYOK/dispatch/billing features preserved in code but runtime-hidden behind a single feature-flag module. Route groups: (public) age-gate + onboarding, (auth) login (a redirect-stub in v1), (app) drawer-wrapped authenticated shell with chat, projects, artifacts, code sessions, skills, settings, and waitlist-gated cloud features.

**Architecture:** Single Expo Router tree. Root app/\_layout.tsx is a heavyweight orchestrator: MMKV-encryption init, biometric gate (blocks navigator until SecureStore flag hydrates), auth/onboarding redirect guard, deep-link pairing (hardened scheme+host validation), share-intent->preview (never auto-send), Android back handler, and ~7 session-gated service effects (push, background fetch, realtime, dispatch, desktop polling, cross-device sync) — every one wrapped in a FEATURES.x guard so they no-op in v1. (app)/\_layout.tsx is a Drawer navigator (permanent sidebar on iPad >=768px); a hidden (tabs) navigator is retained only for route compatibility (tab bar display:none). Gating source of truth is lib/v1FeatureFlags.ts (all cloud flags false, v1LocalOnly+projects true). Screens consistently gate via `if (!FEATURES.x) return null` (dispatch, billing, agents, companion, usage) and the drawer hides nav items via `show: FEATURES.x`. Chat is composer-first: tab screen creates a conversation then pushes /chat/[id]. chatStore is a barrel combining three sub-stores (message/execution/view); routing decision lives in chatExecutionStore.sendMessage via remoteChatGate.

**Trust boundary:** Local->cloud trust boundary is correctly and centrally enforced. lib/v1FeatureFlags.ts sets v1LocalOnly=true with cloudChat=false. services/remoteChatGate.ts.getRemoteChatDisabledReason returns a disabled reason whenever v1LocalOnly && !cloudChat. chatExecutionStore.sendMessage computes remoteDisabledReason from this gate (line 224): when set, attachments are converted to local references (createLocalAttachmentReferences, line 226 — no upload), and generation goes through the on-device localGenerate(@agiworkforce/local-llm) branch (lines 383-495); the remote streamChat branch (line 497+) is only reachable when remote chat is explicitly enabled. No silent Local->cloud routing found. Model-switch UX reinforces this: selecting a cloud-surface model opens the waitlist/InviteCodeModal rather than switching (chat/[id].tsx lines 245-249, 273-277), and BYOK appears in the drawer only as a disabled 'Locked — Desktop and developer surfaces only' marker. /image command is hard-blocked behind FEATURES.imageGen with an explanatory alert. Onboarding fires the compliance disclosure (Article 50 / Apple 5.1.2) with offersManagedCloud:false and empty third-party providers, consistent with local-only. Net: the headline product-safety requirement (never silently route Local chats to cloud) is satisfied as written.

**Key files:**

- `apps/mobile/app/_layout.tsx` — Root orchestrator: biometric gate, MMKV init, auth/onboarding redirect guard, deep-link pairing, share-intent, all cloud-service effects (each FEATURES-gated)
- `apps/mobile/lib/v1FeatureFlags.ts` — Single source of truth for v1 local-only gating; all cloud/auth/dispatch/billing flags false
- `apps/mobile/app/(app)/_layout.tsx` — Drawer navigator; iPad permanent sidebar; declares all routes as hidden drawer screens
- `apps/mobile/app/(app)/(tabs)/chat.tsx` — Composer-first new-chat surface; SendPreview shows Local/ManagedGateway disclosure; creates conv then pushes detail
- `apps/mobile/app/(app)/chat/[id].tsx` — Chat detail: MessageList+Composer, model-picker, voice mode, paywall sheet, invite/waitlist modal, mode-switch confirm; auto-TTS of completed assistant messages
- `apps/mobile/stores/chat/chatExecutionStore.ts` — sendMessage routing: remoteDisabledReason forces localGenerate path; remote streamChat only when cloud enabled; attachments kept local when remote disabled
- `apps/mobile/services/remoteChatGate.ts` — Trust-boundary enforcement: returns disabled reason when v1LocalOnly && !cloudChat, blocking any remote chat call
- `apps/mobile/app/(public)/onboarding.tsx` — 3-screen local-first onboarding (hero->device-tier->download); compliance disclosure ledger; download path gated on catalog fields that are absent
- `packages/local-llm/src/catalog.ts` — On-device model catalog; default Qwen3-4B uses executorchPreset URLs but lacks top-level downloadUrl/checksum/format
- `apps/mobile/src/features/drawer/components/DrawerContent.tsx` — Primary nav; FEATURES-gated items; BYOK rendered as disabled 'Locked — Desktop/developer surfaces only' boundary marker
- `apps/mobile/app/(app)/billing/index.tsx` — Plans/pricing UI; reads BILLING_PLAN_PRICING (not hardcoded); upgrades route to InviteCodeModal (no IAP/Stripe in v1); FEATURES.billing-gated
- `apps/mobile/app/(app)/dispatch/index.tsx` — Mobile->desktop dispatch thread + QR pairing prompt; fully built UI but FEATURES.dispatch returns null in v1
- `apps/mobile/app/(auth)/login.tsx` — Auth stub: redirects to /(app) when FEATURES.auth is false instead of stranding on blank screen
- `apps/mobile/app/(app)/skills/index.tsx` — Static skill-category browse list (8 hardcoded categories); presentation shell, not wired to execution

**Risks:**

- 🟠 P1 Onboarding model download is a silent no-op for the v1 default model (`apps/mobile/app/(public)/onboarding.tsx`) — handleStartDownload (lines 241,277-282) only runs the real download when recommendedModel.downloadUrl && .checksum && .format are all present. The default Qwen3-4B catalog entry (packages/local-llm/src/catalog.ts) exposes only an executorchPreset (modelSource/tokenizerSource URLs) and has NO top-level downloadUrl/checksum/format, so onboarding falls through to finishOnboarding() WITHOUT downloading anything. First-run users then reach chat with no model, and chatExecutionStore.localGenerate surfaces the 'no on-device model is ready yet' setup message (lines 88-101). Unless the model-picker runtime provisions via the executorchPreset path separately, the lead surface's core local-chat demo dead-ends. Verify whether localModelRuntime/resolveLocalModelRef downloads via executorchPreset before treating chat as fully demoable.
- ⚪ P3 Unprompted auto-TTS on every completed assistant message in chat detail (`apps/mobile/app/(app)/chat/[id].tsx`) — Lines 131-145 call speak(lastMsg.content) for every completed assistant message via useVoicePlayback, independent of whether the user entered voice mode. If useVoicePlayback has no internal enabled-gate, ordinary text chats will speak aloud unprompted — a real UX defect. Needs confirmation of an enable flag inside the hook.
- ⚪ P3 Hardcoded color literals instead of theme tokens across multiple screens (`apps/mobile/app/(app)/chat/[id].tsx`) — Recurring rgba/hex literals (e.g. chat/[id].tsx offline banner rgba(239,68,68,...) and rename modal #1e2025/#fff; dispatch rgba(255,255,255,0.06); onboarding rgba(62,184,196,...) and '#000' shadows; billing/usage 'rgba(255,255,255,0.06)' and '#fff'). Violates the project's no-hardcoded-colors rule (use theme tokens). Consistent pattern, not a one-off; low severity but broad.
- ⚪ P3 Disabled-feature screens render blank (return null) if routed to (`apps/mobile/app/(app)/dispatch/index.tsx`) — dispatch/agents/companion/billing return null when their FEATURE flag is off. The drawer correctly hides these via show:FEATURES.x, so normal nav can't reach them; but a deep link or stale route would render a blank screen rather than a 'not available in v1' explanation. Defensible given drawer gating, but a graceful fallback would be more robust.

**Gaps:**

- Did not trace src/features/model-picker/localModelRuntime resolveLocalModelRef to confirm whether the executorchPreset path provisions the default model independently of onboarding — this determines whether the P1 download no-op actually blocks local chat end-to-end.
- Did not open useVoicePlayback to confirm whether auto-TTS has an internal enabled gate (affects P3 TTS severity).
- Did not inspect src/features/code-sessions (Code drawer entry re-export) to determine whether it is demoable or a shell.
- Skills screen read only partially (first 40 lines) — confirmed it is a static category list but did not verify whether tapping a category does anything.
- Did not read age-gate.tsx, projects, artifacts, settings sub-pages, companion pairing internals, or the connectors screen in depth.

**Hardening:**

- Decouple onboarding download gate from absent catalog fields: either populate downloadUrl/checksum/format for the v1 default model OR have onboarding drive the executorchPreset provisioning path so first-run actually lands a working model (closes the P1).
- Replace all hardcoded color literals (rgba/hex/#000 shadows) with theme tokens from src/ui/theme to satisfy the no-hardcoded-colors rule across chat, dispatch, onboarding, billing, usage.
- Add an internal enabled-gate (or explicit voice-mode check) to useVoicePlayback so chat detail does not auto-speak assistant replies in plain text sessions.
- Give FEATURES-gated screens (dispatch/agents/companion/billing) a graceful 'not available in v1' fallback instead of returning null, defending against deep-link/stale-route entry.
- Replace the static 8-category Skills screen with wiring to actual skill execution, or label it explicitly as a preview, so it does not read as a finished feature.

### mobile-state (apps/mobile: stores, services, lib, storage, src) — LEAD SURFACE

**Purpose:** State, persistence, networking, and trust-boundary layer for the AGI Mobile app — the v1 lead surface. Ships Local-only (on-device LLM inference) with all cloud features (cloud chat, BYOK, dispatch/companion WebRTC, agents, billing, cross-device sync) preserved in code but gated off at runtime via a single feature-flag module until an invite/waitlist path is unlocked. This layer owns chat send/stream, conversation persistence, the desktop-companion WebRTC trust boundary, the encrypted storage chain, and the compliance/LLM gates.

**Architecture:** Zustand stores (per-domain: chat split into message/execution/view sub-stores, connection, dispatch, agent, settings, permissions) with zustand/persist over an encrypted-MMKV adapter (lib/mmkv.ts). All persisted stores use skipHydration + rehydrateWhenMmkvReady() to avoid a default-vs-persisted race: MMKV opens with a 256-bit CSPRNG key held in expo-secure-store (WHEN_UNLOCKED_THIS_DEVICE_ONLY); before init a no-op Proxy degrades reads to undefined instead of crashing. Two-tier storage: MMKV for fast non-secret state; expo-SQLite (storage/db.ts + migrations) for conversations/messages/provider-key metadata; secrets (provider key bytes, biometric flag, MMKV key) live ONLY in SecureStore. Trust boundary is enforced as defense-in-depth at multiple layers: (1) lib/v1FeatureFlags.ts is the single source of truth (all flags false except v1LocalOnly + projects); (2) every cloud-egress service is gated on its FEATURES flag AND on `session` (always null in v1, auth=false); (3) the chat send path (chatExecutionStore.sendMessage) branches on getRemoteChatDisabledReason(): when remote is disabled it routes to on-device localGenerate(@agiworkforce/local-llm), otherwise to streamChat() which RE-ASSERTS assertRemoteChatAllowed()+ensureLlmGateOpen() before any HTTPS; (4) all outbound fetch funnels through secureFetch (single chokepoint for TLS pinning). Desktop companion uses a Fly.io WebSocket signaling relay + WebRTC data channel with HMAC-signed envelopes (lib/dispatchHmac) and per-field inbound validation (lib/dispatchAgentValidator).

**Trust boundary:** All P0/P1 candidates were resolved DOWN after verifying reachability: the chat send path is genuinely fail-closed (no silent Local->cloud), and the entire dispatch/companion/WebRTC subsystem plus every cloud-egress service is unreachable in v1 because each is gated on a false FEATURES flag AND on a null session. The Local->BYOK->Managed-Cloud boundary is enforced with strong defense-in-depth via three independent layers: (1) lib/v1FeatureFlags.ts master switch (all cloud flags false); (2) \_layout.tsx gates every boot-time cloud-egress effect on `FEATURES.<flag> && session` (session permanently null in v1 since auth=false, so realtime/dispatch/background-fetch/push never start); (3) chatExecutionStore branches to on-device localGenerate when remote is disabled, and streamChat() re-asserts assertRemoteChatAllowed()+ensureLlmGateOpen() at the HTTPS chokepoint so even a mis-routed call fails closed with RemoteChatDisabledError. Egress audit (grep of secureFetch/api/WS/SignalingClient callers): conversationSync->crossDeviceSync, realtime->cloudChat, dispatchRealtime/heartbeat->dispatch/companion, usage->billing — all gated false. Provider-key bytes and the biometric flag live only in Keychain/Keystore. Residual boundary risks are all in the (currently dead) companion/dispatch WebRTC path: optional HMAC + unvalidated taskResult cast from an untrusted relay.

**Key files:**

- `apps/mobile/lib/v1FeatureFlags.ts` — Single source of truth for the Local->cloud trust boundary; all cloud flags false in v1, v1LocalOnly=true. Every gate derives from here.
- `apps/mobile/services/remoteChatGate.ts` — Fail-closed gate: getRemoteChatDisabledReason()/assertRemoteChatAllowed() return/throw RemoteChatDisabledError when v1LocalOnly && !cloudChat.
- `apps/mobile/stores/chat/chatExecutionStore.ts` — Core send path. Branches local (localGenerate) vs remote (streamChat) on remote-disabled reason; no silent cloud routing. ~880 lines, heavy abort/retry/streaming state.
- `apps/mobile/services/streaming.ts` — SSE stream consumer. Re-asserts assertRemoteChatAllowed()+ensureLlmGateOpen() at top of streamChat() — second fail-closed layer before any HTTPS.
- `apps/mobile/stores/connectionStore.ts` — WebRTC/signaling companion trust boundary (32KB). Inbound control-message handler with HMAC verify + per-type type-guards; HMAC currently transitional (unsigned accepted until 2026-06-05).
- `apps/mobile/lib/dispatchAgentValidator.ts` — Strict per-field validator (parseAgent) for inbound agents_update from the untrusted signaling relay; caps count and string lengths.
- `apps/mobile/lib/mmkv.ts` — Encrypted MMKV adapter: CSPRNG 256-bit key in SecureStore, no-op Proxy pre-init, rehydration-race helper. Solid.
- `apps/mobile/lib/biometricFlagStore.ts` — Biometric-lock flag in SecureStore, fail-closed (enabled=true until hydrate proves opt-out). Correct.
- `apps/mobile/lib/secureStorage.ts` — SecureStore Zustand adapter for secrets; returns promises so persist propagates write failures; Before-First-Unlock returns null.
- `apps/mobile/storage/providerKeys.ts` — Provider-key metadata in SQLite; actual key bytes only in Keychain/Keystore via keychain_ref pointer. Correct separation.
- `apps/mobile/lib/pinning.ts` — TLS pin config. PINNING_ENFORCED=true with placeholder pins; release-build module-load guard throws 'TLS pinning not provisioned' until ops adds SPKI hashes.
- `apps/mobile/services/secureFetch.ts` — Single outbound-HTTPS chokepoint. JS layer only checks pin COVERAGE; actual pinning relies on native NSPinnedDomains/network_security_config.
- `apps/mobile/app/_layout.tsx` — Boot orchestration; every cloud-egress effect gated on FEATURES.<flag> && session (session always null in v1).

**Risks:**

- 🟡 P2 Inbound dispatch_response/dispatch_status_update payloads use raw `as TaskResult` cast (no per-field validation) while agents_update uses strict parseAgent (`apps/mobile/stores/connectionStore.ts`) — handleControlMessageInner validates agent payloads field-by-field but accepts taskResult as `payload['taskResult'] as TaskResult` after only an isObject() check, then renders text/statusDetail/taskResult in the dispatch thread UI. A hostile signaling relay or LAN MITM during the unsigned-HMAC transitional window could inject crafted strings/URLs. Mitigated: Dispatch screen + WebRTC connect() are gated behind FEATURES.dispatch (false in v1) so this path is UNREACHABLE in v1 local-only — defense-in-depth only. dispatchStore already strips previewUrl on persist (MED-MOB-03).
- 🟡 P2 Dispatch HMAC verification is transitional/optional — unsigned envelopes accepted with only console.warn until DISPATCH_HMAC_REQUIRED_AFTER 2026-06-05 (`apps/mobile/stores/connectionStore.ts`) — handleControlMessageAsync accepts unsigned messages (ok=true, no hmac field) as the raw payload during the transition window, so message authenticity from the relay is not yet enforced. Combined with the unvalidated taskResult cast this widens the injection surface. Live impact gated to zero in v1 (dispatch flag off); becomes relevant when companion/dispatch is unlocked, and the 2026-06-05 cutover must land before that.
- 🟡 P2 backgroundFetch TaskManager handler calls api.get('/api/mobile/agent-status') with no internal FEATURES gate (`apps/mobile/services/backgroundFetch.ts`) — The defineTask body has no flag check; it relies entirely on registerBackgroundFetch() never being invoked in v1. Registration IS gated (FEATURES.dispatch && session in \_layout.tsx), so the task is never scheduled today — but if a future caller registers it without re-checking flags, it would poll a cloud endpoint in local-only mode. Defense-in-depth gap, not a live leak.
- 🟡 P2 secureFetch JS layer enforces pin COVERAGE, not actual pinning; native config can silently drift to fail-open (`apps/mobile/services/secureFetch.ts`) — Once real SPKI hashes land in PINS_BY_HOST, JS only verifies a host HAS pins configured; the actual TLS pin enforcement lives in native NSPinnedDomains (iOS) / network_security_config (Android). If the JS PINS_BY_HOST and the native plist/xml drift, traffic to a 'pinned' host could silently fail open with no JS-detectable signal. Hardening/process risk.
- ⚪ P3 Local-only release builds are blocked by the TLS-pinning placeholder guard even though they never contact pinned cloud hosts (`apps/mobile/lib/pinning.ts`) — enforceProvisionedPinsForRelease() throws 'TLS pinning not provisioned' at module load in any non-dev/test build while placeholders remain. This is an intentional fail-loud pre-launch guard (working as designed), but it couples a v1 local-only release to an ops SPKI-provisioning task even though local inference never hits secureFetch. Track as an ops provisioning gap, not a code defect.

**Gaps:**

- TLS pins are placeholders (PLACEHOLDER*REPLACE_BEFORE_LAUNCH*\*) — ops must run the SPKI capture runbook and update both PINS_BY_HOST and the native NSPinnedDomains/network_security_config before any release build can boot.
- Dispatch HMAC enforcement cutover (DISPATCH_HMAC_REQUIRED_AFTER = 2026-06-05) not yet active; unsigned relay messages still accepted in the transitional window.
- authSession.ts is a pure stub in v1 (getAuthToken/getCurrentUser always return null) — the entire Clerk/Neon-backed cloud account path is unimplemented, so all session-gated egress is dead until it lands. Concurrent supabase->neon->clerk migration churn touches several of these files (api.ts, conversationSync.ts, authSession.ts dated May-28).
- Did not inspect apps/mobile/native (iOS/Android module shells) — out of scope for trust-boundary/crash analysis and low ROI; no JS-bridged native modules surfaced in the state/service layer reads.

**Hardening:**

- Apply per-field validation to inbound dispatch_response/dispatch_status_update taskResult (mirror parseAgent) instead of `as TaskResult` cast, before unlocking the dispatch flag.
- Add an internal FEATURES.dispatch guard inside the backgroundFetch TaskManager handler so the polling task is inert even if a future caller registers it without re-checking flags.
- Land the HMAC-required cutover (drop the unsigned-message transitional path) before companion/dispatch ships.
- Add a startup consistency check that the JS PINS_BY_HOST hosts match the native NSPinnedDomains/network_security_config entries to prevent fail-open drift once real pins are provisioned.
- Consider a CI assertion that no cloud-egress service can be called without a FEATURES gate (the egress chokepoint via secureFetch makes this enforceable).
