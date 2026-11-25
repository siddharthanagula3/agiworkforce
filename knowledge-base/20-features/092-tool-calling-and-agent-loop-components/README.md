---
id: "AREA-092"
type: "area"
title: "Tool-calling and agent-loop components"
features: ["F092-01", "F092-02", "F092-03", "F092-04", "F092-05", "F092-06", "F092-07", "F092-08", "F092-09", "F092-10"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 92. Tool-calling and agent-loop components

When the assistant needs outside help, it asks for a tool: search the web, read a file, act on a connected account, or run code. This area is the machinery that decides which tools the model may see, checks each request, asks the person first when the action is risky, runs the tool, keeps a record, and stops cleanly when a run is cancelled, paused or out of budget. It matters because a wrong tool call can send a message, change data or leak private content, so every call passes through the same checks.

**Who uses it.** Every signed-in person who uses hosted chat with tools turned on (the tool list depends on their tool access mode and connected accounts). Scheduled runs use the same gate but run unattended. Workspace admins affect it only through an organization policy that can block autonomous approvals (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts). Developers use the Rust agent engine and local named agents in the CLI. Plan-based limits were not established from the code I read.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F092-01](F092-01-tool-list-risk-labels-and-tool-search.md) | Tool list, risk labels and tool search | n/a | n/a | n/a | n/a | n/a | n/a |
| [F092-02](F092-02-checking-tool-arguments-and-reading-tool-calls.md) | Checking tool arguments and reading tool calls | n/a | n/a | n/a | n/a | n/a | n/a |
| [F092-03](F092-03-running-tools-in-a-turn.md) | Running tools in a turn | n/a | n/a | n/a | n/a | n/a | n/a |
| [F092-04](F092-04-large-tool-results.md) | Large tool results | n/a | n/a | n/a | n/a | n/a | n/a |
| [F092-05](F092-05-approvals-and-pauses.md) | Approvals and pauses | n/a | n/a | n/a | n/a | n/a | n/a |
| [F092-06](F092-06-receipts-retries-and-outcome-checks.md) | Receipts, retries and outcome checks | n/a | n/a | n/a | n/a | n/a | n/a |
| [F092-07](F092-07-durable-runs-and-recovery.md) | Durable runs and recovery | n/a | n/a | n/a | n/a | n/a | n/a |
| [F092-08](F092-08-budgets-and-loop-limits.md) | Budgets and loop limits | n/a | n/a | n/a | n/a | n/a | n/a |
| [F092-09](F092-09-scheduled-unattended-runs.md) | Scheduled unattended runs | n/a | n/a | n/a | n/a | n/a | n/a |
| [F092-10](F092-10-agent-definitions-and-subagents.md) | Agent definitions and subagents | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md).

## How this area works in the code

