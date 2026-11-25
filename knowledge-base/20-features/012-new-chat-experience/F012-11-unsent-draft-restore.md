---
id: "F012-11"
type: "feature"
title: "Unsent draft restore"
aliases: ["Unsent draft restore", "Draft persistence", "composer draft", "agi-composer-draft", "composer-draft:", "S12.23"]
area: "12 New-chat experience"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S12.23"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "store:agi-composer-draft", "store:composer-draft", "F012-08", "SYS-sync-and-continuity", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F012-11 Unsent draft restore

A typed but unsent message comes back after navigating away or reloading. Web saves it in browser local storage per conversation, mobile saves it on the device with its attachments, VS Code keeps it in webview state, Chrome keeps it for the browser session. The CLI does not restore drafts. Temporary chats never save drafts.

Area: [12. New-chat experience](README.md). Requirement items: [S12.23](../../10-requirements/capabilities/012-new-chat-experience.md#s1223).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Writes the text in the composer to storage while the person types and fills it back in when the same chat is opened again. (apps/web/features/chat/components/Composer/composer-draft-storage.ts:131) (apps/mobile/src/features/chat/draftStore.ts:148)

**Why it exists.** The brief requires that an unsent draft typed in a new chat is restored after navigation or reload (doc: knowledge-base/data/area-briefs/012-new-chat-experience.md, S12.23). The experience contract lists conversation draft state and says failed uploads preserve the draft (doc: docs/product/experience-contract.md:113, 777).

**Who uses it.** Anyone who writes long messages, switches chats, or whose tab reloads.

**Problems it solves**

- Lost text after an accidental reload or navigation.
- A private draft following the person into another chat.
- Stale drafts from old documents coming back.

**Use cases**

- Type a long question, open another page, come back and find it.
- Reload the browser tab and keep the text.
- On mobile, leave the chat screen and return.
- In VS Code, switch sidebar views and return to the draft.

## 2. User experience

**Where to find it**

- Web and desktop: the composer text box on /chat (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4098).
- Mobile: the chat input on the new-chat screen with draft key 'new-chat' (apps/mobile/app/(app)/(tabs)/chat.tsx:1416).
- VS Code: the sidebar chat input (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4247).
- Chrome: side panel input, restored with the notice text key spDraftRestored (apps/extension/src/side_panel.ts:10148).
- CLI: not restored (brief: missing; no draft code found in apps/cli/src for the input line).

**Before you start**

- Web: browser local and session storage available; otherwise nothing is restored.
- Chrome: a managed cloud owner and not a temporary chat (apps/extension/src/side_panel.ts:10123).

**Screens and controls**

- The normal composer; no separate control. Web shows a notice if the draft cannot be saved (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:693).

**Journey**

1. Type text in the composer.
2. The text is written to storage on each change.
3. Leave the page, reload or switch chat.
4. Return to the same chat: the text is filled back in.
5. Send or clear the box: the stored draft is emptied.

**What the person sees and gets**

- Chrome shows a restored notice or a failure notice (spDraftRestored, spDraftRestoreFailed) (apps/extension/src/side_panel.ts:10148-10154).
- Web shows the draft-not-saved notice when storage refuses a write (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4124).

**Settings**

- none found for drafts. Temporary chat turns saving off (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4118).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web storage: key prefix agi-composer-draft, record version 2, one key per owner id and conversation (or 'new-chat') in localStorage (apps/web/features/chat/components/Composer/composer-draft-storage.ts:1-24).
- Each document load gets a random owner id kept in sessionStorage; drafts of previous owners are copied to the new owner, and removed only when the load is a reload (apps/web/features/chat/components/Composer/composer-draft-storage.ts:60-110, 184).
- Empty text is stored as an empty record so an old or legacy draft cannot return (apps/web/features/chat/components/Composer/composer-draft-storage.ts:131).
- Composer parks outgoing draft in the chat store and reads the persisted draft on arrival (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4140-4155).
- Draft is cleared when the chat is temporary (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4118).
- Mobile stores draft text and attachments with provenance (local or cloud owner) in MMKV under 'composer-draft:' (apps/mobile/src/features/chat/draftStore.ts:5-13).
- VS Code keeps drafts per thread in webview state (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4247).
- Chrome keeps a draft per account, auth incarnation and conversation in session storage (apps/extension/src/side_panel.ts:10123-10145).

**Incomplete**

- Chrome draft is session storage, so it does not survive a browser restart [inferred from chrome.storage.session].
- Brief says Chrome is missing the draft; the code has it.

**Present but disconnected or switched off**

- Web draft is not saved in temporary chats (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4118).

**Not available**

- CLI draft restore (brief: missing).

## 4. Required behaviour

**Established requirements**

- An unsent draft typed in a new chat is restored when the user returns (after navigation or reload). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S12.23)
- Drafts are saved on the device per owner (web: browser local storage; mobile: chat input storage). (source: S12.23 brief)
- On reload old draft owners are retired so stale drafts do not come back in other documents. (source: S12.23 brief and apps/web/features/chat/components/Composer/composer-draft-storage.ts:184)
- Failed uploads preserve the draft and do not send. (source: W04 (doc: docs/product/experience-contract.md:777))

