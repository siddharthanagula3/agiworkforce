---
id: "F061-05"
type: "feature"
title: "Agent memory, workspace, routines and responsibilities"
aliases: ["Agent memory", "Agent routines", "Agent deployments", "Agent knowledge files", "Agent workspace", "Agent responsibilities", "Activity", "S61.06", "S61.07", "S61.10", "S61.12"]
area: "61 Persistent agents and agent rosters"
available_on: ["web", "mobile"]
implementation: {web: "partial", desktop: "missing", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S61.06", "S61.07", "S61.10", "S61.12"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "mode:cloud", "table:user_agent_files", "table:scheduled_tasks", "file:apps/web/lib/services/scheduled-agent-executor.ts", "file:apps/web/lib/services/custom-agent-service.ts", "api:GET /api/custom-agents/{id}/activity", "api:POST /api/custom-agents/{id}/files", "SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-agents-tools-and-automation", "SYS-sync-and-continuity", "F061-02", "F061-03"]
basis: "code inspection"
second_reader: "5 of 10 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F061-05 Agent memory, workspace, routines and responsibilities

Per-agent memory, routines, a private workspace and a responsibility list. The brief calls all four missing. The code has two partial pieces on web and mobile Cloud: routines that run as an agent (Deployments), and up to 20 reference files per agent. No per-agent memory, no private computer and no responsibility list were found.

Area: [61. Persistent agents and agent rosters](README.md). Requirement items: [S61.06](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6106), [S61.07](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6107), [S61.10](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6110), [S61.12](../../10-requirements/capabilities/061-persistent-agents-and-agent-rosters.md#s6112).

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

**What it does.** Would give each agent its own memory, scheduled routines, a workspace for its files and a list of what it owns. Today Cloud agents can own scheduled routines and carry reference files; nothing else of the four is built.

**Why it exists.** S61.06, S61.07, S61.10 and S61.12 describe agents that persist over time like a team member (doc: knowledge-base/data/area-briefs/061-persistent-agents-and-agent-rosters.md).

**Who uses it.** Web and mobile Cloud users who want an agent that runs on a schedule or reads fixed files; future users of persistent agents.

**Problems it solves**

- Running the same agent on a schedule without opening a chat.
- Giving an agent reference material once instead of attaching it each chat.

**Use cases**

- Add a weekly routine that runs a research agent every Monday.
- Upload a style guide as Knowledge so a writing agent always has it.
- See the agent's recent chats and routines under Activity.

## 2. User experience

**Where to find it**

- Web editor: Knowledge panel, Deployments panel (button 'New deployment'), Activity data (apps/web/features/agents/components/AgentKnowledgePanel.tsx:99-182; AgentDeploymentsPanel.tsx:221-371).
- Mobile editor: Knowledge section with 'Add file', Activity section with 'Add a routine' (apps/mobile/src/features/agents/components/AgentManageSections.tsx:136-171, 411-480).
- CLI: none. Chrome, VS Code, Tauri desktop: none found.

**Before you start**

- Signed in; Cloud mode on mobile.
- Only the owner uploads or removes files, and adding is refused only for a retired agent; a paused agent still accepts files (custom-agent-service.ts:333-337, 767-775).

**Screens and controls**

- Knowledge: description 'Files the agent can read in every chat.', button 'Add file', Remove per file (AgentManageSections.tsx:136-170; AgentKnowledgePanel.tsx:170).
- Deployments: list of routines with Pause or Resume, a run activity bar and 'New deployment' linking to /chat/schedules?agent=<id> (AgentDeploymentsPanel.tsx:30-33, 146, 315-320).
- Mobile Activity: 'Add a routine' (AgentManageSections.tsx:471).

**Journey**

1. Add a file: pick a text file, it is stored with its content and hash.
2. Create a routine for the agent from the schedules page; on each run the server loads the agent and runs the task as that agent.
3. Open Activity to see up to 50 recent conversations and 50 routines linked to the agent.

**What the person sees and gets**

- File limit message: 'An agent holds up to 20 files.' (custom-agent-service.ts:775-777).
- Duplicate file name: 'The agent already has a file named <name>.' (custom-agent-service.ts:793-796).
- Deployments error: 'Deployments could not be loaded.' (AgentDeploymentsPanel.tsx:249-262).
- Routine run denied by the managed-compute policy: 'Scheduled execution skipped: <reason>' (apps/web/lib/services/scheduled-agent-executor.ts:~889-912).
- Agent limit reached: 'reached its limit of N messages a day' or 'used the N credits its owner allows each month' (apps/web/lib/agents/agent-turn-config.ts:78-95).

**Settings**

- File limits: 20 files, 512,000 bytes each (packages/contracts/cloud-contracts/src/agents.ts:25-26). The 20-file check is at custom-agent-service.ts:773-777; the byte cap enforcement site was not located (the files route was not checked).
- Context cap: reference files are cut to 120,000 characters in total per turn (apps/web/lib/agents/agent-turn-config.ts:15, 38-52).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Cloud agent knowledge files: add, list, remove; stored with content and hash; injected into every turn as agent_file blocks treated as material, not instructions (custom-agent-service.ts:755-826; agent-turn-config.ts:111-137).
- Cloud routines as an agent: scheduled_tasks has an agent_id column; the schedule service validates the agent; the scheduled executor loads the agent turn config and applies its model, web, code and connector settings (apps/web/db/neon/0370_user_agents.sql:143-148; apps/web/lib/services/schedule-service.ts:922-924, 1006; apps/web/lib/services/scheduled-agent-executor.ts:918-958).
- A routine as an agent also applies the agent's web search, code execution, connector selection and allowed or blocked web domains, not only its model (apps/web/lib/services/scheduled-agent-executor.ts:~938-960).
- Routine runs are gated by evaluateManagedComputeAccess for 'schedules' with the user's entitlement plan, and are skipped with 'Scheduled execution skipped: ...' when denied (apps/web/lib/services/scheduled-agent-executor.ts:~889-912).
- Per-agent dailyTurnLimit and monthlyCreditLimit (owner-set) are enforced on routine runs and on chat turns, with the messages 'reached its limit of N messages a day' and 'used the N credits its owner allows each month' (apps/web/lib/agents/agent-turn-config.ts:78-95).
- Cloud activity: conversations and routines of an agent for the viewer (custom-agent-service.ts:640-688).
- Pausing or retiring an agent stops its routines (AgentManagePanel.tsx:208-216 dialog text; scheduled-agent-executor.ts:921 throws ScheduledAgentUnavailableError) [inferred for pause].

**Incomplete**

- Knowledge files are text only (content stored as text, hash of content) and are not a workspace or computer (custom-agent-service.ts:767-800).
- Activity lists chats and routines; it is not a list of responsibilities the agent owns (custom-agent-service.ts:640-688).
- Routine runs count against the agent's daily message limit and monthly credit limit, and are refused when either is reached; only the check made when a routine is created or edited skips the count (schedule-service.ts:922-924 passes countTurns:false; scheduled-agent-executor.ts:~899-901 uses the default countTurns:true; agent-turn-config.ts:58-95).

**Present but disconnected or switched off**

- nothing found

**Not available**

- Per-agent memory: none found. A grep of db/neon SQL for agent_id near memory returned no row; the chat memory path was not read, so unknown.
- Persistent private workspace or computer per agent (S61.10): none found.
- Responsibility list per agent (S61.12): none found.
- CLI agents have no memory, routines, workspace or responsibilities; the CLI has cron tools but they are not tied to an agent (apps/cli/src/features/exec/tools/mod.rs:1204-1218).

## 4. Required behaviour

**Established requirements**

- Each agent keeps its own memory separate from other agents. (source: S61.06)
- An agent can own routines that run as that agent. (source: S61.07)
- Each agent has its own persistent workspace or computer where its files live. (source: S61.10)
- Each agent shows the list of responsibilities it currently owns. (source: S61.12)
- Memory, projects and context are governed by their own system page. (source: SYS-memory-projects-and-context)

**Acceptance criteria**

1. A routine created with agent=<id> runs with that agent's instructions, model and tool toggles.
2. A paused or retired agent's routine run fails with the unavailable message instead of running.
3. Adding a 21st file is refused.
4. Adding a file with an existing name is refused.
5. Reference file text appears in the model context but is labelled as material, not instructions.
6. Total reference text per turn never exceeds 120,000 characters.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Per-agent memory must respect Local, own-key and Cloud boundaries (AGENTS.md section 6) [inferred].
- The activity panel is the closest thing to a responsibility list and could be extended [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a memory scope keyed by agent id.
- [proposed] Show owned routines, open runs and open tasks as responsibilities.
- [proposed] Let an agent have a sandbox folder in Cloud with file read and write.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | agent files | `apps/web/lib/services/custom-agent-service.ts` | listAgentFiles, addAgentFile, deleteAgentFile, readAgentFileTexts (755-826). |
| table | user_agent_files | `apps/web/db/neon/0370_user_agents.sql` | File name, type, content, hash, size (line 117). |
| endpoint | /api/custom-agents/{id}/files | `apps/web/app/api/custom-agents/[id]/files/route.ts` | List and upload files; delete at files/[fileId]. |
| endpoint | GET /api/custom-agents/{id}/activity | `apps/web/app/api/custom-agents/[id]/activity/route.ts` | Conversations and routines for an agent. |
| table | scheduled_tasks.agent_id | `apps/web/db/neon/0370_user_agents.sql` | Routine to agent link (lines 143-148). |
| service | schedule-service | `apps/web/lib/services/schedule-service.ts` | Validates agent for a schedule (922-924, 1006). |
| service | scheduled-agent-executor | `apps/web/lib/services/scheduled-agent-executor.ts` | Runs a routine as the agent (918-958). |
| component | AgentKnowledgePanel | `apps/web/features/agents/components/AgentKnowledgePanel.tsx` | Web file list and upload. |
| component | AgentDeploymentsPanel | `apps/web/features/agents/components/AgentDeploymentsPanel.tsx` | Web routines list with pause and resume. |
| component | AgentManageSections (mobile) | `apps/mobile/src/features/agents/components/AgentManageSections.tsx` | Mobile Knowledge and Activity. |
| service | mobile files and activity calls | `apps/mobile/src/features/agents/service.ts` | uploadAgentFile (138), getAgentActivity (126). |
| service | agentSystemPrompt | `apps/web/lib/agents/agent-turn-config.ts` | Injects files as agent_file blocks. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Upload: the owner's file text is stored with a SHA-256 hash and size after the 20-file check. | our servers | apps/web/lib/services/custom-agent-service.ts:767-798 |
| Each chat turn as the agent loads the files in name order and cuts them at 120,000 characters. | our servers | apps/web/lib/agents/agent-turn-config.ts:38-52, 104-108 |
| A routine fires; the executor loads the agent, refuses when paused or retired, uses the agent's model and tool settings. | our servers | apps/web/lib/services/scheduled-agent-executor.ts:918-958 |
| Activity reads conversations and scheduled tasks linked to the agent for this viewer. | our servers | apps/web/lib/services/custom-agent-service.ts:640-688 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Agent reference files | user_agent_files (content stored as text in the database) | Yes via API | Removed by the owner or when the agent is deleted |
| Routine definitions | scheduled_tasks with agent_id | Yes | agent_id set to null if the agent row is deleted (0370_user_agents.sql:143-144) |

**Models and providers.** A routine uses the agent's model only when the task's own model is unset or Auto; an explicit task model overrides it, and when the agent has no model the task's model is used (agent-turn-config.ts:175-182; scheduled-agent-executor.ts:~903). Provider is chosen by the shared routing, not by this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Cloud account. |
| Permissions | Owner only for file changes; viewers see activity filtered to their own conversations (custom-agent-service.ts:650-660). |
| Subscription | Files and activity have no plan gate. Routine runs as an agent are gated by the managed-compute access policy for 'schedules', and the plan tier is passed into schedule validation and routing (scheduled-agent-executor.ts:~889-912). |
| Limits and metering | 20 files, 512,000 bytes each, 120,000 characters per turn, activity limit 50 each (agents.ts:25-26; agent-turn-config.ts:15; custom-agent-service.ts:29). Owner-set per-agent dailyTurnLimit and monthlyCreditLimit are enforced on routine runs and on chat turns, with the messages 'reached its limit of N messages a day' and 'used the N credits its owner allows each month' (apps/web/lib/agents/agent-turn-config.ts:78-95). |
| Feature flags | none found in the code. |
| Model compatibility | Same as F061-03. |
| Provider restrictions | none found in the code. |
| Local mode | Not available in Local mode: files, routines and activity are Cloud server features. CLI has none of them. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Routine for an unavailable agent | ScheduledAgentUnavailableError with the agent's reason. | apps/web/lib/services/scheduled-agent-executor.ts:918-921 |
| Some deployments fail to load | Panel throws 'Deployments could not be loaded.' when routines exist but none load. | apps/web/features/agents/components/AgentDeploymentsPanel.tsx:249-262 |
| File too many or duplicate | Validation or conflict error with plain message. | apps/web/lib/services/custom-agent-service.ts:775-797 |
| Files over the context cap | Later files are cut or dropped silently. | apps/web/lib/agents/agent-turn-config.ts:38-52 |
| Retired agent | Files cannot be added (assertEditable rejects only status 'retired', so a paused agent still accepts files); routines stop. | custom-agent-service.ts:333-337, 767-770; AgentManagePanel.tsx:208-216 |
| Offline | not handled in the code beyond error messages. | AgentKnowledgePanel.tsx:40-50 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/custom-agents/[id]/files/route.test.ts`: Files route (contents not opened).
- `apps/web/app/api/custom-agents/[id]/activity/route.test.ts`: Activity route (contents not opened).
- `apps/web/lib/services/__tests__/scheduled-agent-routine.test.ts`: Routine as an agent (contents not opened).
- `apps/web/features/agents/__tests__/AgentKnowledgePanel.test.tsx`: Knowledge panel (contents not opened).
- `apps/web/features/agents/__tests__/AgentDeploymentsPanel.test.tsx`: Deployments panel (contents not opened).

**Test scenarios**

- **File reaches the model**
  1. Upload a small text file named style.md to an agent.
  2. Publish and Chat.
  3. Ask what the file says.
  - Expected: The agent answers from the file and does not follow commands inside it.
- **File limit**
  1. Upload 20 files.
  2. Try a 21st.
  - Expected: Refused with 'An agent holds up to 20 files.'
- **Routine as agent**
  1. From the agent's Deployments panel press New deployment.
  2. Create a routine that runs now.
  3. Open the result.
  - Expected: The run follows the agent's instructions and tool toggles.
- **Pause stops routines**
  1. Pause the agent.
  2. Trigger the routine.
  - Expected: The run reports that the agent is paused and does not execute.

**Where to look when it fails**

- Error ScheduledAgentUnavailableError in scheduled executor logs.
- Tables user_agent_files and scheduled_tasks (agent_id).
- Activity endpoint output.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/061-persistent-agents-and-agent-rosters.md](../../70-qa/test-plans/mobile/061-persistent-agents-and-agent-rosters.md)
- No hands-on plan yet for Web: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No per-agent memory.** Affects: All apps.. Evidence: S61.06; no agent-scoped memory table or code found. Work needed: Design memory keyed by agent and boundary.
- **No private workspace or computer per agent; only text reference files.** Affects: All apps.. Evidence: custom-agent-service.ts:767-800 (text content column). Work needed: Define sandbox storage and file tools.
- **No responsibility list.** Affects: Web and mobile.. Evidence: S61.12; activity only lists chats and routines. Work needed: Define what an agent owns and show it.
- **No CLI routines tied to an agent.** Affects: CLI users.. Evidence: apps/cli/src/features/exec/tools/mod.rs cron tools carry no agent field. Work needed: Bind cron entries to an agent name.
- **Brief says routines and files are missing; web and mobile have them.** Affects: Documentation.. Evidence: apps/web/lib/services/scheduled-agent-executor.ts:918. Work needed: Update brief.
- Not built on: Desktop, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- mode:cloud
- table:user_agent_files
- table:scheduled_tasks
- file:apps/web/lib/services/scheduled-agent-executor.ts
- file:apps/web/lib/services/custom-agent-service.ts
- api:GET /api/custom-agents/{id}/activity
- api:POST /api/custom-agents/{id}/files
- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-agents-tools-and-automation
- SYS-sync-and-continuity
- F061-02
- F061-03

## Unknown

- Whether the chat memory system reads or writes anything keyed by agent; the memory pipeline was not read.
- Whether scheduled routines have plan limits in schedule-service.ts beyond what was opened.
- How the file upload route validates file type; only the service was read.
- Whether pausing an agent explicitly cancels routines or only fails their next run.
- Where the 512,000-byte file cap is enforced; the files route was not checked.

## Second reader's check

A second reader checked 10 statements of this page against the code: 5 correct, 5 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Wrong (section 3 Incomplete):** "Scheduled routines skip the daily message count (schedule-service.ts:922-924) [inferred]." The code shows: schedule-service.ts:922-924 is assertScheduleAgent, which passes countTurns:false only when a routine is created or edited. At run time scheduled-agent-executor.ts:~899-901 calls loadAgentTurnConfig(scope.db, scope.userId, task.agentId) with the default countTurns:true. That default enforces dailyTurnLimit (agent-turn-config.ts:78-86) and monthlyCreditLimit (agent-turn-config.ts:87-95), and the executor throws ScheduledAgentUnavailableError when either is hit. (apps/web/lib/agents/agent-turn-config.ts:58-95; apps/web/lib/services/scheduled-agent-executor.ts:899-901; apps/web/lib/services/schedule-service.ts:922-924). **Corrected:** Routine runs count against the agent's daily message limit and monthly credit limit, and are refused when either is reached. Only the check made when a routine is created or edited skips the count.
- **Partly wrong (section 7 Access and usage rules):** "Subscription: No plan check found in the files or activity routes. Scheduled routines may have their own limits in the schedule service (not opened)." The code shows: The files and activity routes show no plan check, so that part holds. The routine run path does check the plan. The executor resolves the entitlement bundle and calls evaluateManagedComputeAccess(... 'schedules'). When access is denied the run is skipped and returns 'Scheduled execution skipped: <reason>'. (apps/web/lib/services/scheduled-agent-executor.ts:~889-912). **Corrected:** Files and activity have no plan gate. Routine runs as an agent are gated by the managed-compute access policy for 'schedules', and the plan tier is passed into schedule validation and routing.
- **Partly wrong (section 6 Models and providers):** "A routine uses the agent's model when set, else the task's model (scheduled-agent-executor.ts:923)." The code shows: agentModelFor returns the agent's model only when the task model is empty or an Auto id. If the task names a specific model, that model wins. If the agent has no model, the task's model is used. (apps/web/lib/agents/agent-turn-config.ts:175-182; apps/web/lib/services/scheduled-agent-executor.ts:~903). **Corrected:** A routine uses the agent's model only when the task's own model is unset or Auto. An explicit task model overrides it.
- **Partly wrong (section 2 Before you start / 8 States):** "Only the owner uploads or removes files and only an active agent accepts new files; Retired agent: files cannot be added." The code shows: addAgentFile calls requireOwnedAgent, then assertEditable. assertEditable rejects only status 'retired'. A paused agent still accepts files. Owner-only is correct for add and delete. (apps/web/lib/services/custom-agent-service.ts:333-337, 767-769). **Corrected:** Only the owner can add or remove files. Adding is refused only for a retired agent, and a paused agent still accepts files.
- **Partly wrong (section 2 Settings / 7 Limits):** "File limits: 20 files, 512,000 bytes each (packages/contracts/cloud-contracts/src/agents.ts:22-23)." The code shows: The values are right: AGENT_FILES_MAX = 20 and AGENT_FILE_MAX_BYTES = 512_000. They sit at lines 25-26, and lines 22-23 hold other constants (AGENT_DAILY_TURN_LIMIT_MAX, AGENT_MONTHLY_CREDIT_LIMIT_MAX). Enforcement of the 20-file limit is at custom-agent-service.ts:773-777. I did not find where the byte cap is enforced. (packages/contracts/cloud-contracts/src/agents.ts:25-26). **Corrected:** Cite agents.ts:25-26. The byte cap enforcement site was not located (the files route was not checked).

**Facts the page missed**

- Per-agent dailyTurnLimit and monthlyCreditLimit (owner-set) are enforced on routine runs and on chat turns, with the messages 'reached its limit of N messages a day' and 'used the N credits its owner allows each month' (apps/web/lib/agents/agent-turn-config.ts:78-95). The page lists neither in Limits and metering.
- Routine runs are gated by evaluateManagedComputeAccess for 'schedules' with the user's entitlement plan, and are skipped with 'Scheduled execution skipped: ...' when denied (apps/web/lib/services/scheduled-agent-executor.ts:~889-912).
- A routine as an agent also applies the agent's web search, code execution, connector selection and allowed or blocked web domains, not only its model (apps/web/lib/services/scheduled-agent-executor.ts:~938-960).
