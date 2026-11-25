---
id: "F085-06"
type: "feature"
title: "Chat history and temporary chats"
aliases: ["Activity-history preference (S85.11)", "Temporary-chat preferences (S85.16)", "Temporary chat", "Incognito", "Use incognito", "Exit incognito", "Start new chats as temporary", "keep_history", "--no-session-persistence"]
area: "85 Personalization and data settings"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S85.11", "S85.16"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "mode:cloud", "mode:local", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "table:web_conversations", "api:POST /api/chat/conversations", "F085-04", "F085-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F085-06 Chat history and temporary chats

A temporary chat is not saved to history or search, does not use or write memory, and is removed after 30 days if any trace remains. On web the person can make new chats temporary by default (per browser). There is no general off switch for history on web. CLI has a history setting and flag; Chrome and mobile have per-chat toggles.

Area: [85. Personalization and data settings](README.md). Requirement items: [S85.11](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8511), [S85.16](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8516).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Marks a chat as temporary at creation so the server refuses to store its messages, search and memory skip it, and sharing is refused (apps/web/lib/temporary-chat-policy.ts:1-23; apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:80).

**Why it exists.** People want private one-off chats, like ChatGPT temporary chat and Claude incognito (doc: docs/product/requirements.md:765).

**Who uses it.** Anyone on Web, Desktop, Mobile, CLI and Chrome. VS Code has none found.

**Problems it solves**

- Sensitive questions that should leave no history or memory.
- Remembering to switch it on each time (web default).

**Use cases**

- Turn on 'Start new chats as temporary' and chat privately by default.
- Open one incognito chat from the composer.
- Run the CLI with --no-session-persistence for one run.
- Tap the eye icon on the phone to start a temporary chat.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings > Privacy > 'Start new chats as temporary' (apps/web/features/settings/sections/PrivacySection.tsx:717-726); composer menu 'Use incognito' / 'Exit incognito' (apps/web/lib/temporary-chat-policy.ts:3,5; test ChatComposerNew.temporaryChat.test.tsx:100).
- Mobile: eye icon 'Enable temporary chat' in chat (apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:49); explainer banner with a 'Personalized' switch in Cloud mode (TemporaryChatBanner.tsx:17-18,100-110).
- CLI: flag --no-session-persistence and config key history or keep-history (apps/cli/src/lib.rs:433; config.rs:205,1459,1528).
- Chrome: temporary chat in the side panel (apps/extension/src/side_panel.ts:8939) labelled 'Temporary chat'.
- VS Code: none found.

**Before you start**

- Web default is not available inside a project: project chats are saved (temporary-chat-policy.ts:56-66).

**Screens and controls**

- Web Privacy switch with text 'Not saved to history or search, and deleted after 30 days. Project chats are saved.' (PrivacySection.tsx:717-722).
- Web end action 'End temporary chat' with confirm 'End and discard' (temporary-chat-policy.ts:40-51).
- Mobile alert 'Turn on temporary chat?' with Cancel and 'Turn on' (TemporaryChatToggle.tsx:29-32).
- Chrome notice with 'Turn off', 'End temporary chat', 'End and discard', 'Keep chatting' (_locales/en/messages.json lines 2230-2263).

**Journey**

1. Web default: flip the Privacy switch; new non-project chats are created as temporary.
2. Or arm temporary chat for one chat from the composer.
3. Send messages; none are saved; a banner or label shows the state.
4. Ending a temporary chat discards it with no recovery.

**What the person sees and gets**

- Retention text on web: 'Won't be saved to your history or show up in search, and skips memory. Files you attach stay out of your Library, and a connector asks before every call even where you saved Always allow.' (temporary-chat-policy.ts:20-30).
- Mobile cloud explainer 'Won't appear in history or use memory, and is normally deleted after 30 days.'; Local explainer 'Won't be saved or use memory, and attachments never leave this device.' (TemporaryChatBanner.tsx:12-15).

**Settings**

