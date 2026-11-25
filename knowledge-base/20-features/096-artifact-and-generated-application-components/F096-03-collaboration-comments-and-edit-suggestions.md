---
id: "F096-03"
type: "feature"
title: "Collaboration, comments and edit suggestions"
aliases: ["Comments and edit suggestions", "Artifact comments", "Edit with AI", "Request edits", "Selection-to-edit", "Ask AI to apply", "S96.03 S96.04 S96.05 S96.06"]
area: "96 Artifact and generated-application components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S96.03", "S96.04", "S96.05", "S96.06"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-model-catalog-and-routing", "table:artifact_comments", "api:GET /api/artifacts/[artifactId]/comments", "api:POST /api/artifacts/[artifactId]/comments", "api:PATCH /api/artifacts/[artifactId]/comments/[commentId]", "api:DELETE /api/artifacts/[artifactId]/comments/[commentId]"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F096-03 Collaboration, comments and edit suggestions

On web, a person can comment on a passage, slide, page element or whole artifact, reply, resolve, and send open comments or a selected passage to the assistant as an edit request. Comments are private to the account; there is no multi-person editing. Selection edits are prompts sent through normal chat, not a server service.

Area: [96. Artifact and generated-application components](README.md). Requirement items: [S96.03](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9603), [S96.04](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9604), [S96.05](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9605), [S96.06](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9606).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores per-user comment threads on artifacts (artifact_comments table with anchors) and builds edit-request prompts from comments, a text selection or a picked page element, sent as a chat message (apps/web/lib/services/artifact-comment-service.ts:56-160; apps/web/features/chat/components/artifacts/comments/comment-request.ts:19).

**Why it exists.** Documents, decks and designs had no way to leave notes or batch them into edit requests (apps/web/db/neon/0369_artifact_comments.sql header).

**Who uses it.** A signed-in person reviewing an artifact in the web artifact panel.

**Problems it solves**

- Losing track of notes on a passage or slide
- Asking the assistant for a narrow change without retyping context
- Handing many notes to the assistant at once

**Use cases**

- Select a sentence in a document, choose 'Edit with AI' and describe the change
- Comment on a slide, resolve it later
- Open Comments and click 'Ask AI to apply all N open comments'
- Use 'Request edits' to pick an element of an HTML design and describe a change

## 2. User experience

**Where to find it**

- Web artifact panel header: 'Comments' toggle (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2837)
- Selection toolbar labels 'Selection actions', 'Edit with AI', 'Improve' (apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx:22-24)
- 'Request edits' item and element layer with 'Comment on this element' (ArtifactPreview.tsx:527; ArtifactEditRequestLayer.tsx:14)
- Public Desktop shows the hosted web app (doc: AGENTS.md section 5). Mobile, CLI, VS Code, Chrome: no comment code found.

**Before you start**

- Signed in with a stored artifact whose id is a uuid (canCommentOnArtifact, packages/contracts/cloud-contracts/src/artifact-comments.ts:70)
- Panel variant, not the inline card (ArtifactPreview.tsx:2213)
- For edit requests: latest version, not PDF, Word or image, non-empty content (ArtifactPreview.tsx:2165-2175)

**Screens and controls**

- Comments panel: 'Add a comment', 'Comment on the whole artifact', 'Reply', Resolve/Reopen, 'Delete comment', 'Show resolved (n)' / 'Hide resolved', 'Ask AI to apply' per thread, 'Ask AI to apply all N open comments', close 'Close comments' (apps/web/features/chat/components/artifacts/comments/ArtifactCommentsPanel.tsx:19,170,202,218,293-353)
- 'Show in the artifact' locates the anchor; if off screen: 'That passage is not on screen in this view.' (ArtifactCommentsPanel.tsx:51; ArtifactPreview.tsx:3158)
- Edit request box: placeholder 'Describe the change...', send 'Send the change request' (ArtifactSelectionToolbar.tsx:26-27)

**Journey**

1. Select text in the artifact or toggle Comments
2. Pick Edit with AI or add a comment
3. For comments: post to the server and see the highlight
4. For edit: the prompt is built and sent as the next chat message via the chat send handler (apps/web/features/chat/pages/WebChatPage.tsx:6097-6101)
5. The assistant replies with a new artifact version in the usual way

