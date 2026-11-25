---
id: "GAPS-AREA-019"
type: "gap-list"
title: "Gaps: Streaming and response-presentation states"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 19. Streaming and response-presentation states

87 open gaps that touch this area. Area page: [20-features/019-streaming-and-response-presentation-states](../../20-features/019-streaming-and-response-presentation-states/README.md).

## CMP-C42

**Auto-continue a session that ended mid-turn**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F019-07](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Detail: Interrupted turns are not resumed automatically.
- Evidence: searched: auto_resume, AUTO_CONTINUE in apps/cli/src

## CMP-C47

**Resume from a pull request (--from-pr)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F019-08](../../20-features/019-streaming-and-response-presentation-states/F019-08-saving-and-restoring-results.md)
- Detail: No flag or picker filter by pull request.
- Evidence: searched: from-pr, from_pr in apps/cli/src/lib.rs

## CMP-CP11

**Status line shows session cost and context window usage**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F082-02](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Detail: Has no session duration and no user script that receives the data The status line toggles model, tokens, cost, branch, mode and context, but has no session duration and no user script that receives the data.
- Evidence: apps/cli/src/tui/widgets/statusline_setup.rs:7-12,28

## CMP-CP119

**Context window breakdown by category**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Detail: Not tools, MCP or subagent tokens /context lists system prompt, instruction files, rules, attached files and messages, but not tools, MCP or subagent tokens.
- Evidence: apps/cli/src/agent/history.rs:17-57

## CMP-CP180

**Steer a running turn by sending a message**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md), [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md), [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: The app server can steer, the terminal screen cannot Messages typed during a turn are queued for after it; /btw asks aside. The app server can steer, the terminal screen cannot.
- Evidence: apps/cli/src/tui/tui_app.rs:2024-2034; apps/cli/src/app_server/developer_host.rs:133

## CMP-CP21

**Queue a message while the agent works**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md), [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md), [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: There is no send-now key Typing during a turn queues the message and a stopped turn returns queued text to the composer; there is no send-now key.
- Evidence: apps/cli/src/tui/tui_app.rs:8423; apps/cli/src/tui/tui_app.rs:8686

## CMP-CP27

**Steer or queue a message while a turn is running**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md), [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md), [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: It cannot steer the running turn and Up does not pull queued text back (a stop returns it to the composer) Typing while a turn runs queues the message for later; it cannot steer the running turn and Up does not pull queued text back (a stop returns it to the composer).
- Evidence: apps/cli/src/tui/tui_app.rs:8423,8686

## CMP-DP18

**Steer a running answer and queue follow-up messages**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Detail: They cannot be reordered Queued follow-ups can be edited, sent now or steered in; they cannot be reordered.
- Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4452,4505

## CMP-DP65

**Context usage card with per-category breakdown and /context**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Detail: There is no per-category breakdown and no /context command The usage menu shows one context-window bar and plan limits; there is no per-category breakdown and no /context command.
- Evidence: apps/web/features/code/components/CodeComposer.tsx:1532-1620

## CMP-DP72

**Interrupt, or steer a running task by typing a correction**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: The message box cannot send while a task runs, so a correction needs Stop first Stop ends the running task; the message box cannot send while a task runs, so a correction needs Stop first.
- Evidence: apps/web/features/code/components/CodeComposer.tsx:1752,1914-1925

## CMP-V17

**Plan mode restored when a session is resumed**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F019-08](../../20-features/019-streaming-and-response-presentation-states/F019-08-saving-and-restoring-results.md)
- Detail: The mode is a workspace setting, not saved per session, so a resumed session takes the current setting.
- Evidence: apps/extension-vscode/src/platform/config.ts:193-198

## CMP-VP81

**Setting for when the context indicator appears (contextUsageThreshold)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Detail: No threshold setting among the 25 settings The readout is always shown once usage is known; no threshold setting among the 25 settings.
- Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4087-4101; apps/extension-vscode/package.json contributes.configuration

