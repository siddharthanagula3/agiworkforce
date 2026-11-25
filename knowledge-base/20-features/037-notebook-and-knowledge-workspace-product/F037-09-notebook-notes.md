---
id: "F037-09"
type: "feature"
title: "Notebook notes"
aliases: ["Notebook notes", "Project notes", "Notes.md", "Save to project", "Saved answer", "Answer from chat saved as a file", "S37.16", "S37.17", "S37.18"]
area: "37 Notebook and knowledge-workspace product"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S37.16", "S37.17", "S37.18"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-shared-ui-and-design", "F037-07", "F037-08", "table:project_knowledge_files"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F037-09 Notebook notes

Web and Desktop (hosted web): the notebook Sources tab has a Notes panel with one markdown editor. Saving stores it as the source file Notes.md, which chats then use like any source. A chat answer menu offers Save to project, writing the answer as a file. Only one notes file exists. No other app has notes.

Area: [37. Notebook and knowledge-workspace product](README.md). Requirement items: [S37.16](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3716), [S37.17](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3717), [S37.18](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3718).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives a notebook a single editable note kept beside its sources, saved as the file Notes.md, and lets the person save an assistant answer into the notebook as a markdown file.

**Why it exists.** The brief wants notes the user can list, open and edit, editable beside sources, and a one-action save of an answer (S37.16-S37.18). The founder decisions list says Claude and ChatGPT projects have no notes editor or save-answer, yet the code ships both; code wins for what exists.

**Who uses it.** A person who wants to keep their own thoughts or a good answer in a notebook so later chats can use it.

**Problems it solves**

- Own ideas cannot be added without writing a file elsewhere.
- A good answer is lost when the chat is long.
- Notes should ground later answers.

**Use cases**

- Write research questions in Notes and ask the notebook chat to address them.
- Save a briefing answer to the notebook as 'Answer from <chat title>.md'.
- View notes as a read-only member of a shared notebook.

## 2. User experience

**Where to find it**

- Web and Desktop: notebook page, Sources tab, panel 'Notes' under the 'Create from your sources' row (apps/web/app/chat/projects/[id]/page.tsx:1321-1339; ProjectNotes.tsx:143-164).
- Web and Desktop: in a chat that belongs to a notebook, answer action menu item 'Save to project' (apps/web/features/chat/components/messages/MessageBubble.tsx:4026-4034).
- Mobile, CLI, VS Code, Chrome: not found.

**Before you start**

- Signed in; notebook open on Web or Desktop.
- Edit rights; viewers see read-only text (ProjectNotes.tsx:181-184).
- Save to project is hidden for a shared project without write access (WebChatPage.tsx:6156-6160).

**Screens and controls**

- Toggle button 'Notes' with hint 'Kept beside your sources and used as one'.
- Editor (document editor) of height about 18 rem, 'Unsaved changes' label, button 'Save notes' / 'Saving…'.
- Read-only block with text or 'No notes yet.'
- 'Try again' link when notes fail to load.

**Journey**

1. Open Sources tab and click Notes to expand.
2. The notes load by listing files and fetching the one named Notes.md (ProjectNotes.tsx:35-45).
3. Type in the editor; 'Unsaved changes' appears.
4. Click Save notes; the file is uploaded as a new version.
5. Toast 'Notes saved. The assistant uses them as a source in this project.' and the sources list reloads.
6. For a chat answer: open the answer menu, choose Save to project; toast 'Saved to <project name>'.

**What the person sees and gets**

- Toasts for success and 'Your notes were not saved'.
- Leaving with unsaved notes shows a discard dialog: 'Your notes have not been saved. If you leave now, they will be lost.' (ProjectNotes.tsx:137-140).
- A source file named Notes.md, or 'Answer from <title>.md', or 'Saved answer.md' (project-answer-save.ts:21-29).

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop: notes load, edit, save as Notes.md, reload sources list, unsaved guard, retry on load failure (ProjectNotes.tsx:47-210).
- Web/Desktop: unsaved draft kept when collapsing and re-expanding without reloading (Notebook.test.tsx:125-134).
- Web/Desktop: Save to project writes the answer as a markdown file through the same upload path (WebChatPage.tsx:6156-6171; MessageBubble.tsx:1142-1158).
- Read-only users cannot edit notes or save answers.

