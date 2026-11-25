---
id: "F067-01"
type: "feature"
title: "Understand the repository"
aliases: ["Understand the repository", "Explain repository structure (S67.01)", "Find implementations (S67.02)", "Find references (S67.03)", "Trace call paths (S67.04)", "Answer repository questions (S67.05)", "AGI Code session", "Work with local code", "Ask about the repo"]
area: "67 Coding capabilities and developer workflows"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S67.01", "S67.02", "S67.03", "S67.04", "S67.05"]
depends_on: ["surface:desktop", "surface:web", "surface:cli", "surface:vscode", "surface:mobile", "mode:local", "mode:own-key", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-local-inference", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-sync-and-continuity", "file:apps/desktop/electron/runtime/developerSessionService.ts", "file:apps/cli/src/platform/runtime/tool_catalog.rs", "file:apps/web/lib/e2b/gate.ts", "plan:pro", "plan:max"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F067-01 Understand the repository

A person asks a coding agent about a project folder: where something lives, who calls it, how a request flows. The agent reads files with its read, search and list tools and answers. It runs on Desktop and CLI, in VS Code and, as a phone view, on Mobile. A Web browser tab can only use the cloud sandbox.

Area: [67. Coding capabilities and developer workflows](README.md). Requirement items: [S67.01](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6701), [S67.02](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6702), [S67.03](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6703), [S67.04](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6704), [S67.05](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6705).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person ask free-form questions about a code repository. The coding agent answers by reading the repository's files rather than guessing. It covers structure overviews, finding where a thing is defined, finding where a symbol is used, and tracing a call from entry point to effect.

**Why it exists.** The first step of almost every coding job is understanding unfamiliar code. The brief lists these five items as the read-only base of the coding area (doc: knowledge-base/data/area-briefs/067-coding-capabilities-and-developer-workflows.md S67.01 to S67.05). The product matrix records code sessions as present on Web, Desktop, Mobile, CLI and VS Code and absent on the Chrome extension (doc: docs/product/surface-feature-matrix.md:412-419).

**Who uses it.** Developers who open a folder in the Desktop app, the CLI or VS Code, and developers who watch or steer a Desktop session from the phone. New team members use it to learn a codebase.

**Problems it solves**

- Reading a large unfamiliar repository by hand is slow.
- Text search alone does not explain how parts fit together.
- A person away from the computer still wants to check what a session found.

**Use cases**

- On Desktop, open a folder and ask where the sign-in check is implemented.
- In the CLI, run a one-shot prompt asking for a map of the main parts of the repository.
- In VS Code, ask in the sidebar chat who calls a function.
- On the phone, open a running Desktop session and read the answer.

## 2. User experience

**Where to find it**

- Desktop (Electron shell): the Code page, chip labelled 'Work with local code', then a folder session panel (apps/web/features/code/code-surface.ts:116; apps/web/features/code/CloudCodePage.tsx:1949).
- Web in a plain browser: the /code page offers cloud sessions only; the setup chips are 'Terminal', 'VS Code' and 'Desktop app' (apps/web/features/code/code-surface.ts:112-114). The local folder panel is not reachable without the Desktop shell (apps/web/features/code/hooks/use-local-sessions.ts:121).
- CLI: the interactive agi session, or the non-interactive Exec subcommand with alias e (apps/cli/src/lib.rs:767).
- VS Code: the AGI sidebar chat; the editor commands 'Code: Explain Selection', 'Code: Explain Terminal Output' and 'Code: Explain Error' (apps/extension-vscode/package.json:137, 335, 345).
- Mobile: the screen titled 'AGI Code'; a session opens from the list, composer placeholder 'Message this session' (apps/mobile/src/features/companion/components/codeSessionTimeline.ts:8-13; packages/contracts/types/src/pairing.ts:30).
- Chrome extension: not available (doc: docs/product/surface-feature-matrix.md:419).

**Before you start**

- Desktop: an approved folder and the agent grant for that folder; without it the folder is listed with its sessions withheld (apps/desktop/electron/runtime/dispatcher.ts:985-1000).
- A model the session can reach: an on-device model, a provider the person signed in to in the CLI, or the account's cloud models, which need a plan with the developer_surfaces capability (apps/web/features/code/local-code.ts:708).
- Mobile: a paired computer that runs the session (packages/platform/utils/src/remoteControl/codeRemoteController.ts:44-46).
- Web cloud sandbox: the deployment must have the sandbox switched on and the plan must include AGI Code (apps/web/lib/e2b/gate.ts:20; apps/web/lib/services/cloud-code-github-task.ts:221, 236).

**Screens and controls**

- Desktop session panel: composer where Enter sends (SUBMIT_KEY is Enter, apps/web/features/code/components/LocalSessionPanel.tsx:159), turn controls to stop a running turn (LocalTurnControls, apps/web/features/code/components/LocalSessionPanel.tsx:1874), transcript, approval cards.
- Mobile session view: message field, 'Stop the current turn', 'Queue for after this turn', 'Jump to latest', 'Load earlier messages' (apps/mobile/src/features/companion/components/codeSessionTimeline.ts:11-30).

**Journey**

1. Open the Code page and choose a folder (Desktop) or start agi in the folder (CLI) or open the sidebar (VS Code).
2. Type the question in the composer and press Enter.
3. The agent calls read-only tools: read_file, grep_files, glob, list_directory (apps/cli/src/platform/runtime/tool_catalog.rs:240-250, 286).
4. The transcript shows the work and the answer. Stop the turn with the turn controls if it runs long.
5. Ask a follow-up, or open the same session on the phone to read it.

**What the person sees and gets**

- A transcript of tool calls and a written answer. Whether every claim cites file and line is decided by the model's answer, not enforced by code [inferred]; no code that enforces citations was found.
- On Mobile the working state shows 'Working' and a running-task count (apps/mobile/src/features/companion/components/codeSessionTimeline.ts:187-188).

**Settings**

- Agent mode on Desktop: plan, ask, auto, bypass; the keyboard cycle skips bypass (apps/web/features/code/local-code.ts:432-437; packages/contracts/local-runtime/src/developer-session.ts:25-30).
- Model chip in the session panel (apps/web/features/code/components/LocalModelChip.tsx, listed in the Code components folder).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop runs the folder's coding agent by spawning the AGI CLI in app-server mode inside the approved folder, and the Web code page talks to it through the desktop bridge (apps/desktop/electron/runtime/developerSessionService.ts:1453-1460; apps/web/features/code/hooks/use-local-sessions.ts:121).
- CLI has read, search and list tools: read_file, read_many_files, grep_files, glob, list_directory (apps/cli/src/platform/runtime/tool_catalog.rs:240-250, 262, 286). A read-only registry exists (apps/cli/src/features/exec/tools/mod.rs:498).
- CLI has language-server tools lsp_definition, lsp_hover, lsp_completion, lsp_document_symbols, lsp_diagnostics (apps/cli/src/platform/runtime/tool_catalog.rs:381-385; apps/cli/src/app_server.rs:120-124). No lsp references tool was found, so 'find references' is done by text search [inferred].
- VS Code starts the CLI app-server per workspace folder (apps/extension-vscode/src/integrations/localRuntimeClient.ts:2575; apps/extension-vscode/src/integrations/localRuntimePool.ts:19-30).
- Mobile reads and steers a session that runs on the paired computer: attach, steer, interrupt, answer approvals (apps/mobile/src/features/companion/components/CodeSessionView.tsx:33-40; packages/platform/utils/src/remoteControl/codeRemoteController.ts:44-46).
- Web cloud sandbox agent has read_file, list_files and write tools only; it has no dedicated search tool, but grep, rg and find are classed as read-only shell commands (apps/web/lib/e2b/execution-tools.ts:14-19; apps/web/lib/services/cloud-code-agent-tools.ts:57-68).

**Incomplete**

- Web in a plain browser cannot read a local folder; the draft claim of a paired desktop host is not supported by the code. The local panel needs the desktop bridge, which is null in a browser (apps/web/features/desktop-host/lib/host.ts:25-27; apps/web/features/code/hooks/use-local-sessions.ts:121).
- Web cloud sessions need the sandbox switched on: AGI_E2B_EXECUTION=1 plus E2B_API_KEY plus a priceable compute rate (apps/web/lib/e2b/gate.ts:20-30). Whether it is on in production is unknown.
- Code citations of file and line are a model behaviour; no check enforces them. Not found in the code read.

**Present but disconnected or switched off**

- Cloud sandbox path is off unless the gate passes (apps/web/lib/e2b/gate.ts:20-30; apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:101).

**Not available**

- Chrome extension has no code session (doc: docs/product/surface-feature-matrix.md:419).
- Mobile reads no repository by itself; it views a session on the computer or a cloud session (doc: docs/product/surface-feature-matrix.md:426-427 shows mobile absent for repository context).

## 4. Required behaviour

**Established requirements**

- The agent reads the repository and explains its main parts, entry points and how they fit. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.01)
- Asked where something is implemented, the agent finds the defining code and cites file and line. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.02)
- Asked where a symbol is used, the agent finds its references across the repository. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.03)
- The agent traces a call from entry point to effect. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.04)
- The agent answers free-form questions by reading files. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.05)
- Electron Desktop coding sessions run the CLI and can use a local model or a provider key set up there; Desktop chat is Managed Cloud only. (source: (doc: docs/decisions/wire-or-cut.md:15-19))

