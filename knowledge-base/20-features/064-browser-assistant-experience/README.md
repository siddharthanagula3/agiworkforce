---
id: "AREA-064"
type: "area"
title: "Browser-assistant experience"
features: ["F064-01", "F064-02", "F064-03", "F064-04", "F064-05", "F064-06", "F064-07", "F064-08", "F064-09", "F064-10", "F064-11", "F064-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 64. Browser-assistant experience

This area lets the assistant read and act on the web pages a person has open. A person can ask about the page they are on, highlight text for a question, summarize a page, or ask about a video. For tasks, the assistant can open pages, fill forms, follow several steps on a site, and ask the person to sign in or solve a check. It matters because the person can see what the assistant does, stop it, and control which sites it may touch.

**Who uses it.** Code shows four groups. (1) Any signed-in user who has paired a browser can use the browser tools in the web app, where the Use the browser row opens the tools dialog (ComposerPlusMenu.tsx:1159-1170, BrowserToolsDialog.tsx:62-84). (2) Users of the Chrome extension run the agent from its side panel (computerUsePanel.ts:1218-1229). (3) Users of the desktop app's coding sessions get the built-in browser pane (BrowserPaneSettings.tsx:25). (4) Workspace admins set site rules through the admin site policy (site-policy/store.ts:1-40, browserSteps.ts:57-64). Whether a plan gates any of this was not established.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F064-01](F064-01-ask-about-the-page-you-are-on.md) | Ask about the page you are on | n/a | built | built | built | built | built |
| [F064-02](F064-02-use-selected-text.md) | Use selected text | n/a | built | built | built | built | built |
| [F064-03](F064-03-pick-and-compare-open-tabs.md) | Pick and compare open tabs | n/a | partly | n/a | no | n/a | partly |
| [F064-04](F064-04-ask-about-a-video-transcript.md) | Ask about a video transcript | n/a | no | no | no | n/a | built |
| [F064-05](F064-05-side-chat-beside-the-page.md) | Side chat beside the page | n/a | n/a | n/a | n/a | n/a | built |
| [F064-06](F064-06-search-browsing-history-opt-in.md) | Search browsing history (opt-in) | n/a | no | n/a | no | n/a | built |
| [F064-07](F064-07-open-pages-and-manage-tabs.md) | Open pages and manage tabs | no | partly | no | partly | partly | partly |
| [F064-08](F064-08-act-on-a-website.md) | Act on a website | no | partly | no | partly | partly | built |
| [F064-09](F064-09-see-and-control-a-run.md) | See and control a run | no | partly | no | built | built | built |
| [F064-10](F064-10-hand-off-sign-in-human-checks-and-takeover.md) | Hand off sign-in, human checks and takeover | no | no | no | no | no | partly |
| [F064-11](F064-11-approve-downloads-and-uploads.md) | Approve downloads and uploads | no | partly | no | no | n/a | built |
| [F064-12](F064-12-website-permissions-and-browser-data.md) | Website permissions and browser data | no | partly | no | no | no | partly |

Requirement items for this area: [10-requirements/capabilities/064-browser-assistant-experience.md](../../10-requirements/capabilities/064-browser-assistant-experience.md).

## How this area works in the code

1. **Person asks from the web composer.** The Use the browser row in the composer opens the browser tools dialog. The dialog lists actions and each one calls a desktop command. (`apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1159-1170`, `apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:68-84`, `apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:120-135`)
2. **Shape of each browser command.** Each browser action is described as a shared step with its command, capability and description. The desktop plan for a command sets the confirm title and text. (`packages/contracts/local-runtime/src/device-steps.ts:200-213`, `apps/web/lib/device-steps/device-tools.ts:395-410`, `apps/desktop/electron/browser/commandGate.ts:265-288`)
3. **Desktop bridge checks the caller.** The bridge server checks the origin and the token for each route. Browser commands are refused unless the browser is paired, except open tab. (`apps/desktop/electron/browser/bridgeServer.ts:862-911`, `apps/desktop/electron/browser/bridgeServer.ts:785`, `apps/desktop/electron/browser/bridgeServer.ts:524-537`)
4. **Website rules check each landing page.** After an action that may land on a new page, the desktop reads the tab address and checks the workspace allow and deny lists. A refused page is left by going back. (`apps/desktop/electron/browser/browserSteps.ts:57-64`, `apps/desktop/electron/browser/browserSteps.ts:67-82`, `apps/desktop/electron/browser/browserSteps.ts:104-110`)
5. **Built-in browser pane.** The desktop pane is an Electron view in its own persistent session. Permission requests are denied. Back, forward and reload check history before they move. (`apps/desktop/electron/browserPane.ts:18`, `apps/desktop/electron/browserPane.ts:122-128`, `apps/desktop/electron/browserPane.ts:354-379`)
6. **Chrome side panel runs the agent.** The panel shows Stop and Take over buttons during a run. The agent loop waits when the person takes over and resumes when they hand back. (`apps/extension/src/features/side-panel/computerUsePanel.ts:1218-1229`, `apps/extension/src/features/side-panel/computerUsePanel.ts:1316-1318`, `apps/extension/src/features/computer-use/agentLoop.ts:1131-1154`)
7. **Chrome approvals and checks.** Downloads always ask for approval. Each click is checked after it settles, and typed fields are read back. (`apps/extension/src/features/computer-use/approvalPolicy.ts:358`, `apps/extension/src/features/computer-use/agentLoop.ts:583-592`, `apps/extension/src/features/computer-use/agentLoop.ts:801-812`)
8. **CLI tool calls.** The CLI offers browser tools only when a browser is paired. Each call asks for approval with a message that names the action, and navigation checks workspace website rules first. (`apps/cli/src/platform/runtime/tool_catalog.rs:52-61`, `apps/cli/src/platform/runtime/tool_catalog.rs:1324-1347`, `apps/cli/src/features/exec/tools/mod.rs:1028-1032`, `apps/cli/src/features/exec/tools/mod.rs:1459-1480`)
9. **Mobile share path.** Shared text is cut to a size limit and the first link is found. Summarize sends a fixed prompt with the shared text. Nothing is read from the open browser page. (`apps/mobile/src/features/share-preview/index.tsx:48-60`, `apps/mobile/src/features/share-preview/index.tsx:227-236`, `apps/mobile/src/features/share-preview/index.tsx:448-471`)
10. **Where data is kept.** Pane cookies live in a persistent Electron session that the clear action wipes. Consent is kept in extension storage. History is read only when asked for each search. (`apps/desktop/electron/browserPane.ts:423-427`, `apps/web/features/desktop-host/components/BrowserPaneSettings.tsx:98-106`, `apps/extension/src/features/computer-use/browserControlConsent.ts:6-10`, `apps/extension/src/features/computer-use/historySearch.ts:181-183`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/desktop-host/components/BrowserToolsDialog.tsx` | Web dialog that runs browser actions on the paired desktop and lists results. |
| `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Composer menu with the Use the browser entry point. |
| `packages/contracts/local-runtime/src/device-steps.ts` | Shared list of device and browser steps with their commands and descriptions. |
| `apps/desktop/electron/browser/commandGate.ts` | Builds the confirm text for each browser command on desktop. |
| `apps/desktop/electron/browser/bridgeServer.ts` | Local server that checks callers and routes browser commands. |
| `apps/desktop/electron/browser/browserSteps.ts` | Applies workspace website rules to each landing page. |
| `apps/desktop/electron/browserPane.ts` | Built-in browser pane: its session, navigation and data clearing. |
| `apps/extension/src/features/side-panel/computerUsePanel.ts` | Chrome side panel controls: Stop, Take over and approval cards. |
| `apps/extension/src/features/computer-use/agentLoop.ts` | Chrome agent loop: runs tools, checks results and waits for hand-back. |
| `apps/extension/src/features/computer-use/browserToolDefinitions.ts` | Definitions of Chrome browser tools, including ask_user_to_take_over. |
| `apps/cli/src/platform/runtime/tool_catalog.rs` | CLI browser tool names, status lines and definitions. |
| `apps/mobile/src/features/share-preview/index.tsx` | Mobile share screen with Summarize and Ask about this page. |

## What is stored

- Built-in browser pane cookies, sign-ins and site storage (persistent Electron session): Electron session partition persist:agi-browser-pane, apps/desktop/electron/browserPane.ts:18; cleared by clearBrowserPaneData, browserPane.ts:423-427
- Desktop browser pairing state: Written by persist() in apps/desktop/electron/browser/pairingStore.ts:55-63; file path not verified
- Chrome browser-control consent list: Extension storage key agi_cu_browser_control_consent, apps/extension/src/features/computer-use/browserControlConsent.ts:6
- Organisation site policy document: chrome.storage.managed (read first) and chrome.storage.local, key agi_admin_site_policy, apps/extension/src/features/site-policy/store.ts
- Workspace site allow and deny lists for desktop browser commands: Passed in per command and read by siteRulesFrom, apps/desktop/electron/browser/browserSteps.ts:57-64; storage location not verified
- Chrome browsing history: Not stored by the app. Read per request through chrome.history.search, apps/extension/src/features/computer-use/historySearch.ts:181-183
- Page text, console and network records and screenshots read from the browser: Kept as File attachments in the web dialog, apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:135-140, 170, 179; storage after the chat is not verified

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Computer use on or off (desktop)**: Screen-control steps run only when enabled and supported (apps/desktop/electron/runtime/dispatcher.ts:2255 (computerUseEnabled), set at dispatcher.ts:2610-2612)
- **Pairing gate**: Browser commands other than open tab are refused until the browser is paired (apps/desktop/electron/browser/bridgeServer.ts:785)
- **Browser tools offered only when a browser is paired (CLI)**: Browser tool family is offered to the model only when a browser is available (apps/cli/src/platform/runtime/tool_catalog.rs:1324-1347)
- **Workspace website rules**: Allow and deny lists are checked after a page loads, before it is used (apps/desktop/electron/browser/browserSteps.ts:57-64, 92-110; apps/cli/src/features/exec/tools/mod.rs:1028-1032)
- **Organisation site policy**: Managed policy wins over the workspace copy; an unreadable policy denies every capability (apps/extension/src/features/site-policy/store.ts)
- **History permission**: Browsing history is read only after the person allows each search (apps/extension/src/features/computer-use/historySearch.ts:10, 24)
- **Takeover time limit**: A person's takeover ends after the set number of minutes (apps/extension/src/features/computer-use/runOwnership.ts:18)
- **Browser control consent**: Asks the person before the extension gets full control of a site (apps/extension/src/features/computer-use/browserControlConsent.ts:6-10)

## Shared between apps

Shared: the browser step names and descriptions in packages/contracts/local-runtime/src/device-steps.ts, used by the web and desktop apps (apps/web/lib/device-steps/device-tools.ts:395-410, apps/web/features/desktop-host/lib/device-steps.ts:186-197). The CLI has its own tool catalog (apps/cli/src/platform/runtime/tool_catalog.rs). The Chrome extension has its own agent under apps/extension/src/features/computer-use/. The desktop has its own bridge and pane under apps/desktop/electron/browser/ and apps/desktop/electron/browserPane.ts. Mobile has its own share screen (apps/mobile/src/features/share-preview/index.tsx). VS Code has its own context handoff. Each app keeps its own copy of the browser logic.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says Chrome and CLI are missing back and forward (S64.11), but the Chrome tool definitions include go_back, go_forward and reload, and the CLI has browser_history. (apps/extension/src/features/computer-use/browserToolDefinitions.ts:165-172; apps/cli/src/platform/runtime/tool_catalog.rs:58, 1117-1118)
- Brief says Chrome is missing browsing-history search (S64.09), but the Chrome code has browser_search_history with a per-search prompt. (apps/extension/src/features/computer-use/historySearch.ts:9-24, 181-183)
- Brief says desktop is missing the open-tab picker and tab creation (S64.03, S64.12), but the desktop has list-tabs and open-tab commands, and the web dialog has a tab list. (apps/desktop/electron/browser/commandGate.ts:134, 177; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:341-377)
- Brief says Chrome is missing take over and hand back (S64.23, S64.24), but the Chrome panel has a Take over button and the agent waits for hand-back. (apps/extension/src/features/side-panel/computerUsePanel.ts:1224-1229, 1316-1318; apps/extension/src/features/computer-use/agentLoop.ts:1131-1154)
- Brief says web is missing Open URL (S64.10), but the web composer's Use the browser row opens a dialog with an Open a page action for the paired desktop browser. (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1159-1170; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:79, 156-158)
- Mobile Summarize this page (S64.05) does not read the open page. It sends a fixed prompt with the shared text and link only. Brief says done. (apps/mobile/src/features/share-preview/index.tsx:48-60, 227-236)
- Brief cites code that does not show the claimed behaviour: the VS Code line cited for pause is attachment validation, the extension line cited for pause and CAPTCHA is message validation, and the desktop line cited for page context is the screen-step loop gate. (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3996-4002; apps/extension/src/background.ts:4478-4484; apps/desktop/electron/runtime/dispatcher.ts:585-599)
- Brief cites manifest line 78 for the side conversation, but the side panel path is at lines 83-84. (apps/extension/manifest.json:74-84)
- Chrome panel has a Stop button and a setPaused function, but no separate Pause control was found. Brief says pause is done. (apps/extension/src/features/side-panel/computerUsePanel.ts:1218-1222, 1322)
- Browser pane session always persists (no setting), and clearing data is the only data control. (apps/desktop/electron/browserPane.ts:18, 423-427)

## Not established

- Plan gates for any browser feature (web, desktop, mobile, Chrome) were not checked.
- The Chrome side conversation (apps/extension/src/side_panel.ts:4802) and its history were not opened.
- The VS Code context handoff (apps/extension-vscode/src/features/context-handoff/index.ts) and its webview were not opened; the VS Code status of open URL and timeline is from the brief only.
- CLI lines cited in the brief (apps/cli/src/features/exec/tools/mod.rs:1236) and the CLI browser bridge file (apps/cli/src/browser_bridge.rs) were not opened.
- The mobile file cited in the brief (apps/mobile/stores/chat/chatExecutionStore.ts:2300) shows no browser logic in search; the mobile path for Ask about this page was not traced past the share screen.
- Web device step results (apps/web/features/desktop-host/lib/device-steps.ts) were only partly read.
- Desktop pairing store file path and its storage format were not confirmed.
- Where the Chrome site allow list is stored (SITE_ALLOWLIST_STORAGE_KEY in background/policy) was not opened.
- Desktop approval text for browser actions beyond download and stop (browserSteps.ts) was only partly read.
- Upload approval (approvalPolicy.ts:221, side_panel.ts:11620) was not opened.
- WebMCP site tool discovery (apps/extension/src/background.ts:1376-1379, 4268-4272) was only partly read.
- Live preview and active-tab marker (agentLoop.ts:135, background.ts:1426, content.ts:1846) were not opened at those lines.
- No test or build was run, as instructed.
