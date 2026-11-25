---
id: "F021-07"
type: "feature"
title: "Run code from the chat"
aliases: ["Run code", "Run code toggle", "/code command", "Cloud code execution and file creation (settings switch)", "Run this code again (mobile)", "Coding harness / Runtime select (AGI Code page)", "Managed code execution (desktop capability label)", "execute_code tool"]
area: "21 Code blocks and executable code presentation"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S21.12", "S21.13", "S21.14", "S21.29", "S21.30"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "SYS-authentication-and-identity", "F021-08", "F021-10", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "file:apps/web/lib/e2b/gate.ts", "file:apps/web/lib/e2b/runtime.ts", "api:POST /api/chat/conversations/[id]/code-runs", "provider:anthropic", "provider:openai", "provider:google"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F021-07 Run code from the chat

Lets a person ask the assistant to run code instead of only writing it. Web has a Run code toggle and a /code command. Mobile has a Run code row in Add to chat. The cloud runs the code in a sandbox, subject to the plan and a settings switch. CLI and VS Code run code through the agent's shell tool with approvals.

Area: [21. Code blocks and executable code presentation](README.md). Requirement items: [S21.12](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2112), [S21.13](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2113), [S21.14](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2114), [S21.29](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2129), [S21.30](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2130).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Web composer: the Run code toggle and the /code command switch on code execution for the next message (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2565, :3247-3263). Mobile: a Run code row in the Add to chat sheet (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1242-1252). The server then gives the model an execute_code tool that runs in a managed sandbox, or the provider's own code tool (apps/web/lib/e2b/execution-tools.ts:258-269). The tool takes only language and code (apps/web/lib/e2b/execution-tools.ts:80-83). CLI and VS Code run commands through the agent's shell tool and ask for approval first (apps/cli/src/tui/approval_broker.rs:23-26; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8867-8872).

**Why it exists.** Claude and ChatGPT can run the code they write. A person gets a checked answer, a chart or a file instead of code they must run themselves. [inferred]

**Who uses it.** Signed-in web and mobile users on a plan with sandbox allowance; developers using CLI or VS Code with their own machine.

**Problems it solves**

- The assistant can compute and test instead of guessing.
- The person does not need a local runtime to try code.
- The person can say no: a settings switch turns cloud running off (apps/web/lib/server/code-execution-policy.ts:24-37).

**Use cases**

- Ask for a data summary and have the assistant run the analysis.
- Type /code and a question to force a run.
- On the AGI Code page, start a cloud coding session and pick the Coding harness.
- In the CLI, approve a shell command the agent wants to run.

## 2. User experience

**Where to find it**

- Web chat: the composer's plus menu has a Run code toggle, disabled with a reason when the model cannot run code (ChatComposerNew.tsx:6111-6119). The /code slash command also turns it on (ChatComposerNew.tsx:3247-3263). When on, the active tool label reads Run code (ChatComposerNew.tsx:3411).
- Web settings: Capabilities, section Code execution and file creation, switch Cloud code execution and file creation (apps/web/features/settings/sections/CapabilitiesSection.tsx:108-122).
- Web AGI Code page: Network access popover and a Coding harness select (apps/web/features/code/components/CodeComposer.tsx:258-358; apps/web/features/code/code-surface.ts:151-156).
- Mobile chat: Add to chat sheet, row Run code (AddToChatSheet.tsx:1242-1252); an active chip labelled Run code shows in the composer (apps/mobile/src/features/chat/components/ChatInput.tsx:596-603).
- Desktop (Electron): shows the hosted web app, so the web controls apply (doc: AGENTS.md section 5). The internal Tauri build lists a Managed code execution capability row (apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:566-578).
- CLI: no toggle; the agent asks to run a command in an approval overlay titled Tool Approval (apps/cli/src/tui/widgets/approval_overlay.rs:1-21).
- VS Code: command rows in the Activity group; approval card (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:839-936).
- Chrome: no run control found.

**Before you start**

- Web and mobile: signed in, cloud mode, a plan that grants the canUseCloudExecution capability, and a model that supports code execution (ChatComposerNew.tsx:1630-1642; ChatInput.tsx:577-585).
- Server: code execution switched on for the deployment (apps/web/lib/e2b/gate.ts:6-28).
- The account switch Cloud code execution and file creation not turned off (code-execution-policy.ts:24-37).