- Web newChatsTemporary (default false) in browser storage agiworkforce-web-settings (shared/stores/web-settings-store.ts:128,210).
- Mobile temporaryChatPersonalized default true; isTemporaryChat is session only (apps/mobile/stores/settingsStore.ts:137-138,170).
- CLI default.keep_history.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web sends isTemporary at conversation creation when the default is on (apps/web/lib/hooks/useConversations.ts:645; WebChatPage.tsx:2468; desktop task runner use-dispatch-task-runner.ts:93).
- Server refuses to store messages of a temporary conversation with the conflict 'Messages in a temporary chat are not saved.' (persist-message.ts:80; temporary-chat-policy.ts:10); the free-quota path returns early the same way (apps/web/lib/server/persist-free-offering-user.ts:33).
- Search, list and retrieval filter temporary chats (conversations route test; apps/web/app/api/search/route.ts:324,375; retrieval-search-service.ts:270,363).
- Memory and past-chat sources are withheld for temporary turns (turn-context-service.ts:124-130).
- A nightly job deletes temporary chats and their files after 30 days, except under a legal hold (apps/web/app/api/cron/purge-temporary-chats/route.ts:24,38-47).
- Projects refuse temporary chats; local-model chats are temporary (temporary-chat-policy.ts:53-58).
- Mobile temporary toggle with confirmation, cloud 'Personalized' switch that sends personalization false when off (chatExecutionStore.ts:3453-3455); memory not read (chatExecutionStore.ts:2797-2798).
- CLI: with keep_history false or the flag, sessions do not persist (apps/cli/src/lib.rs:6068-6077,6198-6200).
- Chrome: temporary chat per chat, deleting the server conversation on end if one exists (side_panel.ts:8959-8970).

**Incomplete**

- Web default is per browser: it lives in localStorage and is not saved to the account (web-settings-store.ts:210).
- Mobile has no default-temporary preference; the toggle resets each session (settingsStore.ts:137,170).
- Chrome has a per-chat toggle only; brief says missing, code disagrees.

**Present but disconnected or switched off**

- A web 'rememberChats' history switch was removed because nothing read it; the Privacy section says so in a code comment (PrivacySection.tsx:690-701; test temporary-by-default.test.ts).

**Not available**

- A general 'keep chats in history' off switch for Cloud chats on web, desktop, mobile (use temporary chat instead).
- VS Code temporary or history control (none found; brief says missing).

## 4. Required behaviour

**Established requirements**

- The user can choose whether chats are kept in history (and synced) or not saved. (source: S85.11 Should (brief))
- The user can make new chats temporary by default (not saved, not used for memory) and the preference is honoured. (source: S85.16 Should (brief))
- Consent and temporary-chat choices affect the next applicable request. (source: doc: docs/product/experience-contract.md:792)
- Temporary chats neither read nor write memory. (source: doc: docs/product/experience-contract.md:779)
- A temporary chat and its attachments are removed after 30 days. (source: apps/web/features/settings/sections/PrivacySection.tsx:519-521; apps/web/app/api/cron/purge-temporary-chats/route.ts:24)

**Acceptance criteria**

