---
id: "F057-08"
type: "feature"
title: "Memory and scheduled tasks"
aliases: ["Memory tool (save_memory, search_memory, forget_memory)", "memory tool in the CLI", "Scheduling tool (create_schedule)", "cron_create, cron_list, cron_delete", "Scheduled tasks", "S57.21", "S57.24"]
area: "57 Tool catalog and invocation experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S57.21", "S57.24"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "table:user_memories", "table:scheduled_tasks", "api:GET /api/schedules", "SYS-memory-projects-and-context", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F057-08 Memory and scheduled tasks

The assistant can save, search and forget remembered facts, and create scheduled tasks. In the hosted chat route these are three memory tools and one create_schedule tool, offered only when the message asks for them. The CLI and VS Code use their own file-based memory tool and cron tools that act on the signed-in account.

Area: [57. Tool catalog and invocation experience](README.md). Requirement items: [S57.21](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5721), [S57.24](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5724).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a model save one fact about the person, search saved facts, delete saved facts after approval, and create a scheduled task with a name, prompt and repeat rule. In the CLI and VS Code the schedule tools also list and delete (apps/cli/src/platform/runtime/tool_catalog.rs:839-880).

**Why it exists.** So a person can say remember this, forget this, or run this every morning, in chat, without opening Memory or Schedules screens.

**Who uses it.** Signed-in people on Web, Desktop, Mobile and Chrome through the hosted route; CLI and VS Code users through the CLI tools.

**Problems it solves**

- Keeping lasting preferences across chats.
- Removing a remembered fact on request, with consent.
- Turning a chat request into an unattended recurring task.

**Use cases**

- Say 'remember that I prefer short answers' and the assistant saves one sentence.
- Say 'forget my old address' and the person approves the deletion.
- Say 'every weekday at 9 send me a briefing' and a scheduled task appears in Schedules.
- In the CLI, run cron_list to see the account's schedules.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): in a chat, the tool appears as a tool row labelled 'Save a memory', 'Search memories', 'Forget memories' or 'Create a scheduled task' (apps/web/lib/tool-copy.ts:114-143). No separate memory card component was found.
- Settings on Web: Memory section with the switch 'Include sensitive topics in memory' (apps/web/features/settings/sections/MemorySection.tsx:419-422); Schedules page apps/web/features/schedules.
- Mobile: same hosted tools in Cloud mode; settings Capabilities shows a memory freshness summary (apps/mobile/src/features/settings/capabilities/index.tsx:289-296).
- Chrome: hosted tools through the side panel; the surface is in the ambient list (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1111-1114).
- CLI and VS Code: tools memory (actions remember, recall, forget) and cron_create, cron_list, cron_delete, loaded through tool_search (apps/cli/src/platform/runtime/tool_catalog.rs:826-880).

**Before you start**

- Hosted route: signed in, a streaming chat that is not temporary, a model that can call tools, memory on for the chat and account (request-processor.ts:1123-1154).
- Schedules also need the workspace 'schedules' feature allowed (request-processor.ts:5579-5585) and a plan that includes scheduled tasks (apps/web/lib/services/schedule-service.ts:877-902).
- CLI cron tools need agi login and cannot schedule local-only work (tool_catalog.rs:839-846).

**Screens and controls**

- Approval card with 'Allow', 'Allow once', 'Always allow', 'Allow for this chat', 'Deny' labels for gated calls (packages/contracts/types/src/tool-approval-policy.ts:23-31).
- Settings 'Ask before every action', 'Run read-only actions without asking', 'Skip approvals' (tool-approval-policy.ts:51-72).
- CLI approval overlay titled 'Tool Approval' (apps/cli/src/tui/widgets/approval_overlay.rs:568).

**Journey**

1. 1. The person writes a message that mentions remembering or a schedule.
2. 2. The server decides whether to offer the tool (intent match, streaming, not temporary, memory or schedules allowed).
3. 3. The model calls the tool.
4. 4. For forget, an approval prompt appears and the person allows or denies; save and create_schedule run without a prompt under the default account policy.
5. 5. The tool returns a JSON result such as saved, alreadyKnown, forgotten, or created with next run time.
6. 6. The assistant tells the person what happened.

**What the person sees and gets**