**Screens and controls**

- Run code toggle (web plus menu).
- /code command in the composer.
- Capabilities switch Cloud code execution and file creation with the line: Run code and create files in a sandbox that can reach only GitHub, npm and PyPI (CapabilitiesSection.tsx:114-115).
- Network access options Isolated, Trusted hosts, Full internet on the AGI Code page (apps/web/features/code/code-surface.ts:448-468).
- Mobile Run code switch row (AddToChatSheet.tsx:1242).
- No input or stdin field exists in any app: the tool schema has only language and code (execution-tools.ts:80-83).

**Journey**

1. 1. Pick a model that can run code, or Auto.
2. 2. Switch on Run code (or type /code and the request).
3. 3. Send the message; the send carries code_execution (apps/web/lib/hooks/useChatStream.ts:4640).
4. 4. The server attaches the execution tool, checks the plan and settings, and runs the code in a sandbox (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2798-2845).
5. 5. The assistant answers using the result; the output appears in an output panel (see F021-08).
6. 6. If running is refused, the assistant is told to explain and not retry (apps/web/lib/e2b/unavailability.ts:43-49).

**What the person sees and gets**

- Disabled toggle title: Run code isn't available for this model on this deployment. Choose Auto or a model that can run code. (ChatComposerNew.tsx:6115).
- /code on an unsupported model shows the notice: /code needs a model that can run code on this deployment. Switch models, then try again. (ChatComposerNew.tsx:3260).
- Server refusal reasons are given to the model to tell the user: not configured, no capacity, policy, over quota, provider error (unavailability.ts:19-32).
- Free plan notice text: This run can last about N minutes on Free. (unavailability.ts:38-41).

**Settings**

- Capabilities: Cloud code execution and file creation (stored under the capabilities namespace, key cloudCodeExecution) (code-execution-policy.ts:6-7).
- Tool approvals policy (ask every time or not) affects reruns (apps/web/app/api/chat/conversations/[id]/code-runs/route.ts:116-128).
- Mobile: Code settings screen preference Default network access (apps/mobile/src/features/settings/code/store.ts:26-27).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web composer toggle, /code command, plus-menu entry, and the active label Run code (ChatComposerNew.tsx:2565, :3247-3263, :3411).
- Web server routes a run-code turn to the managed sandbox when it is provisioned and streaming, else to the provider's own code tool for Anthropic, Google or OpenAI (apps/web/lib/e2b/execution-tools.ts:207-235, :258-269).
- Server gate: needs the cut-over flag; the per-account switch is enforced on the server because the tool list comes from the client (tool-loop.ts:2798-2845).
- Plan limits: sandbox count and lifetime are plan fields; a failed plan lookup refuses to create compute (apps/web/lib/e2b/runtime.ts:129-154).
- When no execution tool can be attached, the model is told to disclose it (apps/web/app/api/llm/v1/chat/completions/lib/capability-preamble.ts:131-136, :507; request-processor.ts:6416-6424).
- Mobile Run code row is shown only in cloud mode with a capable model and the capability granted (AddToChatSheet.tsx:249-255).
- Mobile Run again calls a server rerun route (apps/mobile/src/features/chat/components/CodeRunAgain.tsx:58-64; see F021-10).
- CLI approval overlay for shell exec (apps/cli/src/tui/approval_broker.rs:23-26).
- VS Code command rows and an approval card (webviewContent.ts:8867-8872, :839-936).

**Incomplete**

- Input parameters and stdin: no entry point in any app (execution-tools.ts:80-83).
- Runtime choice in chat: the model picks the language in the tool call; the person cannot choose it (execution-tools.ts:80). The Coding harness select exists only on the AGI Code page for cloud coding sessions and cannot be changed after the session starts (apps/web/features/code/code-runtime.ts:32-39).
- Web toggle is cleared silently when the model changes to one that cannot run code (ChatComposerNew.tsx:1715-1719); the only explanation is the disabled control's title text and the /code notice.
- Mobile Run code row is hidden, not explained, when unavailable (AddToChatSheet.tsx:249-255).
- A permission explanation before a run: the settings text says the sandbox reaches only GitHub, npm and PyPI (CapabilitiesSection.tsx:115), but no per-run prompt on web was found. The brief cites approval overlays only for CLI and VS Code.

