---
id: "PLAN-web-055"
type: "test-plan"
title: "Web · 55. Connector setup and account management"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "55"
---
# Web · 55. Connector setup and account management

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S55.01 Connector directory.

- **Expected:** A signed-in user can browse a catalogue of connectors they could add, with each entry's name, publisher and state.
- **Code:** done. Evidence present: packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/settings/components/WebSettingsModal.tsx:332; apps/web/features/directory/services/connectors-directory.ts:431; apps/web/app/api/connectors/directory/route.ts:129
- **Earlier check in the running app:** UI_ONLY: E016 [UI_ONLY; directory UI]: After search settled, github narrowed the curated list to exactly GitHub (Showing 1 of 1). The wider directory reports 0 indexed connectors and incomplete indexing. External authorization and connection testing remain blocked by setup/permission.
- **Where to find it:** Settings > Connectors > Add > Browse connectors (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and open Settings (the account menu entry that opens Settings was not traced in code).
  2. Click Connectors in the Settings list.
  3. Click Add, then Browse connectors.
  4. Look for a catalogue of connectors, each showing its name, publisher and connection state, and compare with Expected.

## S55.02 Connector search.

- **Expected:** Typing in a connector search box narrows the catalogue by name, publisher, tools or description.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/DirectoryToolbar.tsx:109; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/services/connectors-directory.ts:431; apps/web/app/api/connectors/directory/route.ts:37
- **Earlier check in the running app:** PASS: E016 [PASS; interaction]: After search settled, github narrowed the curated list to exactly GitHub (Showing 1 of 1). The wider directory reports 0 indexed connectors and incomplete indexing. External authorization and connection testing remain blocked by setup/permission.
- **Where to find it:** Settings > Connectors > Add > Browse connectors (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Browse connectors as in S55.01.
  2. Click the search box in the directory and type part of a connector name, a publisher or a tool word.
  3. Watch the list narrow.
  4. Compare the shown entries with Expected.

## S55.03 Connector categories.

- **Expected:** The catalogue can be filtered by category (e.g. Productivity, Developer, Communication).
- **Code:** done. Evidence present: packages/ui/ui/src/directory/DirectoryPanel.tsx:869; apps/web/features/directory/services/connectors-directory.ts:312; apps/web/app/api/connectors/directory/route.ts:61
- **Where to find it:** Settings > Connectors > Add > Browse connectors (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Browse connectors as in S55.01.
  2. Open the filter control in the directory toolbar and choose a category such as Productivity or Developer.
  3. Check that only connectors in that category remain.
  4. Compare with Expected.

## S55.04 Connector detail page.

- **Expected:** Selecting a connector opens a detail page with its description, publisher, sign-in requirement, tools and links.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/ConnectorDetailView.tsx:224; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/features/directory/services/connectors-directory.ts:930
- **Earlier check in the running app:** PASS: E017 [PASS; read-only interaction]: GitHub detail opens, describes operations and permissions, and names missing GitHub App configuration. Connect cannot be exercised on this deployment.
- **Where to find it:** Settings > Connectors > Add > Browse connectors > click a connector card (e.g. GitHub) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Browse connectors as in S55.01.
  2. Click a connector card such as GitHub.
  3. Read the detail page: description, publisher, sign-in requirement, tools and links.
  4. Compare with Expected.

## S55.05 Supported-operation list.

- **Expected:** The connector page lists the operations/tools the connector exposes (before or after connecting).
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/ConnectorDetailView.tsx:388; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786 (quoted code not found in the file now); apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:86
- **Earlier check in the running app:** PASS: E017 [PASS; read-only interaction]: GitHub detail opens, describes operations and permissions, and names missing GitHub App configuration. Connect cannot be exercised on this deployment.
- **Where to find it:** Settings > Connectors > Add > Browse connectors > click a connector card (e.g. GitHub) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open a connector's detail page as in S55.04, before connecting.
  2. Scroll to the list of operations or tools.
  3. Compare the list with Expected.

## S55.06 Read/write capability explanation.

- **Expected:** Before connecting, the user sees in plain language what the connector can read and what it can change.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ConnectorScopeList.tsx:39; apps/web/features/connectors/components/ConnectorScopeList.tsx:22
- **Earlier check in the running app:** PASS: E017 [PASS; read-only interaction]: GitHub detail opens, describes operations and permissions, and names missing GitHub App configuration. Connect cannot be exercised on this deployment.
- **Where to find it:** Settings > Connectors > Add > Browse connectors > click a connector card (e.g. GitHub) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open a connector's detail page before connecting.
  2. Read the permissions text, in plain words, on the page.
  3. Compare what can be read and what can be changed with Expected.

## S55.07 Connect action.

- **Expected:** A Connect action on a connector starts its real authorization or credential flow.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/ConnectorDetailView.tsx:292 (quoted code not found in the file now); apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:757; apps/web/app/api/connectors/route.ts:690
- **Earlier check in the running app:** BLOCKED: E017 [BLOCKED; deployment configuration]: GitHub detail opens, describes operations and permissions, and names missing GitHub App configuration. Connect cannot be exercised on this deployment.
- **Where to find it:** Settings > Connectors > Add > Browse connectors > GitHub > Connect (labels found in the code)
- **Needs:** an outside account (Google or GitHub) and a configured connector
- **Steps:**
  1. Open a connector's detail page as in S55.04.
  2. Click Connect.
  3. Watch whether the real sign-in or authorization flow starts.
  4. Compare with Expected.

## S55.08 OAuth authorization.

- **Expected:** Connecting an OAuth provider opens the provider consent page and stores the returned grant.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/ConnectorDetailView.tsx:292 (quoted code not found in the file now); apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:757; apps/web/app/api/connectors/oauth/start/route.ts:320; apps/web/app/api/connectors/oauth/callback/route.ts:153 (quoted code not found in the file now)
- **Earlier check in the running app:** BLOCKED: E016 [BLOCKED; external authorization/setup]: After search settled, github narrowed the curated list to exactly GitHub (Showing 1 of 1). The wider directory reports 0 indexed connectors and incomplete indexing. External authorization and connection testing remain blocked by setup/permission.
- **Where to find it:** Settings > Connectors > Add > Browse connectors > an OAuth connector > Connect (labels found in the code)
- **Needs:** an outside account (Google) that can approve access
- **Steps:**
  1. Open an OAuth connector's detail page, such as Google Drive.
  2. Click Connect.
  3. Check that the provider's consent page opens.
  4. After approving, check that the connector shows as connected.

## S55.09 API-key authorization.

- **Expected:** A connector that needs an API key offers a form to enter it, stores it encrypted, and connects.
- **Code:** done. Evidence present: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1177; apps/web/app/api/connectors/[connectorId]/credentials/route.ts:200; packages/ui/ui/src/settings-modal/SettingsModal.tsx:778
- **Where to find it:** Settings > Connectors > Add > Browse connectors > an API-key connector > Connect (labels found in the code)
- **Needs:** an API key for a connector that uses one
- **Steps:**
  1. Open a connector that needs an API key.
  2. Click Connect and enter the key in the form.
  3. Click Test and save.
  4. Check that the connector shows as connected, and compare with Expected.

## S55.11 Organization-managed authorization.

- **Expected:** An organization admin authorizes a connector once and members use it without holding the credential.
- **Code:** done. Evidence present: apps/web/app/workspace/sharing/page.tsx:17; apps/web/features/settings/sections/OrganizationSharingSection.tsx:555; apps/web/features/settings/hooks/use-settings-queries.ts:1921; apps/web/app/api/settings/organization/shared/connectors/[connectorId]/route.ts:50; apps/web/lib/user-connector-tools.ts:1690
- **Where to find it:** Workspace > Sharing (page at /workspace/sharing) (labels found in the code)
- **Needs:** an organization admin account and a second member account in the same organization
- **Steps:**
  1. Sign in as an organization admin and open the workspace Sharing page.
  2. Find the connectors section and share a connector with the organization.
  3. Sign in as a second member of the same organization and check the connector can be used without entering its credential.
  4. Compare with Expected.

## S55.13 Account display name.

- **Expected:** Each connected account shows a human-readable name.
- **Code:** done. Evidence present: apps/web/lib/connectors/accounts.ts:14; apps/web/lib/connectors/oauth-client.ts:158; apps/web/lib/connectors/mcp-discovery.ts:370
- **Where to find it:** not found in the code. Account name logic is in apps/web/lib/connectors/accounts.ts; I did not find the screen text that shows it. Searched the connector settings components and directory for the display.
- **Needs:** a connected account

## S55.14 Account identity and domain.

- **Expected:** A connected account shows which identity (email/login) and domain/workspace it belongs to.
- **Code:** done. Evidence present: apps/web/lib/connectors/accounts.ts:14
- **Where to find it:** not found in the code. Account identity logic is in apps/web/lib/connectors/accounts.ts; no screen text showing email or domain was found in the connector components.
- **Needs:** a connected account

## S55.17 Granted-scope display.

- **Expected:** After connecting, the user can see which scopes/permissions were actually granted.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ConnectorScopeList.tsx:83; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1236
- **Where to find it:** Settings > Connectors > (connected connector, e.g. Google Drive) > click the connector card (labels found in the code)
- **Needs:** a connected connector (a paid or Free account depending on the connector)
- **Steps:**
  1. Connect a connector, or open one that is already connected.
  2. Open its detail page.
  3. Read the Permissions granted list.
  4. Compare the listed permissions with Expected.

## S55.18 Connection health.

- **Expected:** Each connector shows whether it is healthy, needs reauthorization or is not responding.
- **Code:** done. Evidence moved: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1259; apps/web/app/api/connectors/health/route.ts:22; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:702; apps/web/app/api/connectors/route.ts:282 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E017 [UI_ONLY; empty-state UI]: GitHub detail opens, describes operations and permissions, and names missing GitHub App configuration. Connect cannot be exercised on this deployment.
- **Where to find it:** Settings > Connectors (connector row status) (labels found in the code)
- **Needs:** a connector whose grant has expired or been revoked, or a healthy one
- **Steps:**
  1. Open Settings > Connectors.
  2. Look at each connector's status label.
  3. Check that a connector needing reauthorization shows Reconnect.
  4. Compare with Expected.

## S55.20 Reconnect/reauthorize.

- **Expected:** An expired or revoked connection offers a Reconnect action that re-runs authorization.
- **Code:** partial. Evidence present: packages/ui/ui/src/directory/ConnectorDetailView.tsx:306
- **Known to be unfinished:** live-check: with a revoked or expired OAuth grant (e.g. Google Drive), open Connectors on web and in Electron: Reconnect shows beside Disconnect and re-runs OAuth, settings and tool permissions persist, and chat shows the agi_reconnect card
- **Where to find it:** Settings > Connectors > (connector needing reauthorization, e.g. Google Drive) > Reconnect (labels found in the code)
- **Needs:** a revoked or expired OAuth grant, for example Google Drive
- **Steps:**
  1. Use a connector whose OAuth grant was revoked or expired.
  2. Open Settings > Connectors and find the Reconnect button beside Disconnect.
  3. Click Reconnect and check that the authorization flow runs again.
  4. Check that connector settings and tool permissions remain, and that a chat shows the reconnect card.

## S55.21 Test connection.

- **Expected:** The user can run an on-demand check that a connection works and see the result.
- **Code:** done. Evidence moved: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786 (quoted code not found in the file now); apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:179; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:86
- **Earlier check in the running app:** BLOCKED: E016 [BLOCKED; external authorization/setup]: After search settled, github narrowed the curated list to exactly GitHub (Showing 1 of 1). The wider directory reports 0 indexed connectors and incomplete indexing. External authorization and connection testing remain blocked by setup/permission.
- **Where to find it:** not found in the code. The capabilities panel (apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx) has a retry, but no visible on-demand test-connection control text was found.
- **Needs:** a connected connector

## S55.22 Disconnect.

- **Expected:** The user can disconnect a connector and it stops being available to the assistant.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/ConnectorDetailView.tsx:323; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:998; apps/web/app/api/connectors/route.ts:880
- **Where to find it:** Settings > Connectors > (connected connector) > Disconnect (labels found in the code)
- **Needs:** a connected connector
- **Steps:**
  1. Open a connected connector's detail page in Settings > Connectors.
  2. Click Disconnect.
  3. Read the confirmation dialog titled Disconnect <name>? and confirm.
  4. Ask the assistant to use the connector and check it is no longer available.

## S55.23 Revoke permission.

- **Expected:** Revoking removes the stored grant and asks the provider to revoke the token.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/ConnectorDetailView.tsx:323; apps/web/app/api/connectors/route.ts:880; apps/web/lib/connectors/oauth-access.ts:193 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. No separate Revoke control was found; the provider token revocation runs behind Disconnect.
- **Needs:** a connected connector and the provider account (outside the app)
- **Steps:**
  1. Disconnect a connected connector as in S55.22.
  2. Check the connector no longer shows as connected.
  3. Check in the provider's own account security page that the app's access is gone.

## S55.25 Folder or repository selection.

- **Expected:** The user limits a connector to chosen folders or repositories.
- **Code:** done. Evidence present: apps/web/app/api/connectors/route.ts:618; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:757
- **Where to find it:** not found in the code. The route apps/web/app/api/connectors/route.ts and the hook apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx were found, but no visible control for choosing folders or repositories was found in the connector components.
- **Needs:** a connector that supports folder or repository limits

## S55.26 Read-only mode.

- **Expected:** A connector can be set to read-only so its write operations are blocked.
- **Code:** done. Evidence present: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:57; apps/web/features/connectors/components/ToolPermissionsPanel.tsx:271; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:93
- **Where to find it:** not found in the code. A Tool permissions label exists and the panel groups tools into Read-only tools and Write and delete tools (apps/web/features/connectors/components/ToolPermissionsPanel.tsx), but no separate read-only switch was found.
- **Needs:** a connected connector with tools

## S55.27 Write-action settings.

- **Expected:** The user controls whether a connector's write actions run automatically, need approval, or are blocked.
- **Code:** done. Evidence moved: apps/web/features/connectors/components/ConnectorConsentSummary.tsx:5 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > (connected connector) > Tool permissions (labels found in the code)
- **Needs:** a connected connector with tools
- **Steps:**
  1. Open a connected connector's detail page.
  2. Click Tool permissions.
  3. For a tool, pick Allow, Needs approval each time, or Never run this tool.
  4. Check that a destructive tool shows Always asks: destructive, and compare with Expected.

## S55.28 Data-retention explanation.

- **Expected:** At connect time the product explains what connector data it stores and for how long.
- **Code:** done. Evidence moved: apps/web/features/connectors/components/ConnectorConsentSummary.tsx:23 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > Add > Browse connectors > a connector > Connect (consent step) (labels found in the code)
- **Needs:** a Free or paid account, and a connector that is not connected yet
- **Steps:**
  1. Click Connect on a connector that is not yet connected.
  2. Read the consent dialog before the connection starts.
  3. Check the data retention point in the summary.
  4. Compare with Expected.

## S55.29 Source-provider attribution.

- **Expected:** Answers or steps that used a connector name the provider that supplied the data.
- **Code:** done. Evidence gone: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; apps/web/features/connectors/lib/mcp-tool-name.ts:35 (file no longer exists)
- **Where to find it:** not found in the code. The chat timeline groups connector tool calls by connector name (apps/web/features/chat/components/messages/ToolTimeline.tsx), but the provider attribution text was not found. apps/web/features/connectors/lib/mcp-tool-name.ts no longer exists.
- **Needs:** a connected connector used in a chat

## S55.30 Missing-scope request.

- **Expected:** When a task needs a scope the grant lacks, the product asks the user to grant that permission.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:512; packages/ui/unified-chat/src/components/ConnectorConnectCard.tsx:15; apps/web/app/api/connectors/oauth/start/route.ts:320
- **Where to find it:** Chat > ask for a task that needs a connector scope the grant lacks (e.g. read a GitHub issue after granting only part of the access) (labels found in the code)
- **Needs:** a connector granted with fewer scopes than the task needs
- **Steps:**
  1. Connect a connector with limited access.
  2. In chat, ask for a task that needs more access than granted.
  3. Look for a connector card in the chat with a Reconnect button.
  4. Compare with Expected.
