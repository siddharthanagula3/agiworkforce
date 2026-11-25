---
id: "F100-07"
type: "feature"
title: "Promotions and referrals"
aliases: ["Promotions and referrals", "Promo codes", "Promotion code", "Referrals", "Invite a friend", "agi invite", "Bonus credits", "Usage-limit promotions (limit reset, limit uplift)", "S100.22 Promotion service", "S100.23 Referral service"]
area: "100 Commercial and administrative components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S100.22", "S100.23"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-observability-and-operations", "SYS-security-and-privacy", "surface:web", "surface:desktop", "surface:cli", "mode:cloud", "table:referral_codes", "table:referrals", "table:bonus_credit_grants", "F100-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F100-07 Promotions and referrals

Lets people redeem Stripe promotion codes when they subscribe or upgrade, and lets any signed-in person share a referral link. A friend who joins gets a trial and bonus credits after their first payment. The referrer earns bonus credits after a 14-day hold. Staff can also run usage-limit promotions and grant goodwill credits.

Area: [100. Commercial and administrative components](README.md). Requirement items: [S100.22](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10022), [S100.23](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10023).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Four separate mechanisms sit under this name. (1) Promotion codes: Web checkout is a Stripe-hosted page that is created with promotion codes switched on (apps/web/app/api/checkout/route.ts:522); the in-app upgrade flow takes a code, checks it against Stripe and prices the upgrade with it (apps/web/app/api/upgrade/route.ts:259-349). (2) Referrals: each account can get one referral code and link, a /r/<code> visit stores a cookie, sign-up attaches the new account to the code, the friend's first paid invoice converts it, and a daily job pays the referrer after a hold (apps/web/lib/services/referral-service.ts:197-520; apps/web/app/api/stripe-webhook/lib/referral-events.ts:114-195). (3) Bonus credits: a grant table with sources referral_referrer, referral_friend and promo (apps/web/lib/services/bonus-credit-service.ts:11). (4) Usage-limit promotions: platform admins define time-boxed limit resets or uplifts for paid plans (apps/web/lib/services/usage-limit-promotion-service.ts:84-129; apps/web/app/api/admin/usage-promotions/route.ts).

**Why it exists.** To grow sign-ups through invitations, to let sales and marketing discount a plan, and to give staff a controlled way to give credits or extra allowance. The brief says a promotion service should create and apply promo codes, bonus credits and invite grants, and a referral service should issue codes, attribute sign-ups and grant rewards (doc: knowledge-base/data/area-briefs/100-commercial-and-administrative-components.md S100.22, S100.23).

**Who uses it.** Any signed-in account (referral link, promotion code at checkout or upgrade), referred friends, platform admins (usage promotions, goodwill credits), and finance or support staff who read the operator tools.

**Problems it solves**

- A person with a discount code can use it on a Stripe checkout or on a plan upgrade.
- A person can invite friends and earn credits only when the friend really pays.
- Abuse is limited: disposable emails, email aliases, same network, same device and same card are refused, and refunds or disputes claw the reward back.
- Staff can give a bounded, expiring promotion without editing code.

**Use cases**

- A new user opens a friend's /r/<code> link, signs up, starts the paid plan with a 7-day trial, pays, and both receive bonus credits.
- An existing subscriber upgrades a plan, types a promotion code, sees the discounted preview and confirms.
- A person opens Settings, Referrals, copies the invite link or shares it.
- A platform admin saves a time-boxed limit-reset promotion with a cost ceiling.

## 2. User experience

**Where to find it**

