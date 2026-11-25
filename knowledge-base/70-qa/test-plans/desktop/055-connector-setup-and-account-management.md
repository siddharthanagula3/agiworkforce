---
id: "PLAN-desktop-055"
type: "test-plan"
title: "Desktop · 55. Connector setup and account management"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "55"
---
# Desktop · 55. Connector setup and account management

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S55.01 Connector directory.

- **Expected:** A signed-in user can browse a catalogue of connectors they could add, with each entry's name, publisher and state.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/settings/components/WebSettingsModal.tsx:332; apps/web/features/directory/services/connectors-directory.ts:431; apps/web/app/api/connectors/directory/route.ts:129
- **Where to find it:** Settings > Connectors > Add > Browse connectors (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings (Mac menu bar Settings… or Command+,).
  2. Click Connectors in the Settings list.
  3. Click Add, then click Browse connectors.
  4. Look for a catalogue of connector cards, each with its name and a state (Connected or Connect).
  5. Click one connector and check its Made by row for the publisher.

## S55.02 Connector search.

- **Expected:** Typing in a connector search box narrows the catalogue by name, publisher, tools or description.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/DirectoryToolbar.tsx:109; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/services/connectors-directory.ts:431; apps/web/app/api/connectors/directory/route.ts:37
- **Where to find it:** Settings > Connectors > Search connectors… (labels found in the code)
- **Steps:**
  1. Open Settings and click Connectors.
  2. Click the search box at the top right of the connector list.
  3. Type part of a name, for example Gmail.
  4. Look for the list narrowing to matching rows, then clear the box to see all connectors again.

## S55.03 Connector categories.

- **Expected:** The catalogue can be filtered by category (e.g. Productivity, Developer, Communication).
- **Code:** done. Evidence present: packages/ui/ui/src/directory/DirectoryPanel.tsx:869; apps/web/features/directory/services/connectors-directory.ts:312; apps/web/app/api/connectors/directory/route.ts:61
- **Where to find it:** Settings > Connectors > Browse connectors > Filter by > Category (labels found in the code)
- **Steps:**
  1. Open Settings, click Connectors, then Add and Browse connectors.
  2. Click Filter by.
  3. Under Category, pick one (for example Productivity).
  4. Look for the list showing only connectors in that category, then click Clear filters to reset.

## S55.04 Connector detail page.

- **Expected:** Selecting a connector opens a detail page with its description, publisher, sign-in requirement, tools and links.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/ConnectorDetailView.tsx:224; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/services/connectors-directory.ts:930
- **Where to find it:** Settings > Connectors > Browse connectors > click a connector name (labels found in the code)
- **Steps:**
  1. Open Settings, Connectors, then Add and Browse connectors.
  2. Click any connector name or card.
  3. Read the description and the Categories, Made by, Author and Sign-in rows (Sign-in shows Required or None).
  4. Check the Connector URL and More info links, the Tools list, and the note Only use connectors you trust.
  5. Compare with Expected: description, publisher, sign-in requirement, tools and links should all be present.

## S55.05 Supported-operation list.

- **Expected:** The connector page lists the operations/tools the connector exposes (before or after connecting).
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/ConnectorDetailView.tsx:388; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786 (quoted code not found in the file now); apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:86
- **Where to find it:** Settings > Connectors > Browse connectors > click a connector > Tools (labels found in the code)
- **Needs:** a connector that exposes tools; a connected one to see the live list
- **Steps:**
  1. Open a connector that is not connected yet.
  2. Find the Tools heading and read the list of tools.
  3. Connect the connector, reopen it, and find the Live MCP capabilities section.
  4. Check that the tools, resources and prompts it lists match the list you saw before connecting.

## S55.06 Read/write capability explanation.

- **Expected:** Before connecting, the user sees in plain language what the connector can read and what it can change.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ConnectorScopeList.tsx:39; apps/web/features/connectors/components/ConnectorScopeList.tsx:22
- **Where to find it:** Settings > Connectors > click a connector that is not connected yet (labels found in the code)
- **Needs:** a connector not yet connected
- **Steps:**
  1. Open Settings and click Connectors.
  2. Click a connector that is not connected.
  3. Read the Before you connect box and the Permissions requested list, which shows a Read or Write badge for each permission.
  4. Click Connect and read the dialog titled Connect <name>? that lists the permissions.
  5. Compare with Expected: the text should say in plain language what the connector can read and change.

## S55.07 Connect action.

- **Expected:** A Connect action on a connector starts its real authorization or credential flow.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/ConnectorDetailView.tsx:292 (quoted code not found in the file now); apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:757; apps/web/app/api/connectors/route.ts:690
- **Where to find it:** Settings > Connectors > Connect (labels found in the code)
- **Needs:** none for the dialog; an outside account for OAuth connectors
- **Steps:**
  1. Open Settings and click Connectors.
  2. Click Connect on a connector row, or open the connector and click Connect.
  3. In the dialog titled Connect <name>? click Allow.
  4. Look for the connector to move to its connected state, or for the provider sign-in page to open.

## S55.08 OAuth authorization.

- **Expected:** Connecting an OAuth provider opens the provider consent page and stores the returned grant.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/ConnectorDetailView.tsx:292 (quoted code not found in the file now); apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:757; apps/web/app/api/connectors/oauth/start/route.ts:320; apps/web/app/api/connectors/oauth/callback/route.ts:153 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > Connect (an OAuth connector such as Google Drive) (labels found in the code)
- **Needs:** an outside account (Google) that can approve the provider consent
- **Steps:**
  1. Open Settings and click Connectors.
  2. Click Connect on an OAuth connector such as Google Drive.
  3. In the dialog click Allow.
  4. Look for the provider's own consent page to open; approve there.
  5. Return to the app and look for the connector shown as connected.

## S55.09 API-key authorization.

- **Expected:** A connector that needs an API key offers a form to enter it, stores it encrypted, and connects.
- **Code:** done. Evidence present: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1177; apps/web/app/api/connectors/[connectorId]/credentials/route.ts:200; packages/ui/ui/src/settings-modal/SettingsModal.tsx:778
- **Where to find it:** Settings > Connectors > click a connector that uses an API key > Add API key (labels found in the code)
- **Needs:** an API-key connector and a valid key for it
- **Steps:**
  1. Open Settings, Connectors, then click the API key connector.
  2. Click Add API key.
  3. Type a key into the API key field and click Test and save.
  4. Look for the message Connected. with the tool count, and for the key to be stored (the form says it is stored encrypted).

## S55.11 Organization-managed authorization.

- **Expected:** An organization admin authorizes a connector once and members use it without holding the credential.
- **Code:** done. Evidence present: apps/web/app/workspace/sharing/page.tsx:17; apps/web/features/settings/sections/OrganizationSharingSection.tsx:555; apps/web/features/settings/hooks/use-settings-queries.ts:1921; apps/web/app/api/settings/organization/shared/connectors/[connectorId]/route.ts:50; apps/web/lib/user-connector-tools.ts:1690
- **Where to find it:** Workspace console > Sharing > Shared connectors > Share connector with organization (labels found in the code)
- **Needs:** an organization admin account and a second member account in the same workspace
- **Steps:**
  1. As an organization admin, open the Workspace console and click Sharing.
  2. Under Shared connectors, pick one of your connectors and click Share connector with organization.
  3. Sign in as a member of the same organization and open that connector's tools.
  4. Look for the member to use the connector without seeing the credential.

## S55.13 Account display name.

- **Expected:** Each connected account shows a human-readable name.
- **Code:** done. Evidence present: apps/web/lib/connectors/accounts.ts:14; apps/web/lib/connectors/oauth-client.ts:158; apps/web/lib/connectors/mcp-discovery.ts:370
- **Where to find it:** Settings > Connectors > Browse connectors > click a connected connector > Connected account (labels found in the code)
- **Needs:** a connected account
- **Steps:**
  1. Open Settings, Connectors, then Add and Browse connectors.
  2. Click a connector that is connected.
  3. Find the Connected account heading and the row under it.
  4. Look for the account name (email or login). If the provider sent no name, the text says The provider did not share the account name.

## S55.14 Account identity and domain.

- **Expected:** A connected account shows which identity (email/login) and domain/workspace it belongs to.
- **Code:** done. Evidence present: apps/web/lib/connectors/accounts.ts:14
- **Where to find it:** Settings > Connectors > Browse connectors > click a connected connector > Connected account (labels found in the code)
- **Needs:** a connected account signed in with an email or login
- **Steps:**
  1. Open a connected connector as in S55.13.
  2. Look at the Connected account row for the sign-in identity (email or login).
  3. Look for any domain or workspace name next to it.

## S55.17 Granted-scope display.

- **Expected:** After connecting, the user can see which scopes/permissions were actually granted.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ConnectorScopeList.tsx:83; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1236
- **Where to find it:** Settings > Connectors > Browse connectors > click a connected connector > Permissions granted (labels found in the code)
- **Needs:** a connected account
- **Steps:**
  1. Open a connected connector as in S55.13.
  2. Find the Permissions granted list.
  3. Read each row and its Read or Write badge.
  4. Compare with the Permissions requested list shown before connecting (S55.06).

## S55.18 Connection health.

- **Expected:** Each connector shows whether it is healthy, needs reauthorization or is not responding.
- **Code:** done. Evidence moved: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1259; apps/web/app/api/connectors/health/route.ts:22; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:702; apps/web/app/api/connectors/route.ts:282 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > Browse connectors > click a connector > Connector health (labels found in the code)
- **Needs:** a connector that has been called recently for a useful state
- **Steps:**
  1. Open Settings, Connectors, then Add and Browse connectors.
  2. Click a connector and scroll to the Connector health section.
  3. Read the state for the connector: Responding, Degraded, Not responding or Not called yet.
  4. Click Refresh and check the call counts. A connector that needs reconnecting shows a Reconnect button on its row instead.

## S55.20 Reconnect/reauthorize.

- **Expected:** An expired or revoked connection offers a Reconnect action that re-runs authorization.
- **Code:** partial. Evidence present: packages/ui/ui/src/directory/ConnectorDetailView.tsx:306
- **Known to be unfinished:** live-check: with a revoked or expired OAuth grant (e.g. Google Drive), open Connectors on web and in Electron: Reconnect shows beside Disconnect and re-runs OAuth, settings and tool permissions persist, and chat shows the agi_reconnect card
- **Where to find it:** Settings > Connectors > click a connector whose grant has expired or was revoked (for example Google Drive) > Reconnect (labels found in the code)
- **Needs:** an expired or revoked connection, for example a Google Drive grant revoked at Google
- **Steps:**
  1. Open the connector whose connection needs reconnecting.
  2. Look for a Reconnect button beside Disconnect and the text that says it needs reconnecting; its settings are kept.
  3. Click Reconnect and check that the provider's consent page opens again.
  4. Look for the connector to return to connected, with its tool permissions still set.

## S55.21 Test connection.

- **Expected:** The user can run an on-demand check that a connection works and see the result.
- **Code:** done. Evidence moved: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786 (quoted code not found in the file now); apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:179; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:86
- **Where to find it:** not found in the code. Searched the connector feature, settings and directory for Test, Check, Refresh and Retry. Only Test and save exists, and it tests a new API key while saving it; no standalone test-connection action was found. Refresh re-reads call stats and Retry discovery appears only when live capabilities fail to load.

## S55.22 Disconnect.

- **Expected:** The user can disconnect a connector and it stops being available to the assistant.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/ConnectorDetailView.tsx:323; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:998; apps/web/app/api/connectors/route.ts:880
- **Where to find it:** Settings > Connectors > click a connected connector > Disconnect (labels found in the code)
- **Needs:** a connected connector
- **Steps:**
  1. Open Settings, click Connectors, then click a connected connector.
  2. Click Disconnect.
  3. In the dialog titled Disconnect <name>? read the warning and click Disconnect.
  4. Look for the connector to show Connect again and for the assistant to stop using it in a new chat.

## S55.23 Revoke permission.

- **Expected:** Revoking removes the stored grant and asks the provider to revoke the token.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/ConnectorDetailView.tsx:323; apps/web/app/api/connectors/route.ts:880; apps/web/lib/connectors/oauth-access.ts:193 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. No Revoke button or word exists in the UI; the token revocation runs on the server when Disconnect is used (apps/web/lib/connectors/oauth-access.ts and apps/web/app/api/connectors/route.ts). Not checked live.
- **Needs:** an outside account for the provider
- **Steps:**
  1. Disconnect a connected connector as in S55.22.
  2. Open the provider's own account page for connected or authorised apps.
  3. Look for the app to be gone from the list.

## S55.25 Folder or repository selection.

- **Expected:** The user limits a connector to chosen folders or repositories.
- **Code:** done. Evidence present: apps/web/app/api/connectors/route.ts:618; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:757
- **Where to find it:** not found in the code. Searched the connector feature, the connectors API routes, the directory and the desktop folder picker. No folder or repository limit control was found for connectors. GitHub repositories are picked in the GitHub install flow on GitHub's side, and Choose a folder belongs to local folder attach, not connectors.

## S55.26 Read-only mode.

- **Expected:** A connector can be set to read-only so its write operations are blocked.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:57; apps/web/features/connectors/components/ToolPermissionsPanel.tsx:271; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:93
- **Where to find it:** Settings > Connectors > click a connected connector > Tool permissions > Write and delete tools (labels found in the code)
- **Needs:** a connected connector with write tools and a chat to test in
- **Steps:**
  1. Open a connected connector and click Tool permissions.
  2. Find the Write and delete tools group.
  3. Use the bulk control for that group to set Deny, or set Deny on each write tool.
  4. Look in a chat for the assistant to be unable to run those write tools.

## S55.27 Write-action settings.

- **Expected:** The user controls whether a connector's write actions run automatically, need approval, or are blocked.
- **Code:** done. Evidence moved: apps/web/features/connectors/components/ConnectorConsentSummary.tsx:5 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > click a connected connector > Tool permissions (labels found in the code)
- **Needs:** a connected connector with write tools
- **Steps:**
  1. Open a connected connector and click Tool permissions.
  2. Find a tool under Write and delete tools.
  3. Click Allow (Always run without asking), Ask (Needs approval each time) or Deny (Never run this tool).
  4. Look for the chosen option to be highlighted and saved, and for a chat to follow it.

## S55.28 Data-retention explanation.

- **Expected:** At connect time the product explains what connector data it stores and for how long.
- **Code:** done. Evidence moved: apps/web/features/connectors/components/ConnectorConsentSummary.tsx:23 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > click a connector that is not connected > Before you connect (labels found in the code)
- **Needs:** a connector not yet connected
- **Steps:**
  1. Open Settings, click Connectors, then click a connector that is not connected.
  2. Read the Before you connect box.
  3. Find What it fetches stays with the chat and read it.
  4. Compare with Expected: it says what is stored and for how long.

## S55.29 Source-provider attribution.

- **Expected:** Answers or steps that used a connector name the provider that supplied the data.
- **Code:** done. Evidence gone: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; apps/web/features/connectors/lib/mcp-tool-name.ts:35 (file no longer exists)
- **Where to find it:** not found in the code. Searched ToolTimeline.tsx for provider text: none found. apps/web/features/connectors/lib/mcp-tool-name.ts no longer exists. No provider attribution text found in the chat connector cards.

## S55.30 Missing-scope request.

- **Expected:** When a task needs a scope the grant lacks, the product asks the user to grant that permission.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:512; packages/ui/unified-chat/src/components/ConnectorConnectCard.tsx:15; apps/web/app/api/connectors/oauth/start/route.ts:320
- **Where to find it:** Chat > a request that a connected tool cannot do with its current permission (labels found in the code)
- **Needs:** a connected account whose grant lacks a needed scope, and a task that needs it
- **Steps:**
  1. Connect a connector whose grant lacks a permission the task needs.
  2. In a chat, ask the assistant to do that task.
  3. Look for the card headed <name> needs more permission, listing permissions, with a Reconnect <name> button.
