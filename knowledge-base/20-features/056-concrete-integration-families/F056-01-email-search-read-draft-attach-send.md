---
id: "F056-01"
type: "feature"
title: "Email (search, read, draft, attach, send)"
aliases: ["Email connector", "Gmail connector", "Outlook connector", "Mail tools", "search_threads / get_thread / create_draft / send_draft", "S56.01 to S56.06"]
area: "56 Concrete integration families"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S56.01", "S56.02", "S56.03", "S56.04", "S56.05", "S56.06"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-execution-boundaries", "SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "file:apps/web/lib/connectors/gmail-actions.ts", "file:packages/contracts/cloud-contracts/src/connector-scopes.ts", "file:packages/contracts/types/src/connector-release.ts", "table:connector_oauth_grants", "table:connector_tool_permissions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F056-01 Email (search, read, draft, attach, send)

Lets the assistant search, read, draft and send email in a connected Gmail or Outlook account from chat. Sends and drafts wait for approval. The code is complete on the server, but Gmail and Outlook are not released (connectors are 'coming soon'), so no app can use it until that changes.

Area: [56. Concrete integration families](README.md). Requirement items: [S56.01](../../10-requirements/capabilities/056-concrete-integration-families.md#s5601), [S56.02](../../10-requirements/capabilities/056-concrete-integration-families.md#s5602), [S56.03](../../10-requirements/capabilities/056-concrete-integration-families.md#s5603), [S56.04](../../10-requirements/capabilities/056-concrete-integration-families.md#s5604), [S56.05](../../10-requirements/capabilities/056-concrete-integration-families.md#s5605), [S56.06](../../10-requirements/capabilities/056-concrete-integration-families.md#s5606).

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

**What it does.** Gives the chat assistant mail tools. For Gmail it uses Google's hosted mail server (search_threads, get_thread, get_message, list_drafts, create_draft) plus three AGI tools: send_draft, read_attachments and create_draft_with_attachments. For Outlook it uses a built-in Microsoft Graph adapter with search_mail, read_mail and send_mail. [code] (apps/web/lib/connectors/directory/sources/first-party.json:59-70; apps/web/lib/connectors/gmail-actions.ts:69-123; apps/web/lib/connectors/catalog.ts:176-181)

**Why it exists.** Claude and ChatGPT both let the assistant work in the user's mailbox, and the product aims for parity with them. [doc: docs/runbooks/connector-oauth-apps.md]

**Who uses it.** People on a paid plan who connect a mailbox on the web app and then ask for mail help in chat on any app. [code] (packages/contracts/types/src/billing-catalog.ts:351)

**Problems it solves**

- Finding a message without leaving the chat
- Writing a reply or new mail as a draft the person can review in their own mailbox
- Reading what a PDF or Office attachment says without opening it
- Sending a message the person has seen, only after their explicit approval

**Use cases**

- Find the last email from a named sender and summarise it
- Draft a reply to a thread and leave it in Gmail Drafts for review
- Draft a mail with a file from the chat attached, then send it after approval
- Read the PDF attached to a message and answer a question about it

## 2. User experience

**Where to find it**

- Web: Settings, 'Connectors' tab (label 'Connectors'), and the page /connectors. [code] (packages/ui/ui/src/settings-modal/SettingsModal.tsx:193; apps/web/app/connectors/page.tsx)
- Desktop (public Electron app): shows the hosted web app, so the same screens as Web. [doc: AGENTS.md section 5] The retained internal Tauri build has its own Connectors gallery with a Gmail card. [code] (apps/desktop/src/features/connectors/connectorDefinitions.ts:62)
- Mobile: Settings, 'Connectors'; header text 'Connect your tools to AGI Cloud'; an unreleased row shows the label 'Coming soon'; screen needs Cloud mode. [code] (apps/mobile/src/features/settings/cloud-connectors/index.tsx:156-166, 832-836)
- CLI: command 'agi connectors' lists and disconnects; connecting happens in the browser at a link the CLI prints. [code] (apps/cli/src/cloud/connectors.rs:116, 169-174, 176-230)
- VS Code: 'Connectors' tree view with commands 'Code: Show Connectors', 'Code: Refresh Connectors', 'Code: Manage Connectors'; Manage opens the web page. [code] (apps/extension-vscode/package.json:723-734; apps/extension-vscode/src/features/connectors/connectorsTree.ts:25-27)
- Chrome: the attach menu item 'Connectors' opens the web connectors page; it carries a 'Coming soon' tag while the server holds connectors back. [code] (apps/extension/src/side_panel.ts:14811-14830; apps/extension/_locales/en/messages.json:796)

**Before you start**

- Signed in with an AGI account. [code] (apps/mobile/src/features/settings/cloud-connectors/index.tsx:821-829)
- A paid plan: the 'connectors' capability is granted to basic, pro, max, max_15x, team, team_premium and enterprise only. [code] (packages/contracts/types/src/billing-catalog.ts:332-351)
- Cloud mode (our managed service). Own-key and Local sessions are not offered account connectors. [code] (apps/cli/src/claude_parity.rs:2772-2780; apps/mobile/src/features/settings/cloud-connectors/index.tsx:289-290)
- The connector must be released. Gmail and Outlook are not in the released list today. [code] (packages/contracts/types/src/connector-release.ts:14-30)
- The operator must have added the gmail (or outlook) entry and client id and secret to the deployment. [doc: docs/runbooks/connector-oauth-apps.md]

**Screens and controls**

- Connector list with a Connect button per connector, a status per row and a search box ('Search connectors' on mobile). [code] (apps/mobile/src/features/settings/cloud-connectors/index.tsx:1219)
- Google consent screen opened from Connect. [doc: docs/development/connectors-setup.md]
- In chat: a step row for each tool call, and an approval prompt with Allow once, Allow for this chat, Always allow, and Deny. [code] (packages/contracts/types/src/tool-approval-policy.ts:26-37)
- A Connect or Reconnect card appears in the chat when a mail tool reports that authorization is missing, expired or too narrow. [code] (apps/mobile/src/features/chat/utils/connectorConnectSentences.ts:3-25; apps/web/features/chat/components/messages/ToolTimeline.tsx)
- Settings, per-connector tool permissions (Allow, Ask, Deny per tool or per read/write group). [code] (apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:40-100, 252-272)

**Journey**

1. Open Connectors and connect Gmail; approve Google's consent screen.
2. Open a chat on any app, signed in on a paid plan, in Cloud mode.
3. Ask for mail work, for example 'find the last email from Priya'.
4. The assistant calls a mail tool; the chat shows a step such as a running then finished sentence for Gmail. [code] (packages/ui/unified-chat/src/components/connector-step-sentence.ts:136-170)
5. For a draft, the assistant calls create_draft; the approval prompt appears first because creating a draft is an irreversible write. [code] (apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:706-720)
6. Open Gmail Drafts to review the draft.
7. To send, the assistant calls send_draft; the approval prompt appears every time, under every approval policy. [code] (tool-metadata.ts:721-728; docs/development/connectors-setup.md)
8. After approval the chat shows the sent message id; if refused or failed the step shows as declined or failed.

**What the person sees and gets**

- Tool step sentences in the chat timeline (running, finished, failed, stopped). [code] (connector-step-sentence.ts:136-170)
- Draft result JSON with draftId and the attached file names; send result with messageId and threadId. [code] (apps/web/lib/connectors/gmail-actions.ts:396-416, 380-394)
- Plain failure text: 'Gmail answered HTTP N.' or a connect card for expired or missing authorization. [code] (gmail-actions.ts:158-163, 481-518)
- Attachment text is returned fenced as untrusted data. [code] (gmail-actions.ts:418-479)

**Settings**

- Tool approval policy: 'Ask before every action', 'Run read-only actions without asking', 'Skip approvals'. New web accounts default to 'Skip approvals', but sends and drafts still ask. [code] (packages/contracts/types/src/tool-approval-policy.ts:11-13, 45-75)
- Per-tool Allow/Ask/Deny and 'Always allow' (refused for critical tools). [code] (connector-tool-permissions.ts:40-100)
- Per-chat switch-off of a connector (disabled_connector_ids). [code] (apps/web/app/api/llm/v1/chat/completions/route.ts:826-830)
- Mobile: 'Action approvals' summary row on the Connectors screen. [code] (index.tsx:840-846)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server-side Gmail actions exist and are wired into the chat tool catalog and executor: send_draft, read_attachments (PDF, Office and text files read as text, max 5 files, 10 MB each), create_draft_with_attachments (up to 5 files, 20 MB total, recipients max 20). [code] (apps/web/lib/connectors/gmail-actions.ts:37-52, 329-479; apps/web/lib/user-connector-tools.ts:2560-2565, 2817-2822)
- Tool metadata declares Gmail reads as reads, create_draft as an irreversible write, and send_draft as an irreversible external send, so a send always asks. [code] (tool-metadata.ts:699-744)
- Gmail scope ceiling admits gmail.readonly, gmail.compose and gmail.send only; the full-mailbox scope is forbidden and dropped. [code] (packages/contracts/cloud-contracts/src/connector-scopes.ts:41, 250-262)
- Outlook built-in adapter has search_mail, read_mail, send_mail with a send that asks under every policy. [code] (apps/web/lib/connectors/microsoft-graph.ts:301-460; tool-metadata.ts:822-843)
- Not-connected, expired, missing-scope and unreachable cases return a typed 'authorization required' payload with a connect link. [code] (apps/web/lib/connectors/connect-required.ts:23-79; gmail-actions.ts:481-518)
- Google data is withheld from any turn whose model may train on inputs. [code] (apps/web/lib/user-connector-tools.ts:2500-2515; apps/web/lib/connectors/google-user-data.ts:16-27)
- CLI and VS Code reach the same server connectors through Managed Cloud; the CLI asks the user to approve each paused connector call and prints a reconnect notice. [code] (apps/cli/src/models/managed_approvals.rs:109-150; apps/cli/src/cloud/connectors.rs:57-87; apps/cli/src/app_server/developer_host.rs:4557)

**Incomplete**

- Outlook has no draft tool (no Mail.ReadWrite in the ceiling), no attachment tools and no folder tools. [doc: docs/development/connectors-setup.md] [code] (connector-scopes.ts:63-67)
- Gmail label tools (label_message and others) are listed by the directory, but gmail.modify is not in the ceiling, so they cannot be authorized. [code] (first-party.json:59-70; connector-scopes.ts:41) [inferred]
- The brief marks CLI 'reading missing' and VS Code 'send missing'. The code shows CLI and VS Code have no mail tools of their own; they use the same server tool list, so both would have get_message and send_draft once released. The brief's per-app split could not be reproduced from code. [code] (apps/cli/src/claude_parity.rs:2772-2774) [inferred]

**Present but disconnected or switched off**

- All app surfaces: CONNECTOR_RELEASE_STATE is 'coming_soon' and neither gmail nor outlook is in SELECTIVELY_RELEASED_CONNECTOR_IDS, so connect, listing, tool catalog and tool execution all refuse them with 'Connectors are coming soon.' [code] (connector-release.ts:14-30, 52-58; apps/web/lib/user-connector-tools.ts:2492, 2537, 2766-2768; apps/web/lib/connectors/finish-authorization.ts:65; apps/web/app/api/connectors/route.ts:187)
- Gmail also needs its descriptor and client pair in CONNECTOR_OAUTH_PROVIDERS_JSON, and Google verification for the restricted and sensitive scopes. [doc: docs/runbooks/connector-oauth-apps.md]; whether production has them is unknown.

**Not available**

- Labels and folders (S56.06): marked not applicable in the brief; no tool is declared. [doc: knowledge-base/data/area-briefs/056-concrete-integration-families.md]
- Local and own-key modes: no code path offers account connectors to them. [code] (apps/cli/src/claude_parity.rs:2775-2779; packages/contracts/types/src/billing-catalog.ts:332-351)
- Free plan: connectors are not in the free tier list. [code] (billing-catalog.ts:332-351)

## 4. Required behaviour

**Established requirements**

- With an email account connected, the assistant can search the mailbox by sender or subject and return matching messages. (source: S56.01)
- The assistant can open and read the full content of a specific email or thread. (source: S56.02)
- The assistant can create a draft (new or reply) in the connected mailbox for the user to review. (source: S56.03)
- The assistant can send an email from the connected account, after approval. (source: S56.04)
- The assistant can read attachments on an email and attach files when composing. (source: S56.05)
- Labels and folders: not applicable on any app. (source: S56.06)
- gmail.send sends a draft after the user approves that specific send; gmail.compose creates drafts the user reviews. (source: doc: docs/runbooks/connector-oauth-apps.md)
- send_draft is a non-reversible external send that asks under every approval policy. (source: doc: docs/development/connectors-setup.md)
- Gmail public readiness must not be claimed from offline tests; the real consent, read and draft journeys must pass on the review build first. (source: doc: docs/development/connectors-setup.md)

**Acceptance criteria**

1. With Gmail released, configured and connected on a paid plan in Cloud mode, 'find the last email from X' runs search_threads and the answer matches the real mailbox.
2. Asking for a draft shows an approval prompt naming the action; after Allow, the draft appears in Gmail Drafts with the right recipient, subject and body, and nothing is sent.
3. Asking to send always shows an approval prompt, even with 'Skip approvals' and even after 'Always allow' was set on other tools; refusing it sends nothing and the assistant does not claim the mail was sent.
4. With an expired or revoked grant, the chat shows a Reconnect card and the assistant does not claim success.
5. With no Gmail connected, no Gmail tool runs and the assistant does not invent mail.
6. A draft with a file the user did not own is refused with 'is not a file in this account.'
7. On a model whose provider may train on inputs, Gmail tools are withheld and the chat tells the user to pick another model.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- When no mailbox is connected the Gmail tools are not offered at all, so the 'offer to connect' behaviour depends on the model and any connect suggestion UI, not on a tool error. [code] (apps/web/lib/user-connector-tools.ts:2536-2540) [inferred]
- Per-plan limits for mail actions do not exist beyond the paid-plan gate and the connector tool count ceiling. [code] (apps/web/lib/user-connector-tools.ts:2441) [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Declare tool metadata for Gmail's label tools or hide them from the catalog, so a failing tool is not offered.
- [proposed] Add an Outlook draft tool after the owner decides on Mail.ReadWrite.
- [proposed] Show the full recipient list and body in the approval card for every mail write on every app.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Gmail actions | `apps/web/lib/connectors/gmail-actions.ts` | send_draft, read_attachments and create_draft_with_attachments, calling the Gmail API with the user's grant. |
| service | User connector tools | `apps/web/lib/user-connector-tools.ts` | Builds the per-turn connector tool catalog, gates by release, grant, policy and Google data rule, and routes calls to executors. |
| service | Microsoft Graph adapter | `apps/web/lib/connectors/microsoft-graph.ts` | Outlook search_mail, read_mail, send_mail. |
| config | Scope ceilings | `packages/contracts/cloud-contracts/src/connector-scopes.ts` | Lists the only scopes gmail and outlook may request; forbids broader ones. |
| config | Release gate | `packages/contracts/types/src/connector-release.ts` | coming_soon state and the released connector ids. |
| config | Plan capability table | `packages/contracts/types/src/billing-catalog.ts` | connectors capability is granted to paid tiers. |
| service | Connector capability gate | `apps/web/lib/connectors/connector-capability.ts` | Release, plan and kill-switch checks per turn. |
| config | OAuth provider registry | `apps/web/lib/connectors/oauth-registry.ts` | Reads CONNECTOR_OAUTH_PROVIDERS_JSON and credential env names; drops scopes above the ceiling. |
| config | Directory entry | `apps/web/lib/connectors/directory/sources/first-party.json` | Gmail entry with MCP url and the tool names. |
| config | Tool metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Declares read/write/send class and reversibility for Gmail and Outlook tools. |
| service | Tool call gate | `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts` | Ordered rules deciding allow, ask or deny for each call. |
| service | Connector tool permissions | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Saved Allow/Ask/Deny levels; refuses a standing allow for critical tools. |
| service | Google user data rules | `apps/web/lib/connectors/google-user-data.ts` | Marks conversations holding Google data and keeps them on no-training models. |
| service | Connect-required payload | `apps/web/lib/connectors/connect-required.ts` | Typed payload that makes the chat show Connect or Reconnect. |
| endpoint | Chat completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | The turn route that offers connector tools and runs the tool loop (api:POST /api/llm/v1/chat/completions). |
| endpoint | OAuth start and callback | `apps/web/app/api/connectors/oauth/start/route.ts` | Starts and finishes the connector sign-in (also callback and complete routes). |
| table | connector_oauth_grants | `apps/web/lib/connectors/oauth-store.ts` | Stores each user's sealed connector grant. |
| screen | Mobile Connectors screen | `apps/mobile/src/features/settings/cloud-connectors/index.tsx` | Mobile list, release label and cloud-mode gate. |
| component | Mobile connect card | `apps/mobile/src/features/chat/components/ConnectorConnectCard.tsx` | Connect or Reconnect card in chat. |
| command | CLI connectors | `apps/cli/src/cloud/connectors.rs` | agi connectors list, disconnect, reconnect notices. |
| service | CLI managed approvals | `apps/cli/src/models/managed_approvals.rs` | Collects paused connector calls and asks the user to approve. |
| component | VS Code connectors tree | `apps/extension-vscode/src/features/connectors/connectorsTree.ts` | Lists account connectors and links to web management. |
| component | Chrome side panel menu item | `apps/extension/src/side_panel.ts` | Connectors item with 'Coming soon' tag; opens the web page. |
| test | Gmail attachment workspace test | `apps/web/lib/connectors/__tests__/gmail-attachment-workspace.test.ts` | Covers draft attachment workspace authority and size budget. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person types the request in chat on the app; the app sends the turn to our servers. | device | apps/web/app/api/llm/v1/chat/completions/route.ts:792-800 |
| The server checks release, paid plan and the connectors kill switch for the turn; if any fails no connector tools are offered. | our servers | apps/web/lib/connectors/connector-capability.ts:44-67 |
| The server builds the tool list: Google's hosted mail tools plus the three AGI mail tools, but only for a connected, released Gmail and only if the turn is limited to no-training models. | our servers | apps/web/lib/user-connector-tools.ts:2500-2565 |
| The chosen model decides to call a tool; the gate allows, asks or denies using saved levels, approval policy and tool metadata. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:62-130 |
| For 'ask', the app shows the approval prompt and posts the decision back; CLI prompts in the terminal. | device | apps/cli/src/models/managed_approvals.rs:109-150; apps/web/app/api/llm/v1/chat/completions/approve/route.ts |
| Google's hosted tools run on Google's server with the user's token; the three AGI tools call the Gmail API directly with a 20 second timeout and no redirects. | outside service | apps/web/lib/connectors/gmail-actions.ts:36, 176-197 |
| The result is fenced as untrusted, returned to the model, the conversation is marked as holding Google data, and the step shows on the device. | device and our servers | apps/web/lib/connectors/gmail-actions.ts:470-478; apps/web/lib/connectors/google-user-data.ts:160-175 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| The user's Gmail OAuth grant (tokens) | table:connector_oauth_grants, sealed on our servers | Shared by every app through the account; no device copy. | Deleted on disconnect; provider revocation is best effort. [doc: docs/development/connectors-setup.md] |
| Saved tool permission levels and chat grants | table:connector_tool_permissions, table:connector_tool_session_grants | Account-wide | Removed when the connector is disconnected (CLI text says so). [code] (apps/cli/src/lib.rs:7392-7397) |
| Tool call audit events | table:connector_call_events | Account-wide | unknown |
| Google data marker on the conversation | table:web_conversations column google_user_data_at | Account-wide | Sticky once set; chats purged 30 days after deletion when the purge job is on. [doc: docs/runbooks/connector-oauth-apps.md] |
| Draft and sent mail | In the user's Gmail account, not copied by AGI | By Google | Owned by the user in Gmail. |

**Models and providers.** The model only chooses and fills in tool calls; it needs tool support. [code] (route.ts:792-793) Mail content goes to the model, so the turn must use a model whose provider does not train on inputs; otherwise the Google tools are withheld. [code] (apps/web/lib/connectors/google-user-data.ts:41-49) Which providers qualify is set by routing, not by this feature: unknown here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account required. [code] (apps/mobile/src/features/settings/cloud-connectors/index.tsx:821-829) |
| Permissions | Google scopes gmail.readonly, gmail.compose, gmail.send (Outlook: Mail.Read, Mail.Send). Re-consent is required when a grant lacks gmail.compose. [code] (connector-scopes.ts:41, 63-67; apps/web/lib/connectors/__tests__/oauth-scope-allowlist.test.ts:67) |
| Subscription | 'connectors' capability for basic, pro, max, max_15x, team, team_premium and enterprise; not free, own-key or local-only. [code] (billing-catalog.ts:332-351) |
| Limits and metering | Connector tool count has a plan ceiling; mail size limits are 5 attachments and 10 MB to read, 5 attachments and 20 MB to attach, 20 recipients, 100000 body characters. [code] (user-connector-tools.ts:2441; gmail-actions.ts:37-47) No separate metering for mail actions found: none found in the code. |
| Feature flags | Release state 'coming_soon', kill switch canUseConnectors, workspace connector policy, per-chat disabled connector ids, mobile FEATURES.connectors. [code] (connector-capability.ts:31-42; apps/mobile/lib/v1FeatureFlags.ts:18) |
| Model compatibility | Needs a model with tool support and a no-training provider for Google data. [code] (route.ts:792-793; google-user-data.ts:41-49) |
| Provider restrictions | Google mail data may only go to providers that do not train on it. [code] (google-user-data.ts:16-18) |
| Local mode | Not offered. Local and own-key sessions do not get account connectors in the CLI; the paid-plan table excludes local-only and byok tiers; the mobile screen needs Cloud mode. [code] (apps/cli/src/claude_parity.rs:2775-2779; billing-catalog.ts:332-351; index.tsx:289-290) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Connectors not released | Connect is refused; tool execution returns 'Connectors are coming soon.'; mobile row shows 'Coming soon'; Chrome item is locked. | apps/web/lib/user-connector-tools.ts:2766-2768; apps/mobile/src/features/settings/cloud-connectors/index.tsx:156-166; apps/extension/src/features/cloud-bridge/capabilityDocument.ts:80-85 |
| Not connected | Gmail tools are not offered at all; the AGI actions return an authorization-required payload if called. | apps/web/lib/user-connector-tools.ts:2536-2540; gmail-actions.ts:490-497 |
| Token expired or revoked (401) | Returns 'authorization_expired' and a Reconnect card. | gmail-actions.ts:509-511 |
| Missing compose scope (403) | Returns 'insufficient_scope' asking for gmail.compose; read_attachments returns the plain error text. | gmail-actions.ts:503-508 |
| Provider unreachable on refresh | Message tells the user to try again, not to reconnect. | gmail-actions.ts:486-488; apps/web/lib/connectors/__tests__/connector-unreachable-adapters.test.ts:45 |
| Timeout | Each Gmail request has a 20 second deadline; the error text is returned. | gmail-actions.ts:36, 176-197 |
| Approval refused | Call is recorded as declined; the step shows declined. | packages/ui/unified-chat/src/components/connector-step-sentence.ts:100-107; apps/mobile/src/features/chat/utils/declinedToolSteps.ts (imported at AgentActivityTimeline.tsx) |
| Unattended run | A step that would ask is denied unless the run can pause. | tool-call-gate.ts:118-127 |
| Offline | not handled in the code for this feature specifically; a failed request returns the error text. | gmail-actions.ts:515-517 |
| Retry | send_draft and create_draft are declared at-most-once, so they are not retried automatically. | tool-metadata.ts:716-728 |
| Accessibility | Mobile row has an accessibility label with name and state; VS Code tree items have accessibility labels. | index.tsx:162-167; connectorsTree.ts:35-38 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/gmail-attachment-workspace.test.ts`: Draft attachment workspace authority and the aggregate attachment budget.
- `apps/web/lib/connectors/__tests__/connector-unreachable-adapters.test.ts`: Transient refresh failure message for Gmail and Outlook.
- `apps/web/lib/__tests__/user-connector-tools.test.ts`: Gmail action call passes the organization context unchanged (mocked executor).
- `apps/web/lib/connectors/__tests__/oauth-scope-allowlist.test.ts`: Scope escalation and re-consent for a Gmail grant without compose.
- `apps/web/lib/connectors/__tests__/connect-required.test.ts`: Authorization-required payload shape and connect path.
- `apps/web/lib/connectors/__tests__/google-user-data.test.ts`: Google connector set and conversation marker rules.
- `apps/web/lib/__tests__/user-connector-tools.google-hosted.test.ts`: Google-hosted connector withheld unless the turn is routed to no-training models.
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-metadata.contract.test.ts`: Metadata contract, including 'permits only declared Gmail reads under read-only approval policy'.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.test.ts`: Gate precedence table.
- `apps/web/lib/connectors/__tests__/connector-release.test.ts`: Release switch at the shared gates and connect paths.
- `apps/mobile/__tests__/CloudConnectorsPage.test.tsx`: Mobile Connectors screen gating.
- `apps/extension/__tests__/connectors-coming-soon.test.ts`: Chrome 'Coming soon' lock rule.
- `apps/extension-vscode/src/__tests__/connectorsView.test.ts`: VS Code connectors tree states.

**Test scenarios**

- **Search and read**
  1. Release gmail in a test deployment, add descriptor and client pair, connect a test mailbox on a paid account.
  2. In chat on web, Cloud mode, ask for the last mail from a known sender.
  3. Open the step row and the mailbox.
  - Expected: The assistant returns the matching message; the step shows finished; no approval prompt appears under the read-only policy.
- **Draft then send with approval**
  1. Ask for a draft to the test account.
  2. Allow the create_draft prompt; open Gmail Drafts.
  3. Ask to send it; refuse once, then ask again and allow.
  - Expected: Draft exists with correct fields; refusal sends nothing and the assistant says it was not sent; allow sends and Sent shows the mail.
- **Send always asks**
  1. Set the policy to 'Skip approvals' and set Always allow on search_threads.
  2. Ask to send a draft.
  - Expected: send_draft still shows an approval prompt.
- **Expired grant**
  1. Revoke the app in the Google account page.
  2. Ask for a mail search.
  - Expected: The chat shows a Reconnect card; no success is claimed.
- **Unreleased state**
  1. Use the current release state with Gmail not released.
  2. Open Connectors on web, mobile and Chrome.
  - Expected: Gmail is marked 'Coming soon' and cannot be connected; a direct tool call returns 'Connectors are coming soon.'
- **Model that may train**
  1. Pick a model whose provider may train on inputs and turn Gmail on for the chat.
  - Expected: The chat asks for another model; Gmail tools do not run.

**Where to look when it fails**

- Log line '[user-connector] Google-hosted connector withheld from a turn that may train'. [code] (user-connector-tools.ts:2509-2511)
- Log lines starting '[connector-oauth]' for registry load and dropped scopes. [code] (oauth-registry.ts:152-166)
- Error names GmailApiError and ConnectorAuthorizationRequired payload key agi_connector_authorization_required. [code] (gmail-actions.ts:158-163; apps/cli/src/cloud/connectors.rs:9)
- Tables connector_call_events, connector_oauth_grants.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/056-concrete-integration-families.md](../../70-qa/test-plans/web/056-concrete-integration-families.md)
- Desktop: [70-qa/test-plans/desktop/056-concrete-integration-families.md](../../70-qa/test-plans/desktop/056-concrete-integration-families.md)
- Mobile: [70-qa/test-plans/mobile/056-concrete-integration-families.md](../../70-qa/test-plans/mobile/056-concrete-integration-families.md)
- CLI: [70-qa/test-plans/cli/056-concrete-integration-families.md](../../70-qa/test-plans/cli/056-concrete-integration-families.md)
- VS Code: [70-qa/test-plans/vscode/056-concrete-integration-families.md](../../70-qa/test-plans/vscode/056-concrete-integration-families.md)
- Chrome: [70-qa/test-plans/chrome/056-concrete-integration-families.md](../../70-qa/test-plans/chrome/056-concrete-integration-families.md)

## 10. Gaps and dependencies

- **Gmail and Outlook are not released, so email cannot be used on any app today.** Affects: All six apps, all users. Evidence: packages/contracts/types/src/connector-release.ts:14-30. Work needed: Owner decision to release the ids; finish Google verification and Microsoft app registration first.
- **Operator setup (descriptor, client pair, Google verification, security assessment) is not evidenced as done.** Affects: Web, desktop, mobile, chrome, CLI, VS Code. Evidence: docs/runbooks/connector-oauth-apps.md (Google section). Work needed: Owner completes setup, then a live journey is recorded.
- **No live verification of any mail journey is recorded in the repository.** Affects: All. Evidence: docs/development/connectors-setup.md (Gmail public-release gate); no recorded run found. Work needed: Run the real consent, read and draft journeys on the review build.
- **Brief per-app statuses (CLI 'reading missing', VS Code 'send missing') do not match code, which gives CLI and VS Code the same server tools.** Affects: CLI, VS Code. Evidence: apps/cli/src/claude_parity.rs:2772-2774; apps/cli/src/app_server/developer_host.rs:4557. Work needed: Re-audit the brief or add a CLI/VS Code surface test.
- **Outlook cannot draft or read attachments; the assistant can only send directly (with approval).** Affects: Outlook users on all apps. Evidence: docs/development/connectors-setup.md (Outlook section); microsoft-graph.ts tool list. Work needed: Owner decision on Mail.ReadWrite and new adapter tools.
- **Label tools are offered but unusable because gmail.modify is not admitted.** Affects: Gmail users. Evidence: first-party.json:59-70; connector-scopes.ts:41. Work needed: Hide the tools or admit the scope by owner decision.
- **No guarantee the assistant offers to connect a mailbox when none is connected.** Affects: All apps. Evidence: user-connector-tools.ts:2536-2540. Work needed: Check the connect suggestion path (mobile NewChatConnectorSuggestions) on every app.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-execution-boundaries
- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- file:apps/web/lib/connectors/gmail-actions.ts
- file:packages/contracts/cloud-contracts/src/connector-scopes.ts
- file:packages/contracts/types/src/connector-release.ts
- table:connector_oauth_grants
- table:connector_tool_permissions

## Unknown

- Whether production holds the gmail and outlook descriptors and credentials.
- Whether Google's mail MCP server is available to the project (Workspace Developer Preview membership). [doc: docs/development/connectors-setup.md]
- Exact tool list Google returns at run time and its exact approval wording.
- Which model providers qualify as no-training; set outside this feature.
- Retention period of connector_call_events.
- Whether any prompt or UI tells the user an unconnected mailbox can be connected.
- How the CLI and VS Code per-app statuses in the brief were measured.
