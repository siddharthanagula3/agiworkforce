---
id: "F012-08"
type: "feature"
title: "Temporary chat"
aliases: ["Temporary chat", "Use incognito / Exit incognito (web menu row labels)", "incognito", "isTemporary", "pendingTemporaryChat", "Start new chats as temporary", "New Temporary Chat (desktop menu)", "--no-session-persistence (CLI)", "S12.17"]
area: "12 New-chat experience"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S12.17"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "surface:cli", "table:web_conversations", "SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "F012-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F012-08 Temporary chat

Lets a person make a chat that is not kept in history, search or memory. Web shows a plus-menu row ('Use incognito'), mobile shows an eye-off header toggle, Chrome a menu item, desktop a 'New Temporary Chat' menu entry, the CLI a no-persistence flag. Projects cannot hold temporary chats. Cloud copies are purged after 30 days.

Area: [12. New-chat experience](README.md). Requirement items: [S12.17](../../10-requirements/capabilities/012-new-chat-experience.md#s1217).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Marks the next or current chat as temporary. A temporary chat is created with isTemporary true, its messages are not written to history, it is excluded from search and memory, and its attachments stay out of the Library. (apps/web/lib/temporary-chat-policy.ts:21-33)

**Why it exists.** The brief requires that before or during a new chat the user can switch it to a temporary chat not kept in history (doc: knowledge-base/data/area-briefs/012-new-chat-experience.md, S12.17). The requirements say temporary chats must not read or update memory (doc: docs/product/requirements.md:765). A founder decision says temporary chats keep no 30-day safety copy (doc: docs/decisions/2026-09-27-founder-decisions.md, D-2026-09-28-05).

**Who uses it.** Anyone asking something private or one-off on web, desktop, mobile, Chrome or the CLI.

**Problems it solves**

- Private questions should not clutter history or feed memory.
- People need a clear promise of what is and is not kept.
- People can change their mind: save a temporary chat, or end it with a warning.

**Use cases**

- Turn on 'Use incognito' from the web plus menu before the first message.
- Turn on 'Start new chats as temporary' in Privacy settings so every new chat starts temporary.
- On mobile tap the eye-off icon, confirm 'Turn on temporary chat?', then chat.
- Midway through, turn it off on web and choose 'Save chat' to keep the messages.

## 2. User experience

**Where to find it**

- Web: composer plus menu row labelled 'Use incognito' (becomes 'Exit incognito' when on) with the line 'Stays out of your history, search, memory and Library.' and, inside an open temporary chat, an 'End temporary chat' row (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:470) (apps/web/lib/temporary-chat-policy.ts:1-5).
- Web settings: Privacy section switch 'Start new chats as temporary' (apps/web/features/settings/sections/PrivacySection.tsx:717).
- Desktop: app menu item 'New Temporary Chat' (apps/desktop/electron/appMenu.ts:167) plus the same web composer row.
- Mobile: eye-off toggle in the chat header, label 'Enable temporary chat' / 'Temporary chat active', shows the word 'Temporary' when on (apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:29).
- Chrome: attach-menu checkbox item 'Temporary chat' (apps/extension/src/side_panel.ts:14937).
- CLI: --no-session-persistence flag (apps/cli/src/lib.rs:433). The brief lists the CLI as done; no in-chat toggle was found (see gaps).
- VS Code: none (brief: missing).

**Before you start**

- Web: the chat is not in a project. Inside a project the row is not offered, and a notice says 'Temporary chat isn't available in projects. This chat will be saved to the project.' (apps/web/lib/temporary-chat-policy.ts:53).
- Toggling mid-chat on web needs the host to supply onSetTemporaryChat and no turn running (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1840).
- Chrome: chat must be empty to start one and a managed cloud account is needed (apps/extension/src/side_panel.ts:8939).

**Screens and controls**

- Web plus-menu toggle row, explanation text, 'End temporary chat' row, confirm dialog titled 'End this temporary chat?' with 'End and discard' (apps/web/lib/temporary-chat-policy.ts:38).
- Web 'Save this chat?' dialog with 'Save chat' when turning it off after messages exist (apps/web/features/chat/pages/WebChatPage.tsx:4988).
- Mobile alert 'Turn on temporary chat?' with Cancel / 'Turn on' (apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:29).
- Chrome banner with 'Turn off' / 'End temporary chat' / 'End and discard' / 'Keep chatting' (apps/extension/_locales/en/messages.json:2246).

**Journey**

1. Open a new chat outside any project.
2. Open the plus menu and choose 'Use incognito'; with no conversation yet the flag is stored as pendingTemporaryChat (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1816).
3. Type and send; the page reads the flag and creates the conversation with isTemporary true (apps/web/features/chat/pages/WebChatPage.tsx:2464).
4. Replies stream but nothing is written to history; titles stay on the device (apps/web/features/chat/pages/WebChatPage.tsx:5040).
5. To keep it, choose 'Exit incognito' and confirm 'Save chat'; to leave, choose 'End temporary chat' and confirm 'End and discard'.

**What the person sees and gets**

- Web: checkmark appears only after the server holds the flag; on failure the notice 'Could not change temporary chat. This conversation is still being saved normally.' shows (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1832).
- Web: toast 'Chat saved to your history.' or an error toast 'This chat could not be saved.' (apps/web/features/chat/pages/WebChatPage.tsx:5003).
- Mobile: purple 'Temporary' pill; explanation differs for Cloud ('Won't appear in history or use memory, and is normally deleted after 30 days.') and Local ('Won't be saved or use memory, and attachments never leave this device.') (apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:12).
- Chrome: 'The temporary chat could not start, so nothing was sent. Check your connection and try again.'

**Settings**

- Web newChatsTemporary (default false) (apps/web/shared/stores/web-settings-store.ts:128).
- Mobile isTemporaryChat is session-only: it is left out of persistence and reset (apps/mobile/stores/settingsStore.ts:170).
- Mobile temporaryChatPersonalized switch ('Personalized' / 'Unpersonalized') (apps/mobile/stores/chat/chatExecutionStore.ts:3453).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web policy helpers decide availability: temporaryChatAllowedIn is true only when no project is chosen (apps/web/lib/temporary-chat-policy.ts:56).
- Web plus menu row, mid-chat PATCH through onSetTemporaryChat, keep-and-save dialog, end dialog (apps/web/features/chat/pages/WebChatPage.tsx:4969).
- A new chat in a project drops the 'new chats temporary' preference and tells the person (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5327).
- Persisted draft is cleared, not written, while the chat is temporary (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4118).
- Database column web_conversations.is_temporary and a purge cron that removes temporary chats older than 30 days, skipping legal holds (apps/web/db/neon/0050_temporary_chat_retention.sql:7) (apps/web/app/api/cron/purge-temporary-chats/route.ts:24).
- Mobile cloud conversations are created with isTemporary (apps/mobile/stores/chat/chatMessageStore.ts:1969) and memory is skipped (apps/mobile/stores/chat/chatExecutionStore.ts:2798).
- Desktop 'New Temporary Chat' menu command arms the flag and opens /chat (apps/web/features/desktop-host/hooks/use-temporary-chat.ts:17).
- Chrome creates its conversation with isTemporary true and skips history (apps/extension/src/side_panel.ts:9078).

**Incomplete**

- Brief says Chrome is missing temporary chat, but the code has it; the brief is out of date (apps/extension/src/side_panel.ts:14937).
- CLI has no in-chat toggle found; only a startup flag that disables session persistence (apps/cli/src/lib.rs:433).

**Present but disconnected or switched off**

- Desktop task dispatch applies newChatsTemporary to dispatched tasks (apps/web/features/desktop-host/hooks/use-dispatch-task-runner.ts:93).

**Not available**

- VS Code has no temporary chat (brief: missing).
- Temporary chat inside projects is not available on web (apps/web/lib/temporary-chat-policy.ts:56).

## 4. Required behaviour

**Established requirements**

- Before or during a new chat the user can switch it to a temporary chat that is not kept in history. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S12.17)
- Not allowed in some project contexts: the composer only offers it when temporaryChatAllowedIn(project) holds. (source: S12.17 brief 'Should' text and apps/web/lib/temporary-chat-policy.ts:56)
- If a temporary chat is turned off mid-chat the change is applied to the saved conversation (onSetTemporaryChat). (source: S12.17 brief)
- Temporary chats are marked isTemporary on the conversation. (source: S12.17 brief; apps/web/features/chat/pages/WebChatPage.tsx:2666)
- Temporary chats must not update or reference memory unless the user explicitly asks. (source: doc: docs/product/requirements.md:765)
- Temporary chats keep no 30-day copy for safety review. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-05))

