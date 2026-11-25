---
id: "F026-08"
type: "feature"
title: "Library, projects, copies, and handoff to another chat"
aliases: ["Library, projects, copies, and handoff to another chat", "Duplicate (menu item, testid artifact-fork)", "Rename", "Save to Library", "Save to project", "Start Work", "Add to chat / Add to Work / Add to project (Library)", "Open chat", "Run <title> in this chat on the web (Chrome)", "Fork artifact"]
area: "26 Artifact container and panel"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S26.24", "S26.25", "S26.26", "S26.27", "S26.28", "S26.38"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-sync-and-continuity", "SYS-chat-turn-pipeline", "F026-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F026-08 Library, projects, copies, and handoff to another chat

Lets a person copy an artifact, rename it, save it to the Library, add a copy to a project's knowledge, start Work from it, and jump back to the chat that made it. Web has most of it. Mobile has Save to Library and Library Open chat. CLI and Chrome only open the source chat. VS Code has none.

Area: [26. Artifact container and panel](README.md). Requirement items: [S26.24](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2624), [S26.25](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2625), [S26.26](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2626), [S26.27](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2627), [S26.28](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2628), [S26.38](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2638).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Keeps and reuses an artifact beyond the one chat: an independent copy, a new name, a file in the Library, a file in a project's knowledge, a Work request seeded from it, and a link back to the conversation that produced it.

**Why it exists.** The brief requires duplicate, rename, save to Library, attach to a project, continue in another chat and jump to the source chat (S26.24-S26.28, S26.38) so artifacts are not trapped in one conversation.

**Who uses it.** Anyone who iterates on an artifact, files finished work, or returns to the chat that produced a gallery or Library item.

**Problems it solves**

- Editing a variant without damaging the original.
- Finding a made file again outside the chat.
- Giving a project the artifact as reference material.
- Getting from a gallery or Library tile back to its conversation.

**Use cases**

- Duplicate a landing page, then change the copy.
- Rename 'Untitled' to a meaningful name.
- Save a report to the Library and later add it to a new chat.
- Open the originating chat from the gallery tile.

## 2. User experience

**Where to find it**

- Web viewer 'more' menu (accessible name 'More artifact actions'), group 'Keep': 'Rename', 'Duplicate', 'Start Work', 'Save to Library'; group 'Save to project' lists each project name (ArtifactPreview.tsx:2494-2559).
- Web title: click the artifact title to rename inline (accessible name '<title>. Rename'; input 'Artifact name') (apps/web/features/chat/components/artifacts/ArtifactTitleField.tsx:10,72-97; ArtifactPreview.tsx:2633).
- Web Library: item menu 'Actions for <file>' with 'Add to chat', 'Add to Work', 'Add to project', 'Open chat', 'Share link' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1776-1864).
- Web gallery detail panel: 'Open chat' link when the artifact has a conversation id (apps/web/app/gallery/GalleryClient.tsx:931-946).
- Mobile artifact full screen action sheet: 'Save to Library' (ArtifactFullScreen.tsx:1240); mobile Library item menu: 'Add to chat', 'Remix', 'Open chat', 'Share' (apps/mobile/src/features/library/index.tsx:625-648).
- CLI: 'agi artifacts open <id> --chat' (apps/cli/src/lib.rs:1388-1398,3971).
- Chrome side panel: a button with accessible name 'Run <title> in this chat on the web' (apps/extension/_locales/en/messages.json:3299; apps/extension/src/features/side-panel/artifactPanel.ts:728-731,1065-1068).
- Desktop: the public Electron app shows the hosted web app [inferred from AGENTS.md section 5]. The internal Tauri app opens a stored artifact in the chat panel inside its source conversation (apps/desktop/src/features/artifacts/openArtifactInChat.ts:29-39).
- VS Code: none found.

**Before you start**