**Present but disconnected or switched off**

- Managed sandbox is off unless AGI_E2B_EXECUTION=1 and E2B_API_KEY are set and the sandbox rate is priceable (gate.ts:20-28). The brief notes this must still be switched on in production (brief: S21.21 Unfinished). Whether it is on now: unknown.
- The web client has no caller for the code-runs rerun route; only mobile calls it (search of apps and packages found the route, its test, the contract and mobile).

**Not available**

- Chrome extension: no run-code control found (searched apps/extension/src for a code_execution request flag; only the response parser exists at apps/extension/src/features/cloud-bridge/freeTrialClient.ts:879-908).
- Local mode on mobile: Run code requires cloud mode (ChatInput.tsx:577-585; CodeRunAgain.tsx:95).
- Own key (BYOK) and local-only plans have zero managed sandboxes (packages/contracts/types/src/billing-catalog.ts:583-608).

## 4. Required behaviour

**Established requirements**

- The user can have code run (sandbox or local) from the chat and see it execute. (source: brief S21.12)
- Where multiple runtimes exist, the user can choose the runtime or language. (source: brief S21.13)
- Before running, the user can supply input parameters or stdin. (source: brief S21.14)
- Before or when code runs, the user is told what permission it needs and what it can touch and why. (source: brief S21.29)
- If the requested runtime or execution is unavailable, the UI says so clearly instead of failing silently. (source: brief S21.30)
- Capabilities settings must include code execution, file creation, network egress and a domain allow list. (source: doc: docs/product/definition.md:285)
- Sandboxed code execution is treated as read-only in the permissive approval mode; the leaders accept that risk. (source: doc: docs/decisions/2026-09-10-managed-gateway-routes.md:54)

**Acceptance criteria**

