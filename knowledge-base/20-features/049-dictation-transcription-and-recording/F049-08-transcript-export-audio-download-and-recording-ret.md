---
id: "F049-08"
type: "feature"
title: "Transcript export, audio download and recording retention"
aliases: ["Transcript export", "Export chat", "Export Conversation", "Export Chat History", "Audio download", "Recording retention", "Delete chat", "S49.25", "S49.26", "S49.27"]
area: "49 Dictation, transcription, and recording"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S49.25", "S49.26", "S49.27"]
depends_on: ["SYS-data-model-and-migrations", "SYS-files-artifacts-and-storage", "SYS-voice-and-media", "SYS-sync-and-continuity", "SYS-security-and-privacy", "table:web_conversations", "api:DELETE /api/chat/conversations/[id]", "surface:web", "surface:mobile", "surface:cli", "surface:vscode"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F049-08 Transcript export, audio download and recording retention

People can save a chat, including dictated messages, as a file and delete chats. Dictated text is ordinary message text. Audio is not kept, so there is no audio download and no separate recording retention setting, except the command line's temporary folder cleared after an hour.

Area: [49. Dictation, transcription, and recording](README.md). Requirement items: [S49.25](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4925), [S49.26](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4926), [S49.27](../../10-requirements/capabilities/049-dictation-transcription-and-recording.md#s4927).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Exports a conversation to a file (web: markdown, PDF, Word, HTML or JSON; phone: PDF, text or markdown; command line: markdown or JSON; VS Code: markdown) and lets people delete a chat. Dictated words are saved as normal messages, so they travel with the chat. Original audio is not stored, so audio download does not exist.

**Why it exists.** The brief requires transcript export, audio download and retention and deletion controls for recordings and transcripts (S49.25 to S49.27).

**Who uses it.** Anyone who dictates into chats and wants a copy of the text, or wants dictated content removed.

**Problems it solves**

- Keeping a copy of a conversation outside the app
- Removing a conversation that holds dictated text
- Knowing that no raw audio is retained by the web dictation route

**Use cases**

- Export a dictated chat as a Word file on web
- Share a chat as a PDF from the phone
- Export a CLI session as JSON with /export
- Delete a chat that contains private dictated text

## 2. User experience

**Where to find it**

- Web: chat page export action opens the dialog titled 'Export Chat History' (apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:178; opened from apps/web/features/chat/pages/WebChatPage.tsx:7408).
- Desktop: the public desktop shows the hosted web app, so it uses the same web dialog [inferred from AGENTS.md section 5] (doc: AGENTS.md).
- Phone: chat screen export opens a sheet titled 'Export Conversation' with 'Export as PDF', 'Export as Text', 'Export as Markdown' (apps/mobile/src/features/chat/components/ConversationExportSheet.tsx:47-80, 179).
- Command line: the /export slash command (apps/cli/src/repl/slash_commands.rs:186) and /delete (apps/cli/src/repl/slash_commands.rs:183).
- VS Code: Command Palette 'Code: Export Conversation' (apps/extension-vscode/package.json:234-235).
- Chrome extension: no export or delete control found; unknown.

**Before you start**

- A conversation with at least one message; the phone shows 'Nothing to Export' for an empty chat (ConversationExportSheet.tsx:102) and the CLI warns 'Nothing to export' (apps/cli/src/repl/registry.rs:600-606).
- Web delete needs a signed-in account (route uses getUserScopedDb).

**Screens and controls**

- Web dialog: format cards Markdown, PDF, Word, HTML, JSON; a metadata option for Markdown; an Export Preview; button 'Export <format>' (EnhancedExportDialog.tsx:35-86, 231-286).
- Phone sheet: PDF, Print, Text, Markdown, Copy options (ConversationExportSheet.tsx:38).
- CLI: /export with formats Json, Markdown or Answer (apps/cli/src/repl/registry.rs:609-620).

**Journey**

1. Open a conversation that holds dictated and typed messages.
2. Open export (web dialog, phone sheet, /export or the VS Code command).
3. Pick a format.
4. Receive a file download, share sheet, terminal output or saved markdown file.
5. To delete: use the chat delete action (web calls DELETE on the conversation; CLI uses /delete).

**What the person sees and gets**

- Web: toast 'Exported as <format>' or 'Export failed. Please try again.' (EnhancedExportDialog.tsx:161-165).
- Phone: alert 'Export Failed' on error (ConversationExportSheet.tsx:137).
- Web delete: JSON { success: true } (apps/web/app/api/chat/conversations/[id]/route.ts:588).

**Settings**

- No retention setting for recordings was found in any app.
- Web delete recovery window is a code constant of 30 days, not a user setting (apps/web/lib/resources/deletion-policies.ts:8).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web export dialog supports five formats (apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:35).
- Phone export sheet supports PDF, print, text, markdown and copy (apps/mobile/src/features/chat/components/ConversationExportSheet.tsx:38).
- CLI exports a session as markdown or JSON (apps/cli/src/conversations.rs:237, 362; apps/cli/src/repl/registry.rs:609-612).
- VS Code exports the open session as markdown (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:4070; apps/extension-vscode/src/features/sidebar-webview/conversationExport.ts:7).
- Web delete sets deleted_at on the conversation row and clears its compaction summary, then revokes published artifacts and shares of that conversation (apps/web/app/api/chat/conversations/[id]/route.ts:38-50, 533-560).
- A cron purge for soft-deleted resources is scheduled with a 30 day window (vercel.json:86; apps/web/lib/resources/deletion-policies.ts:8).
- Web dictation keeps no audio on the server: the route forwards the file to the provider and records usage only (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:722-800); the privacy page states the same (doc: apps/web/app/privacy/page.tsx:255-257).
- CLI recordings sit in a private temporary folder; folders older than one hour are swept at the next recording (apps/cli/src/voice.rs:882, 899-913).

**Incomplete**

- Web delete is a soft delete, so messages (including dictated text) stay in the database until the purge runs. (apps/web/app/api/chat/conversations/[id]/route.ts:38-50)
- Migration 0239 that adds indexes for the purge says in its header it is not yet applied. Whether the purge cron works in production is unknown. (apps/web/db/neon/0239_resource_deletion_semantics.sql:3)
- The brief says CLI and VS Code export are missing; the code shows they exist. The brief is stale on this point.

**Present but disconnected or switched off**

- None found.

**Not available**

- Audio download: not available on any app because audio is not kept. (area brief S49.26; route.ts:722-800)
- Separate transcript export distinct from the chat export: not available; dictated text is exported as message text.
- Recording retention settings: not found in any app.
- Export and delete on the Chrome extension: not found; unknown.

## 4. Required behaviour

**Established requirements**

- The user can export a recording transcript as a file. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S49.25)
- The user can download the original recording audio. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S49.26)
- Recordings and transcripts have retention settings and can be deleted. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S49.27)
- Deletion must name its consequence and permanent removal comes only from an explicit user action; chats are archived or moved to Recently deleted first. (source: AGENTS.md section 9 (doc: AGENTS.md))

