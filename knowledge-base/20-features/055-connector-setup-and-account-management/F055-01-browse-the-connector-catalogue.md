---
id: "F055-01"
type: "feature"
title: "Browse the connector catalogue"
aliases: ["Connector directory", "Connector catalogue", "Connectors list", "Directory, Connectors section", "MCP directory (public web page /connectors/mcp-directory)", "S55.01", "S55.02", "S55.03"]
area: "55 Connector setup and account management"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "n/a", chrome: "n/a"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S55.01", "S55.02", "S55.03"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "SYS-connectors-plugins-and-skills", "SYS-api-and-contracts", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-execution-boundaries", "SYS-shared-ui-and-design", "file:packages/contracts/types/src/connector-release.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F055-01 Browse the connector catalogue

Lets a person browse the connectors they could add to AGI Workforce (Gmail-style apps and MCP servers), with name, publisher and state, then narrow the list by search text or category. Works on Web, the Electron Desktop (same hosted web UI) and Mobile. CLI has no catalogue. Today every connector shows as coming soon except 13 named ones.

Area: [55. Connector setup and account management](README.md). Requirement items: [S55.01](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5501), [S55.02](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5502), [S55.03](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5503).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 3) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows a paged list of connector records with name, publisher, description, badge (first-party, official, verified, community), category and a state label (Connected, Needs setup, Desktop and CLI, Not available yet, Coming soon). A search box and category chips narrow it server-side. (apps/web/app/api/connectors/directory/route.ts:50-113; apps/web/features/directory/services/connectors-directory.ts:256-310)

**Why it exists.** A person cannot connect an app they cannot find. The Should lines in the brief require a signed-in user to browse, search and filter a catalogue (doc: knowledge-base/data/area-briefs/055-connector-setup-and-account-management.md S55.01-S55.03). docs/product/requirements.md section 16.7 lists Directory, Search and Categories as required connector features (doc: docs/product/requirements.md:1352-1360).

**Who uses it.** Any signed-in person on Web, Desktop (Electron shows the hosted web app, doc: AGENTS.md section 5) or Mobile who wants to add an app to the assistant. Support staff and testers use it to check what is offered.

**Problems it solves**

- Finding which apps can be connected without knowing the exact name (search matches name, publisher, tool names and description, in that rank order). (apps/web/app/api/connectors/directory/route.ts:31-49)
- Hiding unchecked or risky listings: by default only first-party and hand-checked connectors are listed; money-moving connectors that are not hand-checked and non-first-party API-key connectors are excluded. (apps/web/lib/connectors/directory/listing.ts:75-100)
- Telling the person why something cannot be connected yet (coming soon, needs setup, desktop only, plan upgrade). (apps/web/features/directory/services/connectors-directory.ts:256-269)

**Use cases**

- A person opens Settings, then Connectors, types a tool name and picks the matching connector.
- A person on Mobile taps a category chip to see only one category.
- A person on a plan without connectors opens Connectors and sees an Upgrade notice instead of a connect button.
- A tester checks that an unreleased connector shows Coming soon, not Connect.

## 2. User experience

**Where to find it**

- Web: Settings modal, Connectors section (apps/web/features/settings/components/WebSettingsModal.tsx:226-233,332); also the page /connectors (apps/web/app/connectors/page.tsx) and the public page /connectors/mcp-directory (apps/web/app/connectors/mcp-directory/page.tsx).
- Desktop (Electron): the same hosted web Settings, Connectors section (doc: AGENTS.md section 5). A separate Tauri desktop gallery exists in apps/desktop/src/features/connectors/ConnectorGallery.tsx but AGENTS.md says Tauri is retained internal code, so it is not the public Desktop.
- Mobile: Settings, Connectors screen titled Connectors (apps/mobile/src/features/settings/cloud-connectors/index.tsx:832; routes apps/mobile/app/(app)/connectors/index.tsx).
- CLI: no catalogue. agi connectors lists connected connectors and the ids 'Available to connect' (apps/cli/src/cloud/connectors.rs:176-215; apps/cli/src/lib.rs:1029-1032).
- VS Code: tree view of connected connectors only, no catalogue (apps/extension-vscode/src/features/connectors/connectorsTree.ts). Chrome: not covered.

