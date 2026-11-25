---
id: "AREA-012"
type: "area"
title: "New-chat experience"
features: ["F012-01", "F012-02", "F012-03", "F012-04", "F012-05", "F012-06", "F012-07", "F012-08", "F012-09", "F012-10", "F012-11", "F012-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 12. New-chat experience

The new-chat screen is the first thing a person sees when they open the product. It shows an empty conversation with a ready message box, a greeting, and shortcuts to the common next steps: attach a file, pick a project, switch to search, research, image or video, start voice, or start a temporary chat. It matters because it decides how fast a person can start useful work and which mode and model their first message will use.

**Who uses it.** Every signed-in person on the web, desktop, mobile, CLI, VS Code and Chrome surfaces, as the brief lists per app. Signed-out visitors reach a limited version on the web (guest chat) and on mobile onboarding. Some shortcuts depend on the plan or a capability, for example voice (canUseVoice), connectors (canUseConnectors) and organization workspaces. Workspace admins see organization names in the workspace line. Developers reach the same screen through deep links (web new-chat entry parameters).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F012-01](F012-01-new-chat-screen-and-greeting.md) | New chat screen and greeting | built | built | built | partly | partly | partly |
| [F012-02](F012-02-suggested-prompts-and-recommendations.md) | Suggested prompts and recommendations | partly | partly | partly | no | partly | no |
| [F012-03](F012-03-recent-projects-and-files.md) | Recent projects and files | built | built | built | built | built | no |
| [F012-04](F012-04-task-shortcuts-and-mode-explanation.md) | Task shortcuts and mode explanation | partly | partly | built | built | built | built |
| [F012-05](F012-05-search-research-agentic-and-coding-entries.md) | Search, research, agentic and coding entries | built | built | built | partly | partly | partly |
| [F012-06](F012-06-image-and-video-entries.md) | Image and video entries | built | built | built | partly | no | no |
| [F012-07](F012-07-voice-entry.md) | Voice entry | built | built | built | built | no | n/a |
| [F012-08](F012-08-temporary-chat.md) | Temporary chat | built | built | built | built | no | built |
| [F012-09](F012-09-model-workspace-and-project-for-the-next-message.md) | Model, workspace and project for the next message | built | built | built | partly | built | partly |
| [F012-10](F012-10-first-use-introduction.md) | First-use introduction | built | built | built | built | built | built |
| [F012-11](F012-11-unsent-draft-restore.md) | Unsent draft restore | built | built | built | no | built | built |
| [F012-12](F012-12-guest-use-and-sign-in-prompt.md) | Guest use and sign-in prompt | partly | no | built | built | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/012-new-chat-experience.md](../../10-requirements/capabilities/012-new-chat-experience.md).

## How this area works in the code

