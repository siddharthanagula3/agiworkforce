---
id: "F056-02"
type: "feature"
title: "Calendar (search, free/busy, create, edit, invitations)"
aliases: ["Calendar connector", "Google Calendar connector", "Outlook calendar", "search_events", "suggest_time", "create_event", "S56.07 to S56.11"]
area: "56 Concrete integration families"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S56.07", "S56.08", "S56.09", "S56.10", "S56.11"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-authentication-and-identity", "mode:cloud", "surface:web", "surface:mobile", "surface:desktop", "surface:cli", "surface:vscode", "surface:chrome", "file:apps/web/lib/user-connector-tools.ts", "table:connector_oauth_grants"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F056-02 Calendar (search, free/busy, create, edit, invitations)

Lets the assistant search calendar events, find open time, and create, edit, cancel or answer events on a connected Google Calendar (Outlook can list and create only). All calls currently ask for approval, reads included. Calendar is not released, so no app can use it until it is.

Area: [56. Concrete integration families](README.md). Requirement items: [S56.07](../../10-requirements/capabilities/056-concrete-integration-families.md#s5607), [S56.08](../../10-requirements/capabilities/056-concrete-integration-families.md#s5608), [S56.09](../../10-requirements/capabilities/056-concrete-integration-families.md#s5609), [S56.10](../../10-requirements/capabilities/056-concrete-integration-families.md#s5610), [S56.11](../../10-requirements/capabilities/056-concrete-integration-families.md#s5611).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives chat the Google Calendar tools list_calendars, list_events, get_event, search_events, suggest_time, create_event, update_event, delete_event and respond_to_event from Google's hosted calendar server; Outlook has list_events and create_event through a built-in adapter. [code] (apps/web/lib/connectors/directory/sources/first-party.json:46-67; apps/web/lib/connectors/catalog.ts:176-181)

**Why it exists.** Scheduling is a core assistant job and both leaders connect to Google Calendar. [doc: docs/runbooks/connector-oauth-apps.md]

**Who uses it.** Paid-plan users who connect a calendar on the web app and ask about schedules in chat on any app.

**Problems it solves**

- Checking what is on the calendar without opening it
- Finding a free slot
- Creating or changing an event from a sentence
- Answering a meeting invite

**Use cases**

- What is free on Thursday afternoon
- Move my 3pm meeting to Friday
- Create a call with a named person and send the invite
- Accept the invite from the team lead

## 2. User experience

**Where to find it**

- Web: Settings 'Connectors' tab and /connectors. [code] (packages/ui/ui/src/settings-modal/SettingsModal.tsx:193)
- Desktop (public Electron): the hosted web app. [doc: AGENTS.md section 5] Internal Tauri build: Google Calendar card in its gallery. [code] (apps/desktop/src/features/connectors/connectorDefinitions.ts:80)
- Mobile: Settings 'Connectors'. The phone's own calendar is a different source with tools device_calendar_events, device_calendar_availability and device_calendar_create_event run on the phone. [code] (apps/mobile/src/features/integrations/services/phoneDeviceSteps.ts:254-262; tool-metadata.ts:366-390)
- CLI: 'agi connectors' for list and disconnect; chat tools come from the account. [code] (apps/cli/src/lib.rs:7377)
- VS Code: 'Connectors' tree view. [code] (apps/extension-vscode/package.json:723-734)
- Chrome: attach menu 'Connectors' item. [code] (apps/extension/src/side_panel.ts:14811)

**Before you start**

- Signed in, paid plan, Cloud mode. [code] (billing-catalog.ts:332-351; apps/cli/src/claude_parity.rs:2772-2779)
- google-calendar released and configured (not true today). [code] (connector-release.ts:14-30)
- Connected Google account with calendar.readonly and calendar.events. [code] (connector-scopes.ts:42-45)

**Screens and controls**

- Connect button and consent screen.
- Chat step rows and an approval prompt with Allow once, Allow for this chat, Always allow, Deny. [code] (tool-approval-policy.ts:26-37)
- Approval card shows the call's arguments (title, time, attendees) so the person can review. [code] (apps/extension/src/features/side-panel/bubbles.ts:932-940; apps/cli/src/models/managed_approvals.rs:126-143)

**Journey**

1. Connect Google Calendar.
2. Ask 'what is free Thursday afternoon'.
3. The assistant calls suggest_time or list_events; today this shows an approval prompt because the tools have no declared read class. [code] (tool-metadata.ts:863-875)
4. Ask to create an event; review the proposed title, time and attendees in the prompt.
5. Allow or Deny.
6. The chat shows the step as finished or failed.

**What the person sees and gets**

- Step sentences in the timeline. [code] (connector-step-sentence.ts:136-170)
- Connect card on missing or expired authorization. [code] (connect-required.ts:23-79)
- Outlook create_event warns that an invite goes to each attendee. [code] (microsoft-graph.ts:446-452)

**Settings**

- Approval policy and per-tool Allow/Ask/Deny. [code] (connector-tool-permissions.ts:40-100)
- Per-chat connector off switch. [code] (route.ts:826-830)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Directory declares the nine Google Calendar tools and the OAuth ceiling admits calendar.readonly, calendar.calendarlist.readonly and calendar.events. [code] (first-party.json:46-67; connector-scopes.ts:42-45)
- Outlook adapter has list_events and create_event; create_event is an external send that always asks. [code] (microsoft-graph.ts:364-460; tool-metadata.ts:822-843)
- Google data rule and connect-required handling apply to calendar like Gmail. [code] (google-user-data.ts:19-21)

**Incomplete**

- No tool metadata is declared for google-calendar, so every calendar tool (reads, edits, deletes, responses) is treated as an unknown irreversible write and asks every time, under every approval policy. This contradicts the 'read without approval' expectation. [code] (tool-metadata.ts:863-875, 876-883; packages/contracts/types/src/tool-primitive.ts:163-175)
- Outlook has no free/busy, edit, cancel or invitation-response tool. [code] (catalog.ts:179-181)
- The phone's local calendar tools are separate and not part of this connector. [code] (phoneDeviceSteps.ts:254-262)

**Present but disconnected or switched off**

- google-calendar and outlook are not in the released list; connect and execution are refused on every app. [code] (connector-release.ts:14-30; user-connector-tools.ts:2766-2768)
- Needs descriptor and client pair for google-calendar. [doc: docs/runbooks/connector-oauth-apps.md]

**Not available**

- Local and own-key modes. [code] (apps/cli/src/claude_parity.rs:2775-2779)
- Free plan. [code] (billing-catalog.ts:332-351)
- Brief says CLI 'invitations missing' and VS Code 'create/edit missing'; the code shows no per-app calendar tools, so those splits are unverified. [inferred]

## 4. Required behaviour

**Established requirements**

- The assistant can search the calendar by text or date range. (source: S56.07)
- The assistant can check free/busy time to find open slots. (source: S56.08)
- The assistant can create an event, after approval. (source: S56.09)
- The assistant can edit or cancel an existing event. (source: S56.10)
- The assistant can send meeting invitations and respond to invitations. (source: S56.11)
- Outlook create_event is an external send because each attendee gets an invitation, so it asks under every policy. (source: doc: docs/development/connectors-setup.md)
- The phone's own calendar is a separate source from the connector. (source: audit/partial/056-concrete-integration-families.md)

**Acceptance criteria**

1. With calendar released and connected, 'what is free Thursday afternoon' returns open slots matching the real calendar.
2. Creating an event shows an approval prompt with title, time and attendees; Deny creates nothing.
3. Editing or cancelling an event also asks and changes only the named event.
4. Responding to an invite asks and updates the real invite.
5. With an expired grant a Reconnect card appears and no success is claimed.
6. Read calls follow the documented posture for read tools (see gap on undeclared metadata).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Expected 'read without approval' needs declared read metadata for the calendar read tools. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Declare metadata for search_events, list_events, get_event, list_calendars and suggest_time as reads, update_event and respond_to_event as writes, delete_event as delete.
- [proposed] Add Outlook free/busy and edit tools.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | Directory entry | `apps/web/lib/connectors/directory/sources/first-party.json` | Calendar MCP url and nine tool names. |
| config | Scope ceiling | `packages/contracts/cloud-contracts/src/connector-scopes.ts` | Calendar scopes admitted; full calendar scope forbidden. |
| config | Release gate | `packages/contracts/types/src/connector-release.ts` | Calendar not released. |
| config | Catalog | `apps/web/lib/connectors/catalog.ts` | google-calendar and outlook records with personal source 'calendar'. |
| service | Tool catalog builder | `apps/web/lib/user-connector-tools.ts` | Dials Google Calendar MCP server with the user's token and builds tool defs. |
| config | Tool metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | No google-calendar entry; Outlook entries present; phone calendar tools declared. |
| service | Tool call gate | `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts` | Decides ask or allow. |
| service | Graph adapter | `apps/web/lib/connectors/microsoft-graph.ts` | Outlook list_events and create_event. |
| service | Google data rules | `apps/web/lib/connectors/google-user-data.ts` | Calendar listed as Google user data connector. |
| service | Phone device steps | `apps/mobile/src/features/integrations/services/phoneDeviceSteps.ts` | Phone calendar read, availability and create on the device (separate source). |
| endpoint | Calendar webhook | `apps/web/app/api/webhooks/google-calendar` | Inbound calendar trigger events for routines. |
| screen | Mobile Connectors | `apps/mobile/src/features/settings/cloud-connectors/index.tsx` | Mobile list and release label. |
| command | CLI connectors | `apps/cli/src/cloud/connectors.rs` | List, disconnect, reconnect notice. |
| component | VS Code connectors tree | `apps/extension-vscode/src/features/connectors/connectorsTree.ts` | Account connector list. |
| component | Chrome side panel | `apps/extension/src/side_panel.ts` | Connectors menu item and lock. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person asks in chat; app sends the turn to our servers. | device | route.ts:792-800 |
| Server checks release, plan, kill switch. | our servers | connector-capability.ts:44-67 |
| Server connects to Google's hosted calendar server with the user's token and lists tools, withheld on turns that may train. | our servers | user-connector-tools.ts:2536-2565 |
| Gate asks because the tools are undeclared; the app shows the approval prompt. | device and our servers | tool-metadata.ts:876-883; tool-call-gate.ts:62-130 |
| After approval the call runs on Google's server and the answer returns through our server to the model and device. | outside service | user-connector-tools.ts:2766-2830 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Calendar OAuth grant | table:connector_oauth_grants | Account-wide | Deleted on disconnect |
| Events | Stay in Google Calendar; read content enters the chat transcript | Chat sync | Chat content is marked as Google data and kept on no-training models. [code] (google-user-data.ts:160-175) |
| Call audit events | table:connector_call_events | Account-wide | unknown |

**Models and providers.** Model must support tools and run on a provider that does not train on inputs when Google data is in the chat. [code] (route.ts:792-793; google-user-data.ts:41-49)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account. |
| Permissions | calendar.readonly, calendar.calendarlist.readonly, calendar.events (Outlook: Calendars.Read, Calendars.ReadWrite). [code] (connector-scopes.ts:42-45, 63-67) |
| Subscription | Paid plans only (basic and above). [code] (billing-catalog.ts:332-351) |
| Limits and metering | none found in the code beyond the connector tool-count ceiling per plan. [code] (user-connector-tools.ts:2441) |
| Feature flags | coming_soon release state; kill switch canUseConnectors; workspace policy; per-chat off switch. [code] (connector-capability.ts:31-67) |
| Model compatibility | Tool-capable model; no-training provider for Google data. |
| Provider restrictions | Google data only to no-training providers. [code] (google-user-data.ts:16-18) |
| Local mode | Not offered in Local or own-key sessions (CLI text; plan table; mobile Cloud-only screen). The phone's own calendar tools run on the phone and need calendar permission on the device. [code] (apps/cli/src/claude_parity.rs:2775-2779; phoneDeviceSteps.ts:254-262) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Not released | 'Connectors are coming soon.' on execution; 'Coming soon' label on mobile and Chrome. | user-connector-tools.ts:2766-2768; index.tsx:156-166 |
| Not connected | Calendar tools are not offered. | user-connector-tools.ts:2536-2540 |
| Grant needs reauthorization | A reconnect tool is offered in place of the real tools. | user-connector-tools.ts:2551-2556 |
| Approval refused | Step shows declined; nothing changes. | connector-step-sentence.ts:100-107 |
| Cancel | Tool call cancellation is covered by a test file. | apps/web/lib/__tests__/connector-tool-cancellation.test.ts |
| Timeout, offline, retry | not handled in the code beyond a failed tool result; unknown for Google's server. | not found |
| Invitation to attendees | Outlook text says the user approves each invite before it is created. | microsoft-graph.ts:446-452 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/connector-release.test.ts`: Release switch at gates.
- `apps/web/lib/__tests__/user-connector-tools.google-hosted.test.ts`: Google-hosted connectors withheld on training-capable turns.
- `apps/web/lib/connectors/__tests__/google-user-data.test.ts`: Calendar included in the Google connector set and trigger sources.
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-metadata.contract.test.ts`: Undeclared tool defaults.
- `apps/web/lib/__tests__/connector-tool-cancellation.test.ts`: Connector tool cancellation.
- `apps/extension/__tests__/connectors-coming-soon.test.ts`: Chrome lock.

**Test scenarios**

- **Free time lookup**
  1. Connect a test calendar with known events.
  2. Ask what is free on a set afternoon.
  - Expected: Open slots match the calendar; note whether an approval prompt appears.
- **Create with review**
  1. Ask to create a one-hour event with an attendee.
  2. Check the prompt shows time and attendee; Deny once, then Allow.
  - Expected: Deny creates nothing; Allow creates one event and an invite.
- **Edit and cancel**
  1. Ask to move an existing event, then cancel another.
  - Expected: Each asks first and changes only that event.
- **Read approval posture**
  1. Set policy to 'Run read-only actions without asking'.
  2. Ask for a calendar search.
  - Expected: Records whether a prompt appears; the current code predicts it asks.
- **Unreleased state**
  1. Open Connectors on mobile and Chrome.
  - Expected: Calendar shows 'Coming soon'.

**Where to look when it fails**

- '[user-connector] Google-hosted connector withheld from a turn that may train'.
- connector_call_events table.
- Error text 'Connectors are coming soon.' in the tool result.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/056-concrete-integration-families.md](../../70-qa/test-plans/web/056-concrete-integration-families.md)
- Desktop: [70-qa/test-plans/desktop/056-concrete-integration-families.md](../../70-qa/test-plans/desktop/056-concrete-integration-families.md)
- Mobile: [70-qa/test-plans/mobile/056-concrete-integration-families.md](../../70-qa/test-plans/mobile/056-concrete-integration-families.md)
- CLI: [70-qa/test-plans/cli/056-concrete-integration-families.md](../../70-qa/test-plans/cli/056-concrete-integration-families.md)
- VS Code: [70-qa/test-plans/vscode/056-concrete-integration-families.md](../../70-qa/test-plans/vscode/056-concrete-integration-families.md)
- Chrome: [70-qa/test-plans/chrome/056-concrete-integration-families.md](../../70-qa/test-plans/chrome/056-concrete-integration-families.md)

