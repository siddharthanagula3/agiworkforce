---
id: "F069-01"
type: "feature"
title: "Chat page and Work mode"
aliases: ["Chat page", "Web chat", "/chat", "WebChatPage", "Work mode", "AGI Work (code name agiwork)", "Chat | Work toggle", "composer.modeAgiWork", "/agi-work", "S69.01"]
area: "69 Web application"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S69.01"]
depends_on: ["surface:web", "mode:cloud", "plan:Premium", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-model-catalog-and-routing", "SYS-authentication-and-identity", "file:apps/web/features/chat/pages/WebChatPage.tsx", "api:POST /api/llm/v1/chat/completions"]
basis: "code inspection"
second_reader: "6 of 10 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F069-01 Chat page and Work mode

The signed-in chat page of the AGI Workforce web app at /chat. A person types in the composer and gets a streamed reply. A Chat | Work toggle switches to Work mode, which runs multi-step tool tasks. Work is offered only on Premium or higher; below that the toggle is hidden and the server refuses it.

Area: [69. Web application](README.md). Requirement items: [S69.01](../../10-requirements/capabilities/069-web-application.md#s6901).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives a person a place in the browser to chat with the assistant. It streams replies, shows tool activity, and lets the person switch the composer between Chat and Work. Work mode sends work_mode 'agiwork' plus an optional goal and plan with the message (apps/web/lib/hooks/useChatStream.ts:4663-4670).

**Why it exists.** The web app is the main Cloud surface and is the product that the Desktop app shows inside its window (doc: AGENTS.md section 5). Work mode exists so paid users can hand off multi-step jobs that use tools, files and reviewable results (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:329-332; packages/contracts/types/src/interaction-modes.json:50-85).

**Who uses it.** Signed-in web users. A signed-out visitor gets a limited guest chat at /chat only when there is no user, no browser session cookie, the path is a guest chat page, and the guest chat is open; any other signed-out case redirects to sign-in or session-expired (apps/web/app/chat/layout.tsx:41-62). Work is for Premium, Max, Ultra, Team, Team Premium and Enterprise accounts (packages/contracts/types/src/billing-catalog.ts:341,354).

**Problems it solves**

- One place to ask questions and run tool tasks without installing anything.
- Keeps paid agent work behind the plan check on the server, so hiding a button in the browser is not the only guard (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3538-3556).
- Lets a person start in Work from a direct address (/agi-work) or from a project (apps/web/app/chat/page.tsx:5-19; ChatComposerNew.tsx:1217-1231).

**Use cases**

- Ask a quick question in Chat mode and read the streamed answer.
- Switch to Work and ask for a multi-step task such as gathering sources and producing a document.
- Open /agi-work to land directly in Work mode.
- Open a project and start a new chat in it, which lands an eligible account in Work.

## 2. User experience

**Where to find it**

- surface:web: the address /chat (new chat) and /chat/<id> (an existing chat) (apps/web/app/chat/page.tsx:1-19; apps/web/app/chat/[sessionId]/page.tsx:12-14).
- surface:web: the address /agi-work is rewritten to /chat for a signed-in browser session and opens in Work mode; the address bar keeps /agi-work (apps/web/proxy.ts:109-133; apps/web/app/chat/page.tsx:5-19).
- surface:web: /cowork redirects permanently to /agi-work (apps/web/next.config.ts:136).
- The Chat | Work toggle sits on the composer face. Its buttons are labelled 'Chat' and 'Work' (translation keys composer.modeChat and composer.modeAgiWork) (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:316-320; packages/ui/i18n/locales/en/chat.json:169,193). Hover text for Work is 'Work: multi-step tasks with tools, files, and reviewable deliverables' (ChatComposerNew.tsx:326-329).
- Other apps: the area brief gives no status for desktop, mobile, CLI, VS Code or Chrome for this item (doc: knowledge-base/data/area-briefs/069-web-application.md S69.01). The Desktop app shows the hosted web app (doc: AGENTS.md section 5).

**Before you start**

- Signed in, accepted the current terms, and passed the adult eligibility check, or the page redirects (apps/web/app/chat/layout.tsx:56-58).
- For Work: a plan of Premium or higher, billing policy loaded, not a free trial, the Work capability granted, and the toggle shown only when the composer has a project picker and no image or video mode is on (ChatComposerNew.tsx:1062-1066, 6171).

**Screens and controls**

- Composer text box and send control (ChatComposerNew.tsx).
- Chat | Work segmented toggle, data-testid composer-work-mode (ChatComposerNew.tsx:6171-6208). It is disabled while a turn runs or the composer is disabled (ChatComposerNew.tsx:6184).
- In Work mode an approval-mode control appears next to the toggle (ChatComposerNew.tsx:6211-6213).
- Slash command /code turns on cloud code execution for one message (ChatComposerNew.tsx:3247-3265).

**Journey**

1. Open /chat while signed in. The page shows the empty new-chat surface and saves nothing yet (apps/web/features/chat/pages/WebChatPage.tsx:2354-2356).
2. Type a message. For Work, press the 'Work' button first (handler ChatComposerNew.tsx:2806-2815).
3. Press send. If the browser is offline the send is refused with a notice (ChatComposerNew.tsx:3588-3590).
4. The first send creates the conversation and the address becomes /chat/<id> (WebChatPage.tsx:2679, 5792).
5. The reply streams in. Tool activity arrives as tool status frames and shows as running, completed or failed steps (apps/web/lib/hooks/useChatStream.ts:3470-3500).
6. In Work mode the server opens a durable work plan for the run when a goal is supplied (apps/web/lib/workflows/steps/work-plan-steps.ts:17-40).

**What the person sees and gets**

- Streamed assistant text and tool status lines (useChatStream.ts:3470-3500).
- Offline notice: 'You are offline. Your draft is saved here and can be sent after you reconnect.' (ChatComposerNew.tsx:717).
- Other reasons the send control is shut are read out to assistive technology, for example usage limit reached, trial run out, model unavailable (ChatComposerNew.tsx:707-718).
- If a Work request reaches the server on a plan below Premium, the response is HTTP 403 with code agi_work_plan_required and the message 'Work requires Premium or higher.' (request-processor.ts:1484-1500, 3538-3556; label from billing-catalog.ts:193-195).

**Settings**

- Default work mode: a stored setting defaultWorkMode sets the starting mode for a new chat when the account may use Work (ChatComposerNew.tsx:1233-1237).
- Kill switch for Work, set by operators, not by the person (apps/web/lib/feature-flags/kill-switches.ts:31,40).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chat page route, loading skeleton and guest or sign-in gate exist (apps/web/app/chat/layout.tsx:41-65; apps/web/app/chat/loading.tsx).
- Chat | Work toggle is built and gated by canUseAgiWork (ChatComposerNew.tsx:1062-1066, 6171-6208).
- Server refuses Work below the Premium tier with code agi_work_plan_required and status 403 (request-processor.ts:1484-1500, 3538-3556).
- Server also checks the Work kill switch before a Work turn (request-processor.ts:5217-5219).
- Work turns are routed as the agentic task type (request-processor.ts:1040). Any turn that can enter the tool loop (Work, tools, web search or code execution) holds a 24-hour managed-usage lease; other turns hold 15 minutes (request-processor.ts:1525-1535). The 24-hour lease and the tool-loop route are not Work-only: any request with tools, web_search or code_execution gets them (request-processor.ts:1525-1535).
- A new chat is not saved until the first send (WebChatPage.tsx:2354-2356).
- The composer returns to Chat if the account loses the Work capability (ChatComposerNew.tsx:1226-1228).
- The Work approval flag agi_work_plan_approval is sent as true whenever no plan steps are supplied (apps/web/lib/hooks/useChatStream.ts:4668-4669).

**Incomplete**

- The draft said Work needs 'a paid plan'. The code needs the Premium tier or higher; Basic is a paid plan but does not get Work (billing-catalog.ts:333-341,354).
- Send failure paths were not traced end to end; the page has a chat error state and a turn failure notice (WebChatPage.tsx:6857-6862) but each cause was not followed.
- Whether Work and the server plan check apply to a Local-model turn on the web page was not traced (WebChatPage.tsx:2436-2455).

**Present but disconnected or switched off**

- The capability handshake removes Work if no model in the catalog is marked agentic (capability-handshake-service.ts:101). Whether the live catalog has one is unknown.

**Not available**

- Plain-browser Local mode: WebChatPage has a Local-model turn path (it reads useLocalModelSelection). When a local model is selected through the desktop host, the send skips the server session authority, is forced temporary, skips the free-trial limit, and is refused when it would start a conversation in a project (WebChatPage.tsx:1282-1287, 2436-2455, 2203; apps/web/features/desktop-host/lib/local-model-selection.ts:15-22). The store is a plain zustand store, so the page does not show that only the desktop bridge sets it. A normal browser rarely reaches this path. [inferred]
- Work for Local-only and Local + BYOK plan tiers: those tiers are not in the Work tier list (billing-catalog.ts:341,354).

## 4. Required behaviour

**Established requirements**

- Signed-in user opens the web app in a browser, chats, and switches the composer to AGI Work for multi-step tool runs. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S69.01)
- Work mode is offered only when the plan allows it; a free-trial account never sees it. (source: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1062-1066)
- The server refuses Work below the Premium tier with error code agi_work_plan_required. (source: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1484-1500)
- Interaction modes are defined in a contract: Work needs streaming, tools and agentic model abilities, per-tool approval, synced across devices, and a queued draft only when offline. (source: packages/contracts/types/src/interaction-modes.json:50-85)
- Every subscription capability on every app connects to one AGI Subscription system. (source: task brief for this knowledge base)

**Acceptance criteria**

1. On a Free account the Chat | Work toggle is not shown.
2. On a Premium or higher account the toggle shows 'Chat' and 'Work' and switching to Work changes the placeholder and shows the approval control.
3. A direct POST of work_mode 'agiwork' for a Basic account returns 403 with code agi_work_plan_required.
4. Opening /chat saves no conversation until the first send; after send the address is /chat/<id>.
5. Offline, pressing send shows the offline notice and the draft is kept.
6. Opening /agi-work while signed in shows the chat page with Work selected.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Work availability should read the same entitlement on every app, so the Premium-or-higher rule is the one shared rule [inferred from billing-catalog.ts:354 being a shared contract].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a short reason on the page when Work is hidden (for example 'Work needs Premium'), instead of hiding the toggle without explanation, so a free user can learn why.
- [proposed] Add one test that checks the composer hides Work for Basic as well as Free.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Chat route | `apps/web/app/chat/page.tsx` | New chat entry; starts in Work when the request path is /agi-work (lines 5-19). |
| screen | Conversation route | `apps/web/app/chat/[sessionId]/page.tsx` | /chat/<id> entry with generated page title. |
| component | Chat layout gate | `apps/web/app/chat/layout.tsx` | Guest chat when open, sign-in redirect, current terms and adult eligibility checks. |
| component | WebChatRoot | `apps/web/features/chat/components/WebChatRoot.tsx` | Loads WebChatPage client-side with a skeleton and passes initialWorkMode. |
| screen | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Whole chat page: sidebar, transcript, composer, panels, send logic. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Composer, Chat / Work toggle, slash commands, offline notice, send. |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Builds the request (work_mode, agi_work_goal, agi_work_plan, and agi_work_plan_approval, which is true whenever no plan steps are supplied, lines 4668-4669), reads the stream, tracks tool status, resumes a turn. |
| endpoint | POST chat completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Managed Cloud chat endpoint that streams replies. |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Work plan check (getWorkModeEntitlementError), kill switch, routing task type, usage lease. |
| service | tool-loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs the tool steps of a Work turn. |
| service | work-plan-steps | `apps/web/lib/workflows/steps/work-plan-steps.ts` | Opens a durable work plan for an agiwork run. |
| config | Plan capability table | `packages/contracts/types/src/billing-catalog.ts` | agi_work maps to the Premium-and-above tiers (lines 341, 354). |
| service | Capability handshake | `apps/web/lib/services/capability-handshake-service.ts` | Removes canUseAgiWork by plan and by model catalog (lines 101, 121). |
| config | Kill switches | `apps/web/lib/feature-flags/kill-switches.ts` | Operator switch for the Work capability. |
| config | Interaction modes contract | `packages/contracts/types/src/interaction-modes.json` | Declares the Work mode rules, tools and billing key. |
| config | Chat labels | `packages/ui/i18n/locales/en/chat.json` | modeChat and modeAgiWork label text. |
| config | Proxy rewrite | `apps/web/proxy.ts` | Rewrites /agi-work and / to /chat for signed-in sessions. |
| component | GuestChat | `apps/web/features/chat/guest/GuestChat.tsx` | Limited signed-out chat shown at /chat when open. |
| test | Work entitlement test | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.web-search.test.ts` | Covers getWorkModeEntitlementError (lines 171-189). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser loads /chat; the layout checks identity, terms and adult eligibility, then renders the chat page. | our servers | apps/web/app/chat/layout.tsx:41-65 |
| The composer decides if Work is offered from plan, billing policy and capability, and shows the toggle. | device | ChatComposerNew.tsx:1062-1066, 6171 |
| On send the client builds the request with work_mode and goal and posts it to the managed chat endpoint. The agi_work_plan_approval flag is sent as true whenever no plan steps are supplied. | device | apps/web/lib/hooks/useChatStream.ts:4663-4670 |
| The server checks the Work plan rule (403 if below Premium), then the Work kill switch, then routes the turn as agentic. | our servers | request-processor.ts:3538-3556, 5217-5219, 1040 |
| The server opens a durable work plan when a goal is given and runs the tool loop; frames stream back. Any request with tools, web_search or code_execution, not only Work, gets the tool-loop route and the 24-hour lease. | our servers | work-plan-steps.ts:17-40; request-processor.ts:1525-1535 |
| The model call goes to the chosen provider through the managed route. | outside service | app/api/llm/v1/chat/completions/route.ts:1332-1340 [provider call path inferred from the adapter stream builder] |
| The client shows tool status and text as they arrive. | device | useChatStream.ts:3470-3500 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation and messages | Server database (conversation rows, table:web_conversations is read by the code-runs route) | Yes, loaded from the server by id on any browser (WebChatPage.tsx:2354-2375) | Kept until the person deletes or archives it; temporary chats exist (WebChatPage.tsx:2459-2470). Retention rules not traced. |
| Work plan for a run | Server database through work-plan-service (work-plan-steps.ts:24-35) | Server side only | unknown |
| Unsent draft | store:browser localStorage under agi-composer-draft keys | No | Kept until cleared; see F069-03 |

**Models and providers.** Work needs a model the catalog marks as agentic (capability-handshake-service.ts:101) and routes as the agentic task type (request-processor.ts:1040). The model and provider are chosen by the managed routing slots and the person's model picker; this page names no model. The page also has a Local-model turn path: when a local model is selected through the desktop host, the send bypasses the server session authority and is forced temporary; it is refused when starting a conversation inside a project (WebChatPage.tsx:1282-1287, 2436-2455, 2203; local-model-selection.ts:15-22). Whether Work and the server plan check apply to such a turn was not traced.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in with accepted terms and adult eligibility (apps/web/app/chat/layout.tsx:56-58). Guest chat is rendered only for a visitor with no user, no browser session cookie, on a guest chat page, when the guest chat is open; any other signed-out case redirects to sign-in or session-expired (layout.tsx:41-62). Work is never available to guests; this follows from the missing sign-in and is enforced by the server, not in this file. |
| Permissions | Per-tool approval in Work (interaction-modes.json:76-77 approvalBehavior). Workspace administrators can switch Work off for a workspace (apps/web/lib/support/agent/corpus.generated.json:224). |
| Subscription | Work needs plan tier pro (shown as Premium) or higher: Premium, Max, Ultra, Team, Team Premium, Enterprise (billing-catalog.ts:341,354). Free, Basic, Local-only and Local + BYOK do not get it. |
| Limits and metering | Usage accounting key is chat, billing key agi_work (interaction-modes.json:75-77). Any turn that can enter the tool loop (Work, tools, web search or code execution) holds a 24-hour managed-usage lease; other turns hold 15 minutes (request-processor.ts:1525-1535). |
| Feature flags | Kill switch capability canUseAgiWork (kill-switches.ts:31,40); server check at request-processor.ts:5217-5219. |
| Model compatibility | Needs streaming, tools and agentic abilities (interaction-modes.json:61-62). Removed from the handshake if no catalog model is agentic (capability-handshake-service.ts:101). |
| Provider restrictions | none found in the code for this page beyond the managed route; provider choice follows routing. |
| Local mode | Work is not offered on Local-only or Local + BYOK tiers (billing-catalog.ts:341,354). WebChatPage has a Local-model turn path: when a local model is selected through the desktop host, the send skips the server session authority, is forced temporary, skips the free-trial limit, and is refused when it would start a conversation in a project (WebChatPage.tsx:1282-1287, 2436-2455, 2203; local-model-selection.ts:15-22). What Work does there, and whether the server plan check applies, was not traced. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty new chat | Nothing is saved until first send. | WebChatPage.tsx:2354-2356 |
| Loading | A skeleton shows while the chat page loads; replies stream in. | WebChatRoot.tsx:9-12; useChatStream.ts:3470-3500 |
| Offline | Send is refused with a notice; the draft stays. | ChatComposerNew.tsx:3588-3590, 4806 |
| Plan too low for Work | Toggle hidden; composer forces Chat; server returns 403 agi_work_plan_required. | ChatComposerNew.tsx:1226-1228; request-processor.ts:3538-3556 |
| Turn running | The mode toggle is disabled. | ChatComposerNew.tsx:6184 |
| Stream dropped | On a dropped or gapped stream the client replays from its cursor through /runs/<turnId>/resume/stream, with up to 3 attempts in total and 500 ms before each attempt after the first (first try plus 2 retries). | useChatStream.ts:1672-1676 (constants and endpoint URL), 2990-2996 (attempt loop) |
| Failure | A chat error state and turn failure notice appear; every cause was not traced. | WebChatPage.tsx:6857-6862 |
| Accessibility | Toggle buttons use aria-pressed and aria-label; send reasons are spoken to assistive technology. | ChatComposerNew.tsx:707, 6184-6190 |
| Cancel | A stop control calls the stop handler (onStop). | WebChatPage.tsx:7673 (prop onStop={handleStopGeneration}) |
| Local-model turn | Sent without the server session authority, forced temporary, and refused when it would start a conversation in a project. | WebChatPage.tsx:2436-2455 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.web-search.test.ts`: getWorkModeEntitlementError: refuses agiwork below Premium, allows from Premium up, ignores chat mode (lines 171-189).
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.agiwork.test.ts`: Tool loop behaviour for Work turns.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.work-states.test.ts`: Work run states in the tool loop.
- `apps/web/features/chat/pages/__tests__/WebChatPage.project-handoff-work-mode.test.tsx`: Project hand-off landing in Work mode.
- `apps/web/features/chat/pages/__tests__/ChatRoute.test.tsx`: Chat route rendering.
- `apps/web/app/chat/__tests__/NewChatDeepLink.test.tsx`: New chat deep link.

**Test scenarios**

- **Work hidden on Free**
  1. Sign in with a Free account.
  2. Open /chat.
  3. Look at the composer.
  - Expected: No Chat | Work toggle.
- **Work on Premium**
  1. Sign in with a Premium account.
  2. Open /chat and press 'Work'.
  3. Send a multi-step request.
  - Expected: Work is selected, approval control shows, tool steps stream, the address becomes /chat/<id>.
- **Server refuses Work on Basic**
  1. Using a Basic account, POST to the chat endpoint with work_mode agiwork.
  - Expected: HTTP 403, code agi_work_plan_required.
- **Offline send**
  1. Type a message.
  2. Turn the network off.
  3. Press send.
  - Expected: Offline notice shown; draft kept; sending works after reconnect.
- **/agi-work entry**
  1. Signed in, open /agi-work.
  - Expected: Chat page opens with Work selected.

**Where to look when it fails**

- Error code agi_work_plan_required in the response body.
- Server log 'Kill-switch gate unreadable' when the gate cannot be read (request-processor.ts:5206-5214).
- Server log 'Durable work plan could not be opened' (work-plan-steps.ts:37-39).
- Capability handshake output from /api/me (apps/web/app/api/me/route.ts:282-300).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/069-web-application.md](../../70-qa/test-plans/web/069-web-application.md)

