---
id: "AREA-074"
type: "area"
title: "Browser extension"
features: ["F074-01", "F074-02", "F074-03", "F074-04", "F074-05", "F074-06", "F074-07", "F074-08", "F074-09", "F074-10", "F074-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 74. Browser extension

The Chrome extension puts the assistant in a side panel next to the page a person is reading. The person can ask about the page, selected text or a YouTube video, attach other open tabs, and let the assistant act on a site after approving it. It matters because the assistant sees only what the person allows: each site needs Chrome host access and the person's approval before the extension reads it or drives it.

**Who uses it.** Every person who installs the Chrome extension. Chat is sent through a signed-in account and is shown only when the account's capability document allows it (apps/extension/src/side_panel.ts:13401, 13443). Voice, file upload, connectors, web search and browser control are each gated by plan capability (side_panel.ts:15242-15244, 9511, 11165). Free-plan accounts see an upgrade-only usage view (side_panel.ts:13224). Pairing with the desktop app needs a person running the desktop app on this computer, because the bridge address must be a local host (apps/extension/src/background/policy.ts:315-326). Organisation admins can set a site policy through managed storage, which the extension reads first (apps/extension/src/features/site-policy/store.ts:1-30). No developer-only surface was found in this area.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F074-01](F074-01-open-the-assistant.md) | Open the assistant | n/a | n/a | n/a | n/a | n/a | partly |
| [F074-02](F074-02-ask-about-selected-text-and-right-click-actions.md) | Ask about selected text and right-click actions | n/a | n/a | n/a | n/a | n/a | built |
| [F074-03](F074-03-ask-about-the-page-summaries-and-videos.md) | Ask about the page, summaries and videos | n/a | n/a | n/a | n/a | n/a | built |
| [F074-04](F074-04-attach-tabs-and-page-chips.md) | Attach tabs and page chips | n/a | n/a | n/a | n/a | n/a | partly |
| [F074-05](F074-05-conversations.md) | Conversations | n/a | n/a | n/a | n/a | n/a | built |
| [F074-06](F074-06-site-access-and-site-permissions.md) | Site access and site permissions | n/a | n/a | n/a | n/a | n/a | built |
| [F074-07](F074-07-browser-control-the-assistant-acts-on-a-page.md) | Browser control (the assistant acts on a page) | n/a | n/a | n/a | n/a | n/a | built |
| [F074-08](F074-08-desktop-app-pairing-and-connection-status.md) | Desktop app pairing and connection status | n/a | built | n/a | built | n/a | built |
| [F074-09](F074-09-voice-dictation.md) | Voice dictation | n/a | n/a | n/a | n/a | n/a | built |
| [F074-10](F074-10-save-a-page-to-a-project-or-library.md) | Save a page to a Project or Library | n/a | n/a | n/a | n/a | n/a | no |
| [F074-11](F074-11-limits-recovery-updates-and-accounts.md) | Limits, recovery, updates and accounts | n/a | n/a | n/a | n/a | n/a | partly |

Requirement items for this area: [10-requirements/capabilities/074-browser-extension.md](../../10-requirements/capabilities/074-browser-extension.md).

## How this area works in the code

1. **Open the panel from the toolbar, a menu or a shortcut.** A toolbar click or a context-menu item calls openAssistantPanel, which opens the Chrome side panel for that tab. If the side panel is unavailable, a separate assistant window opens instead. (`apps/extension/src/background.ts:7677-7681`, `apps/extension/src/background.ts:7452-7461`, `apps/extension/src/features/surface/assistantPanel.ts:66-72`)
2. **Hand selected text or a page request to the panel.** A context-menu item writes a pending request to chrome session storage. The side panel reads it when it opens and attaches the selection or page to the composer. (`apps/extension/src/background.ts:7556-7575`, `apps/extension/src/side_panel.ts:16562-16598`, `apps/extension/src/side_panel.ts:16632-16655`)
3. **Read the page, asking Chrome for site access if needed.** The panel reads the visible tab text after checking the URL, the blocked list and loading state. If Chrome denies access, a card asks the person to allow once, always (for acting) or decline; the grant uses a Chrome host permission request. (`apps/extension/src/side_panel.ts:6486-6538`, `apps/extension/src/side_panel.ts:6539-6558`, `apps/extension/src/side_panel.ts:7785-7830`, `apps/extension/src/features/side-panel/bubbles.ts:1417-1424`, `apps/extension/src/features/options/site-allowlist.ts:86-96`)
4. **Build and send the turn from the composer.** The composer text, attachments, page context, chat history, chosen model, thinking and web-search flags, and conversation id are gathered and sent to the worker as one message. (`apps/extension/src/side_panel.ts:8777-8800 (sendMessage entry)`, `apps/extension/src/side_panel.ts:9122-9180 (dispatchTurn)`, `apps/extension/src/side_panel.ts:9275-9300 (postTurn)`, `apps/extension/src/side_panel.ts:9474-9530 (sendChatTurn, sends CHAT_MESSAGE)`)
5. **Worker accepts the message and checks the account.** The worker validates the owner and stream id, gets the sign-in context, and starts the chat through the managed chat handler. The request is checked for text length (32,000 characters) and model value. (`apps/extension/src/background.ts:5284-5294`, `apps/extension/src/background.ts:7826-7856`, `apps/extension/src/features/cloud-bridge/managedChatHandler.ts:250`, `apps/extension/src/features/cloud-bridge/managedChatHandler.ts:275-292`)
6. **Call the managed chat endpoint and stream the answer.** The chat client posts to the web app's chat-completions route on the gateway origin and reads a streamed response, with a 90 second default timeout and frame-size limits. (`apps/extension/src/features/cloud-bridge/freeTrialClient.ts:100-112`, `apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1396-1420`, `apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1567`, `apps/web/app/api/llm/v1/chat/completions/route.ts (file exists; not read)`, `apps/extension/src/background.ts:1121 (CHAT_CHUNK message type seen; not read in full)`)
7. **Run browser tools the model asks for.** When the model asks for a tool that touches a page, the worker hands it to the side panel, which runs the page read or browser task and returns the result. (`apps/extension/src/background.ts:764 (CHAT_TOOL_HANDOFF seen)`, `apps/extension/src/side_panel.ts:8443-8460 (handleChatToolHandoff, read only in part)`)
8. **Start a browser-control run.** The Computer use tab sends the goal and tab to the worker. The worker takes a lease on the run, checks the goal and tab, and the agent loop drives the page. (`apps/extension/src/side_panel.ts:14043-14051`, `apps/extension/src/side_panel.ts:13949-13960`, `apps/extension/src/background.ts:6232-6260`, `apps/extension/src/features/computer-use/agentLoop.ts:1468-1475`)
9. **Show, pause and stop the run.** The panel shows the banner and the page indicator. Stop, Take over and Continue send messages that the worker uses to cancel, pause or resume the run. (`apps/extension/src/features/side-panel/computerUsePanel.ts:1218-1233`, `apps/extension/src/features/side-panel/computerUsePanel.ts:1337-1345`, `apps/extension/src/background.ts:7088-7100`, `apps/extension/src/background.ts:7148-7165`)
10. **Store the conversation on the device.** Each conversation, with its messages and sync state, is saved to chrome local storage under one key, with a cap on count, messages and size. (`apps/extension/src/features/background/conversation-history.ts:41-51`, `apps/extension/src/features/background/conversation-history.ts:924-948`, `apps/extension/src/features/background/conversation-history.ts:1373-1388`)
11. **Keep the worker alive and recover after suspension.** The panel opens a port and sends a heartbeat every 20 seconds so Chrome does not stop the worker during a reply. If the port drops, the panel resumes a saved cloud run or ends the stream with an error. (`apps/extension/src/side_panel.ts:6905-6957`, `apps/extension/src/side_panel.ts:6990-7000`, `apps/extension/src/background.ts:1752`, `apps/extension/src/background.ts:1857-1875`, `apps/extension/src/background.ts:9284-9297`)

## Files to know

| File | Role |
|---|---|
| `apps/extension/manifest.json` | Permissions, toolbar action, shortcuts, side panel page, and incognito setting (not allowed). |
| `apps/extension/src/background.ts` | Service worker: toolbar and menu handlers, chat relay, browser-control runs, native link status, worker lifecycle (about 9,300 lines). |
| `apps/extension/src/side_panel.ts` | Side panel UI, composer, page capture, site-access requests, chat turns, conversations, tab mentions (about 16,800 lines). |
| `apps/extension/src/features/surface/assistantPanel.ts` | Opens the side panel for a tab, or a fallback assistant window. |
| `apps/extension/src/features/side-panel/computerUsePanel.ts` | Browser-control panel: goal, mode select, Stop, Take over, Continue, status banner. |
| `apps/extension/src/features/computer-use/agentLoop.ts` | Agent loop that drives the page and the takeover tool. |
| `apps/extension/src/features/cloud-bridge/managedChatHandler.ts` | Validates and streams a managed chat turn inside the worker. |
| `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | HTTP client for the managed chat endpoint, models and usage, with size and time limits. |
| `apps/extension/src/features/background/conversation-history.ts` | Stores conversations in chrome local storage with limits. |
| `apps/extension/src/features/native-bridge/pairing.ts` | Pairing with the desktop app: code flow, pair token, revocation, local bridge check. |
| `apps/extension/src/features/options/site-permission-policy.ts` | Options control for the default browser-control mode (Ask first, Auto, Full access, YOLO). |
| `apps/extension/src/features/side-panel/voice.ts` | Microphone dictation with the first-use notice and error messages. |

## What is stored

- Conversations: up to 100 conversations, 100 messages each, 4 MB cap, with sync state: chrome.storage.local, key agi_browser_conversations_v2 (apps/extension/src/features/background/conversation-history.ts:41-51)
- One pending request from a context menu or a page action, with text, URL, tab and timestamp: chrome.storage.session, key agi_pending_chat (apps/extension/src/background.ts:7556-7600; apps/extension/src/side_panel.ts:16564)
- Whether the worker gave up reconnecting to the desktop app: chrome.storage.session, key agi_native_reconnect_gave_up (apps/extension/src/background.ts:1454-1476)
- Desktop pairing: paired desktop record, pending revocation, desktop-connected flag, pair request, bridge URL: chrome.storage.local and session storage, keys in apps/extension/src/features/native-bridge/pairing.ts:19-28 and the bridge URL read at pairing.ts:318-326 (storage area per key, read in code)
- Browser-control default mode (Ask first, Auto, Full access, YOLO) stored as true, false, always-approve or the Auto value: chrome.storage.local, key ASK_BEFORE_ACTING_KEY (apps/extension/src/features/computer-use/askBeforeActing.ts:13-25; set at apps/extension/src/side_panel.ts:15535)
- Approved sites for browser control: chrome.storage.local, key agi_site_allowlist (apps/extension/src/background/policy.ts:187); Chrome host permissions held by the browser
- Organisation site policy document: chrome.storage.managed (read first) or chrome.storage.local, key agi_admin_site_policy (apps/extension/src/features/site-policy/store.ts:1-30)
- Microphone notice acknowledged: chrome.storage.local, key agi.notice.microphone (apps/extension/src/features/side-panel/voice.ts:60-67)
- Selected model, effort, quick mode and thinking flags: chrome.storage.local (apps/extension/src/side_panel.ts:6030, 11111, 11331, 15628)
- Side panel draft text and attachments: chrome.storage.session (apps/extension/src/side_panel.ts:10104-10142)
- Open tabs and page text for a request: Read live from Chrome; not stored by this area

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Toolbar and side panel opening**: Clicking the toolbar button opens the side panel; a fallback window opens if the side panel API is missing. (apps/extension/manifest.json:52, 83; apps/extension/src/background.ts:1769, 7677; apps/extension/src/features/surface/assistantPanel.ts:66)
- **Keyboard shortcuts**: Alt+Shift+K (Command+Shift+K on Mac) opens the panel; Alt+Shift+Y (Command+Shift+Y) runs the capture-page command, which needs the desktop app connected. (apps/extension/manifest.json:66-80; apps/extension/src/background.ts:7754-7762)
- **Incognito**: Extension does not run in private windows; tabs in private windows are left out of the tab list. (apps/extension/manifest.json:9; apps/extension/src/background.ts:4668)
- **Browser-control default mode**: Ask first, Auto (default), Full access, or YOLO. Changes whether a card appears and whether routine actions need questions. (apps/extension/src/features/options/site-permission-policy.ts:9, 47-81; apps/extension/src/features/side-panel/computerUsePanel.ts:1139-1141; apps/extension/src/side_panel.ts:15535, 15541)
- **Plan capability: voice**: Microphone button hidden when the account lacks canUseVoice. (apps/extension/src/side_panel.ts:15242)
- **Plan capability: files and connectors**: File upload and connectors menu items hidden or locked by capability. (apps/extension/src/side_panel.ts:15243-15248)
- **Plan capability: web search**: Web search turned off in the chat message when the capability is not allowed. (apps/extension/src/side_panel.ts:9511)
- **Plan capability: managed chat, work mode and video**: Managed chat shown only when managed_chat is allowed; work mode falls back to chat without agi_work; video generation needs video_generation. (apps/extension/src/side_panel.ts:13443, 13414, 11165, 6088)
- **Free plan view**: Free-plan usage screens show only an upgrade path. (apps/extension/src/side_panel.ts:13224)
- **Attachment limit**: At most 5 attachments (tabs and files) per message. (apps/extension/src/features/cloud-bridge/freeTrialClient.ts:103; apps/extension/src/side_panel.ts:14283-14288)
- **Chat limits**: Message up to 32,000 characters, up to 100 messages of history, 90 second default timeout. (apps/extension/src/features/cloud-bridge/freeTrialClient.ts:100-106; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:278-284)
- **Take-over limit**: A person may hold the page for 15 minutes before the run ends. (apps/extension/src/features/computer-use/runOwnership.ts:17-18)
- **Desktop reconnect policy**: Up to 8 reconnect attempts, back-off 1 s to 30 s; manual reconnect after that. (apps/extension/src/features/native-bridge/reconnect.ts:1-3)
- **Desktop bridge address**: Only local hosts are accepted; default is a localhost port; a stored bridge URL overrides it. (apps/extension/src/background/policy.ts:313-326; apps/extension/src/features/native-bridge/pairing.ts:318-332)
- **In-page panel**: In-page panel (including the video actions) on approved sites, unless the person turns it off. (apps/extension/src/background.ts:5573; apps/extension/src/features/options/preference-rows.ts:10 (key in_page_panel_enabled))
- **Build value: web origin**: Sets the gateway origin for the managed chat, models and usage calls. (apps/extension/.env.example (VITE_AGI_WEB_API_BASE_URL); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:111-112)
- **Build value: error reporting**: Crash reports are sent only when a DSN is set and the person consents in Options. (apps/extension/.env.example (VITE_SENTRY_DSN); apps/extension/src/features/observability/errorReporting.ts:23-25)

## Shared between apps

Shared across apps: the policy and pairing code types come from the shared types package (@agiworkforce/types), used by the extension at apps/extension/src/features/site-policy/store.ts and apps/extension/src/features/native-bridge/pairing.ts (isBridgePairingCode). The desktop app's bridge (apps/desktop/electron/browser/bridgeServer.ts) and the web pairing page (apps/web/features/desktop-host/components/BrowserPairingSection.tsx) are separate per-app code that pair with the extension. The CLI reads whether a browser is paired from the desktop shell (apps/cli/src/agent/mod.rs:1100-1110). Separate per app: everything under apps/extension/src (side panel, worker, options, content scripts). Chat itself goes to the web app's route at apps/web/app/api/llm/v1/chat/completions. Not checked: whether packages/ui is used by the side panel (the side panel builds its own DOM with el() helpers).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief marks the tab picker (S74.09) as missing, but typing @ in the composer lists open tabs and attaches them. Multi-tab context (S74.10) is also merged into one text. The brief status and the code disagree. (apps/extension/src/side_panel.ts:14367-14410, 14466-14476, 14283-14288, 1845-1870)
- Private windows are silently excluded: the manifest says incognito is not allowed and the tab list skips incognito tabs, but no message tells the person. The brief asks for clear controls or messaging (S74.26). (apps/extension/manifest.json:9; apps/extension/src/background.ts:4668)
- When the side panel API is missing, the assistant opens in a separate window, not beside the page. The brief says the side panel hosts the assistant beside the page (S74.03). (apps/extension/src/features/surface/assistantPanel.ts:66-72)
- The brief points pairing to the side panel (side_panel.ts:7228), but pairing is started from the Options page. The side panel only reads connection status and offers Reconnect. (apps/extension/src/features/options/desktop-pairing-rows.ts:4-14; apps/extension/src/features/options/destinations.ts:110; apps/extension/src/side_panel.ts:16263-16276)
- The default-mode label YOLO is used in the UI with no plain-language name; the tooltip and the Options hint describe it, but QA should check that the label matches the brief's wording. (apps/extension/_locales/en/messages.json:5182-5192; apps/extension/src/features/options/site-permission-policy.ts:81)
- Brief line numbers for this area have drifted. Many cited lines (side_panel.ts 4490-6869, background.ts 806-4602, computerUsePanel.ts 740) point at CSS or unrelated code, so they cannot be used as pointers. (apps/extension/src/side_panel.ts:4490, 4507, 4556, 4652, 5068, 6357, 6852, 6869; apps/extension/src/background.ts:806, 4087, 4526, 4602)
- Update notice missing: the worker opens the welcome page on first install only; no update notice is shown after an update. (apps/extension/src/background.ts:7694-7701)

## Not established

- Nothing was built, run, installed or tested. This is a read-only reading of the code. The relayed request about testing on localhost and one surface at a time applies to QA runs, not to this read.
- The brief's own line pointers are stale; the lines cited here were opened directly in the current tree.
- Side panel empty state (renderEmptyGreeting, side_panel.ts:5867) and the full message send path after sendChatTurn were not read in full.
- The server route apps/web/app/api/llm/v1/chat/completions/route.ts was located but not opened; its database tables and plan checks are unknown.
- The chunk handler (CHAT_CHUNK, background.ts:1121) and the CHAT_TOOL_HANDOFF handler (side_panel.ts:8443) were only partly read.
- Whether the extension runs in Local or own-key modes was not established. The conversation type includes a 'local' runtime (conversation-history.ts:80), but the chat path read goes to the managed service.
- The storage area for the bridge secret (agi_bridge_secret, pairing.ts:19) was not confirmed.
- The CLI's connection status display (S74.19 cli done) was not confirmed; only the browser-available flag was seen (apps/cli/src/agent/mod.rs:339-345, 1100-1110).
- Plan limits enforced on the server side are unknown; this area shows only what the extension checks.
- The exact wording of the first-use microphone notice and the dictation language setting were not read.
- Whether a project picker or page save exists elsewhere (desktop or web) was not searched for.