**Before you start**

- A signed-in account to see connection state; the directory endpoint itself reads no session (apps/web/app/api/connectors/directory/route.ts:115-157).
- Web and Desktop: the plan must include the connectors capability, otherwise entries are locked and an Upgrade button shows (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:446-450,1273-1289).
- Mobile: feature flag connectors on, signed in with Clerk, app mode Cloud, and the canUseConnectors capability granted (apps/mobile/src/features/settings/cloud-connectors/index.tsx:519-566; apps/mobile/lib/v1FeatureFlags.ts:18).

**Screens and controls**

- Search box with placeholder 'Search connectors', debounced 250 ms (packages/ui/ui/src/directory/constants.ts:60,386; packages/ui/ui/src/directory/DirectoryToolbar.tsx:105-110).
- Filter groups: connection state All / Connected / Not connected, Type (for example Community), category facets (apps/web/features/directory/services/connectors-directory.ts:457-512).
- Category names in the code are Code, Communication, Data, Design, Financial services, Health, Legal, Life sciences, Productivity, Sales and marketing, Other (packages/contracts/cloud-contracts/src/connector-directory.ts:19-31). There is no category called Developer.
- Cards show badge, state label, Connected mark. Load-more for paging, page size 100 (apps/web/features/directory/constants.ts:182).
- Mobile: horizontal filter chips with accessibility label '<name> connectors', search bar at the bottom (apps/mobile/src/features/settings/cloud-connectors/index.tsx:1036-1050).

**Journey**

1. Open Settings, then Connectors (Web, Desktop) or Settings, then Connectors (Mobile).
2. The list loads; a spinner labelled 'Loading directory' shows meanwhile (packages/ui/ui/src/directory/constants.ts:70).
3. Type in the search box; after 250 ms the app asks the server again with the text.
4. Pick a category chip or a Type filter; the list is requested again with that filter.
5. Scroll and press load more for the next page.
6. Open a card to reach the detail page (F055-02).

**What the person sees and gets**

- Count line such as 'N connectors', or an indexing variant while the directory is still being built (apps/web/features/directory/constants.ts:219; apps/web/features/directory/services/connectors-directory.ts:448-455).
- Short-list notice: 'This list is short because only connectors we have checked by hand are listed by default. Choose Type, then Community, to see unchecked listings.' (apps/web/features/directory/services/connectors-directory.ts:104-105)
- Empty copy 'No connectors match this search.' and 'Nothing matches these filters.' (packages/ui/ui/src/directory/constants.ts:66,83).
- Mobile: 'Could not load connectors. Retry.' and 'Could not load the connector directory. Retry.' (index.tsx:477,614); 'The directory is still being indexed. Try again shortly.' (index.tsx:410).

**Settings**

- Toggle that includes local (desktop and CLI only) connectors in the list; off by default so only connectable ones show (apps/web/features/directory/services/connectors-directory.ts:402-415).
- Mobile always requests connectableOnly (apps/mobile/services/connectors.ts:158-167).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Directory API with search ranking, badge, category, connectable and auth filters, cursor paging and a category list that only names categories with entries. (apps/web/app/api/connectors/directory/route.ts:50-148)
- Shared directory UI used by Web and Electron Desktop with debounced search and facets. (packages/ui/ui/src/directory/DirectoryPanel.tsx:124-148; packages/ui/ui/src/directory/DirectoryToolbar.tsx:105-110)
- Release lock: while connector release state is coming_soon, every entry not on the selective list shows connectableMode coming-soon. (apps/web/features/connectors/lib/connector-release-lock.ts:19-24; packages/contracts/types/src/connector-release.ts:14-50)
- Plan lock: when the capability decision is requires_upgrade, entries not already connected become non-installable and an Upgrade button shows. (apps/web/features/directory/services/connectors-directory.ts:961-1043; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:448-450,1289)
- Mobile browse with server-side search and category and a local filter of the connected list. (apps/mobile/services/connectors.ts:158-167; apps/mobile/src/features/settings/cloud-connectors/index.tsx:514-519,768-793)

