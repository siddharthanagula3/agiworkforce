---
id: "SYS-agents-tools-and-automation"
type: "system"
title: "Agents, tools and automation"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Agents, tools and automation

Beyond answering, the assistant calls tools through one server loop in the web app. Web search, sandboxed code, Office files, images, schedules and AGI Work all run on our servers (mode:cloud) and are charged to the subscription. Desktop, Chrome and cloud-code steps run partly on the user's device. One three-level approval policy decides what runs without asking. Schedules and event triggers run unattended. Nothing here has a recorded real run. Several audit flaws are open.

## What it is and why it exists

The assistant can act, not only reply. This page covers the "beyond answering" abilities: a catalog of tools the model may call, web search, code in a sandbox, Office file creation, image generation, artifacts, multi-step Work, approvals, scheduled tasks and their runner, event triggers, the cloud coding agent, browser actions through the Chrome extension, and computer use.

Why: the product competes with Claude and ChatGPT, which ship the same abilities. Cost and risk differ per ability, so each has its own gate. Established rules that shape this page: execution boundaries are explicit, subscription rules come from one AGI Subscription system, and local inference is free of any paid subscription [requirement] (task brief; AGENTS.md section 6 on Local, BYOK and Managed Cloud trust boundaries).

Plan names. Plan tier ids and display labels differ. `free`=Free, `basic`=Basic, `pro`=Premium, `max`=Max, `max_15x`=Ultra, `team`=Team, `team_premium`=Team Premium, `enterprise`=Enterprise, plus `local-only` (Local Mode) and `byok` (Local Mode + BYOK) [code] (packages/contracts/types/src/billing-catalog.ts:169-227). This page uses tier ids in relationships and labels in prose.

Path note: the brief names apps/web/lib/chat/tool-loop.ts (not found), which does not exist. The real loop is `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` (7,993 lines) [code].

## How it works today

### The tool loop (all hosted tools)
The hosted chat endpoint `api:POST /api/llm/v1/chat/completions` (route.ts:1526) builds a tool list per turn, calls the model, and runs `runToolLoop`. The loop streams the model, pauses on tool calls, gates each call, executes it, appends results and calls the model again, up to a step budget. A step budget is cumulative; exhausting it pauses the run on a checkpoint instead of killing it [code] (tool-loop.ts:1-20).

Step limits are separate numbers: chat 10, caller-driven 20, Work 100, Cloud Code 12/24/48 (default 24), device steps per pause 8, tool calls per step 32 [code] (packages/contracts/cloud-contracts/src/tool-call-limits.ts:2-5; device-steps.ts:17; packages/contracts/types/src/cloud-code.ts:310-311). Planned Work steps are a different thing: the model plans up to 6 steps (`AGIWORK_PLAN_MAX_STEPS`, cloud-agent-runs.ts:84, minimum 3 in agiwork-plan.ts) and a stored plan holds up to 32 (work-plan-service.ts, `MAX_WORK_PLAN_STEPS`).

### Approvals: one gate, nine ranked rules
Every call goes through `resolveToolCallGate`. First matching rank wins [code] (apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:68-125):
1. User saved level `deny`: deny.
2. A device host is present and the tool is a device step: allow (the device side holds its own grant, see computer use below).
3. Saved level `allow` but the call completes the "lethal trifecta" (untrusted content in context, a reachable private source, and a tool that opens an outbound path): escalate.
4. Saved level `allow`: allow.
5. Saved level `ask`: ask.
6. Manual mode, no trifecta, and the account policy auto-approves this tool: allow.
7. Manual mode: ask.
8. Trifecta: escalate.
9. Otherwise: allow.

Escalate means ask a person; in an unattended run that cannot pause it means deny (tool-call-gate.ts:150-157).

The account policy has three values: `ask_every_time`, `auto_approve_read_only`, `autonomous` [code] (packages/contracts/types/src/tool-approval-policy.ts:3-7). If nothing is stored, a signed-in cloud account gets `autonomous` (line 13, used by `parseToolApprovalPolicy`, apps/web/shared/types/toolApprovalPolicy.ts:40-48). `ask_every_time` is the fail-closed value: no user, unreadable setting, or a workspace that forbids autonomy [code] (tool-approval-policy.ts:11, 93-101; web `loadToolApprovalPolicy` catch path, lib/tool-approval-policy.ts:56-62). Every workspace the user belongs to must permit autonomy (lib/tool-approval-policy.ts:33-41).

What the policy auto-approves (`policyAutoApprovesTool`, tool-metadata.ts:1083-1100): never a device step or a browser command; any tool flagged `autoInReadOnlyMode` (web search, page fetch, sandboxed code, places and maps); under `autonomous` any tool not destructive; under read-only any declared tool that is a read, reversible, and opens no outbound path. Destructive means: delete or external send, or a write or execute that cannot be undone (packages/contracts/types/src/tool-primitive.ts:163-176). So even under `autonomous`, `run_command`, `write_file`, `edit_file` and `delete_file` still ask (tool-metadata.ts:190-216, all `reversible:false`). MCP and connector tools are undeclared, so they force manual mode (tool-loop-routing.ts:56-65).

