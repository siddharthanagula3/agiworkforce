---
id: "F028-10"
type: "feature"
title: "Publish a preview link"
aliases: ["Publish", "Publish artifact to a public link", "Who can open this", "Shared links", "Published artifacts", "S28.27", "S28.28", "shared-artifact page"]
area: "28 Code Canvas and application preview"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S28.27", "S28.28"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:desktop", "mode:cloud", "SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-security-and-privacy", "SYS-execution-boundaries", "table:published_artifacts", "table:published_artifact_versions", "table:organization_shared_artifacts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F028-10 Publish a preview link

Publish an artifact to a shareable link, change who can open it (anyone, only invited people, only the workspace) and take it down. Works on web, mobile and CLI for Cloud artifacts; the internal Tauri desktop only saves a local file. VS Code and Chrome cannot publish. There is no separate production version.

Area: [28. Code Canvas and application preview](README.md). Requirement items: [S28.27](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2827), [S28.28](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2828).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Copies an artifact's content to our servers under a random link at /shared-artifact/<token>, records a version, lets the owner set the audience and unpublish (apps/web/app/api/artifacts/publish/route.ts:42-127; apps/web/lib/services/published-artifact-service.ts:421-500).

**Why it exists.** So an app, page or document made in chat can be shared or run by other people. The brief says the user can publish the app to a shareable preview link (doc: knowledge-base/data/area-briefs/028-code-canvas-and-application-preview.md S28.27).

**Who uses it.** Owners of Cloud chats who want to share; viewers who open the link.

**Problems it solves**

- Sharing a working app or page without sending files.
- Limiting access to a workspace or invited people.
- Taking a link away again.

**Use cases**

- Publish a landing page and send the link.
- Limit an internal tool to the workspace.
- Invite named people to view a draft.
- Unpublish a link shared by mistake.

## 2. User experience

**Where to find it**

- Web: preview toolbar button 'Publish' (aria-label 'Publish artifact to a public link'); after publishing a bar with 'Copy link' and a selector labelled 'Who can open this' (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2915-2930,3020-3040).
- Web unpublish and history: Settings, Shared links, section 'Published artifacts', buttons 'Unpublish' and 'History' with 'Put live' (apps/web/features/settings/sections/PublishedArtifactsSection.tsx:442-451,615-617,645-700; SharedLinksSection.tsx:502). The panel has no unpublish control (no match in ArtifactPreview.tsx).
- Mobile: full-screen artifact button 'Publish artifact to a public link' or 'Republish artifact link'; audience choices 'Anyone with the link' and 'Everyone in this workspace (N)'; button 'Unpublish artifact' (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1319-1325; apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx:94-100,216).
- CLI: agi artifacts publish, published, audience, unpublish (apps/cli/src/lib.rs:1399-1427).
- Desktop: the public Desktop shows the web app (doc: AGENTS.md section 5); the internal Tauri build only exports a local file and injects no cloud publisher (apps/desktop/src/features/artifacts/publishAdapter.ts:1-17).
- VS Code: lists published artifacts and opens a published page ('Open the published artifact'); no publish action (apps/extension-vscode/src/features/surfaces/index.ts:109-114). Chrome: no publish control found (apps/extension/src/features/side-panel/artifactPanel.ts).

**Before you start**

- The artifact was made in a Cloud chat; Local and own-key artifacts are refused with 'This artifact was created in <mode> mode. Publishing uploads it to AGI managed cloud, so it is unavailable in this privacy mode. Download the artifact instead.' (packages/platform/artifacts/src/artifacts.ts:256-276).
- Signed in. Mobile also needs Cloud mode on: 'Switch to AGI Cloud to publish' (ArtifactFullScreen.tsx:731-746).
- Artifact kind is one of html, react, svg, mermaid, markdown, text, code (apps/web/lib/services/published-artifact-service.ts:61-69).

**Screens and controls**

- Publish button, link bar, 'Copy link', audience selector and confirmation dialogs.
- Mobile alert 'Publish to a public link?' with Cancel and Publish (ArtifactFullScreen.tsx:285-296).
- Settings list with 'Unpublish', 'History', 'Put live'.

**Journey**

1. 1. Open a Cloud artifact and press Publish (mobile: confirm the alert).
2. 2. The page sends the content to the publish route; the new link is copied: 'Published · link copied to clipboard' (ArtifactPreview.tsx:1240-1246).
3. 3. Optionally change 'Who can open this'; confirm the dialog that names what stops working.
4. 4. Press Publish again after edits; the same link updates and a new version is recorded.
5. 5. To remove it: Settings, Shared links, Published artifacts, Unpublish, confirm.

