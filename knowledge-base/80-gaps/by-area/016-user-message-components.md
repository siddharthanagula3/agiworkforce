---
id: "GAPS-AREA-016"
type: "gap-list"
title: "Gaps: User-message components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 16. User-message components

70 open gaps that touch this area. Area page: [20-features/016-user-message-components](../../20-features/016-user-message-components/README.md).

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

## GAP-AREA016-LW03

**S16.06 'edited' is only the version pager; a user message edited with the variants switch off shows no mark at all.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-016
- Detail: Area 16. User-message components
- Evidence: apps/web/features/chat/components/messages/VariantPager.tsx:19-23; message-variants-gate.ts:44

## GAP-AREA016-LW04

**The web failed-send state is a banner above the chat, not a marker on the failed message.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-016
- Detail: Area 16. User-message components
- Evidence: apps/web/features/chat/pages/WebChatPage.tsx:7560-7576

## GAP-CAP-editing-regeneration-and-branching-01

**Edit a sent message and resubmit: No edit in CLI, VS Code or Chrome side panel. Web chat title still shows the old text after the first message is edited (defect seen).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F016-05](../../20-features/016-user-message-components/F016-05-edit-in-place-and-version-paging.md)
- Requirement items: S16.08
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-02

**Edit a sent message that has attachments: Not seen working by a person. Local-only attachment refusal on an edit not checked.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F016-02](../../20-features/016-user-message-components/F016-02-message-text-attachments-and-context-chips.md), [F016-05](../../20-features/016-user-message-components/F016-05-edit-in-place-and-version-paging.md)
- Requirement items: S16.03, S16.08
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-03

**Versions of an edited message, with a pager: Ledger lists an unfinished ui item for web and desktop. A build flag can switch versions off. No pager outside Web, Desktop, Mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F016-03](../../20-features/016-user-message-components/F016-03-timestamp-and-edited-marker.md), [F016-05](../../20-features/016-user-message-components/F016-05-edit-in-place-and-version-paging.md), [F090-02](../../20-features/090-conversation-and-synchronization-components/F090-02-versions-branches-and-forks.md), [F103-03](../../20-features/103-data-and-persistence-categories/F103-03-chats-branches-and-memory.md)
- Requirement items: S103.07, S16.06, S16.11, S90.03
- Detail: Claude partly, ChatGPT unknown; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-07

**Retry a failed send or failed answer in place: Defects seen on web: Retry re-ran turn 1 instead of the failed turn; limit denial shows a raw 'Error:' line with no upgrade path; reload mid-answer shows a misleading banner.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F016-06](../../20-features/016-user-message-components/F016-06-resend-retry.md), [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md), [F017-09](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md), [F091-05](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)
- Requirement items: S16.15, S16.16, S17.20, S17.40, S91.26
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-09

**Branch a conversation into a new chat from a message: Mobile code ships Branch Conversation from Here although decision D-2026-09-28-15 keeps branching off the phone. Chrome has none. A web console 404 on the branches request was seen on the first turn.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F016-07](../../20-features/016-user-message-components/F016-07-branch-from-here.md), [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md), [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Requirement items: S16.10, S17.27, S62.17, S72.13
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-14

**Send, queue or steer while a reply is running: Ledger and comparison disagree on Chrome queue (ledger missing, comparison Better with code). CLI queue is partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md), [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Requirement items: S13.38, S13.39, S13.40, S16.17, S60.20
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F016-01-01

**No author identity for groups of people**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-01](../../20-features/016-user-message-components/F016-01-who-sent-it-identity.md)
- Detail: Affects: All six apps. Work needed: Define a participant model, then show a name or avatar on each user turn.
- Evidence: S16.21 missing everywhere in knowledge-base/data/area-briefs/016-user-message-components.md

## GAP-F016-01-02

