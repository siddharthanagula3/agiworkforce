---
id: "F104-09"
type: "feature"
title: "Cloud code sandbox and browser automation"
aliases: ["Cloud code sandbox and browser automation", "Cloud Code", "hosted sandbox", "E2B sandbox", "code execution", "Chrome browser control", "computer use", "CDP automation", "S104.24", "S104.25"]
area: "104 Named technology options-not claims about competitor internals"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S104.24", "S104.25"]
depends_on: ["surface:web", "surface:chrome", "surface:mobile", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "api:GET /api/code/sessions", "file:apps/web/lib/e2b/gate.ts", "file:apps/extension/manifest.json"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F104-09 Cloud code sandbox and browser automation

Two features. On the web, Cloud Code and code execution tools run in a hosted sandbox, available only when the deployment turns it on and the plan includes it. In the Chrome extension, a signed-in agent drives a real tab through the Chrome debugger protocol, with per-site approval and permission modes.

Area: [104. Named technology options-not claims about competitor internals](README.md). Requirement items: [S104.24](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10424), [S104.25](../../10-requirements/capabilities/104-named-technology-options-not-claims-about-competitor-interna.md#s10425).

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

**What it does.** Runs model-written code in an isolated hosted sandbox (web), and clicks, types, navigates and reads pages in the person's browser through the debugger protocol (Chrome extension).

**Why it exists.** The brief requires cloud code to run in a hosted sandbox provider (S104.24, status partial) and the agent to drive a real browser through an automation engine (S104.25) (doc: knowledge-base/data/area-briefs/104-named-technology-options-not-claims-about-competitor-interna.md).

**Who uses it.** Web users on a plan that includes Cloud Code; Chrome extension users who approve browser tasks.

**Problems it solves**

- Running code safely away from the user's machine.
- Doing multi-step web tasks in a signed-in session.
- Controlling risk: sensitive sites, purchases and uploads always ask (approvalPolicy.ts:3-35; spAutonomyFullAccessTooltip).

**Use cases**

- Open a Cloud Code session and run commands.
- Ask chat to run Python and get a chart file back.
- In the side panel, ask the agent to fill a form on an approved site.
- Run an unattended task with the YOLO permission mode on approved sites.

## 2. User experience

**Where to find it**

- Web: Cloud Code page at /code (CloudCodePage.tsx); notices explain why it is unavailable (CloudCodePage.tsx:2067-2073).
- Chrome: side panel autonomy menu 'How should AGI act in your browser?' with Ask first, Auto, Full access, YOLO (_locales/en/messages.json keys spAutonomy*).
- Mobile: settings row 'Cloud agent' shows availability for cloud code (CloudAgentStatus.tsx:15-21).
- Desktop, CLI, VS Code: not read for this feature.

**Before you start**

- Web sandbox: AGI_E2B_EXECUTION=1, a sandbox key and a priceable compute rate on the server, and a plan that includes Cloud Code (gate.ts:20-28; sessions/route.ts:55-66).
- Chrome: signed-in extension, host permission for the site, browser-control consent for the origin (browserControlConsent.ts:4-17).
- Chrome debugger permission is in the manifest (manifest.json:22).

**Screens and controls**

- Web: session list, create, commands, agent, changes, commit, pull request, notebook routes (app/api/code/sessions/...).
- Chrome: permission mode menu, approval prompts, consent text 'This grants full DevTools-Protocol control' (browserControlConsent.ts:6).

**Journey**

1. Web: open /code; the page reads availability; if enabled and entitled, create a session; run commands or the agent.
2. Chrome: type a task; the agent selects a model through Managed Cloud; before each action the policy decides ask or act; Chrome shows its debugging banner while attached.

**What the person sees and gets**

- Web notice when unavailable, with an upgrade link when the plan lacks it (CloudCodePage.tsx:2067-2105).
- Model-facing sentence per refusal cause: not configured, no capacity, policy, over quota, provider error (unavailability.ts:10-30).
- Chrome approval cards and action descriptions (describeAction.ts).

**Settings**

- Chrome permission mode stored under agi_cu_ask_before_acting; default Auto (askBeforeActing.ts:3-11).
- Chrome per-site allowlist and one-time grants (oneTimeSiteGrants.ts; browserControlConsent.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Three gates exist: e2bExecutionEnabled is true if a key is set OR the flag is 1; e2bCutoverEnabled needs the flag equal to 1; e2bProvisioningReady needs flag, key and a priceable rate (gate.ts:9-28).
- The runtime refuses with 'not-configured' only if the loose gate is false (runtime.ts:796); it also fail-closes when compute has no resolvable rate (runtime.ts:880-889).
- Chat execution tools check the strict cutover flag (tool-loop.ts:2802); the chat code-runs route does the same (code-runs/route.ts:76); Cloud Code routes use the provisioning gate (sessions/route.ts:61; agent/route.ts:101).
- Session list returns availability {deploymentEnabled, planEntitled, planTier, maxSessions} (sessions/route.ts:55-66); plan inclusion comes from plan limits (billing-catalog.ts:801-841).
- Chrome attaches the debugger per tab with a hold count and queues attach and detach operations (debuggerSession.ts:62-72,110-128,185-230).
- User-cancelled detach and any detach drop holds and notify handlers (debuggerSession.ts:151-175).
- CDP commands check ownership before and after each command, and Runtime.evaluate is limited to an isolated world (cdpDriver.ts:296-330).
- Approval policy always asks for download, upload, sensitive input, sensitive sites, payment, publish and more; modes ask, auto, full, yolo (approvalPolicy.ts:3-35; askBeforeActing.ts:5-52).
- Browser tasks call the Managed Cloud gateway and pick models by account access (cloudAgentClient.ts:47-110,312-317).

**Incomplete**

- Sandbox gate code is looser than the documented rule: a key alone enables the runtime path even with the flag at 0 (gate.ts:9-14; gate.test.ts:69-104).
- S104.24 is partial: the brief says production should switch it on (doc: brief S104.24).

**Present but disconnected or switched off**

- Sandbox is off by default: apps/web/.env.example ships AGI_E2B_EXECUTION=0 (.env.example:382-386).
- When the sandbox is off, code execution uses the provider-native interpreter instead (hosted-code-execution.ts:37-44; doc: brief S104.24).

**Not available**

- Chrome automation has no own-key or Local model path: only Managed Cloud models are admitted (cloudAgentClient.ts:84-92).
- Desktop, CLI, VS Code automation not read.

## 4. Required behaviour

**Established requirements**

- Cloud code runs in a hosted sandbox provider. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S104.24)
- The agent drives a real browser through an automation engine (CDP). (source: S104.25 (same brief))
- Sandbox is built but off unless AGI_E2B_EXECUTION=1; turn it on in production. (source: S104.24 Unfinished note (same brief))
- Documentation availability stays separate from account, region and route availability; sandboxing is a harness feature, not a model capability. (source: doc: AGENTS.md section 4)
- Security behavior fails closed and permissions are least-privilege. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. With flag 0 and no key, a chat execution tool call returns 'not available' and the model tells the user why.
2. With flag 1 and key but no compute rate, session creation is refused and the page says it is not available on this server.
3. A plan without Cloud Code sees the plan-not-entitled notice and an upgrade path.
4. Session count never exceeds the plan maximum; the next create reports 'no-capacity'.
5. In Chrome, a click on a purchase button never completes without the person, in any mode.
6. Cancelling the Chrome debugging banner stops the run.
7. An upload or download always asks.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The loose gate may let a key-only deployment reach the sandbox from the runtime while routes still refuse [inferred] (gate.ts:9-28).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make runtime.ts use the strict gate so all callers agree.
- [proposed] Show the unavailable cause on the web page, not only to the model.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | sandbox gates | `apps/web/lib/e2b/gate.ts` | Three gate functions. |
| service | E2B runtime | `apps/web/lib/e2b/runtime.ts` | Provision, reuse and release sandboxes. |
| service | unavailability | `apps/web/lib/e2b/unavailability.ts` | Refusal causes and messages. |
| service | compute-metering | `apps/web/lib/e2b/compute-metering.ts` | Sandbox seconds pricing and holds. |
| service | hosted-code-execution | `apps/web/lib/e2b/hosted-code-execution.ts` | Provider-native code execution when sandbox is off. |
| endpoint | /api/code/sessions | `apps/web/app/api/code/sessions/route.ts` | List with availability, create. |
| endpoint | /api/code/sessions/[sessionId]/agent | `apps/web/app/api/code/sessions/[sessionId]/agent/route.ts` | Cloud Code agent turns. |
| endpoint | /api/chat/conversations/[id]/code-runs | `apps/web/app/api/chat/conversations/[id]/code-runs/route.ts` | Chat code runs. |
| component | CloudCodePage | `apps/web/features/code/CloudCodePage.tsx` | Web UI and unavailable notices. |
| config | billing catalog limits | `packages/contracts/types/src/billing-catalog.ts` | Max sandboxes and Cloud Code plan inclusion. |
| config | env example | `apps/web/.env.example` | Ships sandbox off. |
| service | debuggerSession | `apps/extension/src/features/computer-use/debuggerSession.ts` | Attach, hold counts, detach events. |
| service | cdpDriver | `apps/extension/src/features/computer-use/cdpDriver.ts` | CDP commands with ownership guards. |
| service | approvalPolicy | `apps/extension/src/features/computer-use/approvalPolicy.ts` | Always-ask reasons and sensitive sites. |
| service | askBeforeActing | `apps/extension/src/features/computer-use/askBeforeActing.ts` | Permission modes. |
| service | browserControlConsent | `apps/extension/src/features/computer-use/browserControlConsent.ts` | Per-origin consent text and storage. |
| service | cloudAgentClient | `apps/extension/src/features/computer-use/cloudAgentClient.ts` | Model choice and gateway call. |
| service | agentLoop | `apps/extension/src/features/computer-use/agentLoop.ts` | Browser agent loop. |
| config | extension manifest | `apps/extension/manifest.json` | Declares debugger permission and optional host permissions. |
| service | background worker | `apps/extension/src/background.ts` | Wires debugger detach and run cancellation. |
| component | CloudAgentStatusRow | `apps/mobile/src/features/settings/code/CloudAgentStatus.tsx` | Mobile availability labels. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web page reads availability from GET /api/code/sessions. | device and our servers | sessions/route.ts:40-66 |
| Create session provisions a hosted sandbox after plan, capacity and compute-rate checks. | outside service | runtime.ts:780-895; sessions/route.ts:69-90 |
| Commands and agent turns run inside the sandbox; results and files return to the page. | outside service | agent/route.ts:101; execution-tools.ts |
| Chrome: the extension chooses a model allowed for the account and sends the task to the managed gateway chat endpoint. | our servers | cloudAgentClient.ts:47-110,312-317 |
| The model returns tool calls; the policy decides to ask or act; the debugger attaches to the tab and the action runs in the page. | device | approvalPolicy.ts; askBeforeActing.ts:40-52; debuggerSession.ts:185-230; cdpDriver.ts:296-330 |
| Screenshots and page text are sent back as observations for the next step. | device and our servers | cloudAgentClient.ts:84-100 requires image input; screenshotEncoding.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Sandbox session records | Cloud Code session store in Neon and E2B session state | Server only | Closed or reclaimed by reclaim jobs (lib/e2b/reclaim.ts); exact retention: unknown. |
| Chrome consent, site allowlist, permission mode | chrome.storage.local (agi_cu_browser_control_consent, agi_cu_ask_before_acting) | Device only | Removed when the person removes the site (browserControlConsent.ts:14-17). |
| Page screenshots and text during a task | In the request to the managed gateway | Sent to our servers and a model provider | unknown |

**Models and providers.** Chrome browser actions use the browser_dom routing slot and Auto profiles with trust mode managed_cloud, requiring image input, function calling and streaming (cloudAgentClient.ts:44-50,63-100). The web sandbox is independent of the chat model, except where the model supports hosted code execution (hosted-code-execution.ts:37-44).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account on both; Chrome token via getAuthToken (cloudAgentClient.ts:16). |
| Permissions | Chrome: host permission, per-origin consent and always-ask list; account origins refused (browserControlConsent.ts:1-17). Web: user scoped database and CSRF on create (sessions/route.ts:69-77). |
| Subscription | Cloud Code requires a plan with sandboxes and a harness ceiling (billing-catalog.ts:801-841); sandbox time is metered (compute-metering.ts); Chrome checks the model against the account's tier (cloudAgentClient.ts:93-100). |
| Limits and metering | maxSessions per plan; sandbox lifetime by plan; Free runs have a stated lifetime notice (unavailability.ts:32-36); no-capacity and over-quota causes (unavailability.ts:10-30). |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY, AGI_E2B_COMPUTE_MICROUSD_PER_SECOND (gate.ts:5-6; .env.example:382-386); capability flag code_execution reported by /api/me (me/route.ts:293). |
| Model compatibility | Chrome needs tool calling and image input; models lacking tools are refused (cloudAgentClient.ts:96-100). |
| Provider restrictions | Managed traffic must be permitted for the model (cloudAgentClient.ts:84-92). |
| Local mode | Web sandbox is a server feature and has no Local path. Chrome browser actions need Managed Cloud; no Local or own-key model path found (cloudAgentClient.ts:84-92). The Chrome extension's own local-model support: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Sandbox off | Tool call returns 'not available'; routes return service unavailable; page shows deployment-disabled notice. | tool-loop.ts:2802-2810; code-runs/route.ts:76-78; CloudCodePage.tsx:2067-2073 |
| Plan lacks Cloud Code | planNotEntitled notice and upgrade link. | CloudCodePage.tsx:2074-2105 |
| No capacity / over quota / provider error / policy | Cause-specific refusal text; model told not to retry. | unavailability.ts:10-50 |
| Debugger detached by user or Chrome | Holds dropped, handlers notified, run cancelled with 'debugger_detached'. | debuggerSession.ts:151-175; background.ts:6733 |
| Abort signal | CDP operations reject on cancellation. | debuggerSession.ts:36-62 |
| Run no longer owns the tab | Command guard throws before and after a command. | cdpDriver.ts:305-325 |
| Offline | not handled in the code found for the sandbox page; extension reconnect covered by background.reconnect.test.ts (exists). | apps/extension/__tests__/background.reconnect.test.ts |
| MV3 worker sleep | Detach listener installed in the worker's first turn. | background.ts:9238 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/e2b/__tests__/gate.test.ts`: All three gates and flag values.
- `apps/web/lib/e2b/__tests__/runtime.test.ts`: Runtime provisioning.
- `apps/web/lib/e2b/__tests__/sandbox-provision-refusal.test.ts`: Refusal causes.
- `apps/web/lib/e2b/__tests__/compute-metering.test.ts`: Compute metering.
- `apps/web/lib/e2b/__tests__/execution-tools.test.ts`: Execution tools.
- `apps/extension/__tests__/computer-use-approval-policy.test.ts`: Always-ask policy.
- `apps/extension/__tests__/computer-use-permission-mode.test.ts`: Permission modes.
- `apps/extension/__tests__/computer-use-browser-control-consent.test.ts`: Consent storage.
- `apps/extension/__tests__/computer-use-agent-loop.test.ts`: Agent loop.
- `apps/extension/__tests__/cdp-isolated-world-recapture.test.ts`: CDP isolated world.
- `apps/extension/__tests__/computer-use-run-ownership.test.ts`: Tab ownership.
- `apps/extension/__tests__/computer-use-model-selection.test.ts`: Model selection.

**Test scenarios**

- **Sandbox default off**
  1. Start the web app with the example env.
  2. Open /code as a user on an included plan.
  - Expected: Deployment-disabled notice; create is blocked.
- **Sandbox on**
  1. Set flag 1, a sandbox key and compute rate.
  2. Create a session and run a command.
  - Expected: Command output returns; session counts toward the plan maximum.
- **Capacity**
  1. Create sessions up to the plan maximum.
  2. Create one more.
  - Expected: Refusal with the capacity sentence.
- **Browser approval**
  1. Load the extension, sign in, approve a site.
  2. Ask the agent to download a file in Auto mode.
  - Expected: An approval prompt appears before the download.
- **Debugger cancel**
  1. Start a browser task.
  2. Click Cancel on Chrome's debugging banner.
  - Expected: The run stops and no more actions run.

**Where to look when it fails**

- Log '[e2b] refusing to provision: sandbox compute has no resolvable rate'.
- Refusal cause names not-configured, no-capacity, policy, over-quota, provider-error.
- Extension errors 'CDP attach failed: ...' and cancel reason 'debugger_detached'.
- Tracing spans in lib/e2b/tracing.ts.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Gate functions disagree on what 'on' means.** Affects: Web deployments with a key but flag 0.. Evidence: gate.ts:9-28; runtime.ts:796; tool-loop.ts:2802. Work needed: Align callers on the strict gate or document the difference.
- **Sandbox is off by default and the brief says to turn it on in production.** Affects: All web users wanting Cloud Code.. Evidence: .env.example:382-386; brief S104.24. Work needed: Owner decision and production configuration (not done by this page).
- **Browser automation has no own-key or Local model route.** Affects: Own-key and Local Chrome users.. Evidence: cloudAgentClient.ts:84-92. Work needed: Decide the policy; extend the model resolver.
- **Desktop, CLI and VS Code equivalents not documented here.** Affects: Those apps.. Evidence: not read. Work needed: Read and record.

**Depends on**

- surface:web
- surface:chrome
- surface:mobile
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- api:GET /api/code/sessions
- file:apps/web/lib/e2b/gate.ts
- file:apps/extension/manifest.json

## Unknown

- How E2B sessions are retained and deleted.
- Which plans include Cloud Code (read from plan limits, not listed here).
- Whether desktop, CLI or VS Code run browser or sandbox automation.
- Data retention of screenshots in the managed gateway.
- Whether mobile can start a Cloud Code session or only shows status.