## CMP-WP25

**Chat resumes by itself when a usage limit resets**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md), [F082-12](../../20-features/082-usage-dashboard-and-limit-ui/F082-12-resume-after-reset-preference.md)
- Detail: A stopped chat does not continue on its own We can remind you at reset, but a stopped chat does not continue on its own.
- Evidence: apps/web/features/chat/pages/WebChatPage.tsx:1816; apps/web/app/api/usage/reset-reminder/route.ts

## CMP-WP27

**Long chats are summarized automatically; oversized message error**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md), [F093-03](../../20-features/093-search-retrieval-and-context-components/F093-03-long-chat-summaries.md)
- Detail: Is gated by a server switch, not a user-facing behavior Server compaction of long chats exists but is gated by a server switch, not a user-facing behavior.
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:38

## CMP-WP61

**Regenerate an answer with web search**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Detail: Search can only be forced on a new message with /search The regenerate menu offers the same model or another model, with no search option; search can only be forced on a new message with /search.
- Evidence: apps/web/features/chat/components/messages/MessageBubble.tsx:3878-3910; searched: retry with search, forceSearch in apps/web/features/chat, packages/ui/unified-chat/src

## GAP-AREA019-LW02

**The web waiting label always says Preparing, whatever is happening. It does not say that context, attachments or memory are being read (S19.03 asks for that). Only the CLI passes a Preparing context label, and only when its preparing flag is set.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-019
- Detail: Area 19. Streaming and response-presentation states
- Evidence: apps/web/features/chat/components/messages/TypingIndicator.tsx:17; apps/web/features/chat/components/messages/ChatMessageList.tsx:1350, 2000-2008; apps/cli/src/tui/tui_app.rs:8545

## GAP-AREA019-LW03

**Mobile's stop action settles streaming messages locally as cancelled and does not wait for a Cloud stop to be confirmed, unlike web. No stop-in-progress label was found in the mobile app code (searched for stopping and cancel).**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-019
- Detail: Area 19. Streaming and response-presentation states
- Evidence: apps/mobile/stores/chat/chatExecutionStore.ts:5423-5445

## GAP-AREA019-LW05

**The doc comment for the incomplete-turn checks sits above the image-generation constant, not above isIncompleteTurn, so it describes the wrong function.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-019
- Detail: Area 19. Streaming and response-presentation states
- Evidence: apps/web/features/chat/lib/turn-error-notice.ts:31-39

## GAP-CAP-context-management-09

**Context usage meter and breakdown: Breakdown missing for tools, MCP and subagents; no /context on Desktop; no meter in web chat.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Requirement items: S19.03
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-11

**Stop generation: Web defects seen: false 'Free limit reached' banner after Stop; empty 'Writing response' row stays; an 'Agent run failed' notification after Stop; a stopped answer returns longer after reload; cloud task Stop adds 'model failed' text.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F013-02](../../20-features/013-composer-text-interaction/F013-02-send-and-stop-buttons.md), [F019-05](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md), [F091-04](../../20-features/091-model-and-inference-components/F091-04-streaming-cancellation-and-time-limits.md), [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)
- Requirement items: S13.07, S19.17, S19.18, S91.24, S92.20
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-editing-regeneration-and-branching-12

**Stopped state keeps partial text and offers Try again: Two retry controls appear together on a stopped web answer; stopped artifact shows raw HTML in chat.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F017-09](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md), [F019-05](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md)
- Requirement items: S17.37, S17.39, S19.18
- Detail: Claude unknown, ChatGPT partly; AGI built

## GAP-CAP-recovery-and-errors-01

**Retry a failed answer in place: Seen on web: Retry after a reload regenerated the first message of the chat and hid later turns; a stopped answer shows two retry controls.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Requirement items: S19.25, S19.26, S19.27
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-recovery-and-errors-04

