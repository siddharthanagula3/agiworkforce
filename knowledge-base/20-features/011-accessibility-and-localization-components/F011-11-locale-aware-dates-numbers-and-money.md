---
id: "F011-11"
type: "feature"
title: "Locale-aware dates, numbers and money"
aliases: ["Locale-aware dates and numbers", "Currency formatting", "formatBillingMoney", "formatUsdAmount", "formatBillingDate", "Money format", "S11.22", "S11.23"]
area: "11 Accessibility and localization components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S11.22", "S11.23"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "SYS-data-model-and-migrations", "surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "surface:cli", "file:packages/contracts/types/src/money-format.ts", "F011-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F011-11 Locale-aware dates, numbers and money

Dates, times, numbers and prices are formatted with the browser or phone locale, using the Intl API, and money uses the currency's own minor-unit digits with a fixed two-digit fallback. The locale comes from the device, not the app's chosen language. The CLI shows credits and a fixed date format, not currency.

Area: [11. Accessibility and localization components](README.md). Requirement items: [S11.22](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1122), [S11.23](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1123).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built (this page lists unfinished parts) | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Formats billing amounts, invoice and device dates, usage counts and prices so they read the way the person's device expects.

**Why it exists.** A fixed US format confuses people and wrong currency digits misstate prices (brief S11.22, S11.23).

**Who uses it.** Everyone who sees billing, usage, devices or pricing, on every app.

**Problems it solves**

- US-style dates and number separators for everyone.
- Wrong number of decimals for currencies with none or three.
- Missing currency symbol or code.

**Use cases**

- A user opens invoices and sees dates and amounts in their locale.
- A user reads the pricing page in their local currency where available.
- A user reads 'Last seen' on linked devices.
- A VS Code user sees account dates in the host locale.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): Billing invoices list (apps/web/app/billing/invoices/InvoiceList.tsx:25-31), payment history (apps/web/features/billing/components/BillingPaymentHistory.tsx), pricing page (apps/web/app/pricing/page.tsx:290-349), Settings linked devices and passkeys panels.
- Desktop Tauri pricing cards and upgrade dialog (apps/desktop/src/features/pricing/PlanCard.tsx:35-91; DesktopUpgradeConfirmDialog.tsx:139), retained code.
- Mobile: Settings, plans and cloud usage (apps/mobile/src/features/settings/plans/index.tsx:30-33; apps/mobile/src/features/settings/cloud-usage/index.tsx:75-221).
- VS Code: account and artifact presentation; Chrome: side panel usage text; CLI: credits text.

**Before you start**

- For localized prices on Web: the localized pricing catalog loaded from the server (apps/web/app/pricing/page.tsx:290).

**Screens and controls**

- Plain text amounts and dates; no controls. Pricing shows server-localized prices with a fixed en-US format before the page mounts (apps/web/app/pricing/page.tsx:148, :291).

**Journey**

1. Open Billing, invoices or Pricing.
2. Read the amount with the symbol and decimals of its currency.
3. Read dates such as 'Linked' and 'Last seen' in the device's date style.

**What the person sees and gets**

- Money such as a currency symbol plus amount; whole units can drop decimals (packages/contracts/types/src/money-format.ts:14-31).
- Unknown currency prints '<amount with two digits> <CODE>' (money-format.ts:29-31).
- Renewal text like '<price>/month plus tax' (apps/web/features/billing/lib/billing-format.ts:41-48).

**Settings**

- None in the app: the locale is the runtime default (Intl with undefined locale), not the Display Language setting (money-format.ts:21; billing-format.ts:23).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- formatBillingMoney converts minor units using the currency's digit count, formats with Intl, and falls back to a fixed 2-digit amount with the currency code on error (packages/contracts/types/src/money-format.ts:1-31).
- formatUsdAmount formats US dollars with the runtime locale (money-format.ts:33-40).
- Billing dates use Intl.DateTimeFormat with the runtime locale (apps/web/features/billing/lib/billing-format.ts:8-24).
- Plan price amounts use a locale argument and narrow currency symbols (apps/web/features/billing/lib/localized-pricing.ts:44-70).
- Devices and passkeys panels use toLocaleString and toLocaleDateString with undefined locale (apps/web/features/settings/components/LinkedDevicesPanel.tsx:63-70; apps/web/features/settings/components/Settings/PasskeysPanel.tsx:22-27).
- Mobile uses toLocaleDateString, toLocaleTimeString and Intl.NumberFormat with undefined locale (apps/mobile/src/features/settings/cloud-usage/index.tsx:75, :205-221, :898; plans/index.tsx:30-33).
- Chrome side panel uses Intl relative time and date formatting with undefined locale (apps/extension/src/side_panel.ts:1133, :11669, :12497, :12561).