**Heading levels h5/h6 and different assistant wording across apps**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-01](../../20-features/016-user-message-components/F016-01-who-sent-it-identity.md)
- Detail: Affects: Web, Chrome, shared bubble. Work needed: Pick one heading level and one assistant label and apply it everywhere.
- Evidence: MessageBubble.tsx:2589-2593; apps/extension/_locales/en/messages.json spAuthorAssistant

## GAP-F016-01-03

**No spoken author label in the CLI**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-01](../../20-features/016-user-message-components/F016-01-who-sent-it-identity.md)
- Detail: Affects: CLI users with screen readers. Work needed: Add a plain-word label or confirm terminal readers announce the glyph.
- Evidence: apps/cli/src/tui/tui_app.rs:2881-2896 uses glyph prefixes only

## GAP-F016-01-04

**Brief says 'built' for all six apps but the brief's line references for CLI (tui_app.rs:1500) do not match the author code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-01](../../20-features/016-user-message-components/F016-01-who-sent-it-identity.md)
- Detail: Affects: Documentation accuracy. Work needed: Update the brief's code references.
- Evidence: apps/cli/src/tui/tui_app.rs:1490-1510 is footer text, author prefixes are at 2881

## GAP-F016-02-01

**No chips for quoted text, editor selection, page or @mentions on web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-02](../../20-features/016-user-message-components/F016-02-message-text-attachments-and-context-chips.md)
- Detail: Affects: Web, Electron desktop. Work needed: Extend metadata and chips, or reduce the brief's Should.
- Evidence: apps/web/features/chat/components/messages/MessageContextChips.tsx props are mcpContext and skillName only

## GAP-F016-02-02

**Mobile has no connector prompt/resource chips**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-02](../../20-features/016-user-message-components/F016-02-message-text-attachments-and-context-chips.md)
- Detail: Affects: Mobile. Work needed: Pass connector context into the mobile bubble and render chips.
- Evidence: No mcpContext reference in apps/mobile/src/features/chat/components/MessageBubble.tsx

## GAP-F016-02-03

**Tauri shared bubble shows no thumbnails, lightbox or context chips**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-02](../../20-features/016-user-message-components/F016-02-message-text-attachments-and-context-chips.md)
- Detail: Affects: Internal Tauri desktop. Work needed: Port the web thumbnail and chip behaviour or retire the shell.
- Evidence: packages/ui/unified-chat/src/components/MessageBubble.tsx:493-585

## GAP-F016-02-04

**Brief marks CLI as done for context chips but CLI shows one muted 'with ...' line**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-02](../../20-features/016-user-message-components/F016-02-message-text-attachments-and-context-chips.md)
- Detail: Affects: CLI. Work needed: Decide whether a text line meets the 'chips' requirement.
- Evidence: apps/cli/src/tui/tui_app.rs:8148-8153

## GAP-F016-03-01

**No timestamp on mobile, CLI, VS Code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-03](../../20-features/016-user-message-components/F016-03-timestamp-and-edited-marker.md)
- Detail: Affects: Those apps. Work needed: Add a time on demand (long-press menu, hover or details row).
- Evidence: Brief S16.05 lists them missing; no time rendering found in apps/mobile/src/features/chat/components/MessageBubble.tsx

## GAP-F016-03-02

**No explicit 'edited' mark apart from the pager**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-03](../../20-features/016-user-message-components/F016-03-timestamp-and-edited-marker.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Decide whether the pager satisfies S16.06 or add a word mark.
- Evidence: MessageBubble.tsx:992-1002

## GAP-F016-03-03

**Brief says the edited marker is missing on mobile but mobile has one**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-03](../../20-features/016-user-message-components/F016-03-timestamp-and-edited-marker.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief.
- Evidence: apps/mobile/src/features/chat/components/MessageBubble.tsx:563-567, 3198-3202

## GAP-F016-03-04

**Brief marks Chrome edited marker missing; Chrome has no edit so it is not applicable**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-03](../../20-features/016-user-message-components/F016-03-timestamp-and-edited-marker.md)
- Detail: Affects: Brief accuracy. Work needed: Mark as n/a.
- Evidence: No edit action in apps/extension/src/features/side-panel/bubbles.ts