## 10. Gaps and dependencies

- **Calendar is not released.** Affects: All apps. Evidence: connector-release.ts:14-30. Work needed: Owner release decision after verification.
- **Calendar read tools ask for approval because no metadata is declared.** Affects: All apps. Evidence: tool-metadata.ts:863-883. Work needed: Declare reads and writes for each Google Calendar tool and add tests.
- **No evidence the Google Calendar OAuth client and descriptor exist in production.** Affects: All. Evidence: docs/runbooks/connector-oauth-apps.md. Work needed: Owner setup.
- **Outlook lacks free/busy, edit, cancel and invitation responses.** Affects: Outlook users. Evidence: catalog.ts:179-181. Work needed: Extend the adapter.
- **Brief per-app statuses (cli done, vscode missing) cannot be reproduced from code.** Affects: CLI, VS Code. Evidence: claude_parity.rs:2772-2774. Work needed: Re-audit.
- **No recorded live run of any calendar journey.** Affects: All. Evidence: none found. Work needed: Record a run on a review build.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-authentication-and-identity
- mode:cloud
- surface:web
- surface:mobile
- surface:desktop
- surface:cli
- surface:vscode
- surface:chrome
- file:apps/web/lib/user-connector-tools.ts
- table:connector_oauth_grants

## Unknown

- Whether production has the calendar descriptor and client.
- Google calendar MCP server's real tool behaviour and approval text.
- Whether the webhook route accepts POST (method not opened).
- How invitations are sent by update_event or create_event on Google's server.
- Whether retention applies to connector_call_events.