**Incomplete**

- Only one notes file; no list of notes (ProjectNotes.tsx:14, a single constant name).
- Saving notes uploads a new version of Notes.md each time (version rule in project-knowledge-files.ts:394-408), which counts against file and storage caps [inferred].

**Present but disconnected or switched off**

- none found.

**Not available**

- Mobile, CLI, VS Code, Chrome: no notes or save-to-project.
- Notebook export: no code found (founder decisions list names S37.35 as not offered by the leaders, doc: docs/decisions/2026-09-27-founder-decisions.md:102-105).
- The brief marks S37.16 and S37.17 as not applicable and S37.18 as missing; the code has a notes panel and a Save to project action, so the brief is out of date.

## 4. Required behaviour

**Established requirements**

- The notebook holds user notes that can be listed, opened and edited. Marked not applicable. (source: brief S37.17)
- Notes are editable in a panel next to the sources. (source: brief S37.18)
- The user can save a chat response into the notebook in one action. Marked not applicable. (source: brief S37.16)
- Claude and ChatGPT projects have no notes editor or save-answer-to-knowledge; not added by the extension. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:96-98,102-105)
- An action a user cannot undo asks first; mutations are not fired straight from onClick. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Type and save notes; reopening shows the same text.
2. After saving, a notebook chat can answer from the note text.
3. A read-only member sees the note and cannot edit.
4. Leaving with unsaved text shows the discard dialog.
5. Save to project on an answer adds a markdown file to Sources named from the chat title.
6. A failed save shows an error and keeps the text.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The founder entry and the shipped notes conflict; the owner should confirm whether to keep or remove the editor.
- [inferred] Replacing a note creates a new version each save, so version history may grow.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide keep or cut and update the register.
- [proposed] If kept, add a notes list and Mobile access.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ProjectNotes | `apps/web/features/projects/components/ProjectNotes.tsx` | Notes panel, load, edit, save, guard |
| component | ArtifactDocumentEditor | `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx` | The editor loaded inside the Notes panel (dynamic import, ProjectNotes.tsx:16-20); path assumed from import alias |
| service | project-knowledge-upload | `apps/web/features/projects/services/project-knowledge-upload.ts` | List and upload project knowledge files (imported by ProjectNotes.tsx:9-12) |
| screen | Project page | `apps/web/app/chat/projects/[id]/page.tsx` | Mounts ProjectNotes and reloads sources on save (1330-1334) |
| hook | project-answer-save | `apps/web/features/projects/components/project-answer-save.ts` | Context, file name rule for saved answers |
| component | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Builds the save function and provider (6156-6171, 7728) |
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Save to project menu item |
| endpoint | knowledge-files list and create | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | Lists and registers files, including notes |
| endpoint | knowledge file content | `apps/web/app/api/projects/[id]/knowledge-files/[fileId]/text/route.ts` | Directory exists under [fileId]; the notes read uses [fileId] route (ProjectNotes.tsx:39-42) |
| service | project-knowledge-files | `apps/web/lib/server/project-knowledge-files.ts` | Versioning: same name supersedes older version |
| table | project_knowledge_files | `apps/web/lib/server/project-knowledge-files.ts` | Stores notes and saved answers as sources |
| service | project-context-service | `apps/web/lib/services/project-context-service.ts` | Feeds notes text into chats like any file |
| test | Notebook.test.tsx | `apps/web/features/projects/components/__tests__/Notebook.test.tsx` | Notes tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Opening Notes lists project files and finds Notes.md, then fetches its text. | device and our servers | ProjectNotes.tsx:35-45 |
| Save wraps the draft in a File named Notes.md of type markdown and uploads it through the project knowledge upload. | device | ProjectNotes.tsx:117-120 |
| The upload goes to storage and registers a file; the server scans and extracts text and inserts a new version superseding the old. | our servers | project-knowledge-files.ts:370-420 |
| The Sources list reloads by bumping its key. | device | page.tsx:1333,1335-1336 |
| Save to project: the answer text becomes a markdown file named from the chat title, uploaded the same way. | device and our servers | WebChatPage.tsx:6162-6168 |
| Later chat turns load the file as ordinary project knowledge. | our servers | project-context-service.ts:188-230 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Notes.md and saved answers | object storage plus table project_knowledge_files with extracted text | Server-side for every signed-in app that lists project files | Old versions marked superseded; delete from the Sources list asks to confirm and cannot be undone (SourcesPanel.tsx) |
| Unsaved draft | component memory only | No | Lost on leaving, after the discard dialog |

