---
id: "F105-01"
type: "feature"
title: "Projects with monthly credit limits"
aliases: ["Projects", "Developer projects", "Projects card", "New project", "Default project", "Monthly credit limit", "project spend limit", "S105.01 (brief: Developer organization/project creation)"]
area: "105 Developer platform and console"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S105.01"]
depends_on: ["surface:web", "surface:desktop", "table:developer_projects", "table:api_keys", "table:managed_usage_requests", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-authentication-and-identity", "SYS-observability-and-operations", "F105-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F105-01 Projects with monthly credit limits

A developer project groups API keys so they share one monthly usage count and an optional monthly credit limit. It is managed from the Projects card in the web Developer console. At the limit the gateway refuses the project's keys until the UTC month ends. Archiving a project revokes its keys. No organization can be created here.

Area: [105. Developer platform and console](README.md). Requirement items: [S105.01](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10501).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a signed-in person create named projects, edit a project's name and monthly credit limit, archive a project, and see each project's key count and this month's credit use. A key can be placed in a project when it is created (F105-02). Keys with no project belong to a built-in 'Default project' row [ProjectsPanel.tsx:517-523]. For a key in a capped project, the chat gateway and the audio transcription gateway refuse the request with HTTP 429 and code project_spend_limit_reached once the month's spend reaches the limit (apps/web/lib/developer-api/project-spend.ts:73-84; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:290-293).

**Why it exists.** Before projects, every API key belonged to the whole account, so a developer could not keep staging and production apart, see what each integration spent, or cap one integration (apps/web/db/neon/0321_developer_projects.sql:4-9, header comment). The brief asks for organizations and projects that scope keys, usage and limits (doc: knowledge-base/data/area-briefs/105-developer-platform-and-console.md, S105.01).

**Who uses it.** A developer or small team lead on the web app who calls the managed gateway with API keys, and who wants a spending cap per integration.

**Problems it solves**

- One shared key and one shared bill for every integration.
- No way to stop a runaway integration from spending all of the account's credits.
- No per-project view of usage and key counts.

**Use cases**

- Create a project named for a staging app with a small monthly limit so a test loop cannot spend real credit.
- Archive a project when an integration is retired, which revokes all of its keys in one step.
- Raise a project's limit mid-month after receiving the project.spend_limit_reached webhook (project-spend.ts:64-71).

## 2. User experience

**Where to find it**

- Web: page /developers titled 'Developer console'; the second card is 'Projects' (apps/web/features/developers/components/DeveloperConsolePage.tsx:68-69). The only in-app link to /developers that I found is from the API docs page (apps/web/app/api-docs/page.tsx:194, 254); a navigation entry was not found (unknown).
- Desktop: the brief marks it done (doc: knowledge-base/data/area-briefs/105-developer-platform-and-console.md S105.01). The public Desktop shows the hosted web app, so the same page is expected [inferred from doc: AGENTS.md section 5]. I did not open desktop code.
- Mobile, CLI, VS Code extension, Chrome extension: no developer-project code found (searched apps/cli/src, apps/extension-vscode, apps/extension, apps/mobile for api/developers and developer_projects). The CLI command that creates a 'project' posts to /api/projects/sync and is a different feature, chat projects (apps/cli/src/cloud/projects.rs:2, 17; apps/cli/src/cloud/mod.rs:441).

**Before you start**

- Signed in, with the current workspace finished loading; otherwise the card says 'Your current workspace must finish loading before you can manage projects.' or 'Reload this page to confirm the current workspace before managing projects.' (ProjectsPanel.tsx:605-636).
- No plan check was found in the project routes (apps/web/app/api/developers/projects/route.ts). Keys inside a project need a plan with the managed_api capability (see F105-02).

**Screens and controls**

- Card 'Projects' with button 'New project' (ProjectsPanel.tsx:434-446).
- Dialog 'New project' or 'Edit <name>' with fields 'Name' (max 100, placeholder 'Production') and 'Monthly limit in credits' (whole number, placeholder 'No limit'), buttons 'Cancel' and 'Create project' / 'Save' (ProjectsPanel.tsx:135-186).
- Row for 'Default project' plus one row per live project with buttons 'Edit' and 'Archive'; archived projects are listed below as 'Archived <date>' without actions (ProjectsPanel.tsx:517-576).
- Confirm dialog 'Archive <name>?' with button 'Archive project' (ProjectsPanel.tsx:388-404).
- Buttons 'Retry', 'Retry key counts', 'Retry usage', 'Refresh projects' (ProjectsPanel.tsx:468, 476-482, 491, 506-512).

**Journey**

1. Open Developer console and find the Projects card.
2. Choose 'New project', type a name (1 to 100 characters), optionally type a whole number of credits above 0, choose 'Create project'.
3. The project appears with '0 keys' and its usage line, for example '<n> of <limit> this month'.
4. Create keys in it from the API Keys card by choosing the project (F105-02).
5. To change the name or limit choose 'Edit' then 'Save'. An empty limit removes the limit (parseLimit, ProjectsPanel.tsx:69-74).
6. To stop a project choose 'Archive' and confirm; its keys are revoked and it moves to the archived list.

**What the person sees and gets**

- Usage line per row: '<spent> of <limit> this month' or '<spent> this month, no monthly limit' (ProjectsPanel.tsx:96-98).
- Key line: '<n> key(s)' (ProjectsPanel.tsx:79-85).
- Toast '<name> is archived.' (ProjectsPanel.tsx:415).
- Inline error text under the dialog or card; message 'We could not confirm whether the project was updated. Check the project state before repeating this action.' when a write may or may not have reached the server (ProjectsPanel.tsx:64-65).
- API refusal for a capped key: HTTP 429, error code project_spend_limit_reached, with project_id and reset_at (project-spend.ts:73-83).

**Settings**

- Monthly credit limit per project (1 to 1,000,000,000, DEVELOPER_PROJECT_CREDIT_LIMIT_MAX, developer-project-service.ts:9).
- Maximum 100 live projects per account (developer-project-service.ts:7).
- Rate limits: developer-console 60 per minute, developer-console-write 20 per minute (apps/web/lib/rate-limit.ts:701-710).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Create, list, update and archive routes exist with CSRF and rate-limit checks and per-user scoped database (apps/web/app/api/developers/projects/route.ts:30-67; apps/web/app/api/developers/projects/[projectId]/route.ts:44-96).
- Create is serialized by an advisory lock and refuses at 100 live projects (developer-project-service.ts:100-131).
- Names are unique per account among live projects, ignoring case, and a duplicate returns a conflict 'You already have a project named <name>.' (apps/web/db/neon/0321_developer_projects.sql:42-44; developer-project-service.ts:43-45).
- Archive is one transaction: it sets archived_at and revokes every unrevoked key in the project (developer-project-service.ts:170-197). The route then writes one api_key_revoked audit event and one api_key.revoked webhook per key (projects/[projectId]/route.ts:73-90).
- A key whose project is archived fails verification even if not revoked (apps/web/lib/services/api-key-service.ts:244-262, project exists-clause in verifyKey).
- Spend cap: the gateway looks up the key's project, sums this UTC month's spend (settled actual cost plus estimated cost of unsettled requests) and refuses at or above the limit (project-spend.ts:35-52; developer-usage-service.ts developerProjectSpendMicrousd). It queues one project.spend_limit_reached webhook per month (project-spend.ts:54-71).
- Usage per key and per project is read from managed_usage_requests joined to api_keys (developer-usage-service.ts readDeveloperUsage; GET /api/developers/usage).
- The card shows 'Loading usage', 'Usage unavailable', 'Loading key count', 'Key count unavailable' and never a zero for an unreadable value (ProjectsPanel.tsx:76-99, 207-216).

**Incomplete**

- No organization can be created from this feature although the brief says 'organization and projects'; the code has projects only (doc: area brief S105.01; table has user_id and no organization column, 0321 migration line 25-32).
- Project update (PATCH) writes no audit event; create does (projects/route.ts:52-62; projects/[projectId]/route.ts:44-60). Archive audits per key, not the project itself [inferred from route code].
- The cap is checked before the request runs, so one request can pass the limit by its own cost [inferred].

**Present but disconnected or switched off**

- The cap is enforced only on API-key requests to chat completions and audio transcriptions (auth-gate.ts:290-293; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:302). Other key-authenticated routes were not checked (unknown).

**Not available**

- Mobile, CLI, VS Code extension and Chrome extension have no developer projects [no code found].
- Restoring an archived project: not available; the dialog says it cannot be restored (ProjectsPanel.tsx:397-403).

## 4. Required behaviour

**Established requirements**

- A developer can create projects that scope API keys, usage and limits. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.01)
- Brief status is web done, desktop done. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.01)
- A project at its monthly limit refuses its keys with HTTP 429 and code project_spend_limit_reached until the month resets. (source: apps/web/lib/developer-api/project-spend.ts:73-84)
- Archiving asks first and states that keys are revoked and the project cannot be restored. (source: apps/web/features/developers/components/ProjectsPanel.tsx:388-404)
- Unreadable usage or key counts are labelled unavailable, never shown as zero. (source: apps/web/features/developers/components/ProjectsPanel.tsx:76-99; apps/web/features/developers/__tests__/ProjectsPanel.read-state.test.tsx)
- The Desktop shows the hosted web app, so a web change reaches the Desktop window. (source: doc: AGENTS.md section 5)

