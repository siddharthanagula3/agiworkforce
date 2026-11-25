---
id: "F057-03"
type: "feature"
title: "Running code and shell commands"
aliases: ["Code execution", "execute_code", "Run code", "Shell tool", "run_command", "device_run_command", "device_start_command", "Bash", "powershell", "S57.10", "S57.11"]
area: "57 Tool catalog and invocation experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S57.10", "S57.11"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "file:apps/web/lib/e2b/execution-tools.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F057-03 Running code and shell commands

The assistant can run code or a shell command and show the output. Desktop runs commands in a granted folder after the person approves each one. CLI and VS Code run them locally. Web, Mobile and Chrome run code in a cloud sandbox, which production has not switched on; Mobile and Chrome have no shell.

Area: [57. Tool catalog and invocation experience](README.md). Requirement items: [S57.10](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5710), [S57.11](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5711).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Runs code the model wrote (a notebook-style cloud sandbox, or the model provider's own code tool) and runs one shell command (Desktop device step, CLI run_command). Output and, for shell, the exit code come back to the model and the transcript. (apps/web/lib/e2b/execution-tools.ts:63-88) (packages/contracts/local-runtime/src/device-steps.ts:92-100)

**Why it exists.** Calculations, data work, tests and builds are more reliable when the assistant runs them than when it guesses the result.

**Who uses it.** Developers on Desktop, CLI and VS Code; Web and Mobile users who ask for analysis or charts.

**Problems it solves**

- Wrong arithmetic or invented test results
- Copying commands and pasting output by hand

**Use cases**

- Ask the CLI to run the test suite and fix a failure.
- Ask Desktop to start a dev server and read its first output.
- Ask Web to analyse a CSV with code and show a chart.
- Ask Mobile to compute something with a script (when Cloud execution is on).

## 2. User experience

**Where to find it**

- Web composer: 'Run code' is shown as an active tool label (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3411).
- Mobile: Settings > Capabilities row 'Code execution and file creation' with value 'Cloud only' or 'Off' (apps/mobile/src/features/settings/capabilities/index.tsx:~150-163).
- Desktop: command approval prompt; reason text 'Commands you run here start real programs on this Mac, with your account, in this folder.' (apps/desktop/electron/runtime/dispatcher.ts:699-703).
- CLI: run_command and powershell tools in the terminal UI (apps/cli/src/platform/runtime/tool_catalog.rs:219).
- VS Code: tool call rows with an exit code field (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1954-1960).

**Before you start**

- Web and Mobile and Chrome: the account switch for cloud code execution on (default on), the platform allowing it, and the sandbox flag, key and price on the server (apps/web/lib/server/code-execution-policy.ts:6-7) (apps/web/lib/e2b/gate.ts:20-27).
- Mobile: Cloud mode, not Local; entitlement codeExecutionAvailable (apps/mobile/stores/chat/chatExecutionStore.ts:3273-3282).
- Desktop: a granted folder and the shell.execute capability (packages/contracts/local-runtime/src/device-steps.ts:92-120).

**Screens and controls**

- Run code toggle on web composer; Mobile switch in capabilities.
- Desktop approval dialog showing the exact command.
- A 'run again' control on code cards (apps/web/features/chat/components/messages/ToolTimeline.tsx:~455-465) (apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:~250).
- Saved Ask and Deny rules and an approval overlay in the CLI (apps/cli/src/features/exec/tools/mod.rs:754-800).

**Journey**

1. Person asks the assistant to run or test something.
2. The app declares code execution (Web and Mobile send code_execution) or the model calls a shell tool.
3. Cloud: server checks the account switch, then runs the code in the sandbox. Desktop: the device step prompts the person for the exact command, then runs it.
4. Output returns; the card shows the code, output and (for shell) the exit code.
5. The model reads the output and continues or explains the failure.

**What the person sees and gets**

- Code and output on the card; stderr and exit code on Mobile and VS Code (apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:~237-243).
- Output over 100,000 bytes is cut with '[output truncated at 100000 bytes]'; the first 900,000 characters are kept for later reading (apps/web/lib/e2b/execution-tools.ts:286-292) (apps/web/lib/e2b/types.ts:117-120).
- A plain reason when code execution is unavailable: not configured, no capacity, policy, over quota, provider error (apps/web/lib/e2b/unavailability.ts:9-29).

**Settings**

- Settings > Capabilities: cloud code execution switch (key capabilities.cloudCodeExecution) (apps/web/lib/server/code-execution-policy.ts:6-7).
- Desktop shell policy store and sandbox (apps/desktop/electron/runtime/dispatcher.ts:2378-2395).
- CLI saved permissions and shell approval per turn (apps/cli/src/features/exec/tools/mod.rs:737-800).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Desktop shell_run, shell_start, shell_read and shell_stop with approvals, sandbox and protected paths (apps/desktop/electron/runtime/dispatcher.ts:2378-2420).
- Desktop result returns output and exit code (packages/contracts/local-runtime/src/device-steps.ts:92-96).
- CLI run_command, powershell and command_output with saved permission checks and workspace policy (apps/cli/src/features/exec/tools/mod.rs:573-800); command timeout 30 seconds default (apps/cli/src/features/exec/tools/common/mod.rs:22).
- Web execute_code tool with languages such as python and node in a persistent notebook-style sandbox; no process exit codes for notebook cells (apps/web/lib/e2b/execution-tools.ts:66-82).
- When the sandbox is not ready the turn can fall back to a provider's own code tool for three providers (apps/web/lib/e2b/execution-tools.ts:216-235, :258-270).
- Per-account policy checked on each execution call (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2812-2842).

**Incomplete**

- Web shell is partial: there is no separate shell tool in the sandbox tool list; the model uses execute_code (apps/web/lib/e2b/execution-tools.ts:14-19) [inferred; brief calls it partial pending the switch].
- Mobile and Chrome have no shell tool (brief S57.11).

**Present but disconnected or switched off**

- Sandbox tools need AGI_E2B_EXECUTION=1, E2B_API_KEY and priceable compute (apps/web/lib/e2b/gate.ts:20-27); otherwise a call returns 'Tool <name> is not available.' (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2801-2809).

**Not available**

- Shell on Mobile and Chrome (brief S57.11).
- Any code execution in Mobile Local mode: row says 'Cloud only' (apps/mobile/src/features/settings/capabilities/index.tsx:~160).

## 4. Required behaviour

**Established requirements**

- The assistant can call a tool that runs code it wrote and returns output in the transcript (S57.10). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.10)
- The assistant can call a tool that runs a shell command and returns output and exit code (S57.11). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.11)
- Sandbox and code execution depend on a provider route or an AGI harness, never described as intrinsic to a model. (source: doc: AGENTS.md section 4)
- Execution tools are checked server-side per account because the client declares them. (source: apps/web/lib/server/code-execution-policy.ts:11-18)