**Acceptance criteria**

1. Outside a project, the plus menu shows 'Use incognito'; inside a project it does not.
2. A chat created after arming it has isTemporary true and does not appear in history or search.
3. Turning it off in a chat with messages asks 'Save this chat?' and, on 'Save chat', the messages appear in history.
4. If the server refuses the change, the notice appears and the checkmark does not.
5. 'End temporary chat' asks for confirmation naming that the messages are lost.
6. With 'Start new chats as temporary' on, a new chat outside a project starts temporary; in a project it is saved.
7. A temporary chat older than 30 days is removed by the purge job unless on legal hold.
8. Mobile: the toggle shows 'Temporary' and the next cloud conversation is created temporary.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Connectors ask before every call in temporary chats (stated in the retention note) [inferred: note text only; enforced by withoutStandingApprovals per comment in policy file].
- Mobile Local temporary chats are never uploaded [inferred from the banner text].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an in-chat temporary toggle or command to the CLI, or document --no-session-persistence as the CLI form.
- [proposed] Update the brief status for Chrome to built.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | temporary-chat-policy | `apps/web/lib/temporary-chat-policy.ts` | Labels, retention note and the project rule (temporaryChatAllowedIn, resolveNewChatTemporary). |
| component | TemporaryChatRows in ComposerPlusMenu | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Toggle row, explanation line and End row (line 470). |
| component | ChatComposerNew temporary logic | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | handleIncognitoToggle, canToggleIncognito, end dialog, project set-aside notice (lines 1789-1846, 5327). |
| screen | WebChatPage temporary handling | `apps/web/features/chat/pages/WebChatPage.tsx` | temporaryIntent at send, handleSetTemporaryChat, keep-and-save flow (lines 2464, 2666, 4969). |
| store | web chat store pendingTemporaryChat | `apps/web/shared/stores/web-chat-store.ts` | Holds the armed flag before a conversation exists (test exists). |
| store | web settings store newChatsTemporary | `apps/web/shared/stores/web-settings-store.ts` | Default for new chats (line 71, 128, 159). |
| component | PrivacySection switch | `apps/web/features/settings/sections/PrivacySection.tsx` | 'Start new chats as temporary' setting (line 717). |
| table | web_conversations.is_temporary | `apps/web/db/neon/0050_temporary_chat_retention.sql` | Column and index for temporary chats. |
| job | purge-temporary-chats cron | `apps/web/app/api/cron/purge-temporary-chats/route.ts` | Deletes temporary chats older than 30 days in batches; honours legal holds. |
| service | temporary file purge | `apps/web/lib/server/temporary-files/purge.ts` | Removes files of temporary chats. |
| hook | useTemporaryChat (desktop host) | `apps/web/features/desktop-host/hooks/use-temporary-chat.ts` | Reacts to the 'new-temporary-chat' command and arms the flag. |
| command | New Temporary Chat menu item | `apps/desktop/electron/appMenu.ts` | Electron menu entry that sends the host command (line 167). |
| component | TemporaryChatToggle | `apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx` | Mobile header toggle with confirm alert. |
| component | TemporaryChatBanner | `apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx` | Explainer strings and personalization switch. |
| store | mobile settingsStore isTemporaryChat | `apps/mobile/stores/settingsStore.ts` | Session-only flag (not persisted). |
| store | mobile chatMessageStore createConversation | `apps/mobile/stores/chat/chatMessageStore.ts` | Creates the cloud conversation with isTemporary (line 1969). |
| component | Chrome temporary item and banner | `apps/extension/src/side_panel.ts` | startTemporaryChat, renderTemporaryChatState, ensureTemporaryConversation (lines 8939, 9078, 14937). |
| config | --no-session-persistence flag | `apps/cli/src/lib.rs` | CLI privacy opt-out for saved sessions (line 433). |
| service | session persistence policy | `apps/cli/src/cli_options.rs` | Process-wide flag that stops managed-session writes (line 243). |
| test | ChatComposerNew.temporaryChat.test | `apps/web/features/chat/components/Composer/ChatComposerNew.temporaryChat.test.tsx` | Composer temporary behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks 'Use incognito'; with no conversation yet the composer stores pendingTemporaryChat true. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1819 |
| On send the page resolves temporaryIntent (project must be empty) and creates the conversation with isTemporary. | device and our servers | apps/web/features/chat/pages/WebChatPage.tsx:2464 |
| The server writes the conversation row with is_temporary true, refuses message persistence for it, filters it from search and retrieval, and leaves memory out of the turn. | our servers | apps/web/lib/temporary-chat-policy.ts:21-33 |
| Turning it off mid-chat: the host performs an update (PUT /api/chat/conversations/:id) and writes the server value back; with kept messages it first saves them after a confirm. | device and our servers | apps/web/features/chat/pages/WebChatPage.tsx:4958 |
| A nightly cron deletes temporary chats and files older than 30 days unless on legal hold. | our servers | apps/web/app/api/cron/purge-temporary-chats/route.ts:24 |
| Mobile Local mode: the chat stays on the device; Cloud mode creates the conversation remotely with isTemporary. | device and our servers | apps/mobile/stores/chat/chatMessageStore.ts:1969 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Temporary conversation row | Table web_conversations, column is_temporary | Server side; excluded from search, retrieval index and sync pull per policy comment | Purged after 30 days by cron; user can end it |
| Armed flag pendingTemporaryChat | In-memory chat store | No | Cleared after use or end |
| newChatsTemporary preference | Web settings store | unknown | Until changed |
| Mobile isTemporaryChat | Mobile settings store, not persisted | No | Reset each launch |
| Chrome draft for temporary chat | Not stored; draft key is null while temporary | No | n/a (apps/extension/src/side_panel.ts:10123) |