- Web: Settings, section 'Referrals' (section id referrals in apps/web/features/settings/lib/web-settings-sections.ts:31; ReferralsSection renders the h1 'Referrals' at apps/web/features/settings/sections/ReferralsSection.tsx:166).
- Web upgrade panel: input labelled 'Promotion code' with an 'Apply' button (apps/web/features/billing/components/UpgradePromotionCode.tsx:61-97).
- Web checkout: the Stripe-hosted page shows Stripe's own promotion-code box because allow_promotion_codes is true (apps/web/app/api/checkout/route.ts:522).
- Desktop (Tauri build): Settings, Referrals shows 'Open referrals' which opens /settings/referrals in the browser (apps/desktop/src/features/settings/cloud/CloudReferralsSection.tsx:8-45).
- CLI: command 'agi invite' prints the referral link, with --json (apps/cli/src/lib.rs:1066-1069).
- Mobile: no referral screen found; the cloud usage screen only lists bonus credits with expiry (apps/mobile/src/features/settings/cloud-usage/index.tsx:374-382).
- VS Code and Chrome extensions: nothing found.

**Before you start**

- A signed-in account. The /api/referrals routes resolve a user-scoped connection (apps/web/app/api/referrals/route.ts:16).
- A friend must sign up through the link within 24 hours of creating the account to be attributed (apps/web/lib/services/referral-program.ts:8-18; apps/web/lib/services/referral-service.ts:238-262).
- The friend trial only applies to the Pro plan tier (apps/web/lib/services/referral-service.ts:223-236).
- Promotion codes at upgrade need a live Stripe subscription (apps/web/app/api/upgrade/route.ts:259-267).

**Screens and controls**

- Referrals page: 'Invite link' field, 'Copy link' button, 'Share' button (or 'Email invite' when the browser has no share sheet), counters 'Friends joined', 'Subscribed', 'Credits earned', 'Bonus credits left', a friends list and a rules section (apps/web/features/settings/sections/ReferralsSection.tsx:208-330).
- Friend states shown: Joined, Subscribed, Reward earned, Over the reward limit, Not eligible, Payment reversed (apps/web/features/settings/sections/ReferralsSection.tsx:46-70).
- Upgrade panel: 'Promotion code' input and 'Apply' (apps/web/features/billing/components/UpgradePromotionCode.tsx).
- Platform admin: usage promotions API (apps/web/app/api/admin/usage-promotions/route.ts).

**Journey**

1. Referrer opens Settings, Referrals. The page reads GET /api/referrals; if no code exists it creates one with POST /api/referrals/code and a CSRF header (apps/web/features/settings/sections/ReferralsSection.tsx:97-125).
2. Referrer copies or shares the /r/<code> link.
3. Friend opens the link; the server stores an httpOnly cookie agi_referral for 30 days and redirects to /r/welcome (apps/web/app/r/[code]/route.ts:10-33).
4. Friend signs up; on /api/me or /api/terms/accept the cookie is read and the friend is attached to the code, then the cookie is cleared (apps/web/lib/services/referral-attribution.ts:13-50; apps/web/app/api/me/route.ts:142; apps/web/app/api/terms/accept/route.ts:185).
5. Friend starts the Pro plan; checkout offers the 7-day trial (apps/web/app/api/checkout/route.ts:431-440).
6. Friend's first paid invoice arrives through the Stripe webhook: the friend gets bonus credits and the referral turns to 'converted' with a 14-day hold (apps/web/app/api/stripe-webhook/lib/referral-events.ts:114-195).
7. A daily job at 01:10 settles due referrals and credits the referrer (apps/web/app/api/cron/grant-referral-rewards/route.ts; vercel.json cron entry grant-referral-rewards).
8. Referrer sees a notification 'You earned ...' (apps/web/lib/services/referral-service.ts:420-437).

**What the person sees and gets**

- Notification to the friend: 'You received <credits>' (apps/web/app/api/stripe-webhook/lib/referral-events.ts:182-193).
- Notification to the referrer: 'You earned <credits>' pointing at the referrals settings (apps/web/lib/services/referral-service.ts:420-437).
- Copy feedback: 'Invite link copied.' or 'Copying is blocked here. Select the link and copy it.' (apps/web/features/settings/sections/ReferralsSection.tsx:141-143).
- Promotion errors: 'That promotion code has expired.', 'has been fully redeemed.', 'does not apply to this upgrade.' (apps/web/lib/server/stripe-upgrade-subscription.ts:192-232; apps/web/app/api/upgrade/preview/route.ts:496-503).

