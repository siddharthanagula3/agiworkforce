---
id: "F032-07"
type: "feature"
title: "Comments on the design"
aliases: ["Comments", "Artifact comments", "Inline design comments (S32.17)", "ArtifactCommentsPanel", "Comment on this element", "Ask AI to apply"]
area: "32 Design workspace"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S32.17"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "table:artifact_comments", "api:GET /api/artifacts/[artifactId]/comments", "api:POST /api/artifacts/[artifactId]/comments", "api:PATCH /api/artifacts/[artifactId]/comments/[commentId]", "api:DELETE /api/artifacts/[artifactId]/comments/[commentId]", "file:packages/contracts/cloud-contracts/src/artifact-comments.ts", "SYS-files-artifacts-and-storage", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-chat-turn-pipeline"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F032-07 Comments on the design

Comments on an artifact in the Web chat side panel (also the public Desktop window, which shows the web app). A reader can comment on selected text, a slide, a picked element of an HTML design or the whole artifact, reply, resolve, delete, and send open comments to the assistant as an edit request. Element comments save but draw no pin.

Area: [32. Design workspace](README.md). Requirement items: [S32.17](../../10-requirements/capabilities/032-design-workspace.md#s3217).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a signed-in person leave notes on an artifact (document, deck or HTML design) in the Web side panel. A note can point at a quoted passage, a slide, a picked element of a rendered design, or the whole artifact. Notes form threads that can be replied to, resolved, reopened and deleted, and open threads can be handed to the assistant as one edit request. (comments/ArtifactCommentsPanel.tsx:228; packages/contracts/cloud-contracts/src/artifact-comments.ts:9-29)

**Why it exists.** Migration 0369 says artifacts had no way to leave a note on a passage, a slide or an element and come back to it, or to hand a batch of notes to the assistant as edit requests. (apps/web/db/neon/0369_artifact_comments.sql:4-7) The brief item S32.17 asks that the user can pin comments to a spot or element on the design. (doc: knowledge-base/data/area-briefs/032-design-workspace.md)

**Who uses it.** A person reviewing their own generated design, deck or document on Web or in the Desktop window that shows the hosted web app [inferred from ARCHITECTURE.md:51]. Comments belong to one account; row-level security keeps other accounts out, so this is a personal review tool, not multi-reviewer sharing. (apps/web/db/neon/0369_artifact_comments.sql:41-47)

**Problems it solves**

- Keeping review notes attached to the passage or element they are about instead of in chat text.
- Turning a list of notes into one precise edit request to the model.
- Coming back later to see which notes are still open.

**Use cases**

- Select a sentence in a document, choose Comment, type a note, later press Resolve.
- Pick a button in an HTML design with Request edits, choose Comment on this element, describe the issue.
- Add three notes, press Ask AI to apply all 3 open comments and let the assistant revise the artifact.
- Comment on slide 4 of a deck from the slide strip.

## 2. User experience

**Where to find it**

- Web: open an artifact in the side panel; toolbar button titled Comments with a count of open threads (ArtifactPreview.tsx:2824-2841).
- Selected text: floating button labelled Comment (ArtifactSelectionToolbar.tsx:25,325-341).
- HTML design: Request edits, pick an element, then the button labelled Comment on this element (ArtifactEditRequestLayer.tsx:14,146-166).
- Deck: a per-slide comment control (PresentationWorkspace.tsx:518, wired at ArtifactPreview.tsx:1969-1971).
- Desktop: the public Electron app shows the hosted web app, so the same controls apply [inferred] (ARCHITECTURE.md:51).
- Mobile, Chrome extension, VS Code, CLI, Tauri desktop: no comments code found (repo-wide search for the contract names found only web and contract files).

**Before you start**

- A signed-in account: the API resolves the user from the session or a bearer token (apps/web/lib/server/rls-db.ts:116-145).
- The artifact is stored, shown in the panel variant, and its id is a UUID (ArtifactPreview.tsx:2213).
- For element comments: Request edits needs a configured cross-origin sandbox, otherwise it is off (ArtifactPreview.tsx:2089-2098).

**Screens and controls**

- Comments side panel (aria-label Comments) with close button, Show resolved (n) / Hide resolved toggle, composer 'Comment on the whole artifact', and thread cards (ArtifactCommentsPanel.tsx:19,228-360).
- Thread card: quoted anchor (click to show in the artifact), replies, Reply, Resolve / Reopen, Ask AI to apply, delete icon (ArtifactCommentsPanel.tsx:51,194-230).
- Button 'Ask AI to apply all N open comments' shown when more than one is open (ArtifactCommentsPanel.tsx:353).
- Keyboard: Cmd or Ctrl plus Enter sends, Escape cancels, input ignores IME composition (ArtifactCommentsPanel.tsx:78-90).

**Journey**

1. Open an artifact in the side panel.
2. Select text and press Comment, or press Request edits, pick an element and press Comment on this element, or use the slide control, or open Comments and type into 'Comment on the whole artifact'.
3. The Comments panel opens with the anchor quoted and a composer 'Add a comment'.
4. Type the note and press Comment; it is saved to the account and appears as a thread.
5. Optionally Reply, Resolve, or Delete (a confirmation names what is lost).
6. Optionally press Ask AI to apply on one thread, or Ask AI to apply all N open comments; the panel sends an edit request to the chat and shows a toast.

**What the person sees and gets**

- Toast 'Sent the comment to the assistant' or 'Sent N comments to the assistant' (ArtifactCommentsPanel.tsx:271-284).
- Toast 'The comment was not saved' on failure; 'The change request was not sent. Try again.' when the chat will not take the request (ArtifactCommentsPanel.tsx:263-286).
- Open text anchors are highlighted in the rendered content (use-comment-highlights.ts:110-135).
- Delete dialog 'Delete this comment?' naming the anchor and the number of replies (ArtifactCommentsPanel.tsx:396-400).

**Settings**

- No user setting found. Limits: 4000 characters per comment, 500 comments per artifact (artifact-comments.ts:3; artifact-comment-service.ts:10).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Create, list, reply, resolve, reopen and delete comments through three routes with CSRF check, rate limit and per-user row security. (apps/web/app/api/artifacts/[artifactId]/comments/route.ts:32-78; .../[commentId]/route.ts:34-76)
- Four anchor kinds: text with surrounding context, slide, element (selector, text, x, y), whole artifact. (artifact-comments.ts:9-29)
- Text anchors are located again with the surrounding text, so a repeated phrase picks the right occurrence, and are highlighted with the browser highlight API. (use-comment-highlights.ts:66-135)
- Admission of a new comment takes a per-user-per-artifact lock and refuses past 500. (artifact-comment-service.ts:86-107)
- Client keeps a cache and merges a slow read with comments saved meanwhile. (artifact-comments-client.ts:53-140)
- Comments are in account export and in account erasure. (apps/web/app/api/user/export/route.ts:2269; apps/web/lib/server/account-erasure.ts:50)

**Incomplete**

- Element comments store selector, text and x/y but nothing draws a pin on the design; the highlight hook skips non-text anchors and scrollToAnchor returns false for them, so pressing the quote shows 'That passage is not on screen in this view.' (use-comment-highlights.ts:120,137-152; ArtifactPreview.tsx:3158-3162)
- Slide anchors have no on-slide marker either (same files).
- The schema allows author 'assistant' and the panel labels such rows Assistant, but the client create call never sends it and no producer was found. (artifact-comments.ts:36; artifact-comments-client.ts:166-170; ArtifactCommentsPanel.tsx:154)
- Replies are saved with anchor artifact and attached to the root thread only. (artifact-comment-service.ts:109-127)

**Present but disconnected or switched off**

- Ask AI to apply is passed only when the chat supplies an edit-request handler and the shown version is the latest (ArtifactPreview.tsx:3151).

**Not available**

- Mobile app, Chrome extension, VS Code extension, CLI and the retained Tauri desktop: no comment code found.
- Sharing comments with other people: rows are per account (0369:41-47); published pages carry no comments in the code opened [unknown beyond the files read].

## 4. Required behaviour

**Established requirements**

- The user can pin comments to a spot or element on the design (item S32.17). The brief marks web, desktop, mobile and chrome as missing, which the code contradicts for web. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S32.17)
- A visual design workspace is a required suite capability that follows artifact retention rules for storage, share, publish and delete. (source: docs/product/requirements.md:1474-1500)
- An action a user cannot undo asks first and names the consequence; a mutation fired straight from a click is a defect. (source: AGENTS.md section 9)
- Local, BYOK and Managed Cloud are separate trust boundaries; nothing may silently route Local content to managed cloud. (source: AGENTS.md section 6)