1. **Model asks for a tool.** The provider stream is read and each tool call is turned into one shape (id, name, arguments). Arguments over 256 KB are capped. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3026 (parseAssistantToolCalls)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1918 (collectProviderStream)`)
2. **Offer the right tool schemas.** Only the schemas that match the turn are sent; the rest are listed in a directory tool. When the model asks for a deferred tool, its schema is added for the next step. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:116 (selectToolSchemas)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3967 (directory tool)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3990 (expandDeferredToolSchemas)`)
3. **Check arguments.** Arguments are checked against the declared schema. A problem produces a refusal message that goes back to the model. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-argument-validation.ts:3 (re-export)`, `packages/ai/provider-protocol/src/tool-argument-validation.ts:74 (toolArgumentProblem)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4040-4041`)
4. **Decide allow, ask or deny.** The gate walks a fixed rank table: saved deny, device step, lethal-trifecta escalation, saved allow, saved ask, account default read-only, manual mode ask, trifecta, then allow. Unattended escalations become a deny. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:68 (rank table)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:138 (resolveToolCallGate)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4144 (gate call in loop)`)
5. **Pause for a person when needed.** The pending calls and the messages are saved as a server checkpoint before the approval request is shown. The run then waits. The checkpoint table holds state pending, resuming, resolved or failed. (`apps/web/app/api/llm/v1/chat/completions/lib/approval-checkpoint-request.ts:3`, `apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql (table cloud_agent_approval_checkpoints)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1226 (toolApprovalRequestEvent)`)
6. **Apply the decision and resume.** A decision from chat or another device is sent to the approve or resume routes. The server checks that it matches the stored calls, claims the checkpoint, and runs only the approved calls with their stored arguments. (`apps/web/app/api/llm/v1/chat/completions/approve/route.ts`, `apps/web/app/api/llm/v1/chat/completions/resume-input/route.ts`, `apps/web/lib/services/cloud-agent-run-service.ts:1436-1452 (checkpoint and event cursor match)`)
7. **Run the tool.** Approved calls go to the dispatcher, which routes by category (search, fetch, sandbox, office, skills, connectors, device steps, caller-owned). Retry-unsafe calls go through the idempotency guard. Read-only batches run up to 4 at once. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3656 (executeOfferedToolCall)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-idempotency.ts:164 (runToolCallOnce)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1565 (mapWithConcurrency)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:541 (MAX_PARALLEL_TOOL_CALLS = 4)`)
8. **Normalise and record the result.** Errors are wrapped as untrusted content and capped at 4,000 characters. Each platform action is written to the audit log; connector calls are logged to the call-event table without blocking the call. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2230 (toolErrorContent)`, `apps/web/lib/e2b/execution-tools.ts:286 (capOutput)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3514 (recordToolCallAudit)`, `apps/web/lib/connectors/health.ts:280 (meterConnectorCall)`, `apps/web/lib/services/connector-call-log-service.ts:52 (recordConnectorCallOutcome)`)
9. **Store big results and trim history.** Large results are stored under a reference in the key-value store for 24 hours. The history sent to the model is trimmed to about 200,000 characters, keeping the most recent results. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:14-16 (key prefixes and TTL)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1642 (trimToolResultHistory)`)
10. **Loop, limit and cancel.** The loop runs while steps are below the limit (10 for chat, 100 for agent mode, 20 for caller-owned runs by default). At the limit it pauses. Cancel stops the stream and in-flight tools. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:6697 (while step < maxSteps)`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:7919 (pause at step limit)`, `packages/contracts/cloud-contracts/src/tool-call-limits.ts:3-5`, `crates/agiworkforce-agent-core/src/engine.rs:22 (run_cancellable)`)
11. **Durable record and recovery.** Runs, plans, budgets and checkpoints are stored in the database. Budget checks run before each provider operation. A cron reaper settles runs whose invocation ended. (`apps/web/lib/services/cloud-agent-budget.ts:279 (spend cap check)`, `apps/web/db/neon/0061_cloud_agent_runs.sql`, `apps/web/db/neon/0258_cloud_agent_run_budgets.sql`, `apps/web/app/api/cron/reap-agent-runs/route.ts:19`, `apps/web/lib/services/cloud-agent-run-reaper.ts:90`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | The main loop (runToolLoop at line 3833): streams, runs tools, pauses for approval, resumes, and enforces limits. About 8,000 lines; most behaviour lives here. |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | The web tool registry: declared risk properties per platform tool and per connector tool, plus parallel-safety and retry-safety lookups. |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts` | The approval rank table and resolveToolCallGate, which return allow, ask or deny for one call. |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts` | Loads the person's approval policy from user settings, and the organization check that can block autonomous approvals. |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts` | Chooses which tool schemas to send each turn and expands deferred ones on request. |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-idempotency.ts` | Remembers retry-unsafe calls under a key so a retried step does not run them twice. |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts` | Stores large tool results under a reference for 24 hours and serves them in pages. |
| `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | The deep-research loop: its own plan, search, gate and completion checks, using the same gate. |
| `apps/web/lib/services/cloud-agent-run-service.ts` | Stores run state, approval decisions and checkpoint resume; matches decisions to the exact pending calls. |
| `apps/web/lib/services/cloud-agent-budget.ts` | Per-run budget defaults and the checks for spend, tool calls, time and repeated calls. |
| `apps/web/lib/services/cloud-agent-run-reaper.ts` | Settles runs whose worker stopped, so they do not hang. |
| `apps/web/lib/services/unattended-tool-gate.ts` | Decides whether a scheduled run may run a tool without asking. |
| `apps/web/lib/user-connector-tools.ts` | Connector tool execution, including the GitHub write reconciliation that checks the outcome after an unknown result. |
| `crates/agiworkforce-agent-core/src/engine.rs` | The Rust turn engine used by the CLI (run_turn and cancellation). |

## What is stored

- Durable runs, their state, events and leases: Database table cloud_agent_runs (apps/web/db/neon/0061_cloud_agent_runs.sql)
- Approval checkpoints: messages, request, pending tool calls, state and lease: Database table cloud_agent_approval_checkpoints (apps/web/db/neon/0062_cloud_agent_approval_checkpoints.sql)
- Per-run budget rows (cost, tool calls, time, depth): Database table cloud_agent_run_budgets (apps/web/db/neon/0258_cloud_agent_run_budgets.sql)
- Connector call events: connector, tool name, outcome, duration, time (arguments are not in the columns I saw): Database table connector_call_events (apps/web/db/neon/0223_connector_call_events.sql)
- Platform tool audit events (success, failure, denied): Audit log via recordAuditEvent, called from apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3514; storage table not established
- Large tool results and their index, for 24 hours: Key-value store (apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:14-16)
- Idempotency markers for retry-unsafe calls, for 15 minutes by default: Key-value store (apps/web/app/api/llm/v1/chat/completions/lib/tool-idempotency.ts:17-18)
- Approval policy choice per person: Database table user_settings, column settings (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts)
- Saved per-tool levels (allow, ask, deny): Connector tool permissions (apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts); storage not established
- Work plans and steps: Database table work_plans (apps/web/db/neon/0237_work_plans.sql)
- CLI agent definitions (Markdown files): Folders .agiworkforce/agents and .claude/agents in the project, and ~/.agiworkforce/agents globally (apps/cli/src/agents.rs:252-265, 322-323)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Per-person tool approval policy (ask_every_time, auto_approve_read_only, autonomous)**: Sets the default allow or ask for read-only and other calls. Default is ask_every_time; the cloud account default is autonomous. (packages/contracts/types/src/tool-approval-policy.ts:3-13; read in apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts)
- **Organization permits autonomous approvals**: If any governing organization forbids it, an autonomous setting falls back to ask every time. (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts (permitsAutonomous, resolveGoverningOrganizationIds))
- **Approval mode of the loop**: manual (default) pauses for approval; auto runs calls without asking. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3840)
- **Saved per-tool level (allow, ask, deny)**: Overrides the account default for that tool; deny always wins. (apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:68 (rank 1 and rank 4))
- **Step limit per turn**: 10 for chat, 100 for agent mode, 20 for caller-owned runs; the caller can set its own value. (packages/contracts/cloud-contracts/src/tool-call-limits.ts:3-5; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:891-904)
- **Time limit for a loop**: Maximum duration of a tool loop; the constant CHAT_TOOL_LOOP_BUDGET_MS is used but its value was not located. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:891-904)
- **Parallel tool cap in the main loop**: Up to 4 read-only calls at once. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:541)
- **Parallel tool cap in research**: Up to 3 at once by default. (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:184)
- **Research limits**: Iterations 6, searches 12, time 4 minutes by default; set through environment reads. (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:171-184)
- **Idempotency window**: How long a retry-unsafe call is remembered (default 15 minutes, minimum 1 second). (apps/web/app/api/llm/v1/chat/completions/lib/tool-idempotency.ts:18 (env AGI_TOOL_IDEMPOTENCY_WINDOW_MS))
- **Run budget defaults**: Spend 20 dollars, 500 tool calls, 6 hours; repeat threshold 5 identical calls. (apps/web/lib/services/cloud-agent-budget.ts (CLOUD_AGENT_RUN_BUDGET_DEFAULTS, CLOUD_AGENT_LOOP_REPEAT_THRESHOLD))
- **Time-to-first-token targets**: Targets for the provider first-token timing (2.5 s target, 5 s breach by default). (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:531-532)
- **Cron authentication and low-power skip**: Cron sweeps reject requests without the secret, and can skip work when low-power mode is set. (apps/web/app/api/cron/run-schedules/route.ts; apps/web/app/api/cron/reap-agent-runs/route.ts)
- **Connector health gate**: A connector with a streak of failures is held back for a while. (apps/web/lib/connectors/health.ts:227 (resolveConnectorGate))
- **Code-execution availability**: Turns sandboxed code execution on or off for a turn. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5929 (e2bEnabled))

## Shared between apps

Shared: the tool metadata and gate logic are web server code in apps/web and are imported by the connector permissions route, the unattended gate and the voice tool runner (apps/web/lib/voice/live-voice-tool-runner.ts:394). Argument validation comes from the shared package packages/ai/provider-protocol. Approval policy types come from packages/contracts/types. Tool protocol types are generated from the Rust crate crates/agiworkforce-protocol into packages/contracts/types/src/generated/protocol. Separate per app: the CLI turn engine is Rust (crates/agiworkforce-agent-core, with runaway.rs mirrored in cloud-agent-budget.ts). The hosted loop is TypeScript. Desktop, mobile, extension and VS Code code was not checked for their own tool loops.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief item S92.13 cites research-loop.ts:1605 for the approval evaluator. That line is in a plan-step parser. The gate call is at research-loop.ts:2191 (gateResearchCall). (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1605 and :2191)
- Brief item S92.04 cites tool-argument-validation.ts:76, but that file has 3 lines and only re-exports the validator from the shared package (line 74 there). (apps/web/app/api/llm/v1/chat/completions/lib/tool-argument-validation.ts:3; packages/ai/provider-protocol/src/tool-argument-validation.ts:74)
- Brief item S92.19 cites lib/github-app.ts:865, which is a branch-list fetch, not reconciliation. The reconciliation is writeWithReconciledOutcome, and it covers GitHub comment and review writes only in the code read. (apps/web/lib/github-app.ts:865; apps/web/lib/user-connector-tools.ts:413 and 432-448)
- Brief item S92.28 says each run's budget is reserved up front. The code checks spend before each provider operation; I found no reservation in the budget service or migration 0258. (apps/web/lib/services/cloud-agent-budget.ts:279; apps/web/db/neon/0258_cloud_agent_run_budgets.sql)
- Brief item S92.21 says CLI agents live in .agi/agents. The code reads .agiworkforce/agents and .claude/agents. (apps/cli/src/agents.rs:252-265 and 322-323)
- Two retry-safety vocabularies. The idempotency guard uses a name list (safe or unsafe) while the tool registry uses idempotent, at_most_once or unknown. The guard does not read the registry, so the two can disagree. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:921 and 932; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:961; packages/contracts/types/src/generated/protocol/ToolRetrySafety.ts:3)
- Brief item S92.01 says one registry declares every tool. The Rust protocol file in the brief carries auth shape only in what I read; the risk fields exist only in the web TypeScript registry. (crates/agiworkforce-protocol/src/tool_primitive.rs:50-62; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:101)
- Brief item S92.17 cites tool-loop.ts:2586 as a receipt. That line writes generated office-file metadata. The audit write is recordToolCallAudit at tool-loop.ts:3514. Connector receipts are a separate table written without awaiting, so a receipt can be lost without an error. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2586, 3514; apps/web/lib/services/connector-call-log-service.ts:52-60)
- Brief item S92.07 cites tool-loop.ts:2099 as a normaliser. That line is inside collectProviderStream. The error normaliser is toolErrorContent at tool-loop.ts:2230. Brief item S92.07 also cites e2b execution-tools.ts:261, which is a routing function; the output cap is capOutput at line 286. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2099, 2230; apps/web/lib/e2b/execution-tools.ts:261, 286)
- Brief item S92.15 and S92.16 cite tool-loop.ts:4492-4494 for the action-binding check. That range is the empty-provider-step retry logic. The binding check is in cloud-agent-run-service.ts around 1436-1452. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4486-4500; apps/web/lib/services/cloud-agent-run-service.ts:1436-1452)
- Brief item S92.13 cites tool-loop.ts:2578 for the approval evaluator. That line only passes the user id into the execution context. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2578)
- Brief item S92.19 says any unknown external outcome is checked against the external system. Only GitHub writes have a check in the code I read. (apps/web/lib/user-connector-tools.ts:413-450)
- Idempotency guard is applied by a name list (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:932) and only for the retry-unsafe kind, so a new tool is unsafe unless added to the list. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:932-944)

## Not established

- Whether approval decisions are resolved exactly once. The checkpoint has a lease and state column, but I did not read the full claim and resolve logic in cloud-agent-run-service.ts.
- The value of CHAT_TOOL_LOOP_BUDGET_MS (the chat loop time limit); the name is used but its definition was not located.
- Which tool access modes or plans turn tools on or off (resolveToolAccessMode was called but not read).
- What backs the key-value store in production, and therefore how long idempotency markers and stored results survive a restart.
- Where the audit log (recordAuditEvent) is stored and whether it is queryable by the person.
- Whether the Rust CLI engine applies the same approval gate as the web loop; I read only the turn engine entry point and run_cancellable.
- Behaviour in the desktop, mobile, Chrome extension and VS Code apps, and the approval UI settings screen; I did not open those files beyond the shared chat component wiring.
- Whether the dependency-aware item (S92.12) and subagent item (S92.24) are correctly marked not applicable; I searched and found no ordering or spawning code, but did not search the whole repository.
- Whether the voice path enforces the same budgets as the chat loop.
