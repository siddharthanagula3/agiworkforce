---
id: "F033-02"
type: "feature"
title: "Share link and public page"
aliases: ["Share link", "Public URL (S33.10)", "Preview deployment (S33.07)", "shared-artifact page", "Shared artifact page", "Published artifact page"]
area: "33 Generated Sites and published applications"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S33.07", "S33.10"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:desktop", "table:published_artifacts", "F033-01", "F033-03", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F033-02 Share link and public page

Every publication gets a random 24-character token and a link at /shared-artifact/<token> on the web site. Anyone with the link can open a public page; the page renders the artifact, running scripted kinds in a sandbox. Bad, revoked or not-allowed links show an honest unavailable page. Mobile, CLI and desktop open the same link in a browser.

Area: [33. Generated Sites and published applications](README.md). Requirement items: [S33.07](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3307), [S33.10](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3310).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Serves a published artifact to visitors by token. The public page shows the title, the date, the rendered artifact, a 'Save a copy to my chats' button and a report link (apps/web/app/shared-artifact/[token]/page.tsx:68-97; PublishedArtifactView.tsx:228-230).

**Why it exists.** A publish needs a place people can open it without the chat. An unguessable link is the access grant for public pages (published-artifact-service.ts:15-21).

**Who uses it.** Owners who share the link; visitors who open it, with or without an account.

**Problems it solves**

- Sharing a working page with someone who has no chat access.
- Keeping visitors safe from untrusted scripts.
- Giving visitors a clear message when a link no longer works.

**Use cases**

- Send a public link to a client in an email.
- Open your own page on a phone from the Sites list.
- A recipient taps Save a copy to my chats to remix the page.
- A visitor reports an abusive page from the footer link.

## 2. User experience

**Where to find it**

- Web: the link bar under the artifact (Copy link button), the Sites page (Copy link to <name>, Open), and Settings published list (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3007-3035; apps/web/features/sites/components/SiteCard.tsx:113).
- Mobile: the artifact screen and Site screen offer Copy link, Share, and Open in Safari or Open in browser (ArtifactFullScreen.tsx:1135-1153; apps/mobile/src/features/sites/SiteDetailScreen.tsx:275-300).
- CLI: agi artifacts published lists links; agi artifacts open <id> opens the page in the browser (apps/cli/src/lib.rs:1387-1398; cloud/artifacts.rs:692).
- Desktop (Electron): the published page opens in the system browser (doc: docs/product/surface-feature-matrix.md, Connected apps in artifacts section).

**Before you start**

- A publication exists (F033-01).
- Public page: none for a visitor. Workspace or invited pages: the visitor must be signed in (page.tsx:29-46).

**Screens and controls**

- Public page: heading, 'Published <date>', a line for the audience ('Shared conversation', or 'Shared with you'), rendered artifact, 'Save a copy to my chats' button, report link (PublishedArtifactView.tsx:228-260).
- Unavailable page: heading 'Shared artifact unavailable' and an 'Open chat' button (apps/web/app/shared-artifact/[token]/UnavailableArtifact.tsx).
- Invite-only page: 'Sign in to open this' or 'You do not have access' (InviteOnlyArtifact.tsx).

**Journey**

1. Owner copies the link after publishing.
2. Visitor opens the link in a browser.
3. The server validates the token shape and looks the page up.
4. A public page renders; scripted kinds run inside a sandboxed frame.
5. Visitor can save a copy to their chats (needs sign-in) or report the page.

**What the person sees and gets**

- Rendered page or the unavailable or invite-only page.
- Browser tab title '<title> - AGI' for public pages, with search engines told not to index (page.tsx:48-57).
- Mobile and web show 'Link copied' style confirmations (ArtifactPreview.tsx:3027-3031).

**Settings**

