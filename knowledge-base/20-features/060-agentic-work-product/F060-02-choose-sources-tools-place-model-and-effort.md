---
id: "F060-02"
type: "feature"
title: "Choose sources, tools, place, model and effort"
aliases: ["Choose sources, tools, place, model and effort", "Tools this task may use", "excludedTools", "Use this computer (device steps)", "Model picker", "Effort / thinking effort", "@ mentions", "Add working folder"]
area: "60 Agentic work product"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S60.05", "S60.06", "S60.07", "S60.08", "S60.09"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-local-inference", "SYS-execution-boundaries", "SYS-connectors-plugins-and-skills", "SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "F060-01", "surface:desktop", "mode:cloud", "plan:pro", "table:cloud_agent_runs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F060-02 Choose sources, tools, place, model and effort

Before an AGI Work run starts, the person can pick what it may read (project, files, connectors, folder), switch web search or code execution off, pick the model and the reasoning effort. Web and desktop have all of these; mobile has only a model and a project; Chrome has model and effort. Only desktop can let the run use the computer.

Area: [60. Agentic work product](README.md). Requirement items: [S60.05](../../10-requirements/capabilities/060-agentic-work-product.md#s6005), [S60.06](../../10-requirements/capabilities/060-agentic-work-product.md#s6006), [S60.07](../../10-requirements/capabilities/060-agentic-work-product.md#s6007), [S60.08](../../10-requirements/capabilities/060-agentic-work-product.md#s6008), [S60.09](../../10-requirements/capabilities/060-agentic-work-product.md#s6009).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets the person bound a Work run: which sources it can use, which of two tool groups stay on (web search with fetch, code execution), whether device steps may run on this computer (desktop), which model runs it and how much reasoning effort it uses.

**Why it exists.** Work runs act with tools and spend usage credits. Scope controls reduce surprise and cost and keep private sources out unless chosen. (doc: docs/product/requirements.md:768-780 requires approval prompts for cloud spend and for sending local context to a provider.)

**Who uses it.** Paid users on web, desktop and mobile; Chrome users for model and effort.

**Problems it solves**

- Keep a task from searching the web or running code when the person does not want that.
- Choose a stronger or cheaper model for one task.
- Let the desktop app use approved local folders and apps, or keep the whole task in the cloud.

**Use cases**

- Draft a report from a project's files only: select the project, turn off web search.
- Analyse a spreadsheet in a chosen working folder on desktop with 'Use this computer' on.
- Run a quick low-effort task on a fast model.
- Run a long research task with high effort.

## 2. User experience

**Where to find it**

- Web and Desktop sources: project picker beside the composer, '@' mention popover (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2857-2872), plus menu rows 'Add photos & files', 'Add from library', 'Connectors', 'Add working folder', 'Attach from local folder' (ComposerPlusMenu.tsx:147-163).
- Web and Desktop tools: 'Add scope (optional)' then fieldset 'Tools this task may use' with checkboxes 'Web search and browsing' and 'Code execution' (ChatComposerNew.tsx:7298-7335; packages/ui/i18n/locales/en/v3.json agiWork.compose).
- Desktop place: plus menu toggle 'Use this computer', hint 'Lets AGI use your approved folders, apps and browser here. Off keeps the chat in the cloud.' Shown only inside the desktop shell (ComposerPlusMenu.tsx:180-182, 1288-1297; ChatComposerNew.tsx:6019, 6033-6036).
- Web and Desktop model and effort: model picker in the composer footer (apps/web/features/chat/components/Composer/ComposerFooter.tsx around 1615-1640); effort chosen with the thinking controls. Effort control labels: not traced.
- Mobile: model picker (global selected model; a non-cloud selection is replaced by the tier default Cloud model at start) and 'Project (optional)' chips in the New task sheet (startWork.ts:38-42; StartWorkSheet.tsx:183-229). No tools control (apps/mobile/src/features/tasks/agiWorkGoal.ts has no excluded tools).
- Chrome: model dropdown with effort badge next to the AGI Work toggle (side_panel.ts:11378-11395).
- CLI: `--model`, `--effort` flags and `/effort`, `/tools`, `/model` commands, and '@' mention popup in the terminal UI (apps/cli/src/lib.rs:346-350; apps/cli/src/claude_parity.rs:178-183, 278). These drive the local CLI agent, not an AGI Work run.
- VS Code: settings agiWorkforce.model and agiWorkforce.agent.effort (apps/extension-vscode/src/extension.ts:433-434, 465). These drive the local agent, not AGI Work.

**Before you start**

- Work mode on (web/desktop/Chrome) or the mobile New task sheet (see F060-01).
- Desktop host declaration with at least one granted folder or capability for the 'Use this computer' row to have any effect (apps/web/lib/device-steps/host-headers.ts:38-54).

**Screens and controls**

- 'Tools this task may use' checkboxes (both on by default; unchecking adds the tool to excludedTools).
- 'Use this computer' toggle (desktop only).
- Model picker and effort control.
- Project picker, '@' mention, plus menu rows.

**Journey**

1. Open the composer in Work mode.
2. Choose sources: pick a project, add files or a folder, mention items with '@', keep or disable connectors.
3. Open 'Add scope (optional)' and untick tools that must stay off.
4. On desktop, set 'Use this computer' on or off.
5. Pick the model and effort in the footer.
6. Send. The request carries model, effort, excluded tools, project and device-host header.

**What the person sees and gets**

- The goal card in the task detail shows a 'Tools off: web search, code execution' line (agiwork-plan.ts:258-274).
- The Tasks list shows the model name of the run (TasksPage.tsx run row uses getManagedModelPresentationLabel(run.model)).
- When a device step is needed the run pauses and the task detail shows the device wait (cloud-agent-run-service.ts:515; mobile CloudRunDetailSheet shows 'Waiting for <device>').

**Settings**

- Account default tool approval policy (Ask, Auto, Skip) from the Work approval-mode control (ComposerPlusMenu.tsx:1904-1960).
- defaultWorkMode setting.
- Per-conversation connector switches (disabled_connector_ids in the request schema).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Excluded tools: the schema accepts web_search and code_execution only (agiwork-plan.ts:19, 32-35); applyWorkMode turns web search, fetch and code execution off accordingly (request-processor.ts:1466-1470); the planning prompt lists only the remaining tools (agiwork-plan.ts:103-122). File creation is always listed (line 108).
- Web composer sends the model, effort, project, connector switches and the device-host header on a Work send (useChatStream.ts:4663-4673; host-headers.ts:38-54).
- Desktop 'Use this computer' toggle controls whether device tools are declared; when off the declaration carries no device headers (host-headers.ts:41-47).
- The run row records provider and model (cloud_agent_runs, cloud-agent-run-service.ts:755-790) and the Tasks list shows the model and cost.
- Chrome sends effort and the selected model (freeTrialClient.ts:1601).
- Mobile picks the selected model if it is a Cloud model, else the tier default Cloud model (startWork.ts:38-42).

**Incomplete**

- Only two tools can be excluded; connectors and plugins are controlled elsewhere per conversation, not per task.
- Effort is sent with the request but is not stored on the run row (no effort column in cloud_agent_runs, cloud-agent-run-service.ts:98-125), so a later view cannot show the effort a run used.
- Web has no execution place picker beyond the desktop-only toggle; the toggle is per tool batch (device steps), not a whole-task 'cloud or this computer' choice. [inferred from host-headers.ts and the device checkpoint flow]
- Sources on Work runs: project and connectors are passed; whether files picked with '@' reach the Work run the same way as chat was not traced.

**Present but disconnected or switched off**

- The brief points to apps/desktop/electron/windowPolicy.ts:86 for location and parallel work and clarify. That file only decides which links open inside the app or externally (apps/desktop/electron/windowPolicy.ts:70-110), so it is not evidence for any of them.

**Not available**

- Mobile: no tool selection, no effort, no execution place.
- Chrome: no sources picker, no tool selection, no place.
- CLI and VS Code: model and effort apply to the local agent; no Work run exists to scope (doc: docs/product/experience-contract.md:635).

## 4. Required behaviour

**Established requirements**

- While composing a task the user can choose which sources it may use (project, files, connectors). Brief: web, desktop, CLI, VS Code done; Chrome missing (mobile not listed). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.05)
- The user can choose which tools the task may use before it runs. Brief: mobile and Chrome missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.06)
- The user can choose where the task executes (cloud sandbox versus this computer or another device). Brief: only desktop done. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.07)
- The user can pick the model (or profile) the task runs on, and the run records it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.08)
- The user can set reasoning effort for the task and it is sent with the run. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.09)
- Approval prompts are required for sending local workspace context to a provider and for Cloud spend or usage-credit actions. (source: doc: docs/product/requirements.md:768-780)
- Model and provider choices come from the generated catalog, never from literals in consumers. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. With 'Web search and browsing' unchecked, the request carries excludedTools web_search and the server turns web_search and web_fetch off.
2. With 'Code execution' unchecked, code_execution is false for the turn.
3. Both boxes unchecked still allows file creation; the planning prompt lists 'file creation'.
4. On desktop with 'Use this computer' off, no device-host header is sent; on, it is sent when at least one device tool is offered.
5. The run list shows the model that served the run.
6. The effort chosen reaches the request body (web, Chrome) and the model selected on mobile is a Cloud model.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Effort should be shown or stored with the run to satisfy 'the run records it' for effort; today only the model and provider are recorded. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a per-task tool list that includes connectors and a clear 'Where it runs' choice (Cloud, this computer) on web and mobile.
- [proposed] Record effort on the run row.
- [proposed] Give mobile the same 'Tools this task may use' control.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | AGIWORK_EXCLUDABLE_TOOLS | `apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts` | The two tool groups that can be excluded (line 19). |
| service | applyWorkMode | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Maps excluded tools to web_search, web_fetch and code_execution flags (lines 1463-1479). |
| component | Scope fields and tool checkboxes | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | 'Tools this task may use' checkboxes (lines 7298-7335) and state (885-889). |
| component | ComposerPlusMenu | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Sources rows, 'Use this computer' toggle, scope row, approval-mode control. |
| service | readChatHostContext | `apps/web/lib/device-steps/host-headers.ts` | Declares the desktop host (surface desktop, device-host header) only when device steps are wanted and offered (lines 38-54). |
| store | web-chat-store composer toggles | `apps/web/shared/stores/web-chat-store.ts` | Holds deviceStepsEnabled and work scope per conversation (line 104). |
| hook | useChatStream request build | `apps/web/lib/hooks/useChatStream.ts` | Sends model, effort, web_search, code_execution, mcp_context, disabled connectors (lines 4640-4680). |
| component | ComposerFooter model picker | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Model rows and Auto routing choice (lines 1615-1640). |
| service | cloudWorkModelId | `apps/mobile/src/features/tasks/startWork.ts` | Chooses the Cloud model for a mobile Work run (lines 38-42). |
| component | Project chips | `apps/mobile/src/features/tasks/components/StartWorkSheet.tsx` | Project (optional) selection (lines 183-229). |
| component | Side panel model and effort | `apps/extension/src/side_panel.ts` | Effort badge and model selector (lines 11378-11395). |
| service | Chrome request effort | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Adds effort to the request (line 1601). |
| command | CLI /effort and /tools | `apps/cli/src/claude_parity.rs` | Slash commands for the local CLI agent (lines 183, 278). |
| config | CLI --effort flag | `apps/cli/src/lib.rs` | Effort level with turn and token presets for the local agent (lines 346-350, 508-520). |
| config | VS Code agent settings | `apps/extension-vscode/src/extension.ts` | Listens for agiWorkforce.model and agiWorkforce.agent.effort changes (lines 433-434, 465). |
| table | cloud_agent_runs (provider, model) | `apps/web/lib/services/cloud-agent-run-service.ts` | Records provider and model for each run (lines 98-125). |
| service | Device step checkpoint | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Pauses a run for a step to run on the person's device (lines 7735-7790); TTL 15 minutes (cloud-agent-run-service.ts:515). |
| endpoint | POST /api/llm/v1/chat/completions/resume-device | `apps/web/app/api/llm/v1/chat/completions/resume-device/route.ts` | Resumes a run with the device step result (directory listing; handler not read). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person sets sources, tool switches, place, model and effort in the composer. | device | ChatComposerNew.tsx:885-889, 3905-3945 |
| Client builds the request. On desktop the host context decides whether the device-host header is attached. | device | host-headers.ts:38-54; useChatStream.ts:4546 |
| Server maps excluded tools to tool flags, routes the turn (task type agentic) to the chosen or auto-picked model, and builds the tool list. | our servers | request-processor.ts:1040, 1463-1479 |
| If the model calls a device tool, the run pauses with a device checkpoint and waits for the desktop to run the step, then resumes. | device and our servers | tool-loop.ts:7735-7790; cloud-agent-run-service.ts:515 |
| Model calls run on the routed provider with the chosen effort. | outside service | useChatStream.ts:4672-4673 sends effort; provider call in tool-loop.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Model and provider of the run | cloud_agent_runs | Yes | With the run |
| Excluded tools | journal goal event detail 'Tools off: ...' | Yes | With the run journal |
| Effort and device-steps toggle | Request only (effort); composer toggles in the browser store (deviceStepsEnabled) | No (not shown in code as synced) | Browser store; request not retained as a field |

