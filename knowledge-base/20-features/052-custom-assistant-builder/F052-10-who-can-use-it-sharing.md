---
id: "F052-10"
type: "feature"
title: "Who can use it (sharing)"
aliases: ["Who can use it", "Sharing", "Visibility", "Private access", "Named-user access", "Workspace access", "Public listing", "S52.31", "S52.32", "S52.33", "S52.34", "Shared with you", "Specific people", "Everyone in the workspace", "user_agent_access"]
area: "52 Custom-assistant builder"
available_on: ["web", "mobile", "cli"]
implementation: {web: "partial", desktop: "missing", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S52.31", "S52.32", "S52.33", "S52.34"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "mode:cloud", "table:user_agents", "table:user_agent_access", "api:GET /api/custom-agents/[id]/share", "api:PUT /api/custom-agents/[id]/share", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "F052-09", "F052-11"]
basis: "code inspection"
second_reader: "6 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F052-10 Who can use it (sharing)

Controls who may chat with an agent: only the owner, named workspace members, or everyone in the workspace. Sharing needs a workspace and a published version. Web and Mobile support it against our servers. A public directory does not exist. CLI agents are private by file location.

Area: [52. Custom-assistant builder](README.md). Requirement items: [S52.31](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5231), [S52.32](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5232), [S52.33](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5233), [S52.34](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5234).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** The owner sets visibility to private, people or workspace. For people, named workspace members get an access row. Those people (or all members) can chat with the published version, read-only. (apps/web/lib/services/custom-agent-service.ts:561-600; apps/web/db/neon/0370_user_agents.sql:18-22).

**Why it exists.** Teams want to reuse one assistant. Private-only agents force copying instructions around (migration purpose, 0370_user_agents.sql:1-9; brief S52.31 to S52.34).

**Who uses it.** Owners who build agents for a workspace; teammates who use them.

**Problems it solves**

- Sharing without copying.
- Keeping unfinished work private.
- Choosing a few people rather than the whole workspace.

**Use cases**

- Share a drafting agent with three teammates.
- Share an onboarding agent with the whole workspace.
- Keep a personal prompt helper private.
- In the CLI, commit a project agent file so the team inherits it.

## 2. User experience

**Where to find it**

- Web: open an agent, Agent tab, section 'Sharing' with radio choices and 'Save sharing' (apps/web/features/agents/components/AgentPublishPanel.tsx:192-299).
- Web list: sections 'Your agents' and 'Shared with you' (apps/web/features/agents/components/AgentsPage.tsx:219-230).
- Mobile: Sharing section with chips 'Only you', 'Specific people', and the workspace name; list sections 'Your agents', 'Shared with you', 'Retired' (apps/mobile/src/features/agents/components/AgentManageSections.tsx:55-59, 302-400; AgentsScreen.tsx:80-102).
- CLI: no sharing command; scope is the folder: project .agiworkforce/agents or global (apps/cli/src/agents.rs:258-268, 1062-1090).
- Desktop Tauri: scope radio global or project when creating (apps/desktop/src/features/settings/CustomAgentEditor.tsx:272-285).
- VS Code, Chrome: not found.

**Before you start**

- Agent lives in a workspace (organization); personal-space agents stay private (service:569-573).
- Agent has a published version (service:574-576).
- Agent not retired for recipients (0370_user_agents.sql:189-191).

**Screens and controls**

- Radio options: 'Only you' (help 'Nobody else can see or use it.'), 'Specific people' (help 'Members of this workspace you pick can chat with the published version.'), 'Everyone in the workspace' plus ' in <workspace name>' (AgentPublishPanel.tsx:19-31, 234-236).
- Checkbox list of workspace members with name and email when 'Specific people' is chosen (AgentPublishPanel.tsx:249-284).
- 'Save sharing' button, enabled only when something changed and the agent is published (AgentPublishPanel.tsx:285-296).
- Notices: 'Personal agents stay private. Create it in a workspace to share it.', 'Publish the agent before you share it.', 'Nobody else is in this workspace yet.' (AgentPublishPanel.tsx:211-213, 244-248, 250-253).
- Recipient view: label 'Shared by <name>', read-only form, line '<name> built this agent. Only its owner can change it.' (agent-display.ts:22; AgentEditorPage.tsx:416-420).

**Journey**

1. Create the agent inside a workspace and publish it (see F052-09).
2. Open the Sharing section and choose who can use it.
3. If 'Specific people', tick members.
4. Press 'Save sharing'; toast 'Sharing saved.'
5. Teammates see it under 'Shared with you' and press Chat; chats run the published version.
6. To stop sharing, choose 'Only you' and save, or retire the agent.

**What the person sees and gets**

- Toasts 'Sharing saved.' and 'Sharing could not be saved.' (AgentPublishPanel.tsx:134, 136).
- Server messages: 'Agents in your personal space stay private. Create it in a workspace to share it.', 'Publish the agent before you share it.', 'Choose at least one person to share with.' (service:570-583).
- A workspace audit event 'agent_shared' is recorded with the visibility and head count (apps/web/app/api/custom-agents/[id]/share/route.ts:89-98).
- Recipient list label 'Shared by <name>' or 'Shared with you'.

**Settings**

- Visibility value private, people or workspace (packages/contracts/cloud-contracts/src/agents.ts:12).
- Up to 100 named people per share (agents.ts:28).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Share route GET returns visibility, workspace name and members from the first page of 100 workspace members with the owner removed (so at most 100, usually 99 others), each with a hasAccess flag; it returns no members and a null workspace name if the owner's membership is not active; PUT validates and saves (apps/web/app/api/custom-agents/[id]/share/route.ts:40-65, 71-100; packages/contracts/cloud-contracts/src/agents.ts:28).
- shareAgent runs in a transaction: needs a workspace, a published version and at least one person for 'people'; updates visibility; deletes access rows not in the list; inserts new ones (service:561-600).
- Database rules: non-private needs organization_id (0370_user_agents.sql:72-73); recipients can read only published, non-retired agents in the current workspace, and for 'people' only with an access row (policy lines 185-206); only the owner can grant, and only to workspace members (lines 241-255).
- The list query returns the owner's agents in the current organization (or personal space) plus any other user's agents with organization_id equal to the current workspace, limit 500; it applies no visibility, published or access filter, and the database row policy decides which of those the viewer may read (service:281-297).
- Teammates run the published copy only (service:146-149).
- Mobile has the same sharing control and also 'Report' and 'Hide' for a shared agent from a sharer (apps/mobile/src/features/agents/components/AgentManageSections.tsx:302-400; AgentEditorScreen.tsx:150-160).
- CLI: an agent is private by where it is stored; project agents load only when the workspace is trusted and a project agent never replaces your own agent of the same name (agents.rs:258-274, tests at 2199, 2217).

**Incomplete**

- Share member list is limited to the first 100 workspace members with no paging (share route:46-51) [inferred: larger workspaces cannot pick everyone].
- Switching visibility to 'workspace' or 'private' removes old access rows: access rows not in the new list are deleted, and the list is empty for non-people (service:577, 585-589).
- Brief cites agents.rs:228 and :255 for workspace access; those lines are in subagent application and discovery code, not sharing. The nearest CLI idea is project scope shared by committing the file [inferred].

**Present but disconnected or switched off**

- Brief marks Web and Mobile 'missing' while code works.

**Not available**

- Public listing or directory of agents: no code found (S52.34). The mobile 'By <company>' group is a fixed built-in list in code, not user listings (packages/contracts/cloud-contracts/src/agent-catalog.ts:5-17).
- Sharing from CLI, desktop file editor, VS Code or Chrome.
- Sharing with people outside the workspace, or by link: not found.

## 4. Required behaviour

**Established requirements**

- An assistant can be kept private to its creator. (source: brief S52.31)
- A builder can share an assistant with named people. (source: brief S52.32)
- A builder can make an assistant available to everyone in their workspace. (source: brief S52.33)
- A builder can list an assistant in a public directory others can browse. (source: brief S52.34)
- Workspace and role rules decide who may read a resource; sharing a Local item to another boundary needs consent. (source: doc: AGENTS.md section 6)
- Custom GPTs and the GPT Store are a migration source, not the enduring target architecture, so a public store is not assumed. (source: doc: docs/product/definition.md:183-184)

**Acceptance criteria**

1. A new agent is private: another workspace member does not see it in 'Shared with you'.
2. Sharing before publishing is refused with 'Publish the agent before you share it.'
3. A personal-space agent cannot be shared and the panel says so.
4. 'Specific people' with nobody ticked is refused.
5. After sharing with person A only, person B cannot read or chat with the agent (route and database both refuse).
6. After 'Everyone in the workspace', every member sees it; after 'Only you', they no longer do.
7. A recipient cannot edit, publish, share, transfer or delete.
8. Retiring the agent removes it from recipients.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Sharing should extend to every app that can run an agent; VS Code and Chrome do not list agents today [inferred].
- The 100-person cap and member listing should page for larger workspaces [inferred].
- A public directory, if wanted, needs review, reporting and a separate visibility value; none exists [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add paging and search to the people picker.
- [proposed] Decide on public listing in a decision record before building, given the product direction on GPT stores.
- [proposed] Show the owner who currently has access in the list row.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | shareAgent | `apps/web/lib/services/custom-agent-service.ts` | Validates and saves visibility and access rows (lines 561-600). |
| service | readAgentAccess / listAgentRows | `apps/web/lib/services/custom-agent-service.ts` | Reads who has access and which agents a viewer sees (lines 281-297, 553-559). |
| endpoint | api:GET /api/custom-agents/[id]/share and api:PUT /api/custom-agents/[id]/share | `apps/web/app/api/custom-agents/[id]/share/route.ts` | Share state and update; GET at line 71 (exported 102), PUT at line 82 (exported 103); writes an audit event. |
| service | recordWorkspaceAuditEvent | `apps/web/lib/workspace-audit.ts` | Records 'agent_shared' (called in share route:89-98). |
| service | listWorkspaceMembers / readWorkspaceMember | `apps/web/lib/services/organization-member-admin-service.ts` | Member list for the people picker. |
| schema | AgentShareRequestSchema / AgentShareResponseSchema | `packages/contracts/cloud-contracts/src/agents.ts` | Share wire shapes, up to 100 people (lines 175-195). |
| table | table:user_agents (visibility, organization_id) | `apps/web/db/neon/0370_user_agents.sql` | Visibility and workspace columns with the shared-needs-workspace check (lines 44-76). |
| table | table:user_agent_access | `apps/web/db/neon/0370_user_agents.sql` | Named people with access (lines 106-115). |
| config | row-level policies user_agents_shared_read / user_agent_access_grant | `apps/web/db/neon/0370_user_agents.sql` | Database-level rules for who reads and who may be granted (lines 185-206, 241-255). |
| component | AgentPublishPanel (Sharing section) | `apps/web/features/agents/components/AgentPublishPanel.tsx` | Web sharing UI. |
| component | AgentsPage | `apps/web/features/agents/components/AgentsPage.tsx` | Lists 'Your agents' and 'Shared with you'. |
| service | agentStateLabel | `packages/contracts/cloud-contracts/src/agent-drafts.ts` | Labels like 'Shared with workspace' and 'Shared by <name>' (lines 50-67). |
| component | AgentShareSection (Mobile) | `apps/mobile/src/features/agents/components/AgentManageSections.tsx` | Mobile sharing chips and member toggles (lines 302-400). |
| component | SharedItemSafetyActions | `apps/mobile/src/features/shared-with-you/SharedItemSafetyActions.tsx` | Report and Hide for a shared agent (used in AgentEditorScreen.tsx:150-158). |
| service | AgentsScreen | `apps/mobile/src/features/agents/AgentsScreen.tsx` | Mobile list groups: Your agents, Shared with you, Retired, built-in group. |
| command | discover_agents / trusted_project | `apps/cli/src/agents.rs` | CLI scope by folder, trust check for project agents (lines 258-274). |
| component | CustomAgentEditor scope control | `apps/desktop/src/features/settings/CustomAgentEditor.tsx` | Desktop global or project scope (lines 272-285). |
| schema | AGENT_CATALOG | `packages/contracts/cloud-contracts/src/agent-catalog.ts` | First-party built-in agents shown by Mobile, not a public directory. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Owner opens the Sharing section; the client fetches GET share to get visibility, workspace name and members. | our servers | share/route.ts:71-80; AgentPublishPanel.tsx:67-85 |
| Owner saves; PUT sends visibility and user ids; the server checks ownership, workspace, published version and people count, then updates user_agents and user_agent_access in one transaction. | our servers | service:561-600; share/route.ts:82-100 |
| An audit event 'agent_shared' is recorded. | our servers | share/route.ts:89-98 |
| A recipient's list call returns agents in the current workspace; database policies filter what they may read; presentation hides unpublished data. | our servers | service:281-297; 0370_user_agents.sql:185-206; service:146-178 |
| The recipient starts a chat: a conversation row is made with the agent id and each turn loads the published copy. | our servers | conversations/route.ts:13-24; agent-turn-config.ts:57-105 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Visibility and access rows | table:user_agents and table:user_agent_access | Same database for Web and Mobile | Access rows deleted when sharing changes (switching to 'workspace' or 'private' deletes all of them because the people list is empty, service:577-589), when the agent is deleted, or when ownership transfers to that person (0370_user_agents.sql:323-325). |
| Audit event agent_shared | Workspace audit log (store not opened) | unknown | unknown |
| CLI agent file | Folder on the device | No sync found; a project folder can be shared by version control [inferred] | File delete |

**Models and providers.** Sharing does not involve a model. Recipients' chats use the owner's pinned model only when their chat is on Auto (agent-turn-config.ts:175-182); billing for the recipient's turns is not described in the agent code: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in on Web or Mobile; the recipient must be a member of the workspace. |
| Permissions | Only the owner changes sharing (requireOwnedAgent). Grant only to workspace members (policy lines 241-255). Recipients are read-only (AgentEditorPage.tsx:184). |
| Subscription | No plan gate found on sharing. Workspace membership comes from the organization_members table, not from an agent-specific plan check. |
| Limits and metering | Up to 100 people per share (agents.ts:28). Optional caps set by the owner apply to recipients (agent-turn-config.ts:81-100): the daily message cap is per person per agent and resets at midnight UTC; the monthly credit cap is per agent, summed over everyone who uses it, and resets on the 1st UTC. It is not a workspace-wide cap, and both are skipped when unset. Because the monthly spend is shared across all users of the agent, one heavy recipient can lock out every other recipient for the month (agent-turn-config.ts:91-100). |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Sharing exists only for Cloud agents. Mobile shows a CloudFeatureGate ('Agents run in AGI Cloud; switching won't upload your local chats.') whenever cloud access is not ready (Local mode or signed out), on both the editor (AgentEditorScreen.tsx:66-75) and the list screen (AgentsScreen.tsx:495). CLI project agents are shared by the repository, outside the product. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Personal agent | Panel says 'Personal agents stay private. Create it in a workspace to share it.'; server refuses non-private. | AgentPublishPanel.tsx:210-213; service:569-573 |
| Not yet published | Radios disabled with 'Publish the agent before you share it.' | AgentPublishPanel.tsx:216, 244-248 |
| Zero people picked | Server refuses 'Choose at least one person to share with.' | service:578-583 |
| Member list loading or failing | 'Loading sharing...' then message with Try again. | AgentPublishPanel.tsx:196-209 |
| Owner no longer an active workspace member | GET share returns an empty member list and null workspace name, so an owner who has left the workspace cannot pick people. | apps/web/app/api/custom-agents/[id]/share/route.ts:40-44 |
| Paused agent | Recipients still see it but Chat is disabled with state 'Paused'. | agent-display.ts:10-12, 20; 0370 policy excludes only retired |
| Retired agent | Disappears for recipients. | 0370_user_agents.sql:189-191; Retire confirm text in AgentManagePanel.tsx:206-215 |
| Recipient opens an agent that was unshared | Chat turn refused: 'The agent this chat runs as is no longer shared with you or was deleted. Start a new chat to continue.' | agent-turn-config.ts:65-72 |
| Owner changes workspace context | List shows agents of the current workspace only. | service:291-292 |
| Offline | not handled in the code beyond error text. | agents-client.ts |
| Mobile sharer abuse | Recipient can report or hide a sharer's agent. | AgentEditorScreen.tsx:150-158; AgentsScreens.test.tsx 'hides every agent from a sharer after confirmation' |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/custom-agents/[id]/share/route.test.ts`: GET lists workspace people, personal agent answer, PUT shares and writes the audit event, invalid visibility refused.
- `apps/web/db/neon/user-agents-migration.test.ts`: Row security forced; shared reads only for published agents in the active workspace; only the owner grants to workspace members.
- `apps/web/lib/agents/__tests__/custom-agent-service.test.ts`: Teammate sees only the published copy with owner name.
- `apps/web/lib/agents/__tests__/agent-turn-config.test.ts`: Refusal when no longer shared; teammate runs published copy; never-published refused.
- `apps/web/features/agents/__tests__/AgentsPage.test.tsx`: Own agents listed apart from shared ones.
- `apps/web/features/agents/__tests__/AgentEditorPage.test.tsx`: Teammate sees a read-only agent with no owner controls.
- `apps/mobile/src/features/agents/__tests__/AgentsScreens.test.tsx`: Recipient read-only, report and hide, Shared segment.
- `apps/cli/src/agents.rs`: In-file tests: untrusted project supplies no agents; project agent never replaces your own.

**Test scenarios**

- **Private by default**
  1. User A creates and publishes an agent in a workspace.
  2. User B in the same workspace opens Agents.
  - Expected: B does not see it.
- **Share with one person**
  1. A chooses 'Specific people', ticks B, saves.
  2. B opens Agents, then A's agent, presses Chat.
  3. User C tries the same.
  - Expected: B can chat; C cannot see it.
- **Workspace share then revoke**
  1. A chooses 'Everyone in the workspace', saves.
  2. B and C see it.
  3. A chooses 'Only you', saves.
  - Expected: B and C lose it; their old chats stop with the 'no longer shared' message.
- **Unpublished refusal**
  1. Create an agent and open Sharing without publishing.
  - Expected: Choices disabled; API PUT returns 'Publish the agent before you share it.'
- **Personal space**
  1. Sign in with no workspace and open Sharing.
  - Expected: Message that personal agents stay private.
- **CLI untrusted project**
  1. Open an untrusted repo containing .agiworkforce/agents/x.md
  2. Run /agents
  - Expected: The project agent is not listed.

**Where to look when it fails**

- Tables user_agent_access and user_agents.visibility.
- Workspace audit events of type agent_shared.
- HTTP 400 validation and 409 conflict from PUT share.
- Database policy denials appear as not found (404 'Agent not found').

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/052-custom-assistant-builder.md](../../70-qa/test-plans/cli/052-custom-assistant-builder.md)
- No hands-on plan yet for Web, Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No public listing or directory.** Affects: All apps. Evidence: No code found; brief S52.34. Work needed: Product decision first (docs/product/definition.md:183), then visibility value, review and browse UI.
- **People picker limited to 100 members, no paging.** Affects: Web and Mobile owners in large workspaces. Evidence: share/route.ts:46-51; agents.ts:28. Work needed: Paging and search.
- **No sharing in CLI, VS Code, Chrome or desktop file editor beyond folders.** Affects: Those apps. Evidence: No code found. Work needed: Decide whether those apps read cloud agents.
- **Brief marks Web and Mobile 'missing'; CLI 'partial' for workspace access using lines that are not sharing.** Affects: Planning. Evidence: Brief S52.31-S52.33. Work needed: Correct the brief.
- **How recipient turns are billed is not visible in the agent code.** Affects: Owners and recipients. Evidence: agent-turn-config.ts has only caps. Work needed: Confirm in SYS-subscriptions page.
- Not built on: Desktop, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- mode:cloud
- table:user_agents
- table:user_agent_access
- api:GET /api/custom-agents/[id]/share
- api:PUT /api/custom-agents/[id]/share
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- F052-09
- F052-11

## Unknown

- Where workspace audit events are stored and how long.
- How a recipient's turn cost is metered (to the recipient, owner or workspace).
- Whether a workspace role can disable agent sharing; no setting found.
- Electron desktop rendering of these pages.

## Second reader's check

A second reader checked 11 statements of this page against the code: 6 correct, 5 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "The list shows the owner's agents plus others' agents in the current workspace (service:281-297)" The code shows: The query selects other users' agents in the workspace with no visibility, published or access filter, and caps at 500 rows. Row-level security does the filtering, so the SQL does not filter by visibility. (custom-agent-service.ts:281-297). **Corrected:** The list query returns the owner's agents in the current organization (or personal space) plus any other user's agents with organization_id equal to the current workspace, limit 500. The database row policy decides which of those the viewer may read.
- **Partly wrong (section 3):** "Share route GET returns visibility, workspace name and the first 100 other members with a hasAccess flag" The code shows: The service lists up to 100 members (AGENT_SHARE_PEOPLE_MAX) and then filters out the owner, so at most 100 and usually 99 others. GET also returns an empty member list and null workspace name when the owner is no longer an active member. (apps/web/app/api/custom-agents/[id]/share/route.ts:40-65,71-80; packages/contracts/cloud-contracts/src/agents.ts:28). **Corrected:** GET returns visibility, workspace name and members from the first page of 100 workspace members with the owner removed. It returns no members or workspace name if the owner's membership is not active.
- **Partly wrong (section 7):** "Local mode: Sharing exists only for Cloud agents. Mobile Local mode shows the gate 'Agents run in AGI Cloud' (AgentEditorScreen.tsx:79-90)" The code shows: The gate (CloudFeatureGate with 'Agents run in AGI Cloud; switching won't upload your local chats.') is at AgentEditorScreen.tsx:66-75, not 79-90. It is shown when !access.ready, not only in Local mode. The list screen has the same gate at AgentsScreen.tsx:495. (apps/mobile/src/features/agents/AgentEditorScreen.tsx:66-75; AgentsScreen.tsx:495). **Corrected:** Mobile shows a CloudFeatureGate ('Agents run in AGI Cloud; switching won't upload your local chats.') whenever cloud access is not ready (Local mode or signed out), on both the editor and the list screen. Cite AgentEditorScreen.tsx:66-75.
- **Partly wrong (section 7):** "Optional per-person daily message cap and workspace-wide monthly credit cap set by the owner apply to recipients (agent-turn-config.ts:81-100)" The code shows: The daily cap is counted per user and agent (countAgentTurnsToday(db,userId,agentId)). The monthly cap is spend against the single agent id (readAgentMonthSpendMicrousd(db, agentId)). It is per agent across all users, not workspace-wide. Both are skipped when null. (apps/web/lib/agents/agent-turn-config.ts:81-100). **Corrected:** The daily cap is per person per agent and resets at midnight UTC. The monthly credit cap is per agent, summed over everyone who uses it, and resets on the 1st UTC. It is not a workspace-wide cap.
- **Wrong (section 7):** "Subscription: Team and Enterprise tiers carry team admin (billing-catalog.ts:358)" The code shows: The billing-catalog.ts at the cited line sits in packages/contracts/types/src/, not apps/web/lib. Line 358 is `managed_api: PRO_TIERS`, not a team-admin entry. The cite does not support the claim. (packages/contracts/types/src/billing-catalog.ts:355-360). **Corrected:** Cite the real file path and the line that defines team features, or drop the sentence. No plan gate on sharing was found; membership comes from the organization_members table.

**Facts the page missed**

- The access-row delete runs when ownership is transferred, but it is not the only revoke path. Switching to 'workspace' or 'private' deletes all access rows because the people list is empty (custom-agent-service.ts:577-589). The page covers this, but it also states a false doubt about it in the 'Incomplete' list.
- The monthly credit limit is spent per agent across all users, so one heavy recipient can lock out every other recipient for the month (agent-turn-config.ts:91-100). The page calls it workspace-wide, which hides this.
- GET share returns an empty member list and null workspace name when the owner is no longer an active workspace member, so an owner who has left the workspace cannot pick people (apps/web/app/api/custom-agents/[id]/share/route.ts:40-44). The page does not mention it.
