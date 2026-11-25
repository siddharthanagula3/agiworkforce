---
id: "F110-12"
type: "feature"
title: "Sharing, forking and publishing"
aliases: ["Sharing, forking and publishing", "Published artifacts", "Put live", "Unpublish", "Save a copy to my chats", "Open in AGI", "Continue a shared chat", "Share with organization", "Shared projects, artifacts, conversations, connectors", "Shared artifact to viewer-authorized connected app (S110.17)", "Published output to versioned update (S110.28)", "Public creation to private fork (S110.29)", "Personal resource to workspace resource (S110.30)"]
area: "110 Cross-product experiences to include in the product map"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S110.17", "S110.28", "S110.29", "S110.30"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-authorization-and-workspaces", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "table:published_artifacts", "table:published_artifact_versions", "table:organization_shared_artifacts", "table:shared_sessions", "api:POST /api/artifacts/publish", "F110-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F110-12 Sharing, forking and publishing

A published artifact keeps its link when republished; each publish records a version and an older version can be put live again. A viewer can save a copy of a shared artifact or continue a shared conversation as a private chat. In workspace settings a user can share projects (read-only or can-edit), artifacts, conversations and connectors; skills are not shared there.

Area: [110. Cross-product experiences to include in the product map](README.md). Requirement items: [S110.17](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11017), [S110.28](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11028), [S110.29](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11029), [S110.30](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11030).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not stated on this page | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets people publish an artifact at a link, update it in place with a history they can roll back, unpublish it, let viewers copy or fork what was shared, and share their own resources with their workspace.

**Why it exists.** The brief wants versioned updates in place, private forks of public creations, workspace sharing with access levels, and a viewer-authorized connected app (doc: knowledge-base/data/area-briefs/110-cross-product-experiences-to-include-in-the-product-map.md, S110.17, S110.28, S110.29, S110.30).

**Who uses it.** Creators who publish artifacts or apps; viewers of shared links; workspace members and sharing managers.

**Problems it solves**

- Sending a new link for every edit
- Fixing a bad update without losing the old one
- Viewers wanting to keep and extend what they saw
- Teams needing a shared place for projects and artifacts

**Use cases**

- Republish an artifact and keep the same URL.
- Put an older version live from Settings.
- Open a shared chat link and press 'Open in AGI' to continue it privately.
- Share a project with the organization as read-only.

## 2. User experience

**Where to find it**

