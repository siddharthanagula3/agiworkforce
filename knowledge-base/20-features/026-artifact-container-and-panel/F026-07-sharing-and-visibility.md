---
id: "F026-07"
type: "feature"
title: "Sharing and visibility"
aliases: ["Sharing and visibility", "Publish artifact", "Publish artifact to a public link", "Who can open this", "Published artifacts", "Shared links (settings)", "Share link (Library)", "Share controls (S26.31)", "Public/private state (S26.32)", "audience / visibility (public, organization, invited)"]
area: "26 Artifact container and panel"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S26.31", "S26.32"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-api-and-contracts", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F026-07 Sharing and visibility

Lets a signed-in Cloud user publish an artifact to a share link, choose who can open it (anyone, the workspace, or invited people), see that state, and withdraw the link. Web and mobile have the full set. The CLI has publish, audience and unpublish for public or workspace. VS Code only shows state and opens the link. Chrome has none.

Area: [26. Artifact container and panel](README.md). Requirement items: [S26.31](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2631), [S26.32](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2632).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Sends a copy of an artifact (a page, diagram, document or code file the assistant made) to the AGI Cloud publish service, which returns a link. The owner can change who may open the link, see that state, and unpublish so the link stops working. [apps/web/app/api/artifacts/publish/route.ts:78] [apps/web/app/api/artifacts/publish/[token]/route.ts:72]

**Why it exists.** Claude and ChatGPT let people share an artifact by link. The project's own wording for S26.31 is: publish to a link, copy it, choose who can open it, take it down (doc: knowledge-base/data/area-briefs/026-artifact-container-and-panel.md). Without it a made page can only be copied or downloaded.

**Who uses it.** A person on Cloud (managed) with an artifact in a chat who wants someone else to view it. Team members who want a workspace-only link. A developer using the CLI to publish from a terminal.

**Problems it solves**

- Gives a stable link to an artifact so others can open it without a copy-paste.
- Lets the owner narrow the audience after publishing and see at a glance whether it is open to everyone.
- Lets the owner withdraw a link.

**Use cases**

- Publish an HTML page the assistant built and send the link to a colleague.
- Switch a published link to workspace-only before sharing internal content.
- Invite named people by email so only they can open the page.
- From the terminal, run the CLI publish command for an artifact id and print the link.

## 2. User experience

**Where to find it**

- Web viewer (artifact panel): toolbar button labelled 'Publish' (accessible name 'Publish artifact to a public link'); on a narrow panel the same action is a menu item 'Publish' (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2305, apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924).
- Web after publishing: a bar under the toolbar with the link, a 'Copy link' button, a selector labelled 'Who can open this' with 'Anyone with the link', 'Everyone in this workspace (N)' (only when the publisher belongs to a workspace) and 'Only people you invite', and an invited-people editor when 'Only people you invite' is chosen (ArtifactPreview.tsx:3010, ArtifactPreview.tsx:3037, ArtifactPreview.tsx:3054-3069).
- Web unpublish and list: Settings, Shared links, section 'Published artifacts' with row buttons 'Open', 'Copy', 'History', 'Unpublish' (apps/web/features/settings/sections/PublishedArtifactsSection.tsx:524, :600, :608, :634-644; mounted from apps/web/features/settings/sections/SharedLinksSection.tsx:502 and apps/web/features/settings/components/WebSettingsModal.tsx:289).
- Web Library: item action 'Share link' for artifact items, with a confirm 'Create a public link to <name>?' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1864, :713-720).
- Desktop (public Electron app): shows the hosted web app, so the web controls apply [inferred from AGENTS.md section 5: 'The public Desktop shows the hosted web app'] (doc: AGENTS.md). The internal Tauri desktop only writes a local file and has no cloud publisher (apps/desktop/src/features/artifacts/publishAdapter.ts:1-17).
- Mobile (AGI Mobile) full-screen artifact: a header icon (accessible name 'Publish artifact to a public link', or 'Republish artifact link' once published), then under the content a link row with copy, 'Share publication link' and open-in-browser icons, and a 'Who can open this' radio group plus 'Unpublish artifact' (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1319-1331, :1578-1625, :1633; apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx:153-216).
- Mobile state chip on artifact cards and the gallery: 'Published', 'Workspace', 'Invited' (apps/mobile/src/features/chat/components/ArtifactAudienceChip.tsx:14-16; used at InlineArtifactCard.tsx:300 and apps/mobile/src/features/artifacts/index.tsx:387).
- CLI: 'agi artifacts publish <id> --audience public|workspace', 'agi artifacts audience <id> <audience>', 'agi artifacts published', 'agi artifacts unpublish <id> [-y]', and 'agi artifacts list' marks published rows (apps/cli/src/lib.rs:1399-1431, :3877-4050).
- VS Code: the Artifacts tree shows a state suffix in each row ('published publicly', 'shared with your workspace', 'shared with invited people') and a command that opens a published link in the browser; there is no publish or unpublish command (apps/extension-vscode/src/features/artifacts/artifactPresentation.ts:108-125; apps/extension-vscode/src/core/commandSetup.ts:2660).
- Chrome extension: no publish or visibility control found [searched apps/extension/src for publish; found none].

