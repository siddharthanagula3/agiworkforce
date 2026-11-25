---
id: "F014-07"
type: "feature"
title: "Attach from the Library, a repository or a folder"
aliases: ["Add from library", "Attach from Library", "Files menu (AGI Work bar)", "Select repository", "Attach from local folder", "@folder mention", "S14.10", "S14.11", "S14.12"]
area: "14 Attachment intake components"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S14.10", "S14.11", "S14.12"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "mode:local", "api:GET /api/library", "api:GET /api/files/{id}", "api:GET /api/github/repositories", "table:media_assets", "file:apps/web/features/chat/hooks/use-attachments.ts", "F014-09", "F014-11", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F014-07 Attach from the Library, a repository or a folder

Lets a person reuse a file already kept in their Library (web, desktop, phone), choose a GitHub repository for a code task (web code surface), or point the CLI at a repository or folder. Library items become ordinary attachments. Folder attach is a listing of names in the CLI only. VS Code folder or repository attach was not found in code.

Area: [14. Attachment intake components](README.md). Requirement items: [S14.10](../../10-requirements/capabilities/014-attachment-intake-components.md#s1410), [S14.11](../../10-requirements/capabilities/014-attachment-intake-components.md#s1411), [S14.12](../../10-requirements/capabilities/014-attachment-intake-components.md#s1412).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives three ways to bring existing material into a task without picking a new file from the device: a Library picker in the chat composer, a repository picker in the web code composer, and folder or repository scoping in the CLI.

**Why it exists.** People keep files in the Library and in repositories already. Re-uploading them wastes time and storage. The brief (S14.10, S14.11, S14.12) lists these as required intake paths. A founder decision says web and desktop chat have no attach-a-folder control (doc: docs/decisions/2026-09-27-founder-decisions.md, D-2026-09-27-02), which fits the code: the desktop folder dialog attaches single files, not folders (apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx:240).

**Who uses it.** Signed-in web, desktop and phone users with files in their Library; developers using the web code surface or the CLI.

**Problems it solves**

- Re-picking and re-uploading a file that is already saved
- Giving a coding task its repository without pasting code
- Showing the model what a folder holds without sending every file

**Use cases**

- On web, open the plus menu, tap Add from library, tap a recent file; it appears as a chip on the draft.
- On the phone in Cloud mode, open the attach sheet and tap a Library picture under Attach from Library.
- On the web code surface, choose a repository from the Select repository list before starting a task.
- In the CLI, type @src/ in a message so the model sees the names of the entries in that folder.

## 2. User experience

**Where to find it**

- Web and desktop (desktop shows the hosted web app, doc: AGENTS.md section 5): composer plus menu, row 'Add from library' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:159, :1011). The submenu lists up to 6 recent files and a 'Browse all' link to /library (apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:41).
- Web and desktop, AGI Work bar: a 'Files' button opens a popover with a search field 'Search library files', 'Browse all' and 'Upload from device' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:369, :7094; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:231). It is shown only when the AGI Work bar is visible (ChatComposerNew.tsx:2768, :7090).
- Desktop only: plus menu row 'Attach from local folder' (shown when a desktop host is present) opens a dialog titled 'Attach from a local folder' where one file is picked (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:163, :1105; apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx:25, :240).
- Phone: Add to Chat sheet, section 'Attach from Library' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:760).
- Web code surface: repository chip 'Select repository' with a 'Search repositories' field (apps/web/features/code/code-surface.ts:143, :280; apps/web/features/code/components/CodeComposer.tsx:802).
- CLI: '@' then a folder path, '--repo' / '-C', '--add-dir', '/add-dir', '/files' (apps/cli/src/mentions.rs:315; apps/cli/src/lib.rs:411, :422; apps/cli/src/claude_parity.rs:221, :223).
- VS Code, Chrome: no Library, repository or folder attach found in the code.

**Before you start**

