# AGI Desktop — Volume 29 — QA Test Cases

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `apps/desktop/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; and real repo paths exercised here — `apps/desktop/playwright.config.ts`, `apps/desktop/e2e/*.spec.ts` (`smoke`, `chat`, `settings`, `gdpr`, `accessibility-audit`, `v3-locks`, `v3-reachability`, `v3-smoke`, `agi-safety`, `comprehensive-flows`, `advanced-integration-flows`, `browser-automation`, `visual-regression`, `test-stability-runner`), `apps/desktop/e2e/{fixtures,page-objects,mocks,global-setup.ts}`, `apps/desktop/playwright/{provider-switching,browser-automation,file-operations,goal-to-completion,multi-tool-workflow}.spec.ts`, `apps/desktop/src-tauri/tests/{integration_tests,mcp_integration_test,automation_db_tests,automation_integration}.rs`, `apps/desktop/src-tauri/src/tests/{byok_vault_tests,security_tests,llm_tests,windows_compat_tests}.rs`, `apps/desktop/src-tauri/src/automation/{safety_patterns,vision_planner,screen_watcher,integration_tests}.rs`, `apps/desktop/src-tauri/src/data/{settings_sync,projects_sync,config_hierarchy}.rs`, `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, `apps/desktop/src-tauri/src/integrations/native_messaging/mod.rs`, `apps/desktop/package.json`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume defines the QA test matrix for AGI Desktop — the full-trust surface (Local + BYOK + Managed Cloud, each with a correct visible label) and the local-private compute host for the suite. QA here is not generic app testing: the load-bearing assertions are **trust-boundary contract tests** proving Local chats, files, and sessions never silently cross into BYOK or Cloud, that Local→BYOK is an explicit fork, and that the `127.0.0.1` companion host is paired and approval-gated. Three verification engines cover the surface: **Playwright** for the React shell (`apps/desktop/playwright.config.ts`), **cargo** for the Rust `src-tauri` core, and a **computer-use / MCP harness** for the automation host. These are TARGET specs; a `✅` cites a test that exists today, `🟡`/`🔭` mark gaps.

## Functional

Every core flow needs a happy-path and a failure-path test: new chat, send/stream, stop, model pick, panel switch (chat/projects/artifacts/scheduled/dispatch), file upload, settings save. The V3 shell is guarded by reachability and anti-pattern locks — root/sidebar/composer selectors and aria-labels are asserted (`apps/desktop/e2e/v3-reachability.spec.ts`), and `v3-locks.spec.ts` asserts no "AGI Workforce" copy, no `ModeSelectionDialog`, no stray cap modal. Broader journeys live in `comprehensive-flows.spec.ts` and `goal-to-completion.spec.ts`. Requirement: each panel and composer control has a stable `data-testid`/`aria-label` contract test. ✅ Built (Playwright suites above; `pnpm --filter @agiworkforce/desktop test:e2e`). Gap: AGI Code (`CodeModeHome.tsx`) is not mounted, so it has no functional coverage — 🟡.

## Desktop Integration

Desktop is the native host: it runs the `127.0.0.1` WS/IPC bridge for Chrome + VS Code (`websocket_server.rs`), the Chrome native-messaging host `com.agiworkforce.browser` (`native_messaging/mod.rs`), and the Desktop↔Mobile companion. Contract tests must cover: loopback-only bind and origin checks, bridge-token auth, and the SEV-DESK-01 IP lockout after repeated auth failures (`websocket_server.rs`); HMAC verification on native-messaging frames (`native_messaging/mod.rs`, `HmacSha256`); and MCP client/server/tool lifecycle (`apps/desktop/src-tauri/tests/mcp_integration_test.rs` — creation, connection, tool listing/execution/search). ✅ Built for bridge/HMAC/MCP unit + integration paths. The Desktop↔Mobile companion is experimental (panel commented out of chat index; control events re-emitted with no listener), so its end-to-end pairing/approval test is 🟡 — pairing UI (`src/features/mobile-companion/QRPairingCard.tsx`) exists but the round-trip is not wired.

## Cloud Mode

Managed Cloud is public alpha, open by default for signed-in users. Tests must verify: Cloud is a distinct labeled mode; a Cloud chat syncs via Neon delta-sync only when storage mode is `cloud` (`apps/desktop/src-tauri/src/data/{settings_sync,projects_sync}.rs`; cursor + tombstone + idempotent-upsert semantics mirror `apps/web/app/api/{chat,memory,projects}/sync`); and plan gating (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) is enforced server-side with the paywall rendered from server responses. GDPR export/delete has coverage (`apps/desktop/e2e/gdpr.spec.ts`). 🟡 Built: sync modules and GDPR flow exist; a full cross-device (Web↔Mobile↔Desktop) delta-sync convergence test and a per-plan entitlement matrix test are 🔭. Never assert INR for Pro/Max — those are TBD.

## Local Mode

Local is the default trust mode and must load with **no** cloud/BYOK call. The Privacy tab has no cloud-sync toggle and `settings_load_from_disk` coerces any persisted `"cloud"` back to `"local"` (`apps/desktop/AGENTS.md`). Tests must assert: `chatStorageMode` defaults to `local`; a Local send performs zero outbound provider/sync request (network-assertion via Playwright route interception + `e2e/mocks`); Local files stay on disk. `send_message.rs` derives `cloud_sync_enabled = chat_storage_mode == "cloud"`, and a negative test must prove the default local path never sets it. 🟡 Built (local-default gate documented + coercion in code); an explicit "Local emits no network" Playwright assertion is 🔭.

## Multi-provider

BYOK is Desktop/CLI/VS Code only. Provider selection and fallback are covered (`apps/desktop/playwright/provider-switching.spec.ts` — switch provider, verify active provider matches `/openai|anthropic|ollama|google/i`, configure multiple, fallback on failure). Keys must live in OS keychains; the encrypted vault has round-trip, wrong-password, and delete tests (`apps/desktop/src-tauri/src/tests/byok_vault_tests.rs`). LLM adapter behavior is covered by `llm_tests.rs`. Requirement: model pickers read IDs **only** from `packages/contracts/types/src/models.json`; a test must fail if any hardcoded/unknown model ID appears in the picker. The **Local→BYOK fork** needs a contract test proving context selection + secret scan + payload preview + provider label + consent all gate the crossing. ✅ Built (provider switch, vault); 🟡 the fork-consent E2E and the models.json-only lint test are not yet present.

## Performance

Perf QA is smoke-gated, not budget-gated yet. `test-stability-runner.spec.ts` and `visual-regression.spec.ts` catch gross regressions; `pnpm --filter @agiworkforce/desktop test:smoke` is the fast gate. Requirement: cold-start (window ≤ 1.5 s), streaming-token cadence, and idle-CPU/memory budgets each get an asserted threshold in CI. 🔭 Planned — criterion benches exist for core micro-ops (`src-tauri/benches`) but launch/streaming budgets are not CI-enforced (see Volume 24).

## Security

Security tests are the strongest suite. `security_tests.rs` covers `command_validator` + `tool_guard` (dangerous patterns, metacharacters, null bytes, Windows destructive commands, interactive vs one-shot, confirmation tiers). Automation safety is covered by `automation/safety_patterns.rs` and `agi-safety.spec.ts` (high-risk action detection/approval). Trust-boundary contract tests are mandatory: no silent Local→Cloud/BYOK routing, bridge-token + IP-lockout enforcement, HMAC on companion frames. ✅ Built (validator/guard/vault/lockout). Gap: a single consolidated "trust-boundary suite" tying these into one gate is 🟡. See Volume 19.

## Accessibility

Automated a11y runs axe-core against home, chat, and settings with a no-critical-violations gate, plus WCAG 2.1.1 keyboard-navigation checks (`apps/desktop/e2e/accessibility-audit.spec.ts`, `axe-playwright`). Requirement: focus order, aria-labels on every composer control (already asserted in `v3-reachability.spec.ts`), and reduced-motion honoring. ✅ Built (axe + keyboard); screen-reader announcement checks are 🔭 (see Volume 22).

## Cross-platform

Desktop ships macOS / Windows / Linux. Windows-specific behavior (paths, keychain = Credential Manager, destructive-command patterns) is covered by `windows_compat_tests.rs`; UI automation has a Windows UIA path (`automation/integration_tests.rs`). Requirement: keychain round-trip per OS (macOS Keychain / Windows Credential Manager / Linux Secret Service) and per-OS smoke. 🟡 Built (Windows compat + automation); Linux Secret Service and mac-signing e2e gates are 🔭.

## Regression

Regression is enforced by the locks + visual suites: `v3-locks.spec.ts` (anti-pattern lock), `visual-regression.spec.ts` / `visual-verification.spec.ts` (screenshot diffs), and `test-stability-runner.spec.ts` (flake watch). Rust regressions run via `cargo test -p agiworkforce-desktop` across `src-tauri/tests` + `src/tests`. Requirement: every fixed trust-boundary bug adds a permanent negative test. ✅ Built (locks + visual + cargo). Gap: a tagged "trust-boundary regression" subset is 🔭.

## Repository map

- `apps/desktop/playwright.config.ts`, `apps/desktop/e2e/**`, `apps/desktop/playwright/**` — Playwright suites, fixtures, page-objects, mocks.
- `apps/desktop/src-tauri/tests/**`, `apps/desktop/src-tauri/src/tests/**` — cargo integration + unit tests (vault, security, LLM, MCP, Windows compat).
- `apps/desktop/src-tauri/src/automation/**` — computer-use host + safety-pattern tests.
- `apps/desktop/src-tauri/src/{integrations/realtime,integrations/native_messaging,data}/**` — bridge, native-messaging, sync under test.
- `apps/desktop/package.json` — `test`, `test:e2e`, `test:smoke`; `packages/contracts/types/src/models.json` — model-ID SSOT.

## Competitor notes

Claude Code, ChatGPT desktop, and Codex ship QA for a mostly single-vendor, cloud-first path. AGI's divergence is deliberate: our QA must prove **per-surface trust** (BYOK on Desktop only), **multi-provider** selection/fallback from a single model SSOT, and **local-first** guarantees (Local emits no network). Remote Control is tested as a secure window over a locally running session — QR + HMAC + approval — not as a cloud handoff. No competitor's QA asserts "Local data never leaves the device" as a first-class gate; ours must.

## Acceptance / Definition of Done

Production-ready when all three engines are green in CI and the trust-boundary suite blocks merge.

- [ ] Build: `pnpm --filter @agiworkforce/desktop test`, `test:e2e`, and `cargo test -p agiworkforce-desktop` pass on macOS + Windows; smoke gate on Linux.
- [ ] Trust: contract tests prove no silent Local→BYOK/Cloud routing, Local→BYOK fork is consent-gated, bridge/HMAC/IP-lockout enforced, sync fires only in `cloud` mode.
- [ ] Security: validator/guard/vault/automation-safety suites green; every fixed boundary bug has a permanent negative test.

## Anti-patterns

- Do not assert network absence with a passing test that never actually intercepts traffic (fake green).
- Do not hardcode model IDs in fixtures; read `packages/contracts/types/src/models.json`.
- Do not weaken a trust-boundary test to make a flow pass — fix the flow.
- Never reference Supabase or `middleware.ts`; Next.js 16 uses `proxy.ts`.
- Do not encode removed tiers ("Plus", `pro_plus`, "Hobby") or invent Pro/Max INR prices or credit top-ups in entitlement tests.
- Do not treat build success or a screenshot diff as proof a trust boundary holds — assert it directly.
