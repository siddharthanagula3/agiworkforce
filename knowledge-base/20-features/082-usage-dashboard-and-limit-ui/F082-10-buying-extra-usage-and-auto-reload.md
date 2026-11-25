---
id: "F082-10"
type: "feature"
title: "Buying extra usage and auto-reload"
aliases: ["Buy credits", "Add credits", "Top-up", "Extra usage", "Auto-reload", "Keep going after a usage limit", "S82.29", "S82.30", "/extra-usage"]
area: "82 Usage dashboard and limit UI"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S82.29", "S82.30"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-observability-and-operations", "surface:web", "surface:desktop", "surface:vscode", "surface:chrome", "surface:cli", "mode:cloud", "table:auto_reload_settings", "table:credit_transactions", "table:subscriptions", "table:beta_redemptions", "api:POST /api/billing/top-up", "api:GET /api/billing/auto-reload", "api:PUT /api/billing/auto-reload", "F082-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F082-10 Buying extra usage and auto-reload

A paid Cloud user on web or hosted desktop can buy a credit pack through hosted checkout, from the limit card or Settings > Billing, and can switch on auto-reload to buy a pack when the balance falls below a threshold. VS Code and Chrome open the web billing pages. The CLI prints the pricing link. Mobile has neither.

Area: [82. Usage dashboard and limit UI](README.md). Requirement items: [S82.29](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8229), [S82.30](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8230).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a paying user add prepaid credits on demand (top-up) or automatically (auto-reload) to keep working after plan limits are spent.

**Why it exists.** Briefs S82.29 and S82.30 ask for purchase at the point of limit and for automatic reload with settings. Credits keep work going past plan windows.

**Who uses it.** Users on an active paid plan billed through Stripe, Apple or Google (top-up); Stripe-billed users (auto-reload).

**Problems it solves**

- Work stops at a limit
- Manual repeated top-ups
- Unclear failure when a card is declined

**Use cases**

- User hits a limit, clicks 'Add credits', picks an amount and pays in checkout.
- User sets 'When my balance falls below' and 'Reload with' and agrees to the terms.
- Auto-reload fails because a card expired and the user is told and must switch it back on.
- CLI user types /extra-usage and gets the pricing link.

## 2. User experience

**Where to find it**

- Web and hosted desktop: 'Add credits' button on the usage-block card above the composer, opening the 'Buy credits' panel (apps/web/features/chat/components/WorkUsageCard.tsx:56-80); Settings > Billing, section 'Buy credits' (apps/web/features/billing/components/TopUpPanel.tsx:118) and 'Auto-reload' (AutoReloadPanel.tsx:102); toggle 'Keep going after a usage limit' (apps/web/features/settings/sections/BillingSection.tsx:1209). Usage page shows 'Auto-reload on/off' link (UsageSection.tsx:700-703).
- VS Code: 'Add credits' opens web billing (apps/extension-vscode/src/core/cloudUtilityErrorActions.ts:60; ChatStateManager.ts:1991-1996).
- Chrome: 'Add credits' opens the web billing page (apps/extension/_locales/en/messages.json:137; side_panel.ts:751).
- CLI: slash command /extra-usage or /pricing (apps/cli/src/tui/tui_app.rs:6698).

**Before you start**

- Active paid plan with a billing source of Stripe, Apple or Google (BillingSection.tsx:454-456; top-up/route.ts:156-166).
- Auto-reload also needs a Stripe-billed plan, a saved card and USD billing (BillingSection.tsx:1184; auto-reload-service.ts:424-445).
- The payment processor must be enabled in the server environment (top-up/route.ts:95-103; auto-reload-service.ts:159-166).

**Screens and controls**

- Top-up panel: amount choices or 'Other amount' (whole dollars), button 'Buy <credits>' or 'Buy credits' (TopUpPanel.tsx:228).
- Auto-reload: switch, 'When my balance falls below', 'Reload with', per-reload price text, 'Save auto-reload', 'Discard changes', 'Add a payment method' (AutoReloadPanel.tsx:212-356).
- Consent dialog 'Turn on auto-reload?' / 'Change auto-reload?' with confirm 'Agree and turn on' / 'Agree and save' (AutoReloadPanel.tsx:203-208).

