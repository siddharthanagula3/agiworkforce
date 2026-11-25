---
id: "F060-01"
type: "feature"
title: "Start a task from a goal"
aliases: ["Start a task from a goal", "AGI Work run", "Work mode (Chat | Work toggle)", "agiwork work_mode", "agi_work_goal", "New task (mobile)", "Start work", "Work-task composer", "Objective, constraints, deliverable"]
area: "60 Agentic work product"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S60.01", "S60.03", "S60.04"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-execution-boundaries", "SYS-authentication-and-identity", "SYS-api-and-contracts", "mode:cloud", "plan:pro", "table:cloud_agent_runs", "table:work_plans", "api:POST /api/llm/v1/chat/completions", "F060-04", "F060-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F060-01 Start a task from a goal

Lets a signed-in person on a paid plan describe a goal, optional constraints and a wanted deliverable, then start an AGI Work run (a tool-using Cloud agent run) instead of a plain chat turn. Found in the web and desktop composer Work mode, the mobile New task sheet and the Chrome side panel toggle. CLI and VS Code do not start it.

Area: [60. Agentic work product](README.md). Requirement items: [S60.01](../../10-requirements/capabilities/060-agentic-work-product.md#s6001), [S60.03](../../10-requirements/capabilities/060-agentic-work-product.md#s6003), [S60.04](../../10-requirements/capabilities/060-agentic-work-product.md#s6004).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Turns a typed goal into a structured request (work_mode agiwork plus agi_work_goal with goal, constraints, deliverable, excluded tools). The server then plans the work, asks for plan review when requested, and runs tools (web search, fetch, code execution, file creation) as a durable Cloud run that shows up in the Tasks list. [inferred from the code path below]

**Why it exists.** A plain chat turn answers once. Multi-step work (research a topic, build a report or file) needs a stated objective, scope and expected output so the agent can plan and the person can check the result. (doc: docs/product/experience-contract.md:635 lists AGI Work run as composer-mode dispatch on web, desktop and mobile.)

**Who uses it.** Paying users (Pro plan and above) on web, desktop (which shows the hosted web app) and mobile; Chrome extension users on a qualifying plan.

**Problems it solves**

- The person can state the outcome they want and the boundaries once, instead of steering through many chat turns.
- The run is a recorded, resumable task that survives closing the tab (AGI Work is the only mode that expects to outlive the tab, apps/web/lib/hooks/useChatStream.ts:4730-4738).
- The wanted deliverable and constraints are passed to the planning step and the agent, so the plan targets them.

**Use cases**

- Research three competitors and write a one-page comparison (the mobile sheet placeholder text, apps/mobile/src/features/tasks/components/StartWorkSheet.tsx:133).
- Build a spreadsheet or report file from public sources with code execution switched off.
- Re-run a finished task: mobile prefills the sheet with the original goal (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:596-616).
- Start work from a project so the task has that project's sources.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron shows the hosted web app, doc: AGENTS.md section 5): composer segmented control 'Chat | Work', shown only when the plan allows it and a project picker exists (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6171-6208). Label 'Work', tooltip 'Work: multi-step tasks with tools, files, and reviewable deliverables' (packages/ui/i18n/locales/en/chat.json:193-195). The Tasks page shows a 'Start Work' button when the list is empty (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:603-612).
- Web and Desktop scope fields: plus menu row 'Add scope (optional)' opens inline fields 'Constraints' and 'Deliverable' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1564-1572; ChatComposerNew.tsx:7251-7335; packages/ui/i18n/locales/en/v3.json agiWork.compose).
- Mobile: Cloud tasks screen, floating 'New task' button (only when the account has the canUseAgiWork capability), which opens a sheet titled 'New task' (apps/mobile/src/features/tasks/CloudTasksScreen.tsx:667, 817-825; StartWorkSheet.tsx:108-110). Mobile chat also has its own Work mode switch (apps/mobile/stores/chat/chatExecutionStore.ts:3289-3290; test apps/mobile/__tests__/WorkModeSwitch.test.tsx).
- Chrome: model dropdown toggle row 'AGI Work' with the description 'Plans and runs multi-step tasks with tools and files...' (apps/extension/src/side_panel.ts:11163-11175; apps/extension/_locales/en/messages.json spAgiWork).
- CLI and VS Code: not offered. The docs mark AGI Work run N/A for both (doc: docs/product/experience-contract.md:635), and no work_mode or agi_work_goal use was found in apps/extension-vscode/src or in the CLI terminal UI.

