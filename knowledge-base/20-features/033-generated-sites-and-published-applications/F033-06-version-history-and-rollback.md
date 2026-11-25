---
id: "F033-06"
type: "feature"
title: "Version history and rollback"
aliases: ["Publish history", "Versions", "Put live", "Restore", "Rollback (S33.23)", "Deployment history (S33.09)", "Restore version (local artifact)", "Version restore"]
area: "33 Generated Sites and published applications"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S33.09", "S33.23"]
depends_on: ["surface:web", "surface:mobile", "mode:cloud", "table:published_artifacts", "table:published_artifact_versions", "api:GET /api/artifacts/publish/[token]/versions", "api:POST /api/artifacts/publish/[token]/versions/[version]", "store:artifacts-store", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "F033-01", "F033-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F033-06 Version history and rollback

Every changed publish is kept as a numbered version. The owner can list versions and put an older one live again; it becomes a new latest version, so nothing is lost. Web and mobile Site screens do this against the server. A separate Restore version in the artifact panel only changes the local artifact. The CLI has none.

Area: [33. Generated Sites and published applications](README.md). Requirement items: [S33.09](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3309), [S33.23](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3323).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Stores each distinct published content as a version row and lets the owner copy an old version back into the live page, recording it as a new version (published-artifact-service.ts:871-955; :500-561).

**Why it exists.** A bad republish should be reversible without rebuilding the page, and the link must stay the same.

**Who uses it.** Owners of published pages, mostly on web and mobile.

**Problems it solves**

- A republish broke the page.
- Needing to see what was live earlier.
- Not wanting to change the link to roll back.

**Use cases**

- Put version 2 live after version 3 broke.
- Check when a page last changed.
- Compare by opening an old version's content through the API.
- Restore a local artifact edit in chat before republishing.

## 2. User experience

**Where to find it**

- Web Settings, published list: 'Publish history for <name>' button listing versions with 'Live now' and 'Put live' (apps/web/features/settings/sections/PublishedArtifactsSection.tsx:651-700).
- Web Sites page: site detail, Settings tab, section 'Versions' ('Each publish is kept. Restoring one republishes it as the newest.') with 'Restore' per older version and 'Live' on the current one (apps/web/features/sites/components/SiteSettingsTab.tsx:319-380).
- Mobile Site screen: section 'Publish history' with 'Version N · Live' and a 'Put live' button (apps/mobile/src/features/sites/SiteDetailScreen.tsx:371-402).
- Web artifact panel: menu item 'Restore version N' on an older local version, with dialog 'Restore version N?' (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1008-1036; 2345-2349). This restores the local artifact, not the published page.
- Mobile artifact screen: 'Restore' on an older local version (ArtifactFullScreen.tsx:811-835; 1517-1530). Same local meaning.
- CLI: none. VS Code and Chrome: none found.

**Before you start**

- The page has been published at least once; more than one version exists to restore.
- Signed in on web or Cloud mode on mobile.

**Screens and controls**

- Version list rows: 'Version N', 'Published <relative time>', 'Live' badge, Restore or Put live button.
- Message after restore: toast 'Version N is live again'; note 'Restore confirmed. Refresh the site details before restoring another version.' (SiteSettingsTab.tsx:296-326).
- Empty: 'No earlier versions.'; loading: 'Loading versions…'.

**Journey**

1. Open the site's version list.
2. Pick an older version.
3. Press Restore or Put live.
4. The server copies that version into the live page and adds a new latest version.
5. The list shows the new version as Live.

**What the person sees and gets**

- Toast 'Version N is live again' on web; mobile refreshes the list.
- Errors 'Failed to restore that version', 'Could not put that version live.', 'Could not confirm whether that version was put live. Reload the list and history to check.'
- API returns token, shareUrl, version, kind, title, visibility.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Version recording: a version row is added when content, title, kind or language differs from the newest; identical republish keeps the same number (published-artifact-service.ts:871-955).
- List versions with live flag, read one version, restore one (apps/web/app/api/artifacts/publish/[token]/versions/route.ts; versions/[version]/route.ts:46 and :133).
- Restore re-runs sharing policy, moderation and secret redaction on the old content, updates the live row, records a new version, writes an audit event named version_restored (versions/[version]/route.ts:76-133).
- Web Settings 'Put live', web Sites 'Restore', and mobile 'Put live' call the restore route (apps/web/features/sites/services/sites-service.ts:216-246; apps/mobile/src/features/sites/service.ts:196-212).
- Unknown version returns 404 'Published version not found' (versions/[version]/route.ts:36-50).

**Incomplete**

- Restore on web Sites and mobile has no confirmation dialog; it acts on press (SiteSettingsTab.tsx:280-326).
- After a restore, the web version panel locks until site details are refreshed (SiteSettingsTab.tsx:324-326).
- No cap or pruning of versions was found; growth is unbounded apart from the 1,000,000-character content limit per version.

**Present but disconnected or switched off**

- The 'Restore version N' item in the web artifact panel and 'Restore' on mobile act on the local artifact store and do not touch the live published page (ArtifactPreview.tsx:1008-1036; ArtifactFullScreen.tsx:811-835).

**Not available**

- CLI version list or restore: none (apps/cli/src/lib.rs:1359-1430).
- Diff between versions: none found.
- VS Code and Chrome: none found.

## 4. Required behaviour

**Established requirements**

- The user can see the history of deployments (brief S33.09) and roll the live site back to an earlier version (S33.23). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.09, S33.23)
- Each new distinct content adds a version; an identical republish does not. (source: apps/web/lib/services/published-artifact-service.ts:871-955)
- A restore copies the old version into the live page and records it as a new version. (source: apps/web/lib/services/published-artifact-service.ts:500-561)
- An unknown version returns not found. (source: apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:36-50)
- A code change gets a checkpoint and versions survive in between restores. (source: AGENTS.md section 9; ArtifactPreview.tsx:1015-1016 (restore adds a new latest so versions in between survive))