**Acceptance criteria**

1. On Desktop, in an approved git folder, ask 'where is X defined'; the answer names a real file that exists and contains X.
2. Ask on Desktop for the call path of a function; every file the answer names exists.
3. In the CLI with no network and an on-device model, the same question is answered and read tools run.
4. Stop a running turn from the turn controls; the turn ends and the transcript shows it stopped.
5. On the phone, open the session; the question and answer appear without re-asking.
6. In a plain browser tab, the Code page offers no local folder panel and shows the 'Desktop app' chip.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A read that fails should show as a failure notice, not be dropped. The session panel has a failure action component (apps/web/features/code/components/LocalSessionPanel.tsx:244-262), but I did not trace a failed read tool call to it. [inferred]
- An empty folder list should show a way to start a session; the Code page has a needsLocalFolder state (apps/web/features/code/CloudCodePage.tsx:1957) but its text was not read. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a symbol-aware references tool to the CLI so 'find references' does not rely on text search.
- [proposed] Check that each cited path:line in an answer exists before it is shown.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | CloudCodePage | `apps/web/features/code/CloudCodePage.tsx` | The /code page; picks local folder sessions on the Desktop shell and cloud sessions otherwise. |
| component | LocalSessionPanel | `apps/web/features/code/components/LocalSessionPanel.tsx` | Desktop folder session: transcript, composer, approvals, turn controls. |
| component | LocalTurnControls | `apps/web/features/code/components/LocalTurnControls.tsx` | Stop and steer controls for a running turn. |
| hook | useLocalSessions | `apps/web/features/code/hooks/use-local-sessions.ts` | Lists folder sessions through the desktop bridge; unsupported when there is no bridge. |
| service | developerSessionService | `apps/desktop/electron/runtime/developerSessionService.ts` | Spawns the CLI app-server in the approved folder and relays session events. |
| service | dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | Checks each developer_* command against the folder grant before running it. |
| service | agentAccess | `apps/desktop/electron/runtime/agentAccess.ts` | agentAllowedIn(rootId): whether the agent may run in a folder. |
| config | tool_catalog | `apps/cli/src/platform/runtime/tool_catalog.rs` | Names of the read, search, list and language-server tools and their aliases. |
| service | exec tools | `apps/cli/src/features/exec/tools/mod.rs` | Executes tool calls with approvals, workspace policy and privacy-mode checks. |
| command | agi exec | `apps/cli/src/lib.rs` | Non-interactive one-shot prompt (Exec subcommand, line 767). |
| integration | LocalRuntimePool and LocalRuntimeClient | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | VS Code starts the CLI app-server per workspace folder. |
| component | CodeSessionView | `apps/mobile/src/features/companion/components/CodeSessionView.tsx` | Phone view of a computer session: read, steer, interrupt, approve. |
| component | CodeSessionsCard | `apps/mobile/src/features/companion/components/CodeSessionsCard.tsx` | Session list and 'New session on this computer' form on the phone. |
| service | codeRemoteController | `packages/platform/utils/src/remoteControl/codeRemoteController.ts` | Bridges phone requests to Desktop sessions; start rate limits and redaction. |
| service | e2b gate | `apps/web/lib/e2b/gate.ts` | Decides whether the managed cloud sandbox is switched on. |
| service | cloud-code-agent-tools | `apps/web/lib/services/cloud-code-agent-tools.ts` | Classifies sandbox shell commands as safe, needs approval, or denied. |
| endpoint | POST /api/code/sessions/[sessionId]/agent | `apps/web/app/api/code/sessions/[sessionId]/agent/route.ts` | Runs a cloud agent turn when the sandbox is ready. |
| config | surface feature matrix | `docs/product/surface-feature-matrix.md` | Records which apps have code sessions. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person types a question in the Desktop session panel and presses Enter. | device | apps/web/features/code/components/LocalSessionPanel.tsx:159 |
| The desktop shell checks the folder grant for the agent, then relays the turn to the CLI app-server it spawned in that folder. | device | apps/desktop/electron/runtime/dispatcher.ts:985-1000; apps/desktop/electron/runtime/developerSessionService.ts:1453-1460 |
| The agent calls read-only tools on the folder (read, grep, glob, list). These read local files. | device | apps/cli/src/platform/runtime/tool_catalog.rs:240-250 |
| The agent sends prompts and tool results to the chosen model. For an on-device model this stays on the device; for the account's cloud models or the person's own provider it leaves the device. | outside service | apps/web/features/code/local-code.ts:552-554, 708-710 |
| For a cloud model on the account route, the model call goes through our servers under plan checks; the CLI signs in with a developer token the gateway admits only on plans with developer surfaces. | our servers | apps/web/features/code/local-code.ts:700-711 |
| On Mobile, the phone sends the follow-up through the remote-control link to the computer, which runs the turn; the phone shows the replayed transcript. | device and our servers | packages/platform/utils/src/remoteControl/codeRemoteController.ts:44-46; apps/mobile/src/features/companion/components/CodeSessionView.tsx:262 |
| On Web in a browser, a cloud session reads files inside a managed sandbox, not on the person's computer. | our servers | apps/web/lib/e2b/execution-tools.ts:14-19; apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:101 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Session transcript and tool records for a folder session | By the CLI on the person's computer; the desktop lists them per folder (apps/desktop/electron/runtime/dispatcher.ts:1000-1030). | Shown on the phone through remote control while paired; whether other sync exists is unknown. | Session delete and archive exist (apps/web/features/code/hooks/use-local-sessions.ts; apps/web/features/code/components/LocalSessionPanel.tsx onDeleted, onArchived props, lines 100-140 region); retention period unknown. |
| Cloud sandbox session and files | Our servers and the sandbox provider (apps/web/lib/services/cloud-code-session-service.ts). | Yes, it is a cloud record readable on web and phone. | Sandbox lifetime comes from the plan (getPlanSandboxTtlMs, packages/contracts/types/src/billing-catalog.ts:808); deletion detail unknown. |