**Incomplete**

- The connected-state load fails soft: fetchConnectedConnectors returns empty sets on a non-OK response, so a failed connected call shows everything as not connected without an error. (apps/web/features/directory/services/connectors-directory.ts:889-897)
- Brief says CLI is missing; the CLI shows only account-connected ids and available ids, no search or categories. (apps/cli/src/cloud/connectors.rs:176-215)

**Present but disconnected or switched off**

- Connector release state is the constant coming_soon, so on every app all connectors except 13 (airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notion, posthog, sentry, todoist) show as coming soon. (packages/contracts/types/src/connector-release.ts:14-30)
- Mobile shows a waitlist placeholder when the connectors feature flag is off; the flag is currently true. (apps/mobile/src/features/settings/cloud-connectors/index.tsx:859; apps/mobile/lib/v1FeatureFlags.ts:18)

**Not available**

- CLI: no catalogue, search or category filter (apps/cli/src/lib.rs:1029-1032,1275-1284).
- VS Code: no catalogue; the tree lists connected connectors and opens the web app to add more. (apps/extension-vscode/src/features/connectors/connectorsTree.ts:123-135)
- Chrome extension: no connector catalogue found in the files read; the extension only reads the capability document to lock connectors. (apps/extension/src/features/cloud-bridge/capabilityDocument.ts:82-83)

## 4. Required behaviour

**Established requirements**

- A signed-in user can browse a catalogue of connectors with each entry's name, publisher and state. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.01)
- Typing in the search box narrows the catalogue by name, publisher, tools or description. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.02)
- The catalogue can be filtered by category. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.03)
- The product must include a directory, search and categories for connectors. (source: doc: docs/product/requirements.md:1352-1360)
- Unreleased connectors show as not available, not as connectable (the code enforces it). (source: packages/contracts/types/src/connector-release.ts:52-58)

**Acceptance criteria**

