---
id: "F055-12"
type: "feature"
title: "Not built or not applicable"
aliases: ["Not built or not applicable", "Service accounts (S55.10)", "Multiple accounts per connector (S55.12)", "Default account (S55.15)", "Per-task account choice (S55.16)", "Last sync time (S55.19)", "Sync-source choice (S55.24)", "Organization approval flow (S55.31)"]
area: "55 Connector setup and account management"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S55.10", "S55.12", "S55.15", "S55.16", "S55.19", "S55.24", "S55.31"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-authorization-and-workspaces", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-sync-and-continuity", "SYS-subscriptions-entitlements-and-usage", "F055-07", "surface:web", "surface:mobile", "mode:cloud", "table:connector_oauth_grants", "api:GET /api/connectors/[connectorId]/accounts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F055-12 Not built or not applicable

Seven items from the connector area are not offered to people: service-account sign-in, several accounts for one connector, a default account, choosing an account per task, last-sync time, choosing sync sources, and a member-request and admin-approval flow. Storage already has account keys and a default flag, but no screen or route uses them.

Area: [55. Connector setup and account management](README.md). Requirement items: [S55.10](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5510), [S55.12](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5512), [S55.15](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5515), [S55.16](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5516), [S55.19](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5519), [S55.24](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5524), [S55.31](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5531).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Records what is missing or not applicable so nobody assumes it works. The one real building block is the account key and default flag on connector grants (apps/web/db/neon/0253_connector_accounts.sql).

**Why it exists.** The product requirement lists multiple connected identities, but the brief marks several items as not applicable. Engineers and testers need the true state.

**Who uses it.** Engineers planning work, testers writing expectations, LLM answers about what the product does.

**Problems it solves**

- Prevents claiming multi-account support that the connect path does not provide.
- Explains why there is no last-sync time: connectors are request-scoped, not synced.

**Use cases**

- A tester checks that connecting a second Google account replaces the first.
- An engineer plans per-task account choice using the stored account keys.
- A support person explains why there is no sync status.

## 2. User experience

**Where to find it**

- Not available to people on any app.
- Read-only trace: web connector detail shows a 'Connected account' row with the account label (apps/web/features/connectors/components/ConnectorAccountSummary.tsx:26-32); Mobile shows an 'Account' row (apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx:28-60).
- Web 'Recent calls' list shows when a connector was called, which is a partial stand-in for last used (apps/web/features/connectors/components/ConnectorCallLog.tsx:30-37).

**Before you start**

- A connected OAuth connector for the account rows.

**Screens and controls**

- No control to add a second account, mark a default, pick an account for a task, choose sync sources or request approval.
- Each account row reads 'The provider did not share the account name.' when no label exists, and 'Needs reconnecting' when the grant expired (ConnectorAccountSummary.tsx:28-31).

**Journey**

1. Connect an OAuth connector; the provider's identity (for example an email) is saved as the account label if the provider sends it.
2. Connecting again for the same connector replaces the single default account.

**What the person sees and gets**

- Account label and reconnect flag only.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Account label is read from the identity token (email, preferred_username or upn) and shown (apps/web/lib/connectors/accounts.ts:15-34; apps/web/lib/connectors/finish-authorization.ts:184).
- The accounts endpoint lists accounts of a connector with label and reauthorization flag (apps/web/app/api/connectors/[connectorId]/accounts/route.ts:36-42).
- Storage supports many accounts: unique key (user, connector, account key), account label, account scope and is_default (apps/web/db/neon/0253_connector_accounts.sql; apps/web/lib/connectors/oauth-store.ts:300-345).
- Recent calls log exists for each connector (apps/web/features/connectors/components/ConnectorCallLog.tsx).

**Incomplete**

- Authorization completion passes only accountLabel, never an account key or default flag, so the default key is always used and a second authorization overwrites the first [inferred from apps/web/lib/connectors/finish-authorization.ts:184 and oauth-store.ts:318-330].
- Disconnect and tool resolution accept an optional account key, but no caller supplies one (apps/web/lib/connectors/oauth-access.ts:444, apps/web/app/api/connectors/route.ts:880).

**Present but disconnected or switched off**

- Multi-account storage, the is_default column and account-scoped store functions exist but are not reachable from any screen or route found (migration 0253).

**Not available**