- Server switch AGI_ARTIFACT_AI_ENABLED turns on the in-page AI feature of the public page (apps/web/lib/server/artifact-ai-switch.ts:5-8); it does not affect whether the page opens.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Token is 18 random bytes encoded as 24 URL-safe characters; the link is the site address plus /shared-artifact/<token> (published-artifact-service.ts:289-295; :107).
- Public read returns a row only when visibility is public and the owner's account may run unattended (published-artifact-service.ts:824-841; apps/web/lib/auth/account-lifecycle.ts:53-66).
- Scripted kinds html, react and mermaid render in a sandbox frame on a separate sandbox origin, with a fallback frame lacking same-origin rights (published-artifact-service.ts:92-105; apps/web/features/chat/components/SandboxedIframe.tsx:395-431).
- svg renders as an image, markdown through the markdown renderer, text and code as text (apps/web/features/chat/components/artifacts/publishedArtifactRender.ts:20-60; PublishedArtifactView.tsx:52-70).
- Malformed token shows the unavailable page, and a revoked token looks the same on purpose (page.tsx:60-72).
- Report link on the page footer (page.tsx:95).

**Incomplete**

- Page views are not counted or audited (published-artifact-service.ts:44-47).

**Present but disconnected or switched off**

- In-page AI calls are off unless AGI_ARTIFACT_AI_ENABLED is set (artifact-ai-switch.ts:5-8).

**Not available**

- Mobile, CLI, desktop and extensions do not render published pages; the link opens in a browser (doc: docs/product/surface-feature-matrix.md).
- Custom domains, expiry (no TTL), analytics: none found.

## 4. Required behaviour

**Established requirements**

- The published site is reachable at a public URL (brief S33.10) and can be shared as a preview link (S33.07). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.07, S33.10)
- Each publication has a random 24-character token and a link built from the site address. (source: published-artifact-service.ts:107; :289-295)
- The anonymous read returns only public rows of owners allowed to run. (source: published-artifact-service.ts:824-841)
- Scripted kinds render in a sandbox. (source: published-artifact-service.ts:92-105)
- A malformed token shows the unavailable page, not the global 404. (source: apps/web/app/shared-artifact/[token]/page.tsx:60-72)

**Acceptance criteria**