**Before you start**

- Signed in with a managed (Cloud) account on a plan in the agi_work list: pro, max, max_15x, team, team_premium, enterprise (packages/contracts/types/src/billing-catalog.ts:341,354).
- Not a free trial; web hides Work when billing policy is not ready or the account is a free trial (ChatComposerNew.tsx:1062-1066).
- The Work capability kill switch is on (apps/web/lib/feature-flags/kill-switches.ts:31; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5217-5219).

**Screens and controls**

- Web/Desktop: Chat | Work toggle; message box (the message is the goal); 'Add scope (optional)' row; 'Constraints' and 'Deliverable' text fields (each cut at 1000 characters in the field); 'Tools this task may use' checkboxes (see F060-02); approval-mode control shown in Work mode (ChatComposerNew.tsx:6211-6213).
- Mobile: sheet fields 'What should it accomplish?' (label 'Task objective'), 'Constraints (optional)', 'Deliverable (optional)', 'Project (optional)' chips, button 'Start task' (shows 'Starting…' while sending), close button 'Close new task'; footer note 'The task runs in AGI Cloud and pauses here when it needs your approval.' (StartWorkSheet.tsx:117-239).
- Chrome: toggle in the model dropdown; the message is the goal; no constraints or deliverable fields (apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1591-1598).

**Journey**

1. Open the surface and switch to Work (web/desktop/Chrome) or tap 'New task' (mobile).
2. Type the goal. Optionally add constraints and a deliverable (web/desktop, mobile).
3. Send. The client builds the goal object (web: apps/web/features/chat/utils/agiwork-plan.ts:21-39; mobile: apps/mobile/src/features/tasks/agiWorkGoal.ts:7-20) and posts work_mode agiwork with it.
4. Web, desktop and Chrome ask for plan review on every Work send (agi_work_plan_approval true, useChatStream.ts:4669-4670; freeTrialClient.ts:1594-1598); the run stops at the plan and waits (see F060-04).
5. Mobile: the sheet creates a conversation titled with the goal cut to 60 characters, sends the goal, waits for the server to accept, then opens the run detail (startWork.ts:44-81; CloudTasksScreen.tsx:570-590). The sheet path does not send the plan-review flag (see gaps).
6. The run appears in the Tasks list with its title, state, model and age.

**What the person sees and gets**

- Web progress card text 'Starting AGI Work' while the turn begins (useChatStream.ts:4344-4346).
- Mobile start errors: 'Describe what this task should accomplish' for an empty goal, otherwise 'This task could not be started' (startWork.ts:12-19); the sheet stays open and shows the message.
- A refused request returns a JSON error: 403 'agi_work_plan_required' with message '<product work name> requires <Pro label> or higher.' (request-processor.ts:1486-1503, 3538-3556) or 403 'free_trial_feature_unavailable' for free accounts (request-processor.ts:4405-4419).
- Goal card in the task detail shows 'Goal' with the goal text and the constraints/deliverable lines (packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:550-570).

**Settings**