## GAP-F016-03-NOTBUILT

**Timestamp and edited marker: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F016-03](../../20-features/016-user-message-components/F016-03-timestamp-and-edited-marker.md)
- Requirement items: S16.05, S16.06
- Detail: CLI: S16.05, S16.06; VS Code: S16.05, S16.06; Chrome: S16.06

## GAP-F016-04-01

**No Copy for sent messages in CLI and VS Code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-04](../../20-features/016-user-message-components/F016-04-copy.md)
- Detail: Affects: CLI, VS Code. Work needed: Add a copy action or a terminal copy command.
- Evidence: No copy action in apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4925-4932 (only resend and branch)

## GAP-F016-04-02

**Web copy has no failure handling**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-04](../../20-features/016-user-message-components/F016-04-copy.md)
- Detail: Affects: Web, Electron desktop. Work needed: Catch the rejection and show an error toast.
- Evidence: MessageBubble.tsx:2271-2286

## GAP-F016-04-03

**Brief wrongly says Chrome is missing Copy**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-04](../../20-features/016-user-message-components/F016-04-copy.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief.
- Evidence: bubbles.ts:624-626

## GAP-F016-04-04

**Brief says Copy is hidden while streaming; only the message's own stream state is checked**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-04](../../20-features/016-user-message-components/F016-04-copy.md)
- Detail: Affects: Spec wording. Work needed: Clarify the spec.
- Evidence: MessageBubble.tsx:3706

## GAP-F016-04-NOTBUILT

**Copy: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F016-04](../../20-features/016-user-message-components/F016-04-copy.md)
- Requirement items: S16.07
- Detail: CLI: S16.07; VS Code: S16.07

## GAP-F016-05-01

**No edit in CLI, VS Code or Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-05](../../20-features/016-user-message-components/F016-05-edit-in-place-and-version-paging.md)
- Detail: Affects: Those apps. Work needed: Add edit-and-resend per surface or mark not applicable.
- Evidence: Brief S16.08 missing; VS Code offers only Resend and Branch (webviewContent.ts:4925-4932)

## GAP-F016-05-02

**Pager UI marked unfinished by the brief**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-05](../../20-features/016-user-message-components/F016-05-edit-in-place-and-version-paging.md)
- Detail: Affects: Web, desktop. Work needed: Find what is unfinished and close it; current code and tests show a working pager.
- Evidence: S16.11 'Unfinished: ui'

## GAP-F016-05-03

**Tauri shared bubble edit lacks versions and attachments**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-05](../../20-features/016-user-message-components/F016-05-edit-in-place-and-version-paging.md)
- Detail: Affects: Internal Tauri desktop. Work needed: Align with web or retire.
- Evidence: packages/ui/unified-chat/src/components/MessageBubble.tsx:720-724

## GAP-F016-05-04

**Migration 0156 header says not applied**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-05](../../20-features/016-user-message-components/F016-05-edit-in-place-and-version-paging.md)
- Detail: Affects: All cloud users if the column is missing. Work needed: Confirm applied state and fix the header.
- Evidence: apps/web/db/neon/0156_message_thread_variants.sql:4

## GAP-F016-05-NOTBUILT

**Edit in place and version paging: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F016-05](../../20-features/016-user-message-components/F016-05-edit-in-place-and-version-paging.md)
- Requirement items: S16.08, S16.11
- Detail: CLI: S16.08, S16.11; VS Code: S16.08, S16.11; Chrome: S16.08, S16.11

## GAP-F016-06-01

**CLI has no resend or retry**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-06](../../20-features/016-user-message-components/F016-06-resend-retry.md)
- Detail: Affects: CLI. Work needed: Add a retry key or slash command, or correct the brief.
- Evidence: No retry or resend handler in apps/cli/src/tui/tui_app.rs; brief S16.16 lists CLI missing but S16.09 lists done