1. With the web default on, a new non-project chat is created with isTemporary true and its first message is never stored.
2. Posting a message to a temporary conversation through the message endpoint returns a conflict.
3. A temporary chat does not appear in conversation list, title search or /api/search.
4. Memory and past-chat excerpts are absent from a temporary turn.
5. In a project, new chats are saved even with the default on.
6. The purge job removes a temporary chat older than 30 days and keeps one under legal hold.
7. CLI run with --no-session-persistence writes no session state.
8. Mobile temporary chat asks before turning on and shows the explainer.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] On the web the default does not follow the person to another browser, unlike account settings.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Save the default to the account so it follows across browsers.
- [proposed] Add a default-temporary preference on Mobile.
- [proposed] State plainly in each app that there is no global off switch for history.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | web settings store | `apps/web/shared/stores/web-settings-store.ts` | newChatsTemporary default and persistence. |
| service | temporary chat policy | `apps/web/lib/temporary-chat-policy.ts` | Labels, texts, project rule, resolveNewChatTemporary. |
| component | PrivacySection | `apps/web/features/settings/sections/PrivacySection.tsx` | Default switch and retention text. |
| hook | useConversations | `apps/web/lib/hooks/useConversations.ts` | Sends isTemporary at creation (line 645). |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Per-chat toggle (lines 1789-1813). |
| hook | use-dispatch-task-runner | `apps/web/features/desktop-host/hooks/use-dispatch-task-runner.ts` | Applies the default for desktop dispatched tasks (line 93). |
| endpoint | Conversation message persistence | `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts` | Refuses temporary conversations (line 80). |
| service | persistFreeOfferingUser | `apps/web/lib/server/persist-free-offering-user.ts` | Skips saving for temporary chats (line 33). |
| endpoint | GET /api/search | `apps/web/app/api/search/route.ts` | Excludes temporary chats. |
| job | purge-temporary-chats cron | `apps/web/app/api/cron/purge-temporary-chats/route.ts` | 30-day deletion, batches, legal hold. |
| table | web_conversations (is_temporary) | `apps/web/lib/server/persist-free-offering-user.ts` | Flag column read at line 25-31. |
| component | TemporaryChatToggle | `apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx` | Mobile toggle. |
| component | TemporaryChatBanner | `apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx` | Explainer and Personalized switch. |
| store | mobile settingsStore | `apps/mobile/stores/settingsStore.ts` | isTemporaryChat (session only) and temporaryChatPersonalized. |
| service | mobile chat execution | `apps/mobile/stores/chat/chatExecutionStore.ts` | Skips memory and sends personalization false (lines 2797,3453). |
| config | CLI keep_history and session persistence | `apps/cli/src/config.rs` | default.keep_history (line 205). |
| command | --no-session-persistence | `apps/cli/src/lib.rs` | Flag and policy (lines 433,6068-6077). |
| component | Chrome temporary chat | `apps/extension/src/side_panel.ts` | start, end, leave functions (lines 8900-8970). |
| config | Chrome locale strings | `apps/extension/_locales/en/messages.json` | spTemporaryChat* texts (lines 2230-2263). |
| test | temporary-by-default test | `apps/web/features/settings/sections/__tests__/temporary-by-default.test.ts` | Source-shape checks for the default. |
| test | purge cron tests | `apps/web/app/api/cron/purge-temporary-chats/route.test.ts` | Auth, file deletion, batches. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person turns the default on; the value is stored in the browser. | device | web-settings-store.ts:128,159,210 |
| When a chat is created outside a project, the client sends isTemporary true in the create call. | device and our servers | useConversations.ts:645; temporary-chat-policy.ts:60-66 |
| The server stores a conversation row flagged temporary and refuses any message write to it. | our servers | persist-message.ts:67-80 |
| Chat turns run without saving; memory and past-chat reads are skipped. | our servers | turn-context-service.ts:124-130 |
| A nightly cron deletes temporary chats older than 30 days and their files in batches. | our servers | purge-temporary-chats/route.ts:24-47 |
| Mobile Local temporary chats stay on the device and are not saved. | device | TemporaryChatBanner.tsx:14 (explainer); persistence rule not opened |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web default flag | browser localStorage agiworkforce-web-settings | No | Until the browser data is cleared |
| Temporary conversation row and attachments | table web_conversations (is_temporary) and temporary file storage | No messages stored | Deleted after 30 days; legal hold delays deletion |
| Mobile isTemporaryChat | mobile settings store, not persisted | No | Resets each session |
| CLI keep_history | CLI config file | No | Until edited |