**Acceptance criteria**

1. Type in a new web chat, reload: the text is back.
2. Type in chat A, open chat B, return to A: A's text is back and B did not get it.
3. Send the message: reload shows an empty box.
4. In a temporary chat, no draft is stored and arming temporary mid-sentence clears the stored draft.
5. Mobile: type, leave the chat screen, return: text and attachments are back.
6. If storage refuses writes, the web shows the draft-not-saved notice.
7. Second tab opened as a new document does not lose the first tab's draft until a reload retires it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A draft typed while signed out of the cloud account on mobile stays under the local scope and is not shown to a cloud owner [inferred from provenance scoping].
- Sign-out cleanup of web drafts is intended (comment mentions sign-out cleanup) but the code was not found [inferred; unknown].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a CLI input-history draft file or document why it is skipped.
- [proposed] Make Chrome drafts survive a browser restart if desired.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | composer-draft-storage | `apps/web/features/chat/components/Composer/composer-draft-storage.ts` | Owner-scoped draft read, write, clear, migration and retirement. |
| component | ChatComposerNew draft effects | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Write on change, restore on mount or conversation switch, temporary clearing (lines 4098-4175). |
| store | web chat store draft content | `apps/web/shared/stores/web-chat-store.ts` | In-memory parked drafts (getDraftContent, draftOwnersByConversation). |
| hook | use-clipboard-draft-lifetime | `apps/web/features/chat/components/Composer/use-clipboard-draft-lifetime.ts` | Clipboard-derived draft lifetime. |
| store | browser localStorage agi-composer-draft | `apps/web/features/chat/components/Composer/composer-draft-storage.ts` | Where web drafts live; sessionStorage key agi-composer-draft:document-owner holds owner ids. |
| store | mobile draftStore | `apps/mobile/src/features/chat/draftStore.ts` | MMKV drafts with provenance and attachments (getDraft, setDraft, clearDraft). |
| service | mobile draftIdentity | `apps/mobile/src/features/chat/draftIdentity.ts` | Builds the identity key for a draft. |
| component | mobile ChatInput draft sync | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Reads and writes drafts, restores attachments, marks missing files (lines 462-780). |
| screen | mobile new chat draft key | `apps/mobile/app/(app)/(tabs)/chat.tsx` | Passes draftKey 'new-chat' and provenance (lines 282, 1416). |
| component | VS Code webview drafts | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | composerDrafts map saved through vscode.getState (line 4247). |
| component | Chrome bindComposerDraft | `apps/extension/src/side_panel.ts` | Draft key and restore from chrome.storage.session (line 10119). |
| test | ChatComposerNew.draftRestore.test | `apps/web/features/chat/components/Composer/ChatComposerNew.draftRestore.test.tsx` | Web restore behaviour. |
| test | ChatComposerNew.draftPersistence.test | `apps/web/features/chat/components/Composer/ChatComposerNew.draftPersistence.test.tsx` | Web persistence behaviour. |
| test | composer-draft-storage.tabs.test | `apps/web/features/chat/components/Composer/composer-draft-storage.tabs.test.ts` | Multi-tab owner behaviour. |
| test | mobile draft-store.test | `apps/mobile/__tests__/draft-store.test.ts` | Mobile store. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| On each change the composer writes the message to localStorage under the owner and conversation key. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4124 |
| On first use the module creates a random owner id and records it in sessionStorage with earlier owner ids. | device | apps/web/features/chat/components/Composer/composer-draft-storage.ts:150-170 |
| On a reload navigation, drafts of previous owners are copied then removed; on other loads they are copied and kept. | device | apps/web/features/chat/components/Composer/composer-draft-storage.ts:60-110, 184 |
| On arrival in a conversation, the composer takes the parked in-memory draft or reads the persisted one and fills the box. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4152-4156 |
| Mobile saves the text, queued follow-ups and attachments in MMKV with provenance. | device | apps/mobile/src/features/chat/components/ChatInput.tsx:762-775 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Draft text | Web localStorage keys agi-composer-draft:v2:<owner>:<conversation or new-chat> | No | Overwritten by empty text on send or clear; previous owners retired on reload |
| Draft owner ids | Web sessionStorage key agi-composer-draft:document-owner | No | Per tab session |
| Mobile draft and attachments | MMKV key prefix composer-draft: | No | clearDraft removes it (apps/mobile/src/features/chat/draftStore.ts:192) |
| VS Code drafts | Webview state | No | Until webview state is dropped |
| Chrome draft | chrome.storage.session | No | Until the browser session ends |

