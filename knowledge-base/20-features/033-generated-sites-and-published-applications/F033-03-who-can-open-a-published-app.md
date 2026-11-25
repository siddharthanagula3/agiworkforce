---
id: "F033-03"
type: "feature"
title: "Who can open a published app"
aliases: ["Who can open this", "Audience", "Visibility", "Named-viewer access (S33.11)", "Workspace-only access (S33.12)", "Password or authentication options (S33.13)", "Invited people", "Only people you invite", "Anyone with the link", "Everyone in this workspace"]
area: "33 Generated Sites and published applications"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S33.11", "S33.12", "S33.13"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "mode:cloud", "plan:team", "table:published_artifacts", "table:published_artifact_viewers", "table:organization_shared_artifacts", "api:PATCH /api/artifacts/publish/[token]", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "F033-01", "F033-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F033-03 Who can open a published app

Sets who may open a published page: anyone with the link, members of the owner's workspace, or named people invited by email who must sign in. Web and mobile have the selector and an invited-people list. The CLI sets public or workspace only. Workspace sharing needs a plan with team features. No password option exists.

Area: [33. Generated Sites and published applications](README.md). Requirement items: [S33.11](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3311), [S33.12](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3312), [S33.13](../../10-requirements/capabilities/033-generated-sites-and-published-applications.md#s3313).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Stores a visibility on each publication (public, organization or invited) and enforces it on reads. Workspace access uses a grant row; invited access uses an email list of up to 100 people (apps/web/lib/services/published-site-viewer-service.ts:13; migrations 0184, 0372).

**Why it exists.** A link in the wrong hands is a leak. Owners need to narrow who can open work that is internal or private, and pages that use connected apps must never be public (published-artifact-service.ts:73-80).

**Who uses it.** Owners who publish for a team or a few people; admins of workspaces.

**Problems it solves**

- Public links leak.
- Sharing with a team without sending emails.
- Keeping connected-app pages away from the public.

**Use cases**

- Share an internal dashboard page with the whole workspace.
- Invite two contractors by email and nobody else.
- Switch a page back to public for a launch.
- Block public sharing of a page that reads connected apps.

## 2. User experience

**Where to find it**

- Web chat: after publishing, the link bar has a selector labelled 'Who can open this' with 'Anyone with the link', 'Everyone in this workspace (<count>)' and 'Only people you invite' (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3036-3062). Choosing 'Only people you invite' shows the invited people editor (3064-3072).
- Web Sites page: a Sharing item in each site's menu and a radio group 'Who can open this site' with 'Anyone with the link', 'Your workspace', 'Only people you invite' (apps/web/features/sites/components/SiteSharingOptions.tsx:8-10; SiteDialogs.tsx:150-180).
- Mobile artifact screen: options 'Anyone with the link', 'Everyone in this workspace (<n>)', 'Only people you invite' (apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx:153-163); mobile Site screen: section 'Who can open it' with chips 'Anyone with the link', 'Only your workspace', 'Invited people' (apps/mobile/src/features/sites/SiteDetailScreen.tsx:321-345; service.ts:326-330).
- CLI: agi artifacts audience <id> public|workspace, and --audience on publish (apps/cli/src/lib.rs:1415-1421; 3888-3910).
- VS Code and Chrome: none found.

**Before you start**

- A publication owned by the person.
- Workspace audience: the person is in a workspace whose plan allows artifact sharing and who may share content (org-shared-artifact-service.ts:206-219).
- Invited audience: viewers sign in with an account whose profile email is on the list (migration 0372).

**Screens and controls**

- Confirm dialogs on web: 'Limit this to people you invite?', 'Limit this to your workspace?', 'Make this public again?', each naming who loses access (ArtifactPreview.tsx:1311-1352).
- Mobile alerts with the same wording (PublishedArtifactControls.tsx:66-90).
- Invited editor: email input with placeholder name@example.com, add and remove (apps/web/features/sites/components/SiteViewersEditor.tsx:170).

**Journey**

1. Publish an artifact.
2. Open the audience selector.
3. Pick a new audience and read the dialog naming who loses access.
4. Confirm; the app sends the change.
5. For invited, add email addresses; each person must sign in with that email to open the link.

**What the person sees and gets**

- Web toasts: 'Only your workspace can open this now', 'Only the people you invite can open this now', 'Anyone with the link can open this now' (ArtifactPreview.tsx:1301-1308).
- Error toast 'Could not change who can open this' or the server message.
- Server returns the same link with the new visibility (token route.ts:195-209).
- Visitors see the invite-only page when not allowed (InviteOnlyArtifact.tsx).

**Settings**

- Workspace plan capability for artifact sharing (org-entitlements.ts:22; :133-144).
- Workspace external-sharing policy can refuse a move to public (token route.ts:180-186).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- PATCH /api/artifacts/publish/[token] with visibility public, organization or invited, in one transaction that also adds or removes the workspace grant (apps/web/app/api/artifacts/publish/[token]/route.ts:132-209; apps/web/lib/services/org-shared-artifact-service.ts:163-285).
- Moving to public is refused when the page uses connected apps (409 with a message) and when workspace policy blocks external sharing (route.ts:169-188).
- Workspace sharing requires a plan capability (SUBSCRIPTION_REQUIRED 403) and the content.share permission (org-shared-artifact-service.ts:206-219).
- Invited list: GET, POST and DELETE on /viewers, with up to 100 emails, audit events, and row-level-security read for the viewer's profile email (apps/web/app/api/artifacts/publish/[token]/viewers/route.ts; migration 0372).
- Pages built from connected apps start as invited (published-artifact-service.ts:436-441).
- Mobile audience controls, viewers list and the Site detail chips (PublishedArtifactControls.tsx; PublishedArtifactViewers.tsx; SiteDetailScreen.tsx:321-345).
- CLI public or workspace, with rollback of a new publication if narrowing fails (apps/cli/src/cloud/artifacts.rs:497-538).

**Incomplete**

- CLI cannot set or manage invited people (artifacts.rs:560-566 accepts only public and workspace).
- Mobile Site detail chips change the audience with no confirm dialog, while the artifact screen asks first (SiteDetailScreen.tsx:321-345 versus PublishedArtifactControls.tsx:66-90).
- The brief marks web, desktop and mobile named-viewer access as missing; code exists on web and mobile, so the brief is out of date.

**Present but disconnected or switched off**

- Organization option is hidden in the web selector when the person has no workspace or plan allowing sharing (ArtifactPreview.tsx:3055-3059; published-artifact-workspace.ts:7-14).

**Not available**

- Password protection: none found in published-artifact services, routes or page (searched for password in those files).
- Per-viewer roles or edit rights: none found.
- VS Code and Chrome: none found.

## 4. Required behaviour

**Established requirements**

- The owner can restrict a site to specific named viewers (brief S33.11), to workspace members (S33.12), and may require a password or sign-in where offered (S33.13). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S33.11, S33.12, S33.13)
- Three audiences exist: public, organization and invited. (source: packages/contracts/cloud-contracts/src/artifact-index.ts:52-56)
- Invited means signed-in people on a named list stored per publication. (source: apps/web/db/neon/0372_published_site_viewers.sql; apps/web/app/api/artifacts/publish/[token]/viewers/route.ts)
- Pages that use connected apps cannot be public. (source: apps/web/lib/services/published-artifact-service.ts:73-80; token route.ts:177-179)
- Sharing with a workspace is plan-gated. (source: apps/web/lib/services/org-entitlements.ts:22; :133-144)
- Changing audience asks the owner to confirm and says who loses access. (source: ArtifactPreview.tsx:1311-1352; AGENTS.md section 9)

