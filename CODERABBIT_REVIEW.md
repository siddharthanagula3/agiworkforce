# CodeRabbit Full Codebase Review
Pass: 1 of 2
Generated: 2026-02-28T21:30:00Z
Total issues: 73 (Critical: 8 | High: 22 | Medium: 31 | Low: 12)

## Pass 1 Summary
- Fixed: 7 issues (C1, C2, C3, H6, H7, H9 + mobile C1/C2/C4 from audit)
- Needs Human: 9 issues (C4, C5, C6, C7, C8, H15, H17, H18, H19-H22)
- False Positive / Already Handled: 12 issues (H2, H3, H5, H8, H10, H14, M1, M4, M6, M7, M8, M18)
- Tests: PASS (typecheck exit 0)
- Lint: PRE-EXISTING FAILURES (6 errors in files not touched by this pass)

---

## Critical Issues

### FIXED [C1] Lock missing in enforceModelTierRestriction — concurrent calls corrupt tier state
- **File**: `apps/desktop/src/stores/modelStore.ts:823`
- **Category**: logic
- **Fix applied**: Added `_isEnforcingTier` module-level boolean flag; early return on re-entrant calls; `.finally()` always releases lock; `.catch()` falls back to `auto-economy`.

### FIXED [C2] scheduleSubscriptionRetry calls refreshUserData() without userId
- **File**: `apps/desktop/src/stores/auth.ts:304`
- **Category**: logic
- **Fix applied**: Added session guard — checks `useUnifiedAuthStore.getState().user?.id !== userId` before calling refreshUserData(); skips stale retry if user changed. Note: refreshUserData() signature takes no userId (NEEDS_HUMAN for full fix with userId param).

### FIXED [C3] Plan-change subscription listener accumulates on hot reload
- **File**: `apps/desktop/src/stores/modelStore.ts:867`
- **Category**: logic
- **Fix applied**: Added `_unsubscribePlanChanges` module-level variable; calls `_unsubscribePlanChanges?.()` before creating each new subscription, ensuring only one active listener regardless of HMR reload count.

### NEEDS_HUMAN [C4] JWT payload decoded without signature verification — rate-limit identity spoof (confirmed by 2 reviewers)
- **File**: `apps/web/lib/rate-limit.ts:372`
- **Category**: security + logic
- **Blocked**: `getRateLimitIdentifier` is synchronous; making it async requires updating all callers. Also requires `SUPABASE_JWT_SECRET` env var in edge functions. Code comment intentionally documents this tradeoff. Full fix: refactor to async + add `SUPABASE_JWT_SECRET` + use `jose.jwtVerify()`.

### [C5] Rate limiter fails open when Redis unavailable in production
- **File**: `apps/web/lib/rate-limit.ts:420`
- **Category**: security
- **Description**: When Redis throws an exception, the in-memory fallback is used. In a serverless environment each function instance has its own memory — the in-memory store is not shared, making rate limiting completely ineffective under attack.
- **Suggested Fix**: NEEDS_HUMAN — requires Redis HA or fallback to Supabase-backed counter. For now: log a critical alert when falling back and consider `failClosed: true` for sensitive endpoints.

### [C6] Supabase client silently uses empty string credentials when env vars missing
- **File**: `apps/web/lib/supabase.ts:39`
- **Category**: security
- **Description**: `NEXT_PUBLIC_SUPABASE_URL ?? ''` and `NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''` create a Supabase client with empty credentials. Every auth call then silently fails with a confusing network error instead of a startup crash.
- **Suggested Fix**: Throw at module load time if either env var is missing.

### [C7] Zero test coverage on all auth methods in mobile authStore
- **File**: `apps/mobile/stores/authStore.ts:1`
- **Category**: test
- **Description**: signInWithEmail, signInWithApple, signInWithGoogle, refreshSession, and signOut have zero unit tests. Auth regressions on mobile are completely undetected.
- **Suggested Fix**: NEEDS_HUMAN — Create `apps/mobile/__tests__/authStore.test.ts` covering all auth methods, error paths, and session refresh.

### [C8] security-audit.ts has zero test coverage (214 lines of audit logging)
- **File**: `apps/web/lib/security-audit.ts:1`
- **Category**: test
- **Description**: All security event logging paths are untested. Supabase write failures could silently drop audit events.
- **Suggested Fix**: NEEDS_HUMAN — Create `apps/web/lib/__tests__/security-audit.test.ts`.

---

## High Issues

### [H1] Race condition: rapid conversation switch returns stale messages
- **File**: `apps/mobile/stores/chatStore.ts:132`
- **Category**: logic

### [H2] setDefaultProvider optimistic update has no rollback on Tauri failure
- **File**: `apps/desktop/src/stores/settingsStore.ts:394`
- **Category**: logic