**Before you start**

- Signed in to an AGI account and the artifact came from a Cloud (managed) chat; Local or own-key artifacts are refused (packages/platform/artifacts/src/artifacts.ts:256-276).
- Artifact kind must be html, react, svg, mermaid, markdown, text or code (apps/web/lib/services/published-artifact-service.ts:61-69).
- Workspace audience needs a workspace on a plan with team administration (apps/web/lib/services/org-entitlements.ts:22,133-138).

**Screens and controls**

- Web: Publish button, link bar, Copy link, 'Who can open this' selector, invited-people editor, confirm dialogs 'Limit this to people you invite?', 'Limit this to your workspace?', 'Make this public again?' (ArtifactPreview.tsx:1330-1360).
- Web Settings: 'Published artifacts' list with Open, Copy, History, Unpublish and a confirm 'Unpublish this artifact?' (PublishedArtifactsSection.tsx:94).
- Mobile: confirm 'Publish to a public link?' with Cancel and Publish (ArtifactFullScreen.tsx:285-296).
- CLI: prompts before unpublish unless -y.

**Journey**

1. Web: open the artifact in the panel.
2. Press 'Publish'. The page sends title, kind, language and content to the publish service (publishArtifactClient.ts:74-130).
3. On success the link is shown and copied to the clipboard; a toast says 'Published · link copied to clipboard' (ArtifactPreview.tsx:1243).
4. Optionally change 'Who can open this'; a confirm dialog explains who loses access; on confirm a toast says e.g. 'Only your workspace can open this now' (ArtifactPreview.tsx:1296-1307).
5. To withdraw: Settings, Shared links, Published artifacts, Unpublish, confirm. The link stops opening.
6. Mobile: tap the publish icon, confirm, the link is copied; change audience with the radio buttons; tap 'Unpublish artifact'.
7. CLI: 'agi artifacts publish <id>' prints 'Published ... at <url> (opens for <audience>)'.

**What the person sees and gets**

- Toasts: 'Published · link copied to clipboard', 'Published. Copy the link from the bar below.', 'Link copied', 'Could not change who can open this', 'Failed to publish artifact' (ArtifactPreview.tsx:1243-1265, :1297).
- Mobile alerts: 'Artifact published', 'Publish not confirmed', 'Publish failed', 'Switch to AGI Cloud to publish', 'Sign in to AGI Cloud to publish' (ArtifactFullScreen.tsx:299-306, :776-790).
- The viewer of a link sees the shared page, or an 'unavailable' page when the link is withdrawn or never existed (apps/web/app/shared-artifact/[token]/page.tsx:69-79).
- Private state: mobile shows 'Private. Only you can open it until you publish it.' in Cloud mode (ArtifactFullScreen.tsx:1573). Web shows no 'private' label; private is the absence of the link bar [searched ArtifactPreview, InlineArtifactCards, ArtifactCard and GalleryClient for a private label; none found].

**Settings**