- Rename, Duplicate and Start Work show only for a stored artifact in the panel (ArtifactPreview.tsx:2490-2493 condition 'variant === panel && isStoredArtifact').
- Save to Library is hidden for generated-file, image, PDF and Word artifacts (ArtifactPreview.tsx:2537).
- 'Save to project' items show only when the person has at least one project (ArtifactPreview.tsx:2549-2551).
- Mobile Save to Library needs a Cloud artifact (apps/mobile/src/features/artifacts/libraryService.ts:10-12).
- Chrome open-on-web needs a cloud-synced, non-temporary chat (apps/extension/src/side_panel.ts:6068-6075).

**Screens and controls**

- Menu items listed above; inline title field with Enter to save, Escape to cancel, blur saves.
- Toasts on success and failure.
- Library 'Add to project' dialog titled 'Add to project' (LibraryView.tsx:1910).

**Journey**

1. Duplicate: open the more menu, choose 'Duplicate'. A copy named from the original opens selected; toast 'Duplicated. Edits here no longer touch the original.'
2. Rename: click the title, type, press Enter. The title changes in the panel and wherever the store lists it; no new version is added.
3. Save to Library: choose 'Save to Library'; toast 'Saved to your Library'. Find it in Library with the other files.
4. Project: choose a project name under 'Save to project'; toast 'Saved to <project>'.
5. Continue elsewhere: from Library choose 'Add to chat' (opens a new chat with the file attached) or 'Open chat' (opens the source chat when known).
6. Start Work: choose 'Start Work'; the composer of the current chat switches to Work with an objective drafted from the artifact (apps/web/features/work/launch.ts:66-73).

**What the person sees and gets**

- Toasts: 'That artifact could not be duplicated', 'That name could not be saved', 'Saved to your Library', 'That artifact could not be saved to your Library', 'Saved to <project>', 'That artifact could not be saved to the project'.
- Library item or project knowledge file created from the artifact source file.
- Mobile alerts: 'Saved to Library' and 'Could not save to Library' (ArtifactFullScreen.tsx:1043-1056).

**Settings**

- None specific. Library storage quotas apply [server meter read in apps/web/app/api/library/route.ts:178-180].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Duplicate: forkArtifact creates a new random id, a derived title, copies the viewed content, type, language, conversation and message ids and compute metadata, selects the copy (apps/web/features/chat/stores/artifacts-store.ts:929-953; ArtifactPreview.tsx:2502-2517).
- Rename: renameArtifact normalises the title, updates artifact and its current version, marks it so it syncs (artifacts-store.ts:955-975; ArtifactTitleField.tsx).
- Save to Library on web posts file name and content to /api/library, stored as a saved_artifact file (ArtifactPreview.tsx:1443-1465; apps/web/app/api/library/route.ts:234-275).
- Save to project uploads the artifact source file to the project's knowledge (ArtifactPreview.tsx:1468-1480; apps/web/features/projects/services/project-knowledge-upload.ts:50-60; ArtifactsPanel.tsx:355-361).
- Library 'Add to chat', 'Add to Work', 'Add to project', 'Open chat' work from the Library view on web (apps/web/features/library/components/LibraryView.tsx:205-232; library-chat-handoff.ts).
- Web gallery 'Open chat'; CLI 'open --chat'; Chrome open-on-web button; mobile Library 'Open chat' (see where_to_find_it).
- Mobile Save to Library (ArtifactFullScreen.tsx:1030-1060). The brief marks it missing; the code has it.

**Incomplete**

