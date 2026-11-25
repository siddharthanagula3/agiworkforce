---
id: "PLAN-mobile-055"
type: "test-plan"
title: "Mobile · 55. Connector setup and account management"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "55"
---
# Mobile · 55. Connector setup and account management

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S55.01 Connector directory.

- **Expected:** A signed-in user can browse a catalogue of connectors they could add, with each entry's name, publisher and state.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-connectors/index.tsx:53; apps/mobile/services/connectors.ts:198
- **Where to find it:** Settings > Cloud > Connectors. The screen opens with the title Connectors and the line Connect your tools to AGI Cloud. Each card shows name and publisher. (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with connector access (the screen says Connectors are not available for this account otherwise)
- **Steps:**
  1. Sign in to AGI Cloud, open Settings, and under the Cloud section tap Connectors.
  2. Read the list of cards. Each card shows the connector name and, when given, the publisher after it (for example Name, Publisher).
  3. Tap the Search connectors box at the bottom only to confirm the list is not empty; a connected card shows Connected with a date.
  4. Compare with Expected: each entry shows name, publisher and state. Connectors that are not connected show no state label, only the name and publisher.

## S55.02 Connector search.

- **Expected:** Typing in a connector search box narrows the catalogue by name, publisher, tools or description.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/index.tsx:1219; apps/mobile/src/features/settings/cloud-connectors/index.tsx:750 (quoted code not found in the file now)
- **Where to find it:** Settings > Cloud > Connectors > Search connectors box at the bottom of the screen. (labels found in the code)
- **Needs:** none beyond the Connectors screen
- **Steps:**
  1. Open Settings > Cloud > Connectors and note the names of a few cards.
  2. Tap the Search connectors box at the bottom and type part of a connector name you saw.
  3. Watch the list: only matching cards should remain.
  4. Clear the box, then type a publisher name or a word from a description, and check that matching cards appear. Then type a tool name (for example one you saw on a connector detail page) and compare with Expected.

## S55.03 Connector categories.

- **Expected:** The catalogue can be filtered by category (e.g. Productivity, Developer, Communication).
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/index.tsx:754; apps/mobile/src/features/settings/cloud-connectors/index.tsx:750 (quoted code not found in the file now)
- **Where to find it:** Settings > Cloud > Connectors > the row of filter chips under the Add custom MCP box (chips All, Connected, Custom, and category names). (labels found in the code)
- **Needs:** none beyond the Connectors screen; a category chip appears only when the directory has connectors in that category
- **Steps:**
  1. Open Settings > Cloud > Connectors.
  2. Look at the row of chips: All and Connected are always there. Scroll the row sideways to find category chips such as Productivity.
  3. Tap a category chip such as Productivity.
  4. Compare with Expected: the list should show only connectors in that category. Tap All to return to the full list.

## S55.04 Connector detail page.

- **Expected:** Selecting a connector opens a detail page with its description, publisher, sign-in requirement, tools and links.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:888; apps/mobile/app/(app)/connectors/[id].tsx:15
- **Where to find it:** Settings > Cloud > Connectors > tap a connector card. The detail screen shows the name, By publisher, the description, the Sign-in row, What it can do, and the link rows. (labels found in the code)
- **Needs:** none beyond the Connectors screen
- **Steps:**
  1. Open Settings > Cloud > Connectors and tap a connector card that is not connected.
  2. Read the name, the line By (publisher), and the description under it.
  3. Check the row Sign-in (its value is Account sign-in, API key, Not needed or Checked on connect).
  4. Scroll to What it can do and the link rows Documentation, Website, Support and Privacy policy. Compare with Expected: description, publisher, sign-in requirement, tools and links.

## S55.07 Connect action.

- **Expected:** A Connect action on a connector starts its real authorization or credential flow.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/index.tsx:517 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-connectors/index.tsx:676 (quoted code not found in the file now); apps/mobile/services/connectors.ts:149; packages/client/client-runtime/src/connectors/runtime.ts:264 (quoted code not found in the file now)
- **Where to find it:** Settings > Cloud > Connectors > tap a connector that is not connected > Connect. (labels found in the code)
- **Needs:** a connector that is not connected and is released (Coming soon connectors have no Connect button); for a real sign-in step, an outside account for that provider
- **Steps:**
  1. Open a connector that is not connected and shows the Connect button (not Coming soon).
  2. Tap Connect.
  3. In the alert titled Connect [name]?, read the text and tap Allow (or Deny to stop).
  4. Compare with Expected: after Allow, the real sign-in or key step starts (a browser or in-app sign-in page for an account sign-in connector, or the API key form for an API key connector).

## S55.08 OAuth authorization.

- **Expected:** Connecting an OAuth provider opens the provider consent page and stores the returned grant.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/index.tsx:517 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-connectors/index.tsx:676 (quoted code not found in the file now); apps/mobile/services/connectors.ts:149; packages/client/client-runtime/src/connectors/runtime.ts:264 (quoted code not found in the file now)
- **Where to find it:** Settings > Cloud > Connectors > tap a connector whose Sign-in row reads Account sign-in > Connect > Allow. (labels found in the code)
- **Needs:** an outside account for that provider (the account to approve the grant)
- **Steps:**
  1. Open a connector whose Sign-in row says Account sign-in and tap Connect.
  2. Tap Allow in the alert Connect [name]?.
  3. Wait for the provider's own consent page to open (in the app browser or the in-app sign-in sheet) and approve it there.
  4. Return to the app and compare with Expected: the connector should now show Connected with a date under the Connected filter, and its detail page should show Connected to AGI Cloud and a Granted access section.

## S55.09 API-key authorization.

- **Expected:** A connector that needs an API key offers a form to enter it, stores it encrypted, and connects.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1320; apps/mobile/services/connectors.ts:261
- **Where to find it:** Settings > Cloud > Connectors > tap a connector whose Sign-in row reads API key > Connect > Allow > API key form. (labels found in the code)
- **Needs:** an API key for that provider
- **Steps:**
  1. Open a connector whose Sign-in row says API key and tap Connect, then Allow.
  2. In the form, tap the API key box (placeholder API key) and type a key.
  3. Tap Test and save.
  4. Compare with Expected: a bad key shows an error and nothing is saved; a good key closes the form and the detail page shows Connected to AGI Cloud. The encryption cannot be seen from the screen.

## S55.17 Granted-scope display.

- **Expected:** After connecting, the user can see which scopes/permissions were actually granted.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** Settings > Cloud > Connectors > tap a connected connector > Connected to AGI Cloud > Granted access section. (labels found in the code)
- **Needs:** a connected connector (a connector that has granted permissions or scopes)
- **Steps:**
  1. Open a connector that is connected (it shows a Connected date on the list).
  2. On its detail page, read the Connected to AGI Cloud heading and the rows under it.
  3. Find the Granted access section: each row shows a permission sentence and the word Read or Write.
  4. If no sentence rows appear, look for a Granted access row listing scope names. Compare with Expected: the permissions shown should be what was granted.

## S55.18 Connection health.

- **Expected:** Each connector shows whether it is healthy, needs reauthorization or is not responding.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:820; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:968
- **Where to find it:** Settings > Cloud > Connectors: the state text on each card. On a connector detail page: the Not responding box, Authorization expired, and the Connection health card. (labels found in the code)
- **Needs:** a connected connector; the not-responding and expired states depend on the provider and cannot be set up from the app
- **Steps:**
  1. Open Settings > Cloud > Connectors and read the state text on each connected card: Connected [date] means healthy; Not responding is amber; Authorization expired, reconnect is red.
  2. Tap a connected card. Read the warning boxes: Not responding (with Check again), Authorization expired, or Needs to be reconnected.
  3. Scroll to the section Connection health and read its state and summary text, or Not called in the last hour.
  4. Compare with Expected: each connector shows whether it is healthy, needs reauthorization or is not responding.

## S55.20 Reconnect/reauthorize.

- **Expected:** An expired or revoked connection offers a Reconnect action that re-runs authorization.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/index.tsx:430 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:626
- **Where to find it:** Settings > Cloud > Connectors: a card at the top with a Reconnect button, or a connector detail page with Reauthorize (under Authorization expired). (labels found in the code)
- **Needs:** an account-sign-in (OAuth) connector whose grant has expired or been revoked, and an outside account for that provider
- **Steps:**
  1. Use a connector whose authorization has expired or been revoked (it shows Authorization expired, reconnect on the list).
  2. On the Connectors screen, look for the card at the top and tap Reconnect; or tap the connector and scroll to the Authorization expired box.
  3. Tap Reauthorize on the detail page.
  4. Compare with Expected: the provider's authorization page should open for the same connector, and after approval the state should change to Connected.

## S55.22 Disconnect.

- **Expected:** The user can disconnect a connector and it stops being available to the assistant.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1180; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:666; apps/mobile/services/connectors.ts:79 (quoted code not found in the file now)
- **Where to find it:** Settings > Cloud > Connectors > tap a connected connector > scroll to the bottom > Disconnect > Disconnect (in the alert). (labels found in the code)
- **Needs:** a connected connector you can reconnect afterwards
- **Steps:**
  1. Open a connected connector and scroll to the bottom of its detail page.
  2. Tap Disconnect. Read the alert Disconnect [name]? and its text about saved tool permissions.
  3. Tap Disconnect in the alert.
  4. Compare with Expected: the screen returns to Connectors and the connector no longer shows as connected. Whether the assistant still uses it is not shown on this screen; check it in a chat if needed.

## S55.23 Revoke permission.

- **Expected:** Revoking removes the stored grant and asks the provider to revoke the token.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1180; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:666; apps/web/app/api/connectors/route.ts:880; apps/web/lib/connectors/oauth-access.ts:193 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No Revoke wording exists in the mobile connector screens or services/connectors.ts (searched rg -i revoke in apps/mobile/src/features/settings/cloud-connectors and services/connectors.ts). The nearest control is Disconnect, whose alert does not say the provider token is revoked; whether the provider is asked to revoke is not shown in mobile code.
- **Needs:** a connected connector, and an outside account for the provider to check the provider side

## S55.25 Folder or repository selection.

- **Expected:** The user limits a connector to chosen folders or repositories.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/index.tsx:676 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No folder or repository selection for a connector was found in apps/mobile (searched rg -i for repositor and folder in apps/mobile/src and app, filtered for connector, mcp, scope, github and drive). Only unrelated hits came back, such as GitHub repository URLs in the cloud code session sheet and src/features/settings/code/GitHubConnections.tsx, which was not checked as a connector control.

## S55.27 Write-action settings.

- **Expected:** The user controls whether a connector's write actions run automatically, need approval, or are blocked.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:513; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:122
- **Where to find it:** Settings > Cloud > Connectors > tap a connected connector > Tool permissions > Write and delete tools > tap a tool's Allow, Ask or Block choice. (labels found in the code)
- **Needs:** a connected connector that has write tools
- **Steps:**
  1. Open a connected connector that has write tools and scroll to Tool permissions.
  2. Find the group heading Write and delete tools and read the tool rows under it.
  3. Tap Allow, Ask or Block on one write tool (Allow runs it automatically, Ask asks first, Block stops it).
  4. Compare with Expected: the row should show the chosen level. Tap the reset control on a row (Reset [tool] to default) to return it to the default, which follows Action approvals.