**Settings**

- Program terms are constants in REFERRAL_PROGRAM: friend trial days, reward credits, hold days, attribution days, network match days, new-account window hours, monthly and yearly caps, bonus expiry (apps/web/lib/services/referral-program.ts:8-18).
- Feature flag for usage promotions: USAGE_PROMOTIONS_FLAG_KEY (apps/web/lib/feature-flags/usage-promotions-gate.ts:7).
- Cron schedule for reward settlement and bonus-credit expiry (vercel.json: grant-referral-rewards daily 01:10, expire-bonus-credits daily 00:12).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Referral code creation with collision retry, and overview read (apps/web/lib/services/referral-service.ts:119-222).
- Attribution at sign-up with checks for disposable email, email alias, same network (apps/web/lib/services/referral-service.ts:82-117, 238-293).
- Conversion at first paid invoice, with same-card, same-device and same-network blocks (apps/web/app/api/stripe-webhook/lib/referral-events.ts:114-180).
- Daily reward settlement with monthly and yearly caps, advisory lock and notification (apps/web/lib/services/referral-service.ts:359-446, 502-543).
- Clawback on refund or dispute (apps/web/app/api/stripe-webhook/lib/referral-events.ts:197-261).
- Promotion code lookup and discount in upgrade preview and upgrade (apps/web/app/api/upgrade/route.ts:259-349; apps/web/app/api/upgrade/preview/route.ts:465-503).
- Stripe-hosted checkout accepts promotion codes (apps/web/app/api/checkout/route.ts:522).
- Usage-limit promotions: admin upsert with optimistic version, user claim of a reset (apps/web/app/api/admin/usage-promotions/route.ts; apps/web/app/api/usage/limit-resets/route.ts).
- Operator goodwill bonus credit grant with source promo (apps/web/features/admin/services/operator-metrics.ts:389-420).
- Desktop and CLI hand off to the web for referrals (apps/desktop/src/features/settings/cloud/CloudReferralsSection.tsx; apps/cli/src/cloud/referrals.rs:45-60).

**Incomplete**

- The brief line numbers do not match the code: checkout/route.ts:407 is Stripe error handling, not promotion logic; the promotion switch is at line 522 and the referral trial at line 436. The brief status 'platform done' is therefore carried by other lines (doc: knowledge-base/data/area-briefs/100-commercial-and-administrative-components.md S100.22).
- No in-app promotion-code entry at first checkout: the code is typed on Stripe's page, not in AGI Workforce (apps/web/app/api/checkout/route.ts:522).

**Present but disconnected or switched off**

- Usage-limit promotions are gated by a feature flag and return 'You have no reset to use.' when off (apps/web/app/api/usage/limit-resets/route.ts:27-33; apps/web/lib/feature-flags/usage-promotions-gate.ts).

**Not available**

- Invite grants: the brief names 'invite grants' but no code with that name or purpose was found (searched apps/web for invite_grant and inviteGrant).
- Mobile referral screen: none found (apps/mobile/src/features/settings/cloud-usage/index.tsx only shows bonus credits).
- VS Code and Chrome extension referral or promotion screens: none found.

## 4. Required behaviour

**Established requirements**

- A promotion service creates and applies promo codes, bonus credits and invite grants to accounts. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.22)
- A referral service issues referral codes, attributes sign-ups and grants rewards. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.23)
- Referral rewards follow the leaders and stricter policy wins; product and policy calls follow ChatGPT and Claude. (source: AGENTS.md section 10)
- Referral terms are linked at checkout when a referral trial applies. (source: apps/web/app/api/checkout/route.ts:92-94)