### Tool catalog (declared metadata)
`PLATFORM_TOOL_METADATA` declares each platform tool's action class, reversibility, whether it returns untrusted content, and whether it opens an outbound path (tool-metadata.ts:101-700+). Groups seen: directory and reconnect; web_search, url_fetch, search_maps, search_places, plan_itinerary, compare_products, render_answer_ui, ask_clarifying_questions; sandbox tools execute_code, run_command, write_file, edit_file, read_file, list_files, delete_file, create_folder; create_office_file; generate_image and edit_image; skill; memory tools (save, search, forget); search_files and open_file; create_schedule; draft_plugin; agi_work; `device_*` tools (files, calendar, reminders, shell, screen, mouse, keyboard, browser); and `browser_*` tools for the Chrome extension; then GitHub review tools. The listing was read to line 686 of 1,100; the tail is [unknown].

### Web search
Tool `web_search` returns up to 5 results per call, max 3 calls per turn (10 in a Work turn), query up to 400 chars, 15 s timeout (web-search-tool.ts:39-58). The configured backend is Perplexity's search API (web-search-providers.json; `PERPLEXITY_API_KEY`). Some providers also offer their own native search; a gated function tool replaces it when approval is needed (required-search.ts:336-368). Cost: paid plans and automated callers (API, CLI, VS Code, scheduled, Work, research) are charged to managed credits per call; Free is limited to 20 calls per rolling 30 days and also held against Free usage windows (search-budget.ts:32-33, 58-64, 109-123, 129-141).

### Code in a sandbox
Tools `execute_code`, `write_file`, `read_file`, `edit_file`, `list_files`, `create_folder` run in an E2B sandbox when `e2bProvisioningReady()` is true: needs `AGI_E2B_EXECUTION=1`, `E2B_API_KEY`, and a priceable compute rate (`AGI_E2B_COMPUTE_MICROUSD_PER_SECOND`) (lib/e2b/gate.ts:20-27). Otherwise, if the model supports it, the provider's own hosted code tool is used and code runs at the model provider, not in our sandbox (execution-tools.ts:204-266). One sandbox and kernel is reused per conversation, stored in Redis, paused at turn end, killed on conversation delete (runtime.ts header). Plan limits: Free 2 sandboxes and 60 min; Basic 5; Premium 10; Max and Ultra and Enterprise 20; all paid runs up to 24 h (billing-catalog.ts:531-532, 569-721; 473-476). Sandbox time is metered (`sandbox_compute`, compute-metering.ts). Unavailability causes shown to the user: not-configured, no-capacity, policy, over-quota, provider-error (e2b/unavailability.ts:10-16).

### Office files
Tool `create_office_file` builds Word, PowerPoint, Excel, PDF or CSV in the server process (docx, pptxgenjs, jsPDF libraries), verifies the package, and can edit an attached docx or xlsx; max generated file 20 MiB (managed-office-file-service.ts:123-155, 253; generated-file-persist.ts:17). Spreadsheets support real formulas and charts; recalculation and rendering use the sandbox template when configured (`officeRendering: e2bChatTemplate() !== null`).

### Image generation as a tool
`generate_image` and `edit_image` (one image per call) are offered only on surfaces web, desktop, mobile and chrome, only on plans with the `image_generation` capability (Premium and up), and only if image storage and a default provider are configured (image-chat-tools.ts:50-55, 107-130; billing-catalog.ts:341, 356). Each call uses account credits (tool description text). Results render as an interactive card.

### Artifacts
HTML, React, SVG, Mermaid, Markdown, text and code artifacts render in a separate-origin iframe (`infrastructure/sandbox/index.html`, deployed as its own Vercel project; web reaches it via `NEXT_PUBLIC_SANDBOX_ORIGIN`), speaking postMessage; the page's CSP blocks all network connections (index.html header; lib/artifact-sandbox.ts:3-14). Published artifacts get an unguessable URL stored in `public.published_artifacts`; they may use AI calls and saved data after publishing, up to 20 MB shared data and 20 MB per viewer, with plan caps on AI calls per app (50 Free to 600 Ultra) (chat-system-prompt.ts:130-146; billing-catalog.ts:530). Connected-app access in artifacts needs Premium+ (`artifact_connectors`).

### Work (AGI Work)
A chat request with `work_mode: 'agiwork'` needs Premium or higher (`agi_work`) or the server returns code `agi_work_plan_required` (request-processor.ts:1486-1503). `applyWorkMode` forces streaming, turns web search, fetch and code on unless the goal excludes them, and tells the model to always use tools (request-processor.ts:1463-1477). The run is a durable cloud run (tables `cloud_agent_runs`, `cloud_agent_events`); the plan is stored with revisions (`work_plans`, `work_plan_steps`, `work_plan_revisions`). Runs are listed via `api:GET /api/llm/v1/chat/completions/runs`; a stalled run is reaped by `/api/cron/reap-agent-runs` every 15 minutes (vercel.json).

### Approving a paused run
When a gated call needs a person, the server persists a checkpoint first, then streams an approval request. The client resumes with `api:POST /api/llm/v1/chat/completions/approve` carrying the run id and per-call decisions. Pending approvals expire after 24 hours (cloud-agent-run-service.ts:457). Device results come back on `api:POST /api/llm/v1/chat/completions/resume-device`; the server re-checks device pairing, presence and capability at resume (device-clearance-step.ts).

