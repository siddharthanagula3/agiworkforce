# Completed Audit Rollup

Date: 2026-05-31
Scope: AGI Workforce monorepo audit waves completed so far
Mode: Read-only audit summary. No source code changes.

## Status

This file records completed audit slots and the high-signal findings reported by those slots. It is a rollup artifact, not a fix plan and not proof that the entire repo has been exhaustively verified line-by-line.

Cloud backend code must be preserved. Managed cloud, credits, billing, subscriptions, and cloud compute UI must remain gated or hidden until trust, ledgering, abuse, fraud, refund, retention, and deletion controls are proven.

## Completed Audit Slots

1. Beauvoir - CLI surface inventory/review kickoff.
2. Nietzsche - Desktop app inventory/review kickoff.
3. Curie - Mobile surface inventory/review kickoff.
4. Russell - VS Code extension inventory/review kickoff.
5. Dirac - Web surface inventory/review kickoff.
6. Huygens - Chrome extension inventory/review kickoff.
7. Bernoulli - Desktop native bridge and realtime pairing.
8. Darwin - Mobile local runtime, model routing, DSAR, storage.
9. Feynman - CLI hooks, permissions, plugin, MCP security.
10. Halley - Cross-surface dead-button/no-op UI audit.
11. Goodall - Desktop v3 shell, settings, and store wiring.
12. Ampere - Web chat, artifacts, and sidebar integration.
13. Copernicus - Official competitor capability research.
14. Kant - Mobile navigation, workflow, offline, settings edge cases.
15. Leibniz - Honesty ledger and service/contract mapping design.
16. Sartre - Rust/security pass.
17. James - Competitor official URL research pass.
18. Godel - Shared contracts and model catalog pass.
19. Aquinas - Services/cloud gate pass.
20. Boyle - UI/backend mapping method.
21. Banach - Web chat and route/schema integrity.
22. Meitner - CLI provider, privacy, and tools pass.
23. Poincare - Mobile local runtime and BYOK/cloud guardrails.
24. Ptolemy - Desktop settings and trust boundaries.
25. Hooke - VS Code provider and bridge behavior.
26. Jason - Chrome in-page workflow and bridge behavior.
27. Volta - Web billing, cloud overpromise, controls.
28. Pascal - Desktop IPC command registry coverage.
29. Descartes - Known-flaws crosscheck baseline.
30. Bacon - Mobile paywall, App Store, privacy mismatch.
31. Erdos - Shared provider/catalog consistency.
32. Socrates - Desktop artifacts, files, download, share.
33. Mill - Web projects, memory, settings, admin, team gaps.
34. Hegel - CLI TUI and plugin command behavior.
35. Heisenberg - Services/API gateway contract consistency.
36. Hume - Mobile data handling, DSAR, feature gaps.
37. Hubble - Chrome settings, model, prefs, security.
38. Avicenna - VS Code trust, commit, symlink, sandbox.
39. Locke - Desktop v3 feature exposure/navigation.
40. Planck - Mobile dispatch, share, capture, voice.
41. Lovelace - Web marketing, legal, provider, i18n consistency.
42. Nash - Chrome security/native trust boundary.
43. McClintock - Competitor research pass.
44. Carson - DB/schema consistency.
45. Archimedes - Saves-but-ignored and cross-surface settings drift.
46. Anscombe - Cancellation/stop semantics across surfaces.
47. Peirce - Enterprise/privacy/export research.
48. Epicurus - Testing/coverage and false-green verification quality.
49. Noether - Account deletion, export, privacy controls.
50. Faraday - CSRF, auth, injection, auth-store mismatch.
51. Newton - File/artifact handling and leakage.
52. Averroes - Trust-boundary fallback/defaults.
53. Cicero - Provider/model catalog drift.
54. Euler - Web non-chat API and UI/backend mapping.
55. Dewey - Desktop Tauri/Rust command handlers.
56. Gibbs - VS Code command, bridge, provider pass.
57. Bohr - Chrome user-visible workflow edge-case audit.
58. Popper - Services/API gateway/signaling audit.
59. Tesla - Packages/crates shared contract audit.