- Web (and desktop's hosted app): Settings > Published artifacts: buttons Open, Copy, History, Unpublish; history rows with 'Put live' or 'Live now' (apps/web/features/settings/sections/PublishedArtifactsSection.tsx:385, 451, 600-700).
- Web: shared artifact page /shared-artifact/<token> with 'Save a copy to my chats' (apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:144, 230).
- Web: shared conversation page with 'Open in AGI' leading to /chat/from-share/<token> (apps/web/features/chat/components/share/SharedSessionViewer.tsx:49, 102).
- Web: Settings > organization sharing sections 'Shared projects', 'Shared artifacts', 'Shared conversations', 'Shared connectors' (apps/web/features/settings/sections/OrganizationSharingSection.tsx:195, 339, 440, 555).
- Mobile: artifact full screen: publish with an alert 'Publish to a public link?', audience choices and 'Unpublish artifact'; a version history sheet with 'Restore version N' (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:281-300, 1929; PublishedArtifactControls.tsx:77-83, 216; ArtifactVersionHistorySheet.tsx:136).
- CLI, VS Code: nothing found. Chrome: not established.

**Before you start**

- Signed in; publishing needs Cloud mode on the phone ('Switch to AGI Cloud to publish', artifactPublishing.ts:357-358).
- Publishable kinds: html, react, svg, mermaid, markdown, text, code (published-artifact-service.ts:61-69); content up to 1,000,000 characters (line 50).
- Viewer copy needs sign-in; otherwise the button sends the viewer to sign up or in (PublishedArtifactView.tsx:147-151).

**Screens and controls**

- Unpublish dialog 'Unpublish this artifact?' with the sentence that the link stops working, saved visitor data is deleted, and it cannot be undone; confirm button 'Unpublish artifact' (PublishedArtifactsSection.tsx:94-100).
- Success notices 'Version N of ... is live again.' and 'Unpublished ... The link no longer works.' (PublishedArtifactsSection.tsx:276, 410-420).
- Mobile audience options 'Anyone with the link', 'Everyone in this workspace (N)', 'Only people you invite' (PublishedArtifactControls.tsx:153-163).
- Org sharing: 'Share project with organization', 'Stop sharing', per-project 'read-only' or 'N can edit' (OrganizationSharingSection.tsx:241, 293, 303-305).

**Journey**

1. Publish an artifact from chat. The server stores it, mints a token, and records version 1.
2. Edit and publish again: the same row is updated (same token, same link) and a new version is recorded.
3. Open Settings > Published artifacts > History; the list shows versions newest first.
4. Press 'Put live' on an older version; the server rewrites the live content to that version and records it as a new version.
5. Press Unpublish and confirm; the publication row is deleted and the link stops working.
6. Viewer: open the link; press 'Save a copy to my chats' (artifact) or 'Open in AGI' (conversation).
7. The conversation fork creates a new chat in the viewer's chosen workspace and copies the shared messages in batches of 200; a failed copy discards the partial chat when it can.
8. Workspace sharing: choose a project and an audience and share; members open it from the shared sections; 'Stop sharing' withdraws it.

**What the person sees and gets**

- Fork errors: 'This shared conversation has expired.', 'This shared conversation could not be found.', 'The shared messages could not be copied, so no new conversation was kept.' (ContinueSharedSession.tsx:147-155, 201-212, 217-221).
- Copy errors: 'A chat was created, but saving this copy could not be confirmed...' (PublishedArtifactView.tsx:187-196).
- History errors: 'Failed to load the publish history' and the unconfirmed put-live message (PublishedArtifactsSection.tsx:375-380, 425-430).
- Audit event share_link_updated with status version_restored (versions/[version]/route.ts:110-118).

**Settings**

- Publication visibility: public, invited or organization (published-artifact-service.ts:71-83); a live artifact binds the publication to 'invited' (line 440).
- Mobile audience selector (PublishedArtifactControls.tsx:153-163).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Publish is an upsert on user and artifact: the link token is kept, content replaced, and a version is recorded (apps/web/lib/services/published-artifact-service.ts:421-498, 442-449, 871-915).
- Put live is a restore that rewrites the same publication with the chosen snapshot and records another version, in one transaction (published-artifact-service.ts:500-561; apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts:48-133).
- Version list newest first (published-artifact-service.ts:971-990).
- Unpublish deletes the publication row (published-artifact-service.ts:563-578) with a confirmation dialog.
- Web viewer can save an artifact copy to a new private chat (apps/web/features/chat/lib/copy-shared-artifact.ts:35-90).
- Web viewer can fork a shared conversation (apps/web/app/chat/from-share/[token]/ContinueSharedSession.tsx:123-215).
- Workspace sharing of projects, artifacts, conversations and connectors (OrganizationSharingSection.tsx:195-640).
- Mobile publish, audience selection, viewers and unpublish (apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx).

**Incomplete**

- S110.17 viewer-authorized connected app: routes exist (POST /api/artifacts/runtime/[token]/connectors and /complete run as the signed-in viewer), but they refuse public shares with 'connectors_not_on_public_share' and the page shows sign-in buttons and a consent card (apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts:37-60; complete/route.ts:40-80; PublishedArtifactView.tsx:267-297). Whether it works end to end is not established. The brief says missing.
- Mobile version history: the sheet I read restores from the local artifact store (ArtifactFullScreen.tsx:560-563, 811-817); restoring a published version from the phone was not found.
- Fork on mobile: not found.

**Present but disconnected or switched off**

- The sandbox page for artifacts blocks network from the page itself (infrastructure/sandbox/index.html:26 comment states connect-src is blocked entirely); the brief cites line 54 for the policy tag.

**Not available**

- Skills are not in the organization sharing sections (no 'skill' string in OrganizationSharingSection.tsx).
- CLI and VS Code: no published-version or workspace sharing controls found.
- Only projects have a per-member 'Can edit' level in that section; the other sections are read-only snapshots or open-to-members.

## 4. Required behaviour

**Established requirements**

- A published output is updated in place: the user changes it, republishes to the same link, and the new version is recorded and reversible. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.28)
- A viewer of a public or shared creation can make a private copy in their own account and continue it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.29)
- A user explicitly shares a resource they own (project, conversation, artifact, skill) into their workspace with an access level, and members find and open it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.30)
- A viewer opening a shared artifact or app signs in with their own account so the app uses the viewer's connected services with their permissions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.17)
- Unpublish cannot be undone and deletes visitor data. (source: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:94-100)
- Artifacts that use connected apps are refused on public shares. (source: apps/web/lib/services/published-artifact-service.ts:109-110)

**Acceptance criteria**

