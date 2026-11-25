---
id: "F033-05"
type: "feature"
title: "Unpublish and delete"
aliases: ["Unpublish", "Delete site and its data", "Take it down", "Unpublish artifact", "Delete app and associated data (S33.30)", "agi artifacts unpublish"]
area: "33 Generated Sites and published applications"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S33.24", "S33.30"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:desktop", "mode:cloud", "table:published_artifacts", "table:published_artifact_storage", "table:published_artifact_versions", "table:published_artifact_viewers", "api:DELETE /api/artifacts/publish/[token]", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-sync-and-continuity", "F033-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F033-05 Unpublish and delete

Takes a published page offline for good. The owner confirms in a dialog that says the link stops working and visitor data is deleted. The server deletes the publication, and its versions, invited list, workspace grant and saved visitor data go with it. Deleting a chat also unpublishes pages made in it. Available on web, mobile and the CLI.

Area: [33. Generated Sites and published applications](README.md). Requirement items: [S33.24](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3324), [S33.30](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3330).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Deletes the published_artifacts row owned by the caller. Dependent rows are removed by database cascade (published-artifact-service.ts:563-579; migrations 0257, 0325, 0372, 0184).

**Why it exists.** Owners must be able to withdraw a link, and a deleted chat must not leave public pages behind.

**Who uses it.** Owners who shared by mistake, finished a campaign, or are cleaning up.

**Problems it solves**

- A leaked or wrong link stays live.
- Leftover visitor data after a page is retired.
- Pages surviving after their chat is deleted.

**Use cases**

- Unpublish a page that exposed the wrong content.
- Delete a site and the data its visitors saved.
- Free a slot when at the 200 cap.
- Delete a conversation and know its pages go offline.

## 2. User experience

**Where to find it**

- Web Settings, published list: button 'Unpublish' per row, then a dialog 'Unpublish this artifact?' (apps/web/features/settings/sections/PublishedArtifactsSection.tsx:88-100, 644).
- Web Sites page: card menu item 'Unpublish', dialog 'Unpublish “<name>”?' (apps/web/features/sites/components/SiteCard.tsx:92-97; apps/web/features/sites/hooks/useSiteActions.ts:126-149).
- Mobile artifact screen: button 'Unpublish' with alert 'Unpublish this artifact?' (apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx:117-143, 222).
- Mobile Site screen: section 'Take it down' with 'Unpublish' and 'Delete site and its data'; also 'Clear shared data' (apps/mobile/src/features/sites/SiteDetailScreen.tsx:170-222, 445-460).
- CLI: agi artifacts unpublish <id> [-y] [--json] (apps/cli/src/lib.rs:1423-1431; 4020-4045).
- Desktop (Electron): through the web app.
- VS Code and Chrome: none found.

**Before you start**

- The person owns the publication.
- Signed in to AGI Cloud.

**Screens and controls**

- Confirm dialogs naming the consequence: the link stops working at once, saved visitor data is deleted, this cannot be undone.
- Web toast after success: 'Unpublished “<name>”. The link no longer works.' (useSiteActions.ts:144).
- CLI confirm prompt: 'Unpublish artifact <id>? Its link stops working for everyone who has it, and publishing again mints a different one. This cannot be undone.'

**Journey**

1. Open the list or the artifact.
2. Choose Unpublish (or Delete site and its data on mobile).
3. Read the consequence and confirm.
4. The app sends DELETE.
5. The page and its data are gone; the list updates.

**What the person sees and gets**