### Scheduled tasks and the runner
A task is a saved prompt with timing (once, interval, daily/weekly/monthly, cron, rrule, or event) plus caps, retries (0 to 5), a missed-run policy (`run_once` or `skip`), and a credit cap (schedule-service.ts:86-102, 139-167). Plan caps on tasks: Free, Local and BYOK 0; Basic 3; Premium 5; Max 15; Ultra 25; Team 10; Enterprise custom (billing-catalog.ts:584-721). Vercel cron calls `/api/cron/run-schedules` every 15 minutes (vercel.json:50-51). The route claims due rows 10 at a time in waves (max 50 per sweep, 55 s budget, 40 s per wave) and executes them inside that same request (cron route; schedule-service.ts:2471-2531). A claim uses `for update skip locked`, a 45 s lease, an idempotency key, and skips owners who may not run unattended or are not active workspace members (schedule-service.ts:1341-1400). Run now is `api:POST /api/schedules/{id}/runs`, executed in the request with a 40 s limit.

The executor (`scheduled-agent-executor.ts`) builds a tool plan from the model's capabilities, plan policy, connectors, web-domain policy, and the same account approval policy. A tool that would need approval is either withheld or the run pauses with status awaiting approval and a checkpoint, approved through `api:POST /api/schedules/{id}/runs/{runId}/approval`; an unanswered approval stops the run after 24 h (schedule-service.ts:80, executor lines 237-372, 374-400). Scheduled runs always use a managed cloud route (`admitManagedCloudRoute`, kind unattended; executor 783-822).

### Event triggers
Sources: gmail, slack, google_calendar, github, connector (cloud-contracts triggers.ts:9-15). A trigger binds an event to an existing scheduled task. Receivers: `api:POST /api/github/webhook`, `api:POST /api/webhooks/gmail`, `/api/webhooks/slack`, `/api/webhooks/google-calendar`, `api:POST /api/webhooks/connectors/{triggerId}` (signed). Ingest records the delivery (dedupes), checks verification, field conditions and debounce, enforces caps of 30 runs per hour and 720 per day per owner, then queues a job; the job creates a run keyed by event id and attempt and appends the event to the prompt (trigger-ingest.ts:361-420; trigger-fire.ts:85-170; billing-catalog.ts:480-482). Limit 50 triggers per account (trigger-service.ts:26). Gmail and Calendar triggers are refused while connectors are "coming soon" (`CONNECTOR_RELEASE_STATE = 'coming_soon'`, connector-release.ts:14; trigger-types.ts:22-30).

### Cloud coding agent (Code)
A Code session owns an E2B sandbox. `api:POST /api/code/sessions/{id}/agent` starts a turn in mode `agent` or `plan` with 12, 24 or 48 steps. The loop runs in `cloud-code-agent-loop.ts`; each shell command is classified: safe (read-only commands), requires approval (rm, mv, installs and builds, find with action flags), or denied (sudo, curl and wget, git push, hard reset, credential files) (cloud-code-agent-tools.ts:74-190). Approvals are stored in `cloud_code_agent_approvals` and decided via `api:POST /api/code/sessions/{id}/agent/approvals`. Network access setting: none, trusted, full (cloud-code.ts:4). Plan access: sandboxes above 0 and a daily harness ceiling above 0, so Basic and up (billing-catalog.ts:839-841); daily ceiling 1 USD Basic, 5 Premium, 25 Max, 75 Ultra (billing-catalog.ts:584-721). Stalled turns are reaped by `/api/cron/reap-code-turns`.

### Browser actions (Chrome extension)
Two paths. (1) Chat handoff: the web turn offers `browser_*` tools; the extension runs them on the user's tab and returns the result (extension chatBrowserTools.ts: at most 4 calls per handoff, 15 minute timeout). (2) Browser task: the extension's own agent loop (agentLoop.ts, default 20 steps) takes screenshots and acts through the Chrome DevTools Protocol debugger. The model call goes to our cloud, never to a local model, and the model must support tools, vision and streaming (cloudAgentClient.ts:60-100). Permission modes: `ask`, `auto` (default), `full`, `yolo` (askBeforeActing.ts:3-45). Some actions always ask (download, upload, sensitive input, banking/health/identity sites, payment, publish, purchase, terms, permission changes), and crucial ones ask even in auto mode (approvalPolicy.ts; crucialActions.ts). Site grants: the user approves origins and Chrome shows a debugging banner (browserControlConsent.ts:12-20).

### Computer use (desktop)
The Electron desktop captures the screen and sends input through a signed macOS helper; other platforms report unsupported (computerUseService.ts:1-20, 226-231). The cloud turn pauses with `device_*` steps; the desktop carries them out and posts results. The device needs the `computer.use` permission grant, shows a stop shortcut, and stops if the user touches the mouse or keyboard (computerUseSession.ts:96-100, 124-130, 255).

## Implementation map