- Tool row with running then done or failed status.
- Memory results: {saved}, {alreadyKnown}, {forgotten: [...]} or a refusal reason (apps/web/lib/server/tools/memory-tools.ts:157-168,246-252).
- Schedule result: created, id, name, timezone, nextRunAt, or {created:false, reason} (apps/web/lib/server/tools/schedule-tool.ts:158-167,112-114).

**Settings**

- Memory on/off per account and per chat (memory_enabled) (request-processor.ts:712,1139-1141).
- Include sensitive topics in memory (MemorySection.tsx:419).
- Tool approval policy (tool-approval-policy.ts:51-72).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Hosted memory tools: save_memory, search_memory, forget_memory with argument limits and refusals for temporary chat, memory off, exclusions and sensitive topics (apps/web/lib/server/tools/memory-tools.ts:19-30,140-258; apps/web/lib/services/memory-commands.ts:114-139).
- forget_memory is classified as an irreversible delete, so no account default runs it on its own (apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:290-295; apps/web/lib/tool-copy.ts:124-128).
- create_schedule with advisory lock and plan quota check inside one transaction (apps/web/lib/server/tools/schedule-tool.ts:145-157).
- Offer rules: memory needs an explicit memory phrase; schedule needs a schedule phrase (request-processor.ts:1116-1121; schedule-tool.ts:22-31).
- CLI memory tool writes user or project memory files and asks before saving and forgetting when confirmation is required (apps/cli/src/features/exec/tools/memory_tool.rs:88-160).
- CLI cron_create, cron_list, cron_delete use the same /api/schedules records as web and mobile (apps/cli/src/schedules.rs:3,16).

**Incomplete**

- The hosted schedule tool only creates; it has no list or delete (schedule-tool.ts:16-27).
- On the hosted chat save tool, a sensitive fact is unlocked only by the setting, because saveMemory never passes userRequested (memory-tools.ts:157-165; apps/web/lib/services/managed-memory-context-service.ts:626-629).
- The brief says a memory card appears; no memory card component was found, only a tool row.

**Present but disconnected or switched off**

- Hosted memory and schedule tools are not offered on CLI or VS Code surfaces: the ambient surface list is web, desktop, mobile, chrome (request-processor.ts:1111-1114; apps/web/lib/services/memory-commands.ts:36-37).
- Memory tools are not offered to Local or own-key chats because user_memories is managed storage (managed-memory-context-service.ts:648-652).

**Not available**

- List and delete scheduled tasks as chat tools on Web, Desktop, Mobile, Chrome.
- Memory tool on a temporary chat: refused with a message (memory-tools.ts:145-150).

## 4. Required behaviour

**Established requirements**