**Acceptance criteria**

1. Exporting a chat that includes dictated messages produces a file whose text includes those messages in each app that offers export.
2. Export of an empty chat is refused with a clear message on phone and CLI.
3. Deleting a chat on web removes it from the chat list and the response is success.
4. A deleted chat on web is recoverable inside the 30 day window and then purged.
5. No audio file is retrievable from the server for a web dictation.
6. On the command line, a recording folder older than one hour is removed at the next recording.
7. A decision exists and is documented for audio download and retention controls.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because no audio is stored, S49.26 can only be met by changing the design to keep audio, which would need a consent and retention rule. [inferred]
- The statuses 'done' for S49.27 on web, desktop and mobile in the brief refer to chat deletion, not recording retention. [inferred from the brief's cited code]

**Proposed improvements** (suggestions, not requirements)

- Mark S49.26 as not planned unless audio keeping is wanted, and record that choice in docs/decisions. [proposed]
- Show the recovery window in the delete confirmation on every app. [proposed]
- Add export to the Chrome extension side panel if wanted. [proposed]

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | EnhancedExportDialog | `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx` | Web export dialog, five formats. |
| service | ChatExportService | `apps/web/features/chat/services/conversation-export.ts` | Builds the export content for web. |
| screen | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Hosts the export dialog (line 7934) and chat actions. |
| component | ConversationExportSheet | `apps/mobile/src/features/chat/components/ConversationExportSheet.tsx` | Phone export sheet. |
| screen | Phone chat screen | `apps/mobile/app/(app)/chat/[id].tsx` | Opens the export sheet (handleOpenExport, line 1789; sheet line 2837). |
| endpoint | DELETE /api/chat/conversations/[id] | `apps/web/app/api/chat/conversations/[id]/route.ts` | handleDeleteConversation: soft delete, revoke artifacts and shares (line 516). |
| table | web_conversations | `apps/web/app/api/chat/conversations/[id]/route.ts` | Row updated with deleted_at by the delete SQL (lines 38-50). |
| job | purge-soft-deleted-resources cron | `apps/web/app/api/cron/purge-soft-deleted-resources/route.ts` | Purges soft-deleted rows after the recovery window; scheduled in vercel.json:86. |
| config | deletion policies | `apps/web/lib/resources/deletion-policies.ts` | 30 day recovery window and per-table purge rules. |
| command | /export and /delete | `apps/cli/src/repl/slash_commands.rs` | CLI slash commands (lines 183-188). |
| service | CLI export functions | `apps/cli/src/conversations.rs` | export_as_markdown (line 237) and export_as_json (line 362). |
| service | CLI voice recording cleanup | `apps/cli/src/voice.rs` | Temporary recording folder, sweep after 1 hour (lines 882-913). |
| command | Code: Export Conversation | `apps/extension-vscode/package.json` | VS Code command contribution (lines 234-235). |
| service | VS Code conversation export | `apps/extension-vscode/src/features/sidebar-webview/conversationExport.ts` | Builds markdown and file name. |
| endpoint | POST /api/chat/conversations/[id]/restore | `apps/web/app/api/chat/conversations/[id]/restore/route.ts` | Restore a deleted chat; presence of the route file only, behaviour not opened. |
| endpoint | POST /api/llm/v1/audio/transcriptions | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | Dictation transcription that stores no audio. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks an export format; the app builds the file from the messages already loaded. | device | apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:101-160; apps/mobile/src/features/chat/components/ConversationExportSheet.tsx:96-137 |
| Web delete sends DELETE to the conversation route; the server sets deleted_at, revokes artifacts and shares, and releases the cloud sandbox for that chat. | our servers | apps/web/app/api/chat/conversations/[id]/route.ts:516-585 |
| A scheduled job later purges soft-deleted rows past 30 days. | our servers | vercel.json:86; apps/web/lib/resources/deletion-policies.ts:8 |
| CLI /export prints markdown or JSON from the in-memory session after terminal-safe cleaning. | device | apps/cli/src/repl/registry.rs:609-620 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Dictated text as a message | web_conversations and message rows for cloud chats; device store for local chats | Cloud chats sync through the account; local chats do not [inferred] | Web delete is a soft delete with a 30 day recovery window then purge (route.ts:38-50; deletion-policies.ts:8). Purge applied state unknown. |
| Original dictation audio | not stored on the server; phone does on-device recognition; CLI keeps a temporary WAV folder | no | CLI temp folders removed after one hour at the next recording (voice.rs:899-913); the folder is also a temp directory object dropped after use [inferred from voice.rs:918-929]. |
| Exported file | the user's chosen location or share target | no | Owned by the user; the product does not track it. |

**Models and providers.** Export and delete use no model. The dictation text that is exported was produced earlier by the dictation path (see F049-09 and SYS-voice-and-media).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web delete requires a signed-in user scoped to their rows (apps/web/app/api/chat/conversations/[id]/route.ts:517). Export on the client needs no extra account check found. |
| Permissions | Web delete needs a CSRF token and passes a rate limit named chat-conversation (route.ts:519-523). |
| Subscription | None found in the code for export or delete. |
| Limits and metering | Rate limit on delete (chat-conversation). No export quota found. |
| Feature flags | None found for export or delete. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Export on phone and CLI works on local content without any server call [inferred from the client-side builders]. No Local specific delete rule was opened; unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty chat | Phone alert 'Nothing to Export'; CLI warns 'Nothing to export, no messages in session yet.' | ConversationExportSheet.tsx:102; apps/cli/src/repl/registry.rs:603-606 |
| Export failure | Web toast 'Export failed. Please try again.'; phone alert 'Export Failed'. | EnhancedExportDialog.tsx:165; ConversationExportSheet.tsx:137 |
| Delete a chat that is not found | 404 'Conversation not found'. | apps/web/app/api/chat/conversations/[id]/route.ts:565-567 |
| Sandbox release fails on delete | Logged as a warning; delete still succeeds; a TTL is the safety net. | route.ts:575-581 |
| Offline | Not handled in the code I opened for web delete; unknown. | not found |
| VS Code with no open session | Information message to open a developer session to export. | apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:4073-4078 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/dialogs/EnhancedExportDialog.test.tsx`: The web export dialog.
- `apps/web/features/chat/services/conversation-export.test.ts`: Web conversation export builder.
- `apps/mobile/__tests__/ConversationExportSheet.test.tsx`: Phone export sheet.
- `apps/mobile/__tests__/ConversationExportSheet.markdownTitle.test.tsx`: Phone markdown title handling.
- `apps/mobile/__tests__/conversation-export-formats.test.ts`: Phone export formats.
- `apps/web/app/api/chat/conversations/[id]/route.delete.test.ts`: Web delete route.
- `apps/web/app/api/cron/purge-soft-deleted-resources/route.test.ts`: Purge cron route.
- `apps/extension-vscode/src/__tests__/conversationExport.test.ts`: VS Code export markdown.

**Test scenarios**

- **Export dictated chat on web**
  1. Dictate a message and send it
  2. Open export and choose Markdown
  3. Open the downloaded file
  - Expected: The dictated words appear as an ordinary message; no audio file is produced.
- **Export on phone**
  1. Dictate and send a message
  2. Open the export sheet
  3. Choose Export as PDF
  - Expected: A share sheet opens with a PDF that contains the message.
- **Delete on web**
  1. Delete a chat that has dictated text
  2. Reload the chat list
  - Expected: The chat is gone from the list; the API returned success; check the row has deleted_at set.
- **CLI recording sweep**
  1. Leave an old recording-* folder in the voice-recordings folder with a modified time over an hour ago
  2. Make a new recording
  - Expected: The old folder is removed.
- **No audio retained**
  1. Dictate on web
  2. Search server storage and tables for the audio bytes
  - Expected: No audio is found; only usage records and the text message remain.

**Where to look when it fails**

- Log line 'Failed to delete conversation' and 'Media jobs were not marked temporary' in the conversation route.
- Log '[e2b] failed to release sandbox on delete'.
- Table web_conversations column deleted_at for delete state.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/web/049-dictation-transcription-and-recording.md)
- Desktop: [70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/desktop/049-dictation-transcription-and-recording.md)
- Mobile: [70-qa/test-plans/mobile/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/mobile/049-dictation-transcription-and-recording.md)
- CLI: [70-qa/test-plans/cli/049-dictation-transcription-and-recording.md](../../70-qa/test-plans/cli/049-dictation-transcription-and-recording.md)
- No hands-on plan yet for VS Code: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Audio download does not exist** Affects: All apps. Evidence: S49.26 missing; no audio stored (route.ts:722-800). Work needed: Decide whether audio should ever be kept; if yes add consent, storage, retention and download.
- **No recording retention setting** Affects: All apps. Evidence: None found; CLI has a fixed one hour sweep (voice.rs:882). Work needed: Document that audio is not kept, or add a setting if it becomes kept.
- **Purge may not run** Affects: Web and any synced chat. Evidence: 0239 header says not applied (apps/web/db/neon/0239_resource_deletion_semantics.sql:3); cron scheduled at vercel.json:86. Work needed: Confirm in the database and ledger whether 0239 is applied and the purge removes rows.
- **Brief says CLI and VS Code export missing but code has them** Affects: Brief accuracy. Evidence: apps/cli/src/repl/slash_commands.rs:186; apps/extension-vscode/package.json:234. Work needed: Update the brief and the status values.
- **Chrome extension has no found export or delete** Affects: Chrome extension. Evidence: not found. Work needed: Confirm and decide.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-data-model-and-migrations
- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- SYS-sync-and-continuity
- SYS-security-and-privacy
- table:web_conversations
- api:DELETE /api/chat/conversations/[id]
- surface:web
- surface:mobile
- surface:cli
- surface:vscode

## Unknown

- Whether migration 0239 and the purge are live in production.
- Whether the Chrome extension offers export or delete.
- Whether Desktop public build shows the same export dialog as web (inferred from the architecture note only).
- How phone deletes a chat and whether it uses the same soft delete; not opened.
- Whether Local-mode chats on desktop have their own delete path.
