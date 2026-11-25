---
id: "F030-08"
type: "feature"
title: "Slide comments"
aliases: ["Slide comments", "Comment on slide N", "Comments panel", "S30.24", "artifact comments"]
area: "30 Presentation workspace"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S30.24"]
depends_on: ["surface:web", "table:artifact_comments", "api:GET /api/artifacts/{artifactId}/comments", "api:POST /api/artifacts/{artifactId}/comments", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "F030-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F030-08 Slide comments

On web, a person can leave a comment on a slide from the presentation toolbar (button 'Comment on slide N'). The comment opens in the artifact Comments panel, where people reply, resolve, reopen, delete, and send comments to the assistant as an edit request. Comments are saved on our servers. No other app has it.

Area: [30. Presentation workspace](README.md). Requirement items: [S30.24](../../10-requirements/capabilities/030-presentation-workspace.md#s3024).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person attach a note to a slide, keep a thread, mark it resolved, and hand open threads to the assistant to apply. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1967-1973,3144-3156)

**Why it exists.** So a deck can be reviewed and fixed in steps. The brief wants users to leave and read comments on slides (S30.24). Migration 0369 says decks had no way to leave a note on a slide (apps/web/db/neon/0369_artifact_comments.sql).

**Who uses it.** A signed-in person on web who owns the saved artifact.

**Problems it solves**

- Keeping review notes next to the slide they concern
- Batching several notes into one edit request
- Tracking which notes are done

**Use cases**

- Click the comment icon on slide 3 and write 'Add last year's number'.
- Resolve a thread after the slide is fixed.
- Select several open threads and ask the assistant to address them.

## 2. User experience

**Where to find it**

- Web: icon-only button in the presentation toolbar, aria-label 'Comment on slide N' (PresentationWorkspace.tsx:518-529).
- Web: panel labelled 'Comments' with a toolbar toggle and an open count (ArtifactCommentsPanel.tsx:19; ArtifactPreview.tsx:2824-2841).
- Web: 'Comment' in the selection toolbar (ArtifactSelectionToolbar.tsx:25).
- Desktop (Electron) shows the hosted web app (doc: AGENTS.md section 5). Mobile, Chrome, VS Code, CLI: none found in the code.

**Before you start**

- A stored artifact whose id is a UUID (ArtifactPreview.tsx:2213; packages/contracts/cloud-contracts/src/artifact-comments.ts:70-72).
- Panel variant, not the inline preview (ArtifactPreview.tsx:2213).
- A signed-in account; the API reads the user scoped database (apps/web/app/api/artifacts/[artifactId]/comments/route.ts:36).

**Screens and controls**

- Comment button in the toolbar (hidden unless a comment handler is passed).
- Comments panel: comment box, 'Reply' box, 'Resolve' / 'Reopen', 'Delete comment', show-resolved toggle, and an 'ask the assistant' action per thread (ArtifactCommentsPanel.tsx:127-218,248-303).

**Journey**

1. Open a deck in the artifact panel.
2. Choose the slide.
3. Click the comment icon. The panel opens with a draft anchored to that slide.
4. Write the comment and save it.
5. Others or the author reply, resolve or reopen.
6. Optionally select threads and send them to the assistant as one edit request (ArtifactCommentsPanel.tsx:278-279).

**What the person sees and gets**

- Open comment count beside the Comments toggle (ArtifactPreview.tsx:2832-2841).
- Resolved threads dim and can be shown with a toggle (ArtifactCommentsPanel.tsx:147,299-303).
- Label 'Slide N' on a slide-anchored thread (ArtifactCommentsPanel.tsx:31-32).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Slide comment anchor { kind: 'slide', slide } (artifact-comments.ts:17-20).
- Create and list endpoints with CSRF, rate limit 'chat-conversation' and user-scoped database (comments/route.ts:32-78).
- Update (PATCH) and delete (DELETE) endpoints (comments/[commentId]/route.ts:75-76).
- Body 1-4,000 characters; at most 500 comments per artifact (artifact-comments.ts:3,33; apps/web/lib/services/artifact-comment-service.ts:10,107).
- Table artifact_comments with row level security (apps/web/db/neon/0369_artifact_comments.sql).
- Comment button wired from ArtifactPreview into PresentationWorkspace (ArtifactPreview.tsx:1967-1973).
- Comments become an edit request with the line 'On slide N' (comment-request.ts:10-11,20-35).

**Incomplete**

- Comment author can be 'assistant' in the schema (artifact-comments.ts:36) but where the assistant writes comments was not found.

**Present but disconnected or switched off**

- The brief marks S30.24 missing on every app but the web feature is built and tested (ArtifactComments.test.tsx; PresentationWorkspace.test.tsx:217). Brief is stale.

**Not available**

- Mobile, desktop Tauri, Chrome, VS Code, CLI: no comment UI found.
- Comments are not shown on the full-screen presenting view or in published pages (PresentationWorkspace.tsx:771-806 has no comment control).

## 4. Required behaviour

**Established requirements**

- Users can leave and read comments on slides (S30.24). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S30.24)
- Rows belong to the account that wrote them and row level security keeps other accounts out. (source: apps/web/db/neon/0369_artifact_comments.sql)

**Acceptance criteria**

1. The comment icon with label 'Comment on slide N' shows only when comments are allowed for the artifact.
2. Clicking it opens the Comments panel with a draft anchored to the slide on screen.
3. A saved comment appears in the panel labelled 'Slide N' and counts in the open total.
4. Resolve moves the thread out of the open list; 'Reopen' brings it back.
5. The 501st comment on one artifact is refused with the limit message.
6. A comment longer than 4,000 characters is refused.
7. Another account cannot read the thread.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Reading comments on an older version should still work because canComment ignores the shown version [inferred from ArtifactPreview.tsx:2213].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show comment markers on slide thumbnails.
- [proposed] Bring comments to mobile, since mobile has the deck viewer.
- [proposed] Say whether others in a workspace can see comments; today rows belong to the writing account only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PresentationWorkspace comment button | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx` | Icon button 'Comment on slide N' (518-529); prop onCommentSlide (112). |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | canComment (2213), slide draft (1967-1973), panel mount (3144-3156). |
| component | ArtifactCommentsPanel | `apps/web/features/chat/components/artifacts/comments/ArtifactCommentsPanel.tsx` | Thread list, reply, resolve, delete, ask assistant. |
| hook | artifact-comments-client | `apps/web/features/chat/components/artifacts/comments/artifact-comments-client.ts` | Client store and fetch calls; canCommentOn; groupThreads. |
| hook | use-comment-highlights | `apps/web/features/chat/components/artifacts/comments/use-comment-highlights.ts` | Highlights commented passages in the rendered artifact. |
| service | comment-request | `apps/web/features/chat/components/artifacts/comments/comment-request.ts` | describeAnchor and buildCommentsEditRequest. |
| schema | artifact-comments contract | `packages/contracts/cloud-contracts/src/artifact-comments.ts` | Anchor kinds text, slide, element, artifact; request and response types; paths. |
| endpoint | api:GET /api/artifacts/{artifactId}/comments and api:POST | `apps/web/app/api/artifacts/[artifactId]/comments/route.ts` | List and create comments. |
| endpoint | api:PATCH and api:DELETE /api/artifacts/{artifactId}/comments/{commentId} | `apps/web/app/api/artifacts/[artifactId]/comments/[commentId]/route.ts` | Edit body, resolve, delete. |
| service | artifact-comment-service | `apps/web/lib/services/artifact-comment-service.ts` | Database access; MAX_COMMENTS_PER_ARTIFACT 500; ArtifactCommentLimitError. |
| table | artifact_comments | `apps/web/db/neon/0369_artifact_comments.sql` | Comment rows with anchor json, parent_id, author, resolved_at; RLS. |
| test | ArtifactComments.test.tsx | `apps/web/features/chat/components/artifacts/comments/ArtifactComments.test.tsx` | Panel behaviour tests. |
| test | artifact-comments-client.test.ts | `apps/web/features/chat/components/artifacts/comments/artifact-comments-client.test.ts` | Client store tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Click on the slide comment icon sets a slide anchor draft and opens the panel. | device | ArtifactPreview.tsx:1967-1973 |
| Saving posts the comment to the comments endpoint with CSRF header. | our servers | artifact-comments-client.ts (fetch with addCsrfHeaders, line 15 import); comments/route.ts:41-75 |
| The server validates body and anchor, applies rate limit, checks the 500 limit and inserts into artifact_comments under the user's row level security. | our servers | comments/route.ts:41-70; artifact-comment-service.ts:107 |
| The client store updates and the panel shows the thread. | device | artifact-comments-client.ts:53-80 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Comment rows (body, anchor, author, resolved_at) | table:artifact_comments (Postgres) | Server is the source; client keeps a cache per artifact | Replies delete with their parent (on delete cascade); explicit delete via DELETE endpoint |

**Models and providers.** No model takes part in saving a comment. Sending comments to the assistant uses a normal chat turn (comment-request.ts).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; user scoped database (comments/route.ts:36,59). |
| Permissions | Rows are owned by the writing user; RLS keeps other accounts out (0369_artifact_comments.sql). Workspace sharing of comments: none found in the code. |
| Subscription | none found in the code |
| Limits and metering | 500 comments per artifact; 4,000 characters per comment; rate limit class 'chat-conversation' (comments/route.ts:34,46). |
| Feature flags | none found in the code |
| Model compatibility | Not model related. |
| Provider restrictions | none found in the code |
| Local mode | Comments need our servers (HTTP API). Web has no Local mode surface in the files read; mobile and desktop Local use: none found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Artifact id not a UUID | Comment button not offered; API answers not found | artifact-comments.ts:70-72; comments/route.ts:28 |
| Comment limit reached | Conflict error with message 'An artifact holds at most 500 comments.' | artifact-comment-service.ts:49-52; comments/route.ts:72 |
| Load failure | Client state 'failed' with an error | artifact-comments-client.ts:47-51 |
| Reply target missing | 404 'The comment being replied to was not found' | comments/route.ts:69 |
| Invalid body | Validation error 'Invalid comment' | comments/route.ts:55-57 |
| Offline / retry | not handled in the code beyond the failed state (no retry queue found) | not found in artifact-comments-client.ts |
| Accessibility | Button has aria-label 'Comment on slide N'; panel has aria-label 'Comments' | PresentationWorkspace.tsx:524; ArtifactCommentsPanel.tsx:293 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx`: 'starts a comment on the slide being viewed' (line 217).
- `apps/web/features/chat/components/artifacts/comments/ArtifactComments.test.tsx`: Comments panel behaviour.
- `apps/web/features/chat/components/artifacts/comments/artifact-comments-client.test.ts`: Client store, threads.
- `apps/web/features/chat/components/artifacts/comments/use-comment-highlights.test.ts`: Highlighting of commented text.

**Test scenarios**

- **Comment on a slide**
  1. Open a saved deck on web
  2. Go to slide 3
  3. Click the comment icon
  4. Write and save a comment
  - Expected: Panel shows a thread labelled 'Slide 3' and the open count rises by one.
- **Resolve and reopen**
  1. Click 'Resolve' on the thread
  2. Toggle show resolved
  3. Click 'Reopen'
  - Expected: Thread leaves then returns to the open list.
- **Comments to the assistant**
  1. Create two slide comments
  2. Select both threads and use the assistant action
  - Expected: A chat request lists 'On slide N: ...' lines and asks for the full updated deck.
- **Limit**
  1. Fill an artifact with 500 comments through the API
  2. Post one more
  - Expected: 409 conflict with the limit message.
- **Isolation**
  1. Sign in as another account
  2. Call GET on the same artifact comments path
  - Expected: No comments of the first account are returned.

**Where to look when it fails**

- Table artifact_comments; migration 0369.
- Error name ArtifactCommentLimitError.
- Server log of the comments route through withErrorHandler.
- Client store state 'failed' in artifact-comments-client.ts.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/030-presentation-workspace.md](../../70-qa/test-plans/web/030-presentation-workspace.md)
- Desktop: [70-qa/test-plans/desktop/030-presentation-workspace.md](../../70-qa/test-plans/desktop/030-presentation-workspace.md)

## 10. Gaps and dependencies

- **Comments exist only on web** Affects: Mobile, Chrome, VS Code, CLI users. Evidence: No comment UI in those apps' sources. Work needed: Decide scope; build mobile comments over the same API.
- **Brief marks S30.24 missing everywhere** Affects: Planning. Evidence: Brief vs ArtifactPreview.tsx:1967. Work needed: Correct the brief after a human run.
- **No comment control in presenting mode or in shared viewer pages** Affects: Reviewers who are not editing. Evidence: PresentationWorkspace.tsx:771-806. Work needed: Decide whether review on the published page is required.
- **Comments are per account, not shared with workspace members** Affects: Teams. Evidence: 0369_artifact_comments.sql header says rows belong to the writing account. Work needed: Product decision and migration if sharing is wanted.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- table:artifact_comments
- api:GET /api/artifacts/{artifactId}/comments
- api:POST /api/artifacts/{artifactId}/comments
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- F030-07

## Unknown

- Who writes assistant-authored comments, if anyone.
- Whether workspace members can read each other's comments (RLS header suggests not).
- Whether the Electron desktop shows the same comment UI (it shows the hosted web app per AGENTS.md; not run).
- The label text of the per-thread 'ask assistant' button was not read.