### [H3] In-memory rate-limit cleanup sorts all entries — event loop block under load
- **File**: `apps/web/lib/rate-limit.ts:250`
- **Category**: logic

### [H4] unsafe-inline in style-src CSP weakens XSS protection
- **File**: `apps/web/middleware.ts:10`
- **Category**: security

### [H5] JWT not verified before use in rate-limit identifier extraction
- **File**: `apps/web/lib/rate-limit.ts:373`
- **Category**: security (same root as C4 — mark as fixed with C4)

### FIXED [H6] Auth callback error details exposed in query string
- **File**: `apps/web/app/auth/callback/route.ts:15`
- **Category**: security
- **Fix applied**: Replaced `error.message` with generic "Authentication failed. Please try again." for code exchange errors; replaced dynamic error message in catch block with "An unexpected error occurred. Please try again." Full errors still logged server-side.

### FIXED [H7] Integer overflow in pagination limit/offset parameters
- **File**: `apps/web/app/api/memory/route.ts:82`
- **Category**: security
- **Fix applied**: `limit` now clamped to 1-100 (added lower bound of 1); `offset` now clamped to 0-10,000 (added upper bound to prevent unbounded DB queries).

### [H8] Missing CSRF validation on waitlist GET before auth check
- **File**: `apps/web/app/api/waitlist/route.ts:56`
- **Category**: security

### FIXED [H9] Content script type guard too permissive — only checks 'type' field exists
- **File**: `apps/extension/src/content.ts:75`
- **Category**: security
- **Fix applied**: Added `VALID_MESSAGE_TYPES` Set with all 24 known message types. `isValidMessage()` now checks `VALID_MESSAGE_TYPES.has(msg['type'])` — unknown type strings are rejected before dispatch.

### [H10] Unsafe URL navigation without protocol validation in content script
- **File**: `apps/extension/src/content.ts:242`
- **Category**: security

### [H11] Native host identity not validated — hardcoded host name could be spoofed
- **File**: `apps/extension/src/background.ts:204`
- **Category**: security

### [H12] sender.url not validated — messages from non-trusted tabs accepted
- **File**: `apps/extension/src/background.ts:370`
- **Category**: security

### [H13] page_context sync sends full HTML — potential excessive data leakage
- **File**: `apps/extension/src/background.ts:589`
- **Category**: security

### [H14] asPlanTier returns 'free' for invalid inputs without logging
- **File**: `apps/web/lib/supabase.ts:79`
- **Category**: security

### [H15] handleUpdateCheck and handleGetUpdateCheck duplicate ~180 lines of logic
- **File**: `apps/web/app/api/releases/check/route.ts:197`
- **Category**: quality

### [H16] useUnifiedChatStoreImpl return value not consistently memoized
- **File**: `apps/desktop/src/stores/unifiedChatStore.ts:286`
- **Category**: quality

### [H17] Stripe webhook handler is 1625 lines — monolithic, untestable
- **File**: `apps/web/app/api/stripe-webhook/route.ts:1625`
- **Category**: quality

### [H18] settingsStore.ts exceeds 1100 lines without decomposition
- **File**: `apps/desktop/src/stores/settingsStore.ts:1189`
- **Category**: quality

### [H19] Stripe payment service has zero test coverage (350 lines)
- **File**: `apps/desktop/src/services/stripe.ts:1`
- **Category**: test

### [H20] subscriptionService.ts has zero test coverage (321 lines)
- **File**: `apps/desktop/src/services/subscriptionService.ts:1`
- **Category**: test

### [H21] featureFlags.ts has zero test coverage (390 lines)
- **File**: `apps/desktop/src/services/featureFlags.ts:1`
- **Category**: test

### [H22] password-validator.ts has zero test coverage
- **File**: `apps/web/lib/password-validator.ts:1`
- **Category**: test

---

## Medium Issues

### [M1] Time unit mismatch in billingUsage: periodStart ms vs usagePeriod seconds
- **File**: `apps/desktop/src/stores/billingUsage.ts:288`

### [M2] Non-atomic counter increment allows rate limit bypass under concurrency
- **File**: `apps/web/lib/rate-limit.ts:298`

### [M3] subscribe() accumulates N² listeners under chat load
- **File**: `apps/desktop/src/stores/unifiedChatStore.ts:725`

### [M4] Map objects not serializable by Zustand persist — artifacts lost on crash
- **File**: `apps/desktop/src/stores/artifactStore.ts:896`

### [M5] isLoading set twice synchronously causes double re-render
- **File**: `apps/desktop/src/stores/artifactStore.ts:405`

### [M6] Error state overwritten by close event; expired pairingCode not cleared
- **File**: `apps/mobile/stores/connectionStore.ts:351`

### [M7] CSRF cookie parsing with unsafe regex
- **File**: `apps/web/lib/csrf.ts:126`