**Models and providers.** No model or provider takes part. Drafts never leave the device.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web: none for storage itself; the composer sits behind sign-in. Mobile: cloud drafts are scoped to the cloud owner id. Chrome: needs a managed cloud owner. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code; storage quota failure shows a notice on web. |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Drafts are device only in every mode; mobile Local drafts use scope 'local' (apps/mobile/src/features/chat/draftStore.ts:9). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Storage blocked or full | Write returns false and web shows 'draft not saved' notice if text exists. | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4124 |
| Corrupt record | Treated as empty record. | apps/web/features/chat/components/Composer/composer-draft-storage.ts:29-44 |
| Mid conversation switch | Write skipped until owner ref matches. | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4116 |
| Legacy v1 draft | Migrated and old key removed. | apps/web/features/chat/components/Composer/composer-draft-storage.ts:112-128 |
| Mobile attachment file missing | Marked unavailable on restore. | apps/mobile/src/features/chat/components/ChatInput.tsx:757 |
| Chrome restore fails | Notice spDraftRestoreFailed. | apps/extension/src/side_panel.ts:10152 |
| Offline | Not relevant: drafts are local. | apps/web/features/chat/components/Composer/composer-draft-storage.ts:131 |
| Server render | currentStorage returns null so nothing is read. | apps/web/features/chat/components/Composer/composer-draft-storage.ts:150 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ChatComposerNew.draftRestore.test.tsx`: Restore on arrival.
- `apps/web/features/chat/components/Composer/ChatComposerNew.draftPersistence.test.tsx`: Write on change and clearing.
- `apps/web/features/chat/components/Composer/composer-draft-storage.tabs.test.ts`: Owner migration across tabs and reload.
- `apps/mobile/__tests__/draft-store.test.ts`: Mobile draft store.
- `apps/mobile/__tests__/WritingDraft.test.tsx`: Mobile writing draft.
- `apps/extension/__tests__/composer-admission-retention.test.ts`: Chrome draft rules (mentions composer-draft).
- `apps/extension-vscode/src/__tests__/composerControls.webview.test.ts`: VS Code composer controls (draft coverage not confirmed).

**Test scenarios**

- **Web reload**
  1. Type text in a new chat.
  2. Reload the tab.
  - Expected: Text returns and the old owner key is removed.
- **Web two chats**
  1. Type in chat A.
  2. Open chat B and type something else.
  3. Return to A.
  - Expected: Each shows only its own draft.
- **Send clears**
  1. Type and send.
  2. Reload.
  - Expected: Box is empty.
- **Temporary**
  1. Type text.
  2. Turn on temporary chat.
  3. Reload.
  - Expected: Text is gone.
- **Mobile return**
  1. Type with an attachment.
  2. Leave the screen.
  3. Return.
  - Expected: Text and attachment are restored.
- **Storage refused**
  1. Disable local storage in the browser.
  2. Type.
  - Expected: Draft-not-saved notice appears.

**Where to look when it fails**

- Browser localStorage keys beginning agi-composer-draft.
- sessionStorage key agi-composer-draft:document-owner.
- Mobile MMKV keys beginning composer-draft:.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/012-new-chat-experience.md](../../70-qa/test-plans/web/012-new-chat-experience.md)
- Desktop: [70-qa/test-plans/desktop/012-new-chat-experience.md](../../70-qa/test-plans/desktop/012-new-chat-experience.md)
- Mobile: [70-qa/test-plans/mobile/012-new-chat-experience.md](../../70-qa/test-plans/mobile/012-new-chat-experience.md)
- VS Code: [70-qa/test-plans/vscode/012-new-chat-experience.md](../../70-qa/test-plans/vscode/012-new-chat-experience.md)
- Chrome: [70-qa/test-plans/chrome/012-new-chat-experience.md](../../70-qa/test-plans/chrome/012-new-chat-experience.md)

## 10. Gaps and dependencies

- **CLI does not restore an unsent draft.** Affects: CLI. Evidence: brief S12.23; no draft code for the input line found in apps/cli/src. Work needed: Decide if needed; add a draft file.
- **Brief marks Chrome missing but code restores drafts in the session.** Affects: Chrome. Evidence: apps/extension/src/side_panel.ts:10119. Work needed: Update brief; decide on cross-restart persistence.
- **Cleanup of web drafts on sign-out is mentioned in a comment but not found.** Affects: Web, Desktop. Evidence: apps/web/features/chat/components/Composer/composer-draft-storage.ts:121. Work needed: Verify and test.
- **Brief line numbers for web draft code are stale.** Affects: Brief readers. Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4098. Work needed: Refresh references.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- store:agi-composer-draft
- store:composer-draft
- F012-08
- SYS-sync-and-continuity
- SYS-shared-ui-and-design

## Unknown

- Whether web drafts are cleared on sign-out.
- Whether VS Code drafts survive window reload (uses vscode.getState; durability not verified).
- Draft size limits.
- Whether desktop uses extra storage beyond the hosted web.
