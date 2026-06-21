# Web Bug Hunt — 2026-06-20

Status: Current
Owner: Web lead
Surface: `apps/web` (@agiworkforce/web, Next.js 16 App Router, Neon, Stripe, Clerk)

Method: spec-driven (web AGENTS.md contract baked into finders) → 16 domain finders → adversarial verify (verbatim grounding, by-design exclusions, critical/high double-verified correctness + reachability lenses) → manual self-confirmation. 20 confirmed (0 critical / 2 high / 13 medium / 5 low); 6 refuted, 3 disputed. Ground truth: typecheck ✅ (0 errors), lint ✅ (0 errors).

Applied the **permission-gating principle**: safe-contained bugs fixed now; Stripe/webhook/auth/prod-DB bugs are listed below for **sign-off** with proposed patches (not auto-applied).

## Fixed now (safe-contained) — verified typecheck/lint/tests green

| # | Sev | Title | File | Fix |
|---|-----|-------|------|-----|
| 2/12 | **high** | Webhook SSRF via lexical-only host check (DNS-rebind to 169.254.169.254 / RFC1918) | `app/api/agents/tool-executions/route.ts:123` | Swapped `assertNonInternalHostname` → `await assertResolvedPublicHostname` (DNS-resolving variant already used by the MCP route). Updated `ssrf-guard.test.ts` mock accordingly. |
| 15 | medium | `move-session-to-folder` called with 2 args (runtime crash) + bypassed ownership scoping | `app/api/chat/folders/route.ts:115` | Pass `userId` as 3rd arg → satisfies the 3-arg SQL fn and enforces `user_id = p_user_id`. |
| 20 | low (IDOR) | Reactions GET leaked reaction data + reactor user IDs for messages caller doesn't own | `app/api/chat/reactions/route.ts:97` | Joined `web_messages`/`web_conversations` and scoped to `wc.user_id = caller`. |
| 16 | low (authz) | `debug/llm-status` accepted any org owner/admin → read platform LLM config | `app/api/debug/llm-status/route.ts:37` | Replaced inline `organization_members` query with canonical `requireAdmin(request)` (platform role). |
| 7/10 | medium | Pricing: Max (monthly-only) showed "$0.00/mo · save 100%" under Annual toggle | `app/pricing/page.tsx:51,280` | `annualSavingsPct` returns 0 when `yearlyPriceUsd<=0`; price falls back to monthly when annual not offered. |

## SIGN-OFF REQUIRED (high-blast-radius: billing / webhooks / auth / DB) — proposed patches, NOT applied

| # | Sev | Title | File | Proposed fix |
|---|-----|-------|------|--------------|
| 1 | **high** | Admin "suspend user" writes `account_status` but it's never enforced — suspended users keep full access | `app/api/admin/security/route.ts:234` | Enforce `account_status` in the auth path (`getClerkAuthUser`/proxy session check): reject when not active. Touches core auth → review. |
| 3 | medium | Daily credit-reset cron force-sets `used=0` (destructive), wiping in-period usage / restoring spent quota | `app/api/cron/reset-credits/route.ts:114` | Make reset a no-op when the period row exists (idempotent allocate), or only reset at true period rollover. |
| 11 | medium | Monthly credit-reset only fires within a 1-hour window but cron runs once daily → backstop effectively never fires | `app/api/cron/reset-credits/route.ts:113` | Schedule hourly (`0 * * * *`) or remove the fragile time-window gate. (Pairs with #3 — fix together.) |
| 4 | medium | `get_or_create_credit_account` SELECT-then-INSERT with no `ON CONFLICT`/lock → 23505 → 500 on `/api/sync-subscription` under concurrency | `db/neon/0020_functions.sql:379` | Add `INSERT ... ON CONFLICT (...) DO ...` (matches `reset_credits_for_period`). **Requires a new migration.** |
| 5 | medium | `charge.refunded` over-revokes credits on partial refunds (uses cumulative `amount_refunded` each event) | `app/api/stripe-webhook/lib/handlers.ts:275` | Revoke only the new refund delta (inspect the latest refund object). |
| 6 | medium | Plan upgrade silently fails to grant incremental credits — invalid `transaction_type 'upgrade'` rejected by the DB guard | `app/api/upgrade/route.ts:257` | Use an allowed `transaction_type` (`adjustment`/`purchase`) or extend the `add_credits` guard + enum. |
| 14 | medium | Agentic MCP tool-loop streaming path skips ALL credit reconciliation + usage counters (free agentic usage) | `app/api/llm/v1/chat/completions/route.ts:135` | Route the agentic stream through the same reconciliation as `buildStreamResponse`. |
| 17 | low | Stripe webhook swallows the existing-subscription SELECT error → falls through to create/upsert, bypassing reset-vs-allocate | `app/api/stripe-webhook/lib/db.ts:763` | Re-throw the read error (let Stripe retry) instead of returning `[]`. |
| 18 | low | `credit-topup` swallows profile SELECT error → creates a brand-new Stripe customer (duplicate customers / orphaned billing) | `app/api/credit-topup/route.ts:89` | Throw on read failure instead of falling through to customer creation. |

## Deferred (product / cleanup decision)

- **#8** — Pricing page embedded waitlist form forces sign-in (byok `WaitlistForm` → `/api/waitlist/cloud-managed`) while the rest of the waitlist flow is anonymous. Swapping to the anonymous `PublicWaitlistForm` changes which list users join — a product decision (does requesting hosted access require an account?).
- **#9** — Ghost "Hobby" tier card with dead "Get Hobby" button in the billing dashboard (`features/billing/components/Billing/Subscription.tsx:298`). Remove as part of the in-progress Local/Pro/Max tier cleanup (confirm legacy `plan='hobby'` account handling).
- **#13** — Tool-loop emits `x_tool_approval_request` but the resume `/approve` endpoint doesn't exist (dead agentic approval flow). Implement the endpoint or change default `approvalMode`.
- **#19** — `auth/set-token` writes `agi_access_token`/`agi_refresh_token` cookies no production code reads; remove the mechanism or wire a consumer (auth-adjacent → confirm first).
