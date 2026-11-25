---
id: "F026-09"
type: "feature"
title: "Edit requests: selection, comments, collected requests (not built per brief)"
aliases: ["Edit requests: selection, comments, collected requests", "Request edits", "Edit with AI", "Improve", "Selection actions", "Comments", "Ask AI to apply all comments", "Ask for changes (mobile)", "S26.17, S26.18, S26.19"]
area: "26 Artifact container and panel"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S26.17", "S26.18", "S26.19"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "mode:local", "mode:own-key", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-shared-ui-and-design", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F026-09 Edit requests: selection, comments, collected requests (not built per brief)

Lets a person pick part of an artifact and ask the assistant to change only that part, leave comments on passages, slides or elements, and send open comments to the assistant together. Built and wired on web (the brief says missing). Mobile only prefills the chat with a change request. CLI, VS Code and Chrome have none.

Area: [26. Artifact container and panel](README.md). Requirement items: [S26.17](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2617), [S26.18](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2618), [S26.19](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2619).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Turns a selection or a comment into a precise edit request sent as a chat message, so the assistant revises just that part. Comments are saved on the artifact, can be resolved, and open ones can be sent in one message.

**Why it exists.** The brief requires selection edits, inline comments and collected requests (S26.17-S26.19). The code comment in ArtifactEditRequestLayer says it follows ChatGPT's 'Request edits' layer (apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.tsx:28-34).

**Who uses it.** People iterating on documents, decks and pages who want targeted changes without retyping context.

**Problems it solves**

- Vague whole-artifact prompts that rewrite too much.
- Losing notes about what to fix.
- Sending many fixes one by one.

**Use cases**

- Select a paragraph, choose Improve then Make shorter.
- In a page preview, press Request edits, click a heading, type a change.
- Comment on slide 3, resolve later.
- Press 'Ask AI to apply all 4 open comments'.

## 2. User experience

**Where to find it**

- Web viewer, document or text preview: select text; a toolbar named 'Selection actions' appears with 'Edit with AI', 'Improve' (menu with groups Edit, Change tone, Adjust for, Translate to) and 'Comment' (apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx:22-28,262,317,341; ArtifactPreview.tsx:3165-3170).
- Web viewer, rendered pages and decks: toolbar toggle 'Request edits' (also a menu item on narrow panels); a pill says 'Select content and ask for changes' with 'Cancel'; after clicking an element a field 'Describe the change...' with 'Send the change request', 'Comment on this element' and, for HTML images, 'Replace this image' (ArtifactPreview.tsx:527,2276-2284,2853-2857; ArtifactEditRequestLayer.tsx:11-16,151-190).
- Web viewer toolbar: 'Comments' toggle (testid artifact-comments-toggle) opens a side panel with a composer 'Comment on the whole artifact', thread cards with 'Reply', 'Resolve'/'Reopen', 'Delete comment', 'Show resolved (n)', and 'Ask AI to apply all N open comments' (ArtifactPreview.tsx:2824-2841; comments/ArtifactCommentsPanel.tsx:19,277-360).
- Desktop (public Electron): hosted web app, same controls [inferred from AGENTS.md section 5].
- Mobile artifact full screen: action 'Ask for changes' (all artifacts that are not generated files) and, in decks, 'Ask about slide N' (ArtifactFullScreen.tsx:147,980-993,1217-1219; PresentationDeckView.tsx:499-505).
- CLI, VS Code, Chrome: none found [searched apps/cli/src, apps/extension/src, apps/extension-vscode/src for artifact comment, selection edit and request edits].

**Before you start**

- Web: the page must provide a way to send a chat turn (the panel gets onRequestEdits from the chat page) (apps/web/features/chat/pages/WebChatPage.tsx:7894).
- Selection edit and Request edits need the latest version, a stored artifact, preview not PDF, Word or image, and for Request edits the sandboxed preview must be available (ArtifactPreview.tsx:2089-2099,2165-2175).
- Comments need a stored artifact whose id is a UUID (packages/contracts/cloud-contracts/src/artifact-comments.ts:7,70-72; ArtifactPreview.tsx:2213).
- Signed-in account for comments (server routes use the user-scoped database).

**Screens and controls**

- Selection toolbar, Improve menu, Edit with AI field, Comment button.
- Request edits pill and field.
- Comments side panel.
- Toasts 'Sent the comment to the assistant', 'Sent N comments to the assistant', 'The change request was not sent. Try again.'.

