---
id: "F014-12"
type: "feature"
title: "Retention and model fit"
aliases: ["Retention note", "Model compatibility warning", "Compatible model", "Alternative path", "Indexing progress", "Knowledge file indexing", "S14.21", "S14.34", "S14.35", "S14.36"]
area: "14 Attachment intake components"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "missing", chrome: "partial"}
verification: {web: "partly seen (1 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S14.21", "S14.34", "S14.35", "S14.36"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "mode:local", "mode:cloud", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "F014-09", "F014-11", "api:POST /api/projects/{id}/knowledge-files/{fileId}/reindex"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F014-12 Retention and model fit

Explains how long attachments are kept, warns before send when the selected model cannot read an attached image or PDF, and names a fix. Also shows indexing progress and retry for project knowledge files. Web and desktop have the warning and indexing; phone has the retention note; CLI refuses images for text-only models.

Area: [14. Attachment intake components](README.md). Requirement items: [S14.21](../../10-requirements/capabilities/014-attachment-intake-components.md#s1421), [S14.34](../../10-requirements/capabilities/014-attachment-intake-components.md#s1434), [S14.35](../../10-requirements/capabilities/014-attachment-intake-components.md#s1435), [S14.36](../../10-requirements/capabilities/014-attachment-intake-components.md#s1436).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (1 of 4) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives three kinds of honesty about attachments: how long they live, whether the chosen model can read them, and whether a project file is searchable yet.

**Why it exists.** People should not be surprised by retention or by an answer that ignores a file. Product requirements say to show retention disclosure before risky use and to give honest unavailable states (doc: docs/product/requirements.md lines ~129, ~808). Brief S14.21, S14.34 to S14.36.

**Who uses it.** Everyone attaching files; project owners adding knowledge files (web, desktop).

**Problems it solves**

- Not knowing whether a file is saved
- Sending an image to a text-only model
- Not knowing whether a project file is searchable

**Use cases**

- Hover the 'Add photos & files' row on web to read the retention note.
- Attach a picture while a text-only model is selected; a warning offers Use Auto.
- In a project, upload a PDF and watch 'Indexing for search' until it finishes.
- CLI: /attach on an image with a text-only model is refused with a switch-model hint.

## 2. User experience

**Where to find it**

- Web and desktop retention note: tooltip (title) of the plus menu row 'Add photos & files' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:156-158, :887-904); the visible line under the row is the limit note 'Up to N files, X each' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:920).
- Phone: note text under the attachment cards in the Add to Chat sheet (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:130-135, :738-745).
- Chrome: temporary chat explanation 'Stays out of your history, search, memory and Library.' in the menu; no per-file note (apps/extension/_locales/en/messages.json:2234).
- CLI: /privacy output line 'Retention: ...' (apps/cli/src/claude_parity.rs:465).
- Web and desktop model warning: a box above the composer (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5434-5500).
- Project knowledge list: Projects, project settings, knowledge files (apps/web/features/projects/components/KnowledgeFilesPanel.tsx; apps/web/features/projects/components/KnowledgeIndexStatus.tsx).

**Before you start**

- Model warning: a file attached and a model selected.
- Indexing: a project with knowledge files (web and desktop).

**Screens and controls**