| Ability | Where the code is | Runs where |
|---|---|---|
| Tool loop | file:apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts, tool-loop-routing.ts, tool-call-gate.ts, tool-metadata.ts, tool-approval-policy.ts | Our servers (Vercel, nodejs) |
| Policy values | file:packages/contracts/types/src/tool-approval-policy.ts, file:apps/web/shared/types/toolApprovalPolicy.ts | shared |
| Web search | file:apps/web/lib/web-search/web-search-tool.ts, search-budget.ts, required-search.ts, web-search-providers.json | Our servers call Perplexity |
| Sandbox code | file:apps/web/lib/e2b/ (gate.ts, runtime.ts, execution-tools.ts, compute-metering.ts, unavailability.ts) | E2B sandboxes; fallback provider-hosted |
| Office files | file:apps/web/lib/services/managed-office-file-service.ts, managed-office-preservation.ts, managed-workbook-builder.ts | Our servers |
| Images | file:apps/web/app/api/media/image/lib/image-chat-tools.ts | Our servers plus an image provider |
| Artifacts | file:infrastructure/sandbox/index.html, file:apps/web/lib/artifact-sandbox.ts, published-artifact-service.ts, artifact-runtime-service.ts | Browser iframe on a separate origin; server for publish and runtime |
| Work | file:apps/web/lib/services/work-plan-service.ts, cloud-agent-run-service.ts, agiwork-plan.ts | Our servers, durable runs |
| Schedules | file:apps/web/lib/services/schedule-service.ts, scheduled-agent-executor.ts, app/api/cron/run-schedules/route.ts | Our servers via cron |
| Triggers | file:apps/web/lib/triggers/ (trigger-ingest, trigger-fire, trigger-service, github-events, gmail-watch) | Our servers |
| Cloud coding agent | file:apps/web/lib/services/cloud-code-agent-*.ts, cloud-code-session-service.ts | Our servers plus E2B |
| Chrome browser actions | file:apps/extension/src/features/computer-use/ (agentLoop, approvalPolicy, askBeforeActing, crucialActions, cdpDriver, cloudAgentClient) | Browser; model on our cloud |
| Desktop computer use | file:apps/desktop/electron/runtime/computerUseService.ts, computerUseSession.ts; device steps file:apps/web/lib/device-steps/ | Device; model on our cloud |
| Shared device contract | packages/contracts/local-runtime (name `@agiworkforce/local-runtime-contract`) | shared |
| Turn engine for native hosts | file:crates/agiworkforce-agent-core/src/engine.rs, file:packages/ai/agent-core/src | Rust (CLI, Tauri); TS context and memory helpers |
| Tool packages | packages/tools/apply-patch, browser-tool, mcp, skills | Device or server, per consumer |

Notes. The Rust agent-core engine does no I/O: it schedules tool calls (sub-agent batch, parallel read-only batch, sequential rest), detects runaway loops and budgets, and leaves model calls, tool execution and approvals to the host [code] (crates/agiworkforce-agent-core/src/lib.rs:1-30). `@agiworkforce/agent-core` (TS) holds context budgeting, memory and semantic decisions, not the hosted loop [code] (packages/ai/agent-core/src/index.ts:1-40). Which apps depend on each was found from package manifests only; how deeply each uses it is [unknown].

## Data and state

| Data | Where | Notes |
|---|---|---|
| Account approval policy | table:user_settings, `settings` JSON, namespace `tool-approvals`, key `defaultPolicy` | Read fresh each request and resume (tool-approval-policy.ts:44-63) |
| Saved connector tool levels | connector tool permissions, per user and org, plus per-conversation grants | allow, ask, deny (connector-tool-permissions.ts) |
| Approval checkpoints and runs | table:cloud_agent_runs, table:cloud_agent_events (migration 0061) | 24 h expiry |
| Work plans | table:work_plans, table:work_plan_steps, table:work_plan_revisions | max 32 steps |
| Schedules and runs | table:scheduled_tasks, table:scheduled_task_runs (0009, 0057), table:agent_approval_requests | RLS forced; a unique (task, idempotency key) stops double runs |
| Triggers | table:event_triggers, table:event_trigger_events | deliveries deduped |
| Code sessions | table:cloud_code_sessions, cloud_code_environments, cloud_code_agent_turns, cloud_code_agent_steps, table:cloud_code_agent_approvals | |
| Published artifacts | table:published_artifacts, table:live_artifacts, table:artifact_comments | |
| Generated media and files | table:media_assets; generated files persisted by generated-file-persist.ts | 20 MiB per generated file |
| Usage and cost | table:managed_usage_requests (usage jsonb), cogs ledger, credit ledger | search, sandbox and image charges settle here |
| Sandbox session map | Redis (session-store.ts) | conversation to sandbox id |
| Chrome browser state | store:chrome.storage.local keys `agi_cu_ask_before_acting`, `agi_cu_browser_control_consent`, `agi_scheduled_task_runs_v1` (max 50) | per browser profile |
| Desktop grants | desktop permission store, grant `computer.use` | on the device |

Settings names only; no secret values recorded. Vendor and feature configuration names: `AGI_E2B_EXECUTION`, `E2B_API_KEY`, `AGI_E2B_COMPUTE_MICROUSD_PER_SECOND`, `PERPLEXITY_API_KEY`, `GMAIL_PUBSUB_TOPIC`, `AGI_MANAGED_COMPUTE_PRIVATE_BETA`.

## Rules: access, plans, modes

Modes. All hosted abilities in this page run in mode:cloud (our servers, charged to the AGI Subscription). Scheduled tasks and event triggers are cloud-only: the CLI client returns a `NotManaged` error outside managed cloud mode (apps/cli/src/schedules.rs:42-43, 234) [code]. The public Desktop is the hosted web app plus a device-capability host; it rejects local inference and accepts no provider key, per a repository document [requirement] (docs/architecture/desktop-local-runtime.md:7-12; not verified in electron code by me). A desktop-only Local routines panel exists (apps/web/features/schedules/components/LocalRoutinesSection.tsx) [code]; what it runs and how is [unknown]. mode:own-key (BYOK) and `local-only` plans get 0 sandboxes and 0 scheduled tasks (billing-catalog.ts:584-615).