**What the person sees and gets**

- Toasts: 'Published · link copied to clipboard', 'Only your workspace can open this now', 'Only the people you invite can open this now', 'Anyone with the link can open this now' (ArtifactPreview.tsx:1241-1244,1296-1300).
- Errors: 'Failed to publish artifact', 'Could not change who can open this' (ArtifactPreview.tsx:1262,1302).
- Unpublish notice: 'Unpublished "<title>". The link no longer works.' (PublishedArtifactsSection.tsx:276).
- CLI prints 'Published ... at <url> (opens for <audience>).' (apps/cli/src/lib.rs:4008-4018).

**Settings**

- Audience per publication: public, organization (workspace), invited.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Publish route: CSRF check, rate limit 'share-create', body validation (content up to 1,000,000 characters), external-sharing gate, moderation, outbound secret inspection, upsert by owner and artifact id, version recorded, audit event (apps/web/app/api/artifacts/publish/route.ts:42-127; apps/web/lib/services/published-artifact-publication-policy.ts).
- Republish keeps the same token and link (apps/web/lib/services/published-artifact-service.ts:421-460 on conflict update).
- Default audience is public, or invited when the artifact has a live binding (published-artifact-service.ts:431-436).
- Audience change PATCH; making a connector app public is refused with CONNECTOR_ARTIFACT_PUBLIC_SHARE_MESSAGE (apps/web/app/api/artifacts/publish/[token]/route.ts:140-155; published-artifact-service.ts:109-110).
- Unpublish DELETE (publish/[token]/route.ts:54-77).
- Web confirmations for each audience move name what is lost, and 'Make this public again?' warns that copies already taken cannot be recalled (ArtifactPreview.tsx:1317-1350).
- Mobile publish, audience and unpublish controls with confirmations (ArtifactFullScreen.tsx:285-296; PublishedArtifactControls.tsx:60-100).
- CLI publish with an audience, listing, audience change and unpublish with a confirmation prompt (apps/cli/src/lib.rs:3888-4043; apps/cli/src/cloud/artifacts.rs:497-545).
- The shared page renders by kind; only html and react run script in the sandbox (apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:67-69,321-354).

**Incomplete**

- CLI audiences are public or workspace only; the web also offers invited (apps/cli/src/lib.rs:1414; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1296-1300).
- The CLI source file relies on published-publish path that the shared package forbids for CLI, VS Code and Chrome (assertSurfaceCanSyncChats in packages/platform/artifacts/src/artifacts.ts:295); the CLI has its own client for the same route (apps/cli/src/cloud/artifacts.rs:451-496).

**Present but disconnected or switched off**

- Tauri desktop: no cloud publisher is injected, so publishing there writes a file and returns a file:// path (apps/desktop/src/features/artifacts/publishAdapter.ts:1-17).
- Connected-app artifacts cannot be public, and connector use is coming soon (packages/contracts/types/src/connector-release.ts:14).

**Not available**

- VS Code publish: not found (brief S28.27 missing). Chrome publish: not found in the code (brief unverified).
- Production version with its own stable URL or domain (S28.28): no slug, domain or production concept found in the published-artifact code, sites settings tab or services read (apps/web/features/sites/components/SiteSettingsTab.tsx; apps/web/lib/services/published-artifact-service.ts). Every publish updates the one link.

## 4. Required behaviour

**Established requirements**

- The user can publish the app to a shareable preview link (web, desktop, mobile, CLI done; VS Code missing; Chrome unverified). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.27)
- The user can publish a separate production version with a stable URL or domain distinct from previews (VS Code missing, Chrome unverified; no web evidence). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.28)
- A Local or own-key artifact never reaches the managed-cloud publisher. (source: packages/platform/artifacts/src/artifacts.ts:256-276,297-306; doc: AGENTS.md section 6)
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)
- Making a link public again needs a confirmation that names who can open it and that copies already taken cannot be recalled. (source: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1343-1349)

**Acceptance criteria**