**Models and providers.** The model sees the chat as usual; connectors still reach their own services and keep their own record (temporary-chat-policy.ts:18-20). Provider-side retention was not examined.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Account for Cloud chats; Mobile Local and CLI Local need none. |
| Permissions | Own chats only. Sharing a temporary chat is refused (temporary-chat-policy.ts:7-8). |
| Subscription | none found in the code in the files read. |
| Limits and metering | 30-day retention; purge runs with a batch of 500 and a time budget of 240 seconds (purge-temporary-chats/route.ts:20-23). |
| Feature flags | newChatsTemporary; CLI keep_history; --no-session-persistence. |
| Model compatibility | Not model-specific. |
| Provider restrictions | none found in the code. |
| Local mode | Chats with a model on this device are temporary on web and desktop (temporary-chat-policy.ts:53-54). Mobile Local temporary chats are not saved and attachments stay on the device (TemporaryChatBanner.tsx:14). CLI Local sessions stay on this computer unless persistence is off (claude_parity.rs:463). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Inside a project | Temporary is refused with a notice that the chat will be saved. | temporary-chat-policy.ts:48-58 |
| Ending a temporary chat | Confirm 'End and discard'; nothing recoverable. | temporary-chat-policy.ts:40-51 |
| Draft present when leaving (Chrome) | Keeps temporary mode with a notice. | side_panel.ts:8948-8957 |
| Legal hold | Held temporary chats survive the 30 days. | purge-temporary-chats/route.ts:38-41 |
| Purge overrun | Stops at the budget and continues next run. | purge-temporary-chats/route.ts:12-23 |
| Mobile banner | Shown once per session; dismissible. | TemporaryChatBanner.tsx:35-50 |
| Offline | not handled in the code beyond ordinary errors. | searched PrivacySection.tsx, TemporaryChatToggle.tsx and side_panel.ts temporary functions for offline handling and found none |
| Accessibility | Mobile toggle has role button, label and state; web switch has aria-label. | TemporaryChatToggle.tsx:47-52; PrivacySection.tsx:725 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/__tests__/temporary-by-default.test.ts`: Default is sent at creation, nothing extra when off, read at call time, switch accessible, no rememberChats.
- `apps/web/features/settings/sections/__tests__/PrivacySection.temporary-switch.test.tsx`: Shared switch styling and turning default on.
- `apps/web/lib/__tests__/temporary-chat-policy.test.ts`: Never temporary in a project; default and armed choice outside it.
- `apps/web/app/api/chat/conversations/route.temporary-history.test.ts`: Temporary chats excluded from every read and from title search.
- `apps/web/features/chat/components/Composer/ChatComposerNew.temporaryChat.test.tsx`: Enabled default shown, explicit opt-out, 'Use incognito' toggle.
- `apps/web/app/api/cron/purge-temporary-chats/route.test.ts`: Unsigned refusal, file deletion on the same clock, batches.
- `apps/web/lib/server/__tests__/temporary-chat-purge.test.ts`: Purge logic (title not read).
- `apps/web/features/desktop-host/__tests__/TemporaryChat.test.tsx`: Desktop new chat arms the temporary flag.
- `apps/mobile/__tests__/TemporaryChatBanner.test.tsx`: Banner close, Learn more link, turn off in place, confirmation text.

**Test scenarios**

- **Default on**
  1. Turn on 'Start new chats as temporary'
  2. Start a chat outside a project and send a message
  3. Reload and open history
  - Expected: The chat is not listed and its message was not stored.
- **Project override**
  1. Keep the default on
  2. Start a chat inside a project
  - Expected: The chat is saved and shows the project notice.
- **Server refusal**
  1. Create a temporary conversation
  2. POST a message to its messages endpoint
  - Expected: 409 'Messages in a temporary chat are not saved.'
- **CLI**
  1. Run the CLI with --no-session-persistence
  2. Chat, then list sessions
  - Expected: No session is saved.
- **Chrome**
  1. Open the side panel on a new chat and choose temporary chat
  2. Send a message, then End and discard
  - Expected: Notice shown; no history entry.

**Where to look when it fails**

- Table web_conversations column is_temporary.
- Cron log 'Unauthorized cron request' if the cron secret is wrong (purge route).
- Chrome strings spTemporaryChat* in messages.json.
- CLI config default.keep_history.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/085-personalization-and-data-settings.md](../../70-qa/test-plans/web/085-personalization-and-data-settings.md)
- Desktop: [70-qa/test-plans/desktop/085-personalization-and-data-settings.md](../../70-qa/test-plans/desktop/085-personalization-and-data-settings.md)
- Mobile: [70-qa/test-plans/mobile/085-personalization-and-data-settings.md](../../70-qa/test-plans/mobile/085-personalization-and-data-settings.md)
- CLI: [70-qa/test-plans/cli/085-personalization-and-data-settings.md](../../70-qa/test-plans/cli/085-personalization-and-data-settings.md)
- Chrome: [70-qa/test-plans/chrome/085-personalization-and-data-settings.md](../../70-qa/test-plans/chrome/085-personalization-and-data-settings.md)

## 10. Gaps and dependencies

- **No on/off switch for keeping chats in history on web, desktop or mobile.** Affects: Web, Desktop, Mobile. Evidence: PrivacySection.tsx:690-701 comment; no switch. Work needed: Decide whether to add one or document temporary chat as the only control.
- **Web default is stored per browser, not on the account.** Affects: Web, Desktop. Evidence: web-settings-store.ts:210. Work needed: Move to the account preferences.
- **Mobile lacks a default-temporary preference.** Affects: Mobile. Evidence: settingsStore.ts:137,170. Work needed: Add a persisted preference.
- **VS Code has no temporary or history control.** Affects: VS Code. Evidence: No match in apps/extension-vscode/src; brief missing. Work needed: Add or document.
- **Brief lines for CLI (config.rs:1105, lib.rs:3868) point at unrelated code; the real controls are keep_history and the flag.** Affects: Documentation. Evidence: config.rs:205; lib.rs:433. Work needed: Correct the brief's code list.
- **Chrome default-temporary preference not found.** Affects: Chrome. Evidence: Only per-chat start function (side_panel.ts:8939). Work needed: Add if required.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- mode:cloud
- mode:local
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- table:web_conversations
- api:POST /api/chat/conversations
- F085-04
- F085-05

## Unknown

- How Mobile Local persists or discards a temporary chat in storage (code not opened).
- Whether the web default syncs anywhere other than localStorage (partialize not inspected beyond persist name).
- Whether Desktop Electron Local threads have their own history setting.
- VS Code behaviour: only a search for temporary chat code, which found none.
- What the CLI does for managed Cloud sessions under keep_history false (cloud history write path not opened).
- Retention of provider-side copies.