- Memory is not offered when memory is off for the chat or the request turns memory off. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.21)
- Forget always asks the person to approve first. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.21)
- Sensitive topics are saved only when the person asks and the sensitive-topics setting is on. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.21)
- Scheduled tasks cannot be created in a temporary chat; the tool returns a refusal. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.24)
- Scheduled tasks are limited by a per-plan quota checked in a database lock. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.24)
- Scheduled tasks are offered only when schedules are allowed for the account. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.24)
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Memory tools are absent from the request when memory_enabled is false.
2. forget_memory always produces an approval request under every policy.
3. In a temporary chat save_memory returns saved:false with a temporary-chat reason.
4. create_schedule in a temporary chat returns created:false.
5. A plan with a zero or reached limit returns created:false with the plan message.
6. A sensitive fact is refused with the setting off and saved with it on.
7. In the CLI, remember asks before saving unless approvals are skipped.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Under the default web account policy (skip approvals), save_memory and create_schedule run without a prompt because they are reversible writes (packages/contracts/types/src/tool-approval-policy.ts:13; tool-metadata.ts:1093).
- [inferred] A saved 'always allow' for a non-connector tool does not apply because levels come from connector permissions.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer list and delete schedule tools on the hosted route so Web matches the CLI.
- [proposed] Show a visible memory-saved card if the brief's memory card is intended.
- [proposed] Decide whether the model-chosen sensitive save should require a user ask, as the brief says.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | memory tools | `apps/web/lib/server/tools/memory-tools.ts` | Defines and runs save_memory, search_memory, forget_memory |
| service | schedule tool | `apps/web/lib/server/tools/schedule-tool.ts` | Defines and runs create_schedule with quota lock |
| service | memory commands | `apps/web/lib/services/memory-commands.ts` | Eligibility, store, find and remove ports |
| service | managed memory context | `apps/web/lib/services/managed-memory-context-service.ts` | Memory policy, sensitive-topic gate, storage rules |
| service | schedule service | `apps/web/lib/services/schedule-service.ts` | createSchedule, countSchedules, assertScheduleQuota |
| hook | applyMemoryToolCapability | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Decides when memory tools are offered (lines 1123-1154) |
| hook | applyScheduleToolCapability | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Decides when create_schedule is offered (lines 1180-1216) |
| service | tool loop dispatch | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs the tools (lines 2482-2557) |
| config | tool metadata | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Marks forget_memory irreversible delete |
| config | call gate | `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts` | Decides allow, ask or deny for each call |
| config | tool copy | `apps/web/lib/tool-copy.ts` | Labels and plain descriptions of the tools |
| command | memory tool (CLI) | `apps/cli/src/features/exec/tools/memory_tool.rs` | File-based remember, recall, forget |
| config | CLI tool catalog | `apps/cli/src/platform/runtime/tool_catalog.rs` | Declares memory and cron tools as deferred |
| service | CLI schedules client | `apps/cli/src/schedules.rs` | Calls /api/schedules for cron tools |
| endpoint | /api/schedules | `apps/web/app/api/schedules/route.ts` | Schedule records shared by all apps |
| table | user_memories | `apps/web/lib/services/memory-commands.ts` | Stores saved facts (query at lines 180-190) |
| table | scheduled_tasks | `apps/web/lib/services/schedule-service.ts` | Stores schedules (count at line 870) |
| screen | MemorySection | `apps/web/features/settings/sections/MemorySection.tsx` | Memory settings including sensitive-topics switch |
| screen | SchedulesPage | `apps/web/features/schedules/components/SchedulesPage.tsx` | Where created schedules appear |
| config | plan limits | `packages/contracts/types/src/billing-catalog.ts` | getPlanMaxScheduledTasks per plan |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The client sends a streaming chat request; the server checks tool-capable model, not temporary, memory or schedules allowed, and the message wording. | our servers | request-processor.ts:1123-1216,5545-5585 |
| The model calls the tool; the gate decides allow or ask. forget_memory is an irreversible delete so it asks. | our servers | tool-call-gate.ts:68-126; tool-metadata.ts:290-295 |
| Memory tools read or write the user's rows through a caller-scoped database handle. | our servers | tool-loop.ts:2551-2557; memory-tools.ts:157-258 |
| create_schedule takes an advisory lock, checks quota, inserts the schedule, returns the next run time. | our servers | schedule-tool.ts:145-167 |
| CLI memory writes plain text files on the device; CLI cron calls /api/schedules on the account. | device and our servers | memory_tool.rs:110-121; apps/cli/src/schedules.rs:3,16 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Remembered facts | user_memories table (hosted); user and project memory files (CLI) | hosted facts follow the account across Cloud surfaces (doc: docs/product/definition.md:118); CLI files do not sync | Forget removes matching rows after approval; temporary chats never save |
| Scheduled tasks | scheduled_tasks table | yes, the same records on web, mobile and CLI | Deleted from Schedules or by cron_delete |

