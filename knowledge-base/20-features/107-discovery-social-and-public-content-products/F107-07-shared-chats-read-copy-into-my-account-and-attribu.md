---
id: "F107-07"
type: "feature"
title: "Shared chats: read, copy into my account, and attribution"
aliases: ["Shared session page", "Read-only shared session", "Open in AGI", "Continue a shared chat", "Fork from share", "Remix a shared conversation", "Continue in a new chat (mobile)", "/share/[token]", "/chat/from-share/[token]"]
area: "107 Discovery, social, and public-content products"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S107.11", "S107.13"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "table:shared_sessions", "table:organization_shared_sessions", "api:GET /api/share/[token]", "api:POST /api/chat/conversations", "api:POST /api/chat/conversations/[id]/messages/bulk", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F107-07 Shared chats: read, copy into my account, and attribution

A person can open a shared-chat link and read the chat without an account. Signed-in people can press Open in AGI to copy the chat into a new conversation in their own workspace and keep working. The page shows title, model, message count, expiry and, for workspace shares, who shared it.

Area: [107. Discovery, social, and public-content products](README.md). Requirement items: [S107.11](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10711), [S107.13](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10713).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Serves a read-only snapshot of a chat at /share/[token] and offers a copy-into-my-account step at /chat/from-share/[token] on web. On mobile, a separate 'Continue in a new chat' action in the Shared with you screen does a similar copy (title and text only) (apps/web/app/share/[token]/page.tsx:96-123; apps/web/app/chat/from-share/[token]/ContinueSharedSession.tsx:99-165; apps/mobile/src/features/projects/components/SharedWithYouScreen.tsx:193-225).

**Why it exists.** Brief item S107.11 says a viewer should be able to copy a public shared conversation into their own account and keep working on it, and S107.13 says shared content shows who made it and where it came from (doc: knowledge-base/data/area-briefs/107-discovery-social-and-public-content-products.md).

**Who uses it.** Anyone holding a share link (readers, signed-out or signed-in); signed-in users who want to continue the chat; workspace members who receive a workspace-only share.

**Problems it solves**

- A chat can be shown to someone without an account.
- A reader can turn a read-only snapshot into their own editable chat.
- A workspace-only share is not readable by anyone holding the link outside the workspace (apps/web/lib/services/org-shared-session-service.ts:196-247).

**Use cases**

- A colleague sends a link; the reader skims it signed out, then signs up and continues it.
- A signed-in user opens a shared chat and presses Open in AGI to get their own copy.
- A workspace member opens a workspace-only share and sees 'Shared by <name>'.
- On a phone, a user opens Shared with you, picks a chat and chooses Continue in a new chat.

## 2. User experience

**Where to find it**

- Web: open /share/<24-character token>; header button 'Open in AGI' (apps/web/features/chat/components/share/SharedSessionViewer.tsx:93-99).
- Web: /chat/from-share/<token> is the copy step (apps/web/app/chat/from-share/[token]/page.tsx:1-12).
- Desktop (Electron): shows the hosted web app, so the same pages apply [inferred from AGENTS.md section 5: the public Desktop shows the hosted web app; desktop code was not opened for a share viewer] (doc: AGENTS.md).
- Mobile: Shared with you screen, chat row, choose 'Continue in a new chat' (apps/mobile/src/features/projects/components/SharedWithYouScreen.tsx:258-264). Mobile has no screen for opening a /share link by token that I found (unknown).

**Before you start**

- Viewing a public share needs no account (apps/web/app/share/[token]/page.tsx:32-34, 101-123).
- Copying on web needs a signed-in session; a signed-out viewer's Open in AGI link goes to webEntryHref, which is an account entry route (SharedSessionViewer.tsx:93-96).
- Workspace-only shares need a signed-in member holding the grant (org-shared-session-service.ts:196-247).

**Screens and controls**

- Top banner 'Read-only shared session.' with 'Create an account' and 'sign in' links when signed out (SharedSessionViewer.tsx:62-83).
- Header: title, model badge, 'Shared by <name>' (only when known), '<n> messages', 'Expires <relative time>' (SharedSessionViewer.tsx:86-108).
- Message list; tool calls appear as expandable details; attachments appear as '<name>, [attachment omitted from shared snapshot]' (SharedSessionViewer.tsx:128-142).
- Footer link 'Report infringement or impersonation' (apps/web/app/copyright/report/ReportContentLink.tsx:15-20).
- Copy step: spinner text 'Setting up your conversation…', then Try again / Start a new chat links on failure (ContinueSharedSession.tsx:153-203).