Subscription entitlements by ability (tier ids):

| Ability | Free | Basic | Premium (`pro`) | Max / Ultra / Team Premium / Enterprise |
|---|---|---|---|---|
| Chat tools (search, fetch, code, office) | yes (`chat_tools`) | yes | yes | yes |
| Web search | 20 calls per 30 days, held against Free windows | credits | credits | credits |
| Sandbox code | 2 sandboxes, 60 min | 5 | 10 | 20 (Team 10) |
| Image generation | no | no | yes | yes |
| AGI Work | no | no | yes | yes |
| Scheduled tasks | 0 | 3 | 5 | Max 15, Ultra 25, Team 10, Enterprise custom |
| Connectors | no | yes | yes | yes |
| Cloud coding agent | no | yes (1 USD/day ceiling) | yes (5) | Max 25, Ultra 75 |
| Video generation | no | no | no | Ultra and Enterprise only |

Source: billing-catalog.ts:323-370 (capability tiers) and 584-726 (limits) [code]. Connectors are globally "coming soon" except a short list of exact ids (connector-release.ts:14-33), so connector tools and Gmail or Calendar triggers are not live today [code]. Hosted tool use also requires the model to support tools (`capabilities.tools`) and the plan policy `allowToolUse` (scheduled-agent-executor.ts:250-251).

What approves what:
- Read-only tools (search, fetch, sandboxed code, maps): auto-approved under read-only and autonomous policies.
- Destructive sandbox tools and shell: always ask (even autonomous), unless the user saved `allow`.
- Connector and MCP tools: manual mode; user-saved level decides.
- Device steps: the server allows when a cleared device host is present; the device's own `computer.use` grant and stop control govern the action (tool-call-gate.ts:76-80; computerUseSession.ts).
- Browser commands from chat: never auto-approved by the policy (tool-metadata.ts:1086-1090); the extension applies its own permission mode.
- Scheduled and triggered runs: the same account policy applies; a tool that asks is withheld or pauses the run for approval; a trifecta escalation denies when the run cannot pause.
- Cloud coding agent: command classifier plus stored approvals.
- Workspace policy: a workspace can forbid autonomous approvals (then `ask_every_time`), restrict models, spend, event triggers and managed compute (lib/tool-approval-policy.ts:33-41; managed-compute-gate.ts).

## Differences between apps

| Ability | surface:web | surface:desktop | surface:mobile | surface:cli | surface:vscode | surface:chrome |
|---|---|---|---|---|---|---|
| Hosted tools in chat | yes | yes (hosted web app) | yes | local tools plus hosted | local tools plus hosted | managed chat |
| Image tool | yes | yes | yes | not offered by the chat tool (surface list excludes it) | not offered | yes |
| Device steps | none | desktop steps (macOS computer use) | phone steps only | none | none | none |
| Scheduled tasks | yes | yes | yes | client of hosted API | tree view | side panel list; journal of runs |
| Event triggers | yes | yes | absent | unverified | absent | absent |
| Computer use | absent | yes, macOS only | absent | absent | absent | browser only |
| Tool approvals | ApprovalInbox | approvalResolution | auto-approve settings | classifier in apps/cli/src/safety | approvalScope | approvalPolicy |

Basis: [code] (apps/web/app/api/media/image/lib/image-chat-tools.ts:50-55; apps/web/lib/device-steps/device-tools.ts:26-34 comment; apps/cli/src/schedules.rs:1-5) and [requirement-doc, may lag] docs/product/surface-feature-matrix.md (dated 2026-09-20; a present cell means located, not run).

CLI: runs tools on the machine with a sandbox mode of read-only, contained (default) or unrestricted, and a command-safety classifier (apps/cli/src/sandbox.rs:1-30; safety/mod.rs:32). The matrix lists CLI image generation as Present, but the chat image tool excludes the CLI surface; the CLI may use another path [unknown]. Local-inference execution of tools on CLI, mobile and desktop is outside this page's evidence [unknown].

## Failure handling

- Sandbox unavailable: the model gets a message naming the cause and is told not to retry on that turn (unavailability.ts:35-52). It does not fall back mid-turn to the provider's code tool.
- Search budget unreadable or Free quota used: the call is refused (`blocked`, search-budget.ts:129-141). Reserved charges use a 300 s lease and an idempotency key `search:{request}:{call}`.
- Approval never answered: the run stops after 24 h with a message (schedule-service.ts:80).
- Scheduled run fails: retry up to 5 times with backoff 60 s to 24 h (default 300 s); missed runs follow `run_once` or `skip`; stale claims are recovered at the next sweep (schedule-service.ts:84-90, 2471-2495).
- Sweep too long: the cron route logs that schedules are still due and returns `drained:false`.
- Policy refusal in a background run is recorded as a cancelled run with a reason (`managed_compute_access_denied`, `secret_handling_blocked`) (schedule-service.ts:225-258).
- Trigger delivery: states filtered, fired, failed, dead; a debounced event notes the cap; duplicate deliveries are ignored (trigger-ingest.ts:361-420).
- Device step: pairing revoked, device missing or remote work off gives `withdrawn` with a reason; the turn pauses, not fails (device-registry.ts:396-420).
- Chrome: model must support tools, vision and streaming or the task refuses; step limit message at 20 steps (agentLoop.ts:1294-1296).
- Computer use: user input or stop shortcut stops the run; unsupported OS returns a reason.

