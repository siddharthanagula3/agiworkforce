---
id: "F055-05"
type: "feature"
title: "Account name, identity and granted permissions"
aliases: ["Connected account", "Account name", "Account identity", "Permissions granted", "Granted permissions", "Granted access", "Account label", "S55.13", "S55.14", "S55.17"]
area: "55 Connector setup and account management"
available_on: ["web", "desktop", "mobile", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "partial", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S55.13", "S55.14", "S55.17"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:cli", "mode:cloud", "F055-03", "SYS-authentication-and-identity", "SYS-connectors-plugins-and-skills", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "table:connector_oauth_grants"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F055-05 Account name, identity and granted permissions

After connecting, shows which account the connector is signed in as (the email, login or UPN from the provider's sign-in token) and which permissions were granted, in plain sentences with Read or Write marks. Shown on Web, Desktop and Mobile; VS Code shows scopes in a tooltip; CLI shows neither. If the provider gives no name, a note says so.

Area: [55. Connector setup and account management](README.md). Requirement items: [S55.13](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5513), [S55.14](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5514), [S55.17](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5517).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Reads the account label saved at connection time and the granted scopes saved with the grant, and shows them on the connector page. (apps/web/features/connectors/components/ConnectorAccountSummary.tsx; ConnectorScopeList.tsx:84-108)

**Why it exists.** A person with several work and personal logins needs to know which one the assistant uses, and what it may do. Brief S55.13, S55.14 and S55.17 state this. The owner decided to show the account only where the sign-in returns it and to allow one account per connector (doc: docs/decisions/2026-09-27-founder-decisions.md:90-93,145-150).

**Who uses it.** Any signed-in person with a connected connector; support staff diagnosing wrong-account problems.

**Problems it solves**

- Wrong account connected: the label shows the email or login. (apps/web/lib/connectors/accounts.ts:9-31)
- Unknown access: granted scopes are listed in plain words. (apps/web/lib/connectors/scope-descriptions.ts)
- Honesty when unknown: 'The provider did not share the account name.' (ConnectorAccountSummary.tsx:27)

**Use cases**

- Check that Gmail is linked to the work address.
- See that a connector got write access to a drive.
- Confirm after a reconnect that the same account is used.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Connectors, open a connected connector; sections 'Connected account' and 'Permissions granted' (useConnectorsSettingsAdapter.tsx:1170-1262).
- Mobile: Settings, Connectors, open a connected row; row 'Account' and section 'Granted access' (ConnectorAccountSummary.tsx; ConnectorDetailScreen.tsx:895-925).
- VS Code: hover a connector in the Connectors tree; lines 'Can make changes', 'Can read only', 'Other access' (connectorPresentation.ts:50-70).
- CLI: not shown (cloud/connectors.rs:176-215 prints name, state, health only).
- Chrome: not covered.

**Before you start**

- Connector is connected through OAuth (labels come from the sign-in token).
- Signed in.

**Screens and controls**

- Web heading 'Connected account' with one line per account, 'Needs reconnecting' mark, spinner text 'Reading the connected account', retry link.
- Web 'Permissions granted' list: sentence per scope with badge Read or Write.
- Mobile 'Account' row; when needing reauthorization the value is '<label> - Needs reconnecting'.
- Mobile 'Granted access' group, or a raw 'Granted access' row with scopes joined by commas when no sentences exist.

**Journey**

1. Connect a connector (F055-03).
2. Open its page.
3. Read the account line.
4. Read the granted permission list; compare with 'Permissions requested' seen before connecting.

**What the person sees and gets**

- Account label text (email, preferred username or UPN).
- 'The provider did not share the account name.' when no label (Web and Mobile).
- 'The connected account could not be read.' with Retry on Web; 'Could not be read. Tap to retry.' on Mobile (ConnectorAccountSummary.tsx:25; mobile ConnectorAccountSummary.tsx:12).

**Settings**

- Enable or disable the connector for this account (switch) is separate (renderAccountSwitch).
- Domain or workspace name is not shown anywhere in the code read.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Account label derived from the id token claims email, preferred_username, upn in that order, trimmed and cut at 200 characters. (apps/web/lib/connectors/accounts.ts:9-31)
- Label saved at code exchange, for registered providers and discovered MCP servers; an older label is kept when a new grant has none. (oauth-client.ts:154-160; mcp-discovery.ts:370; oauth-store.ts:325)
- GET /api/connectors/{id}/accounts lists accounts with label, scopes, needsReauthorization. (apps/web/app/api/connectors/[connectorId]/accounts/route.ts:36-47; oauth-store.ts:620-635)
- /api/connectors rows carry scopes and grantedPermissions sentences. (apps/web/app/api/connectors/route.ts:309-318)
- Web granted-scope list with Read and Write badges. (ConnectorScopeList.tsx:84-108)
- Mobile Account row and Granted access section. (mobile ConnectorAccountSummary.tsx; ConnectorDetailScreen.tsx:895-925)
- VS Code scope tooltip. (connectorPresentation.ts:50-60)

**Incomplete**

- Domain or workspace of the account is not displayed; the stored account_scope (default 'personal') is not shown. (oauth-store.ts:325-345; ConnectorAccountSummary.tsx:16-19)
- Where a provider omits the scope field, the 'granted' list falls back to the requested scopes, so it may show what was asked, not what was granted. (oauth-client.ts:157)
- The brief marks Mobile name and identity as missing; the code has the Account row. Code wins.

**Present but disconnected or switched off**

- Account label cannot appear while connection is blocked by the release constant for most connectors. (connector-release.ts:14-30)

**Not available**

- CLI: no account label or scopes in agi connectors output. (cloud/connectors.rs:176-215)
- VS Code: no account name, only scopes. (connectorPresentation.ts:62-70)
- Providers without OIDC id tokens give no label; the owner accepted this (founder decisions:145-150).

## 4. Required behaviour

**Established requirements**

- Each connected account shows a human-readable name. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.13)
- A connected account shows the identity (email or login) and domain or workspace. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.14)
- After connecting, the user sees which scopes were actually granted. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.17)
- Show the connected account only where sign-in returns it; one account per connector. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:90-93,145-150)