**Journey**

1. Open /share/<token>.
2. Read the chat.
3. Press 'Open in AGI'. Signed in goes to /chat/from-share/<token>; signed out goes to account entry first.
4. The copy step reads the workspace, fetches /api/share/<token>, creates a conversation, copies messages in batches and opens /chat/<new id> (ContinueSharedSession.tsx:104-143).
5. Keep chatting in the new conversation.

**What the person sees and gets**

- Not-found page 'Shared conversation unavailable' for invalid, revoked, expired or workspace-denied links (ExpiredShareBanner.tsx:4-24; apps/web/app/share/[token]/page.tsx:112-114).
- Copy step shows 'This shared conversation has expired.' on a 410 response (ContinueSharedSession.tsx:107-110, 157-160).
- Copy step shows 'This shared conversation has no messages to continue from.' when empty (ContinueSharedSession.tsx:153-160).
- Failure text tells whether the half copy was removed or may remain (ContinueSharedSession.tsx:144-155).

**Settings**

- Share expiry is set when the share is created; default 7 days (apps/web/app/api/share/route.ts:50-51).
- Owner can switch a share between public and workspace-only (PATCH) or revoke it (DELETE) (apps/web/app/api/share/[token]/route.ts:187-262).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web read-only viewer with title, model badge, sharer name for workspace shares, count and expiry (SharedSessionViewer.tsx:86-108; apps/web/app/share/[token]/page.tsx:51-72).
- Public rows read first; workspace-only rows read through the row-security path and gated by an admission check (page.tsx:30-49; org-shared-session-service.ts:223-247).
- Invalid token or missing or expired share returns the not-found page (page.tsx:101-114).
- GET /api/share/[token] returns 410 with code SHARE_EXPIRED when expired (apps/web/app/api/share/[token]/route.ts:67-80).
- Copy step: creates conversation with title and model, retries without the model if refused, batches of 200, 100,000-character message cap, deletes the new conversation if a batch fails and reports a possible partial copy if the delete fails (ContinueSharedSession.tsx:20-22, 120-165).
- Attachments are shown as omitted placeholders and carried into the copy as metadata 'sharedAttachments', not as files (ContinueSharedSession.tsx:34-44; SharedSessionViewer.tsx:128-142).
- System messages are stripped from the shared view and copy (page.tsx:61-65; shared-conversation-snapshot import in route.ts:33).
- Mobile: 'Continue in a new chat' fetches /api/share/<token>, creates a conversation, copies in batches of 200 with a 100,000-character cap, deletes it on failure (apps/mobile/src/features/shared-links/continueSharedChat.ts:3-70; SharedWithYouScreen.tsx:193-225).

**Incomplete**

- Public share page never shows an 'expired notice' of its own; an expired share is a not-found page. Only the copy step shows the expired message (page.tsx:112-114; ContinueSharedSession.tsx:157-160).
- Public shares show no 'Shared by' name: sharedBy is set only for organization-visibility shares (page.tsx:44-48).
- 'Where it came from' is limited to sharer name and model; no source-chat or version lineage field is shown (SharedSessionViewer.tsx:86-108) [inferred from absence].
- Copied conversation keeps no link back to the share beyond attachment and artifact derivation metadata (ContinueSharedSession.tsx:34-44) [inferred].
- Mobile copy carries title and text only: no model, attachments or artifacts (continueSharedChat.ts:28-45, 58-70).
- CLI: lists and revokes shares only; no view or copy command found (apps/cli/src/cloud/shares.rs:31-48). Attribution on CLI is unverified.

**Present but disconnected or switched off**

- The brief marks mobile remix 'missing', but the code has a working 'Continue in a new chat' action in Shared with you; the brief is out of date on this (brief S107.11; SharedWithYouScreen.tsx:258-264).

**Not available**

- VS Code extension and Chrome extension: not applicable per the brief.
- Mobile has no read-only viewer for a public /share/<token> page of its own; it opens the URL in an in-app browser (SharedWithYouScreen.tsx:258-259) [openUntrustedUrlInAppBrowser].
- Desktop: no separate share-viewer code found by search of apps/desktop (unknown whether the hosted pages run unchanged).

## 4. Required behaviour

**Established requirements**

