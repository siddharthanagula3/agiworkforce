---
id: "F108-01"
type: "feature"
title: "Bank accounts and spending dashboard"
aliases: ["Finances page", "Finance dashboard", "Bank accounts connector", "bank-accounts connector", "Plaid bank linking", "Linked banks", "Personal-finance dashboard (S108.01)", "Connected accounts (S108.02)", "Spending analysis (S108.03)"]
area: "108 Specialist workspaces"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S108.01", "S108.02", "S108.03"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "plan:basic", "plan:pro", "plan:max", "plan:max_15x", "plan:team", "plan:team_premium", "plan:enterprise", "file:apps/web/lib/connectors/bank-accounts.ts", "file:apps/web/lib/connectors/plaid-config.ts", "api:GET /api/finance/overview", "api:POST /api/connectors/bank-accounts/link", "api:POST /api/connectors/bank-accounts/exchange", "api:GET /api/connectors/bank-accounts/items", "table:bank_account_items", "SYS-subscriptions-entitlements-and-usage", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-data-model-and-migrations", "SYS-chat-turn-pipeline"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F108-01 Bank accounts and spending dashboard

A signed-in web person links a US bank through Plaid and sees balances, spending by category and recent transactions on the Finances page (/chat/finance). Chat can also read balances and transactions through two read-only bank tools. Both are switched off in code today by the connector release state, and by missing Plaid setup.

Area: [108. Specialist workspaces](README.md). Requirement items: [S108.01](../../10-requirements/capabilities/108-specialist-workspaces.md#s10801), [S108.02](../../10-requirements/capabilities/108-specialist-workspaces.md#s10802), [S108.03](../../10-requirements/capabilities/108-specialist-workspaces.md#s10803).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person link one or more US bank accounts read-only through Plaid. It shows accounts, spending, income and recent transactions on one page, and lets chat answer money questions from live bank data. It cannot move money (apps/web/features/finance/components/FinanceDashboard.tsx:358; apps/web/lib/connectors/bank-accounts.ts:583-643).

**Why it exists.** The founder decision D-2026-09-28-08 says bank accounts connect read-only like the leaders' personal finance experience, opt-in, US only, never used for training, and stay off until the owner signs the vendor agreement and a lawyer confirms the rules (doc: docs/decisions/2026-09-27-founder-decisions.md:198-215).

**Who uses it.** A person on a paid plan, in the United States, on the web app (and the Desktop window that shows the hosted web app, per doc: AGENTS.md section 5).

**Problems it solves**

- Seeing balances and spending across banks without opening each bank
- Asking chat about spending without pasting statements
- Hiding one account from chat and the page without unlinking the bank
- Removing a bank and ending the vendor's access to it

**Use cases**

- Open Finances, pick Last 90 days, read where money went
- Ask chat what the checking balance is
- Untick a savings account so chat never sees it
- Remove a bank after switching banks

## 2. User experience

**Where to find it**

- Web: page /chat/finance titled 'Finances' (apps/web/app/chat/finance/page.tsx:6-17). It has no entry in the left rail; the rail list has no Finance item (apps/web/shared/components/layout/app-nav-items.ts:90-170). It is reached from the toast 'See your finances' after linking (apps/web/features/finance/lib/announce-bank-connected.ts:5-10), from the URL, or from the 'Connect a bank account' link on the page.
- Web: linking starts from the connector named 'Bank accounts' in Settings, Connections (the page links to /settings/connections: FinanceDashboard.tsx:30,104) and the connector directory (apps/web/features/directory/hooks/useDirectoryAdapter.ts:1277-1281).
- Desktop: the public Desktop shows the hosted web app, so the same page [doc: AGENTS.md section 5]; /chat/finance is listed as a chat section path (apps/web/features/desktop-host/lib/adjacent-chat.ts:22).
- Mobile: not offered; the Bank accounts detail screen redirects away while the flag is off (apps/mobile/app/(app)/connectors/[id].tsx:11-13).
- Chrome extension, CLI, VS Code: no bank or finance code found (git grep for plaid, healthex in apps/extension returned nothing).

**Before you start**

- Signed in with a confirmed email (apps/web/lib/services/connector-policy-gate.ts:118-137,155-158).
- A plan that includes Connectors: any paid tier, not Free (packages/contracts/types/src/billing-catalog.ts:351; connector-policy-gate.ts:179-186).
- Request from the United States (apps/web/lib/connectors/sensitive-data-connectors.ts:23-25,46-55).
- Deployment configured with PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:52-58).
- Connectors released for bank-accounts. Today the release state is 'coming_soon' and bank-accounts is not in the released list, so linking is refused (packages/contracts/types/src/connector-release.ts:14-30; connector-policy-gate.ts:147-154).