1. **Open the new-chat page.** The web route reads an x-agi-pathname header; the AGI work path switches the initial work mode to agiwork. It renders WebChatRoot with that mode. WebChatRoot loads the chat page client-only (no server rendering), finishes any sign-in handoff and applies the new-chat entry. (`apps/web/app/chat/page.tsx`, `apps/web/features/chat/components/WebChatRoot.tsx`)
2. **Apply a deep link once.** If the URL carries new-chat parameters (work mode, draft text), the hook writes them to the pending conversation in the chat store exactly once, then removes the parameters from the URL so a reload does not re-fill the draft. (`apps/web/features/chat/hooks/use-new-chat.ts`)
3. **Build the greeting.** The greeting picks a time-of-day headline. It uses the preferred name, then the account name, unless the person opted out. The opt-out is read from the general preference namespace and updates live when the preference is saved. (`apps/web/features/chat/components/GreetingBanner/useGreeting.ts`, `apps/web/features/chat/components/GreetingBanner/useNameOptedOut.ts`, `apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx`)
4. **Show the workspace line.** The workspace line reads the account's workspaces. It shows the organization name when the active scope is an organization, and 'Personal' otherwise. If the account has no organization workspace, it renders nothing. (`apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx`)
5. **Compose and choose modes.** The composer holds the draft, the mode toggles (work, image, video, temporary, search, research), the project choice and the model. The plus menu rows and the slash command list set these. Temporary chat is allowed only when the project policy allows it. Voice needs the voice capability. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx`, `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx`, `packages/ui/unified-chat/src/lib/slashCommands.ts`)
6. **Keep the unsent draft.** Typed text is saved in browser local storage under an owner key, with the owner list kept in session storage. A reload retires previous owners so an old draft does not leak into a new document. (`apps/web/features/chat/components/Composer/composer-draft-storage.ts`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`)
7. **Gate guest use.** A signed-out visitor is allowed to chat only when bot protection is ready and the guest.chat flag is on for the web surface. The flag is read through the feature-flag service; a read failure turns guest chat off. (`apps/web/lib/guest-chat/guest-chat-access.ts`, `apps/web/lib/guest-chat/config.ts`, `apps/web/lib/security/bot-challenge-routes.ts`)
8. **Mobile empty state.** The mobile empty state shows a greeting from the display name, a 'How can I help you?' line and, when allowed, the connector suggestion list. Dismissing the pairing banner or the connector card stores a flag on the device. (`apps/mobile/src/features/chat/components/ChatEmptyState.tsx`, `apps/mobile/src/features/chat/components/NewChatConnectorSuggestions.tsx`)
9. **VS Code start suggestions.** The start panel loads up to three recent projects, three enabled and consented skills and three connected apps. Each source is skipped when the person is signed out or the call fails. (`apps/extension-vscode/src/features/sidebar-webview/startSuggestions.ts`)
10. **Chrome side panel.** The side panel builds a page-snapshot attachment chip (page or selected text) with a refresh control. This is the only chip code found under the cited lines; no prompt suggestions were found there. (`apps/extension/src/side_panel.ts`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/chat/pages/WebChatPage.tsx` | Main web chat page: the transcript, send paths, edit, project delete and most new-chat wiring. Very large; the brief's line pointers into it are stale. |
| `apps/web/features/chat/components/WebChatRoot.tsx` | Client wrapper that loads the web chat page without server rendering and applies the new-chat entry hook. |
| `apps/web/app/chat/page.tsx` | Route for the new chat; sets the agiwork work mode from the request path header. |
| `apps/web/features/chat/hooks/use-new-chat.ts` | Applies new-chat deep links once, then strips the URL parameters. |
| `apps/web/features/chat/components/GreetingBanner/useGreeting.ts` | Builds the time-of-day greeting and decides whether a name can be shown. |
| `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | The composer: draft, mode toggles, temporary chat policy, voice, dictation, project choice and slash command handling. |
| `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | The plus menu rows: image, video, temporary chat, local folder and connectors. |
| `packages/ui/unified-chat/src/lib/slashCommands.ts` | Shared built-in slash command list (search, think, image and others) used by the web composer. |
| `apps/web/features/chat/components/Composer/composer-draft-storage.ts` | Stores unsent drafts in browser storage per owner, with retirement after reload. |
| `apps/web/lib/guest-chat/guest-chat-access.ts` | Decides whether guest chat is available for a signed-out visitor. |
| `apps/mobile/src/features/chat/components/ChatEmptyState.tsx` | Mobile new-chat empty state: greeting, pairing banner and connector suggestions. |
| `apps/extension-vscode/src/features/sidebar-webview/startSuggestions.ts` | Loads VS Code start-panel suggestions (projects, skills, connectors). |

## What is stored

- Unsent draft text (per owner, with owner list): Browser local storage and session storage on the web (composer-draft-storage.ts)
- Dismissed pairing banner flag: Device storage on mobile (MMKV key dismissedDesktopPairingBanner, ChatEmptyState.tsx)
- Dismissed connector suggestions flag: Device storage on mobile (DISMISSED_KEY in NewChatConnectorSuggestions.tsx)
- Preferred name and its opt-out (empty preferred name): Stored preference namespace 'general' (read by useNameOptedOut.ts through preferences-client)
- Pending new-chat draft and work mode: Web chat store, key PENDING_CONVERSATION_KEY (use-new-chat.ts); persistence of that store not verified
- Guest spend counter per visitor: Server-side store under the key prefix guest-chat:spend: (guest-chat-service.ts:40); the backing store was not verified

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **guest.chat feature flag**: Turns guest chat on for the web surface (with bot protection ready). (apps/web/lib/guest-chat/config.ts:3 (GUEST_CHAT_FLAG_KEY), read in apps/web/lib/guest-chat/guest-chat-access.ts)
- **AGI_BOT_CHALLENGE_ENFORCED**: Environment value that enforces bot protection; guest chat needs it or a non-hosted platform. (apps/web/lib/security/bot-challenge-routes.ts:1; documented in apps/web/.env.example:836)
- **Connectors feature flag and connector discovery setting**: Mobile shows connector suggestions only when on, in cloud mode, when signed in and the person has the connectors capability. (apps/mobile/src/features/chat/components/ChatEmptyState.tsx (FEATURES.connectors, connectorDiscoveryEnabled from the cloud settings store, canUseConnectors from the tier store))
- **Companion feature flag**: Shows the desktop pairing banner on mobile. (apps/mobile/src/features/chat/components/ChatEmptyState.tsx (FEATURES.companion))
- **Voice capability**: Shows the voice entry in the web composer only when granted. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx (useCapability('canUseVoice')))
- **Temporary chat project policy**: Decides whether a temporary chat is allowed for the chosen project. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1592 and :1807 (temporaryChatAllowedIn from temporary-chat-policy))
- **Organization scope**: Changes the workspace line from Personal to the organization name. (apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx)
- **Desktop host**: Adds the local-folder option to the project picker and the local folder attach request. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx (useDesktopHost); ComposerPlusMenu.tsx comment)

## Shared between apps

["Shared: packages/ui/unified-chat (slash commands, BrandedGreeting, greetingHeadline, used by web and other surfaces named in the architecture rules).","Shared: @agiworkforce/utils/greeting (mobile greeting headline).","Web and desktop share the same web chat code (apps/web/features/chat); desktop adds a local-folder option through the host check.","Separate per app: mobile ChatEmptyState and its connector card (apps/mobile), VS Code start suggestions (apps/extension-vscode), Chrome side panel (apps/extension/src/side_panel.ts, plain DOM code), CLI terminal screens (apps/cli/src/tui/tui_app.rs and apps/cli/src/lib.rs).","Guest chat service and access code is web-only in apps/web/lib/guest-chat."]

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Workspace line shows nothing for an account with no organization workspace. The brief says it should show the personal or organization workspace, but the code returns null when there are no organizations, so personal-only accounts see no workspace line. (apps/web/features/chat/components/GreetingBanner/NewChatWorkspace.tsx)
- Brief's web code pointers for the greeting and for the new-chat page are stale. WebChatPage.tsx:4935-4960 and :5640-5650 hold project-delete and message-edit code, not the greeting. (apps/web/features/chat/pages/WebChatPage.tsx)
- Brief cites apps/mobile/src/features/chat/components/TaskChips.tsx for task chips; the file does not exist, and no TaskChip code was found under apps or packages. (apps/mobile (TaskChips reference))
- Brief cites apps/extension/src/side_panel.ts:10674 and :10684 as suggested prompts; the code there is the page-snapshot attachment chip. No suggested-prompt code was found in web features, mobile source or extension source. (apps/extension/src/side_panel.ts:10660-10690)
- Chrome greeting missing: the brief says the panel shows only the mark. 'How can I help you today?' appears in the web marketing preview and the guest chat placeholder, not in the extension source. (apps/web/features/marketing/components/app-preview/AppPreviews.tsx:510; apps/web/features/chat/guest/GuestChat.tsx:231)
- Guest chat status says mobile and CLI are done, but the only guest chat service and access code opened is web-only. The mobile and CLI guest behaviour was not established from code. (apps/web/lib/guest-chat/guest-chat-access.ts)
- Brief's status for mode explanation (S12.21) and suggested prompts is unverified on web; no mode explanation text was found in the web composer. (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx)

## Not established

- Exact line numbers: only the lines shown by rg or named in the brief were confirmed. Other line numbers in this guide come from the brief and were not all checked.
- Mobile chat screen (apps/mobile/app/(app)/(tabs)/chat.tsx) and mobile ChatInput.tsx were not opened beyond import lines, so mobile task chips, voice, temporary chat and draft restore are from the brief only.
- CLI (apps/cli/src/tui/tui_app.rs, apps/cli/src/lib.rs) and VS Code (webviewContent.ts) were only partly opened; mode explanation text, draft restore and onboarding claims are not confirmed.
- Chrome side panel behaviour beyond the attachment chip was not opened.
- Feature-flag values in production, plan limits (per plan caps on guest chat, voice and connectors) and the guest spend limit value were not found in code.
- Persistence of the web chat store (whether pending drafts survive reload beyond the draft storage) was not verified.
- The first-use introduction trigger and skip rule were not traced.
- No commands, builds, tests or servers were run. This was a read-only pass, so no localhost or single-surface testing was done or needed.