**Models and providers.** No model call in saving. Notes affect answers only through the chat turn (F037-08).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | Owner or editor; viewers read-only (ProjectNotes.tsx:111,181; page.tsx:1332). |
| Subscription | Notes count toward the per-project file cap (40) and the plan's file storage limit through the normal upload path (file-storage.ts:53-60) [inferred]. |
| Limits and metering | Per-file size limit and cap: not read; file cap 40 (suite-contracts.ts:502). |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Not available: notes are server-stored project files; hosted web only. Own key mode: not found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Loading your notes'; editor spinner 'Opening the notes' | ProjectNotes.tsx:167-170,23-27 |
| Load failed | 'Your notes could not be loaded.' with Try again | ProjectNotes.tsx:171-180 |
| Empty | Empty editor, or 'No notes yet.' read-only | ProjectNotes.tsx:38,183 |
| Saving | Button 'Saving…' and disabled; second click ignored | ProjectNotes.tsx:111-112,200 |
| Save failed | Toast error; draft kept | ProjectNotes.tsx:125-128 |
| Switch notebook while saving | Stale results ignored by lifetime counter | ProjectNotes.tsx:69,94,121 |
| File cap or storage cap reached | Upload error shown through the error toast; message text from server | file-storage.ts:63-74; ProjectNotes.tsx:127 |
| Offline | not handled in the code beyond the error toast | ProjectNotes.tsx:125-128 has only the generic catch |
| Accessibility | Toggle has aria-expanded; section aria-label Notes; editor labelled 'Notes text' (test) | ProjectNotes.tsx:143-153; Notebook.test.tsx:112 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/projects/components/__tests__/Notebook.test.tsx`: Notes load and save as Notes.md, unsaved retention, newer typing kept, stale save ignored, retry rules

**Test scenarios**

- **Save notes**
  1. Open Sources tab, expand Notes.
  2. Type text, click Save notes.
  - Expected: Success toast; Sources list shows Notes.md.
- **Notes ground a chat**
  1. Save a note with a made-up fact.
  2. Ask about it in a notebook chat.
  - Expected: Answer uses the fact.
- **Unsaved guard**
  1. Type, then navigate away.
  - Expected: Discard dialog appears.
- **Read-only**
  1. Open a view-only shared notebook.
  - Expected: No editor; text or 'No notes yet.'
- **Save answer**
  1. In a notebook chat open an answer menu, choose Save to project.
  - Expected: Toast 'Saved to <name>'; file 'Answer from <title>.md' in Sources.

**Where to look when it fails**

- Toasts 'Your notes were not saved'.
- Table project_knowledge_files rows named Notes.md with version numbers.
- Server logs under '[knowledge-files]'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md)
- Desktop: [70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md)

## 10. Gaps and dependencies

- **Single notes file, no list** Affects: Web, Desktop. Evidence: ProjectNotes.tsx:14. Work needed: Multiple notes model if wanted.
- **No notes or save-answer on Mobile, CLI, VS Code, Chrome** Affects: those apps. Evidence: no code found. Work needed: Decide scope, then build.
- **Founder list says leaders have no notes editor, code ships one** Affects: Product decision record. Evidence: docs/decisions/2026-09-27-founder-decisions.md:96-98. Work needed: Owner confirms keep or cut.
- **Brief out of date (notes marked not applicable or missing)** Affects: Docs. Evidence: ProjectNotes.tsx exists. Work needed: Update the brief.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-shared-ui-and-design
- F037-07
- F037-08
- table:project_knowledge_files

## Unknown

- Exact file path of ArtifactDocumentEditor (imported by alias @features/chat/components/artifacts/ArtifactDocumentEditor, not opened).
- Whether the text route is used for notes (ProjectNotes.tsx fetches [fileId] route directly).
- Per-file size limit applied to notes.
- Whether Save to project is tested (no test file found by name).