## How it should work

[requirement] The product requirement ledger lists items per area. Relevant files: knowledge-base/10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md, 059-approvals-and-human-in-the-loop-ui.md, 060-agentic-work-product.md (34 items), 063-routines-schedules-and-triggers.md, 064-browser-assistant-experience.md, 065-computer-use-experience.md (29 items). The ledger records these as acceptance criteria, for example computer use needs guided setup, app allow and block lists, monitor choice and a stop control. Per its own status lines, web is missing for computer use and the desktop covers most items.

[requirement] Execution boundaries must be explicit and Local, BYOK and Managed Cloud stay separate; nothing silently moves a Local chat to cloud (AGENTS.md section 6). Today every tool on this page is mode:cloud, so the boundary is clear for them.

[requirement] An action a user cannot undo asks first and names the consequence (AGENTS.md section 9). The metadata table follows this: irreversible writes, deletes and sends always ask.

[proposed] State one boundary table in product copy: which tools leave the device (all hosted tools, Chrome model calls, device-step screenshots) and which stay (CLI local tools, device grants). [proposed] Make the fallback explicit: if the sandbox is off, say the code runs at the model provider.

## Gaps

Open audit rows (document-based, not re-verified here; code wins if they disagree) in audit/registers/known-flaws.md:
- WEB-E2B-UNSCOPED-COMPUTE-01 (High): a completion with no conversation id can run code with no sandbox quota check or billing.
- WEB-CODE-WILDCARD-EGRESS-APEX-ONLY-01 (High): a `*.example.com` extra host resolves only the apex, so private subdomains could be allowed.
- WEB-CODE-RUN-LEASE-SHORTER-THAN-TURN-01 (High): a Code turn may run 740 s while the session lease expires at 420 s.
- WEB-TRIGGER-WORKSPACE-POLICY-BYPASS-01 (Medium): workspace Event triggers switch gates only creation; existing triggers keep firing.
- WEB-DEPARTED-MEMBER-SCHEDULES-01 (Medium): removed members' schedules stay enabled and never run silently.
- SCHEDULE-POLICY-REFUSAL-AS-SUCCESS-01 (Medium): source fixed, runtime acceptance open.
- WEB-TOOL-RISK-TIER-MISMATCH-01 (Medium): two functions rate the same connector tool differently.
- WEB-AGENT-RULES-IN-BACKGROUND-RUNS-01 (Medium): scheduled runs skip the agent's effort level.

Other gaps seen in code: connectors are coming soon, so Gmail and Calendar triggers and connector tools are not live [code]. Computer use is macOS only. The public Desktop has no local inference, which sits against the requirement that local inference on desktop is free [requirement vs code, see open questions]. No verification run is recorded for any ability here.

## How to verify

Implementation status (code present and connected) is separate from verification status (anyone ran it). Everything above is read from code; nothing is [executed]. The audit checks that a document records a real run was not found for these abilities (the live-check files were listed, not opened).

Read-only checks an engineer can do:
1. Gate order: read tool-call-gate.ts:68-125 and its tests under apps/web/app/api/llm/v1/chat/completions/__tests__.
2. Tool metadata: tool-metadata.ts:101 onward; policy function at 1083.
3. Schedule claim and quota: schedule-service.ts:868-903, 1341-1412; tests test:apps/web/lib/services/schedule-service.test.ts, schedule-service.policies.test.ts, scheduled-agent-executor.test.ts, scheduled-agent-executor.tools.test.ts.
4. Search allowance and pricing: test:apps/web/lib/web-search/search-budget.test.ts, web-search-tool.test.ts, required-search.test.ts, web-search-pricing.test.ts.
5. Office: test:apps/web/lib/services/managed-office-file-service.test.ts, managed-office-preservation.test.ts.
6. Triggers: tests under apps/web/lib/triggers/__tests__.
7. Cron registration: apps/web/app/api/cron/cron-registration.test.ts against vercel.json.
8. Chrome: tests under apps/extension/__tests__ and src/features/computer-use.