**Models and providers.** Any tool-capable model on the hosted route can call these tools; non-tool models never see them (request-processor.ts:1129,5546). Memory writes also pass a model-free eligibility check. The scheduled task later runs a prompt with whatever model the schedule uses (unknown here).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required on both paths (tool-loop.ts:2528-2531,2484-2487). |
| Permissions | Workspace feature gate 'schedules' (request-processor.ts:5584); organization memory policy can turn memory off (managed-memory-context-service.ts:610-616). Approval policy per account. |
| Subscription | Scheduled task count per plan; a plan with a limit of zero refuses with an upgrade message (schedule-service.ts:877-902). |
| Limits and metering | fact 500 chars, query 200, search returns up to 10, forget removes up to 25 matches, schedule name 120 and prompt 4,000 chars (memory-tools.ts:28-33; memory-commands.ts MAX_FORGET_MATCHES; schedule-tool.ts:19-20). |
| Feature flags | memory_enabled and personalization request fields. No other flag found. |
| Model compatibility | Tool-capable models only. |
| Provider restrictions | none found in the code for these tools. |
| Local mode | Hosted memory and schedule tools are Cloud only (managed storage, managed-memory-context-service.ts:648-652). In the CLI, memory is per mode: Local, own key and Managed each keep their own user memory (tool_catalog.rs:828). CLI cron cannot schedule local-only work (tool_catalog.rs:839-846). Mobile Local mode tool behaviour: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Temporary chat | save_memory returns saved:false with reason; search returns empty; create_schedule returns created:false | memory-tools.ts:145-150,181-186; schedule-tool.ts:130-132 |
| Memory off for account | search returns 'Memory is off for this account.' | memory-tools.ts:211-216 |
| Forget with no match | Returns forgotten:[] | memory-tools.ts:246-249 |
| Quota reached | created:false with a plan message | schedule-service.ts:895-902; schedule-tool.ts:170-176 |
| Cancelled turn | Abort signal stops before save, lock or insert | schedule-tool.test.ts:62-100; memory-tools.test.ts:95-160 |
| Invalid arguments | Returns an error message to the model | memory-tools.ts:128-130; schedule-tool.ts:121-129 |
| Sensitive-data turn or Google user data in the turn | save_memory is refused | tool-loop.ts:2535-2548 |
| Offline and reconnect | not handled in the code for these tools beyond normal stream resume | No offline or reconnect branch in memory-tools.ts or schedule-tool.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/tools/memory-tools.test.ts`: Sensitive-topic opt-in, cancellation during save and remove
- `apps/web/lib/server/tools/memory-tools.project-edit.test.ts`: Project memory edit tool
- `apps/web/lib/server/tools/schedule-tool.test.ts`: Cancellation during entitlement, lock, quota and create
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.memory.test.ts`: Memory offer rules (name only)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.google-memory.test.ts`: Google user data and memory (name only)
- `apps/web/lib/services/schedule-service.test.ts`: Schedule service (name only)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.test.ts`: Gate ranks and default-policy asking

**Test scenarios**

- **Forget asks first**
  1. Save a memory 'my cat is Tom'
  2. Say 'forget about my cat'
  3. Watch for the approval card
  4. Deny, then repeat and allow
  - Expected: Nothing is removed on deny; removed and named on allow
- **Temporary chat**
  1. Open a temporary chat
  2. Say 'remember I like tea'
  - Expected: The tool refuses and nothing is saved
- **Memory off**
  1. Turn Memory off
  2. Say 'remember X'
  - Expected: No memory tool is offered
- **Schedule quota**
  1. On a plan with a small limit create schedules by chat until the limit
  - Expected: The next request returns a plan limit message and no row is added
- **CLI cron round trip**
  1. agi login
  2. Ask the CLI to create a daily cron schedule
  3. Run cron_list
  4. Open Schedules on web
  - Expected: The same schedule appears on web

**Where to look when it fails**

- Tool result strings: 'was called with invalid arguments', 'A signed-in account is required to use Memory.'
- Table scheduled_tasks and user_memories rows.
- Logger tag [tool-approvals] when account policy cannot be read.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md)
- Desktop: [70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md)
- Mobile: [70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md)
- CLI: [70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md)
- VS Code: [70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md)
- Chrome: [70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md)

## 10. Gaps and dependencies

- **No list or delete schedule tool on the hosted route.** Affects: Web, Desktop, Mobile, Chrome. Evidence: schedule-tool.ts:16-27 versus tool_catalog.rs:839-880. Work needed: Add hosted list and delete tools, with an approval for delete.
- **The brief's memory card is not found.** Affects: Web, Desktop, Mobile. Evidence: No component found by search; labels only in apps/web/lib/tool-copy.ts:114-128. Work needed: Confirm intent; add a card or fix the brief.
- **Hosted memory and schedule tools are not offered on CLI and VS Code Cloud chats.** Affects: CLI, VS Code. Evidence: request-processor.ts:1111-1114. Work needed: None if the CLI tools are the intended path; document it.
- **Hosted 'forget always asks' rests on tool metadata, not a dedicated check.** Affects: Web, Desktop, Mobile, Chrome. Evidence: tool-metadata.ts:290-295; tool-metadata.ts:1083-1100. Work needed: Add a test that forget_memory asks under every policy.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- table:user_memories
- table:scheduled_tasks
- api:GET /api/schedules
- SYS-memory-projects-and-context
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline

## Unknown

- Per-plan scheduled task numbers (read from billing catalog at run time).
- Which model a scheduled task runs on.
- Whether Mobile Local mode offers any memory or schedule tool.
- Whether the brief's memory card exists in an app not searched.
