# AGI Mobile — Volume 24 — Subscription

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md`, `apps/mobile/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, and the real surface paths this volume grounds in: `apps/mobile/app/(app)/billing/index.tsx`, `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx`, `apps/mobile/src/features/billing/store.ts`, `apps/mobile/src/features/billing/service.ts`, `apps/mobile/src/features/settings/cloud-billing/index.tsx`, `apps/mobile/app/(app)/usage.tsx`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/lib/safeOpenURL.ts`, and the shared catalog `packages/contracts/types/src/billing-catalog.ts`.

## Overview & stance

Subscriptions on AGI Mobile gate **Managed Cloud only**. Local mode (the small on-device LLM) is a **free access mode**, not a plan: it runs with no account, no network, and no billing. **Mobile has no BYOK** — there is no API-key affordance anywhere in this domain, and "provider configuration" on mobile means on-device model management, never keys. A subscription therefore buys exactly one thing on this surface: more capable, higher-limit Managed-Cloud access (better models, larger token budgets, cross-device delta-sync of cloud chats). Local data never moves to the cloud as a side effect of any plan.

The canon tier ladder (founder decision 2026-07-11, supersedes the 2026-06-30 ladder) is **Free $0; Basic $7/mo (₹399/mo, IAP-first); Pro $20/mo; Max $100/mo and $200/mo; Team $30/seat/mo; Enterprise custom**. "Plus", `pro_plus`, and "Hobby" are removed forever; "Team" is a real, separate per-seat tier again — do not describe it as served by Enterprise. Credit top-ups are enabled for paid tiers (capped, opt-in, per-tier payout parity). INR is fixed only for Basic (₹399) — Pro/Max/Team INR are TBD and must not be invented.

Reconciliation reality: the shipped catalog `packages/contracts/types/src/billing-catalog.ts` still encodes the **old** model (`team` present, no `basic`, Max a single `$100` point), and `PaywallBottomSheet.tsx` shows legacy labels (`hobby`, `pro_plus → Pro+`). The mobile billing UI is also flag-gated **off** (`FEATURES.billing = false`), so paid checkout does not run in the public alpha. This volume specifies the target; the code reconciliation is a separate tracked task.

## Free

🟡 Partial — `apps/mobile/app/(app)/billing/index.tsx`, `apps/mobile/src/features/billing/store.ts`. Free is the default after sign-in (`useTierStore` defaults `tier: 'free'`). It includes entry Managed-Cloud chat with a server-enforced usage cap (the cloud path documents a free-tier prompt cap honored server-side, `apps/mobile/lib/v1FeatureFlags.ts`). Local mode is always available alongside Free at no cost. Gap: the Free card renders, but the catalog tier set predates canon. Requirement: Free must be honest — no fake "unlimited" badge, the cap must be visible, and hitting it raises the paywall, never a silent fail.

## Basic ($8/mo, ₹399/mo)

🔭 Planned. No `basic` tier exists in `packages/contracts/types/src/billing-catalog.ts` and no mobile UI renders it. Design intent: the ChatGPT-Go-style entry paid tier, **$8/mo / ₹399/mo** (the only fixed INR price). It lifts the Free cap, unlocks standard cloud models and cloud-chat delta-sync (Web↔Mobile↔Desktop, Managed-Cloud chats only), and is the first tier in the upgrade path. Requirement: when added, Basic is inserted between Free and Pro in `billing-catalog.ts` and surfaced in `billing/index.tsx`; ₹399 is hard-coded only for Basic.

## Pro ($20/mo)

🟡 Partial — `apps/mobile/app/(app)/billing/index.tsx`, `packages/contracts/types/src/billing-catalog.ts`. The catalog already carries `pro` at `monthlyPriceUsd: 20` (yearly `$204`), and the mobile Plans screen renders a highlighted Pro card with feature bullets and an "Upgrade to Pro" CTA. Pro is the main paid tier: full cloud model routing, larger included token budget, voice transcription, and sync of chats/projects/memory. Pro INR is **TBD** — display no INR figure for Pro until the founder sets one. Requirement: bullets may name models in copy but the client must never pin a model ID — routing is server-owned, IDs come only from `packages/contracts/types/src/models.json`.

## Max ($100/mo and $200/mo)

🟡 Partial — `packages/contracts/types/src/billing-catalog.ts` (`max` present at `monthlyPriceUsd: 100`), `apps/mobile/app/(app)/billing/index.tsx`. Canon requires **two Max price points — $100/mo and $200/mo** — presented as Max tiers (higher usage/limits/flagship models), never as "Plus". The shipped catalog encodes only the single `$100` point; the `$200` Max tier is **🔭 Planned** and must be added without resurrecting `pro_plus`. Max INR is **TBD**. Requirement: both points read as "Max" with differentiated limits; the picker must make the two tiers unambiguous (usage ceiling, not a renamed legacy tier).

## Enterprise (custom)

🔭 Planned. The catalog has an `enterprise` entry, but there is no mobile Enterprise flow — Enterprise is org controls, SSO, admin, seats, and contracts, negotiated off-device. Canon (updated 2026-07-11): **"Team" is a real, separate per-seat tier**, so the `team` tier in `billing-catalog.ts` should be reconciled to the current $30/seat/mo model, not removed. Requirement: mobile presents no self-serve Enterprise checkout; an Enterprise CTA routes to sales via the URL allowlist, and seat/SSO entitlements read from the server like any other plan.

## Billing

🟡 Partial — `apps/mobile/src/features/settings/cloud-billing/index.tsx`, `apps/mobile/src/features/billing/service.ts`, `apps/mobile/app/(app)/usage.tsx`. Stack is **Stripe** (web checkout/portal) — never Supabase. The cloud-billing screen reads the cached tier (`useTierStore` → `GET /api/me`) and, when `FEATURES.billing` is true, fetches a Stripe portal URL via `fetchPortalSessionUrl`; the usage screen opens `/api/portal` to manage. All external opens go through `openExternalUrl` (`apps/mobile/lib/safeOpenURL.ts`), allowlisting **agiworkforce.com / stripe.com only**. In the public alpha `FEATURES.billing = false`, so the screen renders an honest plan card whose "Upgrade" opens `agiworkforce.com/pricing` — no stub or fake balance.

**App Store IAP**: iOS requires Apple In-App Purchase for in-app digital subscriptions. Restore Purchases is currently a placeholder (`apps/mobile/app/(app)/usage.tsx` alerts "available when the app launches on the App Store") — IAP wiring is **🔭 Planned**. Requirement: on iOS, paid upgrades must use StoreKit IAP (Restore Purchases honored) or the external-link entitlement; never ship a raw web-Stripe-only checkout button on iOS. Max's two price points must be modeled as distinct IAP products.

## Upgrades — plan changes

🟡 Partial — `apps/mobile/app/(app)/billing/index.tsx`, `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx`, `apps/mobile/src/features/billing/store.ts`. Two upgrade entry points exist: the Plans screen CTA, and the in-chat `PaywallBottomSheet` raised on an `ApiPaywallError` mid-send (deep-links to `agiworkforce.com/pricing?from=mobile-paywall`). In v1 the Plans CTA routes to the cloud-bridge modal, not checkout. After a change the client calls `refreshTier()` to re-read `/api/me`; `setTier` allows an optimistic local update. Gaps to fix: `PaywallBottomSheet` `TIER_LABELS` and the default `requiredTier='hobby'` use removed names — move to Free/Basic/Pro/Max/Enterprise — and the `MeResponse` tier comment (`'hobby' | 'pro_plus'`) must follow canon. Requirement: downgrades/cancellations are server-authoritative; entitlement is never trusted from the cached store alone, and `remoteChatGate` fails closed when Cloud is disabled.

## Repository map

- `apps/mobile/app/(app)/billing/index.tsx` — Plans screen (tier cards, monthly/yearly toggle).
- `apps/mobile/src/features/billing/store.ts` — `useTierStore`, tier cache + `refreshTier`/`setTier`.
- `apps/mobile/src/features/billing/service.ts` — Stripe portal session fetch.
- `apps/mobile/src/features/settings/cloud-billing/index.tsx` — billing settings screen.
- `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx` — in-chat paywall (legacy labels to reconcile).
- `apps/mobile/app/(app)/usage.tsx` — usage, manage-subscription, Restore Purchases placeholder.
- `apps/mobile/lib/v1FeatureFlags.ts` — `FEATURES.billing` master switch.
- `apps/mobile/lib/safeOpenURL.ts` — external-URL allowlist (agiworkforce.com / stripe.com).
- `packages/contracts/types/src/billing-catalog.ts` — shared tier catalog (needs canon reconciliation).

## Competitor notes

ChatGPT mobile sells Plus/Pro and Claude mobile sells Pro/Max, both via Apple IAP — single-provider, cloud-only, no on-device model, no BYOK. AGI's deliberate divergence: Local (a real on-device LLM) is a **free** mode needing no plan or network; subscriptions buy multi-provider Managed-Cloud routing rather than one vendor's models; trust mode is per-surface, so the same account adds BYOK on Desktop but never exposes keys on Mobile. AGI matches the entry tier (Basic ≈ ChatGPT Go at $8/₹399) and the two-point power ceiling (Max $100/$200).

## Acceptance / Definition of Done

- The visible tier ladder is exactly Free / Basic / Pro / Max ($100 & $200) / Enterprise — no Plus, pro_plus, Hobby, or Team — and prices match canon, with INR shown only for Basic (₹399).
- No BYOK or API-key affordance appears anywhere in the subscription domain.
- Entitlement is server-authoritative; the cached store is never the source of truth for gating, and `remoteChatGate` fails closed when Cloud is off.
- Build / reconciliation
  - [ ] `packages/contracts/types/src/billing-catalog.ts` adds `basic`, adds the `$200` Max point, removes `team`; `PaywallBottomSheet` labels and `MeResponse` tier comment drop `hobby`/`pro_plus`.
  - [ ] `pnpm --filter @agiworkforce/mobile typecheck` and `pnpm --filter @agiworkforce/mobile test` pass (incl. `__tests__/paywall-bottom-sheet.test.tsx`, `tier-store.test.ts`).
- Trust / security
  - [ ] No model IDs hardcoded in mobile billing code; all IDs resolve from `packages/contracts/types/src/models.json`.
  - [ ] All upgrade/manage opens go through `openExternalUrl` (agiworkforce.com / stripe.com only).
  - [ ] iOS uses StoreKit IAP (Restore Purchases functional) or a compliant external-link path; both Max price points modeled as distinct products.

## Anti-patterns

- Adding any BYOK / API-key entry to mobile billing or settings.
- Reintroducing "Plus", `pro_plus`, "Hobby", or a consumer "Team" tier.
- Inventing INR prices for Pro/Max, or any tier other than Basic ₹399.
- Hardcoding a model ID in pricing copy or gating logic instead of reading `models.json`.
- Trusting the cached tier store for entitlement instead of the server; letting the paywall fail silently.
- Shipping a raw web-Stripe-only checkout button on iOS that violates App Store IAP rules.
- Referencing Supabase, or claiming IAP/Restore Purchases works before it is wired.
- Auto-sending a Local chat to the cloud to "unlock" a paid feature.