**Acceptance criteria**

1. Creating a project with a 1 to 100 character name and a blank limit succeeds and the row shows 'no monthly limit'.
2. A name of 101 characters, an empty name, a decimal limit, zero, or a negative limit is refused (Create schema, projects/route.ts:19-28).
3. A second live project with the same name in a different letter case is refused with the duplicate-name message.
4. Archive shows the confirm dialog first; after confirming, every key of the project stops working and the project appears under 'Archived'.
5. A key in a project whose month spend is at or above the limit gets HTTP 429 with code project_spend_limit_reached on chat completions; after the UTC month turns it works again.
6. While usage or key counts are loading or failed, the card shows the 'Loading ...' or '... unavailable' text and the Archive button is disabled until key counts are ready (ProjectsPanel.tsx:556).
7. The 101st live project is refused with 'You can have 100 projects at once. Archive one to make another.'

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Projects are per account, not per workspace: the table has no organization column and every query filters by user_id (developer-project-service.ts:51-57). The workspace id is only sent as a request header (use-developer-projects.ts:62-64) [inferred].
- Desktop and web behave the same because the Desktop loads the hosted page [inferred from doc: AGENTS.md section 5].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an audit event for project update and for the archive itself.
- [proposed] Show the per-project reset date next to the usage line.
- [proposed] Either build organizations or change the brief wording to projects only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | DeveloperConsolePage | `apps/web/features/developers/components/DeveloperConsolePage.tsx` | Hosts the Projects card inside the Developer console page. |
| screen | DevelopersRoute (/developers) | `apps/web/app/developers/page.tsx` | Next.js route that renders the console inside the web app shell. |
| component | ProjectsPanel | `apps/web/features/developers/components/ProjectsPanel.tsx` | Projects card, editor dialog, archive confirmation, read-state labels, workspace ownership guards. |
| hook | use-developer-projects | `apps/web/features/developers/hooks/use-developer-projects.ts` | Query and create/update/archive mutations against /api/developers/projects with CSRF header and workspace header. |
| hook | use-developer-usage | `apps/web/features/developers/hooks/use-developer-usage.ts` | Reads this month's usage per key and project. |
| endpoint | GET/POST /api/developers/projects | `apps/web/app/api/developers/projects/route.ts` | List and create projects; audits creation. |
| endpoint | PATCH/DELETE /api/developers/projects/[projectId] | `apps/web/app/api/developers/projects/[projectId]/route.ts` | Update name or limit; archive and revoke keys, audit and webhook per key. |
| endpoint | GET /api/developers/usage | `apps/web/app/api/developers/usage/route.ts` | Returns the UTC month's per-key and per-project usage. |
| service | developer-project-service | `apps/web/lib/services/developer-project-service.ts` | SQL for list, create (locked, capped at 100), update, archive, key admission. |
| service | developer-usage-service | `apps/web/lib/services/developer-usage-service.ts` | Month window, per-key usage, project spend in micro-dollars. |
| service | developerProjectSpendRefusal | `apps/web/lib/developer-api/project-spend.ts` | Builds the 429 response and queues the spend-limit webhook. |
| service | chat completions auth gate | `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts` | Calls the spend refusal for API-key requests (line 290-293). |
| endpoint | POST /api/llm/v1/audio/transcriptions | `apps/web/app/api/llm/v1/audio/transcriptions/route.ts` | Also enforces the project spend cap (line 302). |
| service | ApiKeyService | `apps/web/lib/services/api-key-service.ts` | Admits a key into a live project; verifyKey refuses keys of archived projects. |
| table | developer_projects | `apps/web/db/neon/0321_developer_projects.sql` | Project rows with optional monthly limit, archived_at, row-level security by owner. |
| table | api_keys.project_id and managed_usage_requests.api_key_id | `apps/web/db/neon/0321_developer_projects.sql` | Place a key in a project and attribute usage to a key. |
| config | rate limits developer-console, developer-console-write | `apps/web/lib/rate-limit.ts` | 60 and 20 requests per minute. |
| event | project.spend_limit_reached and api_key.revoked webhooks | `apps/web/lib/services/developer-webhook-service.ts` | Queued for the account's webhook endpoints. |
| test | ProjectsPanel read-state test | `apps/web/features/developers/__tests__/ProjectsPanel.read-state.test.tsx` | Loading, unavailable and empty labels. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person opens the Projects card; the browser reads projects, API keys and usage in three requests. | device and our servers | ProjectsPanel.tsx:204-206; use-developer-projects.ts; use-developer-usage.ts:12-21 |
| The person saves the dialog; the browser fetches a CSRF token and sends POST or PATCH with the workspace header. | device and our servers | use-developer-projects.ts:46-66 |
| The server checks CSRF and rate limit, validates the body, and writes developer_projects under the person's scoped database; creation takes a per-user lock and counts live projects. | our servers | projects/route.ts:38-64; developer-project-service.ts:100-131 |
| Archive: one transaction marks the project archived and revokes its keys; the route writes audit events and queues api_key.revoked webhooks. | our servers | developer-project-service.ts:170-197; projects/[projectId]/route.ts:62-93 |
| Later, an API-key request reaches the chat gateway; the gate sums the project's month spend and either returns 429 or continues to subscription checks. | our servers | auth-gate.ts:290-297; project-spend.ts:27-85 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Project rows (name, optional monthly limit, archived time) | table developer_projects in the Neon database | Server-side only; the web page re-reads it with queries. | Archived rows are kept; deleted when the profile is deleted (on delete cascade, 0321 migration line 26). |
| Key-to-project link and key-to-request attribution | api_keys.project_id and managed_usage_requests.api_key_id | Server-side only. | project_id is set to null if the project row is deleted (0321 migration line 59); archive does not delete. |
| Audit events and webhook deliveries | audit store via recordAuditEvent and table developer_webhook_deliveries | Delivered to the person's webhook endpoints by the webhook service. | Retention not established (unknown). |