**Stop an answer and keep what arrived: Web shows a false 'reached the Free limit' banner and a stale 'Writing response' row after Stop; a stopped answer can come back longer or cut mid-sentence after reload; Stop later raises an 'Agent run failed' bell.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-05](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md)
- Requirement items: S19.17, S19.18
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-recovery-and-errors-06

**Reconnect and resume a dropped stream: CLI and VS Code have no reconnecting state.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-07](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Requirement items: S19.19, S19.20
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-CAP-recovery-and-errors-07

**Reload during an answer: Reload mid-answer lost the answer, left no progress indicator, and later showed a misleading 'no response' banner.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-07](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md), [F019-08](../../20-features/019-streaming-and-response-presentation-states/F019-08-saving-and-restoring-results.md)
- Requirement items: S19.20, S19.28
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-CAP-recovery-and-errors-10

**Plain error messages with a next step: Raw failed response with 'Error:' on limit denial; billing-period error on an Active account; no Upgrade path on repeated denial; mic-denied voice gives a generic error.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-03](../../20-features/019-streaming-and-response-presentation-states/F019-03-pauses-that-need-you-approval-input-and-device.md), [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Requirement items: S19.21, S19.22, S19.23, S19.24, S19.25, S19.26
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-recovery-and-errors-11

**Usage limit reached: what happens next: Web Usage page and Billing disagree; denial shows no Upgrade link; false limit banner after Stop.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Requirement items: S19.21, S19.22
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-recovery-and-errors-15

**Provider unavailable: try another model: A scheduled task stopped without trying another model; a stop produced a misleading 'model failed' line while on Auto.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Requirement items: S19.25
- Detail: Claude partly, ChatGPT partly; AGI built

## GAP-CAP-recovery-and-errors-16

**Failed upload or attachment keeps the draft: Project file upload fails with a generic server error shown twice, with no retry.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Requirement items: S19.26
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-CAP-recovery-and-errors-17

**Queue, steer or interrupt a running turn: No reorder; CLI cannot steer; CLI shows no waiting state.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Requirement items: S19.02
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-recovery-and-errors-21

**Resume a saved coding session: No --from-pr; plan mode not saved per session in VS Code.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-08](../../20-features/019-streaming-and-response-presentation-states/F019-08-saving-and-restoring-results.md)
- Requirement items: S19.28
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-recovery-and-errors-25

**Work continues after the app closes: Mobile and VS Code unverified; after reload a progress panel showed duplicates and stale Start buttons.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-03](../../20-features/019-streaming-and-response-presentation-states/F019-03-pauses-that-need-you-approval-input-and-device.md), [F019-07](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Requirement items: S19.24, S19.29
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-streaming-and-response-states-01

**Request accepted and first-words wait state: Web testers saw nothing but 'Generating response...' for 4 to 22 seconds on some first requests (see First-words speed).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F019-04](../../20-features/019-streaming-and-response-presentation-states/F019-04-streaming-the-answer.md)
- Requirement items: S19.01, S19.03, S19.09
- Detail: Claude unknown, ChatGPT yes; AGI built

## GAP-CAP-streaming-and-response-states-03

**Streaming text display: A tester saw raw maths source flash mid-stream before it rendered (web). Smooth fade-in is missing (see next row).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-04](../../20-features/019-streaming-and-response-presentation-states/F019-04-streaming-the-answer.md)
- Requirement items: S19.10, S19.11
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-streaming-and-response-states-09

**Stop a running answer: Stop should not create a failure notice. Claude chat stop control is not in the catalogue.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-05](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md)
- Requirement items: S19.17
- Detail: Claude partly, ChatGPT yes; AGI built

## GAP-CAP-streaming-and-response-states-11

**Stopped answer keeps what arrived: After stop, a follow-up artifact edit showed raw source instead of an artifact card (web).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-05](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md), [F019-08](../../20-features/019-streaming-and-response-presentation-states/F019-08-saving-and-restoring-results.md)
- Requirement items: S19.18, S19.28
- Detail: Claude partly, ChatGPT unknown; AGI built