**Journey**

1. Select text in the preview; the toolbar appears next to it.
2. Pick an Improve action (for example 'Make shorter') or type under 'Edit with AI'. The request is sent right away as a normal chat message naming the artifact, the selected passage in a code fence and about 400 characters either side (packages/ui/unified-chat/src/lib/artifact-selection-request.ts:21-22,126-160).
3. The assistant replies in the chat and the artifact is revised as a new version.
4. Or choose Comment: the Comments panel opens with the quoted passage; type and press Comment. The passage is highlighted.
5. Later press 'Ask AI to apply all N open comments' or the per-thread ask; one message listing the comments is sent.
6. Resolve or delete comments as they are handled.

**What the person sees and gets**

- Toasts above; spinner 'Loading comments'; 'No comments yet. Select text and choose Comment to note a passage.'; 'Comments could not be loaded' with 'Try again'.
- Mobile: the composer is filled with a change request and the viewer closes; the person sends it (ArtifactFullScreen.tsx:1112-1118).

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Selection edit on web: toolbar, request building and send through the chat (ArtifactPreview.tsx:2177-2211; ArtifactsPanel.tsx:655-661; WebChatPage.tsx:6097-6101).
- Element 'Request edits' picker in the sandboxed preview with a one-line request field (ArtifactEditRequestLayer.tsx).
- Comments end to end: client store, API (GET, POST, PATCH, DELETE), table with row-level security, anchors of kind text, slide, element and whole artifact, resolve, reply, delete with confirmation (apps/web/features/chat/components/artifacts/comments/*; apps/web/app/api/artifacts/[artifactId]/comments/route.ts; apps/web/db/neon/0369_artifact_comments.sql).
- Highlighting of open comments in the preview (comments/use-comment-highlights.ts, used at ArtifactPreview.tsx:2226).
- Batching: 'Ask AI to apply all N open comments' sends one prompt (ArtifactCommentsPanel.tsx:277-290,345-355; comment-request.ts:20-40).
- Mobile: 'Ask for changes' and deck 'Ask about slide N' prefill the composer (ArtifactFullScreen.tsx:988-993; PresentationDeckView.tsx:170-190).

**Incomplete**

- There is no queue of pending selection edits: each selection request is sent immediately. Only comments can be batched, and only when more than one is open (ArtifactCommentsPanel.tsx:345). The draft line 'collect several requests and send them with the send control' does not match the code.
- Comments are private to the account (row-level security by user id), so they are not shared with other viewers of a published page (0369_artifact_comments.sql:41-47).
- Per-artifact cap of 500 comments (apps/web/lib/services/artifact-comment-service.ts:10).

**Present but disconnected or switched off**

- The comments panel and selection actions are hidden in the 'card' variant and for non-stored artifacts (ArtifactPreview.tsx:2165,2213).

**Not available**

- Mobile: no selection-based edit and no comments (only whole-artifact or per-slide ask).
- CLI, VS Code, Chrome: not available.

## 4. Required behaviour

**Established requirements**

- S26.17: select part of an artifact, ask the assistant to change just that part, and the artifact is revised. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.17)
- S26.18: attach comments to specific places and see them inline. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.18)
- S26.19: several requested changes can be collected and sent together. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.19)
- The viewer contract includes annotation or edit request into the conversation. (source: docs/product/experience-contract.md:504-514)

**Acceptance criteria**

1. Selecting text in a Markdown document artifact shows 'Selection actions' with 'Edit with AI', 'Improve' and 'Comment'.
2. Choosing 'Make shorter' sends one chat message that names the artifact, includes the selected passage and says to keep everything else unchanged.
3. If the chat refuses the turn, the toolbar stays and the toast 'The change request was not sent. Try again.' appears.
4. A comment on a passage is saved, the passage is highlighted, and after reload the comment is still listed.
5. With two or more open comments, 'Ask AI to apply all N open comments' sends one message listing each comment and reply.
6. A hand-edited artifact adds the current text to the request so the assistant starts from it.
7. Request edits is unavailable on old versions, with unsaved source edits and on PDF, Word or image artifacts.
8. The 501st comment on one artifact is refused with a conflict message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Selections should be queueable to meet S26.19 literally. [inferred]
- Comment storage should respect Local mode so Local artifacts do not upload quoted text. [inferred from AGENTS.md section 6]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a pending list for selection edits with one Send action.
- [proposed] Offer comments on mobile using the same contract and routes.
- [proposed] Tell the person when comments are saved on the account.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactSelectionToolbar | `apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx` | Edit with AI, Improve menu, Comment button. |
| component | ArtifactEditRequestLayer | `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.tsx` | Pill, one-line request, comment and replace-image buttons. |
| component | ArtifactPreview (edit and comment wiring) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | canRequestEdits (:2089), submitEditRequest (:2118), canRequestSelectionEdits (:2165), requestSelectionEdit (:2177), startComment (:2228), panel mount (:3146). |
| component | ArtifactCommentsPanel | `apps/web/features/chat/components/artifacts/comments/ArtifactCommentsPanel.tsx` | Composer, threads, resolve, delete, send-all. |
| hook | useArtifactComments / artifact-comments-client | `apps/web/features/chat/components/artifacts/comments/artifact-comments-client.ts` | Load, create, update, remove with a shared cache (:112,:157). |
| service | comment-request | `apps/web/features/chat/components/artifacts/comments/comment-request.ts` | Builds the one-message request from comment threads. |
| hook | use-comment-highlights | `apps/web/features/chat/components/artifacts/comments/use-comment-highlights.ts` | Highlights anchored text and scrolls to it. |
| service | artifact-selection-request (shared) | `packages/ui/unified-chat/src/lib/artifact-selection-request.ts` | Selection actions, context capture, request text (limits 4000 and 400 characters). |
| service | artifact-edit-request (shared) | `packages/ui/unified-chat/src/lib/artifact-edit-request.ts` | normalizeEditInstruction and reply format. |
| component | ArtifactsPanel requestEdits | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Hands the prompt to the chat and closes the sheet on a phone (:655-661). |
| hook | WebChatPage handleArtifactEditRequest | `apps/web/features/chat/pages/WebChatPage.tsx` | Sends the prompt through handleSend (:6097-6101,:7894). |
| endpoint | GET/POST /api/artifacts/[artifactId]/comments | `apps/web/app/api/artifacts/[artifactId]/comments/route.ts` | List and create. |
| endpoint | PATCH/DELETE /api/artifacts/[artifactId]/comments/[commentId] | `apps/web/app/api/artifacts/[artifactId]/comments/[commentId]/route.ts` | Resolve, edit, delete. |
| service | artifact-comment-service | `apps/web/lib/services/artifact-comment-service.ts` | Database access and 500-comment cap. |
| schema | artifact comments contract | `packages/contracts/cloud-contracts/src/artifact-comments.ts` | Anchor kinds and paths. |
| table | artifact_comments | `apps/web/db/neon/0369_artifact_comments.sql` | Comment rows with row-level security. |
| screen | Mobile Ask for changes | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | ASK_FOR_CHANGES_LABEL (:147), handleAskForChanges (:988), handleViewerAsk (:1112). |
| component | Mobile PresentationDeckView ask | `apps/mobile/src/features/chat/components/artifact-viewers/presentation/PresentationDeckView.tsx` | Per-slide request (:170-190,:499-505). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person selects text. The toolbar reads the browser selection and the surrounding rendered text. | device | ArtifactSelectionToolbar.tsx:48-70 |
| The request text is built from title, selected text, nearby context, optional slide scope and the current content if the artifact was hand-edited. | device | ArtifactPreview.tsx:2177-2205; artifact-selection-request.ts:126-160 |
| The text is sent as a normal user message in the active chat. | device and our servers | WebChatPage.tsx:6097-6101; ArtifactsPanel.tsx:655-661 |
| The chat turn pipeline runs with the conversation's current model and mode; the reply creates a new artifact version. | our servers | Turn goes through handleSend (WebChatPage.tsx:6098); which provider runs depends on the chat mode, not read here. |
| Comment create sends body and anchor to the comments route; the server checks CSRF and rate limit and stores the row under the user's id. | our servers | artifact-comments-client.ts:157-190; comments/route.ts:31-72 |
| 'Ask AI to apply all' builds one message from open threads and sends it the same way. | device and our servers | ArtifactCommentsPanel.tsx:277-290; comment-request.ts:20-40 |
| Mobile only fills the composer and closes the viewer; the person sends. | device | ArtifactFullScreen.tsx:1112-1118 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Comment rows (body up to 4000 characters, anchor with quoted text and nearby text, author user or assistant, resolved time) | table artifact_comments, by account | Server only; shown on any device where the same account opens the artifact | Deleted with the comment or its parent thread (cascade on parent id); no foreign key to the artifact, so deletion with the artifact is not enforced by the table (0369_artifact_comments.sql:8-12). Retention beyond that unknown. |
| Edit request text | Becomes a chat message in the conversation | With chat sync | As any message. |

**Models and providers.** The request is an ordinary chat turn, so the model and provider are whatever the conversation uses (Cloud, own key or Local). The artifact edit feature itself does not choose or call a model. Comments do not call a model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Selection edits need only the chat. Comments need a signed-in account. |
| Permissions | Comments are scoped to the author's user id by row-level security; no sharing with others. |
| Subscription | No entitlement check found on comments routes. Edit requests are chat turns, so the usual plan allowance and limits for the chat turn apply [inferred]; not read here. |
| Limits and metering | Comment body 1 to 4000 characters; 500 comments per artifact; rate limit key 'chat-conversation' on comment routes; selection text capped at 4000 characters with 400 characters of context each side. The edit request consumes whatever the chat turn costs. |
| Feature flags | None found. |
| Model compatibility | The request text asks for a reply in the artifact's format; it works with any model that answers in that format [inferred]. |
| Provider restrictions | None in this feature. |
| Local mode | Selection and element edit requests are chat messages, so in Local mode they run on the device model. Comments are sent to our servers even for Local conversations: the comment gate checks only that the artifact id is a UUID (artifact-comments.ts:70-72; ArtifactPreview.tsx:2213) and I found no privacy-mode check. This is a possible trust-boundary gap and is unverified. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading comments | Spinner 'Loading comments'. | ArtifactCommentsPanel.tsx:358-361 |
| Comments failed | Message and 'Try again'. | ArtifactCommentsPanel.tsx:362-374 |
| Empty | 'No comments yet. Select text and choose Comment to note a passage.' | ArtifactCommentsPanel.tsx:376 |
| Request refused by chat | Toast 'The change request was not sent. Try again.'; toolbar stays. | ArtifactPreview.tsx:2126-2130,2204 |
| Cancel | Escape or Cancel leaves Request edits mode. | ArtifactEditRequestLayer.tsx:67-76 |
| Sandbox unavailable | Toast 'Selecting content needs the sandboxed preview, which is unavailable here.' | ArtifactPreview.tsx:2249-2252 |
| Comment target not on screen | Toast 'That passage is not on screen in this view.' | ArtifactPreview.tsx:3156-3160 |
| Delete a comment | Confirm dialog says it is removed for good and cannot be recovered. | ArtifactCommentsPanel.tsx:389-404 |
| Comment limit | Server conflict error 'An artifact holds at most 500 comments.' | artifact-comment-service.ts:10,49-53; comments/route.ts:68-70 |
| Old version or unsaved edit | Features hidden or the edit saved first. | ArtifactPreview.tsx:2089-2099,2183 |
| Phone width | The sheet closes after a request so the reply is visible. | ArtifactsPanel.tsx:655-661; ArtifactsPanel.requestEdits.test.tsx |
| Accessibility | Touch targets of 44 pixels on small screens; labels on inputs; aria-pressed on toggles. | ArtifactEditRequestLayer.tsx:118-130; ArtifactPreview.tsx:2855-2856 |
| Offline | Not handled in the code as a distinct state; comment calls show their error toast. | ArtifactCommentsPanel.tsx:233-246 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.selectionEdit.test.tsx`: Toolbar over selection, scoped shorten request, free-form request, hand-edited text, refusal.
- `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.test.tsx`: Request layer behaviour.
- `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.design.test.tsx`: Layer design contract.
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.requestEdits.test.tsx`: Offering, handing off and keeping panel open or closed.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.commentIdentity.test.tsx`: Comment identity in the viewer.
- `apps/web/features/chat/components/artifacts/comments/ArtifactComments.test.tsx`: Comments panel.
- `apps/web/features/chat/components/artifacts/comments/artifact-comments-client.test.ts`: Comments client cache and calls.
- `apps/web/features/chat/components/artifacts/comments/use-comment-highlights.test.ts`: Highlighting.
- `apps/web/app/api/artifacts/[artifactId]/comments/route.test.ts`: Comments list and create route.
- `apps/web/app/api/artifacts/[artifactId]/comments/[commentId]/route.test.ts`: Comment update and delete route.
- `apps/web/lib/services/__tests__/artifact-comment-service.test.ts`: Comment service.
- `packages/ui/unified-chat/src/lib/artifact-selection-request.test.ts`: Selection request building.
- `packages/ui/unified-chat/src/lib/artifact-edit-request.test.ts`: Edit request helpers.
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.ask.test.tsx`: Mobile Ask for changes.

**Test scenarios**

- **Selection shorten**
  1. Open a Markdown document artifact.
  2. Select one paragraph.
  3. Choose Improve then Make shorter.
  - Expected: A chat message appears naming the artifact and the passage; a new version is produced.
- **Element request**
  1. Open an HTML artifact preview.
  2. Press Request edits, click a heading, type a change, press the check.
  - Expected: A message with the element description is sent and Request edits mode ends.
- **Comment and reload**
  1. Select text, choose Comment, type a note.
  2. Reload the page, open Comments.
  - Expected: The comment is listed and the passage highlighted.
- **Send all comments**
  1. Add two comments.
  2. Press 'Ask AI to apply all 2 open comments'.
  - Expected: One message lists both; toast 'Sent 2 comments to the assistant'.
- **Local conversation comment**
  1. Open an artifact from a Local-mode chat.
  2. Add a comment; watch network calls.
  - Expected: To be verified: whether a request to the comments API is made (possible trust-boundary issue).
- **Mobile ask**
  1. On the phone open a deck and choose 'Ask about slide 2'.
  - Expected: Composer prefilled with a slide-scoped request; nothing sent until the person sends.

**Where to look when it fails**

- Toast texts above; comments route errors via withErrorHandler.
- Table artifact_comments.
- ArtifactCommentLimitError name.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/026-artifact-container-and-panel.md](../../70-qa/test-plans/web/026-artifact-container-and-panel.md)
- Desktop: [70-qa/test-plans/desktop/026-artifact-container-and-panel.md](../../70-qa/test-plans/desktop/026-artifact-container-and-panel.md)
- Mobile: [70-qa/test-plans/mobile/026-artifact-container-and-panel.md](../../70-qa/test-plans/mobile/026-artifact-container-and-panel.md)

## 10. Gaps and dependencies

- **Brief marks all three items missing; web has them built, so the ledger is wrong.** Affects: Documentation, planning.. Evidence: ArtifactSelectionToolbar.tsx, ArtifactCommentsPanel.tsx, 0369_artifact_comments.sql.. Work needed: Update the audit ledger and brief.
- **No real queue of selection edits (S26.19 asks for collected requests).** Affects: Web and desktop users.. Evidence: requestSelectionEdit sends immediately (ArtifactPreview.tsx:2177-2205).. Work needed: Add a pending list or record that comment batching satisfies S26.19.
- **Mobile lacks selection edit and comments.** Affects: Mobile.. Evidence: Only ASK_FOR_CHANGES_LABEL and slide ask exist.. Work needed: Build or record as not planned.
- **CLI, VS Code and Chrome have no edit requests or comments.** Affects: Those apps.. Evidence: No code found.. Work needed: Record as not applicable or build.
- **Comments may upload text from Local-mode artifacts.** Affects: Local and own-key users on web and Electron.. Evidence: No privacy check at ArtifactPreview.tsx:2213 or in the comments client.. Work needed: Verify live, then gate or warn.
- **Comments are private to the author, so a shared or published artifact cannot show them to others.** Affects: Teams.. Evidence: Row-level policy by user id (0369_artifact_comments.sql:43-47).. Work needed: Decide whether shared comments are wanted.
- **No recorded live run.** Affects: All.. Evidence: No result file found.. Work needed: Run scenarios.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- mode:local
- mode:own-key
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-shared-ui-and-design
- SYS-security-and-privacy

## Unknown

- Whether comment calls are blocked or allowed in Local mode (not read).
- Whether the assistant writes author 'assistant' replies anywhere; the column exists but no writer found.
- Whether comments on a forked artifact are copied (not read).
- Whether Electron desktop adds anything beyond web.
- Cost of an edit request in credits is the chat turn's, not read.
- Whether any live run has verified these flows.
