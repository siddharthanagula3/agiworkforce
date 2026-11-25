---
id: "F056-06"
type: "feature"
title: "Team chat and knowledge bases"
aliases: ["Team chat and knowledge bases", "Slack connector", "Notion connector", "Confluence connector", "Microsoft Teams adapter", "S56.21 to S56.24"]
area: "56 Concrete integration families"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S56.21", "S56.22", "S56.23", "S56.24"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-execution-boundaries", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "table:connector_oauth_grants"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F056-06 Team chat and knowledge bases

Lets the assistant search Slack, post to a channel after approval, search a knowledge base (Notion, Confluence) and create or edit pages. Notion and Confluence are released and need no owner credentials; Slack is not released and needs a registered app. Teams can only read. Every call asks for approval today.

Area: [56. Concrete integration families](README.md). Requirement items: [S56.21](../../10-requirements/capabilities/056-concrete-integration-families.md#s5621), [S56.22](../../10-requirements/capabilities/056-concrete-integration-families.md#s5622), [S56.23](../../10-requirements/capabilities/056-concrete-integration-families.md#s5623), [S56.24](../../10-requirements/capabilities/056-concrete-integration-families.md#s5624).

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

**What it does.** Slack through Slack's hosted server (search scopes admitted, tools found at run time); Notion with notion-search, notion-ai-search, notion-fetch, notion-create-pages, notion-update-page, notion-create-database; Confluence with read_confluence, write_confluence, search_confluence; Teams with list_chats, read_chat_messages, list_teams, list_channels. [code] (apps/web/lib/connectors/directory/sources/first-party.json; apps/web/lib/connectors/catalog.ts:183-186; connector-scopes.ts:96-110)

**Why it exists.** Teams keep decisions in chat and wikis; the leaders connect to both. [doc: docs/runbooks/connector-oauth-apps.md]

**Who uses it.** Paid-plan users and teams with Slack, Notion or Confluence.

**Problems it solves**

- Finding a past discussion
- Posting an update without switching apps
- Reading and updating a wiki page

**Use cases**

- Search Slack for the launch thread
- Post a summary to a channel after I approve it
- Find the onboarding page in Notion
- Update a Confluence page

## 2. User experience

**Where to find it**

- Web: Settings 'Connectors' and directory; Notion and Confluence connectable, Slack 'Coming soon'. [code] (connector-release.ts:16-30; connector-release-lock.ts:19-24)
- Desktop: hosted web app. [doc: AGENTS.md section 5]
- Mobile: Settings 'Connectors' with release labels. [code] (index.tsx:156-166)
- CLI: 'agi connectors'; its text names Google Drive, Slack and Notion as examples. [code] (apps/cli/src/claude_parity.rs:2774)
- VS Code: 'Connectors' tree. [code] (connectorsTree.ts)
- Chrome: 'Connectors' attach menu. [code] (side_panel.ts:14811)
- Separate: the AGI Slack app installed from Settings > Slack, which answers messages inside Slack. [doc: docs/runbooks/connector-oauth-apps.md]

**Before you start**

- Signed in, paid plan, Cloud mode. [code] (billing-catalog.ts:332-351)
- Notion and Confluence: released; Notion needs no operator credentials because it registers by metadata URL. [code] (mcp-endpoints.ts:37-42; oauth-registry.ts:1376-1378)
- Slack: released status no; operator must register the Slack app with the search scopes and add its entry. [doc: docs/runbooks/connector-oauth-apps.md]
- Only ordinary account chat; not agent, voice, schedule or artifact. [doc: docs/runbooks/connector-oauth-apps.md]

**Screens and controls**

- Connect button, step rows, approval prompt showing the call (for a post, the message). [code] (apps/cli/src/models/managed_approvals.rs:126-143)
- Per-tool Allow, Ask, Deny. [code] (connector-tool-permissions.ts)

**Journey**

1. Connect Notion.
2. Ask 'find the onboarding page'.
3. The assistant calls notion-search; an approval prompt appears because no metadata is declared.
4. Ask to update a page; review; Allow.
5. For Slack after release: ask to post; review the drafted text in the prompt; Allow.

**What the person sees and gets**

- Step sentences; page or message text in the answer; failure text.

**Settings**

- Approval policy; per-tool permissions; per-chat switch.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Notion and Confluence are in the released list; Notion is self-service and Confluence/Jira share the Atlassian server by metadata client. [code] (connector-release.ts:16-30; mcp-endpoints.ts:29-47)
- Slack search scopes search:read.public, .private, .im, .mpim and chat:write are in the ceiling. [code] (connector-scopes.ts:96-109)
- Teams adapter reads chats, teams and channels; results fenced as untrusted. [code] (microsoft-graph.ts:645-740; tool-metadata.ts:856-861)

**Incomplete**

- All Slack, Notion and Confluence tools are undeclared in metadata, so every call asks, reads included. [code] (tool-metadata.ts:863-883)
- Slack tools are discovered at run time; this repository does not list them, so a post tool's exact name is unknown. [code] (first-party.json Slack entry has empty toolNames)
- Teams: no search and no posting; the ceiling admits ChatMessage.Send but no adapter tool uses it, and channel message reading is not admitted. [code] (connector-scopes.ts:73-83; catalog.ts:183-186; docs/development/connectors-setup.md)
- Brief says CLI knowledge-base search is missing and VS Code team search is missing; the code gives both the same account tool list, so those splits are unverified. [inferred]

**Present but disconnected or switched off**

- slack, teams and microsoft-365 are not released. [code] (connector-release.ts:16-30)
- Slack needs a pre-registered client and entry. [code] (mcp-endpoints.ts:113-117)
- Microsoft Teams MCP: no verified hosted server, out of scope. [doc: knowledge-base/data/area-briefs/056-concrete-integration-families.md]

**Not available**

- Local and own-key modes; free plan. [code] (claude_parity.rs:2775-2779)
- Teams posting.

## 4. Required behaviour

**Established requirements**

- The assistant can search messages in a connected team chat workspace (Slack/Teams). (source: S56.21)
- The assistant can draft and post a message to a channel, after approval. (source: S56.22)
- The assistant can search a connected knowledge base (Notion, Confluence). (source: S56.23)
- The assistant can create or edit wiki pages. (source: S56.24)
- Slack search:read scopes are admitted; Teams has no verified hosted server and stays out of scope. (source: S56.21)
- Slack connector, ordinary chat only for selected connectors. (source: doc: docs/runbooks/connector-oauth-apps.md)

**Acceptance criteria**

1. With Notion connected, a page search returns real pages.
2. Creating or updating a page asks first and shows what will change; Deny changes nothing.
3. With Slack released and set up, search returns real messages and a post shows the text before sending.
4. Nothing is posted without approval.
5. Teams exposes no post tool.
6. On a failure the assistant reports it in plain words and does not claim a post was made.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Search is expected to run without a prompt, which needs read metadata. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Declare Notion, Confluence and Slack read and write tools in metadata.
- [proposed] Treat a Slack post as an external send that always asks.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | Directory entries | `apps/web/lib/connectors/directory/sources/first-party.json` | Slack, Notion, Confluence servers and tools. |
| config | MCP endpoints | `apps/web/lib/connectors/mcp-endpoints.ts` | Notion self-service; Slack pre-registered. |
| config | Scope ceiling | `packages/contracts/cloud-contracts/src/connector-scopes.ts` | Slack, Notion (no scope), Confluence, Teams scopes. |
| config | Release gate | `packages/contracts/types/src/connector-release.ts` | Notion and Confluence released; Slack not. |
| service | Graph adapter | `apps/web/lib/connectors/microsoft-graph.ts` | Teams read tools. |
| service | OAuth registry | `apps/web/lib/connectors/oauth-registry.ts` | Descriptors and credentials. |
| service | Tool catalog builder | `apps/web/lib/user-connector-tools.ts` | Dials MCP servers and builds defs. |
| config | Tool metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Teams reads declared; Slack, Notion, Confluence undeclared. |
| service | Tool call gate | `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts` | Asks for undeclared tools. |
| service | Untrusted text fencing | `apps/web/lib/connectors/mcp-untrusted-text.ts` | Treats connector text as data. |
| endpoint | Slack app webhook | `apps/web/app/api/webhooks/slack` | Separate Slack app events. |
| screen | Mobile Connectors | `apps/mobile/src/features/settings/cloud-connectors/index.tsx` | Mobile list. |
| command | CLI connectors | `apps/cli/src/cloud/connectors.rs` | List and disconnect. |
| service | CLI approvals | `apps/cli/src/models/managed_approvals.rs` | Terminal approval of paused calls. |
| component | VS Code tree | `apps/extension-vscode/src/features/connectors/connectorsTree.ts` | Account connector list. |
| component | Chrome menu | `apps/extension/src/side_panel.ts` | Connectors item. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person asks in chat; turn goes to our servers. | device | route.ts:792-800 |
| Server checks release (exact id), plan, kill switch; only ordinary chat for selected ids. | our servers | connector-capability.ts:44-67 |
| Server connects to Notion's, Confluence's or Slack's hosted MCP server with the user's token and lists tools. | our servers | user-connector-tools.ts:2536-2565 |
| Gate asks for each undeclared tool; the app shows the prompt. | device and our servers | tool-metadata.ts:876-883 |
| The vendor server performs the search or write. | outside service | mcp-endpoints.ts:37-42, 113-117 |
| Result returns, fenced as untrusted text, to model and person. | our servers | mcp-untrusted-text.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Connector grants | table:connector_oauth_grants | Account-wide | Deleted on disconnect; vendor access may remain until removed at the vendor. [code] (apps/cli/src/cloud/connectors.rs:140-153) |
| Pages and messages | At the vendor | By vendor | Vendor-owned |
| Call audit events | table:connector_call_events | Account-wide | unknown |

**Models and providers.** Tool-capable model; Notion, Slack and Confluence content goes to the chosen model; no Google no-training rule applies to these. [code] (google-user-data.ts:19-27)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. |
| Permissions | Slack scopes in the ceiling; Notion none; Confluence agent-interface scopes. [code] (connector-scopes.ts:96-110, 139-145) |
| Subscription | Paid plans. [code] (billing-catalog.ts:332-351) |
| Limits and metering | none found in the code beyond the connector tool-count ceiling. [code] (user-connector-tools.ts:2441) |
| Feature flags | Release state, kill switch, workspace policy (an admin can block a connector). [code] (apps/cli/src/claude_parity.rs:4272-4277) |
| Model compatibility | Tool support required. |
| Provider restrictions | none found in the code for these connectors. |
| Local mode | Not offered in Local or own-key sessions. [code] (claude_parity.rs:2775-2779) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Slack not released | 'Connectors are coming soon.' / 'Coming soon' label. | user-connector-tools.ts:2766-2768 |
| Blocked by workspace admin | Message 'Your workspace administrator has blocked the connector.' | apps/cli/src/claude_parity.rs:4277; apps/web/lib/services/connector-policy-gate.ts:147 |
| Expired authorization | Reconnect card or CLI notice. | connect-required.ts; apps/cli/src/cloud/connectors.rs:29-41 |
| Approval refused | Declined step; nothing posted. | connector-step-sentence.ts:100-107 |
| Injected text in a page or message | Content fenced; with private data and an egress tool the gate escalates to ask even for saved allow. | tool-call-gate.ts:82-90, 112-130 |
| Timeout, offline, retry | not handled in the code beyond an error result. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/connector-selective-release.test.ts`: Ordinary-chat opt-in for selected connectors and fail-closed kill switch.
- `apps/web/lib/connectors/__tests__/oauth-registry.scope-allowlist.test.ts`: Ceiling on descriptor scopes.
- `apps/web/lib/connectors/__tests__/mcp-untrusted-text.test.ts`: Untrusted text handling.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.test.ts`: Gate precedence and escalation.
- `apps/web/lib/services/__tests__/connector-policy-gate.test.ts`: Workspace connector policy.
- `apps/web/lib/connectors/__tests__/connector-release.test.ts`: Release gates.

**Test scenarios**

- **Notion search**
  1. Connect Notion on a paid test account.
  2. Ask for a known page.
  - Expected: Page found; note whether a prompt appears (predicted yes).
- **Page update with approval**
  1. Ask to change a line in a test page; Deny; repeat and Allow.
  - Expected: Deny leaves the page; Allow changes only that line.
- **Slack post**
  1. After release and setup, ask to post a test message.
  - Expected: Prompt shows text; nothing posts before Allow.
- **Teams limits**
  1. Connect Teams (when released) and ask to post.
  - Expected: Assistant cannot post.
- **Blocked connector**
  1. Block Notion in workspace policy, ask for a search.
  - Expected: Plain refusal message.

**Where to look when it fails**

- connector_call_events
- '[connector-policy]' log lines. [code] (user-connector-tools.ts:2616)
- Tool result 'Connectors are coming soon.'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/056-concrete-integration-families.md](../../70-qa/test-plans/web/056-concrete-integration-families.md)
- Desktop: [70-qa/test-plans/desktop/056-concrete-integration-families.md](../../70-qa/test-plans/desktop/056-concrete-integration-families.md)
- Mobile: [70-qa/test-plans/mobile/056-concrete-integration-families.md](../../70-qa/test-plans/mobile/056-concrete-integration-families.md)
- CLI: [70-qa/test-plans/cli/056-concrete-integration-families.md](../../70-qa/test-plans/cli/056-concrete-integration-families.md)
- VS Code: [70-qa/test-plans/vscode/056-concrete-integration-families.md](../../70-qa/test-plans/vscode/056-concrete-integration-families.md)
- Chrome: [70-qa/test-plans/chrome/056-concrete-integration-families.md](../../70-qa/test-plans/chrome/056-concrete-integration-families.md)