**Acceptance criteria**

1. Publishing changed content three times shows versions 1, 2, 3 with 3 live.
2. Republishing unchanged content does not add a version.
3. Putting version 1 live makes the page show version 1's content, adds version 4 and keeps 2 and 3.
4. Restoring a version number that does not exist returns 404.
5. A restore of content that now trips moderation or secret rules is refused or redacted like a publish.
6. Another account cannot list or restore the versions (404).
7. On web, 'Restore version N' in the artifact panel changes only the local artifact; the link keeps showing the old live content until Publish.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Restoring the version equal to the newest returns that version without adding one, by the same equality rule. [inferred from recordPublishedVersion]
- The brief's mobile done and CLI missing hold for server restore on mobile (Site screen) and the CLI. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a confirm dialog on web Sites and mobile restore, naming that the live page changes now.
- [proposed] Add agi artifacts versions and restore.
- [proposed] Cap or prune old versions once the founder sets retention.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | recordPublishedVersion | `apps/web/lib/services/published-artifact-service.ts` | Appends a version unless identical to newest; moves the live pointer (871-955). |
| service | restorePublishedArtifactRecord | `apps/web/lib/services/published-artifact-service.ts` | Updates live content from a snapshot and records a version (500-561). |
| service | list, read and restore-source readers | `apps/web/lib/services/published-artifact-service.ts` | listPublishedArtifactVersions (971), readPublishedArtifactVersion (1002), readPublishedArtifactRestoreSource (1031). |
| endpoint | GET /api/artifacts/publish/[token]/versions | `apps/web/app/api/artifacts/publish/[token]/versions/route.ts` | Version list for the owner. |
| endpoint | GET and POST /api/artifacts/publish/[token]/versions/[version] | `apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts` | Read one version; restore one. |
| table | published_artifact_versions | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Append-only snapshots with parent version pointer, owner row-level security. |
| table | published_artifacts.version | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Column pointing at the live version number. |
| service | publication policy | `apps/web/lib/services/published-artifact-publication-policy.ts` | Checks restored content (moderation, redaction, sharing gate). |
| service | sites-service versions | `apps/web/features/sites/services/sites-service.ts` | listPublishedArtifactVersions (178), read (201), republishArtifactVersion (216). |
| component | SiteSettingsTab | `apps/web/features/sites/components/SiteSettingsTab.tsx` | Versions list with Restore (280-380). |
| component | PublishedArtifactsSection | `apps/web/features/settings/sections/PublishedArtifactsSection.tsx` | Publish history with Put live (651-700). |
| screen | SiteDetailScreen | `apps/mobile/src/features/sites/SiteDetailScreen.tsx` | Mobile Publish history with Put live (371-402). |
| service | mobile sites service versions | `apps/mobile/src/features/sites/service.ts` | listSiteVersions and republishSiteVersion (180-212). |
| component | ArtifactPreview restore | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Local 'Restore version N' dialog (1008-1036). |
| store | artifacts-store restoreArtifactVersion | `apps/web/features/chat/stores/artifacts-store.ts` | Local artifact version restore (976). |
| screen | ArtifactFullScreen restore | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Local version restore (811-835). |
| schema | version contracts | `packages/contracts/cloud-contracts/src/artifact-index.ts` | Version list, detail and restore receipt schemas and path helpers. |
| test | restore route test | `apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.restore.test.ts` | Restore route behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client loads the version list: GET versions for the token. | device | apps/web/features/sites/services/sites-service.ts:178-200 |
| Server lists snapshots newest first and marks the one equal to the live pointer. | our servers | published-artifact-service.ts:971-1000 |
| Owner presses Restore or Put live; client POSTs to versions/<n>. | device | sites-service.ts:216-246; mobile service.ts:196-212 |
| Server checks token and version, CSRF and rate limit, reads the snapshot with the live row. | our servers | versions/[version]/route.ts:94-133 (handleRestoreVersion) |
| Server runs the publication policy on the old content, then updates the live row and records a new version in one transaction. | our servers | versions/[version]/route.ts; published-artifact-service.ts:500-561 |
| Server writes an audit event status version_restored and returns the receipt; client confirms the token matches or reports an uncertain restore. | our servers | versions/[version]/route.ts; sites-service.ts:239-243 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Version snapshot rows (title, kind, language, content, parent version) | table published_artifact_versions | Server only | Kept until the publication is deleted (cascade); no pruning found. |
| Live version pointer | column version of published_artifacts | Server only | Updated on every publish or restore. |
| Local artifact versions (edit history) | web artifacts store (versionsById) and the mobile artifact store on the device | Local; not part of the published page (packages/platform/artifacts/src/artifacts.ts:60-63) | As the local stores keep them. |