1. Publish a Cloud html artifact on web: a link is returned and copied; opening it signed out (public) shows the page.
2. Edit and publish again: the same link shows new content and the Settings history lists a new version.
3. Change audience to workspace: the dialog names the loss of public access; an outside viewer then sees the unavailable page.
4. Change to invited: only added emails can open it after sign-in.
5. Unpublish from Settings: the link then shows the unavailable page.
6. Publish a Local-mode artifact: refused with the mode message; nothing uploaded.
7. Mobile in Local mode: alert 'Switch to AGI Cloud to publish'.
8. CLI agi artifacts publish <id> --audience workspace with no workspace sharing: refused with 'Select a workspace that can share artifacts...' and nothing published.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Brief S28.28 may be satisfied in spirit by the single stable link plus 'Put live' version choice [inferred from published-artifact-service.ts:421-500 and PublishedArtifactsSection.tsx:385-420]; a separate preview versus production pair does not exist.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an unpublish control to the artifact panel so the action is next to Publish.
- [proposed] Let VS Code and Chrome publish through the existing route, or state they are read-only for publishing.
- [proposed] If a production URL is wanted, add a stable alias that points at a chosen version.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST and GET /api/artifacts/publish | `apps/web/app/api/artifacts/publish/route.ts` | Publish and list published artifacts |
| endpoint | PATCH DELETE GET /api/artifacts/publish/[token] | `apps/web/app/api/artifacts/publish/[token]/route.ts` | Detail, audience and title change, unpublish |
| endpoint | versions routes | `apps/web/app/api/artifacts/publish/[token]/versions/route.ts` | List published versions |
| endpoint | version restore route | `apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts` | GET one version; POST puts it live |
| endpoint | viewers route | `apps/web/app/api/artifacts/publish/[token]/viewers/route.ts` | Invited viewers for the invited audience |
| endpoint | lookup route | `apps/web/app/api/artifacts/publish/lookup/route.ts` | Find the publication for an artifact id |
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | Publish, restore, unpublish, versions, quota, token and URL |
| service | publication policy | `apps/web/lib/services/published-artifact-publication-policy.ts` | Sharing gate, moderation, outbound inspection |
| service | org shared artifacts | `apps/web/lib/services/org-shared-artifact-service.ts` | Audience moves to workspace and invited |
| service | web publish client | `apps/web/features/chat/components/artifacts/publishArtifactClient.ts` | Cloud publisher, lookup, audience PATCH |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Publish button, link bar, audience selector, confirmations |
| component | PublishedArtifactsSection | `apps/web/features/settings/sections/PublishedArtifactsSection.tsx` | Settings list with Unpublish, History, Put live |
| component | PublishedArtifactView | `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx` | The public page |
| service | publishArtifact core | `packages/platform/artifacts/src/artifacts.ts` | Trust-boundary checks and cloud or local publish branch |
| service | mobile artifactPublishing | `apps/mobile/src/features/chat/services/artifactPublishing.ts` | Mobile publish call and audience state |
| component | mobile PublishedArtifactControls | `apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx` | Audience picker, unpublish with confirmation |
| command | CLI artifacts commands | `apps/cli/src/lib.rs` | publish, published, audience, unpublish |
| service | CLI cloud artifacts | `apps/cli/src/cloud/artifacts.rs` | publish_for_audience, set_audience, unpublish |
| service | desktop publishAdapter | `apps/desktop/src/features/artifacts/publishAdapter.ts` | Tauri local-only publish |
| table | published_artifacts and published_artifact_versions | `apps/web/db/neon/0095_published_artifacts.sql` | Publication rows; versions table in 0257_file_versions_and_lineage.sql:53 |
| table | organization_shared_artifacts | `apps/web/db/neon/0184_organization_shared_artifacts.sql` | Workspace grants |
| test | publish route test | `apps/web/app/api/artifacts/publish/route.test.ts` | Publish route |
| test | ArtifactPreview publish test | `apps/web/features/chat/components/artifacts/ArtifactPreview.publish.test.tsx` | Web publish control |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app checks the artifact came from a Cloud chat and a publisher exists; otherwise it returns a reason and copies the source. | device | packages/platform/artifacts/src/artifacts.ts:297-316; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1221-1262 |
| The client posts artifact id, title, kind, language, content and chat id to the publish route. | device | apps/web/features/chat/components/artifacts/publishArtifactClient.ts:78-100 |
| The server checks CSRF and rate limit, validates, runs the sharing gate, moderation and outbound inspection. | our servers | apps/web/app/api/artifacts/publish/route.ts:42-73 |
| The server upserts the publication (same owner and artifact id keeps the token), records a version, writes an audit event and returns the share URL. | our servers | apps/web/lib/services/published-artifact-service.ts:421-500; apps/web/app/api/artifacts/publish/route.ts:100-126 |
| Audience change goes through PATCH with workspace and connector checks. | our servers | apps/web/app/api/artifacts/publish/[token]/route.ts:127-190 |
| A viewer opens the link; the server reads the artifact by token (public, workspace, invited) and renders the page. | our servers | apps/web/app/shared-artifact/[token]/page.tsx:35-95 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Published copy: title, kind, language, content, audience, token | table published_artifacts (apps/web/db/neon/0095_published_artifacts.sql) | Server-held; mobile and CLI read it by API | Deleted by unpublish; storage rows go with it |
| Version snapshots (up to 1,000,000 characters each) | table published_artifact_versions (apps/web/db/neon/0257_file_versions_and_lineage.sql:53-70) | Server only | Cascade with the publication; retention beyond that: unknown |
| Workspace grant rows | table organization_shared_artifacts | Server only | Changed by audience moves |
| Local file copy (Tauri) | app data folder artifacts/<id>.<ext> | No | Kept on the device (publishAdapter.ts:1-8) |

