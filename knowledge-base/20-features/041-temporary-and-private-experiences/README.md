---
id: "AREA-041"
type: "area"
title: "Temporary and private experiences"
features: ["F041-01", "F041-02", "F041-03", "F041-04", "F041-05", "F041-06", "F041-07", "F041-08", "F041-09", "F041-10", "F041-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 41. Temporary and private experiences

A temporary chat is a conversation that leaves no trace in the person's history, search, memory or Library. Local-only use keeps chats, files and memory on the person's own device so that nothing is uploaded to the account. The area exists so that people can choose how much the product keeps, and so that the product says accurately what it keeps. Some parts are not built yet, such as private search and a private browser session.

**Who uses it.** Web and desktop: every signed-in user who opens a chat; no plan gate was found in the files read. Mobile: every user, with temporary chat and the explainer on the chat tab; the Personalized switch appears only in Cloud mode. Local-only conversations, files and memory: users of the mobile app in Local mode, the CLI, the VS Code extension (local models and CLI session history) and the Chrome extension (mirror switch). Workspace administrators: not seen in these files. Developers: the CLI and the Rust crate parts are used by developers who run the CLI. Temporary chats are refused inside a project on every app that reads the shared policy.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F041-01](F041-01-start-a-temporary-chat.md) | Start a temporary chat | built | built | built | no | no | built |
| [F041-02](F041-02-temporary-mode-indicator-and-explainer.md) | Temporary-mode indicator and explainer | built | built | built | no | no | partly |
| [F041-03](F041-03-memory-and-custom-instruction-choices-in-temporary.md) | Memory and custom-instruction choices in temporary chat | built | built | built | no | no | partly |
| [F041-04](F041-04-plugins-and-connectors-in-temporary-chat.md) | Plugins and connectors in temporary chat | built | built | no | no | no | partly |
| [F041-05](F041-05-files-and-generated-images-in-temporary-chats.md) | Files and generated images in temporary chats | built | built | partly | no | no | built |
| [F041-06](F041-06-save-a-temporary-chat-to-history.md) | Save a temporary chat to history | built | built | partly | no | no | no |
| [F041-07](F041-07-private-search-and-private-browsing-not-built.md) | Private search and private browsing (not built) | no | no | no | no | no | no |
| [F041-08](F041-08-local-only-conversations-and-files.md) | Local-only conversations and files | no | no | built | built | partly | partly |
| [F041-09](F041-09-local-only-memory.md) | Local-only memory | no | no | built | built | no | no |
| [F041-10](F041-10-clear-all-data-on-this-device.md) | Clear all data on this device | no | no | built | no | no | no |
| [F041-11](F041-11-privacy-controls-and-where-data-is-processed.md) | Privacy controls and where data is processed | built | built | built | built | built | built |

Requirement items for this area: [10-requirements/capabilities/041-temporary-and-private-experiences.md](../../10-requirements/capabilities/041-temporary-and-private-experiences.md).

## How this area works in the code