1. With Run code on and a capable model, the sent request carries code_execution true.
2. With a model that cannot run code, the web toggle is disabled and its title explains why; /code shows the notice.
3. With the account switch off, a run is refused and the assistant tells the user it can be turned on in Settings, Capabilities.
4. With no sandbox configured, the assistant states that code execution is not configured and does not retry.
5. A free-plan run states its lifetime in minutes.
6. Mobile shows the Run code row only in cloud mode with the capability granted.
7. No app shows an input or stdin field today (documents the gap).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local and own-key chats must not silently route code to the managed sandbox (doc: AGENTS.md section 6) [inferred]; the code agrees: BYOK and local-only plans have zero sandboxes.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a visible reason on mobile and on the web toggle auto-off (a short notice when a model change switches Run code off).
- [proposed] Add an optional input/stdin field to the execute_code tool and the composer.
- [proposed] Show a one-line permission summary (network reach, file area, lifetime) the first time code runs in a chat.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web composer: toggle, /code command, auto-clear, active label, disabled title |
| component | ComposerPlusMenu | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Menu props codeExecutionEnabled, codeExecutionDisabled, codeExecutionTitle (lines 684-687) |
| component | CapabilitiesSection | `apps/web/features/settings/sections/CapabilitiesSection.tsx` | Settings switch Cloud code execution and file creation |
| service | resolveCloudCodeExecutionPolicy | `apps/web/lib/server/code-execution-policy.ts` | Reads the account switch; fails closed when the read fails |
| service | E2B gate | `apps/web/lib/e2b/gate.ts` | Environment gates AGI_E2B_EXECUTION and E2B_API_KEY and priceability |
| service | execution tools | `apps/web/lib/e2b/execution-tools.ts` | execute_code schema and routing to managed sandbox or provider tool |
| service | E2B runtime | `apps/web/lib/e2b/runtime.ts` | Creates sandboxes, plan limits, fail-closed, stop message, runCode |
| service | unavailability messages | `apps/web/lib/e2b/unavailability.ts` | Reason sentences told to the model and user |
| service | tool loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Gates and runs execution tools in a turn (lines 2798-2845) |
| service | request processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Resolves code execution for the model and sets codeExecutionUnavailable (5926-5938, 6416-6424) |
| service | capability preamble | `apps/web/app/api/llm/v1/chat/completions/lib/capability-preamble.ts` | Tells the model to disclose when run code could not attach |
| endpoint | POST /api/chat/conversations/[id]/code-runs | `apps/web/app/api/chat/conversations/[id]/code-runs/route.ts` | Rerun a code cell in the conversation sandbox |
| schema | chat code run contract | `packages/contracts/cloud-contracts/src/chat-code-runs.ts` | Request and response schema, limits, confirmation copy |
| config | plan product limits | `packages/contracts/types/src/billing-catalog.ts` | maxSandboxes and sandboxTtlMs per plan (lines 583-725) |
| config | platform capabilities | `packages/contracts/types/src/capabilities.ts` | canUseCloudExecution per surface row (lines 48, 81, 114) |
| component | CodeComposer | `apps/web/features/code/components/CodeComposer.tsx` | AGI Code page: Network access and Coding harness select |
| config | code surface copy | `apps/web/features/code/code-surface.ts` | Labels and network options for AGI Code |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Mobile Run code row |
| component | ChatInput (mobile) | `apps/mobile/src/features/chat/components/ChatInput.tsx` | codeExecutionActive rule and Run code chip |
| store | tier store | `apps/mobile/src/features/billing/store.ts` | codeExecutionAvailable from the capability handshake |
| component | approval overlay (CLI) | `apps/cli/src/tui/widgets/approval_overlay.rs` | Tool Approval overlay for exec |
| service | approval broker (CLI) | `apps/cli/src/tui/approval_broker.rs` | ApprovalRequestKind::Exec and others |
| component | VS Code sidebar webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Command rows and approval card |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person switches on Run code and sends. The send includes code_execution. | device | ChatComposerNew.tsx:3636-3638, :3676; apps/web/lib/hooks/useChatStream.ts:4640 |
| Server decides: managed sandbox tools if provisioned, else the provider's own code tool for the routed provider, else nothing (turn is told to disclose). | our servers | apps/web/lib/e2b/execution-tools.ts:207-235, :258-269; request-processor.ts:6416-6424 |
| Server checks the account switch, plan sandbox count and lifetime, and managed compute access; a failed plan lookup refuses. | our servers | tool-loop.ts:2798-2845; runtime.ts:129-154 |
| The sandbox service starts a sandbox and runs the code. Outbound network is limited to GitHub, npm and PyPI hosts for chat runs. | outside service | runtime.ts:106-115; apps/web/lib/e2b/session-store.ts:68; CapabilitiesSection.tsx:115 |
| Output returns to the model and the client; the page shows it (F021-08). | device and our servers | useChatStream.ts:3590-3609 |
| CLI and VS Code: the agent proposes a shell command, the person approves, and it runs on the person's own machine. | device | apps/cli/src/tui/approval_broker.rs:23-26; webviewContent.ts:8867-8872 [inferred: runs locally because the CLI is a local program] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run-code toggle state | Composer toggles in the web chat store (setComposerToggles); mobile chat view store per conversation (runCodeByConversation) | not synced in what was read; unknown | unknown |
| Account switch cloudCodeExecution | public.user_settings settings JSON, namespace capabilities | yes, read on the server each time | kept until changed (code-execution-policy.ts:24-37) |
| Sandbox session mapping (conversation to sandbox) | Redis, scoped by tenant, user and conversation | server side only | paused at turn end, killed on conversation delete or as a safety net (runtime.ts:10-18) |

