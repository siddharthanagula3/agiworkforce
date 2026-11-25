---
id: "AREA-017"
type: "area"
title: "Assistant-message components"
features: ["F017-01", "F017-02", "F017-03", "F017-04", "F017-05", "F017-06", "F017-07", "F017-08", "F017-09"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 17. Assistant-message components

Every answer the assistant gives shows up as a message with its own set of tools around it. A person can see which model answered and what it cost, watch the answer arrive, see the tools and sources it used, and act on it: copy, read aloud, share, regenerate, continue, branch, rate, or report it. Failed, stopped and refused answers are shown as their own states with a next step, so the person is never left with an empty bubble.

**Who uses it.** Every signed-in person who chats, on every app that has the chat. Some parts are gated: follow-up suggestion generation is metered by plan tier on the server (generate-follow-ups.ts:153-165), Continue is blocked with an upgrade prompt when the trial is used up (WebChatPage.tsx:6433-6440), and some actions are shown only when the app supports them (read aloud needs isReadAloudSupported). I did not find any workspace-admin-only control in this area.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F017-01](F017-01-who-answered-and-live-status.md) | Who answered and live status | built | built | built | built | built | built |
| [F017-02](F017-02-work-and-sources-shown-under-the-answer.md) | Work and sources shown under the answer | built | built | built | partly | partly | built |
| [F017-03](F017-03-files-images-video-and-widgets-the-answer-made.md) | Files, images, video and widgets the answer made | partly | partly | partly | partly | no | partly |
| [F017-04](F017-04-follow-up-suggestions.md) | Follow-up suggestions | partly | partly | partly | no | n/a | no |
| [F017-05](F017-05-copy-read-aloud-share-export-and-save.md) | Copy, read aloud, share, export and save | partly | partly | partly | partly | partly | partly |
| [F017-06](F017-06-regenerate-retry-continue-branch-and-answer-versio.md) | Regenerate, retry, continue, branch and answer versions | built | built | built | partly | partly | partly |
| [F017-07](F017-07-rewrite-the-answer-shorter-longer-tone-and-revise.md) | Rewrite the answer (shorter, longer, tone) and revise a selected part | no | no | partly | no | no | no |
| [F017-08](F017-08-feedback-and-report.md) | Feedback and report | built | built | built | no | partly | no |
| [F017-09](F017-09-stopped-failed-and-refused-answers.md) | Stopped, failed and refused answers | built | built | built | built | built | partly |

Requirement items for this area: [10-requirements/capabilities/017-assistant-message-components.md](../../10-requirements/capabilities/017-assistant-message-components.md).

## How this area works in the code