**What the person sees and gets**

- Toast 'The change request was not sent. Try again.' on a refused send (ArtifactPreview.tsx:2125,2203)
- Spinner 'Loading comments' and a failure message with retry (ArtifactCommentsPanel.tsx:359; ArtifactComments.test.tsx:209)
- Delete asks first and says it cannot be undone (ArtifactComments.test.tsx:181)

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Comment API: list, create (CSRF, rate limit, schema), update body or resolved, delete (apps/web/app/api/artifacts/[artifactId]/comments/route.ts:32-78; .../[commentId]/route.ts:75-76)
- Anchors: text quote with context, slide, element selector with point, whole artifact (packages/contracts/cloud-contracts/src/artifact-comments.ts:9-30)
- Replies attach to the thread root; reply anchor forced to artifact (artifact-comment-service.ts:104-127)
- Cap of 500 comments per artifact enforced under an advisory lock (artifact-comment-service.ts:10,86-100)
- Table with FORCE RLS, body 1-4000 chars, author user or assistant (apps/web/db/neon/0369_artifact_comments.sql:29-42)
- Comments UI, highlights and Ask AI (ArtifactCommentsPanel.tsx)
- Selection edit and element picker prompts sent through chat (ArtifactPreview.tsx:2118-2210)
- Erasure, export and deletion manifest include the table (apps/web/lib/server/account-erasure.ts:50; apps/web/app/api/user/export/route.ts:2269; apps/web/lib/services/deletion-manifest.ts:30)

**Incomplete**

- The 'assistant' author value is accepted by the API but no code that writes assistant replies was found (only the schema and service accept it)
- Comments are private to one account, so the 'comment' idea of review by others is not met

**Present but disconnected or switched off**

- Selection toolbar and edit layer are hidden when onRequestEdits is absent or the artifact is not latest (ArtifactPreview.tsx:2165-2175)

**Not available**

- Real-time multi-user editing and presence: no OT or CRDT library in apps/web/package.json (only single-user tiptap at lines 112-118)
- Structured document storage: content is a text column (0039:50) and message markdown
- A server selection-to-edit service: none; client builds prompt
- Comments on mobile, desktop Tauri, CLI, VS Code, Chrome: none found

## 4. Required behaviour

**Established requirements**

- S96.03 Structured document storage: not applicable anywhere. (source: brief S96.03)
- S96.04 Collaborative editing backend (OT/CRDT and presence): platform missing. (source: brief S96.04)
- S96.05 A service stores comments and edit suggestions on artifacts: brief says missing; code now has comments but no suggestions entity. (source: brief S96.05; apps/web/db/neon/0369_artifact_comments.sql)
- S96.06 A service turns a selected range plus instruction into a targeted edit: brief says missing; code does it client-side by prompt. (source: brief S96.06; ArtifactPreview.tsx:2177-2210)
- Comments are stored per user and listed per user. (source: apps/web/db/neon/0369_artifact_comments.sql:42-46)
- Destructive actions ask first naming the consequence. (source: AGENTS.md section 9)

**Acceptance criteria**

