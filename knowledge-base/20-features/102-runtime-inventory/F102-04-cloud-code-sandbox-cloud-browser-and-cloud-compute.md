---
id: "F102-04"
type: "feature"
title: "Cloud code sandbox, cloud browser and cloud computer"
aliases: ["Cloud code sandbox", "Managed Code", "Managed code sandbox", "E2B sandbox", "Cloud browser runtime", "Cloud virtual-computer runtime", "S102.08", "S102.09", "S102.10"]
area: "102 Runtime inventory"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S102.08", "S102.09", "S102.10"]
depends_on: ["SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-authorization-and-workspaces", "surface:web", "surface:chrome", "mode:cloud", "plan:basic", "plan:free", "table:cloud_code_sessions", "file:apps/web/lib/e2b/gate.ts", "F102-02"]
basis: "code inspection"
second_reader: "9 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F102-04 Cloud code sandbox, cloud browser and cloud computer

Cloud code runs in an isolated remote sandbox, but only when the server cutover flag AGI_E2B_EXECUTION is 1, a sandbox key and a compute price are set, and the plan includes AGI Code (Basic or above). A cloud browser and a cloud virtual computer do not exist; the cloud browser is declared unavailable.

Area: [102. Runtime inventory](README.md). Requirement items: [S102.08](../../10-requirements/capabilities/102-runtime-inventory.md#s10208), [S102.09](../../10-requirements/capabilities/102-runtime-inventory.md#s10209), [S102.10](../../10-requirements/capabilities/102-runtime-inventory.md#s10210).

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

**What it does.** Provides managed isolated sandboxes where the model runs code and where coding sessions run, billed by compute seconds. It also records that a cloud browser and a cloud computer are not built.

**Why it exists.** Running untrusted code needs isolation, metering and limits. Users without a local setup still want code execution in the cloud.

**Who uses it.** Paid users of AGI Code on the web and users whose chat uses the code-execution tool; operators who enable the sandbox.

**Problems it solves**

- Running generated code safely away from the user's machine.
- Charging for sandbox seconds and refusing when no price exists.
- Keeping credentials out of the sandbox (egress proxy rules).

**Use cases**

- A Basic user opens a Code session on the web and runs a repo task.
- A chat turn runs a Python snippet in the sandbox when the execution tool is on.
- On a deployment where the flag is off, the code session is refused with 'Managed Code is not enabled for this deployment. Use the desktop app for local code.'
- A user asking the agent to drive a cloud browser gets the built-in browser or the user's own Chrome instead.

## 2. User experience

**Where to find it**

- Web: the Code workspace at /code and /code/[sessionId] (apps/web/app/code/[sessionId]/page.tsx); '/code/computer' titled 'Your computer · Code' sends tasks to the user's own computer, not a cloud computer (apps/web/app/code/computer/page.tsx).
- Desktop: coding sessions run locally (see F102-05, F102-06).
- Visible entry label on the web nav: unknown.

**Before you start**

- Signed-in account.
- A plan that includes AGI Code: sandbox count above 0 and a coding-agent daily budget above 0 (billing-catalog.ts:836-839 planIncludesAgiCode); Free has 2 sandboxes but budget 0, so it does not include Code. basic and above do (budget 100 cents/day for basic).
- Server: AGI_E2B_EXECUTION=1, E2B_API_KEY set and a priced compute rate (apps/web/lib/e2b/gate.ts:20-28).
- Managed compute private beta not switched off (AGI_MANAGED_COMPUTE_PRIVATE_BETA; default on, apps/web/lib/managed-compute-gate.ts:55-58).

**Screens and controls**

- Code session creation (POST /api/code/sessions), network access choice (Isolated, Trusted hosts, Full internet) and extra hosts; full internet refused while credentials would enter the sandbox (cloud-code-session-open.ts:62-100).

**Journey**

1. 1. The user starts a Code session.
2. 2. The server checks the deployment gates, workspace policy and managed-compute access; the plan and session count are then enforced when the session is created (cloud-code-session-service.ts:1243-1245).
3. 3. The server provisions a sandbox after reserving compute funds.
4. 4. The user or agent runs code; output returns.
5. 5. Idle sandboxes are reclaimed by a cron (vercel.json:54).

**What the person sees and gets**

- Errors: 'Managed Code is not enabled for this deployment. Use the desktop app for local code.'; 'Managed compute is temporarily unavailable. Use Local or BYOK in the meantime, or try again shortly.'; 'Your plan does not include managed Code sessions' (cloud-code-session-service.ts:1245).
- Code-run route says 'Running code is not available on this deployment.' (chat code-runs route.ts:76).

**Settings**

- Network access, runtime id and extra hosts per session.
- Server env names: AGI_E2B_EXECUTION, E2B_API_KEY, AGI_E2B_COMPUTE_MICROUSD_PER_SECOND, AGI_MANAGED_COMPUTE_PRIVATE_BETA (apps/web/.env.example:384-386, :435).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Gates: cutover flag is exactly '1'; provisioning is ready only with flag, key and a resolvable compute price (gate.ts:16-28). The weaker e2bExecutionEnabled is key OR flag (gate.ts:9-14).
- Session open refuses when provisioning is not ready or beta is off, then checks egress rules, harness credentials, workspace code gates and managed compute access (cloud-code-session-open.ts:37-155); the plan (planIncludesAgiCode) and active-session count are enforced afterwards in createCloudCodeSession (cloud-code-session-service.ts:1243-1245).
- Runtime fails closed: refuses to provision without a compute rate or funds reservation (apps/web/lib/e2b/runtime.ts:801, :886, :941).
- Chat tool loop returns 'Tool ... is not available.' for execution tools when the cutover is off (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2802-2808); code-runs route answers service unavailable (apps/web/app/api/chat/conversations/[id]/code-runs/route.ts:76).
- Idle sandbox reclaim cron and stuck code-turn reaper (vercel.json:54, :58).
- Cloud code turns run as a durable workflow (apps/web/lib/workflows/cloud-code-turn-workflow.ts:143).

**Incomplete**

- The brief says that with the sandbox off, code runs on the provider-native interpreter; the code only shows the execution tools becoming unavailable when the cutover is off. Provider-native fallback was not found: unknown.
- The chat code tool also uses a sandbox (billing-catalog.ts:834-839 comment), but the chat execution gate is only the cutover flag (tool-loop.ts:2802; code-runs/route.ts:76) with no planIncludesAgiCode check there, so which plans may use the chat execution tool is not stated by the code read (billing-catalog.ts:834-839; tool-loop.ts:2802; code-runs/route.ts:76).

**Present but disconnected or switched off**

- Sandbox is off by default: the example environment ships AGI_E2B_EXECUTION=0 (apps/web/.env.example:384).
- Cloud browser is declared but disabled: BROWSER_SESSION_CAPABILITIES.cloud has available:false and the reason 'The cloud browser is not available yet. Run this in the built-in browser, or in your own Chrome through the AGI extension.' (packages/contracts/types/src/browser-session.ts:34-59).

**Not available**

- Cloud browser runtime (S102.09) and cloud virtual-computer runtime (S102.10): missing in the ledger (audit/ledger/ecosystem-capability-ledger.jsonl:3171-3172; audit/missing/102-runtime-inventory.md).
- The Chrome extension's cloud agent client sends a task to a cloud agent and receives tool calls back through a tool handoff (toolHandoff, apps/extension/src/features/computer-use/cloudAgentClient.ts:402, :512, :525); it is not a cloud browser. Its head (lines 1-20) only shows imports.
- '/code/computer' ('Your computer · Code', 'Send a task to Cloud on your own computer') targets the user's own computer (apps/web/app/code/computer/page.tsx:5-6).

## 4. Required behaviour

**Established requirements**

- Cloud code runs in an isolated remote sandbox. Status: partial (off unless AGI_E2B_EXECUTION=1; turn it on in production). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.08)
- The product runs a browser in the cloud that the agent can drive. Status: missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.09)
- The product runs a virtual computer in the cloud that the agent can operate. Status: missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.10)
- Sandbox compute must be priced; provisioning fails closed otherwise. (source: (apps/web/lib/e2b/runtime.ts:886))

