---
id: "F030-11"
type: "feature"
title: "Versions, templates and sharing"
aliases: ["Versions, templates and sharing", "Version history", "Save as template", "New from template", "Publish", "Deck templates", "Shareable viewer", "S30.25", "S30.32", "S30.33"]
area: "30 Presentation workspace"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S30.25", "S30.32", "S30.33"]
depends_on: ["surface:web", "surface:mobile", "table:studio_library_items", "api:POST /api/artifacts/publish", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-authorization-and-workspaces", "SYS-security-and-privacy", "SYS-sync-and-continuity", "F030-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F030-11 Versions, templates and sharing

A deck is an artifact with versions: every save is a new version, older ones are read-only and can be restored. On web a deck can be saved as a template ('Save as template'), started from 'New from template', and published as a web page link with an audience choice. The brief says none exist; the code shows them on web. Mobile has version history only.

Area: [30. Presentation workspace](README.md). Requirement items: [S30.25](../../10-requirements/capabilities/030-presentation-workspace.md#s3025), [S30.32](../../10-requirements/capabilities/030-presentation-workspace.md#s3032), [S30.33](../../10-requirements/capabilities/030-presentation-workspace.md#s3033).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Keeps deck history with restore, stores reusable deck templates, and publishes a deck as a self-contained HTML page at a shareable link. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1008-1033,2305-2311,2438-2446; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:115-128)

**Why it exists.** So edits can be undone, good decks can be reused, and decks can be shown to people outside the app. The brief wants version history (S30.25), reusable templates (S30.32) and a shareable viewer (S30.33).

**Who uses it.** A signed-in web user for templates and publishing; web and mobile users for version history.

**Problems it solves**

- Undoing a bad AI edit or a deleted slide
- Starting a new deck from a good one
- Sharing a deck without an export file

**Use cases**

- Restore version 2 after an assistant reply broke the deck.
- Save a pitch deck as 'Your templates' and start a new one from it.
- Publish a deck and copy the link.

## 2. User experience

**Where to find it**

- Web versions: version chip with aria-label 'Version N of M. Show version history', 'Previous version', 'Next version', and 'Restore version N' (ArtifactPreview.tsx:2346,2652-2683).
- Web templates: more menu item 'Save as template' (group Keep); menu 'New from template' with groups Presentations, Your templates, and item 'Templates and brands' (ArtifactPreview.tsx:2438-2446; apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx:14,73-92).
- Web sharing: more menu item 'Publish' (ArtifactPreview.tsx:2305-2311); published page at /shared-artifact/{token} (apps/web/app/shared-artifact).
- Mobile versions: ArtifactVersionHistorySheet from full-screen artifact (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:116).
- Desktop Electron: hosted web app (doc: AGENTS.md section 5); a desktop publish adapter exists (apps/desktop/src/features/artifacts/publishAdapter.ts). Chrome, VS Code, CLI: none found.

**Before you start**

- Stored artifact in the web panel for templates and publish (ArtifactPreview.tsx:2438).
- Publishing needs a publish handler from the panel (ArtifactPreview.tsx:2305) and passes the workspace's external sharing policy (apps/web/lib/managed-compute-gate.ts:455-470).
- Signed in.

**Screens and controls**

- Version timeline: chip, previous, next, history list, 'Restore version N' with a confirm 'Restore version N?' button 'Restore' (ArtifactPreview.tsx:1008-1033).
- Save as template dialog (SaveTemplateDialog) with a name; kind 'deck_template' for a deck (ArtifactPreview.tsx:3350-3357).
- 'Templates and brands' library manager (LibraryDialogs.tsx).
- Publish: item shows 'Publishing…' while busy; a bar shows the link and audience choices; toasts 'Published · link copied to clipboard' (ArtifactPreview.tsx:1243-1245).

**Journey**

1. Edit or ask for changes; each save becomes a version.
2. Open the version chip, step through versions; older ones are read-only.
3. Choose 'Restore version N' and confirm; it is added as the newest version and the ones between survive.
4. To reuse: more menu, 'Save as template', name it.
5. To start: 'New from template', pick a built-in ('Pitch deck', 'Project update', 'Lesson') or one under 'Your templates'.
6. To share: more menu, 'Publish'; copy the link; change who can open it.

**What the person sees and gets**

- Restore confirm text: 'This replaces what you are looking at with version N, added as the new latest so the versions in between survive.' (ArtifactPreview.tsx:1014-1015).
- Deleting a slide says 'Slide deleted. Restore the previous version to bring it back.' (PresentationWorkspace.tsx:412).
- Publish toast with copied link; warning text that anyone holding a public link can open it (ArtifactPreview.tsx:1346-1347).

**Settings**

- Published audience: public, organization or invited (packages/contracts/cloud-contracts/src/artifact-index.ts:51-55).
- Workspace policy can turn off public sharing for new publications (apps/web/lib/managed-compute-gate.ts:455-470).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Version history with prev/next, read-only older versions and confirmed restore on web (ArtifactPreview.tsx:944,1008-1033,2652-2683; PresentationWorkspace.test.tsx:225).
- Deck edits (theme, slide actions) are saved as versions (PresentationWorkspace.test.tsx:51; ArtifactPreview.tsx:1153-1158).
- Mobile version sheet with restore callback (ArtifactVersionHistorySheet.tsx:19).
- Deck templates: built-in presentations (Pitch deck, Project update, Lesson) and saved ones through /api/artifacts/library with kind deck_template (apps/web/features/chat/components/artifacts/templates/artifact-templates.ts:206,258,307; packages/contracts/cloud-contracts/src/studio-library.ts:9,44-48).
- Table studio_library_items accepts kind deck_template (apps/web/db/neon/0373_studio_library_items.sql:22).
- Publish converts the deck to HTML and publishes kind 'html' (ArtifactsPanel.tsx:119-127; apps/web/app/api/artifacts/publish/route.ts:22-31).

**Incomplete**

- Version history is the artifact's list, not a deck-specific diff or per-slide history.
- Publishing stores a snapshot of the HTML; whether later edits update the link was not read.
- Published limit: MAX_PUBLISHED_PER_USER; at the limit publishing is refused (apps/web/lib/services/published-artifact-service.ts:59,413-416).

**Present but disconnected or switched off**

- Brief marks S30.25, S30.32 and S30.33 missing on all apps and says 'viewer link: not found'. The code shows all three on web. The brief is stale.

**Not available**

- Mobile: no template save or publish found.
- Chrome, VS Code, CLI: none found.
- Desktop Tauri: only the publish adapter file was found; its deck support was not traced.

## 4. Required behaviour

**Established requirements**

- A deck keeps a version history the user can browse and restore (S30.25). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S30.25)
- The user can save and reuse presentation templates (S30.32). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S30.32)
- The user can share a link that opens the deck in a viewer (S30.33). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S30.33)
- Presentations are versioned objects. (source: doc: docs/product/experience-contract.md:44)
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. After two edits the chip reads 'Version 3 of 3' and older versions show without edit controls.
2. 'Restore version 1' asks first and then adds version 1's content as the newest version.
3. 'Save as template' on a deck makes an item under 'Your templates' in 'New from template'.
4. Starting from a template creates a new deck artifact in the same chat with the template content.
5. 'Publish' on a deck gives a link that opens a page with every slide without the app.
6. Setting the audience to organization or invited stops anonymous opening.
7. When workspace policy turns off public sharing, publishing to a public link is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Template save should offer a name and refuse empty names [inferred from StudioLibraryNameSchema min 1].
- A link should say what it shows: a snapshot or the live deck [inferred; unknown in code read].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a per-slide diff between versions.
- [proposed] Add 'Save as template' and 'Start from template' on mobile.
- [proposed] Offer a preview of the published page before copying the link.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview version UI | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Version chip, read-only rule, requestRestore (944,1008-1033,2652-2683). |
| store | artifacts-store | `apps/web/features/chat/stores/artifacts-store.ts` | getArtifactVersions, restoreArtifactVersion (677-679,976). |
| component | ArtifactsPanel publish handler | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | publishableArtifact turns a deck into HTML (115-128); makePublishHandler (463-496). |
| service | deck-html | `apps/web/features/chat/components/artifacts/presentation/deck-html.ts` | Builds the published HTML. |
| component | NewArtifactMenu | `apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.tsx` | 'New from template' menu. |
| config | artifact-templates | `apps/web/features/chat/components/artifacts/templates/artifact-templates.ts` | Built-in templates (Pitch deck, Project update, Lesson). |
| component | LibraryDialogs / SaveTemplateDialog | `apps/web/features/chat/components/artifacts/library/LibraryDialogs.tsx` | Save as template and manage templates and brands. |
| hook | studio-library-client | `apps/web/features/chat/components/artifacts/library/studio-library-client.ts` | Client store for library items. |
| schema | studio-library contract | `packages/contracts/cloud-contracts/src/studio-library.ts` | Kinds, payload limits (200,000 chars), paths. |
| endpoint | api:/api/artifacts/library | `apps/web/app/api/artifacts/library/route.ts` | List and create library items; item route in [itemId]. |
| table | studio_library_items | `apps/web/db/neon/0373_studio_library_items.sql` | Stores templates and brands per account. |
| endpoint | api:POST /api/artifacts/publish | `apps/web/app/api/artifacts/publish/route.ts` | Publishes content for a link; schema with kind and content up to 1,000,000 characters. |
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | Publishable kinds, quota per user (59-69,413-416). |
| service | published-artifact-publication-policy | `apps/web/lib/services/published-artifact-publication-policy.ts` | Policy checks before publishing (external sharing gate, content inspection). |
| service | external sharing gate | `apps/web/lib/managed-compute-gate.ts` | Refuses new public links when workspace policy forbids (455-470). |
| screen | Published artifact page | `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx` | Viewer for a published link (sandboxed frame). |
| component | ArtifactVersionHistorySheet | `apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx` | Mobile version history and restore. |
| service | desktop publishAdapter | `apps/desktop/src/features/artifacts/publishAdapter.ts` | publishArtifact callback for the desktop artifact panel (deck handling not read). |
| test | NewArtifactMenu.test.tsx | `apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.test.tsx` | Template menu tests. |
| test | LibraryDialogs.test.tsx | `apps/web/features/chat/components/artifacts/library/LibraryDialogs.test.tsx` | Library dialogs tests. |
| test | route.test.ts (library) | `apps/web/app/api/artifacts/library/route.test.ts` | Library API tests. |
| test | route.test.ts (publish) | `apps/web/app/api/artifacts/publish/route.test.ts` | Publish API tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Each save writes the new content as a new version in the client artifacts store. | device | ArtifactPreview.tsx:1153-1158; artifacts-store.ts:677-679 |
| Restore adds the old content as the newest version after a confirm. | device | ArtifactPreview.tsx:1008-1033; artifacts-store.ts:976 |
| Save as template posts name and content to the library endpoint. | our servers | studio-library-client.ts:1-60; studio-library.ts:44-48 |
| Publish builds the deck HTML in the browser, then posts it to the publish endpoint, which checks policy, quota and content, then stores it and returns a link. | device and our servers | ArtifactsPanel.tsx:119-127,476-492; publish/route.ts:45-70 |
| A viewer of the link loads the published page and renders it in a sandboxed frame. | our servers | apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:9 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Deck versions | Client artifacts store | unknown (sync path not read) | Older versions stay when restoring |
| Template item | table:studio_library_items | Server is the source; client keeps a cache | Deleted by the owner through the library manager [inferred from [itemId] route] |
| Published deck HTML and audience | Published artifact records on our servers (table name not read) | Link opens for any permitted viewer | Unpublish exists in the panel (not read in detail); existing links stay when policy changes (managed-compute-gate.ts:460-466) |

