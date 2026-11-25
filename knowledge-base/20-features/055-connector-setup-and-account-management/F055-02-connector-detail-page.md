---
id: "F055-02"
type: "feature"
title: "Connector detail page"
aliases: ["Connector detail", "Connector detail page", "Connector detail view", "Connector overview", "What it can do", "Before you connect", "S55.04", "S55.05", "S55.06", "S55.28"]
area: "55 Connector setup and account management"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "n/a"}
verification: {web: "partly seen (3 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S55.04", "S55.05", "S55.06", "S55.28"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "F055-01", "F055-03", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "file:packages/contracts/cloud-contracts/src/connector-trust-copy.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F055-02 Connector detail page

One page per connector showing description, publisher, whether sign-in is needed, its tools, a plain-words sentence about read or write access, the six 'Before you connect' consent points and provider links. Web and Desktop show it fully; Mobile shows tools, access sentence and consent notes too; VS Code only a tooltip; CLI lists tools through MCP info.

Area: [55. Connector setup and account management](README.md). Requirement items: [S55.04](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5504), [S55.05](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5505), [S55.06](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5506), [S55.28](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5528).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (3 of 4) |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Presents what a connector is and what it may do before the person presses Connect, and what is connected afterwards (tools, granted permissions, account, health). (packages/ui/ui/src/directory/ConnectorDetailView.tsx:211-498)

**Why it exists.** A person must understand access before granting it. Brief Should lines require the operation list, a plain read/write explanation and a data-retention explanation at connect time (doc: area brief S55.04, S55.05, S55.06, S55.28). The fifth consent point of the shared copy says fetched data stays with the chat (packages/contracts/cloud-contracts/src/connector-trust-copy.ts:29-33).

**Who uses it.** Any signed-in person about to connect or manage a connector; testers checking consent wording.

**Problems it solves**

- Unclear risk: the sentence for read-only, read-write or high-impact tells what the connector can change. (connector-trust-copy.ts:51-58)
- Hidden tools: the Tools list shows operations a connector exposes. (ConnectorDetailView.tsx:347; packages/ui/ui/src/directory/constants.ts:144)
- Trust: 'Only use connectors you trust. AGI cannot verify what their tools do or whether they change.' (packages/ui/ui/src/directory/constants.ts:270-271)

**Use cases**

- Reading what Gmail can do before connecting.
- Checking the publisher and links before trusting a community server.
- Reading the retention point before connecting a sensitive connector.
- Seeing the granted permissions after connecting.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron): Settings, Connectors, then open a card (ConnectorDetailView.tsx; routed through SettingsModal.tsx:1967).
- Mobile: Settings, Connectors, then a row opens apps/mobile/app/(app)/connectors/[id].tsx (ConnectorDetailScreen.tsx).
- CLI: no detail page for cloud connectors; for registered MCP servers the REPL has /mcp info <server> and /mcp tools (apps/cli/src/repl/registry.rs:1603,1686-1700).
- VS Code: tooltip on a tree item (connectorPresentation.ts:62-70).
- Chrome: not covered.

**Before you start**

- Signed in.
- Web and Desktop: the capability must not be plan-locked; for a plan-locked unconnected connector the detail shows the upgrade message as listing note (connectors-directory.ts:986-1006).
- Mobile: Cloud app mode (index.tsx:519).

**Screens and controls**

- Header: name, summary, badge, primary button (Connect, Add API key, Reconnect, Connected, Needs setup, Not available yet, Coming soon), Disconnect, copy link (constants.ts:123-125,288,364,377-379).
- Sections: description, Tools list (expandable, '+N more'), trust notice, rows Categories, Made by, Author, Sign-in (Required or None), Connector URL, Added, More info links (Documentation, Website, Repository, Support, Privacy Policy), Related connectors, Terms of Service link (ConnectorDetailView.tsx:396-492).
- Before connecting on Web: 'Before you connect' consent summary box and a 'Permissions requested' list with Read or Write badges (ConnectorConsentSummary.tsx; ConnectorScopeList.tsx:49-78).
- After connecting on Web: Connected account, capabilities panel, granted permissions, Tool permissions button, Connector health (useConnectorsSettingsAdapter.tsx:1170-1262).
- Mobile pre-connect: 'What it can do' with the access sentence and tool names, a Sign-in row (Account sign-in, API key, Not needed, Checked on connect), and 'Before you connect' notes (ConnectorDetailScreen.tsx:100-114,1176-1315).

**Journey**