- There is no control labelled 'Associate with project' or 'Continue in a new chat'. The nearest are 'Save to project' (adds a copy of the file to project knowledge; the artifact itself is not linked) and Library 'Add to chat' (attaches the saved file to a new chat). 'Start Work' does not open a new chat; it edits the composer of the current chat (launch.ts:66-73).
- Web Save to Library sends no conversation id, so a Library item saved from an artifact has no 'Open chat' target [inferred: request body is only fileName and content, ArtifactPreview.tsx:1449-1451; the route accepts an optional conversationId, library/route.ts:219-221].
- Rename is not pushed to the published copy (see F026-07).
- Mobile has no Duplicate, Rename or project save in the viewer [searched ArtifactFullScreen.tsx and artifacts/index.tsx; the only 'rename' hits are in the store's repair code].

**Present but disconnected or switched off**

- The Library save entry is a menu item only; there is no toolbar shortcut.

**Not available**

- VS Code: no duplicate, rename, library, project or open-source-chat [searched apps/extension-vscode/src/features/artifacts].
- CLI: no duplicate, rename, library or project command.
- Chrome: only the open-on-web button.
- Mobile: no Duplicate, Rename, 'Save to project' in the artifact viewer.

## 4. Required behaviour

**Established requirements**

- S26.24: duplicate gives an independent copy that can change without touching the original. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.24)
- S26.25: rename, and the new title shows wherever the artifact is listed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.25)
- S26.26: save to Library so it lives with other files outside the chat. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.26)
- S26.27: attach to a chosen project from the viewer; it then shows up in that project. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.27)
- S26.28: take an artifact into a different chat and keep working. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.28)
- S26.38: from an artifact outside its chat, jump to the conversation that produced it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.38)
- CLI does not add an artifact-to-project action (S26.27 cli). (source: docs/decisions/2026-09-27-founder-decisions.md:470)

**Acceptance criteria**