**Models and providers.** No model or provider takes part in versioning or restore.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required; routes use the user-scoped database and read only the caller's publication. |
| Permissions | Owner only; row-level security on versions limits reads and inserts to the owner (migration 0257). |
| Subscription | none found in the code |
| Limits and metering | Restore uses the share-create limit of 5 per minute; list and read use chat-conversation. Each version is bounded by the 1,000,000-character limit; no version count limit found. |
| Feature flags | none found in the code |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | Server history needs Cloud. Local artifact version restore (the panel item) works with no account because it only edits the local store. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading versions…' and 'Loading the publish history…'. | SiteSettingsTab.tsx:335-343; PublishedArtifactsSection.tsx:659 |
| Empty | 'No earlier versions.' | SiteSettingsTab.tsx:344 |
| Success | Toast 'Version N is live again'; list marks the new Live. | SiteSettingsTab.tsx:296-300 |
| Error | Messages 'Failed to restore that version' and 'Failed to load the versions of this site'. | SiteSettingsTab.tsx:265; :305 |
| Uncertain | 'This version restore could not be confirmed. It may have taken effect. Refresh to check before trying again.' | sites-service.ts:239-243 |
| Unknown version | 404 'Published version not found'. | versions/[version]/route.ts:36-50 |
| Publication gone | Restore returns 409 'This publication is no longer available to restore.' | versions/[version]/route.ts (restored null branch) |
| Cancel | not handled in the code for server restore because there is no confirm; the local panel restore has Cancel. | SiteSettingsTab.tsx:280-326; ArtifactPreview.tsx:1008-1036 |
| Offline | not handled in the code beyond error states. | searched listed files |
| Accessibility | Version list has aria-label 'Versions'; mobile Put live has an accessibility label 'Put version N live'. | SiteSettingsTab.tsx:346; SiteDetailScreen.tsx:394 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/artifacts/publish/[token]/versions/__tests__/route.test.ts`: Version list route (by file name).
- `apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.restore.test.ts`: Restore route (by file name).
- `apps/web/lib/services/published-artifact-publication-policy.restore.test.ts`: Policy applied to a restore (by file name).
- `apps/web/features/sites/services/sites-service.restore.test.ts`: Web restore client (by file name).
- `apps/web/features/sites/components/__tests__/SiteSettingsTab.restore.test.tsx`: Web version restore UI (by file name).
- `apps/web/features/sites/components/__tests__/SiteSettingsTab.lifetime.test.tsx`: Version panel lifetime (by file name).
- `apps/mobile/src/features/sites/__tests__/Sites.test.tsx`: Mobile Sites including versions and version 1 restore path.
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.versions.test.tsx`: Local version history on mobile (by file name).
- `apps/web/lib/services/__tests__/published-artifact-service.transactions.test.ts`: Transactional publish and version writes (by file name).

