---
id: "F024-08"
type: "feature"
title: "Use a file in a chat or a project"
aliases: ["Add to chat", "Add to Work", "Add to project", "Ask about this file", "Open chat", "Attach to chat", "Add to Project", "Open originating conversation", "S24.27", "S24.28", "S24.29"]
area: "24 Library and file-management experience"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "seen failing", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S24.27", "S24.28", "S24.29"]
depends_on: ["F024-07", "F024-09", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "table:media_assets", "table:project_knowledge_files", "api:GET /api/files/[id]", "api:POST /api/projects/[id]/knowledge-files", "surface:web", "surface:mobile", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F024-08 Use a file in a chat or a project

From the Library on web a person can add a file to a new chat, to a new AGI Work session or to a project, ask about it in the viewer, or open the chat it came from. Mobile has Add to chat and Open chat but no Add to project. The internal Tauri desktop Library has none of these actions.

Area: [24. Library and file-management experience](README.md). Requirement items: [S24.27](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2427), [S24.28](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2428), [S24.29](../../10-requirements/capabilities/024-library-and-file-management-experience.md#s2429).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen failing |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Takes a saved Library file into other work: a new chat as an attachment, a new Work session, a project as knowledge for every chat in it, or back to the chat that produced it.

**Why it exists.** Saved files should be reusable without downloading and re-uploading by hand. (S24.27, S24.28, S24.29 in the area brief)

**Who uses it.** Signed-in people with uploaded or generated files, on web, the public Desktop (hosted web app) and mobile.

**Problems it solves**

- Re-attaching a past file to a new chat.
- Giving a project standing knowledge from an existing file.
- Finding the conversation that made a generated file.

**Use cases**

- Add an old PDF to a new chat and ask for a summary.
- Add a spec to a project so every chat there can use it.
- Open the chat that generated an image to continue it.
- Type a question in the viewer's 'Ask about this file' box.

## 2. User experience

**Where to find it**

- Web: Library, a file's 'Actions for <file name>' menu: 'Add to chat', 'Add to Work', 'Open chat', 'Add to project' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1800-1853); the file viewer has an 'Ask about this file' box (LibraryView.tsx:1349-1350).
- Public Desktop: same hosted web page [inferred from AGENTS.md section 5: the public Desktop shows the hosted web app].
- Mobile: Library, a file's action menu: 'Add to chat' and 'Open chat' (apps/mobile/src/features/library/index.tsx:626-640); the file viewer has an open-chat control when the file has a chat (index.tsx:1157).
- Internal Tauri Desktop Library: no such menu items; its transport has no addToChat, addToProject or openConversation (apps/desktop/src/features/library/DesktopLibrary.tsx:158-195).

**Before you start**

- Signed in.
- Web: 'Add to project' shows only if the host can list projects and the file type is an accepted attachment type (LibraryView.tsx:679-681 area, 1844-1846).
- Web: the file must not be in Recently deleted; hand-off actions are hidden there (LibraryView.tsx:1781-1790).
- Mobile: Add to chat only in Cloud mode and not for video (index.tsx:626-628).

**Screens and controls**

- Row menu items with icons (web).
- Dialog 'Add to project' lists the person's projects, or 'You have no projects yet. Create one first, then add this file to it.' (LibraryView.tsx:1910-1925).
- Viewer: text box 'Ask about this file' and button 'Ask' (LibraryView.tsx:1349-1370).
- Mobile action sheet titled with the file name.

**Journey**

1. Open Library and find the file.
2. Open its Actions menu.
3. Choose Add to chat or Add to Work: the app reads the stored bytes, stages them in a new chat composer and navigates to a new chat (apps/web/features/library/components/LibraryView.tsx:217-228).
4. Or choose Add to project, pick a project in the dialog; the bytes are uploaded as project knowledge and the dialog closes with the toast 'Added to <project name>' (lines 234-240).
5. Or choose Open chat to go to /chat/<conversation id> (line 215-216).
6. On mobile choose Add to chat; the file is staged in the new-chat composer and the Chat tab opens (index.tsx:530-543).

**What the person sees and gets**

- Toast 'Added to <project>' on success (web).
- On failure the row shows the error text, for example 'Add to chat failed.' or the file-too-large message (LibraryView.tsx:640-655; apps/web/features/library/lib/library-chat-handoff.ts:18-19).
- The project dialog shows the error with role alert and stays open (LibraryView.tsx:1948-1953).
- A spinner replaces the row menu button while the action runs (LibraryView.tsx:1763-1768).

**Settings**

- Project must exist, and the project knowledge file count and plan storage allowance apply (apps/web/lib/server/project-knowledge-files.ts:246-268).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web Add to chat and Add to Work stage the file bytes and open a new chat (apps/web/features/library/components/LibraryView.tsx:217-232; apps/web/features/library/lib/library-chat-handoff.ts:61-70).
- Web Add to project reads the bytes and uploads them as project knowledge, so the project has its own copy (LibraryView.tsx:234-240).
- Web Open chat is shown only for items with a conversation_id (LibraryView.tsx:1822; apps/web/app/api/library/route.ts:86).
- Web viewer 'Ask about this file' stages the file with the typed question (LibraryView.tsx:209-214).
- Mobile Add to chat and Open chat (index.tsx:526-543,626-640).

**Incomplete**

- Mobile has no Add to project (no such item in the action menu, index.tsx:623-655).
- Large files: reading a file over the serve limit fails with 'This file is too large to add from the Library. Download it, then add it from your device.' (library-chat-handoff.ts:18-19).

**Present but disconnected or switched off**

- Internal Tauri DesktopLibrary does not pass addToChat, addToProject, addToWork, openConversation or askAboutFile, so the shared view hides those items (DesktopLibrary.tsx:158-195; LibraryView.tsx:1800-1853). Brief marks desktop done; the code here does not show it [inferred that the brief refers to the hosted web Library in Electron].

**Not available**

- CLI, VS Code and Chrome: no Library file hand-off (brief S24.27-S24.29 missing).
- Mobile Add to project (brief S24.27 mobile missing).

## 4. Required behaviour

**Established requirements**

- Users can add a Library file to a project. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.27)
- Users can attach a Library file to a conversation. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.28)
- From a Library file users can open the conversation it came from. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S24.29)
- Delete/restore is reflected in listing and download authorization. (source: docs/product/experience-contract.md:784)