- Default mode for new chats: settings store field defaultWorkMode (ChatComposerNew.tsx:1233-1237).
- Tool approval policy (account default) is reachable from the Work approval-mode control (ComposerPlusMenu.tsx:1904-1960).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web composer builds and sends work_mode, agi_work_goal and (every Work send) agi_work_plan_approval (apps/web/lib/hooks/useChatStream.ts:4663-4671). Desktop is the same code through the Electron shell (doc: AGENTS.md section 5).
- Server validates the goal: goal 1 to 2000 characters, constraints and deliverable up to 1000, drops empty optional fields, de-duplicates excluded tools (apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:27-46; packages/contracts/cloud-contracts/src/cloud-agent-runs.ts:83).
- Server forces streaming and adds a system note that tools must be called (request-processor.ts:1463-1479, called at 4423).
- Server refuses non-entitled accounts with 403 (request-processor.ts:3538-3556, 4405-4419) and checks the Work kill switch (5217-5219).
- The goal is recorded as a journal event with progress id agiwork:goal (agiwork-plan.ts:258-274, emitted at tool-loop.ts:6183-6185) and as the objective, constraints and deliverable of a durable work_plans row (apps/web/lib/workflows/steps/work-plan-steps.ts:18-40). The run row itself has no goal column (apps/web/lib/services/cloud-agent-run-service.ts:755-790).
- Mobile sheet: validates goal, creates the conversation, sends with the cloud model, reports a failed send (apps/mobile/src/features/tasks/startWork.ts:44-81; test apps/mobile/__tests__/start-cloud-work-run.test.ts).
- Chrome: toggle, goal-only send and plan review exist (apps/extension/src/side_panel.ts:11163-11175, 9140-9150; freeTrialClient.ts:1591-1598). The brief lists Chrome as missing for start, which the code contradicts.

**Incomplete**

- Mobile sheet sends only goal, constraints and deliverable; no excluded tools and no plan-review flag (apps/mobile/src/features/tasks/agiWorkGoal.ts:1-20; apps/mobile/stores/chat/chatExecutionStore.ts:3291-3295, 3451). The sheet text fields have no maxLength, so an over-long goal is refused only by the server (StartWorkSheet.tsx:127-181; agiwork-plan.test.ts:31).
- Chrome sends the goal only: no constraints, deliverable or excluded tools (freeTrialClient.ts:1594).
- The run title on web is the conversation title; how web derives it for a Work run was not traced. Mobile uses the goal cut to 60 characters (startWork.ts:33-36). The brief's 'readable title' rule is only confirmed on mobile.
- CLI: the app-server host can send work_mode with goal, constraints, deliverable and excluded tools (apps/cli/src/app_server/cloud_turns.rs:833-840; crates/agiworkforce-protocol/src/account_cloud.rs:10-21, 69-73), but nothing in the CLI terminal UI sets that request. Which clients call it is unknown.

**Present but disconnected or switched off**

- work_plans table (migration 0237) opens a plan row per Work run with objective, constraints, deliverable, but nothing reads it back for the UI (grep: only work-plan-steps.ts and the service use it). Its header says 'NOT YET APPLIED' while scripts/config/applied-migration-checksums.json:238 lists it, so applied status is unknown (apps/web/db/neon/0237_work_plans.sql:1-12).

**Not available**

- VS Code: no AGI Work start (no matches in apps/extension-vscode/src; doc: docs/product/experience-contract.md:635 N/A).
- CLI terminal UI: no AGI Work start. `agi code start <task>` starts a Cloud Code session, a different feature (apps/cli/src/lib.rs:1165-1171).
- Local mode on every app: AGI Work is Cloud only (see access_and_usage).

## 4. Required behaviour

**Established requirements**

- The user can open a dedicated entry to describe and start an agentic work task (not a plain chat turn) and it starts a real agent run. Status in brief: web, desktop, mobile, CLI, VS Code done; Chrome missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.01)
- The user states the objective of the task; it is stored with the run and shown back. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.03)
- The user can specify what deliverable the task should produce and the run receives it. Brief: web, desktop, mobile done; CLI, VS Code, Chrome missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.04)
- Each work task shows a readable title in the task list. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.02)
- AGI Work run is a composer-mode dispatch, live on web, desktop and mobile; N/A on CLI and VS Code. (source: doc: docs/product/experience-contract.md:635)
- Work (and the other Cloud destinations) is Cloud only on mobile; Local shows only what works on the phone with no account. (source: doc: docs/decisions/2026-11-13-founder-decisions.md:91-96)

**Acceptance criteria**

