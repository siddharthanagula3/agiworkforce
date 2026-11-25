---
id: "F056-10"
type: "feature"
title: "Personal data: bank, health and device notes"
aliases: ["Personal data: bank, health and device notes", "S56.45 Local notes and calendars", "S56.46 Health-record connections", "S56.47 Financial-account connections", "Bank accounts connector", "Plaid", "HealthEx", "Linked banks", "device steps"]
area: "56 Concrete integration families"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S56.45", "S56.46", "S56.47"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-sync-and-continuity", "SYS-memory-projects-and-context", "SYS-authentication-and-identity", "mode:cloud", "surface:web", "surface:mobile", "surface:desktop", "surface:chrome", "surface:cli", "surface:vscode", "file:apps/web/lib/connectors/bank-accounts.ts", "file:packages/contracts/types/src/phone-steps.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F056-10 Personal data: bank, health and device notes

Three personal-data readers. Bank accounts (Plaid, US only, read-only) is built but not released and is hidden on mobile. Health records (HealthEx, US only, Health space only) is built but off by owner decision and not released. Phone calendar and reminders work on mobile through device steps; there is no device notes tool.

Area: [56. Concrete integration families](README.md). Requirement items: [S56.45](../../10-requirements/capabilities/056-concrete-integration-families.md#s5645), [S56.46](../../10-requirements/capabilities/056-concrete-integration-families.md#s5646), [S56.47](../../10-requirements/capabilities/056-concrete-integration-families.md#s5647).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Bank: the person links a bank through Plaid, and the assistant can read balances and transactions through two read tools; a Finance view shows linked banks. Health: the assistant can read health records through a HealthEx connection inside a private Health space. Phone: the assistant reads calendar events and availability and adds events or reminders on the phone, with confirmation for writes.

**Why it exists.** ChatGPT and Claude ship personal finance, health and device features; the founder decision builds them, read-only, opt-in and US only for bank and health (doc: docs/decisions/2026-09-27-founder-decisions.md, D-2026-09-28-08).

**Who uses it.** Signed-in people in the United States for bank and health; mobile users for calendar and reminders.

**Problems it solves**

- Asking about spending without opening a banking app.
- Bringing health records into a conversation under strict rules.
- Scheduling from chat on the phone.

**Use cases**

- Ask 'what did I spend on food last month' after linking a bank.
- Remove one linked bank from the Linked banks list.
- Ask the phone assistant 'am I free Thursday at 3' and 'add lunch to my calendar'.
- Ask for a reminder due tomorrow.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web): Connectors, 'Bank accounts' card; Finance page at /chat/finance with a 'Linked banks' section (apps/web/app/chat/finance/layout.tsx:5; apps/web/features/finance/components/LinkedBanks.tsx:101-110).
- Mobile: Settings, Connectors shows 'Link a bank account' only when FEATURES.bankLinking is on; it is off (apps/mobile/lib/v1FeatureFlags.ts:30; cloud-connectors/index.tsx:1007-1022).
- Health: a Health space route (apps/web/app/api/health-space/) and /chat/health page folder (apps/web/app/chat/health).
- Phone notes and calendar: no screen; the assistant asks the OS for Calendar or Reminders permission in a chat turn (apps/mobile/src/features/integrations/services/phoneDeviceSteps.ts:62-80).
- CLI, VS Code, Chrome: no screen of their own.

**Before you start**

- Bank: paid managed plan, United States, operator Plaid variables PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV, and the connector token encryption key (apps/web/lib/connectors/plaid-config.ts:45-58; oauth-setup.ts:130-142).
- Health: US only, no workspace, HealthEx OAuth client configured, a Health space (apps/web/lib/services/health-space-service.ts:22-28).
- Phone: the AGI Mobile app in Cloud mode and OS Calendar or Reminders permission.
- All: the connector id must be released; bank-accounts and healthex are not (connector-release.ts:16-30).

**Screens and controls**

