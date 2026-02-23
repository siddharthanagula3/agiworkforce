# Subscription Posture Audit — RC 2026-02-23

## Summary

Subscription enforcement uses a **two-layer model**: client-side gating for UX (fast feedback) and server-side token validation for cloud LLM requests (security enforcement).

## Client-Side Gates

| Gate Function             | File                                             | Purpose                                                             |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| `checkSubscriptionGate()` | `apps/desktop/src/utils/subscriptionGate.ts:16`  | General app access gate — checks auth state and subscription status |
| `checkAutoModeAccess()`   | `apps/desktop/src/utils/subscriptionGate.ts:72`  | Auto Mode requires Hobby tier or above                              |
| `canUseAPIKeys()`         | `apps/desktop/src/utils/subscriptionGate.ts:107` | Delegates to `checkSubscriptionGate()`                              |
| `getUpgradeMessage()`     | `apps/desktop/src/utils/subscriptionGate.ts:112` | UI copy for upgrade prompts                                         |

**UI Components using gates:**

- `apps/desktop/src/components/Subscription/SubscriptionGate.tsx` — wraps child components, shows lock dialog
- `apps/desktop/src/components/Subscription/SubscriptionLockDialog.tsx` — upgrade prompt dialog

**How subscription data arrives:**

1. On sign-in, `supabaseAuth.ts` queries Supabase `subscriptions` table directly
2. Fallback: `fetchSubscriptionFromWebAPI()` calls `GET /api/me` with Bearer token (line 140)
3. Result cached in `AuthState.subscription` (in-memory Zustand-like state)
4. Real-time subscription changes tracked via Supabase channel (line 611)

All client-side gates read from `supabaseAuth.getState().subscription` — this is local state derived from server data but **not re-validated on each action**.

## Server-Side Enforcement

| Enforcement Point | File                                                                              | Mechanism                                                                                               |
| ----------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Cloud LLM proxy   | `apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs:471-482` | Sends user's Supabase JWT as Bearer token to `https://api.agiworkforce.com/api/llm/v1/chat/completions` |
| Token storage     | `apps/desktop/src-tauri/src/sys/account/mod.rs:389`                               | `get_access_token()` reads from in-memory RwLock                                                        |
| Token sync        | `apps/desktop/src/services/supabaseAuth.ts:300-306`                               | Frontend syncs Supabase `access_token` and `refresh_token` to Rust backend on sign-in and token refresh |

**Server-side validation flow:**

1. Desktop app calls `ManagedCloudProvider::send_message()`
2. Rust backend reads the Supabase JWT from in-memory storage
3. Sends it as `Authorization: Bearer <jwt>` to `api.agiworkforce.com`
4. The API gateway validates the JWT, checks subscription tier, and proxies to the upstream LLM provider
5. If subscription is invalid/expired, the API returns 401/403

This means **cloud LLM access is server-validated** — even if a user bypasses the client-side gate, the API gateway will reject unauthorized requests.

## Gaps and Observations

1. **Local Ollama has no subscription gate**: Ollama runs locally and is free-tier accessible. This is by design (free tier = local models only). No gap.

2. **Client-side gates are advisory**: A technically sophisticated user could bypass `checkSubscriptionGate()` in the renderer process. However, cloud LLM calls go through the managed cloud provider which requires a valid JWT validated server-side. The client-side gate prevents accidental usage, not malicious bypass.

3. **Grace period logic is client-only** (`subscriptionGate.ts:42-51`): The 7-day grace period for `past_due` subscriptions is enforced client-side. The server should also implement this — verify that the API gateway has matching grace period logic.

4. **No offline subscription cache expiry**: If a user's subscription expires while they are offline, the cached subscription state will still show `active` until the next server sync. This is a minor gap — cloud LLM calls will fail server-side anyway, but local UI features gated by subscription could be accessible temporarily.

## Verdict

**ACCEPTABLE for RC.** Cloud LLM access (the revenue-critical path) is properly server-validated. Client-side gates provide good UX but are not the security boundary.