1. Open Settings, Connectors and select a connector.
2. Read description, tools, access sentence and publisher.
3. Open links under More info if wanted; they open in a new tab or the system browser.
4. Press the primary button; on Web a consent dialog titled 'Connect <name>?' with Allow and Deny repeats the scope list and the six points (ConnectorConsentDialog.tsx:30-60).
5. After connecting the same page shows account, tools, permissions and health.

**What the person sees and gets**

- Notices: coming soon, needs setup, not available yet, 'Available on desktop and CLI' with a download link, reconnect copy, authorization-pending copy (ConnectorDetailView.tsx:322-376).
- Access sentence under 'What this connector can do' (ConnectorScopeList.tsx:30-40).
- For servers that list their own tools, the discovered-server sentence tells that tools are shown in Tool permissions (connector-trust-copy.ts:60-61).

**Settings**

- Tool permissions per connector (Allow, Ask, Block) open from the detail page (useConnectorsSettingsAdapter.tsx:1231-1240).
- Account switch 'enable this connector for my account' (renderAccountSwitch, useConnectorsSettingsAdapter.tsx:891-927).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop detail view with tools, links, sign-in row and notices. (packages/ui/ui/src/directory/ConnectorDetailView.tsx:211-498)
- Six consent points shown on Web before connecting and again in the consent dialog. (connector-trust-copy.ts:8-34; ConnectorConsentDialog.tsx:44-60)
- Access sentence by risk class for catalogued connectors; discovered servers get the generic sentence. (connector-trust-copy.ts:63-72)
- Mobile detail lists tools and shows the access sentence, consent notes and sign-in method before and after connecting. (ConnectorDetailScreen.tsx:100-114,1176-1315)
- Live capability list for a connected connector: GET /api/connectors/{id}/capabilities. (apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:55-123)
- VS Code tooltip splits scopes into 'Can make changes', 'Can read only', 'Other access'. (connectorPresentation.ts:50-60)

**Incomplete**

- Brief marks Mobile operation list, read/write explanation and retention as missing; the code has them (ConnectorDetailScreen.tsx:1176-1315). The brief is out of date; code wins (doc: AGENTS.md section 2).
- VS Code has no retention text and no detail page.
- Mobile shows tool names only before connecting, not read/write per tool; per tool read-only grouping appears after connecting (ConnectorDetailScreen.tsx:121-123,490-495).

**Present but disconnected or switched off**

- Detail shows Coming soon for every connector outside the 13-id selective list. (connector-release-lock.ts:30-50; ConnectorDetailScreen.tsx:1248-1252)

**Not available**

- CLI has no connector detail page for cloud connectors; MCP info exists only for registered servers in an active session. (registry.rs:1686-1700)
- Chrome: not covered.

## 4. Required behaviour

**Established requirements**

- Selecting a connector opens a detail page with description, publisher, sign-in requirement, tools and links. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.04)
- The page lists operations/tools before or after connecting. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.05)
- Before connecting the user sees in plain language what the connector can read and change. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.06)
- At connect time the product explains what connector data it stores and for how long. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.28)
- Connector detail pages are part of the leader-matching connector set. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:401)

**Acceptance criteria**