## 10. Gaps and dependencies

- **No visible reason when Work is hidden.** Affects: Free, Basic and trial users on web. Evidence: ChatComposerNew.tsx:6171 renders the toggle only when canUseAgiWork. Work needed: Decide whether to show a locked toggle with an upgrade hint.
- **Failure paths of a failed send were not traced.** Affects: All web users. Evidence: WebChatPage.tsx:6857-6862. Work needed: Trace each error to its notice and write scenarios.
- **Status of Work on desktop, mobile, CLI, VS Code and Chrome is not in the brief.** Affects: Cross-app subscription parity. Evidence: area brief S69.01 lists web only. Work needed: Check each app against the shared Premium rule.

**Depends on**

- surface:web
- mode:cloud
- plan:Premium
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-model-catalog-and-routing
- SYS-authentication-and-identity
- file:apps/web/features/chat/pages/WebChatPage.tsx
- api:POST /api/llm/v1/chat/completions

## Unknown

- Whether the live model catalog has an agentic model, which decides if Work is offered.
- How Work behaves on the Desktop app's hosted web view with a local model.
- What happens to a Work run's plan after deletion of the conversation.
- Every send-failure cause and its message.
- Whether Work and the server plan check apply to a Local-model turn on the web page (WebChatPage.tsx:2436-2455).