- Success toast or alert; list row disappears; mobile returns to the Sites list.
- Failure messages: 'Could not confirm whether the artifact was unpublished. Reload the list to check.' and 'Could not unpublish'.
- CLI prints 'Unpublished artifact <id>. Its share link no longer resolves.'

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- DELETE /api/artifacts/publish/[token] deletes where token and owner match and returns success, or 404 when nothing matched (apps/web/app/api/artifacts/publish/[token]/route.ts:58-80; published-artifact-service.ts:563-579).
- Cascade deletes versions, invited emails, workspace grants and saved app data (migrations 0257:53-56, 0325:3-6, 0372, 0184:77-78).
- Deleting a conversation, many conversations or syncing a deletion unpublishes the pages made in them (apps/web/app/api/chat/conversations/[id]/route.ts:545; apps/web/app/api/chat/conversations/bulk/route.ts:94; apps/web/app/api/chat/sync/route.ts:696; published-artifact-service.ts:581-596).
- Confirmation on web, mobile and CLI (PublishedArtifactsSection.tsx:88-100; PublishedArtifactControls.tsx:117-124; lib.rs:4028-4036).
- Mobile can clear shared data first and then unpublish (service.ts:296-303).
- CLI resolves the artifact to its token and unpublishes it (apps/cli/src/cloud/artifacts.rs:585-588).

**Incomplete**

- Unpublish is a hard delete with no Trash or undo; AGENTS.md section 9 asks for Trash for agent-initiated deletes, but this is an explicit user action that names what is lost (published-artifact-service.ts:563-579).
- The DELETE route is not wrapped in the CORS helper, unlike GET (token route.ts:212-215); native apps are unaffected.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Mobile web-style Settings list: mobile uses its own screens.
- VS Code and Chrome: none found.
- Undo or recovery of an unpublished page: none; publishing again mints a new link (CLI prompt text).

## 4. Required behaviour

**Established requirements**

- The owner can take the site offline (brief S33.24) and deleting an app removes it and its associated data (S33.30). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.24, S33.30)
- An irreversible action asks first and the question names the consequence. (source: AGENTS.md section 9)
- The server deletes the row only when the owner matches. (source: apps/web/lib/services/published-artifact-service.ts:563-579)
- Deleting a conversation also unpublishes the pages made in it. (source: apps/web/app/api/chat/conversations/bulk/route.ts:94; apps/web/app/api/chat/sync/route.ts:696)
- A token that is not the owner's returns not found. (source: apps/web/app/api/artifacts/publish/[token]/route.ts:73-75)

**Acceptance criteria**

