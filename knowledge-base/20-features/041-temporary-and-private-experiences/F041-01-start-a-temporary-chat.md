---
id: "F041-01"
type: "feature"
title: "Start a temporary chat"
aliases: ["Temporary chat", "Incognito", "Use incognito / Exit incognito (web + menu row)", "Start new chats as temporary (web Privacy switch)", "Temporary / Temporary: On (desktop chip)", "Enable temporary chat pill (mobile)", "New Temporary Chat (Electron File menu)", "Start a temporary chat (shared chat header button)", "isTemporary / is_temporary / incognito / pendingTemporaryChat / isTemporaryChat (code names)", "S41.01"]
area: "41 Temporary and private experiences"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "built"}
verification: {web: "seen failing", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S41.01"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "mode:local", "table:web_conversations", "api:POST /api/chat/conversations", "api:PATCH /api/chat/conversations/[id]", "store:agiworkforce-web-settings", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "SYS-authentication-and-identity", "F041-02", "F041-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F041-01 Start a temporary chat

Lets a person start a chat that AGI does not keep in history, either for one chat or as the default for all new chats. Built on web, desktop (Cloud chip, Local header button, Electron menu), mobile and the Chrome extension. Missing on CLI and VS Code.

Area: [41. Temporary and private experiences](README.md). Requirement items: [S41.01](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4101).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen failing |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Marks a chat as temporary when it is created, so its messages are never written to the saved history. A person can arm it for the next chat from the composer, or turn on a default so every new chat outside a project starts temporary (apps/web/lib/temporary-chat-policy.ts:60; apps/web/lib/hooks/useConversations.ts:640-650).

**Why it exists.** The leading assistants offer a private chat. People want to ask something sensitive or throwaway without it landing in history, search or memory. The decision record says the flag existed on the wire, the create route and the purge job, but no control could turn it on, so a control was wired (doc: docs/decisions/wire-or-cut.md, row 'Desktop temporary chats').

**Who uses it.** Any signed-in person on web, desktop, mobile or the Chrome extension who wants a conversation that is not kept.

**Problems it solves**

- A chat leaves a record in history and search that the person did not want.
- A person has to remember to switch privacy on for each chat, so a default is offered.
- Marking a chat temporary after the first message races the first save, so the flag is sent at creation (apps/web/lib/hooks/useConversations.ts:640-646).

**Use cases**

- On web, click + in the composer and choose Use incognito, then ask a private question.
- On web, open Settings, Privacy and turn on Start new chats as temporary so every new non-project chat is temporary.
- On mobile, tap the eye-off pill on the Chat tab, confirm Turn on, and chat without leaving history.
- On Electron desktop, choose File, New Temporary Chat.

## 2. User experience

**Where to find it**

- Web: + menu in the composer. The row reads 'Use incognito' (off) or 'Exit incognito' (on); while a change is saving it reads 'Temporary chat · saving…' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:192-193, 489-503).
- Web: Settings, Privacy, switch 'Start new chats as temporary' with the line 'Not saved to history or search, and deleted after 30 days. Project chats are saved.' (apps/web/features/settings/sections/PrivacySection.tsx:717-726).
- Electron desktop (public window): application menu File, 'New Temporary Chat' (apps/desktop/electron/appMenu.ts:166-169), which opens /chat with the flag armed (apps/web/shared/components/layout/WebAppShell.tsx:303-313).
- Desktop (Tauri build, internal): in Managed Cloud mode a composer chip 'Temporary' / 'Temporary: On' (apps/desktop/src/features/v3/ComposerContextControls.tsx:125-147); in Local mode a header button 'Start a temporary chat' (apps/desktop/src/features/chat/useTemporaryChat.ts; packages/ui/unified-chat/src/components/ConversationHeader.tsx:113-127).
- Mobile: Chat tab header, an eye-off icon button, accessibility label 'Enable temporary chat'; when on it shows the word 'Temporary' (apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:49-69; apps/mobile/app/(app)/(tabs)/chat.tsx:1255).
- Chrome extension side panel: attach menu item 'Temporary chat' with a check mark (apps/extension/src/side_panel.ts:14937-14966; apps/extension/_locales/en/messages.json spTemporaryChatLabel).
- CLI and VS Code: not found.