- Library and repository lists need a signed-in cloud account [inferred from the /api/library and /api/github/repositories routes, which are account scoped].
- Repository list needs a connected GitHub installation; states are unconfigured, linking-unavailable, no-installation, authorization-pending, reauthorization-required, ready, error (apps/web/features/code/hooks/use-code-repositories.ts:11-26).
- Desktop folder dialog needs an approved folder; the dialog says 'No folders are approved yet. Choose one, and Desktop asks your permission before it reads anything inside.' (LocalFolderAttachDialog.tsx:26).
- CLI folder mention sends the listing only in a trusted workspace; otherwise only the path (apps/cli/src/mentions.rs:336-342).

**Screens and controls**

- Web plus menu submenu: loading row 'Loading files', empty row 'No files in your library yet.', error row 'The library could not be loaded.', attach failure row 'That file could not be added. Try again.' (ComposerFilesMenu.tsx:34-37; ComposerPlusMenu.tsx:1059-1066).
- Phone sheet: horizontal row of Library picks; image picks show a picture, others show a file card; 'Loading your Library'; 'Your Library could not load.' with a 'Try again' button (AddToChatSheet.tsx:760-830).
- Web code: repository list rows show the full name and a private marker, with 'Manage repository access on GitHub' (code-surface.ts:295; CodeComposer.tsx:672-740).
- CLI: listing block '<directory path=...>' sent to the model, capped at 200 entries (mentions.rs:30, :347).

**Journey**

1. Web: open the plus menu, tap 'Add from library'.
2. The list loads from the Library (GET /api/library, 6 items).
3. Tap a file. The app downloads its bytes, wraps them in a File with the saved name and type, and sends it through the same intake as a device file (ComposerFilesMenu.tsx:164-176; ChatComposerNew.tsx:6011).
4. The chip appears; the menu closes. If the file is refused, a notice names it and the reason.
5. Phone Cloud mode: open the sheet, tap a pick, the sheet closes and the item is added through the composer's normal add path with the same duplicate and limit checks (AddToChatSheet.tsx:520-528; apps/mobile/app/(app)/(tabs)/chat.tsx:1052).
6. CLI: type @folder/ and send; the model receives the entry names.

**What the person sees and gets**

- A chip for the attached file; a refusal notice naming the file and reason.
- Web 429 on a Library download: 'You are going a little fast. Try again in N seconds.' or the plan cap and reset time (ComposerFilesMenu.tsx:123-141).
- CLI: skipped mentions list a reason such as 'larger than 256 KB', 'holds credentials, only the path was sent', 'workspace is not trusted, only the path was sent' (mentions.rs:340, :388-392).

**Settings**

- Desktop approved folders (workspace roots) are managed in the desktop host, not in this feature [inferred from listWorkspaceRoots/pickWorkspaceRoot imports, LocalFolderAttachDialog.tsx:16-25].
- CLI workspace trust decides whether folder listings are included (mentions.rs:309-313).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/desktop plus-menu Library picker: fetch recent files, download the chosen file, add it through addChatAttachments so size, type and duplicate checks apply (apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:91-176; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6011, :2223).
- Web AGI Work bar 'Files' popover with search, Browse all and Upload from device (ComposerFilesMenu.tsx:231-354; ChatComposerNew.tsx:7094).
- Phone Cloud Library section: loads 12 image and file assets, skips videos, shows loading and error-with-retry states, and adds the pick through the composer (AddToChatSheet.tsx:395-436, :760-830).
- Phone Library items carry an asset id, so a send does not upload them again: only attachments without an asset id are uploaded (apps/mobile/stores/chat/chatExecutionStore.ts:2478-2483).
- Phone Local mode lists recent non-image files from local conversations (AddToChatSheet.tsx:368-385).
- Web code repository picker with search and every connection state (apps/web/features/code/hooks/use-code-repositories.ts:60; apps/web/features/code/components/CodeComposer.tsx:672-802).
- CLI folder mention produces a name-only listing, skips build and dot directories, and honours workspace trust (apps/cli/src/mentions.rs:336-352, :468-488).
- CLI '--repo/-C' moves the session to another repository; '--add-dir' and '/add-dir' add extra readable roots (apps/cli/src/lib.rs:411, :422; apps/cli/src/claude_parity.rs:332).

