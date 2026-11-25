---
id: "F107-04"
type: "feature"
title: "Public gallery of user work (artifacts, generated apps, images and video)"
aliases: ["Public artifact gallery (S107.05)", "Public generated-app gallery (S107.06)", "Public image and video gallery (S107.07)", "Shared artifact page"]
area: "107 Discovery, social, and public-content products"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S107.05", "S107.06", "S107.07"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "table:published_artifacts", "F107-03", "F107-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F107-04 Public gallery of user work (artifacts, generated apps, images and video)

A planned public gallery where anyone could browse artifacts, generated apps, images and videos that users published. It does not exist. Today a published artifact is reachable only by its link or invitation at /shared-artifact/<token>, and that page asks search engines not to index it. The gallery page lists only the user's own and invited items.

Area: [107. Discovery, social, and public-content products](README.md). Requirement items: [S107.05](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10705), [S107.06](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10706), [S107.07](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10707).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let anyone browse and open public work by users: artifacts (S107.05), generated apps or sites (S107.06), images and videos (S107.07) (doc: knowledge-base/data/area-briefs/107-discovery-social-and-public-content-products.md). No public list exists.

**Why it exists.** The brief lists it as a discovery product. The audit register closed related creator-handle work as ahead of need because 'a public handle would collect identity data with nowhere to display it' (doc: audit/registers/ui-gaps.md GAP-266).

**Who uses it.** Anyone, signed in or not (brief S107.05).

**Problems it solves**

- Would show real user work as inspiration [inferred].
- Would give creators an audience [inferred].

**Use cases**

- Browse popular published artifacts (would-be).
- Open a public generated site (would-be).
- Browse generated images (would-be).

## 2. User experience

**Where to find it**

- Web: no public listing. /gallery lists the user's own artifacts, 'Shared with you' (invitations) and six staff examples only (apps/web/app/gallery/GalleryClient.tsx).
- Web, link only: /shared-artifact/<token> opens one published artifact (apps/web/app/shared-artifact/[token]/page.tsx).
- Mobile: missing (brief). Desktop: missing for S107.06 and S107.07 (brief); S107.05 desktop status not stated.
- CLI, VS Code, Chrome: no code found.

**Before you start**

- Viewing a public-visibility artifact by link: none. Invite-only items need sign-in with the invited email (shared-artifact page.tsx).

**Screens and controls**

- Shared artifact page: shows the published artifact, a report link (ReportContentLink), and for invite-only items an invite screen (InviteOnlyArtifact) or an unavailable screen (UnavailableArtifact).
- No browse, search or category control for public work exists.

**Journey**

1. Today: owner publishes an artifact, shares its link; a viewer opens /shared-artifact/<token>.
2. Would-be: browse list, open item. Unbuilt.

**What the person sees and gets**

- Malformed or revoked token shows an 'unavailable' page rather than a 404 (page.tsx comment).
- Invite-only without access shows an invite page.

**Settings**

- Visibility of a published artifact is a field on the published row with values including 'public' and 'invited' (apps/web/lib/services/published-artifact-service.ts:36-38,218). Where a user sets it in the UI was not opened.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Publishing an artifact and viewing it by token, public or invited or workspace-shared (shared-artifact/[token]/page.tsx).
- Shared-with-you list for invited viewers (F107-03).
- Reporting a shared artifact via ReportContentLink (page.tsx import).

**Incomplete**

- The mobile app shows publication states for its own artifacts (apps/mobile/src/features/artifacts/index.tsx:135) but no public browse.

**Present but disconnected or switched off**

- Shared artifact pages are excluded from search: robots index false, follow false (shared-artifact/[token]/page.tsx:49,56).

**Not available**

- No public listing endpoint: the artifacts API folder holds export, index, library, live, publish, runtime, save-to-drive, save-to-onedrive and shared-with-me, none a public list (ls apps/web/app/api/artifacts).
- No generated-app or image/video public gallery on web, desktop or mobile (brief S107.06, S107.07).
- Desktop image gallery was cut (docs/decisions/wire-or-cut.md:26).

## 4. Required behaviour

**Established requirements**

- Anyone can browse a public gallery of artifacts that users published, and open one. (source: S107.05 (brief))
- Anyone can browse a public gallery of apps or sites users generated and published. (source: S107.06 (brief))
- Anyone can browse a public gallery of images and videos users generated. (source: S107.07 (brief))
- A viewer can report a public page as harmful or infringing; moderators review in a dashboard. (source: S107.15 and S107.23 (brief, done on web))

**Acceptance criteria**