1. **1. The answer is shown with its actions.** The chat list renders each message and passes the turn's state (streaming, stopped, refused, continuable, follow-up target) into the bubble. The bubble draws the answer text, the activity and sources, the files, and the action row. The action row holds Copy, the good and bad rating buttons, Show sources, Regenerate, and a more-actions menu with the time sent, read aloud, branch and report. (`apps/web/features/chat/components/messages/ChatMessageList.tsx:1353-1356 (continue is offered only when the turn is not stopped and can continue)`, `apps/web/features/chat/components/messages/ChatMessageList.tsx:1396-1417 (refusal notice and turn-failure flags)`, `apps/web/features/chat/components/messages/MessageBubble.tsx:3751 (copy button)`, `apps/web/features/chat/components/messages/MessageBubble.tsx:3777 (good response)`, `apps/web/features/chat/components/messages/MessageBubble.tsx:3806 (bad response)`, `apps/web/features/chat/components/messages/MessageBubble.tsx:3854 (Show sources)`, `apps/web/features/chat/components/messages/MessageBubble.tsx:3878 (Regenerate response)`, `apps/web/features/chat/components/messages/MessageBubble.tsx:3981-3990 (read aloud menu item)`)
2. **2. The person sends a message and the answer streams in.** The stream hook chooses the completion route for the selected model. Paid Cloud models go to the Cloud completion route. Models from the free offering go to the free-quota completions route. The hook writes the streamed text into the bubble as it arrives. A regenerate request sets a parent message id, so the new attempt is added as a sibling instead of replacing the old one. (`apps/web/features/chat/lib/free-quota-selection.ts:40-46 (chatCompletionEndpoint: picks the route by model)`, `apps/web/lib/hooks/useChatStream.ts:4572 (first completion request)`, `apps/web/lib/hooks/useChatStream.ts:5020 (second completion request)`, `apps/web/lib/hooks/useChatStream.ts:4250-4264 (regenerate parent: sibling or same turn)`, `apps/web/app/api/llm/v1/chat/completions/route.ts:1526 (Cloud completion POST handler)`)
3. **3. The working indicator shows until text arrives.** A typing indicator and a status label ('Generating response') are shown while the turn is running and before text arrives. The status is announced through the chat's live region. (`apps/web/features/chat/components/messages/TypingIndicator.tsx:9 (indicator component)`, `apps/web/features/chat/components/messages/ChatMessageList.tsx:1758 (status label 'Generating response')`)
4. **4. Follow-up suggestions are gated, fetched and cached.** The list decides whether to show follow-ups: the setting must be on, the answer must be finished and long enough, the request must be sendable, and either the default flag or a searched last turn must allow it. If a cached list is stored on the message, it is shown. Otherwise the hook calls the follow-ups route. The route returns the cache, or generates new questions on the server with a quota reservation and saves them into the message's metadata. (`apps/web/features/chat/components/messages/ChatMessageList.tsx:1104 (FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT = false)`, `apps/web/features/chat/components/messages/ChatMessageList.tsx:1431-1436 (lastTurnSearched)`, `apps/web/features/chat/components/messages/ChatMessageList.tsx:1465-1476 (showFollowUps gate)`, `apps/web/features/chat/hooks/use-generated-follow-ups.ts:40-41 (fetch to the follow-ups route)`, `apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.ts:19 (read cache)`, `apps/web/app/api/chat/conversations/[id]/messages/lib/generate-follow-ups.ts:153-180 (plan tier and quota reservation)`, `apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.ts:103-106 (save into metadata)`)
5. **5. Copy and share use plain text.** Copy takes the answer text with rich blocks turned into plain text, writes it to the clipboard, shows a check mark for two seconds, and shows a toast. Share uses the system share sheet when it exists and falls back to copying. (`apps/web/features/chat/components/messages/MessageBubble.tsx:2273-2287 (handleCopy)`, `apps/web/features/chat/components/messages/MessageBubble.tsx:2289-2300 (handleShare)`, `packages/ui/unified-chat/src/components/markdown/richBlocks.ts:251 (richBlocksAsPlainText)`)
6. **6. Read aloud calls the speech route.** The read-aloud hook asks the server for speech in chunks and plays it in the browser. Only one playback runs at a time, and a stop control ends it. (`apps/web/lib/hooks/useTTS.ts:10 (speech route path)`, `apps/web/lib/hooks/useTTS.ts:168 (useTTS hook)`, `apps/web/lib/hooks/useTTS.ts:318 (cancel of the speech queue)`)
7. **7. Regenerate, continue and retry run through the page.** The chat page handles regenerate (same model or a chosen model), last-answer regenerate, and continue. Continue checks the trial and opens the upgrade dialog when it is used up. Each one calls the same stream hook as a new send. (`apps/web/features/chat/pages/WebChatPage.tsx:5704 (handleRegenerateMessage)`, `apps/web/features/chat/pages/WebChatPage.tsx:5877 (handleRegenerateWithModel)`, `apps/web/features/chat/pages/WebChatPage.tsx:5900 (handleRegenerateLastMessage)`, `apps/web/features/chat/pages/WebChatPage.tsx:6433-6440 (handleContinueMessage and trial check)`)
8. **8. Ratings and reports are sent to the server.** A rating posts to the feedback route with a context tag of response rating, tied to the message. Removing a rating deletes that row. A report posts to the content-report route. The feedback route inserts a row into the feedback table. (`apps/web/features/chat/components/messages/MessageBubble.tsx:1174 (fetch of /api/content-report)`, `apps/web/features/chat/components/messages/MessageBubble.tsx:1232 (rating post)`, `apps/web/features/chat/components/messages/MessageBubble.tsx:1256 (rating removal)`, `packages/contracts/cloud-contracts/src/response-rating.ts:65 (FEEDBACK_PATH = /api/feedback)`, `apps/web/app/api/feedback/route.ts:37-44 (insert and delete SQL on public.feedback)`)
9. **9. Mobile runs the same ideas in its own store.** On mobile, the bubble draws its own action row (copy, read aloud, regenerate, more). Follow-up suggestions are shown in a footer that appears when there is a follow-up target and the composer is empty. Suggestions are saved into the message's metadata in the mobile chat store. (`apps/mobile/src/features/chat/components/MessageBubble.tsx:3146-3190 (message action row)`, `apps/mobile/app/(app)/chat/[id].tsx:2592-2605 (FollowUpSuggestions footer)`, `apps/mobile/src/features/chat/components/FollowUpSuggestions.tsx:1-30 (component and cache helper)`, `apps/mobile/stores/chat/chatMessageStore.ts:1107 (suggestions written to metadata)`)
10. **10. CLI and extensions render the same states in their own code.** The CLI prints an answer, then a sources footer, and its terminal UI handles copy and states. The VS Code webview and the Chrome side panel build their own answer bubbles, sources list and error states from their own code. Nothing in these surfaces is shared with the web bubble. (`apps/cli/src/repl/mod.rs:828-836 (Ok turn: print sources footer)`, `apps/cli/src/sources.rs:91-104 (render_footer)`, `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4757-4762 (sources list)`, `apps/extension/src/features/side-panel/bubbles.ts:704 (side-panel bubble code)`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/chat/components/messages/MessageBubble.tsx` | Web answer bubble: the text, activity, sources, files, action row, copy, share, rating, report and read-aloud menu. |
| `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Web message list: decides which notices (continue, refusal, stopped, failed) and follow-up suggestions appear; holds the follow-up gate and default flag (line 1104). |
| `apps/web/features/chat/pages/WebChatPage.tsx` | Web chat page: regenerate, regenerate with model, last-answer regenerate and continue handlers (lines 5704-6440). |
| `apps/web/lib/hooks/useChatStream.ts` | Web stream hook: sends the turn to the chosen completion route and writes streamed text into the answer. |
| `apps/web/app/api/chat/conversations/[id]/messages/lib/generate-follow-ups.ts` | Server side of follow-up suggestions: builds the prompt, reserves the quota and calls the model. |
| `apps/web/app/api/chat/conversations/[id]/messages/[messageId]/follow-ups/route.ts` | Follow-ups route: returns cached suggestions or generates them, then saves them into the message metadata. |
| `apps/web/lib/hooks/useTTS.ts` | Read-aloud hook: fetches speech in chunks from the speech route and plays it in the browser. |
| `packages/ui/unified-chat/src/components/markdown/richBlocks.ts` | Shared helper that turns rich answer blocks into plain text for copy and share. |
| `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Mobile answer bubble: message body, action row (copy, read aloud, regenerate, more), export and report entry points. |
| `apps/mobile/src/features/chat/components/FollowUpSuggestions.tsx` | Mobile follow-up suggestion footer: shows cached or fetched suggestions and sends the one picked. |
| `apps/cli/src/sources.rs` | CLI sources: collects web sources per turn and renders the Sources footer. |
| `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | VS Code chat webview: one large file holding its markup, script and the answer, sources and action rendering. |
| `apps/extension/src/features/side-panel/bubbles.ts` | Chrome side panel: builds answer bubbles, error states and follow-up chips. |

## What is stored

- Follow-up suggestions (up to three questions) for an answer, saved in the message's metadata under the key followUpSuggestions: Web: the message row's metadata JSON, merged by the follow-ups route (follow-ups/route.ts:103-106); the table name was not confirmed. Mobile: the chat message store metadata (apps/mobile/stores/chat/chatMessageStore.ts:1107).
- Response ratings (good or bad) tied to a message, stored with feedback_context set to response_rating: public.feedback table (apps/web/app/api/feedback/route.ts:37-44)
- Reports of an answer sent to trust and safety: Sent to /api/content-report (MessageBubble.tsx:1174); the server side was not opened, so the storage is unknown.
- Quota usage for follow-up generation: A background usage lease reserved by reserveBackgroundUsage with the feature name follow_up_suggestions (generate-follow-ups.ts:160-180, 230).
- Web settings toggle for follow-up suggestions (Show follow-up suggestions in chats), synced to the account: Web settings store (apps/web/shared/stores/web-settings-store.ts:80, 135) and CloudSettingsSync.tsx:75-289. Whether the local store is persisted in the browser was not checked.
- Copy, read aloud, share, regenerate and continue hold no stored data of their own. Read aloud fetches speech audio at request time and plays it in the browser.: Not stored; the speech route is apps/web/lib/hooks/useTTS.ts:10.
- Answer text, activity, sources and attempts (variants) of each turn: The conversation message store on the server; the exact table and write path were not traced in this pass.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT (currently false)**: Default for enableFollowUpSuggestions. Nothing in apps/web passes that prop, so on web it is effectively the only switch on the list. The brief's switch-on step points at line 1048, which is now a different function; the constant is at line 1104. (apps/web/features/chat/components/messages/ChatMessageList.tsx:1104, read at :1226)
- **followUpSuggestionsEnabled (default true) and the General settings toggle**: The user-facing on/off for follow-up suggestions. Must be on for any follow-up to show. (apps/web/shared/stores/web-settings-store.ts:135; read at ChatMessageList.tsx:1465; toggle at apps/web/features/settings/sections/GeneralSection.tsx:627-634; synced by apps/web/features/settings/components/CloudSettingsSync.tsx)
- **lastTurnSearched**: Lets follow-ups show after a turn that used web search, even when the default flag is false. (apps/web/features/chat/components/messages/ChatMessageList.tsx:1431-1436, used at :1468)
- **Follow-up quota (follow_up_suggestions) and plan tier**: Generation of follow-ups is metered by plan tier; the plan is read on the server. (apps/web/app/api/chat/conversations/[id]/messages/lib/generate-follow-ups.ts:25, 153-165)
- **Trial exhausted**: Continue is blocked and opens the upgrade dialog instead. (apps/web/features/chat/pages/WebChatPage.tsx:6433-6440)
- **Stopped turn**: A user Stop hides Continue, so a stopped answer is not offered as a cut-off answer. (apps/web/features/chat/components/messages/ChatMessageList.tsx:1353-1356)
- **isReadAloudSupported and readAloudUnavailableReason**: Shows the read-aloud control only when the surface supports it; a reason disables it with a message. (apps/web/features/chat/components/messages/ChatMessageList.tsx:429, 481; MessageBubble.tsx:740, 801, 3981)
- **Mobile follow-up footer condition**: The footer shows only when there is a follow-up target and the composer is empty. (apps/mobile/app/(app)/chat/[id].tsx:2592)
- **Temporary chat**: Branching and follow-up generation are not offered in temporary chats. (apps/web/features/chat/components/messages/ChatMessageList.tsx:1467 (enable:showFollowUps && !temporaryChat); branch gate in MessageBubble.tsx and [id].tsx (conversation?.temporary))

## Shared between apps

Web and Desktop share the same web answer bubble (apps/web/features/chat/components/messages/MessageBubble.tsx); the Desktop shows the hosted web app, as AGENTS.md section 5 states, and I did not open the Electron code. The web bubble also imports helpers from packages/ui/unified-chat (answer-document, web-search-notice, report-sources, message-sources, message-format, assistant-fence-edits). Mobile imports other helpers from the same package (answer-document, code-execution-result, message-format, citation-markers, message-sources), and its follow-up logic uses unified-chat/src/lib/follow-ups.ts. Plain-text copy uses packages/ui/unified-chat richBlocks.ts on web and mobile. Separate per app: the web and mobile bubbles, the CLI terminal UI (Rust, apps/cli), the VS Code webview (apps/extension-vscode, one large file), and the Chrome side panel (apps/extension). The server follow-up generator exists only in apps/web. The mobile follow-up service is in apps/mobile/src/features/chat/services/followUps.ts.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief's switch-on step for follow-ups points at ChatMessageList.tsx:1048. That line is now a row-props comparator. The default flag is at line 1104 and is false. The setting default at web-settings-store.ts:135 is true, so follow-ups show on web only after a web-search turn today. (apps/web/features/chat/components/messages/ChatMessageList.tsx:1104 (flag), :1048 (wrong line in brief))
- The brief marks CLI sources footer (S17.07) as missing, but the CLI prints a Sources footer after each turn. Inline citation markers (S17.06) for CLI are not found. (apps/cli/src/repl/mod.rs:833; apps/cli/src/tui/tui_app.rs:8665; apps/cli/src/sources.rs:91)
- The brief marks VS Code sources (S17.07) as missing, but the webview appends a sources list to each answer. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4757-4762, 7884)
- The brief marks mobile follow-up suggestions (S17.14) as missing, but the footer is mounted on the chat screen. (apps/mobile/app/(app)/chat/[id].tsx:2592-2605; apps/mobile/src/features/chat/components/FollowUpSuggestions.tsx)
- Most line numbers in the brief no longer point at the named behavior. For example, MessageBubble.tsx:1641 is a file URI mapping, MessageBubble.tsx:3144 is an attachment truncation icon, and MessageBubble.tsx:2075 is citation text cleanup. The brief's lines should be refreshed before use. (apps/web/features/chat/components/messages/MessageBubble.tsx:1641, :2075, :3144)
- Copy writes plain text only. Rich or formatted copy (S17.16) is not built on any app: the copy handler calls navigator.clipboard.writeText with plain text. (apps/web/features/chat/components/messages/MessageBubble.tsx:2273-2276)
- The CLI /continue command returns a new prompt, not a resume of the same answer. The brief lists S17.21 CLI as done, citing claude_parity.rs:131. (apps/cli/src/claude_parity.rs:185)