**Test scenarios**

- **Versions grow only on change**
  1. Publish content A, then A again, then B.
  - Expected: Versions 1 and 2 only; A twice gives one version.
- **Restore an older version**
  1. Have versions 1 to 3.
  2. Put version 1 live from Site settings.
  - Expected: Live page shows version 1 content; list shows version 4 live; 2 and 3 remain.
- **Local restore is not live**
  1. In the artifact panel, open version 1 and choose 'Restore version 1'.
  2. Open the public link.
  - Expected: Link still shows the old live content until Publish is pressed.
- **Unknown version**
  1. POST .../versions/99.
  - Expected: 404 'Published version not found'.
- **Policy on restore**
  1. Restore a version whose content now trips secret redaction.
  - Expected: Content is redacted or the restore is refused per policy.
- **Mobile Put live**
  1. Cloud mode, Sites, open a site with two versions, tap Put live.
  - Expected: List refreshes and the chosen content is live as a new version.

**Where to look when it fails**

- Error 'Published artifact history version did not match the write' and 'Published artifact version pointer was not updated' (service) point to a write race.
- Tables published_artifact_versions and published_artifacts.version.
- Audit events with status version_restored.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/web/033-generated-sites-and-published-applications.md)
- Desktop: [70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md)
- Mobile: [70-qa/test-plans/mobile/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/mobile/033-generated-sites-and-published-applications.md)

## 10. Gaps and dependencies

- **CLI has no version list or restore** Affects: CLI users. Evidence: apps/cli/src/lib.rs:1359-1430 has no such command. Work needed: Add commands against the existing routes.
- **Two different 'restore' meanings share similar labels (local artifact versus published page)** Affects: Web and mobile users. Evidence: ArtifactPreview.tsx:1008-1036 versus SiteSettingsTab.tsx:280-326. Work needed: Clarify copy, for example 'Restore this edit' versus 'Put live'.
- **Server restore has no confirm dialog** Affects: Web Sites and mobile users. Evidence: SiteSettingsTab.tsx:280-326; SiteDetailScreen.tsx:386-400. Work needed: Add a consequence dialog; it changes the public page at once.
- **No retention or pruning for versions** Affects: Storage. Evidence: No limit found in recordPublishedVersion. Work needed: Founder-approved retention.
- **Brief says mobile restore is local only** Affects: Documentation. Evidence: mobile service.ts:196-212 posts to the server. Work needed: Update brief; mobile Site screen restores the live page.
- **The platform module comment says earlier published revisions are not addressable** Affects: Engineers. Evidence: packages/platform/artifacts/src/artifacts.ts:60-63 versus the versions routes. Work needed: Correct the comment.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- mode:cloud
- table:published_artifacts
- table:published_artifact_versions
- api:GET /api/artifacts/publish/[token]/versions
- api:POST /api/artifacts/publish/[token]/versions/[version]
- store:artifacts-store
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- F033-01
- F033-04

## Unknown

- Whether any retention rule exists for versions outside the code read.
- Whether the version restore route enforces the 200 cap (it updates an existing row, so likely not applicable) [inferred].
- Exact web line numbers inside versions/[version]/route.ts were taken from reading the file in full; the draft cited 46 and 133 and the export at 133 matches.
- Content of several named tests not read.