**Acceptance criteria**

1. With AGI_E2B_EXECUTION unset or 0, opening a Code session returns the 'not enabled for this deployment' error.
2. With flag 1 and key but no compute rate, provisioning is not ready and no sandbox is created.
3. A Free-plan user is refused with 'Your plan does not include managed Code sessions'.
4. With everything on, a Basic user can open a session and the cap on active sessions equals the plan's sandbox count.
5. With the flag off, a chat turn that calls an execution tool receives 'is not available'.
6. The cloud browser capability reports available false with the stated reason.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local and own-key users keep code execution on their own computer (error text points to the desktop app) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Turn the sandbox on in production once pricing is configured, as the brief says.
- [proposed] Decide whether the cloud browser and cloud computer are on the roadmap; the contract already reserves a 'cloud' browser session kind.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | e2b gate | `apps/web/lib/e2b/gate.ts` | Flag, key and price checks (lines 6-28). |
| service | e2b runtime | `apps/web/lib/e2b/runtime.ts` | Provision, reconnect, fail closed (lines 801, 886, 941). |
| service | compute-metering | `apps/web/lib/e2b/compute-metering.ts` | Price per second; sandboxComputeIsPriceable (line 89). |
| service | cloud-code-session-open | `apps/web/lib/services/cloud-code-session-open.ts` | Gates for opening a session (line 37): deployment gates, egress, harness credential, workspace code gates (also per extra egress host, reach_host, lines 124-135) and managed-compute access; the plan check is not here. |
| service | cloud-code-session-service | `apps/web/lib/services/cloud-code-session-service.ts` | Create session (createCloudCodeSession); plan (planIncludesAgiCode) and count checks (lines 1206-1260). |
| endpoint | POST /api/code/sessions | `apps/web/app/api/code/sessions/route.ts` | Create a Code session (line 93). |
| endpoint | POST /api/chat/conversations/[id]/code-runs | `apps/web/app/api/chat/conversations/[id]/code-runs/route.ts` | Run code from chat; cutover check line 76. |
| service | tool-loop execution tools | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Execution tool refusal when off (line 2802). |
| config | managed-compute-gate | `apps/web/lib/managed-compute-gate.ts` | Private beta switch (line 55). |
| service | managed-compute-access | `apps/web/lib/services/managed-compute-access.ts` | Subscription, workspace policy and spend limit for compute (line 69). |
| config | plan product limits | `packages/contracts/types/src/billing-catalog.ts` | maxSandboxes, sandboxTtlMs, MAX_MANAGED_SANDBOXES_PER_USER = 20 (line 473), codeHarnessDailyCeilingCents, planIncludesAgiCode (lines 572-723, 836). |
| table | cloud_code_sessions | `apps/web/lib/services/cloud-code-session-service.ts` | Session rows (line 834). |
| table | cloud_code_agent_turns | `apps/web/lib/services/cloud-code-session-service.ts` | Turn rows (line 560). |
| job | reclaim-sandboxes cron | `apps/web/app/api/cron/reclaim-sandboxes/route.ts` | Reclaims idle sandboxes; vercel.json:54. |
| job | reap-code-turns cron | `apps/web/app/api/cron/reap-code-turns/route.ts` | Ends stuck code turns. |
| config | browser session contract | `packages/contracts/types/src/browser-session.ts` | Declares cloud browser unavailable (lines 22-59). |
| screen | Code workspace pages | `apps/web/app/code/[sessionId]/page.tsx` | Session page; /code/computer page routes to the user's own computer. |
| integration | extension cloud agent client | `apps/extension/src/features/computer-use/cloudAgentClient.ts` | Chrome extension asks a cloud agent for steps; tool calls come back through toolHandoff (lines 402, 512, 525) to the local browser. |
| config | env example | `apps/web/.env.example` | Ships AGI_E2B_EXECUTION=0 (line 384). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The web client asks to open a session. | device | (apps/web/app/api/code/sessions/route.ts:93) |
| The server checks deployment gates, workspace policy and spend; the plan check follows in createCloudCodeSession. | our servers | (cloud-code-session-open.ts:44-155; cloud-code-session-service.ts:1243-1245) |
| The server reserves compute funds and creates the remote sandbox through the sandbox vendor. | outside service | (lib/e2b/runtime.ts:886-941) |
| Code runs in the sandbox; provider credentials stay behind an egress proxy. | outside service | (cloud-code-session-open.ts:62-80; lib/e2b/provider-proxy.ts) |
| Results return to the server and client; sandbox seconds are settled. | our servers | (lib/e2b/compute-metering.ts) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Session and turn rows | tables cloud_code_sessions, cloud_code_agent_turns | Server data | unknown |
| Files inside the sandbox | the remote sandbox | No | Reclaimed by cron when idle (vercel.json:54) |