## High-Signal Findings By Audit

### Bernoulli - Desktop Native Bridge And Pairing

- HIGH: `/pair` behaves like a CSRF-prone loopback capability endpoint: empty body allowed, token rotated, manifest can add arbitrary valid Chrome extension IDs, wildcard CORS observed.
- MEDIUM: native messaging MAC is not a complete server-side auth boundary.
- MEDIUM: sensitive browser/native payloads are logged or emitted without enough redaction.
- LOW: Chrome bridge/native fallback behavior is inconsistent.
- LOW: VS Code desktop bridge token/protocol drift exists.
- Refuted: LAN access, arbitrary WebSocket origin for normal pages, Chrome silent cloud fallback, and pair token auth bypass for normal HTTP chat were not proven by this pass.

### Darwin - Mobile Local Runtime And Data Handling

- HIGH: DSAR export omits active MMKV chat/project/artifact state.
- HIGH: local data wipe leaves export files and SecureStore keys.
- HIGH: project sources are not used as chat context.
- HIGH: stop/cancel does not interrupt native generation.
- HIGH: model download service is bypassed by the default ExecuTorch path.
- MEDIUM: onboarding "pick different model" does not affect the actual download target.
- MEDIUM: iOS config and privacy manifest drift from actual app behavior.
- MEDIUM: BYOK/provider routing copy drifts from v1 canon.
- MEDIUM: secureFetch pinning appears placeholder-level; no native pin enforcement was proven.
- Refuted: current runtime BYOK/cloud send exposure, cloud sends from model picker, biometric fail-open, and broad direct fetch bypass except ExecuTorch.

### Feynman - CLI Hooks, Permissions, Plugins, MCP

- HIGH: "safe" shell commands can mutate the workspace without confirmation, including `echo`, `tee`, `python -c`, and `node -e` patterns.
- HIGH: batch inner calls can bypass per-tool hooks and allow/deny filters.
- HIGH: project-local plugin MCP servers can auto-start despite hook trust barriers.
- HIGH: PowerShell tool path bypasses CLI confirmation/workspace path controls.
- MEDIUM: insecure `hooks.json` permissions only warn.
- MEDIUM: MCP prompt expansion bypasses `UserPromptSubmit` hooks.
- MEDIUM: hardcoded runtime model IDs exist outside the catalog.
- Refuted: local-to-cloud fallback, privacy mode direct BYOK leak, public managed CLI, cached command suffix bypass, MCP stdio shell injection, environment leakage, and file/apply_patch traversal.

### Halley - Cross-Surface UI Dead Buttons

- HIGH: Desktop v3 sidebar has dead or misrouted controls.
- HIGH: VS Code cloud/invite UI hard-fails while overpromising.
- HIGH: Web Connectors UI promises real connections although API/migration support is missing; MCP/local permissions are mock-like.
- MEDIUM: Web Plugin marketplace install is local-only/fake.
- MEDIUM: Web Capabilities settings persist but are ignored.
- MEDIUM: Web BYOK copy conflicts with canon and routes to non-config.
- Refuted: several inactive placeholder components and billing top-up gates were not current active defects in this pass.

### Goodall - Desktop V3 Shell, Settings, Store Wiring

- HIGH: visible v3 shell navigation is dead; Cowork, Code, Artifact, and Composer are exported but not mounted.
- HIGH: missing IPC handlers for invoked commands: `agent_preview_plan`, `agent_execute_plan`, `generate_image`, `llm_council_query`, `open_file_location`.
- MEDIUM: Settings information architecture drifts from canon.
- MEDIUM: duplicate chat preference stores share the same persistence key with divergent schemas.
- MEDIUM: tier/pricing copy drift includes `pro_plus` and model claims.
- LOW: account menu chevrons and learn-more controls are inert.
- Refuted: visible cloud sync toggle, persisted cloud sync, Tauri default cloud, missing Cowork file, and settings persistence absence.

