---
id: "F090-05"
type: "feature"
title: "Composer drafts"
aliases: ["Draft store (S90.07)", "Composer drafts", "Unsent message", "Draft sync", "draft and draft_updated_at", "Draft conflict dialog"]
area: "90 Conversation and synchronization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S90.07"]
depends_on: ["SYS-sync-and-continuity", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-local-inference", "SYS-execution-boundaries", "F090-01", "F090-03", "mode:cloud", "mode:local", "table:web_conversations", "surface:web", "surface:mobile"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F090-05 Composer drafts

The web composer keeps unsent text on the chat row so it survives a reload and shows on another device. Saves wait 1.5 seconds, retry, and use a revision check. If two devices differ, a Compare dialog asks which to keep. Temporary and device-model chats never sync a draft. Mobile keeps drafts on the phone only.

Area: [90. Conversation and synchronization components](README.md). Requirement items: [S90.07](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9007).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Saves the text in the composer per chat, locally and on the server (draft, draft_updated_at on web_conversations), and restores it when the chat opens (apps/web/features/chat/hooks/use-conversation-draft-sync.ts; apps/web/lib/hooks/useConversations.ts:783-788).

**Why it exists.** A half-written message was lost by closing a tab and never reached another device (apps/web/db/neon/0219_conversation_drafts.sql:3-10).

**Who uses it.** Web users switching tabs or devices mid-message.

**Problems it solves**

- Lost text on reload.
- Text typed on a laptop not visible on another browser.
- Two tabs silently overwriting each other (revision check and conflict dialog).

**Use cases**

- Type, close the tab, reopen the chat: the text is there.
- Start a message on one computer, finish it on another.
- Two tabs edit the same draft: a dialog compares them.

## 2. User experience

**Where to find it**

- Web composer in every saved chat (apps/web/features/chat/components/Composer/ChatComposerNew.tsx; sync hook mounted at apps/web/features/chat/pages/WebChatPage.tsx:1972).
- Conflict dialog titled Choose which draft to keep (apps/web/features/chat/components/DraftConflictDialog.tsx:68).
- Electron Desktop shows the same hosted web app (doc: AGENTS.md section 5).
- Mobile: on-device draft store only (apps/mobile/src/features/chat/draftStore.ts:1-20).

**Before you start**

- Signed in, saved Cloud chat (a uuid chat id on the server).
- Not a temporary chat; no model on the device selected; the chat holds no device-model turns (use-conversation-draft-sync.ts:73-83).

**Screens and controls**

- Composer text box.
- Toast with a Retry button after three failed saves: This draft couldn't sync to your other devices. Retry when ready. (use-conversation-draft-sync.ts:247-253).
- Toast with a Compare button: This draft changed elsewhere. Your text is still here, but has not synced. (:282-288).
- Dialog headings Here and Elsewhere, buttons Use the other version and Keep this version (DraftConflictDialog.tsx:75-92).

**Journey**

1. Person types; the text is parked in the chat store and browser storage.
2. After a 1500 ms pause the hook sends PUT with draft and the last revision seen.
3. Server stores the text and returns a new revision; the hook marks it saved.
4. On another device, opening the chat reads the draft and fills an empty composer.
5. If the text was changed elsewhere, the save returns 409 with the other text; the toast offers Compare.
6. Person picks a side; Keep this version resends over the other's revision; the other version replaces the local text and empties the conflict.

**What the person sees and gets**

- Silent on success.
- Retry toast after 3 automatic attempts with delays of 3 s then doubling (use-conversation-draft-sync.ts:25-26, :241).
- Conflict toast and dialog as above.
- A failed save is never shown as saved (conversation-draft.ts:169-195).

**Settings**

- Draft cap 20000 characters and debounce 1500 ms from conversation-contract.json (packages/contracts/cloud-contracts/src/conversation-contract.json:3-4).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server stores draft and draft_updated_at without touching updated_at or server_version (apps/web/app/api/chat/conversations/[id]/route.ts:212-274).
- Compare-and-swap: the write applies only when the client's revision matches the stored one; otherwise 409 with the current draft and revision, unless the stored text already equals the new text (route.ts:221-270).
- Revision rises at least one millisecond per write (route.ts:224-229).
- Per-chat save queue, session-bound requests, revision tracking (apps/web/features/chat/services/conversation-draft.ts:120-199).
- 404 means the chat is not on the server yet; the hook waits until it is listed (conversation-draft.ts:174; hook:221-228).
- Opening a chat copies the server draft into an empty composer; a local draft or a pending clear wins (apps/web/lib/hooks/useConversations.ts:783-788).
- Temporary chats: the SQL writes null (route.ts:223-228); the client does not send for them (hook:73-83).
- Empty draft clears the server copy and uses a clear token so it is not resurrected (hook:155-177; conversation-draft.ts:163).

**Incomplete**

- For a temporary chat the server answers saved: true with a null revision after nulling the draft, rather than refusing [inferred from route.ts:219-272]; the client never sends it.
- Drafts are saved only when the chat has a uuid id and exists on the server; a brand new unsaved chat uses browser storage only (hook:158; test useConversationDraftSync.test.tsx:193).

**Present but disconnected or switched off**

- Server draft sync is switched off while a device model is selected or when the chat holds device turns (use-conversation-draft-sync.ts:73-83).
- Migration 0219 header says NOT YET APPLIED; applied status unknown (0219_conversation_drafts.sql:3).

**Not available**

- Server drafts on mobile: the mobile draft store has no server call (apps/mobile/src/features/chat/draftStore.ts:1-60 imports MMKV and account epoch only); no mobile draft route use found by search.
- Drafts in CLI, Chrome and VS Code: not found (unknown).

## 4. Required behaviour

**Established requirements**

- S90.07: a half-written composer message is saved per conversation and restored, both locally and on the server so it follows the user across devices. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S90.07)
- Failed uploads and failed persistence preserve the draft; failed edits preserve the user's draft. (source: doc: docs/product/experience-contract.md:777 and :781 (W04, W09))
- Conversation draft state is part of the shared headless layer. (source: doc: docs/product/experience-contract.md:113)
- Draft writes do not change updated_at or server_version. (source: apps/web/app/api/chat/conversations/[id]/route.ts:212-218)