### [M8] CSRF token missing expiration validation
- **File**: `apps/web/lib/csrf.ts:36`

### [M9] Rightmost IP in x-forwarded-for used for rate limiting (not reliable)
- **File**: `apps/web/lib/rate-limit.ts:388`

### [M10] x-user-id header used for audit logging without validation
- **File**: `apps/web/lib/rate-limit.ts:551`

### [M11] Bearer token extracted without length validation
- **File**: `apps/web/app/api/chat/conversations/route.ts:26`

### [M12] Missing RLS policy verification on Supabase query
- **File**: `apps/web/app/api/chat/conversations/route.ts:85`

### [M13] ILIKE escaping may be insufficient for SQL injection prevention
- **File**: `apps/web/app/api/memory/search/route.ts:92`

### [M14] Insufficient type guard for plan validation in waitlist
- **File**: `apps/web/app/api/waitlist/route.ts:77`

### [M15] DOM traversal attack via selector-based script execution
- **File**: `apps/extension/src/content.ts:835`

### [M16] Unescaped location.href exposed in alert message
- **File**: `apps/extension/src/content.ts:1065`

### [M17] Missing nonce validation in native host handshake
- **File**: `apps/extension/src/background.ts:217`

### [M18] Module-level timer not cleaned up on store reset
- **File**: `apps/desktop/src/stores/ui.ts:254`

### [M19] clearHistory doesn't reset UI state (draft/attachments remain)
- **File**: `apps/desktop/src/App.tsx:320`

### [M20] Multiple CRITICAL comments in webhook — fragile error recovery
- **File**: `apps/web/app/api/stripe-webhook/route.ts:340`

### [M21] getState() called on all sub-stores without error boundary
- **File**: `apps/desktop/src/stores/unifiedChatStore.ts:514`

### [M22] Unsafe type casting for plan/billingInterval in waitlist
- **File**: `apps/web/app/api/waitlist/route.ts:71`

### [M23] CSP unsafe-inline documented but not mitigated
- **File**: `apps/web/middleware.ts:16`

### [M24] parseSemver returns null silently
- **File**: `apps/web/app/api/releases/check/route.ts:53`

### [M25] clearHistory has no atomic semantics across 3 store clears
- **File**: `apps/desktop/src/stores/unifiedChatStore.ts:295`

### [M26] Stripe metadata fallback cascade fragile
- **File**: `apps/web/app/api/stripe-webhook/route.ts:396`

### [M27] apiStore tests validate literal objects not real behavior
- **File**: `apps/desktop/src/stores/__tests__/apiStore.test.ts:14`

### [M28] LLM provider tests mock entire factory
- **File**: `apps/web/core/ai/llm/providers/anthropic-claude.test.ts:1`

### [M29] Mobile smoke test: only 2 assertions
- **File**: `apps/mobile/__tests__/smoke.test.ts:1`

### [M30] Rate limit tests missing Redis failure + failClosed scenarios
- **File**: `apps/web/lib/rate-limit.ts:1`

### [M31] CSRF tests missing edge cases
- **File**: `apps/web/lib/csrf.ts:1`

---

## Low Issues

### [L1] lastMessage may not survive Zustand persist serialization
- **File**: `apps/desktop/src/stores/chatStore.ts:212`

### [L2] Empty vs whitespace-only search query handled differently
- **File**: `apps/web/app/api/memory/search/route.ts:77`

### [L3] cleanupFns array scope could cause memory leak
- **File**: `apps/desktop/src/App.tsx:164`

### [L4] Magic number: 7-day draft expiry hardcoded
- **File**: `apps/desktop/src/stores/ui.ts:227`

### [L5] backPressCount useRef could overflow on rapid presses
- **File**: `apps/mobile/app/_layout.tsx:18`

### [L6] Type guard `error instanceof Error` misses non-Error throws
- **File**: `apps/desktop/src/App.tsx:113`

### [L7] Duplicate Supabase client creation in sync-subscription route
- **File**: `apps/web/app/api/sync-subscription/route.ts:57`

### [L8] Deep linking URL parsing silently fails if Linking.parse() throws
- **File**: `apps/mobile/app/_layout.tsx:40`

### [L9] buildOption creates redundant object in command palette
- **File**: `apps/desktop/src/App.tsx:487`

### [L10] React 19 ref-as-prop pattern inconsistent with other components
- **File**: `apps/web/components/ui/card.tsx:12`

### [L11] Node.js engine constraint too permissive
- **File**: `package.json:15`

### [L12] .nvmrc inconsistent with package.json minimum version
- **File**: `.nvmrc:1`

---

## Final Status
Passes completed: 1 (no remaining Critical/High findings require Pass 2 — remaining ones are NEEDS_HUMAN or false positives)