1. Publishing the same artifact twice keeps the same token and URL and adds a second version.
2. The history lists versions newest first and marks exactly one as 'Live now'.
3. 'Put live' on version N makes the public page show version N's content and adds a new version; the older versions remain.
4. Unpublish asks for confirmation, then the link stops working.
5. A signed-out viewer pressing 'Save a copy to my chats' is sent to sign in; a signed-in viewer ends in a new chat containing the artifact.
6. Opening /chat/from-share/<token> signed in creates a new conversation with the shared messages; an expired share shows 'This shared conversation has expired.'
7. Sharing a project with the organization as read-only is visible to members; 'Stop sharing' removes it.
8. An artifact that uses connected apps cannot be published at 'Anyone with the link' and shows the public-share message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A restored version should keep the same visibility and token [inferred from the update statement at published-artifact-service.ts:513-519].
- Skills should be shareable to a workspace per S110.30, but no entry exists; the plugin directory may carry workspace skills through a workspace_plugin marker (apps/web/features/plugins/server/directory/workspace-skill.ts:1-12) [inferred, not opened further].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add skills to workspace sharing or record that workspace plugins are the route.
- [proposed] Mirror 'Put live' on mobile for published versions.
- [proposed] Run a live end-to-end check of a viewer-authorized connected app on a non-public share.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | Publish, restore, unpublish, list versions, visibility and connector rules (lines 421-1076). |
| endpoint | POST/GET /api/artifacts/publish | `apps/web/app/api/artifacts/publish/route.ts` | Publish and list (lines 168-169). |
| endpoint | GET/PATCH/DELETE /api/artifacts/publish/[token] | `apps/web/app/api/artifacts/publish/[token]/route.ts` | Read, update and unpublish (lines 212-215). |
| endpoint | GET /api/artifacts/publish/[token]/versions | `apps/web/app/api/artifacts/publish/[token]/versions/route.ts` | Version list (line 35). |
| endpoint | GET/POST /api/artifacts/publish/[token]/versions/[version] | `apps/web/app/api/artifacts/publish/[token]/versions/[version]/route.ts` | Read a version; POST restores it (lines 46-133). |
| endpoint | /api/artifacts/runtime/[token]/connectors and /complete | `apps/web/app/api/artifacts/runtime/[token]/connectors/route.ts` | Viewer-run connector and completion calls (connectors/route.ts:37-60; complete/route.ts:40-80). |
| table | published_artifacts | `apps/web/db/neon/` | Live publication rows (migration file not recorded). |
| table | published_artifact_versions | `apps/web/db/neon/` | Version snapshots read at published-artifact-service.ts:886. |
| table | organization_shared_projects / artifacts / sessions / connectors | `apps/web/db/neon/` | Workspace sharing grants (create statements found by search). |
| table | shared_sessions | `apps/web/db/neon/` | Shared conversation snapshots. |
| screen | PublishedArtifactsSection | `apps/web/features/settings/sections/PublishedArtifactsSection.tsx` | Settings list, history, put live, unpublish. |
| screen | PublishedArtifactView | `apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx` | Viewer page, Save a copy, sign-in and connector consent (lines 69, 144, 267-297). |
| service | copySharedArtifactToChat | `apps/web/features/chat/lib/copy-shared-artifact.ts` | Creates a chat and saves the artifact as a message. |
| screen | ContinueSharedSession | `apps/web/app/chat/from-share/[token]/ContinueSharedSession.tsx` | Fork of a shared conversation in batches of 200. |
| component | SharedSessionViewer | `apps/web/features/chat/components/share/SharedSessionViewer.tsx` | Shared chat page with 'Open in AGI'. |
| service | shared-conversation-snapshot | `apps/web/features/chat/lib/shared-conversation-snapshot.ts` | Builds the snapshot and its artifacts. |
| screen | OrganizationSharingSection | `apps/web/features/settings/sections/OrganizationSharingSection.tsx` | Workspace sharing UI. |
| screen | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile publish alert, controls and version sheet (lines 281-300, 1929). |
| component | PublishedArtifactControls | `apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx` | Mobile audience and unpublish. |
| config | sandbox page | `infrastructure/sandbox/index.html` | Isolated render page for artifacts with a CSP that blocks network. |
| test | published-artifact-service tests | `apps/web/lib/services/published-artifact-service.test.ts` | Covers publish rules. |
| test | PublishedArtifactsSection authority test | `apps/web/features/settings/sections/PublishedArtifactsSection.authority.test.tsx` | Covers the settings section. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The client posts the artifact to /api/artifacts/publish; the server checks ownership, content size and policy, upserts the publication and records a version. | our servers | published-artifact-service.ts:421-498; publish/route.ts:168 |
| A viewer opens the link; the server renders it (sandboxed for html and react kinds). | our servers | published-artifact-service.ts:103-105 (requiresSandboxedRender); infrastructure/sandbox/index.html |
| Put live: the server reads the snapshot, prepares the publication, rewrites the row and records a version in one transaction, and logs an audit event. | our servers | versions/[version]/route.ts:48-117; published-artifact-service.ts:500-561 |
| Save a copy: the viewer's browser creates a conversation and saves the artifact as a message through the normal chat API. | device and our servers | copy-shared-artifact.ts:35-90 |
| Continue a shared chat: the browser reads /api/share/<token>, creates a conversation, and posts the messages in batches; on failure it deletes the partial conversation. | device and our servers | ContinueSharedSession.tsx:147-215 |
| A viewer-run app calls the runtime routes as the signed-in viewer; the model call runs with the viewer's connected apps if the publisher declared them and the share is not public. | our servers | runtime/[token]/complete/route.ts:40-80; connectors/route.ts:56-60 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Published content and title | table published_artifacts | Server only; the owner sees it in Settings | Deleted on unpublish; cap per user MAX_PUBLISHED_PER_USER (published-artifact-service.ts:59) |
| Version snapshots (title, kind, language, content) | table published_artifact_versions | Server only | Retention not established |
| Forked conversation | viewer's conversations (web_conversations, web_messages) | Yes through chat sync | Normal conversation rules |
| Workspace sharing grants | tables organization_shared_* | Server only | Removed by 'Stop sharing'; conversation snapshots expire (OrganizationSharingSection.tsx:441) |

