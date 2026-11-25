---
id: "F013-13"
type: "feature"
title: "Queued and steering messages, side questions"
aliases: ["Queued next prompt", "Edit or cancel queued prompt", "Mid-task steering input", "Side question", "Follow-up behaviour (Queue or Steer)", "Follow-up queue", "Message the agent", "/btw", "S13.38", "S13.39", "S13.40", "S13.41"]
area: "13 Composer text interaction"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S13.38", "S13.39", "S13.40", "S13.41"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-sync-and-continuity", "SYS-security-and-privacy", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "table:cloud_agent_runs", "api:POST /api/llm/v1/chat/completions/runs/{runId}/steer", "file:packages/ui/unified-chat/src/queue/followUps.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F013-13 Queued and steering messages, side questions

While a reply runs, a person can keep typing. The message is held in a queue (with Edit and Cancel) and sent when the reply ends, or it is steered into a running cloud task that reads it at its next step. On the CLI, /btw asks a side question that leaves the main task alone.

Area: [13. Composer text interaction](README.md). Requirement items: [S13.38](../../10-requirements/capabilities/013-composer-text-interaction.md#s1338), [S13.39](../../10-requirements/capabilities/013-composer-text-interaction.md#s1339), [S13.40](../../10-requirements/capabilities/013-composer-text-interaction.md#s1340), [S13.41](../../10-requirements/capabilities/013-composer-text-interaction.md#s1341).

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

**What it does.** Lets a person send another message while an AI reply or agent task is still running. The message either waits in order (queue) or is handed to the running task as guidance (steer). The CLI also offers a side question (/btw) answered from the chat so far without changing it.

**Why it exists.** Waiting for a long reply to finish before typing is slow. Leading chat and coding assistants let people queue, redirect or ask aside while work runs; the brief (S13.38 to S13.41) requires the same in every app.

**Who uses it.** Anyone using chat or agent tasks in AGI Workforce: web and desktop (Electron shows the web app) users, phone users, VS Code and Chrome users, and CLI users.

**Problems it solves**

- No dead time while a long reply or task runs.
- A running task can be corrected without stopping it and losing progress.
- A quick question can be asked without disturbing the main task (CLI).
- A queued message can be fixed or dropped before it goes out.

**Use cases**

- On web, type the next question during a streaming reply; it appears as 'Queued' and sends when the reply ends.
- During a long AGI Work cloud task on web, press Steer on a queued row so the agent reads it at its next step.
- On mobile, open 'Message the agent' on a running task and send a change of course.
- On the CLI, type '/btw what did we decide about X?' during a turn and get a short answer in the transcript.

## 2. User experience

**Where to find it**

- Web (and desktop through the hosted web app): the composer. A 'Queued messages' list appears above the input with buttons Steer, Edit, Cancel (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5011-5063). The input placeholder during a reply is 'Follow up' (ChatComposerNew.tsx:353).
- Web settings: General section, row 'Follow-up behavior' with a Queue / Steer choice (apps/web/features/settings/sections/GeneralSection.tsx:641-668). Desktop-host only row 'Follow-ups while a coding agent works' (GeneralSection.tsx:670-686).
- Web research view: a steer form with input labelled 'Guidance for the rest of this research', placeholder 'Add a focus, a question or a source to cover', button 'Send' (apps/web/features/chat/components/research/ResearchActivity.tsx:572-600).
- Mobile chat composer: queued rows with Edit and Cancel buttons (apps/mobile/src/features/chat/components/ChatInput.tsx:1851-1910). Mobile running task: a 'Message the agent' link, then a box 'Add instructions or change course' and button 'Send to the agent' (apps/mobile/src/features/chat/components/RunSteerInput.tsx:39-119). Task detail also has a steer section (apps/mobile/src/features/tasks/components/CloudRunSteerSection.tsx:1-60).
- VS Code sidebar: the send button becomes 'Queue follow-up' or 'Steer follow-up' during a turn; queued user messages show Edit and Cancel (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5112-5121, :5554-5590). Setting agiWorkforce.composer.followUpBehavior (apps/extension-vscode/package.json:1238).
- Chrome side panel: list 'sp-queued-list' with Edit and Cancel buttons (apps/extension/src/side_panel.ts:15317-15364).
- CLI terminal UI: hint line '(Enter to queue, /btw to ask aside)' and '· N messages queued' (apps/cli/src/tui/tui_app.rs:2064-2074); command /btw (tui_app.rs:6400-6404).

**Before you start**

- A reply or task must be running (web: isLoading or isGenerating, ChatComposerNew.tsx:843).
- Steer on web needs the running reply to be a managed cloud agent run (the run id comes from the streaming message metadata, ChatComposerNew.tsx:4430-4434) and a message without attachments (ChatComposerNew.tsx:4483-4491).
- Chrome queueing needs a ready managed cloud chat and an owner (apps/extension/src/side_panel.ts:8704-8711).
- CLI /btw needs a session whose privacy boundary allows it (apps/cli/src/agent/chat.rs:1724-1730).

**Screens and controls**

- Web: Steer, Edit and Cancel buttons on each queued row; the label reads 'Queued: ...', 'Queued 2 of 3: ...' or 'Sent to the running reply: ...' (ChatComposerNew.tsx:5017-5062).
- Web keyboard: Cmd/Ctrl+Shift+Enter sends the other way once (shortcut defined at packages/ui/unified-chat/src/lib/shortcutRegistry.ts:33-42, handled at ChatComposerNew.tsx:4640-4646).
- Mobile: Pencil (Edit) and Cancel buttons, 44 point targets (ChatInput.tsx:1884-1910).
- Web research: Send button disabled until text is typed (ResearchActivity.tsx:593-600).
- VS Code: Cmd/Ctrl+Enter is the one-time opposite key per the setting text (package.json:1250).

**Journey**

1. 1. Start a reply or agent task.
2. 2. While it runs, type the next message in the composer and send it (Enter).
3. 3. Web/desktop: the message appears as a 'Queued' row (ChatComposerNew.tsx:3952-3972). If Follow-up behavior is Steer and the run is a cloud run, it is steered automatically (ChatComposerNew.tsx:4494-4507); otherwise press Steer on the row.
4. 4. Optional: press Edit (text and attachments return to the box) or Cancel (row removed).
5. 5. When the reply ends the first queued message for that chat is sent (ChatComposerNew.tsx:4340-4382); one message is released per finished turn.
6. 6. A steered row shows 'Sent to the running reply' and disappears once the agent has read it (ChatComposerNew.tsx:4445-4454).
7. 7. CLI: during a turn type '/btw question' and press Enter; the answer appears as a system message starting 'btw:' (tui_app.rs:4714-4731).

**What the person sees and gets**

- Web notices: 'This reply cannot take a message now, so yours sends when it finishes.' (ChatComposerNew.tsx:4470); 'Your message did not reach the running reply. It is still queued.' (ChatComposerNew.tsx:4465).
- Web notice when chat is switched: 'Your queued message was not sent: you switched chats before the reply finished.' plus whether it was saved as a draft (ChatComposerNew.tsx:4401-4418).
- Web research: 'Your guidance is applied when the current step finishes, and the plan updates to follow it.' (ResearchActivity.tsx:604-612).
- Mobile: 'Sent. The agent reads your message at its next step.' or errors in an alert text (RunSteerInput.tsx:84-100).
- Server: 202 on accepted steer; 409 messages such as 'This task already has 10 messages waiting...' (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/route.ts:62-85).
- CLI: status text 'answering the side question' (tui_app.rs:7636).

**Settings**

- Web follow-up behaviour: Queue (default) or Steer (apps/web/shared/stores/web-settings-store.ts:136); it is synced as part of the appearance settings (apps/web/features/settings/lib/appearance-namespace.ts:122-167).
- Web desktop-host: codeFollowUpQueueMode for coding agents (GeneralSection.tsx:672-686).
- VS Code: agiWorkforce.composer.followUpBehavior, enum queue/steer, default queue (apps/extension-vscode/package.json:1238-1250).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web composer queue with order, per-chat targeting, Edit and Cancel (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3952-3972, :4340-4430, :4509-4527).
- Web steer into a running cloud agent run via POST /runs/{id}/steer and the step-boundary read of pending_steer (ChatComposerNew.tsx:4456-4480; apps/web/lib/hooks/useChatStream.ts:5461-5478; apps/web/lib/services/cloud-agent-run-service.ts:2798-2873).
- Web: a message with attachments is never steered (ChatComposerNew.tsx:4490); a steer refusal leaves it queued with a notice (ChatComposerNew.tsx:4465-4471).
- Web one-time inversion with Cmd/Ctrl+Shift+Enter and the Settings default (packages/ui/unified-chat/src/queue/followUps.ts resolveFollowUpState; ChatComposerNew.tsx:4640-4646).
- Web research guidance form (ResearchActivity.tsx:572-600).
- Mobile queue with Edit, Cancel, flush on stream end, return to composer on failure (apps/mobile/src/features/chat/components/ChatInput.tsx:942-955, :1128-1195).
- Mobile 'Message the agent' steering of a running cloud task (RunSteerInput.tsx:25-119; apps/mobile/src/features/tasks/cloudRunSteer.ts:11-14) and a task-detail steer section with withdraw-and-resend (CloudRunSteerSection.tsx:24-45).
- VS Code queue (shared client queue, cap 20), steer to the active local turn, fallback to queue when the turn cannot take it, Edit and Cancel (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:276, :1062-1069, :4842-4903; webviewContent.ts:5554-5590).
- Chrome side panel queue with Edit, Cancel, full-queue notice and return-to-composer (apps/extension/src/side_panel.ts:8701-8765, :15317-15364).
- CLI queue: text typed during a turn is pushed to queued_prompts, joined with a blank line and sent after the turn; a stopped turn puts queued text back in the composer (apps/cli/src/tui/tui_app.rs:8482, :7274-7275, :8754-8760).
- CLI /btw side question answered from the conversation so far, without tools and not added to history (apps/cli/src/agent/chat.rs:1712-1775; tui_app.rs:4714-4731).

**Incomplete**

- Chrome: no steering code found in apps/extension/src (search for 'steer' returned nothing), although the brief marks Chrome steering done (brief S13.40).
- CLI: no steer of a running turn found in apps/cli/src/tui (search for 'steer' finds only remote-control and app-server code), although the brief marks CLI steering done (brief S13.40). The CLI queue joins all queued prompts into ONE message with no per-item Edit or Cancel (tui_app.rs:7274-7275).
- Mobile queue has no Steer button and no Settings follow-up behaviour; steering is a separate task-level control (ChatInput.tsx queue code has no steer; RunSteerInput.tsx).
- Web: queued rows are held in React state and are lost on reload [inferred from useState at ChatComposerNew.tsx:910]; mobile persists queued text only through the draft (ChatInput.tsx:768).
- Mobile queue is cleared when the draft identity (chat) changes (ChatInput.tsx:744-750).

**Present but disconnected or switched off**

- packages/ui/unified-chat/src/queue/followUps.ts defines a per-conversation follow-up store with a 'held' state, used by the shared useChat hook (packages/ui/unified-chat/src/hooks/useChat.ts) and tested at hooks/__tests__/useChat.followUps.test.tsx; whether any shipped app mounts useChat is unknown.

**Not available**

- Side question: web, desktop, mobile, VS Code, Chrome have no side-question feature (brief S13.41; no /btw code outside CLI found by search).
- Queue on CLI per-item Edit/Cancel: not available (tui_app.rs:8482).
- Steering of Code agent runs from the web composer: refused by the server, 'This task is running in Code' (route.ts:67-70).

## 4. Required behaviour

**Established requirements**

- While a reply is still generating, the user can type and queue the next message, which sends when the reply finishes. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.38)
- A queued message can be edited or cancelled before it is sent. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.39)
- While an agent is working, the user can send guidance that steers the running task without stopping it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.40)
- The user can ask a side question that is answered without being added to or changing the main task. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.41)
- A queued message sends only into the chat it was written for. (source: first-draft requirement in the task text; code enforces it at ChatComposerNew.tsx:4349-4350)
- A steered message is read by the running cloud task at its next step; if the run cannot take it, the message stays queued with a notice. (source: task text; code at ChatComposerNew.tsx:4465-4471)
- Messages with attachments cannot be steered; the Settings follow-up behaviour sets the default. (source: task text; code at ChatComposerNew.tsx:4490 and web-settings-store.ts:136)