### Ampere - Web Chat, Artifacts, Sidebar

- CRITICAL: share flow targets `shared_sessions`, while migration creates `shared_conversations`.
- CRITICAL: active chat APIs are ahead of Neon schema for folders, bookmarks, branches, shortcuts, and related features.
- HIGH: attachments overpromise file support and attachment-only sends can no-op.
- HIGH: incognito mode is dead on active `/chat`.
- HIGH: message edit/delete/regenerate are local-only and reload restores DB rows.
- MEDIUM: research toggle is visible but not sent.
- MEDIUM: stop/cancel can lose partial assistant persistence.
- MEDIUM: move-to-project saves wrong store or lacks DB update.
- MEDIUM: search GET writes history and ignores highlight.
- MEDIUM: artifacts are local sidecar state with stale share helper.
- LOW: collapsed sidebar has dead controls and hardcoded model fallback literals.
- Orphans: branch, bookmarks, reactions, folders, bulk, session, shared, v2, and completion APIs.
- Refuted: Web BYOK exposure in active chat, screenshot deadness, main chat CSRF/rate-limit issue, sidebar title search issue, and fully hardcoded model picker.

### Kant - Mobile Navigation, Workflow, Offline, Settings

- HIGH: direct app-route/deep-link can bypass age gate/onboarding.
- HIGH: iOS App Intents URLs are not handled by the React Native side; share handler requires session while v1 auth is disabled.
- HIGH: drawer hides connectors but direct route allows fake local connect state.
- MEDIUM: disabled beta routes can render blank screens.
- MEDIUM: offline queue persisted messages do not drain on cold launch when online.
- MEDIUM: capability toggles persist but do not affect memory/artifact runtime.
- MEDIUM: invalid permission deep links can crash before guard.
- MEDIUM: onboarding model selection does not update download target.
- Refuted: Mobile BYOK, silent remote chat, locked cloud model rows, and notification tap active path.

### Bohr - Chrome Extension Workflows

- HIGH: in-page panel page capture bypasses shared secret redactor.
- HIGH: "Always allow" action consent expands into global site allowlist/page-context sync.
- MEDIUM: popup Capture discards screenshot.
- MEDIUM: task notification preference is not enforced.
- MEDIUM: scheduled prompt tasks mark completion before chat finishes.
- MEDIUM: workflow recorder value-capture plumbing has no UI and replay is empty.
- MEDIUM: scheduled task timing ignores `scheduleValue`.
- MEDIUM: Open in desktop reports success even when native send fails.
- Refuted: no-port-8765 refs, discovery bypass empty, hosted chat cloud fallback, and production autofill sync.

### Euler - Web Non-Chat API/UI Contract

- HIGH: project knowledge uploads go client to public Vercel Blob before API records/gates feature.
- HIGH: schedule notification settings are editable and posted, but route mappers/inserts ignore them.
- MEDIUM: schedule APIs accept arbitrary model strings.
- HIGH: `/api/me` returns identity, but the unified auth store never writes `user`.
- Excluded or not re-reported: DSAR, connectors, share, admin, support, and project default model where already covered or clean for this pass.

### Popper - Services/API Gateway/Signaling

- CRITICAL: signaling generates 12-character pairing codes while regex validation requires 8.
- HIGH: global CSRF blocks native Rust/worker bearer clients unless they also send browser-style headers.
- HIGH: managed-compute beta access is self-asserted by env plus `x-agi-managed-compute-beta:1`; legitimate native client lacks that header.
- HIGH: cloudChat DB table drift uses `conversations/messages` while Web Neon uses `web_conversations/web_messages`.
- HIGH: `usage_events` schema mismatch and LLM streams have no reserve/deduct ledger path.
- HIGH: providerStream lacks plan, credit, model-tier, and ledger enforcement despite managed gate.
- HIGH: enterprise routes reference unmigrated tables.
- MEDIUM: exported routers for chat, pair, and dotfile are not mounted; pair router would miss bearer secret.
- MEDIUM: `/api/models` uses hardcoded catalog data.
- Refuted: weak core JWT middleware, main LLM prefix routing issue, providerStream completely ungated, and org membership fully absent.

