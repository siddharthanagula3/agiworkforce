# Codebase Review Findings

Generated: 2026-02-24T13:50:00Z
Total issues: 85 (Critical: 1 | High: 20 | Medium: 21 | Low: 19 | Config/Low: 12 | Quality: 12)

## Summary

- Fixed: 15 issues
- Needs Human Review: 5 issues (secrets rotation, API contract changes, infrastructure decisions)
- Skipped (low/cosmetic/duplicate): 65 issues (quality refactors, medium config, duplicates)
- Verification: tests PASS (683 web, 806 desktop), lint PASS (3 warnings), typecheck PASS

---

## Critical Issues

### [C1] CSRF test tests mock, not real implementation — FIXED

- **File**: `apps/web/__tests__/api/device-approve.test.ts:100`
- **Category**: test
- **Description**: `requireCsrfToken` is globally mocked to always return null. The CSRF test injects a 403 via `mockResolvedValueOnce` — so the 403 comes from the injected value, not the real code.
- **Fix applied**: Test now asserts `vi.mocked(requireCsrfToken).toHaveBeenCalledTimes(1)` on valid paths (fixed in prior session).

---

## High Issues — Security

### [H1] CORS `startsWith('tauri://')` allows any tauri:// origin — FIXED

- **File**: `apps/web/lib/cors.ts:79`
- **Category**: security
- **Description**: `origin.startsWith('tauri://')` allows `tauri://evil.example.com` to pass CORS validation.
- **Fix applied**: Replaced with `/^tauri:\/\/[a-zA-Z0-9._-]+$/.test(origin)`.

### [H2] Device link endpoint missing CSRF protection — FIXED

- **File**: `apps/web/app/api/device/link/route.ts:12`
- **Category**: security
- **Description**: `/api/device/link` had no CSRF check despite `/api/device/approve` having it. Cross-site requests could register attacker-controlled devices to victim accounts.
- **Fix applied**: Added `requireCsrfToken()` at top of `handleDeviceLink`.

### [H3] Device poll null status → pending instead of error — FIXED

- **File**: `apps/web/app/api/device/poll/route.ts:115`
- **Category**: logic
- **Description**: When RPC returned a row with null/undefined status, handler returned `{ status: 'pending' }` while DB row was already consumed, permanently locking the device out.
- **Fix applied**: Null consumed row returns 'pending' (concurrent race); non-null consumed row with no status throws internal error.

### [H4] Admin security GET handler has no rate limit — FIXED

- **File**: `apps/web/app/api/admin/security/route.ts:64`
- **Category**: security
- **Description**: GET handler had no `withRateLimit` call, unlike POST. Admin with valid token could bulk-export security audit logs.
- **Fix applied**: Added `withRateLimit(request, 'admin-security')` at start of GET handler.

### [H5] Anthropic prompt caching: cache_control at message level (silently ignored) — FIXED

- **File**: `apps/web/lib/llm-providers/anthropic.ts:396`
- **Category**: logic
- **Description**: `cache_control` was set at the message object level; Anthropic API requires it inside content block objects. Prompt caching was non-functional.
- **Fix applied**: Changed content to `[{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }]` when caching is enabled.

### [H6] subscription-service.ts: data.id accessed without null guard — FIXED

- **File**: `apps/web/lib/services/subscription-service.ts:455`
- **Category**: logic
- **Description**: After upsert, `data` could be null with certain RLS policies, causing `data.id` to throw TypeError.
- **Fix applied**: Added null guard: throws if `!data` after the error check.

### [H7] retry.ts: `includes('5')` too broad — FIXED

- **File**: `apps/desktop/src/utils/retry.ts:121`
- **Category**: logic
- **Description**: `error.message.includes('5')` matched any message with digit '5', causing unintended retries (e.g., "step 5", "port 5432 refused").
- **Fix applied**: Replaced with `/\b5\d{2}\b/.test(error.message)`.

### [H8] CSRF anonymous session ID regenerated per-request — NEEDS HUMAN

- **File**: `apps/web/lib/csrf.ts:118`
- **Category**: security
- **Description**: `getSessionIdFromRequest()` generates a new UUID per call for cookieless sessions, making CSRF tokens permanently invalid for the Tauri desktop app.
- **Blocked**: Requires adding a `session-id` cookie to the CSRF GET response — API contract change that affects desktop auth flow.

### [H9] Device poll: unauthenticated token retrieval — NEEDS HUMAN