**Models and providers.** Any non-empty provider name can use the managed sandbox when it is provisioned and streaming is on (execution-tools.ts:207-209, :260). Otherwise only Anthropic, Google and OpenAI have a native code tool (execution-tools.ts:211-232). Whether the model supports code execution comes from the model catalog capability codeExecution (ChatComposerNew.tsx:1633-1642).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, mobile: sign-in needed; the server resolves the user's entitlement (code-runs/route.ts:86-93). CLI and VS Code local shell: no account needed for local commands [inferred]. |
| Permissions | Account switch Cloud code execution and file creation (default on) (code-execution-policy.ts:24-37). Tool approval policy ask_every_time forces approval for reruns (route.ts:116-128). CLI and VS Code per-command approval. |
| Subscription | Capability canUseCloudExecution gates the web composer (ChatComposerNew.tsx:1630-1631) and mobile (AddToChatSheet.tsx:255). Sandbox slots per plan: local-only 0, byok 0, free 2 with a 60-minute lifetime, basic 5, pro 10, team 10 (billing-catalog.ts:583-699); the max plan and enterprise use the 20-per-user ceiling (billing-catalog.ts:473, :569, :720). |
| Limits and metering | Sandbox compute is reserved and metered per second against credits for paid plans; Free uses a platform-funded daily allowance (runtime.ts:117-127; apps/web/lib/e2b/compute-metering.ts). Rerun route function limit 300 seconds (code-runs/route.ts:46; chat-code-runs.ts:6). |
| Feature flags | AGI_E2B_EXECUTION=1 and E2B_API_KEY (gate.ts:6-28); AGI_MANAGED_COMPUTE_PRIVATE_BETA (gate.ts:30-37; brief S21.21); capability canUseCloudExecution checked by assertCapabilityAvailable (route.ts:94-104); mobile flag FEATURES.codeExecution (apps/mobile/lib/v1FeatureFlags.ts:34); desktop managed flag code_execution (DesktopCloudSettingsModal.tsx:566). |
| Model compatibility | Needs registry capability codeExecution, or tools plus the deployment capability, or Auto (ChatComposerNew.tsx:1638-1642). Mobile needs capabilities.codeExecution true (ChatInput.tsx:582). |
| Provider restrictions | Native provider code tools exist only for provider:anthropic, provider:google, provider:openai (execution-tools.ts:211-232). The managed sandbox accepts any non-empty provider name (execution-tools.ts:207-209). |
| Local mode | Mobile Local mode: Run code is not offered (cloud mode required) (AddToChatSheet.tsx:249-255; ChatInput.tsx:577). Own key: plans byok and local-only have maxSandboxes 0 (billing-catalog.ts:583-608); runtime.ts:122-124 states Local and BYOK stay outside managed sandbox provisioning. Whether a provider's own hosted code tool works with an own key: unknown. CLI and VS Code run on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model cannot run code (web) | Toggle disabled with explanatory title; if it was on, it is cleared with no message | ChatComposerNew.tsx:1715-1719, :6112-6116 |
| /code on unsupported model | Notice shown, nothing sent | ChatComposerNew.tsx:3256-3262, :3626-3632 |
| Billing policy not ready | Auto-clear waits until policy is ready | ChatComposerNew.tsx:1716 |
| Account switch off | Tool call refused; model told to say it is off and where to turn it on | tool-loop.ts:2826-2837 |
| Settings read failed | Refuses and says retry later (fail closed) | code-execution-policy.ts:38-41; tool-loop.ts:2822-2825 |
| Plan lookup failed | No managed compute is created | runtime.ts:139-154 |
| No capacity, over quota, policy or provider error | Model told one cause sentence and not to call the tool again | unavailability.ts:9-49 |
| Deployment cut-over off | Tool answers that it is not available | tool-loop.ts:2800-2806 |
| Mobile not cloud or not granted | Row and rerun control are hidden with no message | AddToChatSheet.tsx:249-255; CodeRunAgain.tsx:95 |
| Accessibility | Mobile Run code chip has the accessibility label Run code on; the web runtime select has described-by help text | ChatInput.tsx:600; CodeComposer.tsx:327 |
| Offline | not handled specifically in the code read for this feature | no offline handling found in ChatComposerNew.tsx toggle code (lines 2565, 1715) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/e2b/__tests__/gate.test.ts`: Gate rules: flag and key combinations, priceability
- `apps/web/lib/e2b/__tests__/execution-tools.test.ts`: Execution tool routing (by file name; contents not read in full)
- `apps/web/lib/e2b/__tests__/runtime.test.ts`: Sandbox runtime (by file name)
- `apps/web/lib/server/__tests__/code-execution-policy.test.ts`: Account switch policy (by file name)
- `apps/web/app/api/chat/conversations/[id]/code-runs/route.test.ts`: Rerun route: ownership, switch closed, switch off, compute refusals, approvals
- `apps/web/features/chat/components/Composer/ComposerPlusMenu.test.tsx`: Run code entry hidden when not allowed (line 392)
- `apps/web/features/settings/sections/__tests__/CapabilitiesSection.test.tsx`: Capabilities switches (by file name)
- `apps/mobile/__tests__/codeRunService.test.ts`: Mobile rerun request and failure messages
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.implicit-tools.test.ts`: Implicit tools for code execution (by file name)