## GAP-CAP-streaming-and-response-states-14

**Steer or queue a message while a run is active: Desktop, CLI and mobile research steering partial or missing (M43); queue state missing in CLI (S19.02).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Requirement items: S19.02
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-streaming-and-response-states-16

**Tool and search progress during an answer: Artifact-building state missing on mobile and Chrome; media state missing in VS Code and Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-02](../../20-features/019-streaming-and-response-presentation-states/F019-02-live-progress-search-code-connected-services-media.md)
- Requirement items: S19.04, S19.05, S19.06, S19.12, S19.13
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-streaming-and-response-states-17

**Waiting for approval or input: VS Code lacks waiting-for-input.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-03](../../20-features/019-streaming-and-response-presentation-states/F019-03-pauses-that-need-you-approval-input-and-device.md)
- Requirement items: S19.07, S19.08
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-streaming-and-response-states-18

**Plain error during an answer: Testers saw a wrong message: 'No response was received' after a reload mid-answer, and a silent empty reply at a credit limit on image sends.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-03](../../20-features/019-streaming-and-response-presentation-states/F019-03-pauses-that-need-you-approval-input-and-device.md), [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Requirement items: S19.21, S19.22, S19.23, S19.24, S19.25, S19.26, S19.27
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-streaming-and-response-states-19

**Usage limit reached during an answer: Silent failure on image send at the limit; a Free limit banner showed while chat still worked.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Requirement items: S19.21, S19.22
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-streaming-and-response-states-20

**Length limit and long-chat summarising: Compaction and error text partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Requirement items: S19.26
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-streaming-and-response-states-23

**Reconnect and resume an interrupted answer: Reload mid-answer lost the live stream on web; CLI auto-continue missing (C42).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-07](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Requirement items: S19.19, S19.20, S19.29
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-streaming-and-response-states-25

**Partial completion and cancelled-run states: S19.14 'saving results' is missing in CLI and VS Code.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F019-05](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md), [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Requirement items: S19.15, S19.16, S19.27
- Detail: Claude unknown, ChatGPT yes; AGI built

## GAP-F019-01-01

**Brief says CLI has no queued status but the code shows a count in the hint.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Detail: Affects: CLI; documentation accuracy. Work needed: Correct the brief row to done for CLI and re-run the area audit.
- Evidence: tui_app.rs:2064-2075 versus S19.02

## GAP-F019-01-02

**Queue is lost on restart and the person is not told.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Detail: Affects: Web, mobile. Work needed: Decide whether to persist or to warn; not decided in any document read.
- Evidence: ChatComposerNew.tsx:910; ChatInput.tsx:490

## GAP-F019-01-03

**Preparing label does not say what is being prepared.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Detail: Affects: Web, mobile, VS Code, Chrome. Work needed: Needs the server or client to report context-read steps as events.
- Evidence: TypingIndicator.tsx:17; MessageBubble.tsx:2506; side_panel.ts:6339

## GAP-F019-01-04

**VS Code has no visible waiting word.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Detail: Affects: VS Code. Work needed: Add a visible label next to the mark.
- Evidence: webviewContent.ts:5019-5033

## GAP-F019-01-05

**Brief: mobile queued state is the offline queue marker only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Detail: Affects: Mobile. Work needed: Update the brief; both exist.
- Evidence: MessageBubble.tsx:2228; but ChatInput.tsx:947 shows a second, real follow-up queue

## GAP-F019-01-NOTBUILT

**Turn accepted, queued and preparing: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md)
- Requirement items: S19.02
- Detail: CLI: S19.02

## GAP-F019-02-01

