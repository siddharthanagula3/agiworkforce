# AGI Desktop — Volume 18 — Subscription

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-11

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/desktop/AGENTS.md`. Grounded in real repo paths: `packages/contracts/types/src/billing-catalog.ts`, `apps/desktop/src/constants/pricing.ts`, `apps/desktop/src/features/settings/tabs/Billing/index.tsx`, `apps/desktop/src/features/settings/BillingSettings.tsx`, `apps/desktop/src/features/settings/AccountSettings.tsx`, `apps/desktop/src/features/settings/tabs/Account/index.tsx`, `apps/desktop/src/lib/stripeCheckout.ts`, `apps/desktop/src/stores/auth.ts`, `apps/desktop/src/features/v3/CancelFlow.tsx`, `apps/web/app/api/checkout/route.ts`, `apps/web/app/api/portal/route.ts`, `apps/web/app/api/sync-subscription/route.ts`, `apps/web/app/api/stripe-webhook/route.ts`.

## Overview & stance

This volume defines the subscription surface for AGI Desktop: what plans exist, what each grants, and how billing, upgrade, downgrade, cancellation, and restore work on a Tauri v2 + React desktop app.

The load-bearing rule: **Local and BYOK are free access modes, not plans.** Desktop is the full-trust surface (Local + BYOK + Managed Cloud), and a subscription governs **only** the Managed-Cloud path — hosted compute, metered usage, and higher-capacity model access. Running Ollama/LM Studio locally, or wiring your own provider keys under the Local→BYOK explicit fork (context selection, secret scan, payload preview, provider label, consent), requires **no account and no plan**. The subscription ladder never gates Local or BYOK.

Desktop does not embed a payment form. All checkout and portal actions open the web app's Stripe flow in the system browser (`openExternalUrl` in `apps/desktop/src/lib/stripeCheckout.ts`), keeping card handling on Clerk + Neon + Stripe server routes. Entitlement state is read back into the desktop auth store (`plan`, `planDisplayName`, `subscriptionStatus`, `currentPeriodEnd` in `apps/desktop/src/stores/auth.ts`).

> 🟡 **Legacy-tier reconciliation gap (updated 2026-07-11).** The canon ladder below is Free / Basic $7·₹399 IAP-first / Pro $20 / Max $100 & $200 / Team $30-seat / Enterprise (`docs/plans/tier-metering-reconciliation-wave2-2026-07-11.md`, `docs/decisions/CURRENT_DECISIONS.md` #22), superseding the 2026-06-30 ladder this volume previously specified. Metering is token/value-based, displayed as credits (never flat prompt counts); capped, opt-in credit top-ups are enabled for paid tiers; no discount anchors anywhere in pricing UI. Re-verified against code 2026-07-11: the shared `packages/contracts/types/src/billing-catalog.ts` already prices `team` at $30/mo + $299/yr (matching the reinstatement) and has real `basic`/`pro`/`max` entries — only `basic`'s price ($8, needs $7) and the missing $200 `max` tier are genuinely outstanding there. Desktop's own `apps/desktop/src/constants/pricing.ts` is the deeper gap: its `PlanId` type has no `team` member at all, it still carries `hobby`/`pro_plus` as backward-compat Stripe-ID mappings (comment-documented, not live tiers — do not read this as the tiers still being sold), and some tiers still carry a `waitlist?: boolean` gating field. That reconciliation (add `team` to `PlanId`, retire the `waitlist` field, sync the Basic price) is a separate tracked task; this spec uses the canon model.

## Free

Entry Managed-Cloud chat for a signed-in user: limited usage, capped model set, no card required. 🟡 Partial — a `$0`/`free` tier exists in `packages/contracts/types/src/billing-catalog.ts` and the desktop auth store defaults `planDisplayName` to `Free` (`apps/desktop/src/stores/auth.ts`), but the canon Free-tier limits/model caps are not yet encoded and the naming does not match the ladder. Requirement: signing in with no paid plan lands on Free; Local/BYOK remain fully usable regardless of plan.

## Basic — $7/mo (₹399/mo, IAP-first)

Entry paid Managed-Cloud tier (US + India), the step above Free with higher usage and expanded model access. INR is fixed at ₹399. 🟡 Partial — `packages/contracts/types/src/billing-catalog.ts` has a real `basic` entry (Stripe price mapped in `apps/web/lib/pricing.ts`), but it is still priced at `monthlyPriceUsd: 8` (cut to $7 on 2026-07-11) and `apps/desktop/src/constants/pricing.ts` needs the same correction. Basic is **IAP-first** — Desktop, having no app-store presence of its own, should route a Basic upgrade to Web's iOS/Android hand-off rather than opening desktop's own Stripe Checkout flow; this routing is not yet built. Requirement: Basic appears in the desktop plan list with correct USD ($7) and ₹399 labels.

## Pro — $20/mo

Main paid Managed-Cloud tier: full model catalog access, higher limits, priority. 🟡 Partial — a `pro` tier at `monthlyPriceUsd: 20` exists in `packages/contracts/types/src/billing-catalog.ts` with a Stripe price ID in `apps/desktop/src/constants/pricing.ts`, but it still carries a legacy yearly price and no INR value. INR is TBD — do not display an invented rupee figure. Requirement: Pro shows $20/mo, upgrades via Checkout, and gates models per plan.

## Max — $100/mo and $200/mo

Two power tiers presented as **Max** (higher usage/limits/model access), never as "Plus". 🟡 Partial — `packages/contracts/types/src/billing-catalog.ts` defines a single `max` at `monthlyPriceUsd: 100`; the **$200 second Max tier is missing** and must be added. INR for both is TBD. Requirement: the desktop plan list shows both Max price points as sibling Max options, each with its own Stripe price ID.

## Team — $30/seat/mo ($299/seat/yr)

✅ Built (pricing) / 🔭 Planned (desktop UI) — `packages/contracts/types/src/billing-catalog.ts` already prices `team` at `monthlyPriceUsd: 30, yearlyPriceUsd: 299`, matching the 2026-07-11 reinstatement. `apps/desktop/src/constants/pricing.ts`'s `PlanId` type does not include `'team'` at all — it needs to be added. Requirement: Team appears in the desktop plan list as its own per-seat tier (not folded into Enterprise), routes to Web/Stripe checkout for the seat purchase flow, and reflects seat-scoped entitlement in the auth store.

## Enterprise — custom

Org controls, SSO/SAML, admin, seat management at negotiated volume, custom contracts — priced by contract, no self-serve checkout. 🟡 Partial — an `enterprise` tier exists in `packages/contracts/types/src/billing-catalog.ts`. Requirement: Enterprise shows a "Contact sales" CTA (no Stripe Checkout).

## Billing

The Billing settings section is an at-a-glance view of plan, subscription status, and current period, plus a real "Manage billing" action. 🟡 Partial (built, gated) — `apps/desktop/src/features/settings/BillingSettings.tsx` renders from the live auth store and calls `openBillingPortal()` in `apps/desktop/src/lib/stripeCheckout.ts`, which opens the Stripe customer portal via `apps/web/app/api/portal/route.ts`. Webhooks (`apps/web/app/api/stripe-webhook/route.ts`) and `apps/web/app/api/sync-subscription/route.ts` keep entitlement fresh. Gaps: the whole account/billing surface is hidden until there is a cloud session (`apps/desktop/src/features/settings/tabs/Account/index.tsx` shows `DESKTOP_CLOUD_COMING_SOON`), and no invoice/payment-method view is mounted on desktop (`apps/web/app/api/billing/{invoices,payment-methods}` exist server-side). Requirement: Billing never fabricates plan/period data and reflects Local/BYOK as "free, no subscription".

## Upgrade

Upgrade opens Stripe Checkout in the browser for the chosen tier + interval. 🟡 Partial — `openCheckout(tierId, interval)` in `apps/desktop/src/lib/stripeCheckout.ts` POSTs to `apps/web/app/api/checkout/route.ts` with the session JWT; the `UpgradeModal` in `apps/desktop/src/features/settings/AccountSettings.tsx` passes the current tier. Gaps: paid checkout is env-gated (`STRIPE_CHECKOUT_ENABLED` in the checkout route) and the tier list is legacy. Requirement: unauthenticated upgrade prompts sign-in; a 503 (Stripe not configured) surfaces a clear message, never a silent failure; visible tier labels match the canon ladder.

## Downgrade

Moving to a lower paid tier or to Free is handled through Stripe, effective at period end. 🟡 Partial — `AccountSettings.tsx` exposes a `downgrade` billing modal and defers plan changes to the Stripe customer portal via `openBillingPortal()`. Requirement: downgrade is a scheduled change (retain access until `currentPeriodEnd`), the UI shows the effective date, and Local/BYOK access is unaffected.

## Cancellation

Cancel keeps paid access until period end, then reverts to Free — Local/BYOK stay available throughout. 🟡 Partial — `AccountSettings.tsx` opens `CancelFlow` (`apps/desktop/src/features/v3/CancelFlow.tsx`) and reflects `subscriptionStatus === 'canceled'` with the `currentPeriodEnd` label from `apps/desktop/src/stores/auth.ts`. Requirement: cancellation is confirmed (no accidental single-click), shows "Access ends <date>", and never deletes local chats/files.

## Restore Purchases

On desktop there is no app-store IAP, so "restore" means **re-syncing server entitlement**, not replaying a StoreKit/Play receipt. 🔭 Planned — desktop reads entitlement via `apps/web/app/api/sync-subscription/route.ts`, but there is no explicit "Restore purchases" control in desktop settings (the term appears only in `apps/mobile`). Requirement: a "Refresh subscription" action re-pulls plan/status from the server after cross-device changes; do not present IAP "restore" language on desktop.

## Repository map

- `apps/desktop/src/features/settings/tabs/Billing/index.tsx`, `apps/desktop/src/features/settings/BillingSettings.tsx` — Billing section.
- `apps/desktop/src/features/settings/tabs/Account/index.tsx`, `apps/desktop/src/features/settings/AccountSettings.tsx` — plan / upgrade / downgrade / cancel flows.
- `apps/desktop/src/features/v3/CancelFlow.tsx` — cancellation flow.
- `apps/desktop/src/lib/stripeCheckout.ts` — `openCheckout`, `openBillingPortal` (browser-hosted Stripe).
- `apps/desktop/src/stores/auth.ts` — `plan`, `subscriptionStatus`, `currentPeriodEnd`, `planDisplayName`.
- `apps/desktop/src/constants/pricing.ts` — desktop tier catalog (missing `team` in `PlanId`, Basic still $8, some tiers still carry a `waitlist` field — 🟡 reconcile). `packages/contracts/types/src/billing-catalog.ts` — shared canonical catalog (already has `basic`/`pro`/`max`/`team`; only Basic's price and the $200 Max tier are outstanding — 🟡).
- `apps/web/app/api/{checkout,portal,sync-subscription,stripe-webhook,billing}` — Stripe + entitlement server routes.

## Competitor notes

Claude, ChatGPT, and Codex sell single-provider hosted plans and treat the subscription as the only path to the model. AGI diverges: the subscription governs **only** Managed Cloud, while **Local and BYOK are free forever** — a user can run frontier-capable local models or their own keys with no plan. Desktop deliberately hosts checkout in the browser (no in-app payment form) and, for Pro/Max/Team, has **no app-store IAP tax** — that billing is direct Stripe. Basic is the one exception: it is IAP-first platform-wide, so a desktop user upgrading to Basic hands off to Web's App Store/Play Store flow rather than a desktop-native Stripe Checkout. Multi-provider, per-surface trust, and local-first are the wedge; the paid ladder is convenience/managed-compute, not a lock on capability.

## Acceptance / Definition of Done

Production-ready when the canon ladder renders on desktop with correct labels, Local/BYOK never require a plan, and every billing action is either real (server-backed) or clearly gated — no fabricated plan data, no dead buttons.

- [ ] Build: desktop plan list shows Free / Basic ($7·₹399) / Pro ($20) / Max ($100 & $200) / Team ($30/seat) / Enterprise; `team` added to `PlanId`; `hobby`/`pro_plus` stay only as documented backward-compat Stripe-ID aliases, never rendered as selectable tiers; `typecheck` + `test` green.
- [ ] Trust: subscription state changes never route Local/BYOK chats/files to Cloud; cancel/downgrade never touch local data.
- [ ] Security: checkout/portal open only Stripe-origin URLs via the egress guard; auth uses the real session JWT; 503/unauthenticated paths fail loud with a message.

## Anti-patterns

- Do **not** gate Local or BYOK behind any plan, or treat them as paid tiers.
- Do **not** reintroduce "Plus" or render `hobby`/`pro_plus` as live, selectable tiers — they exist only as backward-compat Stripe-ID aliases. Team is NOT removed and is NOT folded into Enterprise — it is a real, separate per-seat tier. Do not offer uncapped or non-opt-in top-ups, or show a discount anchor anywhere in pricing UI.
- Do **not** invent INR for Pro/Max (only Basic ₹399 is fixed), invent Stripe price IDs, env vars, or routes.
- Do **not** hardcode model IDs for plan gating — read `packages/contracts/types/src/models.json`.
- Do **not** embed an in-app card form or reference Supabase; billing is Clerk + Neon + Stripe, browser-hosted.
- Do **not** show "Restore purchases" (IAP) language on desktop; use server entitlement re-sync.
- Do **not** claim a tier is shipped without a repo path; unbuilt tiers stay 🔭.