- Settings, Shared links (web) lists and unpublishes published artifacts.
- Rate and size limits are server configuration (see access_and_usage).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web publish, audience change (public, organization, invited), copy link and invited viewers are wired from the panel to the publish API (apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:457-500, :552, :611-619, :846).
- Server publish route validates input, applies the external-sharing gate, content moderation and outbound-content inspection, writes the row and a version, and records an audit event (apps/web/app/api/artifacts/publish/route.ts:63-110; apps/web/lib/services/published-artifact-publication-policy.ts:62-110).
- Republishing the same artifact id updates the same row and keeps the same token, so the link does not change; the first publish is 'public', or 'invited' when a live-artifact binding exists (apps/web/lib/services/published-artifact-service.ts:432-452).
- Unpublish deletes the row; the public page then renders the unavailable page (published-artifact-service.ts:573; apps/web/app/shared-artifact/[token]/page.tsx:69-79). Public lookup requires visibility 'public' (published-artifact-service.ts:834).
- Mobile has publish, audience, unpublish, invited viewers, the state chip and a 'Private' note (ArtifactFullScreen.tsx:731-805, PublishedArtifactControls.tsx, ArtifactAudienceChip.tsx). The brief marks mobile S26.31 as not done; the code contradicts it.
- CLI publish with audience, audience change, list published, unpublish with confirmation, and 'open' that prefers the published page (apps/cli/src/lib.rs:3877-4050; apps/cli/src/cloud/artifacts.rs:451-590). The CLI only accepts 'public' or 'workspace' (apps/cli/src/cloud/artifacts.rs:560-566).
- VS Code shows published state per artifact and opens the link (artifactPresentation.ts:108-125; artifactActions.ts:210-212).
- Local-file 'publish' for Local privacy mode exists in the shared package (packages/platform/artifacts/src/artifacts.ts:315-340).

**Incomplete**

- Web shows visibility only inside the viewer after publishing and in Settings; cards, the chat transcript and the gallery show none [searched InlineArtifactCards.tsx, ArtifactCard.tsx, GalleryClient.tsx].
- Web viewer has no unpublish control; withdrawal is only in Settings, Shared links (grep of apps/web/features found Unpublish only in PublishedArtifactsSection.tsx).
- Renaming an artifact does not change the title of the published page: the server accepts a title change (apps/web/app/api/artifacts/publish/[token]/route.ts:195) but the web client helper sends only visibility (publishArtifactClient.ts:186). [inferred: no other sender found]
- CLI cannot set the 'invited' audience; it has no invited-people commands (cli artifacts.rs:560-566).
- Docs conflict: founder decision D-2026-09-28-16 says mobile keeps artifact sharing settings off the phone, but mobile ships them (doc: docs/decisions/2026-09-27-founder-decisions.md:284-292; apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx:153-216). Code outranks prose (doc: AGENTS.md section 2).

**Present but disconnected or switched off**

- The 'local' publish result (file URL) is returned by the shared package, but the web panel only shows a toast 'Exported to a local file' and no Local file writer is passed by the web panel (ArtifactPreview.tsx:1250-1252; ArtifactsPanel.tsx:476-487 passes privacyMode 'managed' only).
- Tauri desktop publish adapter writes a local file and says no cloud publisher exists there (apps/desktop/src/features/artifacts/publishAdapter.ts:14-17).

**Not available**

- VS Code: no publish, audience or unpublish (founder decision: VS Code lists artifacts and opens a published link) (doc: docs/decisions/2026-09-27-founder-decisions.md:116-118).
- Chrome extension: no publish or state display found. The shared publish path rejects CLI, VS Code and Chrome surfaces (packages/platform/artifacts/src/artifacts.ts:295).
- Publishing PDF, Word, image, spreadsheet or generated-file artifacts: refused with 'cannot be published to a public page yet. Download or copy it instead.' (publishArtifactClient.ts:44-49).

## 4. Required behaviour

**Established requirements**

- S26.31: the user can publish an artifact to a link, copy or share the link, choose who can open it, and take it down. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.31)
- S26.32: wherever an artifact is shown, the user can see whether it is private, published to anyone, or shared with the workspace. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.32)
- Experience contract: explicit public publish operation; tenant and ownership checks on every version, download and share. (source: docs/product/experience-contract.md:520-528)
- VS Code lists artifacts and opens a published artifact's link but does not publish. (source: docs/decisions/2026-09-27-founder-decisions.md:116-118)
- Publishing uploads to managed cloud, so a Local or own-key artifact is refused. (source: packages/platform/artifacts/src/artifacts.ts:256-276)

**Acceptance criteria**