**Acceptance criteria**

1. Visiting /r/<valid code> redirects to /r/welcome and sets an httpOnly agi_referral cookie lasting 30 days; an invalid code redirects to sign-up with no cookie.
2. A sign-up within 24 hours through a code is stored as signed_up; the same account cannot be attributed twice.
3. A friend sign-up with a disposable email, the referrer's email alias or the referrer's network is stored as blocked.
4. The friend's first paid invoice sets the referral to converted and adds bonus credits to the friend; the referrer receives credits only after the 14-day hold and only under the monthly and yearly caps.
5. A refund or dispute on the qualifying invoice revokes both grants and marks the referral clawed_back.
6. An upgrade with an expired, fully redeemed or non-applying code is refused with a plain message and the plan is unchanged.
7. The Referrals page shows the code, link, counts and a state for each friend, and shows an error with retry when loading fails.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Free-plan accounts can hold a referral code because the code routes check only sign-in, not plan (apps/web/app/api/referrals/code/route.ts:16-29).
- [inferred] Bonus credits are spent only on Cloud usage because they sit in the managed credit ledger (apps/web/lib/services/bonus-credit-service.ts:164-200).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Write an audit event for referral reward grants, clawbacks and promotion applications; none is written today.
- [proposed] Show the referral link on mobile and in the VS Code extension, or document that they are web-only.
- [proposed] Add an in-app promotion-code field to first checkout, matching the upgrade panel.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | referral-service | `apps/web/lib/services/referral-service.ts` | Code creation, overview, attribution, reward settlement, reset replay. |
| config | REFERRAL_PROGRAM | `apps/web/lib/services/referral-program.ts` | Program terms, cookie name, code format, link builder. |
| service | referral-attribution | `apps/web/lib/services/referral-attribution.ts` | Reads the cookie at sign-up and attributes the friend. |
| service | referral-signals | `apps/web/lib/services/referral-signals.ts` | Disposable-email test, email normalising, network hash. |
| endpoint | GET /api/referrals | `apps/web/app/api/referrals/route.ts` | Returns the caller's overview. |
| endpoint | POST /api/referrals/code | `apps/web/app/api/referrals/code/route.ts` | Creates the code, CSRF protected. |
| endpoint | GET /r/[code] | `apps/web/app/r/[code]/route.ts` | Stores the attribution cookie and redirects. |
| screen | ReferralsSection | `apps/web/features/settings/sections/ReferralsSection.tsx` | The Referrals settings page. |
| event | handleReferralInvoicePaid / handleReferralChargeReversal | `apps/web/app/api/stripe-webhook/lib/referral-events.ts` | Converts on first paid invoice; claws back on refund or dispute. |
| job | grant-referral-rewards cron | `apps/web/app/api/cron/grant-referral-rewards/route.ts` | Daily settlement, up to 500 referrals per run. |
| service | bonus-credit-service | `apps/web/lib/services/bonus-credit-service.ts` | Grant, revoke, expire and read bonus credit lots. |
| endpoint | POST /api/checkout | `apps/web/app/api/checkout/route.ts` | Creates Stripe checkout with promotion codes allowed and the referral trial. |
| endpoint | POST /api/upgrade and /api/upgrade/preview | `apps/web/app/api/upgrade/route.ts` | Applies a promotion code to a plan upgrade. |
| service | resolveUpgradePromotion | `apps/web/lib/server/stripe-upgrade-subscription.ts` | Looks up and validates a Stripe promotion code. |
| component | UpgradePromotionCode | `apps/web/features/billing/components/UpgradePromotionCode.tsx` | Promotion code input and Apply button. |
| service | usage-limit-promotion-service | `apps/web/lib/services/usage-limit-promotion-service.ts` | Limit reset and uplift promotions, caps and ceilings. |
| endpoint | /api/admin/usage-promotions | `apps/web/app/api/admin/usage-promotions/route.ts` | Platform-admin list and save of promotions. |
| endpoint | POST /api/usage/limit-resets | `apps/web/app/api/usage/limit-resets/route.ts` | User applies a granted reset. |
| service | grantBonusCredits (operator) | `apps/web/features/admin/services/operator-metrics.ts` | Goodwill credit grant with source promo. |
| table | referral_codes, referrals | `apps/web/db/neon/0296_referral_program.sql` | Stores codes, attributions and states. |
| table | bonus_credit_grants | `apps/web/db/neon/0295_bonus_credit_grants.sql` | Stores bonus credit grants. |
| table | usage_limit_promotions, usage_limit_promotion_grants | `apps/web/db/neon/0390_usage_limit_promotions.sql` | Stores promotions and per-user grants. |
| component | CloudReferralsSection | `apps/desktop/src/features/settings/cloud/CloudReferralsSection.tsx` | Desktop hand-off to the web page. |
| command | agi invite | `apps/cli/src/cloud/referrals.rs` | CLI prints the invite link and terms. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens Referrals; the page loads GET /api/referrals and, if no code, POST /api/referrals/code. | our servers | apps/web/features/settings/sections/ReferralsSection.tsx:97-125; apps/web/app/api/referrals/route.ts:14-21 |
| Visiting /r/<code> sets the cookie and redirects. | our servers | apps/web/app/r/[code]/route.ts:10-33 |
| After sign-up the cookie is turned into a referrals row (signed_up or blocked) and cleared. | our servers | apps/web/lib/services/referral-attribution.ts:13-50; apps/web/lib/services/referral-service.ts:238-293 |
| Checkout reads the friend's signed_up row to offer the trial days. | our servers | apps/web/app/api/checkout/route.ts:436; apps/web/lib/services/referral-service.ts:223-236 |
| Stripe takes the payment and sends invoice.paid; the handler converts the referral and grants the friend credits. | outside service | apps/web/app/api/stripe-webhook/lib/handlers.ts (invoice.paid case calls handleReferralInvoicePaid); apps/web/app/api/stripe-webhook/lib/referral-events.ts:114-195 |
| Daily cron settles converted referrals past hold: device and network recheck, cap check, credit grant, notification. | our servers | apps/web/lib/services/referral-service.ts:359-446; vercel.json |
| Upgrade with a promotion code: the server asks Stripe for the code, previews with the discount, then updates the subscription with the discount. | outside service | apps/web/lib/server/stripe-upgrade-subscription.ts:192-232; apps/web/app/api/upgrade/route.ts:259-349 |
| Desktop and CLI call or open the same web endpoints; nothing runs on the device except display. | device and our servers | apps/cli/src/cloud/referrals.rs:45-60; apps/desktop/src/features/settings/cloud/CloudReferralsSection.tsx:15-25 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Referral code and network hash | table public.referral_codes | Server only; read through /api/referrals | Account erasure code touches referral data (apps/web/lib/server/account-erasure.ts); exact rule unknown |
| Referral rows with status, hold, qualifying invoice, grant ids | table public.referrals | Server only | Kept; status changes to clawed_back rather than delete (apps/web/app/api/stripe-webhook/lib/referral-events.ts:240-247) |
| Bonus credit grants | table public.bonus_credit_grants | Server only | Expire after 90 days via cron (apps/web/lib/services/bonus-credit-service.ts:7; vercel.json expire-bonus-credits) |
| Attribution cookie agi_referral | browser cookie, httpOnly | No | 30 days or cleared after attribution |
| Usage-limit promotion definitions and grants | tables usage_limit_promotions and usage_limit_promotion_grants | Server only | Unknown |