**Test scenarios**

- **Web toggle with capable model**
  1. Sign in on web with a plan that has sandbox slots.
  2. Choose Auto.
  3. Open the plus menu and switch Run code on.
  4. Send: compute 2 to the power 40 with code.
  - Expected: Request carries code_execution; the reply shows a Code Execution panel or tool row with the result.
- **Model switch clears the toggle**
  1. Switch Run code on.
  2. Select a model whose catalog entry lacks code execution.
  - Expected: Toggle turns off and the menu entry is disabled with the title text. No toast appears (documents the gap).
- **/code on unsupported model**
  1. Pick a model without code execution.
  2. Type /code run this and send.
  - Expected: Notice: /code needs a model that can run code on this deployment.
- **Account switch off**
  1. Settings, Capabilities: turn off Cloud code execution and file creation.
  2. Ask the assistant to run code with Run code on.
  - Expected: The assistant says running is off and points to Settings, Capabilities.
- **Free plan lifetime**
  1. Sign in on a Free account with sandbox allowance enabled.
  2. Run code.
  - Expected: The run states about 60 minutes lifetime on Free.
- **Mobile local mode**
  1. Open the phone app in Local mode.
  2. Open Add to chat.
  - Expected: No Run code row.

**Where to look when it fails**

- Server log lines: [e2b] plan lookup failed; refusing to create managed compute (fail-closed); [e2b] @e2b/code-interpreter unavailable; fail-closed; Code execution policy read failed; refusing execution (runtime.ts:148, :171; code-execution-policy.ts:39).
- Audit events tool_executed and tool_approval_decided (code-runs/route.ts:173-190).
- Unavailable causes from unavailability.ts: not-configured, no-capacity, policy, over-quota, provider-error.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md)
- Desktop: [70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md)
- Mobile: [70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md)
- CLI: [70-qa/test-plans/cli/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/cli/021-code-blocks-and-executable-code-presentation.md)
- VS Code: [70-qa/test-plans/vscode/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/vscode/021-code-blocks-and-executable-code-presentation.md)

## 10. Gaps and dependencies

- **No input or stdin entry** Affects: All apps. Evidence: execution-tools.ts:80-83; brief S21.14. Work needed: Add an optional input field to the tool schema, composer UI and sandbox call.
- **Person cannot choose the runtime or language in chat; only the AGI Code page lets them pick a harness, and not after start** Affects: Web, desktop, mobile. Evidence: execution-tools.ts:80; apps/web/features/code/code-runtime.ts:32-39. Work needed: Decide if a chat runtime choice is wanted; if so add a selector and pass it as the language.
- **Silent auto-off of the toggle when the model changes** Affects: Web and desktop. Evidence: ChatComposerNew.tsx:1715-1719. Work needed: Show a short notice naming the reason.
- **Mobile hides Run code with no explanation** Affects: Mobile. Evidence: AddToChatSheet.tsx:249-255. Work needed: Show a disabled row with a reason.
- **No per-run permission explanation on web or mobile; Chrome has no run control** Affects: Web, desktop, mobile, Chrome. Evidence: brief S21.29; CapabilitiesSection.tsx:115 is settings text only. Work needed: Add a first-run explanation in chat.
- **Sandbox switched on in production is unconfirmed** Affects: Web, desktop, mobile. Evidence: brief S21.21 Unfinished; gate.ts:20-28. Work needed: Owner switch-on and a live check.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- SYS-authentication-and-identity
- F021-08
- F021-10
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- file:apps/web/lib/e2b/gate.ts
- file:apps/web/lib/e2b/runtime.ts
- api:POST /api/chat/conversations/[id]/code-runs
- provider:anthropic
- provider:openai
- provider:google

## Unknown

- Whether the managed sandbox is switched on in production today.
- Whether the web toggle state syncs across devices.
- Exact Electron desktop differences: it shows the hosted web app per AGENTS.md; not opened here.
- Whether an own-key chat can use a provider's hosted code tool.
- Whether CLI and VS Code shell commands run in a sandbox or directly: not established; the CLI sandbox code was not read.
- What Chrome sends for code execution: no request flag found.