### Gibbs - VS Code Extension

- HIGH: sidebar History is global, not workspace-scoped; tooltips can expose message text.
- HIGH: `@agi` falls back to VS Code LM/Copilot by default with workspace context.
- HIGH: provider switch guard hardcodes model prefixes and allows unknown providers.
- MEDIUM: public `tier` setting can override live tier and unlock provider UI.
- HIGH: desktop bridge protocol/token drift.
- MEDIUM: managed cloud invite modal promises routing while backend hard-fails.
- LOW: stale "Claude will..." branding remains.
- Refuted: command registration drift, CodeLens/hover network sends, broad telemetry leak. Additional concerns remain around unused safeResolve and UI-only approval modes.

### Dewey - Desktop Tauri/Rust Command Handlers

- HIGH: legacy screenshot/type IPC bypass newer computer-use gates.
- HIGH: direct `computer_use_click`, `computer_use_type`, and `computer_use_move` ignore per-app permissions and blocked-app rules.
- HIGH: direct CDP browser commands bypass extension bridge confirmations for navigation, cookies, and function calls.
- HIGH: terminal shell injection exists through unvalidated environment variable key interpolation.
- HIGH: capability toggles fail open and direct IPC is not enforced.
- HIGH: file alias path protections diverge from hardened primary APIs.
- MEDIUM/HIGH: MCP encoded IDs can downgrade connector permissions due parser mismatch.
- MEDIUM/HIGH: sandbox network denial is advisory even when `allow_network=false`.
- MEDIUM: upload attachment decodes and writes unbounded base64 before quota.
- Refuted: managed cloud chat-sync default and sandbox files traversal. LLM managed fallback was not duplicated here because it was covered elsewhere.

### Tesla - Packages And Crates Shared Contracts

- CRITICAL: Desktop Local to BYOK preview is built/redacted but then dropped; store forks raw Local messages and sets provider mode cloud.
- HIGH: provider privacy mapping cannot represent endpoint class and misses LM Studio local handling.
- HIGH: mobile/local runtime cancellation lacks `AbortSignal`; Tier2 interrupt path is unused.
- MEDIUM: generated-file shared contract marks local `file://` artifacts shareable/downloadable by URI only.
- MEDIUM: command registry drifts across TS, Rust, and Desktop.
- HIGH: capability router `desktop-preferred` can route broad command classes to cloud without surface/trust context.
- Refuted: current `file_copy` arg mismatch because wrapper appears fixed; Rust `ProjectProviderMode` includes `ManagedNative`; model catalog helper drift is partly guarded.

### Volta - Web Billing And Cloud Overpromise

- HIGH: top-up webhook references a nonexistent `credits_remaining_cents` column.
- HIGH: checkout gating is split across inconsistent controls.
- MEDIUM: BYOK env-status route has no auth.
- MEDIUM: billing UI overpromises "Buy More Credits", instant activation, and zero markup.
- MEDIUM: billing hooks and BYOK provider lists include placeholders or pending providers.

### Pascal - Desktop IPC Registry

- HIGH: command registry has drift between command definitions, registered handlers, and front-end invokes.
- HIGH: invoked but unregistered commands include `agent_preview_plan`, `agent_execute_plan`, `llm_council_query`, `generate_image`, and `open_file_location`.
- MEDIUM: dynamic `tool_exec_*` handlers are missing.
- MEDIUM: billing cfg stubs silently no-op.
- MEDIUM: Google Batch and MySQL commands are stub-level.
- MEDIUM: tray unread count no-ops.
- MEDIUM: voice fallback copy can imply cloud behavior.