**Models and providers.** The picker lists models from the generated catalog; Auto lets routing choose (doc: AGENTS.md section 4 and 7). Work turns are routed as the agentic type. Reasoning effort is passed as a free string and mapped per model by the server; mapping rules were not traced.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in managed account on a qualifying plan (see F060-01). |
| Permissions | Device steps need the desktop shell and granted folders or capabilities; the server also applies tool approvals (F060-06). Connector availability follows workspace policy (not traced in detail). |
| Subscription | Same agi_work gate as F060-01. Which models a plan may use is owned by the model catalog and plan lists; not traced here (unknown). |
| Limits and metering | Each model call is metered in managed credits; a stronger model costs more (doc: AGENTS.md section 7). Web search 10 calls and URL fetch 15 calls per Work turn (apps/web/lib/web-search/web-search-tool.ts:57; apps/web/lib/url-fetch/url-fetch-tool.ts:31). |
| Feature flags | Kill switch canUseAgiWork; per-capability flags for web search and code execution gate the tools at request-processor.ts:5217-5260 (kill-switch gate read). |
| Model compatibility | Tool-capable models only can act; unknown which catalog models are marked tool-capable. |
| Provider restrictions | Managed route. Own-key route for Work: unknown. |
| Local mode | Local models cannot run Work. Mobile replaces a local selection with a Cloud model. On desktop, 'Use this computer' lets a Cloud run use the computer through device steps; it does not make the model local. Local inference stays free and separate. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No folder or capability granted on desktop | Device-host header omitted; run stays in the cloud. | host-headers.ts:41-47 |
| Both tools excluded | Run still starts; planning prompt lists only file creation. | agiwork-plan.ts:103-122 |
| Device step not answered | Device checkpoints expire after 15 minutes. | cloud-agent-run-service.ts:515-530 |
| Selected model unavailable (mobile) | Falls back to the tier default Cloud model. | startWork.ts:38-42 |
| Plan changes mid-picker | Web resets to Chat when the capability disappears. | ChatComposerNew.tsx:1217-1231 |
| Offline | Not handled specially in the controls read; unknown. | not handled in the code read (no offline branch in the scope fields or host-headers.ts) |
| Accessibility | Tool checkboxes sit in a fieldset with a legend; toggle rows are menu items. Mobile has no tool control. | ChatComposerNew.tsx:7298-7335 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.test.ts`: Planning directive threads the goal and scope fields into the prompt.
- `apps/web/lib/feature-flags/__tests__/capability-kill-switch.test.ts`: Kill switch for the Work capability (matched by search).
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-turn-governor.capability.test.ts`: Tool turn governor behaviour (file exists; contents not opened).
- `apps/desktop/electron/__tests__/approvalReview.test.ts`: Desktop approval review (contents not opened); no test of the 'Use this computer' toggle was found.
- `apps/mobile/__tests__/start-cloud-work-run.test.ts`: Mobile model choice on a new-chat model.