- 'Remove bank' button with confirm 'Remove <name>?' and 'Remove bank' (LinkedBanks.tsx:67-80).
- Per-account include switches; 'The bank asks you to sign in again before it shares its accounts.' for reconnect (LinkedBanks.tsx:125-129).
- Finance page text 'Connect a bank account to see your balances and spending here.', 'Reconnect bank accounts' (FinanceDashboard.tsx:103-115).
- Phone confirmation for write steps (packages/contracts/types/src/phone-steps.ts, phoneStepNeedsConfirmation).

**Journey**

1. Bank on web: open Connectors, choose Bank accounts, the browser opens Plaid Link; after sign-in the exchange route saves the bank.
2. Bank on phone: hosted Plaid link in an in-app browser, then exchange (apps/mobile/services/connectors.ts:319-339) - hidden today.
3. Ask the assistant about balances or transactions; read tools run (approval depends on policy).
4. Remove a bank in Linked banks; Plaid is told to remove the item first.
5. Phone: ask about the calendar; the cloud run sends a device step to the phone; the phone reads or writes locally and returns the result.

**What the person sees and gets**

- Account and transaction text fenced as untrusted bank data (bank-accounts.ts:44-46).
- Messages: 'No bank account is connected. Ask the user to connect one in Settings, Connectors.'; reconnect and 'still preparing transaction history' texts (bank-accounts.ts:790-830).
- Phone outcomes such as 'Added "<title>" to the <calendar> calendar ...' and 'Calendar access is off for AGI Mobile on this device ...' (phoneDeviceSteps.ts:30-45, :224).

**Settings**

- Per-account include switches per bank.
- Per-tool permissions.
- Device Settings app for Calendar and Reminders access.
- Region: United States only for bank and health (sensitive-data-connectors.ts:20-26).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Bank code: link token and hosted link creation, exchange, several banks per account, per-bank removal, account exclusion, balances and transactions tools, sealed tokens, row-level security (apps/web/lib/connectors/bank-accounts.ts:167-575, :583-830; apps/web/db/neon/0350_bank_account_items.sql).
- Bank read tools are declared reads, so under auto_approve_read_only they can run unasked (tool-metadata.ts:814-818 and :1083).
- Health code: HealthEx read tools declared (tool-metadata.ts:778-812), Health space service, region and workspace refusal, 30-minute authorization window (sensitive-data-connectors.ts:20-25; health-space-service.ts).
- Phone steps: calendar events, availability, create event, create reminder; writes need confirmation; permission-off messages; wrong-device guard (phone-steps.ts:5-45; phoneDeviceSteps.ts:259-279).
- Desktop host refuses phone steps (apps/web/features/desktop-host/lib/device-steps.ts:432).

**Incomplete**

- Device notes: no notes tool exists. PHONE_STEP_TOOLS has calendar events, availability, create event and reminder create only (phone-steps.ts:5-10). Notes appear only as the notes field of an event or reminder.
- Bank on the owner side: Plaid agreement, production transactions access, compliance review, migration apply and a device check are open (brief S56.47 'Unfinished').
- The brief names migration 0349; the bank items migration is 0350_bank_account_items.sql (apps/web/db/neon/0350_bank_account_items.sql). 0349 is mobile_intent_tokens.

**Present but disconnected or switched off**

- bank-accounts and healthex are not released, so their tools are never offered (user-connector-tools.ts:2478-2484, :2537; connector-release.test.ts).
- The public page says connectors cannot be connected yet in any country (apps/web/app/supported-countries/page.tsx:75).
- Mobile: bank tools are withheld for any turn the mobile app starts (plaid-config.ts:12-19; route.ts:856) and bank linking is off in the app (v1FeatureFlags.ts:30).
- Health stays off by owner decision, pending vendor agreement and legal sign-off (doc: audit/partial/056-concrete-integration-families.md, S56.46 row; docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-08).
- Health tools are offered only inside a Health space project (user-connector-tools.ts:2520-2521, :2540-2541).

