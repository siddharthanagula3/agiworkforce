---
id: "F041-04"
type: "feature"
title: "Plugins and connectors in temporary chat"
aliases: ["Connector approval in temporary chat", "withoutStandingApprovals", "Always allow downgrade", "Plugins and connectors in temporary chat", "S41.07"]
area: "41 Temporary and private experiences"
available_on: ["web", "desktop", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S41.07"]
depends_on: ["surface:web", "surface:chrome", "surface:mobile", "mode:cloud", "SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "F041-01", "F041-02", "api:POST /api/llm/v1/chat/completions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F041-04 Plugins and connectors in temporary chat

In a temporary chat a connector asks before every call, even where the person saved Always allow. A blocked tool stays blocked. The web + menu row tooltip and the Chrome menu tooltip tell the person. Mobile has no statement. The behaviour is enforced by the server.

Area: [41. Temporary and private experiences](README.md). Requirement items: [S41.07](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4107).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | not stated on this page | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Downgrades saved standing approvals for connector tools to ask-every-time for a temporary turn, and tells the person so, including that the outside service keeps its own record (apps/web/lib/temporary-chat-policy.ts:22-27).

**Why it exists.** A temporary chat should not run actions on connected services on a standing permission the person gave for ordinary work. The external service still records the call, so the person needs to know.

**Who uses it.** People with connectors who also use temporary chat.

**Problems it solves**

- A private chat silently using an Always allow connector.
- Believing a temporary chat hides what a connector does.

**Use cases**

- In a temporary chat ask the assistant to read a connected calendar: an approval card appears even though Always allow was saved.
- A tool the person blocked stays blocked in a temporary chat.
- In a temporary live voice chat the same downgrade applies.

## 2. User experience

**Where to find it**

- Web + menu row (Use incognito / Exit incognito): tooltip holds the full note including the connector sentence (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:502; apps/web/lib/temporary-chat-policy.ts:22-27).
- Chrome attach menu item 'Temporary chat': tooltip is the long note (apps/extension/src/side_panel.ts:14943; messages.json spTemporaryChatRetention).
- The approval prompt itself is the usual connector approval card; where it shows was not traced (unknown).

**Before you start**

- A connected connector with a saved permission level.
- The chat is temporary.

**Screens and controls**

- Hover tooltip on the web row (no always-visible connector text: the visible line is the shorter 'Stays out of your history, search, memory and Library.').
- Connector approval card (existing component, not traced).

**Journey**

1. Start a temporary chat.
2. Ask for something that needs a connector tool.
3. The server builds permissions for the turn with standing approvals downgraded, so the tool needs an approval.
4. The person approves or denies the card.
5. If approved, the call reaches the outside service.

**What the person sees and gets**

- Approval prompt per call; no remembered-scope offer for this turn (canRememberApproval false, sessionGrantsAvailable false) (apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:476-479).

**Settings**

- Connector permission levels live in connector settings; they are not changed by a temporary chat (test: 'does not change what the account chose').

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server: for a temporary turn permissions pass through withoutStandingApprovals: allow becomes ask, deny stays deny, remembered approvals and session grants are off (connector-tool-permissions.ts:464-490, 724).
- Operator MCP servers are left on the account's verdict (connector-tool-permissions.ts:470-484).
- Applies in research runs (apps/web/app/api/llm/v1/chat/completions/lib/research-run-options.ts:151) and live voice (apps/web/lib/voice/live-voice-tool-runner.ts:385).
- The chat route passes turn.temporary from the conversation row (apps/web/app/api/llm/v1/chat/completions/route.ts:820, 839).

**Incomplete**

- The connector statement is visible only as a tooltip on web and Chrome (hover/long-press), not as always-visible text; touch users may not see it [inferred].
- The header tooltip locale text does not mention connectors (packages/ui/i18n/locales/en/chat.json:250).

**Present but disconnected or switched off**

- none found

**Not available**

- Mobile: no statement about connectors in a temporary chat (TemporaryChatBanner.tsx texts). Server behaviour applies if the phone uses the same chat route [inferred].
- CLI and VS Code: no temporary chat.
- Desktop Tauri: connector behaviour in a temporary Cloud chat was not traced (unknown).

## 4. Required behaviour

**Established requirements**

- The user can tell which plugins/connectors work in a temporary chat and how they behave there. (source: Brief S41.07)
- A connector asks before every call in a temporary chat, even where Always allow was saved; the call still reaches that service, which keeps its own record. (source: apps/web/lib/temporary-chat-policy.ts:22-27)
- Support text: temporary is about what AGI keeps, not what the outside world forgets. (source: doc: apps/web/content/support/temporary-chats.md)

**Acceptance criteria**

1. With a connector tool saved as Always allow, a temporary chat turn asks for approval.
2. A tool set to deny stays denied in a temporary chat.
3. A normal chat still honours Always allow after the temporary test.
4. The + menu row tooltip contains the sentence about connectors and the outside record.
5. Remembered-approval scope is not offered during the temporary turn.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A temporary chat does not make connector calls private from the connector [inferred from the note text].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Put a one-line connector sentence in the mobile temporary explainer.
- [proposed] Show the connector sentence as visible text, not only a tooltip.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | withoutStandingApprovals | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Downgrades allow to ask; keeps deny; disables remembered approvals. |
| service | connector permission resolver for a turn | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Applies the downgrade when turn.temporary (line 724). |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Passes temporary from the conversation row (820, 839). |
| service | research-run-options | `apps/web/app/api/llm/v1/chat/completions/lib/research-run-options.ts` | Uses the downgrade for research runs. |
| service | live-voice-tool-runner | `apps/web/lib/voice/live-voice-tool-runner.ts` | Uses the downgrade for live voice tools. |
| config | retention note | `apps/web/lib/temporary-chat-policy.ts` | Connector sentence shown in the tooltip. |
| component | ComposerPlusMenu row | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Tooltip carrier. |
| component | Chrome menu item | `apps/extension/src/side_panel.ts` | Tooltip carrier in Chrome. |
| table | connector tool session grants | `apps/web/db/neon/0364_connector_tool_session_grants.sql` | Storage for per-session grants (not offered in temporary turns). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Chat request arrives; the server reads is_temporary from the conversation row. | our servers | request-processor.ts:3811-3919 |
| Saved connector permissions are loaded and, for a temporary turn, passed through withoutStandingApprovals. | our servers | connector-tool-permissions.ts:724 |
| When the model asks for a connector tool the person gets an approval prompt. | device and our servers | connector approval flow: not traced (unknown); policy result is entries with level ask (connector-tool-permissions.ts:480-484) |
| On approval the call is sent to the connected service. | outside service | apps/web/lib/temporary-chat-policy.ts:26-27 (note: the call still reaches that service) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Saved connector permissions | account connector permission tables on our servers | Unchanged by the temporary chat | Untouched (test 'does not change what the account chose') |
| Record of the call | the outside connector service | Not under AGI control | By that service |

**Models and providers.** Needs a tool-capable model for connector tools [inferred]. The downgrade is applied before the tool loop and does not depend on provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account with connectors set up. |
| Permissions | Per-tool permission levels allow, ask, deny; deny wins; operator MCP servers excluded from the downgrade. |
| Subscription | none found in the code for this rule; connector entitlement itself is separate (SYS-connectors-plugins-and-skills). |
| Limits and metering | none found in the code |
| Feature flags | Workspace connector lockdown stays absolute (test name 'keeps lockdown absolute'). |
| Model compatibility | Connector tools need tool-capable models [inferred]. |
| Provider restrictions | none found in the code |
| Local mode | A device-model chat on web is temporary; whether connector tools are offered to a device model was not traced (unknown). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Tool saved as Always allow | Asks every call | connector-tool-permissions.ts:467-469 |
| Tool saved as deny | Stays denied | connector-tool-permissions.ts:469 |
| Operator MCP server | Keeps its saved verdict | connector-tool-permissions.ts:470-484 |
| Per-chat connector off | Composes with the downgrade | test connector-tool-permissions.temporary-chat.test.ts: composes with the per-conversation connector opt-out |
| Mobile | No statement and no mobile-side handling found | no match in apps/mobile for connector plus temporary |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/connector-tool-permissions.temporary-chat.test.ts`: Always allow becomes ask; blocked stays blocked; saved verdicts untouched; lockdown absolute; operator MCP left alone.
- `apps/web/lib/voice/__tests__/live-voice-tool-runner.temporary-chat.test.ts`: Live voice tools in a temporary chat.
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/research-run-options.connectors.test.ts`: Research run connector options (mentions temporary).

**Test scenarios**

- **Always allow downgraded**
  1. Save a connector tool as Always allow.
  2. Start a temporary chat and ask for that tool.
  - Expected: Approval card appears.
- **Deny holds**
  1. Block a tool.
  2. Ask for it in a temporary chat.
  - Expected: Tool is refused.
- **Normal chat unchanged**
  1. After the test, ask the same in a normal chat.
  - Expected: Always allow applies without a prompt.
- **Tooltip text**
  1. Hover the + menu row in a temporary chat.
  - Expected: Tooltip includes the connector sentence.
- **Mobile**
  1. Use a connector in a mobile temporary Cloud chat.
  - Expected: Server asks for approval (to be checked; mobile is not confirmed).

**Where to look when it fails**

- Check chat setup connectors state in server logs.
- Look at connector tool permission entries returned for the turn.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/041-temporary-and-private-experiences.md](../../70-qa/test-plans/web/041-temporary-and-private-experiences.md)
- Desktop: [70-qa/test-plans/desktop/041-temporary-and-private-experiences.md](../../70-qa/test-plans/desktop/041-temporary-and-private-experiences.md)
- Chrome: [70-qa/test-plans/chrome/041-temporary-and-private-experiences.md](../../70-qa/test-plans/chrome/041-temporary-and-private-experiences.md)

## 10. Gaps and dependencies

- **Mobile has no statement and no confirmed behaviour.** Affects: Mobile. Evidence: No connector wording in TemporaryChatBanner.tsx. Work needed: Add text and verify the server rule applies to mobile requests.
- **Statement lives only in a tooltip.** Affects: Web, Chrome. Evidence: ComposerPlusMenu.tsx:502. Work needed: Make visible.
- **CLI and VS Code have no temporary chat.** Affects: CLI, VS Code. Evidence: no match. Work needed: Follows F041-01.
- Not built on: Mobile, CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:chrome
- surface:mobile
- mode:cloud
- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- F041-01
- F041-02
- api:POST /api/llm/v1/chat/completions

## Unknown

- Where the approval card is rendered on web and mobile.
- Whether mobile Cloud requests reach the same permission code (inferred yes).
- Whether desktop Tauri Cloud temporary chats get the same rule.
- Exact table name for session grants (file name only).
