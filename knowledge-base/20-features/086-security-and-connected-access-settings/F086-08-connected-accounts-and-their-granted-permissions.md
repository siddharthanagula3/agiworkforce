---
id: "F086-08"
type: "feature"
title: "Connected accounts and their granted permissions"
aliases: ["Connected accounts", "Connectors settings", "Granted connector scopes", "Permissions granted", "S86.12", "S86.13", "connectors list and disconnect"]
area: "86 Security and connected-access settings"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S86.12", "S86.13"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "mode:cloud", "SYS-connectors-plugins-and-skills", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "table:connector_tool_permissions", "table:user_connectors", "table:github_installations", "api:GET /api/connectors", "api:DELETE /api/connectors", "api:GET /api/connectors/[connectorId]/accounts", "F086-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F086-08 Connected accounts and their granted permissions

Shows the third-party accounts connected to AGI and the permissions each one was actually granted, and lets the person disconnect one. Web and Desktop show a granted-permissions list; the phone shows it too; the CLI lists and disconnects but shows no scopes; Chrome shows connectors as coming soon.

Area: [86. Security and connected-access settings](README.md). Requirement items: [S86.12](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8612), [S86.13](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8613).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lists connected connectors from GET /api/connectors, shows granted permission sentences with Read or Write badges, and disconnects through DELETE /api/connectors with vendor-side token revocation and removal of saved tool permissions (apps/web/app/api/connectors/route.ts:272-297, 880-1022).

**Why it exists.** A person must be able to see what AGI can reach in other services and take it back. The product requirement says external connector writes need approval and every connector must know its trust boundary (doc: docs/product/requirements.md sections 4.4, 9.7).

**Who uses it.** Any signed-in person using Managed Cloud connectors on web, Desktop, phone or CLI.

**Problems it solves**

- Not knowing which accounts are linked.
- Not knowing what a link allows.
- Leaving access in place after the need is gone.

**Use cases**

- Open Connectors, pick a connected account, read 'Permissions granted', decide it is too broad, disconnect.
- From the CLI list connectors and disconnect one that needs reconnecting.
- On the phone open a connector detail and read Granted access, then Disconnect.
- Disconnect GitHub and have the GitHub App installation removed too.

## 2. User experience

**Where to find it**

- Web: Settings, Connectors; open a connector to see 'Permissions granted' and a 'Tool permissions' button (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1236-1253; apps/web/features/connectors/components/ConnectorScopeList.tsx:85-110).
- Desktop: the same hosted web Connectors screen; the internal Tauri desktop modal also renders a GrantedPermissions list (apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:878-890) but Tauri is retained internal code (doc: AGENTS.md section 5).
- Phone: Settings connectors, open a connector; rows 'Connected', 'Granted access' and a 'Disconnect' button (apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:895-925, 1177-1203).
- CLI: 'agi connectors' lists; 'agi connectors disconnect <connector>' removes (apps/cli/src/lib.rs:1028, 1275-1279, 7377-7410).
- Chrome: connectors are labelled coming soon in the side panel (apps/extension/src/side_panel.ts:117-118, 15251).

**Before you start**

- Signed in.
- Phone: Cloud mode active; otherwise a banner asks to switch to Cloud (ConnectorDetailScreen.tsx:749-750).
- Phone: the build includes the connectors feature flag (ConnectorDetailScreen.tsx:742-748).
- The connectors capability must not be switched off for the account (apps/web/lib/connectors/connector-capability.ts:31-41; ConnectorDetailScreen.tsx:350-351, 717-720).
- CLI: the connectors capability must be allowed by the cached plan check (apps/cli/src/lib.rs:7378-7382).

**Screens and controls**

- Web connector detail: 'Permissions granted' list, each row a sentence plus a Read or Write badge (ConnectorScopeList.tsx:85-110).
- Before connecting: 'Permissions requested' list (ConnectorScopeList.tsx:33-60).
- Phone: 'Granted access' section with Read/Write labels; a plain scope string row if no sentences exist (ConnectorDetailScreen.tsx:895-925).
- Disconnect button; confirmation alert 'Disconnect <name>?' with text 'This removes the connection and its saved tool permissions from your AGI Cloud account.' (ConnectorDetailScreen.tsx:666-676).
- CLI prompt: 'Disconnect <id> from your account? Its saved sign-in and tool permissions are removed, and every surface loses it until you connect it again.' (apps/cli/src/lib.rs:7389-7396).