**Journey**

1. Top-up: reach a limit, click 'Add credits' (or open Settings > Billing), pick an amount, click Buy.
2. The browser goes to hosted checkout; terms and tax are collected there; success returns to Settings > Billing with topup=success.
3. Auto-reload: Settings > Billing, switch on Auto-reload, set threshold and pack, click 'Save auto-reload', read and accept the dialog.
4. An email confirms the agreed terms when they change (auto-reload-service.ts:456-468).
5. Later, when balance is below threshold after a settled request or on a scheduled sweep, a reload is charged.

**What the person sees and gets**

- Errors such as 'Top-ups are available on active paid plans. Start or restore your plan first.' (top-up/route.ts:163-165) and 'You can add up to <credits> a day...' (route.ts:203-205).
- 'Add a card before turning on auto-reload.' and 'Add a card in Settings > Billing before turning on auto-reload.' (AutoReloadPanel.tsx:193; auto-reload route.ts:62).
- Failure line 'The last reload on <date> did not go through: <reason>. Auto-reload stays off until you turn it on again.' (AutoReloadPanel.tsx:318-323).
- In-app notification and email on a failed reload (auto-reload-service.ts:650-668).

**Settings**

- Auto-reload enabled, threshold credits, amount in dollars, consent version (table auto_reload_settings).
- 'Keep going after a usage limit' switch for purchased credits (BillingSection.tsx:1209).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/billing/top-up: CSRF, checkout enabled check, rate limit, plan-change hold check, workspace policy check, whole-dollar amount, active paid plan with Stripe/Apple/Google source, USD for Stripe plans, daily purchase cap, creates a hosted payment session with withdrawal consent text, writes an audit event (apps/web/app/api/billing/top-up/route.ts:108-270). Requires an Idempotency-Key header (route.ts:282).
- Auto-reload API: GET and PUT with validation, payment-method and consent-version checks, audit event, and an immediate trigger when enabled (apps/web/app/api/billing/auto-reload/route.ts:40-105).
- Auto-reload engine: lease, plan, charge, settle, fail, recovery, sweep (apps/web/lib/services/auto-reload-service.ts:477-1110). Triggered after a finalized managed request with cost (managed-usage-request-service.ts:1294-1297) and by a cron every ten minutes (vercel.json:77-80; apps/web/app/api/cron/run-auto-reloads/route.ts).
- A failed reload turns auto-reload off, stores last_failure_reason, sends an in-app notification and an email (auto-reload-service.ts:635-670).
- Web UI: TopUpPanel, WorkUsageCard dialog, AutoReloadPanel, BillingSection wiring.

**Incomplete**

- Failed reloads are not retried automatically. The code sets enabled=false and tells the user to switch it back on (auto-reload-service.ts:638, 666). The brief's 'shown and retried' is true only as a manual retry.
- The top-up route has no upgrade-waitlist check. That gate is in plan checkout and portal (apps/web/app/api/checkout/route.ts:299-312; apps/web/lib/server/billing-waitlist-access.ts:42). A first-time buyer without access cannot start a paid plan, so cannot reach top-up.
- Auto-reload is shown only for Stripe-billed plans (BillingSection.tsx:1184), while top-up is allowed for Apple and Google sources too.

**Present but disconnected or switched off**

- Top-up and auto-reload refuse with 'not available right now' when STRIPE_CHECKOUT_ENABLED is off or the Stripe secret is missing (top-up/route.ts:95-109; auto-reload-service.ts:159-166, 425-427). The environment values were not read.

**Not available**

- Mobile: no top-up or auto-reload (brief n/a; mobile v1 has no in-app purchases per project memory).
- VS Code, Chrome: link out only. CLI: link only (tui_app.rs:6698; claude_parity.rs:789).
- Free plan: shows a Buy credits panel with canBuy false (BillingSection.tsx:1183, TopUpPanel.tsx:88-100); purchase is not available.

## 4. Required behaviour

**Established requirements**