1. Duplicate on web creates a new id; editing the copy leaves the original content and versions unchanged.
2. Renaming changes the title in the panel header, the artifact tab list and the gallery after reload.
3. Rename to an empty or unchanged name does not add a version and shows no error.
4. Save to Library adds a file visible in Library with the artifact's file name; a failure shows 'That artifact could not be saved to your Library'.
5. Save to project adds a file to the chosen project's knowledge list; the toast names the project.
6. From a Library item that has a conversation, 'Open chat' opens that conversation.
7. From the web gallery tile detail for an artifact with a conversation, 'Open chat' opens /chat/<id>.
8. In Local mode on mobile, Save to Library is not offered (only Cloud artifacts).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A Library item saved from an artifact should carry its conversation id so 'Open chat' works. [inferred]
- Duplicate should be available wherever a stored artifact is editable (mobile). [inferred from brief]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Rename the 'Save to project' group to match the brief wording or record the change as a decision.
- [proposed] Send conversationId when saving to the Library.
- [proposed] Add a 'Continue in new chat' action that opens a new chat with the artifact attached.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview more menu (Keep, Save to project) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Menu items Rename, Duplicate, Start Work, Save to Library, project items (:2490-2559). |
| component | ArtifactTitleField | `apps/web/features/chat/components/artifacts/ArtifactTitleField.tsx` | Inline rename input and button. |
| store | artifacts-store (forkArtifact, renameArtifact) | `apps/web/features/chat/stores/artifacts-store.ts` | Fork (:929), rename (:955), local persistence key 'agi-artifacts-store' (:591) and cloud push (:1060-1100). |
| service | project-knowledge-upload | `apps/web/features/projects/services/project-knowledge-upload.ts` | uploadProjectKnowledgeFile (:50). |
| component | ArtifactsPanel project wiring | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | projectLink (:349) and projectSave (:355) passed to the viewer. |
| endpoint | POST /api/library | `apps/web/app/api/library/route.ts` | Saves an artifact as a Library file (:216-277). |
| service | launch (startWork) | `apps/web/features/work/launch.ts` | Sets Work mode and merges an objective into the draft (:66-73). |
| component | Unified Library view | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Add to chat, Add to Work, Add to project, Open chat, Share link. |
| component | Web Library host | `apps/web/features/library/components/LibraryView.tsx` | Host actions: openConversation, addToChat, addToWork, addToProject (:205-240). |
| service | library-chat-handoff | `apps/web/features/library/lib/library-chat-handoff.ts` | Stages a Library file as an attachment for a new chat. |
| screen | Gallery detail | `apps/web/app/gallery/GalleryClient.tsx` | 'Open chat' link (:931-946). |
| screen | Mobile ArtifactFullScreen Save to Library | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | handleSaveToLibrary (:1030), action (:1240). |
| service | Mobile libraryService | `apps/mobile/src/features/artifacts/libraryService.ts` | saveArtifactToLibrary posts to the Library, Cloud artifacts only. |
| screen | Mobile Library menu | `apps/mobile/src/features/library/index.tsx` | Add to chat, Remix, Open chat, Share (:625-648). |
| command | CLI artifacts open --chat | `apps/cli/src/lib.rs` | Handler (:3971) and browse_url (cloud/artifacts.rs:592). |
| component | Chrome artifact panel | `apps/extension/src/features/side-panel/artifactPanel.ts` | Open-on-web button (:728-731,:1065-1068). |
| service | Chrome conversation URL | `apps/extension/src/features/cloud-bridge/artifactsClient.ts` | chromeArtifactConversationUrl (:3); file is 5 lines, the brief's line 145 does not exist. |
| service | Desktop openArtifactInChat (Tauri) | `apps/desktop/src/features/artifacts/openArtifactInChat.ts` | Opens a stored artifact in its conversation's panel. |
| endpoint | Project knowledge upload API | `packages/contracts/cloud-contracts` | managedCloudProjectKnowledge paths used by the project client (imported in project-knowledge-upload.ts:41). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Duplicate: the store creates a new artifact object in the browser store and selects it. | device | artifacts-store.ts:929-953 |
| The browser store persists to local storage and later pushes artifacts to the account's chat-sync endpoint for managed conversations; conversations that answered on the device are skipped. | device and our servers | artifacts-store.ts:589-600,1060-1090 |
| Rename updates title in store and current version; the rename is marked so it pushes. | device | artifacts-store.ts:955-975,146 |
| Save to Library posts the file name and content with CSRF; the server rate-limits, stores the bytes as a saved_artifact and returns the new file id. | our servers | apps/web/app/api/library/route.ts:234-275 |
| Save to project uploads the file through the project knowledge client, which registers it for extraction. | our servers | project-knowledge-upload.ts:50-60 |
| Library 'Add to chat' downloads the item, stages it as an attachment and routes to a new chat. | device and our servers | library-chat-handoff.ts:70-80; LibraryView.tsx:218-221 |
| 'Open chat' navigates to /chat/<conversationId> (web), opens the browser to that URL (CLI, Chrome) or pushes the chat route (mobile). | device | LibraryView.tsx:215-216; cli artifacts.rs:592-601; side_panel.ts:6073; mobile library/index.tsx:636-642 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Duplicate artifact and renamed title | Browser local storage key 'agi-artifacts-store' and, for Cloud conversations, the account's synced artifact records | Yes for managed conversations (push), no for conversations answered on the device | Removed with the conversation or when storage is cleared; not otherwise read. |
| Library file from the artifact | Account file storage via persistGeneratedFileBytes (origin saved_artifact) | Yes, server-side | Library 'Recently deleted' flow exists in the list API (route.ts:160-167); retention period unknown. |
| Project knowledge file | Project knowledge store on the server | Yes | Removable from project; retention unknown. |