- Service-account sign-in (S55.10): not applicable in the brief; no code found.
- Multiple accounts per connector (S55.12), default account (S55.15), per-task account choice (S55.16): not offered on any app.
- Last synchronization time (S55.19): not applicable; connectors are request-scoped and nothing syncs in the background (doc: audit/registers/ui-gaps.csv GAP-048).
- Sync-source selection (S55.24): not offered; no background sync exists, same evidence.
- Organization approval flow (S55.31): no member request or admin approval found; organization admins can share a connector (apps/web/app/workspace/sharing/page.tsx, brief S55.11) and workspace policy can block one (apps/web/app/api/connectors/oauth/start/route.ts:268-272).

## 4. Required behaviour

**Established requirements**

- Service-account authorization, multiple accounts, default account, last-sync time and approval requests are not applicable; per-task account choice and sync-source choice are missing in every app. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.10, S55.12, S55.15, S55.16, S55.19, S55.24, S55.31)
- A supported provider may have multiple OAuth accounts; the UI identifies the selected connection, and revocation, policy changes and account switching converge on every Cloud surface. (source: doc: docs/product/experience-contract.md line 36-38)
- Connectors on the web are request-scoped tools; nothing scans a connector in the background. (source: doc: audit/registers/ui-gaps.csv GAP-048)

**Acceptance criteria**

1. No screen offers a second account, default account, per-task account choice, sync sources or an approval request.
2. Connecting the same connector twice leaves one account row (current behaviour to confirm).
3. Account rows show the provider label when available.
4. No UI shows a last-sync time.
5. Recent calls show call times for a connector.
6. If multi-account is later built, the UI names the selected account and disconnect removes only the chosen one.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's 'not applicable' for multiple accounts conflicts with the product requirement for multiple identities; the requirement is established, the brief reflects current state [inferred].
- Last-sync time has no meaning while nothing syncs [inferred from GAP-048].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass an account key from authorization so a second account is stored beside the first.
- [proposed] Show 'Last used' from the call log on the connector page instead of a sync time.
- [proposed] Add a member request and admin approval flow only with workspace policy support.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | connector accounts migration | `apps/web/db/neon/0253_connector_accounts.sql` | account_key, account_label, account_scope, is_default on grants. |
| store | oauth-store account functions | `apps/web/lib/connectors/oauth-store.ts` | listConnectorAccounts, account-scoped capture and revoke, write grant (lines 300-345, 495-540). |
| service | account key helpers | `apps/web/lib/connectors/accounts.ts` | Default key, normalisation, label from identity token. |
| service | finish authorization | `apps/web/lib/connectors/finish-authorization.ts` | Line 184 passes accountLabel only. |
| endpoint | GET /api/connectors/[connectorId]/accounts | `apps/web/app/api/connectors/[connectorId]/accounts/route.ts` | Lists accounts. |
| component | ConnectorAccountSummary (web) | `apps/web/features/connectors/components/ConnectorAccountSummary.tsx` | 'Connected account' heading and rows. |
| component | ConnectorAccountRows (mobile) | `apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx` | 'Account' rows with retry. |
| component | ConnectorCallLog | `apps/web/features/connectors/components/ConnectorCallLog.tsx` | 'Recent calls' list with time and outcome. |
| endpoint | /api/connectors/calls | `apps/web/app/api/connectors/calls/route.ts` | Call log read (CONNECTOR_CALLS_PATH). |
| component | OrganizationSharingSection | `apps/web/features/settings/sections/OrganizationSharingSection.tsx` | Admin shares connectors with members (brief S55.11). |
| service | connector policy | `apps/web/lib/services/connector-policy-service.ts` | Workspace policy that can block a connector (used at oauth/start/route.ts:259-272). |
| table | connector_oauth_grants | `apps/web/db/neon/0097_connector_oauth_broker.sql` | Holds account rows. |
| table | connector_oauth_authorizations | `apps/web/db/neon/0253_connector_accounts.sql` | Pending authorizations get an account key column too (line 73). |
| test | oauth-store tests | `apps/web/lib/connectors/__tests__/oauth-store.test.ts` | Grant store behaviour. |
| test | mobile account rows test | `apps/mobile/__tests__/ConnectorDetail.test.tsx` | Account rows, reconnect marker, retry (lines 424-446). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person finishes authorization at the provider; the server writes a grant with the default account key and the label from the identity token. | our servers | apps/web/lib/connectors/finish-authorization.ts:184; apps/web/lib/connectors/oauth-store.ts:300-345 |
| A later authorization for the same connector upserts the same default row. | our servers | oauth-store.ts:318-330 on conflict (user_id, connector_id, account_key) |
| The detail page reads the accounts endpoint and shows label and reconnect flag. | device and our servers | apps/web/features/connectors/components/ConnectorAccountSummary.tsx:26-60 |
| Call outcomes are logged and shown as Recent calls; arguments and results are not recorded. | our servers | ConnectorCallLog.tsx:33-37 (explanation text) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Account key, label, scope, default flag | table connector_oauth_grants | Account level | Soft-revoked on disconnect |
| Call log entries | connector calls store behind /api/connectors/calls (table not opened) | Account level | not established |