**Test scenarios**

- **Exclude web search**
  1. On web in Work, open scope, untick 'Web search and browsing', send 'Find recent news'.
  2. Inspect the request and the goal card.
  - Expected: excludedTools holds web_search; the goal card says 'Tools off: web search'; the agent makes no search calls.
- **Use this computer on desktop**
  1. In the desktop app grant a folder.
  2. Turn 'Use this computer' on, send a Work task that reads the folder.
  3. Repeat with it off.
  - Expected: On: run pauses for a device step and resumes. Off: no device header, no device step.
- **Model recorded**
  1. Pick a specific model in the footer and send a Work task.
  2. Open the Tasks list.
  - Expected: The row shows that model's display name.
- **Mobile cloud model fallback**
  1. Select a local model on mobile.
  2. Start a task from the New task sheet.
  - Expected: The conversation uses the tier default Cloud model.
- **Effort reaches the server**
  1. Set a non-default effort on web and send Work.
  2. Capture the request body.
  - Expected: effort is present; confirm the server run row has no effort field (gap).

**Where to look when it fails**

- Journal goal event detail 'Tools off'.
- Browser store value deviceStepsEnabled; request header for the device host.
- Run row provider and model in cloud_agent_runs.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/060-agentic-work-product.md](../../70-qa/test-plans/web/060-agentic-work-product.md)
- Desktop: [70-qa/test-plans/desktop/060-agentic-work-product.md](../../70-qa/test-plans/desktop/060-agentic-work-product.md)
- Mobile: [70-qa/test-plans/mobile/060-agentic-work-product.md](../../70-qa/test-plans/mobile/060-agentic-work-product.md)
- Chrome: [70-qa/test-plans/chrome/060-agentic-work-product.md](../../70-qa/test-plans/chrome/060-agentic-work-product.md)