1. Opening a valid public link signed out renders the artifact.
2. A token that is not 24 URL-safe characters shows 'Shared artifact unavailable'.
3. After unpublish the same link shows the unavailable page.
4. An html artifact with a script runs inside an iframe, not on the app origin.
5. A visitor for a workspace-only page who is not allowed does not see the content.
6. The page is not indexable (robots noindex).
7. The footer report link opens the report form for that path.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A suspended or erased owner makes the public link look unavailable. [inferred from ownerMayRunUnattendedSql]
- Mobile and CLI links are the web URL built from the same server-returned shareUrl. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add view counts if analytics (S33.27) is wanted.
- [proposed] Add an expiry setting once the founder approves a window.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | PublishedArtifactPage | `apps/web/app/shared-artifact/[token]/page.tsx` | Server page: token check, public read, scoped read for workspace and invited, unavailable and invite-only branches. |
| component | PublishedArtifactView | `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx` | Renders by kind, Save a copy button, audience line. |
| component | UnavailableArtifact | `apps/web/app/shared-artifact/[token]/UnavailableArtifact.tsx` | Page for malformed, revoked or unreadable links. |
| component | InviteOnlyArtifact | `apps/web/app/shared-artifact/[token]/InviteOnlyArtifact.tsx` | Page for invited-only links when the visitor is not allowed. |
| component | SandboxedIframe | `apps/web/features/chat/components/SandboxedIframe.tsx` | Sandbox frame on a separate origin with a limited fallback. |
| service | publishedArtifactRender | `apps/web/features/chat/components/artifacts/publishedArtifactRender.ts` | Builds the sandbox payload per kind; svg sanitised. |
| service | getPublishedArtifactByToken | `apps/web/lib/services/published-artifact-service.ts` | Anonymous public read (824-841); mint token (289); build URL (293). |
| service | account-lifecycle ownerMayRunUnattendedSql | `apps/web/lib/auth/account-lifecycle.ts` | Hides pages of owners whose account may not run. |
| component | ReportContentLink | `apps/web/app/copyright/report/ReportContentLink.tsx` | Report footer link on the page. |
| service | copy-shared-artifact | `apps/web/features/chat/lib/copy-shared-artifact.ts` | Save a copy to my chats. |
| component | SiteCard | `apps/web/features/sites/components/SiteCard.tsx` | Copy link and open buttons on the web Sites list. |
| screen | SiteDetailScreen | `apps/mobile/src/features/sites/SiteDetailScreen.tsx` | Mobile Link section: Copy link, Share, Open. |
| screen | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile copy, share, open published link (1135-1153). |
| command | agi artifacts open / published | `apps/cli/src/lib.rs` | Open published page or list links (1387-1398, 3877). |
| config | AGI_ARTIFACT_AI_ENABLED | `apps/web/lib/server/artifact-ai-switch.ts` | Server switch for in-page AI. |
| test | page.test.tsx | `apps/web/app/shared-artifact/[token]/page.test.tsx` | Public, invited, workspace and invite-only page branches. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Visitor opens /shared-artifact/<token>; the page rejects a malformed token with the unavailable page. | our servers | apps/web/app/shared-artifact/[token]/page.tsx:68-70 |
| Server reads the row where token matches, visibility is public and the owner may run. | our servers | published-artifact-service.ts:824-841 |
| If not public, server tries the visitor's signed-in scoped reads (workspace then invited); if none, checks whether the page is invite-only to pick the message. | our servers | page.tsx:29-46; :73-81 |
| Server returns the page; the browser builds the render for the kind and mounts the sandbox frame for html, react and mermaid. | device | PublishedArtifactView.tsx:62-70; SandboxedIframe.tsx:395-431 |
| Save a copy to my chats copies the artifact into the signed-in visitor's conversations through the web app. | device and our servers | PublishedArtifactView.tsx:140-200; apps/web/features/chat/lib/copy-shared-artifact.ts |
| Mobile and CLI only open or share the URL; rendering happens in the system browser. | outside service | ArtifactFullScreen.tsx:1135-1153; doc: docs/product/surface-feature-matrix.md |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Published content read by token | table published_artifacts | No sync; every visit reads the server | Until unpublished or its conversation is deleted; no expiry. |
| Visit records | none; views are not counted | n/a | Not stored (published-artifact-service.ts:44-47). |