**Acceptance criteria**

1. Web: Add to chat opens a new chat with the file shown as an attachment.
2. Web: Add to project makes the file appear in that project's files, and a toast reads 'Added to <project>'.
3. Web: Open chat appears only for files that came from a chat and opens that chat.
4. Web: none of these appear in Recently deleted.
5. Web: a file too large to fetch shows the too-large message on its row and no chat opens.
6. Mobile: Add to chat puts the file in the new-chat composer; Open chat opens the chat.
7. Adding to a project fails with a readable error when the project is at its file maximum or the storage allowance is used up.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A project copy counts toward file storage twice (the Library row and the project knowledge row), since both are summed [inferred from apps/web/lib/server/file-storage.ts:34-60].
- Mobile Add to project needs the project list and knowledge upload client on mobile [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add 'Add to project' to the mobile action menu.
- [proposed] Give the internal Tauri Library the same hand-off transport, or retire it in favour of the hosted page.
- [proposed] Show the storage effect in the project dialog.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Shared LibraryView (menu, project dialog, viewer) | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Menu items 1800-1853, AddToProjectDialog 1892-1960, viewer Ask box 1349. |
| component | Web LibraryView host | `apps/web/features/library/components/LibraryView.tsx` | Transport: askAboutFile 209, openConversation 215, addToChat 217, addToWork 221, addToProject 234. |
| service | library-chat-handoff | `apps/web/features/library/lib/library-chat-handoff.ts` | Reads stored bytes into a File and stages them in the pending new chat. |
| service | libraryItemToFile | `apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx` | Fetches item.uri and builds a File (line 164). |
| service | uploadProjectKnowledgeFile | `apps/web/features/projects/services/project-knowledge-upload.ts` | Uploads the bytes to the project through the managed cloud knowledge client. |
| endpoint | POST /api/projects/[id]/knowledge-files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | Registers the project knowledge file (lines 74-113). |
| service | registerProjectKnowledgeFile | `apps/web/lib/server/project-knowledge-files.ts` | Enforces file count and storage allowance, stores row (lines 246-268, 299). |
| endpoint | GET /api/files/[id] | `apps/web/app/api/files/[id]/route.ts` | Serves the stored bytes; 404 for deleted or missing (line 206). |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Returns conversation_id per item (line 86). |
| screen | Mobile LibraryScreen | `apps/mobile/src/features/library/index.tsx` | handleAddToChat 526, handleOpenFileChat 518, action menu 623. |
| service | stageComposerAttachments (mobile) | `apps/mobile/src/features/library/index.tsx` | Called at line 527 to stage the attachment for the new chat. |
| component | DesktopLibrary (internal Tauri) | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Transport without hand-off actions (158-195). |
| table | project_knowledge_files | `apps/web/lib/server/project-knowledge-files.ts` | Row for the project's copy (insert at line 394). |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | Source row for the Library file. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person picks Add to chat, Add to Work or Add to project on a row. | device | packages/ui/unified-chat/src/components/library/LibraryView.tsx:1800-1853 |
| The web page fetches the stored bytes from /api/files/<id> and builds a File. | device and our servers | apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:164-175 |
| For chat or Work, the File is parked in memory with the chosen mode and draft, and the browser goes to a new chat. | device | apps/web/features/library/lib/library-chat-handoff.ts:61-70 |
| For a project, the File is uploaded to the project knowledge endpoint; the server checks the file count and storage allowance and stores a project copy. | our servers | apps/web/features/projects/services/project-knowledge-upload.ts:42-53; apps/web/lib/server/project-knowledge-files.ts:246-268 |
| For Open chat, the browser routes to /chat/<conversation id>. | device | apps/web/features/library/components/LibraryView.tsx:215-216 |
| On mobile, Add to chat stages the asset (uri, mime, name, size, asset id) for the new chat and switches to the Chat tab. | device | apps/mobile/src/features/library/index.tsx:526-543 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Project knowledge copy of the file | table project_knowledge_files plus object storage | Cloud, visible to all chats in the project | Independent of the Library row; own delete path (apps/web/app/api/cron/purge-deleted-media/route.ts:20-24 purges deleted project files) |
| Staged attachment | In-memory variable on web (library-chat-handoff.ts:17); composer store on mobile | No | Until the new chat sends or the page reloads [inferred] |

**Models and providers.** The hand-off itself uses no model. After the chat is sent, the chosen model and provider handle the attached file under the normal chat pipeline (SYS-chat-turn-pipeline). Project knowledge is indexed for retrieval; which embedding model is used: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; signed-out web shows a sign-in prompt (apps/web/features/library/components/LibraryView.tsx:106-125). |
| Permissions | Rows are scoped to the user and active workspace (apps/web/lib/server/media-assets.ts:403-445). Project must be readable and writable by the user [inferred from knowledge-files route]. |
| Subscription | Project file storage allowance comes from the plan's knowledge storage limit (apps/web/lib/services/free-plan-entitlements.ts:18-22; file-storage.ts:63-91). Plan names: not stated here. |
| Limits and metering | Project knowledge max files (apps/web/lib/server/project-knowledge-files.ts:246-248); storage allowance check at line 268; a file above the inline serve limit cannot be read into the page (library-chat-handoff.ts:18-19); an uploaded file larger than the chat attachment size is checked against the monthly download allowance only when saving to disk (LibraryView.tsx:562-568). |
| Feature flags | Mobile Add to chat only when appMode is 'cloud' (index.tsx:626). Other flags: none found in the code. |
| Model compatibility | Add to project is limited to accepted attachment types (LibraryView.tsx:1844-1846). Which models can read each type is decided later in the chat pipeline: unknown here. |
| Provider restrictions | none found in the code for the hand-off itself. |
| Local mode | Mobile hides Add to chat outside Cloud mode (index.tsx:626). The Library list comes from /api/library, which needs a cloud account. Local-only file hand-off: not found in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Row button shows a spinner and is disabled while a hand-off runs. | packages/ui/unified-chat/src/components/library/LibraryView.tsx:1763-1768 |
| Empty project list | Dialog says 'You have no projects yet. Create one first, then add this file to it.' | LibraryView.tsx:1922-1927 |
| Error | Row error text 'Add to chat failed.' or the underlying message; project dialog shows an alert and re-enables the buttons. | LibraryView.tsx:640-655,1940-1953 |
| File too large to read | Message tells the person to download and add from the device. | apps/web/features/library/lib/library-chat-handoff.ts:18-19 |
| File deleted or missing (404 or 410) | Download marks it 'unavailable'; for hand-off the fetch fails and the row shows the error. | LibraryView.tsx:575-583 |
| Recently deleted view | Only Restore and Delete permanently are offered. | LibraryView.tsx:1781-1790 |
| Offline or retry | Generic error; no automatic retry. Retry means choosing the action again. | LibraryView.tsx:640-655 |
| Cancel | The project dialog can be closed only while nothing is pending; a pending add cannot be cancelled. | LibraryView.tsx:1898-1902 |
| Accessibility | Menu has role=menu with labels; the project add button shows a spinner; keyboard support through the shared menu primitives [inferred]. | LibraryView.tsx:1775-1779 |
| Mobile video | Add to chat is not offered for video. | index.tsx:626 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Hands the item to the host for chat and Work (878); no hand-off from Recently deleted (906); adds file to the picked project (924); keeps the picker open with the reason on failure (942); Add to project only if host lists projects (962).
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Adds to a new chat (485) and a new Work session (501); uploads stored bytes into the picked project (548); gives the chat its own copy of the bytes (619); explains a file the server will not hand over (742).
- `apps/web/features/library/lib/__tests__/library-chat-handoff.test.ts`: Staging bytes, draft and mode once (37); keeps an unsent draft (83); stages nothing when unreadable (120).
- `apps/mobile/__tests__/LibraryActionMenus.test.tsx`: Adds the image to a new chat (221); opens the chat it came from (239); action order (212).

**Test scenarios**

- **Add a file to a chat on web**
  1. Upload a PDF in Library.
  2. Open its menu and choose Add to chat.
  - Expected: New chat opens with the PDF attached.
- **Add to project**
  1. Choose Add to project on a text file.
  2. Pick a project.
  - Expected: Toast 'Added to <name>'; the file appears in the project; the Library row remains; storage used rises.
- **Open originating chat**
  1. Generate an image in a chat.
  2. Open Library, menu on the image, choose Open chat.
  - Expected: The source chat opens. An uploaded file with no chat shows no Open chat item.
- **Project at maximum**
  1. Fill a project to its file maximum.
  2. Add another from Library.
  - Expected: Dialog shows the maximum-files message and stays open.
- **Mobile attach**
  1. On mobile in Cloud mode open a file menu.
  2. Choose Add to chat.
  - Expected: Chat tab opens with the file in the composer.
- **Internal Tauri Library**
  1. Open the Library in the Tauri desktop build.
  2. Open a file menu.
  - Expected: No Add to chat, Add to project or Open chat items.

**Where to look when it fails**

- Server log 'Library download meter could not be read' relates to downloads, not hand-off.
- HTTP 413 from /api/files/<id> triggers the too-large message.
- HTTP 429 with Retry-After from the file fetch is read by LibraryFileError (ComposerFilesMenu.tsx:164-172).
- project_knowledge_files rows for the project show whether the copy was stored.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/024-library-and-file-management-experience.md](../../70-qa/test-plans/web/024-library-and-file-management-experience.md)
- Desktop: [70-qa/test-plans/desktop/024-library-and-file-management-experience.md](../../70-qa/test-plans/desktop/024-library-and-file-management-experience.md)
- Mobile: [70-qa/test-plans/mobile/024-library-and-file-management-experience.md](../../70-qa/test-plans/mobile/024-library-and-file-management-experience.md)