- Web note text: 'Saved to your Library until you delete them. Deleted files can be restored for 30 days.' and for temporary chat 'Kept out of your Library and deleted with this temporary chat.' (ComposerPlusMenu.tsx:156-158).
- Phone notes: cloud 'Uploaded to AGI Cloud and kept in your Library until you delete them.'; temporary 'Kept out of your Library and deleted with this temporary chat.'; Local 'On-device models read the text in photos, not the picture itself.' (AddToChatSheet.tsx:130-135).
- Warning text: "The selected model can't read the attached image. Switch to Auto, choose an image-capable model, or remove the image." and document and mixed variants; buttons 'Use Auto' (or 'Use Free Auto'), 'Remove attachments', 'Choose a compatible model' (ChatComposerNew.tsx:5434-5480).
- Compatible list rows 'Use {model}'; empty case 'No model on your plan can read this attachment.' with 'See plans with multimodal models' (ChatComposerNew.tsx:5483-5500).
- On-device model banner: 'Local models on this device cannot read attachments. Switch to a cloud model or remove the attachment.' with 'Switch to a cloud model' and remove (ChatComposerNew.tsx:5334-5370).
- Indexing: spinner with 'Indexing for search'; after failure 'Keyword search only' or 'Not indexed' or the error text, and a 'Retry indexing' link (KnowledgeIndexStatus.tsx:30-69).
- Project file remove: confirm dialog 'Remove {name}?' (KnowledgeFilesPanel.tsx:498).

**Journey**

1. Attach a file.
2. If the model cannot read it, the warning appears and send is blocked.
3. Press 'Use Auto', or choose a compatible model, or remove the files.
4. Send. Retention note is visible on hover or in the phone sheet before attaching.
5. Indexing: upload a project file; the list polls every 5 seconds up to 60 times; on failure press 'Retry indexing'.

**What the person sees and gets**

- Warning box with role alert on web.
- CLI line: '{model} does not accept images; switch to a vision model with /model first' (apps/cli/src/tui/tui_app.rs:856).
- Phone at send: '{model} can read up to N images in one message. Remove K images to send it.' (attachmentValidation.ts:188-198).

**Settings**

- Temporary chat changes the retention wording on web, phone and Chrome.
- Model choice (Auto or a named model) decides whether the warning appears.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and desktop retention tooltip with temporary variant (ComposerPlusMenu.tsx:887-904).
- Web and desktop model warning for images and PDFs; text and code are inlined so every model reads them; Auto always passes; the send is blocked while the conflict stands (ChatComposerNew.tsx:1542-1566, :3593).
- Web free-model variants: images-only or text-only wording and 'Use Free Auto' (ChatComposerNew.tsx:5438-5455).
- Web compatible-model list limited to vision-capable models allowed for the plan (ChatComposerNew.tsx:1593-1595).
- Web on-device model refuses all attachments with a switch hint (ChatComposerNew.tsx:1589, :5334).
- Phone cloud and temporary retention notes and a Local note (AddToChatSheet.tsx:738-745); phone refuses too many images for the model at send (chatExecutionStore.ts:2455).
- CLI refuses an image for a text-only model with the switch hint (tui_app.rs:853-858) and prints a Retention line in /privacy.
- Chrome refuses more images than a model accepts (side_panel.ts:10190-10200).
- Web indexing: polling, status label, failed index retry through POST reindex, remove with confirm (KnowledgeFilesPanel.tsx:107-141, :498; KnowledgeIndexStatus.tsx).

**Incomplete**

- Phone has no file-type warning before send; only the image-count refusal and validation of types (attachmentValidation.ts:95-135).
- CLI retention line and web wording differ for temporary-chat attachments: CLI says 'removed after 30 days', web and phone say 'deleted with this temporary chat' (claude_parity.rs:465; ComposerPlusMenu.tsx:157-158). Which is true is unknown.
- The retention note on web is a tooltip, so it is not seen on touch screens without hover [inferred].
- Web retention note says deleted files can be restored for 30 days; phone's note omits it (AddToChatSheet.tsx:132).

**Present but disconnected or switched off**

- none found

**Not available**

- Model warning: phone, CLI (image refusal only), VS Code, Chrome (image-count notice only).
- Retention note per file: CLI attach flow, VS Code, Chrome.
- Indexing progress: phone (brief S14.21); no code found in apps/mobile for project knowledge indexing.
- Alternative-path explanation: VS Code and Chrome beyond plain refusals.

## 4. Required behaviour

**Established requirements**