**Models and providers.** The folder session lists the models the CLI can reach: on-device models, models of providers the person signed in to (own key), and the account's cloud models on the managed route (apps/web/features/code/local-code.ts:960-987). The model is chosen by the person in the session chip. Provider folders in the repo include ollama and lmstudio for on-device models and anthropic, openai, google and others for own key; which are wired to the CLI list is unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Folder sessions on Desktop: no account is needed to use an on-device model [inferred]; the account route needs sign-in. Whether the CLI app-server requires sign-in before a local model runs was not established. Cloud sandbox: signed-in account required (apps/web/app/api/code/sessions/[sessionId]/changes/route.ts:31 uses getUserScopedDb). |
| Permissions | Desktop: per-folder grant for the agent (apps/desktop/electron/runtime/agentAccess.ts:23). Reads of a running session need filesystem.read or the agent grant (apps/desktop/electron/runtime/dispatcher.ts:985-1000). CLI: workspace policy can deny or ask for any tool (apps/cli/src/features/exec/tools/mod.rs:592). |
| Subscription | Cloud models in a folder session need the developer_surfaces capability: plan:pro, plan:max, plan:max_15x, plan:team, plan:team_premium, plan:enterprise (packages/contracts/types/src/billing-catalog.ts:359). The cloud sandbox needs a plan with sandboxes and a code daily budget: plan:basic, plan:pro, plan:max, plan:max_15x, plan:team, plan:team_premium, plan:enterprise; not plan:free, plan:byok or plan:local-only (packages/contracts/types/src/billing-catalog.ts:594, 611, 628, 839). |
| Limits and metering | Phone-started sessions are limited to 10 starts per 10 minutes and 8 running at once (packages/platform/utils/src/remoteControl/codeRemoteController.ts:44-46). Sandbox count and daily code budget come from plan limits (packages/contracts/types/src/billing-catalog.ts:801-841). Metering for folder sessions on the account route is done by the gateway; details not read. |
| Feature flags | AGI_E2B_EXECUTION and E2B_API_KEY switch the cloud sandbox on (apps/web/lib/e2b/gate.ts:6-7). The managed-compute private beta gate is separate (apps/web/lib/e2b/gate.ts:34-36). |
| Model compatibility | Any model the CLI lists as reachable. A model the plan excludes is flagged plan_excludes_model with an upgrade action (apps/web/features/code/local-code.ts:621-622, 745-749). |
| Provider restrictions | A session cannot switch to a model in another trust boundary; the panel offers a new session instead (apps/web/features/code/components/LocalSessionPanel.tsx onNewSessionWith prop, lines 190-200 region). |
| Local mode | A folder session with an on-device model works with no paid plan: the plan line is shown only when the draft needs account cloud models, and the notice offers 'Upgrade' and 'Set up a local model' (apps/web/features/code/CloudCodePage.tsx:2120-2146; apps/web/features/code/local-code.ts:824-833). In the CLI, Local privacy mode blocks web_search, web_fetch, advisor and every browser tool, but not file reads (apps/cli/src/features/exec/tools/mod.rs:724-735). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No folder approved | Desktop page shows a needs-local-folder state. | apps/web/features/code/CloudCodePage.tsx:1957 |
| Folder not allowed to run the agent | Folder is listed with sessions withheld, offering the way to allow it. | apps/desktop/electron/runtime/dispatcher.ts:985-1000 |
| Plain browser (no desktop bridge) | Local sessions are unsupported and the page ends loading as settled. | apps/web/features/code/hooks/use-local-sessions.ts:152-155 |
| Plan does not include account cloud models | Notice with plan line, Upgrade and Set up a local model. | apps/web/features/code/CloudCodePage.tsx:2120-2146 |
| Turn failure | Failure action: Retry, Upgrade or a sign-in command to copy, depending on the failure. | apps/web/features/code/local-code.ts:680-691 |
| Mobile follow-up not confirmed | Draft kept; message says delivery is unconfirmed. | apps/mobile/src/features/companion/components/codeSessionTimeline.ts:19 |
| Offline or computer unreachable on Mobile | 'Not sent. Check the connection to your computer and try again.' | apps/mobile/src/features/companion/components/codeSessionTimeline.ts:17 |
| Cloud sandbox not ready | Request refused with a capability-unavailable error. | apps/web/app/api/code/sessions/[sessionId]/changes/route.ts:32-36 |
| Accessibility | Approval card: Escape denies when it is the only pending approval, Enter never allows. Other screen-reader behaviour of the transcript not read. | apps/web/features/code/components/LocalApprovalCard.test.tsx:44-60 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalSessionPanel.test.tsx`: The folder session panel (titles not read).
- `apps/web/features/code/hooks/use-local-sessions.test.ts`: Listing folder sessions through the bridge (titles not read).
- `apps/web/features/code/components/LocalApprovalCard.test.tsx`: Approval keys: Deny labelled with its key, Escape denies, Enter never allows.
- `apps/mobile/src/features/companion/components/__tests__/CodeSessionView.test.tsx`: Draft keeping, rejected follow-up restore, attach on open and detach on close, runtime stop message.
- `apps/mobile/src/features/companion/components/__tests__/codeSessionTimeline.test.ts`: Timeline building (titles not read).
- `apps/cli/tests/developer_session_host.rs`: The CLI developer session host (titles not read).
- `apps/web/app/api/code/sessions/route.test.ts`: Cloud session list and create route (titles not read).

**Test scenarios**

- **Where is it defined**
  1. On Desktop approve a git folder.
  2. Open a session with an on-device model.
  3. Ask where a named function is defined.
  - Expected: The answer names the file and line that really define it; read tools appear in the transcript.
- **Plain browser**
  1. Open the Code page in a normal browser tab, signed in.
  2. Look for the local folder panel.
  - Expected: No local folder panel; the 'Desktop app' chip is offered; cloud sessions need the sandbox switch.
- **Free account, no local model**
  1. Sign in on Desktop with a Free account.
  2. Start a session with a cloud model.
  - Expected: The plan notice with Upgrade and Set up a local model appears.
- **Phone view**
  1. Pair the phone.
  2. Start a Desktop session.
  3. Open it on the phone.
  - Expected: The question and answer appear; Stop the current turn works.
- **CLI Local privacy**
  1. Run agi in Local privacy mode.
  2. Ask a question that needs a web fetch.
  - Expected: Reads work; web_fetch is refused with the Local privacy message.

**Where to look when it fails**

- CLI refusal text: 'is unavailable in Local privacy mode' (apps/cli/src/features/exec/tools/mod.rs:732).
- Desktop: error code plan_excludes_model for plan limits (apps/web/features/code/local-code.ts:621).
- Cloud sandbox: capabilityUnavailable errors from the sessions routes (apps/web/app/api/code/sessions/[sessionId]/changes/route.ts:32-40).
- Nothing was run; no test result is recorded for this feature.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md)
- Desktop: [70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md)
- Mobile: [70-qa/test-plans/mobile/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/mobile/067-coding-capabilities-and-developer-workflows.md)
- CLI: [70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md)
- VS Code: [70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md)

## 10. Gaps and dependencies

- **Brief marks Web partial but the local path is Desktop-shell only; a browser tab has only the cloud sandbox, which depends on a deployment switch.** Affects: Web users in a browser tab.. Evidence: apps/web/features/code/hooks/use-local-sessions.ts:121; apps/web/lib/e2b/gate.ts:20-30. Work needed: Confirm production switch state, live-check /code, and state the Desktop-only limit in product copy.
- **Required file-and-line citing is not enforced by code.** Affects: All apps.. Evidence: No citation check found in apps/cli/src/features/exec/tools/mod.rs or the web session panel.. Work needed: Add a prompt rule or a post-check, then a test.
- **No symbol-aware references tool in the CLI tool list.** Affects: CLI, Desktop, VS Code.. Evidence: apps/cli/src/platform/runtime/tool_catalog.rs:381-385 lists definition, hover, completion, symbols, diagnostics only.. Work needed: Add or document text search as the method.
- **Whether the CLI app-server needs sign-in to run an on-device model is unproven, which matters for the 'local inference needs no subscription' requirement.** Affects: Desktop and CLI users on Free or signed out.. Evidence: No sign-in check was read in apps/cli/src/app_server.rs or developerSessionService.ts.. Work needed: Trace the app-server start path; add a signed-out local-model test.

**Depends on**

- surface:desktop
- surface:web
- surface:cli
- surface:vscode
- surface:mobile
- mode:local
- mode:own-key
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-local-inference
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-sync-and-continuity
- file:apps/desktop/electron/runtime/developerSessionService.ts
- file:apps/cli/src/platform/runtime/tool_catalog.rs
- file:apps/web/lib/e2b/gate.ts
- plan:pro
- plan:max

## Unknown

- Whether the cloud sandbox switch is on in production.
- Whether the CLI app-server needs account sign-in for an on-device model.
- Which providers the CLI model list actually includes.
- Retention period of folder session transcripts.
- Text of the empty-folder state on the Code page.
- Mobile Remote Control visibility in the shipped build was not established from code.
