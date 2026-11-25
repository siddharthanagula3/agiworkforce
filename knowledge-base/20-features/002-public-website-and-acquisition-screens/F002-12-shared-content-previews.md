---
id: "F002-12"
type: "feature"
title: "Shared content previews"
aliases: ["Shared conversation page", "/share/<token>", "Shared session", "Read-only shared session", "Open in AGI", "Shared conversation unavailable", "S2.40"]
area: "2 Public website and acquisition screens"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S2.40"]
depends_on: ["surface:web", "table:shared_sessions", "table:organization_shared_sessions", "api:POST /api/share", "api:GET /api/share/[token]", "file:apps/web/lib/services/org-shared-session-service.ts", "SYS-sync-and-continuity", "SYS-files-artifacts-and-storage", "SYS-authorization-and-workspaces", "SYS-authentication-and-identity", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "F002-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F002-12 Shared content previews

A public page at /share/<token> shows a conversation that its owner shared. A logged-out visitor sees the title, model label, messages and expiry in read-only form with links to create an account or open it in AGI. Invalid, expired or revoked tokens show the same not-found page. Only chat sessions were found; artifact sharing was not.

Area: [2. Public website and acquisition screens](README.md). Requirement items: [S2.40](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s240).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Serves a read-only copy of a shared chat to anyone holding the link when the share is public, and to signed-in workspace members when it is workspace-only (apps/web/app/share/[token]/page.tsx:28-50, 100-122).

**Why it exists.** Lets people show a conversation to others without an account, and brings viewers into the product.

**Who uses it.** The person who shared and any recipient, signed in or not.

**Problems it solves**

- Recipient has no account
- Link may expire or be revoked and must then stop working
- Workspace-only shares must not leak to link holders

**Use cases**

- A recipient opens a link from a chat and reads it.
- A workspace member opens an organisation-only share while signed in.
- A recipient presses Open in AGI to continue the chat.
- A reader reports a shared page with the report link (page.tsx:120).

## 2. User experience

**Where to find it**

- Web: /share/<token>; created from the share dialog in chat (apps/web/features/chat/components/share/ShareConversationDialog.tsx) through POST /api/share.
- Mobile: shared links list and share preview screens exist in tests (apps/mobile/__tests__/SharedLinksScreen.test.tsx); not opened, and not this web page.
- Desktop, CLI, VS Code, Chrome: none found.

**Before you start**

- A valid 24-character token for a live share; no account for public shares; sign-in for workspace shares (page.tsx:28-50; org-shared-session-service.ts:25).

**Screens and controls**

- Banner 'Read-only shared session.' with 'Create an account' and 'sign in' links when signed out (SharedSessionViewer.tsx:55-72).
- Header: title, model label, 'Shared by <name>' for workspace shares, message count, 'Expires <time>', button 'Open in AGI' (SharedSessionViewer.tsx:80-104).
- Message list with expandable tool calls.
- Report content link under the page (page.tsx:120).
- Not-found view: 'Shared conversation unavailable' with an 'Open chat' link (ExpiredShareBanner.tsx).

**Journey**

1. Open the link.
2. Read the conversation.
3. Optionally press Open in AGI; signed-out visitors go to sign-up first and return to /chat/from-share/<token> (SharedSessionViewer.tsx:49, 97-103).
4. If the link is wrong, expired or revoked, see the not-found page and ask the sender for a new link.

**What the person sees and gets**

- Page title '<title> - AGI' for live public shares, otherwise 'Shared Session - AGI'; search engines are told not to index (page.tsx:80-98).
- Not-found text 'This link may have expired, been revoked, or been entered incorrectly. Ask the sender for a new link.' (ExpiredShareBanner.tsx:14-17).

**Settings**

- Owner side: share visibility (public or organisation) and expiry; default expiry 7 days (apps/web/app/api/share/route.ts:53).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Token must match 24 URL-safe characters or the page returns not found (apps/web/lib/services/org-shared-session-service.ts:25; page.tsx:100-104).
- Public read first: a row with visibility 'public' whose owner may still run unattended work (org-shared-session-service.ts:255-270); then a signed-in cookie user gets the workspace read with RLS and admission checks (page.tsx:28-50; service :279-300).
- Expired shares are not shown: isLive compares expiry with now and an expired share gives not found (page.tsx:78-80, 105).
- System messages are removed from what viewers see (page.tsx:67-70).
- Metadata hides the title of expired shares and disallows indexing (page.tsx:80-98; test 'keeps an expired conversation's title out of the page title').
- Public read does not read request headers or run admission (test 'does not run authenticated admission or read request headers for a public share').

**Incomplete**

- Only chat sessions are served at /share/<token>. Published artifacts have their own API folders (apps/web/app/api/artifacts/publish, .../live); how an artifact link is shown to a logged-out visitor was not opened.
- The page shows messages but whether attachments or artifacts inside messages render for viewers was not opened.

**Present but disconnected or switched off**

- Sharing can be refused by workspace policy before the link exists (apps/web/app/api/share/route.ts imports buildExternalSharingGateResponse and the temporary-chat refusal).

**Not available**

- Mobile and other apps do not render /share/<token> natively; they would open the web page (not verified).

## 4. Required behaviour

**Established requirements**

- A logged-out visitor opening a public share link sees the shared content. (source: brief S2.40)
- Token must match the expected format or the page returns not found. (source: brief draft; apps/web/app/share/[token]/page.tsx:100-104)
- Public share storage is read first; a signed-in reader uses the org-readable lookup; expired shares are not shown. (source: apps/web/app/share/[token]/page.tsx:28-50, 78-80)
- A workspace-only share never serves anonymously, even to someone holding its link. (source: apps/web/lib/services/org-shared-session-service.ts:249-254)

**Acceptance criteria**

1. A public live share opens with no account and shows its messages.
2. A malformed token, unknown token, expired share and revoked share all show the same not-found page (HTTP 404).
3. A workspace-only share is not visible to a signed-out visitor.
4. A workspace-only share is visible to an admitted member and shows 'Shared by'.
5. No system message is shown.
6. The page is not indexed and an expired share's title is not in the page title.
7. Open in AGI sends a signed-out visitor to sign-up and back.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Owner suspension should hide public shares: the public query joins an owner-standing check (org-shared-session-service.ts:265) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] State on the page whether artifacts in a chat are visible.
- [proposed] Add a notice when the viewer's own workspace blocks external content, if that exists.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | SharedSessionPage | `apps/web/app/share/[token]/page.tsx` | Server page: token check, reads, expiry, metadata. |
| component | SharedSessionViewer | `apps/web/features/chat/components/share/SharedSessionViewer.tsx` | Read-only view and CTAs. |
| component | ExpiredShareBanner | `apps/web/features/chat/components/share/ExpiredShareBanner.tsx` | Not-found message. |
| screen | Share not-found route | `apps/web/app/share/[token]/not-found.tsx` | Renders the banner. |
| service | org-shared-session-service | `apps/web/lib/services/org-shared-session-service.ts` | Token pattern, public read, workspace read, visibility updates. |
| endpoint | POST /api/share and list | `apps/web/app/api/share/route.ts` | Creates shares (default 7 days), lists and revokes. |
| endpoint | GET, DELETE, PATCH /api/share/[token] | `apps/web/app/api/share/[token]/route.ts` | Read, revoke, change audience. |
| table | shared_sessions | `apps/web/db/neon/0051_shared_sessions.sql` | Stores the shared snapshot, token, visibility, expiry. |
| table | organization_shared_sessions | `apps/web/db/neon/0186_organization_shared_sessions.sql` | Workspace grants for organisation shares. |
| service | shared-conversation-snapshot | `apps/web/features/chat/lib/shared-conversation-snapshot.ts` | withoutSystemMessages helper (imported at page.tsx:8). |
| component | ReportContentLink | `apps/web/app/copyright/report/ReportContentLink.tsx` | Report link shown under shared content. |
| test | Share page test | `apps/web/app/share/[token]/page.test.tsx` | Expired, revoked, public and org paths. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server checks the token pattern. | our servers | apps/web/app/share/[token]/page.tsx:100-104 |
| Server queries shared_sessions for a public, unexpired-by-owner-standing row. | our servers | apps/web/lib/services/org-shared-session-service.ts:255-270 |
| If none and a user cookie exists, server reads the row under that user's database scope and checks workspace admission. | our servers | apps/web/app/share/[token]/page.tsx:36-50; service :279-300 |
| Server rejects expired rows, strips system messages and renders the viewer. | our servers | page.tsx:67-80, 105-122 |
| Browser shows read-only content; Open in AGI is a link to /chat/from-share/<token>. | device | SharedSessionViewer.tsx:49, 97-103 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Shared snapshot: title, model id, provider, messages, expiry, visibility | table shared_sessions | server only | Expires per the stored expiry (default 7 days at creation); deletion sweeps not opened |
| Viewer identity | not stored by the page | no | not handled in the code on this page |

**Models and providers.** No model runs. The page shows the model label saved with the share (SharedSessionViewer.tsx:84-86); the provider field is read but not displayed in the lines opened.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None for public shares; signed-in cookie session for workspace shares. |
| Permissions | Knowledge of the token is the read grant for public shares; workspace shares need membership and pass admission (org-shared-session-service.ts:249-300). |
| Subscription | No entitlement to view. Creating a share may be gated by workspace policy and temporary-chat rules (api/share/route.ts imports). |
| Limits and metering | Creation: up to 2000 messages and about 1,000,000 serialised characters (api/share/route.ts:56-62). No viewing limit found. |
| Feature flags | none found in the code for viewing. |
| Model compatibility | none found in the code; the model label is whatever was saved. |
| Provider restrictions | none found in the code |
| Local mode | Not applicable to viewing; a Local-mode chat is not shared by this page unless sent to Cloud first [inferred; trust-boundary rules in doc: AGENTS.md section 6]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Bad token | not found, no database read. | page.tsx:100-104 |
| Expired or revoked | not found page 'Shared conversation unavailable'. | page.tsx:105-107; ExpiredShareBanner.tsx |
| Database error on public read | Error swallowed as no result, then tried as workspace read. | page.tsx:31 |
| Identity provider unreachable | Viewer treated as signed out. | page.tsx:53-59 |
| Workspace share, signed out | not found. | page.tsx:36-41 |
| Empty messages | Array check yields an empty list; page still renders. | page.tsx:61-70 |
| Accessibility | Main landmark and labelled controls; a not-found test exists. | apps/web/app/share/[token]/not-found.test.tsx |
| Retry or offline | not handled in the code on this page. | apps/web/app/share/[token]/page.tsx (server page; no retry or offline code found) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/share/[token]/page.test.tsx`: Expired and revoked give not found, title hidden for expired, live title kept, system messages removed, no admission for public shares, admission before org read, no org content when admission fails.
- `apps/web/app/share/[token]/not-found.test.tsx`: Not-found view.
- `apps/web/features/chat/components/share/SharedSessionViewer.test.tsx`: Viewer component; contents not opened.
- `apps/web/app/api/share/[token]/route.visibility.test.ts`: Share audience changes; contents not opened.
- `apps/web/__tests__/single-conversation-share-backend.test.ts`: Share backend; contents not opened.

**Test scenarios**

- **Public share, logged out**
  1. Create a public share, copy the link, open it in a private window.
  - Expected: Messages shown read-only with the Create an account and sign in banner.
- **Expired**
  1. Set expiry in the past in a test database, open the link.
  - Expected: HTTP 404 with 'Shared conversation unavailable'.
- **Workspace-only**
  1. Change the share to workspace only; open it signed out, then as a member.
  - Expected: Signed out: not found. Member: content with 'Shared by'.
- **Bad token**
  1. Open /share/short.
  - Expected: Not found with no database query.
- **Open in AGI**
  1. Open as signed out and press Open in AGI.
  - Expected: Sign-up page that returns to /chat/from-share/<token>.

**Where to look when it fails**

- Table shared_sessions (token, visibility, expires_at).
- Audit and log lines from /api/share on creation; page swallows read errors as not found (page.tsx:31, 43).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/002-public-website-and-acquisition-screens.md](../../70-qa/test-plans/web/002-public-website-and-acquisition-screens.md)

## 10. Gaps and dependencies

- **The brief and draft say chat 'or artifact' links; the page serves chat sessions only, and artifact sharing is not shown by this route.** Affects: Recipients of artifact links (web). Evidence: apps/web/app/share/[token]/page.tsx:28-50 reads shared_sessions only; apps/web/app/api/artifacts/publish exists. Work needed: Trace the artifact public link path and document or connect it.
- **All failures (bad token, expired, revoked, workspace-only, database error) look the same to the visitor.** Affects: Recipients. Evidence: page.tsx:31, 43, 100-107. Work needed: Decide if a database error should differ from not found.
- **Brief cites page.tsx:32 and 91; current lines are 28-50 and 100-122.** Affects: Brief readers. Evidence: apps/web/app/share/[token]/page.tsx. Work needed: Refresh references.
- **No native mobile or desktop rendering of shared pages found.** Affects: Phone and desktop recipients. Evidence: none found in the code. Work needed: Decide scope.

**Depends on**

- surface:web
- table:shared_sessions
- table:organization_shared_sessions
- api:POST /api/share
- api:GET /api/share/[token]
- file:apps/web/lib/services/org-shared-session-service.ts
- SYS-sync-and-continuity
- SYS-files-artifacts-and-storage
- SYS-authorization-and-workspaces
- SYS-authentication-and-identity
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- F002-11

## Unknown

- How a published artifact is shown to a logged-out visitor.
- Whether shares are physically deleted after expiry.
- Whether attachments in a shared message render for viewers.
- How the mobile app opens a shared link.