**Incomplete**

- The locale comes from the runtime, not from the chosen Display Language, so a user who picks Spanish in a US browser still sees US formatting (money-format.ts:21; billing-format.ts:23) [inferred from Intl undefined-locale behaviour].
- Mobile plan prices come from the plan catalog label (getBillingPlanPricing(...).label) and store prices, not from formatBillingMoney (apps/mobile/src/features/settings/plans/index.tsx:89, :118; apps/mobile/src/features/billing/storePricing.ts:9-14).
- Web pricing first renders with a fixed en-US locale to match the server, then switches after mount (apps/web/app/pricing/page.tsx:148, :291).
- VS Code citations in the brief (artifactPresentation.ts:83, commandSetup.ts:398) do not hold date code; other date code exists in accountPresentation.ts (apps/extension-vscode/src/features/account-auth/accountPresentation.ts:18).
- Helper words '/month', '/year', 'plus tax', 'including' are English (billing-format.ts:32-48).

**Present but disconnected or switched off**

- Some web billing flows depend on checkout flags such as NEXT_PUBLIC_CHECKOUT_ENABLED; that affects whether prices are actionable, not their format (apps/web/features/billing/lib/localized-pricing.ts:19-26).

**Not available**

- CLI shows credits through format_usd_as_credits and a fixed '%Y-%m-%d %H:%M' date; no currency symbol or locale formatting (apps/cli/src/cost_ledger.rs:50-52; apps/cli/src/agents.rs:1365-1368).
- The brief says currency formatting is done on CLI; the code shows credits, not currency.

## 4. Required behaviour

**Established requirements**

- Dates, times and numbers are formatted for the user's locale rather than a fixed US format. Done on web, desktop, mobile, VS Code; CLI missing; Chrome unverified. (source: brief S11.22)
- Prices and money amounts show the right currency symbol and the user's number format. Done on web, desktop, mobile, CLI. (source: brief S11.23)
- The pricing display uses a deployment country header and configured price currency options; it never trusts a browser-supplied currency. (source: doc: docs/product/definition.md:388-390)
- Public clients must not receive private internal allowance units, ledger cents or the internal unit-to-currency conversion. (source: doc: docs/product/definition.md:287)

**Acceptance criteria**