**Before you start**

- A signed-in account for the Cloud chat route [inferred from the cloud create call, apps/web/app/api/chat/conversations/route.ts].
- Not inside a project: a project chat cannot be temporary (apps/web/lib/temporary-chat-policy.ts:47-48, 60-66).
- Desktop Tauri chip: Managed Cloud mode only (apps/desktop/src/features/v3/ComposerContextControls.tsx:125).
- Chrome: only while the chat has no messages (apps/extension/src/side_panel.ts:8939-8941).

**Screens and controls**

- Web composer + menu toggle row with a short line under it 'Stays out of your history, search, memory and Library.' and a hover tooltip with the full retention note (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:489-505).
- Web 'End temporary chat' row, shown when a temporary conversation is open and no turn is running (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1846).
- Web Privacy switch with aria-label 'Start new chats as temporary'.
- Mobile pill: tapping when off opens the alert 'Turn on temporary chat?' with Cancel and Turn on; tapping when on turns it off without a question (apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:24-35).
- Desktop chip with aria-pressed; the shared header button is disabled unless the chat is empty (apps/desktop/src/features/chat/useTemporaryChat.ts).

**Journey**

1. Web, one chat: open + menu, choose Use incognito. With no conversation yet this arms a pending flag; the menu row shows checked (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1822-1826).
2. Type and send. The conversation is created with isTemporary true in the create request (apps/web/lib/hooks/useConversations.ts:640-650).
3. The server stores a conversation row marked temporary, and messages are not written to history (apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:80).
4. Web, default: turn on Start new chats as temporary; every new chat outside a project is created temporary until it is switched off.
5. Mobile: tap pill, confirm Turn on; the next new chat is created temporary; tap the pill again to end the mode for new chats.
6. To leave: use Exit incognito (web), the pill (mobile), or End temporary chat which asks first and then discards (apps/web/lib/temporary-chat-policy.ts:38-45).

**What the person sees and gets**

- Web: the menu row is checked; the header shows the 'Temporary chat' label (see F041-02).
- Web: if the write to the server fails the composer shows 'Could not change temporary chat. This conversation is still being saved normally.' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1830-1834).
- Web inside a project with the default on: notice 'Temporary chat isn't available in projects. This chat will be saved to the project.' (apps/web/lib/temporary-chat-policy.ts:53-54; used in ChatComposerNew.tsx:159).
- Server refusal text for project plus temporary: 'A temporary chat cannot be part of a project. Turn off temporary chat, or start the chat outside the project.' (apps/web/app/api/chat/conversations/route.ts:230-231).
- Web with a model on the device: the chat is always temporary and a project start is refused with "Chats with a model on this device are temporary and can't be saved in a project." (apps/web/features/chat/pages/WebChatPage.tsx:2459-2470; apps/web/lib/temporary-chat-policy.ts:50-51).
- Mobile offline send in a temporary chat: alert 'Connect to send in a temporary chat' (apps/mobile/app/(app)/chat/[id].tsx:867-871).
- Chrome: if the temporary conversation cannot be created the turn stops with 'The temporary chat could not start, so nothing was sent. Check your connection and try again.' (apps/extension/src/side_panel.ts:9163-9172; messages.json spTemporaryChatUnavailable).

**Settings**