**Models and providers.** Publishing, versions and forks use no model. Viewer-run apps call the model through respondToArtifactCompletion under the viewer's plan and rate limit (complete/route.ts:40-80); which models are allowed was not opened.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Owner signed in to publish; viewers can read public links signed out but need an account to copy or fork or to run apps with AI or saved data (PublishedArtifactView.tsx:144-151, 267-285). |
| Permissions | Only the owner can restore, unpublish and list versions (readOwnedPublication, published-artifact-service.ts:971-975); sharing managers can withdraw org shares (OrganizationSharingSection.tsx:339-341, 441); a row-level security denial is reported as an ownership error (published-artifact-service.ts:463-469). |
| Subscription | A per-user publication cap and quota admission exist (published-artifact-service.ts:59; test published-artifact-service.quota-admission.test.ts). Viewer-run connector calls pass artifactConnectorsGateResponse using the viewer's plan (connectors/route.ts:62-68). Plan names were not opened. |
| Limits and metering | Content up to 1,000,000 characters; share-create rate limit on restore (versions/[version]/route.ts:67-68); connector request limited to 1 to 10 connected apps (connectors/route.ts:48-51). |
| Feature flags | None found for publishing itself; connector rules depend on CONNECTOR_RELEASE_STATE indirectly. |
| Model compatibility | Not model dependent for publish, version, fork or share. |
| Provider restrictions | Connected apps are refused on public shares (published-artifact-service.ts:109-110). |
| Local mode | Phone Local mode cannot publish: the app says to switch to AGI Cloud first and that nothing was uploaded (artifactPublishing.ts:357-358). Desktop Local-mode publishing was not established. Forks and workspace shares need an account. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading history | 'Loading the publish history...' | PublishedArtifactsSection.tsx:659 |
| History fails | 'Failed to load the publish history' | PublishedArtifactsSection.tsx:375-380 |
| Put live unconfirmed | 'Could not confirm whether that version was put live. Reload the list and history to check.' | PublishedArtifactsSection.tsx:425-430 |
| Publication gone before restore | Conflict 'This publication is no longer available to restore.' | versions/[version]/route.ts:101-103 |
| Quota or policy refusal | Conflict or validation errors mapped from service errors. | versions/[version]/route.ts:88-100 |
| Unpublish | Dialog then deletion; 'cannot be undone'. | PublishedArtifactsSection.tsx:94-100 |
| Fork expired, missing, empty | Three separate notices and a 'Start a new chat' link. | ContinueSharedSession.tsx:216-231 |
| Fork error | Alert with 'Try again' and partial-copy warning if cleanup fails. | ContinueSharedSession.tsx:201-212, 232-250 |
| Signed-out viewer | Save a copy redirects to sign in. | PublishedArtifactView.tsx:147-151 |
| Phone in Local mode | Publish refused with explanation. | artifactPublishing.ts:357-358 |
| Offline, retries, accessibility | Retry exists for fork; offline handling for publish was not established; mobile version rows have accessibility labels. | apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx:136 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/published-artifact-service.test.ts`: Publish service.
- `apps/web/lib/services/__tests__/published-artifact-service.visibility.test.ts`: Visibility rules.
- `apps/web/lib/services/__tests__/published-artifact-service.connectors.test.ts`: Connector use on publications.
- `apps/web/lib/services/__tests__/published-artifact-service.quota-admission.test.ts`: Per-user cap.
- `apps/web/lib/services/published-artifact-publication-policy.restore.test.ts`: Restore policy.
- `apps/web/features/settings/sections/PublishedArtifactsSection.authority.test.tsx`: Settings section.
- `apps/web/app/shared-artifact/[token]/PublishedArtifactView.test.tsx`: Viewer page.
- `apps/web/features/chat/lib/copy-shared-artifact.test.ts`: Copy to chat.
- `apps/web/features/settings/sections/OrganizationSharingSection.test.tsx`: Workspace sharing section.
- `apps/web/lib/services/__tests__/artifact-runtime-service.public-share.test.ts`: Runtime on public shares.
- `apps/mobile/__tests__/ArtifactVersionHistory.test.tsx`: Mobile version history.
- `apps/mobile/__tests__/PublishedArtifactViewers.test.tsx`: Mobile viewers.

**Test scenarios**

- **Republish keeps the link**
  1. Publish an artifact.
  2. Edit and publish again.
  3. Compare URLs and open History.
  - Expected: Same URL; two versions; newest 'Live now'.
- **Put an old version live**
  1. In History press 'Put live' on version 1.
  2. Open the public link.
  - Expected: Version 1 content shows; a new version appears; others remain.
- **Unpublish**
  1. Press Unpublish and confirm.
  2. Open the link.
  - Expected: Link no longer works.
- **Fork a shared chat**
  1. Sign in as a second user.
  2. Open the share link and press Open in AGI.
  - Expected: New chat with the messages; original unchanged.
- **Save artifact copy signed out**
  1. Open a shared artifact signed out and press Save a copy to my chats.
  - Expected: Sent to sign in; after sign in the copy is saved.
- **Connected app on a public share**
  1. Publish an artifact bound to a connected app at 'Anyone with the link'.
  2. Run it as a viewer.
  - Expected: Refusal with the public-share message; works only on workspace or invited shares.

**Where to look when it fails**

- Audit event share_link_updated with status version_restored.
- Error codes connectors_not_on_public_share and connectors_not_declared.
- Tables published_artifacts, published_artifact_versions, organization_shared_artifacts.
- Fork errors in ContinueSharedSession messages.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md)
- Desktop: [70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md)
- Mobile: [70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md)
- Chrome: [70-qa/test-plans/chrome/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/chrome/110-cross-product-experiences-to-include-in-the-product-map.md)

## 10. Gaps and dependencies

- **Skills cannot be shared to a workspace from the sharing section; only projects have a can-edit level.** Affects: Web, desktop. Evidence: OrganizationSharingSection.tsx has no skill section; brief S110.30. Work needed: Decide whether skills share through workspace plugins; otherwise add a section.
- **Viewer-authorized connected apps are unverified end to end; brief says missing.** Affects: Web, desktop. Evidence: runtime routes and consent UI exist; PublishedArtifactView.tsx:267-297. Work needed: Live check on a non-public share; update the brief.
- **Mobile has no fork of shared conversations or artifacts; published-version restore on mobile not found.** Affects: Mobile. Evidence: Brief S110.29; ArtifactFullScreen.tsx:560-563. Work needed: Add fork on mobile and wire the published version list if required.
- **No versioning, fork or workspace sharing on CLI and VS Code.** Affects: CLI, VS Code. Evidence: Brief S110.28, S110.30; nothing found. Work needed: Likely out of scope per the CLI and VS Code decisions; record it.
- **Chrome status unverified.** Affects: Chrome. Evidence: Brief; apps/extension/src/background/site-policy-publication.ts is about site policy, not artifacts [inferred from its name]. Work needed: Check the Chrome side panel for artifact publishing.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-authorization-and-workspaces
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- table:published_artifacts
- table:published_artifact_versions
- table:organization_shared_artifacts
- table:shared_sessions
- api:POST /api/artifacts/publish
- F110-11

## Unknown

- Migration file names for the publication, version and sharing tables.
- Whether desktop Local mode can publish.
- Retention of version snapshots and the per-user cap value (MAX_LIST_LIMIT not opened).
- How skills are shared into a workspace, if at all, through workspace plugins.
- Whether the Chrome extension publishes or versions artifacts.
- How visibility 'organization' is chosen in the web publish flow (service supports it; UI not opened).
- Behaviour of mobile 'Restore version' for published artifacts versus local history.