**Models and providers.** Sandboxes come from one outside sandbox vendor (named in code only as E2B). Model calls from a coding agent inside the sandbox go through a provider proxy keyed per session (lib/e2b/provider-proxy*.ts); which harnesses have managed credentials is checked at open (cloud-code-session-open.ts:84-100).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | Workspace code policy and feature gate (cloud-code-session-open.ts:107-130); the policy gate also runs per extra egress host (reach_host) as well as open_cloud_session (cloud-code-session-open.ts:124-135). |
| Subscription | planIncludesAgiCode: plan:basic and above; Free refused (billing-catalog.ts:836-839; cloud-code-session-service.ts:1244). Subscription access check allows Free and missing subscriptions at that layer and blocks inactive paid ones (managed-compute-access.ts:69-100). |
| Limits and metering | Active sandboxes per plan (free 2, basic 5, pro 10, max and max_15x the managed cap), daily coding-agent budget per plan (basic 100, pro 500, max 2500, max_15x 7500 cents); compute seconds priced and reserved. The managed sandbox cap is 20 (MAX_MANAGED_SANDBOXES_PER_USER, billing-catalog.ts:473); each plan also has a sandbox TTL (sandboxTtlMs; Free 60 minutes) (billing-catalog.ts:625). |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY, AGI_E2B_COMPUTE_MICROUSD_PER_SECOND, AGI_MANAGED_COMPUTE_PRIVATE_BETA. |
| Model compatibility | unknown for the in-sandbox coding agent beyond the harness list. |
| Provider restrictions | Harness credentials must be available or the user brings a key (cloud-code-session-open.ts:84-100). |
| Local mode | Not available: the error tells local users to use the desktop app for local code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Sandbox disabled | Capability-unavailable error; chat execution tools report not available. | (cloud-code-session-open.ts:44-48; tool-loop.ts:2802) |
| No compute price | Provisioning refused, logged as fail-closed. | (runtime.ts:801, :886) |
| Funds cannot be reserved | Refused. | (runtime.ts:941) |
| Network access needs proxy | HTTP 422 with a plain message. | (cloud-code-session-open.ts:70-80) |
| Plan limit reached | CloudCodeLimitError with count message. | (cloud-code-session-service.ts:1243-1260) |
| Cloud browser requested | Unavailable with stated reason. | (browser-session.ts:34-59) |
| Offline / reconnect | A resumed sandbox interval is limited to what its hold still funds (runtime.ts:~895-935). | (runtime.ts:~895-935) |
| Accessibility | unknown | not read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/e2b/__tests__/gate.test.ts`: The gates.
- `apps/web/lib/e2b/__tests__/runtime.test.ts`: Sandbox runtime.
- `apps/web/lib/e2b/__tests__/sandbox-provision-refusal.test.ts`: Fail-closed provisioning.
- `apps/web/lib/e2b/__tests__/compute-metering.test.ts`: Compute metering.
- `apps/web/lib/e2b/__tests__/network-policy.test.ts`: Network policy.
- `apps/web/lib/services/__tests__/managed-compute-access.test.ts`: Managed compute access.
- `apps/web/app/api/code/sessions/route.test.ts`: Create session route.
- `apps/extension/__tests__/computer-use-cloud-errors.test.ts`: Extension cloud agent errors.

**Test scenarios**

- **Flag off**
  1. Use the shipped example env (flag 0).
  2. Try to open a Code session.
  - Expected: Error 'Managed Code is not enabled for this deployment...'.
- **No price**
  1. Set flag 1 and a key but no compute rate.
  2. Open a session.
  - Expected: Not ready; refused; no sandbox created.
- **Plan**
  1. Enable everything on a test deployment.
  2. Open a session as Free, then as Basic.
  - Expected: Free refused with plan message; Basic opens.
- **Execution tool off**
  1. With flag 0, ask chat to run code with the execution tool declared.
  - Expected: Tool result 'is not available' and the model explains.
- **Cloud browser**
  1. Read the browser session capability for kind cloud.
  - Expected: available false with the unavailable reason.

**Where to look when it fails**

- Logs: '[e2b] sandbox compute has no configured price; refusing to provision (fail-closed)', '[e2b] refusing widened egress'.
- Tables: cloud_code_sessions, cloud_code_agent_turns.
- Cron: reclaim-sandboxes, reap-code-turns.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Sandbox is off by default and the brief asks to turn it on in production.** Affects: Web users of Code and chat code execution.. Evidence: (.env.example:384; brief S102.08). Work needed: Configure price, key and flag in production; run a live check.
- **Brief's provider-native interpreter fallback not found.** Affects: Chat code execution when the sandbox is off.. Evidence: (tool-loop.ts:2802). Work needed: Confirm whether a native interpreter path exists.
- **No cloud browser runtime.** Affects: Web users and all apps wanting a browser that survives disconnect.. Evidence: (browser-session.ts:52-59; ledger S102.09). Work needed: Build a runtime, session lifecycle, metering and entitlement.
- **No cloud virtual computer runtime.** Affects: Web users.. Evidence: (ledger S102.10). Work needed: Same as above.

**Depends on**

- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-authorization-and-workspaces
- surface:web
- surface:chrome
- mode:cloud
- plan:basic
- plan:free
- table:cloud_code_sessions
- file:apps/web/lib/e2b/gate.ts
- F102-02

## Unknown

- Whether a provider-native code interpreter exists as fallback.
- Visible label of the Code entry in the web navigation.
- Whether the sandbox vendor is configured in production.
- Compute price value (deliberately not recorded).
- Whether desktop or mobile show any cloud code entry: not found.
- Brief line apps/web/lib/e2b/runtime.ts:889 differs from the lines found (801, 886, 941).
- Which plans may use the chat code-execution tool (no plan check found beside the cutover gate).

## Second reader's check

A second reader checked 11 statements of this page against the code: 9 correct, 2 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3/2):** "Session open refuses when provisioning is not ready or beta is off, then checks egress rules, harness credentials, workspace gates, managed compute access and plan (cloud-code-session-open.ts:37-200)" The code shows: Order is right, but the plan check is not in cloud-code-session-open.ts; it is inside createCloudCodeSession (transaction) in cloud-code-session-service.ts:1243-1245 using the entitlement plan passed in. (cloud-code-session-open.ts:37-45, 137-155; cloud-code-session-service.ts:1243-1245). **Corrected:** Open checks gates, egress, harness credential, workspace code gates, then managed-compute access; the plan (planIncludesAgiCode) and active-session count are enforced afterwards in createCloudCodeSession.
- **Partly wrong (section 3):** "'/code/computer' targets the user's own computer, not a cloud computer; extension cloudAgentClient drives the user's own browser" The code shows: /code/computer page description is 'Send a task to Cloud on your own computer', title 'Your computer · Code' (confirmed). The cloudAgentClient.ts head (lines 1-20) imports the managed chat routing/free-trial client and shows no statement that it drives a local browser; the 'not a cloud browser' reading rests on lines 1-15 which only show imports, so the citation does not support it. (apps/web/app/code/computer/page.tsx:5-6; apps/extension/src/features/computer-use/cloudAgentClient.ts:1-20). **Corrected:** Keep the /code/computer claim; for the extension, cite where tool calls are returned to the local browser (e.g. toolHandoff usage), not lines 1-15.

**Facts the page missed**

- Free plan has maxSandboxes 2 but is refused Code; yet the chat code tool also uses a sandbox, and the page does not say which plans may use the chat execution tool (gate is only e2bCutoverEnabled in tool-loop.ts:2802 and code-runs/route.ts:76, with no planIncludesAgiCode check there) - billing-catalog.ts:834-839 comment says 'the chat code tool uses one too'.
- The managed sandbox cap value is 20 (MAX_MANAGED_SANDBOXES_PER_USER) and per-plan sandbox TTL (sandboxTtlMs, e.g. Free 60 minutes) is a limit the page omits: billing-catalog.ts:473, 626.
- Workspace policy gates run per extra egress host (reach_host) in addition to open_cloud_session: cloud-code-session-open.ts:124-135.