**Acceptance criteria**

1. Switching a public page to invited stops a signed-out visitor from opening it (invite-only page).
2. An invited person signed in with the listed email can open it; with another email sees 'You do not have access'.
3. The 101st invited email is refused with 'A site can be shared with at most 100 people.'
4. Switching to workspace on an account whose plan lacks artifact sharing returns 403 with the plan message.
5. A page that uses connected apps cannot be set to public (409 message).
6. Removing an invited email revokes that person's access immediately.
7. CLI audience public and workspace work; any other value errors 'Audience must be public or workspace'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Switching from invited to public keeps the stored email list unchanged because no viewer deletion occurs in the audience update. [inferred from org-shared-artifact-service.ts:163-285]
- Viewer matching is by profile email, so an unverified email may matter; mobile 'shared with me' returns emailVerified. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a password option only after a product decision; today sign-in is the only gate.
- [proposed] Let the CLI manage invited people.
- [proposed] Add the same confirm dialog to the mobile Site screen chips.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | PATCH /api/artifacts/publish/[token] | `apps/web/app/api/artifacts/publish/[token]/route.ts` | Change visibility or rename; connector and sharing-policy authorization. |
| service | updatePublishedArtifactAudience | `apps/web/lib/services/org-shared-artifact-service.ts` | Transaction that adds or removes the workspace grant and sets visibility. |
| service | getOrgReadableArtifactByToken | `apps/web/lib/services/org-shared-artifact-service.ts` | Workspace read, admission checked by row-level security. |
| endpoint | GET/POST/DELETE /api/artifacts/publish/[token]/viewers | `apps/web/app/api/artifacts/publish/[token]/viewers/route.ts` | List, add and remove invited emails with audit events. |
| service | published-site-viewer-service | `apps/web/lib/services/published-site-viewer-service.ts` | Viewer list, 100-person cap, invited read, shared-with-me list. |
| table | published_artifact_viewers | `apps/web/db/neon/0372_published_site_viewers.sql` | Invited emails with row-level security and the third visibility value. |
| table | organization_shared_artifacts | `apps/web/db/neon/0184_organization_shared_artifacts.sql` | Workspace grant rows; cascade on publication delete. |
| schema | audience revocation policies | `apps/web/db/neon/0395_published_artifact_audience_revocation.sql` | Owner can see and revoke old workspace grants; invited rows excluded from workspace grants. |
| schema | connector audience helper | `apps/web/db/neon/0383_published_artifact_connector_audience.sql` | Function allowing connectors only for non-public audiences. |
| service | org-entitlements | `apps/web/lib/services/org-entitlements.ts` | organizationCanShareArtifacts via plan capability. |
| service | published-artifact-workspace | `apps/web/lib/services/published-artifact-workspace.ts` | Returns workspace member count or null. |
| component | ArtifactPreview audience selector | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Select, confirm dialogs, toasts, viewers editor mount. |
| component | SiteViewersEditor | `apps/web/features/sites/components/SiteViewersEditor.tsx` | Add and remove invited emails on web. |
| component | SiteSharingOptions and SiteDialogs | `apps/web/features/sites/components/SiteSharingOptions.tsx` | Sites page sharing radio group and dialog. |
| service | setPublishedArtifactAudience | `apps/web/features/chat/components/artifacts/publishArtifactClient.ts` | Web client PATCH with receipt check. |
| component | PublishedArtifactControls | `apps/mobile/src/features/chat/components/PublishedArtifactControls.tsx` | Mobile audience options, confirms and unpublish. |
| component | PublishedArtifactViewers | `apps/mobile/src/features/chat/components/PublishedArtifactViewers.tsx` | Mobile invited list with remove confirm. |
| service | mobile artifactPublishing viewers | `apps/mobile/src/features/chat/services/artifactPublishing.ts` | Audience PATCH and viewers calls (272-350). |
| command | agi artifacts audience | `apps/cli/src/lib.rs` | CLI audience command (1415-1421, 3888-3910). |
| service | cli set_audience | `apps/cli/src/cloud/artifacts.rs` | PATCH call; public and workspace only (560-583). |
| screen | InviteOnlyArtifact | `apps/web/app/shared-artifact/[token]/InviteOnlyArtifact.tsx` | Visitor-facing denial page. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Owner picks an audience; the app shows a confirm that names who loses access. | device | ArtifactPreview.tsx:1311-1352; PublishedArtifactControls.tsx:66-90 |
| Client sends PATCH with only the visibility; the receipt must echo the token and the new visibility or the client reports it as unconfirmed. | device | publishArtifactClient.ts:172-202 |
| Server checks CSRF and rate limit, parses the body and locks the row. | our servers | token route.ts:132-165; org-shared-artifact-service.ts:163-180 |
| For workspace: checks the plan capability and content.share permission. For public: refuses if connectors are used or workspace policy blocks external sharing. | our servers | org-shared-artifact-service.ts:206-221; token route.ts:169-188 |
| Server adds or deletes the workspace grant, updates visibility, and re-reads grants to verify. | our servers | org-shared-artifact-service.ts:229-285 |
| Visitor read: public by token; otherwise a signed-in scoped read decides by row-level security for workspace members or listed emails. | our servers | page.tsx:29-46; migration 0372 |
| Adding an invited email inserts a row under an advisory lock and writes an audit event. | our servers | published-site-viewer-service.ts:57-132; viewers/route.ts:44-80 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Visibility value on the publication | table published_artifacts column visibility | Server only; clients refetch | Kept with the publication; deleted with it. |
| Workspace grant (organization_id, published_artifact_id, shared_by) | table organization_shared_artifacts | Server only | Removed when audience leaves organization or the publication is deleted (cascade). |
| Invited emails (lower-cased) and who invited them | table published_artifact_viewers | Server only | Removed on remove or by cascade on unpublish (migration 0372). |
| Audience audit events share_link_updated with status viewer_added or viewer_removed | security audit log | No | Retention unknown. |