**Acceptance criteria**

1. Desktop command shows an approval with the exact command before it starts.
2. Desktop result includes an exit code.
3. Web turn with the sandbox flag off does not run code and the model says it cannot.
4. Turning off cloud code execution in Settings makes the next call return the 'turned off for this account' message.
5. Output longer than 100,000 bytes is truncated with the marker.
6. CLI in a workspace with a deny rule refuses the command and says so.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web shell should be a distinct card from code execution [inferred from brief status].
- Exit code for notebook cells is not defined; the draft 'output comes with exit code' is true only for shell steps [inferred from execution-tools.ts:70-76].

**Proposed improvements** (suggestions, not requirements)

- [proposed] State on the Web card whether the run used the sandbox or a model-provider code tool.
- [proposed] Add a Mobile shell only if a safe sandbox shell is wanted; otherwise mark not applicable.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | execution tools | `apps/web/lib/e2b/execution-tools.ts` | execute_code schema, router, output cap, provider-native fallback. |
| config | sandbox gate | `apps/web/lib/e2b/gate.ts` | Flag, key and pricing readiness. |
| service | unavailability messages | `apps/web/lib/e2b/unavailability.ts` | Five causes in plain words. |
| service | compute metering | `apps/web/lib/e2b/compute-metering.ts` | Prices sandbox compute. |
| service | hosted code execution | `apps/web/lib/e2b/hosted-code-execution.ts` | Reserve for hosted code execution on a turn. |
| service | code execution policy | `apps/web/lib/server/code-execution-policy.ts` | Account switch. |
| service | tool loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Execution branch at 2798-2850; overflow storage at 2849. |
| service | tool result store | `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts` | Stores full oversized output for 24 hours; read_tool_result reads it back. |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | code_execution request field (780) and tool resolution (6410-6425). |
| schema | device step definitions | `packages/contracts/local-runtime/src/device-steps.ts` | device_run_command, device_start_command, device_command_output, device_command_stop. |
| service | desktop dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | shell_run, shell_start, shell_read, shell_stop with approval. |
| service | desktop shell service | `apps/desktop/electron/runtime/shellService.ts` | Runs and tracks commands. |
| service | desktop shell sandbox | `apps/desktop/electron/runtime/shellSandbox.ts` | Sandbox for commands. |
| service | CLI tool dispatcher | `apps/cli/src/features/exec/tools/mod.rs` | run_command approvals and Local privacy checks. |
| service | CLI bash tools | `apps/cli/src/features/exec/tools/bash` | Command execution. |
| store | mobile execution store | `apps/mobile/stores/chat/chatExecutionStore.ts` | Sends code_execution when entitled and Cloud (3273-3290, 3430). |
| component | mobile capabilities screen | `apps/mobile/src/features/settings/capabilities/index.tsx` | Row 'Code execution and file creation'. |
| component | ToolTimeline | `apps/web/features/chat/components/messages/ToolTimeline.tsx` | Run again and card states. |
| table | user_settings | `apps/web/lib/server/code-execution-policy.ts` | capabilities.cloudCodeExecution flag. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app asks for code execution on the turn (Web/Mobile send code_execution true when allowed). | device | apps/mobile/stores/chat/chatExecutionStore.ts:3430; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:780 |
| The server resolves which execution tools exist: sandbox tools if ready and streaming, else provider-native code tool, else it marks the turn unavailable and tells the model. | our servers | apps/web/lib/e2b/execution-tools.ts:258-270; request-processor.ts:6416-6425 |
| A hold for the likely cost is reserved before the turn. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5929-5945 |
| On a call, the server checks the sandbox switch and the account policy, then runs the code in the cloud sandbox. | outside service | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2798-2850 |
| Output is capped at 100,000 bytes, vendor names are replaced by 'sandbox', and an overflow copy is stored. | our servers | apps/web/lib/e2b/execution-tools.ts:278-292, :395-410 |
| Desktop shell: the server hands the step back; the desktop asks the person to approve the exact command, runs it in the folder and returns output and exit code. | device | apps/desktop/electron/runtime/dispatcher.ts:2378-2395; device-steps.ts:92-100 |
| CLI shell: the CLI checks saved permissions, workspace policy and approval, then runs the command locally. | device | apps/cli/src/features/exec/tools/mod.rs:737-800 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Full oversized tool output | server key-value store (agi-tool-result), 24 hours | no | expires after 24 hours (tool-result-store.ts:14-17) |
| Sandbox state | cloud sandbox session | no | session lifetime; Free runs last limited minutes (apps/web/lib/e2b/unavailability.ts:33-36) |
| Desktop command output | desktop app memory and event stream | no | unknown |