**Models and providers.** No model takes part in versions, templates or publishing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in for templates and publishing (user scoped database in publish/route.ts:45). |
| Permissions | Only editors can save over a latest version; older versions are read-only (ArtifactPreview.tsx:1959). Workspace policy can forbid new public links (managed-compute-gate.ts:455-470). |
| Subscription | none found in the code for templates or version history; publishing is limited by a per-user count (published-artifact-service.ts:59,413). Plan-based rules: none found in the files read. |
| Limits and metering | Template content up to 200,000 characters; published content up to 1,000,000 characters; published count per user capped; rate limit class 'share-create' on publish (publish/route.ts:34). |
| Feature flags | none found in the code |
| Model compatibility | Not model related. |
| Provider restrictions | none found in the code |
| Local mode | Version history works on the device. Templates and publishing need our servers. Web has no Local mode surface in the files read; mobile local use of versions is on device (store), publishing none found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Older version shown | No editing controls; restore offered | PresentationWorkspace.test.tsx:225; ArtifactPreview.tsx:2343-2348 |
| Restore with unsaved edits | Confirm text adds 'Your unsaved edits are discarded.' | ArtifactPreview.tsx:1010-1018 |
| Library load failure | State 'failed'; message 'Your templates could not be loaded' | studio-library-client.ts:25,53-60 |
| Publish while another is running | Error 'A publication change is already in progress.' | ArtifactsPanel.tsx:472 area (operation.pending check) |
| Publish quota reached | Error 'You already have N published artifacts. Unpublish one before publishing another.' | published-artifact-service.ts:413-416 |
| Public sharing turned off | New public publication refused; existing links stay | managed-compute-gate.ts:455-470 |
| Offline / retry / timeout | not handled in the code read beyond error toasts | not found |
| Accessibility | Version buttons have aria-labels; restore uses a confirm dialog | ArtifactPreview.tsx:2652-2683 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx`: Theme saved as a version; no editing controls on a read-only version.
- `apps/web/features/chat/components/artifacts/templates/NewArtifactMenu.test.tsx`: New from template menu.
- `apps/web/features/chat/components/artifacts/library/LibraryDialogs.test.tsx`: Save template and library dialogs.
- `apps/web/features/chat/components/artifacts/library/ArtifactPreview.brand.test.tsx`: Brands in the deck preview.
- `apps/web/app/api/artifacts/library/route.test.ts`: Library API.
- `apps/web/app/api/artifacts/publish/route.test.ts`: Publish API.
- `apps/web/features/chat/components/artifacts/publishArtifactClient.publish.test.ts`: Publish client.
- `apps/web/app/shared-artifact/[token]/PublishedArtifactView.test.tsx`: Published page view.

**Test scenarios**

- **Restore after delete**
  1. Delete slide 2 from the Slide menu
  2. Open the version chip and pick the previous version
  3. Choose 'Restore version N' and confirm
  - Expected: Slide 2 is back; a new latest version exists; the delete version still exists.
- **Save and use a template**
  1. Open a deck
  2. More menu, 'Save as template', name it
  3. Open 'New from template'
  - Expected: The name appears under 'Your templates'; choosing it creates a deck with the same slides.
- **Publish and open**
  1. More menu, 'Publish'
  2. Open the link in a private window
  - Expected: A page shows every slide; audience setting is honoured.
- **Policy block**
  1. Turn off public sharing in the workspace
  2. Publish with a public audience
  - Expected: Publication is refused; an old link still opens.
- **Quota**
  1. Reach the published limit
  2. Publish once more
  - Expected: Message asking to unpublish one first.
- **Mobile history**
  1. Open a deck on mobile after an assistant edit
  2. Open version history and restore
  - Expected: Older version restored as newest.

**Where to look when it fails**

- Table studio_library_items; table artifact_comments is unrelated.
- Error name PublishedArtifactQuotaError; rate limit class 'share-create'.
- Audit event recording in publish/route.ts (recordAuditEvent import).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/030-presentation-workspace.md](../../70-qa/test-plans/web/030-presentation-workspace.md)
- Desktop: [70-qa/test-plans/desktop/030-presentation-workspace.md](../../70-qa/test-plans/desktop/030-presentation-workspace.md)
- Mobile: [70-qa/test-plans/mobile/030-presentation-workspace.md](../../70-qa/test-plans/mobile/030-presentation-workspace.md)

## 10. Gaps and dependencies

- **Brief says versions, templates and viewer link are missing; code exists on web** Affects: Planning and tests. Evidence: ArtifactPreview.tsx:2305,2438; artifact-templates.ts:206. Work needed: Correct the brief after a human run.
- **Templates and publish are not on mobile** Affects: Mobile users. Evidence: No template or publish code in apps/mobile deck viewer. Work needed: Decide scope and build or mark out of scope.
- **No deck-specific version view (per-slide diff)** Affects: Web and mobile. Evidence: Versions are whole-content lists. Work needed: Optional diff view.
- **Whether the published link is a snapshot or follows edits is not stated in the interface** Affects: Publishers. Evidence: ArtifactsPanel.tsx:119-127 builds HTML at publish time. Work needed: Say so near the link.
- **Chrome, VS Code, CLI have no versions, templates or sharing for decks** Affects: Those apps. Evidence: No code found. Work needed: Decide scope.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- table:studio_library_items
- api:POST /api/artifacts/publish
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- SYS-sync-and-continuity
- F030-10

## Unknown

- Whether version history is synced to our servers or lives only in the browser store.
- Whether a published deck link updates when the deck changes.
- Exact audience names shown to the user (enum is public, organization, invited).
- Which table stores published artifacts.
- Whether desktop Tauri publishes decks through publishAdapter.ts.
- Whether mobile keeps versions on device or from the server.