- The composer explains whether and how long attached files are kept. (source: brief S14.34)
- If the selected model cannot read an attached file type, the composer warns before sending and offers a fix. (source: brief S14.35)
- When a file cannot go the normal way, the user is told the alternative (switch model or mode, convert, or what is sent instead). (source: brief S14.36)
- A file added to searchable knowledge shows indexing progress and whether it finished or failed. (source: brief S14.21)
- Show retention, cost and capability disclosure before risky or new feature use. (source: doc: docs/product/requirements.md (line ~129))
- Do not describe capabilities as intrinsic to a model when they depend on a provider route or harness. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. With a text-only model selected and an image attached, the warning appears and send does nothing until fixed.
2. Pressing 'Use Auto' selects Auto and the warning disappears.
3. With Auto selected the warning does not appear for images or PDFs.
4. The plus menu retention note changes in a temporary chat.
5. On phone, the attach sheet shows the cloud note in Cloud mode and the Local note in Local mode.
6. In the CLI, /attach of an image with a text-only model prints the switch-to-a-vision-model message.
7. A project file being indexed shows 'Indexing for search'; a failed one shows 'Retry indexing' and pressing it restarts indexing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The retention statement must be one fact across apps; the CLI/web conflict about temporary-chat files must be resolved [inferred from AGENTS.md section 2: code wins, docs follow].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the retention note visible text on web, not only a tooltip.
- [proposed] Add the file-type warning to the phone and Chrome.
- [proposed] Add the 30-day restore line to the phone note once the true retention is confirmed.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerPlusMenu AttachRow | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Row 'Add photos & files' with retention tooltip and limit note (887). |
| service | deletion-policies | `apps/web/lib/resources/deletion-policies.ts` | RESOURCE_RECOVERY_WINDOW_DAYS = 30 (line 8). |
| component | ChatComposerNew warning | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | hasAttachmentConflict logic (1542-1566), warning box (5434), local-model banner (5334). |
| service | LOCAL_ATTACHMENT_REFUSAL | `packages/contracts/local-runtime/src/inference.ts` | On-device attachment refusal text (131). |
| component | AddToChatSheet notes | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Phone retention and local notes (130-135, 738). |
| service | imageLimitRefusal | `apps/mobile/src/features/chat/utils/attachmentValidation.ts` | Phone per-model image count refusal (188). |
| service | chatExecutionStore image check | `apps/mobile/stores/chat/chatExecutionStore.ts` | Calls imageLimitRefusal before send (2455). |
| command | render_privacy_settings | `apps/cli/src/claude_parity.rs` | CLI privacy text with Retention line (465). |
| service | stage_image_path_with | `apps/cli/src/tui/tui_app.rs` | Refuses images for non-vision models (836-858). |
| service | selectedModelImageLimitNotice | `apps/extension/src/side_panel.ts` | Chrome image-count notice (10190). |
| component | KnowledgeFilesPanel | `apps/web/features/projects/components/KnowledgeFilesPanel.tsx` | Project knowledge list, polling, retry and remove. |
| component | KnowledgeIndexStatus | `apps/web/features/projects/components/KnowledgeIndexStatus.tsx` | Status label and Retry indexing; poll constants 5 s and 60 polls (7-8). |
| endpoint | POST /api/projects/{id}/knowledge-files/{fileId}/reindex | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/reindex` | Restarts indexing; client path built by managedCloudProjectKnowledgeReindexPath (project-knowledge.ts:23). |
| service | project-knowledge paths | `packages/contracts/cloud-contracts/src/project-knowledge.ts` | Path builders for knowledge file, reindex, refresh, text. |
| config | spTemporaryChatExplanation | `apps/extension/_locales/en/messages.json` | Chrome temporary chat copy (2234). |
| test | KnowledgeFilesPanel.indexing | `apps/web/features/projects/components/KnowledgeFilesPanel.indexing.test.tsx` | Indexing status tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The composer reads the selected model's vision flag from the on-device catalogue and checks attached types. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1542-1566 |
| If images or PDFs are attached and the model cannot read them (Auto always can), the warning shows and the send handler returns early. | device | ChatComposerNew.tsx:3593 |
| Choosing Auto or another model saves the conversation's model. | device and our servers | ChatComposerNew.tsx:1511-1525 (onModelChange) |
| Indexing: the page lists knowledge files, polls every 5 s while any is indexing, and posts a reindex on Retry. | device and our servers | KnowledgeFilesPanel.tsx:107-141; KnowledgeIndexStatus.tsx:7-8 |
| The server indexes the file (chunks) and records status and chunk count. | our servers | KnowledgeIndexStatus.tsx:28-33 reads indexing.status and chunkCount; indexer code not read |
| CLI checks the model's vision flag in the local catalogue before staging an image. | device | apps/cli/src/tui/tui_app.rs:853-858 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation model choice | Conversation record on the server via onModelChange | Yes (per conversation) | unknown |
| Project knowledge file and its index chunks | Server storage and database | Account scoped | Removed on 'Remove file'; the dialog says it cannot be undone (KnowledgeFilesPanel.tsx:498-503) |

**Models and providers.** The warning relies on the model catalogue's vision capability flag and plan tier (ChatComposerNew.tsx:1593-1595). Reading images and PDFs depends on the provider route chosen at send; this feature does not choose a provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Warning needs no account; indexing needs a signed-in account and a project. |
| Permissions | Project file remove asks for confirmation. |
| Subscription | The compatible-model list only shows models allowed for the plan; with none, it offers 'See plans with multimodal models' (ChatComposerNew.tsx:5483-5500). Free models have image-only or text-only variants. |
| Limits and metering | Poll every 5 s up to 60 times (KnowledgeIndexStatus.tsx:7-8). Project file count limit shown as 'full, remove one to add another' (KnowledgeFilesPanel.tsx:255). |
| Feature flags | none found in the code |
| Model compatibility | Images and PDFs need a vision-capable model or Auto; text and code are inlined for every model (ChatComposerNew.tsx:1537-1545). |
| Provider restrictions | none found in the code |
| Local mode | Web and desktop on-device model: all attachments refused with a switch-to-cloud banner. Phone Local: note says on-device models read text in photos, not the picture. CLI: vision flag of the local catalogue applies. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Conflict stands | Send is a no-op until fixed. | ChatComposerNew.tsx:3593 |
| No compatible model on plan | Message and upgrade link. | ChatComposerNew.tsx:5483-5500 |
| Saving the model fails | Notice 'Could not save this conversation’s model. Try again.' | ChatComposerNew.tsx:1519-1522 |
| Indexing in progress | Spinner and label; polling stops after 60 polls. | KnowledgeIndexStatus.tsx:28-48; KnowledgeFilesPanel.tsx:107-119 |
| Index failed | Error text and Retry indexing. | KnowledgeIndexStatus.tsx:52-70 |
| Retry fails | Toast 'Couldn't restart indexing for {name}. Try again.' | KnowledgeFilesPanel.tsx:139 |
| Touch screens and the retention tooltip | not handled in the code beyond the title attribute. | ComposerPlusMenu.tsx:893-899 |
| Offline | Web send shows an offline notice. | ChatComposerNew.tsx:3585-3592 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/projects/components/KnowledgeFilesPanel.indexing.test.tsx`: Indexing label while outstanding, nothing extra when indexed, failure and reindex through the endpoint.
- `apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx`: Composer behaviour including attachment conflict text (grep matched 'can't read the attached' and 'Use Auto'; titles not read in full).
- `apps/web/features/chat/components/Composer/ComposerPlusMenu.test.tsx`: Plus menu rows and retention strings (grep matched; titles not read in full).
- `apps/web/features/chat/components/Composer/ChatComposerNew.attachmentPending.test.tsx`: Send waiting for attachment preparation (titles not read in full).
- `apps/mobile/src/features/chat/utils/__tests__/attachmentValidation.imageLimit.test.ts`: Per-model image limit refusal.
- `packages/ai/providers/openai/src/__tests__/unsupported-attachment-classification.test.ts`: Provider-side unsupported attachment classification (titles not read in full).

**Test scenarios**

- **Image with a text-only model**
  1. Select a text-only model.
  2. Attach a PNG.
  - Expected: Warning appears; send does nothing; 'Use Auto' clears it.
- **Auto passes**
  1. Select Auto.
  2. Attach a PNG and a PDF.
  - Expected: No warning.
- **Temporary chat note**
  1. Start a temporary chat.
  2. Hover Add photos & files.
  - Expected: Tooltip says files are kept out of the Library and deleted with the chat.
- **Phone notes**
  1. Cloud mode: open the Add to Chat sheet.
  2. Switch to Local and reopen.
  - Expected: Cloud retention note, then the on-device note.
- **Indexing retry**
  1. Make a project file fail indexing.
  2. Press Retry indexing.
  - Expected: Spinner and 'Indexing for search', then indexed or failed again.
- **CLI text-only model**
  1. Select a text-only model in the CLI.
  2. /attach shot.png.
  - Expected: Message that the model does not accept images and to switch with /model.

**Where to look when it fails**

- Toast 'Couldn't restart indexing' and HTTP status text 'Reindex failed (N)'.
- Test ids: knowledge-files-index-status, knowledge-files-retry-index, local-attachment-conflict.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/014-attachment-intake-components.md](../../70-qa/test-plans/web/014-attachment-intake-components.md)
- Desktop: [70-qa/test-plans/desktop/014-attachment-intake-components.md](../../70-qa/test-plans/desktop/014-attachment-intake-components.md)
- Mobile: [70-qa/test-plans/mobile/014-attachment-intake-components.md](../../70-qa/test-plans/mobile/014-attachment-intake-components.md)
- CLI: [70-qa/test-plans/cli/014-attachment-intake-components.md](../../70-qa/test-plans/cli/014-attachment-intake-components.md)
- Chrome: [70-qa/test-plans/chrome/014-attachment-intake-components.md](../../70-qa/test-plans/chrome/014-attachment-intake-components.md)