## 10. Gaps and dependencies

- **No whole-task place choice: web has none, mobile none, CLI and VS Code none; desktop has a per-device-step toggle.** Affects: Web, mobile, desktop users. Evidence: ComposerPlusMenu.tsx:1288-1297 is the only place control found. Work needed: Product decision on the choice (Cloud sandbox, this computer, another device) and a shared control.
- **Mobile has no tool selection and no effort; Chrome has no tool selection or place.** Affects: Mobile and Chrome. Evidence: agiWorkGoal.ts:1-20; freeTrialClient.ts:1594. Work needed: Add controls and send excludedTools and effort.
- **Effort is not recorded on the run.** Affects: All surfaces. Evidence: cloud-agent-run-service.ts:98-125 has no effort column. Work needed: Store effort with the run and show it in the task detail.
- **The brief marks CLI and VS Code done for sources, tools, model and effort, but those controls belong to the local agent, not to an AGI Work run.** Affects: CLI and VS Code. Evidence: doc: docs/product/experience-contract.md:635 N/A; no work_mode use found. Work needed: Clarify the brief.
- **Brief evidence for place uses windowPolicy.ts, which is not a place control.** Affects: Desktop status. Evidence: apps/desktop/electron/windowPolicy.ts:70-110. Work needed: Correct the brief to cite the 'Use this computer' toggle.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-local-inference
- SYS-execution-boundaries
- SYS-connectors-plugins-and-skills
- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- F060-01
- surface:desktop
- mode:cloud
- plan:pro
- table:cloud_agent_runs

## Unknown

- How effort strings map to provider settings per model.
- Whether '@' picked files reach a Work run the same way as chat.
- Which catalog models are tool-capable and so usable for Work.
- Handler details of the resume-device route.
- Effort control labels in the web footer.
- Whether any test covers the 'Use this computer' toggle.