**Models and providers.** No model or inference provider takes part. Bonus credits are spent on managed Cloud usage [inferred]. Stripe is the outside service for promotion codes, invoices and card fingerprints; Clerk supplies account age and email through getIdentityUser (apps/web/lib/services/referral-service.ts:5, 248).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required for referrals and upgrade (apps/web/app/api/referrals/route.ts:16). Referral attribution also needs the new account to be under 24 hours old (apps/web/lib/services/referral-service.ts:248-256). |
| Permissions | Usage promotions admin API requires a platform admin and CSRF (apps/web/app/api/admin/usage-promotions/route.ts:37-61). Referral reward cron requires cron authentication (apps/web/app/api/cron/grant-referral-rewards/route.ts:15-18). |
| Subscription | Friend trial applies only to the Pro plan tier (apps/web/lib/services/referral-service.ts:223-236). Promotion codes need a paid Stripe subscription at upgrade. Usage-limit promotions apply only to paid plans with 5-hour and weekly limits (apps/web/lib/services/usage-limit-promotion-service.ts:44-49). |
| Limits and metering | Reward 10 per month and 50 per year per referrer, 14-day hold, 30-day attribution, 24-hour new-account window (apps/web/lib/services/referral-program.ts:8-18). Routes use the credits-balance rate limit (apps/web/app/api/referrals/route.ts:15). Promotions have a cost ceiling (apps/web/lib/services/usage-limit-promotion-service.ts:67-79). |
| Feature flags | Usage promotions flag USAGE_PROMOTIONS_FLAG_KEY (apps/web/lib/feature-flags/usage-promotions-gate.ts:7). None found for referral. |
| Model compatibility | none found in the code |
| Provider restrictions | Stripe is required for promotion codes and referral conversion; mobile store purchases are not covered by any code read [unknown]. |
| Local mode | Referrals and promotions are Cloud account features. The CLI invite command refuses a Local or own-key session instead of asking the account (apps/cli/src/cloud/referrals.rs:45-85). No Local-mode path for the other apps was found; Local inference needs none of this. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Referrals page shows a spinner and 'Loading your referrals'. | apps/web/features/settings/sections/ReferralsSection.tsx:177-180 |
| Error and retry | Shows 'Referrals could not load' with an outline retry button. | apps/web/features/settings/sections/ReferralsSection.tsx:183-190 |
| Empty | Says no one has joined yet when the list is empty. | apps/web/features/settings/sections/__tests__/ReferralsSection.test.tsx:119 |
| Sharing unsupported | Falls back to an email link instead of the share sheet. | apps/web/features/settings/sections/ReferralsSection.tsx:146-150 |
| Attribution failure | Cookie is kept so the next request retries. | apps/web/lib/services/referral-attribution.ts:31-37 |
| Own code or already attributed | Skipped, no row written. | apps/web/lib/services/referral-service.ts:250, 281-283 |
| Reward cap reached | Referral marked capped; friend shown 'Over the reward limit'. | apps/web/lib/services/referral-service.ts:384-393 |
| Promotion lookup service failure | 503 with 'The promotion code could not be checked'; plan unchanged. | apps/web/app/api/upgrade/route.ts:269-276 |
| Offline or timeout | not handled in the code beyond the generic request error | apps/web/features/settings/sections/ReferralsSection.tsx:121-125 |
| Accessibility | Invite field has an aria-label, sections have labelled headings, icons are hidden from readers. | apps/web/features/settings/sections/ReferralsSection.tsx:199-230 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/referrals/route.test.ts`: Overview read, network record, no-session refusal, rate limit, storage failure.
- `apps/web/app/api/referrals/code/route.test.ts`: Code creation, CSRF refusal, no session, rate limit, failure.
- `apps/web/app/r/[code]/route.test.ts`: Cookie for valid code, hand-typed code reading, secure flag.
- `apps/web/features/settings/sections/__tests__/ReferralsSection.test.tsx`: Page content, code creation with CSRF, empty state, every friend state, copy feedback, error retry.
- `apps/web/lib/services/referral-service.reset-custody.test.ts`: Reset replay, locking and clawback races.
- `apps/web/app/api/stripe-webhook/lib/__tests__/referral-clawback.test.ts`: Unapplied promotion resets deleted next to credit clawback.
- `apps/web/lib/services/__tests__/usage-limit-promotion-service.test.ts`: Promotion input, caps and apply rules.
- `apps/web/features/billing/components/UpgradeOrderPanel.test.tsx`: Upgrade order panel behaviour.
- `apps/web/__tests__/api/stripe-upgrade-usage.test.ts`: Upgrade route with usage; promotion coverage unknown.

**Test scenarios**

- **Referral end to end**
  1. Open Settings, Referrals on a signed-in account and copy the link.
  2. In a clean browser open the link, sign up with a new real email.
  3. Start the Pro plan and pay the first invoice in the test Stripe account.
  4. Run the reward cron after the hold date.
  - Expected: Friend sees 'You received' credits; referrer sees 'You earned' credits; counts on Referrals page update.
- **Self and alias referral**
  1. Open own link in another browser and sign up with a plus-alias of the referrer's email.
  - Expected: Referral stored as blocked; page shows 'Not eligible'.
- **Refund claws back**
  1. Refund the friend's qualifying invoice in the test Stripe account.
  - Expected: Both grants revoked; status Payment reversed.
- **Promotion at upgrade**
  1. On a paid plan open the upgrade panel.
  2. Enter an expired code, then a valid code, press Apply.
  - Expected: Expired code shows 'has expired'; valid code shows a lower previewed total; confirming charges the discounted amount.
- **CLI invite in Local mode**
  1. Run agi invite in a Local session, then in a signed-in Cloud session.
  - Expected: Local refuses without any account call; Cloud prints link and terms.

**Where to look when it fails**

- Log 'Referral attribution evaluated' with outcome and 'Referral attribution failed' (apps/web/lib/services/referral-attribution.ts).
- Log 'Referral blocked at its first paid invoice' and 'Referral clawed back after its qualifying invoice was reversed' (apps/web/app/api/stripe-webhook/lib/referral-events.ts).
- Log 'Referral rewards settled' and 'Referral rewards hit their per-run ceiling' (apps/web/app/api/cron/grant-referral-rewards/route.ts).
- Tables referrals, referral_codes, bonus_credit_grants.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Referral reward, clawback and promotion application write no audit event.** Affects: Finance and admins on the web.. Evidence: No recordAuditEvent in apps/web/lib/services/referral-service.ts or apps/web/app/api/stripe-webhook/lib/referral-events.ts.. Work needed: Add audit events for grant, block and clawback.
- **Invite grants named in the brief have no code.** Affects: All apps.. Evidence: Search for invite_grant found nothing in apps/web.. Work needed: Decide whether invite grants are wanted; build or drop the wording.
- **Mobile, VS Code and Chrome have no referral entry.** Affects: Mobile, VS Code, Chrome.. Evidence: Only bonus credit text in apps/mobile/src/features/settings/cloud-usage/index.tsx:382.. Work needed: Open the web page from each app or show the link.
- **Brief line numbers for S100.22 are stale.** Affects: Documentation readers.. Evidence: apps/web/app/api/checkout/route.ts:407 is error handling.. Work needed: Refresh the brief.
- **No evidence any test or run covers a real Stripe promotion in upgrade.** Affects: Web upgrade.. Evidence: Test files read do not name promotion in titles seen.. Work needed: Add a route test with a stubbed Stripe promotion list.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-observability-and-operations
- SYS-security-and-privacy
- surface:web
- surface:desktop
- surface:cli
- mode:cloud
- table:referral_codes
- table:referrals
- table:bonus_credit_grants
- F100-12

## Unknown

- Whether Free-plan accounts are meant to hold referral codes.
- Whether Apple or Google store purchases can convert a referral.
- How account erasure treats referral rows.
- Whether any test exercises a real promotion code in upgrade.
- Retention of usage promotion rows.