**Incomplete**

- Folder attach gives names only, never contents, in the CLI (apps/cli/src/mentions.rs:468-488); '/files' refuses a directory with 'not a file' (apps/cli/src/agent/mod.rs:3013-3020).
- Desktop 'Attach from local folder' attaches one file at a time, not a folder (LocalFolderAttachDialog.tsx:240).
- The plus-menu Library list is capped at 6 recent files and has no search; only the AGI Work bar popover has search (ComposerFilesMenu.tsx:41; ComposerPlusMenu.tsx:1016).
- Whether the selected repository is passed to the code task as context was not traced end to end; the draft holds repository and repositoryUrl (CodeComposer.tsx:175-177) [inferred].

**Present but disconnected or switched off**

- The Files popover exists only inside the AGI Work bar (ChatComposerNew.tsx:7090 inside the workScopeBarVisible branch), so it is not reachable when that bar is hidden.

**Not available**

- Library picker: CLI, VS Code and Chrome (no Library code found in apps/cli, apps/extension-vscode, apps/extension).
- Repository attach: phone and Chrome (no code found); VS Code: no repository or folder attach control found; the file picker sets canSelectFolders false and the context kinds are selection, open-files, problems, git-diff, terminal, url (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3985; apps/extension-vscode/src/protocol/webviewMessages.ts:145-152). The brief marks VS Code done but its cited lines show unrelated code.
- Folder attach on web, desktop, phone, VS Code and Chrome (doc: docs/decisions/2026-09-27-founder-decisions.md, D-2026-09-27-02).

## 4. Required behaviour

**Established requirements**