- Web: newChatsTemporary, default false, stored in the browser (localStorage key agiworkforce-web-settings) (apps/web/shared/stores/web-settings-store.ts:71,128,159,209-211).
- Desktop Tauri: chatPreferences.temporaryChat (apps/desktop/src/stores/settings/chatPrefs.ts:11; apps/desktop/src/stores/settingsStore.ts:966-974). Read when a new cloud conversation is created, so changing it later does not change an existing chat (doc: docs/decisions/wire-or-cut.md).
- Mobile: isTemporaryChat, session only, reset to false on every launch (apps/mobile/stores/settingsStore.ts:170-175).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: pending flag, account default, composer toggle, project exclusion and server-side creation with isTemporary all exist and are connected (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1797-1846; apps/web/lib/hooks/useConversations.ts:640-650; apps/web/app/api/chat/conversations/route.ts:230-296).
- Web: switching an existing chat to temporary or back is a PATCH of isTemporary; the server refuses temporary plus project (apps/web/app/api/chat/conversations/[id]/route.ts:303-313, 455-465).
- Web: Electron File, New Temporary Chat clears the active project, arms the flag and opens a new chat (apps/web/shared/components/layout/WebAppShell.tsx:303-313; apps/desktop/electron/appMenu.ts:166-169).
- Web: a chat with a model on the device is forced temporary (apps/web/features/chat/pages/WebChatPage.tsx:2464-2470).
- Desktop Tauri Managed Cloud: chip sets a preference that is passed as isTemporary when a cloud conversation is created (apps/desktop/src/services/cloudChat.ts:229-236, 244-290; apps/desktop/src/runtime/CloudRuntime.ts:1020-1027).
- Desktop Tauri Local: header button creates an incognito conversation that is never written to SQLite or renderer storage (apps/desktop/src/features/chat/useTemporaryChat.ts; apps/desktop/src/runtime/TauriRuntime.ts:775-779; apps/desktop/src/stores/chat/chatStore.ts:1590-1600).
- Mobile: pill and confirmation alert set isTemporaryChat; new Cloud conversations are created with isTemporary, new Local conversations get temporary true and are left out of persisted storage (apps/mobile/stores/chat/chatMessageStore.ts:1969-1984, 2065; 1735-1737).
- Chrome extension: menu item starts a temporary chat and the first send creates a Cloud conversation with isTemporary true (apps/extension/src/side_panel.ts:8939-8946, 9078-9087, 9163-9172).

**Incomplete**

- Mobile: the setting is not stored across launches by design; it is a global flag that stays on for later new chats until turned off (apps/mobile/stores/settingsStore.ts:170-175).
- Mobile: no check or message found for a chat that has a project and is temporary; the server refuses the create (apps/web/app/api/chat/conversations/route.ts:230-231) but the phone-side handling of that refusal was not found (unknown).
- Web: turning temporary ON in a chat that already has saved messages only flips the flag; no 'Save this chat?' question appears in that direction. The question appears when turning it OFF (apps/web/features/chat/pages/WebChatPage.tsx:4969-4990). The first draft had this reversed.
- Web default switch is stored only in the browser, so it does not follow the person to another browser or device (apps/web/shared/stores/web-settings-store.ts:209-211); whether any other sync exists was not found (unknown).
- Desktop Tauri Local header button works only on an empty chat (apps/desktop/src/features/chat/useTemporaryChat.ts).

**Present but disconnected or switched off**

- packages/ui/unified-chat and apps/mobile agentControlStore each carry a temporaryChat field in a per-project default (packages/ui/unified-chat/src/stores/agentControlStore.ts:8-12,141; apps/mobile/stores/agentControlStore.ts:13-17,97); whether any screen reads it to start chats temporary was not found (unknown).

**Not available**

- CLI: no temporary-chat control found (search of apps/cli/src for temporary/incognito found only a retention text line, apps/cli/src/claude_parity.rs:465).
- VS Code extension: no temporary-chat control found (no match in apps/extension-vscode/src).
- The brief lists Chrome as missing; the code has a temporary chat in the Chrome side panel (apps/extension/src/side_panel.ts:8939), so the brief is out of date for Chrome.
- Mobile has no per-chat switch inside an open chat, only the Chat tab pill (apps/mobile/app/(app)/(tabs)/chat.tsx:1255).

## 4. Required behaviour

**Established requirements**

- The user can start a temporary chat, or make new chats temporary by default, from the chat surface. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S41.01)
- Temporary/private chats are clearly marked if supported. (source: doc: docs/product/requirements.md:894)
- The default is off unless the setting is on; a project chat cannot be temporary. (source: apps/web/lib/temporary-chat-policy.ts:60-66)
- Turning temporary on is sent at creation, not applied afterwards. (source: apps/web/lib/hooks/useConversations.ts:640-646)
- The flag is read at creation, so toggling it later cannot change an existing chat's retention (desktop chip). (source: doc: docs/decisions/wire-or-cut.md (row Desktop temporary chats))