## 10. Gaps and dependencies

- **No model-fit warning on phone, VS Code or Chrome.** Affects: Phone, VS Code, Chrome. Evidence: brief S14.35; attachmentValidation.ts has types and counts only. Work needed: Add a pre-send check against the model catalogue.
- **CLI and web say different things about temporary-chat attachment retention.** Affects: CLI, web, phone. Evidence: claude_parity.rs:465; ComposerPlusMenu.tsx:157-158. Work needed: Confirm real behaviour in the deletion jobs and align the copy.
- **Retention note on web is a tooltip only.** Affects: Web, desktop. Evidence: ComposerPlusMenu.tsx:893-899. Work needed: Show as visible text.
- **No indexing progress on the phone; no retention note in VS Code or per file in Chrome and CLI.** Affects: Phone, VS Code, Chrome, CLI. Evidence: brief S14.21, S14.34. Work needed: Decide and build or record as not required.
- **Brief marks CLI retention missing; a general Retention line exists in /privacy.** Affects: CLI (documentation). Evidence: claude_parity.rs:465. Work needed: Correct the brief.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- mode:local
- mode:cloud
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- F014-09
- F014-11
- api:POST /api/projects/{id}/knowledge-files/{fileId}/reindex

## Unknown

- Which retention is true for temporary-chat attachments (30 days or deleted with the chat); only copy was read, not deletion jobs.
- Whether any test asserts the exact model warning wording; test titles in ChatComposerNew.test.tsx were not read.
- The server indexer code and the statuses it writes beyond those the UI reads.
- Whether a human has checked that the warning looks right; no record found.
- Project knowledge indexing on the phone: no code found, requirement unknown.
