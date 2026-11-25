---
id: "F108-05"
type: "feature"
title: "Health-record workspace (Health space, HealthEx)"
aliases: ["Health space", "Health", "HealthEx connector", "Health-record workspace (S108.12)", "/chat/health"]
area: "108 Specialist workspaces"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S108.12"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "plan:basic", "plan:pro", "plan:max", "plan:team", "plan:enterprise", "file:apps/web/lib/services/health-space-service.ts", "api:GET /api/health-space", "api:POST /api/health-space", "table:user_projects", "SYS-security-and-privacy", "SYS-memory-projects-and-context", "SYS-model-catalog-and-routing", "SYS-connectors-plugins-and-skills", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F108-05 Health-record workspace (Health space, HealthEx)

A personal Health space: one private project per person, kept out of other chats and training, where a read-only HealthEx connector would let chat read the person's own records. The space, availability checks and guards exist, but HealthEx cannot be connected today because it is unreleased and has no configured sign-in.

Area: [108. Specialist workspaces](README.md). Requirement items: [S108.12](../../10-requirements/capabilities/108-specialist-workspaces.md#s10812).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates a single Health project per person whose chats and files stay apart from other chats, allows only models that keep chats out of training, and offers HealthEx read tools only inside it (apps/web/lib/services/health-space-service.ts:46-58; apps/web/lib/user-connector-tools.ts:2515-2540,2657-2659).

**Why it exists.** Founder decision D-2026-09-28-08: health records connect like the leaders' health experiences, opt-in, read-only, US only, never used for training, and stay off until the owner signs the vendor agreement and a lawyer reviews the FTC rule (doc: docs/decisions/2026-09-27-founder-decisions.md:198-215).

**Who uses it.** A person in the United States on a personal (not organisation) account, once the connector opens.

**Problems it solves**

- Keeping health talk out of ordinary chats and search sharing
- Asking questions about the person's own records
- Making sure health chats avoid models that may train

**Use cases**

- Ask for a summary of conditions and medications
- Ask about lab values
- Prepare questions for a doctor visit from records
- Keep health notes and files in one private place

## 2. User experience

**Where to find it**

- Web: a rail item 'Health' at /chat/health, shown only when GET /api/health-space says 'available' (apps/web/shared/components/layout/app-nav-items.ts:133-141,204-215; apps/web/features/health/hooks/use-health-space-available.ts:29-46).
- Desktop: same hosted web app [doc: AGENTS.md section 5]; /chat/health listed (adjacent-chat.ts:23).
- Mobile and Chrome: not present (brief); no health space code found in apps/mobile or apps/extension.
- Connecting: link 'Connect health records' inside the Health project page, which points to /settings/connections (apps/web/app/chat/projects/[id]/page.tsx:98,1057-1064).

**Before you start**

- Personal account, not an organisation workspace (health-space-service.ts:28).
- United States (header x-vercel-ip-country; in production a missing header is refused) (sensitive-data-connectors.ts:46-55).
- Deployment has a HealthEx OAuth descriptor and client id configured (health-space-service.ts:26; doc: docs/development/connectors-setup.md:564-596).
- For the connector: connectors released for healthex and a paid plan (connector-policy-gate.ts:147-186). healthex is not in the released list today (connector-release.ts:16-30).

**Screens and controls**

- Landing page headed 'Health' with 'Health stays out of your other chats, and only uses models that keep chats out of training.' (HealthSpaceLanding.tsx:75-81).
- 'Opening Health' spinner; 'Try again' on error (HealthSpaceLanding.tsx:82-102).
- On success the landing page redirects to the project page /chat/projects/{id} (HealthSpaceLanding.tsx:62).
- Health project page note 'Health stays out of your other chats, and only uses models that keep chats out of training.' and link 'Connect health records' (projects/[id]/page.tsx:1043-1065); the Share menu item is hidden for it (page.tsx:619).

**Journey**

1. When available, click 'Health' in the rail.
2. The landing page reads availability, creates the space if missing (POST), then moves to the project page.
3. In Settings, Connections choose HealthEx and sign in to HealthEx (OAuth, 30 minute authorization window).
4. Start or open a chat in the Health project and ask about records.
5. Chat calls HealthEx read tools; replies come only from allowed models.

**What the person sees and gets**

- Unavailable copy: 'Health is not available yet.' (not_configured), 'Health is available in the United States only.' (region), 'Health is part of your personal account. Switch to your personal account to use it.' (workspace) (HealthSpaceLanding.tsx:19-23).
- Error: 'Health could not be opened. Try again in a moment.' (HealthSpaceLanding.tsx:25).
- Model refusal: 'This model's provider may train on what you send, and Health only uses models that keep your chats out of training. Choose another model.' (request-processor.ts:3235-3240).
- Duplicate refusal: 'Health cannot be duplicated. Its chats and files stay in Health.' (apps/web/app/api/projects/[id]/duplicate/route.ts:68-70).

**Settings**

- Connector grant at HealthEx and its disconnect (revokes at HealthEx and erases tokens per doc: docs/development/connectors-setup.md:592).
- Rail item can be hidden by the person (hideable: app-nav-items.ts:139).
- Env CONNECTOR_OAUTH_PROVIDERS_JSON descriptor and CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID (oauth-registry.ts:22,101-117).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Availability endpoint with three reasons and create-once POST (apps/web/app/api/health-space/route.ts:21-65).
- One health project per user enforced by a unique index; room rules by triggers: conversations cannot be moved out, deleting the space deletes its conversations, sharing is refused (apps/web/db/neon/0337_health_space.sql:11-13,65-143).
- Health projects do not count toward the project limit (0337_health_space.sql:47).
- Health-space turns refuse models that may train and use no-training routing (request-processor.ts:3235-3260,3620-3630,4925-4936).
- HealthEx tools offered only when the turn is in a Health space and only those declared read (user-connector-tools.ts:2515-2540,2565,2657-2659; tool-metadata.ts:778-790).
- save_memory refused after a health tool returned data (tool-loop.ts:2531-2536,5642-5644); memory commands in the space are scoped to the space (apps/web/app/api/memory/commands/route.ts:49-58).
- Duplicate refused; search can include health spaces (api/search/route.ts:408).

**Incomplete**

- Browsing records: there is no records browser; the space is an ordinary project page plus chat. Brief says 'browse and ask'; only ask is built [inferred from the landing page redirecting to the project page].
- The privacy and DPA text says connectors are coming soon and cannot be connected yet (apps/web/app/privacy/page.tsx:1580-1585; apps/web/app/dpa/page.tsx:69).

**Present but disconnected or switched off**

- HealthEx has no provider descriptor in the repository; it is added by configuration, so health-space availability answers 'not_configured' until the owner adds it (health-space-service.ts:26; doc: docs/development/connectors-setup.md:574-596).
- healthex is not in the released connector list, so connecting is refused with 'Connectors are coming soon.' (connector-release.ts:16-30; connect start route calls the same policy gate: apps/web/app/api/connectors/oauth/start/route.ts:262) and its tools are skipped (user-connector-tools.ts:2538).
- The brief says the owner has said Health stays off.

**Not available**

- Mobile: no Health space.
- Chrome, CLI, VS Code: none found.
- Local mode: no on-device health path found.

## 4. Required behaviour

**Established requirements**

- A health-record workspace imports the user's medical records (for example via FHIR) and lets them browse and ask about them. (source: S108.12 (brief))
- Health connections are opt-in, read-only, US only, never written to memory or used for training, removed with their tokens on disconnect, and unavailable until the owner signs the vendor agreement and a lawyer confirms the FTC rule. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:198-215)
- Only tools declared as reads reach the model; the sign-in window is 30 minutes; save_memory is refused after a health tool returns data. (source: doc: docs/development/connectors-setup.md:564-596)
- Health is a personal feature: US only, not inside an organisation workspace, tools offered only inside the Health space, chats sent only to providers recorded as not training. (source: doc: apps/web/app/privacy/page.tsx:1573-1586)