**Acceptance criteria**

1. On web with the default off, a new chat started from + menu Use incognito is created with isTemporary true and its messages never appear in history or search.
2. On web with Start new chats as temporary on, a new chat outside a project is temporary; the same in a project is saved to the project and shows the project notice.
3. Creating or patching a chat with a project and isTemporary true is refused with the project refusal text.
4. If the PATCH that changes the flag fails, the menu row does not show a mode the database does not hold, and the composer notice appears.
5. On mobile, after an app restart the pill is off.
6. On mobile, turning on shows 'Turn on temporary chat?' and Cancel leaves it off.
7. On Electron desktop, File, New Temporary Chat opens a new chat that is temporary even if a project was active.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Plan limits: none found in these paths, so the feature is available on every plan [inferred from absence].
- The pending flag is consumed when a real conversation becomes active [inferred from web-chat-store test name and apps/web/shared/stores/web-chat-store.ts:1379].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store the web default on the account so it follows the person to every browser and to the phone.
- [proposed] Add a temporary-chat control to CLI and VS Code or record a decision to cut them.
- [proposed] Show on mobile what the server did when a project plus temporary create is refused.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | temporary-chat-policy | `apps/web/lib/temporary-chat-policy.ts` | Labels, refusal texts, resolveNewChatTemporary, temporaryChatAllowedIn. |
| component | ComposerPlusMenu TemporaryChatRows | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | The Use incognito / Exit incognito toggle row, the explanation line and End temporary chat row. |
| component | ChatComposerNew incognito logic | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Computes isIncognito, arms pendingTemporaryChat, calls onSetTemporaryChat, shows failure notice. |
| screen | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | temporaryIntent at send (2459-2470), handleSetTemporaryChat (4969), header label. |
| store | web-chat-store pendingTemporaryChat | `apps/web/shared/stores/web-chat-store.ts` | One-off armed choice (null inherits the default) and temporaryChatPersonalized. |
| store | web-settings-store newChatsTemporary | `apps/web/shared/stores/web-settings-store.ts` | Account-wide default switch, kept in browser localStorage. |
| screen | PrivacySection | `apps/web/features/settings/sections/PrivacySection.tsx` | Start new chats as temporary switch. |
| hook | useConversations createConversation | `apps/web/lib/hooks/useConversations.ts` | Sends isTemporary at creation. |
| endpoint | POST /api/chat/conversations | `apps/web/app/api/chat/conversations/route.ts` | Creates the row with is_temporary; refuses project plus temporary. |
| endpoint | PATCH /api/chat/conversations/[id] | `apps/web/app/api/chat/conversations/[id]/route.ts` | Changes is_temporary on an existing chat; refuses temporary plus project; marks image/video jobs temporary. |
| table | web_conversations.is_temporary | `apps/web/db/neon/0050_temporary_chat_retention.sql` | Boolean column and partial index on created_at for the purge. |
| hook | use-temporary-chat (Electron menu) | `apps/web/features/desktop-host/hooks/use-temporary-chat.ts` | Handles the new-temporary-chat app command in the desktop host. |
| command | New Temporary Chat menu item | `apps/desktop/electron/appMenu.ts` | Sends the new-temporary-chat host command. |
| component | WebAppShell new-temporary-chat handler | `apps/web/shared/components/layout/WebAppShell.tsx` | Clears the active project, arms the flag, opens /chat. |
| component | ComposerContextControls Temporary chip | `apps/desktop/src/features/v3/ComposerContextControls.tsx` | Tauri desktop Cloud-mode chip. |
| service | cloudChat ensureCloudConversation | `apps/desktop/src/services/cloudChat.ts` | Passes isTemporary to cloud create and remembers temporary conversation ids. |
| hook | useTemporaryChatControl | `apps/desktop/src/features/chat/useTemporaryChat.ts` | Local-mode header switch creating an incognito conversation. |
| component | ConversationHeader | `packages/ui/unified-chat/src/components/ConversationHeader.tsx` | Shared header button 'Start a temporary chat'. |
| component | TemporaryChatToggle | `apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx` | Mobile pill and confirmation alert. |
| store | mobile settingsStore isTemporaryChat | `apps/mobile/stores/settingsStore.ts` | Session-only flag, dropped from persistence. |
| store | mobile chatMessageStore conversation creation | `apps/mobile/stores/chat/chatMessageStore.ts` | Creates Cloud conversations with isTemporary and Local ones with temporary; excludes temporary from persisted local storage. |
| component | Chrome side panel temporary chat | `apps/extension/src/side_panel.ts` | startTemporaryChat, ensureTemporaryConversation, menu item and notice. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person arms temporary (menu row, default switch, File menu, pill, chip). | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1822-1826; apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:24-35 |
| On first send the client decides temporary from the pending choice, the default and the project, and sends isTemporary true in the conversation create request. | device | apps/web/lib/temporary-chat-policy.ts:60-66; apps/web/lib/hooks/useConversations.ts:640-650 |
| The server validates (project plus temporary refused) and inserts the web_conversations row with is_temporary. | our servers | apps/web/app/api/chat/conversations/route.ts:230-296 |
| Each turn re-reads is_temporary from the conversation row; a temporary conversation's messages are not persisted and memory, past chats, file search, schedules and plugin drafts are not offered. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4081-4090, 4126-4135, 1123-1147 |
| The turn is answered by the chosen model through the chat route; for a device model on web the chat is forced temporary and answered on the device. | device and our servers | apps/web/features/chat/pages/WebChatPage.tsx:2464-2470; apps/web/lib/hooks/useChatStream.ts:4460-4470 |
| A nightly job deletes temporary conversations older than 30 days (see F041-05). | our servers | apps/web/app/api/cron/purge-temporary-chats/route.ts:24; vercel.json:26-27 |
| Desktop Tauri Local: the chat id -1 is used for the native runtime, nothing is written to SQLite. | device | apps/desktop/src/runtime/TauriRuntime.ts:419, 775-779 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation row with is_temporary true (title, model, ids) | table web_conversations on our servers | Excluded from history list, search and the sync pull (apps/web/app/api/chat/conversations/route.ts:81; apps/web/app/api/search/route.ts:324,375; apps/web/app/api/chat/sync/route.ts:131,148) | Deleted by the purge job 30 days after created_at unless a legal hold applies (apps/web/app/api/cron/purge-temporary-chats/route.ts:42-90) |
| Web default newChatsTemporary | browser localStorage (store:agiworkforce-web-settings) | Not synced in the code found | Until browser data is cleared |
| Mobile isTemporaryChat | memory only; stripped from the persisted settings | No | Reset at launch (apps/mobile/stores/settingsStore.ts:170-175) |
| Desktop chatPreferences.temporaryChat | desktop settings store | Unknown | Kept as a setting |

