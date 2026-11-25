---
id: "F014-11"
type: "feature"
title: "Limits, duplicates and refusals"
aliases: ["Attachment limits", "Refusal notice", "Duplicate file", "Batch summary", "Partial extraction notice", "Locked PDF notice", "Per-file error", "S14.23", "S14.24", "S14.25", "S14.31", "S14.32", "S14.33"]
area: "14 Attachment intake components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (1 of 6)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S14.23", "S14.24", "S14.25", "S14.31", "S14.32", "S14.33"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:packages/contracts/cloud-contracts/src/chat-attachment-policy.json", "file:apps/web/features/chat/hooks/use-attachments.ts", "F014-09", "F014-10", "F014-12", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-chat-turn-pipeline"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F014-11 Limits, duplicates and refusals

Tells the person when a file is refused, cut short, locked, a duplicate or part of a partly refused batch. Web and desktop name each file with its reason and summarize batches. Phone, CLI, VS Code and Chrome each have their own wording and fewer batch or duplicate checks.

Area: [14. Attachment intake components](README.md). Requirement items: [S14.23](../../10-requirements/capabilities/014-attachment-intake-components.md#s1423), [S14.24](../../10-requirements/capabilities/014-attachment-intake-components.md#s1424), [S14.25](../../10-requirements/capabilities/014-attachment-intake-components.md#s1425), [S14.31](../../10-requirements/capabilities/014-attachment-intake-components.md#s1431), [S14.32](../../10-requirements/capabilities/014-attachment-intake-components.md#s1432), [S14.33](../../10-requirements/capabilities/014-attachment-intake-components.md#s1433).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 6) |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Applies size, type, count and total limits to every added file, spots duplicates, and says plainly what was left out and why. It also warns when a file's text was cut or a PDF is locked.

**Why it exists.** Without a notice a person sends a prompt about a file the model never saw. The web code records the refusal on the turn so the model cannot invent contents (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3904).

**Who uses it.** Anyone attaching files.

**Problems it solves**

- Silent drops
- Sending the same file twice
- Model answering about a file it did not receive

**Use cases**

- Add a 30 MB file on a plan with a lower cap; see the cap and the file name.
- Add 25 files; see 'Attached 20 of 25 files' with the refused names.
- Add a locked PDF; see that it is password protected.
- Attach a very long document; the reply shows only part of it was read.

## 2. User experience

**Where to find it**

- Web and desktop: a notice above the composer from useAttachments onError (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:953) and a notice on the sent message for cut text (apps/web/features/chat/components/messages/MessageBubble.tsx:845).
- Phone: system alerts titled 'Attachment not added', 'Some attachments not added', 'Already attached', 'Some files are already attached' (apps/mobile/src/features/chat/components/ChatInput.tsx:235, :657).
- CLI: lines printed by /files and /attach (apps/cli/src/claude_parity.rs:389-414; apps/cli/src/tui/tui_app.rs:880).
- VS Code: a failed grey chip with the reason, and a warning message from the file picker (webviewContent.ts:7660, :8476-8500; ChatStateManager.ts:3996-4040).
- Chrome: notices above the composer (apps/extension/src/side_panel.ts:10185-10240).

**Before you start**

- A file added to the draft.

**Screens and controls**

- Web single refusals: '"{name}" is empty. Add content to the file and attach it again.'; 'is too large (X). Maximum is Y.' or 'N accounts can upload files up to Y each.'; 'has an unsupported file type'; 'Maximum N files allowed.'; 'was not attached. Files on one message must total X or less.'; '"{name}" is already attached.' (apps/web/features/chat/hooks/use-attachments.ts:161-197).
- Web also: image too large, large-file kind limit, storage full ('Delete files in your Library to make room.'), needs a project ('Files over 25 MB go into a project...'), picture location details could not be removed (use-attachments.ts:96-110, :161-197).
- Web batch: 'Attached N of M files. Not attached: "a" (reason), ...' or 'None of the M files were attached: ...' (use-attachments.ts:222-245).
- Cut text: 'Only part of {name} was read because it is too long to read in full.' (packages/contracts/cloud-contracts/src/chat-attachment-truncation.ts:50-58).
- Locked PDF: '{name} is password protected. Remove the password and upload it again.' (apps/web/lib/server/pdf-attachment-content.ts:46).
- Phone limits text: 'was not added. A message can carry up to N files.' and 'Files in one message can add up to X.' (attachmentValidation.ts:141-175).
- CLI: 'attached:', 'already attached:', 'truncated to budget:', 'failed: path (reason)' (claude_parity.rs:395-408).

**Journey**

1. Add one or several files.
2. Each file is checked in order: duplicate, count, empty, size, type, image size, plan budget.
3. Accepted files become chips; refused ones are named in one notice with reasons.
4. On send, refused names are added to the turn as notes so the model knows (web).
5. If the server cut long text, the sent message shows a notice naming the file.

**What the person sees and gets**

- Notices as above.
- Turn note '[attachment unavailable: {file} ...]' appended on the model side (apps/web/lib/chat-attachment-policy.ts:33-62).

**Settings**

- Plan limits and the account's published limits change the numbers (apps/web/features/chat/lib/composer-attachment-limits.ts:12-29).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and desktop: full reason set, batch summary, duplicate by name, size, modified date and type, counts held files, refusal recorded for the turn (apps/web/features/chat/hooks/use-attachments.ts:148-240, :332-480).
- Web: server cut-text header becomes a notice on the user message (apps/web/lib/hooks/useChatStream.ts:4701-4710; apps/web/features/chat/components/messages/MessageBubble.tsx:845).
- Web: locked PDF in a live send raises a 400 'unreadable_attachment' with the locked-PDF text (apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:661, :685-688; apps/web/lib/server/pdf-attachment-content.ts:296-298).
- Phone: validation with destination limits, count and total checks, duplicate alert, partial-text notice via stream header, locked PDF note in local parsing (apps/mobile/src/features/chat/utils/attachmentValidation.ts; ChatInput.tsx:619-670; apps/mobile/services/streaming.ts:739; apps/mobile/stores/chat/chatExecutionStore.ts:3533).
- CLI: '/files' reports added, already attached, truncated and failed; budget 120,000 characters total and 40,000 per file (apps/cli/src/agent/mod.rs:1467-1468); '/attach' reports a duplicate and an unsupported type.
- VS Code: unsupported binary, over 10 MB, batch of 8, text cut at 40,000 characters shown as 'Truncated' (ChatStateManager.ts:275, :2204-2221; webviewContent.ts:7629-7640).
- Chrome: unsupported, too large, empty, too many (5), over total, and model image limit notices (side_panel.ts:10185-10240; freeTrialClient.ts:103-105).

**Incomplete**

- Phone has no 'N of M' batch line; its alert lists the reason text per refused file (ChatInput.tsx:660-667).
- VS Code duplicate check exists only in the file picker and is silent; drag and paste have none (ChatStateManager.ts:4017-4026).
- VS Code picker warnings are generic ('Some files exceed the attachment size limit.') and do not name files (ChatStateManager.ts:4014).
- Chrome has no duplicate check and no batch summary (side_panel.ts:10343-10400).
- How the web composer shows the locked-PDF 400 to the person was not traced.

**Present but disconnected or switched off**

- none found

**Not available**

- Duplicate check: VS Code drag and paste, Chrome.
- Batch summary: VS Code, Chrome, phone count line.

## 4. Required behaviour

**Established requirements**

- Adding a file type the chat cannot read shows a notice naming the file and why. (source: brief S14.24)
- When only part of a file could be read or it was cut to a size limit, the user is told. (source: brief S14.23)
- A password-protected file produces a notice that says it is locked and how to fix it. (source: brief S14.25)
- Adding the same file twice is detected and handled visibly. (source: brief S14.31)
- A failing file shows its error against that file, not one generic message. (source: brief S14.32)
- After adding several files the user sees one summary of what was attached and what was refused. (source: brief S14.33)
- Type, size, count and storage gates use their canonical limits. (source: doc: docs/product/requirements.md (test row W04))
- Limits in the policy file: 25 MiB per file, 20 MiB per image, 25 MiB per message, 20 files; without the server handshake 12 MiB and 10 files; a plan can lower them. (source: code: packages/contracts/cloud-contracts/src/chat-attachment-policy.json:2-12; apps/web/features/chat/lib/composer-attachment-limits.ts:12-29)

**Acceptance criteria**

1. An empty file is refused on web with 'is empty' and the file name.
2. A file above the plan limit is refused with the plan name and limit where the plan is known.
3. Adding the same file twice on web gives '"{name}" is already attached.' and one chip.
4. Adding 22 files at once on a 20-file plan attaches 20 and names the other 2.
5. A locked PDF sent live returns the message 'is password protected. Remove the password and upload it again.'
6. On phone, adding the same file twice shows the 'Already attached' alert.
7. In the CLI, '/files a.txt' twice prints 'already attached: ...' the second time.
8. On Chrome, a sixth file is refused with the 'Only 5 files' notice.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Limits are one policy file shared by web, phone and Chrome, so numbers should match across them [inferred from imports of the same constants].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a duplicate check and a batch summary to VS Code and Chrome.
- [proposed] Name the refused files in the VS Code picker warning.
- [proposed] Give the phone a single 'Attached N of M files' line.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useAttachments intake | `apps/web/features/chat/hooks/use-attachments.ts` | All web checks, notices and the batch summary. |
| service | attachment-metadata | `apps/web/features/chat/lib/attachment-metadata.ts` | Picture location removal and draft refusal notes (chatDraftRefusalNotes). |
| config | chat-attachment-policy.json | `packages/contracts/cloud-contracts/src/chat-attachment-policy.json` | Limits, accepted types, large-file ceilings, limits without handshake. |
| service | chat-attachments contract | `packages/contracts/cloud-contracts/src/chat-attachments.ts` | Limit constants, type resolver and per-kind size refusal. |
| service | composerAttachmentLimits | `apps/web/features/chat/lib/composer-attachment-limits.ts` | Uses published limits or the plan's. |
| store | web-auth-store attachmentLimits | `apps/web/shared/stores/web-auth-store.ts` | Holds the account's published limits from the billing response (line 149). |
| service | chat-attachment-hydration | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Server reads files at send, flags cut text, raises unreadable errors. |
| service | pdf-attachment-content | `apps/web/lib/server/pdf-attachment-content.ts` | PDF reading and password-protected error. |
| service | chat-attachment-truncation | `packages/contracts/cloud-contracts/src/chat-attachment-truncation.ts` | Header X-AGI-Attachments-Truncated and notice wording. |
| component | MessageBubble truncation notice | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Shows cut-text notice on a message (845); phone has its own MessageBubble. |
| service | attachmentValidation (phone) | `apps/mobile/src/features/chat/utils/attachmentValidation.ts` | Phone limits, types, count and total. |
| service | attachmentContext (phone) | `apps/mobile/services/attachmentContext.ts` | Local extraction with locked-PDF and partial-read notes (35, 44). |
| command | attach_context_files | `apps/cli/src/agent/mod.rs` | CLI /files engine: duplicates, truncation budget, failures (1462). |
| service | attachFiles handler (VS Code) | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Size, type, text cut for dropped files; picker checks. |
| service | admitComposerDocument (Chrome) | `apps/extension/src/side_panel.ts` | Chrome limits and notices (10185-10240). |
| test | useAttachments.refusals | `apps/web/features/chat/hooks/__tests__/useAttachments.refusals.test.tsx` | Web refusal tests. |
| test | attachmentValidation phone tests | `apps/mobile/src/features/chat/utils/__tests__/attachmentValidation.admit.test.ts` | Phone admit tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The device checks each file against limits and types before any upload. | device | apps/web/features/chat/hooks/use-attachments.ts:332-420 |
| Refusals are stored as a draft record and appended to the outgoing turn as notes. | device | use-attachments.ts:242-256; ChatComposerNew.tsx:3904-3907 |
| The upload client repeats the type and size checks. | device | managed-cloud-chat-attachments-client.ts:344-352 |
| At send the server reads each file, cuts long text, and refuses an unreadable or locked PDF. | our servers | chat-attachment-hydration.ts:661, :685-688; pdf-attachment-content.ts:296 |
| The server names cut files in a response header; the client stores them on the user message and shows the notice. | our servers | chat-attachment-truncation.ts:1-48; useChatStream.ts:4701-4710 |
| Phone Local mode parses on the device and adds locked or partial notes to the text sent to the on-device model. | device | apps/mobile/services/attachmentContext.ts:25-47 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Draft refusal records | Hook state | No | Forgotten with the draft (use-attachments.ts:549-562) |
| truncatedAttachments names on a message | Message metadata in the client store | unknown | unknown |

**Models and providers.** Cut length and PDF handling depend on the server reader, not a model choice; whether a model can read the file is F014-12.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Limit checks run without sign-in on the device; the server reading needs the signed-in turn. |
| Permissions | none found in the code |
| Subscription | Plan lowers the file size and count: getPlanMaxAttachmentBytes and getPlanMaxAttachmentsPerMessage (composer-attachment-limits.ts:12-29); the account's published limits win (line 18). A large-file offer is per account handshake. |
| Limits and metering | 25 MiB file, 20 MiB image, 25 MiB message, 20 files; 12 MiB and 10 files without handshake; large files up to 500 MiB each, 2 GiB per message; picture limit 5,000,000 base64 bytes and 8,000 px edge for model images (policy file). VS Code 10,000,000 bytes, batch 8, 40,000 characters. Chrome 5 files. CLI 120,000 and 40,000 characters; mention file 256 KiB. |
| Feature flags | Large files depend on the handshake offer (use-attachments.ts:277-283). |
| Model compatibility | A model may allow fewer images: phone imageLimitRefusal at send (attachmentValidation.ts:188; chatExecutionStore.ts:2455); Chrome notice for one-image models (side_panel.ts:10190-10200). |
| Provider restrictions | none found in the code |
| Local mode | Web and desktop on-device model: every attachment refused. Phone Local mode: device limit only and no count or total (attachmentValidation.ts:34-40); locked PDF becomes a note to the on-device model, not a screen notice (attachmentContext.ts:44). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty file | Named notice on web, phone, Chrome. | use-attachments.ts:162; attachmentValidation.ts:98; messages.json spAttachmentEmpty |
| Duplicate | Web by name, size, date and type; phone by asset id, uri or metadata; CLI by path or label; VS Code picker silent; Chrome none. | use-attachments.ts:148-150; ChatInput.tsx:624-640; agent/mod.rs:1496-1502; ChatStateManager.ts:4017-4026 |
| Too many files | First N taken, rest named. | use-attachments.ts:379-383 |
| Picture whose location details cannot be removed | Refused with its own reason. | use-attachments.ts:96-110, :196-198 |
| Locked PDF | Live send fails with the locked message (400); on phone Local a model note. | chat-attachment-hydration.ts:685-688; attachmentContext.ts:44 |
| Cut text | Notice on the user's message. | MessageBubble.tsx:845 |
| Refused file but prompt names it | Note added to the turn. | ChatComposerNew.tsx:3904-3907 |
| Offline or timeout | not handled in this feature's checks found; limit checks are local. | use-attachments.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/hooks/__tests__/useAttachments.refusals.test.tsx`: Empty, named reasons, wrong type versus too large, image ceiling, project hint, plan name, 20 files, refusal rides one turn, message total, give-back on remove.
- `packages/contracts/cloud-contracts/src/__tests__/chat-attachment-limits.test.ts`: Limit policy (titles not read in full).
- `packages/contracts/cloud-contracts/src/__tests__/chat-attachment-limits-without-handshake.test.ts`: Limits before the handshake (titles not read in full).
- `apps/mobile/src/features/chat/utils/__tests__/attachmentValidation.admit.test.ts`: Cloud count and total, Local keeps device limit, size refusal before counting.
- `apps/mobile/src/features/chat/components/__tests__/ChatInput.attachmentIdentity.test.tsx`: Duplicate identity rules on phone.
- `apps/mobile/__tests__/attachment-context.test.ts`: Extracted text, binary honest reference, empty, truncation, partial notice.
- `apps/web/lib/server/pdf-attachment-content.test.ts`: PDF extraction (titles not read in full).
- `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.test.ts`: Server hydration (titles not read in full).
- `apps/extension/__tests__/side_panel-attachment-caps.test.ts`: Chrome count cap and paste refusal.
- `apps/extension-vscode/src/__tests__/webviewAttachFiles.test.ts`: Batch of 8, 10 MB ceiling, filename and URL checks.
- `apps/web/e2e/chat-attachment-refusal-and-image-edit.spec.ts`: Refusal end to end (spec exists; no run record found).

**Test scenarios**

- **Empty and oversize on web**
  1. Add an empty file and a file above the plan cap together.
  - Expected: One notice naming both with reasons, 'None of the 2 files were attached'.
- **Duplicate on web**
  1. Add a.pdf twice.
  - Expected: 'a.pdf is already attached.' and one chip.
- **Over the count**
  1. Add 22 small files.
  - Expected: 20 chips; notice names the 2 left out.
- **Locked PDF**
  1. Attach a password-protected PDF and send.
  - Expected: Message that the file is password protected and to remove the password.
- **Long document**
  1. Attach a very long text file and send.
  - Expected: Reply shows 'Only part of {name} was read...'.
- **CLI duplicate and budget**
  1. /files big.txt twice.
  - Expected: First: attached (and 'truncated to budget' if over 40,000 characters); second: 'already attached'.

**Where to look when it fails**

- Errors: PdfAttachmentUnreadableError, ChatAttachmentHydrationError code unreadable_attachment.
- Header X-AGI-Attachments-Truncated.
- Phone alerts titled 'Attachment not added'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/014-attachment-intake-components.md](../../70-qa/test-plans/web/014-attachment-intake-components.md)
- Desktop: [70-qa/test-plans/desktop/014-attachment-intake-components.md](../../70-qa/test-plans/desktop/014-attachment-intake-components.md)
- Mobile: [70-qa/test-plans/mobile/014-attachment-intake-components.md](../../70-qa/test-plans/mobile/014-attachment-intake-components.md)
- CLI: [70-qa/test-plans/cli/014-attachment-intake-components.md](../../70-qa/test-plans/cli/014-attachment-intake-components.md)
- VS Code: [70-qa/test-plans/vscode/014-attachment-intake-components.md](../../70-qa/test-plans/vscode/014-attachment-intake-components.md)
- Chrome: [70-qa/test-plans/chrome/014-attachment-intake-components.md](../../70-qa/test-plans/chrome/014-attachment-intake-components.md)