### Bacon - Mobile Paywall, Store, Privacy

- MEDIUM: stale BYOK/multi-provider store copy conflicts with v1 mobile canon.
- MEDIUM: app privacy says data is not collected while waitlist email flow exists.
- MEDIUM: paywall uses external pricing URL.
- MEDIUM: invite-code UI can show success while service fails closed.
- MEDIUM: HealthKit is unavailable despite adjacent claims/paths.
- MEDIUM: legal C2PA claims were not found implemented.
- MEDIUM: iOS Info.plist is missing usage strings for some claimed capabilities.

### Erdos - Shared Provider Drift

- HIGH: docs claim 84 models while catalog has about 70.
- HIGH: provider defaults are missing or inconsistent.
- HIGH: LM Studio adapter/union is absent from provider map.
- MEDIUM: MiniMax and Ollama Cloud are absent or drifted.
- MEDIUM: privacy classification is too narrow.
- MEDIUM: API gateway has static catalog literals.

### Socrates - Desktop Artifacts And Files

- MEDIUM: open-system-app path downloads blob then calls shell open on filename.
- MEDIUM: sandbox script flags mismatch.
- MEDIUM: CDP cookie path lacks visible confirmation.
- MEDIUM: MCP iframe allows any origin when allowlist is empty.
- MEDIUM: generated-file labels are not surfaced.
- Refuted by later Tesla pass: `file_copy` argument mismatch appears fixed in current wrapper.

### Mill - Web Projects, Memory, Settings, Admin, Team

- HIGH: Projects UI uses local store while `/api/projects` uses Neon.
- HIGH: knowledge upload stores public blob before API can fail.
- MEDIUM: settings nav omits routes.
- MEDIUM: memory API is orphaned while UI uses local state.
- MEDIUM: search only covers conversations/messages.
- MEDIUM: admin readiness is static.
- MEDIUM: teams UI is local while `/api/teams` exists separately.

### Hegel - CLI TUI, Plugins, MCP

- MEDIUM: plugin command markdown exists without runtime execution.
- MEDIUM: TUI CommandPopup submit is dropped.
- MEDIUM: `/agents <name>` has shadow behavior.
- MEDIUM: `/btw` sends prompt unexpectedly.
- MEDIUM: MCP prompts discovery only happens after `tools/list`.
- MEDIUM: `/reload-plugins` is incomplete.
- LOW: command shadow guard is case-sensitive.

### Heisenberg - Services Contract Drift

- HIGH: cloudChat uses `conversations/messages` while Neon has `web_conversations/web_messages`.
- HIGH: enterprise routes are unmigrated.
- CRITICAL: signaling code length and validation regex mismatch.
- HIGH: managed gate is env plus client header only.
- HIGH: providerStream lacks plan/credit enforcement.
- HIGH: `usage_events` schema mismatch.
- MEDIUM: pair, chat, and dotfile routers are exported but not mounted.
- MEDIUM: `/ws` uses handrolled auth.

### Hume - Mobile Storage And DSAR

- HIGH: DSAR claims all SQL/MMKV but omits runtime data, attachments, parent messages, doc chunks, permissions, and onboarding.
- HIGH: local delete path misses several persisted stores.
- MEDIUM: SecureStore handling remains unclear.
- MEDIUM: model file-path review copy drifts from actual path.
- MEDIUM: privacy manifest drift.
- MEDIUM: location and HealthKit paths are no-op or unavailable.

### Hubble - Chrome Settings And Prefs

- MEDIUM: model picker value is saved but ignored.
- MEDIUM: extended thinking is saved but ignored.
- MEDIUM: quick mode is no-op.
- MEDIUM: notifications preference is ignored.
- MEDIUM: cloud invite overpromises while unmounted.
- MEDIUM: duplicate in-page panel exists.
- MEDIUM: autofill storage duplicate conflict exists.

### Avicenna - VS Code Trust, Git, Sandbox