**Brief says mobile cannot show artifact building; code has StreamingArtifactCard.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-02](../../20-features/019-streaming-and-response-presentation-states/F019-02-live-progress-search-code-connected-services-media.md)
- Detail: Affects: Mobile; brief accuracy. Work needed: Correct brief; verify visually.
- Evidence: MessageBubble.tsx:2816; StreamingArtifactCard.tsx:65

## GAP-F019-02-02

**Image or video progress is not shown on VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-02](../../20-features/019-streaming-and-response-presentation-states/F019-02-live-progress-search-code-connected-services-media.md)
- Detail: Affects: VS Code. Work needed: Decide whether VS Code offers media generation; if so add progress.
- Evidence: No match in webviewContent.ts for generating media

## GAP-F019-02-03

**Chrome media and artifact building progress unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-02](../../20-features/019-streaming-and-response-presentation-states/F019-02-live-progress-search-code-connected-services-media.md)
- Detail: Affects: Chrome. Work needed: Read startVideoTurn and artifactPanel.ts, then verify in the browser.
- Evidence: startVideoTurn exists in side_panel.ts; display not opened

## GAP-F019-02-04

**CLI has no search-specific label.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-02](../../20-features/019-streaming-and-response-presentation-states/F019-02-live-progress-search-code-connected-services-media.md)
- Detail: Affects: CLI. Work needed: Add a labelled summary for search tools.
- Evidence: tool_cell_lines uses tool name and summary only (tui_app.rs:333-350)

## GAP-F019-02-05

**Web failed web search shows the raw step summary, not the 'Search failed' wording the brief expects.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-02](../../20-features/019-streaming-and-response-presentation-states/F019-02-live-progress-search-code-connected-services-media.md)
- Detail: Affects: Web, desktop. Work needed: Add a failed search label.
- Evidence: AgentActivityTimeline.tsx:158-166 handles only cancelled specially

## GAP-F019-02-NOTBUILT

**Live progress: search, code, connected services, media and files: not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F019-02](../../20-features/019-streaming-and-response-presentation-states/F019-02-live-progress-search-code-connected-services-media.md)
- Requirement items: S19.12, S19.13
- Detail: Mobile: S19.12; VS Code: S19.13; Chrome: S19.12, S19.13

## GAP-F019-03-01

**Web summary line omits awaiting-device.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-03](../../20-features/019-streaming-and-response-presentation-states/F019-03-pauses-that-need-you-approval-input-and-device.md)
- Detail: Affects: Web, Desktop. Work needed: Add a branch like the mobile summary (mobile AgentActivityTimeline.tsx:251-254).
- Evidence: AgentActivityTimeline.tsx:330-366

## GAP-F019-03-02

**Web button says Allow not Approve.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-03](../../20-features/019-streaming-and-response-presentation-states/F019-03-pauses-that-need-you-approval-input-and-device.md)
- Detail: Affects: Documentation, testers. Work needed: Update any test script that expects Approve on web.
- Evidence: tool-approval-policy.ts:23

## GAP-F019-03-03

**VS Code has no device-wait display.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-03](../../20-features/019-streaming-and-response-presentation-states/F019-03-pauses-that-need-you-approval-input-and-device.md)
- Detail: Affects: VS Code. Work needed: Confirm whether VS Code can be sent device steps; if yes, add the label.
- Evidence: Search of apps/extension-vscode/src found nothing

## GAP-F019-03-04

**Brief says VS Code input answering is missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-03](../../20-features/019-streaming-and-response-presentation-states/F019-03-pauses-that-need-you-approval-input-and-device.md)
- Detail: Affects: Brief accuracy. Work needed: Correct the brief.
- Evidence: renderQuestionCard at webviewContent.ts:7262

## GAP-F019-03-05

**CLI device wait unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-03](../../20-features/019-streaming-and-response-presentation-states/F019-03-pauses-that-need-you-approval-input-and-device.md)
- Detail: Affects: CLI. Work needed: Decide whether it applies.
- Evidence: Not found in tui_app.rs