- Users can buy extra usage when they run out, from where they hit the limit. (source: S82.29 (brief))
- Users can turn on automatic credit reload and configure it. (source: S82.30 (brief))
- Buying is allowed only on an active paid plan with a payment source. (source: apps/web/app/api/billing/top-up/route.ts:156-166)
- Auto-reload runs only when the payment processor is enabled; the consent text is versioned and must be accepted before saving. (source: apps/web/lib/services/auto-reload-service.ts:159-166, 441-445)
- A failed reload is recorded with a reason. (source: apps/web/lib/services/auto-reload-service.ts:635-670)
- Plan-limit refusals offer top-up only when the plan is self-serve and billed by a payment source and credits clear the block. (source: apps/web/lib/services/managed-usage-request-service.ts:86-104)
- The product sells no subscriptions on any surface before 2027-01-01. (source: owner decision in project memory (owner-product-decisions); not re-verified in code)

**Acceptance criteria**

1. On an active Stripe-billed paid plan, Buy opens hosted checkout for the chosen whole-dollar amount.
2. On Free or a lapsed plan, the route answers 'Top-ups are available on active paid plans...'.
3. A purchase that would pass the daily cap is refused with the daily limit message.
4. Saving auto-reload with no card shows 'Add a card...' and does not save enabled.
5. Saving requires the consent dialog and sends the current consent version; an old version returns 'consent_outdated'.
6. A declined reload sets Auto-reload off, shows the reason, and creates a notification.
7. Turning auto-reload off saves without a dialog.
8. Auto-reload does nothing above the threshold, on a billing hold or above the daily purchase cap.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Amounts are in credits and whole US dollars; billing in another currency is refused [inferred from top-up/route.ts:174-181].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Consider a bounded automatic retry for soft declines instead of switching off.
- [proposed] Show auto-reload on Apple and Google billed plans only if the owner decides to support off-session charges there.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/billing/top-up | `apps/web/app/api/billing/top-up/route.ts` | Creates hosted checkout for a credit pack |
| endpoint | GET and PUT /api/billing/auto-reload | `apps/web/app/api/billing/auto-reload/route.ts` | Read and save settings, trigger a reload on enable |
| service | auto-reload-service | `apps/web/lib/services/auto-reload-service.ts` | Settings, consent, lease, charge, settle, fail, sweep |
| job | run-auto-reloads cron | `apps/web/app/api/cron/run-auto-reloads/route.ts` | Periodic sweep; schedule in vercel.json:78-79 |
| service | managed-usage-request-service trigger | `apps/web/lib/services/managed-usage-request-service.ts` | maybeTriggerAutoReload after a billed request (line 1296) |
| component | TopUpPanel | `apps/web/features/billing/components/TopUpPanel.tsx` | Buy credits UI |
| component | AutoReloadPanel | `apps/web/features/billing/components/AutoReloadPanel.tsx` | Auto-reload settings UI and consent dialog |
| component | WorkUsageCard | `apps/web/features/chat/components/WorkUsageCard.tsx` | Add credits dialog at the limit |
| component | BillingSection | `apps/web/features/settings/sections/BillingSection.tsx` | Shows panels, Keep going toggle |
| service | startTopUpCheckout | `apps/web/features/billing/services/stripe-payments.ts` | Client call to top-up with idempotency key |
| service | resolveManagedQuotaRecovery | `apps/web/lib/services/managed-usage-request-service.ts` | Chooses top_up, upgrade, view_usage or contact_support |
| table | auto_reload_settings | `apps/web/lib/services/auto-reload-service.ts:240` | Enabled flag, threshold, amount, lease, last failure, consent |
| table | credit_transactions | `apps/web/app/api/billing/top-up/route.ts:189` | Purchases counted for the daily cap |
| table | subscriptions | `apps/web/app/api/billing/top-up/route.ts:139` | Plan, status, billing source |
| table | beta_redemptions | `apps/web/lib/server/billing-waitlist-access.ts:52` | Waitlist access for plan checkout (not top-up) |
| command | CLI /extra-usage | `apps/cli/src/tui/tui_app.rs` | Prints and opens the pricing link (line 6698) |
| service | VS Code manageBilling | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Opens web billing (line 1990) |
| service | Chrome openQuotaRecovery | `apps/extension/src/side_panel.ts` | Opens recovery page in a tab (line 751) |
| test | top-up route test | `apps/web/app/api/billing/top-up/route.test.ts` | Endpoint behaviour |
| test | auto-reload route and service tests | `apps/web/lib/services/auto-reload-service.settle.test.ts` | Settle and hold behaviour; route test beside the route |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| User picks an amount; the browser POSTs /api/billing/top-up with CSRF token and an Idempotency-Key. | device and our servers | apps/web/features/billing/services/stripe-payments.ts:268-282 |
| Server checks plan, policy, daily cap, creates a hosted checkout session at the payment processor and returns its URL. | our servers | top-up/route.ts:108-270 |
| The browser is handed to the processor's checkout page, which collects payment, terms and tax. | outside service | top-up/route.ts:227-243; stripe-payments.ts:296 |
| A webhook credits the account (credit top-up handler). | our servers | apps/web/app/api/stripe-webhook/lib/__tests__/credit-topup.test.ts exists; handler file not opened |
| Auto-reload: after a settled request or each sweep the server checks balance versus threshold, billing hold, daily cap, takes a lease, charges the saved card off-session and settles on the payment event. | our servers | auto-reload-service.ts:477-540, 858-1050 |
| On failure the server disables auto-reload, records the reason, notifies and emails. | our servers | auto-reload-service.ts:635-670 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Auto-reload settings and last failure | table:auto_reload_settings | Server; read by the settings UI | unknown |
| Purchased credits and purchase transactions | table:credit_transactions and prepaid credit balances | Server | unknown |
| Consent record (version, accepted time) and consent email | auto_reload_settings and email provider | Server | unknown |
| Card and payment | Payment processor | Outside our servers | Processor policy; not established here |