**Models and providers.** No model is involved in publishing. Moderation and outbound inspection run on the server (apps/web/lib/services/published-artifact-publication-policy.ts).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; Cloud chat origin required (packages/platform/artifacts/src/artifacts.ts:256-276). |
| Permissions | Owner only can publish, change audience, unpublish and restore; row-level security refuses others (apps/web/lib/services/published-artifact-service.ts:441-452). External sharing is gated by workspace policy (apps/web/lib/services/published-artifact-publication-policy.ts, buildExternalSharingGateResponse call). |
| Subscription | No plan check found in the publish route. A per-user cap on published artifacts applies (MAX_PUBLISHED_PER_USER, apps/web/lib/services/published-artifact-service.ts:59) and a quota error maps to a conflict (publish/route.ts:94-96). |
| Limits and metering | Content up to 1,000,000 characters; title 300; rate limit key 'share-create' (apps/web/app/api/artifacts/publish/route.ts:33-47). Exact rate values: not read. |
| Feature flags | none found for publish itself. Connector artifacts depend on the connector release state (packages/contracts/types/src/connector-release.ts:14). |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Local and own-key artifacts cannot be published to AGI Cloud; Local desktop writes a local file only; mobile in Local mode shows 'Switch to AGI Cloud to publish' (packages/platform/artifacts/src/artifacts.ts:256-276; apps/desktop/src/features/artifacts/publishAdapter.ts:1-17; ArtifactFullScreen.tsx:742-745). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Publishing in progress | Button shows 'Publishing…' and is disabled; duplicate presses ignored | ArtifactPreview.tsx:1221-1229,2929 |
| Receipt invalid | Error says the artifact may have been published but the receipt was invalid | publishArtifactClient.ts:112-118 |
| Unconfirmed publish on mobile | 'Publish not confirmed' alert and a lookup to find out | ArtifactFullScreen.tsx:785-789 |
| Clipboard blocked | Toast 'Published. Copy the link from the bar below.' | ArtifactPreview.tsx:1244-1246 |
| Quota reached | Conflict error from the route | apps/web/app/api/artifacts/publish/route.ts:94-96 |
| Revoked or unknown link | Same 'unavailable' page for malformed and revoked tokens; invite-only page for invited audience | apps/web/app/shared-artifact/[token]/page.tsx:63-83 |
| Workspace audience with no workspace sharing (CLI) | Refused before publishing | apps/cli/src/cloud/artifacts.rs:503-511 |
| Audience move fails after publish (CLI, new publication) | Link is withdrawn again or the user is told to run unpublish | apps/cli/src/cloud/artifacts.rs:523-536 |
| Offline or timeout | not handled in the code beyond error messages | publishArtifactClient.ts:107-110 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/artifacts/publish/route.test.ts`: Publish and list route; titles not read
- `apps/web/app/api/artifacts/publish/[token]/route.test.ts`: Detail, audience and unpublish route; titles not read
- `apps/web/app/api/artifacts/publish/[token]/route.visibility.test.ts`: Audience changes; titles not read
- `apps/web/app/api/artifacts/publish/lookup/route.test.ts`: Lookup route; titles not read
- `apps/web/features/chat/components/artifacts/ArtifactPreview.publish.test.tsx`: Web publish button; titles not read
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.publish.test.tsx`: Panel publish; titles not read
- `apps/web/lib/services/published-artifact-service.test.ts`: Publication service; titles not read
- `apps/web/lib/services/__tests__/published-artifact-service.quota-admission.test.ts`: Quota admission; titles not read
- `apps/mobile/__tests__/ArtifactPublicationControls.test.tsx`: Mobile publication controls; titles not read
- `apps/mobile/__tests__/PublishedArtifactViewers.test.tsx`: Invited viewers on mobile; titles not read
- `apps/cli/src/lib.rs`: the_artifact_commands_parse covers publish and unpublish parsing (lines 10145-10155)
- `apps/web/e2e/shared-link-pages.spec.ts`: Shared link pages end to end; file exists, no run recorded