1. **Person chooses temporary mode.** On web the switch lives in the composer + menu. The menu row is built in TemporaryChatRows. The composer computes whether the chat is temporary from the pending choice, the default setting and the project. On mobile a pill on the chat tab sets a session-only flag after an alert confirmation. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1797-1846`, `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:470-515`, `apps/web/features/settings/sections/PrivacySection.tsx:717-726`, `apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:15-33`, `apps/mobile/stores/settingsStore.ts:137-174`)
2. **Decide whether the next chat is temporary.** A shared rule says a chat is temporary when there is no project and either the per-chat choice or the default is on. The chat page uses this rule to decide what the next send does. (`apps/web/lib/temporary-chat-policy.ts:56-66`, `apps/web/features/chat/pages/WebChatPage.tsx:2210-2212`, `apps/web/features/chat/pages/WebChatPage.tsx:2464-2468`)
3. **Send the turn with the temporary flag.** The web chat page marks the conversation as temporary when the chat is created or sent. Mobile reads the conversation's temporary flag when it sends. Local-model turns on web are refused inside projects. (`apps/web/features/chat/pages/WebChatPage.tsx:2624-2629`, `apps/web/features/chat/pages/WebChatPage.tsx:2666`, `apps/mobile/stores/chat/chatExecutionStore.ts:2249-2250`, `apps/mobile/stores/chat/chatExecutionStore.ts:2501`)
4. **Server removes memory from a temporary turn.** The completions request processor refuses to add the memory-write tool for a temporary turn. The turn-context service leaves out memory and past-chat search when the turn is temporary. The web chat page also writes no message rows for temporary turns. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1126-1145`, `apps/web/lib/services/turn-context-service.ts:105-132`, `apps/web/features/chat/pages/WebChatPage.tsx:5143-5144`)
5. **Save a temporary chat to history.** The person confirms in a dialog. The client posts the kept messages. The server runs one transaction that flips the chat to kept, inserts messages in order, sets the active leaf, and flips the chat's files. A failure rolls everything back. Artifact indexing is scheduled after the commit. (`apps/web/features/chat/pages/WebChatPage.tsx:4969-5012`, `apps/web/app/api/chat/conversations/[id]/keep/route.ts:54-168`, `apps/web/app/api/chat/conversations/[id]/keep/route.ts:100-146`)
6. **Files and images.** An uploaded chat file in a temporary chat is recorded with a temporary flag. Saving a generated image to the Library goes through the media keep endpoint, which moves the stored asset out of temporary status. (`apps/web/lib/server/media-assets.ts:245-262`, `apps/web/app/api/media/keep/route.ts:12-35`, `apps/web/lib/server/media-assets.ts:735`, `apps/mobile/src/features/chat/components/GeneratedImage.tsx:133-138`)
7. **Expiry of temporary chats.** A nightly cron job deletes temporary chats created more than 30 days ago, in batches, skipping chats under a legal hold. It deletes image and video jobs linked to them and then purges temporary files. (`apps/web/app/api/cron/purge-temporary-chats/route.ts:21-28`, `apps/web/app/api/cron/purge-temporary-chats/route.ts:44-89`, `apps/web/app/api/cron/purge-temporary-chats/route.ts:116-136`)
8. **Local-only data on the device (mobile).** The app mode (Local or Cloud) is stored in device storage and admitted through a gate. Local conversations are filtered out of history when they are temporary. Clear-all-data deletes the local tables. (`apps/mobile/src/features/chat/store/appModeStore.ts:14-18`, `apps/mobile/src/features/chat/store/appModeStore.ts:58-75`, `apps/mobile/src/features/chat/utils/conversationMode.ts:34-37`, `apps/mobile/services/dsarExport.ts:425-449`)
9. **Local-only use in CLI and Chrome.** The CLI blocks a Local session from moving to BYOK or Cloud without an explicit handoff command, and prints the privacy settings. The Chrome extension reads a stored switch that decides whether Managed Cloud chats are mirrored to the account. (`apps/cli/src/claude_parity.rs:470-506`, `apps/cli/src/claude_parity.rs:443-465`, `apps/extension/src/features/privacy/cloudMirroring.ts:1-18`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/temporary-chat-policy.ts` | Shared web copy and rules: label, retention note, end confirmation, project refusal and resolveNewChatTemporary. |
| `apps/web/features/chat/pages/WebChatPage.tsx` | Web chat screen: temporary state for each send, save-to-history dialog (about line 4969), header label and Personalized switch (about lines 7340-7380). |
| `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Web + menu: the Temporary chat row, its switch, Use or Exit incognito labels, and the End temporary chat row (lines 470-515). |
| `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web composer logic for isIncognito, the toggle, saving state and the end-chat guard (lines 1797-1846). |
| `apps/web/app/api/chat/conversations/[id]/keep/route.ts` | Server save of a temporary chat: one transaction that flips the flag, writes messages and files. |
| `apps/web/lib/services/turn-context-service.ts` | Builds memory and past-chat context for a turn; returns nothing when the turn is temporary. |
| `apps/web/app/api/cron/purge-temporary-chats/route.ts` | Nightly 30-day deletion of temporary chats and their files, batched, with legal-hold exclusion. |
| `apps/mobile/stores/settingsStore.ts` | Mobile settings: session-only isTemporaryChat flag and the persisted Personalized flag. |
| `apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx` | Mobile explainer banner, the Learn more link and the Personalized switch in Cloud mode. |
| `apps/mobile/stores/chat/chatMessageStore.ts` | Mobile conversation store, including makeConversationPermanent and keepTemporaryConversation (around line 1031). |
| `apps/mobile/services/dsarExport.ts` | wipeAllLocalData: deletes local tables and signs out; the clear-all-data path. |
| `apps/cli/src/claude_parity.rs` | CLI slash commands for privacy mode, privacy settings text and attached context files. |
| `apps/extension/src/features/privacy/cloudMirroring.ts` | Chrome extension switch (storage key agi_cloud_conversation_mirroring) for mirroring Managed Cloud chats to the account. |

## What is stored

- Temporary flag on each conversation (is_temporary), and deleted_at and created_at used by purge: Postgres table web_conversations (apps/web/app/api/chat/conversations/[id]/keep/route.ts:77-88; apps/web/app/api/cron/purge-temporary-chats/route.ts:44-45)
- Kept messages of a saved temporary chat (up to 1000 per save): Postgres message table via INSERT_MESSAGE_SQL (keep/route.ts:118-126). Temporary turns deliberately write no message rows (WebChatPage.tsx:5143-5144).
- temporary_chat flag on chat files and generated images, and conversation link on image and video jobs: Postgres public.media_assets (keep/route.ts:136-145) and public.image_generation_jobs / public.video_generation_jobs (cron route.ts:70-108)
- Web default for new chats (newChatsTemporary) and per-chat pending choice (pendingTemporaryChat): Web settings store and chat store on the browser (PrivacySection.tsx:219-220; WebChatPage.tsx:1882-1885). Persistence not traced.
- Mobile session-only temporary flag (not persisted); Personalized flag (persisted): Mobile settings store on the device; isTemporaryChat is excluded from persistence (apps/mobile/stores/settingsStore.ts:137-174)
- Mobile app mode (Local or Cloud): Device storage through MMKV, key chat-app-mode-store (apps/mobile/src/features/chat/store/appModeStore.ts:66-67)
- Mobile memory facts: Device SQLite table memory_facts (apps/mobile/storage/memory.ts:20-30; apps/mobile/services/dsarExport.ts:438)
- Mobile conversations, custom instructions, installed models, settings, telemetry queue, memory vectors: Device SQLite tables, deleted by wipeAllLocalData (apps/mobile/services/dsarExport.ts:436-449)
- CLI sessions as JSON or JSONL files: Files on the user's computer under the CLI base directory (apps/cli/src/sessions.rs:1-17)
- CLI memory files: raw_memories.md (Local), byok_memories.md, managed_memories.md, session summaries: Files under the user's home folder memories directory (apps/cli/src/memory_pipeline.rs:1-22, 40-45)
- Chrome mirror switch (default on when absent): chrome.storage.local key agi_cloud_conversation_mirroring (apps/extension/src/features/privacy/cloudMirroring.ts:1-5)
- Media kept to the Library after a temporary chat: Postgres public.media_assets with temporary_chat set to false (apps/web/app/api/media/keep/route.ts:35; apps/web/lib/server/media-assets.ts:735)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Default: start new chats as temporary**: Makes every new chat temporary unless a per-chat choice overrides it. (Read in apps/web/features/chat/pages/WebChatPage.tsx:1885 and apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1789; set in apps/web/features/settings/sections/PrivacySection.tsx:219-220 and 717-726. Desktop reads chatPreferences.temporaryChat (apps/desktop/src/services/cloudChat.ts:229-232).)
- **Per-chat temporary choice (pending choice)**: Overrides the default for the next new chat. Ignored inside a project. (apps/web/lib/temporary-chat-policy.ts:56-66)
- **Personalized / Unpersonalized switch**: Turns the profile, instructions and style on or off for a temporary chat. (Web: apps/web/features/chat/pages/WebChatPage.tsx:1883-1884 and 7365-7378. Mobile: apps/mobile/stores/settingsStore.ts:138,159; read in apps/mobile/stores/chat/chatExecutionStore.ts:3453 and 5216-5217.)
- **Mobile temporary chat flag**: Session-only switch for new mobile chats. It resets on every launch. (apps/mobile/stores/settingsStore.ts:137, 158, 170, 174)
- **Project refusal**: A chat in a project cannot be temporary, and local-model chats cannot be saved in a project. (apps/web/lib/temporary-chat-policy.ts:47-58; apps/web/features/chat/pages/WebChatPage.tsx:2459)
- **Temporary-chat retention days**: A temporary chat and its files are purged 30 days after creation. (apps/web/app/api/cron/purge-temporary-chats/route.ts:24 (RETENTION_DAYS); cron authorisation at line 31 (verifyCronRequest))
- **Legal hold**: A held chat or file survives the purge and is purged after the hold is released. (apps/web/app/api/cron/purge-temporary-chats/route.ts:42-57)
- **Free daily allowance on save**: Saving a temporary chat counts against the Free daily message-write allowance. (apps/web/app/api/chat/conversations/[id]/keep/route.ts:90-96)
- **Maximum messages per save**: Refuses a save with more than 1000 messages. (apps/web/app/api/chat/conversations/[id]/keep/route.ts:27 and 40)
- **Chrome cloud mirroring**: When off, Managed Cloud chats stay in the browser only. (apps/extension/src/features/privacy/cloudMirroring.ts:1-5 (storage key agi_cloud_conversation_mirroring, on unless stored false))
- **CLI privacy mode**: Local, BYOK or Managed. Moving away from Local needs a reviewable handoff command. (apps/cli/src/claude_parity.rs:470-506)
- **Mobile app mode (Local or Cloud)**: Chooses local storage versus cloud behaviour; the cloud explainer and the Personalized switch show only in Cloud mode. (apps/mobile/src/features/chat/store/appModeStore.ts:14-18 (admission gate) and 58-75; apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:36)

## Shared between apps

Shared across apps: the @agiworkforce/cloud-contracts package (keep route imports cloud contracts; mobile keepMedia imports MANAGED_MEDIA_KEEP_PATH from it), and @agiworkforce/types (isAutoModeModelId in apps/mobile/src/features/chat/utils/conversationMode.ts:2). Web-only shared policy: apps/web/lib/temporary-chat-policy.ts holds the copy and rules for the web app; mobile does not import it. Copy is duplicated per app: mobile explainer strings live in apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:12-15, and the CLI, VS Code and Chrome privacy texts are separate files. Separate per app: the web chat page, the mobile chat stores and screens, the desktop chat preference (apps/desktop/src/services/cloudChat.ts), the CLI Rust code (apps/cli/src), the VS Code webview text (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts) and the Chrome extension (apps/extension/src/features/privacy). Server rules for temporary chats (memory exclusion, keep route, purge cron) are shared by every surface that calls the web API.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Mobile banner shows once per app session, then is hidden for the rest of the session. The brief says the indicator should stay for as long as the chat is open. (apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:24-27 and 39-48 (hasShownThisSession))
- Mobile has a save-to-history path (keepTemporaryConversation, reached through Share) and a generated-image Save to Library, but the brief lists mobile as missing for S41.09, S41.10 and S41.11. (apps/mobile/stores/chat/chatMessageStore.ts:1031-1050; apps/mobile/app/(app)/chat/[id].tsx:2136-2148; apps/mobile/src/features/chat/components/GeneratedImage.tsx:133-138)
- Mobile save alert does not list what will be kept, so it does not meet the brief's 'sees what will be kept and confirms'. (apps/mobile/app/(app)/chat/[id].tsx:2136-2145)
- Mobile new-chat temporary default is not stored across launches. The web default is stored, so the two apps behave differently for the 'by default' promise. (apps/mobile/stores/settingsStore.ts:170 and 174 versus apps/web/features/settings/sections/PrivacySection.tsx:717-726)
- The CLI privacy text says a temporary chat and its attachments are removed after 30 days, but the brief marks temporary chat as missing in the CLI. (apps/cli/src/claude_parity.rs:465)
- The web composer labels the same feature 'Use incognito' or 'Exit incognito', while the header says 'Temporary chat'. A person may read 'incognito' as private browsing, which is the separate, unbuilt item S41.12. (apps/web/lib/temporary-chat-policy.ts:3-5; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:495-497)
- The web attach copy says the file is deleted with the temporary chat. The purge job deletes it 30 days after the chat's creation, not when the chat ends or is closed. (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:157-158 versus apps/web/app/api/cron/purge-temporary-chats/route.ts:44-45)
- The brief's cited line for S41.07 (apps/web/app/api/llm/v1/chat/completions/route.ts:721) is research connector wiring and shows no temporary-chat check. The connector 'asks before every call' promise is in the shared text but the enforcing function was not found. (apps/web/app/api/llm/v1/chat/completions/route.ts:715-728; apps/web/lib/temporary-chat-policy.ts:22-26)
- Memory-read choice is not offered. Temporary turns always exclude memory, so 'where offered' is never met. The brief marks it done. (apps/web/lib/services/turn-context-service.ts:105-132; apps/mobile/stores/chat/chatExecutionStore.ts:2798)
- Mobile clear-all-data alert says it deletes downloaded models, but the code read deletes only the installed_models rows. Deletion of model files on disk was not seen. (apps/mobile/src/features/settings/data-controls/useEraseDeviceData.ts:12; apps/mobile/services/dsarExport.ts:440)
- Several brief line numbers point to unrelated code. ComposerPlusMenu.tsx:359 is a badge helper, not the temporary row. media-assets.ts:251 is the chat-file insert, not generated-output saving. claude_parity.rs:238/244/338 and settingsWebviewContent.ts:1271/1361/1369/1377 do not show the cited behaviour. (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:359; apps/web/lib/server/media-assets.ts:251; apps/cli/src/claude_parity.rs:238; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1361)
- Mobile chatMessageStore.ts:1158 (cited for history) is the voice-turn append, and consolidation.ts:30 (cited for local memory) is a display grouping helper. Neither stores or excludes data. (apps/mobile/stores/chat/chatMessageStore.ts:1158; apps/mobile/src/features/memory/services/consolidation.ts:30)

## Not established

- Whether the web and desktop temporary-chat state (pending choice, default setting) survives a page reload. The store persistence configuration was not read.
- Whether a temporary chat on mobile Local mode is written to the SQLite conversations table, and how it is removed. Not traced.
- Whether the web End temporary chat action deletes the chat immediately. The handler behind onEndTemporaryChat was not read.
- Whether a connector really asks before every call in a temporary chat (the withoutStandingApprovals function named in the shared policy was not located).
- Plan gates for temporary chat, saving and the Free allowance beyond the save route check. Not searched in full.
- Whether the web keep action for generated images exists in the web UI (only the API route apps/web/app/api/media/keep/route.ts was read).
- Whether the desktop app has a save-to-history path; the desktop files read were cloudChat.ts, ComposerContextControls.tsx and the settings store.
- The Chrome side of local-only conversations beyond the mirror switch: where local chats are stored in the extension was not traced.
- Whether private search or a private browser session exists anywhere under other paths; the search covered apps/web, apps/mobile/src, apps/cli/src, apps/extension-vscode/src and apps/extension/src only.
- The web and mobile translated strings (locale files) for the header and retention note were not read.
- No build, test, install or server was run. All findings come from reading the source in the read-only project folder.