- From a public shared conversation a viewer copies it into their own account and keeps working on it. (source: brief S107.11)
- Public and third-party content shows who made it and where it came from (publisher, author, source, versions, copied from). (source: brief S107.13)
- Invalid token, missing or non-public share returns not-found; expired share is refused at the copy step with 410; copy retries without the model; batches of 200; messages over 100,000 characters refused; partial copy is deleted and the user told if the delete fails. (source: task feature draft, checked against code (ContinueSharedSession.tsx:20-22, 120-165))
- Share content is not indexed by search engines. (source: apps/web/app/share/[token]/page.tsx:86-90 (robots index false))

**Acceptance criteria**

1. A valid public token shows the title, model badge, message count and expiry without signing in.
2. A token that is malformed, revoked or expired shows 'Shared conversation unavailable' (HTTP not-found).
3. A signed-out viewer sees 'Create an account' and 'sign in' links; a signed-in viewer sees neither.
4. Pressing Open in AGI signed in creates one new conversation with the same title containing every non-system message, then opens it.
5. If a message batch fails, the new conversation is removed and the page says no conversation was kept; if removal fails, it warns of a partial copy.
6. A workspace-only share is unreadable by a signed-out holder of the link and shows 'Shared by <name>' to a member.
7. Attachments appear only as omitted placeholders.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Over-length messages are truncated or filtered rather than refused outright: readSnapshotMessages is called with a 100,000 cap, but its behaviour was not opened, so 'refused' in the draft is unverified [inferred].
- Mobile and CLI should reach the same copy behaviour as web (AGENTS.md section 5 parity expectation) [inferred].

**Proposed improvements** (suggestions, not requirements)

- Show 'Shared by' on public shares if the owner agrees to show a name [proposed].
- Show an expired message on /share/<token> instead of generic not-found [proposed].
- Carry model and artifacts in the mobile copy [proposed].

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | SharedSessionPage | `apps/web/app/share/[token]/page.tsx` | Server page: validates token, reads public or workspace share, hides system messages, renders viewer and report link. |
| component | SharedSessionViewer | `apps/web/features/chat/components/share/SharedSessionViewer.tsx` | Read-only transcript, banner, header, Open in AGI button. |
| component | ExpiredShareBanner / not-found | `apps/web/features/chat/components/share/ExpiredShareBanner.tsx` | Unavailable-link notice used by apps/web/app/share/[token]/not-found.tsx. |
| screen | ContinueSharedSessionPage | `apps/web/app/chat/from-share/[token]/page.tsx` | Route for the copy step, not indexed. |
| component | ContinueSharedSession | `apps/web/app/chat/from-share/[token]/ContinueSharedSession.tsx` | Client copy logic: workspace lookup, create, batch copy, cleanup, retry. |
| service | org-shared-session-service | `apps/web/lib/services/org-shared-session-service.ts` | Token pattern, public read, row-security read, sharer name, audience change. |
| endpoint | GET/DELETE/PATCH /api/share/[token] | `apps/web/app/api/share/[token]/route.ts` | Read (410 when expired), revoke by owner, switch audience. |
| endpoint | POST/GET /api/share | `apps/web/app/api/share/route.ts` | Create and list shares; 7-day default expiry; message and size caps. |
| service | shared-conversation-snapshot | `apps/web/features/chat/lib/shared-conversation-snapshot.ts` | Reads snapshot messages, attachments, artifacts; removes system messages. |
| table | shared_sessions | `apps/web/db/neon/0051_shared_sessions.sql` | Stores the snapshot, token, owner, visibility and expiry. |
| table | organization_shared_sessions | `apps/web/db/neon/0186_organization_shared_sessions.sql` | Grant rows for workspace-only shares. |
| component | ReportContentLink | `apps/web/app/copyright/report/ReportContentLink.tsx` | Footer link to the rights notice form. |
| service | continueSharedChat | `apps/mobile/src/features/shared-links/continueSharedChat.ts` | Mobile fetch and batch copy of a shared chat. |
| screen | SharedWithYouScreen | `apps/mobile/src/features/projects/components/SharedWithYouScreen.tsx` | Mobile list with Open and Continue in a new chat. |
| service | shares.rs | `apps/cli/src/cloud/shares.rs` | CLI list and revoke of share links only. |
| test | fork-from-share.test.tsx | `apps/web/app/chat/from-share/[token]/__tests__/fork-from-share.test.tsx` | Copy-step behaviour tests. |
| test | share page test | `apps/web/app/share/[token]/page.test.tsx` | Not-found, title and admission tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser requests /share/<token>; server checks the 24-character token pattern. | our servers | apps/web/app/share/[token]/page.tsx:101-105 |
| Server reads the public row; if none, reads through the caller's row-security connection and runs the workspace admission check. | our servers | page.tsx:30-49; org-shared-session-service.ts:196-247 |
| Server drops system messages, hides the page if expired, renders the viewer. | our servers | page.tsx:61-65, 112-123 |
| Viewer presses Open in AGI; browser loads /chat/from-share/<token> and fetches the workspace list, then /api/share/<token>. | device and our servers | ContinueSharedSession.tsx:104-110 |
| Browser creates a conversation, posts message batches to /api/chat/conversations/<id>/messages/bulk, stores artifacts in the local artifacts store and navigates. | device and our servers | ContinueSharedSession.tsx:120-143, 46-65 |
| On failure the browser sends DELETE for the new conversation. | device and our servers | ContinueSharedSession.tsx:72-83, 144-155 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Shared snapshot (title, messages, model, provider, expiry) | table shared_sessions in our database | Server only; read by link | Deleted on revoke (DELETE) or operator takedown; expires by date (apps/web/app/api/share/[token]/route.ts:150-157; apps/web/app/api/admin/takedown/route.ts:100-118). Cleanup of expired rows: unknown. |
| New conversation and messages | the viewer's own conversation tables via the chat API (workspace chosen by header) | Yes, as any cloud conversation | Normal conversation retention; failed copies are deleted by the client |
| Mobile hidden-sharer list (related) | device store store:mmkv key shared-with-you:hidden-sharers:v1:<account> | No | Until the user unhides |