**Acceptance criteria**

1. Connect a Google-style OIDC connector: the page shows the email as the account.
2. Connect a provider that returns no identity: the page shows 'The provider did not share the account name.', not an invented name.
3. The Permissions granted list matches the scope returned by the provider after consent.
4. After disconnecting, the Connected account section disappears.
5. A grant with an expired token and no refresh token shows 'Needs reconnecting' beside the label.
6. On Mobile, the Account row shows the same label as Web for the same connector.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The id token payload is decoded without signature check; this is acceptable only because the value is display text, not an authorization decision. (accounts.ts:14-30)
- [inferred] Domain display was left out because the owner limited the feature to what sign-in returns.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the email domain next to the label for work accounts.
- [proposed] Mark the granted list as 'requested' when the provider returned no scope field.
- [proposed] Show the account on CLI in agi connectors.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | accountLabelFromIdToken | `apps/web/lib/connectors/accounts.ts` | Derives the label from id token claims. |
| service | oauth-client | `apps/web/lib/connectors/oauth-client.ts` | Returns accountLabel from the token response. |
| service | mcp-discovery completion | `apps/web/lib/connectors/mcp-discovery.ts` | Same for discovered servers. |
| service | oauth-store | `apps/web/lib/connectors/oauth-store.ts` | Writes label and scopes; lists accounts. |
| endpoint | api:GET /api/connectors/{connectorId}/accounts | `apps/web/app/api/connectors/[connectorId]/accounts/route.ts` | Lists connected accounts. |
| endpoint | api:GET /api/connectors | `apps/web/app/api/connectors/route.ts` | Returns scopes and grantedPermissions per row. |
| service | scope-descriptions | `apps/web/lib/connectors/scope-descriptions.ts` | Plain sentences and read or write class. |
| component | ConnectorAccountSummary (Web) | `apps/web/features/connectors/components/ConnectorAccountSummary.tsx` | Account section. |
| component | ConnectorGrantedScopeList | `apps/web/features/connectors/components/ConnectorScopeList.tsx` | Permissions granted list. |
| component | ConnectorAccountRows (Mobile) | `apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx` | Account row. |
| screen | ConnectorDetailScreen | `apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx` | Granted access section. |
| service | VS Code presentation | `apps/extension-vscode/src/features/connectors/connectorPresentation.ts` | Scope tooltip lines. |
| schema | ConnectorAccountSchema | `packages/contracts/cloud-contracts/src/connectors.ts` | Contract for accounts (accountKey, accountLabel, scope, isDefault). |
| table | table:connector_oauth_grants | `apps/web/db/neon/0253_connector_accounts.sql` | Columns account_key, account_label, account_scope, is_default. |
| service | fetchConnectorAccounts (Mobile) | `apps/mobile/services/connectors.ts` | Reads the accounts endpoint. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| At code exchange the provider returns tokens and, if requested, an id token. | outside service | oauth-client.ts:150-160 |
| Server decodes the id token payload and picks the first present of email, preferred_username, upn. | our servers | accounts.ts:14-30 |
| Server stores label and granted scopes in the grant row. | our servers | oauth-store.ts:300-345 |
| Client reads /api/connectors/{id}/accounts and the scopes on the list row. | device and our servers | ConnectorAccountSummary.tsx:36-47; route.ts:309-318 |
| Client shows label or the unnamed note; scope sentences come from scope descriptions. | device | ConnectorAccountSummary.tsx:112-117 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Account label and key, account scope, default flag | table connector_oauth_grants | Server; shared by all apps of the person | Tokens are cleared on revoke; whether the label row is kept as revoked was not traced |
| Granted scopes | connector_oauth_grants.granted_scopes | Server | Replaced on reconnect |