**Not available**

- Health on mobile: no health-specific code found in the mobile Connectors screen; the brief's 'mobile health done' cites a generic file (cloud-connectors/index.tsx:44 is an import).
- Health on VS Code and CLI: no health code; the brief cites generic streaming files.
- Device notes and calendars on Desktop, CLI, VS Code, Chrome: not built (surface check in phoneDeviceSteps being mobile-only; desktop host skips phone steps).

## 4. Required behaviour

**Established requirements**

- The assistant can read and add to the notes and calendars stored on the user's own device. (source: brief S56.45)
- The assistant can read the user's health records through a connected provider account. (source: brief S56.46)
- The assistant can read balances and transactions from a connected financial account. (source: brief S56.47)
- Health and bank connections are opt-in, read-only, United States only, never written to memory or used for training, and removed with their stored tokens on disconnect. They stay unavailable until the owner signs the vendor agreement and a lawyer confirms the rules. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-08))
- Bank link is stored per bank item and can be removed per bank. (source: apps/web/lib/connectors/bank-accounts.ts:311-340, :483-497)

**Acceptance criteria**

1. A non-US request to connect Bank accounts is refused with 'Connecting a bank account is available in the United States only.'
2. Removing one bank removes it at Plaid and from the Linked banks list, and other banks stay.
3. Excluding an account removes it from chat answers and the Finance view.
4. get_account_balances and get_transactions return data fenced as untrusted bank data.
5. Bank tools never reach a turn started by the mobile app.
6. A calendar create step asks for confirmation on the phone and adds one event.
7. With Calendar permission off, the step returns the 'access is off' message and adds nothing.
8. No health tool is offered outside a Health space.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Bank and health data must not be saved to memory; a refusal rule for save_memory after a health read is named in the audit text (doc: audit/partial/056-concrete-integration-families.md, S56.46 chrome row); the code for it was not located [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a notes tool (for example reading the device Notes app) or state that only calendar and reminders are in scope.
- [proposed] Update the brief to cite migration 0350.
- [proposed] Add a mobile test that bank tools stay withheld while bankLinking is off.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | bank-accounts | `apps/web/lib/connectors/bank-accounts.ts` | Plaid link, exchange, items, removal, exclusions, read tools. |
| config | plaid-config | `apps/web/lib/connectors/plaid-config.ts` | Plaid environment variable names, API origin, mobile surface exclusion. |
| endpoint | /api/connectors/bank-accounts/link | `apps/web/app/api/connectors/bank-accounts/link/route.ts` | Creates a Plaid link token or hosted link. |
| endpoint | /api/connectors/bank-accounts/exchange | `apps/web/app/api/connectors/bank-accounts/exchange/route.ts` | Exchanges the Plaid result and saves the bank. |
| endpoint | /api/connectors/bank-accounts/items | `apps/web/app/api/connectors/bank-accounts/items/route.ts` | Lists linked banks. |
| endpoint | /api/connectors/bank-accounts/items/[itemId] | `apps/web/app/api/connectors/bank-accounts/items/[itemId]/` | Patch exclusions and delete one bank. |
| table | bank_account_items | `apps/web/db/neon/0350_bank_account_items.sql` | One row per linked bank item with a sealed token and excluded accounts; row-level security. |
| table | connector_oauth_grants | `apps/web/lib/connectors/oauth-store.ts` | The 'Bank accounts is connected' marker grant. |
| component | LinkedBanks (web) | `apps/web/features/finance/components/LinkedBanks.tsx` | Linked banks list, remove and include toggles. |
| component | FinanceDashboard | `apps/web/features/finance/components/FinanceDashboard.tsx` | Read-only finance view with connect and reconnect links. |
| component | LinkedBanks (mobile) | `apps/mobile/src/features/settings/cloud-connectors/LinkedBanks.tsx` | Mobile list, hidden while bankLinking is off. |
| service | mobile connectors service | `apps/mobile/services/connectors.ts` | linkBankAccountsInApp, fetchBankItems, removeBankItem (lines 319-359). |
| config | v1FeatureFlags | `apps/mobile/lib/v1FeatureFlags.ts` | bankLinking false (line 30). |
| service | sensitive-data-connectors | `apps/web/lib/connectors/sensitive-data-connectors.ts` | US-only refusal, 30-minute health window, read-only tool filter. |
| service | health-space-service | `apps/web/lib/services/health-space-service.ts` | Health space lookup, creation and unavailable reasons. |
| endpoint | /api/health-space | `apps/web/app/api/health-space/` | Health space API. |
| config | HEALTHEX_TOOL_METADATA | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Declared read tools for health records (line 778). |
| config | connector-scopes | `packages/contracts/cloud-contracts/src/connector-scopes.ts` | Scope ceilings: healthex patient read, bank transactions (lines 233-234). |
| service | phone-steps | `packages/contracts/types/src/phone-steps.ts` | Phone step tools, capabilities, confirmation rule, limits. |
| service | phoneDeviceSteps | `apps/mobile/src/features/integrations/services/phoneDeviceSteps.ts` | Runs calendar and reminder steps with the phone's calendar API. |
| store | chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Pending approval turns with device step results (lines 470-510). |
| service | desktop device-steps | `apps/web/features/desktop-host/lib/device-steps.ts` | Desktop host that excludes phone steps (line 432). |
| service | loadUserConnectorToolCatalog | `apps/web/lib/user-connector-tools.ts` | Adds bank tools when released, granted and Plaid configured (lines 2478-2484). |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Withholds bank tools on mobile turns (line 856). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Bank link: the person opens Plaid Link in the browser (web) or an in-app browser (mobile, hidden). | outside service | apps/web/lib/connectors/bank-accounts.ts:186-224; apps/mobile/services/connectors.ts:319-339 |
| AGI exchanges the public token with Plaid, encrypts the access token and saves a bank item. | our servers | apps/web/lib/connectors/bank-accounts.ts:433-460, :360-380 |
| In a chat turn, bank tools are added only if released, granted, Plaid is configured and the turn is not from mobile. | our servers | apps/web/lib/user-connector-tools.ts:2478-2484; plaid-config.ts:15-18 |
| The model calls a bank tool; AGI asks Plaid for balances or transactions now, per bank, skipping excluded accounts. | outside service | apps/web/lib/connectors/bank-accounts.ts:790-830 |
| The text is fenced as untrusted bank data and returned to the model. | our servers | bank-accounts.ts:44-46 |
| Phone: the Cloud run emits a device-step-requested event for the phone's device id; the phone checks the id, asks OS permission, reads or writes the calendar and returns the result. | device | apps/mobile/src/features/integrations/services/phoneDeviceSteps.ts:44-59, :259-279 |
| The result goes back to the run so the model can answer. | device and our servers | apps/mobile/stores/chat/chatExecutionStore.ts:470-510 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Plaid access token per bank | table bank_account_items (sealed with purpose plaid-access-token); marker grant in connector_oauth_grants | Server side; same account on every app | Removed at Plaid first, then deleted; account erasure removes each item at Plaid (0350 migration header); a row whose token Plaid rejects is kept so it can be removed (bank-accounts.ts:395-410) |
| Excluded account ids | bank_account_items.excluded_account_ids | Server side | Deleted with the item |
| Balances and transactions | Fetched on demand, not stored by AGI in a table read; they enter the conversation record | With the conversation | unknown |
| Calendar events and reminders | The phone's own calendar and reminders | By the phone's own calendar accounts, not by AGI | Under the phone's controls |

**Models and providers.** Bank and health tools run in a Cloud turn on any tool-capable model; the data passes through the chosen model route. Plaid and HealthEx are outside services. Phone steps are executed by the device, but the model that asked is a Cloud model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account, United States for bank and health; mobile Cloud mode for phone steps. |
| Permissions | OS Calendar and Reminders permission; per-tool permissions; confirmation for phone writes (phone-steps.ts, phoneStepNeedsConfirmation); Health space only for HealthEx. |
| Subscription | Connectors capability on paid managed plans (billing-catalog.ts:351). Phone steps: plan rule for the device tools was not traced. |
| Limits and metering | Transactions: default 100, max 500 per call, up to 20 account ids (bank-accounts.ts:34-37); event range up to 62 days (phone-steps.ts:30). Metering: none found. |
| Feature flags | connector-release.ts; FEATURES.bankLinking on mobile (v1FeatureFlags.ts:30); PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV; HealthEx client variable CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID (names only). |
| Model compatibility | Model must support tools for bank and health; phone steps arrive from the run, so a tool-capable model is needed [inferred]. |
| Provider restrictions | Plaid, United States, Plaid products limited to transactions (connector-scopes.ts:234; bank-accounts.ts:31). HealthEx, United States only. |
| Local mode | Bank and health: not available in Local mode (Cloud chat route only; local-only and byok lack the connectors capability, billing-catalog.ts:351). Phone steps in Local mode on mobile: unknown, because steps are requested by a Cloud run. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Not US | Refused with the region message. | apps/web/lib/connectors/sensitive-data-connectors.ts:20-26, :55-62 |
| Plaid not configured | Setup message listing missing variable names. | apps/web/lib/connectors/oauth-setup.ts:130-142; plaid-config.ts:52-58 |
| No bank linked | Tool returns 'No bank account is connected...' | bank-accounts.ts:796-801 |
| Bank needs sign-in again | Tool text tells the user to reconnect; list shows 'reconnect' status. | bank-accounts.ts:545-565, :808-815 |
| Transactions not ready | Tool text says try again in a few minutes. | bank-accounts.ts:803-807 |
| Removal fails at Plaid | Link kept; curated error text. | bank-accounts.ts:44, :237-245; bank-accounts.test.ts 'removing one bank' |
| Loading and empty | 'Loading your linked banks' and 'No banks linked yet.' | LinkedBanks.tsx:90-103 |
| Phone permission off | Returns an 'access is off' result and adds nothing. | phoneDeviceSteps.ts:30-45 |
| User declines phone write | 'The user declined this on their device, so nothing was added.' | phoneDeviceSteps.ts:25-28 |
| Wrong device | 'This step was meant for another device' | phoneDeviceSteps.ts:260-265 |
| Too many events to summarise | Returns an ask for a shorter range. | phoneDeviceSteps.ts:181-185 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/bank-accounts.test.ts`: Removing one bank, choosing accounts, overview transaction window, linking another bank (describe blocks at lines 179-410).
- `apps/web/app/api/connectors/bank-accounts/link/__tests__/route.test.ts`: Link route (named for it).
- `apps/web/app/api/connectors/bank-accounts/exchange/__tests__/route.test.ts`: Exchange route (named for it).
- `apps/web/app/api/connectors/bank-accounts/items/__tests__/route.test.ts`: Items route (named for it).
- `apps/web/app/api/connectors/bank-accounts/items/[itemId]/__tests__/route.test.ts`: Single item route (named for it).
- `apps/web/features/finance/components/LinkedBanks.test.tsx`: Linked banks list (named for it).
- `apps/web/app/api/health-space/__tests__/route.test.ts`: Health space route (named for it).
- `apps/mobile/__tests__/phone-device-steps.test.ts`: Phone device steps (named for it).
- `packages/contracts/types/src/__tests__/phone-steps.test.ts`: Phone step planning rules (named for it).
- `packages/contracts/types/src/__tests__/connector-release.test.ts`: bank-accounts and plaid are not released.

**Test scenarios**

- **Non-US refusal**
  1. Request connecting Bank accounts from a non-US network.
  - Expected: Refused with the US-only message.
- **Remove one of two banks**
  1. Link two banks in a Plaid sandbox.
  2. Remove the first in Linked banks.
  - Expected: Confirm text names consequences; the second bank stays and chat still answers from it.
- **Mobile exclusion**
  1. On the mobile app ask about balances with a bank linked on web.
  - Expected: No bank tool is offered on that turn.
- **Calendar write**
  1. On the phone ask to add an event tomorrow at 10.
  - Expected: A confirmation appears; one event is added after Allow.
- **Permission off**
  1. Turn off Calendar for AGI Mobile in OS settings, then ask for today's events.
  - Expected: The assistant reports that access is off and no events are listed.
- **Health not offered**
  1. Open a normal chat with HealthEx connected (when allowed).
  - Expected: No HealthEx tool; it appears only in the Health space.

**Where to look when it fails**

- Logs '[bank-accounts] a stored bank link could not be opened', '[bank-accounts] the Plaid item could not be removed; the link is kept' (bank-accounts.ts:164-170, :340).
- Plaid error codes PRODUCT_NOT_READY, ITEM_LOGIN_REQUIRED, ITEM_NOT_FOUND, INVALID_ACCESS_TOKEN (bank-accounts.ts:38-41).
- Table bank_account_items; connector grant for bank-accounts.
- Mobile phone step result strings.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/056-concrete-integration-families.md](../../70-qa/test-plans/web/056-concrete-integration-families.md)
- Desktop: [70-qa/test-plans/desktop/056-concrete-integration-families.md](../../70-qa/test-plans/desktop/056-concrete-integration-families.md)
- Mobile: [70-qa/test-plans/mobile/056-concrete-integration-families.md](../../70-qa/test-plans/mobile/056-concrete-integration-families.md)
- Chrome: [70-qa/test-plans/chrome/056-concrete-integration-families.md](../../70-qa/test-plans/chrome/056-concrete-integration-families.md)

## 10. Gaps and dependencies

- **No device notes tool.** Affects: Mobile (and all other apps).. Evidence: packages/contracts/types/src/phone-steps.ts:5-10. Work needed: Decide scope; build or drop 'notes' from S56.45.
- **Bank accounts is built but unreleased and hidden on mobile.** Affects: All apps.. Evidence: connector-release.ts:16-30; v1FeatureFlags.ts:30; plaid-config.ts:15. Work needed: Owner Plaid steps, legal review, release id, flip bankLinking and remove mobile exclusion.
- **Health is switched off and unconfigured; brief statuses 'mobile health done' and 'vscode health done' have no matching code.** Affects: All apps.. Evidence: sensitive-data-connectors.ts; apps/mobile/src/features/settings/cloud-connectors/index.tsx has no health code. Work needed: Correct the brief; owner decision on enabling.
- **Phone steps not available on Desktop, CLI, VS Code, Chrome.** Affects: Those apps.. Evidence: apps/web/features/desktop-host/lib/device-steps.ts:432. Work needed: Decide if needed; Desktop local calendar would need its own host.
- **Brief cites migration 0349 for bank items; the file is 0350.** Affects: Docs and audit.. Evidence: apps/web/db/neon/0350_bank_account_items.sql. Work needed: Correct the brief reference.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-sync-and-continuity
- SYS-memory-projects-and-context
- SYS-authentication-and-identity
- mode:cloud
- surface:web
- surface:mobile
- surface:desktop
- surface:chrome
- surface:cli
- surface:vscode
- file:apps/web/lib/connectors/bank-accounts.ts
- file:packages/contracts/types/src/phone-steps.ts

## Unknown

- Whether the device-step tools are offered on a mobile turn that runs in Local mode.
- Which plan tiers may use phone steps.
- Where the rule that keeps health reads out of memory is implemented.
- Retention of bank answers in conversations.
- Whether HealthEx tool names listed in tool-metadata.ts match the live server.
- Whether the device check of the Plaid auth session was done.