1. With the release state unchanged, searching for a connector not on the 13-id list shows it with Coming soon and no Connect action.
2. Searching for a tool name of a listed connector returns that connector.
3. Selecting a category chip returns only entries that carry that category and the chip list shows only categories that have entries.
4. With the directory call failing, the list shows an error notice with a retry, not an empty list (Mobile; Web needs a check, see unknowns).
5. A person on a plan without the connectors capability sees an Upgrade button and no Connect on unconnected entries.
6. Mobile in Local app mode shows a banner to switch to Cloud and no list.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The directory data is public by design because the route sets public cache headers and reads no session, so the 'signed-in only' line is met by where the screen lives, not by the API.
- [inferred] Search runs on the server, not on a loaded copy, because the UI sends the text in the request. The brief's phrase 'on the loaded catalogue' does not match the code.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show an explicit error notice on Web when the connected-state call fails instead of treating all as not connected.
- [proposed] Add a CLI search over the directory (agi connectors search) if parity with the other apps is wanted.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | api:GET /api/connectors/directory | `apps/web/app/api/connectors/directory/route.ts` | Filters, ranks and pages directory records; sets public cache headers. |
| service | connectors-directory service | `apps/web/features/directory/services/connectors-directory.ts` | Maps records to cards, builds the request URL, state labels, plan lock. |
| service | directory listing rules | `apps/web/lib/connectors/directory/listing.ts` | Decides which records are eligible and in the default list. |
| service | directory snapshot cache | `apps/web/lib/connectors/directory/memory-cache.ts` | Serves the in-memory snapshot view the route reads. |
| service | categorize | `apps/web/lib/connectors/directory/categorize.ts` | Assigns up to three categories from keywords. |
| schema | ConnectorDirectoryQuerySchema and categories | `packages/contracts/cloud-contracts/src/connector-directory.ts` | Shared query shape and the category list. |
| component | DirectoryPanel | `packages/ui/ui/src/directory/DirectoryPanel.tsx` | Shared list screen with loading, error, empty and paging. |
| component | DirectoryToolbar | `packages/ui/ui/src/directory/DirectoryToolbar.tsx` | Search box and filter controls. |
| hook | useConnectorsSettingsAdapter | `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Feeds the directory with connected rows, plan lock and release lock. |
| service | connector release lock | `apps/web/features/connectors/lib/connector-release-lock.ts` | Marks unreleased entries as coming soon. |
| config | CONNECTOR_RELEASE_STATE | `packages/contracts/types/src/connector-release.ts` | Release state and the selective release id list. |
| screen | Mobile Connectors screen | `apps/mobile/src/features/settings/cloud-connectors/index.tsx` | Mobile list, chips, search, gating banners. |
| service | Mobile connector service | `apps/mobile/services/connectors.ts` | browseConnectorListings and runtime wiring. |
| service | client-runtime connector runtime | `packages/client/client-runtime/src/connectors/runtime.ts` | Shared loader for directory and policy used by Mobile. |
| command | agi connectors | `apps/cli/src/lib.rs` | CLI list of connected and available ids (Command::Connectors). |
| service | CLI connector client | `apps/cli/src/cloud/connectors.rs` | Fetches /api/connectors and renders the list. |
| component | VS Code connectors tree | `apps/extension-vscode/src/features/connectors/connectorsTree.ts` | Tree of connected connectors; opens web to add. |
| component | Tauri ConnectorGallery (internal) | `apps/desktop/src/features/connectors/ConnectorGallery.tsx` | Internal desktop gallery, not the public Desktop. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens Connectors; the Settings adapter loads the connected list, custom connectors and account state. | device and our servers | apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:516-575 |
| The directory panel asks GET /api/connectors/directory with search, badge, category, connectableOnly, sort, limit, cursor. | device and our servers | apps/web/features/directory/services/connectors-directory.ts:419-445 |
| Server rate-limits the call, parses the query (400 INVALID_QUERY if invalid), reads the cached snapshot, filters, ranks and pages. | our servers | apps/web/app/api/connectors/directory/route.ts:115-148 |
| The snapshot itself is built from registries and probes ahead of time, not per request. | our servers | apps/web/lib/connectors/directory/memory-cache.ts; apps/web/lib/connectors/directory/ingest.ts (names only; ingest internals not read) |
| Client wraps entries with Connected and state labels and applies the release lock and plan lock. | device | apps/web/features/directory/services/connectors-directory.ts:281-310; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1266-1271 |
| On failure the server returns 503 CONNECTOR_DIRECTORY_UNAVAILABLE and logs 'Connector directory list failed'. | our servers | apps/web/app/api/connectors/directory/route.ts:160-170 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Directory snapshot of connector records (name, publisher, tool names, categories, auth mode) | Server memory cache and a snapshot cache (apps/web/lib/connectors/directory/snapshot-cache.ts) | Built on the server; clients only read pages | unknown (cache lifetime not read) |
| Responses cached by browser and CDN | Cache-Control public max-age 60, CDN max-age 3600 | no | Expires by the cache headers (apps/web/app/api/connectors/directory/route.ts:150-158) |
| Search text and category choice | Component state only | no | Dropped when the screen closes |

**Models and providers.** No language model takes part in browsing. Providers here are the connector providers named in the catalogue, not inference providers. [inferred] from the route and service reading only directory data.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Directory route reads no session (apps/web/app/api/connectors/directory/route.ts:115-157). Connected state needs a signed-in account (apps/web/app/api/connectors/route.ts:233-245). Mobile needs Clerk sign-in (index.tsx:519). |
| Permissions | None for browsing. Workspace connector policy applies at connect time, not at browse (F055-03). |
| Subscription | Connectors capability is allowed for tiers basic, pro, max, max_15x, team, team_premium and enterprise; other tiers get the plan lock (packages/contracts/types/src/billing-catalog.ts:332-351). Capability handshake removes canUseConnectors when the tier lacks it (apps/web/lib/services/capability-handshake-service.ts:114-120). |
| Limits and metering | Directory route uses rate-limit bucket chat-conversation (route.ts:116). No usage metering found for browsing. |
| Feature flags | CONNECTOR_RELEASE_STATE = coming_soon and the 13-id selective list (connector-release.ts:14-30); mobile FEATURES.connectors; kill-switch capability canUseConnectors (apps/web/lib/connectors/connector-capability.ts:35-40). |
| Model compatibility | none found in the code; browsing is independent of the chat model. |
| Provider restrictions | none found in the code for browsing. Sensitive-data connectors are region restricted at connect time and removed from the available list (apps/web/app/api/connectors/route.ts:203-221). |
| Local mode | Web and Electron Desktop show the hosted cloud list; there is no local catalogue. Mobile shows a CloudSyncBlockedBanner in Local app mode and does not load the list (index.tsx:519,861-863). CLI agi connectors requires the capability and a cloud sign-in (lib.rs:7377-7388). Browsing needs the network [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner labelled 'Loading directory'; page marked aria-busy. | packages/ui/ui/src/directory/DirectoryPanel.tsx:531,914 |
| Empty (no match) | Shows 'No connectors match this search.' or 'Nothing matches these filters.' | packages/ui/ui/src/directory/constants.ts:66,83 |
| None connected | 'No connectors connected yet.' with hint 'Choose All to browse the catalogue.' | apps/web/features/directory/services/connectors-directory.ts:480-481 |
| Error | Panel shows error with Retry (data.retry); Mobile shows red notice with Retry. | packages/ui/ui/src/directory/DirectoryPanel.tsx:997-1003; index.tsx:477 |
| Directory still indexing | Count label switches to an indexing variant; Mobile shows an indexing note. | apps/web/features/directory/services/connectors-directory.ts:448-455; index.tsx:410 |
| Coming soon | Entry shows Coming soon, no connect. | apps/web/features/connectors/lib/connector-release-lock.ts:19-24 |
| Plan without connectors | Entries not installed are not installable; Upgrade button; a plan notice shows if nothing is connected. | useConnectorsSettingsAdapter.tsx:1273-1289 |
| Offline | Not handled in the code beyond the generic fetch error path (no offline-specific copy found). | searched DirectoryPanel.tsx and index.tsx |
| Account switch on Mobile | Operations carry an account epoch so stale results from a previous account are ignored. | apps/mobile/services/connectors.ts:107-117 |
| Accessibility | Search has aria-label equal to the placeholder; Mobile chips have accessibilityState selected. | DirectoryToolbar.tsx:109-110; index.tsx:1046-1050 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/connectors/directory/route.test.ts`: Directory route (by file name; contents not opened).
- `apps/web/features/directory/__tests__/connectors-directory.test.ts`: Directory service mapping (by file name).
- `apps/web/features/directory/__tests__/connectors-directory.plan-lock.test.ts`: Plan lock of the connectors section (by file name).
- `apps/web/lib/connectors/directory/__tests__/categorize.test.ts`: Category assignment (by file name).
- `apps/web/lib/connectors/__tests__/connector-release.test.ts`: Release state rules (by file name).
- `apps/web/lib/connectors/__tests__/connector-selective-release.test.ts`: Selective release of named connectors (by file name).
- `packages/contracts/cloud-contracts/src/__tests__/connector-directory.test.ts`: Directory contract (by file name).
- `apps/mobile/__tests__/ConnectorCategoryChips.test.tsx`: Mobile category chips (by file name).
- `apps/mobile/__tests__/ConnectorsBottomSearch.test.tsx`: Mobile search bar (by file name).
- `apps/mobile/__tests__/CloudConnectorsPage.test.tsx`: Mobile Connectors page (by file name).