1. Pressing Unpublish shows a dialog that states the link stops working and data is deleted; Cancel changes nothing.
2. After confirming, the old link shows the unavailable page.
3. The row and its versions, viewers and saved data no longer exist.
4. Another account calling DELETE with the token gets 404.
5. Deleting the source chat makes the link unavailable.
6. The CLI asks to confirm unless -y is given.
7. Publishing the same artifact afterwards produces a different token.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Both the mobile 'Unpublish' and 'Delete site and its data' end in the same server delete; the extra step only clears shared data first. [inferred from service.ts:296-303 and the shared consequence text]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Keep a short-lived Recently deleted copy for pages so an accidental unpublish can be undone.
- [proposed] Add the CORS wrapper to DELETE and PATCH only if a browser client on another origin needs them.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | DELETE /api/artifacts/publish/[token] | `apps/web/app/api/artifacts/publish/[token]/route.ts` | Unpublish route with CSRF and rate limit. |
| service | unpublishArtifactRecord | `apps/web/lib/services/published-artifact-service.ts` | Owner-bound delete (563-579). |
| service | unpublishArtifactsForConversations | `apps/web/lib/services/published-artifact-service.ts` | Delete pages of deleted conversations (581-596). |
| endpoint | conversation delete routes | `apps/web/app/api/chat/conversations/[id]/route.ts` | Calls unpublish on delete (545). |
| endpoint | bulk conversation delete | `apps/web/app/api/chat/conversations/bulk/route.ts` | Calls unpublish for many (94). |
| endpoint | chat sync | `apps/web/app/api/chat/sync/route.ts` | Unpublish on synced deletions (696). |
| table | published_artifact_storage | `apps/web/db/neon/0325_published_artifact_storage.sql` | Visitor-saved data; cascade on delete. |
| table | published_artifact_versions | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Versions; cascade on delete. |
| table | published_artifact_viewers | `apps/web/db/neon/0372_published_site_viewers.sql` | Invited list; cascade on delete. |
| component | PublishedArtifactsSection | `apps/web/features/settings/sections/PublishedArtifactsSection.tsx` | Web Settings unpublish button and confirm. |
| hook | useSiteActions | `apps/web/features/sites/hooks/useSiteActions.ts` | Web Sites unpublish confirm and toast. |
| service | unpublishArtifact web client | `apps/web/features/sites/services/sites-service.ts` | DELETE call with receipt check (248-270). |
| component | PublishedArtifactControls | `apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx` | Mobile unpublish alert and button. |
| screen | SiteDetailScreen | `apps/mobile/src/features/sites/SiteDetailScreen.tsx` | Take it down section. |
| service | mobile sites service | `apps/mobile/src/features/sites/service.ts` | unpublishSite, clearSiteSharedData, deleteSiteAndData (258-310). |
| command | agi artifacts unpublish | `apps/cli/src/lib.rs` | CLI command and confirm (1423-1431, 4020-4045). |
| service | cli unpublish | `apps/cli/src/cloud/artifacts.rs` | DELETE call (585-588). |
| test | unpublish tests | `apps/web/features/sites/hooks/useSiteActions.unpublish.test.tsx` | Web unpublish hook. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Owner selects Unpublish; a dialog states the consequence and asks to confirm. | device | PublishedArtifactsSection.tsx:88-100; useSiteActions.ts:126-149 |
| Client sends DELETE to /api/artifacts/publish/<token>. | device | apps/web/features/sites/services/sites-service.ts:248-270 |
| Server checks token shape, CSRF, rate limit and user scope. | our servers | token route.ts:58-72 |
| Server deletes the row where token and user_id match; the database cascades to versions, viewers, grants and saved data. | our servers | published-artifact-service.ts:563-579; migration cascades |
| Server returns success with the token, or 404; client validates the receipt and updates the list. | our servers | token route.ts:74-80 |
| On conversation deletion the server deletes publications for those conversation ids in the same flow. | our servers | conversations/[id]/route.ts:545; bulk/route.ts:94; sync/route.ts:696 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Publication and dependent rows | tables published_artifacts, published_artifact_versions, published_artifact_viewers, organization_shared_artifacts, published_artifact_storage | Server only | Permanently deleted; no Trash or recovery path found. |
| Audit record of the change | security audit log (viewer changes and publish write events exist; an unpublish audit event was not seen in the handler) | No | unknown |
| Original artifact in the chat | conversation on the device or server | Unchanged | Stays; mobile text says 'The original artifact stays in its chat.' |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required. |
| Permissions | Owner only; foreign tokens return 404. |
| Subscription | none found in the code |
| Limits and metering | share-create rate limit 5 per minute applies to DELETE (token route.ts:66-69). Unpublishing frees a slot under the 200 cap. |
| Feature flags | none found in the code |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | Not applicable; nothing is published in Local mode, and mobile Site screens require Cloud (SiteDetailScreen.tsx:226-236). CLI needs managed mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Confirm | Destructive dialog with named consequence on web and mobile; CLI prompt unless -y. | PublishedArtifactsSection.tsx:94-96; lib.rs:4028-4036 |
| Cancel | CLI prints 'Left the artifact published.'; web and mobile do nothing. | lib.rs:4037-4040 |
| Busy | Buttons show 'Unpublishing…' and disable while running. | PublishedArtifactsSection.tsx:644; PublishedArtifactControls.tsx:222 |
| Not found | Server returns 404 'Published artifact not found'; mobile site screen shows 'This site is not available'. | token route.ts:74-76; SiteDetailScreen.tsx:252-254 |
| Uncertain | 'Could not confirm whether the artifact was unpublished. Reload the list to check.' | PublishedArtifactsSection.tsx:288 |
| Retry | Retrying after a confirmed delete returns 404; harmless. | token route.ts:74-76 [inferred] |
| Offline | not handled in the code beyond error messages. | searched the listed files |
| Accessibility | Dialogs come from the shared useConfirmAction; mobile uses native alerts. | PublishedArtifactsSection.tsx:85-100; PublishedArtifactControls.tsx:117-124 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/sites/hooks/useSiteActions.unpublish.test.tsx`: Web unpublish hook (by file name).
- `apps/web/features/sites/services/sites-service.unpublish.test.ts`: Web unpublish client (by file name).
- `apps/web/app/api/artifacts/publish/[token]/route.test.ts`: Token route including unpublish (by file name).
- `apps/web/features/settings/sections/PublishedArtifactsSection.authority.test.tsx`: Settings section authority (by file name).
- `apps/web/e2e/sites.spec.ts`: Browser spec: unpublish and cancelled unpublish (no recorded run).
- `apps/mobile/src/features/sites/__tests__/Sites.test.tsx`: Mobile Sites flows (by file name).
- `apps/web/lib/services/published-artifact-service.test.ts`: Service logic (by file name).

**Test scenarios**

- **Confirm and unpublish on web**
  1. Publish, open Settings, press Unpublish, confirm.
  - Expected: Row disappears; old link shows the unavailable page.
- **Cancel**
  1. Press Unpublish, then Cancel.
  - Expected: Page stays live.
- **Data removal**
  1. Publish an app that saves data for visitors.
  2. Save data as a visitor.
  3. Unpublish.
  - Expected: Rows for that page in published_artifact_storage are gone.
- **Chat deletion**
  1. Publish from a Cloud chat.
  2. Delete the chat.
  - Expected: Link becomes unavailable.
- **Foreign token**
  1. Call DELETE with another user's token.
  - Expected: 404.
- **CLI**
  1. agi artifacts unpublish <id>, answer no; then rerun with -y.
  - Expected: First leaves it published; second prints it was unpublished.

**Where to look when it fails**

- Server returns 404 'Published artifact not found' on a miss.
- Check the five tables for the publication id.
- Mobile SiteMutationUncertainError message 'This site unpublish could not be confirmed.'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/web/033-generated-sites-and-published-applications.md)
- Desktop: [70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md)
- Mobile: [70-qa/test-plans/mobile/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/mobile/033-generated-sites-and-published-applications.md)
- CLI: [70-qa/test-plans/cli/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/cli/033-generated-sites-and-published-applications.md)

## 10. Gaps and dependencies

- **No Trash or undo for unpublished pages** Affects: Owners who unpublish by mistake. Evidence: published-artifact-service.ts:563-579 hard delete. Work needed: Product decision on a recently deleted holding period.
- **No audit event seen for unpublish** Affects: Operations. Evidence: handleUnpublish (token route.ts:58-80) has no recordAuditEvent call, while publish and viewers changes do. Work needed: Add an audit event if wanted.
- **Mobile 'Unpublish' and 'Delete site and its data' look different but erase the same data** Affects: Mobile users. Evidence: SiteDetailScreen.tsx:170-200. Work needed: Clarify copy or merge the two actions.
- **VS Code and Chrome have no unpublish** Affects: Those apps. Evidence: No code found. Work needed: Decision.
- **Brief says mobile unpublish missing but controls exist** Affects: Documentation. Evidence: PublishedArtifactControls.tsx:117-143; SiteDetailScreen.tsx:445-460. Work needed: Update brief.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- mode:cloud
- table:published_artifacts
- table:published_artifact_storage
- table:published_artifact_versions
- table:published_artifact_viewers
- api:DELETE /api/artifacts/publish/[token]
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-sync-and-continuity
- F033-01

## Unknown

- Whether an audit event is written on unpublish anywhere else (middleware or audit coverage registry apps/web/lib/services/audit-coverage/registry.ts mentions versions paths; not read in full).
- Whether account deletion removes publications (not read).
- How the CLI confirm behaves non-interactively without -y.
- Whether Electron desktop adds anything beyond the web controls.
