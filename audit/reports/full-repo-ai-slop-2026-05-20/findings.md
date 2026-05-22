# Full-Repo Audit Findings - 2026-05-20

This pass performed repo mapping, generated full file inventory and risk scans, then manually reviewed the files behind the highest-risk candidates and all remediated files. It does not claim that all 6,291 inventoried files were manually read end-to-end line-by-line; remaining review debt is tracked in `backlog.md`.

## P0

No new P0 was confirmed and fixed in this pass.

Historical P0/P1 items still documented in `AGI_WORKFORCE.md` and `docs/audit/` were not all re-proven or closed in this pass. The remaining migration/schema and launch-blocker items stay in the backlog unless directly remediated below.

## P1 Fixed

1. Desktop native messaging strict-MAC contract drift.
   - Evidence: extension strict mode rejects responses missing `mac`/`timestamp` after a session secret is negotiated at `apps/extension/src/background.ts:513` and `apps/extension/src/background.ts:529`.
   - Root issue: Rust native host response envelope did not provide `session_secret`, `timestamp`, or `mac` fields.
   - Fix: added signed native response envelope at `apps/desktop/src-tauri/src/integrations/native_messaging/mod.rs:217`, HMAC signing at `apps/desktop/src-tauri/src/integrations/native_messaging/mod.rs:262`, per-process secret generation at `apps/desktop/src-tauri/src/integrations/native_messaging/host.rs:34`, connect-secret emission at `apps/desktop/src-tauri/src/integrations/native_messaging/host.rs:80`, and signing before stdout write at `apps/desktop/src-tauri/src/integrations/native_messaging/host.rs:83`.
   - Regression coverage: `test_native_response_signing_adds_strict_envelope` at `apps/desktop/src-tauri/src/integrations/native_messaging/mod.rs:455`.

2. Desktop MCP Plan/Safe read-only allowlist rejected encoded tool IDs.
   - Evidence: MCP parser only accepted raw `mcp__<server>__<tool>` segments; live provider-safe tool names can be base64/hex encoded.
   - Risk: legitimate read-only MCP tools prompt unexpectedly in Plan/Safe mode, pushing users toward broader approvals and breaking the intended boundary.
   - Fix: decode base64url/base64/hex MCP segments before charset and exact allowlist validation at `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs:286` and `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs:302`.
   - Regression coverage: `mcp_encoded_read_tool_is_permitted_in_plan_mode` at `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs:1917`.

3. Mobile SQLCipher storage was a no-op stub.
   - Evidence: `apps/mobile/__tests__/storage-encryption.test.ts` failed against the prior no-op DB path, and `apps/mobile/storage/db.ts` contained comments saying persistence degraded to no-op/in-memory behavior.
   - Risk: encryption-at-rest contract and storage tests were not exercising real database initialization.
   - Fix: `apps/mobile/storage/db.ts:1` now imports Expo Crypto/SecureStore/SQLite, generates or reads a 256-bit hex DB key at `apps/mobile/storage/db.ts:35`, stores it with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` at `apps/mobile/storage/db.ts:44`, opens SQLite and applies `PRAGMA key` at `apps/mobile/storage/db.ts:84`, and runs migrations via `PRAGMA user_version` at `apps/mobile/storage/db.ts:73`.

4. Mobile storage schema/type drift broke workspace typechecking.
   - Evidence: `pnpm typecheck:all` failed before remediation on mobile storage contracts and imports.
   - Fix: storage types now match rows and call sites at `apps/mobile/storage/types.ts:1`; chat modes now match persisted migration checks at `apps/mobile/storage/migrations.ts:13` and `apps/mobile/storage/migrations.ts:27`; installed-model aliases preserve call-site compatibility at `apps/mobile/storage/installedModels.ts:15`; paywall import casing matches the actual path at `apps/mobile/components/model-picker/ModelPickerSheet.tsx:19`; telemetry row parsing is typed in the pre-existing untracked file `apps/mobile/storage/telemetry.ts:12`.

5. Dependency audit advisories in production dependency graph.
   - Evidence: initial `pnpm audit --prod` reported low/moderate advisories for `hono`, `mermaid`, `ip-address`, `brace-expansion`, and `ws`.
   - Fix: root overrides now force remediated floors at `package.json:48`; direct `mermaid`, `ws`, and ESLint ranges were aligned in app/service manifests; `pnpm-lock.yaml` re-resolved.
   - Verification: final `pnpm audit --prod` reported no known vulnerabilities.

## P2 Fixed

1. Root lint traversed local `.remember` scratch files and CommonJS Jest manual mocks as ESM.
   - Fix: ignored `.remember/**` at `eslint.config.mjs:42` and added a CommonJS manual-mock override at `eslint.config.mjs:534`.

2. Strict Rust clippy warnings in touched/high-risk desktop backend files.
   - Fixes included collapsed conditional logic, struct initialization, redundant closure removal, avoided owned path comparison, enumerated walk counters, range contains, derived default, and doc indentation across the desktop Rust files in the remediation log.
   - Verification: strict workspace clippy passed.

## P2/P3 Confirmed, Not Fixed In This Pass

1. Legacy Supabase migration split remains a launch risk.
   - Evidence: repo guidance says `supabase/migrations/` is canonical and `apps/web/supabase/migrations/` contains legacy Stripe RPC migrations missing from canonical.
   - Impact: paid-tier launch remains risky until canonical migrations are reconciled and verified against production/staging DB.

2. Mobile compliance ledger remains in-memory.
   - Evidence: `apps/mobile/services/complianceLedger.ts:1` still documents the real MMKV-backed implementation as follow-up, and `mmkvConsentLedger` stores data only in a process-local `Map`.
   - Impact: disclosure/consent state can be lost across app restarts.

3. Mobile storage/model/DSAR surface contains many pre-existing untracked files.
   - Evidence: initial and final `git status` include untracked mobile storage, services, model screens, legal screens, and tests.
   - Impact: important mobile behavior is outside tracked version control state and should be either committed intentionally or removed after review.

4. Web E2E config exists, but no `apps/web/e2e` directory was present in this pass.
   - Impact: web browser-flow coverage is not equivalent to desktop Playwright smoke.

5. Build/test warning backlog remains.
   - Evidence: `pnpm test` passes but logs jsdom `window.confirm`/navigation not-implemented messages and React `act(...)` warnings in some suites; `pnpm build` passes with Vite externalization/dynamic-import warnings.
   - Impact: not launch-blocking by itself, but can hide meaningful future failures.