**Journey**

1. Open the connectors list.
2. Open one connected account.
3. Read the granted permissions.
4. Press Disconnect and confirm.
5. See 'Disconnected' and, if the vendor did not confirm revocation, a vendor notice telling the person to remove access at the vendor.

**What the person sees and gets**

- Success: connector leaves the list; vendor notice shown when revocation was not confirmed (ConnectorDetailScreen.tsx:688; apps/web/lib/connectors/oauth-access.ts:476-490).
- Failure web: 'Could not disconnect. Try again.' (useConnectorsSettingsAdapter.tsx:1054).
- Failure phone: 'Could not disconnect' / 'The connector is still connected.' (ConnectorDetailScreen.tsx:693).
- GitHub failure: 'The GitHub App is still installed on your account, so nothing was disconnected.' with 502 or 503 (apps/web/app/api/connectors/route.ts:951-967).
- CLI: 'Disconnected <id> from your account.' plus any vendor notice (apps/cli/src/cloud/connectors.rs:140-153).

**Settings**

- Tool permissions per connector (see F086-10).
- Connector health and reconnect states (needsReauthorization) shown beside the connector (apps/web/app/api/connectors/route.ts:277-282).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/connectors lists OAuth, custom, GitHub App and catalog connectors with scopes and grantedPermissions sentences (apps/web/app/api/connectors/route.ts:272-297).
- Web detail shows ConnectorGrantedScopeList from the connection's scopes (useConnectorsSettingsAdapter.tsx:1236-1241).
- Web disconnect calls DELETE /api/connectors?connectorId=... and removes the row, with special paths for GitHub installations and custom connectors (useConnectorsSettingsAdapter.tsx:998-1058).
- Server disconnect cancels pending authorizations, revokes stored tokens at the vendor, clears saved tool permissions and writes a connector_removed audit event (apps/web/lib/connectors/oauth-access.ts:444-462; apps/web/app/api/connectors/route.ts:906-921).
- Phone shows granted permission sentences, per-account rows and a Disconnect with confirm (ConnectorDetailScreen.tsx:886-925, 666-703). The brief says phone scopes are missing; the code shows them.
- CLI lists connectors and disconnects with a confirm and a verified receipt (apps/cli/src/cloud/connectors.rs:116-166; apps/cli/src/lib.rs:7377-7410). The brief says CLI missing; the command exists.

**Incomplete**

- CLI list shows name, state and health but no scopes: the connection struct has no scopes field (apps/cli/src/cloud/connectors.rs:97-108).
- Per-account listing exists (GET /api/connectors/[connectorId]/accounts) but only a GET handler exists there; per-account disconnect through that route is not present (apps/web/app/api/connectors/[connectorId]/accounts/route.ts:42).
- Whether the web Disconnect button asks for confirmation: not established from the adapter (it only runs the request).

**Present but disconnected or switched off**

- Chrome connectors are shown as coming soon and locked (apps/extension/src/side_panel.ts:15251).

**Not available**

- VS Code: marked n/a in the brief.
- Chrome: no connected-account list or disconnect.
- Phone without Cloud mode: connectors screen shows the sync-blocked banner instead (ConnectorDetailScreen.tsx:749-750).

## 4. Required behaviour

**Established requirements**

- The user can see third-party accounts connected to AGI and disconnect them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.12)
- For each connected account the user can see which permissions were actually granted. (source: S86.13 (same brief))
- Connector list and disconnect are driven by the connectors settings adapter. (source: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:640, 845)
- Granted scopes come from the connectors API. (source: apps/web/app/api/connectors/route.ts:295)
- Disconnecting removes the saved tool permissions and attempts vendor revocation; a GitHub disconnect that cannot remove the installation reports failure and stays connected. (source: apps/web/app/api/connectors/route.ts:906-921, 951-996)
- External connector writes need approval; each connector knows its trust boundary. (source: doc: docs/product/requirements.md sections 4.4, 9.7)