## 10. Gaps and dependencies

- **VS Code and Chrome have no duplicate check on every path and no batch summary.** Affects: VS Code, Chrome. Evidence: ChatStateManager.ts:4017; side_panel.ts:10343-10400. Work needed: Add duplicate identity and a summary line.
- **Phone batch notice lacks the 'Attached N of M' count.** Affects: Phone. Evidence: ChatInput.tsx:660-667. Work needed: Add a count line to the alert.
- **VS Code picker warnings do not name the file.** Affects: VS Code. Evidence: ChatStateManager.ts:4014. Work needed: Name each skipped file.
- **Locked PDF on phone Local reaches the person only if the on-device model repeats the note.** Affects: Phone Local. Evidence: attachmentContext.ts:44. Work needed: Show a notice in the app.
- **Web display path for the locked-PDF 400 not traced.** Affects: Web, desktop. Evidence: chat-attachment-hydration.ts:661. Work needed: Trace and test that the message reaches the person.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:packages/contracts/cloud-contracts/src/chat-attachment-policy.json
- file:apps/web/features/chat/hooks/use-attachments.ts
- F014-09
- F014-10
- F014-12
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-chat-turn-pipeline

## Unknown

- How the web composer displays the 400 'unreadable_attachment' message.
- Whether truncatedAttachments is saved to the server with the message.
- Whether phone Cloud shows a locked-PDF notice outside the model reply.
- The exact route path of the chat completions handler beyond the folder name apps/web/app/api/llm/v1/chat/completions.
- Whether the Tauri desktop build enforces the same limits.