**Models and providers.** No model or provider takes part. Plan capability and workspace policy, not model choice, decide what is allowed.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Owner must be signed in. Public pages need no account to view; workspace and invited pages need a signed-in viewer. |
| Permissions | Workspace sharing needs the content.share permission in the workspace (org-shared-artifact-service.ts:214-219). Only the owner manages the viewers list (RLS policies in migration 0372). |
| Subscription | Workspace audience needs a plan capability named team_admin (org-entitlements.ts:22; :133-138); the error says which plans include it via billingPlanCapabilityPlanLabels. Public and invited audiences have no plan gate found. |
| Limits and metering | At most 100 invited emails per site (published-site-viewer-service.ts:13); share-create rate limit 5 per minute for changes (rate-limit.ts:424-428). No metering of audience changes. |
| Feature flags | none found in the code |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | Audience cannot be set in Local mode because nothing can be published there; the Site screen on mobile shows a cloud gate saying Sites live in AGI Cloud (SiteDetailScreen.tsx:226-236). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Selector disabled while a change or publish is pending; viewers editor shows 'Loading…' or 'Updating access…'. | ArtifactPreview.tsx:3044; SiteViewersEditor.tsx:199 |
| Success | Toast names the new audience. | ArtifactPreview.tsx:1301-1308 |
| Error | Toast or alert with server message; connector conflict message 'This artifact uses connected apps, which are not available on publicly shared artifacts. Share it with your workspace or with people you invite.' | published-artifact-service.ts:73-80 |
| Uncertain change | Receipt mismatch reports 'Audience change could not be confirmed. Access may have changed'; mobile throws SiteMutationUncertainError. | publishArtifactClient.ts:190-200; apps/mobile/src/features/sites/service.ts:30-38 |
| No workspace | Workspace option hidden on web; mobile shows 'Join or create a workspace to limit a site to its members.' | ArtifactPreview.tsx:3055; SiteDetailScreen.tsx:336-338 |
| Invalid email | 'Enter a full email address' on web; 'Enter a valid email address' from the route. | SiteViewersEditor.tsx:151; viewers/route.ts:36-40 |
| List full | 409 with 'A site can be shared with at most 100 people.' | published-site-viewer-service.ts:15-21; viewers/route.ts:70-72 |
| Cancel | Cancelling the confirm leaves the audience unchanged. | ArtifactPreview.tsx:1311-1352 (apply runs only on confirm) |
| Workspace membership lost | Owner can still see and revoke old grants after leaving the workspace. | migration 0395 owner read and delete policies |
| Accessibility | Selector has a label; radio group has aria-label 'Who can open this site'; mobile options have accessibility labels. | ArtifactPreview.tsx:3038-3042; SiteSharingOptions.tsx:34; PublishedArtifactControls.tsx:184 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/artifacts/publish/[token]/route.visibility.test.ts`: Audience change route (by file name).
- `apps/web/app/api/artifacts/publish/[token]/viewers/route.test.ts`: Viewers route (by file name).
- `apps/web/lib/services/__tests__/org-shared-artifact-service.audience.test.ts`: Audience transitions and grants (by file name).
- `apps/web/lib/services/__tests__/published-site-viewer-service.quota-admission.test.ts`: Viewer cap under lock (by file name).
- `apps/web/lib/services/__tests__/published-artifact-service.connectors.test.ts`: Connector-based publications (by file name).
- `apps/web/db/neon/published-artifact-audience-revocation-migration.test.ts`: Revocation migration (by file name).
- `apps/web/db/neon/published-artifact-connector-audience-migration.test.ts`: Connector audience migration (by file name).
- `apps/web/features/sites/components/SiteViewersEditor.test.tsx`: Viewers editor (by file name).
- `apps/web/features/chat/components/artifacts/publishArtifactClient.audience.test.ts`: Web client audience call (by file name).
- `apps/mobile/src/features/chat/services/__tests__/artifactPublishingViewers.test.ts`: Mobile viewers service (by file name).
- `apps/cli/src/cloud/artifacts.rs`: Inline tests: workspace audience refused before publish; new publication withdrawn when narrowing fails.

**Test scenarios**

- **Public to invited**
  1. Publish a page.
  2. Choose 'Only people you invite', confirm.
  3. Open the link signed out.
  - Expected: Invite-only page asking to sign in.
- **Invited viewer**
  1. Add an email that matches a test account.
  2. Sign in with that account and open the link.
  - Expected: The page renders with the line 'Shared with you'.
- **Wrong account**
  1. Sign in with an email not on the list and open the link.
  - Expected: 'You do not have access'.
- **Workspace without plan**
  1. Use an account whose workspace plan lacks sharing.
  2. Choose workspace audience.
  - Expected: 403 with the plan message; option hidden in the selector.
- **Connector page to public**
  1. Publish an artifact that uses connected apps.
  2. Try Anyone with the link.
  - Expected: 409 with the connected-apps message; first publish started as invited.
- **CLI audience**
  1. agi artifacts audience <id> workspace
  2. agi artifacts audience <id> invited
  - Expected: First works when a sharing workspace exists; second errors 'Audience must be public or workspace'.

**Where to look when it fails**

- Error codes SUBSCRIPTION_REQUIRED and conflict from org-shared-artifact-service.ts.
- Tables published_artifacts.visibility, organization_shared_artifacts, published_artifact_viewers.
- Audit events with status viewer_added or viewer_removed.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/web/033-generated-sites-and-published-applications.md)
- Desktop: [70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/desktop/033-generated-sites-and-published-applications.md)
- Mobile: [70-qa/test-plans/mobile/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/mobile/033-generated-sites-and-published-applications.md)
- CLI: [70-qa/test-plans/cli/033-generated-sites-and-published-applications.md](../../70-qa/test-plans/cli/033-generated-sites-and-published-applications.md)

## 10. Gaps and dependencies

- **No password protection** Affects: Owners wanting a shared secret. Evidence: No password code in published services, routes or page; brief S33.13. Work needed: Product decision; if wanted, design hashed password gate.
- **CLI cannot manage invited people** Affects: CLI users. Evidence: apps/cli/src/cloud/artifacts.rs:560-566. Work needed: Add invited audience and viewer commands.
- **Mobile Site screen changes audience without a confirm** Affects: Mobile users. Evidence: SiteDetailScreen.tsx:321-345. Work needed: Add the same consequence dialog as the artifact screen.
- **Brief says named viewers missing on web and mobile but code exists** Affects: Documentation. Evidence: SiteViewersEditor.tsx; PublishedArtifactViewers.tsx. Work needed: Update the brief status.
- **No VS Code or Chrome audience controls** Affects: Those apps. Evidence: No code found. Work needed: None for VS Code (decided); Chrome unknown.
- **Invite emails are not sent by the product as far as read** Affects: Invited viewers. Evidence: No mail send in viewers route or service. Work needed: Decide whether to notify invited people.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- mode:cloud
- plan:team
- table:published_artifacts
- table:published_artifact_viewers
- table:organization_shared_artifacts
- api:PATCH /api/artifacts/publish/[token]
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- F033-01
- F033-02

## Unknown

- Which plan names include the team_admin capability (resolved at run time by billing plan data; not read).
- Whether invited viewers receive any email or notification.
- Whether the viewers list survives a switch back to public (no deletion seen; behaviour not run).
- Whether workspace members on a lapsed plan lose access at read time or only at share time.