**Models and providers.** Any model that can call tools can use the sandbox tools; some provider routes use their own code tool when the sandbox is off (anthropic, google, openai) (apps/web/lib/e2b/execution-tools.ts:216-235). The model decides the code; the sandbox is an outside compute provider whose name is redacted from user text. Desktop and CLI shell are independent of the model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud code execution needs a signed-in account; CLI and Desktop shell run on the device but Desktop steps arrive through a cloud turn. |
| Permissions | Desktop: shell.execute capability plus approval of the exact command (device-steps.ts:92-120). CLI: saved Ask or Deny rules, workspace policy, trust checks (mod.rs:737-800). Account switch for cloud execution (code-execution-policy.ts). |
| Subscription | Platform capability canUseCloudExecution is true for web and desktop rows in the capability table (packages/contracts/types/src/capabilities.ts:48, :81). Plan gating for sandbox: 'none found in the code' in the files read; compute is metered and Free runs have a limited lifetime (apps/web/lib/e2b/unavailability.ts:33-36). |
| Limits and metering | Output 100,000 bytes; kept 900,000 chars; account 'no-capacity' when concurrent sandboxes at plan maximum; 'over-quota' when usage budget is empty (apps/web/lib/e2b/unavailability.ts:9-29). |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY, AGI_MANAGED_COMPUTE_PRIVATE_BETA; mobile FEATURES.codeExecution is true (apps/mobile/lib/v1FeatureFlags.ts:34). |
| Model compatibility | Model capability codeExecution for native tools; tools capable for sandbox tools (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5930-5936). |
| Provider restrictions | Native fallbacks only for three providers; others need the sandbox. |
| Local mode | CLI Local: shell runs on the device. Mobile Local: code execution says 'Cloud only' (apps/mobile/src/features/settings/capabilities/index.tsx:~160). Desktop on-device models: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Sandbox off | Tool call returns not available; the model is told to answer without running code. | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2801-2809; apps/web/lib/e2b/unavailability.ts:43-49 |
| Account turned it off | Message names Settings > Capabilities. | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2832-2837 |
| Policy unreadable | Refuses and asks to retry later. | apps/web/lib/server/code-execution-policy.ts:41-44 |
| Long output | Truncated marker and stored copy. | apps/web/lib/e2b/execution-tools.ts:286-292 |
| Command denied by Ask or Deny rule | CLI returns 'Command is denied by saved permissions and did not run.' | apps/cli/src/features/exec/tools/mod.rs:748-753 |
| Command not approved | 'Command was not approved and did not run.' | apps/cli/src/features/exec/tools/mod.rs:795-801 |
| Cancel | Signal passes to runCode; Desktop shell_cancel exists. | apps/web/lib/e2b/execution-tools.ts:312-316; dispatcher.ts:2398 |
| Offline | not handled in the code read (unknown). | unknown |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/e2b/__tests__/execution-tools.test.ts`: Tool router and caps.
- `apps/web/lib/e2b/__tests__/execution-tools.argument-admission.test.ts`: Argument validation.
- `apps/web/lib/e2b/__tests__/gate.test.ts`: Flag and key logic.
- `apps/web/lib/e2b/__tests__/hosted-code-execution.test.ts`: Hosted reserve.
- `apps/web/lib/e2b/__tests__/vendor-name-not-user-visible.test.ts`: Vendor name hidden.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.required-execution.test.ts`: Required execution in the loop.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.test.ts`: Large result store.
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Shell command gating.
- `apps/desktop/electron/__tests__/shellPolicyStore.test.ts`: Shell policy.
- `apps/cli/src/features/exec/tools/mod.rs`: 116 inline Rust tests for the tool dispatcher.

**Test scenarios**

- **Desktop approve and run**
  1. Grant a folder.
  2. Ask to run 'ls'.
  3. Approve.
  - Expected: Output and exit code 0 on the card.
- **Desktop deny**
  1. Ask to run a command; deny it.
  - Expected: Step reports not approved; the model explains.
- **Web sandbox off**
  1. Ask Web to run python code.
  - Expected: Either a provider-native run or an unavailable message with a plain cause; no silent success.
- **Account switch**
  1. Turn off cloud code execution in Settings > Capabilities.
  2. Ask to run code.
  - Expected: The 'turned off for this account' message.
- **Long output**
  1. Run code that prints over 100,000 bytes.
  - Expected: Truncation marker; later read_tool_result can open the rest.

**Where to look when it fails**

- Log 'Code execution policy read failed; refusing execution' (apps/web/lib/server/code-execution-policy.ts:42).
- Log '[tool-loop] code execution policy adapter unavailable'.
- Unavailable causes: not-configured, no-capacity, policy, over-quota, provider-error.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md)
- Desktop: [70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md)
- Mobile: [70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md)
- CLI: [70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md)
- VS Code: [70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/vscode/057-tool-catalog-and-invocation-experience.md)
- Chrome: [70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/chrome/057-tool-catalog-and-invocation-experience.md)

## 10. Gaps and dependencies

- **Sandbox off in production: Web code execution may fall back to provider tools only for three providers; Mobile and Chrome shell does not exist.** Affects: Web, Mobile, Chrome, API. Evidence: brief S57.10/S57.11; execution-tools.ts:216-270. Work needed: Enable the sandbox; decide on Mobile and Chrome shell.
- **Draft said all runs return an exit code; sandbox notebook cells have none.** Affects: Web, Mobile, Chrome. Evidence: apps/web/lib/e2b/execution-tools.ts:70-76. Work needed: Fix doc and card copy.
- **Mobile Local mode cannot run code at all.** Affects: Mobile Local. Evidence: apps/mobile/src/features/settings/capabilities/index.tsx:~160. Work needed: Decide if a local runtime is wanted.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- file:apps/web/lib/e2b/execution-tools.ts

## Unknown

- Concurrent sandbox limits per plan.
- Free sandbox lifetime value.
- Desktop shell timeout default (timeoutMs optional in dispatcher).
- Whether Chrome exposes the Run code control.
- How Web distinguishes the shell from execute_code on a card.
