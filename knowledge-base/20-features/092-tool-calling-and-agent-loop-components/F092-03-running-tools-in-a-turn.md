---
id: "F092-03"
type: "feature"
title: "Running tools in a turn"
aliases: ["Multi-round model/tool loop", "Agent loop", "runToolLoop", "Parallel tool scheduler", "Cancellation coordinator", "Completion-condition evaluator", "Step limit", "Tool executor dispatcher"]
area: "92 Tool-calling and agent-loop components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S92.06", "S92.07", "S92.10", "S92.11", "S92.12", "S92.20", "S92.26"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-inference-providers", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "F092-01", "F092-02", "F092-04", "F092-05", "F092-06", "surface:web", "surface:cli", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F092-03 Running tools in a turn

The hosted chat runs the model, then its tool calls, then the model again, until it finishes or hits a step or time limit. Read-only calls may run side by side (4 at once only if the route supports it); everything else runs one at a time. Stop ends the stream and tools in flight. Shared checks decide empty, blocked, cancelled or cut-off turns.

Area: [92. Tool-calling and agent-loop components](README.md). Requirement items: [S92.06](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9206), [S92.07](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9207), [S92.10](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9210), [S92.11](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9211), [S92.12](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9212), [S92.20](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9220), [S92.26](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9226).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** runToolLoop streams a provider step, executes the tool calls, adds results to the conversation and repeats, within a step budget and a wall-clock budget (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:6697-6740). A dispatcher routes each call to its executor: search, fetch, sandbox code, Office files, skills, connectors, device steps and others (tool-loop.ts:2400-3020). A separate research loop covers Deep Research (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts).

**Why it exists.** Answers often need several tool calls in a row. The loop keeps this bounded in steps, time and concurrency, and settles every turn in a known end state.

**Who uses it.** Every hosted chat user whose model calls tools, scheduled agent runs and voice tools; the CLI has its own Rust engine.

**Problems it solves**

- Runaway loops: a step limit pauses the run with a checkpoint instead of failing (tool-loop.ts:7910-7960).
- Slow serial reads: independent read-only calls can run together (tool-loop.ts:5398-5403,5729).
- Hung tools: each call has a deadline (apps/web/lib/deadline-policy.ts:8).
- Blank answers: one shared definition of empty or cut-off turns (apps/web/app/api/llm/v1/chat/completions/lib/turn-completeness.ts:1-60).

**Use cases**

- A user asks a question that needs two web searches and a page fetch; the searches run together, then the answer follows.
- A user presses stop mid-run; the stream and running tools end and the turn shows as cancelled.
- A long agent task reaches its step limit and pauses with a notice until the user continues.
- A scheduled agent runs unattended with the same loop.

## 2. User experience

**Where to find it**

- Web: the chat answer with tool steps shown in the activity list as they run; stop control in the composer (exact stop label not opened).
- Desktop (Electron): same hosted web chat (AGENTS.md section 5).
- Mobile: Cloud chat shows tool timeline (apps/mobile/src/features/chat/components/ToolCallTimeline.tsx).
- CLI: separate Rust turn loop in apps/cli using crates/agiworkforce-agent-core/src/engine.rs.
- VS Code and Chrome: Chrome calls the hosted approval resume path (apps/extension/src/features/cloud-bridge/managedChatHandler.ts:198); loop behaviour there was not otherwise examined.

**Before you start**

- A tool-capable model route; the sign-in and plan rules of hosted chat.
- Cloud mode: this loop runs on our servers.

**Screens and controls**

- Activity list rows per tool with running, completed, failed, awaiting approval states (tool-loop.ts:5420-5450 status events).
- Stop or cancel control; pause and steer controls exist as run actions (tool-loop.ts:6700-6738 isPauseRequested, takeSteerMessages).

**Journey**

1. Person sends a message.
2. Server builds the offered tool list and starts the loop (F092-01).
3. Each step: provider streams text and tool calls.
4. Server gates and settles calls (F092-02, F092-05).
5. Read-only calls run together up to the limit, then mutating calls one by one (tool-loop.ts:5729-5747).
6. Results are added as tool messages and the model is called again.
7. The loop ends on a final answer, cancel, a limit, or a pause.