**Models and providers.** No model or AI provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. |
| Permissions | Per-user rows; organization sharing is admin controlled. |
| Subscription | Connectors capability: plan:basic, plan:pro, plan:max, plan:max_15x, plan:team, plan:team_premium, plan:enterprise (billing-catalog.ts:332-351). |
| Limits and metering | none found in the code for these items. |
| Feature flags | coming_soon release state with 13 released ids. |
| Model compatibility | none found in the code |
| Provider restrictions | Account label depends on the provider sharing an identity claim; otherwise 'The provider did not share the account name.' |
| Local mode | Account connectors are Cloud only; nothing here applies in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Provider shares no identity | Row text 'The provider did not share the account name.' | ConnectorAccountSummary.tsx:30 |
| Accounts load fails | Web: 'The connected account could not be read.'; Mobile: 'Could not be read. Tap to retry.' | ConnectorAccountSummary.tsx:29; mobile ConnectorAccountSummary.tsx:10 |
| Grant expired | 'Needs reconnecting' on the row. | ConnectorAccountSummary.tsx:31 |
| Second account authorized | Replaces the first (inferred from the upsert key). | oauth-store.ts:318-330 |
| Empty call log | 'This connector has not been called yet, so there is nothing to show.' | ConnectorCallLog.tsx:35 |
| Offline, cancel, timeout | not handled in the code for these unavailable items | searched |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/oauth-store.test.ts`: Grant store including account scoping.
- `apps/web/lib/connectors/__tests__/oauth-access.test.ts`: Disconnect of one named account (line 491).
- `apps/web/features/connectors/components/__tests__/ConnectorCallLog.test.tsx`: Recent calls list.
- `apps/mobile/__tests__/ConnectorDetail.test.tsx`: Account rows and reconnect marker.

**Test scenarios**

- **Second account**
  1. Connect a Google connector with account A.
  2. Connect again with account B.
  - Expected: Current code keeps one account row, showing B; confirm in the accounts endpoint.
- **No default control**
  1. Open any connector detail on every app.
  - Expected: No default account, per-task account or sync-source control is shown.
- **Last used**
  1. Call a connector in chat.
  2. Open Tool permissions, Recent calls.
  - Expected: A row with time and outcome appears.
- **Organization request**
  1. As a member, look for a way to request a connector.
  - Expected: None exists.

**Where to look when it fails**

- Table connector_oauth_grants (account_key, account_label, is_default).
- Endpoint GET /api/connectors/[connectorId]/accounts.
- Endpoint /api/connectors/calls.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Product requires multiple connected identities; connect path stores one account per connector.** Affects: All Cloud surfaces. Evidence: docs/product/experience-contract.md:36-38; apps/web/lib/connectors/finish-authorization.ts:184. Work needed: Pass account keys at authorization, add selection UI, scope disconnect and tool calls.
- **Storage layer exists but is disconnected from any control.** Affects: Engineering. Evidence: migration 0253; no route supplies an account key. Work needed: Wire or remove.
- **No per-task account choice.** Affects: All apps. Evidence: brief S55.16. Work needed: Design after multi-account.
- **No organization approval request flow.** Affects: Team and enterprise members. Evidence: searched apps/web connectors and settings organization routes. Work needed: Define the workflow with admins.
- **Brief marks mobile account display as missing, but mobile shows account rows.** Affects: Documentation. Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx:28-60. Work needed: Correct brief items S55.13 and S55.14.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-authorization-and-workspaces
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-sync-and-continuity
- SYS-subscriptions-entitlements-and-usage
- F055-07
- surface:web
- surface:mobile
- mode:cloud
- table:connector_oauth_grants
- api:GET /api/connectors/[connectorId]/accounts

## Unknown

- Whether a second authorization of the same connector really overwrites the first end to end (inferred from code, not run).
- How an organization admin could approve or deny a member request (no flow found).
- Where call log rows are stored (table not opened).
- Whether service-account style credentials appear anywhere for custom connectors (API key path not read for this item).
- Whether tests for the account key helpers exist beyond the files listed.