**Acceptance criteria**

1. Type a message during a streaming reply on web: a 'Queued' row appears with Steer (only for a cloud run), Edit and Cancel; the message is sent once when the reply ends.
2. Queue two messages: rows read 'Queued 1 of 2' and '2 of 2'; only one is sent per finished reply.
3. Click Edit: the text and its attachments return to the box and the row is removed or replaced on re-send; Cancel removes the row and nothing is sent.
4. Queue a message, then switch to another chat before the reply ends: nothing is sent into the other chat, a notice explains, and the text is saved as a draft in the original chat.
5. On a running cloud task with Follow-up behavior set to Steer, an Enter-sent message without attachments shows 'Sent to the running reply' and the agent acts on it at its next step; with an attachment it stays queued.
6. Press Cmd/Ctrl+Shift+Enter with the setting at Queue: that one message is steered instead.
7. On mobile, 'Message the agent' on a running task sends text and shows 'Sent. The agent reads your message at its next step.'; on a finished task the control is not shown.
8. On the CLI, '/btw <question>' during or between turns returns a 'btw:' answer and the main conversation history is unchanged.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A steer queue holds at most 10 messages per run and a message at most 4,000 characters (packages/contracts/cloud-contracts/src/cloud-agent-runs.ts:80-81) [inferred: these limits should be told to the person before sending].
- All apps should expose the same Edit/Cancel behaviour for queued messages [inferred from S13.39 status words].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Correct the brief: Chrome and CLI do have a queue in code; Chrome and CLI steering are not found in code.
- [proposed] Give the CLI per-message Edit and Cancel and a real steer, or mark steering missing.
- [proposed] Add a Steer control and the follow-up setting to the mobile composer queue.
- [proposed] Offer /btw-style side questions on the other five apps.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew (queue rows, flush, steer, edit, cancel) | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web and Electron desktop composer; holds QueuedFollowUp state (line 302, 910), queue push (3952), flush (4340), steer (4456), edit (4509), UI (5011). |
| store | followUps queue helpers | `packages/ui/unified-chat/src/queue/followUps.ts` | FollowUpQueueMode, resolveFollowUpState, per-conversation follow-up store. |
| config | COMPOSER_FOLLOW_UP_INVERT_SHORTCUT | `packages/ui/unified-chat/src/lib/shortcutRegistry.ts` | Defines Cmd/Ctrl+Shift+Enter one-time inversion. |
| store | web-settings-store followUpBehavior | `apps/web/shared/stores/web-settings-store.ts` | Default 'queue' and setter. |
| screen | GeneralSection follow-up rows | `apps/web/features/settings/sections/GeneralSection.tsx` | Follow-up behavior segmented control and coding-agent follow-up row. |
| service | appearance-namespace | `apps/web/features/settings/lib/appearance-namespace.ts` | Syncs followUpBehavior with cloud settings. |
| hook | steerActiveTurn | `apps/web/lib/hooks/useChatStream.ts` | Calls steerRun for the active run and returns the steer id (line 5461). |
| screen | WebChatPage handleSteerQueuedMessage | `apps/web/features/chat/pages/WebChatPage.tsx` | Passes onSteerQueuedMessage to the composer (line 4341, 7675). |
| component | ResearchActivity steer form | `apps/web/features/chat/components/research/ResearchActivity.tsx` | Research-view guidance box and queued/unread notices. |
| service | managed-cloud-agent-runs-client steerRun / withdrawSteer | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | HTTP client for the steer endpoints (line 447-470). |
| schema | Steer request/response schemas and limits | `packages/contracts/cloud-contracts/src/cloud-agent-runs.ts` | MAX length 4000, MAX pending 10, isCloudAgentRunSteerable. |
| endpoint | POST /api/llm/v1/chat/completions/runs/{runId}/steer | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/route.ts` | Validates, rate limits, CSRF-checks, secret-gates and queues a steer (202). |
| endpoint | DELETE .../runs/{runId}/steer/{steerId} | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/[steerId]/route.ts` | Withdraws a steer not yet read. |
| service | cloud-agent-run-service steer functions | `apps/web/lib/services/cloud-agent-run-service.ts` | queueCloudAgentRunSteer, takeCloudAgentRunSteers, withdrawCloudAgentRunSteer (line 2798-2895). |
| table | cloud_agent_runs.pending_steer | `apps/web/db/neon/0324_cloud_agent_run_steer.sql` | JSON array of unread steer messages. |
| job | takeSteerMessages in executors | `apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts` | Reads steers at step boundaries (line 736); also research-run-options.ts:160 and chat route.ts:1091. |
| component | ChatInput (mobile) queue | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Mobile queue state, flush, edit, cancel, queued row UI. |
| component | RunSteerInput | `apps/mobile/src/features/chat/components/RunSteerInput.tsx` | 'Message the agent' box for a running task. |
| service | cloudRunSteer | `apps/mobile/src/features/tasks/cloudRunSteer.ts` | steerCloudRun, withdrawCloudRunSteer, error text. |
| component | CloudRunSteerSection | `apps/mobile/src/features/tasks/components/CloudRunSteerSection.tsx` | Task-detail steer list with withdraw-and-send-as-message. |
| service | ChatStateManager send queue and _trySteerActiveTurn | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | VS Code queue (cap 20) and steer with queue fallback. |
| component | VS Code webview follow-up UI | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Queue/Steer button label, queued message Edit and Cancel. |
| component | Chrome side panel follow-up queue | `apps/extension/src/side_panel.ts` | followUpQueue, canQueueFollowUp, renderQueuedFollowUps. |
| component | CLI TUI queue and /btw | `apps/cli/src/tui/tui_app.rs` | queued_prompts, turn_composer_hint, start_side_query, /btw slash command. |
| service | CLI SideQuery | `apps/cli/src/agent/chat.rs` | side_query and SideQuery::ask: tool-free side question on a copy of the conversation (line 1712-1775). |
| test | messageQueueManager test | `packages/client/client-runtime/src/queue/__tests__/messageQueueManager.test.ts` | Test file for the shared createMessageQueue used by VS Code and Chrome (implementation path not opened). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person sends while a turn is active; the web composer stores the send arguments with the current conversation id as a queued row and clears the box. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3952-3978 |
| If steering applies (setting Steer, or inverted, and a streaming cloud run exists, no attachments), the composer calls steerActiveTurn, which posts the text to the run's steer endpoint. | device and our servers | ChatComposerNew.tsx:4494-4507; apps/web/lib/hooks/useChatStream.ts:5461-5478; managed-cloud-agent-runs-client.ts:447 |
| Server checks rate limit, CSRF, run id, message length, secret handling, then appends {id,text,queued_at} to pending_steer if the run is in a held state, not pausing or cancelling, under 10 waiting, and not a Code run; returns 202. | our servers | apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/route.ts:35-62; apps/web/lib/services/cloud-agent-run-service.ts:2798-2833 |
| The executor takes and clears pending_steer at its next step boundary and gives the messages to the model; the web composer drops the 'Sent to the running reply' row when the run's activity shows the steer was read. | our servers | cloud-agent-run-service.ts:2855-2875; execute-cloud-agent-invocation.ts:736; ChatComposerNew.tsx:4445-4454 |
| When the turn ends, the composer sends the first queued message for the same conversation through the normal send path; messages queued for another conversation are returned to that chat's draft with a notice. | device | ChatComposerNew.tsx:4340-4418 |
| Mobile 'Message the agent' posts to the same steer endpoint via the cloud run client. | device and our servers | apps/mobile/src/features/tasks/cloudRunSteer.ts:11-14 |
| VS Code steer calls the local developer runtime's steerTurn for the active turn; on a turn-ended error it queues instead. | device | apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:4853-4888 |
| CLI /btw copies the conversation text, adds a short 'Side question' prompt with no tools, and streams a completion from the session's provider and model; the answer is shown as a system message. Which provider answers depends on CLI configuration (unknown). | outside service | apps/cli/src/agent/chat.rs:1724-1775; tui_app.rs:4714-4731 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Queued message text, attachment files, tools snapshot, target conversation id (web) | component memory (React state/refs) in the web composer | no | removed when sent, cancelled or returned to a draft; attachments are not kept when a chat switch strands the message (ChatComposerNew.tsx:4408-4415) |
| Queued text (mobile) | component state, mirrored into the per-chat draft store via setDraft (ChatInput.tsx:768-777) | unknown | cleared on chat identity change (ChatInput.tsx:748) |
| Steer message {id,text,queued_at} | table:cloud_agent_runs column pending_steer | server-held; read by every app that shows the run | set to null when the executor takes it or when withdrawn (cloud-agent-run-service.ts:2869, 2884-2895) |
| Follow-up behaviour setting | web settings store, synced via appearance settings | yes, through CloudSettingsSync | kept until changed (apps/web/features/settings/lib/appearance-namespace.ts:122) |
| CLI side-question answer | transcript message in TUI memory only | no | not added to model history (agent/chat.rs:1712 comment) |