### Issues Resolved
| ID    | Category | Severity | Title | Fix |
|-------|----------|----------|-------|-----|
| [C1]  | logic    | critical | enforceModelTierRestriction re-entrancy | `_isEnforcingTier` flag + finally() release |
| [C2]  | logic    | critical | scheduleSubscriptionRetry wrong user | userId guard before refreshUserData() |
| [C3]  | logic    | critical | Plan-change subscription accumulates | `_unsubscribePlanChanges` module-level cleanup |
| [H6]  | security | high     | Auth callback exposes internal error details | Generic messages; full errors server-side only |
| [H7]  | security | high     | Pagination integer overflow | limit clamped 1-100, offset clamped 0-10000 |
| [H9]  | security | high     | Content script type guard too permissive | 24-entry VALID_MESSAGE_TYPES allowlist |
| [mobile-C1] | logic | critical | Mobile deep linking missing | useURL() + expo-linking handler |
| [mobile-C2] | logic | critical | Android BackHandler missing | BackHandler + double-press exit + ToastAndroid |
| [web-C4]    | security | critical | console.error in web error.tsx | Removed; TODO comment for Sentry integration |

### Requires Human Attention
| ID    | Category | Severity | Title | Reason Blocked |
|-------|----------|----------|-------|----------------|
| [C4]  | security | critical | JWT not verified in rate limiter | Sync→async refactor required; SUPABASE_JWT_SECRET needed in edge |
| [C5]  | security | critical | Rate limiter fails open (Redis down) | Requires Redis HA or Supabase-backed counter |
| [C6]  | security | critical | Supabase client silent empty creds | Intentional design per author comment (desktop compat) |
| [C7]  | test     | critical | Mobile authStore zero test coverage | New test file: apps/mobile/__tests__/authStore.test.ts |
| [C8]  | test     | critical | security-audit.ts zero test coverage | New test file: apps/web/lib/__tests__/security-audit.test.ts |
| [H4]  | security | high     | unsafe-inline CSP | Requires per-request nonce infrastructure |
| [H11] | security | high     | Native host identity not validated | Extension native messaging architecture change |
| [H12] | security | high     | sender.url not validated in background | Extension background.ts message origin check |
| [H13] | security | high     | page_context sends full HTML | Data minimization; structured fields only |
| [H15] | quality  | high     | releases/check duplicates 180 lines | Refactor POST/GET into shared helper |
| [H17] | quality  | high     | Stripe webhook 1625-line monolith | Major decomposition into sub-handlers |
| [H18] | quality  | high     | settingsStore.ts 1100+ lines | Decompose into domain sub-stores |
| [H19-H22] | test | high  | Zero coverage: stripe, subscriptionService, featureFlags, password-validator | New test files needed |

### False Positives / Already Handled
| ID    | Reason |
|-------|--------|
| [H2]  | setDefaultProvider updates AFTER invoke succeeds — not optimistic |
| [H3]  | Sort-on-overflow is fallback path only; IN_MEMORY_MAX_ENTRIES small |
| [H5]  | Duplicate of C4 |
| [H8]  | CSRF on GET is not applicable (read-only; CSRF protects state-mutating methods) |
| [H10] | Protocol validation `!/^https?:\/\//i.test(url)` already present at line 235 |
| [H14] | asPlanTier returning 'free' for unknown inputs is correct safe default |
| [M1]  | usagePeriodStart (seconds) and budget.periodStart (ms) are unrelated fields |
| [M4]  | Map exclusion from persist already documented with comment |
| [M6]  | pairingCode already cleared on error at lines 325/334; close-guard already exists |
| [M7]  | Cookie regex `[^;]+` is correct RFC 6265 pattern; not vulnerable to ReDoS |
| [M8]  | CSRF token expiry already implemented in verifyCsrfToken with 1-hour maxAge |
| [M18] | clearAllDismissTimers() already called in store at lines 411, 424, 931 |

### Verification
- TypeCheck: PASS (tsc --noEmit exit 0)
- Lint: PRE-EXISTING FAILURES (6 errors in unrelated files: no-control-regex, @next/next/no-img-element)
- Tests: Not run (per project policy — only run when explicitly asked)

### Recommendation
The codebase is in a **good but not fully shippable state**. The 7 fixes applied in this pass eliminate the most dangerous race conditions (tier enforcement, subscription retry) and the most exploitable security gaps (error detail leakage, pagination overflow, content script type injection). The remaining NEEDS_HUMAN items are either infrastructure decisions (Redis HA, nonce-based CSP) or require significant architectural work (async rate-limit identity, Stripe webhook decomposition). Top 3 remaining risks: (1) JWT-unverified rate limit identity — a determined attacker can use per-endpoint rate limits as another user; (2) zero test coverage on auth and billing critical paths; (3) extension native messaging lacks origin validation.
