---
id: "F052-11"
type: "feature"
title: "Creator identity and usage"
aliases: ["Creator identity and usage", "Creator profile", "Verified publisher information", "Usage analytics", "Activity", "Sessions tab", "S52.35", "S52.36", "S52.37", "ownerName", "app_user_agent_usage"]
area: "52 Custom-assistant builder"
available_on: ["web", "mobile"]
implementation: {web: "partial", desktop: "missing", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S52.35", "S52.36", "S52.37"]
depends_on: ["surface:web", "surface:mobile", "mode:cloud", "table:profiles", "table:user_agents", "table:web_conversations", "table:web_messages", "table:scheduled_tasks", "api:GET /api/custom-agents/[id]/usage", "api:GET /api/custom-agents/[id]/activity", "SYS-observability-and-operations", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "F052-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F052-11 Creator identity and usage

Shows teammates who built a shared agent by name, and shows the owner counts of chats, people and messages over 30 days plus their own chats and routines. Web and Mobile have it against our servers. There is no profile page and no verified-publisher status anywhere.

Area: [52. Custom-assistant builder](README.md). Requirement items: [S52.35](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5235), [S52.36](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5236), [S52.37](../../10-requirements/capabilities/052-custom-assistant-builder.md#s5237).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Every agent returned to a teammate carries the owner's name and id. The owner can read usage counts for the last 30 days (chats, people, messages) and an activity list of their own chats and routines with that agent (apps/web/lib/services/custom-agent-service.ts:264-279, 620-688).

**Why it exists.** People should know who built an assistant they are about to trust, and builders need to know if anyone uses theirs, without reading others' chats (migration comment: a builder reads usage counts, never another person's chats, 0370_user_agents.sql:26-28; brief S52.35 to S52.37).

**Who uses it.** Teammates see the creator name. Owners see the numbers.

**Problems it solves**

- Trust: who made this.
- Knowing whether an agent is worth keeping or retiring.
- Privacy: counts only, never other people's chats.

**Use cases**

- A teammate sees 'Shared by <name>' on an agent in the list.
- An owner checks that 12 people used the onboarding agent this month.
- An owner opens the Sessions tab to jump to their own chats with the agent.
- A reviewer wants to know whether a publisher is verified: not possible today.

## 2. User experience

**Where to find it**

- Web list: the line under an agent name reads 'Shared by <name>' or 'Shared with you' for non-owners (apps/web/features/agents/lib/agent-display.ts:14-31; AgentsPage.tsx:40).
- Web agent page header: '<name> built this agent. Only its owner can change it.' (AgentEditorPage.tsx:416-420).
- Web usage: open an agent, tab 'Sessions', section 'Activity' with tiles 'Chats', 'People', 'Messages' (AgentEditorPage.tsx:43-47, 461-463; AgentManagePanel.tsx:39-157).
- Mobile: section 'Activity' in the agent screen (AgentManageSections.tsx:405-480).
- CLI: /agents history [name] shows runs, outcome, files and spend for agents on that machine (apps/cli/src/agents.rs:1349-1389). That is device history, not usage across people.
- Desktop, VS Code, Chrome: not found.

**Before you start**

- Signed in. Usage tiles only for the owner (AgentManagePanel.tsx:48).
- Agent in a workspace for there to be other people.

**Screens and controls**

- Three number tiles Chats, People, Messages with the sentence 'Everyone's use in the last 30 days. You see counts only, never other people's chats.' (AgentManagePanel.tsx:80-97).
- 'Your chats with it' list of up to 50 chats with dates (AgentManagePanel.tsx:100-121; service:29).
- 'Routines it runs' list with 'Last run <date>' and a link 'Give it a schedule' (AgentManagePanel.tsx:122-152).
- 'Deployments' tab with 'New deployment' and run bars (AgentDeploymentsPanel.tsx:314-325).

**Journey**

1. Open Agents and an agent you own.
2. Choose the 'Sessions' tab.
3. Wait for 'Loading activity...'; see the three tiles and your chats and routines.
4. Teammate journey: open Agents, read 'Shared by <name>', open the agent and read who built it.

**What the person sees and gets**

- Tiles with localized numbers; 'None yet.' when no chats; 'No routines yet.' (AgentManagePanel.tsx:102-103, 124-126).
- Error 'Activity could not be loaded.' (AgentManagePanel.tsx:57).

**Settings**

- Usage window fixed at 30 days (packages/contracts/cloud-contracts/src/agents.ts:29).
- Owner can also set a daily message cap and monthly credit cap, which use these counts (F052-07).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Owner name: profiles display name, else email, else 'A teammate'; returned as ownerName for non-owners, null for the owner (custom-agent-service.ts:264-279; 151-178).
- Usage: GET /api/custom-agents/[id]/usage, owner only, calls database function app_user_agent_usage with the 30-day start and returns conversations, people, turns (usage/route.ts:11-24; service:620-638).
- The function returns counts only and works only for the owner (0370_user_agents.sql:336-361).
- Activity: GET /api/custom-agents/[id]/activity returns the viewer's own chats (50) and routines (50) with that agent (service:640-688; activity route).
- Monthly spend: app_user_agent_month_spend sums what the agent used this calendar month across everyone and is used to enforce the credit cap (service:690-699; migration 0374_slack_channel_policy_and_agent_credit_cap.sql:17-20).
- Mobile shows the same usage and activity (AgentManageSections.tsx:405-480; service.ts:120-130).
- ownerUserId is returned to non-owners so Mobile can report or hide a sharer (agents.ts:131; AgentEditorScreen.tsx:75-77).

**Incomplete**

- No usage over time, per-person split, cost, or ratings; only three totals.
- Monthly spend is read for enforcement but is not shown to the owner in the screens read (AgentConfigForm.tsx:605-631 shows only the cap input) [inferred].
- Creator is a text name only: no avatar, bio or link to other agents by that person.

**Present but disconnected or switched off**

- Brief marks creator profile and usage analytics 'missing'; code shows owner name and usage counts on Web and Mobile.

**Not available**

- Verified publisher information: no field, table or UI found.
- Creator profile page.
- Usage numbers on CLI, VS Code, Chrome or the desktop file editor.

## 4. Required behaviour

**Established requirements**

- A published assistant shows its creator's profile. (source: brief S52.35)
- A published assistant shows verified publisher information. (source: brief S52.36)
- A builder sees usage analytics for their assistant. (source: brief S52.37)
- Collect the minimum data required; validate at trust boundaries. (source: doc: AGENTS.md section 6)
- Rate limits and quotas are configuration, and usage is metered through one subscription system. (source: doc: AGENTS.md sections 7 and 8; product context)

**Acceptance criteria**

1. A teammate sees the owner's name on a shared agent and never the owner's email unless the profile has no display name (current behaviour).
2. The owner's own view shows no 'Shared by' label.
3. Usage tiles show counts only for the last 30 days and only to the owner; a teammate calling the usage route is refused.
4. Activity lists only the caller's chats, never another person's.
5. Deleting a chat removes it from the activity list (query filters deleted_at).
6. A publisher marked verified shows a visible mark (not implemented).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Showing the owner's email as a fallback name leaks an email address to teammates; it is in the same workspace so it may be intended, but it is a privacy choice to confirm [inferred from service:277].
- Verified publisher only makes sense if agents can be seen beyond one workspace; today they cannot, so the requirement waits on public listing [inferred from F052-10].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show monthly credit use next to the cap so owners see how close they are.
- [proposed] Let owners see usage per version.
- [proposed] Do not fall back to the email for the creator name; use a neutral label unless the person set a display name.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | readOwnerNames | `apps/web/lib/services/custom-agent-service.ts` | Looks up creator display names from profiles (lines 264-279). |
| service | toManagedCloudAgent | `apps/web/lib/services/custom-agent-service.ts` | Adds ownerName and ownerUserId for non-owners (lines 151-178). |
| service | presentAgent / presentAgents | `apps/web/lib/agents/agent-route.ts` | Fetches owner names for responses (lines 54-76). |
| service | readAgentUsage | `apps/web/lib/services/custom-agent-service.ts` | 30-day counts for the owner (lines 620-638). |
| service | readAgentActivity | `apps/web/lib/services/custom-agent-service.ts` | The viewer's own chats and routines with the agent (lines 640-688). |
| service | readAgentMonthSpendMicrousd / countAgentTurnsToday | `apps/web/lib/services/custom-agent-service.ts` | Spend and turn counts used by caps (lines 690-719). |
| endpoint | api:GET /api/custom-agents/[id]/usage | `apps/web/app/api/custom-agents/[id]/usage/route.ts` | Usage route (line 24 exports GET). |
| endpoint | api:GET /api/custom-agents/[id]/activity | `apps/web/app/api/custom-agents/[id]/activity/route.ts` | Activity route. |
| schema | AgentUsageResponseSchema / AgentActivityResponseSchema / ManagedCloudAgentSchema | `packages/contracts/cloud-contracts/src/agents.ts` | Wire shapes for usage (line 199), activity and owner fields (lines 124-143). |
| table | table:profiles | `apps/web/db/neon/0370_user_agents.sql` | Source of the creator name (referenced at line 46; read in service:269-275). |
| table | table:web_conversations | `apps/web/db/neon/0370_user_agents.sql` | Gains agent_id; counted for usage (lines 136-141). |
| table | table:web_messages | `apps/web/lib/services/custom-agent-service.ts` | User messages counted as turns (lines 701-719). |
| table | table:scheduled_tasks | `apps/web/db/neon/0370_user_agents.sql` | Gains agent_id; shown as routines (lines 143-148). |
| config | app_user_agent_usage / app_user_agent_month_spend | `apps/web/db/neon/0370_user_agents.sql` | Security-definer counting functions (lines 336-361; spend in migration 0374). |
| component | AgentActivityPanel | `apps/web/features/agents/components/AgentManagePanel.tsx` | Web usage tiles and activity lists (lines 39-157). |
| component | AgentDeploymentsPanel | `apps/web/features/agents/components/AgentDeploymentsPanel.tsx` | Web Deployments tab for the agent's schedules. |
| service | agentStateLabel | `apps/web/features/agents/lib/agent-display.ts` | 'Shared by <name>' label (line 22). |
| component | AgentActivitySection (Mobile) | `apps/mobile/src/features/agents/components/AgentManageSections.tsx` | Mobile activity and usage (lines 405-480). |
| command | format_agent_history | `apps/cli/src/agents.rs` | CLI device-local agent run history (lines 1349-1389). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| List or get call: the server reads agent rows, then reads creator names for rows owned by others from profiles using the service connection. | our servers | agent-route.ts:54-76; service:264-279 |
| The Sessions tab calls usage (owner only) and activity in parallel. | our servers | AgentManagePanel.tsx:45-62 |
| Usage runs a security-definer SQL function that counts distinct chats, distinct people and user messages since 30 days ago for the owner's agent. | our servers | service:620-638; 0370_user_agents.sql:336-361 |
| Activity runs two queries limited to the caller's chats and routines for the agent in the current workspace. | our servers | service:640-673 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Creator display name or email | table:profiles | Same database | Follows the profile; agents cascade-delete with the profile (0370_user_agents.sql:46) |
| Usage counts | Computed on read from conversations and messages; nothing stored | Not applicable | Depends on chat retention |
| CLI run history | Local session store on the device | No sync found | unknown |

**Models and providers.** No model is involved in showing identity or counts. Spend used by caps is a cost figure in micro-dollars that includes whatever provider the turns used (service:690-699).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in on Web or Mobile. |
| Permissions | Usage owner-only (requireOwnedAgent in readAgentUsage, service:626, and the database function). Activity needs read access to the agent and returns only the caller's rows (service:646-657). Creator names are visible to anyone who can read the agent. |
| Subscription | No plan gate found. |
| Limits and metering | Window 30 days; activity lists capped at 50 (service:29); rate limit class 'chat-conversation' (agent-route.ts:35). Counts feed per-agent turn and credit caps. |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not available in Local mode on Mobile (Cloud gate). CLI history is on the device and does not need a subscription [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading activity...' with a spinner. | AgentManagePanel.tsx:73-77 |
| Error | Red 'Activity could not be loaded.' or server message; no retry button in this panel. | AgentManagePanel.tsx:56-58, 69-72 |
| Empty | Tiles show 0; 'None yet.' and 'No routines yet.' with a link to give it a schedule. | AgentManagePanel.tsx:102-134 |
| Recipient opens Sessions | Usage hidden (only activity shown). | AgentManagePanel.tsx:48, 80 |
| Owner name missing | 'A teammate' or email. | service:277 |
| Deleted chats | Excluded from counts and activity. | 0370_user_agents.sql:356; service:652-654 |
| Accessibility | Definition list for tiles; section heading labelled. | AgentManagePanel.tsx:65-67, 81 |
| Offline or timeout | not handled in the code beyond the error text. | AgentManagePanel.tsx:56-58 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/custom-agents/[id]/usage/route.test.ts`: Answers with service data, refusal when limited, 404 for a bad id.
- `apps/web/app/api/custom-agents/[id]/activity/route.test.ts`: Activity route (titles not opened).
- `apps/web/lib/agents/__tests__/custom-agent-service.test.ts`: A teammate sees the published copy with its owner.
- `apps/web/db/neon/user-agents-migration.test.ts`: Usage exposed as counts only to the owner.
- `apps/web/features/agents/__tests__/AgentsPage.test.tsx`: List with own and shared agents.
- `apps/mobile/src/features/agents/__tests__/AgentsScreens.test.tsx`: Publishing and showing usage for an owned agent.

**Test scenarios**

- **Creator name shown**
  1. A shares an agent; B opens Agents.
  - Expected: B sees 'Shared by <A's name>'.
- **Usage counts**
  1. A and B each send two messages to the agent.
  2. A opens Sessions.
  - Expected: People 2, Messages 4, Chats at least 2 (within 30 days).
- **Usage is owner-only**
  1. B calls GET /api/custom-agents/<id>/usage with B's session.
  - Expected: Refused (only the owner).
- **Only my chats listed**
  1. A and B chat; B opens Sessions.
  - Expected: B sees only B's chats.
- **No verified mark**
  1. Search the UI for a verified badge on a shared agent.
  - Expected: None exists.

**Where to look when it fails**

- Functions app_user_agent_usage and app_user_agent_month_spend.
- Table profiles display_name and email.
- Error text 'Activity could not be loaded.'

**Hands-on test plans**

- none: not built on any app
- No hands-on plan yet for Web, Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No verified publisher status.** Affects: All apps. Evidence: No field in agents.ts or 0370 migration. Work needed: Define who verifies, store it, show it; depends on public listing.
- **No creator profile beyond a name.** Affects: Teammates. Evidence: agent-display.ts:22. Work needed: Avatar and link if wanted.
- **Usage is three totals only; no trend, per-version or cost view; spend not shown.** Affects: Owners. Evidence: AgentManagePanel.tsx:80-97. Work needed: Charts and spend line.
- **Email used as fallback creator name.** Affects: Privacy of builders. Evidence: service:277. Work needed: Confirm policy or remove fallback.
- **Brief marks all missing.** Affects: Planning. Evidence: S52.35-S52.37. Work needed: Update brief.
- Not built on: Desktop, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- mode:cloud
- table:profiles
- table:user_agents
- table:web_conversations
- table:web_messages
- table:scheduled_tasks
- api:GET /api/custom-agents/[id]/usage
- api:GET /api/custom-agents/[id]/activity
- SYS-observability-and-operations
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- F052-10

## Unknown

- Whether usage counts match billing figures.
- Retention of web_conversations and web_messages affecting counts.
- How the owner's display name is edited by the person.
- Where verification would be sourced from.