## GAP-F016-06-02

**Web failed state is not marked on the user bubble**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-06](../../20-features/016-user-message-components/F016-06-resend-retry.md)
- Detail: Affects: Web, desktop. Work needed: Decide whether S16.15 needs a per-message mark.
- Evidence: Failure is an inline notice or banner (turn-failure-notice.ts:20-33)

## GAP-F016-06-03

**Chrome and VS Code retry only the latest or last turn**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-06](../../20-features/016-user-message-components/F016-06-resend-retry.md)
- Detail: Affects: Chrome, VS Code. Work needed: Allow retry of earlier turns or document the limit.
- Evidence: side_panel.ts:5925-5929; webviewContent.ts:4274

## GAP-F016-06-04

**Tauri shared bubble has no resend on the user message**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-06](../../20-features/016-user-message-components/F016-06-resend-retry.md)
- Detail: Affects: Internal Tauri desktop. Work needed: Add to match web.
- Evidence: packages/ui/unified-chat/src/components/MessageBubble.tsx:608-648

## GAP-F016-06-05

**Brief cites CLI code that does not match**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-06](../../20-features/016-user-message-components/F016-06-resend-retry.md)
- Detail: Affects: Brief accuracy. Work needed: Correct the brief.
- Evidence: apps/cli/src/tui/tui_app.rs:2715-2730 is startup hint text

## GAP-F016-06-NOTBUILT

**Resend / Retry: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F016-06](../../20-features/016-user-message-components/F016-06-resend-retry.md)
- Requirement items: S16.09, S16.15, S16.16
- Detail: CLI: S16.09, S16.15, S16.16

## GAP-F016-07-01

**Brief says CLI is built for branch up to a chosen message, but the CLI /fork copies the whole session.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-07](../../20-features/016-user-message-components/F016-07-branch-from-here.md)
- Detail: Affects: CLI users. Work needed: Add a message position to /fork or correct the brief.
- Evidence: apps/cli/src/repl/registry.rs:1353-1425; per-message fork exists only in app-server (developer_host.rs:3076-3135)

## GAP-F016-07-02

**Tauri desktop shows branch only on replies, and only in Local mode; the brief lists desktop as built for user messages.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-07](../../20-features/016-user-message-components/F016-07-branch-from-here.md)
- Detail: Affects: Tauri desktop users. Work needed: Add branch to the user bubble actions, or record the difference.
- Evidence: packages/ui/unified-chat/src/components/MessageBubble.tsx:726-780; useTauriMessageActions.ts:207-218

## GAP-F016-07-03

**Mobile has no branch action found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-07](../../20-features/016-user-message-components/F016-07-branch-from-here.md)
- Detail: Affects: Mobile users. Work needed: Decide whether mobile needs it; add a status row.
- Evidence: No match under apps/mobile in the searched files; brief has no status

## GAP-F016-07-04

**Chrome extension has no branch action.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-07](../../20-features/016-user-message-components/F016-07-branch-from-here.md)
- Detail: Affects: Chrome users. Work needed: Build it against the conversation branches API, or record as out of scope.
- Evidence: brief S16.10 missing

## GAP-F016-07-05

**VS Code Branch on a user message excludes that message while web includes it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-07](../../20-features/016-user-message-components/F016-07-branch-from-here.md)
- Detail: Affects: VS Code users. Work needed: Decide the intended meaning and align wording.
- Evidence: ChatStateManager.ts:6088-6118 versus conversation-branch-service.ts:386-390

## GAP-F016-07-06

**No test found for the Rust CLI /fork per-message path or for web branching of local-model conversations.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-07](../../20-features/016-user-message-components/F016-07-branch-from-here.md)
- Detail: Affects: Testers. Work needed: Add tests.
- Evidence: searched test files listed above

