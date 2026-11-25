---
id: "AREA-069"
type: "area"
title: "Web application"
features: ["F069-01", "F069-02", "F069-03", "F069-04", "F069-05", "F069-06", "F069-07", "F069-08", "F069-09", "F069-10", "F069-11", "F069-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 69. Web application

A signed-in person opens the AGI Workforce web app in a browser, chats with the assistant, and can switch the composer to Work mode for multi-step runs that use tools. The area also covers the parts that make a browser app feel finished: links that open a conversation, a layout that fits phone, tablet and desktop, browser notifications for finished runs, export, and public share pages for people who are not signed in.

**Who uses it.** Every signed-in person using a browser (chat page at /chat and /chat/&lt;id&gt;). Work mode is paid-plan only: the composer hides it for free-trial accounts (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1062-1066) and the server refuses it below the plan tier (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1484-1500). Cloud code execution is on by default and can be switched off per account. Signed-out visitors see the marketing page at / (apps/web/proxy.ts, buildHomeResponse is only used for the signed-in path) and can open public share links (/share/[token], /shared-artifact/[token]). Browser notifications are per browser and per account. Workspace members can open organization-visible shares through the scoped database read (apps/web/app/share/[token]/page.tsx:28-47). Workspace admins and developers are not identified in this area.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F069-01](F069-01-chat-page-and-work-mode.md) | Chat page and Work mode | built | n/a | n/a | n/a | n/a | n/a |
| [F069-02](F069-02-responsive-layout.md) | Responsive layout | built | n/a | n/a | n/a | n/a | n/a |
| [F069-03](F069-03-links-history-refresh-and-other-tabs.md) | Links, history, refresh and other tabs | built | n/a | n/a | n/a | n/a | n/a |
| [F069-04](F069-04-drag-drop-paste-and-copy.md) | Drag, drop, paste and copy | built | n/a | n/a | n/a | n/a | n/a |
| [F069-05](F069-05-microphone-camera-and-screen-access.md) | Microphone, camera and screen access | built | n/a | n/a | n/a | n/a | n/a |
| [F069-06](F069-06-cloud-code-execution.md) | Cloud code execution | built | n/a | n/a | n/a | n/a | n/a |
| [F069-07](F069-07-cloud-browser-and-desktop-control.md) | Cloud browser and desktop control | partly | n/a | n/a | n/a | n/a | n/a |
| [F069-08](F069-08-browser-notifications.md) | Browser notifications | built | n/a | n/a | n/a | n/a | n/a |
| [F069-09](F069-09-install-and-offline.md) | Install and offline | n/a | n/a | n/a | n/a | n/a | n/a |
| [F069-10](F069-10-export-and-download.md) | Export and download | built | n/a | n/a | n/a | n/a | n/a |
| [F069-11](F069-11-browser-checks-and-support-message.md) | Browser checks and support message | built | n/a | n/a | n/a | n/a | n/a |
| [F069-12](F069-12-public-share-and-preview-pages.md) | Public share and preview pages | built | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/069-web-application.md](../../10-requirements/capabilities/069-web-application.md).

## How this area works in the code