**Test scenarios**

- **Search by tool name**
  1. Sign in on Web, open Settings, Connectors.
  2. Type a tool name of a listed connector.
  3. Wait 250 ms.
  - Expected: List narrows to connectors whose tool names, name, publisher or description match; best matches first.
- **Category filter**
  1. Open Connectors.
  2. Pick a category chip.
  - Expected: Only entries with that category show; chips list only categories with entries.
- **Unreleased connector**
  1. Search a connector not in the 13-id list.
  2. Open it.
  - Expected: Coming soon shown; no Connect or Add API key action.
- **Plan lock**
  1. Sign in with an account whose tier lacks the connectors capability.
  2. Open Connectors.
  - Expected: Upgrade button; unconnected entries are not installable.
- **Mobile Local mode**
  1. On Mobile switch app mode to Local.
  2. Open Settings, Connectors.
  - Expected: Banner offering to switch to Cloud; no list.
- **Directory failure**
  1. Make GET /api/connectors/directory return 503.
  - Expected: Error with retry; no silent empty list.

**Where to look when it fails**

- Log line 'Connector directory list failed' and error code CONNECTOR_DIRECTORY_UNAVAILABLE (route.ts:160-170).
- 400 INVALID_QUERY from the route for a bad query.
- Compare GET /api/connectors available list with the directory to see why an entry is locked.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/055-connector-setup-and-account-management.md](../../70-qa/test-plans/web/055-connector-setup-and-account-management.md)
- Desktop: [70-qa/test-plans/desktop/055-connector-setup-and-account-management.md](../../70-qa/test-plans/desktop/055-connector-setup-and-account-management.md)
- Mobile: [70-qa/test-plans/mobile/055-connector-setup-and-account-management.md](../../70-qa/test-plans/mobile/055-connector-setup-and-account-management.md)