1. Open a released connector on Web: description, publisher, Sign-in row and Tools list show.
2. Open an unconnected catalogued connector: the access sentence and the six consent points show before Connect.
3. Press Connect: a dialog 'Connect <name>?' with Allow and Deny appears before any redirect.
4. Open the same connector on Mobile: tool names, access sentence and 'Before you connect' notes show.
5. Open a connected connector on Web: the capabilities panel loads the live tool list or shows an error.
6. Open links under More info: each opens the provider page.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The fifth consent point covers retention (chat-bound, deleted with the chat). A longer retention policy per provider is not shown.
- [inferred] Per-tool read or write flag comes from the capabilities route (readOnly field) so it exists only after connecting.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show per-tool read/write badges before connecting using the directory record's tool names where annotations are known.
- [proposed] Give VS Code a read-only detail panel or a link to the web detail page.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ConnectorDetailView | `packages/ui/ui/src/directory/ConnectorDetailView.tsx` | Shared detail layout for Web and Desktop. |
| component | ConnectorConsentSummary | `apps/web/features/connectors/components/ConnectorConsentSummary.tsx` | Renders heading and six consent points. |
| component | ConnectorScopeList | `apps/web/features/connectors/components/ConnectorScopeList.tsx` | Access sentence and permissions requested list. |
| component | ConnectorConsentDialog | `apps/web/features/connectors/components/ConnectorConsentDialog.tsx` | Allow or Deny dialog before any redirect. |
| schema | connector trust copy | `packages/contracts/cloud-contracts/src/connector-trust-copy.ts` | Consent points, risk classes, access sentences, health labels. |
| service | scope descriptions | `apps/web/lib/connectors/scope-descriptions.ts` | Turns scopes into plain sentences with read or write. |
| component | ConnectorCapabilitiesPanel | `apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx` | Shows live tools, resources, prompts for a connected connector. |
| endpoint | api:GET /api/connectors/{connectorId}/capabilities | `apps/web/app/api/connectors/[connectorId]/capabilities/route.ts` | Discovers and returns the live capability catalogue. |
| endpoint | api:GET /api/connectors/directory/{id} | `apps/web/app/api/connectors/directory/[...id]` | Returns one directory record for the detail page. |
| service | toConnectorDetail | `apps/web/features/directory/services/connectors-directory.ts` | Builds the detail model from a record. |
| screen | ConnectorDetailScreen (Mobile) | `apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx` | Mobile detail with tools, access note, consent notes. |
| component | ConnectorConsentNotes | `apps/mobile/src/features/settings/cloud-connectors/ConnectorTrustSections.tsx` | Mobile 'Before you connect' card. |
| service | VS Code connector presentation | `apps/extension-vscode/src/features/connectors/connectorPresentation.ts` | Tooltip and scope wording. |
| command | /mcp info and /mcp tools | `apps/cli/src/repl/registry.rs` | CLI inspection of a registered MCP server. |
| test | ConnectorDetailView tests | `packages/ui/ui/src/directory/__tests__/ConnectorDetailView.test.tsx` | Detail view tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Selecting a card loads GET /api/connectors/directory/{id} for the record. | device and our servers | connectors-directory.ts:930-935 |
| Client builds the detail model, adds Connected state, setup and plan notes. | device | connectors-directory.ts:847-887 |
| For a connected connector the page also reads /api/connectors/{id}/capabilities; our server opens an MCP session to the connector's own server and lists tools, resources and prompts. | our servers | capabilities/route.ts:55-85 |
| Tool text from the connector's server is passed through plainMcpServerText before display. | our servers | capabilities/route.ts:91-108 |
| Links open in the browser (Web) or the system browser (Electron via host bridge). | device | ConnectorDetailView.tsx onOpenHref; open-connector-authorization.ts:36-46 for the Electron pattern |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Live capability catalogue (tools, resources, prompts) | Returned with Cache-Control private, no-store; server may keep a catalogue cache (not read) | no | not stored by the route (capabilities/route.ts:118-121) |
| Consent copy | Code constants | Shipped with each app build | n/a |