## GAP-F019-03-NOTBUILT

**Pauses that need you: approval, input and device: not built on VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code
- Features: [F019-03](../../20-features/019-streaming-and-response-presentation-states/F019-03-pauses-that-need-you-approval-input-and-device.md)
- Requirement items: S19.08
- Detail: VS Code: S19.08

## GAP-F019-04-01

**VS Code and Chrome partial markdown behaviour not verified here.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-04](../../20-features/019-streaming-and-response-presentation-states/F019-04-streaming-the-answer.md)
- Detail: Affects: VS Code, Chrome. Work needed: Read and test.
- Evidence: Render functions not opened

## GAP-F019-04-02

**Brief wording 'held until it closes' does not match code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-04](../../20-features/019-streaming-and-response-presentation-states/F019-04-streaming-the-answer.md)
- Detail: Affects: Documentation. Work needed: Fix wording.
- Evidence: MessageBubble.tsx:446-449

## GAP-F019-05-01

**Mobile stop is optimistic.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-05](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md)
- Detail: Affects: Mobile. Work needed: Confirm or show a stopping state.
- Evidence: chatExecutionStore.ts:5535-5543

## GAP-F019-05-02

**VS Code and CLI lack a run-level Finished with errors label.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-05](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md)
- Detail: Affects: VS Code, CLI. Work needed: Add a label or correct the brief.
- Evidence: webviewContent.ts:9011; tui_app.rs:333-343

## GAP-F019-05-03

**Confirmation windows differ (30 s web, 15 s Chrome).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-05](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md)
- Detail: Affects: Web, Chrome. Work needed: Choose one value in shared config.
- Evidence: cancel-cloud-run.ts:4-5; managedRunControl.ts:36-37

## GAP-F019-05-04

**Billing effect of a stopped turn not documented in code opened.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-05](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md)
- Detail: Affects: All. Work needed: Find the usage accounting path.
- Evidence: None

## GAP-F019-06-01

**No sign-in-again control on web or mobile notices.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Add a control that starts sign-in.
- Evidence: turn-error-notice.ts:143; apiErrors.ts:94

## GAP-F019-06-02

**Web account limit sentence does not name the limit.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Detail: Affects: Web, Desktop. Work needed: Pass which limit (five-hour, weekly) into the sentence.
- Evidence: turn-error-notice.ts:144-145

## GAP-F019-06-03

**45-second grace only on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Detail: Affects: Mobile, Chrome, VS Code, CLI. Work needed: Check whether other apps need it.
- Evidence: turn-error-notice.ts:266

## GAP-F019-06-04

**CLI wait bound not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Detail: Affects: CLI. Work needed: Cap or confirm.
- Evidence: errors.rs hint uses retry_after directly (610-625)

## GAP-F019-06-05

**Chrome has no headline table.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-06](../../20-features/019-streaming-and-response-presentation-states/F019-06-failure-notices-with-a-next-step.md)
- Detail: Affects: Chrome. Work needed: Confirm that gateway sentences cover all codes.
- Evidence: side_panel.ts:9741-9830

## GAP-F019-07-01