**Acceptance criteria**

1. A connected OAuth connector shows each granted scope as a sentence with a Read or Write badge on web and phone.
2. Disconnecting removes the connector from the list and its saved tool permissions.
3. If the vendor does not confirm revocation, the person sees a notice saying so.
4. A GitHub disconnect with a failed installation removal leaves GitHub listed and shows an error.
5. The CLI refuses to disconnect without confirmation unless --yes is given, and prints a receipt only when the server confirms success.
6. A connector needing reauthorization is flagged and not shown as healthy.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] CLI scope display is needed to meet S86.13 on every surface that lists connectors.
- [inferred] A custom connector with no OAuth scopes shows no granted list (ConnectorGrantedScopeList returns null for an empty list, ConnectorScopeList.tsx:88).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add granted permissions to the CLI connectors list.
- [proposed] Add per-account disconnect where one connector holds several accounts.
- [proposed] Show a connector-wide 'last used' beside the grant.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET/POST/DELETE /api/connectors | `apps/web/app/api/connectors/route.ts` | Lists connections with scopes; disconnects. |
| endpoint | GET /api/connectors/[connectorId]/accounts | `apps/web/app/api/connectors/[connectorId]/accounts/route.ts` | Lists accounts under one connector. |
| hook | useConnectorsSettingsAdapter | `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Web and Desktop list, connect, disconnect, scope display. |
| component | ConnectorScopeList / ConnectorGrantedScopeList | `apps/web/features/connectors/components/ConnectorScopeList.tsx` | Permissions requested and Permissions granted panels. |
| service | scope-descriptions | `apps/web/lib/connectors/scope-descriptions.ts` | Turns scope strings into plain sentences with Read or Write. |
| service | oauth-access | `apps/web/lib/connectors/oauth-access.ts` | disconnectConnectorOAuthGrant and vendor revocation notices. |
| service | oauth-store | `apps/web/lib/connectors/oauth-store.ts` | Stored grants and account lists. |
| service | connector-capability | `apps/web/lib/connectors/connector-capability.ts` | canUseConnectors kill-switch gate. |
| table | user_connectors | `apps/web/app/api/connectors/route.ts` | Active catalog connectors; disconnect sets is_active false. |
| table | github_installations | `apps/web/app/api/connectors/route.ts` | GitHub App installations deleted on disconnect. |
| table | connector_tool_permissions | `apps/web/app/api/connectors/permissions/route.ts` | Saved tool permissions cleared on disconnect. |
| screen | ConnectorDetailScreen | `apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx` | Phone detail, granted access, disconnect. |
| component | ConnectorAccountRows | `apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx` | Per-account rows on phone. |
| service | mobile connectors service | `apps/mobile/services/connectors.ts` | disconnectConnector, deleteCustomConnector calls. |
| component | DesktopCloudSettingsModal | `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx` | Internal Tauri-build connectors with granted permissions. |
| command | agi connectors | `apps/cli/src/lib.rs` | CLI list and disconnect command (lines 1028, 7377-7410). |
| service | cli connectors module | `apps/cli/src/cloud/connectors.rs` | List, render, disconnect receipt. |
| config | CONNECTORS_COMING_SOON labels | `apps/extension/src/side_panel.ts` | Chrome locked state. |
| test | ConnectorScopeList.test | `apps/web/features/connectors/components/__tests__/ConnectorScopeList.test.tsx` | Scope sentence tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The surface calls GET /api/connectors with the session. | device and our servers | apps/web/app/api/connectors/route.ts:236-243; apps/cli/src/cloud/connectors.rs:116-118 |
| The server reads active connections, OAuth grant summaries (with granted scopes) and custom connectors and returns them with grantedPermissions sentences. | our servers | apps/web/app/api/connectors/route.ts:247-297 |
| The person presses Disconnect; web sends DELETE /api/connectors?connectorId= with a CSRF token. | device | useConnectorsSettingsAdapter.tsx:1044-1055 |
| The server checks CSRF, rate limit and workspace access, cancels pending authorizations, captures and revokes stored tokens. | our servers | apps/web/app/api/connectors/route.ts:881-906; oauth-access.ts:444-462 |
| Tokens are revoked at the third-party vendor when possible. | outside service | oauth-access.ts:452-457 |
| Saved tool permissions are cleared and a connector_removed audit event is written. | our servers | apps/web/app/api/connectors/route.ts:911-923 |
| The response carries success and an optional vendor notice, which the surface shows. | device | oauth-access.ts:476-490; ConnectorDetailScreen.tsx:686-690 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Connector grants and tokens | OAuth store on our servers; user_connectors; github_installations | One account store shared by every surface | Grant revoked and removed on disconnect; vendor revocation best effort |
| Saved tool permissions | table connector_tool_permissions | Account-wide | Cleared on disconnect (route.ts:911, 1007) |
| Audit event connector_removed | audit log | Server only | unknown |

**Models and providers.** The listing and disconnect involve no AI model. The vendor (third-party service) takes part in token revocation. Connector tools are later called by the chat turn pipeline, outside this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; the connectors endpoint resolves the user (apps/web/app/api/connectors/route.ts:237). |
| Permissions | Workspace access gate applies (route.ts:239-240, 889-890); per-user data only. |
| Subscription | A connectors capability switch (canUseConnectors) gates the feature; web, phone and CLI all check it (connector-capability.ts:33; ConnectorDetailScreen.tsx:350; apps/cli/src/lib.rs:7378). Which plans enable it: unknown from these files. |
| Limits and metering | Rate limit bucket 'chat-conversation' on list and disconnect (route.ts:234, 886). Custom connector and tool capacity limits exist for adding (route.ts imports assertCustomConnectorCapacity); values not opened. |
| Feature flags | Phone FEATURES.connectors build flag (ConnectorDetailScreen.tsx:472, 742); canUseConnectors kill switch. |
| Model compatibility | Not applicable to listing and disconnecting. |
| Provider restrictions | Each connector has its own OAuth support and region rules (route.ts imports regionRequirement and sensitiveDataRegionRefusal); not detailed here. |
| Local mode | Connectors are a Managed Cloud capability. On the phone Local mode shows a banner to switch to Cloud (ConnectorDetailScreen.tsx:749-750). Device-local connectors are flagged separately (isDeviceLocalConnector imported in route.ts); their behaviour was not opened. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Phone shows 'Loading connector…'. | ConnectorDetailScreen.tsx:752-757 |
| error | Phone shows an error view; web adapter offers onRetryConnectors. | ConnectorDetailScreen.tsx:758; useConnectorsSettingsAdapter.tsx:1263 |
| empty | CLI prints 'None connected yet.'; web and phone empty states not verified. | apps/cli/src/cloud/connectors.rs:179-181 |
| needs reauthorization | Flagged; phone tells the person to disconnect and add again; CLI prints a reconnect URL. | ConnectorDetailScreen.tsx:880; apps/cli/src/cloud/connectors.rs:189-192 |
| vendor revocation not confirmed | Disconnect succeeds locally; a notice says access was not revoked at the vendor. | oauth-access.ts:476-490 |
| permission clearing failed | withPermissionsNotice adds a notice to the response. | apps/web/app/api/connectors/route.ts:928-935 |
| GitHub installation cannot be removed | Returns 502 or 503 and leaves it connected. | route.ts:951-967 |
| account switched mid-action | Phone ignores a stale result using an account epoch. | ConnectorDetailScreen.tsx:667-669, 680-681 |
| cancel | Cancel on the confirmation leaves the connector connected (phone, CLI). | ConnectorDetailScreen.tsx:675; apps/cli/src/lib.rs:7397-7399 |
| offline | not handled in the code beyond generic failure messages | looked in ConnectorDetailScreen.tsx and useConnectorsSettingsAdapter.tsx; only generic failure alerts found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/connectors/route.test.ts`: Connectors route.
- `apps/web/features/connectors/components/__tests__/ConnectorScopeList.test.tsx`: Scope sentences, Read or Write badge, scope-less providers.
- `apps/web/features/connectors/hooks/__tests__/useConnectorsSettingsAdapter.test.tsx`: Adapter behaviour including disconnect.
- `apps/web/features/connectors/hooks/__tests__/useConnectors.test.tsx`: Connector list hook.
- `apps/web/app/api/connectors/[connectorId]/accounts/route.test.ts`: Accounts listing.
- `apps/mobile/src/features/settings/cloud-connectors/__tests__/ConnectorTrustSections.test.tsx`: Phone trust sections.
- `apps/cli/src/cloud/connectors.rs`: Rust unit tests for disconnect receipt, vendor warning, terminal control stripping, unconfirmed disconnect (module tests at line 237 onward).