- HIGH: agent edit patch trust guard can become click-through.
- MEDIUM: safe symlink function is unused.
- HIGH: git commit trust check happens after commit.
- HIGH: checkpoints rely on stash/checkout/clean patterns with data-loss risk.
- MEDIUM: ask/auto/bypass controls are UI-only.
- Refuted: SecretStorage/global endpoint positives were not confirmed as severe.

### Locke - Desktop V3 Navigation

- HIGH: v3 shell nests unified-chat sidebar in a way that leaves outer nav unhandled.
- HIGH: v3 mode is hardcoded to chat.
- HIGH: new chat action is no-op.
- HIGH: Code, Cowork, Artifact, and Composer are hidden.
- MEDIUM: inner Code nav misses settings tab.
- MEDIUM: Cowork is hidden.
- MEDIUM: account/settings split creates IA drift.

### Planck - Mobile Dispatch, Share, Capture, Voice

- HIGH: dispatch/companion routes are gated off or null.
- MEDIUM: result buttons have no `onPress`.
- MEDIUM: approval payload shapes diverge.
- HIGH: App Intents URL path has no JS router.
- MEDIUM: scan OCR is text-only.
- MEDIUM: voice privacy copy overclaims.
- MEDIUM: settings are persisted but not consumed.

### Lovelace - Web Marketing, Legal, Provider, I18n

- MEDIUM: provider count drift.
- MEDIUM: token-level handoff overclaim.
- MEDIUM: BYOK is advertised on Web/Mobile despite canon constraints.
- MEDIUM: privacy/subprocessors drift.
- MEDIUM: `install.sh` is advertised but no route exists.
- MEDIUM: pricing/i18n tier drift.

### Nash - Chrome Security And Native Messaging

- HIGH: privileged messages use default allowlisted-tab policy for cookie, tab, and in-page prompt actions.
- HIGH: ask-before-acting can be bypassed for allowlisted contexts.
- MEDIUM: bridge token behavior is inconsistent.
- MEDIUM: native MAC is asymmetric.
- MEDIUM: stale duplicates remain.
- MEDIUM: POSIX installer lacks ID validation.

### Carson - Database And Schema

- CRITICAL: `shared_sessions` versus `shared_conversations` mismatch.
- HIGH: `schedule_runs` versus `scheduled_task_runs` mismatch.
- HIGH: chat folders route uses fields not in migration.
- HIGH: project knowledge route references `deleted_at` and `added_at` mismatch.
- HIGH: `neonClients.ts` service client is not scoped.
- HIGH: `cloudChat.ts` uses legacy `conversations/messages`.

### Archimedes - Saves-But-Ignored Settings

- MEDIUM: Mobile performance toggles are page-local.
- MEDIUM: Mobile capabilities persist but are not consumed.
- HIGH: Desktop capability key/type mismatch.
- MEDIUM: Chrome notifications, model, and thinking preferences are ignored.
- MEDIUM: Web capabilities persist but are ignored.
- LOW: Web plugin localStorage install is stub-like.

### Anscombe - Cancellation And Stop Semantics

- HIGH: Web stop does not propagate upstream.
- MEDIUM: partial persistence is inconsistent.
- MEDIUM: Desktop stop is cooperative only.
- HIGH: Mobile local generation lacks abort.
- MEDIUM: Mobile stop-before-stream is placeholder-like.
- MEDIUM: CLI batch stop is metadata/per-tool only.
- MEDIUM: VS Code agent loop lacks external cancellation.
- MEDIUM: Chrome stop reports cancellation before confirmation.

### Peirce - Enterprise Research

- MEDIUM: enterprise docs drift from Supabase/Neon reality.
- HIGH: privacy/export mismatch.
- MEDIUM: audit table split creates implementation ambiguity.

### Epicurus - Testing And False Greens