**Models and providers.** Temporary chat does not choose a model. In the temporary web chat, titles stay on the device (apps/web/features/chat/pages/WebChatPage.tsx:5040). Mobile Local chats run on-device with no provider; Cloud chats use the selected managed model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, Chrome and mobile Cloud: signed in. Mobile Local and CLI: none for the flag itself. |
| Permissions | none found in the code beyond conversation ownership. |
| Subscription | none found in the code; temporary chat is not gated by a plan. |
| Limits and metering | Retention 30 days (RETENTION_DAYS) (apps/web/app/api/cron/purge-temporary-chats/route.ts:24). Turns in a temporary chat still use model quota: not checked (unknown). |
| Feature flags | The cron needs cron authentication (apps/web/app/api/cron/purge-temporary-chats/route.ts:31). No feature flag found for the toggle. |
| Model compatibility | No model restriction found. A local model chat is always temporary and cannot be saved in a project (apps/web/lib/temporary-chat-policy.ts:51). |
| Provider restrictions | none found in the code. |
| Local mode | Web: chats with a model on this device are temporary and cannot be saved in a project. Mobile Local: nothing saved or used for memory, attachments never leave the device (apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:14). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Project chosen | Row not offered; preference set aside with a notice. | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5327 |
| Turn in progress or saving | Toggle disabled. | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1840 |
| Server write fails | Notice shown; checkmark not set. | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1832 |
| Mid-sentence arm | Persisted draft is cleared. | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4118 |
| Share a temporary chat | Refused with 'A temporary chat cannot be shared...'. | apps/web/lib/temporary-chat-policy.ts:11 |
| Chrome start fails | Message that nothing was sent. | apps/extension/_locales/en/messages.json:2266 |
| Chrome has messages | Start item hidden; end needs confirm. | apps/extension/src/side_panel.ts:8923 |
| Mobile app restart | Flag resets to off. | apps/mobile/stores/settingsStore.ts:170 |
| Offline / timeout | not handled in the code beyond failure notices. | searched ChatComposerNew.tsx, none found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/__tests__/temporary-chat-policy.test.ts`: Policy helpers.
- `apps/web/features/chat/components/Composer/ChatComposerNew.temporaryChat.test.tsx`: Composer toggle behaviour.
- `apps/web/shared/stores/__tests__/web-chat-store.pending-temporary.test.ts`: pendingTemporaryChat store.
- `apps/web/features/settings/sections/__tests__/PrivacySection.temporary-switch.test.tsx`: Settings switch.
- `apps/web/features/settings/sections/__tests__/temporary-by-default.test.ts`: New chats temporary by default.
- `apps/web/features/desktop-host/__tests__/TemporaryChat.test.tsx`: Desktop command arms the flag and opens /chat.
- `apps/web/app/api/chat/conversations/route.temporary-history.test.ts`: Temporary chats absent from history.
- `apps/web/app/api/cron/purge-temporary-chats/route.test.ts`: Purge job.
- `apps/mobile/__tests__/TemporaryChatBanner.test.tsx`: Mobile banner and toggle copy.
- `apps/extension/__tests__/composer-admission-retention.test.ts`: Chrome temporary chat retention rules (mentions temporaryChat).

**Test scenarios**

- **Arm before first send**
  1. Open a new chat outside a project.
  2. Plus menu, 'Use incognito'.
  3. Send a message.
  4. Open history.
  - Expected: Chat is not in history; conversation has isTemporary true.
- **Project blocks it**
  1. Pick a project in the picker.
  2. Open the plus menu.
  - Expected: No incognito row; the saved-to-project notice shows if the preference is on.
- **Save mid-chat**
  1. Chat temporarily for two messages.
  2. Choose 'Exit incognito'.
  3. Confirm 'Save chat'.
  - Expected: Toast 'Chat saved to your history.' and the chat is in history.
- **Server refuses toggle**
  1. Block the PUT request in dev tools.
  2. Toggle off.
  - Expected: Notice 'Could not change temporary chat...' and still temporary.
- **Mobile toggle**
  1. Tap the eye-off icon.
  2. Choose 'Turn on'.
  3. Send in Cloud mode.
  - Expected: 'Temporary' pill; cloud conversation marked temporary; restart resets it.
- **Purge**
  1. Seed a temporary chat older than 30 days.
  2. Call the cron with auth.
  - Expected: Row and files removed; held rows kept.

**Where to look when it fails**

- Cron logs 'Unauthorized cron request' and purge counts (apps/web/app/api/cron/purge-temporary-chats/route.ts:33).
- Table web_conversations.is_temporary.
- Composer notice 'Could not change temporary chat...'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/012-new-chat-experience.md](../../70-qa/test-plans/web/012-new-chat-experience.md)
- Desktop: [70-qa/test-plans/desktop/012-new-chat-experience.md](../../70-qa/test-plans/desktop/012-new-chat-experience.md)
- Mobile: [70-qa/test-plans/mobile/012-new-chat-experience.md](../../70-qa/test-plans/mobile/012-new-chat-experience.md)
- CLI: [70-qa/test-plans/cli/012-new-chat-experience.md](../../70-qa/test-plans/cli/012-new-chat-experience.md)
- Chrome: [70-qa/test-plans/chrome/012-new-chat-experience.md](../../70-qa/test-plans/chrome/012-new-chat-experience.md)

## 10. Gaps and dependencies

- **Brief says Chrome temporary chat is missing, but it exists.** Affects: Chrome; brief readers. Evidence: apps/extension/src/side_panel.ts:14937. Work needed: Correct the brief status.
- **No in-chat temporary control in the CLI; only a startup flag.** Affects: CLI. Evidence: apps/cli/src/lib.rs:433. Work needed: Decide whether the flag meets S12.17; add a toggle if not.
- **No temporary chat in VS Code.** Affects: VS Code. Evidence: brief S12.17. Work needed: Product decision.
- **Brief says the mobile control is on the chat screen; the code puts it in the header and mobile Cloud project choice vs temporary conflict was not checked.** Affects: Mobile. Evidence: apps/mobile/app/(app)/(tabs)/chat.tsx:1255. Work needed: Check mobile project rule against the web rule.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- surface:cli
- table:web_conversations
- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- F012-09

## Unknown

- Whether temporary-chat turns count against plan quota.
- Whether the CLI --no-session-persistence flag fully satisfies S12.17.
- Mobile rule for temporary versus project.
- Whether newChatsTemporary syncs across devices.
- Server-side message refusal code (named only in the policy comment, not opened).