**Models and providers.** Not model dependent. Credits are spent when a managed request is billed at the catalog price; top-up only changes the balance. Payment is made to the payment processor, not to a model provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; session token and CSRF header (top-up/route.ts:109-111). |
| Permissions | Workspace billing policy can refuse top-ups (route.ts:121-133). Account holds for deletion or open dispute refuse purchases (billing-plan-change-gate.ts:44-68). |
| Subscription | Active paid plan, Stripe/Apple/Google source; auto-reload only Stripe-billed (BillingSection.tsx:1184). Free sees the panel disabled. |
| Limits and metering | Top-up amount from MIN_TOP_UP_AMOUNT_USD to MAX_TOP_UP_AMOUNT_USD, daily purchase cap DAILY_TOP_UP_LIMIT_USD (top-up/route.ts:49-55, 196-205). Auto-reload threshold range and the same daily cap apply (auto-reload route.ts:46-52; service:477-494). Rate limit key checkout. |
| Feature flags | STRIPE_CHECKOUT_ENABLED and the Stripe secret key gate both features (top-up/route.ts:95-103). Paid plan checkout is gated by the billing waitlist switch AGI_BILLING_WAITLIST_OPEN or a beta_redemptions row (billing-waitlist-access.ts:30-57). Values not read. |
| Model compatibility | none found in the code |
| Provider restrictions | Billing currency must be USD for Stripe plans (top-up/route.ts:174-181; auto-reload-service.ts:436-440). |
| Local mode | Local mode needs no credits and has no top-up. In own-key mode the user pays the provider, so these controls do not apply [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Checkout unavailable | 503 'Top-up checkout is not available right now.' | top-up/route.ts:112-116 |
| Not on a paid plan | Validation error text. | top-up/route.ts:156-166 |
| Daily cap | Validation error with the cap in credits. | top-up/route.ts:202-206 |
| Billing currency not USD | Refusal with no charge made. | top-up/route.ts:174-181 |
| Auto-reload load error | Alert with 'Try again'. | AutoReloadPanel.tsx:108-120 |
| No card | 409 payment_method_required; panel shows 'Add a payment method'. | auto-reload route.ts:58-70; AutoReloadPanel.tsx:325-339 |
| Old consent text | 409 consent_outdated; reload page and agree again. | auto-reload route.ts:71-83 |
| Reload in flight / lease expired | Outcome in_flight or recovery. | auto-reload-service.ts:1013-1020 |
| Billing hold | Reload skipped ('held'). | auto-reload-service.ts:503-507 |
| Bank needs confirmation | Failure reason 'authentication_required' explains it can only happen while signed in. | auto-reload-service.ts:68-69 |
| Offline | not handled in the code beyond generic errors | none found |
| Accessibility | Switch bound to the heading; errors role=alert; touch size class on coarse pointers. | AutoReloadPanel.tsx:222, 319 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/billing/top-up/route.test.ts`: Top-up endpoint
- `apps/web/app/api/billing/auto-reload/route.test.ts`: Auto-reload endpoint
- `apps/web/lib/services/auto-reload-service.settle.test.ts`: Settlement of a reload payment
- `apps/web/lib/services/auto-reload-service.hold.test.ts`: Billing hold behaviour
- `apps/web/lib/billing/top-up-money.test.ts`: Top-up quote maths
- `apps/web/app/api/stripe-webhook/lib/__tests__/credit-topup.test.ts`: Credit top-up webhook
- `apps/web/db/neon/credit-top-up-carry-migration.test.ts`: Top-up database migration

**Test scenarios**

- **Top-up from the limit card**
  1. Use a paid Stripe test account at a limit.
  2. Click Add credits, choose an amount, Buy.
  - Expected: Redirect to checkout; after payment the balance rises and the limit card clears.
- **Free account**
  1. Open Settings > Billing on Free.
  - Expected: Buy credits panel is disabled or explanatory; the route refuses if called.
- **Turn on auto-reload**
  1. Open Billing with a saved card.
  2. Set threshold and pack.
  3. Save and accept the dialog.
  - Expected: Settings saved, 'You agreed to the auto-reload terms on <date>', a consent email.
- **Declined reload**
  1. Use a test card that declines off-session.
  2. Spend below the threshold.
  - Expected: Auto-reload switches off, the failure line shows the reason, a notification and email arrive.
- **Processor disabled**
  1. Run with checkout disabled.
  - Expected: Top-up answers 503; saving auto-reload with enabled true fails with 'not available right now'.

**Where to look when it fails**

- Log lines 'Auto-reload payment failed; auto-reload is off until the account turns it back on', 'Auto-reload check failed', 'Auto-reload sweep could not process an account'.
- Audit events checkout_started and auto_reload_changed.
- Table auto_reload_settings (last_failure_reason, reload_attempt_id, lease).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md)
- Desktop: [70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md)

## 10. Gaps and dependencies

- **No automatic retry after a failed reload; it switches off.** Affects: Web, desktop. Evidence: apps/web/lib/services/auto-reload-service.ts:638, 666. Work needed: Decide whether to add a bounded retry.
- **Brief says the waitlist gate blocks first-time buyers of top-up; the gate is not in the top-up route.** Affects: Documentation. Evidence: grep of hasBillingWaitlistAccess: only checkout, portal, waitlist and team seat routes. Work needed: Correct the brief; keep the gate note for plan checkout.
- **No in-app purchase on mobile, VS Code, Chrome, CLI.** Affects: Those apps. Evidence: cloudUtilityErrorActions.ts:60; tui_app.rs:6698. Work needed: Link-outs exist; in-app purchase not planned.
- **No component test found for AutoReloadPanel, TopUpPanel or WorkUsageCard.** Affects: Test coverage. Evidence: name search of test files. Work needed: Add component tests.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-observability-and-operations
- surface:web
- surface:desktop
- surface:vscode
- surface:chrome
- surface:cli
- mode:cloud
- table:auto_reload_settings
- table:credit_transactions
- table:subscriptions
- table:beta_redemptions
- api:POST /api/billing/top-up
- api:GET /api/billing/auto-reload
- api:PUT /api/billing/auto-reload
- F082-09

## Unknown

- Values of STRIPE_CHECKOUT_ENABLED and the waitlist switch in production.
- Which handler credits the balance after top-up checkout (webhook handler file not opened).
- Retention of auto_reload_settings and credit_transactions.
- Whether native purchases are available on mobile in the current build.
- Exact VS Code add-credits line numbers in the brief (1088) do not match; the manageBilling case is at 1990.