1. A paid account on web can switch to Work, send a goal, and the request carries work_mode agiwork and agi_work_goal.goal equal to the message.
2. An empty or whitespace goal never creates a run (mobile: no conversation is created, start-cloud-work-run.test.ts); a goal over 2000 characters is refused by the server, not silently cut.
3. Empty constraints or deliverable are stored the same as missing ones (agiwork-plan.ts:37-46).
4. A free account sending work_mode agiwork gets HTTP 403 and no run starts; the Work toggle is hidden or reset to Chat.
5. After a successful start the run appears in the Tasks list with a title and the goal card shows the goal text, constraints and deliverable.
6. On mobile a rejected send shows 'This task could not be started' and the sheet stays open.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief says the run record stores the objective; in code the objective is stored in the goal journal event and the work_plans row, not in the run row. [inferred from cloud-agent-run-service.ts:755-790 and work-plan-steps.ts:29-36]
- Web, desktop and Chrome Work sends always stop for plan review first; mobile New task does not. [inferred from useChatStream.ts:4669-4670 and chatExecutionStore.ts:3451]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Send constraints, deliverable and excluded tools from Chrome, and send the plan-review flag from the mobile New task sheet so all surfaces behave the same.
- [proposed] Put maxLength on the mobile sheet fields to match the server limits.
- [proposed] Store a short readable title on the run itself so every surface shows the same title.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | AgiWorkGoalSchema | `apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts` | Validates and normalises the goal, constraints, deliverable and excluded tools (lines 27-46). |
| config | MAX_AGIWORK_GOAL_CHARS / AGIWORK_PLAN_MAX_STEPS | `packages/contracts/cloud-contracts/src/cloud-agent-runs.ts` | Shared limits: goal 2000, plan steps 6, step 300 characters (lines 83-85). |
| service | applyWorkMode and getWorkModeEntitlementError | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Forces streaming and tools, sets tool switches from excluded tools, refuses non-entitled plans (lines 1463-1503). |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Entry that accepts work_mode, agi_work_goal, agi_work_plan, agi_work_plan_approval (schema at request-processor.ts:795-797). |
| service | runToolLoop plan phase | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Emits the goal event, runs the planning turn and starts the work (lines 6183-6310). |
| service | ensureWorkPlanForRun | `apps/web/lib/workflows/steps/work-plan-steps.ts` | Opens a durable work_plans row with objective, constraints, deliverable for an agiwork run. |
| table | cloud_agent_runs | `apps/web/lib/services/cloud-agent-run-service.ts` | One row per run: work_mode, state, provider, model; no goal or effort column (lines 98-125, 755-790). |
| table | work_plans | `apps/web/db/neon/0237_work_plans.sql` | Durable objective, constraints, deliverable per run. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Work toggle, scope fields, builds agiWorkGoal on send (lines 885-889, 1057-1066, 3913-3945, 6171-6213, 7251-7335). |
| component | ComposerPlusMenu | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | 'Add scope (optional)' row and the approval-mode control (lines 1564-1572, 1904-1960). |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Sends the Cloud request with work_mode and goal fields (lines 4663-4671). |
| service | buildAgiWorkGoalInput (web) | `apps/web/features/chat/utils/agiwork-plan.ts` | Trims the message and optional fields into the goal object (lines 21-39). |
| component | StartWorkSheet | `apps/mobile/src/features/tasks/components/StartWorkSheet.tsx` | Mobile 'New task' sheet. |
| service | startCloudWorkRun | `apps/mobile/src/features/tasks/startWork.ts` | Creates the conversation, picks the cloud model, sends the Work turn, 60-character title (lines 33-81). |
| screen | CloudTasksScreen | `apps/mobile/src/features/tasks/CloudTasksScreen.tsx` | 'New task' button gated by canUseAgiWork, hosts the sheet and re-run prefill (lines 570-625, 667, 817-835). |
| store | chatExecutionStore sendMessage | `apps/mobile/stores/chat/chatExecutionStore.ts` | Builds the mobile Cloud request including work_mode and agi_work_goal (lines 3289-3296, 3446-3451). |
| component | Side panel AGI Work toggle | `apps/extension/src/side_panel.ts` | Chrome toggle and plan-gated reset to chat (lines 11163-11175, 13414). |
| service | freeTrialClient chat request | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Chrome request body with work_mode and goal-only agi_work_goal (lines 1591-1598). |
| service | cloud_turns work request | `apps/cli/src/app_server/cloud_turns.rs` | CLI app-server host builds work_mode, agi_work_goal and plan fields (lines 833-840). |
| config | AGI Work plan tiers | `packages/contracts/types/src/billing-catalog.ts` | agi_work capability maps to PRO_TIERS (lines 341, 354). |
| config | WORK_CAPABILITY kill switch | `apps/web/lib/feature-flags/kill-switches.ts` | Names canUseAgiWork as the Work kill-switch capability (line 31). |
| component | TaskDetailPanel goal card | `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx` | Shows the goal, constraints and deliverable back (lines 450-570). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types the goal in Work mode (web/desktop/Chrome) or fills the New task sheet (mobile). The client builds the goal object. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3937-3945; apps/mobile/src/features/tasks/startWork.ts:48-52 |
| Client posts to the Cloud chat completions endpoint with work_mode agiwork, the goal, and a plan-approval flag (web, Chrome) or none (mobile sheet). | device and our servers | apps/web/lib/hooks/useChatStream.ts:4663-4671; apps/mobile/stores/chat/chatExecutionStore.ts:3446-3451 |
| Server validates the schema, checks the plan tier (403 if not Pro or above), the free-add-on block, and the Work kill switch. | our servers | request-processor.ts:795-797, 3538-3556, 4405-4419, 5217-5219 |
| Server applies Work mode (stream on, tool switches from excluded tools), creates a run row, opens the work_plans row and starts the tool loop, which emits the goal event first. | our servers | request-processor.ts:1463-1479, 4423; cloud-agent-run-service.ts:755-790; work-plan-steps.ts:18-40; tool-loop.ts:6183-6185 |
| The planning model call and the work model calls run on the routed provider. | outside service | tool-loop.ts:6195-6204 (planning call through the provider failover ladder) |
| Client lists the run in Tasks and shows the goal card from the journal. | device and our servers | packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:450-570; apps/web/app/api/llm/v1/chat/completions/runs/route.ts (GET list) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Goal, constraints, deliverable, excluded tools | journal event agiwork:goal in cloud_agent_events; table work_plans (objective, constraints, deliverable) | Yes, read by every surface that opens the run from the Cloud list | Follows the run and conversation; retention rules not traced (unknown) |
| Run record (work_mode, state, provider, model) | table cloud_agent_runs | Yes, listed by GET runs on all signed-in surfaces | Archive supported by runs/[runId]/archive route; hard deletion rules not traced |
| The goal as the first user message and the conversation title | tables web_messages and web_conversations | Yes through conversation sync | Conversation deletion removes it from the Tasks list (cloud-agent-run-service.ts:1306-1318) |