1. **1. The page loads.** A person opens /chat or /chat/<id>. The proxy stamps the real path in a header when it rewrites /agi-work to chat, and the chat page reads that header to start in Work mode. The chat itself is loaded only in the browser (no server rendering) through a dynamic import. (`apps/web/app/chat/page.tsx:7-16`, `apps/web/proxy.ts:84`, `apps/web/features/chat/components/WebChatRoot.tsx:9-31`, `apps/web/app/chat/[sessionId]/page.tsx:1-15`)
2. **2. The shell picks a layout.** The shell reads the window size and orientation and chooses drawer, rail or persistent sidebar. It re-checks on resize and rotation. (`apps/web/shared/components/layout/app-shell-layout.ts:24-48`, `apps/web/shared/components/layout/app-shell-layout.ts:50-70`, `apps/web/shared/components/layout/WebAppShell.tsx:196-198`, `apps/web/shared/components/layout/WebAppShell.tsx:684-700`)
3. **3. The person writes and attaches.** Typing is saved as a draft in browser storage. Dropped files and pasted files go to the attachment intake, which applies per-plan limits and names refused files. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2223-2226`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2301-2303`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2372-2396`, `apps/web/features/chat/hooks/use-attachments.ts:447-448`, `apps/web/features/chat/components/Composer/composer-draft-storage.ts:207-212`)
4. **4. Send is checked in the browser.** Sending checks for offline, for an empty message and for a pending slash command. It also warns once if the text looks like it holds a secret. Then the message goes to the streaming hook. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3581-3590`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3647-3658`, `apps/web/lib/hooks/useChatStream.ts:4149-4166`)
5. **5. The turn is routed.** The streaming hook first checks whether the model is a local one; a local turn never reaches the server. Other turns are sent to the chat endpoint chosen for the model, with the owner's auth token. (`apps/web/lib/hooks/useChatStream.ts:4166-4170`, `apps/web/lib/hooks/useChatStream.ts:720-730`, `apps/web/lib/hooks/useChatStream.ts:4572-4580`, `apps/web/features/chat/lib/free-quota-selection.ts:43-48`)
6. **6. The server admits the turn.** The chat route checks auth, rate limit, subscription and managed compute, then takes a turn slot and dispatches the turn. (`apps/web/app/api/llm/v1/chat/completions/route.ts:1475-1500`, `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:139`, `apps/web/app/api/llm/v1/chat/completions/route.ts:396-420`)
7. **7. Work mode and tools are set.** Work mode turns on web tools and code execution for the turn, unless the person excluded them. The plan is checked for Work. Code execution tools are added only when the sandbox is ready and the kill switch is on. The tool loop checks the user's own switch before running any code. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1462-1472`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1484-1500`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6417-6421`, `apps/web/lib/e2b/execution-tools.ts:258-269`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2814-2836`)
8. **8. The answer streams back.** The browser reads the server-sent event stream, decodes frames, and updates the message, tool status, searching and code-running states. (`apps/web/lib/hooks/useChatStream.ts:2890-2892`, `apps/web/lib/hooks/useChatStream.ts:3480-3500`)
9. **9. The address and history follow the conversation.** After the first send in a new chat, the address changes to /chat/<id>. Opening an address loads its conversation. Focus or visibility changes re-fetch the open conversation. (`apps/web/features/chat/pages/WebChatPage.tsx:5792`, `apps/web/features/chat/pages/WebChatPage.tsx:2354-2358`, `apps/web/features/chat/pages/WebChatPage.tsx:2331-2339`)
10. **10. Background notice.** When an agent run or cloud code turn finishes, the server sends a push to the account's registered browsers; the service worker shows it and opens the run on click. (`apps/web/lib/services/agent-notification-service.ts:140-170`, `apps/web/lib/services/push-notification-service.ts:281-291`, `apps/web/lib/services/web-push-service.ts:346-389`, `apps/web/public/sw.js:61-95`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/chat/page.tsx` | Route for /chat; reads the proxy header to start in Work mode. |
| `apps/web/features/chat/pages/WebChatPage.tsx` | Main chat page: URL loading, history, export and share dialogs, focus refresh, message actions. |
| `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Composer: send checks, Chat/Work toggle, drop, paste, attachments, drafts, offline refusal, slash commands. |
| `apps/web/lib/hooks/useChatStream.ts` | Sends a turn to the chat endpoint and reads the streamed reply and tool status. |
| `apps/web/app/api/llm/v1/chat/completions/route.ts` | Server entry for one chat turn: auth, admission, dispatch. |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Server work-mode setup, Work plan gate, code-execution tool choice, kill-switch check. |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Checks the user's code-execution switch before any code tool runs. |
| `apps/web/shared/components/layout/WebAppShell.tsx` | Responsive shell: drawer, icon rail, persistent sidebar, scroll and focus handling. |
| `apps/web/shared/components/layout/app-shell-layout.ts` | Pure width and orientation rules for the shell (768px and 1024px breakpoints). |
| `apps/web/features/chat/components/Composer/composer-draft-storage.ts` | Keeps unsent drafts per conversation in browser local storage, with owner tracking across reloads. |
| `apps/web/features/settings/sections/CapabilitiesSection.tsx` | Settings switch for cloud code execution and file creation. |
| `apps/web/lib/server/code-execution-policy.ts` | Server read of the user's code-execution setting; refuses when the read fails. |
| `apps/web/features/notifications/lib/web-push-client.ts` | Browser side of web push: support check, permission, subscribe, store, remove. |
| `apps/web/public/sw.js` | The only service worker: shows push notifications and opens the run on click; caches nothing. |
| `apps/web/app/share/[token]/page.tsx` | Public page for a shared conversation: reads, expiry check, metadata, report link. |

## What is stored

- Unsent composer drafts, keyed by owner and conversation (key prefix agi-composer-draft:v2:): Browser localStorage (composer-draft-storage.ts:1-5, 149-200)
- Current draft owner id and the list of previous owners: Browser sessionStorage key agi-composer-draft:document-owner (composer-draft-storage.ts:5, 149-200)
- Whether this browser turned web push off: Browser localStorage key agi.web-push.disabled (web-push-client.ts:8, 14-26)
- Cloud code execution setting, under capabilities.cloudCodeExecution: Server table public.user_settings, JSON settings column (code-execution-policy.ts:7-8, 33-36)
- Web push subscriptions: endpoint, encryption keys, user agent, last seen time, owner user id: Server table public.web_push_subscriptions (apps/web/app/api/web-push/route.ts:95-110)
- Push subscription held by the browser: Browser push manager, created by web-push-client.ts:98-110
- Dictation audio, kept in memory until sent for transcription: Memory in voice-input-store.ts (rt.audioChunks), then sent to /api/voice/transcribe (voice-input-store.ts:16, 231)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI Work plan gate (client)**: Work toggle is hidden for free-trial accounts and for plans below the Work tier. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1062-1066)
- **AGI Work plan gate (server)**: Work mode below the paid tier is refused with agi_work_plan_required. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1484-1500)
- **Cloud code execution account setting**: Off means the model is told execution is disabled and code tools are refused; an unreadable setting also refuses. (Written by apps/web/features/settings/sections/CapabilitiesSection.tsx:116-121; read by apps/web/lib/server/code-execution-policy.ts:22-50; enforced in apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2814-2836 and apps/web/app/api/chat/conversations/[id]/code-runs/route.ts:106-110)
- **Platform kill switch canUseCloudExecution**: Turns cloud code execution off for all accounts when closed. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5236 and 6417-6419)
- **Sandbox readiness**: Execution tools are offered only when the sandbox cut-over flag, its API key value and a priceable compute check pass. (apps/web/lib/e2b/gate.ts:20-26)
- **Web push key pair**: Web push is off, and the settings offer nothing, when the VAPID public, private and subject values are missing or invalid. (apps/web/lib/services/web-push-service.ts:107-109, 121; apps/web/lib/config/optional-features.ts:39-47)
- **Shell breakpoints**: Below 768px the sidebar is a drawer; 768-1023px uses rail in portrait; 1024px and wider is persistent. (apps/web/shared/components/layout/app-shell-layout.ts:5-6)
- **Desktop host**: Web push is not offered and the camera control is hidden inside the desktop shell. (apps/web/features/desktop-host/lib (isDesktopHost); apps/web/features/notifications/lib/web-push-client.ts:33-40; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:257-258)
- **Quick-ask compact mode**: Uses /quick-ask as its root instead of /chat. (apps/web/features/chat/pages/WebChatPage.tsx:1138-1139 and apps/web/features/chat/lib/new-chat-entry.ts:1-2)
- **Remote Control gate (screen share switch)**: Pairing is refused while the switch is closed; the web settings section renders nothing without the desktop bridge. (apps/web/lib/feature-flags/remote-control-gate.ts (header comment); apps/web/features/desktop-host/components/RemoteControlSection.tsx:166)

## Shared between apps

Shared across apps (from packages): @agiworkforce/types (plan tiers, visual capture, product names), @agiworkforce/cloud-contracts (attachment limits, message length), @agiworkforce/unified-chat (client failure reporting, tool call card), @agiworkforce/ui (switch, confirm dialog, spinner), and packages/platform/utils/src/composerPaste.ts (paste decision, which the code says is shared with the browser extension). The chat completions endpoint is one server route used by every client. Web-only (apps/web): WebAppShell, WebChatPage, ChatComposerNew, the service worker (public/sw.js), the web manifest, the share pages and the browser support script in app/layout.tsx. Desktop-shell branches live inside web code (isDesktopHost checks in web-push-client.ts and VoiceModeSurface.tsx).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief status says screen sharing is not applicable anywhere, but the web feedback dialog captures the whole screen with the display-capture call to attach a picture to a report. (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:54-69, 94-96)
- Brief status says installable app is not applicable, but a web app manifest exists (standalone display, icons, start URL '/'). Signed-in users are rewritten to chat; signed-out users land on the marketing page. (apps/web/app/manifest.ts:4-30; apps/web/proxy.ts (buildHomeResponse, signed-in path); apps/web/app/page.tsx:2)
- Brief status says offline is not applicable, but the composer refuses sends while offline with a notice and keeps the draft, and an offline indicator is mounted. The service worker caches nothing, so there is no offline page or read-only copy of old content. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:717, 3588-3590, 4806; apps/web/app/AppRuntimeMounts.tsx:25; apps/web/shared/components/OfflineIndicator.tsx:31; apps/web/public/sw.js:4-7)
- Brief status says multi-tab is not applicable, but the unread-count store syncs across tabs through storage events and the open conversation re-fetches on focus. Messages are not pushed between tabs. (apps/web/shared/stores/unread-conversations-store.ts:63; apps/web/features/chat/pages/WebChatPage.tsx:2331-2339)
- Copy of a message has no failure handling. If the clipboard write is refused, the promise rejects and the person sees no message. The share fallback in the same file does handle failure. (apps/web/features/chat/components/messages/MessageBubble.tsx:2273-2282 (compare the share fallback at 2284-2304))
- An expired shared conversation returns the global not-found page. The published-artifact page avoids the global not-found page for the same reason, because it misdescribes the cause to the recipient. (apps/web/app/share/[token]/page.tsx:107-111 versus apps/web/app/shared-artifact/[token]/page.tsx:64-70 (comment and UnavailableArtifact))
- Brief citations drifted from the code. Examples: request-processor.ts:4439 is image URL validation, not code execution (the execution gate is at 2292-2312, 5196-5236 and 6417-6421); WebChatPage.tsx:888 is message delete; ArtifactsPanel.tsx:383 is the popstate listener's neighbour (the listener is at 638); layout.tsx:154/163/164 are the banner, script and noscript at 144-157. (Brief file apps/web (area-briefs/069-web-application.md) citations versus the files named above)

## Not established

- Nothing was run: no build, test, server or browser check was done, and no localhost test was done. Everything here comes from reading the code only, so no behaviour is confirmed in a running app.
- Cloud browser (S69.11) and remote desktop control (S69.12): absence rests on searches for cloud browser and remote desktop host terms in apps/web features, lib and app. The desktop app, mobile app, command-line tool and extension were not checked for these.
- Status for the other five surfaces (desktop, mobile, command-line, VS Code extension, Chrome extension) is not given by the brief for any item; no claim is made here.
- Plan limits for code execution beyond the account switch: no plan check for the execution tools was found; not confirmed either way.
- The sandbox network rule in the Settings copy ('can reach only package registries and code hosting') was not checked against the sandbox configuration.
- Chat message storage, conversation tables and the managed save path were not traced; only the two database tables named in data_kept were seen.
- Voice: the transcription endpoint (/api/voice/transcribe) and the live voice session endpoint were not opened; where camera frames go (onVisualFrame sink) was not traced.
- Share creation and expiry settings (how long a link lasts, who sets it) were not traced; only the read and the expiry check on the public page were seen.
- Attachments in the export dialog: the dialog exports conversation text only; per-message files and generated files were not traced.
- Failure states for opening an unknown conversation address and for a failed send were not traced to the end.
- Keyboard shortcuts for send and paste were not verified; the brief does not name them.
- Proxy behaviour for a signed-out visitor who opens /chat directly (sign-in redirect) was seen only partly (apps/web/proxy.ts:136-141, buildSignedOutRedirect); not fully confirmed.
- Web push denied and unavailable messages in NotificationsSection.tsx were not read; only the client functions were read.
- The userDisabledCapabilities function (called at request-processor.ts:2312) was not opened, so how the stored switch is applied to the request is not fully confirmed beyond the tool-loop check.
- No model or provider names are used in this write-up on purpose; the code's provider-specific names were left out.