**Models and providers.** No model is called when viewing or copying. The stored model identifier is only displayed and reused as the new conversation's model; if rejected, the copy retries with no model (ContinueSharedSession.tsx:127-131). The snapshot's provider is returned but not shown (route.ts:84-95).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Reading a public share: none. Copying on web: a signed-in session. Workspace-only share: signed-in workspace member (SharedSessionViewer.tsx:93-96; org-shared-session-service.ts:223-247). |
| Permissions | Anyone holding a public token can read. Owner alone can revoke or change audience; sharing into a workspace needs the content.share permission (apps/web/app/api/share/[token]/route.ts:216-224). |
| Subscription | No plan check on viewing or copying found in the pages read. Creating an external share goes through buildExternalSharingGateResponse (apps/web/app/api/share/route.ts:23, apps/web/app/api/share/[token]/route.ts:225-231); its plan rules were not opened (unknown). |
| Limits and metering | Viewing is limited to 60 per minute per the share-view rate limit (apps/web/lib/rate-limit.ts:434-436). Create caps: 2,000 messages and 1,000,000 serialized characters (apps/web/app/api/share/route.ts:56-61). Usage metering for the copy: none found in the code. |
| Feature flags | none found in the code |
| Model compatibility | Any stored model identifier is accepted for display; the copy drops it if the conversation API refuses it. |
| Provider restrictions | none found in the code |
| Local mode | Web copy is a cloud action (calls /api/chat/conversations). Mobile Local mode: the mobile api client is subject to the egress guard; whether /api/share is allowed in Local mode was not checked (unknown). Share creation and viewing are our-server actions, so there is no local-only path. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Copy step shows a status spinner 'Setting up your conversation…' with aria-busy. | ContinueSharedSession.tsx:196-203 |
| Expired | /share page: not-found. Copy step: expired message and Start a new chat link. | page.tsx:112-114; ContinueSharedSession.tsx:157-160 |
| Invalid or missing | Not-found page; copy step shows 'This share link is invalid.' or 'could not be found.' | ContinueSharedSession.tsx:98-101, 111-114 |
| Empty | Copy step refuses with 'no messages to continue from'. | ContinueSharedSession.tsx:123-126, 157-160 |
| Error and retry | Alert with Try again; cleanup message depends on delete result. | ContinueSharedSession.tsx:162-189 |
| Offline or timeout | A network failure lands in the generic error branch; no dedicated offline or timeout handling. | ContinueSharedSession.tsx:144-155 (not handled separately) |
| Cancel | not handled in the code (no cancel for an in-flight copy) | ContinueSharedSession.tsx |
| Accessibility | Viewer has a main landmark and skip-link target; error state uses role alert. | SharedSessionViewer.tsx:55; ContinueSharedSession.tsx:174 |
| Mobile partial copy | Alert says a partial copy is still in chats if delete failed. | SharedWithYouScreen.tsx:207-224 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/chat/from-share/[token]/__tests__/fork-from-share.test.tsx`: Copy step: copy all messages, system messages excluded, empty share, expired, not found, partial copy cleanup and warning, workspace header, failure text.
- `apps/web/app/share/[token]/page.test.tsx`: Expired and revoked links answer not-found, title leak, system messages, admission order.
- `apps/web/features/chat/components/share/SharedSessionViewer.test.tsx`: Main landmark, attachment placeholder, model badge, sign-up links for signed-out, Open in AGI for signed-in.
- `apps/web/app/api/share/[token]/route.test.ts`: Share read, revoke and expiry route (file exists; contents not opened).
- `apps/web/app/api/share/[token]/route.visibility.test.ts`: Audience change route (file exists; contents not opened).
- `apps/mobile/src/features/shared-links/__tests__/continueSharedChat.test.ts`: Mobile fetch and copy of a shared chat (file exists; contents not opened).
- `apps/web/__tests__/single-conversation-share-backend.test.ts`: Share backend (file exists; contents not opened).

**Test scenarios**

- **Signed-out read**
  1. Create a share on web.
  2. Open its /share link in a private window.
  - Expected: Chat shows read-only with banner, 'Create an account' and 'sign in' links, expiry text.
- **Signed-in copy**
  1. Open the link signed in.
  2. Press Open in AGI.
  - Expected: A new conversation with the same title and messages opens; the original share is unchanged.
- **Expired share**
  1. Set a share's expiry in the past in a test database.
  2. Open /share and /chat/from-share.
  - Expected: /share shows unavailable page; copy step shows 'has expired'.
- **Failure mid-copy**
  1. Make the bulk endpoint fail on the second batch with a chat of over 200 messages.
  - Expected: New conversation is deleted and the page says none was kept; Try again restarts.
- **Workspace-only share**
  1. Switch a share to workspace.
  2. Open as member, then signed out.
  - Expected: Member sees 'Shared by <name>'; signed-out gets unavailable page.
- **Mobile continue**
  1. Open Shared with you, choose a shared chat, choose Continue in a new chat.
  - Expected: New chat opens with the text copied.

**Where to look when it fails**

- Look for 410 SHARE_EXPIRED responses and 'Failed to revoke shared session' log (apps/web/app/api/share/[token]/route.ts:76, 128).
- Tables shared_sessions and organization_shared_sessions.
- Audit events share_link_revoked, organization_share_granted, organization_share_revoked.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/107-discovery-social-and-public-content-products.md](../../70-qa/test-plans/web/107-discovery-social-and-public-content-products.md)
- Desktop: [70-qa/test-plans/desktop/107-discovery-social-and-public-content-products.md](../../70-qa/test-plans/desktop/107-discovery-social-and-public-content-products.md)
- Mobile: [70-qa/test-plans/mobile/107-discovery-social-and-public-content-products.md](../../70-qa/test-plans/mobile/107-discovery-social-and-public-content-products.md)
- CLI: [70-qa/test-plans/cli/107-discovery-social-and-public-content-products.md](../../70-qa/test-plans/cli/107-discovery-social-and-public-content-products.md)

## 10. Gaps and dependencies

- **Brief says mobile remix is missing; code has Continue in a new chat but only text and title.** Affects: Mobile users. Evidence: continueSharedChat.ts:28-45; brief S107.11. Work needed: Update brief; decide whether model, artifacts and attachments should be carried; add a viewer for /share links.
- **Public shares show no sharer name and no lineage.** Affects: Web and desktop viewers. Evidence: page.tsx:44-48. Work needed: Decide what attribution public shares should show and add it.
- **No expired notice on /share itself.** Affects: Web readers. Evidence: page.tsx:112-114. Work needed: Optional expired-specific page.
- **CLI has no way to view or copy a share.** Affects: CLI users. Evidence: apps/cli/src/cloud/shares.rs:31-48. Work needed: Add view and copy commands or mark not applicable.
- **No offline, cancel or timeout handling on web copy.** Affects: Web users on weak networks. Evidence: ContinueSharedSession.tsx. Work needed: Add cancel and timeout messages.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- table:shared_sessions
- table:organization_shared_sessions
- api:GET /api/share/[token]
- api:POST /api/chat/conversations
- api:POST /api/chat/conversations/[id]/messages/bulk
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-execution-boundaries

## Unknown

- Whether desktop runs the hosted /share and /chat/from-share pages unchanged (desktop code not opened for a share viewer).
- Whether mobile Local mode allows the /api/share request through the egress guard.
- What readSnapshotMessages does with an over-length message (refuses versus truncates).
- Plan rules inside the external-sharing gate.
- Whether expired share rows are cleaned up by a job.
- What CLI shows for share attribution.