- A Library item becomes a normal attachment and goes through the same checks as a new file. (source: brief S14.10; code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6011)
- The user can pick a file already in their Library and attach it (web, desktop, phone). (source: brief S14.10)
- The user can attach a code repository as the context for a task (web, desktop, CLI per brief). (source: brief S14.11)
- The user can attach a folder so the assistant can use the files in it (CLI per brief). (source: brief S14.12)
- Web and desktop chat have no attach-a-link or attach-a-folder control, because the leaders have none. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-27-02))
- Every attachment path respects Local, own key and Cloud boundaries; nothing may silently route a Local file to another mode. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. On web, Add from library lists at most 6 recent Library files and a chosen file appears as a chip.
2. A Library file that breaks a limit is refused with a notice naming it, exactly as a device file would be.
3. When /api/library cannot be reached the submenu shows 'The library could not be loaded.' and nothing is attached.
4. On the phone in Cloud mode, a Library pick that is already on the draft raises the 'Already attached' alert and is not added twice.
5. On the phone, a Library item that has an asset id is not uploaded again on send.
6. In the CLI, '@dir/' in a trusted workspace sends entry names only and never file contents; in an untrusted workspace only the path is sent.
7. On the web code surface, each repository connection state shows its own message, not a blank list.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A Library attach on web re-uploads the bytes at send because the draft holds a File, not an asset id [inferred from libraryItemToFile building a File and the upload happening at send in apps/web/features/chat/pages/WebChatPage.tsx:2684].
- Library downloads may count against a plan download allowance, since the file route calls assertDownloadAllowance for large files and the menu has code for a 429 with a cap and reset time (apps/web/app/api/files/[id]/route.ts:173; ComposerFilesMenu.tsx:106-141).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let the plus-menu Library submenu search, as the AGI Work popover does.
- [proposed] Reuse the Library asset id on web so a Library file is not downloaded and uploaded again.
- [proposed] Decide whether VS Code should show repository or folder context at all; the brief says done but the code shows none.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerPlusMenu LibraryRows | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Row 'Add from library' and its submenu with loading, empty, error and attach states (line 1011). |
| component | ComposerFilesMenu | `apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx` | 'Files' popover; also exports fetchRecentLibraryFiles, libraryItemToFile and useLibraryFiles used by the plus menu. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Wires onAttachLibraryFile to addChatAttachments (line 6011) and mounts the Files popover (7094) and the local folder dialog (7024). |
| hook | useAttachments | `apps/web/features/chat/hooks/use-attachments.ts` | Runs size, type, count, total and duplicate checks for every incoming file, including Library files (admitFiles at line 332). |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Lists the account's Library assets; each item's uri is /api/files/{id} (line 75). |
| endpoint | GET /api/files/{id} | `apps/web/app/api/files/[id]/route.ts` | Serves the file bytes; checks a download allowance for large files (line 173). |
| table | media_assets | `apps/web/app/api/library/route.ts` | Table the Library list reads (query at line 130 selects from public.media_assets). |
| component | LocalFolderAttachDialog | `apps/web/features/desktop-host/components/LocalFolderAttachDialog.tsx` | Desktop dialog that browses approved folders and attaches one chosen file. |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Phone sheet with the 'Attach from Library' section for Cloud and Local modes. |
| service | fetchLibraryPage | `apps/mobile/src/features/library/libraryClient.ts` | Phone client for the Library list (line 110). |
| component | ChatInput addAttachments | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Phone intake for Library picks: duplicate check, limit check, alerts (line 619). |
| component | CodeComposer RepositoryPicker | `apps/web/features/code/components/CodeComposer.tsx` | Web code surface repository chip, search and result list (lines 672-802). |
| hook | useCodeRepositories | `apps/web/features/code/hooks/use-code-repositories.ts` | Loads repositories and maps connection status to UI state. |
| endpoint | GET /api/github/repositories | `packages/contracts/cloud-contracts/src/cloud-code-sessions.ts` | Path constant CLOUD_CODE_REPOSITORIES_PATH used by the code API client (line 14). |
| service | expand_mentions | `apps/cli/src/mentions.rs` | Turns @path tokens into file or directory context; directory_listing builds the name list (lines 315, 468). |
| command | handle_add_dir / handle_files | `apps/cli/src/claude_parity.rs` | CLI commands /add-dir, /remove-dir and /files (lines 332, 389). |
| config | --repo and --add-dir flags | `apps/cli/src/lib.rs` | Launch flags that set the repository and extra directories (lines 411, 422). |
| test | ComposerFilesMenu tests | `apps/web/features/chat/components/Composer/ComposerFilesMenu.test.tsx` | Covers the Library menu behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The web composer opens the Library submenu and requests the recent list. | device and our servers | apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:91-98 (GET /api/library?limit=6) |
| The server returns Library items read from the media_assets table with a file uri. | our servers | apps/web/app/api/library/route.ts:75, :130 |
| The chosen file's bytes are fetched from the file route and wrapped in a File on the device. | device and our servers | ComposerFilesMenu.tsx:164-176; apps/web/app/api/files/[id]/route.ts:194 |
| The File goes through the same on-device intake checks as a device file. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6011; apps/web/features/chat/hooks/use-attachments.ts:332 |
| On send the file is uploaded again like any other attachment (see F014-10). | device and our servers | apps/web/features/chat/pages/WebChatPage.tsx:2684 |
| Phone Cloud: the sheet lists assets from the Library; a pick keeps its asset id and skips upload on send. | device and our servers | apps/mobile/src/features/chat/components/AddToChatSheet.tsx:399; apps/mobile/stores/chat/chatExecutionStore.ts:2478 |
| Phone Local mode lists files from local conversations; nothing is fetched from servers. | device | AddToChatSheet.tsx:368-385 |
| CLI expands @dir/ into a name listing read from the local disk. | device | apps/cli/src/mentions.rs:336-352, :468-488 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Library files | Server table media_assets and object storage; thumbnails by id | Account scoped; shown on web, desktop and phone | Kept until deleted; deleted files can be restored for 30 days (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:156; apps/web/lib/resources/deletion-policies.ts:8) |
| Draft attachment (File object) | Browser memory until send | No | Dropped when removed or the draft is cleared (apps/web/features/chat/hooks/use-attachments.ts:531-562) |
| CLI directory listing | Prompt text for that turn | No | Part of the conversation; unknown beyond that |