**What the person sees and gets**

- Status events per tool and canonical 'tool-execution-start' and 'tool-execution-end' events with elapsed time (tool-loop.ts:5420-5445,5855-5870).
- At the step limit: 'Paused at the N-step execution limit' with task state awaiting input (tool-loop.ts:7922-7945).
- Cancel: task state 'Agent work was cancelled.' (tool-loop.ts:5232-5234).
- Timeout: 'Tool X timed out after Ns and was abandoned.' or, for writes, an unknown-outcome message (tool-loop.ts:1702-1745).

**Settings**

- Step limits: chat 10, AGI Work 100, caller-tool handoff 20 by default (packages/contracts/cloud-contracts/src/tool-call-limits.ts:3-5; tool-loop.ts:893-906).
- Time: loop budget 240 s (300 s function limit minus 60 s reserve); tool call deadline 120 s (apps/web/lib/deadline-policy.ts:1-8).
- Research loop env AGI_RESEARCH_MAX_PARALLEL_TOOL_CALLS, default 3, range 1 to 8 (research-loop.ts:184,1778-1783).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Loop repeats until the model stops or limits hit; step count is cumulative across resumes (tool-loop.ts:6690-6697).
- Read-only calls (declared read class) run first with concurrency 4, but only if the serving route's harness marks parallelToolCalls as implemented; otherwise concurrency is 1 (tool-loop.ts:5385-5403; packages/ai/model-registry/catalog/harnesses.json:39).
- Mutating and undeclared calls run one at a time after the read-only batch, and each is checked for a stop request first (tool-loop.ts:5738-5747).
- Step limit: with a step-budget checkpoint handler the run pauses durably and only a resume that raises the limit continues; without one the turn ends with error code max_agent_steps_reached (tool-loop.ts:7910-7973).
- Wall-clock limit: with an invocation checkpoint handler the run checkpoints and a caller continues (tool-loop.ts:6739-6760).
- Cancel: checked at loop start, before each mutating call and in other points; the signal is combined into each tool call's own abort signal (tool-loop.ts:4201-4204,5538-5542,6697-6700).
- Each call has its own timeout and abort; a timed-out write reports unknown outcome and tells the model not to retry (tool-loop.ts:1702-1745,5721-5727).
- Error text from tools is fenced as untrusted data; connector results use a sealed envelope; fetched pages and stored pages are fenced (tool-loop.ts:2200-2240; apps/web/lib/user-connector-tools.ts mcp_tool_result).
- Shared completeness checks: empty output, blocked, cancelled, max-output finish reasons (apps/web/app/api/llm/v1/chat/completions/lib/turn-completeness.ts:10-60); used by the tool loop and the research loop (research-loop.ts:110-115).
- Empty provider step: failover to another route happens only for the Auto model or a same-route clean retry (tool-loop.ts:4490-4503).
- Rust engine: iteration limit 25 by default, runaway guard for identical calls, budget guard, cancellation guard and a join_all parallel batch (crates/agiworkforce-agent-core/src/runaway.rs:11; engine.rs:56-272).

**Incomplete**

- Not every result is wrapped as untrusted: wrapping was established for tool errors, fetched pages, stored result pages and connector envelopes only; other platform tool outputs were not shown to be wrapped (tool-loop.ts:2230-2240).
- Rust engine parallel batch is unbounded join_all and only when the session skips approval (crates/agiworkforce-agent-core/src/engine.rs:150-165; apps/cli/src/agent/chat.rs:2762-2781).
- Dependency-aware ordering: no code found, matching brief S92.12 'not applicable anywhere'.

**Present but disconnected or switched off**

- Parallel read-only execution is off for routes whose harness does not declare parallelToolCalls (tool-loop.ts:5398-5403).
- Step-limit pause needs onStepBudgetCheckpoint; callers that do not pass it get the terminal error (tool-loop.ts:7910).

**Not available**