**Models and providers.** The feature does not choose a model. Temporary only changes what is kept; the turn runs on whatever model and provider the person picked. A chat with a model on the device (web) is forced temporary and runs on the device (apps/web/features/chat/pages/WebChatPage.tsx:2464-2470). Whether the outside provider keeps a record is not set by this feature; the support page says a connector keeps its own record (doc: apps/web/content/support/temporary-chats.md).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, mobile and Chrome create the temporary chat on the Cloud service, so a signed-in account is needed for the Cloud path. Web device-model chats and desktop Local chats keep nothing on our servers. Sign-in for a device-only chat: unknown. |
| Permissions | The server scopes by user and workspace (user_id, organization_id) in every query (apps/web/app/api/chat/conversations/[id]/keep/route.ts:78-88 shows the pattern). No separate role check for the flag found. |
| Subscription | No plan gate found on starting a temporary chat in these files (searched the create, patch, composer and policy files). |
| Limits and metering | None specific to starting. Turns are still metered like other chat turns [inferred, not traced]. |
| Feature flags | No feature flag found for the web path. Mobile Cloud chat creation needs isCloudChatEnabled (apps/mobile/stores/chat/chatMessageStore.ts:1962-1964). Desktop chip needs Managed Cloud mode. |
| Model compatibility | Not model dependent in the code found. |
| Provider restrictions | none found in the code |
| Local mode | Web: a device-model turn is always temporary (apps/web/features/chat/pages/WebChatPage.tsx:2464). Desktop Tauri Local: the header switch makes an incognito chat never written to SQLite (apps/desktop/src/runtime/TauriRuntime.ts:775-779). Mobile Local: the new local conversation gets temporary true and is dropped from persisted storage (apps/mobile/stores/chat/chatMessageStore.ts:1735-1737, 2065). No paid subscription is checked on these paths. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Toggle while a turn is running or a save is in flight | The toggle is disabled while a turn is active, the composer is disabled or a save is running | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1839-1843 |
| Write fails (web) | Composer notice 'Could not change temporary chat. This conversation is still being saved normally.'; the store is only updated from the server value | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1827-1835; apps/web/features/chat/pages/WebChatPage.tsx:4955-4962 |
| Project chat | Temporary preference is set aside; server refuses temporary plus project | apps/web/lib/temporary-chat-policy.ts:60-66; apps/web/app/api/chat/conversations/route.ts:230-231 |
| Unsent draft in a temporary chat | Web clears the stored draft instead of saving it; server clears draft for temporary rows | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4120-4125; apps/web/app/api/chat/conversations/[id]/route.ts:223-225 |
| Offline (mobile) | Sending in a temporary chat is refused with an alert; the draft stays | apps/mobile/app/(app)/chat/[id].tsx:867-871 |
| Leaving the chat (desktop Tauri Local) | Temporary conversations are discarded when the user leaves them | apps/desktop/src/stores/chat/chatStore.ts:110-122 |
| Chrome leaving an empty temporary chat with text typed | Stays, with 'Send or clear your draft before leaving Temporary Chat.' | apps/extension/src/side_panel.ts:8948-8953 |
| Accessibility | Mobile pill has label, hint and selected state; desktop chip uses aria-pressed; web Privacy switch has an aria-label; menu row is a switch row | apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:46-52; apps/desktop/src/features/v3/ComposerContextControls.tsx:129 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/__tests__/temporary-chat-policy.test.ts`: A new chat in a project is never temporary; outside a project the armed choice and default are kept.
- `apps/web/features/chat/components/Composer/ChatComposerNew.temporaryChat.test.tsx`: Arming before a conversation exists, the Use incognito row, toggling off, on-screen explanation, End temporary chat confirmation.
- `apps/web/features/settings/sections/__tests__/PrivacySection.temporary-switch.test.tsx`: The default switch turns the preference on.
- `apps/web/features/settings/sections/__tests__/temporary-by-default.test.ts`: The preference is sent at creation, nothing extra when off, read at call time, accessible switch.
- `apps/web/shared/stores/__tests__/web-chat-store.pending-temporary.test.ts`: pendingTemporaryChat default, arm, disarm, survival and consumption.
- `apps/web/features/desktop-host/__tests__/TemporaryChat.test.tsx`: File New Temporary Chat arms the flag and opens /chat.
- `apps/web/__tests__/api/chat-conversations.test.ts`: Create refuses project plus temporary with the refusal text.
- `apps/web/__tests__/api/chat-conversation-single.test.ts`: Patch refuses temporary plus project.
- `apps/web/features/chat/pages/__tests__/WebChatPage.local-model-project.test.tsx`: Local model chat and project refusal (file named for it; contents not fully read).
- `apps/mobile/__tests__/TemporaryChatBanner.test.tsx`: Asks before turning on and names what it does; turns off in place.
- `apps/mobile/__tests__/SettingsStore.test.tsx`: isTemporaryChat defaults false, setter, restarts in a normal chat.
- `apps/mobile/__tests__/upload-context.test.ts`: Temporary conversation versus new-chat preference for uploads.
- `apps/desktop/src/runtime/__tests__/TauriRuntime.localHistory.test.ts`: A temporary chat stays out of SQLite and memory.
- `apps/desktop/src/stores/chat/__tests__/chatStore.localPersistence.test.ts`: Temporary chats are never written to renderer storage.

**Test scenarios**

- **Web one-off temporary chat**
  1. Sign in on web with the default off.
  2. Open + menu, choose Use incognito.
  3. Send a message.
  4. Open History and search for the text.
  - Expected: The row shows checked, the header shows Temporary chat, and the chat is in neither history nor search.
- **Web default in a project**
  1. Turn on Start new chats as temporary.
  2. Open a project and start a chat.
  - Expected: The chat is saved to the project and the notice 'Temporary chat isn't available in projects. This chat will be saved to the project.' shows.
- **Server refusal**
  1. PATCH a conversation with both projectId and isTemporary true.
  - Expected: Validation error with the project refusal text.
- **Mobile restart**
  1. Tap the pill, confirm Turn on.
  2. Kill and relaunch the app.
  - Expected: The pill is off and the next chat is normal.
- **Electron menu**
  1. Open a project chat in the Electron desktop.
  2. Choose File, New Temporary Chat.
  - Expected: A new chat opens outside the project and is temporary.
- **Chrome side panel**
  1. Open an empty side panel.
  2. Choose Temporary chat in the attach menu and send.
  - Expected: The notice shows and a conversation with is_temporary true exists server side.

**Where to look when it fails**

- Check web_conversations.is_temporary for the chat id.
- Server error text 'A temporary chat cannot be part of a project...' means the project rule fired.
- Web console/network: POST /api/chat/conversations body should include isTemporary true.
- Chrome: look for 'spTemporaryChatUnavailable' text when creation fails.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/041-temporary-and-private-experiences.md](../../70-qa/test-plans/web/041-temporary-and-private-experiences.md)
- Desktop: [70-qa/test-plans/desktop/041-temporary-and-private-experiences.md](../../70-qa/test-plans/desktop/041-temporary-and-private-experiences.md)
- Mobile: [70-qa/test-plans/mobile/041-temporary-and-private-experiences.md](../../70-qa/test-plans/mobile/041-temporary-and-private-experiences.md)
- Chrome: [70-qa/test-plans/chrome/041-temporary-and-private-experiences.md](../../70-qa/test-plans/chrome/041-temporary-and-private-experiences.md)

## 10. Gaps and dependencies

- **Brief says Chrome has no temporary chat; code has one. The brief and the first draft are wrong for Chrome.** Affects: Chrome extension; any status report built from the brief. Evidence: apps/extension/src/side_panel.ts:8939-8946. Work needed: Update the brief and parity table; add Chrome tests for the menu item.
- **Web default switch lives only in browser storage.** Affects: Web people using several browsers or devices. Evidence: apps/web/shared/stores/web-settings-store.ts:209-211. Work needed: Decide whether to store it on the account.
- **CLI and VS Code have no control.** Affects: CLI, VS Code. Evidence: No match in apps/cli/src or apps/extension-vscode/src. Work needed: Build or cut by decision.
- **Mobile has only a global pill, no per-chat control, and the setting resets each launch.** Affects: Mobile. Evidence: apps/mobile/stores/settingsStore.ts:170-175. Work needed: Decide whether session-only is the intended rule and document it.
- **Desktop Tauri has no first-class way to save a temporary chat or a header switch in Cloud mode.** Affects: Desktop Tauri build. Evidence: apps/desktop/src/features/v3/ComposerContextControls.tsx:119-147. Work needed: Confirm Tauri parity target given the public Desktop is the hosted web app (AGENTS.md section 5).
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- mode:local
- table:web_conversations
- api:POST /api/chat/conversations
- api:PATCH /api/chat/conversations/[id]
- store:agiworkforce-web-settings
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- SYS-authentication-and-identity
- F041-02
- F041-06

## Unknown

- Whether the web default switch is synced anywhere besides localStorage.
- How the phone app shows the server refusal when a project chat is created while temporary is on.
- Whether any screen reads agentControlStore.temporaryChat on web, desktop or mobile.
- Whether sign-in is required for a device-model temporary chat on web.
- Whether the Tauri native runtime really skips memory for chat id -1 (only the TypeScript comment and a TS test were read).
- Whether the first draft's claim that turning temporary on in a chat with messages asks Save this chat? has any code path (none found).
