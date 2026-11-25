---
id: "AREA-019"
type: "area"
title: "Streaming and response-presentation states"
features: ["F019-01", "F019-02", "F019-03", "F019-04", "F019-05", "F019-06", "F019-07", "F019-08"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 19. Streaming and response-presentation states

This area is what a person sees between pressing send and getting a finished answer. It shows that the request was accepted, what the assistant is doing right now (searching, running code, calling a connected service, waiting for approval or for an answer), how the text arrives, and how the turn ends: completed, partly completed, stopped, or failed with a reason and a next step. It matters because a turn can take a long time or fail for many reasons, and a person who cannot tell waiting from hanging, or a stop from a crash, will retry, duplicate work or give up.

**Who uses it.** Every signed-in chat user on every app (Web, Desktop, Mobile, CLI, VS Code extension, Chrome extension) sees these states. Managed Cloud runs (the paid, server-run turns) add the durable-run states (reconnecting, stopping the Cloud task, resuming, Cloud task waiting for approval or input). Local and own-key turns use the in-app streaming path. Plan limits decide which limit notices a user can hit (free allowance, plan restriction, usage limit). Workspace administrators affect the workspace-policy notice. Developers and QA use the CLI and the server endpoint directly; the brief marks the API status done, but the server endpoint was only partly read.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F019-01](F019-01-turn-accepted-queued-and-preparing.md) | Turn accepted, queued and preparing | built | built | built | partly | built | built |
| [F019-02](F019-02-live-progress-search-code-connected-services-media.md) | Live progress: search, code, connected services, media and files | built | built | partly | built | partly | partly |
| [F019-03](F019-03-pauses-that-need-you-approval-input-and-device.md) | Pauses that need you: approval, input and device | built | built | built | built | partly | built |
| [F019-04](F019-04-streaming-the-answer.md) | Streaming the answer | built | built | built | built | built | built |
| [F019-05](F019-05-how-a-turn-ends-completed-partly-done-stopped.md) | How a turn ends: completed, partly done, stopped | built | built | built | built | built | built |
| [F019-06](F019-06-failure-notices-with-a-next-step.md) | Failure notices with a next step | built | built | built | built | built | built |
| [F019-07](F019-07-reconnect-resume-and-background-work.md) | Reconnect, resume and background work | built | built | partly | partly | partly | built |
| [F019-08](F019-08-saving-and-restoring-results.md) | Saving and restoring results | built | built | built | partly | partly | built |

Requirement items for this area: [10-requirements/capabilities/019-streaming-and-response-presentation-states.md](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md).

## How this area works in the code