**No Reconnecting state for chat turns in the CLI and VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-07](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Detail: Affects: CLI and VS Code users. Work needed: Add a reconnect phase to each turn renderer, driven by the same run-follow client.
- Evidence: Brief S19.19 (missing); no matching string found in apps/cli/src/tui/tui_app.rs or apps/extension-vscode/src besides Remote Control and MCP.

## GAP-F019-07-02

**Mobile background continuation has no recorded device verification.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-07](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Detail: Affects: Mobile users. Work needed: Run on iOS and Android devices with a long Cloud turn and record the result.
- Evidence: Brief S19.29 (unverified); code exists in apps/mobile/src/features/chat/inFlightTurnRecovery.ts

## GAP-F019-07-03

**VS Code background continuation unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-07](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Detail: Affects: VS Code users. Work needed: Establish whether the session host keeps running after the window closes and test it.
- Evidence: Brief S19.29

## GAP-F019-07-04

**Poll interval differs: 2.5 s on Web, 1 s default on Mobile, Desktop (Tauri) and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-07](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Detail: Affects: Server load; consistency with the brief. Work needed: Decide one shared interval in the shared client and apply it.
- Evidence: apps/web/lib/hooks/useChatStream.ts:1365 vs apps/mobile/services/streaming.ts:983

## GAP-F019-07-05

**CLI background runs are local and stop with the machine; they are not Cloud runs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-07](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Detail: Affects: CLI users expecting server-side continuation. Work needed: Decide whether the CLI should offer Cloud background runs; document the difference.
- Evidence: apps/cli/src/background.rs:246-300

## GAP-F019-07-06

**Retention of run journal rows is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-07](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Detail: Affects: Reopening very old conversations. Work needed: Find or define the retention rule and document it.
- Evidence: No retention job found in the files read

## GAP-F019-07-NOTBUILT

**Reconnect, resume and background work: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F019-07](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Requirement items: S19.19
- Detail: CLI: S19.19; VS Code: S19.19

## GAP-F019-07-PARTLY

**Reconnect, resume and background work: partly built on Mobile, VS Code**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Mobile, VS Code
- Features: [F019-07](../../20-features/019-streaming-and-response-presentation-states/F019-07-reconnect-resume-and-background-work.md)
- Requirement items: S19.29

## GAP-F019-08-01

**No app shows when a result was saved.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-08](../../20-features/019-streaming-and-response-presentation-states/F019-08-saving-and-restoring-results.md)
- Detail: Affects: All six apps. Work needed: Add a saved timestamp or relative time to the Chrome label and a saved indicator to the other apps.
- Evidence: Chrome label has no time (apps/extension/src/side_panel.ts:587-690); CLI message prints an id only (apps/cli/src/repl/registry.rs:152).

## GAP-F019-08-02

**No visible notice when a save fails on Web, Desktop, Mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-08](../../20-features/019-streaming-and-response-presentation-states/F019-08-saving-and-restoring-results.md)
- Detail: Affects: Web, Desktop, Mobile Cloud users. Work needed: Show a notice with retry; add a test.
- Evidence: notifyPersistenceFailure only calls console.error (apps/web/lib/hooks/useChatStream.ts:813-815).

## GAP-F019-08-03

**CLI and VS Code show no saved notice during normal turns.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-08](../../20-features/019-streaming-and-response-presentation-states/F019-08-saving-and-restoring-results.md)
- Detail: Affects: CLI and VS Code users. Work needed: Add a saved line to the turn footer or status.
- Evidence: Brief S19.14 (missing); only /save prints a message.

## GAP-F019-08-04

**Brief S19.14 code references for Chrome (side_panel.ts:356, 386) point to import lines; the real label code is at side_panel.ts:587-690.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-08](../../20-features/019-streaming-and-response-presentation-states/F019-08-saving-and-restoring-results.md)
- Detail: Affects: Documentation accuracy. Work needed: Correct the brief references.
- Evidence: apps/extension/src/side_panel.ts:356-386 are import statements.

## GAP-F019-08-05

**Brief says CLI saving is missing, but a /save command with a message exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F019-08](../../20-features/019-streaming-and-response-presentation-states/F019-08-saving-and-restoring-results.md)
- Detail: Affects: Brief accuracy. Work needed: Restate the CLI gap as 'no automatic saved notice'.
- Evidence: apps/cli/src/repl/registry.rs:110-152

## GAP-F019-08-NOTBUILT

**Saving and restoring results: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F019-08](../../20-features/019-streaming-and-response-presentation-states/F019-08-saving-and-restoring-results.md)
- Requirement items: S19.14
- Detail: CLI: S19.14; VS Code: S19.14