## 10. Gaps and dependencies

- **Mobile has no Add to project** Affects: Mobile users. Evidence: apps/mobile/src/features/library/index.tsx:623-655; brief S24.27. Work needed: Add the menu item, a project picker and the knowledge upload client on mobile.
- **Internal Tauri Library lacks hand-off actions though the brief marks desktop done** Affects: Users of the internal desktop build; public Electron is the hosted web app. Evidence: apps/desktop/src/features/library/DesktopLibrary.tsx:158-195. Work needed: Confirm which desktop surface ships; either wire the transport or drop the claim.
- **Add to project copies bytes through the browser and the copy counts again toward storage** Affects: Web users near their storage allowance. Evidence: apps/web/features/library/components/LibraryView.tsx:234-240; apps/web/lib/server/file-storage.ts:34-60. Work needed: Consider a server-side link instead of a copy, or show the cost.
- **No hand-off on CLI, VS Code or Chrome** Affects: Users of those apps. Evidence: Brief S24.27-S24.29 missing. Work needed: Define whether those apps need a Library at all.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F024-07
- F024-09
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- table:media_assets
- table:project_knowledge_files
- api:GET /api/files/[id]
- api:POST /api/projects/[id]/knowledge-files
- surface:web
- surface:mobile
- mode:cloud

## Unknown

- Whether the public Electron Desktop opens the web /chat/library page (doc: AGENTS.md section 5 says it shows the hosted web app).
- Mobile Local mode behaviour for the Library screen.
- Which embedding model indexes project knowledge.
- The exact value of the maximum project knowledge file count and the per-plan storage limits (read from configuration, not opened).