1. Creating a comment returns 201 and it lists back for the same user only
2. A malformed anchor or empty body is rejected
3. The 501st comment on one artifact is refused with a conflict
4. A reply attaches to the root thread
5. Resolve then Reopen toggles resolved state
6. Delete asks first, then removes the thread's reply rows
7. 'Ask AI to apply all' sends one prompt naming every open comment
8. Another account cannot read or change the comment

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Edit-request cost and model follow whichever model the chat uses because it is a normal send [inferred from handleSend]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether comments should be shareable with workspace members
- [proposed] Update the brief rows S96.05 and S96.06 to partial
- [proposed] Add a suggestion (accept or reject) entity if required

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | artifact_comments | `apps/web/db/neon/0369_artifact_comments.sql` | Comment and reply rows, FORCE RLS |
| service | artifact-comment-service | `apps/web/lib/services/artifact-comment-service.ts` | List, create with cap and lock, update, delete |
| endpoint | GET and POST /api/artifacts/[artifactId]/comments | `apps/web/app/api/artifacts/[artifactId]/comments/route.ts` | List and create |
| endpoint | PATCH and DELETE /api/artifacts/[artifactId]/comments/[commentId] | `apps/web/app/api/artifacts/[artifactId]/comments/[commentId]/route.ts` | Resolve, edit, delete |
| schema | ArtifactComment schemas | `packages/contracts/cloud-contracts/src/artifact-comments.ts` | Anchors, request bodies, path helpers |
| service | artifact-comments-client | `apps/web/features/chat/components/artifacts/comments/artifact-comments-client.ts` | Client store, thread grouping, canCommentOn |
| component | ArtifactCommentsPanel | `apps/web/features/chat/components/artifacts/comments/ArtifactCommentsPanel.tsx` | Panel UI |
| hook | useCommentHighlights | `apps/web/features/chat/components/artifacts/comments/use-comment-highlights.ts` | Highlights anchors in the artifact |
| service | buildCommentsEditRequest | `apps/web/features/chat/components/artifacts/comments/comment-request.ts` | Turns threads into one edit prompt |
| component | ArtifactSelectionToolbar | `apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx` | Edit with AI and Improve on selected text |
| component | ArtifactEditRequestLayer | `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.tsx` | Element picker request box |
| service | artifact-selection-request | `apps/web/features/chat/components/artifacts/artifact-selection-request.ts` | Selection actions from supported languages |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Wires panel, toolbar, layer, prompts (lines 2118-2213, 3146-3173) |
| hook | handleArtifactEditRequest | `apps/web/features/chat/pages/WebChatPage.tsx` | Sends the prompt as a chat message (line 6097) |
| config | account erasure list | `apps/web/lib/server/account-erasure.ts` | Deletes comments with the account (line 50) |
| endpoint | data export | `apps/web/app/api/user/export/route.ts` | Exports artifact_comments (line 2269) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person selects text or an element and writes an instruction or comment | device | ArtifactSelectionToolbar.tsx:262-295 |
| Comment is POSTed with CSRF token, validated and inserted under an advisory lock | our servers | apps/web/app/api/artifacts/[artifactId]/comments/route.ts:41-70; artifact-comment-service.ts:86-132 |
| Edit request prompt is built in the browser | device | ArtifactPreview.tsx:2186-2200 |
| Prompt goes through the normal chat send, so the chosen model and route answer it | device and our servers | apps/web/features/chat/pages/WebChatPage.tsx:6097-6101 |
| Assistant returns a new artifact version that the store saves | our servers | [inferred] from normal chat artifact derivation |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Comment body, anchor, author, resolved time | table artifact_comments (artifact_id has no foreign key by design, 0369 header) | Server-held; fetched on panel open | Deleted by the person; erased with account; replies cascade (0369:26) |