- Dependency-aware scheduling on any app (brief S92.12).
- Sub-agent coordination on the hosted platform (brief S92.24; the Rust engine has a 'task' class for the CLI, apps/cli/src/agent/chat.rs:2762-2770).

## 4. Required behaviour

**Established requirements**

- The runtime loops model call, tool calls, results, model until done, within step and time limits. (source: Brief S92.10)
- Independent parallel-safe calls run concurrently; unsafe ones one at a time. (source: Brief S92.11)
- Cancelling a run stops the model stream and in-flight tools and settles the run as cancelled. (source: Brief S92.20)
- One evaluator decides whether a turn finished, came back empty, was blocked, cancelled or cut off for every path that persists a turn. (source: Brief S92.26)
- A single dispatcher routes each call to its executor. (source: Brief S92.06)
- Tool outputs are normalised into a bounded, redacted result with an error flag before reaching the model. (source: Brief S92.07)
- Dependency-aware execution is not applicable anywhere. (source: Brief S92.12)

**Acceptance criteria**

1. A chat with default settings stops after 10 steps by pausing (with a checkpoint handler) or by error code max_agent_steps_reached (without).
2. Two read-only calls in one step run together only when the route supports parallel tool calls; otherwise one after another.
3. A write call never runs at the same time as another call.
4. Pressing stop before a mutating call starts produces 'was not run: the user stopped this run before it started' for that call.
5. A tool exceeding 120 s returns a timeout message to the model; a write returns an unknown-outcome message.
6. A turn with no text, no tool call, no file and no card counts as empty and is not saved as a blank answer.
7. A cancelled finish reason is classed as cancelled.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Order of results follows read-only first then mutating, not the model's original order [inferred from tool-loop.ts:5729-5747].
- A tool-heavy run gets 100 steps only in AGI Work mode [inferred from tool-loop.ts:901-905].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the person why a run is serial (route lacks parallel support).
- [proposed] Wrap every tool result in one untrusted envelope and test it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | runToolLoop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | The hosted multi-round loop (lines 3836-7993) |
| service | runAndStreamToolCalls | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Splits read-only and mutating calls, runs them, emits events (line 5383) |
| service | runMcpTool dispatcher | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Routes a call to its executor (lines 2400-3020) |
| service | withToolTimeout | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Per-call deadline and unknown-outcome message (line 1711) |
| config | deadline policy | `apps/web/lib/deadline-policy.ts` | 300 s function limit, 60 s reserve, 120 s tool deadline |
| config | tool call limits | `packages/contracts/cloud-contracts/src/tool-call-limits.ts` | 32 calls per step; step defaults 10, 100, 20 |
| service | turn completeness | `apps/web/app/api/llm/v1/chat/completions/lib/turn-completeness.ts` | Empty, blocked, cancelled, truncated, empty-turn classification |
| service | runResearchLoop | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Deep Research loop with its own parallel limit 3 |
| service | loop routing | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop-routing.ts` | Decides whether a turn needs the loop and approval mode |
| config | harness features | `packages/ai/model-registry/catalog/harnesses.json` | parallelToolCalls feature per provider harness |
| service | run cancellation | `apps/web/lib/services/cloud-agent-run-service.ts` | requestCloudAgentRunCancellation (1174) and isCloudAgentRunCancellationRequested (1189) |
| service | durable workflow | `apps/web/lib/workflows/cloud-agent-workflow.ts` | Runs the loop as a durable run (named in brief S92.22; not opened) |
| service | Rust turn engine | `crates/agiworkforce-agent-core/src/engine.rs` | CLI and internal Tauri turn loop with cancel, budget and runaway guards |
| service | runaway tracker | `crates/agiworkforce-agent-core/src/runaway.rs` | Identical-call guard and iteration cap 25 |
| service | CLI turn host | `apps/cli/src/agent/chat.rs` | Classifies calls as task, concurrent-eligible or other (line 2762) |
| component | ToolCallTimeline (mobile) | `apps/mobile/src/features/chat/components/ToolCallTimeline.tsx` | Mobile tool step display |
| component | AgentActivityTimeline | `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx` | Shared activity list for web and others |
| test | tool-loop.cancellation test | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.cancellation.test.ts` | Cancellation reaching connector tools (describe at line 105) |
| test | tool-loop.deadline test | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.deadline.test.ts` | Deadline behaviour (by file name) |
| test | turn_loop test | `crates/agiworkforce-agent-core/tests/turn_loop.rs` | Rust engine turn loop (by file name) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Loop reads limits, checks cancel and pause, applies steer messages and the time budget. | our servers | tool-loop.ts:6697-6760 |
| A provider step is streamed through the shared adapter table; an empty step may rotate to another route. | outside service | tool-loop.ts:4386-4503 |
| Tool calls are parsed, gated and validated (F092-02, F092-05). | our servers | tool-loop.ts:7485-7520 |
| Read-only calls run with concurrency up to 4 (or 1), then mutating calls in order; each is run under a timeout and an abort signal. | our servers | tool-loop.ts:5729-5747,5721-5727 |
| Individual executors call outside services (web search, page fetch, connectors, sandbox). | outside service | tool-loop.ts:2663-2760,2860-3020 |
| Results are secret-checked, emitted as events and appended; the loop continues or ends. | our servers | tool-loop.ts:5814-5858 |
| Device-step tools are paused and sent to the person's own device to run, then results return. | device and our servers | tool-loop.ts:7740-7790 (device checkpoint) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run, events and checkpoints | cloud agent run tables (migrations 0061, 0062) read through cloud-agent-run-service | Yes, any device can reattach to the run | Approval checkpoints expire after 24 hours for claim (cloud-agent-run-service.ts:457); other retention unknown |
| Conversation messages including tool results | Chat storage (not opened) | Yes | With the conversation |

**Models and providers.** Any provider reachable through the adapter table; failover to another route on an empty step for Auto or clean same-route retry (tool-loop.ts:4490-4503). Parallel execution depends on the route harness feature parallelToolCalls (packages/ai/model-registry/catalog/harnesses.json:39,110,136,163,220).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; guests have a separate route (apps/web/app/api/llm/v1/chat/completions/guest) not examined. |
| Permissions | Per-tool permission levels and the account policy decide calls (F092-05). |
| Subscription | Free-trial flows cap web search and page fetch calls per turn (tool-loop.ts:4669-4677) and Free continuation retries exist (tool-loop.ts:4440-4470); the plan field allowToolUse exists (packages/contracts/types/src/model-catalog.ts:1106). Exact plan matrix not established. |
| Limits and metering | Steps 10, 100 or 20; 32 calls per step; 240 s loop; 120 s per tool; web search and fetch budgets per turn; usage of each provider step is recorded (tool-loop.ts:4669-4680). |
| Feature flags | Kill-switch AGI_DURABLE_INITIAL_TURNS controls durable transport (apps/web/app/api/llm/v1/chat/completions/route.ts:176-181 doc comment); AGI_RESEARCH_* env limits for research. |
| Model compatibility | Models must declare tool capability; parallel tools need harness support. |
| Provider restrictions | Parallel execution only for harnesses marking parallelToolCalls implemented (harnesses.json). |
| Local mode | This loop is Cloud only. The CLI runs its own loop locally against the model it is configured with (crates/agiworkforce-agent-core/src/engine.rs); mobile and desktop local inference loops were not examined. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Tool rows show 'running' with a parallel group id when run together | tool-loop.ts:5405-5430 |
| Empty turn | Counted empty when no text, tool call, file or card; truncated if no finish reason | turn-completeness.ts:41-60 |
| Blocked or refused finish | Classified content_blocked | turn-completeness.ts:75-86 |
| Cancel | flushTerminal('cancelled'); mutating calls not yet started are answered 'not run' | tool-loop.ts:5738-5742,6697-6700 |
| Timeout | Read: abandoned message. Write: unknown outcome, do not retry | tool-loop.ts:1702-1745 |
| Step limit | Pause with checkpoint or error max_agent_steps_reached | tool-loop.ts:7910-7973 |
| Time limit | Checkpoint for automatic continuation or an error | tool-loop.ts:6739-6775 |
| Repeated failures | A tool failing the same way repeatedly is withdrawn from the offer | tool-loop.ts:5769-5776 |
| Provider failure on step | Same-route retry for Free web turns, failover for others | tool-loop.ts:4440-4503 |
| Offline or reconnect | Durable runs can be reattached through the run journal; reaper settles stuck runs | route.ts:176-181; brief S92.30 cites apps/web/lib/services/cloud-agent-run-reaper.ts (not opened) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.e2e.test.ts`: Loop end to end (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.cancellation.test.ts`: Cancellation reaching connector tools
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.deadline.test.ts`: Deadlines (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.empty-response.test.ts`: Empty provider responses (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.incomplete-turn.test.ts`: Incomplete turns (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/turn-completeness.test.ts`: Shared turn classification (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.hardening.test.ts`: Names isParallelSafe or concurrency terms (grep hit); contents not opened
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.resume.test.ts`: Resume after pause (by file name)
- `crates/agiworkforce-agent-core/tests/turn_loop.rs`: Rust turn loop (by file name)

**Test scenarios**

- **Step limit pause**
  1. Run a task in chat with a model that keeps calling a tool.
  2. Reach 10 steps.
  - Expected: Run pauses with 'Paused at the 10-step execution limit' where a checkpoint handler exists; otherwise error max_agent_steps_reached.
- **Parallel reads**
  1. Choose a route whose harness supports parallel tool calls.
  2. Ask for two independent searches.
  - Expected: Both show 'running' with the same parallel group before either finishes.
- **Serial when unsupported**
  1. Use a route without the parallel feature.
  2. Ask for two independent searches.
  - Expected: One runs after the other.
- **Stop mid-run**
  1. Start a multi-tool task.
  2. Press stop while a write is queued.
  - Expected: Task state cancelled; unstarted writes report 'was not run: the user stopped this run'.
- **Tool timeout**
  1. Use a tool that does not return within 120 s.
  - Expected: Timeout message; for a write, an unknown-outcome message.
- **Empty turn**
  1. Force a model to return no text and no tools.
  - Expected: Turn classified empty and a failover or error message appears, not a blank answer.

**Where to look when it fails**

- Log '[tool-loop] max steps reached without terminal stop' and '[tool-loop] step budget reached ... pausing' (tool-loop.ts:7921-7975).
- Error code max_agent_steps_reached (tool-loop.ts:7971).
- Message text 'did not finish within' (tool-loop.ts:1702).
- Run state tables for runs and events (migration 0061).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Parallel execution silently depends on a harness flag; many routes run serially.** Affects: Web Cloud chat. Evidence: tool-loop.ts:5398-5403. Work needed: Report the effective concurrency in diagnostics and verify with a run.
- **Not all tool results are shown to be wrapped as untrusted data.** Affects: Web Cloud chat. Evidence: tool-loop.ts:2230-2240 only covers errors. Work needed: Audit each executor's output wrapping; add a test.
- **Brief line references for S92.06, S92.10, S92.11, S92.20 and S92.26 do not match current files; research-loop.ts:2399-2468 is provider stream code, not the completion check, which lives in turn-completeness.ts.** Affects: Documentation. Evidence: audit brief S92.26. Work needed: Refresh the brief.
- **Rust engine runs the concurrent batch with unbounded join_all.** Affects: CLI and internal desktop. Evidence: crates/agiworkforce-agent-core/src/engine.rs:150-165. Work needed: Add a cap and a test if needed.
- **Dependency-aware ordering and sub-agents are not implemented on the hosted platform.** Affects: All hosted apps. Evidence: Brief S92.12, S92.24. Work needed: Decide scope; product decision needed.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-inference-providers
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- F092-01
- F092-02
- F092-04
- F092-05
- F092-06
- surface:web
- surface:cli
- mode:cloud

## Unknown

- How the web stop control and mobile stop control are labelled.
- What the durable workflow does to cancel an in-flight tool beyond passing the abort signal.
- Whether every executor output is wrapped as untrusted data.
- Which routes have parallelToolCalls implemented in the generated registry (only harness catalog lines were seen).
- Local inference tool loops on mobile and desktop.