- HIGH: Mobile active suites are ignored.
- HIGH: Desktop E2E passes without Tauri.
- HIGH: Desktop CI E2E is smoke/self-healing only.
- MEDIUM: self-healing tests mock recovery too much.
- MEDIUM: Chrome extension lint is excluded from root CI.
- MEDIUM: Rust tests are not canonical.
- MEDIUM: model-catalog drift check excludes tests.

### Noether - Account Deletion, Export, Privacy

- CRITICAL: account deletion does not erase Neon data broadly.
- HIGH: privacy page calls the wrong export route.
- HIGH: export/delete misses `user_settings`, `user_memories`, Web chats, projects, support, and shared chats.
- HIGH: enterprise admin/SSO/SCIM APIs are missing tables.
- MEDIUM: retention controls are accepted but not persisted.

### Faraday - Auth, CSRF, Injection

- HIGH: Web video generation lacks CSRF before credit reservation.
- HIGH: API gateway CSRF header contract mismatches native clients.
- CRITICAL: worker `session_ingress` "JWT" is unsigned base64.
- HIGH: managed-compute beta gate is client-controlled once env is on.
- HIGH: Desktop `/pair` uses wildcard CORS plus token rotation risk.
- MEDIUM: Mobile TLS pinning claim is false or unproven.
- MEDIUM: rate limits are per-instance when Redis is missing.

### Newton - File And Artifact Handling

- HIGH: public Vercel Blob knowledge upload before server validation.
- HIGH: API accepts client-provided `storageUri`.
- HIGH: project knowledge route queries nonexistent or mismatched fields.
- HIGH: share flow is split across incompatible schemas.
- MEDIUM: artifact sandbox trusts existing CSP too much.
- MEDIUM: generated-file URI can point at arbitrary HTTP download/share.
- Refuted by later Tesla pass: Desktop `file_copy` argument mismatch appears fixed.

### Averroes - Trust Boundary Fallbacks

- CRITICAL: Desktop defaults/fallbacks can route to `managed_cloud`.
- CRITICAL: Rust router fallback defaults to ManagedCloud.
- HIGH: Managed gate can fail open.
- CRITICAL: BYOK fork preview is built but store clones raw messages.

### Cicero - Provider And Model Catalog

- HIGH: catalog contains dangling defaults.
- HIGH: API gateway uses static hardcoded catalog.
- HIGH: cloudChat hardcodes provider union/fallback.
- HIGH: Desktop Rust maps unknown/cloud models to ManagedCloud.
- MEDIUM: provider union, adapter, and health maps drift.
- MEDIUM: docs have stale model count.

## Competitor Research Audits

### Copernicus, James, McClintock

- Completed official research passes for OpenAI ChatGPT/Codex and Anthropic Claude/Claude Code capability baselines.
- Relevant competitor capability themes: local agent permissions/approvals, cloud task delegation, projects, artifacts, connectors, memory, model selection, enterprise/privacy/admin controls, browser/IDE/mobile surface parity, and beta/paid gating.
- Repo gap themes from comparison: AGI aims at a suite-level product; Local/BYOK/Managed boundaries are stronger than competitors on paper but incomplete in enforcement; connectors, memory, artifacts, projects, cloud gating, and model catalog verification are the main parity/launch blockers.

## Known-Flaws Handling

The Descartes pass established that findings already tracked in `docs/agent-context/known-flaws.md` should not be re-reported as new without fresh source evidence and reconciliation. Examples called out for care include cloud gating, provider drift, Neon schema drift, and privacy/export gaps.

## Honesty Gaps

- This rollup is based on completed agent reports plus selected decisive source re-reads from the prior audit session.
- It does not include a fresh full-file quote ledger for every finding.
- Some findings were cross-verified by multiple agents; others remain single-agent confirmed and should be re-read before being turned into tracked release blockers.
- This file records audit output only. It does not assert that skipped/generated/vendor/build paths were exhaustively inventoried.

## Preserve Cloud Reminder

Preserve all managed cloud backend code. Gate or hide overpromising cloud UI until the trust, billing, metering, abuse, retention, and deletion controls are proven.