**Models and providers.** The model is the one the person picked (web footer picker, mobile selected cloud model or the tier default). Routing treats Work turns as the 'agentic' task type (request-processor.ts:1040). The server calls the routed provider for the planning turn and every work step, with failover. No model identifiers are written here; they come from the model catalog (doc: AGENTS.md section 4).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in managed Cloud account is required. Free trial and free accounts are refused with 403 free_trial_feature_unavailable (request-processor.ts:4405-4419). Web hides the toggle for free trial (ChatComposerNew.tsx:1062-1066). |
| Permissions | Workspace feature gate 'work' is applied to Work requests (request-processor.ts:3181 workspaceFeaturesForChatRequest); tool approvals follow the account policy (see F060-06). Role rules inside a workspace: not traced. |
| Subscription | agi_work belongs to pro, max, max_15x, team, team_premium and enterprise (billing-catalog.ts:341,354). A lower plan gets 403 agi_work_plan_required with requiredTier pro (request-processor.ts:1486-1503). |
| Limits and metering | Runs are metered in managed usage credits; a Work turn takes a 86,400 second usage lease instead of 900 (request-processor.ts:1526-1536). When credits are used up the composer shows a WorkUsageCard (ChatComposerNew.tsx:5080-5110). Exact credit price per run: unknown. |
| Feature flags | Capability kill switch canUseAgiWork (kill-switches.ts:31, request-processor.ts:5217-5219); capability gate in the client via useCapability('canUseAgiWork') (ChatComposerNew.tsx:1057); user setting defaultWorkMode. |
| Model compatibility | Work needs a model that can call tools; the server decides tool capability per model (request-processor.ts, clarify offer uses resolvedModelCaps.tools at 5598-5602). Which catalog models are excluded: unknown. |
| Provider restrictions | Work runs use the managed Cloud route. Whether an own-key provider can run Work on web: not traced (unknown). Web plan-decision code refuses to resend for Local or own-key conversations (apps/web/features/chat/pages/WebChatPage.tsx:6322-6334), which suggests Work is Cloud only there. [inferred] |
| Local mode | Mode:local cannot start AGI Work. Mobile forces a Cloud model for the run (startWork.ts:38-42), and Work is listed as Cloud only on mobile (doc: docs/decisions/2026-11-13-founder-decisions.md:91-96). Local inference on mobile and desktop stays free of any subscription; Work is a Cloud feature behind a paid plan. Web own-key and desktop local routes: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty goal | Mobile Start button disabled and startCloudWorkRun throws before creating a conversation; server rejects an empty goal. | StartWorkSheet.tsx:65-68, 243-248; startWork.ts:52; agiwork-plan.test.ts:24 |
| Over-long goal | Server refuses rather than truncates; the first validation issue is returned. | agiwork-plan.test.ts:31; request-processor.ts:1456-1461 |
| Free or lower plan | Web resets mode to Chat and hides Work; mobile hides 'New task' when canUseAgiWork is not granted; server answers 403. | ChatComposerNew.tsx:1217-1231; CloudTasksScreen.tsx:667,817; request-processor.ts:3538-3556 |
| Sheet closed while sending | Close is ignored while submitting. | StartWorkSheet.tsx:60-63 |
| Send not accepted | Mobile shows the server message if present, else 'This task could not be started'. | startWork.ts:74-78 |
| Offline or network drop at start | Not handled specially in the start sheet code read; unknown for the sheet. | not handled in the code read (StartWorkSheet.tsx and startWork.ts contain no offline branch) |
| Scheduled (unattended) run | Unattended runs skip plan review and connector input prompts. | tool-loop.ts:3841, 6226-6247 |
| Accessibility | Mobile fields carry labels 'Task objective', 'Task constraints', 'Task deliverable'; the Start button announces disabled state. Web toggle buttons carry aria-pressed and aria-label. | StartWorkSheet.tsx:135,157,178,246-248; ChatComposerNew.tsx:6184-6190 |
| Desktop shell | Same composer as web; the request carries surface desktop. | apps/web/lib/hooks/useChatStream.ts:4546; doc: AGENTS.md section 5 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.test.ts`: Goal schema accepts and trims optional fields, rejects empty and over-long goals, plan parsing, goal progress event shape.
- `apps/web/lib/hooks/useChatStream.agiwork.test.tsx`: A Work send carries agi_work_goal; a non-Work send never does; plan delta populates the message.
- `apps/mobile/__tests__/start-cloud-work-run.test.ts`: Mobile start: conversation title and project, Work mode and goal fields, cloud model choice, empty goal refused before any conversation, rejected send reported.
- `apps/mobile/src/features/tasks/components/__tests__/StartWorkSheet.test.tsx`: Mobile sheet (file exists; contents not opened).
- `apps/mobile/src/features/tasks/__tests__/CloudTasksScreen.test.tsx`: Mobile Cloud tasks screen (file exists; contents not opened).
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.web-search.test.ts`: References getWorkModeEntitlementError and agi_work_plan_required (matched by search; assertions not read).
- `apps/web/app/api/chat/conversations/route.work-mode.test.ts`: Conversation route and work mode (file exists; contents not opened).
- `apps/web/lib/workflows/__tests__/agiwork-plan.test.ts`: Work plan service: one plan per run opened with the objective, closed on the run outcome.