## Not established

- I did not run the app, tests, builds or servers (read-only rule), so no behavior was observed; everything here is from reading code.
- The server side of the Cloud completion route, the content-report route, and the speech route were not opened; their storage and limits are unknown.
- The follow-up quota numbers by plan, and what the UI shows when the quota is used up, were not confirmed.
- The web chat message table name and write path for answers, variants and metadata were not traced.
- Whether the web settings store is persisted in the browser (localStorage) was not checked.
- Desktop: relied on AGENTS.md section 5 (the Desktop shows the hosted web app); the Electron code was not opened.
- Chrome: I did not confirm refusal, report, rating, branch or continue; the brief's statuses for these were not checked in code.
- VS Code: artifact cards (S17.09) and citation markers were not checked; the statuses in the brief were not verified.
- Mobile: the brief's line numbers for regenerate, retry, share and export were not each re-checked; the existence of the named files was checked.
- Audio results (S17.11) are missing in every app by search only; the search covered web chat, mobile chat and unified-chat, and found only the live voice session code, which is not generated audio in answers.
- Shorten, expand and change tone (S17.23-S17.25) are missing by search only; no code matched in web, mobile, CLI, VS Code or Chrome.
- Whether packages/ui/unified-chat/src/components/MessageBubble.tsx is used by any app was not checked; the web app uses its own bubble file.
- Whether the brief's CLI status for S17.21 (Continue) is correct depends on how /continue is handled after it returns a prompt; not traced further.