**Acceptance criteria**

1. Selecting text and pressing Comment saves a thread anchored to that text and highlights it.
2. A second identical phrase gets the comment on the occurrence that was selected.
3. Reply, Resolve and Reopen change the thread; Delete asks first and removes the replies too.
4. The 501st comment on one artifact is refused with a message.
5. Another account cannot read or change the comment.
6. A comment on an element shows a visible pin on the design [proposed requirement; not met today].
7. Ask AI to apply sends one request that quotes each open comment and its replies.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A comment should be refused or kept on the device when the artifact belongs to a Local or temporary chat, because comment text and a quote of the artifact go to our servers (route.ts:61-68) while the artifact push skips such chats (apps/web/features/chat/stores/artifacts-store.ts:1059-1072). [inferred]

**Proposed improvements** (suggestions, not requirements)

- Draw numbered pins at the saved x/y of element comments and make pressing a thread scroll to them.
- Add a slide marker for slide comments.
- Show pins in the shared Desktop and Mobile surfaces only after the trust-boundary rule is settled.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactCommentsPanel | `apps/web/features/chat/components/artifacts/comments/ArtifactCommentsPanel.tsx` | Side panel with composer, threads, resolve, reply, delete and Ask AI to apply. |
| service | artifact-comments-client | `apps/web/features/chat/components/artifacts/comments/artifact-comments-client.ts` | Fetch, cache and race-safe merge; create, update, remove; groupThreads. |
| hook | useCommentHighlights, scrollToAnchor, findTextRange | `apps/web/features/chat/components/artifacts/comments/use-comment-highlights.ts` | Re-finds text anchors and paints them with the CSS highlight registry; text only. |
| other | buildCommentsEditRequest, describeAnchor | `apps/web/features/chat/components/artifacts/comments/comment-request.ts` | Turns threads into the edit-request prompt. |
| component | ArtifactPreview (comment wiring) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | canComment gate (2213), startComment (2228), toggle button (2824), panel mount (3144), element draft (3185). |
| component | ArtifactSelectionToolbar | `apps/web/features/chat/components/artifacts/ArtifactSelectionToolbar.tsx` | Comment button on selected text. |
| component | ArtifactEditRequestLayer | `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.tsx` | Element picker overlay; Comment on this element button with x/y percentages. |
| component | PresentationWorkspace | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx` | Per-slide comment control. |
| endpoint | GET and POST /api/artifacts/[artifactId]/comments | `apps/web/app/api/artifacts/[artifactId]/comments/route.ts` | List and create; CSRF, rate limit, validation, 409 on cap. |
| endpoint | PATCH and DELETE /api/artifacts/[artifactId]/comments/[commentId] | `apps/web/app/api/artifacts/[artifactId]/comments/[commentId]/route.ts` | Edit body, resolve or reopen, delete. |
| service | artifact-comment-service | `apps/web/lib/services/artifact-comment-service.ts` | SQL, cap of 500, advisory lock, reply flattening. |
| schema | artifact-comments contract | `packages/contracts/cloud-contracts/src/artifact-comments.ts` | Zod schemas, anchor union, limits, path helpers. |
| table | artifact_comments | `apps/web/db/neon/0369_artifact_comments.sql` | Table with row-level security by user. |
| job | account erasure and export | `apps/web/lib/server/account-erasure.ts` | Deletes artifact_comments rows with the account; export route lists them (apps/web/app/api/user/export/route.ts:2269). |
| config | rate limit chat-conversation | `apps/web/lib/rate-limit.ts` | 60 per minute, fail open (282-286). |
| test | comment tests | `apps/web/features/chat/components/artifacts/comments/ArtifactComments.test.tsx` | Panel behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person selects text or picks an element; the page builds an anchor (quote with 200 characters of context on each side, or selector, text and x/y). | device | ArtifactPreview.tsx:2228-2241,3185-3204 |
| Client sends POST with CSRF header and cookies. | device and our servers | artifact-comments-client.ts:146-156 |
| Route checks CSRF, rate limit, validates the body with the schema, resolves the user. | our servers | comments/route.ts:41-59 |
| Service opens a transaction, takes an advisory lock, counts rows, resolves the parent thread, inserts the row. | our servers | artifact-comment-service.ts:86-133 |
| Client updates its cache and the panel lists the thread; highlights are repainted. | device | artifact-comments-client.ts:157-170; use-comment-highlights.ts:110-135 |
| Ask AI to apply builds a prompt from threads and hands it to the chat as an edit request; the model reply is a normal chat turn. | device and our servers | comment-request.ts:22-34; ArtifactCommentsPanel.tsx:271-286. The chat send path is in SYS-chat-turn-pipeline [inferred]. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Comment row: body, anchor JSON (may include a quote of the artifact text), author, resolved time | table artifact_comments in our database, keyed by user and artifact id | Not a device store; every client reads it from the server. | Reply rows go with the root (cascade); deleted with the account; listed in export; retention matrix says no maximum (docs/architecture/RETENTION_MATRIX.md:36). |
| Client cache of comments per artifact | in memory in the page | no | Cleared on reload or resetArtifactCommentsCache (artifact-comments-client.ts:142). |

**Models and providers.** Saving, listing and resolving comments use no model. Only Ask AI to apply starts a chat turn, which uses whatever model and provider the chat has selected; the comment code names none. [inferred]

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in required: the routes call getUserScopedDb, which needs a session or bearer token. Signed-out use: the load fails and the panel shows the retry message [inferred]. (apps/web/lib/server/rls-db.ts:116-145) |
| Permissions | Owner only. Rows are filtered by user id in SQL and by row-level security. No sharing or reviewer role found. (artifact-comment-service.ts:56-67; 0369:41-47) |
| Subscription | none found in the code. No plan or entitlement check in the three routes or the panel. |
| Limits and metering | 4000 characters per comment, 500 comments per artifact (HTTP 409 beyond), rate limit 60 per minute per the chat-conversation bucket. No usage metering found. |
| Feature flags | none found in the code for comments. Element comments depend on the cross-origin sandbox being configured (ArtifactPreview.tsx:2098). |
| Model compatibility | Comments are model independent. Ask AI to apply works with any model the chat can use [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | No Local-mode rule was found. canComment checks only panel variant, stored artifact and UUID (ArtifactPreview.tsx:2213). Comments therefore go to our servers even when the chat is temporary or answered on the device, while the artifact push skips those chats (artifacts-store.ts:1059-1072). Whether the toggle is hidden for them is unknown; a search of ArtifactPreview.tsx and ArtifactsPanel.tsx for temporary found nothing. Mobile and desktop local inference have no comment feature at all. [inferred trust-boundary gap] |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Spinner labelled Loading comments. | ArtifactCommentsPanel.tsx:358-363 |
| empty | Text: No comments yet. Select text and choose Comment to note a passage. | ArtifactCommentsPanel.tsx:376 |
| load error / retry | Message plus Try again button. | ArtifactCommentsPanel.tsx:364-373 |
| save error | Toast 'The comment was not saved' and the text stays in the box. | ArtifactCommentsPanel.tsx:263-269; composer keeps text unless sent (84-86) |
| cap reached | HTTP 409 with 'An artifact holds at most 500 comments.' | comments/route.ts:72; artifact-comment-service.ts:49-54 |
| slow read racing a save | Saved or deleted comments win over an older snapshot. | artifact-comments-client.ts:61-140 |
| element or slide anchor, locate | Toast 'That passage is not on screen in this view.' | ArtifactPreview.tsx:3158-3162 |
| older version shown | Ask AI to apply is not offered when the shown version is not the latest. | ArtifactPreview.tsx:3151 |
| offline / timeout / cancel | No specific offline or timeout handling; failures surface as the generic errors above. Cancel clears the draft. | not handled in the code beyond ArtifactCommentsPanel.tsx:263-269 |
| accessibility | Region labelled Comments, 44px touch targets on small screens, Escape and IME handled, aria-pressed on toggles. | ArtifactCommentsPanel.tsx:78-90,302-306 |
| browser without highlight API | Highlights silently skipped; comments still work. | use-comment-highlights.ts:19-26,112 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/comments/ArtifactComments.test.tsx`: Comment on selected passage, reply and resolve, delete confirmation, send all open comments, load failure with retry.
- `apps/web/features/chat/components/artifacts/comments/artifact-comments-client.test.ts`: Merging of slow reads with acknowledged saves and deletes, failed reads, cache reset.
- `apps/web/features/chat/components/artifacts/comments/use-comment-highlights.test.ts`: Locating the right one of two identical passages, ignoring comment UI text.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.commentIdentity.test.tsx`: Saved context of first and second identical passage, highlight after panel closes.
- `apps/web/app/api/artifacts/[artifactId]/comments/route.test.ts`: Owner-only list, create behind CSRF, malformed anchor, reply threading, cap, resolve and delete.
- `apps/web/lib/services/__tests__/artifact-comment-service.test.ts`: Admission at the cap under overlapping creates, isolation level check.
- `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.design.test.tsx`: Element picker layer including the comment button [name only; content not opened].

**Test scenarios**

- **Comment on a repeated phrase**
  1. Generate a document with the same sentence twice.
  2. Select the second sentence, press Comment, save a note.
  3. Close and reopen the panel.
  - Expected: The highlight and the thread point to the second sentence.
- **Element comment has no pin**
  1. Open an HTML design.
  2. Request edits, pick a heading, press Comment on this element, save.
  3. Press the quote on the thread.
  - Expected: Comment saves; no pin is drawn; toast says the passage is not on screen (documents the current gap).
- **Cap**
  1. Create 500 comments on one artifact through the API.
  2. Create one more.
  - Expected: HTTP 409 with the cap message.
- **Cross-account**
  1. Create a comment as account A.
  2. As account B call GET and PATCH on the same artifact and comment ids.
  - Expected: List is empty; PATCH returns 404.
- **Ask AI to apply all**
  1. Create three open comments, resolve one.
  2. Press Ask AI to apply all 2 open comments.
  - Expected: One edit request lists two numbered comments with their replies; toast confirms.
- **Temporary chat boundary**
  1. Open an artifact from a temporary chat while signed in.
  2. Add a comment and watch network calls.
  - Expected: Unknown today; expected per the boundary rule is no server call [inferred].

**Where to look when it fails**

- Toasts 'The comment was not saved' and 'Comments could not be loaded'.
- HTTP 409 conflict for the cap; 404 'Artifact not found' for a non-UUID id.
- Error name ArtifactCommentLimitError; message 'Artifact comment admission requires read committed isolation'.
- Table artifact_comments (columns user_id, artifact_id, parent_id, anchor).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/032-design-workspace.md](../../70-qa/test-plans/web/032-design-workspace.md)
- Desktop: [70-qa/test-plans/desktop/032-design-workspace.md](../../70-qa/test-plans/desktop/032-design-workspace.md)

## 10. Gaps and dependencies

- **Element and slide comments have no on-design pin or locate behaviour.** Affects: Web and the Desktop window; the S32.17 'pin to a spot' requirement.. Evidence: use-comment-highlights.ts:120,137-152. Work needed: Render pins from x/y and selector, scroll to element, and a slide marker.
- **No Mobile, Chrome, VS Code, CLI or Tauri comments.** Affects: Mobile, Chrome, Tauri desktop users.. Evidence: repo-wide search for artifact-comment contract names found only web and contracts. Work needed: Decide scope per the parity plan, then build on the shared contract.
- **Comments are not gated by chat boundary (temporary or Local) and send artifact quotes to our servers.** Affects: Web and Desktop window users in temporary or locally answered chats [inferred].. Evidence: ArtifactPreview.tsx:2213 versus artifacts-store.ts:1059-1072. Work needed: Hide or refuse comments for those chats or keep them on the device.
- **No assistant-authored comments are produced although the schema supports them.** Affects: All users.. Evidence: artifact-comments-client.ts:166-170. Work needed: Either add a producer or remove the field.
- **The brief lists every app as missing; it is out of date for web.** Affects: Brief readers.. Evidence: comments/route.ts. Work needed: Update the brief rows.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- table:artifact_comments
- api:GET /api/artifacts/[artifactId]/comments
- api:POST /api/artifacts/[artifactId]/comments
- api:PATCH /api/artifacts/[artifactId]/comments/[commentId]
- api:DELETE /api/artifacts/[artifactId]/comments/[commentId]
- file:packages/contracts/cloud-contracts/src/artifact-comments.ts
- SYS-files-artifacts-and-storage
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-chat-turn-pipeline

## Unknown

- Whether the Comments toggle is hidden in temporary chats or signed-out use (no gating found in ArtifactPreview.tsx or ArtifactsPanel.tsx).
- Whether the sandbox origin needed for element picking is set in production.
- Whether the Tauri desktop shared panel ever gets comments.
- Content of ArtifactEditRequestLayer.design.test.tsx and PresentationWorkspace comment tests (not opened).
- Whether published pages show comments (not opened).
