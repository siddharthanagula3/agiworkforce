---
id: "F069-06"
type: "feature"
title: "Cloud code execution"
aliases: ["Cloud code execution", "Run code", "/code", "Cloud code execution and file creation", "Code interpreter sandbox", "E2B sandbox", "S69.10"]
area: "69 Web application"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S69.10"]
depends_on: ["surface:web", "mode:cloud", "table:user_settings", "plan:Free", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-files-artifacts-and-storage", "api:POST /api/chat/conversations/{id}/code-runs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F069-06 Cloud code execution

Lets the assistant run code and create files in a cloud sandbox during a chat turn. A person types /code or asks clearly to run code. A Settings switch, 'Cloud code execution and file creation', turns it off, and the server enforces that choice. If the setting cannot be read, execution is refused.

Area: [69. Web application](README.md). Requirement items: [S69.10](../../10-requirements/capabilities/069-web-application.md#s6910).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Offers execution tools to the model for a turn and runs them in a managed sandbox or a provider's own code tool, then returns output and files to the chat (apps/web/lib/e2b/execution-tools.ts:258-269).

**Why it exists.** Data analysis, calculations and file creation need real code runs. The Settings switch gives people control over that managed compute, and the server enforces it because the client declares tools in the request (apps/web/lib/server/code-execution-policy.ts:13-19).

**Who uses it.** Web users who analyse data, write scripts or generate files. Not available on Local-only or Local + BYOK plans (sandbox count is 0 there; packages/contracts/types/src/billing-catalog.ts:590, 607).

**Problems it solves**

- Getting exact answers from computation.
- Producing files such as charts or documents.
- Letting a person refuse managed compute for their account.

**Use cases**

- Type '/code' then ask to analyse a CSV.
- Ask in words 'run this Python and show the chart'.
- Turn execution off in Settings for privacy.
- Re-run a code block from a message through the code-runs route.

## 2. User experience

**Where to find it**

- surface:web: the composer slash command '/code' (ChatComposerNew.tsx:3247-3265).
- surface:web: Settings, Capabilities, row 'Cloud code execution and file creation' under the heading 'Code execution and file creation' (apps/web/features/settings/sections/CapabilitiesSection.tsx:108-121).

**Before you start**

- Signed in; the deployment has sandbox execution on (apps/web/lib/e2b/gate.ts:11-26); the chosen model can run code or the route can use the sandbox; plan with sandboxes (free has 2 slots, local-only and BYOK have 0; billing-catalog.ts:590, 607, 620-628).

**Screens and controls**

- Slash menu entry /code.
- Settings switch (aria-label 'Cloud code execution and file creation').
- 'Artifacts' switch is forced on and disabled with the note 'Required by code execution' while execution is on (CapabilitiesSection.tsx:52, 142-151).

**Journey**

1. Type /code followed by a request, or ask in words. The server may turn execution on for that turn when the words clearly ask for it (request-processor.ts:998-1013).
2. Send. The server checks the platform switch, then offers execution tools (request-processor.ts:6410-6419).
3. The model calls an execution tool; the tool loop checks the account setting first and runs the code (tool-loop.ts:2814-2840).
4. Results and files stream back and show in the chat; activity shows as 'executing' (useChatStream.ts:3498-3500).

**What the person sees and gets**

- If /code is typed on a model that cannot run code: '/code needs a model that can run code on this deployment. Switch models, then try again.' (ChatComposerNew.tsx:3256-3261).
- With no text after /code on a free-model hand-over: 'Type what you want after /code, then send. The command applies to that one message.' (ChatComposerNew.tsx:3646-3652).
- When off, the model is told execution is off and where to turn it on (tool-loop.ts:2829-2833).
- The code-runs route returns a forbidden error 'Running code is turned off for this account. Turn it on in Settings, Capabilities.' (code-runs/route.ts:106-110).

**Settings**

- capabilities.cloudCodeExecution in the account's user settings; default true (apps/web/features/settings/hooks/use-capabilities-preferences.ts:67; code-execution-policy.ts:7-8, 33-36).
- Settings copy says the sandbox can reach only GitHub, npm and PyPI (CapabilitiesSection.tsx:112).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Setting stored in user_settings under capabilities.cloudCodeExecution; absent means enabled; false means off (code-execution-policy.ts:25-37).
- A failed read refuses execution (code-execution-policy.ts:43-48).
- Server enforcement in the tool loop with a user-facing explanation to the model (tool-loop.ts:2814-2840) and in the code-runs route with a forbidden error (code-runs/route.ts:106-110).
- Handshake feeds the setting and the deployment flag into canUseCloudExecution (apps/web/app/api/me/route.ts:282-300; capability-handshake-service.ts:95-98).
- Platform kill switch: if closed, the turn is marked execution-unavailable (request-processor.ts:5226-5228, 6416-6419).
- Execution tools offered only for a streaming turn when the sandbox is on and the provider routes to it; otherwise a provider's own code tool if the model supports it (execution-tools.ts:258-270).
- Implicit turn-on from the words of the prompt, unless the surface is excluded (request-processor.ts:1003-1013).
- Sandbox network allowlist in code: github hosts, npm and PyPI hosts (apps/web/lib/e2b/runtime.ts:104-114). This matches the Settings text.
- Per-plan sandbox slots and lifetime (billing-catalog.ts:531-532, 590, 607, 620-628).

**Incomplete**

- The allowlist enforcement at the sandbox network level was not verified; only the host list in code was read.

**Present but disconnected or switched off**

- Everything is off unless AGI_E2B_EXECUTION is 1 or a sandbox key is set (gate.ts:11-26). The cutover flag decides the handshake (me/route.ts:282). Whether production has it on is unknown.
- Managed compute private beta gate is separate (gate.ts:36-38; managed-compute-gate.ts).

**Not available**

- Local-only and Local + BYOK tiers: no managed sandbox (runtime.ts:121-124; billing-catalog.ts:590, 607).
- Desktop, mobile, CLI, VS Code, Chrome: the brief gives web status only.

## 4. Required behaviour

**Established requirements**

- From the browser a user turns on cloud code execution (/code or a skill) and the server runs code in a provider sandbox or E2B, with a Settings switch to refuse it. (source: S69.10)
- An absent setting means enabled; an unreadable setting means refused. (source: apps/web/lib/server/code-execution-policy.ts:13-19, 43-48)
- Enforcement is on the server, because tools are declared by the client. (source: code-execution-policy.ts:15-17; tool-loop.ts:2814-2818)
- Code execution forces Artifacts on. (source: CapabilitiesSection.tsx:52, 142-151)
- Execution tools and sandbox availability depend on a provider route or an AGI harness and must not be described as intrinsic model abilities. (source: doc: AGENTS.md section 4)
- Local and BYOK stay outside managed sandbox provisioning. (source: apps/web/lib/e2b/runtime.ts:121-124)

**Acceptance criteria**

1. With the switch on and execution available, '/code' plus a request runs code and shows output.
2. With the switch off, the same request returns an answer saying execution is off and pointing to Settings, Capabilities.
3. With the switch off, the code-runs route returns forbidden.
4. Turning execution on makes the Artifacts switch read 'Required by code execution' and disabled.
5. If the settings read fails, execution is refused with a 'temporarily unavailable' explanation.
6. On a model without code ability the slash command says to switch models.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The switch should also hide or grey the /code entry when off so the person is told before sending [inferred; not found in ChatComposerNew].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a notice at /code time when the account switch is off, so the person does not learn only from the model's reply.
- [proposed] Add a test that reads the sandbox host list and the Settings copy together so they cannot drift.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Slash command /code | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Handles /code and sets codeExecution (lines 1664, 3247-3265). |
| component | CapabilitiesSection | `apps/web/features/settings/sections/CapabilitiesSection.tsx` | The Settings switch and the Artifacts dependency. |
| hook | use-capabilities-preferences | `apps/web/features/settings/hooks/use-capabilities-preferences.ts` | Loads and saves the capabilities namespace; refreshes billing after the switch changes (line 296). |
| service | code-execution-policy | `apps/web/lib/server/code-execution-policy.ts` | Reads user_settings and returns allowed or refused. |
| table | user_settings | `apps/web/lib/server/code-execution-policy.ts` | Table read by the policy (line 28). |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Implicit execution intent, kill switch, tool offering. |
| service | tool-loop | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Policy check and execution routing (lines 2814-2840). |
| service | execution-tools | `apps/web/lib/e2b/execution-tools.ts` | Chooses sandbox or provider tools for a turn. |
| config | E2B gate | `apps/web/lib/e2b/gate.ts` | Environment gates for sandbox execution. |
| service | E2B runtime | `apps/web/lib/e2b/runtime.ts` | Sandbox lifecycle, host allowlist, per-plan slots. |
| service | hosted-code-execution | `apps/web/lib/e2b/hosted-code-execution.ts` | Pricing for provider-hosted code tools. |
| service | compute-metering | `apps/web/lib/e2b/compute-metering.ts` | Sandbox compute metering. |
| endpoint | POST code-runs | `apps/web/app/api/chat/conversations/[id]/code-runs/route.ts` | Rerun code in a conversation; checks capability, policy and compute access. |
| endpoint | GET /api/me | `apps/web/app/api/me/route.ts` | Returns the capability handshake including canUseCloudExecution (lines 282-300). |
| service | capability-handshake-service | `apps/web/lib/services/capability-handshake-service.ts` | Grants or removes canUseCloudExecution by deployment, model and user setting. |
| config | Plan limits | `packages/contracts/types/src/billing-catalog.ts` | maxSandboxes and sandboxTtlMs per plan. |
| test | code-execution-policy test | `apps/web/lib/server/__tests__/code-execution-policy.test.ts` | Policy rules. |
| test | CapabilitiesSection test | `apps/web/features/settings/sections/__tests__/CapabilitiesSection.test.tsx` | Settings section. |
| test | useCapabilitiesPreferences test | `apps/web/features/settings/hooks/__tests__/useCapabilitiesPreferences.test.tsx` | Settings hook. |
| test | execution-tools test | `apps/web/lib/e2b/__tests__/execution-tools.test.ts` | Tool choice. |
| test | gate test | `apps/web/lib/e2b/__tests__/gate.test.ts` | Environment gates. |
| test | Code-runs route test | `apps/web/app/api/chat/conversations/[id]/code-runs/route.test.ts` | Route behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types /code or asks; the composer sets codeExecution true for that send. | device | ChatComposerNew.tsx:1664, 3247-3265 |
| The server may also set code_execution from the prompt text when the person did not choose. | our servers | request-processor.ts:1003-1013 |
| The server reads the platform switch; if closed the turn proceeds with execution marked unavailable and the model is told. | our servers | request-processor.ts:5226-5228, 6416-6419 |
| Execution tools are added when the sandbox is on and the turn streams, or a provider tool when the model has one. | our servers | execution-tools.ts:258-270 |
| When the model calls a tool, the loop reads the account setting and refuses if off or unreadable. | our servers | tool-loop.ts:2814-2840 |
| The code runs in a sandbox that can reach only the listed hosts, with a per-plan slot count and lifetime. | outside service | runtime.ts:104-114, 126-136 (sandbox provider named E2B in gate.ts) |
| Output and files stream to the chat; compute is metered. | our servers | compute-metering.ts; useChatStream.ts:3498-3500 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| cloudCodeExecution setting | table:user_settings, settings JSON, namespace capabilities | Server side, read on each turn | Kept with the account settings |
| Code, outputs and generated files | Sandbox then chat messages and file storage (generated-files.ts); exact storage not traced | With the conversation | Sandbox lifetime is per plan (billing-catalog.ts:531-532); file retention unknown |
| Compute usage | Usage and metering tables (not traced) | Server side | unknown |

**Models and providers.** The sandbox is provider-neutral for models that route to it; otherwise the model's own provider code tool is used when the model supports it (execution-tools.ts:258-270; hosted-code-execution.ts:9-13 names two providers with hosted tools). The model catalog must have at least one model with codeExecution ability for the capability to be granted (capability-handshake-service.ts:95-98).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. Account setting capabilities.cloudCodeExecution (default on). |
| Permissions | Platform kill switch canUseCloudExecution; workspace controls can disable it (request-processor.ts:2308-2318 reads workspace-disabled capabilities). |
| Subscription | Sandbox slots by plan: Local-only and Local + BYOK 0; Free 2; higher plans more up to a five-per-user ceiling (billing-catalog.ts:531-532, 590, 607, 620-681; runtime.ts:121-128). Free compute uses a daily platform allowance; paid plans use credit reservations (runtime.ts:121-124). |
| Limits and metering | Per-plan sandbox count and lifetime; conversation timeout 10 minutes and command timeout 60 seconds in the runtime constants (runtime.ts:100-101); code-runs route max duration 300 seconds (code-runs/route.ts:42). |
| Feature flags | AGI_E2B_EXECUTION and E2B_API_KEY control availability (gate.ts:11-26); AGI_MANAGED_COMPUTE_PRIVATE_BETA is a separate gate (managed-compute-gate.ts:40). Handshake uses feature_flags.code_execution (me/route.ts:282). |
| Model compatibility | Needs a model with tool ability and a streaming turn for the sandbox; or a model with its provider's own code tool (execution-tools.ts:258-270). The slash command refuses models without it (ChatComposerNew.tsx:3256-3261). |
| Provider restrictions | Sandbox routes only for providers that providerRoutesToE2B accepts (function name seen at execution-tools.ts:259; list not read). |
| Local mode | Not available: Local and BYOK stay outside managed sandbox provisioning (runtime.ts:121-124) and their plans have 0 sandboxes (billing-catalog.ts:590, 607). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Setting loading or failed to load | Switches are locked until loaded or while a load error exists; retry control exists. | CapabilitiesSection.tsx:46, 100-105 |
| Save error | 'Try saving again' button. | CapabilitiesSection.tsx:100-105 |
| Setting off | Model told; route returns forbidden. | tool-loop.ts:2829-2833; code-runs/route.ts:106-110 |
| Setting unreadable | Refused as temporarily unavailable. | code-execution-policy.ts:43-48 |
| Deployment lacks sandbox | Code-runs route answers service unavailable 'Running code is not available on this deployment.' | code-runs/route.ts:72-74 |
| Execution requested but no tool | Turn marked unavailable and disclosed to the model. | execution-tools.ts:248-257; request-processor.ts:6416-6424 |
| Kill switch gate unreadable | Switchable tools withheld. | request-processor.ts:5206-5214 |
| Non-streaming turn | Sandbox tools not offered. | execution-tools.ts:259 |
| Timeout | Command timeout 60 s; function limit 300 s. | runtime.ts:100-103; code-runs/route.ts:42 |
| Offline | Same as any send (F069-01). | ChatComposerNew.tsx:3588 |
| Accessibility | Switch has an aria-label and the Artifacts note is described by aria-describedby. | CapabilitiesSection.tsx:122, 133-136 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/__tests__/code-execution-policy.test.ts`: Allowed, disabled and unavailable results.
- `apps/web/features/settings/sections/__tests__/CapabilitiesSection.test.tsx`: Settings section controls.
- `apps/web/features/settings/hooks/__tests__/useCapabilitiesPreferences.test.tsx`: Preferences hook.
- `apps/web/lib/e2b/__tests__/execution-tools.test.ts`: Which execution tools a turn gets.
- `apps/web/lib/e2b/__tests__/gate.test.ts`: Sandbox environment gates.
- `apps/web/lib/e2b/__tests__/runtime.test.ts`: Sandbox runtime.
- `apps/web/lib/e2b/__tests__/network-policy.test.ts`: Network policy.
- `apps/web/app/api/chat/conversations/[id]/code-runs/route.test.ts`: Code-runs route.
- `apps/web/lib/prompts/__tests__/chat-system-prompt-capability-switches.test.ts`: Prompt text when the switch is off.

**Test scenarios**

- **Run code with the switch on**
  1. Turn the Settings switch on.
  2. Type '/code' and ask to compute something.
  3. Send.
  - Expected: Execution output shows in the chat.
- **Switch off**
  1. Turn the switch off.
  2. Ask the same request.
  - Expected: The reply says execution is off and names Settings, Capabilities; no code runs.
- **Artifacts dependency**
  1. Turn execution on.
  2. Open the Artifacts row.
  - Expected: On and disabled with 'Required by code execution'.
- **Wrong model**
  1. Pick a model that cannot run code.
  2. Type /code.
  - Expected: Notice asks to switch models.
- **Local-only account**
  1. Use a Local-only or Local + BYOK plan account on web.
  2. Ask to run code.
  - Expected: No sandbox is provisioned; confirm the visible message in the running app (not read from code).

**Where to look when it fails**

- Log 'Code execution policy read failed; refusing execution'.
- Log '[tool-loop] code execution policy adapter unavailable'.
- Error text 'Running code is turned off for this account...'.
- Capability handshake in /api/me for canUseCloudExecution.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/069-web-application.md](../../70-qa/test-plans/web/069-web-application.md)

## 10. Gaps and dependencies

- **No notice at /code time when the account switch is off.** Affects: Web users who turned execution off. Evidence: Only the model reply and routes explain it (tool-loop.ts:2829-2833). Work needed: Read the capability in the composer and say so before sending.
- **Sandbox network limits were read as a host list only, not tested.** Affects: Security claims in Settings copy. Evidence: runtime.ts:104-114. Work needed: Run a live test from inside a sandbox.
- **No Local mode path for code execution on web.** Affects: Local and BYOK users. Evidence: runtime.ts:121-124. Work needed: Decide whether Local execution exists on Desktop and say so; not a web item.
- **Status on other apps not in the brief.** Affects: Subscription parity. Evidence: S69.10 lists web only. Work needed: Check each app against the same setting.

**Depends on**

- surface:web
- mode:cloud
- table:user_settings
- plan:Free
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-files-artifacts-and-storage
- api:POST /api/chat/conversations/{id}/code-runs

## Unknown

- Whether sandbox execution is switched on in production.
- How long generated files and sandbox outputs are kept.
- The exact list of providers that route to the sandbox.
- Whether the sandbox network allowlist is enforced as stated.
- Behaviour on apps other than the web.
