---
id: "F107-03"
type: "feature"
title: "Curated gallery examples and prompt reuse"
aliases: ["Gallery", "Artifacts gallery (page title 'Gallery: artifacts built with AGI')", "Inspiration section", "Gallery example", "Build one like it", "Curated public pages (S107.04)", "Prompt reuse (S107.12)", "INSPIRATION registry"]
area: "107 Discovery, social, and public-content products"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S107.04", "S107.12"]
depends_on: ["surface:web", "surface:mobile", "SYS-authentication-and-identity", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "SYS-data-model-and-migrations", "F107-04", "table:web_artifact_index", "table:published_artifacts", "table:published_artifact_viewers", "api:GET /api/artifacts/shared-with-me", "api:GET /api/artifacts/index", "file:apps/web/app/gallery/inspiration.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F107-03 Curated gallery examples and prompt reuse

The web page /gallery shows six hand-written example artifacts to anyone, signed in or not. A visitor opens one example page and presses 'Build one like it' to start a chat with a prompt in the composer. Signed-in users also see their own artifacts and artifacts shared with them. Mobile has no curated gallery.

Area: [107. Discovery, social, and public-content products](README.md). Requirement items: [S107.04](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10704), [S107.12](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10712).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | does not apply | does not apply | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows curated example artifacts (six static entries) on a public gallery, opens each on its own page at /gallery/<id>, and hands the example's description to chat as a starter prompt (apps/web/app/gallery/inspiration.ts, apps/web/app/gallery/[templateId]/page.tsx). For signed-in users the same page also lists their own artifacts, artifacts shared with them, and a guided 'New artifact' flow (apps/web/app/gallery/GalleryClient.tsx).

**Why it exists.** Brief S107.04 asks that signed-out visitors can browse curated public pages built by the team, and S107.12 that a visitor reuses a public example's prompt so it lands in the composer.

**Who uses it.** Signed-out visitors judging the product; signed-in users looking for ideas or their own artifacts.

**Problems it solves**

- Shows what the product can make without signing up.
- Removes the blank-page problem by pre-filling a prompt.
- Gives search engines indexable example pages (sitemap lists them) (apps/web/app/sitemap.ts).

**Use cases**

- A visitor opens /gallery, picks 'Flow chart: CI pipeline', reads the diagram, and presses 'Build one like it'.
- A signed-in user filters by type 'Code' and opens one of their own artifacts in the side panel.
- A signed-in user opens 'Shared with you' to find an artifact someone invited them to.

## 2. User experience

**Where to find it**

- Web: public route /gallery (apps/web/app/gallery/page.tsx), linked from the sitemap page as 'Gallery' (apps/web/app/sitemap-page/page.tsx:40). Example pages at /gallery/<id>.
- Web signed-in: /chat/artifacts redirects to /chat/library?surface=artifact, so the in-app Library shows artifacts; the public /gallery stays separate (apps/web/app/chat/artifacts/page.tsx; apps/web/app/chat/artifacts/page.test.tsx:57).
- Mobile: no curated gallery. The mobile 'artifacts' screen is the user's own artifacts (apps/mobile/app/(app)/artifacts/index.tsx, apps/mobile/src/features/artifacts/index.tsx). Brief S107.04 and S107.12: mobile missing.
- Desktop, CLI, VS Code, Chrome: no gallery code found by search; the public Desktop shows the hosted web app per AGENTS.md section 5, so it may show this page [inferred].

**Before you start**

- Viewing /gallery and /gallery/<id>: none; no sign-in needed (page has no auth check, apps/web/app/gallery/page.tsx).
- Own artifacts and 'Shared with you': signed in; shared list also needs a verified primary email (apps/web/app/api/artifacts/shared-with-me/route.ts).
- Prompt reuse landing in the composer: /chat requires sign-in or guest chat (apps/web/app/chat/layout.tsx).

**Screens and controls**

- Gallery page: heading 'Artifacts', eyebrow 'Gallery', search box labelled 'Search artifacts', filter menu labelled 'Filter by' with 'Type' (All types plus types) and 'Created' options, primary button 'New artifact', segmented group 'Show artifacts' with 'All', 'Yours', and (signed in only) 'Shared with you' (GalleryClient.tsx:1480-1525).
- Sections under All: 'Shared with you' and 'Inspiration' (GalleryClient.tsx:1681,1692).
- Card click opens a side drawer (dialog) with the artifact, a language badge, 'Open page' (for examples) or 'Open chat' (for the user's own artifact with a source chat) and a close button labelled 'Close artifact panel' (GalleryClient.tsx:830-950).
- New artifact opens 'Choose artifact type' (categories including Documents, Games, Productivity tools, Creative projects, Quiz or survey, Start from scratch) then a 3-step wizard 'Describe your idea' / 'Who is it for?' / 'Any extra requirements?' with a close button 'Close wizard' (GalleryClient.tsx:60-100,611-730).
- Example page: eyebrow 'Gallery example', title, description, buttons 'Build one like it' and 'Back to the gallery', and a preview (apps/web/app/gallery/[templateId]/page.tsx).

**Journey**

1. 1. Open /gallery (no sign-in).
2. 2. Search or filter; cards for the six examples show under 'Inspiration'.
3. 3. Click a card; a drawer shows the example (live preview or source).
4. 4. Press 'Open page' to go to /gallery/<id>.
5. 5. Press 'Build one like it' to go to /chat?starterPrompt=<text> where the text is: Build something like the "<title>" example from the gallery: <description>.
6. 6. In the chat page the prompt lands in the composer; the parameter is removed from the address bar (apps/web/features/chat/pages/WebChatPage.tsx:1322-1327).
7. 7. The visitor edits and sends.

**What the person sees and gets**

- Skeleton cards while loading the user's list (GalleryClient.tsx:217,1259).
- 'No matches' state with a clear action when filters match nothing (GalleryClient.tsx:170).
- Empty state 'Artifacts you create in conversations will appear here.' with a 'New artifact' button.
- Shared tab notices: 'Verify your email to see artifacts shared with you.', 'Artifacts people share with you will appear here.', a failure message with 'Try again', and 'Load more'.
- Unknown example id: the not-found page.

**Settings**

- None found in the code for the gallery itself.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Static registry of six examples: animated gradient button, CI pipeline flow chart, SVG wordmark, Python data pipeline, responsive card grid, SQL accounts schema (apps/web/app/gallery/inspiration.ts).
- Public gallery page and example pages, with static params so all six are pre-built and unknown ids call notFound() (apps/web/app/gallery/[templateId]/page.tsx).
- Build one like it link to /chat?starterPrompt=... and composer prefill consumed once on the chat page (WebChatPage.tsx:1146,1322-1327).
- Search, type filter, date filter, scope tabs, drawer, creation wizard (GalleryClient.tsx).
- Account artifact index merged with locally derived artifacts (GalleryClient.tsx:1195-1245; apps/web/features/chat/hooks/use-artifact-index.ts).
- Shared with you list with pages and retry (apps/web/app/gallery/use-shared-with-you.ts; apps/web/app/api/artifacts/shared-with-me/route.ts).
- Sitemap lists /gallery and each example (apps/web/app/sitemap.ts:6,64).

**Incomplete**

- Example cards in the drawer offer 'Open page' only; there is no prompt-reuse button on the card or drawer. Prompt reuse is on the example page. The brief cites GalleryClient.tsx:1119 for it; that line is in the SharedNotice component, so the brief citation is stale (GalleryClient.tsx:1071-1120).
- The 'New artifact' wizard builds a prompt from the category and answers; it is not reuse of an example's prompt (GalleryClient.tsx:631-660,1345).
- Signed-out visitors who press 'Build one like it' land on /chat: guest chat if open and no session cookie, else sign-in with the path and query kept as the return address (apps/web/app/chat/layout.tsx). A search of GuestChat.tsx for search params, prefill or starter found nothing, so prefill for guests is unverified and probably absent [inferred].

**Present but disconnected or switched off**

- Desktop image gallery and style presets were cut because they had no production import path (docs/decisions/wire-or-cut.md:26); that is a different, removed feature.

**Not available**

- Mobile: no curated gallery or prompt reuse (brief S107.04, S107.12).
- Desktop (Tauri) and CLI, VS Code, Chrome: no gallery code found by search.
- Examples are not editable by staff in an admin screen; they are source code only (inspiration.ts).

## 4. Required behaviour

**Established requirements**

- Signed-out visitors can browse curated public pages of examples and directories built by the product team. (source: S107.04 (brief))
- From a public example a visitor reuses its prompt: the prompt lands in their composer ready to send. (source: S107.12 (brief))
- The Library, not a second destination, holds the user's artifacts; /chat/artifacts only redirects. (source: apps/web/app/chat/artifacts/page.tsx)

**Acceptance criteria**

1. Signed out, /gallery returns 200 and shows six example cards under 'Inspiration'.
2. /gallery/<id> for each of the six ids returns 200 and shows 'Build one like it'.
3. /gallery/not-an-example returns the not-found page.
4. 'Build one like it' opens /chat with the example text in the composer and removes starterPrompt from the address.
5. Signed in, 'Shared with you' appears after 'Yours'; signed out it does not.
6. A search with no match shows the no-matches state and 'clear' restores the list.
7. Filtering by Created hides the examples (they have no date).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A signed-out visitor should keep the prompt through sign-in or guest chat; the sign-in return address keeps the query [inferred from chat layout]; guest chat prefill is unverified.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add 'Build one like it' to the drawer so prompt reuse is available from the list.
- [proposed] Make guest chat read starterPrompt.
- [proposed] Add a mobile examples screen using the same registry from a shared package.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | GalleryPage | `apps/web/app/gallery/page.tsx` | Server page: header, GalleryClient, footer; sets title 'Gallery: artifacts built with AGI'. |
| config | Gallery layout metadata | `apps/web/app/gallery/layout.tsx` | SEO title, description and keywords. |
| component | GalleryClient | `apps/web/app/gallery/GalleryClient.tsx` | Client list: scopes, search, filters, cards, drawer, category picker, wizard. |
| store | INSPIRATION registry | `apps/web/app/gallery/inspiration.ts` | Six static example cards plus findInspiration and inspirationPath. |
| screen | GalleryTemplatePage | `apps/web/app/gallery/[templateId]/page.tsx` | Example page, static params, not-found, Build one like it link. |
| component | TemplatePreview | `apps/web/app/gallery/[templateId]/TemplatePreview.tsx` | Renders the example with ArtifactPreview. |
| screen | Example loading | `apps/web/app/gallery/[templateId]/loading.tsx` | Loading label 'Loading the example'. |
| hook | useSharedWithYou | `apps/web/app/gallery/use-shared-with-you.ts` | Pages artifacts shared with the viewer; abort, retry, load more. |
| endpoint | GET /api/artifacts/shared-with-me | `apps/web/app/api/artifacts/shared-with-me/route.ts` | Returns token, title, kind, updatedAt for artifacts invited to the verified email; keyset paging; rate limited. |
| hook | useArtifactIndex | `apps/web/features/chat/hooks/use-artifact-index.ts` | Reads the account artifact index for the signed-in user. |
| endpoint | GET /api/artifacts/index | `apps/web/app/api/artifacts/index/route.ts` | Serves the account artifact index rows. |
| table | web_artifact_index | `apps/web/db/neon/0121_artifact_index.sql` | Metadata rows per artifact, no content. |
| store | artifacts-store | `apps/web/features/chat/stores/artifacts-store.ts` | Local artifacts derived from chats on this device. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Shared artifact renderer used by cards and example page. |
| hook | Composer prefill from starterPrompt | `apps/web/features/chat/pages/WebChatPage.tsx` | Reads starterPrompt, fills the composer, removes the parameter (lines 1146, 1322-1327). |
| screen | Chat layout gate | `apps/web/app/chat/layout.tsx` | Guest chat or sign-in redirect for signed-out visitors reaching /chat. |
| config | Sitemap | `apps/web/app/sitemap.ts` | Lists /gallery and every example path. |
| config | Identity-aware public prefixes | `apps/web/lib/identity/browser-provider-routes.ts` | Marks /gallery as a public route that still loads the identity provider. |
| config | Analytics route map | `apps/web/shared/components/layout/analytics-route.ts` | Lists /gallery/[templateId] as a known route (line 12). |
| schema | ArtifactsSharedWithMe schema | `packages/contracts/cloud-contracts/src/artifacts-shared-with-me.ts` | Shared request path and response schema for web and phone. |
| screen | Mobile artifacts gallery (own artifacts) | `apps/mobile/src/features/artifacts/index.tsx` | The phone's own-artifacts grid; not the curated gallery. |
| screen | Artifacts redirect | `apps/web/app/chat/artifacts/page.tsx` | Redirects /chat/artifacts to Library with the artifact filter. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser requests /gallery; server renders header and footer; GalleryClient hydrates. | our servers | apps/web/app/gallery/page.tsx |
| Client filters the six static examples in memory; no network is needed for them. | device | GalleryClient.tsx visibleInspiration; inspiration.ts |
| If signed in, the client fetches /api/artifacts/index and /api/artifacts/shared-with-me with the session token and merges results with the local store. | device and our servers | use-artifact-index.ts; use-shared-with-you.ts |
| Pressing 'Build one like it' navigates to /chat?starterPrompt=<encoded text>. | device | apps/web/app/gallery/[templateId]/page.tsx |
| The chat layout lets guests into guest chat when open, sends signed-out visitors with a session cookie or no guest access to sign-in, else shows chat; WebChatPage moves the parameter into the composer. | our servers | apps/web/app/chat/layout.tsx; WebChatPage.tsx:1322 |
| The visitor presses send; the chat turn then uses whichever mode and provider the account has. | our servers | SYS-chat-turn-pipeline (not traced here) [inferred] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Example content | Source code (inspiration.ts) | Ships with each web release | Changed only by a code release. |
| Artifact index rows and published artifact rows for the signed-in user | Tables web_artifact_index and published_artifacts, published_artifact_viewers (apps/web/lib/services/published-site-viewer-service.ts) | Yes, via the server across devices | Not established here. |
| starterPrompt query value | Address bar until consumed, then removed | No | Removed on first use (WebChatPage.tsx:1325). |

**Models and providers.** The gallery calls no model. The examples are static. Models take part only after the visitor sends the prefilled prompt in chat; the model comes from the user's own routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Browsing the six examples and example pages needs no account. Own artifacts and 'Shared with you' need sign-in; 'Shared with you' also needs a verified primary email (shared-with-me/route.ts). |
| Permissions | Shared list returns only artifacts invited to the viewer's verified email; client-sent emails are ignored (route.test.ts:105). |
| Subscription | none found in the code |
| Limits and metering | The shared-with-me endpoint is rate limited under the 'chat-conversation' bucket and pages 24 at a time (route.ts). Nothing else found. |
| Feature flags | none found in the code for the gallery |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | The gallery is a web page and uses no inference, so Local mode does not apply to browsing. Whether Local-mode chat opens with the prefilled prompt on the public Desktop is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Six skeleton cards while auth, index or shared list load. | GalleryClient.tsx:217,1259 |
| Empty (new account) | Message plus 'New artifact' button; examples still shown below. | GalleryClient.tsx; GalleryClient.test.tsx:205 |
| No filter matches | No-matches state with clear. | GalleryClient.tsx:170; GalleryClient.test.tsx:270 |
| Shared list error | Message and 'Try again'; a failure on later pages shows an alert. | GalleryClient.tsx; use-shared-with-you.ts |
| Unverified email | Asks for email verification. | shared-with-me/route.ts; GalleryClient.test.tsx:444 |
| Signed out on Shared scope | Scope falls back to All. | GalleryClient.tsx:1246 |
| Unknown example id | notFound page. | [templateId]/page.tsx |
| Artifact from another device | Card has no thumbnail; click opens the source conversation. | GalleryClient.tsx:1195-1245 comment |
| Offline, timeout, cancel | Offline and timeout not handled in the code beyond fetch error to message; abort on unmount handled. | use-shared-with-you.ts |
| Accessibility | Dialogs have role dialog, aria-modal and keyboard handling; search and scope group have labels; status notices use role status. | GalleryClient.tsx:830-880,1071 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/gallery/GalleryClient.test.tsx`: Header, scope, search, filters, thumbnails, Shared with you states.
- `apps/web/app/gallery/use-shared-with-you.test.ts`: Signed-out no read, paging, unverified and failure.
- `apps/web/app/gallery/[templateId]/TemplatePreview.test.tsx`: Preview of both kinds of example.
- `apps/web/app/api/artifacts/shared-with-me/route.test.ts`: Auth, verified email, contract shape, paging, cursor.
- `packages/contracts/cloud-contracts/src/__tests__/artifacts-shared-with-me.test.ts`: Shared-with-me contract.
- `apps/web/app/chat/artifacts/page.test.tsx`: Redirect to Library and that /gallery is not a rail destination.
- `apps/web/e2e/gallery-public.spec.ts`: Example pages, source in server response, drawer, thumbnails at several viewport sizes (spec exists; no result recorded).
- `apps/web/e2e/public-route-inventory.spec.ts`: Public route inventory including /gallery/[templateId].

**Test scenarios**

- **Signed-out browse**
  1. Open /gallery signed out
  2. Check cards under Inspiration
  3. Open one
  - Expected: Six cards, drawer opens, no sign-in prompt.
- **Build one like it**
  1. Sign in
  2. Open /gallery/ci-pipeline-flow-chart
  3. Press 'Build one like it'
  - Expected: Chat opens with the example text in the composer and no starterPrompt left in the URL.
- **Signed-out prompt reuse**
  1. Signed out, open an example
  2. Press 'Build one like it'
  3. Observe guest chat or sign-in
  - Expected: Unknown today: check whether the prompt survives; record result.
- **Unknown example**
  1. Open /gallery/nope
  - Expected: Not-found page.
- **Shared with you**
  1. Invite a verified email to a published artifact
  2. Sign in as that user
  3. Open Shared with you
  - Expected: The artifact appears and opens at /shared-artifact/<token>.
- **Wizard prompt**
  1. Signed in, press New artifact, choose Games
  2. Answer the three steps
  - Expected: Chat opens with a prompt combining category and answers.

**Where to look when it fails**

- Failed list reads show 'Shared artifacts could not be loaded' (use-shared-with-you.ts); the HTTP status is in the error.
- Server errors surface through withErrorHandler in the route.
- Tables: web_artifact_index, published_artifacts, published_artifact_viewers.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/107-discovery-social-and-public-content-products.md](../../70-qa/test-plans/web/107-discovery-social-and-public-content-products.md)

## 10. Gaps and dependencies

- **No mobile curated gallery or prompt reuse** Affects: Mobile users. Evidence: Brief S107.04 and S107.12 mobile missing; mobile artifacts screen lists own items only. Work needed: Mobile screen and shared registry package.
- **Signed-out prompt reuse unverified** Affects: Signed-out visitors on web. Evidence: chat/layout.tsx guest path; GuestChat.tsx has no starter prompt reference. Work needed: Test the journey; make guest chat read the prompt if it does not.
- **Prompt reuse not offered from the list drawer** Affects: Web visitors. Evidence: Drawer links are 'Open page' and 'Open chat' only. Work needed: Add the action or document the two-step path.
- **Brief code citations are stale** Affects: Maintainers. Evidence: GalleryClient.tsx:1119 is in SharedNotice; 1324 is in the category and launch handlers area, not the curated list. Work needed: Update the brief.
- **Examples are code-only and hard-wired for six** Affects: Product team. Evidence: inspiration.ts. Work needed: Optional: content source for staff edits.
- **No recorded run of the e2e or unit tests** Affects: Testers. Evidence: No result file read. Work needed: Run and record.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- SYS-authentication-and-identity
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- SYS-data-model-and-migrations
- F107-04
- table:web_artifact_index
- table:published_artifacts
- table:published_artifact_viewers
- api:GET /api/artifacts/shared-with-me
- api:GET /api/artifacts/index
- file:apps/web/app/gallery/inspiration.ts

## Unknown

- Whether guest chat keeps the prompt for signed-out visitors.
- Whether the public Desktop (Electron) shows /gallery.
- How long artifact index rows are kept.
- Whether any plan limits the artifact list (none found).
- Whether the listed tests currently pass (no result recorded).
