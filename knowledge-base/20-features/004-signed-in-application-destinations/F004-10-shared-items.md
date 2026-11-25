---
id: "F004-10"
type: "feature"
title: "Shared items"
aliases: ["Sharing", "Workspace sharing", "Shared items", "Shared-with-me resources (S4.24)", "/workspace/sharing", "OrganizationSharingSection"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S4.24"]
depends_on: ["surface:web", "surface:desktop", "api:GET /api/settings/organization/shared", "SYS-authorization-and-workspaces", "SYS-files-artifacts-and-storage", "SYS-connectors-plugins-and-skills", "SYS-memory-projects-and-context"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-10 Shared items

A workspace page titled Sharing that lists what the workspace shares: projects, conversations, artifacts and connectors, with who can open each and the access level. Members can open shared artifacts and conversations; only the sharer or a sharing manager can stop sharing. Needs workspace membership. Web only, also shown in Desktop through the hosted web app.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.24](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s424).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows the organization's shared projects (with member access), shared conversations, shared artifacts and shared connectors, and lets permitted people stop sharing or change who can open a project. (apps/web/features/settings/sections/OrganizationSharingSection.tsx:664)

**Why it exists.** So a workspace owner can see and control everything exposed to teammates in one place. [inferred]

**Who uses it.** Members of a team or enterprise workspace; owners and admins who manage sharing.

**Problems it solves**

- Not knowing what is visible to the team.
- Withdrawing a share without finding the original chat or project.

**Use cases**

- Admin opens Sharing and stops sharing a project.
- Member opens a shared artifact the team published.
- Owner shares one of their own projects with the organization.
- Admin checks which connectors are shared.

## 2. User experience

**Where to find it**

- Web: /workspace/sharing, page title 'Sharing', description 'What this workspace shares, and the access level of each grant.' (apps/web/app/workspace/sharing/page.tsx:12); nav label 'Sharing' (apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx:114).
- Desktop: through the hosted web app (doc: AGENTS.md section 5).
- Mobile, CLI, VS Code, Chrome: none found.

**Before you start**

- Signed in, terms accepted, adult eligibility and an active account (apps/web/app/workspace/layout.tsx:20).
- Membership of an organization; otherwise the section says to create an organization in Team (apps/web/features/settings/sections/OrganizationSharingSection.tsx:690).

**Screens and controls**

- Card 'Who is in your organization' with member count and your role.
- Sections for shared projects, conversations, artifacts and connectors.
- Buttons 'Stop sharing' (with confirm), 'Share project with organization', a 'Who can open it' audience selector, and 'Open <name>' links for artifacts and conversations.

**Journey**

1. Open /workspace/sharing.
2. Read each section.
3. Open a shared artifact or conversation by its link.
4. To withdraw, press 'Stop sharing' and confirm; the confirm names who loses access.

**What the person sees and gets**

- Empty texts: 'Nothing is shared yet.' for projects; 'No artifacts are shared yet. Publish one from a chat and choose your workspace.'; 'No conversations are shared yet. Share one from a chat and choose your workspace.'; 'No connectors are shared yet.' (apps/web/features/settings/sections/OrganizationSharingSection.tsx:247).
- Loading text 'Loading organization sharing...' and an error alert 'Organization sharing could not be loaded. Try again.'.

**Settings**

- Project audience and per-member access controls (SharedProjectAudienceControl, SharedProjectMemberAccessList).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Overview API returns members, projects, connectors, artifacts, conversations and the caller's rights (apps/web/app/api/settings/organization/shared/route.ts:54).
- Non-managers only see projects they own or have access to (apps/web/app/api/settings/organization/shared/route.ts:98).
- Stop sharing for each kind with a confirm (apps/web/features/settings/sections/OrganizationSharingSection.tsx:303).
- Artifacts and conversations open by link: /shared-artifact/<token> and /share/<token> (apps/web/features/settings/sections/OrganizationSharingSection.tsx:385).

**Incomplete**

- The row for a shared project has no open link in this section; the brief cites apps/web/app/chat/projects/[id]/page.tsx:976 for opening projects. The draft statement 'open a shared project from its row' is not backed by this component.
- The page lists what the workspace shares, not strictly what was shared with me; the brief name 'Shared-with-me' differs.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Mobile, CLI, VS Code and Chrome have no shared items screen (brief S4.24 and no code found).

## 4. Required behaviour

**Established requirements**

- A destination lists resources (projects, conversations, artifacts, connectors) shared with the user and opens them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S4.24)
- Only the publisher or a sharing manager can withdraw an artifact; only the sharer or a sharing manager can withdraw a conversation. (source: (apps/web/features/settings/sections/OrganizationSharingSection.tsx:340))
- An irreversible action asks first and names the consequence. (source: (doc: AGENTS.md section 9))