**Models and providers.** No model is called by project management. The cap measures credits spent by gateway requests, whichever model or provider served them [inferred from developerProjectSpendMicrousd, which sums cost columns, not model ids].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; routes use getUserScopedDb (projects/route.ts:34, 45). Unauthenticated list returns 401 (apps/web/app/api/developers/projects/__tests__/route.test.ts 'refuses an unauthenticated list with 401'). |
| Permissions | Owner of the account only; row-level security on user_id (0321 migration lines 49-56). Workspace roles: none found in the code. |
| Subscription | No plan check in the project routes (none found in the code). Creating keys needs managed_api, so on a plan without it a project can exist but cannot receive keys (api-keys/route.ts:84-92; plans in code: pro, max, max_15x, team, team_premium, enterprise per packages/contracts/types/src/billing-catalog.ts:341-358). |
| Limits and metering | 100 live projects; limit up to 1,000,000,000 credits; spend measured per UTC calendar month from the managed usage ledger; rate limits 60 and 20 per minute. |
| Feature flags | none found in the code. |
| Model compatibility | Not model specific [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | none found in the code. [inferred] Projects exist only on our servers, so there is no Local mode; Local inference is not metered here. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading projects' spinner; 'Loading usage' and 'Loading key count' per row. | ProjectsPanel.tsx:496-500, 76-99 |
| Empty | Only the 'Default project' row shows; no empty-state sentence exists for zero custom projects. | ProjectsPanel.tsx:516-523 |
| Read error | Error text with 'Retry'; key and usage errors have their own retry buttons. | ProjectsPanel.tsx:471-514 |
| Write may have reached server | Shows the uncertain message and a 'Refresh projects' button instead of retrying silently. | ProjectsPanel.tsx:64-65, 450-470 |
| Workspace switched during an action | The in-flight action is retired and the view resets. | ProjectsPanel.tsx:263-285 |
| Concurrent creates at the limit | Exactly one is admitted (advisory lock). | developer-project-service.ts:108-110; lib/services/__tests__/developer-project-service.test.ts |
| Archive while key counts unknown | Archive button disabled and the action refuses to open. | ProjectsPanel.tsx:382, 556 |
| Offline, timeout, cancel | Cancel closes the dialog; offline and timeout have no specific handling beyond the generic error (not handled in the code). | ProjectsPanel.tsx:331-333 |
| Accessibility | Labelled inputs, aria-invalid on the limit, role alert on errors, aria-busy on save. | ProjectsPanel.tsx:142-183 |
| Month boundary | The window is the UTC calendar month; a person in another time zone sees the reset at 00:00 UTC. | developer-usage-service.ts:21-28 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/developers/__tests__/ProjectsPanel.read-state.test.tsx`: Loading, unavailable and zero usage and key-count labels, archive disabled until counts are ready.
- `apps/web/features/developers/__tests__/ProjectsPanel.ownership.test.tsx`: Workspace ownership of the panel (by name; contents not read).
- `apps/web/features/developers/__tests__/DeveloperProjectMutationOwnership.test.tsx`: Mutation ownership (by name; contents not read).
- `apps/web/app/api/developers/projects/__tests__/route.test.ts`: 401 when signed out, rate limit first, list, CSRF refusal, invalid body, fractional limit rejected, create audited.
- `apps/web/app/api/developers/projects/[projectId]/__tests__/route.test.ts`: Update and archive route (by name; contents not read).
- `apps/web/lib/services/__tests__/developer-project-service.test.ts`: Concurrent creates at the limit, lock before count, limit refusal, duplicate name conflict.
- `apps/web/lib/services/__tests__/api-key-service.project-admission.test.ts`: Key admission into a project (by name; contents not read).
- `apps/web/lib/services/__tests__/api-key-service.project-lifecycle.test.ts`: Key and project lifecycle (by name; contents not read).
- `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.test.ts`: Mocks developerProjectSpendRefusal; the real spend query is not exercised there [inferred from the mock at line 22].

**Test scenarios**

- **Create and cap**
  1. Sign in on the web app with a plan that includes Cloud API access.
  2. Open /developers, choose 'New project', name it 'Test', limit 1.
  3. Create a key in that project and send chat requests with it until spend reaches 1 credit.
  - Expected: Later requests return HTTP 429 with code project_spend_limit_reached; one project.spend_limit_reached webhook is queued for the month.
- **Archive revokes keys**
  1. Create a project with two keys.
  2. Choose Archive and confirm.
  3. Call the gateway with one of the keys.
  - Expected: Dialog said '2 keys are revoked'; the call returns 401 invalid_api_key; the project shows under Archived.
- **Read-state honesty**
  1. Block the /api/developers/usage request in browser tools.
  2. Reload /developers.
  - Expected: Rows show 'Usage unavailable' with a 'Retry usage' button, not zero.
- **Validation**
  1. Open 'New project'.
  2. Enter a 101-character name; then a limit of 0.5; then 0.
  - Expected: Save is disabled or the server refuses; no project is created.
- **Project count cap**
  1. Create 100 live projects.
  2. Create a 101st.
  - Expected: Refusal text about 100 projects at once.

**Where to look when it fails**

- Response code project_spend_limit_reached and webhook event project.spend_limit_reached.
- Audit event types developer_project_created and api_key_revoked (reason developer_project_archived).
- Tables developer_projects, api_keys, managed_usage_requests, developer_webhook_deliveries.
- Rate limit keys developer-console and developer-console-write.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/105-developer-platform-and-console.md](../../70-qa/test-plans/web/105-developer-platform-and-console.md)
- Desktop: [70-qa/test-plans/desktop/105-developer-platform-and-console.md](../../70-qa/test-plans/desktop/105-developer-platform-and-console.md)

## 10. Gaps and dependencies

- **No organization creation although the brief and the Should line say organization and projects.** Affects: Web and Desktop developers.. Evidence: doc: area brief S105.01; developer_projects has no organization column (0321 migration).. Work needed: Decide whether organizations are in scope; then add them or edit the brief.
- **Project update has no audit event; archive audits keys but not the project.** Affects: Web and Desktop, security review.. Evidence: projects/[projectId]/route.ts:44-93.. Work needed: Add audit events.
- **Cap enforced on two gateway routes only; other key-authenticated routes unchecked.** Affects: Any developer relying on the cap.. Evidence: auth-gate.ts:290-293; audio transcriptions route.ts:302.. Work needed: List every route a key can bill and confirm each calls the refusal.
- **No navigation entry to /developers found in the web app.** Affects: Web discoverability.. Evidence: Only links found are in apps/web/app/api-docs/page.tsx:194, 254.. Work needed: Confirm and add an entry if absent.
- **Desktop behaviour not verified.** Affects: Desktop.. Evidence: Brief says done; desktop code not opened.. Work needed: Open the Electron app and check /developers.

**Depends on**

- surface:web
- surface:desktop
- table:developer_projects
- table:api_keys
- table:managed_usage_requests
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-authentication-and-identity
- SYS-observability-and-operations
- F105-02

## Unknown

- Whether the Electron Desktop shows /developers and whether any navigation entry leads there.
- Which other key-authenticated routes bill credits and whether they enforce the cap.
- Retention period of audit events and webhook deliveries.
- How the workspace header affects the scoped database for projects (getUserScopedDb not read).
- Whether the Tauri desktop build has any developer console (not opened).