**Test scenarios**

- **Start from web as a paid user**
  1. Sign in on web with a Pro or higher account.
  2. Switch the composer to Work.
  3. Open 'Add scope (optional)', enter a constraint and a deliverable, type a goal, send.
  4. Open the Tasks page.
  - Expected: A run appears; its goal card shows the goal, 'Constraints:' and 'Deliverable:' lines; the request body carried work_mode agiwork and agi_work_goal.
- **Free account is refused**
  1. Sign in with a free account.
  2. Look for the Work toggle.
  3. Replay a Work request against the endpoint with the account token.
  - Expected: No Work toggle; the endpoint answers 403 and no run row is created.
- **Mobile New task**
  1. Open Cloud tasks on a Pro account.
  2. Tap 'New task', enter only a goal, tap 'Start task'.
  - Expected: The sheet closes, the run opens in the detail sheet, the conversation title is the goal cut to 60 characters; note whether a plan review card appears (code says it should not).
- **Over-long goal**
  1. On mobile paste 2,500 characters into the objective field and start.
  - Expected: The server refuses with a validation message; the sheet shows an error and no run is created.
- **Chrome start**
  1. On a qualifying plan open the side panel, turn on 'AGI Work', send a goal.
  - Expected: Plan review card appears; no constraints or deliverable fields exist.