**Test scenarios**

- **Read granted scopes**
  1. Connect an OAuth connector.
  2. Open it in Settings, Connectors.
  - Expected: 'Permissions granted' lists each granted scope as a sentence with Read or Write.
- **Disconnect and permissions cleanup**
  1. Set a tool to Allow.
  2. Disconnect the connector.
  3. Reconnect it and open Tool permissions.
  - Expected: The saved Allow is gone.
- **Vendor revocation failure**
  1. Disconnect a connector while the vendor revocation endpoint is unreachable.
  - Expected: Disconnected, with a notice that access was not revoked at the vendor.
- **Phone parity**
  1. On a phone in Cloud mode open a connected connector.
  - Expected: Granted access rows appear; Disconnect asks first.
- **CLI**
  1. Run agi connectors.
  2. Run agi connectors disconnect <id> and answer no, then yes.
  - Expected: Left connected on no; receipt on yes.
- **Local mode phone**
  1. Switch the phone to Local mode and open a connector.
  - Expected: A banner asks to switch to Cloud.

**Where to look when it fails**

- Log 'GitHub App installation was not revoked; connector left connected'.
- Audit events connector_removed (including failure outcome for GitHub).
- Table connector_tool_permissions rows for the connector after disconnect.
- CLI error text 'the disconnect was not confirmed, so the connector may still be connected'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/086-security-and-connected-access-settings.md](../../70-qa/test-plans/web/086-security-and-connected-access-settings.md)
- Desktop: [70-qa/test-plans/desktop/086-security-and-connected-access-settings.md](../../70-qa/test-plans/desktop/086-security-and-connected-access-settings.md)
- Mobile: [70-qa/test-plans/mobile/086-security-and-connected-access-settings.md](../../70-qa/test-plans/mobile/086-security-and-connected-access-settings.md)
- CLI: [70-qa/test-plans/cli/086-security-and-connected-access-settings.md](../../70-qa/test-plans/cli/086-security-and-connected-access-settings.md)

