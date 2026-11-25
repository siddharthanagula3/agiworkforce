---
id: "F069-04"
type: "feature"
title: "Drag, drop, paste and copy"
aliases: ["Drag and drop uploads", "Paste", "Clipboard", "Copy message", "Attach clipboard", "DragDropOverlay", "S69.06", "S69.07"]
area: "69 Web application"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "partly seen (1 of 2)", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S69.06", "S69.07"]
depends_on: ["surface:web", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "file:packages/platform/utils/src/composerPaste.ts", "F069-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F069-04 Drag, drop, paste and copy

On the web chat page a person can drop files onto the window, paste text, code or files into the composer, and copy a message out. A 'Drop files here' overlay shows while dragging. Large pastes become a file. 'Attach clipboard' exists only inside the desktop host. Copy shows a toast but does not catch a clipboard refusal.

Area: [69. Web application](README.md). Requirement items: [S69.06](../../10-requirements/capabilities/069-web-application.md#s6906), [S69.07](../../10-requirements/capabilities/069-web-application.md#s6907).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (1 of 2) |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Moves content into and out of a message: drops and pastes go to one attachment intake that applies file count and size limits; copy writes the message text to the system clipboard (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2301-2303; apps/web/features/chat/components/messages/MessageBubble.tsx:2273-2283).

**Why it exists.** Leaders let people drag, paste and copy; the product guidance asks for drag-and-drop, paste and per-file validation (doc: docs/product/competitive-guidance.md:259).

**Who uses it.** Web chat users.

**Problems it solves**

- Attaching files without a file dialog.
- Huge pastes freezing the text box (text over 10,000 characters becomes a file) (packages/platform/utils/src/composerPaste.ts:12,45-55).
- Pasted code losing its formatting (fenced and undoable) (ChatComposerNew.tsx:2372-2396).

**Use cases**

- Drag a PDF onto the chat window.
- Paste a screenshot into the composer.
- Paste 20 pages of text and get a 'Pasted text.txt' attachment with an undo.
- Copy an assistant answer as plain text.

## 2. User experience

**Where to find it**

- surface:web: the chat page composer and any place the window accepts a file drop (DragDropOverlay is mounted by the composer, ChatComposerNew.tsx:4893).
- surface:web: copy control on each message with accessible name 'Copy message' (MessageBubble.tsx:3750-3751).
- Desktop host only: the '+' menu row 'Attach clipboard' (ComposerPlusMenu.tsx:176, shown when showDesktopActionRows is true, ChatComposerNew.tsx:6018-6021).

**Before you start**

- Composer must not be disabled or the trial exhausted for paste (ChatComposerNew.tsx:2373).

**Screens and controls**

- Full-screen overlay: 'Drop files here', 'Release to attach to your message', and 'Up to N files' when N is more than 1 (DragDropOverlay.tsx:109-115).
- Composer paste handler (ChatComposerNew.tsx:2372-2399).
- Copy button; label changes to 'Message copied' (MessageBubble.tsx:3751).

**Journey**

1. Drag a file over the window; the overlay appears (DragDropOverlay.tsx:27-30).
2. Release; the files go to the attachment intake and show as chips (ChatComposerNew.tsx:2301-2303).
3. Or paste: the shared decision says files, a large-text file, or plain text (composerPaste.ts:131-150).
4. Code pasted as text is wrapped in a code fence with an undo (ChatComposerNew.tsx:2383-2393).
5. Click copy on a message; the text is written and a toast says 'Copied to clipboard' (MessageBubble.tsx:2273-2282).

**What the person sees and gets**

- Overlay, attachment chips, notices naming refused files (apps/web/features/chat/hooks/use-attachments.ts:447-448).
- Toast 'Copied to clipboard' and a 2-second 'copied' state (MessageBubble.tsx:2279-2286).
- Notices for the clipboard attach row: 'Your clipboard is empty, so there was nothing to attach.' and a truncation notice (ChatComposerNew.tsx:2321-2328).

**Settings**

- Per-plan attachment limits come from billing policy: 'Up to N files, <size> each' (ChatComposerNew.tsx:915-922; apps/web/features/chat/lib/composer-attachment-limits.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Window-level drag listeners with a depth counter and a Files check (DragDropOverlay.tsx:20-60).
- Single intake addChatAttachments for drops, pastes, mentions and clipboard (ChatComposerNew.tsx:2301-2303, 3065, 3082).
- Shared paste decision used by the web composer and other composers (composerPaste.ts:131; ChatComposerNew.tsx:2376-2379).
- Large paste threshold 10,000 characters turns text into a file (composerPaste.ts:12).
- Copy: user messages copy as written, assistant messages are flattened from rich blocks (MessageBubble.tsx:2274-2276).
- Share fallback has a try and catch (MessageBubble.tsx:2287-2305).

**Incomplete**

- Copy: handleCopy awaits navigator.clipboard.writeText with no try and catch, so a refusal (for example no permission or no secure context) rejects with no message to the person (MessageBubble.tsx:2273-2276). Compare handleShare, which has a catch (2299-2304).

**Present but disconnected or switched off**

- 'Attach clipboard' reads the clipboard through the desktop host only (readHostClipboard, apps/web/features/desktop-host/lib/runtime-client.ts:365). It is hidden in a normal browser (ChatComposerNew.tsx:6018). The draft said it works on the web; that is wrong.

**Not available**

- Drag-and-drop and paste in other apps are not covered here; the brief gives no status for them. Only the paste decision is shared with other surfaces (composerPaste.ts in packages/platform/utils).

## 4. Required behaviour

**Established requirements**

- Dragging files onto the chat page shows a drop overlay and attaches the dropped files to the composer. (source: S69.06)
- Pasting text, code or files into the composer is handled, and a message can be copied to the system clipboard. (source: S69.07)
- Support multiple eligible file types, drag-and-drop, paste, mobile pickers, attachment removal, and per-file validation. (source: doc: docs/product/competitive-guidance.md:259)
- The clipboard is read only on a person's click in the desktop host, never in the background. (source: ChatComposerNew.tsx:2305-2310)
- The paste decision is shared so one clipboard gives the same result on web, the unified composer and the extension. (source: ChatComposerNew.tsx:2374-2378)

**Acceptance criteria**

1. Dragging a file over the window shows the overlay with 'Drop files here'; releasing attaches it.
2. Dropping more files than the plan allows attaches up to the limit and names each refused file.
3. Pasting an image attaches it; pasting under 10,000 characters of text inserts it as text.
4. Pasting over 10,000 characters attaches 'Pasted text.txt' and offers an undo.
5. Copy on an assistant message puts plain text on the clipboard and shows 'Copied to clipboard'.
6. When the clipboard write is refused, the person sees an error message (currently fails: see gaps).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The same refusal handling used by share should apply to copy [inferred from MessageBubble.tsx:2299-2304].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Wrap handleCopy in a try and catch and show 'This message could not be copied'.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | DragDropOverlay | `apps/web/features/chat/components/Composer/DragDropOverlay.tsx` | Window drag listeners and overlay. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | handleFileDrop, handlePaste, clipboard attach, undo notices. |
| hook | use-attachments | `apps/web/features/chat/hooks/use-attachments.ts` | Attachment intake with count, size and budget refusals. |
| service | composerPaste | `packages/platform/utils/src/composerPaste.ts` | Shared paste decision and large-paste rule. |
| config | Attachment limits | `apps/web/features/chat/lib/composer-attachment-limits.ts` | Per-plan file count and size. |
| component | ComposerPlusMenu | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | 'Attach clipboard' row for the desktop host. |
| service | readHostClipboard | `apps/web/features/desktop-host/lib/runtime-client.ts` | Reads the clipboard through the desktop host. |
| hook | use-clipboard-draft-lifetime | `apps/web/features/chat/components/Composer/use-clipboard-draft-lifetime.ts` | Lifetime of clipboard-derived drafts. |
| component | MessageBubble copy | `apps/web/features/chat/components/messages/MessageBubble.tsx` | handleCopy and handleShare (lines 2273-2305). |
| config | Billing attachment limits | `packages/contracts/types/src/billing-catalog.ts` | maxAttachmentsPerMessage per plan (lines 570-577). |
| test | DragDropOverlay test | `apps/web/features/chat/components/Composer/DragDropOverlay.test.tsx` | Overlay. |
| test | Large paste test | `apps/web/features/chat/components/Composer/ChatComposerNew.largePaste.test.tsx` | Large paste to file. |
| test | Code paste test | `apps/web/features/chat/components/Composer/ChatComposerNew.codePaste.test.tsx` | Code fence and undo. |
| test | composerPaste test | `packages/platform/utils/src/__tests__/composerPaste.test.ts` | Shared decision. |
| test | Copy rich blocks test | `apps/web/features/chat/components/messages/MessageBubble.copyRichBlocks.test.tsx` | Copy of rich blocks. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Window drag events show the overlay; drop sends File objects to the composer. | device | DragDropOverlay.tsx:20-60 |
| The intake checks file count and size against the plan limits and lists refused files. | device | use-attachments.ts:425-447 |
| Accepted files upload with the message when it is sent. | device and our servers | WebChatPage.tsx:7686-7688 props name an attachment upload attempt; upload route not traced |
| Paste: the shared function decides text, files or large-text file. | device | composerPaste.ts:131-150 |
| Copy writes to the system clipboard through the browser. | device | MessageBubble.tsx:2274-2276 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Dropped or pasted files | Memory in the page until send, then server object storage (not traced) | After send | unknown |
| Clipboard text | System clipboard | No | Not kept by the app |

**Models and providers.** Not involved in drop, paste or copy. Whether a file is usable depends on the chosen model's input types (composer attachment conflict reason exists, ChatComposerNew.tsx:714).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in chat composer. |
| Permissions | Browser clipboard write for copy; no prompt for paste events. The host asks the person for clipboard permission once for 'Attach clipboard' (ChatComposerNew.tsx:2305-2310). |
| Subscription | File count and size per plan (ChatComposerNew.tsx:915-922; billing-catalog.ts:570-577). |
| Limits and metering | Count, per-file size, per-message and inline budgets (use-attachments.ts:425-440). A large paste limit of 10,000 characters (composerPaste.ts:12). |
| Feature flags | none found in the code |
| Model compatibility | Some modes refuse some attachments ('This attachment cannot be sent with the mode that is on.', ChatComposerNew.tsx:714). |
| Provider restrictions | none found in the code |
| Local mode | Drop, paste and copy run on the device and need no server. Whether a local model accepts the attachment types is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Drag leaves the window | Overlay hides when the depth counter reaches 0. | DragDropOverlay.tsx:36-38 |
| Non-file drag | Overlay shows only when the drag carries Files. | DragDropOverlay.tsx:27 |
| Too many or too big | Excess files refused and named. | use-attachments.ts:425-447 |
| Picture metadata | A picture's metadata removal runs before the file lands; send waits for it. | ChatComposerNew.tsx:2342-2344 |
| Clipboard empty | Notice 'Your clipboard is empty, so there was nothing to attach.' | ChatComposerNew.tsx:2321-2322 |
| Clipboard text truncated | Notice that only the first part was attached. | ChatComposerNew.tsx:2325-2328 |
| Clipboard refusal on copy | not handled in the code (unhandled rejection). | MessageBubble.tsx:2273-2276 |
| Composer disabled or trial exhausted | Paste is ignored. | ChatComposerNew.tsx:2373 |
| Accessibility | Copy control label flips to 'Message copied'. | MessageBubble.tsx:3751 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/DragDropOverlay.test.tsx`: Overlay show and hide.
- `apps/web/features/chat/components/Composer/ChatComposerNew.largePaste.test.tsx`: Large paste becomes a file.
- `apps/web/features/chat/components/Composer/ChatComposerNew.codePaste.test.tsx`: Code paste fence and undo.
- `apps/web/features/chat/components/Composer/ChatComposerNew.attachmentSources.test.tsx`: Attachment sources including clipboard.
- `apps/web/features/chat/components/Composer/useClipboardDraftLifetime.test.tsx`: Clipboard draft lifetime.
- `packages/platform/utils/src/__tests__/composerPaste.test.ts`: Shared paste decision.
- `apps/web/features/chat/components/messages/MessageBubble.copyRichBlocks.test.tsx`: Copy of rich blocks.
- `apps/web/e2e/chat-document-attachment.spec.ts`: Document attachment in a browser.

**Test scenarios**

- **Drop**
  1. Drag two files over /chat.
  2. Release.
  - Expected: Overlay shows then two chips appear.
- **Over the limit**
  1. Drop more files than the plan allows.
  - Expected: Allowed ones attach; refused ones are named.
- **Large paste**
  1. Paste more than 10,000 characters.
  - Expected: 'Pasted text.txt' chip and an undo notice; undo restores text.
- **Copy**
  1. Click copy on an assistant message.
  2. Paste elsewhere.
  - Expected: Plain text matches; toast shown.
- **Copy refused**
  1. Block clipboard-write permission for the site.
  2. Click copy.
  - Expected: Should show an error; current code shows none.

**Where to look when it fails**

- Browser console unhandled rejection from navigator.clipboard.writeText.
- Refusal notices from use-attachments.ts.
- DragDropOverlay behaviour in its test file.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/069-web-application.md](../../70-qa/test-plans/web/069-web-application.md)

## 10. Gaps and dependencies

- **Copy has no failure handling.** Affects: Web users when the browser refuses clipboard write. Evidence: MessageBubble.tsx:2273-2276. Work needed: Add try and catch with an error toast and a test.
- **'Attach clipboard' is desktop-host only; no plain-browser equivalent.** Affects: Web users outside the desktop app. Evidence: ChatComposerNew.tsx:6018; runtime-client.ts:365. Work needed: Decide if a browser clipboard-read button is wanted.
- **Upload and storage path of dropped files not traced here.** Affects: Documentation. Evidence: WebChatPage.tsx:7686-7688. Work needed: Trace and add to the file storage page.

**Depends on**

- surface:web
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- file:packages/platform/utils/src/composerPaste.ts
- F069-01

## Unknown

- Where dropped files are uploaded and stored, and how long.
- Whether a local model accepts each attachment type.
- Behaviour on browsers without the Clipboard API.
