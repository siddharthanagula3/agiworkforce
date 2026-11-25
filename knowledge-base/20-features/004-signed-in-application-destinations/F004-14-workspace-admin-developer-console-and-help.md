---
id: "F004-14"
type: "feature"
title: "Workspace admin, developer console and help"
aliases: ["Workspace admin, developer console and help", "Workspace administration (S4.42)", "Workspace console / /workspace", "Members / Team settings", "Developer console (S4.43) / /developers", "API keys", "Help and feedback (S4.44)", "Share feedback dialog"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S4.42", "S4.43", "S4.44"]
depends_on: ["SYS-authorization-and-workspaces", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-observability-and-operations", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "api:POST /api/feedback", "api:GET /api/developers/usage", "table:feedback", "table:api_keys"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-14 Workspace admin, developer console and help

Three web destinations for people who run or build on AGI Workforce. The workspace console lets an owner or admin manage members, roles, identity, policy, sharing, audit, usage and billing. The developer console manages API keys and shows each key's monthly use. Help and feedback links to help pages and sends feedback with an optional screenshot.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.42](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s442), [S4.43](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s443), [S4.44](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s444).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 3) |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Web: /workspace pages (Overview, Members, Roles, Identity, Policy, Models, Connectors, Code, MCP servers, Plugins, Sharing, Audit, Data, Usage, Billing) shown only to owners and admins; /developers page with API keys, projects, prompts, request logs, webhooks, rate limits and reference links; Help section in settings, account-menu Get help entries, and a feedback dialog that posts to /api/feedback. Mobile has a Report screen and a Help Center row; CLI and VS Code send feedback.

**Why it exists.** Brief S4.42-S4.44: an admin must manage members, roles, invitations and policies; a developer must create and revoke keys and see use per key; a person must reach help and send feedback from inside the product.

**Who uses it.** Workspace owners and admins (console); developers on a plan that includes the managed API (keys); any signed-in person (help and feedback).

**Problems it solves**

- Admins cannot control who has access and what they may use.
- Developers cannot see which key spends credits (apps/web/lib/services/developer-usage-service.ts).
- People cannot report a bug or send a screenshot without leaving the app (ComposerFeedbackDialog.tsx).

**Use cases**

- An admin opens /workspace/people to invite a member with a role (TeamSection.tsx:1017-1024).
- A developer creates an API key, then reads 'This month: N requests, X credits' under it (ApiKeys.tsx:77-86).
- A person opens Account menu > Get help to reach help and support (AccountMenuItems.tsx:82-100).
- A person sends 'Something is broken' feedback with a screenshot (ComposerFeedbackDialog.tsx:22-25,166-195).

## 2. User experience

**Where to find it**

- Web: /workspace and children; the nav groups are Workspace, People, Controls and others with links labelled Overview, Members, Roles, Identity, Policy, Models, Connectors, Code, MCP servers, Plugins, Sharing, Audit, Data, Usage, Billing (apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx).
- Web: account menu has a Workspace submenu and a Get help submenu with Get help, Email support, Send feedback, Keyboard shortcuts (apps/web/shared/components/layout/AccountMenuItems.tsx:76-104). Display strings come from translation keys navGetHelp, navSendFeedback and similar; English text for them was not opened (unknown).
- Web: Settings > Team shows the Members panel with a pointer to the console (WebSettingsModal.tsx:269-273).
- Web: /developers titled 'Developer console' (apps/web/app/developers/page.tsx).
- Web: Settings > Help lists Documentation, Help center, Contact support, Report a bug and other links (apps/web/features/settings/sections/HelpSection.tsx:19-50).
- Electron Desktop shows the hosted web app, so the same pages apply [inferred] from doc: AGENTS.md section 5.
- Mobile: Settings > Support rows 'Report' (screen title from FEEDBACK_SCREEN_TITLE), 'Help Center' (opens /help on the web) and 'Export Diagnostics' (apps/mobile/src/features/settings/index.tsx:872-898).
- CLI: feedback command through apps/cli/src/cloud/feedback.rs; keys subcommand 'List or revoke the account's AGI API keys' (apps/cli/src/lib.rs:1061).
- VS Code: command 'agi-workforce.sendFeedback' (apps/extension-vscode/src/core/commandSetup.ts:1542).
- Chrome: no feedback or help code found; unknown.

**Before you start**

- Console: signed in, terms accepted, adult check passed, active account, and role owner or admin (apps/web/app/workspace/layout.tsx; WorkspaceConsoleShell.tsx:10).
- API keys: a plan with the managed_api capability (apps/web/app/api/settings/api-keys/route.ts:84-90).
- Feedback: text typed; sign-in is optional on the server (route uses getOptionalAuthUser).

**Screens and controls**

- Console empty frames: 'Workspace administration is temporarily unavailable' with Retry, 'No workspace selected' with 'Go to Team settings', 'You do not administer this workspace' with 'Back to chat' (WorkspaceConsoleShell.tsx:76-110).
- Members: Invitation role select with Member role, Viewer role, Admin role; per-member role select (TeamSection.tsx:1017-1024,1349-1361).
- API keys: create form with project choice, 'Delete <name>' button per key, usage line per key (ApiKeys.tsx:284,408).
- Developer page cards: API keys, Projects, Prompts, Request logs, Webhooks, Rate limits and a Reference card with API docs, Migration guides, Webhooks, Deprecations, Models, Usage links (DeveloperConsolePage.tsx:68-98).
- Feedback dialog: title 'Share feedback', 'Feedback type' buttons General feedback, Something is broken, Feature request, a Screenshot area (upload or capture), Cancel and 'Send feedback' (ComposerFeedbackDialog.tsx:22-25,284-418).

**Journey**

1. Admin: open the account menu Workspace entry or /workspace; layout checks sign-in, terms, adult status, active account, then reads membership.
2. If not owner or admin the person sees the locked frame; otherwise the nav and page show.
3. Open Members, invite by email and role, change a role (confirm dialog) or transfer ownership (TeamSection.tsx).
4. Developer: open /developers, create a key, see 'This month' use, delete a key.
5. Feedback: open the dialog, pick a type, type a message, optionally add or capture a screenshot, press 'Send feedback'; see 'Thanks, your feedback was sent.' then 'Done'.

**What the person sees and gets**

- Success text 'Thanks, your feedback was sent.'; if the screenshot was not stored: 'Your note was sent, but your screenshot could not be stored and was not attached.' (ComposerFeedbackDialog.tsx:262-275).
- Errors: 'Attach a PNG, JPEG or WebP image.', 'Screenshots are limited to 4 MiB.', 'Could not send feedback. Please try again.' (lines 120-130,260).
- API key limit error: 'You may not have more than 20 active API keys at once' (api-keys/route.ts:105-107).
- Per-key line 'No requests this month' or 'This month: N requests, X credits' (ApiKeys.tsx:77-86).

**Settings**

- Workspace policy pages (Policy, Models, Connectors, Code, Data) are settings for the workspace, not the person.
- Key project assignment: usage counts toward the chosen project and cannot move later (ApiKeys.tsx:408).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Console layout guards: no session redirects to sign-in; terms, adult and active-account checks; membership fault shows a service-fault frame, not 'no workspace' (apps/web/app/workspace/layout.tsx).
- Console shell blocks non-admin roles (WorkspaceConsoleShell.tsx:10,92-104); each page re-derives authorization from its own API call (layout.tsx comment).
- /workspace/people renders TeamSection under a 'Members' page title (apps/web/app/workspace/people/page.tsx).
- API key create is gated by the managed_api plan capability, CSRF, step-up and a 20 active key cap (apps/web/app/api/settings/api-keys/route.ts:26,72-107).
- API usage per key for the current UTC month, split by project, settled vs unsettled (apps/web/lib/services/developer-usage-service.ts:24-80; apps/web/app/api/developers/usage/route.ts).
- Feedback dialog requires non-empty text and disables send during submit or capture (ComposerFeedbackDialog.tsx:152-155,414-418).
- Feedback route inserts into public.feedback and stores screenshots in private object storage with cleanup records (apps/web/app/api/feedback/route.ts:37,56-107).
- Mobile feedback posts to /api/mobile/feedback and blocks empty text (apps/mobile/src/features/feedback/index.tsx:101-131); CLI posts to /api/feedback with a 'cli' source (apps/cli/src/cloud/feedback.rs:5,66-80).
- SCIM user provisioning route exists (apps/web/app/api/scim/v2/Users/route.ts).

**Incomplete**

- Brief marks CLI, VS Code and Chrome as partial for admin-related status and Chrome feedback unverified (brief S4.44).
- Seats and invitation flows depend on organization billing state; a payment-pending link opens in a new tab (TeamSection.tsx:964-965); live behaviour not verified.

**Present but disconnected or switched off**

- Desktop-only developer settings section: the web dialog does not render 'developer' and falls back to general (apps/web/features/settings/lib/web-settings-sections.ts header comment).
- Mobile has no workspace console or developer console (brief S4.42/S4.43 list web and desktop only).

**Not available**

- Workspace admin on mobile, CLI, VS Code, Chrome (brief S4.42 status).
- Developer console on mobile, VS Code, Chrome; CLI has only a keys list/revoke command (brief S4.43; apps/cli/src/lib.rs:1061).
- Feedback and help code in the Chrome extension: none found.

## 4. Required behaviour

**Established requirements**

- A workspace administration destination lets an admin manage members, roles, invitations, policies and workspace settings. (source: brief S4.42)
- A developer console lets the user create and revoke API keys, see API usage per key, read API docs and try requests. (source: brief S4.43)
- A help-and-feedback destination links to help, docs and status and lets the user send feedback or a bug report. (source: brief S4.44)
- Feedback needs text and is blocked while sending or while a screenshot is captured. (source: task brief 'Should' lines; ComposerFeedbackDialog.tsx:414-418)
- API usage is counted per key for the current month; admin pages require workspace admin rights. (source: task brief 'Should' lines; developer-usage-service.ts:24; WorkspaceConsoleShell.tsx:10)
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. A member with role 'member' opening /workspace sees 'You do not administer this workspace' and the role name.
2. A person with no workspace sees 'No workspace selected' with a Team settings link.
3. A database fault while reading membership shows the 'temporarily unavailable' frame with Retry.
4. A plan without managed API gets 403 code managed_api_plan_required when creating a key.
5. The 21st active key is refused with the 20-key message.
6. Each key shows request count and credits for the current UTC month, or 'No requests this month'.
7. The Send feedback button stays disabled with empty or whitespace text, and while sending or capturing.
8. A screenshot over 4 MiB or a non PNG/JPEG/WebP file is refused with a message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Key deletion should name that apps using the key stop working [inferred] from AGENTS.md section 9; the confirm text was not read.
- Desktop should offer the same console as web because it shows the hosted app [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a feedback entry in the Chrome extension.
- [proposed] Document the English labels of the account-menu items in the knowledge base once read from the locale file.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | WorkspaceConsoleLayout | `apps/web/app/workspace/layout.tsx` | Server gate: session, terms, adult, active account, membership. |
| component | WorkspaceConsoleShell | `apps/web/features/workspace-console/components/WorkspaceConsoleShell.tsx` | Admin-only frame and the three blocked states. |
| component | WorkspaceConsoleNav | `apps/web/features/workspace-console/components/WorkspaceConsoleNav.tsx` | Grouped links to every console page. |
| screen | Members page | `apps/web/app/workspace/people/page.tsx` | Wraps TeamSection in ConsolePage. |
| component | TeamSection | `apps/web/features/settings/sections/TeamSection.tsx` | Members, invitations, role changes, ownership transfer, seats. |
| endpoint | /api/settings/team | `apps/web/app/api/settings/team/route.ts` | Team members, invitations and seat types (sub-routes). |
| service | getTeamAdminAccess | `apps/web/app/api/settings/team/team-admin-access.ts` | Plan and seat state; canManageTeam from team_admin capability. |
| endpoint | SCIM Users | `apps/web/app/api/scim/v2/Users/route.ts` | SCIM provisioning for identity. |
| component | WorkspaceApiKeys | `apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx` | Workspace-level key list with canManageKeys. |
| screen | Developer console route | `apps/web/app/developers/page.tsx` | Renders DeveloperConsolePage with rate limits. |
| component | DeveloperConsolePage | `apps/web/features/developers/components/DeveloperConsolePage.tsx` | Panels for keys, projects, prompts, logs, webhooks, limits, reference. |
| component | ApiKeysManager | `apps/web/features/settings/components/Settings/ApiKeys.tsx` | Create, delete and per-key usage line. |
| endpoint | /api/settings/api-keys | `apps/web/app/api/settings/api-keys/route.ts` | List and create keys with plan gate and cap. |
| endpoint | GET /api/developers/usage | `apps/web/app/api/developers/usage/route.ts` | Per-key usage for the month. |
| service | readDeveloperUsage | `apps/web/lib/services/developer-usage-service.ts` | SQL over managed_usage_requests joined to api_keys. |
| table | api_keys | `apps/web/lib/services/developer-usage-service.ts` | Keys with project_id and user_id. |
| table | managed_usage_requests | `apps/web/lib/services/developer-usage-service.ts` | Per-request cost used for key usage. |
| component | AccountMenuItems | `apps/web/shared/components/layout/AccountMenuItems.tsx` | Workspace and Get help submenus, Send feedback. |
| component | HelpSection | `apps/web/features/settings/sections/HelpSection.tsx` | Settings Help pane with documentation and support links. |
| component | ComposerFeedbackDialog | `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx` | Feedback form with type, message and screenshot. |
| endpoint | POST /api/feedback | `apps/web/app/api/feedback/route.ts` | Validates, redacts, inserts into public.feedback, stores screenshot. |
| table | feedback | `apps/web/app/api/feedback/route.ts` | Stores subject, message, metadata. |
| endpoint | /api/mobile/feedback | `apps/web/app/api/mobile/feedback/route.ts` | Mobile feedback intake. |
| screen | Mobile feedback | `apps/mobile/src/features/feedback/index.tsx` | Mobile report form. |
| service | CLI feedback | `apps/cli/src/cloud/feedback.rs` | CLI submit to /api/feedback with size limit. |
| command | agi-workforce.sendFeedback | `apps/extension-vscode/src/core/commandSetup.ts` | VS Code feedback quick pick and submit. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser requests /workspace; server layout reads session, terms, age, account status and organization membership. | our servers | apps/web/app/workspace/layout.tsx |
| Shell decides frame by role; admin pages call their own APIs which re-check rights. | device and our servers | WorkspaceConsoleShell.tsx; layout.tsx comment |
| Member changes go to /api/settings/team routes; seat payment may open an outside payment page. | our servers | TeamSection.tsx:964; apps/web/app/api/settings/team |
| Developer page loads keys and GET /api/developers/usage; server sums settled requests per key for the UTC month. | our servers | developer-usage-service.ts:37-80 |
| Creating a key checks CSRF, step-up, plan capability and the 20-key cap, then inserts a key. | our servers | api-keys/route.ts:72-107 |
| Feedback dialog reads a CSRF token and POSTs /api/feedback with metadata (source web, path, version) and an optional data-URL screenshot. | device and our servers | ComposerFeedbackDialog.tsx:164-195 |
| Server inserts a feedback row and puts the screenshot in private object storage; if storage is missing the screenshot is dropped and screenshot_stored is false. | our servers | apps/web/app/api/feedback/route.ts:37,56-70 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Feedback text, subject, metadata | table feedback | no | unknown |
| Feedback screenshot | private object storage under a 'feedback' prefix with a cleanup record | no | A discarded screenshot has a cleanup record swept later (feedback route.ts:98-107). |
| API key rows | table api_keys | yes via account | Deleted keys: whether row is removed or marked revoked is unknown from files read. |
| Members, invitations | organization membership tables (organization_members seen in team-admin-access.ts) | yes | unknown |

**Models and providers.** These destinations do not call a model. Key usage cost comes from the managed gateway ledger. Provider-specific behaviour: none found in the code.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Console and developer console need sign-in. Feedback accepts anonymous users on the server (getOptionalAuthUser, feedback route.ts:297). |
| Permissions | Console limited to owner and admin (WorkspaceConsoleShell.tsx:10). Invitation roles offered: member, viewer, admin. A role ceiling file exists (apps/web/app/api/settings/team/membership-role-ceiling.ts), content not read. |
| Subscription | Team admin needs the team_admin capability (team-admin-access.ts); keys need managed_api (api-keys/route.ts:84). |
| Limits and metering | 20 active keys per user (route.ts:26). Screenshot 4 MiB (feedback route.ts:32). Developer console rate limit group 'developer-console' (developers/usage/route.ts:11). |
| Feature flags | none found in the code for these destinations. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Console, keys and web feedback need our servers. The CLI feedback needs a Cloud client (apps/cli/src/cloud/feedback.rs). Local mode has no workspace or key concept in the code read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signed out | Console redirects to sign-in via sessionExpiredRedirect. | apps/web/app/workspace/layout.tsx |
| Membership read fails | Shows service-fault frame with Retry, not 'no workspace'. | layout.tsx; WorkspaceConsoleShell.tsx:76 |
| No workspace / not admin | Dedicated frames with actions. | WorkspaceConsoleShell.tsx:86-104 |
| Members load error | Alert with refetch button. | TeamSection.tsx:1242-1249 |
| Key creation 403 | Error code managed_api_plan_required with an upgrade recovery link. | api-keys/route.ts:84-90 |
| Step-up cancelled | StepUpCancelledError is handled by the key manager. | ApiKeys.tsx:72 |
| Feedback submitting | Fieldset disabled, button loading, repeat submit ignored. | ComposerFeedbackDialog.tsx:155,285 |
| Screen capture denied | NotAllowedError is silent; other errors shown. | ComposerFeedbackDialog.tsx:139-146 |
| Screenshot not stored | Success with a note that it was not attached. | ComposerFeedbackDialog.tsx:262 |
| Feedback message too long on CLI | Refused with character count and instruction to shorten. | apps/cli/src/cloud/feedback.rs:56-62 |
| Offline | not handled in the code beyond fetch errors. | ComposerFeedbackDialog.tsx catch block |
| Phone width | Console shows a top row with Back to chat on small screens. | WorkspaceConsoleShell.tsx PhoneTopRow |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/workspace-console/components/__tests__/WorkspaceConsoleShell.test.tsx`: Shell states by role.
- `apps/web/features/workspace-console/components/__tests__/WorkspaceConsoleNav.routes.test.tsx`: Nav links route to real pages.
- `apps/web/features/workspace-console/components/__tests__/WorkspaceApiKeys.test.tsx`: Workspace API keys panel.
- `apps/web/features/settings/sections/TeamSection.test.tsx`: Team section.
- apps/web/features/settings/sections/__tests__/TeamSection.membership-ownership.test.tsx (not found) (not found): Membership and ownership handling.
- `apps/web/app/api/developers/usage/__tests__/route.test.ts`: Developer usage route.
- `apps/web/features/settings/components/Settings/ApiKeys.test.tsx`: API key manager.
- `apps/web/app/api/settings/api-keys/__tests__/key-expiry.test.ts`: Key expiry.
- `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.test.tsx`: Feedback dialog.
- `apps/web/app/api/feedback/route.test.ts`: Feedback route.
- `apps/web/app/api/mobile/feedback/__tests__/route.test.ts`: Mobile feedback route.
- `apps/web/features/settings/sections/__tests__/HelpSection.test.tsx`: Help section.
- `apps/mobile/__tests__/FeedbackScreen.test.tsx`: Mobile feedback screen.

**Test scenarios**

- **Non-admin console**
  1. Sign in as a workspace member with role 'member'
  2. Open /workspace
  - Expected: Frame 'You do not administer this workspace' naming the role.
- **Key usage**
  1. Use a paid test account
  2. Create a key and make a request with it
  3. Open /developers
  - Expected: Key line reads 'This month: 1 request, ...'; GET /api/developers/usage returns that key id.
- **Key cap**
  1. Create 20 active keys
  2. Create another
  - Expected: Refused with the 20-key message.
- **Feedback blocked**
  1. Open Share feedback
  2. Leave text empty or spaces
  - Expected: 'Send feedback' is disabled.
- **Oversize screenshot**
  1. Attach a 5 MiB PNG
  - Expected: Message 'Screenshots are limited to 4 MiB.' and nothing attached.
- **Mobile report**
  1. Open Settings > Support > Report
  2. Submit empty text
  - Expected: Alert 'Empty Feedback'.

**Where to look when it fails**

- Server log 'Workspace console denied: account is not active' and 'Workspace console could not resolve membership' (layout.tsx).
- Log 'feedback screenshot dropped: private object storage is not configured' (feedback route.ts:60).
- Tables feedback, api_keys, managed_usage_requests, organization_members.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)
- Mobile: [70-qa/test-plans/mobile/004-signed-in-application-destinations.md](../../70-qa/test-plans/mobile/004-signed-in-application-destinations.md)
- CLI: [70-qa/test-plans/cli/004-signed-in-application-destinations.md](../../70-qa/test-plans/cli/004-signed-in-application-destinations.md)
- VS Code: [70-qa/test-plans/vscode/004-signed-in-application-destinations.md](../../70-qa/test-plans/vscode/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **Chrome extension has no found help or feedback code.** Affects: Chrome. Evidence: search of apps/extension/src found none; brief S4.44 'unverified'. Work needed: Verify or add.
- **Admin console is not on mobile, CLI, VS Code or Chrome.** Affects: Admins on those apps. Evidence: brief S4.42. Work needed: Owner decision on parity.
- **English labels of account-menu Help entries not confirmed (translation keys only).** Affects: Knowledge base accuracy. Evidence: AccountMenuItems.tsx:92-100. Work needed: Read the locale file.
- **Live checks of invitation, seat payment and key use not recorded.** Affects: Web admins and developers. Evidence: no run record found. Work needed: Run and record.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-authorization-and-workspaces
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-observability-and-operations
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- api:POST /api/feedback
- api:GET /api/developers/usage
- table:feedback
- table:api_keys

## Unknown

- English text of account-menu help items.
- Whether deleting a key removes or marks it revoked.
- Retention of feedback rows and screenshots.
- Chrome extension help and feedback.
- What the role ceiling file enforces.
- Live behaviour of invitations and seat payment.
- Whether Electron adds any console difference.