**Acceptance criteria**

1. Typing then reloading restores the text.
2. Typing on device A then opening the chat on device B (empty composer) shows the text.
3. A draft write leaves the chat's position in the sidebar unchanged.
4. A stale revision returns 409 and shows the Compare toast; choosing a side ends the conflict.
5. A draft longer than 20000 characters is refused, not cut.
6. A temporary chat stores no draft on the server.
7. Three failed saves show the Retry toast and no saved state.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The statement that the newer draft wins is wrong: the code compares revisions and asks the person (conversation-draft.ts:169-172; DraftConflictDialog.tsx:68-92).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add server draft sync to mobile to meet S90.07 across devices.
- [proposed] Return a refusal rather than saved:true for a temporary chat.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | PUT /api/chat/conversations/[id] (draft branch) | `apps/web/app/api/chat/conversations/[id]/route.ts` | Compare-and-swap draft write. |
| schema | 0219 draft columns | `apps/web/db/neon/0219_conversation_drafts.sql` | draft and draft_updated_at. |
| service | conversation-draft | `apps/web/features/chat/services/conversation-draft.ts` | Save queue, revisions, conflict parsing. |
| hook | useConversationDraftSync | `apps/web/features/chat/hooks/use-conversation-draft-sync.ts` | Debounce, retry, toasts, conflict state. |
| component | DraftConflictDialog | `apps/web/features/chat/components/DraftConflictDialog.tsx` | Here versus Elsewhere chooser. |
| service | composer-draft-storage | `apps/web/features/chat/components/Composer/composer-draft-storage.ts` | Browser storage of drafts per owner and chat. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Composer that holds the text. |
| hook | useConversations open chat | `apps/web/lib/hooks/useConversations.ts` | Reads the server draft when a chat opens. |
| store | web chat store drafts | `apps/web/shared/stores/web-chat-store.ts` | draftsByConversation and owner map. |
| screen | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Mounts the sync hook and the dialog. |
| schema | Draft constants | `packages/contracts/cloud-contracts/src/conversation-contract.json` | draftMaxLength and draftSaveDebounceMs. |
| store | mobile draftStore | `apps/mobile/src/features/chat/draftStore.ts` | On-device composer drafts (MMKV). |
| table | web_conversations | `apps/web/db/neon/0001_mvp_chat.sql` | Holds the draft columns. |
| service | temporary-chat-policy | `apps/web/lib/temporary-chat-policy.ts` | Temporary chat promises. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Text is written to the chat store and to browser storage as the person types. | device | apps/web/features/chat/components/Composer/composer-draft-storage.ts:130-132, :207-211 |
| After 1500 ms the hook builds a job per changed chat if saving is allowed. | device | use-conversation-draft-sync.ts:155-181, :308 |
| The service queues a PUT per chat with CSRF and the last revision. | device | conversation-draft.ts:120-168 |
| The server updates the row if the revision matches, or returns 409 with the stored draft. | our servers | apps/web/app/api/chat/conversations/[id]/route.ts:219-272 |
| The hook records the new revision, or opens the conflict flow, or retries up to three times. | device | use-conversation-draft-sync.ts:221-306 |
| On opening a chat from another device, the loaded draft fills an empty composer. | device | apps/web/lib/hooks/useConversations.ts:783-788 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Draft text and its revision time | web_conversations.draft and draft_updated_at | Yes, delivered with the chat read | Removed when the draft is emptied; goes with the chat; a delete clears nothing separately. |
| Local draft copy | browser storage key agi-composer-draft (owner and chat scoped) | No | Empty text is kept as a tombstone so an old draft does not return (composer-draft-storage.ts:130). |
| Mobile draft and attachments | phone key-value store, prefix composer-draft: | No server sync found | Provenance local or cloud owner (draftStore.ts:7-12). |

