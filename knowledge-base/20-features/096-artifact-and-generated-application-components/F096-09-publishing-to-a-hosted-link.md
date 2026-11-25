---
id: "F096-09"
type: "feature"
title: "Publishing to a hosted link"
aliases: ["Generated-site deployment service (S96.20)", "Publish to link", "Published artifacts", "Sites", "Shared artifact page", "shared-artifact", "Unpublish and rollback (S96.26)", "Publication moderation (S96.25)", "Published-app authorization (S96.23)"]
area: "96 Artifact and generated-application components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S96.20", "S96.21", "S96.22", "S96.23", "S96.24", "S96.25", "S96.26"]
depends_on: ["F096-07", "F096-08", "F096-10", "SYS-files-artifacts-and-storage", "SYS-authorization-and-workspaces", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-api-and-contracts", "SYS-execution-boundaries", "surface:web", "surface:mobile", "surface:cli", "mode:cloud", "table:published_artifacts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F096-09 Publishing to a hosted link

On the web, a person publishes an artifact to a durable link, chooses who may open it (anyone with the link, their workspace, or invited emails), updates it, unpublishes it, and restores earlier versions. The server screens content and operators can take it down. Mobile and CLI can publish too. Desktop only saves a local file.

Area: [96. Artifact and generated-application components](README.md). Requirement items: [S96.20](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9620), [S96.21](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9621), [S96.22](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9622), [S96.23](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9623), [S96.24](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9624), [S96.25](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9625), [S96.26](../../10-requirements/capabilities/096-artifact-and-generated-application-components.md#s9626).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Copies an artifact into the published_artifacts table under a 24-character token and serves it at /shared-artifact/<token>. Republishing keeps the same link and adds a version. The owner can rename it, change its audience, invite viewers, list and restore versions, view and clear app data, and unpublish (apps/web/app/api/artifacts/publish/route.ts:168, apps/web/app/api/artifacts/publish/[token]/route.ts:196-197).

**Why it exists.** The brief wants generated pages to be reachable by others without hosting work (S96.20), with audience control (S96.23), moderation (S96.25) and rollback (S96.26).

**Who uses it.** Anyone who makes an artifact in chat and wants to share it. Workspace members who receive a link. Platform moderators who handle takedowns and reports.

**Problems it solves**

- A chat artifact is private to its conversation.
- Links must not be guessable.
- Owners need to revoke or roll back.
- Illegal or abusive content needs a takedown path.
- Connector apps must stay off public links.

**Use cases**

- Publish an HTML landing page and send the link.
- Share a dashboard with the workspace only.
- Invite three reviewers by email.
- Restore the previous version after a bad edit.
- A moderator removes a reported page.

## 2. User experience

**Where to find it**

- Web chat artifact panel: menu item and button 'Publish' (shows 'Publishing…' while busy), with the accessible name 'Publish artifact to a public link' (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2308,2924), plus 'Share artifact' (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2774).
- Web sidebar 'Sites' opens /chat/sites; a site has tabs 'Settings' and 'Data' (apps/web/shared/components/layout/app-nav-items.ts:125, apps/web/features/sites/components/SiteDetail.tsx:279-280).
- Web public page /shared-artifact/<token> (apps/web/app/shared-artifact/[token]/page.tsx:62).
- Mobile: full-screen artifact 'Publish' with alert 'Publish to a public link?'; Sites screen 'Sites' with chips 'Yours' and 'Shared with you' (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:285-293, apps/mobile/src/features/sites/SitesScreen.tsx:180,225).
- CLI: agi artifacts publish, unpublish, audience, published (apps/cli/src/lib.rs:3877-4020).
- Desktop: local file only; no hosted publishing (apps/desktop/src/features/artifacts/publishAdapter.ts:13-15).
- VS Code and Chrome: no publish; VS Code lists artifacts and opens a published link (doc: docs/decisions/2026-09-27-founder-decisions.md:116-118).

**Before you start**

- Signed in to AGI Cloud. Mobile offers 'Sign in to AGI Cloud to publish' (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:303).
- The artifact kind is html, react, svg, mermaid, markdown, text or code (apps/web/lib/services/published-artifact-service.ts:61).
- Content is 1 to 1,000,000 characters (apps/web/lib/services/published-artifact-service.ts:50).
- The artifact came from a managed-cloud chat; otherwise publishing is refused (packages/platform/artifacts/src/artifacts.ts:267).
- Workspace policy allows external sharing for public audience (apps/web/lib/services/published-artifact-publication-policy.ts:67).
- The conversation belongs to the caller and is not deleted.

**Screens and controls**

- Audience choices: 'Anyone with the link', 'Your workspace', 'Only people you invite' (apps/web/features/sites/components/SiteSharingOptions.tsx:8-10).
- Workspace share confirm label 'Share with workspace' (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1339).
- Site card menu 'Unpublish' and a copy-link button; Settings tab sections 'Versions', rename, audience, invited viewers (apps/web/features/sites/components/SiteCard.tsx:93-116, apps/web/features/sites/components/SiteSettingsTab.tsx:319).
- Public page shows 'Published <date>' and a report-content link (apps/web/app/shared-artifact/[token]/page.tsx:92).
- Unavailable page for bad or revoked links; invite-only page for invited links the viewer cannot open (apps/web/app/shared-artifact/[token]/page.tsx:69-82).

**Journey**

1. Open an artifact in chat and click Publish.
2. The server screens the title and content, strips or blocks secrets according to policy, and saves the page.
3. A share link appears; copy it.
4. Choose the audience in the panel or on the Sites page; for invited, add email addresses.
5. Edit the artifact and click Publish again: same link, new version if the content changed.
6. On Sites, open Settings, Versions, and restore an earlier version.
7. Choose Unpublish to remove the link for everyone.

**What the person sees and gets**

- Publish returns 201 with token, shareUrl, version, kind, title, sandboxed, visibility and workspace info (apps/web/app/api/artifacts/publish/route.ts:108-125).
- Refusals: validation text when the usage policy is violated ('This artifact cannot be published because it violates the AGI Workforce usage policy.'), 409 when the user already has the maximum of 200 publications ('You already have 200 published artifacts. Unpublish one before publishing another.'), 403 when the conversation is not theirs (apps/web/lib/services/published-artifact-service.ts:413-416; apps/web/lib/services/published-artifact-publication-policy.ts:18-24).
- Unpublish of a token that is not the caller's gives 404 'Published artifact not found' (apps/web/app/api/artifacts/publish/[token]/route.ts:75).
- Audit event 'share_link_updated' is recorded on publish and restore (apps/web/app/api/artifacts/publish/route.ts:103).

**Settings**

- Audience (public, organization, invited) per publication.
- Workspace external-sharing policy and secret-handling policy shape what is allowed (apps/web/lib/services/published-artifact-publication-policy.ts:67-85).
- Rate-limit buckets 'share-create' and 'share-view'; numbers unknown.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Publish and list: api:POST and api:GET /api/artifacts/publish with CSRF, rate limit, schema check, sharing gate, moderation, outbound inspection, upsert, version record, audit (apps/web/app/api/artifacts/publish/route.ts:42-125).
- Token is 18 random bytes in base64url, 24 characters; format enforced everywhere by one regex (apps/web/lib/services/published-artifact-service.ts:107,289).
- Same artifact republishes to the same row through unique (user_id, artifact_id) (apps/web/db/neon/0095_published_artifacts.sql:68; apps/web/lib/services/published-artifact-service.ts:421).
- Per-user cap MAX_PUBLISHED_PER_USER equals 200, checked under an advisory lock (apps/web/lib/services/published-artifact-service.ts:59,413; packages/contracts/cloud-contracts/src/artifact-index.ts:132).
- Three audiences: public, organization, invited. The page reads public rows first, then workspace and invited rows through row-level security (apps/web/app/shared-artifact/[token]/page.tsx:28-45; apps/web/db/neon/0372_published_site_viewers.sql:25).
- An artifact with a live binding starts as 'invited' (apps/web/lib/services/published-artifact-service.ts:440).
- Update: PATCH changes title or audience; going public is refused if the app uses connectors and checked against the external sharing gate (apps/web/app/api/artifacts/publish/[token]/route.ts:176-186).
- Unpublish: DELETE removes the row, which cascades to versions, viewers, shares and storage (apps/web/lib/services/published-artifact-service.ts:563; apps/web/db/neon/0257_file_versions_and_lineage.sql:53).
- Version history and restore exist: versions list, read, and restore that republishes the old snapshot under the same token (apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:46-133). An unchanged republish does not add a version (apps/web/lib/services/published-artifact-service.ts:871).
- Moderation: platform admin takedown deletes a public row and content reports have a review queue; the public page links 'report' (apps/web/app/api/admin/takedown/route.ts:36,113; apps/web/app/api/admin/content-reports/route.ts:60,132).
- Mobile publishing and Sites screens call the same endpoints (apps/mobile/src/features/chat/services/artifactPublishing.ts:60-292). CLI publish, audience, unpublish call the same routes (apps/cli/src/cloud/artifacts.rs:451-585).

**Incomplete**

- Published pages have no expiry and views are not counted or audited (apps/web/lib/services/published-artifact-service.ts:44-47).
- Per-app AI metering depends on migration 0391, marked not applied (apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:4).
- The sandbox origin variable may be unset in production, which affects script apps (audit/registers/known-flaws.md:57).

**Present but disconnected or switched off**

- Mobile publishing in Local mode is blocked with 'Switch to AGI Cloud to publish' (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:299-300).

**Not available**

- Custom domains: no code found (S96.22 missing).
- Deployment history as a build log: not present; the version list is the only history (brief says not applicable).
- Hosted publishing on desktop, VS Code and Chrome (apps/desktop/src/features/artifacts/publishAdapter.ts:13-15; docs/decisions/2026-09-27-founder-decisions.md:116-118).
- Per-app views metering (S96.24) (apps/web/lib/services/published-artifact-service.ts:47).

## 4. Required behaviour

**Established requirements**

- A service deploys generated sites and apps to a hosted URL. (source: S96.20)
- Deployment history is not applicable. (source: S96.21 (brief); code still keeps versions)
- Custom domains are missing. (source: S96.22)
- Access to a published app is authorized per its audience (public vs workspace). (source: S96.23; apps/web/db/neon/0184_organization_shared_artifacts.sql:76)
- Per-app metering of views, compute and AI calls is missing. (source: S96.24)
- Published content is screened and can be reported and taken down by moderators. (source: S96.25)
- A controller unpublishes and restores earlier versions. (source: S96.26)
- Links use an unguessable 24-character token; republish keeps the link; no expiry; per-user cap returns a conflict. (source: apps/web/lib/services/published-artifact-service.ts:107,59,44-47)
- Mobile and CLI publish go through the managed cloud route only; the picked mode must be Cloud. (source: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:299; packages/platform/artifacts/src/artifacts.ts:267)

**Acceptance criteria**

1. Publishing the same artifact twice returns the same token and the second version number only if content changed.
2. A 25-character or malformed token returns the unavailable page and 404 from the API.
3. With audience 'Only people you invite', a signed-out visitor sees the invite-only page, and an invited email opens the app.
4. Unpublish by a non-owner token returns 404 and does not delete.
5. Publishing the 201st artifact returns 409 with the cap message.
6. Publishing text that the moderation check rejects returns a validation error and nothing is saved.
7. Restore of version N makes the live page equal version N and records a new version.
8. After a platform takedown the link shows the unavailable page.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Moderators can only act on public rows through the takedown route's target lookup; whether workspace and invited rows can be taken down was not read [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add per-publication view counts if S96.24 is wanted.
- [proposed] Update the brief: S96.21 has a version list and S96.24 has partial AI metering.
- [proposed] Offer hosted publish on desktop through the web route.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST/GET /api/artifacts/publish | `apps/web/app/api/artifacts/publish/route.ts` | Publish and list publications. |
| endpoint | GET/PATCH/DELETE /api/artifacts/publish/[token] | `apps/web/app/api/artifacts/publish/[token]/route.ts` | Detail, rename and audience change, unpublish. |
| endpoint | versions and restore routes | `apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts` | Read a version and restore it. |
| endpoint | versions list | `apps/web/app/api/artifacts/publish/[token]/versions/route.ts` | List versions of one publication. |
| endpoint | viewers route | `apps/web/app/api/artifacts/publish/[token]/viewers/route.ts` | List, add and remove invited viewer emails. |
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | Publish, restore, unpublish, versions, token minting, cap. |
| service | published-artifact-publication-policy | `apps/web/lib/services/published-artifact-publication-policy.ts` | External sharing gate, moderation, outbound content inspection. |
| service | org-shared-artifact-service | `apps/web/lib/services/org-shared-artifact-service.ts` | Workspace audience change and workspace reads. |
| service | published-site-viewer-service | `apps/web/lib/services/published-site-viewer-service.ts` | Invited reads and viewer list. |
| table | published_artifacts | `apps/web/db/neon/0095_published_artifacts.sql` | One row per publication with token and visibility. |
| table | published_artifact_versions | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Append-only version snapshots. |
| table | organization_shared_artifacts | `apps/web/db/neon/0184_organization_shared_artifacts.sql` | Workspace share grants. |
| table | published_artifact_viewers | `apps/web/db/neon/0372_published_site_viewers.sql` | Invited email list. |
| component | Shared artifact page | `apps/web/app/shared-artifact/[token]/page.tsx` | Public page that resolves audience and renders the view. |
| component | ArtifactPreview publish controls | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Publish button, audience menu, copied link. |
| service | publishArtifactClient | `apps/web/features/chat/components/artifacts/publishArtifactClient.ts` | Web client for publish and audience change. |
| component | Sites feature | `apps/web/features/sites/components/SiteDetail.tsx` | Sites list, detail, settings, versions, data. |
| endpoint | admin takedown and content reports | `apps/web/app/api/admin/takedown/route.ts` | Operator removal and report review (content-reports/route.ts alongside). |
| service | mobile artifactPublishing | `apps/mobile/src/features/chat/services/artifactPublishing.ts` | Mobile publish, audience, unpublish. |
| command | agi artifacts publish / unpublish / audience | `apps/cli/src/lib.rs` | CLI commands that call the hosted routes. |
| service | CLI cloud artifacts | `apps/cli/src/cloud/artifacts.rs` | CLI client for the publish routes. |
| service | publishArtifact core | `packages/platform/artifacts/src/artifacts.ts` | Chooses local file or cloud publisher by privacy mode and refuses other modes. |
| service | desktop publish adapter | `apps/desktop/src/features/artifacts/publishAdapter.ts` | Writes artifacts to a local file only. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person clicks Publish. The client picks the kind and sends artifact id, title, content and conversation id. | device | apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1221; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:74 |
| Server checks CSRF, the share-create rate limit and the body schema. | our servers | apps/web/app/api/artifacts/publish/route.ts:43-58 |
| Server checks external sharing policy, runs the usage-policy check on title and content, then outbound content inspection for secrets. | our servers | apps/web/lib/services/published-artifact-publication-policy.ts:55-85 |
| In one transaction the server takes a per-user lock, checks the cap, upserts the row, and records a version unless unchanged. | our servers | apps/web/lib/services/published-artifact-service.ts:421-498 |
| Server writes an audit event and returns the share URL. | our servers | apps/web/app/api/artifacts/publish/route.ts:102-125 |
| A visitor opens the link. The server reads public rows, else workspace or invited rows by the visitor's session, and renders the page, running script kinds in the sandbox frame. | our servers | apps/web/app/shared-artifact/[token]/page.tsx:28-98 |
| Unpublish deletes the row and everything that cascades from it. | our servers | apps/web/lib/services/published-artifact-service.ts:563-579 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Title, kind, language, full content (up to 1,000,000 characters), token, visibility, owner, source conversation, version | table published_artifacts | Server only; web, mobile and CLI read the same rows | No expiry; removed by unpublish, takedown, or unpublish of the source conversation (apps/web/lib/services/published-artifact-service.ts:581) |
| Each published version | table published_artifact_versions | Server only | Kept until the publication is deleted; no pruning found |
| Invited emails (lower-cased) and workspace grants | tables published_artifact_viewers and organization_shared_artifacts | Server only | Cascade on unpublish |
| Audit events of publishing | security audit log | Server only | unknown |

**Models and providers.** No model takes part in publishing. Moderation and secret inspection are code checks on our servers (the moderation and outbound-content-inspection modules were called but their rules not read, so whether they call an outside service is unknown).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account to publish, list, change or unpublish. Reading a public page needs no account; workspace and invited pages need sign-in (apps/web/app/shared-artifact/[token]/page.tsx:28-45). |
| Permissions | Only the owner (user_id) may update, restore or unpublish; row-level security enforces it. Public reads are by token. Workspace members need a grant row and readable organization. Invited readers need their profile email on the list. Platform admins hold takedown and report review (apps/web/app/api/admin/takedown/route.ts:36). |
| Subscription | No plan gate on publishing was found in the publish route. Workspace sharing policy can refuse public sharing (apps/web/lib/services/published-artifact-publication-policy.ts:67). Connected apps in published apps need a paid plan (see F096-08). |
| Limits and metering | 200 publications per user, content 1,000,000 characters, title 300 characters on publish, 24-character token, rate-limit buckets 'share-create' and 'share-view' (numbers unknown). Views and bandwidth are not metered (apps/web/lib/services/published-artifact-service.ts:47). |
| Feature flags | NEXT_PUBLIC_SANDBOX_ORIGIN (name only) decides the script sandbox; no publish flag found. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Local-mode artifacts cannot be published: the core refuses with 'Publishing uploads it to AGI managed cloud, so it is unavailable in this privacy mode. Download the artifact instead.' (packages/platform/artifacts/src/artifacts.ts:267). Mobile Local shows 'Switch to AGI Cloud to publish' (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:300). Desktop saves to a local file and never calls the hosted route (apps/desktop/src/features/artifacts/publishAdapter.ts:131). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Bad, unknown or revoked token | The page shows an honest unavailable message, not a 404 page; the API answers 404. | apps/web/app/shared-artifact/[token]/page.tsx:62-69 |
| Invite-only link, viewer not on list | Invite-only page with sign-in prompt when signed out. | apps/web/app/shared-artifact/[token]/page.tsx:71-80 |
| Cap reached | 409 conflict message; republish of an existing artifact still works. | apps/web/lib/services/published-artifact-service.ts:395-416 |
| Conversation deleted or foreign | 403 with an explanatory message. | apps/web/lib/services/published-artifact-service.ts:366-373 |
| Restore of a gone publication | 409 'This publication is no longer available to restore.' | apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:106 |
| Publish clicked twice | No new version when content is unchanged. | apps/web/lib/services/published-artifact-service.ts:866-870 |
| Owner left a workspace | Owner can still read and revoke old workspace grants. | apps/web/db/neon/0395_published_artifact_audience_revocation.sql:50-56 |
| Outbound inspection blocks | Validation error with the policy's message; nothing saved. | apps/web/lib/services/published-artifact-publication-policy.ts:84-86 |
| Sites page load error or stale link | Messages 'Your sites could not be loaded.' and 'This site could not be loaded.' with retry. | apps/web/features/sites/components/SitesPage.tsx:116; apps/web/features/sites/components/SiteDetail.tsx:170 |
| Offline | not handled in the code beyond generic failure messages on the Sites screens. | apps/web/features/sites/components/SitesPage.tsx:116 |
| Accessibility | Copy button has aria-label 'Copy link to <name>'; table and tab controls use labelled roles. | apps/web/features/sites/components/SiteCard.tsx:113 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/artifacts/publish/route.test.ts`: Publish and list route.
- `apps/web/app/api/artifacts/publish/[token]/route.test.ts`: Detail and unpublish route.
- `apps/web/app/api/artifacts/publish/[token]/route.visibility.test.ts`: Audience changes.
- `apps/web/app/api/artifacts/publish/[token]/route.rename.test.ts`: Rename.
- `apps/web/app/api/artifacts/publish/[token]/viewers/route.test.ts`: Invited viewers.
- `apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.restore.test.ts`: Restore a version.
- `apps/web/lib/services/__tests__/published-artifact-service.transactions.test.ts`: Transaction behaviour of publish.
- `apps/web/lib/services/__tests__/published-artifact-service.quota-admission.test.ts`: Per-user cap admission.
- `apps/web/db/neon/published-artifacts-migration.test.ts`: Migration 0095 text.
- `apps/web/db/neon/organization-shared-artifacts-migration.test.ts`: Migration 0184 text.
- `apps/web/app/shared-artifact/[token]/page.test.tsx`: Shared page resolution.
- `apps/web/features/sites/services/sites-service.restore.test.ts`: Sites client restore.
- `apps/web/features/sites/services/sites-service.unpublish.test.ts`: Sites client unpublish.
- `apps/mobile/src/features/chat/services/__tests__/artifactPublishing.test.ts`: Mobile publish service.
- `apps/web/e2e/sites.spec.ts`: Browser spec for Sites (contents not read).

**Test scenarios**

- **Publish and republish**
  1. Publish an html artifact in a Cloud chat.
  2. Change the artifact and publish again.
  - Expected: Same link, version 2, page shows new content.
- **Audience**
  1. Set 'Only people you invite' and add one email.
  2. Open the link as that user and as another user.
  - Expected: Invited user sees the app; the other sees the invite-only page.
- **Cap**
  1. Create 200 publications for one test user.
  2. Publish a new artifact.
  - Expected: 409 with the 200 cap message.
- **Restore**
  1. Open Sites, Settings, Versions.
  2. Restore version 1.
  - Expected: Live page equals version 1 and a new version is recorded; storage rows of the app remain.
- **Unpublish**
  1. Click Unpublish on a site card and confirm.
  2. Open the old link.
  - Expected: Unavailable page; storage and version rows removed.
- **Local mode**
  1. On mobile switch to Local and open an artifact.
  2. Tap Publish.
  - Expected: Alert 'Switch to AGI Cloud to publish'; no network call.

**Where to look when it fails**

- Audit event share_link_updated.
- Error names PublishedArtifactValidationError, PublishedArtifactOwnershipError, PublishedArtifactQuotaError.
- Tables published_artifacts, published_artifact_versions, published_artifact_viewers, organization_shared_artifacts.
- Server log '[external-sharing] refused by workspace policy'.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No custom domains.** Affects: Publishers on web. Evidence: No route or table found in apps/web/app/api/artifacts. Work needed: Decide scope, DNS flow and certificates.
- **No view or per-app compute metering and no expiry.** Affects: Publishers and operators. Evidence: apps/web/lib/services/published-artifact-service.ts:44-47. Work needed: Founder decision on expiry; add counters.
- **Brief says deployment history not applicable and only 2 audiences; code has a version list, restore and an invited audience.** Affects: Testers using the brief. Evidence: apps/web/app/api/artifacts/publish/[token]/versions/route.ts:35; apps/web/db/neon/0372_published_site_viewers.sql:25. Work needed: Update the brief.
- **Desktop, VS Code and Chrome cannot publish to a hosted link.** Affects: Those apps. Evidence: apps/desktop/src/features/artifacts/publishAdapter.ts:13-15; docs/decisions/2026-09-27-founder-decisions.md:116-118. Work needed: Only if parity is required.
- **Brief line references (publish/route.ts:206 and :318) do not exist in the 173-line file.** Affects: Engineers following the brief. Evidence: apps/web/app/api/artifacts/publish/route.ts. Work needed: Refresh the brief anchors.
- **Production sandbox origin and migration 0391 state are unknown.** Affects: Script apps and AI caps. Evidence: audit/registers/known-flaws.md:57; apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:4. Work needed: Check live configuration.
- **Known flaw: script artifacts could navigate the renderer frame to an outside address once a separate sandbox origin is set.** Affects: Viewers of published script apps. Evidence: audit/registers/known-flaws.md:57. Work needed: Close before setting the variable, per the register row.

**Depends on**

- F096-07
- F096-08
- F096-10
- SYS-files-artifacts-and-storage
- SYS-authorization-and-workspaces
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-api-and-contracts
- SYS-execution-boundaries
- surface:web
- surface:mobile
- surface:cli
- mode:cloud
- table:published_artifacts

## Unknown

- Whether the takedown route can remove workspace and invited publications.
- Rules inside the moderation and outbound inspection checks.
- Rate-limit numbers for 'share-create' and 'share-view'.
- Retention of audit events.
- What the e2e Sites spec covers.
- Production sandbox origin and migration 0391 state.
- Whether version history is ever pruned.