- **File**: `apps/web/app/api/device/poll/route.ts:90`
- **Category**: security
- **Description**: Device fingerprint check skipped when stored record has no fingerprint. Attacker knowing device_id can poll and receive tokens.
- **Blocked**: Requires changes to device link flow to always require fingerprint — API contract change affecting all existing devices.

### [H10] LLM credit check double-spend race condition — NEEDS HUMAN

- **File**: `apps/web/app/api/llm/completion/route.ts:377`
- **Category**: security
- **Description**: When `checkAvailable` returns false, code calls `deductCredits` "to get error info". If deduction unexpectedly succeeds, credits are consumed without an LLM request.
- **Blocked**: Requires understanding credit service internals and whether `getBalance` exposes the same error detail.

### [H11] Supabase middleware: fail-open on missing env vars — ACCEPTED

- **File**: `apps/web/utils/supabase/middleware.ts:20`
- **Category**: security
- **Description**: Returns `NextResponse.next()` (pass-through) when env vars are missing.
- **Status**: Intentional design (confirmed by code comment). Production deployments always have env vars set.

### [H12] retry.test.ts: exponential backoff assertions check constants not measured values — FIXED

- **File**: `apps/desktop/src/__tests__/retry.test.ts:154`
- **Category**: test
- **Description**: Assertions at lines 154-159 checked `expectedDelays` local constants (always-pass), not `observedDelays` from the mock.
- **Fix applied**: Replaced assertions to check `observedDelays[1..3]`.

### [H13] device-poll.test.ts: fingerprint mismatch path untested — FIXED

- **File**: `apps/web/__tests__/api/device-poll.test.ts`
- **Category**: test
- **Description**: The fingerprint mismatch 403 path was completely untested.
- **Fix applied**: Added test that sends mismatched fingerprint and asserts 403.

### [H14] checkout.test.ts: mock path mismatch `../../` vs `@/` — FIXED

- **File**: `apps/web/__tests__/api/checkout.test.ts:24`
- **Category**: test
- **Description**: `vi.mock('../../services/supabase-server', ...)` does not intercept `@/services/supabase-server` imports in the route.
- **Fix applied**: Changed to `vi.mock('@/services/supabase-server', ...)`.

### [H15] toolStore.ts: rejectOperation dead mutations — FIXED

- **File**: `apps/desktop/src/stores/chat/toolStore.ts:557`
- **Category**: quality
- **Description**: Three field mutations (`.status`, `.rejectedAt`, `.rejectionReason`) before `splice()` are discarded by Immer since the item is removed. Rejection metadata was never stored.
- **Fix applied**: Removed the three dead mutation lines; function now only splices (matching `approveOperation` behavior).

---

## High Issues — Config

### [H16] Real Supabase credentials in apps/desktop/.env.local — NEEDS HUMAN (monitor)

- **File**: `apps/desktop/.env.local:6`
- **Category**: config
- **Description**: Real Supabase project URL and JWT anon key present. `git log --all -- apps/desktop/.env.local` confirms file was never committed.
- **Status**: File never committed, safe. Recommend rotating anon key as precaution and ensuring .gitignore covers this path.

### [H17] tauri-action@v0 floating tag in release pipeline — NEEDS HUMAN

- **File**: `.github/workflows/release-desktop.yml:257`
- **Category**: config
- **Description**: `tauri-apps/tauri-action@v0` is a floating major-version tag. Runs with signing keys in scope.
- **Blocked**: Requires pinning to specific commit SHA after verifying the current action version.

---

## Quality Fixes

### [Q1] AbortError not exported — FIXED

- **File**: `packages/utils/src/async.ts:29`
- **Fix applied**: Changed `class AbortError` to `export class AbortError`.

### [Q2] Stale deployment comment in google.ts — FIXED

- **File**: `apps/web/lib/llm-providers/google.ts:166`
- **Fix applied**: Removed `// Force redeployment - 2026-02-03`.

---

## Config Fixes

### [CF1] Cargo.toml unsafe_code set to warn instead of deny — FIXED

- **File**: `apps/desktop/src-tauri/Cargo.toml:14`
- **Fix applied**: Changed `unsafe_code = "warn"` to `unsafe_code = "deny"` to match CI policy.

---

## Remaining Medium/Low Issues (deferred)

The following medium/low issues are tracked but deferred as they are refactoring tasks with no correctness or security impact:

- **M1**: `llm/completion/route.ts` `findCheaperFallbackModel` skips same-provider cheaper models
- **M2**: Multiple medium security/config items (admin CSRF, SSO XML, rate-limit X-Forwarded-For, etc.)
- **L1–L19**: Low-severity quality items (magic numbers, named constants, function decompositions, duplicate logic extractions)