1. Publishing a Cloud HTML artifact on web returns a link of the form /shared-artifact/<24 characters> and shows it with 'Copy link'.
2. Publishing the same artifact twice keeps the same link and, if content is unchanged, does not add a version.
3. Switching 'Who can open this' to 'Only people you invite' asks for confirmation and, after confirm, a signed-out visitor to the link sees the unavailable or invite-only page.
4. Unpublish from Settings makes the old link show the unavailable page for a signed-out visitor.
5. Trying to publish an artifact created in Local or own-key mode returns the 'Download the artifact instead' message and uploads nothing.
6. On mobile in Local mode, the publish icon explains 'Switch to AGI Cloud to publish' and nothing is uploaded.
7. CLI 'agi artifacts publish <id> --audience workspace' with no workspace that can share fails before publishing anything.
8. A published row appears in 'agi artifacts published' and in web Settings with the same audience label.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Visibility should also show on web artifact cards and the gallery to meet 'wherever an artifact is shown' (S26.32); today only mobile, CLI list and VS Code show it outside the viewer. [inferred from the brief line and the code search]
- The published page title should follow an artifact rename. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an 'Unpublish' action to the web viewer link bar so the owner does not need Settings.
- [proposed] Send the new title to the publish service when a published artifact is renamed.
- [proposed] Show a small visibility chip on web cards like the one on mobile.
- [proposed] Resolve the docs conflict about mobile sharing by updating D-2026-09-28-16 or removing the code.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview (publish button, link bar, audience select) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Web viewer: handlePublish (:1221), handleChangeAudience (:1272), link bar (:3010), audience select (:3037). |
| component | ArtifactsPanel (publish wiring) | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | makePublishHandler (:457) calls the shared publishArtifact with privacy mode managed; looks up existing publication (:520); changeAudience (:552). |
| service | publishArtifactClient | `apps/web/features/chat/components/artifacts/publishArtifactClient.ts` | createWebCloudPublisher (:74), fetchArtifactPublication (:132), setPublishedArtifactAudience (:172), resolvePublishableKind (:22). |
| service | publishArtifact (shared) | `packages/platform/artifacts/src/artifacts.ts` | Trust-boundary check: managed-only cloud publish (:256-340). |
| endpoint | POST/GET /api/artifacts/publish | `apps/web/app/api/artifacts/publish/route.ts` | Publish and list published artifacts; rate limit 'share-create'; audit event (:46,:100,:168). |
| endpoint | GET/PATCH/DELETE /api/artifacts/publish/[token] | `apps/web/app/api/artifacts/publish/[token]/route.ts` | Detail, change audience or title, unpublish (:169,:195,:212-213). |
| endpoint | GET /api/artifacts/publish/lookup | `apps/web/app/api/artifacts/publish/lookup/route.ts` | Looks up the publication for an artifact id; used by fetchArtifactPublication. |
| endpoint | /api/artifacts/publish/[token]/viewers | `apps/web/app/api/artifacts/publish/[token]/viewers/route.ts` | Add, list and remove invited viewers by email. |
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | publishArtifactRecord (:421), unpublishArtifactRecord (:563), getPublishedArtifactByToken (:824), quota (:413-415), version history. |
| service | org-shared-artifact-service | `apps/web/lib/services/org-shared-artifact-service.ts` | updatePublishedArtifactAudience (:163): workspace grant, plan and permission checks. |
| service | published-artifact-publication-policy | `apps/web/lib/services/published-artifact-publication-policy.ts` | External-sharing gate, moderation and outbound content inspection before publish. |
| service | published-site-viewer-service | `apps/web/lib/services/published-site-viewer-service.ts` | Invited viewers, max 100 per page (:13). |
| screen | Shared artifact page | `apps/web/app/shared-artifact/[token]/page.tsx` | Public, workspace and invited reads; unavailable page for withdrawn links (:29-79). |
| screen | PublishedArtifactsSection | `apps/web/features/settings/sections/PublishedArtifactsSection.tsx` | Settings list with Open, Copy, History, Unpublish and audience labels (:38-42,:584). |
| table | published_artifacts | `apps/web/db/neon/0095_published_artifacts.sql` | One row per user and artifact id with token, visibility and content (:47). |
| table | published_artifact_versions | `apps/web/db/neon/0257_file_versions_and_lineage.sql` | Version history of each publication (:53). |
| table | organization_shared_artifacts | `apps/web/db/neon/0184_organization_shared_artifacts.sql` | Grant row for workspace audience (:76). |
| table | published_artifact_viewers | `apps/web/db/neon/0372_published_site_viewers.sql` | Invited viewer emails (:27). |
| component | Library Share link | `apps/web/features/library/components/LibraryView.tsx` | shareLibraryArtifact publishes a library item through the same publisher (:51-72). |
| screen | Mobile ArtifactFullScreen publish | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | handlePublish (:731), private note (:1573), controls (:1633). |
| service | Mobile artifactPublishing | `apps/mobile/src/features/chat/services/artifactPublishing.ts` | publish (:60), set audience (:272), unpublish (:292), local-mode messages (:357). |
| component | Mobile PublishedArtifactControls and ArtifactAudienceChip | `apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx` | Audience radio group, unpublish; chip in ArtifactAudienceChip.tsx. |
| command | CLI artifacts publish/audience/unpublish/published | `apps/cli/src/lib.rs` | Subcommands (:1399-1431) and handler (:3850-4050). |
| service | CLI cloud artifacts | `apps/cli/src/cloud/artifacts.rs` | publish_for_audience (:497), set_audience (:568), unpublish (:585), audience_visibility (:560). |
| component | VS Code artifact presentation | `apps/extension-vscode/src/features/artifacts/artifactPresentation.ts` | State labels in tree rows (:108-125). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Publish. The viewer checks the artifact kind and sends artifact id, title, kind, language, content and conversation id. | device | apps/web/features/chat/components/artifacts/publishArtifactClient.ts:74-110 |
| The shared publish function refuses unless the artifact was created in managed (Cloud) mode and the requested mode matches. | device | packages/platform/artifacts/src/artifacts.ts:256-276,292-310 |
| The publish service checks CSRF and the 'share-create' rate limit (5 per minute), applies the external-sharing policy gate, moderation and outbound content inspection. | our servers | apps/web/app/api/artifacts/publish/route.ts:46; apps/web/lib/services/published-artifact-publication-policy.ts:62-110; apps/web/lib/rate-limit.ts:424-428 |
| The service checks the per-user publication cap, upserts the published row (token kept on republish) and appends a version if content changed. | our servers | apps/web/lib/services/published-artifact-service.ts:413-452,421-500 |
| The receipt (link, visibility, workspace member count) is validated on the client, shown, and the link is copied. | device | publishArtifactClient.ts:112-130; ArtifactPreview.tsx:1233-1245 |
| Audience change sends PATCH {visibility}; the server checks workspace plan and permission, connector-use and sharing policy, then moves the grant row in one transaction. | our servers | apps/web/app/api/artifacts/publish/[token]/route.ts:169-186; apps/web/lib/services/org-shared-artifact-service.ts:163-260 |
| A visitor opens /shared-artifact/<token>; the server reads public rows first, then workspace and invited rows for a signed-in user, else shows the unavailable or invite-only page. | our servers | apps/web/app/shared-artifact/[token]/page.tsx:29-79 |
| Unpublish sends DELETE; the row is deleted and the link no longer resolves. | our servers | apps/web/app/api/artifacts/publish/[token]/route.ts:72; published-artifact-service.ts:573 |
| CLI path: connects only for managed privacy, re-derives the artifact content from the conversation message, and posts the same publish request. | device and our servers | apps/cli/src/cloud/client.rs:361-373; apps/cli/src/cloud/artifacts.rs:403-495 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Published copy of the artifact (title, kind, language, content, visibility, token) | table published_artifacts (our database) | Read by the shared page; listed to the owner on every surface that calls the publish list endpoint (web Settings, mobile, CLI, VS Code). | Deleted when unpublished (published-artifact-service.ts:573) and when its conversation is deleted (unpublishArtifactsForConversations, :581-596). Whether visitor-saved data is also deleted on unpublish is unknown; the confirm text says it is (PublishedArtifactsSection.tsx:94). |
| Version history of each publication | table published_artifact_versions | Shown in Settings 'History'. | Retention rule unknown; deletion on unpublish unknown (cascade not read). |
| Workspace grant and invited viewer emails | tables organization_shared_artifacts and published_artifact_viewers | Server only. | Grant removed when audience moves off 'organization' (org-shared-artifact-service.ts:233-250). |
| Audit event 'share_link_updated' | security audit log (our servers) | Server only. | Written on publish (publish/route.ts:100). The unpublish handler writes none that I could see (apps/web/app/api/artifacts/publish/[token]/route.ts:55-79). |