1. formatBillingMoney(1999, 'usd') shows a dollar amount with two decimals in the runtime locale.
2. A zero-decimal currency amount shows no decimals.
3. An unknown currency code shows a two-digit amount followed by the code.
4. Invoice dates and amounts change when the browser locale changes.
5. Linked devices and passkeys dates follow the browser locale.
6. Mobile cloud usage dates follow the phone locale.
7. The CLI prints credits and a fixed date; no currency is shown.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Using Intl with an undefined locale follows the runtime locale; therefore the formatting does not follow the Display Language [inferred].
- Desktop gets Web behaviour through the hosted web app [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether formatting should follow the Display Language or the device; then pass that locale to every formatter.
- [proposed] Translate the billing helper words.
- [proposed] Either mark the CLI done as 'credits' or add locale formatting.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | formatBillingMoney, currencyMinorUnitDigits, formatUsdAmount | `packages/contracts/types/src/money-format.ts` | Canonical money formatting with fallback |
| service | billing-format | `apps/web/features/billing/lib/billing-format.ts` | Billing date, recurring and renewal text, ratio |
| service | localized-pricing | `apps/web/features/billing/lib/localized-pricing.ts` | Localized plan price amounts with narrow symbols |
| component | InvoiceList | `apps/web/app/billing/invoices/InvoiceList.tsx` | Invoice amounts and dates |
| component | BillingPaymentHistory | `apps/web/features/billing/components/BillingPaymentHistory.tsx` | Payment history amounts |
| component | Pricing page | `apps/web/app/pricing/page.tsx` | Localized plan prices, server-render locale |
| component | UpgradeConfirmDialog | `apps/web/features/billing/components/UpgradeConfirmDialog.tsx` | Amount due and renewal in currency |
| component | LinkedDevicesPanel | `apps/web/features/settings/components/LinkedDevicesPanel.tsx` | Date-time formatting for devices |
| component | PasskeysPanel | `apps/web/features/settings/components/Settings/PasskeysPanel.tsx` | Date formatting for passkeys |
| component | ComposerFooter | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Locale-formatted numbers in the composer footer (brief cite) |
| component | Desktop PlanCard and DesktopUpgradeConfirmDialog | `apps/desktop/src/features/pricing/PlanCard.tsx` | Retained Tauri pricing cards using the shared formatters |
| component | Mobile cloud usage | `apps/mobile/src/features/settings/cloud-usage/index.tsx` | Dates, times and counts with device locale |
| component | Mobile plans | `apps/mobile/src/features/settings/plans/index.tsx` | Compact number format and plan labels |
| service | mobile store pricing | `apps/mobile/src/features/billing/storePricing.ts` | Store-provided price labels and currency |
| service | VS Code accountPresentation | `apps/extension-vscode/src/features/account-auth/accountPresentation.ts` | Account date formatting |
| service | Chrome usageWindows | `apps/extension/src/features/side-panel/usageWindows.ts` | Usage text using shared formatters |
| service | Chrome side panel formatting | `apps/extension/src/side_panel.ts` | Relative time, date and time formatting |
| service | CLI cost_ledger | `apps/cli/src/cost_ledger.rs` | Credits text |
| service | CLI output format_cost | `apps/cli/src/output.rs` | Per-turn token and credits line |
| config | BILLING_CURRENCY_TERMS | `packages/contracts/types/src/billing-catalog.ts` | Supported billing currencies and tax terms |
| test | top-up-money test | `apps/web/lib/billing/top-up-money.test.ts` | Money handling for top-ups |
| test | UpgradeConfirmDialog receipt test | `apps/web/features/billing/components/__tests__/UpgradeConfirmDialog.receipt.test.tsx` | Receipt amounts |
| test | upgrade-plan-label test | `apps/extension/__tests__/upgrade-plan-label.test.ts` | Chrome plan label using formatters |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The server sends amounts as minor units with a currency code (invoices, previews, localized plan prices). | our servers | apps/web/app/billing/invoices/InvoiceList.tsx:48-60; apps/web/features/billing/lib/localized-pricing.ts:58-70 |
| The client divides by 10 to the currency's digit count and formats with Intl using the runtime locale. | device | packages/contracts/types/src/money-format.ts:14-28 |
| On a formatting error the client prints a fixed two-digit amount plus the code. | device | money-format.ts:29-31 |
| Dates are formatted by Intl on the device from ISO strings. | device | apps/web/features/billing/lib/billing-format.ts:20-24 |
| Pricing page uses a fixed en-US locale for the first render, then the runtime locale after mount. | device | apps/web/app/pricing/page.tsx:148, :291 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Amounts and currency codes | Billing records on our servers | fetched on demand | Per billing retention (not examined) |

**Models and providers.** None. Prices come from the billing catalog and the payment provider; no model is involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Billing screens need a signed-in account; formatting itself none found in the code. |
| Permissions | Billing pages follow billing ownership rules (SYS-authorization-and-workspaces); formatting none found. |
| Subscription | none found in the code for formatting; displayed amounts depend on the user's plan and currency. |
| Limits and metering | none found in the code. |
| Feature flags | NEXT_PUBLIC_CHECKOUT_ENABLED affects checkout availability only (localized-pricing.ts:19-26). |
| Model compatibility | Not related to models. |
| Provider restrictions | Currency and tax terms come from the billing catalog; non-supported currency prints a plain fallback. |
| Local mode | Formatting is on device and works in Local mode; billing data needs the server. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown or invalid currency | Fallback '<amount.xx> CODE' | money-format.ts:29-31 |
| Invalid date string | formatBillingDate returns null and the invoice list shows the raw text | billing-format.ts:12-24; InvoiceList.tsx:29-31 |
| Whole-unit amounts | Optional trimming of decimals | money-format.ts:14-27 |
| Zero-decimal currency | Digit count read from Intl | money-format.ts:1-12 |
| Server-render versus browser | Pricing first uses en-US to avoid mismatch | pricing/page.tsx:148, :291 |
| Loading or error pricing | pricingStatus loading, ready, error; fallback USD amounts when no localized entry | localized-pricing.ts:58-65; pricing/page.tsx:290 |
| Offline | Formatting works; data may not load. Not handled in the formatters themselves | packages/contracts/types/src/money-format.ts (no network use) |
| CLI | No locale formatting | apps/cli/src/agents.rs:1365-1368 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/billing/top-up-money.test.ts`: Top-up money handling
- `apps/web/features/billing/components/__tests__/UpgradeConfirmDialog.receipt.test.tsx`: Receipt amounts
- `apps/web/app/upgrade/UpgradeChooser.test.tsx`: Upgrade chooser amounts
- `apps/extension/__tests__/upgrade-plan-label.test.ts`: Chrome plan label with formatUsdAmount
- `apps/web/lib/server/__tests__/localized-pricing-service.test.ts`: Server side localized pricing
- `apps/cli/src/output.rs`: Inline tests of cost text

**Test scenarios**

- **Invoice formatting**
  1. Set the browser language to German
  2. Open Billing, invoices
  - Expected: Dates and amounts use German style
- **Display language versus locale**
  1. Keep a US browser, choose Spanish in Settings
  2. Open invoices
  - Expected: Today: US formatting stays (documents the gap)
- **Unknown currency**
  1. Call formatBillingMoney(1234, 'zzz')
  - Expected: Fixed fallback '12.34 ZZZ'
- **Zero-decimal currency**
  1. Format a minor-unit amount in a zero-decimal currency
  - Expected: No decimals
- **Mobile locale**
  1. Set the phone region to another country
  2. Open cloud usage
  - Expected: Dates and counts follow the region
- **CLI**
  1. Run a turn in the CLI
  - Expected: Credits text, no currency

**Where to look when it fails**

- Visible fallback strings with a currency code
- Console errors from Intl RangeError are swallowed by the fallback (try/catch), so check the output text
- check:money-paths guard exists in package.json (not run)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/011-accessibility-and-localization-components.md](../../70-qa/test-plans/web/011-accessibility-and-localization-components.md)
- Desktop: [70-qa/test-plans/desktop/011-accessibility-and-localization-components.md](../../70-qa/test-plans/desktop/011-accessibility-and-localization-components.md)
- Mobile: [70-qa/test-plans/mobile/011-accessibility-and-localization-components.md](../../70-qa/test-plans/mobile/011-accessibility-and-localization-components.md)
- CLI: [70-qa/test-plans/cli/011-accessibility-and-localization-components.md](../../70-qa/test-plans/cli/011-accessibility-and-localization-components.md)
- VS Code: [70-qa/test-plans/vscode/011-accessibility-and-localization-components.md](../../70-qa/test-plans/vscode/011-accessibility-and-localization-components.md)
- Chrome: [70-qa/test-plans/chrome/011-accessibility-and-localization-components.md](../../70-qa/test-plans/chrome/011-accessibility-and-localization-components.md)

## 10. Gaps and dependencies

- **Formatting follows the device locale, not the chosen Display Language** Affects: Web, Desktop, Mobile, VS Code users who choose a language different from the device. Evidence: money-format.ts:21; billing-format.ts:23. Work needed: Decide the policy and pass an explicit locale
- **CLI has no locale formatting and shows credits, not currency** Affects: CLI users. Evidence: apps/cli/src/cost_ledger.rs:50-52; agents.rs:1365-1368. Work needed: Re-state the brief or add formatting
- **Mobile plan prices are not formatted by the shared money helper** Affects: Mobile users. Evidence: apps/mobile/src/features/settings/plans/index.tsx:89, :118. Work needed: Verify price labels against locale or use the helper
- **Billing helper words are English literals** Affects: Non-English billing users. Evidence: billing-format.ts:32-48. Work needed: Move to catalog
- **Chrome date and money formatting is marked unverified although code uses Intl** Affects: Brief accuracy. Evidence: apps/extension/src/side_panel.ts:1133, :11669. Work needed: Verify and update the brief
- **No unit test found for money-format.ts itself** Affects: Test coverage. Evidence: search for formatBillingMoney in test files found only indirect tests. Work needed: Add tests for digits, trim, and fallback

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- SYS-data-model-and-migrations
- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- surface:cli
- file:packages/contracts/types/src/money-format.ts
- F011-10

## Unknown

- Whether any server returns pre-formatted money strings.
- How Mobile store prices are localized by the stores.
- Whether VS Code formatting uses the host locale or the editor display language (code passes undefined).
- Contents of the ComposerFooter number formatting (not opened).
- Whether Desktop Tauri pricing cards are reachable by users.