**Acceptance criteria**

1. Outside the US the landing page says 'Health is available in the United States only.' and the rail item is hidden.
2. Inside an organisation workspace the page says Health is part of the personal account.
3. With no HealthEx descriptor configured the page says 'Health is not available yet.'
4. Opening Health twice returns the same project (one per user).
5. In the Health project, picking a model that may train is refused with the Health-specific message.
6. HealthEx tools never appear in a chat outside the Health project.
7. Only read tools appear; a write tool never does.
8. Moving a Health chat to another project, or sharing the Health project, is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A records timeline or browser would be needed to meet 'browse' in S108.12 [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show connection status and a records overview on the Health project page.
- [proposed] Add a Health entry to Settings so the 'Connect health records' route is direct.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Health route | `apps/web/app/chat/health/page.tsx` | Route /chat/health in the app shell |
| component | HealthSpaceLanding | `apps/web/features/health/components/HealthSpaceLanding.tsx` | Opens or creates the space and redirects; unavailable and error copy |
| hook | useHealthSpaceAvailable | `apps/web/features/health/hooks/use-health-space-available.ts` | Caches availability per user for the rail |
| config | nav destination health | `apps/web/shared/components/layout/app-nav-items.ts` | Rail item requiring health space (133-141) |
| endpoint | GET and POST /api/health-space | `apps/web/app/api/health-space/route.ts` | Availability and create-once |
| service | health-space-service | `apps/web/lib/services/health-space-service.ts` | Reasons, ensure space, conversation lookup, no-training check |
| schema | health-space contract | `packages/contracts/cloud-contracts/src/health-space.ts` | Path, reasons and response shapes |
| config | sensitive-data-connectors | `apps/web/lib/connectors/sensitive-data-connectors.ts` | HealthEx id, US rule, 30 minute window, read-only filter |
| table | user_projects.space_kind | `apps/web/db/neon/0337_health_space.sql` | Health flag, unique index, triggers for move, delete and share |
| service | user-connector-tools | `apps/web/lib/user-connector-tools.ts` | Withholds HealthEx tools outside the space (2515-2540,2657) |
| config | HealthEx tool metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Declares health tools as read class (778-790) |
| service | request-processor health rules | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Space lookup, no-training routing and refusal (3235-3260,3578-3630,4925-4936) |
| service | tool-loop memory guard | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Refuses save_memory after sensitive reads (2531-2536,5642) |
| endpoint | duplicate project guard | `apps/web/app/api/projects/[id]/duplicate/route.ts` | Refuses duplicating Health (68-70) |
| screen | Project page health note | `apps/web/app/chat/projects/[id]/page.tsx` | Health explanation, Connect health records link, hides Share |
| config | HealthEx capability entry | `apps/web/lib/connectors/catalog.ts` | healthex as oauth2 MCP connector (line 274) |
| config | OAuth scope ceiling | `packages/contracts/cloud-contracts/src/connector-scopes.ts` | healthex scopes include patient/*.read (line 233) |
| config | oauth registry | `apps/web/lib/connectors/oauth-registry.ts` | Provider descriptors and client id variables decide configured status (101-117,203-205) |
| config | connector release | `packages/contracts/types/src/connector-release.ts` | healthex unreleased |
| test | health-space route test | `apps/web/app/api/health-space/__tests__/route.test.ts` | Covers availability, create and refusals |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Page shell asks GET /api/health-space once per user and shows the Health rail item only if 'available'. | device and our servers | use-health-space-available.ts:9-46; app-nav-items.ts:204-215 |
| Server computes availability: configured OAuth provider, US country header, personal account. | our servers | health-space-service.ts:22-30 |
| Opening /chat/health reads then POSTs to create the project row once, then redirects. | our servers | HealthSpaceLanding.tsx:33-46; health-space-service.ts:46-58 |
| Person connects HealthEx through OAuth with PKCE; sign-in happens at HealthEx. | outside service | doc: docs/development/connectors-setup.md:564-596; oauth/start/route.ts:243 |
| A chat turn in the Health project looks up the space, forces no-training routing and passes healthSpace to the tool catalog. | our servers | request-processor.ts:3578-3630; route.ts:857 |
| The model calls a HealthEx read tool at the HealthEx MCP server; the answer returns into chat. | outside service | user-connector-tools.ts:2538-2575; doc: docs/development/connectors-setup.md:567-568 |
| After a health read, save_memory is refused for the rest of the turn. | our servers | tool-loop.ts:2531-2536,5642-5644 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Health project row (name 'Health', space_kind health) | table user_projects | Served to web | Deleting it marks its conversations deleted by trigger; cannot be shared or duplicated (0337_health_space.sql) |
| Health chats and files | web_conversations and project files (project_id equals the space) | Per normal chat sync | Follow the project; conversations cannot be moved out by trigger |
| HealthEx OAuth grant (tokens) | connector OAuth grant store | Server only | Revoked and erased on disconnect (doc: docs/development/connectors-setup.md:592) |
| Health records returned by tools | Not stored by us except as chat tool results in the conversation [inferred] | With the conversation | As the conversation |

**Models and providers.** Only models whose provider is recorded as not training are allowed in a Health chat; otherwise the turn is refused with 'model_may_train' or 'no_training_model_available' (request-processor.ts:3235-3260,4925-4936). Which providers qualify is catalog data (SYS-model-catalog-and-routing); no model name is fixed here. HealthEx is the outside data provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in, active, personal account (health-space/route.ts:21-35; health-space-service.ts:28). |
| Permissions | Region and personal-only rules; the space belongs to one user with organisation id null (0337_health_space.sql:8-9). |
| Subscription | Space endpoints check no plan. Connecting HealthEx needs the Connectors capability, paid tiers (billing-catalog.ts:351; connector-policy-gate.ts:179-186). |
| Limits and metering | Rate limit bucket 'health-space' per user (health-space/route.ts:24,43). The Health space is excluded from the project count (0337_health_space.sql:47). Chat metering follows ordinary chat; none specific found. |
| Feature flags | Connector release state; OAuth descriptor and client id configuration; NODE_ENV production rule for the country header. |
| Model compatibility | Models must be on non-training providers; tool use needed for HealthEx tools. |
| Provider restrictions | Non-training providers only inside the Health space; HealthEx as the records source. |
| Local mode | Not available: no code runs health records on the device. A Local chat is not routed to the Health space (no code found for it). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Opening Health' spinner | HealthSpaceLanding.tsx:82-87 |
| Unavailable | One of three messages; rail item hidden | HealthSpaceLanding.tsx:19-23; app-nav-items.ts:204-215 |
| Error | 'Health could not be opened. Try again in a moment.' with 'Try again' | HealthSpaceLanding.tsx:25,93-101 |
| Race on create | on conflict do nothing then read the existing row | health-space-service.ts:46-58 |
| Wrong country | POST returns forbidden; in non-production with no header it is allowed | health-space/route.ts:53-55; sensitive-data-connectors.ts:52-54 |
| Policy lookup fails | conversationKeepsOutOfTraining returns true (treated as health) on error | health-space-service.ts:86-93 |
| Offline | Availability fetch failure hides the rail item (returns false) | use-health-space-available.ts:9-18 |
| App differences | Web and Desktop only | brief S108.12 |
| Accessibility | role=status messages and a labelled retry button; no deeper audit done | HealthSpaceLanding.tsx:82-102 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/health-space/__tests__/route.test.ts`: 401, reason reporting, project id, CSRF, suspended account, US only, workspace refusal, not configured, creation
- `packages/contracts/types/src/__tests__/connector-release.test.ts`: Connector release list (healthex is not released)
- `apps/web/e2e/signed-in-page-routes.spec.ts`: No Health route check found; not covered

**Test scenarios**

- **Not configured**
  1. Sign in with a US request on a deployment without a HealthEx descriptor
  2. GET /api/health-space
  - Expected: {status:'unavailable', reason:'not_configured'} and no Health rail item
- **Region**
  1. Send the request with country header other than US in production mode
  - Expected: reason 'region' and 'Health is available in the United States only.'
- **Create once**
  1. With HealthEx configured in a test deployment, POST /api/health-space twice
  - Expected: Same project id both times
- **No-training guard**
  1. In the Health project pick a model whose provider may train
  2. Send a message
  - Expected: 403 model_may_train with the Health message
- **Tool scope**
  1. With HealthEx connected, ask a records question outside the Health project
  - Expected: No HealthEx tool is offered
- **Room rules**
  1. Try to share, duplicate, or move a Health chat
  - Expected: Each is refused

**Where to look when it fails**

- Reason codes not_configured, region, workspace; error codes model_may_train, no_training_model_available
- Database errors with constraint organization_shared_projects_health_space
- Log '[connector-oauth] loaded provider registry' shows configured versus described providers (oauth-registry.ts)
- Tables user_projects (space_kind) and web_conversations

**Hands-on test plans**

- Web: [70-qa/test-plans/web/108-specialist-workspaces.md](../../70-qa/test-plans/web/108-specialist-workspaces.md)
- Desktop: [70-qa/test-plans/desktop/108-specialist-workspaces.md](../../70-qa/test-plans/desktop/108-specialist-workspaces.md)

## 10. Gaps and dependencies

- **HealthEx cannot be connected: unreleased and unconfigured** Affects: Web and Desktop, all users. Evidence: connector-release.ts:16-30; health-space-service.ts:26; brief S108.12. Work needed: Owner steps (agreement, legal sign-off, client registration, env) and add healthex to the released list
- **No records browser** Affects: Web and Desktop. Evidence: HealthSpaceLanding.tsx:62 redirects to a plain project. Work needed: Design and build a records view if 'browse' is required
- **No Health on mobile or Chrome** Affects: Mobile, Chrome. Evidence: brief S108.12; no code found. Work needed: Decision on store declarations and scope
- **The setup doc says the connector variable pair is enough; code also needs a descriptor in the providers variable** Affects: Operators. Evidence: oauth-registry.ts:101-139; docs/development/connectors-setup.md:564-596 describes both. Work needed: None if the doc is read in full; confirm during setup
- **Health e2e route coverage is missing** Affects: Testers. Evidence: signed-in-page-routes.spec.ts has finance but no health entry in lines 1-110. Work needed: Add a Health route spec
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- plan:basic
- plan:pro
- plan:max
- plan:team
- plan:enterprise
- file:apps/web/lib/services/health-space-service.ts
- api:GET /api/health-space
- api:POST /api/health-space
- table:user_projects
- SYS-security-and-privacy
- SYS-memory-projects-and-context
- SYS-model-catalog-and-routing
- SYS-connectors-plugins-and-skills
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations

## Unknown

- Whether production has a HealthEx descriptor or client id.
- Where the 30 minute authorization window is applied (the value is defined at sensitive-data-connectors.ts:16,21; its consumer was not opened).
- Whether Desktop adds any behaviour on top of the hosted page.
- Exact list of which providers count as non-training (catalog data not opened).
- Own-key mode behaviour in the Health space: not examined.