**Models and providers.** Comments use no model. Edit requests use whichever chat model and provider the person has selected; no rule specific to this feature was found.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; user resolved by getUserScopedDb; create, update and delete require a CSRF token (comments/route.ts:42; [commentId]/route.ts:27) |
| Permissions | Rows belong to the writing account and RLS blocks others (0369:42-46); no sharing rule exists |
| Subscription | none found in the code for comments; edit requests are normal chat turns governed by chat rules |
| Limits and metering | 500 comments per artifact (service line 10); body at most 4000 chars; rate limit 'chat-conversation' (comments/route.ts:37,45) |
| Feature flags | Edit-request UI needs onRequestEdits (provided only by the web chat page, WebChatPage.tsx:7894) |
| Model compatibility | Edit requests depend on the selected model's quality; none checked here. |
| Provider restrictions | none found in the code |
| Local mode | Comments need the server and a uuid artifact id, so Local-only artifacts without a synced id cannot be commented on [inferred from canCommentOn and server storage]. Edit requests in Local mode follow whatever model is selected. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Loading comments' | ArtifactCommentsPanel.tsx:359 |
| Error | Failure message with retry | ArtifactComments.test.tsx:209 |
| Empty | not examined in detail | ArtifactCommentsPanel.tsx (empty copy not read) |
| Cap reached | 409 conflict message 'An artifact holds at most 500 comments.' | artifact-comment-service.ts:36-41; comments/route.ts:68 |
| Reply to missing comment | 404 | comments/route.ts:62 |
| Send refused | Toast 'The change request was not sent. Try again.' | ArtifactPreview.tsx:2125 |
| Anchor not visible | Toast 'That passage is not on screen in this view.' | ArtifactPreview.tsx:3158 |
| Older version shown | Edit requests hidden | ArtifactPreview.tsx:2168 |
| Accessibility | Labels on toggle with open count, delete, close; minimum touch height classes | ArtifactPreview.tsx:2833-2836; ArtifactCommentsPanel.tsx:218,312 |
| Offline | not handled in the code beyond the error and retry state | apps/web/features/chat/components/artifacts/comments/artifact-comments-client.ts (no online listener found) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/artifacts/[artifactId]/comments/route.test.ts`: List own, create with CSRF, bad anchor, reply threading, cap, resolve and delete
- `apps/web/app/api/artifacts/[artifactId]/comments/[commentId]/route.test.ts`: Update and delete route
- `apps/web/lib/services/__tests__/artifact-comment-service.test.ts`: Admission race at cap, refusal at cap, isolation level check, listing past the cap
- `apps/web/features/chat/components/artifacts/comments/ArtifactComments.test.tsx`: Comment on selection, reply and resolve, delete confirm, send all, load failure retry
- `apps/web/features/chat/components/artifacts/comments/artifact-comments-client.test.ts`: Client store behaviour
- `apps/web/features/chat/components/artifacts/ArtifactPreview.selectionEdit.test.tsx`: Selection edit request
- `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.test.tsx`: Element request layer
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.requestEdits.test.tsx`: Request edits through the panel

**Test scenarios**

- **Comment round trip**
  1. Open a stored document artifact
  2. Select a sentence and add a comment
  3. Reload the page
  - Expected: The comment is listed and highlighted
- **Apply all**
  1. Add three comments
  2. Click 'Ask AI to apply all 3 open comments'
  - Expected: One chat message lists the three comments and the assistant returns an updated artifact
- **Private by account**
  1. Comment as user A
  2. Request the same artifact id as user B
  - Expected: B sees none
- **Cap**
  1. Create 500 comments
  2. Create one more
  - Expected: 409 conflict
- **Selection edit on older version**
  1. Show an earlier version
  - Expected: No edit toolbar

**Where to look when it fails**

- Table artifact_comments
- Error text 'Artifact comment admission requires read committed isolation' (service line 93)
- HTTP 404 'Artifact not found' for a non-uuid id (comments/route.ts:27)

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief marks S96.05 and S96.06 missing but code exists** Affects: Planning accuracy. Evidence: comments/route.ts; ArtifactPreview.tsx:2177. Work needed: Update the brief status
- **No sharing: comments are visible only to their author, so no review between people** Affects: Web teams. Evidence: 0369:42-46. Work needed: Add workspace-scoped policy if shared review is required [proposed]
- **No suggestion (accept or reject) entity** Affects: Web. Evidence: No table or route besides artifact_comments. Work needed: Define and build if required
- **No live multi-user editing** Affects: All apps. Evidence: apps/web/package.json:112-118 shows no CRDT library. Work needed: Platform decision and build
- **Comments and selection edit absent outside web** Affects: Mobile, CLI, VS Code, Chrome. Evidence: grep found no comment client in those apps. Work needed: Decide parity per surface
- **Assistant-authored comments have no writer** Affects: Web. Evidence: author enum only in schema and service. Work needed: Wire or remove

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-model-catalog-and-routing
- table:artifact_comments
- api:GET /api/artifacts/[artifactId]/comments
- api:POST /api/artifacts/[artifactId]/comments
- api:PATCH /api/artifacts/[artifactId]/comments/[commentId]
- api:DELETE /api/artifacts/[artifactId]/comments/[commentId]

## Unknown

- Whether Local-mode artifact ids are uuids that the server accepts
- Whether any code writes author assistant
- Rate-limit numbers
- Empty state copy of the comments panel
- Whether any suggestion entity is planned