## 10. Gaps and dependencies

- **CLI connectors list shows no granted permissions.** Affects: CLI users.. Evidence: apps/cli/src/cloud/connectors.rs:97-108. Work needed: Return and render grantedPermissions.
- **Brief marks phone scopes and CLI connectors missing, but code has them; the brief is stale.** Affects: Anyone planning from the brief.. Evidence: ConnectorDetailScreen.tsx:895-925; apps/cli/src/lib.rs:7377-7410. Work needed: Update the brief status.
- **Chrome has no connected-account view.** Affects: Chrome users.. Evidence: apps/extension/src/side_panel.ts:15251. Work needed: Build the view or hide the entry.
- **No per-account disconnect where a connector holds several accounts.** Affects: Web, phone.. Evidence: accounts route exports only GET (route.ts:42). Work needed: Add a delete action keyed by account.
- **Web disconnect confirmation and empty state not verified.** Affects: Web, Desktop.. Evidence: useConnectorsSettingsAdapter.tsx:998-1058 has no confirm. Work needed: Check the settings component that calls onDisconnectConnector; add confirmation if missing (AGENTS.md section 9 requires it for irreversible actions).
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- mode:cloud
- SYS-connectors-plugins-and-skills
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- table:connector_tool_permissions
- table:user_connectors
- table:github_installations
- api:GET /api/connectors
- api:DELETE /api/connectors
- api:GET /api/connectors/[connectorId]/accounts
- F086-10

## Unknown

- Which plans enable the connectors capability.
- Whether the web disconnect button confirms before sending.
- Empty-state wording on web and phone.
- Behaviour of device-local connectors on disconnect.
- Retention of audit events.
- Whether Desktop Electron has any connectors screen other than the hosted web page.