**Screens and controls**

- Header 'Finances' and the line 'A read-only view of your banks through Plaid. Nothing here can move money.' (FinanceDashboard.tsx:356-359).
- Period buttons 'Last 30 days', 'Last 90 days', 'Last 12 months' with aria-pressed (FinanceDashboard.tsx:24-28,370-384).
- Summary tiles Spending, Income, Accounts (FinanceDashboard.tsx:121-136).
- Lists: 'Accounts', 'Linked banks', 'Where your money went', 'By month' (shown with 2 or more months), 'Recent transactions' (FinanceDashboard.tsx:139-324,396-401).
- Linked banks: a 'Remove bank' button per bank and a checkbox per account; unchecked accounts stay linked but leave chats and the page (apps/web/features/finance/components/LinkedBanks.tsx:129-137,150-160,168-170).
- Remove bank opens a confirmation 'Remove <bank>?' saying accounts stop appearing and the link is removed at Plaid (LinkedBanks.tsx:84-98).
- Plaid Link window opened from the Plaid script on web (apps/web/features/connectors/lib/plaid-link.ts:69-88,113-133).

**Journey**

1. Open Settings, Connections and choose Bank accounts (connect).
2. The app asks the server to start; the server answers 409 with the Plaid link and exchange paths (apps/web/app/api/connectors/route.ts:664-690).
3. The app asks for a link token, loads Plaid Link from Plaid's CDN and opens it (plaid-link.ts:135-146).
4. The person signs in to the bank inside Plaid's window.
5. The app sends the public token to the exchange endpoint; the server swaps it for a long-lived token and stores it sealed (bank-accounts.ts:433-454).
6. A toast 'Bank accounts connected.' offers 'See your finances' (announce-bank-connected.ts:5-10).
7. On /chat/finance choose a period and read totals, accounts, categories and recent transactions.
8. Optionally untick an account or remove a bank under 'Linked banks'.
9. In chat, ask about balances or spending; the model calls get_account_balances or get_transactions (bank-accounts.ts:583-643).

**What the person sees and gets**

- 'Loading your finances' spinner, then the page (FinanceDashboard.tsx:387-391).
- Not linked: 'Connect a bank account to see your balances and spending here.' with a 'Connect a bank account' link (FinanceDashboard.tsx:100-106).
- Preparing: 'Your bank is still preparing transactions. Check back in a few minutes.' (FinanceDashboard.tsx:107-110).
- Needs sign-in: 'Your bank asks you to sign in again before it shares new data.' with 'Reconnect bank accounts' (FinanceDashboard.tsx:111-117).
- Setup missing: the setup message from the server is shown as a notice (FinanceDashboard.tsx:98-99; apps/web/app/api/finance/overview/route.ts:31-33).
- Load failure: 'Your finances could not be loaded. Try again in a moment.' (FinanceDashboard.tsx:31).
- Note 'Totals cover only the most recent transactions in this period.' when truncated (FinanceDashboard.tsx:317-321).

**Settings**

- Per-account include or exclude, saved per bank (PATCH /api/connectors/bank-accounts/items/{itemId}; apps/web/app/api/connectors/bank-accounts/items/[itemId]/route.ts:35-66).
- Per-chat connector switch and saved allow/ask/deny verdicts apply to the bank tools like any connector (apps/web/app/api/llm/v1/chat/completions/route.ts:826-854).
- Deployment variables PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV (sandbox or production) (plaid-config.ts:35-62).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The page, the overview endpoint, the linked-banks list, per-account exclusion and bank removal are implemented and connected on web (FinanceDashboard.tsx:326-408; apps/web/app/api/finance/overview/route.ts:20-38; LinkedBanks.tsx:37-174).
- Spending math: pending transactions are left out; transfers, loan payments and income are not counted as spending; income counts only negative amounts in the INCOME category; totals use the most common currency (apps/web/lib/services/finance-overview-service.ts:17-22,64-117).
- Overview reads up to 2,000 transactions in pages of 500 (bank-accounts.ts:828-829,862-911).
- Two read-only chat tools with validated arguments, results fenced as untrusted data (bank-accounts.ts:55-57,106-120,652-654,682-788).
- Several banks per person, each removable alone; an earlier single-link grant is carried over (bank-accounts.ts:307-355,380-412,483-497; migration apps/web/db/neon/0350_bank_account_items.sql).
- Account erasure and connector disconnect remove the Plaid item (apps/web/lib/connectors/oauth-access.ts:449; apps/web/lib/server/account-erasure.ts:1044).
- After a bank tool returns data, save_memory is refused for the rest of the turn (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2531-2536,5642-5644).
- Plaid script, frame and API origins are added to the Content Security Policy only while PLAID_ENV is set (plaid-config.ts:64-72; apps/web/proxy.ts:51).