**Models and providers.** No inference model takes part. The connector's own MCP server provides tool text, which the server treats as untrusted and cleans (capabilities/route.ts:44-48,91-108).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. Capabilities route resolves the user with getUserScopedDb (capabilities/route.ts:65). |
| Permissions | Per-user; no admin role needed to view. Workspace connector policy may hide the connector when evaluated at connect or discovery (apps/web/lib/user-connector-tools.ts:1648-1675). |
| Subscription | Same as F055-01: connectors capability on paid tiers; plan-locked unconnected detail shows the upgrade message (connectors-directory.ts:986-1006). |
| Limits and metering | Capabilities route uses rate bucket chat-conversation (capabilities/route.ts:57). No metering found. |
| Feature flags | Release state and selective list (connector-release.ts). The capabilities route loads with allowSelective true (capabilities/route.ts:67-71). |
| Model compatibility | none found in the code. |
| Provider restrictions | Sensitive-data connectors can be region-refused (apps/web/app/api/connectors/route.ts:203-221). |
| Local mode | No local detail page. Mobile detail needs Cloud mode. VS Code tooltip comes from the cloud list, so signed-out shows a sign-in item (connectorsTree.ts:91-98). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Mobile shows 'Loading tools...'; Web capabilities panel says 'Discovering live MCP capabilities...'. | ConnectorDetailScreen.tsx:1030-1035; ConnectorCapabilitiesPanel.tsx:12 |
| Tools failed | Mobile: 'The tools for <name> did not load. Try again.' with Retry. | ConnectorDetailScreen.tsx:1068-1073 |
| No tools | Mobile: '<name> does not list any tools yet.' Web capabilities panel has a no-capabilities copy. | ConnectorDetailScreen.tsx:1123-1132; ConnectorCapabilitiesPanel.tsx:20 |
| Connector not found | Mobile: 'Connector not found' message. | ConnectorDetailScreen.tsx:838-843 |
| Server unreachable | Capabilities route throws service unavailable 'Connector is temporarily unreachable'. | capabilities/route.ts:73-75 |
| Unknown id | 404 'Connected connector not found' for an id that is not connected; 400 for a bad id pattern. | capabilities/route.ts:61-72 |
| Desktop-only connector in browser | Shows 'Available on desktop and CLI' with download link when released, or a coming soon notice. | ConnectorDetailView.tsx:198-221; connectors-directory.ts:147-160 |
| Offline | Not handled in the code beyond generic fetch errors. | searched detail files |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/directory/__tests__/ConnectorDetailView.test.tsx`: Detail view rendering (by file name).
- `packages/contracts/cloud-contracts/src/__tests__/connector-consent-copy.test.ts`: Consent copy constants (by file name).
- `packages/contracts/cloud-contracts/src/__tests__/connector-scopes.test.ts`: Scope descriptions contract (by file name).
- `apps/web/lib/connectors/__tests__/scope-descriptions.completeness.test.ts`: Scope description completeness (by file name).
- `apps/web/app/api/connectors/[connectorId]/capabilities/route.test.ts`: Capabilities route (by file name).
- `apps/mobile/__tests__/ConnectorDetail.test.tsx`: Mobile detail screen (by file name).
- `apps/mobile/src/features/settings/cloud-connectors/__tests__/ConnectorTrustSections.test.tsx`: Mobile consent and health cards (by file name).
- `apps/extension-vscode/src/__tests__/connectorsView.test.ts`: VS Code connectors tree (by file name).

**Test scenarios**

- **Consent before connect**
  1. Open an unconnected catalogued connector on Web.
  2. Press Connect.
  - Expected: Dialog 'Connect <name>?' shows scopes and six points; Deny closes with no redirect.
- **Access sentence by risk**
  1. Open one read-only and one high-impact connector.
  - Expected: Each shows the matching sentence from the shared copy.
- **Mobile pre-connect**
  1. Open a connector row on Mobile before connecting.
  - Expected: What it can do, tool names, Sign-in row and Before you connect notes show.
- **Live tools**
  1. Open a connected connector on Web.
  - Expected: Capabilities panel lists tools or shows an error when the server is unreachable.
- **Plan-locked detail**
  1. Open an unconnected connector on a tier without connectors.
  - Expected: No connect action; upgrade message as note.

**Where to look when it fails**

- 503 'Connector is temporarily unreachable' from capabilities route.
- discoveryErrors field of the capability response.
- Check apps/web/lib/connectors/scope-descriptions.ts for missing scope text.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/055-connector-setup-and-account-management.md](../../70-qa/test-plans/web/055-connector-setup-and-account-management.md)
- Desktop: [70-qa/test-plans/desktop/055-connector-setup-and-account-management.md](../../70-qa/test-plans/desktop/055-connector-setup-and-account-management.md)
- Mobile: [70-qa/test-plans/mobile/055-connector-setup-and-account-management.md](../../70-qa/test-plans/mobile/055-connector-setup-and-account-management.md)
- CLI: [70-qa/test-plans/cli/055-connector-setup-and-account-management.md](../../70-qa/test-plans/cli/055-connector-setup-and-account-management.md)
- VS Code: [70-qa/test-plans/vscode/055-connector-setup-and-account-management.md](../../70-qa/test-plans/vscode/055-connector-setup-and-account-management.md)

## 10. Gaps and dependencies

- **Brief marks Mobile operation list, read/write note and retention as missing but the code has them.** Affects: Testers using the brief. Evidence: ConnectorDetailScreen.tsx:1176-1315. Work needed: Update the brief; live check on a device.
- **Retention is explained only as one consent point, not per connector or with a duration.** Affects: All apps. Evidence: connector-trust-copy.ts:29-33. Work needed: Owner decision on whether per-connector retention text is needed.
- **VS Code and CLI have no detail page.** Affects: VS Code, CLI users. Evidence: connectorPresentation.ts:62-70. Work needed: Link to the web detail page or add a view.
- **Brief says only three of six consent points were reviewed; code has six.** Affects: Documentation. Evidence: connector-trust-copy.ts:8-34. Work needed: Review the remaining three against leader wording.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- F055-01
- F055-03
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- file:packages/contracts/cloud-contracts/src/connector-trust-copy.ts

## Unknown

- Whether the live capability list works for the 13 released connectors against real servers (no run record).
- Exact retention length for data a connector returns; copy says it follows chat retention and the chat retention policy was not traced.
- Which per-connector links the directory record fills in.
- Test contents; files not opened.
