---
id: "F027-09"
type: "feature"
title: "Suggestions, tracked changes, comments and presence"
aliases: ["Comments", "Comments panel", "Ask AI to apply", "Review changes", "Show changes", "Suggestions", "Tracked changes", "Collaborative presence", "S27.22 to S27.26"]
area: "27 Document and writing editor"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S27.22", "S27.23", "S27.24", "S27.25", "S27.26"]
depends_on: ["surface:web", "mode:cloud", "table:artifact_comments", "api:GET /api/artifacts/[artifactId]/comments", "api:POST /api/artifacts/[artifactId]/comments", "api:PATCH /api/artifacts/[artifactId]/comments/[commentId]", "api:DELETE /api/artifacts/[artifactId]/comments/[commentId]", "F027-07", "F027-08", "SYS-data-model-and-migrations", "SYS-authorization-and-workspaces", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F027-09 Suggestions, tracked changes, comments and presence

On web a person can comment on a selected passage, a slide, an element or the whole artifact, reply, resolve and delete comments, and send open comments to the assistant to apply. Comments are private to the account. There are no assistant suggestions to accept one by one, no tracked changes and no presence. Review changes and Show changes cover part of that.

Area: [27. Document and writing editor](README.md). Requirement items: [S27.22](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2722), [S27.23](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2723), [S27.24](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2724), [S27.25](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2725), [S27.26](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2726).

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

**What it does.** Lets the person leave notes tied to a place in an artifact, keep them in threads, mark them resolved, and hand one or all open comments to the assistant as an edit request. A separate 'Review changes' view lets the person keep or undo each change in the latest version.

**Why it exists.** So notes on a draft do not get lost and can drive the next edit. The migration states the aim: leave a note on a passage, slide or element and come back, or hand a batch of notes to the assistant as edit requests (apps/web/db/neon/0369_artifact_comments.sql header).

**Who uses it.** A person reviewing assistant-written documents, decks and designs on the web app.

**Problems it solves**

- Forgetting what to fix in a draft
- Applying many small fixes in one assistant request
- Choosing which of the assistant's changes to keep

**Use cases**

- Select a sentence, press Comment, type 'cite a source', later press 'Ask AI to apply'.
- Add five comments, then press 'Ask AI to apply all 5 open comments'.
- After the assistant rewrote a section, open Review changes and undo two of eight changes.
- Hide resolved threads with 'Hide resolved' and reopen one.

## 2. User experience

**Where to find it**

- Web side panel header: a 'Comments' toggle button, named 'Comments, N open' when there are open threads (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2828-2840). Also the 'Comment' button on the selection toolbar (ArtifactSelectionToolbar.tsx:25) and, in pick-an-element mode, 'Comment on this element' (ArtifactEditRequestLayer.tsx:12).
- More menu: 'Review changes' and 'Show changes' (ArtifactPreview.tsx:2325-2340).
- Electron desktop shows the same hosted web app (ARCHITECTURE.md:53). Mobile, CLI, VS Code, Chrome and Tauri desktop: no comment code found (searched apps/mobile/src, services, apps/cli/src, apps/extension-vscode/src, apps/extension/src, apps/desktop/src for artifact comment names).

**Before you start**

- Web side-panel variant, stored artifact, and an artifact id that is a UUID (canCommentOn, ArtifactPreview.tsx:2213; packages/contracts/cloud-contracts/src/artifact-comments.ts canCommentOnArtifact).
- A signed-in account (server routes resolve a user-scoped database).

**Screens and controls**

- Panel 'Comments' with close 'Close comments' (ArtifactCommentsPanel.tsx:290-315).
- Composer: placeholder 'Add a comment' for a selected passage (quoted above it), or 'Comment on the whole artifact'; submit label 'Comment'; replies use placeholder 'Reply' (ArtifactCommentsPanel.tsx:166-170, 320-340).
- Thread buttons: 'Resolve' / 'Reopen', 'Ask AI to apply', 'Delete comment' with a confirmation that says it cannot be undone (ArtifactCommentsPanel.tsx:195-222; ArtifactComments.test.tsx:181). Clicking the quoted text shows it in the artifact ('Show in the artifact'); if not on screen the toast says 'That passage is not on screen in this view.' (ArtifactPreview.tsx:3153-3158).
- 'Show resolved (N)' / 'Hide resolved'; 'Ask AI to apply all N open comments' when more than one is open (ArtifactCommentsPanel.tsx:300-355).
- Review changes: 'Keep all', 'Undo all', per-change 'Undo change N' / 'Keep change N'; summary 'Version N against version M: X changes, keeping Y' (review/ArtifactChangesReview.tsx:50-130).

**Journey**

1. 1. Select a passage and press Comment (or open the Comments panel and type a whole-artifact comment).
2. 2. Type and press Comment; the thread appears and the passage is highlighted.
3. 3. Reply, resolve or delete as needed.
4. 4. Press 'Ask AI to apply' on one thread or 'Ask AI to apply all N open comments'; a toast says 'Sent the comment to the assistant' or 'Sent N comments to the assistant'.
5. 5. The assistant's reply arrives as a new version; open Review changes to keep or undo each change, then it saves 'your choices as a new version'.

**What the person sees and gets**

- Toasts: 'The comment was not saved', 'The comment was not changed', 'The comment was not deleted', 'The change request was not sent. Try again.' (ArtifactCommentsPanel.tsx:270-290, 391, 406).
- Spinner 'Loading comments' while loading; a retry offer when loading fails (ArtifactComments.test.tsx:209).
- Toast 'Saved your choices as a new version' after Review changes (ArtifactPreview.tsx:3135-3139).

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web comments: create, list, reply, resolve, reopen, delete, highlight, locate and send to the assistant (apps/web/features/chat/components/artifacts/comments/*; apps/web/app/api/artifacts/[artifactId]/comments/route.ts and [commentId]/route.ts).
- Server: CSRF check, rate limit class 'chat-conversation', body 1 to 4,000 characters, up to 500 comments per artifact, replies attach to the top comment, advisory lock to admit one create at a time (apps/web/lib/services/artifact-comment-service.ts:10, 79-130; packages/contracts/cloud-contracts/src/artifact-comments.ts:1-60).
- Table artifact_comments with row-level security so every row belongs to one account (apps/web/db/neon/0369_artifact_comments.sql).
- Account export and erasure reference the comments (apps/web/app/api/user/export/route.ts; apps/web/lib/server/account-erasure.ts; apps/web/lib/services/deletion-manifest.ts).

**Incomplete**

- Partial accept or reject: Review changes lets the person keep or undo each change after the assistant has already applied them, rather than the assistant proposing edits first (packages/platform/artifacts/src/change-review.ts:1-60).
- Comment editing from the UI: the API and client support changing a body (route [commentId] PATCH) but a UI control for it was not found; unknown.
- The schema allows author 'assistant' for replies but no code that writes assistant comments was found.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Suggested edits the person accepts or rejects one by one before they apply (S27.22, S27.23): not found.
- Tracked changes that stay visible until resolved (S27.24): not found; Show changes is a read-only comparison, word-level for text documents and email (ArtifactPreview.tsx:3210-3217).
- Presence, avatars, cursors (S27.26): none found in apps/web/features/chat/components/artifacts or packages/platform/artifacts.
- Multi-person comment sharing: comments are user-isolated by row-level security, so other people cannot see them (0369 policy artifact_comments_user_isolation).
- Mobile, CLI, VS Code, Chrome, Tauri desktop: none found.

## 4. Required behaviour

**Established requirements**

- The assistant can propose edits as suggestions instead of overwriting (S27.22); suggestions can be accepted or rejected one by one (S27.23); edits show as tracked insertions and deletions (S27.24); comments and replies (S27.25); people see each other's presence (S27.26). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S27.22, S27.23, S27.24, S27.25, S27.26)
- Comments are stored on the server with an anchor and at most 4,000 characters. (source: apps/web/db/neon/0369_artifact_comments.sql (check char_length between 1 and 4000); packages/contracts/cloud-contracts/src/artifact-comments.ts:3)
- Dedicated artifact editors are not built because ChatGPT Canvas and Claude artifacts change files by prompt. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:119-122 (names S27.34, S27.39-41, not S27.22-26))

**Acceptance criteria**

1. A comment on a selected passage shows that passage as its quote and highlights it.
2. A reply is added under the top comment of its thread.
3. Resolve moves a thread out of the list; 'Show resolved (N)' brings it back; Reopen restores it.
4. Deleting a comment asks first and says it cannot be undone.
5. A 501st comment on one artifact is refused.
6. Another account cannot read or change the comment (row-level security).
7. 'Ask AI to apply all N open comments' sends one chat message listing every open thread.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because comments are per account, 'collaboration' is not delivered; people cannot share comment threads [inferred from RLS policy].
- Whether suggestions and tracked changes are wanted is not documented; the founder decision covers only dedicated editors [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether S27.22 to S27.26 stay in scope; if not, record a decision like D-2026-09-28-18.
- [proposed] Add a UI to edit a comment body since the API supports it.
- [proposed] If people should share comments, change the isolation rule and add organisation scope.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactCommentsPanel | `apps/web/features/chat/components/artifacts/comments/ArtifactCommentsPanel.tsx` | Panel, composer, threads, resolve, delete, send to assistant. |
| service | artifact-comments-client | `apps/web/features/chat/components/artifacts/comments/artifact-comments-client.ts` | Client store, grouping into threads, fetch calls. |
| hook | use-comment-highlights | `apps/web/features/chat/components/artifacts/comments/use-comment-highlights.ts` | Highlights anchored passages and reads selection context. |
| service | comment-request | `apps/web/features/chat/components/artifacts/comments/comment-request.ts` | Builds the edit request from threads (describeAnchor, buildCommentsEditRequest). |
| component | ArtifactPreview comments wiring | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Toggle button (2828), panel mount (3144), highlights (2220). |
| endpoint | GET/POST /api/artifacts/[artifactId]/comments | `apps/web/app/api/artifacts/[artifactId]/comments/route.ts` | List and create comments (CSRF, rate limit). |
| endpoint | PATCH/DELETE /api/artifacts/[artifactId]/comments/[commentId] | `apps/web/app/api/artifacts/[artifactId]/comments/[commentId]/route.ts` | Change body or resolved state, delete. |
| service | artifact-comment-service | `apps/web/lib/services/artifact-comment-service.ts` | Queries, 500-comment cap, advisory lock, reply threading. |
| schema | artifact comment contracts | `packages/contracts/cloud-contracts/src/artifact-comments.ts` | Zod schemas, anchor kinds, 4,000-character limit, path helpers. |
| table | artifact_comments | `apps/web/db/neon/0369_artifact_comments.sql` | Stores comments with anchor json, author, resolved_at; RLS by user. |
| component | ArtifactChangesReview | `apps/web/features/chat/components/artifacts/review/ArtifactChangesReview.tsx` | Per-change keep/undo view that saves a new version. |
| service | change-review | `packages/platform/artifacts/src/change-review.ts` | buildChangeReview and resolveReview (word-level pieces). |
| component | ArtifactChangesView | `apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx` | Read-only comparison. |
| job | account export and erasure | `apps/web/lib/server/account-erasure.ts` | References artifact comments when an account is erased; export route app/api/user/export/route.ts. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person selects text and presses Comment; the client captures the quote and 400 characters of context. | device | ArtifactSelectionToolbar.tsx:315-330; comments/use-comment-highlights.ts |
| The client posts the comment with CSRF token to the comments route. | our servers | apps/web/app/api/artifacts/[artifactId]/comments/route.ts:36-70 |
| The server validates the body and anchor, takes a per-user-per-artifact lock, checks the 500 cap, and inserts the row under row-level security. | our servers | apps/web/lib/services/artifact-comment-service.ts:79-130 |
| 'Ask AI to apply' builds a text request from the threads and sends it through chat. | device and our servers | comments/comment-request.ts:20-34; ArtifactCommentsPanel.tsx:276-290 |
| The assistant reply makes a new version; Review changes compares it with the previous version in the browser. | device | packages/platform/artifacts/src/change-review.ts:10-40 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Comment body, anchor (quote, slide, element or whole artifact), author, resolved time | table artifact_comments (account-scoped) | Fetched from the server per artifact; client keeps an in-memory copy | Deleted by the person's Delete, or through account erasure (apps/web/lib/server/account-erasure.ts). Replies are deleted with their thread (on delete cascade, 0369). |

**Models and providers.** Writing and managing comments uses no model. 'Ask AI to apply' sends text to the current chat's model and provider like any message (see F027-08).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; the route resolves a user-scoped database. |
| Permissions | Row-level security allows an account to see only its own rows. No workspace or role check found. |
| Subscription | none found in the code for comments or review. |
| Limits and metering | 4,000 characters per comment; 500 comments per artifact; rate limit class 'chat-conversation' (route.ts:24-25, 45). Rate values are configuration elsewhere; not read. |
| Feature flags | none found in the code. |
| Model compatibility | Comments are not model dependent. Applying them depends on the chat model following the reply format. |
| Provider restrictions | none found in the code. |
| Local mode | Comments are stored on our servers, not on the device. Whether the panel is hidden for Local or temporary chats: unknown (no local-mode check found in artifact-comments-client.ts). Review changes and Show changes run on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Loading comments' | ArtifactCommentsPanel.tsx:359 |
| Load failure | Says so and offers retry | ArtifactComments.test.tsx:209 |
| Save or change failure | Error toast; text kept [text kept inferred] | ArtifactCommentsPanel.tsx:270, 391, 406 |
| Cap reached | Server returns a conflict error | comments route.ts:66-68; artifact-comment-service.ts:49-53 |
| Passage not on screen | Toast 'That passage is not on screen in this view.' | ArtifactPreview.tsx:3156-3158 |
| Reply to a missing comment | Not found error | comments route.ts:62 |
| Versions too different for Review changes | Notice to use Show changes or restore | review/ArtifactChangesReview.tsx:29-35 |
| Offline, reconnect, timeout | not handled in the code beyond the error toasts above. | ArtifactCommentsPanel.tsx:270-290 shows only toast.error on failure; no offline queue or reconnect logic in comments/artifact-comments-client.ts |
| Accessibility | Panel is an aside with a label, buttons are 44px high on small screens, change markers have screen-reader text 'Added:' / 'Removed:' | ArtifactCommentsPanel.tsx:290-300; review/ArtifactChangesReview.tsx:88-110 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/comments/ArtifactComments.test.tsx`: Commenting on a passage, replying, resolving and hiding, delete confirmation, send-all, load failure.
- `apps/web/app/api/artifacts/[artifactId]/comments/route.test.ts`: Own comments only, create behind CSRF, malformed anchor refused, reply threading, cap, resolve and delete.
- `apps/web/lib/services/__tests__/artifact-comment-service.test.ts`: Concurrent creates at the cap, cap refusal, isolation level check, list returns all rows.
- `apps/web/features/chat/components/artifacts/comments/artifact-comments-client.test.ts`: Client behaviour; cases not read.
- `apps/web/features/chat/components/artifacts/review/ArtifactChangesReview.test.tsx`: Rebuilding versions and undoing one change.

**Test scenarios**

- **Comment, reply, resolve**
  1. Open a document, select a sentence, press Comment.
  2. Type text and submit.
  3. Reply, then press Resolve.
  4. Press 'Show resolved (1)'.
  - Expected: Thread appears with the quote, the reply sits under it, Resolve hides it, and showing resolved lists it with 'Reopen'.
- **Cross-account isolation**
  1. Create a comment as account A.
  2. As account B call GET the same artifact comments path.
  - Expected: B receives an empty list or not found; A's comment is not visible.
- **Cap**
  1. Create 500 comments on one artifact.
  2. Create one more.
  - Expected: The 501st is refused with a conflict message.
- **Apply all**
  1. Create 3 open comments.
  2. Press 'Ask AI to apply all 3 open comments'.
  - Expected: One chat message listing 3 numbered items is sent and a toast says 'Sent 3 comments to the assistant'.
- **Review changes**
  1. Make the assistant edit a document.
  2. Open More then Review changes and press 'Undo change 1'.
  3. Save.
  - Expected: A new version is saved without that change and a toast says 'Saved your choices as a new version'.

**Where to look when it fails**

- Server error classes: validation 'Invalid comment', conflict from ArtifactCommentLimitError, not found 'Comment not found'.
- Table artifact_comments (user_id, artifact_id, parent_id).
- Toast texts listed above.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/027-document-and-writing-editor.md](../../70-qa/test-plans/web/027-document-and-writing-editor.md)
- Desktop: [70-qa/test-plans/desktop/027-document-and-writing-editor.md](../../70-qa/test-plans/desktop/027-document-and-writing-editor.md)

## 10. Gaps and dependencies

- **No assistant suggestions that the person accepts or rejects before they apply.** Affects: Web and all other apps. Evidence: No suggestion code in apps/web/features/chat/components/artifacts; Review changes works after the fact (change-review.ts). Work needed: Decide scope; a proposal flow would need a pending-version state.
- **No tracked changes; Show changes is a one-time comparison.** Affects: All apps. Evidence: ArtifactPreview.tsx:3210-3217. Work needed: Decide scope.
- **No presence.** Affects: All apps. Evidence: No presence or cursor code found in artifacts directories. Work needed: Needs a live channel and shared documents; not designed.
- **Comments are private to one account, not shared.** Affects: Teams. Evidence: 0369 policy artifact_comments_user_isolation. Work needed: Add sharing rules if collaboration is wanted.
- **Brief marks web comments missing but they exist.** Affects: Docs. Evidence: ArtifactPreview.tsx:2828-2840. Work needed: Update the brief.
- **Comments absent on mobile, CLI, VS Code, Chrome and Tauri desktop.** Affects: Those apps. Evidence: No comment code found by search. Work needed: Decide scope.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- mode:cloud
- table:artifact_comments
- api:GET /api/artifacts/[artifactId]/comments
- api:POST /api/artifacts/[artifactId]/comments
- api:PATCH /api/artifacts/[artifactId]/comments/[commentId]
- api:DELETE /api/artifacts/[artifactId]/comments/[commentId]
- F027-07
- F027-08
- SYS-data-model-and-migrations
- SYS-authorization-and-workspaces
- SYS-security-and-privacy

## Unknown

- Whether any UI lets the person edit a comment body.
- Who writes comments with author 'assistant', if anyone.
- Whether comments appear for Local or temporary chats.
- The numeric value of the 'chat-conversation' rate limit.
- Whether Tauri desktop has any comment feature outside the searched files.
- Whether the account export includes comment text (route references the table; contents not read).