**Acceptance criteria**

1. A non-member sees the create-an-organization message, not other workspaces' data.
2. A member sees only projects they own or can access; a sharing manager sees all.
3. An empty workspace shows the four empty texts.
4. Stop sharing asks first and names who loses access.
5. A person who is not the sharer and not a sharing manager sees no Stop sharing button on artifacts and conversations.
6. Cross-organization requests never return another organization's items.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Opening a shared project should be possible from the row. [inferred from brief wording]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an Open link on each shared project row.
- [proposed] Add a mobile read-only shared list if mobile supports shared artifacts.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | WorkspaceSharingPage | `apps/web/app/workspace/sharing/page.tsx` | Page wrapper with title and help link. |
| component | OrganizationSharingSection | `apps/web/features/settings/sections/OrganizationSharingSection.tsx` | All sections, empty texts, confirms. |
| endpoint | GET /api/settings/organization/shared | `apps/web/app/api/settings/organization/shared/route.ts` | Overview payload. |
| endpoint | /api/settings/organization/shared/projects/[projectId] | `apps/web/app/api/settings/organization/shared/projects` | Project share changes. |
| endpoint | /api/settings/organization/shared/artifacts/[artifactId] | `apps/web/app/api/settings/organization/shared/artifacts` | Artifact unshare. |
| endpoint | /api/settings/organization/shared/conversations/[sharedSessionId] | `apps/web/app/api/settings/organization/shared/conversations` | Conversation unshare. |
| endpoint | /api/settings/organization/shared/connectors/[connectorId] | `apps/web/app/api/settings/organization/shared/connectors` | Connector unshare. |
| service | org-sharing-service | `apps/web/lib/services/org-sharing-service.ts` | Membership and shared projects. |
| service | org-shared-artifact-service | `apps/web/lib/services/org-shared-artifact-service.ts` | Shared artifacts list. |
| service | org-shared-session-service | `apps/web/lib/services/org-shared-session-service.ts` | Shared conversations list. |
| service | org-shared-connector-service | `apps/web/lib/services/org-shared-connector-service.ts` | Shared connectors list. |
| service | organization-permission-service | `apps/web/lib/services/organization-permission-service.ts` | sharing.manage and content.share permissions. |
| screen | Workspace layout | `apps/web/app/workspace/layout.tsx` | Auth, terms, adult and membership gate. |
| component | WorkspaceConsoleNav | `apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx` | Nav entry Sharing. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Layout requires sign-in, current terms, adult eligibility and an active account, then resolves membership. | our servers | apps/web/app/workspace/layout.tsx:20 |
| The section calls the overview endpoint; the server resolves membership and permissions and queries members and shared items. | our servers | apps/web/app/api/settings/organization/shared/route.ts:54 |
| Non-managers get a filtered project list. | our servers | apps/web/app/api/settings/organization/shared/route.ts:96 |
| Stop sharing calls the matching DELETE route after a confirm. | device and our servers | apps/web/features/settings/sections/OrganizationSharingSection.tsx:303 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Shared grants for projects, conversations, artifacts and connectors | organization tables behind the sharing services; names not read | Server-held, same for all members | Stop sharing removes the grant; the owner keeps the item (apps/web/features/settings/sections/OrganizationSharingSection.tsx:305) |
| Member roster with optional emails | organization_members and profiles | server | Emails shown only if permitted (apps/web/app/api/settings/organization/shared/route.ts:62) |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in with workspace membership (apps/web/app/api/settings/organization/shared/route.ts:60). |
| Permissions | sharing.manage can withdraw anything; content.share lets a member share own projects; others read only (apps/web/app/api/settings/organization/shared/route.ts:63). |
| Subscription | Needs a team or enterprise-style workspace in practice (team_admin capability) [inferred] (packages/contracts/types/src/billing-catalog.ts:362); no explicit plan check found in the overview route. |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Needs our servers and an organization; not available in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading organization sharing...' | apps/web/features/settings/sections/OrganizationSharingSection.tsx:666 |
| Error | Alert with message or 'Organization sharing could not be loaded. Try again.' | apps/web/features/settings/sections/OrganizationSharingSection.tsx:670 |
| Not in an organization | Card 'Shared with your organization' with 'Create an organization in Team to share projects, chats, artifacts and connectors.' | apps/web/features/settings/sections/OrganizationSharingSection.tsx:690 |
| Empty lists | Per-kind empty texts. | apps/web/features/settings/sections/OrganizationSharingSection.tsx:343 |
| Membership unreadable | Layout logs and treats it as a database fault, not as 'no workspace'. | apps/web/app/workspace/layout.tsx:48 |
| Signed out | Redirect to session-expired sign-in. | apps/web/app/workspace/layout.tsx:21 |
| Retry on project or connector picker errors | onRetry buttons. | apps/web/features/settings/sections/OrganizationSharingSection.tsx:204 |
| Offline | not handled in the code I read. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/OrganizationSharingSection.test.tsx`: Section behaviour (name only).
- `apps/web/app/api/settings/organization/shared/__tests__/route.test.ts`: Overview route.
- `apps/web/app/api/settings/organization/shared/__tests__/route.cross-org-isolation.test.ts`: Cross-organization isolation.
- `apps/web/app/api/settings/organization/shared/__tests__/route.request-scope.test.ts`: Request workspace scope.

**Test scenarios**

- **Empty workspace**
  1. Sign in as a member of an organization with no shares.
  2. Open /workspace/sharing.
  - Expected: Four empty messages.
- **Member visibility**
  1. As a plain member open the page with a project not shared to you.
  - Expected: That project is not listed.
- **Withdraw**
  1. As a sharing manager press Stop sharing on an artifact and confirm.
  - Expected: Artifact removed from the list; members lose the link access.
- **No permission**
  1. As a member who did not publish, view artifacts.
  - Expected: No Stop sharing button.
- **No organization**
  1. Open as a personal account.
  - Expected: Message to create an organization.

**Where to look when it fails**

- Log 'Workspace console could not resolve membership' (apps/web/app/workspace/layout.tsx:48).
- Route /api/settings/organization/shared status codes.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **Shared project rows have no Open link in this component.** Affects: Web and desktop members. Evidence: apps/web/features/settings/sections/OrganizationSharingSection.tsx:385 and :492 only link artifacts and conversations. Work needed: Add link to /chat/projects/<id>.
- **No shared items on mobile, CLI, VS Code, Chrome.** Affects: those apps. Evidence: brief S4.24. Work needed: Decide scope.
- **Page is a workspace overview, not a personal 'shared with me' list.** Affects: Members. Evidence: apps/web/app/workspace/sharing/page.tsx:12. Work needed: Rename in brief or add a personal view.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- api:GET /api/settings/organization/shared
- SYS-authorization-and-workspaces
- SYS-files-artifacts-and-storage
- SYS-connectors-plugins-and-skills
- SYS-memory-projects-and-context

## Unknown

- Table names behind shared grants.
- Whether the Tauri desktop has a separate sharing page.
- Exact plan needed for a workspace.
- Methods exposed by the per-kind routes (only directories seen).
- Whether the 'Open' for shared projects exists elsewhere in the page.