**Test scenarios**

- **Publish and open signed out**
  1. Create an html artifact in a Cloud chat.
  2. Press Publish.
  3. Open the copied link in a private window.
  - Expected: The page renders for a public publication.
- **Narrow then widen audience**
  1. Set 'Who can open this' to workspace and confirm.
  2. Open as an outside user.
  3. Set back to public and read the dialog.
  - Expected: Outside user is refused; the dialog says copies already taken cannot be recalled.
- **Local artifact refused**
  1. Create an artifact in Local mode.
  2. Try to publish.
  - Expected: A mode message appears, nothing is uploaded and the source is copied to the clipboard.
- **Republish keeps link**
  1. Publish, edit, publish again.
  2. Open Settings, Shared links, History.
  - Expected: Same URL; a new version listed with 'Live now' on the newest.
- **Unpublish**
  1. Settings, Shared links, Unpublish, confirm.
  2. Reload the link.
  - Expected: Unavailable page; saved app data deleted.
- **CLI publish for workspace**
  1. agi artifacts publish <id> --audience workspace in an account without workspace sharing.
  - Expected: Refusal text and no publication.

**Where to look when it fails**

- Error classes PublishedArtifactValidationError, PublishedArtifactOwnershipError, PublishedArtifactQuotaError (apps/web/lib/services/published-artifact-service.ts:119-140).
- Audit event type share_link_updated with status published (apps/web/app/api/artifacts/publish/route.ts:100-110).
- Tables published_artifacts, published_artifact_versions, organization_shared_artifacts.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/web/028-code-canvas-and-application-preview.md)
- Desktop: [70-qa/test-plans/desktop/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/desktop/028-code-canvas-and-application-preview.md)
- Mobile: [70-qa/test-plans/mobile/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/mobile/028-code-canvas-and-application-preview.md)
- CLI: [70-qa/test-plans/cli/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/cli/028-code-canvas-and-application-preview.md)

## 10. Gaps and dependencies

- **No separate production version with its own URL or domain.** Affects: All apps (brief S28.28). Evidence: Search of published-artifact-service.ts and the sites settings tab found no slug, domain or production concept. Work needed: Product decision, then a stable alias or domain feature.
- **VS Code cannot publish; Chrome has no publish control and is marked unverified.** Affects: VS Code and Chrome users. Evidence: apps/extension-vscode/src/features/surfaces/index.ts:97-114; apps/extension/src/features/side-panel/artifactPanel.ts. Work needed: Decide scope; add or document.
- **Web artifact panel has no unpublish; it is only in Settings.** Affects: Web users. Evidence: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:615-645. Work needed: Add an Unpublish control with confirmation next to the link bar.
- **Audience set differs: CLI offers public or workspace, web and mobile also have invited (mobile code references an 'invited' state).** Affects: CLI users. Evidence: apps/cli/src/lib.rs:1414; apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx:195-199. Work needed: Add invited to the CLI.
- **The brief's mobile and CLI citations (ArtifactFullScreen.tsx:405, 421; lib.rs:1053; cloud/artifacts.rs:391) do not match current lines.** Affects: Documentation. Evidence: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:731-770; apps/cli/src/lib.rs:3996-4019. Work needed: Refresh citations.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- mode:cloud
- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-security-and-privacy
- SYS-execution-boundaries
- table:published_artifacts
- table:published_artifact_versions
- table:organization_shared_artifacts

## Unknown

- Exact rate limit values for 'share-create'.
- Whether the Electron Desktop adds publish controls beyond the hosted web app.
- Retention of version snapshots.
- Whether the plan affects the per-user cap on published artifacts.
- Whether the invited audience is selectable on mobile in the current UI.