**Models and providers.** None for copy, rename, library, project. 'Start Work' only fills the composer; the later turn uses whatever model the chat is set to. Project knowledge extraction may use server models; not read.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Duplicate and rename work on the stored panel artifact without a server call. Library, project and sync need a signed-in account. Mobile Library save needs a Cloud account. |
| Permissions | Library and project routes are user-scoped. Project save requires access to the project (not read in detail). Open chat only works for chats the user owns. |
| Subscription | No plan check found in the Library save route or project save wiring I read. File storage and download meters are applied to the Library list (library/route.ts:178-180); how a full quota is enforced on save is unknown. |
| Limits and metering | Library save content up to 1,000,000 characters (library/route.ts:214); over it the error 'This artifact is too large to save to your Library.' Rate limit key 'chat-conversation'. Title length capped by ARTIFACT_TITLE_MAX_CHARS (ArtifactTitleField.tsx:78). |
| Feature flags | Cloud-document saves (Google Docs, Drive, OneDrive) are hidden while connectors are unreleased (ArtifactPreview.tsx:2448,2459). No flag on duplicate, rename, Library or project items. |
| Model compatibility | Not model dependent. |
| Provider restrictions | None found. |
| Local mode | Duplicate and rename work on the device. Mobile Library save is refused for non-Cloud artifacts (libraryService.ts:10-12). Chrome open-on-web hides for temporary chats and unsynced chats. Whether web Library save blocks Local-origin artifacts is not handled in the code I read (the save menu item has no privacy check, ArtifactPreview.tsx:2537-2548). Sync skips conversations answered on the device (artifacts-store.ts:1060-1076). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Duplicate fails | Toast 'That artifact could not be duplicated'. | ArtifactPreview.tsx:2508-2511 |
| Rename to same or empty name | Ignored; no toast. | ArtifactTitleField.tsx:40-45; artifacts-store.ts:955-958 |
| Rename cancel | Escape cancels. | ArtifactTitleField.tsx:58-61 |
| Save to Library pending | Item label 'Saving…' and disabled. | ArtifactPreview.tsx:2540-2543 |
| Save to Library error | Toast with server message or fallback. | ArtifactPreview.tsx:1456-1462 |
| Too large | Validation error from server. | library/route.ts:262-264 |
| No projects | 'Save to project' group absent. | ArtifactPreview.tsx:2549-2551 |
| Duplicate of an older version | Copies the version on screen, then resets the version view. | ArtifactPreview.tsx:2508-2516; artifacts-store.ts:924-928 |
| Open chat with no known conversation | Link or item action hidden. | GalleryClient.tsx:931; LibraryView.tsx:1830 area (actions.onOpenConversation && item.conversation_id) |
| Offline | Not handled in the code as a distinct state for these actions. | ArtifactPreview.tsx:1456-1462 |
| Accessibility | Menu items have accessible names ('Duplicate this artifact', 'Save this artifact to your Library'); title button name '<title>. Rename'. | ArtifactPreview.tsx:2506,2542; ArtifactTitleField.tsx:92 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.rename.test.tsx`: Rename from the title without adding a version.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.forkAndProjectSave.test.tsx`: Duplicate and Save to project.
- `apps/web/features/chat/components/artifacts/ArtifactMoreMenu.test.tsx`: The menu behaviour.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.startWork.test.tsx`: Start Work item.
- `apps/web/app/api/library/__tests__/route.test.ts`: Library route.
- `apps/web/features/library/lib/__tests__/library-chat-handoff.test.ts`: Staging a Library file for a new chat.
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Web Library host.
- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Shared Library actions.
- `apps/web/app/gallery/GalleryClient.test.tsx`: Gallery client.
- `apps/mobile/__tests__/LibraryArtifactOpen.test.tsx`: Opening a Library artifact on mobile.
- `apps/extension/__tests__/side-panel-artifacts.test.ts`: Chrome side panel open-on-web (:111,:423).
- `apps/cli/src/cloud/artifacts.rs`: Inline test 'an_unpublished_artifact_browses_to_its_conversation' (:888).

**Test scenarios**

- **Duplicate keeps original**
  1. Open a stored artifact with two versions.
  2. Choose Duplicate.
  3. Edit the copy and save.
  4. Switch back to the original in the tab list.
  - Expected: Original content and versions are unchanged; copy has its own id and title.
- **Rename shows everywhere**
  1. Rename in the viewer.
  2. Reload the chat and open the gallery.
  - Expected: New title in the panel and gallery; no new version.
- **Library round trip**
  1. Choose Save to Library.
  2. Open Library, choose Add to chat on the new item.
  - Expected: New chat opens with the file attached.
- **Project save**
  1. Create a project.
  2. In an artifact choose the project under Save to project.
  3. Open the project knowledge list.
  - Expected: A file named after the artifact is listed.
- **Open originating chat**
  1. Open the gallery detail of an artifact.
  2. Press Open chat. Repeat with 'agi artifacts open <id> --chat'.
  - Expected: The source conversation opens in the browser.
- **Mobile Save to Library in Local mode**
  1. On the phone in Local mode open an artifact.
  - Expected: 'Save to Library' is not in the action sheet.

**Where to look when it fails**

- Toast texts listed above; library route errors ('Your Library could not store this artifact. Nothing was saved.' library/route.ts:266-268).
- Local storage key 'agi-artifacts-store'.
- Chat-sync push results (artifacts-store.ts:1090-1110).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/026-artifact-container-and-panel.md](../../70-qa/test-plans/web/026-artifact-container-and-panel.md)
- Desktop: [70-qa/test-plans/desktop/026-artifact-container-and-panel.md](../../70-qa/test-plans/desktop/026-artifact-container-and-panel.md)
- Mobile: [70-qa/test-plans/mobile/026-artifact-container-and-panel.md](../../70-qa/test-plans/mobile/026-artifact-container-and-panel.md)
- CLI: [70-qa/test-plans/cli/026-artifact-container-and-panel.md](../../70-qa/test-plans/cli/026-artifact-container-and-panel.md)
- Chrome: [70-qa/test-plans/chrome/026-artifact-container-and-panel.md](../../70-qa/test-plans/chrome/026-artifact-container-and-panel.md)

## 10. Gaps and dependencies

- **No control named 'Associate with project' or 'Continue in a new chat'; behaviour differs from the brief (copy to project knowledge; Work seeds the current chat).** Affects: Web and Electron desktop.. Evidence: ArtifactPreview.tsx:2520-2559; launch.ts:66-73.. Work needed: Decide the intended behaviour and either add the controls or update the brief.
- **Library items saved from an artifact lose their conversation link.** Affects: Web users using Library Open chat.. Evidence: ArtifactPreview.tsx:1449-1451 vs library/route.ts:219-221.. Work needed: Send conversationId.
- **Mobile has no Duplicate, Rename or project save in the viewer.** Affects: Mobile.. Evidence: Brief S26.24-S26.27 mobile missing; no code found.. Work needed: Build or record as not planned.
- **VS Code has none of these; Chrome only has open-on-web.** Affects: VS Code, Chrome.. Evidence: No code found.. Work needed: Record as not applicable or build.
- **Brief says rename is missing on every app; the web code and tests exist.** Affects: Documentation.. Evidence: ArtifactPreview.rename.test.tsx; ArtifactTitleField.tsx.. Work needed: Update the ledger row.
- **Local-origin artifacts can be sent to the Library from web without a privacy check in the menu code.** Affects: Local and own-key users on web.. Evidence: ArtifactPreview.tsx:2537-2548 has no mode condition.. Work needed: Verify against AGENTS.md section 6 and add a check or confirmation.
- **Chrome brief citation artifactsClient.ts:145 does not exist.** Affects: Brief accuracy.. Evidence: apps/extension/src/features/cloud-bridge/artifactsClient.ts has 5 lines.. Work needed: Fix the citation.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-sync-and-continuity
- SYS-chat-turn-pipeline
- F026-07

## Unknown

- Whether duplicates start with a fresh version history or a copy of the original's; only inferred from forkArtifact creating a new id.
- How Library storage quota is enforced on save.
- Whether the Electron desktop exposes exactly these menu items.
- Whether project knowledge from an artifact is limited by plan.
- Mobile 'Open chat' for artifacts (not Library assets): not found.
- Retention period for Library deleted items.