**Incomplete**

- No budgets, net worth, credit or document explanation (see F108-02).
- The finance overview and linked-banks list endpoints do not check plan, region or connector release; they check sign-in, active account and rate limit only (apps/web/app/api/finance/overview/route.ts:20-36; apps/web/app/api/connectors/bank-accounts/items/route.ts:14-22) [inferred: a person who already has linked rows keeps seeing data after a plan change].
- The setup doc says linking again replaces the previous item, but the code keeps several banks (doc: docs/development/connectors-setup.md:597-632 versus bank-accounts.ts:433-454).

**Present but disconnected or switched off**

- Connector release state is 'coming_soon' and the released list holds 13 other connectors; bank-accounts is not in it and a test names it as not released (packages/contracts/types/src/connector-release.ts:14-30; packages/contracts/types/src/__tests__/connector-release.test.ts:36-48). So the link and exchange endpoints refuse with 'Connectors are coming soon.' even with Plaid configured (connector-policy-gate.ts:147-154; link/route.ts:42-50).
- Chat bank tools are never added to a turn while bank-accounts is unreleased (apps/web/lib/user-connector-tools.ts:2478-2485).
- Plaid is also unconfigured until the owner sets the three variables; the brief says the owner has said bank stays off for now (brief S108.01; docs/development/connectors-setup.md:597-632).
- Mobile: bank code exists (apps/mobile/services/connectors.ts:317-358; apps/mobile/src/features/settings/cloud-connectors/LinkedBanks.tsx) but FEATURES.bankLinking is false (apps/mobile/lib/v1FeatureFlags.ts:30), and the server removes bank tools from mobile turns (plaid-config.ts:13-19).

**Not available**

- Chrome extension, CLI and VS Code: no code.
- Mobile: not offered to users.
- Local mode: nothing runs on the device; every step needs our servers and Plaid.

## 4. Required behaviour

**Established requirements**

- A personal-finance dashboard shows accounts, balances and spending in one product view. (source: S108.01 (brief))
- The user links bank, card and investment accounts so the assistant can read balances and transactions. (source: S108.02 (brief))
- The product analyses transactions by category and period and shows where money goes. (source: S108.03 (brief))
- Bank connections are opt-in, read-only, United States only, never written to memory or used for training, removed with their stored tokens on disconnect, and stay off until the owner signs the vendor agreement and a lawyer confirms the rules. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:198-215)
- Disconnect or account erasure calls Plaid item removal and erases the stored token; the Content Security Policy admits Plaid only while PLAID_ENV is set; set all three variables or none. (source: doc: docs/development/connectors-setup.md:597-632)
- An irreversible action asks first and names the consequence (bank removal uses useConfirmAction). (source: doc: AGENTS.md section 9; LinkedBanks.tsx:84-98)

**Acceptance criteria**