1. A signed-out visitor can open a public list and open an item.
2. Only items whose owner chose public visibility appear.
3. Unpublishing removes an item from the list.
4. Each item can be reported and reported items can be taken down.
5. Private, invited and workspace items never appear.
6. Images and videos open with a viewer that works on phone width.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A public list must opt in per item and show who made it (S107.13 attribution) before going live [inferred]; the shared page renders no author today (doc: audit/registers/ui-gaps.md GAP-266).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an explicit 'List in gallery' choice separate from link sharing.
- [proposed] Index only moderated items.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Shared artifact page | `apps/web/app/shared-artifact/[token]/page.tsx` | Opens one published artifact by token; noindex; invite and unavailable states. |
| component | PublishedArtifactView | `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx` | Renders the published artifact. |
| component | InviteOnlyArtifact | `apps/web/app/shared-artifact/[token]/InviteOnlyArtifact.tsx` | Invite-only screen. |
| component | UnavailableArtifact | `apps/web/app/shared-artifact/[token]/UnavailableArtifact.tsx` | Unavailable or revoked screen. |
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | Reads and writes published artifacts, including visibility. |
| service | published-site-viewer-service | `apps/web/lib/services/published-site-viewer-service.ts` | Invited viewers and the shared-with-me query. |
| endpoint | POST /api/artifacts/publish | `apps/web/app/api/artifacts/publish/route.ts` | Publishes an artifact (HTTP method not opened; route exists). |
| endpoint | GET /api/artifacts/shared-with-me | `apps/web/app/api/artifacts/shared-with-me/route.ts` | Invited items only. |
| table | published_artifacts | `apps/web/db/neon/0095_published_artifacts.sql` | Published artifact rows (named in the service header comment). |
| table | published_artifact_viewers | `apps/web/lib/services/published-site-viewer-service.ts` | Invite list per published artifact (queried here). |
| component | ReportContentLink | `apps/web/app/copyright/report/ReportContentLink.tsx` | Report control on the shared page. |
| screen | Mobile artifacts screen | `apps/mobile/src/features/artifacts/index.tsx` | Own artifacts and publication state; no public browse. |
| config | Robots | `apps/web/app/robots.ts` | Crawler rules. |
| other | Wire-or-cut record | `docs/decisions/wire-or-cut.md` | Line 26 records the cut desktop image gallery. |
| other | UI gap register | `audit/registers/ui-gaps.md` | GAP-266 and GAP-267 closed Not Planned on public handles and profiles. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Viewer opens /shared-artifact/<token>; server checks token format. | our servers | shared-artifact/[token]/page.tsx |
| Server reads a public published row; if none, reads an organisation or invited row under the viewer's database rules. | our servers | page.tsx readArtifactForViewer |
| Page renders the artifact, or the invite or unavailable screen. | our servers | page.tsx |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Published artifact content and visibility | Table published_artifacts | Server side | Not established here. |

**Models and providers.** No model takes part in viewing. A published artifact can include AI features gated by artifactAiEnabled (imported in page.tsx); details not opened.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Public link viewing needs none; invited items need the invited verified email. |
| Permissions | Per-row visibility and viewers. |
| Subscription | none found in the code for viewing |
| Limits and metering | none found in the code |
| Feature flags | artifactAiEnabled switch is read on the shared page (page.tsx import); the gallery has no flag. |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Local mode cannot publish to servers silently (AGENTS.md section 6); how Local artifacts are published is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Revoked or bad token | Unavailable page, same for both. | page.tsx comment |
| Invite-only, signed out | Invite screen. | page.tsx |
| Gallery list states | not handled in the code: no list exists | No public list route |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/shared-artifact/[token]/page.test.tsx`: The shared artifact page (contents not opened).
- `apps/web/app/shared-artifact/[token]/PublishedArtifactView.test.tsx`: Published view rendering.
- `apps/web/app/shared-artifact/[token]/UnavailableArtifact.test.tsx`: Unavailable screen.

**Test scenarios**

- **No public list**
  1. Signed out, try /gallery
  2. Search for another user's work
  - Expected: Only staff examples; no user work.
- **Link share**
  1. Publish an artifact public
  2. Open link signed out
  - Expected: Artifact shown, page noindex.
- **Revoked link**
  1. Revoke
  2. Open link
  - Expected: Unavailable page.
- **Report**
  1. Open shared page
  2. Use report link
  - Expected: Report form opens.

**Where to look when it fails**

- Table published_artifacts; page returns UnavailableArtifact for unreadable rows (errors are swallowed with catch returning null in readArtifactForViewer).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No public gallery of artifacts** Affects: All visitors. Evidence: Brief S107.05; no list endpoint. Work needed: Opt-in flag, list endpoint, moderation gate, UI.
- **No generated apps or media gallery** Affects: Web, desktop, mobile. Evidence: Brief S107.06, S107.07. Work needed: Publish path for sites and media, list UI.
- **No author shown on public pages** Affects: Viewers. Evidence: GAP-266 text. Work needed: Attribution decision (S107.13).
- **Brief gives no web status for S107.05** Affects: Planning. Evidence: Brief S107.05 lists mobile only. Work needed: Correct the brief: web has no public list.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- table:published_artifacts
- F107-03
- F107-05

## Unknown

- Where the UI sets public versus invited visibility.
- Whether published sites and media have public pages.
- Whether moderation can take down a published artifact (S107.23 code is for copyright notices).
- Desktop status for S107.05.