## Second reader's check

A second reader checked 10 statements of this page against the code: 6 correct, 4 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3/6/7):** "Work turns get a 24-hour managed-usage lease because they may enter the tool loop; others 15 minutes (request-processor.ts:1525-1535)" The code shows: The lease is 86400 s when work_mode is agiwork, or tools are present, or web_search is true, or code_execution is true. Otherwise it is 900 s. The 24-hour lease is not specific to Work. The table row at section 7 says 'Tool-loop turns', which is closer. (request-processor.ts:1525-1535). **Corrected:** Any turn that can enter the tool loop (Work, tools, web search or code execution) holds a 24-hour managed-usage lease. Other turns hold 15 minutes.
- **Partly wrong (section 7/3):** "Signed-out guests may use limited guest chat, never Work (layout.tsx:41-52)" The code shows: Guest chat shows only when there is no userId, the path is a guest chat page, there is no browser session cookie, and guestChatOpen is true. Otherwise the visitor is redirected to sign-in. The page does not mention the no-session-cookie condition, which stops a signed-out user with an expired session from seeing guest chat (they get sessionExpiredRedirect). 'Never Work' is not enforced in this file. It follows from the missing sign-in, and the server enforces it. (apps/web/app/chat/layout.tsx:41-62). **Corrected:** Guest chat is rendered only for a visitor with no user, no browser session cookie, on a guest chat page, when the guest chat is open. Any other signed-out case redirects to sign-in or session-expired.
- **Partly wrong (section 6/3):** "Own-key and Local routing are not part of the plain web chat path found here; in a plain browser there is no Local mode; a local model can be selected only through the desktop host bridge (WebChatPage.tsx:1282-1287; local-model-selection.ts:19-21)" The code shows: WebChatPage reads useLocalModelSelection and has a full local-model turn path. It sends without a session authority (no server auth), forces a temporary chat, refuses to start a local turn in a project, and skips the free-trial limit when a local model is selected. The store itself is a plain zustand store. The page does not show that only the desktop bridge sets it. The statement about Local routing 'not part of the path' is therefore wrong for the code on this page, even if the browser rarely reaches it. (WebChatPage.tsx:1282-1287, 2436-2455, 2203; local-model-selection.ts:15-22). **Corrected:** WebChatPage has a Local-model turn path. When a local model is selected through the desktop host, the send skips the server session authority, is forced temporary, and is refused when it would start a conversation in a project. Whether Work and the server plan check apply to such a turn was not traced.
- **Partly wrong (section 8):** "Stream dropped: the client has a resume endpoint and retries up to 3 times, 500 ms apart (useChatStream.ts:1672-1676)" The code shows: STREAM_RESUME_ATTEMPTS = 3 is the total number of attempts in a loop. The 500 ms wait applies only before attempts after the first, so it is the first try plus 2 retries. The cited lines hold only the constants and the endpoint URL. The loop is at 2990-2996. (useChatStream.ts:1672-1676, 2990-2996). **Corrected:** On a dropped or gapped stream the client replays from its cursor through /runs/<turnId>/resume/stream, with up to 3 attempts in total and 500 ms before each attempt after the first.

**Facts the page missed**

- Local-model turns on the web page bypass the server session authority and are forced temporary. They are refused when starting a conversation inside a project (apps/web/features/chat/pages/WebChatPage.tsx:2436-2455). The page's Local mode rows say this is unknown or not part of the path.
- The 24-hour lease and the tool-loop route are not Work-only. Any request with tools, web_search or code_execution gets them (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1525-1535).
- The Work approval flag agi_work_plan_approval is sent as true whenever no plan steps are supplied (apps/web/lib/hooks/useChatStream.ts:4668-4669). The page omits it from the request contract.