## GAP-F016-07-NOTBUILT

**Branch from here: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F016-07](../../20-features/016-user-message-components/F016-07-branch-from-here.md)
- Requirement items: S16.10
- Detail: Chrome: S16.10

## GAP-F016-08-01

**No automated test covers the fold and toggle.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-08](../../20-features/016-user-message-components/F016-08-long-message-collapse.md)
- Detail: Affects: Web and hosted desktop. Work needed: Add a component test with a mocked scrollHeight.
- Evidence: search of apps and packages found USER_MESSAGE_COLLAPSE_HEIGHT_PX and userContentOverflows only in MessageBubble.tsx

## GAP-F016-08-02

**No re-measure on resize.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-08](../../20-features/016-user-message-components/F016-08-long-message-collapse.md)
- Detail: Affects: Web and hosted desktop on narrow or resized windows. Work needed: Use a ResizeObserver.
- Evidence: MessageBubble.tsx:923-928

## GAP-F016-08-03

**Tauri desktop chat has no collapse although the brief says desktop built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-08](../../20-features/016-user-message-components/F016-08-long-message-collapse.md)
- Detail: Affects: Internal Tauri desktop. Work needed: Add the fold to the shared bubble or record the difference.
- Evidence: packages/ui/unified-chat/src/components/MessageBubble.tsx:595-607

## GAP-F016-08-04

**Mobile, CLI, VS Code and Chrome have no fold.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-08](../../20-features/016-user-message-components/F016-08-long-message-collapse.md)
- Detail: Affects: Those apps. Work needed: Decide per app; terminals may not need it.
- Evidence: brief S16.12/S16.13 missing

## GAP-F016-08-NOTBUILT

**Long message collapse: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F016-08](../../20-features/016-user-message-components/F016-08-long-message-collapse.md)
- Requirement items: S16.12, S16.13
- Detail: Mobile: S16.12, S16.13; CLI: S16.12, S16.13; VS Code: S16.12, S16.13; Chrome: S16.12, S16.13

## GAP-F016-09-01

**Brief says CLI lacks queue and draft, but the CLI has queued_prompts and a parked draft.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md)
- Detail: Affects: Brief accuracy, CLI testers. Work needed: Correct the brief and decide if the CLI needs a per-message state.
- Evidence: apps/cli/src/tui/tui_app.rs:611,1133-1157,2064-2075

## GAP-F016-09-02

**Brief says Chrome lacks queue and draft, but the side panel has both.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md)
- Detail: Affects: Brief accuracy, Chrome testers. Work needed: Correct the brief.
- Evidence: apps/extension/src/side_panel.ts:10103-10170,15312-15364

## GAP-F016-09-03

**Brief says VS Code lacks a draft, but the webview keeps per-thread drafts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md)
- Detail: Affects: Brief accuracy. Work needed: Correct the brief.
- Evidence: webviewContent.ts:5957-5967

## GAP-F016-09-04

**Web queue is in memory only; reload loses queued messages.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md)
- Detail: Affects: Web and hosted desktop users. Work needed: Persist or warn.
- Evidence: ChatComposerNew.tsx:910-914

## GAP-F016-09-05

**Only VS Code shows a per-message sending or failed caption in the transcript.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md)
- Detail: Affects: Web, mobile, Chrome, CLI users. Work needed: Decide whether to show delivery state elsewhere.
- Evidence: webviewContent.ts:624-690

## GAP-F016-09-06

**Tauri desktop draft is one global value, not per conversation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md)
- Detail: Affects: Tauri desktop users. Work needed: Confirm and fix if per-conversation is required.
- Evidence: packages/ui/unified-chat/src/components/ChatInput.tsx:278-280

## GAP-F016-09-07

**Draft sync is off for on-device model chats, so those drafts do not follow the person across devices.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md)
- Detail: Affects: Web users with local models. Work needed: Intentional trust boundary; document it.
- Evidence: use-conversation-draft-sync.ts:75-84