1. **Send and paint at once.** On web, the user message and an empty assistant row are added synchronously before the first network await, so the turn appears in the same frame as the click. The turn's start time is set one millisecond after the user message to keep their order. (`apps/web/lib/hooks/useChatStream.ts:4288-4309`)
2. **Queue a follow-up while busy.** If a turn is already running, a new message is kept in a queue held in the composer's React state, and the send button shows a Queued chip with a count. Mobile keeps a similar list in its chat input and marks queued bubbles as queued offline. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:910`, `apps/web/features/chat/components/Composer/SendButton.tsx:109-114`, `apps/mobile/src/features/chat/components/ChatInput.tsx:490`, `apps/mobile/src/features/chat/components/MessageBubble.tsx:2228-2246`)
3. **Show preparing and waiting for the first token.** While loading with no streaming row yet, the list shows a Preparing indicator. A waiting ticker starts after the request is sent and writes a waiting summary with a model name and elapsed time into the activity record until the first real event arrives. (`apps/web/features/chat/components/messages/ChatMessageList.tsx:1350`, `apps/web/features/chat/components/messages/TypingIndicator.tsx:17`, `apps/web/lib/hooks/useChatStream.ts:4442-4461`, `apps/web/lib/hooks/useChatStream.ts:2273-2287`)
4. **Receive events and update the activity record.** Each server event (text, reasoning, tool start and result, native search, pause, stop) updates the message's agent activity. Native web search gets a synthetic row that yields to a real row once one arrives. The activity timeline turns the record into a one-line summary and an announcement. (`apps/web/lib/hooks/useChatStream.ts:2323-2349`, `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:140-215`, `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:337-345`, `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:372-382`)
5. **Pause for approval or an answer.** A pause sets the activity status to awaiting approval or paused with an input request. The approval card offers Approve and deny choices, and the screen announces the pause once. (`apps/web/features/chat/components/approvals/ToolApprovalCard.tsx:80`, `apps/web/features/chat/components/messages/ChatMessageList.tsx:1750-1762`, `apps/web/lib/hooks/useChatStream.ts:5904`)
6. **Stop a turn.** The stop button (send mode stop) aborts the local stream and stamps the turn as stopped with the text kept. For a Cloud run, the app shows Stopping the Cloud task, sends a cancel, then polls the run once a second for up to 30 checks until it reaches a terminal state; if not confirmed, an error toast appears. (`apps/web/features/chat/components/Composer/SendButton.tsx:40-50`, `apps/web/lib/hooks/useChatStream.ts:5408-5455`, `apps/web/features/chat/lib/cancel-cloud-run.ts:4-21`, `apps/web/lib/hooks/useChatStream.ts:6138-6146`)
7. **Reconnect and resume a Cloud run.** If the stream drops, the app marks the answer Reconnecting, then re-follows the durable run from the last sequence it saw, polling every 2.5 seconds, and clears the mark on the first event back. (`apps/web/lib/hooks/useChatStream.ts:3041-3049`, `apps/web/lib/hooks/useChatStream.ts:3093-3129`, `apps/web/lib/hooks/useChatStream.ts:1365`, `apps/web/features/chat/stores/stream-phase-store.ts:22-29`, `apps/web/features/chat/components/messages/StreamPhaseNotice.tsx:6-18`, `apps/web/features/chat/components/messages/MessageBubble.tsx:3620`)
8. **Finish the turn and store its state.** When the stream settles, the app writes the final finish reason (stop, length, stopped or error), the stream error, and the activity summary onto the message, then saves the assistant message. A stopped run is saved through a separate path on the server. (`apps/web/lib/hooks/useChatStream.ts:3058-3072`, `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:160`)
9. **Choose the failure notice.** A notice resolver decides which single notice owns the last message: continue, stop, provider failure, refusal, or the fallback for an unusable turn. The error code is mapped to a cause, which gives the sentence; a provider wait is added only when the provider stated one; a reference id is appended when the server logged one. A user message with no reply counts as incomplete only after 45 seconds. (`apps/web/features/chat/lib/turn-error-notice.ts:104-113`, `apps/web/features/chat/lib/turn-error-notice.ts:200-223`, `apps/web/features/chat/lib/turn-error-notice.ts:266-308`)
10. **Server side (the streaming endpoint).** The server route builds the tool list (connectors, operator tools, a gated search tool when approval is needed), runs durable streams with a first-event budget, and cancels the run when the client cancels. Only the first part of this route was read; the streaming and error code paths were not fully traced. (`apps/web/app/api/llm/v1/chat/completions/route.ts:1`, `apps/web/app/api/llm/v1/chat/completions/route.ts:850-875`, `apps/web/lib/workflows/durable-stream-liveness.ts:5-16`, `apps/web/lib/workflows/durable-stream-liveness.ts:51-53`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/hooks/useChatStream.ts` | The web turn engine: sends the request, updates the activity record, handles stop, reconnect, resume and the finish state (about 6,000 lines). |
| `apps/web/features/chat/lib/turn-error-notice.ts` | Maps failure codes to plain sentences, retry waits, grace period and which single notice owns the last message. |
| `apps/web/features/chat/stores/stream-phase-store.ts` | In-memory store for the Reconnecting and Stopping labels, keyed by message id. |
| `apps/web/features/chat/components/messages/StreamPhaseNotice.tsx` | Draws the Reconnecting or Stopping the Cloud task line under an answer. |
| `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx` | Shared timeline: turns the activity record into one-line summaries and announcements (waiting, approval, device, partial, cancelled). |
| `apps/web/lib/hooks/useChatStream.ts` | Also the stop action (around lines 5408-5455) and the Cloud stop confirmation call. |
| `apps/web/features/chat/lib/cancel-cloud-run.ts` | Sends a cancel for a Cloud run and polls until a terminal state (up to 30 checks, 1 second apart). |
| `apps/mobile/src/features/chat/utils/messageStreamError.ts` | Mobile's mapping from a stream failure frame to its sentence, wait and reference id. |
| `apps/mobile/stores/chat/chatExecutionStore.ts` | Mobile's streaming store: reconnecting ids, stop, and the turn state for streamed answers. |
| `apps/cli/src/errors.rs` | CLI error kinds, hints, and the incomplete-turn causes (no response, safety, output limit, stream ended early). |
| `apps/cli/src/tui/tui_app.rs` | CLI terminal UI: the waiting-for-approval and Preparing context labels and the stall hint after ten seconds. |
| `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | VS Code sidebar: queued follow-up controls, stopping state and sub-task status, all in one large file (about 9,400 lines). |
| `apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts` | VS Code mapping from failure codes to category, headline and retry. |
| `apps/extension/src/side_panel.ts` | Chrome side panel: reconnecting flag on messages, queued list, and the turn UI (about 16,800 lines). |

## What is stored

- Stream phase (Reconnecting or Stopping) per message: In memory only, in the web stream-phase store (apps/web/features/chat/stores/stream-phase-store.ts:10). Lost on reload.
- Turn state: finish reason, stream error, error code, error reference id, truncated flag, activity record, Cloud run reference: Message metadata on the web chat message, saved through apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts (the stopped-run path at line 160). Set in apps/web/lib/hooks/useChatStream.ts:3058-3072 and 6138-6146.
- Queued follow-up messages (web): React state in the composer, apps/web/features/chat/components/Composer/ChatComposerNew.tsx:910. Not saved.
- Queued follow-up messages (mobile): React state in apps/mobile/src/features/chat/components/ChatInput.tsx:490. Not saved.
- Reconnecting message ids (mobile): In-memory list in the mobile execution store, apps/mobile/stores/chat/chatExecutionStore.ts:378 and :1117-1128.
- Background CLI runs (id, state, log file): A folder named background under the CLI config directory, one folder per run: apps/cli/src/background.rs:65-73 and save at :94.
- Chrome in-flight Cloud run and owner per stream: In-memory maps in apps/extension/src/side_panel.ts around lines 7000-7006 (cloudRunsByStreamId, ownerByStreamId).

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_DURABLE_FIRST_EVENT_BUDGET_MS (environment value)**: Sets how long the server waits for the first event of a durable stream before it counts the budget as exceeded. Default 500 ms, minimum 1 ms. (apps/web/lib/workflows/durable-stream-liveness.ts:11, 15-16, 51-53)
- **DURABLE_FIRST_EVENT_TIMEOUT_MS and DURABLE_STALL_COOLDOWN_MS**: Constants: 12 seconds before a durable stream counts as stalled; 60 seconds of cooldown after a stall. (apps/web/lib/workflows/durable-stream-liveness.ts:5 and :7)
- **DURABLE_RUN_POLL_INTERVAL_MS**: How often the web app polls a durable run for new events while reconnecting: 2.5 seconds. (apps/web/lib/hooks/useChatStream.ts:1365)
- **STOP_CONFIRMATION_POLL_MS and STOP_CONFIRMATION_ATTEMPTS**: Stop confirmation polls once per second for up to 30 checks before it gives up and shows the not-confirmed toast. (apps/web/features/chat/lib/cancel-cloud-run.ts:4-5)
- **INCOMPLETE_TURN_GRACE_MS**: A user message with no reply counts as an incomplete turn only after 45 seconds. (apps/web/features/chat/lib/turn-error-notice.ts:266)
- **MAX_STATED_RETRY_AFTER_SECONDS**: A provider wait longer than 24 hours is not shown; shorter waits are shown as seconds, minutes or hours. (apps/web/features/chat/lib/turn-error-notice.ts:198)
- **Plan and account limit codes (insufficient_credits, rolling five-hour and weekly limits, flagship weekly limit, free allowance exhausted, plan excludes model)**: Each code selects a limit notice that points to Usage or the plan. These are the plan gates the notices depend on; the code that sets them on the server was not traced. (apps/web/features/chat/lib/turn-error-notice.ts:86-113; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:236-320)
- **--fallback-model (CLI flag, named in a hint)**: The rate-limit hint tells the user to run again with a fallback model. (apps/cli/src/errors.rs:610-619)
- **Config directory for background runs**: Where the CLI stores background run folders. (apps/cli/src/background.rs:65-67)

## Shared between apps

Shared between apps: the timeline and activity summary in packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx (used by the web app and by the shared chat UI package); the terminal task states in packages/contracts/types/src/cross-device.ts (used by the web app's Cloud run service and the cloud run stop helper); the shared chat UI package's useChat hook lists the same task states. Separate per app: web notices (apps/web/features/chat/lib/turn-error-notice.ts), mobile stream failure mapping (apps/mobile/src/features/chat/utils/messageStreamError.ts) and its own timeline component (apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx), CLI errors and terminal UI (apps/cli/src/errors.rs, apps/cli/src/tui/tui_app.rs), VS Code webview and error presentation (apps/extension-vscode/src/features/sidebar-webview/), and Chrome side panel (apps/extension/src/side_panel.ts). Desktop's code path was not opened; the brief's desktop status is not checked against code.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Many code references in the brief point at lines that are not the cited code. Checked and wrong: apps/cli/src/tui/tui_app.rs:6445 is a security review question, not a status label; apps/web/lib/hooks/useChatStream.ts:1678 is a blank line; apps/web/app/api/llm/v1/chat/completions/route.ts:860 sits in connector tool setup, not streaming; apps/extension/src/side_panel.ts:356 is an icon import; apps/cli/src/errors.rs:86 is a closing brace; apps/cli/src/errors.rs:322 is inside a format string. The brief's refs need a re-check before it is used as a map. (apps/cli/src/tui/tui_app.rs:6445; apps/web/lib/hooks/useChatStream.ts:1678; apps/web/app/api/llm/v1/chat/completions/route.ts:860; apps/extension/src/side_panel.ts:356; apps/cli/src/errors.rs:86, 322)
- The web waiting label always says Preparing, whatever is happening. It does not say that context, attachments or memory are being read (S19.03 asks for that). Only the CLI passes a Preparing context label, and only when its preparing flag is set. (apps/web/features/chat/components/messages/TypingIndicator.tsx:17; apps/web/features/chat/components/messages/ChatMessageList.tsx:1350, 2000-2008; apps/cli/src/tui/tui_app.rs:8545)
- Mobile's stop action settles streaming messages locally as cancelled and does not wait for a Cloud stop to be confirmed, unlike web. No stop-in-progress label was found in the mobile app code (searched for stopping and cancel). (apps/mobile/stores/chat/chatExecutionStore.ts:5423-5445)
- The stream-phase store and its Reconnecting and Stopping labels exist only on web. Mobile has a reconnecting list (rendered at apps/mobile/src/features/chat/components/MessageBubble.tsx:1932-1935), so the brief's status for mobile reconnecting is consistent with the code. (apps/web/features/chat/stores/stream-phase-store.ts:3)
- The doc comment for the incomplete-turn checks sits above the image-generation constant, not above isIncompleteTurn, so it describes the wrong function. (apps/web/features/chat/lib/turn-error-notice.ts:31-39)
- VS Code has no input-request UI in the webview code that was opened, though it is marked missing in the brief only for the input-answer item. The status line for input wait is consistent with the code. (apps/extension-vscode/src/integrations/localRuntimeClient.ts:385; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3503)

## Not established

- No app was run and nothing was tested; this is a reading of code only, and the statuses in the brief were not checked in a running app. The request asked for localhost testing and one surface at a time, but this task was read-only and included no test step.
- Desktop: the brief marks every item done, but no desktop-specific code was opened. It is not known whether desktop uses the web code or its own.
- API: the server streaming endpoint (apps/web/app/api/llm/v1/chat/completions/route.ts) was only partly read. Its streaming, error and queue behaviour were not traced end to end.
- S19.02 server queue: the web and Chrome queue is local to the client. Whether the server holds a queued Cloud run ('queued' state) and shows it as waiting was seen only in type lists and a Chrome check (apps/extension/src/side_panel.ts:1688), not traced.
- S19.04 query display: whether the web search row shows the query text was not confirmed; the label code shows Searching the web or a source count.
- S19.06 connector name: the brief says the service is named; the code that puts the name into the label was not found.
- S19.12 artifact building: the web creating row (apps/web/features/chat/components/artifacts/ArtifactCreatingRow.tsx:55-82) was read; its use for files in other apps was not checked.
- S19.14 saving results: no web or mobile save notice was found; the Chrome 'Saved on this device' label (apps/extension/src/side_panel.ts:598) was seen but its use was not traced.
- S19.17 and S19.18 on CLI and VS Code: the stop and cancel paths in the CLI (apps/cli/src/lib.rs:3445, 3550) and VS Code were seen only by string search, not traced.
- S19.29 background work on mobile and VS Code: marked unverified in the brief; not checked in code.
- Plan gates for queueing, mid-turn limits and when a Cloud run is allowed to continue after the window closes: the server-side plan checks were not traced.
- Whether the rate-limit wait (retry after) is sent by the server on every provider; only the client parsing was read.
- Approval controls on CLI (approval broker at apps/cli/src/tui/approval_broker.rs:200) and the mobile approval controls were not opened.
