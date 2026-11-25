---
id: "F013-07"
type: "feature"
title: "Drafts: autosave, recovery, isolation"
aliases: ["Draft autosave", "Draft recovery", "Draft isolation", "Unsent text", "Parked draft", "Composer draft", "Conversation draft sync", "Choose which draft to keep"]
area: "13 Composer text interaction"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "seen failing", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S13.16", "S13.17", "S13.18"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "surface:vscode", "surface:cli", "mode:cloud", "mode:local", "SYS-sync-and-continuity", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "SYS-authentication-and-identity", "table:web_conversations", "api:PUT /api/chat/conversations/{id}"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F013-07 Drafts: autosave, recovery, isolation

Keeps the text a person has typed but not sent. Web and Desktop write it to browser storage per chat and, for saved Cloud chats, to our server so another device sees it. Mobile stores it on the device. A failed send or a stranded queued message puts text back. Temporary chats keep nothing.

Area: [13. Composer text interaction](README.md). Requirement items: [S13.16](../../10-requirements/capabilities/013-composer-text-interaction.md#s1316), [S13.17](../../10-requirements/capabilities/013-composer-text-interaction.md#s1317), [S13.18](../../10-requirements/capabilities/013-composer-text-interaction.md#s1318).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen failing |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Saves unsent composer text per conversation (and one for the new-chat screen), restores it after reload, crash, chat switch or failed send, and on the web syncs it to the account so a second device or tab can pick it up, with a compare dialog when two versions collide.

**Why it exists.** Losing a half-written prompt is a top annoyance; the leaders keep drafts per chat. It also guards against text leaking from one chat into another and keeps private chats private (brief S13.16 to S13.18).

**Who uses it.** Every person who types in the composer on Web, Desktop (which shows the hosted web app, doc: AGENTS.md section 5), Mobile, Chrome side panel, and in a limited way VS Code and the CLI.

**Problems it solves**

- Text lost on reload, crash or navigation
- Text from one chat appearing in another
- A failed send that looks like the message vanished
- A queued follow-up lost when the person changes chat

**Use cases**

- Type a long prompt, reload the tab, see it still there with the same chat open.
- Start a draft on a laptop, open the same Cloud chat on another browser, find the draft.
- A send fails; the text returns to the box with a notice.
- Switch to another chat mid-sentence and come back; the sentence is waiting.

## 2. User experience

**Where to find it**

- Web and Desktop: the chat composer on /chat (apps/web/features/chat/components/Composer/ChatComposerNew.tsx).
- Mobile: the chat input in a conversation and on the new-chat tab (apps/mobile/src/features/chat/components/ChatInput.tsx:462).
- Chrome: the side panel input (apps/extension/src/side_panel.ts:10119).
- VS Code: the sidebar chat input (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5957).
- CLI: the terminal composer; Up restores a cleared draft (apps/cli/src/tui/tui_app.rs:4184).

**Before you start**

- Browser or device storage must be writable; on the web a full storage shows a notice (ChatComposerNew.tsx:693).
- Server sync needs a signed-in session, a saved (non-temporary) conversation with a real id, and no on-device model selected (apps/web/features/chat/hooks/use-conversation-draft-sync.ts:73).

**Screens and controls**

- Composer text box; no dedicated draft control.
- Notice line: 'Couldn't send. Restored here so you can try again.' (ChatComposerNew.tsx:689).
- Notice: 'This browser's storage is full, so this draft will not come back if you reload. Copy it somewhere safe.' (ChatComposerNew.tsx:693).
- Toast: 'This draft couldn't sync to your other devices. Retry when ready.' with a Retry action (use-conversation-draft-sync.ts:247).
- Toast: 'This draft changed elsewhere. Your text is still here, but has not synced.' with a Compare action (use-conversation-draft-sync.ts:282).
- Dialog 'Choose which draft to keep' with 'Here' and 'Elsewhere' panes and buttons 'Use the other version' and 'Keep this version' (apps/web/features/chat/components/DraftConflictDialog.tsx:68,90,92).
- Notice after a stranded queued message: 'Your queued message was not sent: you switched chats before the reply finished.' plus 'It was saved as a draft in the original chat.' (ChatComposerNew.tsx:4405).

**Journey**

1. Type in a chat; the text is written to browser storage on every change (ChatComposerNew.tsx:4124).
2. Leave the chat or reload; on return the composer reads the parked or stored draft for that chat id (ChatComposerNew.tsx:4151-4161).
3. On a saved Cloud chat, after the typing settles for the debounce, the text is sent to the server (use-conversation-draft-sync.ts:308).
4. Open the same chat elsewhere; the loaded conversation brings the server draft into an empty composer (apps/web/lib/hooks/useConversations.ts:783).
5. If another device changed it first, a toast offers Compare; choose which version to keep.
6. Send the message; the draft is cleared locally and a clear is queued for the server (ChatComposerNew.tsx:2145-2147).

**What the person sees and gets**

- Restored-text notices, storage-full notice, sync-failed toast with Retry, conflict toast and dialog.
- Chrome shows 'Restored your unsent text.' (apps/extension/_locales/en/messages.json spDraftRestored) and 'Chrome couldn't save your draft. Keep this panel open to retain your text.' (spDraftSaveFailed). Mobile restores silently.

**Settings**

- None found for drafts. The debounce and the 20000 character cap are contract constants (packages/contracts/cloud-contracts/src/conversation-contract.json:3-4).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop browser storage: per conversation key, versioned record, per-tab owner id so one tab cannot clear another tab's text, copy forward on reload, empty draft kept as a tombstone (apps/web/features/chat/components/Composer/composer-draft-storage.ts:21,60,146).
- Web server sync: PUT to the conversation path with draft and last seen draftUpdatedAt, 409 returns the other version, 404 means not saved yet (apps/web/features/chat/services/conversation-draft.ts:160-175).
- Server writes the draft on its own statement so it does not reorder the sidebar, refuses it on temporary chats, and returns 409 with the current draft on a stale revision (apps/web/app/api/chat/conversations/[id]/route.ts:223,259).
- Retry up to 3 attempts with growing delay, then a toast with Retry (use-conversation-draft-sync.ts:25-26,247).
- Temporary chat: nothing written and any stored draft cleared (ChatComposerNew.tsx:4120-4122); server stores null for temporary chats (route.ts:223).
- Failed send hands the text back and shows the restore notice (ChatComposerNew.tsx:4228-4250).
- Stranded queued message merged into the original chat's draft with a notice; attachments are not kept (ChatComposerNew.tsx:4390-4411).
- Sign-out removes stored drafts because their keys match a cleanup pattern (apps/web/shared/stores/authentication-store.ts:117).
- Mobile: per-key, per-provenance record in MMKV, with attachments, cleared on send, Cloud drafts unreadable by another account, account-scoped drafts removed on teardown (apps/mobile/src/features/chat/draftStore.ts:137-215, apps/mobile/src/features/auth/services/cloudAccountTeardown.ts:41).
- Mobile failed send restores text in front of anything typed since (ChatInput.tsx:976-990).
- Chrome: draft keyed by account, auth incarnation and chat in session storage, restore notice and failure notices (side_panel.ts:10104-10155).
- VS Code: per-thread drafts map saved to the webview state on each input (webviewContent.ts:4247,5957-5966).
- CLI: Ctrl-C or Esc parks the composer text in memory per session scope and Up brings it back (apps/cli/src/tui/tui_app.rs:1133-1156,4184).

**Incomplete**

- Chrome: text is kept in browser session storage; the brief says recovery after Chrome restarts and across devices is open (brief S13.16, S13.17).
- VS Code: drafts are stored through the webview state API; the brief marks it missing and the code shows it exists, so the brief is out of date on existence; how long the state survives is unknown (webviewContent.ts:5965).
- CLI: the parked draft lives in memory only; nothing is written to disk (tui_app.rs:608).

**Present but disconnected or switched off**

- none found

**Not available**

- Mobile has no cross-device draft sync; drafts stay in device storage (draftStore.ts:5).
- CLI and VS Code have no draft notice when text is restored.

## 4. Required behaviour

**Established requirements**

- Unsent composer text is saved automatically while typing so it survives reload or crash. (source: brief S13.16)
- After reload, crash or failed send, unsent text is put back in the composer with a notice. (source: brief S13.17)
- Each conversation keeps its own draft; switching chats never carries text into another chat. (source: brief S13.18)
- Unknown availability preserves the draft and asks for retry (a draft is not discarded when a limit check cannot be answered). (source: doc: docs/product/definition.md:347)
- Failed edits and failed uploads preserve the user's draft. (source: doc: docs/product/experience-contract.md:777)

**Acceptance criteria**

1. Type in chat A, switch to chat B, the box is empty or shows B's own draft; switch back, A's text is there.
2. Reload the web page with text typed; the text returns in the same chat.
3. In a temporary chat, type, reload; nothing returns and no draft is stored.
4. Force a send failure; the text returns with the restore notice and nothing typed since is lost.
5. Edit the same Cloud chat draft on two browsers; the second to save sees the compare dialog and both choices work.
6. Queue a follow-up, switch chat before it sends; it is saved as a draft in the original chat with a notice.
7. Sign out; stored drafts are gone.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A draft typed in a chat answered by an on-device model should never reach our server; the code checks this (use-conversation-draft-sync.ts:73-83) [inferred from the trust-boundary rule in doc: AGENTS.md section 6].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Persist the CLI parked draft to disk with the same per-session scope.
- [proposed] Give Mobile server draft sync for Cloud chats if cross-device continuity is wanted.
- [proposed] Keep stranded queued attachments as pending files rather than dropping them.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | composer-draft-storage | `apps/web/features/chat/components/Composer/composer-draft-storage.ts` | Browser storage for per-chat drafts with per-tab owner and reload migration. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Writes, restores, parks and hands back drafts; shows the notices. |
| hook | useConversationDraftSync | `apps/web/features/chat/hooks/use-conversation-draft-sync.ts` | Debounced server save, retry, conflict capture. |
| service | saveConversationDraft | `apps/web/features/chat/services/conversation-draft.ts` | PUT with revision, per-conversation queue, conflict parsing. |
| component | DraftConflictDialog | `apps/web/features/chat/components/DraftConflictDialog.tsx` | Compare and choose which draft to keep. |
| service | pending-draft-clear | `apps/web/features/chat/lib/pending-draft-clear.ts` | Remembers a clear for up to 24 hours so a stale server draft does not return. |
| store | web-chat-store drafts | `apps/web/shared/stores/web-chat-store.ts` | In-memory draftsByConversation, owners and deferred unsent drafts. |
| endpoint | PUT /api/chat/conversations/{id} (draft) | `apps/web/app/api/chat/conversations/[id]/route.ts` | Stores the draft and draft_updated_at with conflict detection. |
| table | web_conversations.draft, draft_updated_at | `apps/web/db/neon/0219_conversation_drafts.sql` | Server copy of the draft. |
| config | conversation-contract.json | `packages/contracts/cloud-contracts/src/conversation-contract.json` | Draft max length and save debounce. |
| hook | useConversations draft hydrate | `apps/web/lib/hooks/useConversations.ts` | Loads the server draft into an empty composer. |
| store | mobile draftStore | `apps/mobile/src/features/chat/draftStore.ts` | Device draft record with provenance and attachments. |
| component | mobile ChatInput | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Saves on change, restores on chat switch, restores after failed send. |
| other | draftIdentityKey | `apps/mobile/src/features/chat/draftIdentity.ts` | Key that separates chats and Local from Cloud owner. |
| other | Chrome bindComposerDraft | `apps/extension/src/side_panel.ts` | Session-storage draft per account, session and chat. |
| other | VS Code saveComposerDraft | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Per-thread drafts kept in webview state. |
| other | CLI park_composer | `apps/cli/src/tui/tui_app.rs` | In-memory parked draft per session scope. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Keystroke updates the composer and writes the text to browser storage under the chat key. | device | ChatComposerNew.tsx:4124, composer-draft-storage.ts:211 |
| For a saved Cloud chat the store holds the draft; after the debounce the hook sends it to the server. | device and our servers | use-conversation-draft-sync.ts:308, conversation-draft.ts:160 |
| Server updates the draft columns, or answers 409 with the other device's text. | our servers | apps/web/app/api/chat/conversations/[id]/route.ts:223-264 |
| Opening the chat elsewhere loads the conversation and sets the draft if none is parked locally. | device and our servers | apps/web/lib/hooks/useConversations.ts:783-788 |
| Mobile writes the draft to device storage on each change; send clears it, failure restores it. | device | ChatInput.tsx:770-772,1037 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web draft text and per-tab owner id | browser localStorage and sessionStorage | No (browser only) | Tombstone when emptied; removed by sign-out cleanup (authentication-store.ts:117); how old orphaned tab copies are cleaned is unknown |
| Server draft and draft time | table web_conversations columns draft and draft_updated_at | Yes, to the person's other devices | Null for temporary chats; no retention rule found |
| Mobile draft with attachments | store:mmkv composer-draft keys | No | Removed on send; account-scoped drafts removed on teardown (draftStore.ts:205) |
| Chrome draft | chrome.storage.session | No | Per brief, lost when Chrome restarts |

**Models and providers.** No model takes part. The server decides nothing about the text; it only stores it. Chats answered by an on-device model are excluded from server sync (use-conversation-draft-sync.ts:73-83).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Browser draft needs no account. Server sync needs a signed-in session (use-conversation-draft-sync.ts: isSignedIn check). Mobile Cloud drafts are readable only by the same Cloud account (draftStore.ts:107). |
| Permissions | Server write requires the conversation to belong to the user and organization (route.ts:233-238). |
| Subscription | none found in the code |
| Limits and metering | Draft capped at 20000 characters and saved after 1500 ms of quiet (conversation-contract.json:3-4); 3 automatic save attempts (use-conversation-draft-sync.ts:26). Not metered. |
| Feature flags | none found in the code |
| Model compatibility | Server sync is skipped when a model on this device is selected or the chat holds on-device turns (use-conversation-draft-sync.ts:73-83). |
| Provider restrictions | none found in the code; whether an own-key chat's draft reaches our server is not established (unknown). |
| Local mode | Web keeps the draft in browser storage only. Mobile keeps Local drafts under local provenance on the device and never mixes them with Cloud drafts (draftStore.ts:15,113). CLI parks per session and privacy scope in memory (tui_app.rs:1124). Chrome writes nothing unless a managed Cloud owner exists (side_panel.ts:10119-10131). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Storage full or blocked | Web shows the storage-full notice; Chrome shows the save-failed notice; mobile swallows the error silently. | ChatComposerNew.tsx:693,4124; side_panel.ts:10113-10116; draftStore.ts:182-184 |
| Offline | Browser copy keeps working; server save fails and retries, then the Retry toast. Offline send reason says the draft is saved here. | ChatComposerNew.tsx:717; use-conversation-draft-sync.ts:236-258 |
| Conversation not yet on server | 404 is treated as not saved yet and retried when the chat appears. | conversation-draft.ts:174; use-conversation-draft-sync.ts |
| Two devices edit | 409 shows the Compare toast and dialog; choosing replaces the other copy everywhere. | route.ts:259; DraftConflictDialog.tsx:68-92 |
| Temporary chat | Nothing stored; stored draft cleared when armed mid-sentence; server stores null. | ChatComposerNew.tsx:4120; route.ts:223 |
| Mid-switch commit | Write is skipped until the owner ref catches up so one chat's text is never written under another's key. | ChatComposerNew.tsx:4116 |
| Stranded queued message | Merged into original chat draft; attachments are dropped and the notice says so. | ChatComposerNew.tsx:4390-4411 |
| Accessibility | Notices render as status text; the compare dialog has labelled sections. | DraftConflictDialog.tsx:15 |
| Timeout | not handled in the code beyond the retry cap. | searched use-conversation-draft-sync.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ChatComposerNew.draftPersistence.test.tsx`: Draft on disk while mounted, returns after reload and crash, double-mount, other conversation untouched (it titles read).
- `apps/web/features/chat/components/Composer/composer-draft-storage.tabs.test.ts`: One tab cannot clear another's text; reload copies a prior document's text to a fresh owner.
- `apps/web/features/chat/components/Composer/ChatComposerNew.draftRestore.test.tsx`: Parks and restores per conversation, keeps private draft out of next chat, temporary text not staged for sync.
- `apps/web/features/chat/hooks/useConversationDraftSync.test.tsx`: Saves after typing settles, never stores temporary or on-device chats, sends clear, no resend.
- `apps/web/features/chat/services/conversation-draft.test.ts`: Revision handling, conflict keeps text local, serialized clears, session retirement.
- `apps/web/features/chat/lib/pending-draft-clear.test.ts`: Pending clear marker (file exists; titles not read).
- `apps/mobile/__tests__/draft-store.test.ts`: Round trip, per-key isolation, empty clears, Local versus Cloud provenance, on disk mid-sentence.
- `apps/mobile/src/features/chat/components/__tests__/ChatInput.draftAttachments.test.tsx`: Staged files saved with the draft and restored.
- `apps/extension/__tests__/composer-admission-retention.test.ts`: Keeps a new draft over the previous prompt; restores earlier prompt into an empty composer.
- `apps/cli/src/tui/tui_app.rs`: In-file tests: a cleared draft is recalled only in its session; Ctrl-C keeps the draft recoverable (names seen near line 10880).

**Test scenarios**

- **Per-chat isolation**
  1. Open chat A, type 'alpha' without sending.
  2. Open chat B, type 'beta'.
  3. Return to A, then to B.
  - Expected: A shows alpha and B shows beta; neither appears in the other.
- **Reload recovery**
  1. Type text in a chat.
  2. Reload the page.
  - Expected: The same text is in the same chat; no restore error.
- **Temporary chat**
  1. Turn on temporary chat, type text.
  2. Reload.
  - Expected: The box is empty; the web_conversations draft stays null for that chat.
- **Cross-device conflict**
  1. Open one Cloud chat in two browsers.
  2. Type different text in each, wait over 1.5 s.
  3. Use Compare on the toast.
  - Expected: The dialog shows Here and Elsewhere; either choice makes both browsers agree.
- **Failed send**
  1. Block the network, send a message.
  - Expected: Text returns with the restore notice.
- **Mobile Local and Cloud**
  1. Type in a Local chat draft, then a Cloud chat with the same id key pattern.
  - Expected: Drafts stay separate by provenance.

**Where to look when it fails**

- Browser: localStorage keys starting agi-composer-draft and agi-composer-draft-clear.
- Server: web_conversations.draft and draft_updated_at; PUT status 409 or 404.
- Console warnings from the draft sync hook; Chrome composerContextNotice strings.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/013-composer-text-interaction.md](../../70-qa/test-plans/web/013-composer-text-interaction.md)
- Desktop: [70-qa/test-plans/desktop/013-composer-text-interaction.md](../../70-qa/test-plans/desktop/013-composer-text-interaction.md)
- Mobile: [70-qa/test-plans/mobile/013-composer-text-interaction.md](../../70-qa/test-plans/mobile/013-composer-text-interaction.md)
- CLI: [70-qa/test-plans/cli/013-composer-text-interaction.md](../../70-qa/test-plans/cli/013-composer-text-interaction.md)
- VS Code: [70-qa/test-plans/vscode/013-composer-text-interaction.md](../../70-qa/test-plans/vscode/013-composer-text-interaction.md)
- Chrome: [70-qa/test-plans/chrome/013-composer-text-interaction.md](../../70-qa/test-plans/chrome/013-composer-text-interaction.md)

## 10. Gaps and dependencies

- **CLI has no draft saving across exits; only in-memory parking.** Affects: CLI. Evidence: apps/cli/src/tui/tui_app.rs:608,1133 (memory map only). Work needed: Write parked drafts to the config directory per session.
- **VS Code drafts exist in webview state but the brief says missing; survival after window restart is unverified.** Affects: VS Code. Evidence: webviewContent.ts:5957-5966; brief S13.16. Work needed: Verify in a real window and correct the brief.
- **Chrome drafts are lost when Chrome restarts and never cross devices.** Affects: Chrome. Evidence: brief S13.16 Unfinished; side_panel.ts:10110. Work needed: Use durable storage or the server draft path.
- **Mobile has no server draft sync and its draft write failures are silent.** Affects: Mobile. Evidence: draftStore.ts:182-184. Work needed: Decide on continuity; add a notice on write failure.
- **Stranded queued attachments are dropped.** Affects: Web, Desktop. Evidence: ChatComposerNew.tsx:4408-4411. Work needed: Keep files as pending attachments.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- surface:vscode
- surface:cli
- mode:cloud
- mode:local
- SYS-sync-and-continuity
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- SYS-authentication-and-identity
- table:web_conversations
- api:PUT /api/chat/conversations/{id}

## Unknown

- Whether an own-key (provider key) chat's draft is sent to our server; the guard checks only on-device models.
- How long VS Code webview state and Chrome session storage keep drafts (not read from code).
- Whether orphaned per-tab browser drafts from closed tabs are ever deleted.
- Whether mobile clears the draft of a temporary chat on exit.
- Server-side retention period of web_conversations.draft.