**Models and providers.** No language model. Identity comes from the provider's own sign-in token.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; only the owner's accounts are listed (query by user id, oauth-store.ts:595-605). |
| Permissions | Personal; no admin role. |
| Subscription | Same connectors capability as F055-01; no extra rule found. |
| Limits and metering | Rate bucket chat-conversation on the accounts route; none else. |
| Feature flags | none found beyond the release constant. |
| Model compatibility | none found in the code. |
| Provider restrictions | Label appears only if the provider returns an id token containing a supported claim. |
| Local mode | Not applicable: data comes from the cloud account. Mobile Local mode hides the screen. CLI MCP login keeps its token on the device with no label display found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web spinner 'Reading the connected account'; Mobile row text same. | ConnectorAccountSummary.tsx:26,95-100; mobile ConnectorAccountSummary.tsx:10 |
| No accounts | Web section is hidden (returns null). | ConnectorAccountSummary.tsx:84 |
| Error | Message plus Retry on Web; tappable retry row on Mobile. | ConnectorAccountSummary.tsx:101-112 |
| No identity | Unnamed note shown, never a guess. | ConnectorAccountSummary.tsx:27,128 |
| Needs reconnecting | Red 'Needs reconnecting' text beside the label. | ConnectorAccountSummary.tsx:129-131 |
| Multiple accounts | The list renders every row, but the product decision is one account; the grant table keys by account key and default flag. | ConnectorAccountSummary.tsx:117; oauth-store.ts:300-340; founder decisions:90-93 |
| Malformed token | Label becomes null on parse failure. | accounts.ts:19-24 |
| Accessibility | Section labelled by its heading id; badges are text. | ConnectorAccountSummary.tsx:92 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/connectors/[connectorId]/accounts/route.test.ts`: Accounts route (by file name).
- `apps/web/lib/connectors/__tests__/oauth-store.test.ts`: Grant store (by file name; accounts coverage not confirmed).
- `packages/contracts/cloud-contracts/src/__tests__/connector-scopes.test.ts`: Scope contract (by file name).
- `apps/web/lib/connectors/__tests__/scope-descriptions.completeness.test.ts`: Scope sentences (by file name).
- `apps/extension-vscode/src/__tests__/connectorsView.test.ts`: VS Code connector view (by file name).
- `apps/mobile/__tests__/ConnectorDetail.test.tsx`: Mobile detail (by file name).

**Test scenarios**

- **OIDC connector label**
  1. Connect a provider that returns an id token.
  2. Open the connector page.
  - Expected: Account line shows the email.
- **No identity**
  1. Connect a provider that returns no id token.
  - Expected: 'The provider did not share the account name.'
- **Granted scopes**
  1. Connect and approve fewer scopes than requested if the provider allows.
  - Expected: Permissions granted shows only what was returned.
- **Expired grant**
  1. Use a grant with expired access token and no refresh token.
  - Expected: Needs reconnecting mark beside the label.
- **Mobile parity**
  1. Open the same connector on Mobile.
  - Expected: Account row and Granted access match Web.

**Where to look when it fails**

- Table connector_oauth_grants columns account_label and granted_scopes.
- GET /api/connectors/{id}/accounts response.
- accountLabelFromIdToken returns null for tokens without email, preferred_username or upn.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/055-connector-setup-and-account-management.md](../../70-qa/test-plans/web/055-connector-setup-and-account-management.md)
- Desktop: [70-qa/test-plans/desktop/055-connector-setup-and-account-management.md](../../70-qa/test-plans/desktop/055-connector-setup-and-account-management.md)
- Mobile: [70-qa/test-plans/mobile/055-connector-setup-and-account-management.md](../../70-qa/test-plans/mobile/055-connector-setup-and-account-management.md)
- VS Code: [70-qa/test-plans/vscode/055-connector-setup-and-account-management.md](../../70-qa/test-plans/vscode/055-connector-setup-and-account-management.md)

## 10. Gaps and dependencies

- **Domain or workspace is not shown (S55.14).** Affects: Web, Desktop, Mobile. Evidence: ConnectorAccountSummary.tsx:16-19. Work needed: Show the domain from the email or accept the owner decision to show only what sign-in returns.
- **Granted list may show requested scopes when the provider returns none.** Affects: All apps with OAuth. Evidence: oauth-client.ts:157. Work needed: Label as requested or fetch actual grants.
- **CLI shows no account or scopes.** Affects: CLI. Evidence: cloud/connectors.rs:176-215. Work needed: Add fields to the list output.
- **Brief out of date for Mobile.** Affects: Testers. Evidence: mobile ConnectorAccountSummary.tsx. Work needed: Update brief.
- **Code keeps multi-account storage while the decision is one account.** Affects: Design clarity. Evidence: oauth-store.ts:300-340. Work needed: Confirm intended or remove.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:cli
- mode:cloud
- F055-03
- SYS-authentication-and-identity
- SYS-connectors-plugins-and-skills
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- table:connector_oauth_grants

## Unknown

- Which providers return an id token with a supported claim in production.
- Whether a revoked grant row keeps its account label.
- Whether the Tauri internal desktop shows account labels.
- Test contents; files not opened.