**Where to look when it fails**

- Server log 'AGI Work planning turn produced no parseable steps' (tool-loop.ts:6208-6213).
- Error codes agi_work_plan_required and free_trial_feature_unavailable in the 403 body.
- Tables cloud_agent_runs, cloud_agent_events (event agiwork:goal), work_plans.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/060-agentic-work-product.md](../../70-qa/test-plans/web/060-agentic-work-product.md)
- Desktop: [70-qa/test-plans/desktop/060-agentic-work-product.md](../../70-qa/test-plans/desktop/060-agentic-work-product.md)
- Mobile: [70-qa/test-plans/mobile/060-agentic-work-product.md](../../70-qa/test-plans/mobile/060-agentic-work-product.md)
- CLI: [70-qa/test-plans/cli/060-agentic-work-product.md](../../70-qa/test-plans/cli/060-agentic-work-product.md)
- Chrome: [70-qa/test-plans/chrome/060-agentic-work-product.md](../../70-qa/test-plans/chrome/060-agentic-work-product.md)

## 10. Gaps and dependencies

- **Mobile New task sheet skips plan review while web, desktop and Chrome always review.** Affects: Mobile users. Evidence: apps/mobile/stores/chat/chatExecutionStore.ts:3291-3295 and 3451 set agi_work_plan_approval only when the goal came from the composer, not from options.agiWorkGoal passed by startWork.ts:64-69. Work needed: Decide the intended behaviour, then send agi_work_plan_approval from the sheet path and show the review card in the run detail. Verify by running.
- **Chrome sends only the goal.** Affects: Chrome users. Evidence: freeTrialClient.ts:1594. Work needed: Add constraints, deliverable and tool exclusions to the side panel and request.
- **No Work start on CLI terminal UI or VS Code.** Affects: CLI and VS Code users. Evidence: No work_mode use in apps/extension-vscode/src or the TUI; doc: docs/product/experience-contract.md:635 says N/A. Work needed: Product decision: keep N/A or add; the brief marks them done, which the code does not support.
- **Run title rule not shared: mobile cuts the goal to 60 characters, web title source not traced, run row has no title.** Affects: All surfaces. Evidence: startWork.ts:33-36; cloud-agent-run-service.ts:1295-1300. Work needed: Trace the web title source; store one title with the run.
- **Brief line references drifted (many cited lines no longer match the code), so the brief cannot be used as a code map.** Affects: Engineers and testers. Evidence: apps/desktop/electron/windowPolicy.ts:86 is URL navigation policy, not a Work feature. Work needed: Regenerate the brief against current code.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-execution-boundaries
- SYS-authentication-and-identity
- SYS-api-and-contracts
- mode:cloud
- plan:pro
- table:cloud_agent_runs
- table:work_plans
- api:POST /api/llm/v1/chat/completions
- F060-04
- F060-05

## Unknown

- How web derives the conversation title for a Work run.
- Whether the work_plans migration 0237 is applied in production (header says not applied; checksum file lists it).
- Credit price per Work run.
- Whether own-key (BYOK) models can run Work on web.
- Whether any client other than tests calls the CLI app-server Work request.
- Offline text of the mobile start sheet.