## GAP-F016-09-NOTBUILT

**Sending state: queued, pending, draft: not built on VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code
- Features: [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md)
- Requirement items: S16.18
- Detail: VS Code: S16.18

## GAP-F016-10-01

**The spoken marker is not saved with the message, so it vanishes after resume and never reaches other apps.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-10](../../20-features/016-user-message-components/F016-10-voice-and-imported-attribution.md)
- Detail: Affects: CLI users; any app that syncs the session. Work needed: Save a voice flag in message metadata.
- Evidence: tui_app.rs:7566-7571

## GAP-F016-10-02

**No voice or imported marker in web, desktop, mobile, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-10](../../20-features/016-user-message-components/F016-10-voice-and-imported-attribution.md)
- Detail: Affects: All apps except CLI. Work needed: Design a shared marker; contract in SYS-voice-and-media.
- Evidence: brief S16.19, S16.20

## GAP-F016-10-03

**Imported origins other than the account and cloud Code sessions (another product, a shared link) are not implemented.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-10](../../20-features/016-user-message-components/F016-10-voice-and-imported-attribution.md)
- Detail: Affects: All apps. Work needed: Add origins when import features exist.
- Evidence: only two origin strings found (sessions.rs:771, lib.rs:2650)

## GAP-F016-10-04

**No test asserts the '(spoken)' prefix or the 'came from' line on screen.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-10](../../20-features/016-user-message-components/F016-10-voice-and-imported-attribution.md)
- Detail: Affects: Testers. Work needed: Add TUI rendering tests.
- Evidence: tests found cover dispatch, gate and metadata only

## GAP-F016-10-NOTBUILT

**Voice and imported attribution: not built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F016-10](../../20-features/016-user-message-components/F016-10-voice-and-imported-attribution.md)
- Requirement items: S16.19, S16.20
- Detail: Web: S16.19, S16.20; Desktop: S16.19, S16.20; Mobile: S16.19, S16.20; VS Code: S16.20; Chrome: S16.19, S16.20

## GAP-F016-11-01

**Group author identity is not built and the data model has a single owner per conversation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-11](../../20-features/016-user-message-components/F016-11-group-author-and-message-link-not-built.md)
- Detail: Affects: All six apps. Work needed: Decide scope, add participants and an author field, and render and announce it.
- Evidence: brief S16.21 missing on all; web_messages has no author column (0037_rls_user_isolation.sql:93); participants: [] (WebChatPage.tsx:863)

## GAP-F016-11-02

**No way to copy a link to one message.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-11](../../20-features/016-user-message-components/F016-11-group-author-and-message-link-not-built.md)
- Detail: Affects: All six apps. Work needed: Add an action that builds the highlightMessage address and respects access rules.
- Evidence: brief S16.22; no copy-link action found in MessageBubble.tsx

## GAP-F016-11-03

**The brief gives no status for web and desktop S16.22, though web has an internal highlight link.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-11](../../20-features/016-user-message-components/F016-11-group-author-and-message-link-not-built.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief.
- Evidence: WebChatPage.tsx:5088-5120

## GAP-F016-11-04

**Mobile reads a highlight parameter but no creation path was checked.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F016-11](../../20-features/016-user-message-components/F016-11-group-author-and-message-link-not-built.md)
- Detail: Affects: Mobile. Work needed: Inspect the mobile route and link opening.
- Evidence: apps/mobile/app/(app)/chat/[id].tsx:280-281

## GAP-F016-11-NOTBUILT

**Group author and message link (not built): not built on Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F016-11](../../20-features/016-user-message-components/F016-11-group-author-and-message-link-not-built.md)
- Requirement items: S16.21, S16.22
- Detail: Desktop: S16.21; Mobile: S16.21, S16.22; CLI: S16.21, S16.22; VS Code: S16.21, S16.22; Chrome: S16.21, S16.22