**Models and providers.** The picker itself does not choose a model. Once attached, the file's usability depends on the selected model (see F014-12). No provider is named in the Library picker code.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Library and repository lists need a signed-in cloud account [inferred]. CLI folder mention needs none. |
| Permissions | Web file downloads use the signed-in session cookie (credentials: include, ComposerFilesMenu.tsx:166). Desktop asks permission before reading an approved folder (LocalFolderAttachDialog.tsx:26). CLI paths are validated to stay in the workspace (apps/cli/src/mentions.rs:325). |
| Subscription | Attachment size and count limits come from the plan (apps/web/features/chat/lib/composer-attachment-limits.ts:12-29). No plan gate on the Library picker itself was found. |
| Limits and metering | Menu shows 6 files (ComposerFilesMenu.tsx:41); phone shows 12 (AddToChatSheet.tsx:127). A Library file download may be refused with a 429 and a cap and reset time (ComposerFilesMenu.tsx:106-141). CLI listing capped at 200 entries (mentions.rs:30). |
| Feature flags | The web project Google Drive entry is gated by connectorsReleased (not part of this feature). No flag found for the Library picker. |
| Model compatibility | Attached Library images and PDFs need a model that can read them; the same conflict banner applies (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1554). |
| Provider restrictions | none found in the code |
| Local mode | Web and desktop on-device model: any attachment, Library files included, is refused with 'Local models on this device cannot read attachments. Switch to a cloud model or remove the attachment.' (packages/contracts/local-runtime/src/inference.ts:131; ChatComposerNew.tsx:1589). Phone Local mode: no cloud Library; recent local non-image files are listed; the 'File' card is hidden (AddToChatSheet.tsx:368-385, :722). CLI works from the local disk. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Library loading | Spinner row 'Loading files'. | apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1059-1065 |
| Library empty | 'No files in your library yet.'; with a search, 'No library file matches that search.' | ComposerFilesMenu.tsx:34, :56 |
| Library list fails | Error row 'The library could not be loaded.' | ComposerFilesMenu.tsx:36, :202-229 |
| File fetch fails or is rate limited | Error row; menu stays open; 429 shows wait or cap text. | ComposerFilesMenu.tsx:117-141; ComposerFilesMenu.test.tsx |
| Phone Library fails | 'Your Library could not load.' and 'Try again'. | AddToChatSheet.tsx:793-815 |
| Account changes while the phone list loads | Stale results are dropped by a request counter and scope check. | AddToChatSheet.tsx:395-436 |
| Library file already on the draft (phone) | Alert 'Already attached'. | apps/mobile/src/features/chat/components/ChatInput.tsx:657 |
| Offline | not handled in the code for the Library menu specifically; the fetch fails and shows the load error. | ComposerFilesMenu.tsx:202-229 |
| Attachments unavailable (image or video generation mode) | The Add from library row is disabled with a reason. | ComposerPlusMenu.tsx:1034-1040 |
| CLI untrusted workspace | Only the path is sent. | apps/cli/src/mentions.rs:336-342 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ComposerFilesMenu.test.tsx`: Asks for six recent files, search through q, wraps fetched bytes in a File, rate-limit copy with Retry-After and cap, empty state, Upload from device, no fetch until open.
- `apps/web/features/chat/components/Composer/ComposerPlusMenu.test.tsx`: Plus menu rows (file lists titles not read in full).
- `apps/web/features/desktop-host/__tests__/LocalFolderAttachDialog.test.tsx`: Folder dialog: reread on folder drop, open, reveal, refusal shown, row attaches, stale listing dropped.
- `apps/mobile/src/features/chat/components/__tests__/ChatInput.attachmentIdentity.test.tsx`: Same Library asset refused by asset id; different assets kept.
- `apps/cli/src/mentions.rs`: In-file tests for mention expansion: inline text, credential link, untrusted workspace, oversize file, image routing; no directory-listing test found.

**Test scenarios**

- **Attach a Library file on web**
  1. Sign in with at least one Library file.
  2. Open the plus menu, tap Add from library, tap a file.
  - Expected: A chip with the file name appears and the menu closes.
- **Library unavailable**
  1. Block GET /api/library.
  2. Open Add from library.
  - Expected: The row 'The library could not be loaded.' shows.
- **Library file over the plan limit**
  1. Use an account whose limit is below the file size.
  2. Attach the file from the Library.
  - Expected: A notice names the file and the limit; no chip.
- **Phone Library pick twice**
  1. Cloud mode: attach a Library picture.
  2. Open the sheet and pick the same picture.
  - Expected: Alert 'Already attached'; one chip.
- **CLI folder mention**
  1. Open the CLI in a trusted repository.
  2. Send 'summarize @src/'.
  - Expected: The model receives entry names only, not contents.
- **Local on-device model with a Library file**
  1. Select an on-device model on web.
  2. Attach a Library file.
  - Expected: The conflict banner with 'Switch to a cloud model' appears and send is blocked.

**Where to look when it fails**

- Web: browser network tab for /api/library and /api/files/{id}; logger.warn lines in the library route.
- Phone: the error state in the sheet; account epoch changes drop results silently.
- CLI: the 'skipped' reasons in the mention expansion.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/014-attachment-intake-components.md](../../70-qa/test-plans/web/014-attachment-intake-components.md)
- Desktop: [70-qa/test-plans/desktop/014-attachment-intake-components.md](../../70-qa/test-plans/desktop/014-attachment-intake-components.md)
- Mobile: [70-qa/test-plans/mobile/014-attachment-intake-components.md](../../70-qa/test-plans/mobile/014-attachment-intake-components.md)
- CLI: [70-qa/test-plans/cli/014-attachment-intake-components.md](../../70-qa/test-plans/cli/014-attachment-intake-components.md)

## 10. Gaps and dependencies

- **VS Code is marked done for repository and folder attach in the brief, but no such control or message exists in the code found.** Affects: VS Code. Evidence: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3985; apps/extension-vscode/src/protocol/webviewMessages.ts:145. Work needed: Decide the requirement; correct the brief or build it.
- **Folder attach in the CLI gives names only; the brief's 'use the files inside it' is met only by the model opening files itself.** Affects: CLI. Evidence: apps/cli/src/mentions.rs:468-488. Work needed: Confirm with the owner that name-only is the intended behaviour and say so in the product copy.
- **Library submenu in the plus menu cannot search; only the AGI Work popover can.** Affects: Web, desktop. Evidence: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1016. Work needed: Add a search field or move users to the popover.
- **Repository attach is missing on the phone and Chrome and not found in the desktop-specific code.** Affects: Phone, Chrome. Evidence: brief S14.11; no code found. Work needed: Decide whether required; a decision record says features the leaders lack are not built.
- **A Library file on web is downloaded then uploaded again, with possible download-allowance cost.** Affects: Web, desktop. Evidence: ComposerFilesMenu.tsx:164; WebChatPage.tsx:2684. Work needed: Send the existing asset id instead of the bytes.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- mode:local
- api:GET /api/library
- api:GET /api/files/{id}
- api:GET /api/github/repositories
- table:media_assets
- file:apps/web/features/chat/hooks/use-attachments.ts
- F014-09
- F014-11
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries

## Unknown

- Whether the selected repository is passed to the code task as context was not traced; only the picker was read.
- Whether a Library download on web spends the plan download allowance for ordinary-sized files; only the large-file redirect branch was read.
- How the desktop Tauri build (apps/desktop/src, retained internal code) attaches folders; the CloudFolderAttachSheet there was not read.
- Whether VS Code offers any repository or folder attach through another command.
- Whether a CLI test covers the directory listing.
