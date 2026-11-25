---
id: "F056-11"
type: "feature"
title: "Consumer services not built yet"
aliases: ["Consumer services not built yet", "S56.40 Licensed research retrieval", "S56.41 Shopping/product lookup", "S56.42 Reservations and bookings", "S56.43 Media playback", "S56.44 Native messaging applications"]
area: "56 Concrete integration families"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S56.40", "S56.41", "S56.42", "S56.43", "S56.44"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "mode:cloud", "surface:web", "surface:mobile", "surface:desktop", "surface:chrome", "surface:cli", "surface:vscode", "file:packages/contracts/types/src/connector-release.ts"]
basis: "code inspection"
second_reader: "6 of 10 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F056-11 Consumer services not built yet

Planned connections to licensed research, shopping, bookings, media playback and messaging apps (iMessage, SMS, WhatsApp, Telegram). No finished connector exists for any of them. The directory lists some vendors, but the release gate keeps them off, and the messaging catalog entries cannot be connected. Native messaging code was not found.

Area: [56. Concrete integration families](README.md). Requirement items: [S56.40](../../10-requirements/capabilities/056-concrete-integration-families.md#s5640), [S56.41](../../10-requirements/capabilities/056-concrete-integration-families.md#s5641), [S56.42](../../10-requirements/capabilities/056-concrete-integration-families.md#s5642), [S56.43](../../10-requirements/capabilities/056-concrete-integration-families.md#s5643), [S56.44](../../10-requirements/capabilities/056-concrete-integration-families.md#s5644).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Nothing is promised to users yet. The aim is for the assistant to retrieve licensed research, look up products, make bookings, control media and read or send messages through connected services.

**Why it exists.** ChatGPT and Claude are moving toward consumer actions; the brief lists these as wave 3 items that are not built (doc: audit/partial/056-concrete-integration-families.md).

**Who uses it.** No one today. Intended for consumers on paid managed plans.

**Problems it solves**

- Not applicable yet.
- Future: ordering, booking and messaging from chat.
- Future: reading licensed research the user already pays for.

**Use cases**

- Future: 'book a table for two on Friday'.
- Future: 'play my focus playlist'.
- Future: 'send this to Sam on WhatsApp'.
- Future: 'summarise the licensed report I have access to'.

## 2. User experience

**Where to find it**

- Web, Desktop (hosted web) and Mobile: the connector directory may list vendors such as Booking.com, Expedia, Spotify, Instacart, Taskrabbit and Twilio from a vendor snapshot (apps/web/lib/connectors/directory/sources/vendor-directory.json); they read 'Coming soon' while unreleased (mobile index.tsx:162-164).
- Web Connectors settings catalog lists Telegram, WhatsApp and Twilio as api-key entries (apps/web/features/connectors/data/connectors.ts:637-662).
- CLI, VS Code, Chrome: nothing.

**Before you start**

- None can be met: no working connector exists in the code read.

**Screens and controls**

- Directory cards that read 'Coming soon' or show a setup message such as 'has no remote MCP server this deployment can reach' (apps/web/lib/connectors/oauth-setup.ts:155-162).
- The web Settings catalog gives telegram, whatsapp and twilio a build phase (3 or 4) and capability summaries such as 'message sending', which can read as promises while the gate and missing endpoint block connecting [apps/web/features/connectors/data/connectors.ts:637-662].

**Journey**

1. A person browsing Connectors sees a vendor card.
2. They cannot connect it; the card says Coming soon or setup is needed.
3. Asking the assistant for the action reaches no connector tool.

**What the person sees and gets**

- 'Coming soon' label (connector-release.ts:38).
- Setup requirement message from the server.

**Settings**

- None specific.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Directory listing and 'Coming soon' labelling for these vendors exist as part of the general connector directory (apps/web/lib/connectors/directory/; mobile index.tsx:162).
- General custom remote MCP connectors exist, which could reach a vendor that publishes an MCP server, but they are dropped today because dialPermitted calls connectorReleased on their custom or org-shared server ids (user-connector-tools.ts:2491, 2598, 2618), and those ids are not among the 13 released ids.

**Incomplete**

- Telegram, WhatsApp and Twilio are catalog entries with api-key auth (catalog.ts:226-228) but no MCP endpoint, so describeConnectorSetup reports no remote server (oauth-setup.ts:155-162).
- The vendor snapshot lists Booking.com, Expedia, Spotify, Instacart and Taskrabbit with MCP URLs, but nothing in AGI declares tool metadata or approval rules for booking, purchase or playback actions.
- Telegram, WhatsApp and Twilio already have declared risk classes (telegram read-write, whatsapp and twilio high-impact) and display names, a pre-wired classification, though no tool exists to use it [apps/web/lib/connectors/mcp-endpoints.ts:117-119,220-221].

**Present but disconnected or switched off**

- All of these ids are outside the 13 released connectors (connector-release.ts:16-30), so their tools never reach a turn.

**Not available**

- Native messaging (iMessage, SMS, WhatsApp, Telegram): no integration code found in apps, packages or crates (searched for iMessage; the only matches were unrelated names ending in UiMessage).
- Licensed research retrieval: no connector or tool found; PitchBook appears in the vendor snapshot with no MCP URL.
- Media playback: Spotify appears in the snapshot with a pilot gateway URL only; no tool code.
- All apps: CLI and VS Code have no connector of their own.

## 4. Required behaviour

**Established requirements**

- The assistant can retrieve content from licensed research sources through a connected account. (source: brief S56.40)
- The assistant can look up products and prices through a connected shopping service. (source: brief S56.41)
- The assistant can search for and make reservations or bookings through a connected service. (source: brief S56.42)
- The assistant can control media playback in a connected media service. (source: brief S56.43)
- The assistant can read or send messages in native messaging apps on the user's behalf. (source: brief S56.44)
- Connectors stay 'coming soon' until the release state changes. (source: doc: docs/product/definition.md:309)

**Acceptance criteria**

1. No page, label or assistant answer claims that bookings, shopping, playback or messaging work.
2. Directory cards for these vendors cannot be connected while unreleased.
3. Asking the assistant to send a WhatsApp message does not run any connector tool and the assistant says it cannot.
4. Any future build declares tool metadata (read or external send) before it can be offered.
5. A future messaging or booking send always asks for approval and is irreversible-class (matches tool-metadata.ts external_send rules).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Anything that sends a message, books or buys is an external send or irreversible write and must ask every time [inferred from tool-metadata.ts:933-939 risk tiers].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Write a design and approval rules per family before any build, as the brief row states.
- [proposed] Keep these ids out of public copy until released.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | CONNECTOR_CAPABILITIES | `apps/web/lib/connectors/catalog.ts` | telegram, whatsapp, twilio api-key entries (lines 226-228). |
| config | web connector catalog | `apps/web/features/connectors/data/connectors.ts` | Settings catalog entries for telegram, whatsapp, twilio (lines 637-662), with a build phase (3 or 4) and capability summaries such as 'message sending'. |
| config | vendor-directory.json | `apps/web/lib/connectors/directory/sources/vendor-directory.json` | Vendor snapshot with booking, shopping and media vendors. |
| service | oauth-setup | `apps/web/lib/connectors/oauth-setup.ts` | Reports no remote server for entries without an endpoint. |
| config | mcp-endpoints.ts | `apps/web/lib/connectors/mcp-endpoints.ts` | Declares risk classes (telegram read-write, whatsapp and twilio high-impact) and display names (lines 117-119, 220-221). |
| config | connector-release.ts | `packages/contracts/types/src/connector-release.ts` | Gate that keeps these ids off. |
| screen | Connectors screen (mobile) | `apps/mobile/src/features/settings/cloud-connectors/index.tsx` | Shows 'Coming soon' for unreleased rows (line 162); the label is applied client-side from connectorReleased. |
| service | directory listing | `apps/web/lib/connectors/directory/listing.ts` | Builds directory listings from the snapshot. |
| service | connectable | `apps/web/lib/connectors/directory/connectable.ts` | Computes only the connectable mode per entry (connect, needs-setup, unavailable, desktop-and-cli, api-key-form); it ignores the release gate. |
| service | loadUserConnectorToolCatalog | `apps/web/lib/user-connector-tools.ts` | Skips unreleased ids (lines 2537, 2572). |
| config | billing-catalog.ts | `packages/contracts/types/src/billing-catalog.ts` | Per-plan maxConnectorTools caps (lines 571-722), read by getPlanMaxConnectorTools (812-813). |
| service | tool-metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Would need declared metadata for any future send, booking or purchase tool. |
| endpoint | GET /api/connectors/directory | `apps/web/app/api/connectors/directory/route.ts` | Directory listing endpoint. |
| test | connector-release test | `packages/contracts/types/src/__tests__/connector-release.test.ts` | Keeps unlisted ids unreleased. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person opens Connectors and sees a vendor card; on mobile the Coming soon label is applied on the client from connectorReleased. | device | apps/mobile/src/features/settings/cloud-connectors/index.tsx:162 |
| The server builds the listing and computes only the connectable mode (connect, needs-setup, unavailable, desktop-and-cli or api-key-form); it ignores the release gate. | our servers | apps/web/lib/connectors/directory/connectable.ts:9-30 |
| Nothing further runs: unreleased ids are skipped when the tool catalog is built. | our servers | apps/web/lib/user-connector-tools.ts:2537, :2572 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Directory snapshot of vendors | File in the repository (vendor-directory.json) | Shipped with the web app | Replaced when the snapshot is refreshed |

**Models and providers.** No model or provider takes part because no tool is offered.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Browsing the directory needs the same signed-in access as other connectors; nothing can be connected. |
| Permissions | none found in the code for these services. |
| Subscription | Connectors capability on paid managed plans (billing-catalog.ts:351); no service-specific rule found. |
| Limits and metering | Connector tools are capped per plan by maxConnectorTools (billing-catalog.ts:571-722; read by getPlanMaxConnectorTools at 812-813, applied via resolveConnectorToolLimit at user-connector-tools.ts:2441). No service-specific limit exists. |
| Feature flags | connector-release.ts state and ids. |
| Model compatibility | not applicable. |
| Provider restrictions | Vendors Telegram, WhatsApp, Twilio have no reachable MCP endpoint in AGI's records. |
| Local mode | Not available. No local messaging, playback or booking tool was found on Desktop, mobile or CLI; phone steps cover calendar and reminders only (packages/contracts/types/src/phone-steps.ts:5-10). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unreleased vendor | Unreleased, unconnected rows show the Coming soon label (index.tsx:162-163). Blocking of connect is not shown at these lines; the row still has an onPress handler, which was not checked. | apps/mobile/src/features/settings/cloud-connectors/index.tsx:155-170 |
| Entry without MCP endpoint | Server message: no remote MCP server this deployment can reach. | apps/web/lib/connectors/oauth-setup.ts:155-162 |
| Asking the assistant for these actions | No tool exists; the model can only answer in text. A guard that stops the model from claiming it acted was not looked for [unknown]. | no tool offered per user-connector-tools.ts:2537 |
| Offline, retry, cancel, timeout | not applicable; nothing runs. | none |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/connector-release.test.ts`: Ids outside the selective list are not released.
- `apps/web/lib/connectors/__tests__/plugin-connectors.coming-soon.test.ts`: Coming-soon handling for plugin connectors (named for it; body not read in detail).
- `apps/web/app/connectors/page.test.tsx`: Connectors page (named for it; body not read in detail).

**Test scenarios**

- **Vendor card is not connectable**
  1. Open Connectors on web and mobile.
  2. Find Booking.com or Spotify if listed, and Telegram.
  - Expected: None can be connected; labels read Coming soon or a setup message.
- **No false claim**
  1. Ask the assistant to send a WhatsApp message and to book a table.
  - Expected: No connector tool call; the answer states it cannot do it.
- **Gate holds**
  1. Run connector-release.test.ts.
  - Expected: Unlisted ids stay unreleased.

**Where to look when it fails**

- GET /api/connectors/directory shows connectable mode per entry.
- oauth-setup requirement 'no-remote'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/056-concrete-integration-families.md](../../70-qa/test-plans/web/056-concrete-integration-families.md)
- Desktop: [70-qa/test-plans/desktop/056-concrete-integration-families.md](../../70-qa/test-plans/desktop/056-concrete-integration-families.md)
- Mobile: [70-qa/test-plans/mobile/056-concrete-integration-families.md](../../70-qa/test-plans/mobile/056-concrete-integration-families.md)
- Chrome: [70-qa/test-plans/chrome/056-concrete-integration-families.md](../../70-qa/test-plans/chrome/056-concrete-integration-families.md)

## 10. Gaps and dependencies

- **No connector for research, shopping, bookings, media or messaging.** Affects: All apps.. Evidence: No code found; catalog entries lack endpoints (catalog.ts:226-228).. Work needed: Design, approval rules and build per family; owner decision on scope.
- **The brief marks web, desktop, mobile and Chrome as partial or unverified while the code shows only directory listings.** Affects: Audit accuracy.. Evidence: vendor-directory.json entries have no AGI tool code.. Work needed: Correct the status.
- **No native messaging integration of any kind.** Affects: All apps.. Evidence: Search for iMessage found only unrelated names.. Work needed: Decide if in scope; messaging needs per-app OS integration and strict consent.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- mode:cloud
- surface:web
- surface:mobile
- surface:desktop
- surface:chrome
- surface:cli
- surface:vscode
- file:packages/contracts/types/src/connector-release.ts

## Unknown

- Whether any guard stops the model from claiming it sent a message or made a booking when no tool exists.
- Whether the vendor snapshot entries for Booking.com, Expedia, Spotify and Instacart would be connectable through the directory path once released.
- The owner's plan and timing for each family.
- Whether Desktop, CLI or mobile could host native messaging without store policy problems (not researched).

## Second reader's check

A second reader checked 10 statements of this page against the code: 6 correct, 4 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "General custom remote MCP connectors exist ... but they are blocked by the release gate today (user-connector-tools.ts:2491-2493)." The code shows: Lines 2491-2493 are the first checks in dialPermitted (connectorReleased(serverId) false -> not permitted). Custom connectors reach it at 2598 (customServerId, member=true), org-shared at 2618, and 2581. The block holds because custom ids are not in the 13-id list, but the cited lines do not mention custom connectors. (apps/web/lib/user-connector-tools.ts:2491-2493,2581,2598,2618). **Corrected:** Custom remote MCP connectors are dropped because dialPermitted calls connectorReleased on their custom or org-shared server ids (user-connector-tools.ts:2491, 2598, 2618), and those ids are not among the 13 released ids.
- **Partly wrong (section 6):** "The server builds the listing and marks the entry unavailable or needs-setup (connectable.ts:9-30)." The code shows: connectable.ts:9-14 returns 'desktop-and-cli', 'connect', 'unavailable' or 'needs-setup'. It never reads the release gate, so a catalog entry with an endpoint returns 'connect' whether released or not. Lines 16-30 return 'desktop-and-cli', 'connect', 'needs-setup' or 'api-key-form'. 'Coming soon' is applied client-side from connectorReleased (mobile index.tsx:162). (apps/web/lib/connectors/directory/connectable.ts:9-30; apps/mobile/src/features/settings/cloud-connectors/index.tsx:162). **Corrected:** The server computes only the connectable mode and ignores the release gate. The Coming soon label is applied on the client from connectorReleased.
- **Partly wrong (section 8):** "Unreleased vendor: Card reads 'Coming soon'; no connect (mobile index.tsx:162-164)." The code shows: index.tsx:162 sets comingSoon = !row.connection && !connectorReleased(row.routeId); 163 uses it only for the detail text, and the accessibility label at ~168-170. The row still has onPress. These lines do not show that connecting is blocked. (apps/mobile/src/features/settings/cloud-connectors/index.tsx:155-170). **Corrected:** Unreleased, unconnected rows show the Coming soon label (index.tsx:162-163). Blocking of connect is not shown at these lines; check the onPress handler.
- **Wrong (section 7):** "Limits and metering: none found in the code." The code shows: Per-plan connector tool caps exist: maxConnectorTools is 0 on one plan (line 626) and 50/150/500/unlimited/custom on others, read by getPlanMaxConnectorTools (812-813). resolveConnectorToolLimit is used at user-connector-tools.ts:2441. General, not service-specific, but they apply. (packages/contracts/types/src/billing-catalog.ts:533,571-722,812-813; apps/web/lib/user-connector-tools.ts:2441). **Corrected:** Connector tools are capped per plan by maxConnectorTools (billing-catalog.ts:571-722). No service-specific limit exists.

**Facts the page missed**

- Telegram, WhatsApp and Twilio already have declared risk classes (telegram read-write, whatsapp and twilio high-impact) and display names. The page's claim that nothing declares approval rules overlooks this pre-wired classification: apps/web/lib/connectors/mcp-endpoints.ts:117-119,220-221.
- Plan limits apply to connectors: maxConnectorTools caps per plan (packages/contracts/types/src/billing-catalog.ts:571-722,812-813), contradicting the 'none found' limits row.
- The web Settings catalog gives telegram, whatsapp and twilio a build phase (3 or 4) and capability summaries such as 'message sending' (apps/web/features/connectors/data/connectors.ts:637-662), which can read as promises while the gate and missing endpoint block connecting.