## 10. Gaps and dependencies

- **All connectors except 13 are coming soon because the release state constant is coming_soon.** Affects: Web, Desktop, Mobile users. Evidence: packages/contracts/types/src/connector-release.ts:14-30. Work needed: Owner decision to change the release state; then verify live per connector.
- **Directory API reads no session while the brief says signed-in only.** Affects: Security reviewers; public visitors. Evidence: apps/web/app/api/connectors/directory/route.ts:115-157. Work needed: Decide whether public directory data is intended (a public page exists) and record it.
- **No catalogue on CLI, VS Code or Chrome.** Affects: CLI and VS Code users. Evidence: apps/cli/src/lib.rs:1275-1284; connectorsTree.ts:123-135. Work needed: Add a catalogue or document that these apps hand off to the web.
- **Brief names a Developer category; code has Code.** Affects: Testers following the brief. Evidence: packages/contracts/cloud-contracts/src/connector-directory.ts:19-31. Work needed: Correct the brief wording.
- **Failed connected-state call is silent on Web (empty sets).** Affects: Web and Desktop users. Evidence: connectors-directory.ts:889-897. Work needed: Surface an error or retry.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- SYS-connectors-plugins-and-skills
- SYS-api-and-contracts
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-execution-boundaries
- SYS-shared-ui-and-design
- file:packages/contracts/types/src/connector-release.ts

## Unknown

- Whether Web shows an error notice when the connected-state call fails (code returns empty sets; UI effect not traced).
- Snapshot cache lifetime and refresh job (memory-cache.ts, snapshot-cache.ts not read in detail).
- Exact test contents; test files were listed, not opened or run.
- Whether the Tauri gallery is shipped to anyone.
- Whether a free tier id exists in the plan list and what it is called.