**Models and providers.** Queue and Edit/Cancel use no model. A steer is read by whichever model runs the cloud task; the model choice is the task's own and the steer adds no routing rule (found no model code in the steer route). VS Code steers the local developer runtime on the same model as the active turn; a different requested model forces queueing instead (ChatStateManager.ts:4837-4841). CLI /btw uses the session's provider and model and obeys the Local-to-cloud privacy guard (agent/chat.rs:1725-1727).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web steer needs a signed-in user because the endpoint resolves a user-scoped database (steer/route.ts:35-37). Queueing on web, mobile, VS Code, CLI needs no extra account step beyond whatever sending a message needs. Chrome queueing needs a ready managed cloud chat with an owner (side_panel.ts:8704-8711). |
| Permissions | Run ownership is enforced by user_id and organization_id in the SQL (cloud-agent-run-service.ts:2807-2810). Steer text passes the secret-handling gate: secrets block the request or are redacted (steer/route.ts:46-50). CSRF token required (route.ts:37-38). |
| Subscription | none found in the code for the steer route or the queue; subscription limits apply to the underlying chat or task run, not to steering itself [inferred]. |
| Limits and metering | Rate limit bucket 'llm-completion' on the steer route (route.ts:32). Max 10 waiting steers per run and 4,000 characters per message (packages/contracts/cloud-contracts/src/cloud-agent-runs.ts:80-81). VS Code queue cap 20 (ChatStateManager.ts:276); Chrome queue has a lane cap (side_panel.ts:8727-8730). No usage metering of the steer itself found. |
| Feature flags | Settings, not flags: web followUpBehavior (default queue), codeFollowUpQueueMode (desktop host only), VS Code agiWorkforce.composer.followUpBehavior (default queue). No feature flag found. |
| Model compatibility | Steering applies to any model run inside a managed cloud agent run. VS Code steer needs the same model as the active turn and no extra effort setting, edit-automatically off and shell approval off (ChatStateManager.ts:4696-4704). Web steer: no model check found. |
| Provider restrictions | none found in the code for queue or steer. CLI /btw is blocked if the privacy boundary check fails (agent/chat.rs:1725). |
| Local mode | Web and mobile queue works the same in any mode because it is on the device; web Steer needs a cloud agent run id, so it is not offered for a Local reply (canSteerQueued needs streamingRunId, ChatComposerNew.tsx:4486). VS Code steers its local developer runtime without cloud. CLI queue and /btw work locally; /btw on a Local session refuses cloud egress (agent/chat.rs:1725). Whether mobile steer works for a Local task: unknown (RunSteerInput posts to the cloud run API, steerCloudRun). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Chat switched while a message is queued (web) | The message is not sent; text is merged into the original chat's draft and a notice says so; attachments are lost and the notice says to re-attach. | ChatComposerNew.tsx:4385-4418 |
| Queued send refused or fails (web) | Row stays in the queue; only a successful current send removes it. | ChatComposerNew.tsx:4373-4380 |
| Stop pressed (CLI) | Queued prompts go back into the composer, nothing is sent. | apps/cli/src/tui/tui_app.rs:8754-8760 |
| Stop or failed send (mobile) | Declined or failed queued send returns text and attachments to the composer, marked unsent. | ChatInput.tsx:1128-1195 |
| Run cannot take a steer (finished, pausing, waiting on you) | Server returns 409 with a plain message; web keeps the message queued. | steer/route.ts:62-85; ChatComposerNew.tsx:4465-4471 |
| Steer queue full (10 waiting) | 409 'This task already has 10 messages waiting'. | steer/route.ts:72-75 |
| Code run | 409 telling the person to send it in the Code session. | steer/route.ts:67-70 |
| Steer sent just as the turn ends (VS Code) | Message 'Steer was accepted just as the active turn finished.'; a rejected steer falls back to the queue. | ChatStateManager.ts:4866-4885 |
| Queue full (VS Code, Chrome) | VS Code rejects with a capacity notice; Chrome shows a 'queued full' notice with the lane cap. | ChatStateManager.ts:4675-4679; side_panel.ts:8727-8730 |
| Offline (web, mobile) | Web refuses sending with a notice before any queueing; offline mobile text is held to send on reconnect. | ChatComposerNew.tsx:3589-3592; ChatInput.tsx:1645-1648 |
| Accessibility | Web queue is a list with aria-label 'Queued messages' and labelled buttons; mobile rows carry accessibilityLabel 'Queued message N of M'; mobile steer input has an accessibility hint and an alert role for errors. | ChatComposerNew.tsx:5012; ChatInput.tsx:1857; RunSteerInput.tsx:48,92 |
| Page reload with a queued web message | not handled in the code that was read (state is in memory) | ChatComposerNew.tsx:910 |
| Timeout of an unread steer | not handled in the code read; the steer stays in pending_steer until read or withdrawn | cloud-agent-run-service.ts:2855-2895 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ChatComposerNew.followUpQueue.test.tsx`: Two follow-ups kept, queued marker, cancel one, edit in place.
- `apps/web/features/chat/components/Composer/ChatComposerNew.followUpSteer.test.tsx`: Queue setting vs Steer setting, Cmd/Ctrl+Shift+Enter inversion, steer calls.
- `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/route.test.ts`: Steer endpoint behaviour.
- `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/[steerId]/route.test.ts`: Withdraw steer endpoint.
- `apps/web/lib/hooks/useChatStream.settlement-ownership.test.tsx`: steerActiveTurn call in a stream hook test (line 619).
- `packages/ui/unified-chat/src/hooks/__tests__/useChat.followUps.test.tsx`: Shared follow-up queue in useChat.
- `apps/mobile/src/features/chat/components/__tests__/ChatInput.followUpQueue.test.tsx`: Mobile queue mid-stream, cancel, one release per finished turn, stop control reachable.
- `apps/extension-vscode/src/__tests__/followUpBehavior.webview.test.ts`: VS Code follow-up behaviour in the webview.
- `packages/client/client-runtime/src/queue/__tests__/messageQueueManager.test.ts`: Shared message queue manager.
- `apps/cli/src/tui/tui_app.rs`: In-file test a_stopped_turn_returns_its_queued_prompts_to_the_composer (line 13672).

**Test scenarios**

- **Web queue and flush**
  1. Start a long reply in a chat.
  2. Type 'next' and press Enter.
  3. Wait for the reply to end.
  - Expected: A 'Queued: next' row shows, then 'next' is sent once after the reply ends.
- **Web steer into a cloud task**
  1. Set Follow-up behavior to Steer.
  2. Start an AGI Work cloud task.
  3. Send 'focus on pricing' without attachments.
  - Expected: Row reads 'Sent to the running reply'; the agent acts on it at its next step and the row disappears.
- **Chat switch strands a queue**
  1. Queue a message in chat A.
  2. Open chat B before the reply ends.
  - Expected: Nothing is sent to B; chat A has the text as a draft and a notice is shown.
- **Mobile Message the agent**
  1. Open a running cloud task on a phone.
  2. Tap 'Message the agent', type guidance, tap 'Send to the agent'.
  - Expected: 'Sent. The agent reads your message at its next step.'; the task keeps progress.
- **CLI side question**
  1. Run a CLI chat and send a prompt.
  2. During the turn type '/btw summarise so far' and Enter.
  - Expected: A 'btw:' answer appears; the main turn and history are unchanged.
- **Steer refused**
  1. Pause a cloud task.
  2. Try to steer it.
  - Expected: Server 409; web shows the notice and keeps the message queued.

**Where to look when it fails**

- Server errors from the steer route: CloudAgentRunNotSteerableError, CloudAgentRunSteerQueueFullError, CloudAgentCodeRunNotSteerableError (steer/route.ts:62-85).
- table:cloud_agent_runs, column pending_steer (non-null means unread messages).
- Web notices in the composer local notice strings quoted above.
- VS Code followUpStatus messages kinds queued, steered, queue-fallback, cancelled, error (ChatStateManager.ts:599).
- CLI: system message 'btw failed: ...' or '/btw ...' reason (tui_app.rs:4727, 7643).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/013-composer-text-interaction.md](../../70-qa/test-plans/web/013-composer-text-interaction.md)
- Desktop: [70-qa/test-plans/desktop/013-composer-text-interaction.md](../../70-qa/test-plans/desktop/013-composer-text-interaction.md)
- Mobile: [70-qa/test-plans/mobile/013-composer-text-interaction.md](../../70-qa/test-plans/mobile/013-composer-text-interaction.md)
- CLI: [70-qa/test-plans/cli/013-composer-text-interaction.md](../../70-qa/test-plans/cli/013-composer-text-interaction.md)
- VS Code: [70-qa/test-plans/vscode/013-composer-text-interaction.md](../../70-qa/test-plans/vscode/013-composer-text-interaction.md)
- Chrome: [70-qa/test-plans/chrome/013-composer-text-interaction.md](../../70-qa/test-plans/chrome/013-composer-text-interaction.md)

## 10. Gaps and dependencies

- **Brief says CLI queue is missing, but the CLI TUI queues typed prompts.** Affects: CLI; the knowledge base status. Evidence: apps/cli/src/tui/tui_app.rs:8482 and :7274; brief S13.38. Work needed: Correct the brief status; decide whether per-message Edit/Cancel is required.
- **Brief says Chrome queue is missing, but the Chrome side panel has a queue with Edit and Cancel.** Affects: Chrome. Evidence: apps/extension/src/side_panel.ts:8701-8765, :15317-15364. Work needed: Correct the brief status.
- **Steering marked done on Chrome and CLI, but no steering code was found there.** Affects: Chrome, CLI. Evidence: search of apps/extension/src and apps/cli/src/tui finds no steer code (CLI steer hits only remote-control and app-server). Work needed: Build steering or correct the brief; verify CLI app-server steer (apps/cli/src/app_server/developer_host.rs:139) is not connected to the TUI.
- **CLI queue merges all queued prompts into one message and has no Edit or Cancel per item.** Affects: CLI. Evidence: tui_app.rs:7274-7275. Work needed: List queued items individually with Edit and Cancel.
- **Mobile chat composer has no Steer on a queued message and no Queue/Steer setting.** Affects: Mobile. Evidence: ChatInput.tsx queue code (942-955, 1851-1910) has no steer. Work needed: Add steer and the setting, or document the separate task-level control as the design.
- **No side question outside the CLI.** Affects: Web, desktop, mobile, VS Code, Chrome. Evidence: brief S13.41. Work needed: Design and build a side-question control that does not touch the main task.
- **Web queued messages are lost on reload.** Affects: Web, desktop. Evidence: state in useState at ChatComposerNew.tsx:910. Work needed: Persist or warn.
- **No end-to-end test found for steer reaching the model at a step boundary.** Affects: Web cloud tasks. Evidence: test files listed only cover route and composer units. Work needed: Add an executor-level test and a live run.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-sync-and-continuity
- SYS-security-and-privacy
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- table:cloud_agent_runs
- api:POST /api/llm/v1/chat/completions/runs/{runId}/steer
- file:packages/ui/unified-chat/src/queue/followUps.ts

## Unknown

- Whether the Tauri desktop app (apps/desktop/src) has its own queue or steer: only TauriRuntime and settings files mention steer and the composer there was not opened.
- Whether any shipped app mounts the shared useChat hook that uses the follow-up store.
- The exact handler of the web research view steer action (runAction kind 'steer') and which endpoint it calls; the ResearchActivity UI was read but the handler was not found.
- Whether mobile Message the agent works for Local tasks.
- Which provider /btw uses in a given CLI configuration, and whether metering applies to it.
- Where the shared createMessageQueue is implemented (only its test file path was confirmed).
- Whether queued mobile text survives an app restart beyond the draft store.
- Results of any run of the listed tests: no file records them.