1. With Plaid sandbox set, connectors released for bank-accounts, a paid account in the US: linking a sandbox bank adds it to 'Linked banks' and shows its accounts.
2. With no bank linked, /chat/finance shows 'Connect a bank account to see your balances and spending here.'
3. Switching period changes the totals and the date range returned by /api/finance/overview?period=30d|90d|12m; any other period is refused.
4. Unticking an account removes it from totals, from the accounts list and from chat tool results.
5. Remove bank asks for confirmation and, once confirmed, the bank disappears and Plaid item removal is called; a Plaid failure keeps the bank and shows the removal-failed message.
6. A Free account, or a request from outside the US, cannot start linking and sees a refusal message.
7. A mobile-started chat turn never receives the bank tools.
8. After a bank tool returns data in a turn, save_memory is refused in that turn.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Finance overview and linked-banks list should apply the same plan, region and release rules as linking, so a downgraded or moved account does not keep reading live bank data [inferred from connector-policy-gate.ts:147-186 versus overview/route.ts:20-36].
- The Finances page should be reachable from the rail or Settings once bank linking opens [inferred: no rail item exists].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a rail or Settings entry for Finances when the connector is released.
- [proposed] Gate the overview and items GET routes with the connector policy gate.
- [proposed] Update docs/development/connectors-setup.md to describe several banks per person.
- [proposed] Add category budgets and net worth on top of the overview (see F108-02).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Finance page | `apps/web/app/chat/finance/page.tsx` | Route /chat/finance inside WebAppShell |
| component | FinanceDashboard | `apps/web/features/finance/components/FinanceDashboard.tsx` | Fetches the overview, shows states, totals, categories, months, transactions |
| component | LinkedBanks (web) | `apps/web/features/finance/components/LinkedBanks.tsx` | Lists banks, account checkboxes, Remove bank with confirmation |
| other | announceBankConnected | `apps/web/features/finance/lib/announce-bank-connected.ts` | Success toast with link to /chat/finance |
| other | Plaid Link client | `apps/web/features/connectors/lib/plaid-link.ts` | Loads the Plaid script, opens Link, posts link and exchange calls |
| hook | connector connect handlers | `apps/web/features/connectors/hooks/use-connectors.ts` | Reads the 409 reply and runs Plaid Link (line 460-469); same logic in useConnectorsSettingsAdapter.tsx:801-809 and useDirectoryAdapter.ts:1277-1281 |
| service | bank-accounts | `apps/web/lib/connectors/bank-accounts.ts` | Plaid calls, token storage, items, exclusions, tools, overview read |
| service | finance-overview-service | `apps/web/lib/services/finance-overview-service.ts` | Period ranges and spending, income, category and month sums |
| config | plaid-config | `apps/web/lib/connectors/plaid-config.ts` | Plaid env, origins, CSP origins, mobile exclusion |
| config | sensitive-data-connectors | `apps/web/lib/connectors/sensitive-data-connectors.ts` | US-only region rule and read-only tool filter |
| endpoint | POST /api/connectors/bank-accounts/link | `apps/web/app/api/connectors/bank-accounts/link/route.ts` | Creates Plaid link token (Link or hosted link); setup, region, policy checks |
| endpoint | POST /api/connectors/bank-accounts/exchange | `apps/web/app/api/connectors/bank-accounts/exchange/route.ts` | Exchanges public token or completes hosted link |
| endpoint | GET /api/connectors/bank-accounts/items | `apps/web/app/api/connectors/bank-accounts/items/route.ts` | Lists linked banks and their accounts |
| endpoint | PATCH and DELETE /api/connectors/bank-accounts/items/{itemId} | `apps/web/app/api/connectors/bank-accounts/items/[itemId]/route.ts` | Excludes accounts; removes one bank |
| endpoint | GET /api/finance/overview | `apps/web/app/api/finance/overview/route.ts` | Returns the overview for a period |
| schema | finance contract | `packages/contracts/cloud-contracts/src/finance.ts` | Overview request and response shapes and period list |
| schema | bank-accounts contract | `packages/contracts/cloud-contracts/src/bank-accounts.ts` | Link, exchange, items request and response shapes and paths |
| table | bank_account_items | `apps/web/db/neon/0350_bank_account_items.sql` | One row per linked bank: sealed token, institution, excluded account ids; row-level security |
| config | connector release | `packages/contracts/types/src/connector-release.ts` | coming_soon state and released connector list |
| service | connector-policy-gate | `apps/web/lib/services/connector-policy-gate.ts` | Release, email, plan and workspace policy checks before linking |
| service | user-connector-tools | `apps/web/lib/user-connector-tools.ts` | Adds bank tool definitions (2478-2485) and runs them (2824-2829) |
| config | tool metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Declares both bank tools as read class (806-817) |
| config | optional feature entry bank_accounts | `apps/web/lib/config/optional-features.ts` | States what is off when Plaid variables are missing (124-130) |
| screen | Mobile LinkedBanks and hosted link | `apps/mobile/src/features/settings/cloud-connectors/LinkedBanks.tsx` | Disabled mobile copy of the banks list; service in apps/mobile/services/connectors.ts:317-358 |
| config | mobile flag bankLinking | `apps/mobile/lib/v1FeatureFlags.ts` | bankLinking false (line 30) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens /chat/finance; the page asks GET /api/finance/overview for the chosen period with cookies. | device and our servers | FinanceDashboard.tsx:332-349; overview/route.ts:20-36 |
| Server checks sign-in, active account and rate limit, then answers 'unavailable' with the setup message when Plaid variables are missing. | our servers | overview/route.ts:21-33; bank-accounts.ts:575-577 |
| Server reads the person's bank rows and opens each sealed token. | our servers | bank-accounts.ts:307-355 (table bank_account_items) |
| Server asks Plaid for accounts and pages of transactions for the date range, then sums spending, income, categories and months. | outside service | bank-accounts.ts:862-911; finance-overview-service.ts:119-145 |
| To link: the server creates a Plaid link token; the browser loads Plaid Link from cdn.plaid.com; the person signs in to the bank in Plaid's window. | outside service | bank-accounts.ts:167-181; plaid-link.ts:69-88,135-146; plaid-config.ts:32 |
| The browser posts the public token; the server exchanges it at Plaid, seals the access token, stores the item, and records the connector grant. | our servers | exchange/route.ts:53-70; bank-accounts.ts:433-454 |
| In chat, when the connector is released, connected and not denied, the two bank tool definitions join the turn; a model call runs the tool, which asks Plaid live and returns fenced JSON. | our servers | user-connector-tools.ts:2478-2485,2824-2829; bank-accounts.ts:790-826 |
| Mobile hosted link (flag off): server asks Plaid for a hosted link URL and stores a pending authorization; the exchange call checks the session and answers 409 'not_finished' text when no bank was added. | our servers | bank-accounts.ts:186-253; exchange/route.ts:58-67 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Bank item: sealed Plaid access token, Plaid item id, institution name, excluded account ids | table public.bank_account_items in the server database, row-level security by user | Not synced to devices; read by our servers on each request | Deleted on bank removal, disconnect or account erasure (Plaid item removed first); included in data export (migration 0350; account-erasure.ts:99,1044; apps/web/app/api/user/export/route.ts:2202) |
| Connector grant for bank-accounts (marker that the connector is connected) | connector OAuth grant store (apps/web/lib/connectors/oauth-store.ts) | Server only | Revoked when the last bank is removed (bank-accounts.ts:491-492) |
| Balances, transactions and category totals | Not stored by us; fetched live from Plaid for each request | No | The tool result stays in the chat transcript if a chat used it [inferred from tool results entering the conversation]; past chats are not changed on removal (LinkedBanks.tsx:88-89) |
| Audit events connector_authorization_started, connector_added, connector_setting_changed, connector_removed | security audit log (apps/web/lib/security-audit) | Server only | unknown retention |