## 10. Gaps and dependencies

- **Slack and Teams not released; Slack not set up.** Affects: All apps. Evidence: connector-release.ts:16-30; mcp-endpoints.ts:113-117. Work needed: Owner setup and release.
- **No tool metadata for Slack, Notion, Confluence, so searches ask.** Affects: All apps. Evidence: tool-metadata.ts:863-883. Work needed: Declare metadata.
- **Slack posting tool name and behaviour unknown from the repository.** Affects: Slack users. Evidence: first-party.json Slack entry. Work needed: Inspect Slack's tool list at run time and declare posts as external sends.
- **Teams cannot search or post.** Affects: Teams users. Evidence: catalog.ts:183-186. Work needed: Out of scope per brief; confirm.
- **No live verification recorded for Notion or Confluence though released.** Affects: All apps. Evidence: none found. Work needed: Record a run.
- **Brief per-app statuses cannot be reproduced.** Affects: CLI, VS Code. Evidence: claude_parity.rs:2772-2774. Work needed: Re-audit.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-execution-boundaries
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- table:connector_oauth_grants

## Unknown

- Slack's real tool list and which tool posts.
- Whether Notion and Confluence work live in production.
- Whether Slack app credentials exist in production.
- Retention of connector_call_events.
- Whether the separate AGI Slack app shares the release gate.
- CLI and VS Code actual behaviour for each item.
