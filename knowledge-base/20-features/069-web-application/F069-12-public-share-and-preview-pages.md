---
id: "F069-12"
type: "feature"
title: "Public share and preview pages"
aliases: ["Public share and preview pages", "Shared session", "/share/<token>", "/shared-artifact/<token>", "Published artifact", "Report link", "S69.20"]
area: "69 Web application"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S69.20"]
depends_on: ["surface:web", "mode:cloud", "table:shared_sessions", "table:published_artifacts", "api:POST /api/share", "file:apps/web/app/share/[token]/page.tsx", "file:apps/web/app/shared-artifact/[token]/page.tsx", "SYS-authorization-and-workspaces", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F069-12 Public share and preview pages

A shared conversation opens at /share/<token> and a published artifact at /shared-artifact/<token>, with no sign-in for public links. Workspace-only and invite-only rows open for permitted signed-in viewers. Expired or revoked conversation links show not-found; artifacts show an 'unavailable' page. Both pages carry a report link.

Area: [69. Web application](README.md). Requirement items: [S69.20](../../10-requirements/capabilities/069-web-application.md#s6920).

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

**What it does.** Serves a read-only copy of a shared conversation or a published artifact from a token link, with a link-preview title, expiry text and a report link (apps/web/app/share/[token]/page.tsx:82-122; apps/web/app/shared-artifact/[token]/page.tsx:46-97).

**Why it exists.** Users share work with people who have no account (S69.20).

**Who uses it.** Recipients of a link, signed in or not; owners who share.

**Problems it solves**

- Sharing a chat or app without an account.
- Letting a workspace see a private share.
- Reporting abusive content.

**Use cases**

- Send a chat link to a colleague.
- Publish an artifact app and share the link.
- Report an impersonating page.

## 2. User experience

**Where to find it**

- Web: /share/<token> and /shared-artifact/<token>; links are created in the chat share dialog (apps/web/features/chat/components/share/ShareConversationDialog.tsx) through POST /api/share.
- Footer link 'Report infringement or impersonation' going to /copyright/report?url=... (apps/web/app/copyright/report/ReportContentLink.tsx).

**Before you start**

- A valid, live link. None for public links; sign-in and membership for workspace-only or invited ones.

**Screens and controls**

- Banner 'Read-only shared session.' with 'Create an account' and 'sign in' links for signed-out viewers (apps/web/features/chat/components/share/SharedSessionViewer.tsx:50-72).
- Header: title, sharer name, model badge, message count, 'Expires <relative time>', button 'Open in AGI' (SharedSessionViewer.tsx:76-103).
- Transcript with tool calls in expandable rows and attachment placeholders.
- Artifact view, invite page, or unavailable page.

**Journey**

1. Open the link.
2. The server reads a public row first; if none, tries a signed-in workspace or invite read.
3. A live row shows the page; otherwise not-found (conversation) or 'unavailable' / invite page (artifact).
4. Optionally press 'Open in AGI' to continue in the product.
5. Use the report link at the bottom.

**What the person sees and gets**

- Page title '<title> - AGI' and a description '<n> message conversation shared from AGI' for public live conversations; 'Shared Session - AGI' otherwise; noindex (apps/web/app/share/[token]/page.tsx:82-98).
- Artifact title '<title> - AGI' or 'Published artifact - AGI' (apps/web/app/shared-artifact/[token]/page.tsx:46-58).

**Settings**

- Sharing restrictions (organization policy) appear in the surface matrix (doc: docs/product/surface-feature-matrix.md:618-626).
- Link expiry chosen on creation; default 7 days (apps/web/app/api/share/route.ts:53,80-82).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Public conversation read, then signed-in workspace read with admission check; expired rows give not-found (apps/web/app/share/[token]/page.tsx:27-48,78-80,100-122).
- System messages are removed from the shared view (share/[token]/page.tsx:58-62).
- Artifact page: public read, then workspace read, then invited read; invite-only and unavailable pages (apps/web/app/shared-artifact/[token]/page.tsx:28-81).
- Both routes are public yet carry session identity for member reads (apps/web/proxy.ts:169-181).
- Public reads exclude owners whose account status refuses unattended work or who have an erasure tombstone (apps/web/lib/auth/account-lifecycle.ts:58-68; apps/web/lib/services/org-shared-session-service.ts:250-270; apps/web/lib/services/published-artifact-service.ts:824-841).

**Incomplete**

- Workspace-only conversation shares get the generic title 'Shared Session - AGI' because the metadata reads only public rows (share/[token]/page.tsx:88-97).
- Artifact expiry: the artifact page code shows no expiry check (shared-artifact/[token]/page.tsx:60-97); whether the service has one was not read.

**Present but disconnected or switched off**

- AI inside a published artifact is off unless env AGI_ARTIFACT_AI_ENABLED is on; otherwise the message 'AI in apps is not available yet.' applies (apps/web/lib/server/artifact-ai-switch.ts:5-8; apps/web/lib/artifact-ai.ts:1-3).

**Not available**

- Desktop, mobile and CLI do not render published apps; links open in the browser (doc: docs/product/surface-feature-matrix.md:404-410).

## 4. Required behaviour

**Established requirements**

- A shared conversation or published artifact opens at a public URL for signed-out visitors, with a link preview title, expiry handling and a report link. (source: S69.20 (brief))
- A workspace-only share must not serve to a link holder who is not admitted. (source: apps/web/lib/services/org-shared-session-service.ts:250-256)
- Revoked and malformed artifact links give the same honest 'unavailable' answer. (source: apps/web/app/shared-artifact/[token]/page.tsx:63-70)
- Share/export where allowed is a product requirement. (source: doc: docs/product/requirements.md:426)

**Acceptance criteria**

1. A public link opens signed out and shows messages without system messages.
2. An expired or revoked conversation link returns a 404 page.
3. A revoked or malformed artifact link shows 'unavailable' (not a 404).
4. An invite-only artifact shows the invite page.
5. A workspace share opens for a member and not for a stranger.
6. The page title is '<title> - AGI' for a live public share.
7. The report link points to /copyright/report with the page path.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Expiry of artifacts is not required; only revocation is read on the page.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give workspace shares a real title in link previews for admitted viewers (noindex stays).
- [proposed] Add a test that a suspended owner's link stops serving.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Share page | `apps/web/app/share/[token]/page.tsx` | Reads, filters and renders a shared conversation, metadata |
| screen | Share not-found | `apps/web/app/share/[token]/not-found.tsx` | Expired or missing link page |
| component | SharedSessionViewer | `apps/web/features/chat/components/share/SharedSessionViewer.tsx` | Banner, header, transcript, Open in AGI |
| component | ExpiredShareBanner | `apps/web/features/chat/components/share/ExpiredShareBanner.tsx` | Expired share notice |
| component | ShareConversationDialog | `apps/web/features/chat/components/share/ShareConversationDialog.tsx` | Creates the link |
| endpoint | POST /api/share | `apps/web/app/api/share/route.ts` | Creates shared_sessions rows, default 7 days |
| service | org-shared-session-service | `apps/web/lib/services/org-shared-session-service.ts` | Public and workspace reads, token regex |
| service | shared-conversation-snapshot | `apps/web/features/chat/lib/shared-conversation-snapshot.ts` | withoutSystemMessages |
| screen | Published artifact page | `apps/web/app/shared-artifact/[token]/page.tsx` | Reads and renders a published artifact |
| component | PublishedArtifactView | `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx` | Renders the artifact, runs sandboxed apps |
| component | InviteOnlyArtifact / UnavailableArtifact | `apps/web/app/shared-artifact/[token]/InviteOnlyArtifact.tsx` | Invite and unavailable pages |
| hook | usePublishedArtifactRuntime | `apps/web/app/shared-artifact/[token]/usePublishedArtifactRuntime.ts` | Artifact AI and connector consent |
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | Public read, invite-only check |
| service | org-shared-artifact-service | `apps/web/lib/services/org-shared-artifact-service.ts` | Workspace read |
| service | published-site-viewer-service | `apps/web/lib/services/published-site-viewer-service.ts` | Invited viewer read |
| component | ReportContentLink | `apps/web/app/copyright/report/ReportContentLink.tsx` | Report footer link |
| table | shared_sessions | `apps/web/lib/services/org-shared-session-service.ts` | Share rows (query lines 262-268) |
| table | published_artifacts | `apps/web/lib/services/published-artifact-service.ts` | Published rows (query lines 829-838) |
| config | proxy route lists | `apps/web/proxy.ts` | Keeps routes public but identity-aware (lines 169-181) |
| test | share page tests | `apps/web/app/share/[token]/page.test.tsx` | Expiry, snapshots, admission |
| test | shared-artifact page tests | `apps/web/app/shared-artifact/[token]/page.test.tsx` | Admission paths |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Visitor opens the link; token shape is checked first. | our servers | share/[token]/page.tsx:103-105; shared-artifact/[token]/page.tsx:68-70 |
| Server reads the public row with the schema-owner connection. | our servers | share/[token]/page.tsx:31; org-shared-session-service.ts:262-270 |
| If none, it builds a request from incoming headers and tries the signed-in, row-level-security read plus admission check. | our servers | share/[token]/page.tsx:34-47 |
| Live row is turned into a viewer session without system messages and rendered; expired rows give not-found. | our servers | share/[token]/page.tsx:58-80,107-122 |
| For artifacts, the viewer renders the content; optional AI or connector calls happen only after consent and only if the AI switch is on. | device and our servers | PublishedArtifactView.tsx:64-69; usePublishedArtifactRuntime.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Shared conversation snapshot (messages, title, model id, provider, expiry) | table shared_sessions | Server only | Expires per expires_at; revocation updates the row (apps/web/app/api/share/route.ts:695) |
| Published artifact content | table published_artifacts | Server only | Until unpublished; erased owners are excluded |
| Report requests | /copyright/report flow (not traced) | Server | unknown |

**Models and providers.** The viewer shows the model badge from the snapshot (model_id and provider) via a shared label helper (SharedSessionViewer.tsx:4-5). No model is called to view a share. A published artifact can call AI only when the artifact AI switch is on and the viewer consents (usePublishedArtifactRuntime.ts).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Public link needs none. Workspace share needs a signed-in member; invited artifact needs an invited signed-in viewer. |
| Permissions | Token knowledge is the read grant for public rows only (org-shared-session-service.ts:250-256); workspace rows need admission (lines 283-300). |
| Subscription | none found in the code for viewing. Sharing restrictions come from organization policy (doc: docs/product/surface-feature-matrix.md:618-626). |
| Limits and metering | Default expiry 7 days (apps/web/app/api/share/route.ts:53). Viewer limits: none found in the code. |
| Feature flags | AGI_ARTIFACT_AI_ENABLED for AI in artifacts (apps/web/lib/server/artifact-ai-switch.ts:5-8). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Shares are made from server-saved conversations and served by our server, so they do not exist for Local-only chats [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Malformed token | Conversation: not-found; artifact: unavailable page | share/[token]/page.tsx:103-105; shared-artifact/[token]/page.tsx:68-70 |
| Expired conversation | Not-found; title not leaked | share/[token]/page.tsx:78-80,88-89,109-111 |
| Revoked artifact | Unavailable page | shared-artifact/[token]/page.tsx:74-80 |
| Invite-only artifact | Invite page with signed-in flag | shared-artifact/[token]/page.tsx:75-77 |
| Database or admission failure | Reads are caught and treated as no row | share/[token]/page.tsx:31,37,39-41 |
| Attachments in a snapshot | Placeholder shown (a test covers it) | SharedSessionViewer.test.tsx:56 |
| Signed in vs out | Banner links and 'Open in AGI' target change | SharedSessionViewer.tsx:50-103 |
| Accessibility | One main landmark for the skip link (a test covers it) | SharedSessionViewer.test.tsx:18 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/share/[token]/page.test.tsx`: Expired and revoked links give 404, title not leaked, live title, system messages removed, cookie admission paths (from test titles)
- `apps/web/app/shared-artifact/[token]/page.test.tsx`: Public content independent of admission, RLS read, invited fallback, gate failure, invite-only page (from test titles)
- `apps/web/features/chat/components/share/SharedSessionViewer.test.tsx`: Main landmark, attachment placeholder, model badge, sign-up/sign-in links (from test titles)
- `apps/web/app/share/[token]/not-found.test.tsx`: Not-found page (name only)
- `apps/web/app/shared-artifact/[token]/UnavailableArtifact.test.tsx`: Unavailable page (name only)
- `apps/web/app/shared-artifact/[token]/PublishedArtifactView.test.tsx`: Artifact view (name only)

**Test scenarios**

- **Public share**
  1. Create a share link.
  2. Open it in a private window.
  - Expected: Transcript visible, 'Read-only shared session.' banner, Expires text, report link.
- **Expired**
  1. Set expires_at in the past.
  2. Open the link.
  - Expected: 404 not-found page.
- **Workspace share**
  1. Share to a workspace.
  2. Open as a member, then as a stranger.
  - Expected: Member sees it; stranger gets not-found.
- **Revoked artifact**
  1. Publish, revoke, open link.
  - Expected: 'Unavailable' page.
- **Report**
  1. Press the report link.
  - Expected: Goes to /copyright/report?url=/share/<token>.

**Where to look when it fails**

- Tables shared_sessions, published_artifacts, organization_shared_sessions.
- Page 404 vs unavailable page tells which route failed.
- Logger output from admission failures (not traced).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/069-web-application.md](../../70-qa/test-plans/web/069-web-application.md)

## 10. Gaps and dependencies

- **Workspace share link previews use a generic title.** Affects: Workspace recipients. Evidence: share/[token]/page.tsx:88-97. Work needed: Decide if admitted previews need a title.
- **No artifact expiry found on the page.** Affects: Publishers expecting expiry. Evidence: shared-artifact/[token]/page.tsx reads only visibility. Work needed: Confirm in the service whether an expiry exists.
- **Report flow was not traced end to end.** Affects: Moderation. Evidence: ReportContentLink.tsx only builds a link. Work needed: Document the report route.

**Depends on**

- surface:web
- mode:cloud
- table:shared_sessions
- table:published_artifacts
- api:POST /api/share
- file:apps/web/app/share/[token]/page.tsx
- file:apps/web/app/shared-artifact/[token]/page.tsx
- SYS-authorization-and-workspaces
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-authentication-and-identity

## Unknown

- How the report route stores and handles a report.
- Whether published artifacts can expire.
- How the share dialog sets visibility choices (not read).
- Whether Local-mode web chats can be shared at all.
- Exact sandbox rules for running a published artifact (not read).