**Models and providers.** Page and linking use no model. The chat tools are offered to whichever model serves the turn through the shared tool loop; no model or provider rule is specific to them (user-connector-tools.ts:2478-2485). Plaid is the data provider and sits outside packages/ai/providers. Tools are skipped for a model whose capability 'tools' is false (route.ts:~812-815) [inferred from the guard comment].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in with an active account; confirmed email required to link (overview/route.ts:21-22; connector-policy-gate.ts:155-158). |
| Permissions | Workspace connector policy can block bank-accounts at link time (link/route.ts:42-50; tests link route test 177-198). Linking is refused inside no organisation rule specifically beyond that policy. Bank rows are per user with row-level security (0350 migration). |
| Subscription | Connectors capability, paid tiers only: basic, pro, max, max_15x, team, team_premium, enterprise (billing-catalog.ts:351; connector-policy-gate.ts:179-186). Overview and items reads do not check the plan (overview/route.ts:20-36). |
| Limits and metering | Rate limit bucket 'chat-conversation' for link, exchange and items; 'finance-overview' per user for the overview (link/route.ts:28,33; overview/route.ts:23). Up to 20 account ids and 500 transactions per tool call; overview reads at most 2,000 transactions (bank-accounts.ts:51-53,828-829). Plaid bills the balance call per use (doc: docs/development/connectors-setup.md:610-615). No credit or quota counter found in the code for this feature. |
| Feature flags | Connector release state (connector-release.ts:14), env PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, kill switch canUseConnectors read by connectorsAllowedWithoutRequest (connector-capability.ts:29-93), mobile FEATURES.bankLinking false. |
| Model compatibility | Any model that can call tools; models flagged without tools get none. No model identifier is named in the code for this feature. |
| Provider restrictions | Plaid is required; US institutions only (plaid-config PLAID_COUNTRY_CODES US in bank-accounts.ts:42). Mobile-started turns never get bank tools (plaid-config.ts:13-19). |
| Local mode | Not available. Linking and reading need our servers and Plaid; no on-device path exists in the code. Own-key mode: unknown (not examined). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Loading your finances'; request is aborted on period change | FinanceDashboard.tsx:332-349,387-391 |
| Empty (nothing linked) | Notice with link to connections; LinkedBanks says 'No banks linked yet.' | FinanceDashboard.tsx:100-106; LinkedBanks.tsx:119-121 |
| Bank preparing | Plaid PRODUCT_NOT_READY becomes 'preparing' notice; tool tells model to try later | bank-accounts.ts:903-905,807-813 |
| Bank needs re-login | ITEM_LOGIN_REQUIRED becomes 'reconnect'; per-bank status 'reconnect' text | bank-accounts.ts:906-908,564-567; LinkedBanks.tsx:138-141 |
| Bank did not answer | Per-bank 'unavailable' text; the listing is not shown as empty | LinkedBanks.tsx:142-145; LinkedBanks.test.tsx:25 |
| Error | Other Plaid failures throw a 502 user-safe error; the page shows the load-failed notice | bank-accounts.ts:92-104; FinanceDashboard.tsx:344-347 |
| Timeout | Each Plaid call has a 20 second deadline and refuses redirects | bank-accounts.ts:45,127-133 |
| Cancel | Closing Plaid Link without error returns null and nothing is saved | plaid-link.ts:125-129,145 |
| Retry | Removal failure keeps the bank and says 'The bank could not be removed right now. Try again in a few minutes.'; Plaid script load failure allows retry | bank-accounts.ts:50,273-285; plaid-link.ts:83-86 |
| Truncated data | Totals note appears when fewer rows were read than exist | finance-overview-service.ts:143; FinanceDashboard.tsx:317-321 |
| Offline | not handled in the code beyond the generic load-failed notice | FinanceDashboard.tsx:344-347 |
| Accessibility | role=status notices, aria-pressed period buttons, labelled sections, table headers with scope, 36 pixel minimum targets | FinanceDashboard.tsx:74-83,367-374,223 |
| App differences | Mobile: hidden and server-blocked. Desktop: same hosted page. Chrome, CLI, VS Code: none | v1FeatureFlags.ts:30; plaid-config.ts:15 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/bank-accounts.test.ts`: Removal rules, carried-over links, legacy id, exclusions, newest-transaction window across banks, rollback when a new item cannot be recorded
- `apps/web/lib/connectors/plaid-surface.test.ts`: Bank tools blocked on mobile, allowed on web and desktop
- `apps/web/app/api/connectors/bank-accounts/link/__tests__/route.test.ts`: CSRF, sign-in, 503 when not configured, region refusal, workspace policy refusal, token creation and audit
- `apps/web/app/api/connectors/bank-accounts/exchange/__tests__/route.test.ts`: Same refusals, missing token, connect and audit, null institution
- `apps/web/app/api/connectors/bank-accounts/items/__tests__/route.test.ts`: Lists banks; empty list when not set up
- `apps/web/app/api/connectors/bank-accounts/items/[itemId]/__tests__/route.test.ts`: Remove one bank, not-found, exclusion save, unknown account refusal, legacy id, bad id
- `apps/web/app/api/finance/overview/__tests__/route.test.ts`: 401, suspended account, rate limit, bad period, unavailable, default 30d
- `apps/web/features/finance/components/LinkedBanks.test.tsx`: Empty only after a successful listing; unavailable listing not shown as empty
- `packages/contracts/types/src/__tests__/connector-release.test.ts`: Bank-accounts is not released
- `apps/web/e2e/signed-in-page-routes.spec.ts`: /chat/finance shows three period buttons (lines 80-89)

**Test scenarios**

- **Empty state**
  1. Sign in as a paid account with no bank
  2. Open /chat/finance
  - Expected: Notice 'Connect a bank account to see your balances and spending here.' with the connect link, or the setup message if Plaid is not configured
- **Release refusal**
  1. Configure Plaid sandbox variables
  2. Sign in as a paid US account
  3. POST /api/connectors/bank-accounts/link
  - Expected: Refusal 'Connectors are coming soon.' while the release state is unchanged
- **Link and read (needs release state changed in a test build)**
  1. Set sandbox variables and release bank-accounts in a test build
  2. Link a Plaid test bank
  3. Open /chat/finance, switch periods
  - Expected: Accounts, totals, categories and recent transactions appear for each period
- **Exclude an account**
  1. Untick one account in Linked banks
  2. Reload the page
  3. Ask chat for balances
  - Expected: The account is absent from totals and from the tool answer
- **Remove a bank**
  1. Click Remove bank
  2. Read the confirmation
  3. Confirm
  - Expected: Bank disappears, Plaid item removal is called, chat no longer sees it
- **Mobile exclusion**
  1. Start a chat turn from the mobile app with a bank linked on web
  2. Ask for balances
  - Expected: No bank tool is offered

**Where to look when it fails**

- Log lines '[bank-accounts] the Plaid request was refused', '[bank-accounts] Plaid refused the request' (with plaidCode), '[bank-accounts] a stored bank link could not be opened', '[connector-policy] ...' in bank-accounts.ts and connector-policy-gate.ts
- Error name PlaidApiError (502) and Plaid codes PRODUCT_NOT_READY, ITEM_LOGIN_REQUIRED, ITEM_NOT_FOUND, INVALID_ACCESS_TOKEN
- Table public.bank_account_items; audit events connector_added and connector_removed
- Setup status: describeConnectorSetup (apps/web/lib/connectors/oauth-setup.ts:139-150) and the optional feature entry bank_accounts

**Hands-on test plans**

- Web: [70-qa/test-plans/web/108-specialist-workspaces.md](../../70-qa/test-plans/web/108-specialist-workspaces.md)
- Desktop: [70-qa/test-plans/desktop/108-specialist-workspaces.md](../../70-qa/test-plans/desktop/108-specialist-workspaces.md)
- Mobile: [70-qa/test-plans/mobile/108-specialist-workspaces.md](../../70-qa/test-plans/mobile/108-specialist-workspaces.md)

## 10. Gaps and dependencies

- **Linking and bank chat tools are refused by the connector release state** Affects: Web and Desktop, all users. Evidence: connector-release.ts:14-30; connector-policy-gate.ts:147-154; user-connector-tools.ts:2478-2485. Work needed: Owner steps (Plaid agreement, production access, compliance, legal review, env) then add bank-accounts to the released list or release connectors
- **Overview and items reads skip plan, region and release checks** Affects: Web and Desktop users with already linked banks. Evidence: overview/route.ts:20-36; items/route.ts:14-22. Work needed: Apply the connector policy gate or document the intent
- **No rail or Settings entry for Finances** Affects: Web and Desktop. Evidence: app-nav-items.ts:90-170 has no finance item. Work needed: Add an entry once released
- **Mobile has no finance view and linking is flagged off** Affects: Mobile. Evidence: v1FeatureFlags.ts:30; plaid-config.ts:15; docs: audit/registers/mobile-store-feature-justification.md (C9 row). Work needed: Store declarations and a mobile finance screen, if wanted
- **Setup doc says re-linking replaces the old bank** Affects: Engineers and testers. Evidence: docs/development/connectors-setup.md:597-632 versus bank-accounts.ts:433-454. Work needed: Correct the doc
- **Chrome extension has no finance feature** Affects: Chrome. Evidence: brief S108.01; no matches in apps/extension. Work needed: Decide whether Chrome needs it
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- plan:basic
- plan:pro
- plan:max
- plan:max_15x
- plan:team
- plan:team_premium
- plan:enterprise
- file:apps/web/lib/connectors/bank-accounts.ts
- file:apps/web/lib/connectors/plaid-config.ts
- api:GET /api/finance/overview
- api:POST /api/connectors/bank-accounts/link
- api:POST /api/connectors/bank-accounts/exchange
- api:GET /api/connectors/bank-accounts/items
- table:bank_account_items
- SYS-subscriptions-entitlements-and-usage
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-data-model-and-migrations
- SYS-chat-turn-pipeline

## Unknown

- Whether Plaid production access, agreement and legal review are done (owner items; brief only).
- Whether production has the three Plaid variables set.
- Retention period of audit events.
- Own-key mode behaviour for the bank tools: not examined.
- Whether Desktop (hosted web) adds any bank rule of its own: not examined in apps/desktop/electron.
- Which table holds the connector grant row: not opened (oauth-store.ts).