**Models and providers.** The page itself calls no model. Runnable html and react pages may ask the in-page AI feature when AGI_ARTIFACT_AI_ENABLED is set; that is outside this feature (usePublishedArtifactRuntime.ts).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not required for public pages. Required for workspace and invited pages (page.tsx:29-46). |
| Permissions | Token knowledge is the read grant for public pages; workspace and invited reads are decided by row-level security (apps/web/lib/services/org-shared-artifact-service.ts:117-145). |
| Subscription | None found on opening a page. Save a copy needs an account. |
| Limits and metering | Public read endpoint class share-view is 60 per minute where used (apps/web/lib/rate-limit.ts:434-438); the page server component itself shows no rate limit in the file read. Content size 1,000,000 characters. |
| Feature flags | AGI_ARTIFACT_AI_ENABLED (in-page AI only). |
| Model compatibility | Not applicable to opening a page. |
| Provider restrictions | none found in the code |
| Local mode | The page is a web feature served from our servers. A Local-mode device cannot create a link (see F033-01) but can open any link in a browser. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Malformed token | Unavailable page with copy 'This link may have expired, been unpublished, or been entered incorrectly.' | page.tsx:68-70; UnavailableArtifact.tsx |
| Revoked or unpublished | Same unavailable page. | page.tsx:60-66 |
| Invite-only and signed out or not on the list | Invite-only page with Sign in or Open chat. | page.tsx:73-81; InviteOnlyArtifact.tsx |
| Loading | Sandbox frame shows 'Loading preview…' until the client hydrates. | SandboxedIframe.tsx:384-389 |
| Scripts cannot run in fallback | A notice says scripts are blocked and layout only is shown. | SandboxedIframe.tsx:407-419 |
| Render error | PublishedArtifactView keeps a renderError state (set by the frame). | PublishedArtifactView.tsx:62-66 |
| Offline | not handled in the code beyond browser defaults. | searched page.tsx and PublishedArtifactView.tsx |
| Accessibility | Unavailable page uses a main landmark and a decorative icon marked aria-hidden. | UnavailableArtifact.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/shared-artifact/[token]/page.test.tsx`: Public content independent of cookies, RLS use for scoped reads, invited fallback, no private query after a gate failure, invite-only explanation.
- `apps/web/app/shared-artifact/[token]/PublishedArtifactView.test.tsx`: View rendering (by file name).
- `apps/web/app/shared-artifact/[token]/PublishedArtifactView.images.test.tsx`: Image handling in the view (by file name).
- `apps/web/app/shared-artifact/[token]/UnavailableArtifact.test.tsx`: Unavailable page (by file name).
- `apps/web/features/chat/components/artifacts/publishedArtifactRender.test.ts`: Per-kind render payloads (by file name).
- `apps/web/lib/services/__tests__/published-artifact-service.visibility.test.ts`: Visibility rules for reads (by file name).
- `apps/web/features/chat/lib/copy-shared-artifact.test.ts`: Save a copy (by file name).

**Test scenarios**

- **Open a public link signed out**
  1. Publish an html artifact.
  2. Open the link in a private window.
  - Expected: The page renders without sign-in; the tab title is '<title> - AGI'.
- **Bad link**
  1. Change one character to a symbol and open it.
  - Expected: 'Shared artifact unavailable' page.
- **Unpublish then open**
  1. Unpublish the artifact.
  2. Open the old link.
  - Expected: Same unavailable page.
- **Sandbox**
  1. Publish html that reads document.cookie or window.parent.
  2. Open the link.
  - Expected: The script runs inside the sandbox origin and cannot reach the app's cookies.
- **Mobile open**
  1. On mobile, publish, then tap Open in Safari.
  - Expected: System browser opens the same /shared-artifact/<token> page.
- **Report**
  1. Open a public page, follow the footer report link.
  - Expected: Report form opens for /shared-artifact/<token>.

**Where to look when it fails**

- Server catches failed reads and returns the unavailable page, so look at table published_artifacts (token, visibility) and the owner's profiles.account_status.
- Browser console and the SandboxedIframe status notice for script blocking.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/web/033-generated-sites-and-published-applications.md)
- Desktop: [70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md)
- Mobile: [70-qa/test-plans/mobile/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/mobile/033-generated-sites-and-published-applications.md)
- CLI: [70-qa/test-plans/cli/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/cli/033-generated-sites-and-published-applications.md)

## 10. Gaps and dependencies

- **No view counts or audit of visits** Affects: Owners (S33.27). Evidence: published-artifact-service.ts:44-47. Work needed: Design analytics and privacy review.
- **No expiry for links** Affects: Owners and visitors. Evidence: published-artifact-service.ts:44-47. Work needed: Founder-approved TTL.
- **The brief marks chrome unverified** Affects: Chrome. Evidence: No publish or page code in apps/extension. Work needed: Mark absent or decide a feature.
- **No custom domain** Affects: Owners. Evidence: No code found; brief S33.14 missing. Work needed: Product decision and build.
- **A draft claimed share-view rate limiting applies to the public page; not found in the page code read** Affects: Abuse resistance. Evidence: page.tsx has no withRateLimit call. Work needed: Confirm whether an edge limit exists.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- table:published_artifacts
- F033-01
- F033-03
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-shared-ui-and-design

## Unknown

- Whether any edge or proxy rate limit applies to the public page.
- How the sandbox origin is configured in production (SandboxedIframe reads a sandbox origin; value not read).
- Whether Electron desktop opens links in the system browser in code (only the doc says so).
- Content of several named test files was not read.