To run it for real (the owner's call, nothing here did): build the compiled web app against a local database, seed Free and Premium accounts, trigger `/api/cron/run-schedules` with the cron secret, and drive Desktop and Chrome with a human-style check, per project guidance (memory: local testing, human-style verification).

## Key facts

| Fact | Basis | Source |
|---|---|---|
| The hosted tool loop lives at apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts; the path given in the brief (apps/web/lib/chat/tool-loop.ts) does not exist. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1-20` |
| Account tool-approval policy has three values: ask_every_time, auto_approve_read_only, autonomous. A signed-in cloud account with nothing stored defaults to autonomous; ask_every_time is the fail-closed fallback. | read in the code | `packages/contracts/types/src/tool-approval-policy.ts:3-13`; `apps/web/shared/types/toolApprovalPolicy.ts:40-48`; `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:44-63` |
| A workspace that forbids autonomous approvals drops a member from autonomous to ask_every_time (not to read-only); every workspace the user belongs to must allow autonomy. | read in the code | `packages/contracts/types/src/tool-approval-policy.ts:91-101`; `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:33-41` |
| The per-call gate is a nine-row ranked table; escalation to a person becomes a deny in an unattended run that cannot pause. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:68-125`; `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:150-157` |
| Even under autonomous, irreversible writes, deletes, external sends and shell commands still ask; web search, page fetch and sandboxed code are flagged to run without asking under read-only. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:116-123`; `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:182-216`; `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:1083-1100`; `packages/contracts/types/src/tool-primitive.ts:163-176` |
| Device steps and browser commands are never auto-approved by the account policy; when a cleared device host is present the server gate allows device steps, and the device holds its own grant. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:1086-1090`; `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:76-80`; `apps/desktop/electron/runtime/computerUseSession.ts:96-100` |
| Step limits differ: chat 10, caller-driven 20, Work 100, Cloud Code 12/24/48 (default 24), 8 device steps per pause, 32 tool calls per step; Work plans hold 6 planned steps in the agent plan and up to 32 stored steps. | read in the code | `packages/contracts/cloud-contracts/src/tool-call-limits.ts:2-5`; `packages/contracts/cloud-contracts/src/device-steps.ts:17`; `packages/contracts/types/src/cloud-code.ts:310-311`; `packages/contracts/cloud-contracts/src/cloud-agent-runs.ts:84`; `apps/web/lib/services/work-plan-service.ts:25` |
| Web search uses a Perplexity search backend, returns at most 5 results per call and 3 calls per turn (10 in Work). | read in the code | `apps/web/lib/web-search/web-search-providers.json`; `apps/web/lib/web-search/web-search-tool.ts:54-58` |
| Free plan web search is capped at 20 calls per rolling 30 days; paid plans and automated callers (API, CLI, VS Code, scheduled, Work, research) are charged to managed credits per call. | read in the code | `apps/web/lib/web-search/search-budget.ts:32-33`; `apps/web/lib/web-search/search-budget.ts:58-64`; `apps/web/lib/web-search/search-budget.ts:129-141` |
| Code execution uses our E2B sandbox only when AGI_E2B_EXECUTION=1, an E2B key and a compute price are set; otherwise a capable model gets its provider's own hosted code tool, so code then runs at the model provider. | read in the code | `apps/web/lib/e2b/gate.ts:20-27`; `apps/web/lib/e2b/execution-tools.ts:204-266` |
| Sandbox limits by plan: Free 2 sandboxes and 60 minutes; Basic 5; Premium 10; Max, Ultra and Enterprise 20; paid runs up to 24 hours; Local and BYOK 0. | read in the code | `packages/contracts/types/src/billing-catalog.ts:473-476`; `packages/contracts/types/src/billing-catalog.ts:584-726` |
| create_office_file produces docx, pptx, xlsx, pdf and csv on the server, can edit an attached docx or xlsx, with a 20 MiB generated file cap. | read in the code | `apps/web/lib/services/managed-office-file-service.ts:123-155`; `apps/web/lib/services/managed-office-file-service.ts:253`; `apps/web/lib/server/generated-file-persist.ts:17` |
| The image tools are offered only on web, desktop, mobile and chrome surfaces, only on Premium and above, and only when image storage and a default provider are configured. | read in the code | `apps/web/app/api/media/image/lib/image-chat-tools.ts:50-55`; `apps/web/app/api/media/image/lib/image-chat-tools.ts:107-130`; `packages/contracts/types/src/billing-catalog.ts:356` |
| AGI Work needs Premium or higher; the server answers agi_work_plan_required otherwise. Work mode forces streaming and turns search, fetch and code on unless the goal excludes them. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1463-1503`; `packages/contracts/types/src/billing-catalog.ts:355` |
| Scheduled tasks are run by Vercel cron every 15 minutes; the run executes inside the cron request in waves of 10 (max 50 per sweep, 55 s budget). | read in the code | `vercel.json:50-51`; `apps/web/app/api/cron/run-schedules/route.ts:15-45`; `apps/web/lib/services/schedule-service.ts:2471-2531` |
| Scheduled task caps by plan: Free, Local and BYOK 0; Basic 3; Premium 5; Max 15; Ultra 25; Team 10; Enterprise custom. Create is refused above the cap. | read in the code | `packages/contracts/types/src/billing-catalog.ts:584-721`; `apps/web/lib/services/schedule-service.ts:877-903` |
| A paused scheduled run waits for approval for 24 hours, then stops; retries allowed 0 to 5 with backoff from 60 seconds to 24 hours. | read in the code | `apps/web/lib/services/cloud-agent-run-service.ts:457`; `apps/web/lib/services/schedule-service.ts:80`; `apps/web/lib/services/schedule-service.ts:84-90` |
| Scheduled runs use a managed cloud route and are cloud-only; the CLI returns NotManaged outside managed cloud mode. | read in the code | `apps/web/lib/services/scheduled-agent-executor.ts:783-822`; `apps/cli/src/schedules.rs:42-43`; `apps/cli/src/schedules.rs:234` |
| Event trigger sources are gmail, slack, google_calendar, github and connector; at most 50 triggers per account and 30 runs per hour / 720 per day per owner. | read in the code | `packages/contracts/cloud-contracts/src/triggers.ts:9-15`; `apps/web/lib/triggers/trigger-service.ts:26`; `packages/contracts/types/src/billing-catalog.ts:480-482` |
| Connectors are in the coming_soon state, so Gmail and Google Calendar triggers are refused at creation and connector tools are not generally live. | read in the code | `packages/contracts/types/src/connector-release.ts:14`; `apps/web/lib/triggers/trigger-types.ts:22-30` |
| Cloud Code agent classifies each shell command as safe, requires approval, or denied (sudo, curl, wget, git push, hard reset, credential files); Basic and up include it. | read in the code | `apps/web/lib/services/cloud-code-agent-tools.ts:74-190`; `packages/contracts/types/src/billing-catalog.ts:839-841` |
| Chrome browser actions call our cloud model (never a local one), require a model with tools, vision and streaming, and have four permission modes: ask, auto (default), full, yolo; payment, purchase, publish, upload, sensitive-site and similar actions always ask. | read in the code | `apps/extension/src/features/computer-use/cloudAgentClient.ts:60-100`; `apps/extension/src/features/computer-use/askBeforeActing.ts:3-45`; `apps/extension/src/features/computer-use/approvalPolicy.ts:3-22`; `apps/extension/src/features/computer-use/crucialActions.ts:11-31` |
| Desktop computer use works only on macOS through a signed input helper, needs the computer.use grant, and stops on a stop shortcut or any user mouse or keyboard input. | read in the code | `apps/desktop/electron/runtime/computerUseService.ts:226-231`; `apps/desktop/electron/runtime/computerUseSession.ts:96-100`; `apps/desktop/electron/runtime/computerUseSession.ts:255` |
| Artifacts render in a separate-origin sandbox page whose CSP blocks all network connections; published artifacts live in published_artifacts under an unguessable URL. | read in the code | `infrastructure/sandbox/index.html:1-40`; `apps/web/lib/services/published-artifact-service.ts:1-40`; `apps/web/db/neon/0095_published_artifacts.sql:47` |
| Three High audit rows are open for this area: unscoped sandbox compute with no quota check, wildcard egress resolving the apex only, and a Code lease shorter than the turn. | stated requirement | `audit/registers/known-flaws.md (WEB-E2B-UNSCOPED-COMPUTE-01, WEB-CODE-WILDCARD-EGRESS-APEX-ONLY-01, WEB-CODE-RUN-LEASE-SHORTER-THAN-TURN-01)` |
| No document read records a real run of any ability on this page; implementation status is code-read only. | unknown | `docs/product/surface-feature-matrix.md:1-30 states a Present cell was located, not exercised` |

## Open questions

- The brief's start file apps/web/lib/chat/tool-loop.ts does not exist; was a move intended, or is the real file under app/api/llm/v1/chat/completions/lib the owner's intended subject?
- Does the page id SYS-chat-turn-pipeline exist in the knowledge base? I used it only as named in the brief.
- What does the desktop Local routines panel (LocalRoutinesSection.tsx) run, and where, given the public Electron app reports no local inference? Not read.
- Product choice: the requirement says local inference on desktop is free of any paid subscription, but docs/architecture/desktop-local-runtime.md says the public Electron app rejects all local inference. Which holds? I did not verify the Electron code.
- Does the CLI have a separate image path? The matrix lists CLI image generation Present while the chat image tool excludes the CLI surface.
- Tool catalog entries after line 686 of tool-metadata.ts (GitHub, memory, plugin and connector tools) were not read.
- Whether the E2B flag and compute price are set in production is unknown; so is whether the provider-native code tool is the live path today.
- How mobile approves tools in detail (settings/auto-approve.tsx) and how VS Code applies approvalScope was not read beyond file existence.
- Whether the Chrome extension can create or approve scheduled runs beyond the run journal (scheduled-task-runs.ts) is not established.
- The apps/web/app/api/agents/* routes and agent_tools tables (custom agents and tool executions) were listed but not read, so how they relate to the tool loop is unknown.
- Whether free-plan code execution is exposed in practice (Free has 2 sandboxes and 60 minutes in the catalog) depends on the free chat surface policy, not read.
- Product choice left open by code: autonomous is the cloud default for new accounts; whether that is the intended long-term default is not stated in a requirement I read.

## Project documents found out of date

- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts (file header comment)`: Says the safety model is default fail-closed with every tool call queued awaiting approval and manual as the default approval mode. The code says: The approval mode follows the account policy: auto when every offered tool is auto-approved by the policy, manual otherwise. A signed-in cloud account with no stored setting gets autonomous. Only MCP, connector and irreversible tools force manual. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop-routing.ts:56-65,144-151; packages/contracts/types/src/tool-approval-policy.ts:11-13; apps/web/shared/types/toolApprovalPolicy.ts:40-48)
- `docs/product/surface-feature-matrix.md (last updated 2026-09-20)`: Lists CLI image generation as Present and Chrome event triggers as Absent without the later Chrome run journal; its dated cells predate recent commits such as unattended browser tasks. The code says: The chat image tool is offered only on web, desktop, mobile and chrome; the Chrome extension keeps a scheduled-task run journal (scheduled-task-runs.ts). (apps/web/app/api/media/image/lib/image-chat-tools.ts:50-55; apps/extension/src/features/background/scheduled-task-runs.ts:1-30)