**Models and providers.** No model runs for sharing. The content published is whatever a model produced earlier. Moderation and outbound-content inspection are server checks, not a chosen provider. Provider choice is not read by this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required. Web routes use a user-scoped database; mobile asserts a signed-in Cloud account before sending (apps/mobile/src/features/chat/services/artifactPublishing.ts:60-70); the CLI needs a stored sign-in (apps/cli/src/cloud/client.rs:375-379). Viewing a public link needs no account (page.tsx:29-34). |
| Permissions | Only the owner can publish, change audience or unpublish (queries filter by user id: published-artifact-service.ts:573). Workspace audience also needs the 'content.share' permission in that workspace (org-shared-artifact-service.ts:214-219). External sharing is subject to workspace policy (publish route via buildExternalSharingGateResponse, [token]/route.ts:180). A publication that reads connected apps cannot be made public ([token]/route.ts:176-178). |
| Subscription | No plan check on a public or invited publish was found in the publish route or service (read apps/web/app/api/artifacts/publish/route.ts and published-artifact-service.ts). Workspace audience needs the 'team_admin' capability on the workspace plan: team, team_premium, enterprise (apps/web/lib/services/org-entitlements.ts:22,133-138; packages/contracts/types/src/billing-catalog.ts:362). |
| Limits and metering | Content up to 1,000,000 characters and title up to 300 (published-artifact-service.ts:50-51; publish/route.ts:36-42). Per-user cap of 200 publications (artifact-index.ts:132; published-artifact-service.ts:59,413-415), then a conflict error. Rate limit 'share-create' 5 per minute (rate-limit.ts:424-428). Up to 100 invited viewers per page (published-site-viewer-service.ts:13). No usage credits are charged for publishing; none found. |
| Feature flags | No feature flag found for publishing itself. Mobile and web both gate on the artifact kind. The 'connectors released' flag affects only connected-app artifacts. |
| Model compatibility | Not model dependent; any artifact kind in the allowed list can be published regardless of the model that wrote it. |
| Provider restrictions | None by provider. The restriction is by mode: only artifacts created in managed Cloud mode can be published (artifacts.ts:256-276). |
| Local mode | In Local (on-device) mode nothing is uploaded. Web returns the message 'This artifact was created in <mode> mode. Publishing uploads it to AGI managed cloud, so it is unavailable in this privacy mode. Download the artifact instead.' (artifacts.ts:261-266). Mobile Local mode shows 'Switch to AGI Cloud to publish' (ArtifactFullScreen.tsx:299-301; artifactPublishing.ts:357-358). CLI refuses non-managed sessions (client.rs:361-373). Signing in is required for Cloud publish; Local use itself needs no payment. [inferred for payment: no plan check found] |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Publishing in progress | Button label 'Publishing…'; Publish and the audience selector are disabled while a change is pending; a second change during a pending one throws 'A publication change is already in progress.' | ArtifactPreview.tsx:2308-2310; ArtifactsPanel.tsx:470-473 |
| Panel closed or artifact switched mid-publish | Result is dropped and no toast is shown; a lease/view check guards it. | ArtifactPreview.tsx:1237-1241; ArtifactsPanel.tsx:459-464 |
| Error from server (validation, ownership, quota, rate limit) | Toast with the server message or 'Failed to publish artifact'; link bar cleared. | ArtifactPreview.tsx:1262-1265; publish/route.ts:85-95 |
| Invalid receipt | Error 'Publication could not be confirmed. The artifact may have been published, but its receipt was invalid.' | publishArtifactClient.ts:116-121 |
| Outcome uncertain (mobile network failure after send) | Alert 'Publish not confirmed' and a 'Check publication status' button that re-reads the publication. | ArtifactFullScreen.tsx:781-790,1540-1556; artifactPublishing.ts:375-389 |
| Signed out or Local mode on mobile | Alert offering sign-in or explaining Cloud mode; nothing sent. | ArtifactFullScreen.tsx:733-745 |
| Unsupported kind | ArtifactNotPublishableError message; mobile hides the icon. | publishArtifactClient.ts:44-49; ArtifactFullScreen.tsx:281-283 |
| Link withdrawn or never valid | Visitor sees the unavailable page; a malformed token gets the same page. | app/shared-artifact/[token]/page.tsx:62-79 |
| Invite-only link, signed-out visitor | Invite-only page asking to sign in. | page.tsx:74-77 |
| Narrowing audience | Confirm dialog states who loses access; unavailable audiences hidden (workspace option only when the publisher has a workspace). | ArtifactPreview.tsx:1326-1360,3055-3059 |
| Offline | Not handled in the code as a distinct state; the fetch error becomes the generic failure toast on web. | ArtifactPreview.tsx:1262-1265 |
| Accessibility | Audience select has a visible label; mobile audience options are a radio group with 44-point minimum height and labels. | ArtifactPreview.tsx:3039-3041; PublishedArtifactControls.tsx:176-190 |
| App differences | CLI cannot select 'invited'; VS Code and Chrome cannot publish. | apps/cli/src/cloud/artifacts.rs:560-566; docs/decisions/2026-09-27-founder-decisions.md:116-118 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.publish.test.tsx`: Viewer publish button, link bar and audience flow.
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.publish.test.tsx`: Panel publish wiring, lease and stale-view guards.
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.privacy.test.tsx`: Artifacts from Local or own-key origins never upload.
- `apps/web/features/chat/components/artifacts/publishArtifactClient.publish.test.ts`: Publisher request and receipt checks.
- `apps/web/features/chat/components/artifacts/publishArtifactClient.audience.test.ts`: Audience change request and receipt.
- `apps/web/features/chat/components/artifacts/publishArtifactClient.lookup.test.ts`: Publication lookup.
- `apps/web/app/api/artifacts/publish/route.test.ts`: Publish route.
- `apps/web/app/api/artifacts/publish/[token]/route.test.ts`: Detail and unpublish route.
- `apps/web/app/api/artifacts/publish/[token]/route.visibility.test.ts`: Audience change route.
- `apps/web/app/api/artifacts/publish/[token]/route.rename.test.ts`: Title change on a published artifact (server).
- `apps/web/app/api/artifacts/publish/[token]/viewers/route.test.ts`: Invited viewers route.
- apps/web/lib/services/published-artifact-service.visibility.test.ts (not found) (not found): Service visibility rules.
- apps/web/lib/services/published-artifact-service.quota-admission.test.ts (not found) (not found): Publication cap.
- apps/web/lib/services/org-shared-artifact-service.audience.test.ts (not found) (not found): Workspace audience rules.
- `apps/web/features/settings/sections/PublishedArtifactsSection.authority.test.tsx`: Settings list and unpublish.
- `packages/platform/artifacts/src/__tests__/artifacts.test.ts`: Shared publish trust-boundary rules.
- `apps/mobile/__tests__/ArtifactPublicationControls.test.tsx`: Mobile audience controls.
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.publish.test.tsx`: Mobile publish flow.
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.publishAccount.test.tsx`: Mobile publish with account changes.
- `apps/mobile/__tests__/PublishedArtifactViewers.test.tsx`: Mobile invited viewers.
- `apps/cli/src/cloud/artifacts.rs`: Inline Rust tests for publish request shape, workspace refusal, cursor paging (:794-1270).
- `apps/extension-vscode/src/__tests__/artifactsView.test.ts`: Tree rows marked published and the audience label (:70-95,:297).

**Test scenarios**

- **Publish and withdraw a Cloud HTML artifact**
  1. Sign in on web, make an HTML artifact in a Cloud chat.
  2. Press Publish and copy the link.
  3. Open the link in a signed-out window.
  4. In Settings, Shared links, press Unpublish and confirm.
  5. Reload the link.
  - Expected: Step 3 shows the page; step 5 shows the unavailable page.
- **Narrow to invited people**
  1. Publish an artifact.
  2. Choose 'Only people you invite' and confirm.
  3. Add one email.
  4. Open the link signed out, then signed in as that email.
  - Expected: Signed out sees invite-only or unavailable; the invited person sees the page.
- **Local artifact is not uploaded**
  1. Create an artifact in a Local or own-key conversation.
  2. Press Publish.
  - Expected: A message says publishing is unavailable in that mode; no row appears in 'agi artifacts published'.
- **Mobile Local mode**
  1. On the phone switch to Local mode.
  2. Open an artifact full screen, tap the publish icon.
  - Expected: Alert 'Switch to AGI Cloud to publish'; nothing is uploaded.
- **CLI workspace audience without a workspace**
  1. Run 'agi artifacts publish <id> --audience workspace' as a user with no workspace that can share.
  - Expected: Error 'Select a workspace that can share artifacts ... Nothing was published.'
- **State visible outside the viewer**
  1. Publish on web.
  2. Open mobile gallery, run 'agi artifacts list', open the VS Code Artifacts tree.
  - Expected: Mobile chip 'Published', CLI line 'published: ...', VS Code suffix 'published publicly'.

**Where to look when it fails**

- Server errors: PublishedArtifactValidationError, PublishedArtifactOwnershipError, PublishedArtifactQuotaError (published-artifact-service.ts:107-140).
- Table published_artifacts, published_artifact_versions; audit event type share_link_updated.
- Rate limit key 'share-create'.
- Mobile messages in artifactPublishing.ts:354-403; CLI errors printed from CloudError.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/026-artifact-container-and-panel.md](../../70-qa/test-plans/web/026-artifact-container-and-panel.md)
- Desktop: [70-qa/test-plans/desktop/026-artifact-container-and-panel.md](../../70-qa/test-plans/desktop/026-artifact-container-and-panel.md)
- Mobile: [70-qa/test-plans/mobile/026-artifact-container-and-panel.md](../../70-qa/test-plans/mobile/026-artifact-container-and-panel.md)
- CLI: [70-qa/test-plans/cli/026-artifact-container-and-panel.md](../../70-qa/test-plans/cli/026-artifact-container-and-panel.md)
- VS Code: [70-qa/test-plans/vscode/026-artifact-container-and-panel.md](../../70-qa/test-plans/vscode/026-artifact-container-and-panel.md)

## 10. Gaps and dependencies

- **Visibility is not shown on web cards, transcript cards or the gallery, only in the viewer and Settings.** Affects: Web and Electron desktop users; brief S26.32 says 'wherever an artifact is shown'.. Evidence: No private or audience label in InlineArtifactCards.tsx, ArtifactCard.tsx, GalleryClient.tsx; viewer-only at ArtifactPreview.tsx:3010-3060.. Work needed: Add a visibility chip to web cards using the publication lookup, as mobile does.
- **No unpublish control in the web viewer.** Affects: Web and Electron desktop.. Evidence: Unpublish exists only in apps/web/features/settings/sections/PublishedArtifactsSection.tsx:634-644.. Work needed: Add Unpublish to the link bar with the existing confirm text.
- **Renaming does not update the published title.** Affects: Any user who renames after publishing.. Evidence: Server supports title PATCH ([token]/route.ts:195); client sends only visibility (publishArtifactClient.ts:186).. Work needed: Call PATCH with title after a rename of a published artifact.
- **CLI cannot choose or manage the 'invited' audience and has no viewer commands.** Affects: CLI users.. Evidence: apps/cli/src/cloud/artifacts.rs:560-566.. Work needed: Either document it as intentional or add commands.
- **Brief and founder decision disagree with the mobile code about mobile sharing.** Affects: Mobile users and planners.. Evidence: docs/decisions/2026-09-27-founder-decisions.md:284-292 vs ArtifactFullScreen.tsx:731-805.. Work needed: Owner decision: keep mobile controls and update the decision, or remove them.
- **Chrome extension has no state display or publish; the brief marks it unverified.** Affects: Chrome users.. Evidence: No publish code under apps/extension/src.. Work needed: Decide whether Chrome needs it; if not, record 'n/a'.
- **No unpublish audit event found.** Affects: Security review.. Evidence: [token]/route.ts:55-79 has no recordAuditEvent while publish does (publish/route.ts:100).. Work needed: Confirm and add an audit event if intended.
- **No live run of any sharing flow is recorded.** Affects: All apps.. Evidence: audit/live-check/026-artifact-container-and-panel.md lists chrome cells only; no run results for web sharing found.. Work needed: Run the scenarios against the running product.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-api-and-contracts
- SYS-data-model-and-migrations

## Unknown

- Whether unpublish also deletes version history and visitor-saved data (cascades not read).
- Whether a live run of web sharing has ever passed; no result file found.
- Whether the Electron desktop shows the link bar exactly as web: inferred from AGENTS.md, not read in code.
- Whether the 'share-create-account-day' daily limit applies to artifact publish: it is used only in apps/web/app/api/share/route.ts:561,651 in my search.
- Which of the brief and the founder decision on mobile sharing is intended.
- Whether Chrome shows any published state; searched only for publish and visibility words.