**Models and providers.** No model or provider is involved. A draft is never sent to a model until the person sends it.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; session-bound requests are cancelled if the session changes (conversation-draft.ts:145-151). |
| Permissions | Owner and workspace scope on the update. |
| Subscription | No allowance applies: draft writes are not counted as chats or messages. None found in the code. |
| Limits and metering | 20000 characters; 1500 ms debounce; 3 automatic attempts; retry delay 3000 ms doubling (use-conversation-draft-sync.ts:25-26, :241; conversation-contract.json:3-4). Rate bucket chat-conversation. |
| Feature flags | None found in the code. |
| Model compatibility | A device model blocks server sync (hook:80-82). |
| Provider restrictions | None. |
| Local mode | With a model on the device selected, or in a chat that holds device turns, non-empty drafts stay on the browser; clearing a stored draft still goes through (use-conversation-draft-sync.ts:73-83; test useConversationDraftSync.test.tsx:146-193). Mobile Local drafts stay on the phone (draftStore.ts). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Offline or server error | Result failed; retry after 3 s doubling, up to 3 times, then the Retry toast. | use-conversation-draft-sync.ts:234-258 |
| Conflict | 409 with the other text; Compare opens the dialog; choosing Use the other version replaces local text. | conversation-draft.ts:169-172; hook:276-302, :313-355 |
| Chat not on server yet | 404 means not_saved_yet; waits until the chat appears in the list. | conversation-draft.ts:174; hook:221-228 |
| Session or owner changed | Request retired; result superseded; nothing saved. | conversation-draft.ts:194; hook:211-220 |
| Temporary chat | Not sent; server would null it. | hook:73-79; route.ts:223-228 |
| Same text | Save of the stored text answers from the row without a conflict and writes nothing. | route.ts:256-270; route.concurrency.test.ts:212 |
| Too long | Client slices to the cap; server refuses over the cap. | conversation-draft.ts:163; conversations.ts:191 |
| Accessibility | Dialog sections carry aria-labels Here and Elsewhere; toasts have action buttons. | DraftConflictDialog.tsx:33, :75-86 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/chat-conversation-draft.test.ts`: Draft stored without touching sidebar order or edit guard, temporary chat draft not kept, clearing, 404 for foreign chat, cap refusal, real edit alongside a draft.
- `apps/web/app/api/chat/conversations/[id]/route.concurrency.test.ts`: Older tab cannot overwrite a newer draft; same-text save is not a conflict; next revision returned without changing the chat version.
- `apps/web/app/api/chat/conversations/[id]/route.draft-revision.live.test.ts`: Draft revisions against real Postgres timestamps (skipped unless a live database is configured).
- `apps/web/features/chat/services/conversation-draft.test.ts`: Revision carried forward, conflict keeps local text, empty draft counts as saved, older GET cannot roll back a revision, dispatch checks.
- `apps/web/features/chat/hooks/useConversationDraftSync.test.tsx`: Save after typing settles, no temporary chat draft, device-model holds, clear still sent, no resend of stored text.
- `apps/web/features/chat/components/Composer/ChatComposerNew.draftPersistence.test.tsx`: Composer draft persistence (file name; contents not opened).
- `apps/web/features/chat/components/Composer/ChatComposerNew.draftRestore.test.tsx`: Composer draft restore (file name; contents not opened).

**Test scenarios**

- **Reload restore**
  1. Type text in a saved chat.
  2. Wait 2 seconds.
  3. Reload.
  - Expected: Text is back.
- **Cross-device**
  1. Type on browser A, wait 2 s.
  2. Open the chat on browser B.
  - Expected: B shows the text in an empty composer.
- **Conflict**
  1. Open the same chat in two tabs.
  2. Type different text in each; save the first.
  3. Wait for the second to save.
  - Expected: Compare toast; dialog shows Here and Elsewhere; choosing resolves it.
- **Sidebar order**
  1. Note a chat's list position.
  2. Type a draft.
  - Expected: Position unchanged.
- **Temporary chat**
  1. Open a temporary chat.
  2. Type.
  - Expected: No draft request is sent.
- **Mobile**
  1. Type on mobile; open the chat on web.
  - Expected: Expected to be absent today; record as the gap.

**Where to look when it fails**

- HTTP 409 body: saved false, conflict true, current draft and draftUpdatedAt.
- Toast ids draft-sync-<id> and draft-conflict-<id>.
- Columns web_conversations.draft and draft_updated_at.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Mobile drafts do not follow the user across devices (no server call).** Affects: Mobile users; S90.07 cross-device.. Evidence: apps/mobile/src/features/chat/draftStore.ts:1-60. Work needed: Use the same PUT draft route from mobile with revisions.
- **Conflict handling is a dialog, not newer-wins as the draft says; the statement in the brief draft is wrong.** Affects: Documentation, testers.. Evidence: apps/web/features/chat/components/DraftConflictDialog.tsx:68-92. Work needed: Use the corrected description.
- **Server nulls a temporary chat's draft but still answers saved true.** Affects: Any client that sends one.. Evidence: apps/web/app/api/chat/conversations/[id]/route.ts:219-272. Work needed: Return a refusal.
- **Drafts on CLI, Chrome and VS Code not found.** Affects: Those apps.. Evidence: no draft sync code found. Work needed: Confirm and decide.

**Depends on**

- SYS-sync-and-continuity
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-local-inference
- SYS-execution-boundaries
- F090-01
- F090-03
- mode:cloud
- mode:local
- table:web_conversations
- surface:web
- surface:mobile

## Unknown

- Whether migration 0219 is applied in each environment.
- Whether the Tauri desktop or other apps have any draft sync.
- Server draft retention beyond chat lifetime.
- Whether a draft is ever read by the Electron desktop differently from the web app.
