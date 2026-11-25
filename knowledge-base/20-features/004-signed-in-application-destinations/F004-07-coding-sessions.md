---
id: "F004-07"
type: "feature"
title: "Coding sessions"
aliases: ["Code", "AGI Code", "Cloud Code", "Cloud sessions", "Coding-session home (S4.19)", "Coding-session workspace (S4.20)", "Managed Code", "agi code", "/code"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "partly seen (1 of 2)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S4.19", "S4.20"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "plan:basic", "plan:pro", "api:GET /api/code/sessions", "api:POST /api/code/sessions", "api:POST /api/code/sessions/[sessionId]/agent", "table:cloud_code_sessions", "SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-07 Coding sessions

Code lets a signed-in person hand a coding task to an agent that works in an isolated cloud environment, optionally on a Git repository. The person follows the transcript and changes, approves or rejects steps the agent waits on, and types the next instruction. Built on web, desktop (hosted web), mobile, CLI and VS Code; absent in Chrome.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.19](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s419), [S4.20](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s420).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 2) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lists the account's cloud coding sessions, opens a new one on a repository or an empty environment, runs agent turns inside it, shows the transcript, terminal output and file changes, and lets the person commit, close or share the session. [inferred from] (apps/web/features/code/CloudCodePage.tsx:687) (apps/web/app/api/code/sessions/route.ts:93)

**Why it exists.** To give the product a hosted coding agent comparable to the leaders' cloud coding products, with the person's own machine and credentials untouched. The first-run hint says 'Runs in the cloud. Your local files and credentials stay untouched.' (apps/web/features/code/code-surface.ts:96)

**Who uses it.** Developers on a plan that includes Code, working from the web app, the phone, the terminal or VS Code.

**Problems it solves**

- Run a long coding task without tying up the laptop.
- Keep work isolated from the person's local files and secrets.
- Pick up the same session from another app by its id (web, phone, CLI, VS Code).

**Use cases**

- On the web, open /code, paste a repository URL, describe a fix and read the changes when done.
- On the phone, approve a command the agent is waiting on.
- In the terminal, run agi code list then agi code approvals and agi code approve for a waiting step.
- In VS Code, continue a local task in the cloud.

## 2. User experience

**Where to find it**

- Web: route /code and /code/<sessionId>; page title 'Code' (apps/web/app/code/page.tsx:1) (apps/web/app/code/[sessionId]/page.tsx:1); sidebar entry from packages/ui/ui/src/sidebar/Sidebar.tsx per the brief (doc: knowledge-base/data/area-briefs/004-signed-in-application-destinations.md).
- Desktop: the public Desktop shows the hosted web app, so the same /code page (doc: AGENTS.md section 5). The Tauri build has its own apps/desktop/src code; not read, unknown.
- Mobile: drawer item labelled 'AGI Code' (MOBILE_CODE_SCREEN_LABEL) opening /(app)/cloud-code (apps/mobile/src/features/drawer/components/DrawerContent.tsx:125) (packages/contracts/types/src/pairing.ts:30).
- CLI: agi code with actions start, handoff, list, show, open, approvals, approve, reject (apps/cli/src/lib.rs:1163).
- VS Code: cloud sessions tree and the command agi-workforce.openCloudCodeSession (apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:32).
- Chrome: not available (no code reference found under apps/extension/src).

**Before you start**

- Signed-in account.
- A plan whose Code budget is above zero; otherwise the page shows 'Code is on paid plans' with an Upgrade action (apps/web/features/code/code-surface.ts:214) (packages/contracts/types/src/billing-catalog.ts:839).
- Managed Code switched on for the deployment (sandbox provider key and pricing ready) and managed compute not paused (apps/web/app/api/code/sessions/route.ts:57) (apps/web/lib/e2b/gate.ts:20).
- Mobile: cloud mode unlocked, else the screen sends the person through sign-in (apps/mobile/src/features/cloud-code/useCloudCodeAccess.ts:23).

**Screens and controls**

- Web composer: placeholder text from CLOUD_CODE_SESSION_COPY, button 'Start the task', 'Send options', 'Send and stay here', stop button, 'Approval mode' (apps/web/features/code/code-surface.ts:116).
- Repository chip 'Select repository' with fields 'Repository URL', 'Branch' and 'Use this repository'; 'Open an empty environment'; 'Network access' choices; 'Coding harness' and 'Extra allowed hosts' (apps/web/features/code/code-surface.ts:136).
- Session rail titled 'Cloud sessions' with 'Filter sessions', 'Show closed sessions', 'No cloud sessions yet.' (apps/web/features/code/code-surface.ts:127).
- Changes panel: 'Changes', 'Commit message', 'Commit and push', per-file include and discard; Terminal panel with 'Run a command' (apps/web/features/code/code-surface.ts:174).
- Session menu 'Session actions' with 'Close session'; closing asks 'Close this session?' and says the environment is destroyed, uncommitted work is lost and the transcript stays readable (apps/web/features/code/code-surface.ts:179).
- Mobile components: CloudCodeComposer, CloudCodeApprovalCard, CloudCodeChangesSheet, NewCloudCodeSessionSheet, session views open, running, ready, provisioning, failed, closed, archived, all (apps/mobile/src/features/cloud-code/presentation.ts:34).

**Journey**

1. Open Code (web /code, phone 'AGI Code', terminal agi code).
2. Choose a repository (URL and optional branch) or an empty environment, a network access level and optionally a coding agent and its own key.
3. Describe the task and press 'Start the task'; the app creates the session (POST /api/code/sessions) then starts an agent turn (POST /api/code/sessions/<id>/agent) with a model, mode agent or plan, and a step bound.
4. Watch the transcript; while a turn is running the page re-reads the session every 4 seconds (apps/web/features/code/CloudCodePage.tsx:182).
5. If the agent needs permission for a step, an approval appears; approve or reject it. Approvals last 30 minutes per a code comment (apps/web/features/code/CloudCodePage.tsx:770).
6. Review 'Changes', optionally commit and push or open a pull request, then type the next instruction or close the session.

**What the person sees and gets**

- Transcript of turns and terminal entries; changes and diffs; commit result 'Pushed to the repository.'
- Notices: 'Cloud task submitted.', 'Cloud task needs approval.', 'Cloud task needs attention.' for background turns (apps/web/features/code/code-surface.ts:124).
- Plan or limit refusals such as 'Your plan allows N active Code sessions' (apps/web/lib/services/cloud-code-session-service.ts:1258).
- CLI prints list, detail and approval handles as text or JSON (apps/cli/src/cloud/code_sessions.rs:159).

**Settings**

- Approval mode and network access per session (apps/web/features/code/code-surface.ts:158).
- Default cloud model for the CLI: setting default.cloud_model (apps/cli/src/lib.rs:1166).
- Environment variable AGI_MANAGED_COMPUTE_PRIVATE_BETA acts as a kill switch (name only) (apps/web/lib/managed-compute-gate.ts:40).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web page, session API, turn API with idempotency key, approvals list and decide, cancel, changes, commit, pull request, close, rename, archive, share (apps/web/features/code/services/cloud-code-api.ts:44) (apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:112).
- Plan gate at list and create: only plans whose Code daily budget is above zero may open a session (apps/web/lib/services/cloud-code-session-service.ts:1244).
- Active-session cap per plan enforced under an advisory lock (apps/web/lib/services/cloud-code-session-service.ts:1256).
- Mobile list, new-session sheet, transcript, approvals, changes sheet, polling (apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx).
- CLI start, handoff, list, show, open, approvals, approve, reject (apps/cli/src/lib.rs:1163).
- VS Code session list and approval decision through the same contract client (apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:256).

**Incomplete**

- CLI has no action to send a follow-up instruction to an existing session; only start and handoff create work (apps/cli/src/lib.rs:1163). Steering from the terminal beyond approvals is therefore unknown or absent.
- VS Code surface for steering a running session was not fully read; only list, handoff and approvals were seen. Unknown.
- Brief cites NewCloudCodeSessionSheet.tsx under features/cloud-code, but the file lives in cloud-code/components (apps/mobile/src/features/cloud-code/components/NewCloudCodeSessionSheet.tsx); brief line numbers for cloud-code-api.ts are stale because the file is now 70 lines.

**Present but disconnected or switched off**

- Managed Code is refused with 'Managed Code is not enabled for this deployment' when the sandbox provider is not ready, and with 'Managed compute is temporarily unavailable...' when the kill switch is off (apps/web/lib/services/cloud-code-session-open.ts:42).
- Mobile remote code viewer (device sessions) is hidden because FEATURES.companion is false (apps/mobile/lib/v1FeatureFlags.ts:17); that belongs to F004-08.

**Not available**

- Chrome extension: no Code surface found (brief status missing).
- Full internet access and extra hosts are refused 422 for coding agents whose provider credentials would enter the sandbox (apps/web/lib/services/cloud-code-session-open.ts:80).

## 4. Required behaviour

**Established requirements**

- A coding home lists the user's coding sessions and starts a new one on a repository or runtime. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S4.19)
- A coding-session workspace shows the transcript, file changes/diffs and a composer to steer the next turn. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S4.20)
- Inference and sandbox cost is a design constraint; a stronger model is not a default; subscription capability must come from one entitlement system. (source: (doc: AGENTS.md section 7))
- Local, own-key and Cloud are separate trust boundaries; nothing silently routes a Local session to managed cloud. (source: (doc: AGENTS.md section 6))

**Acceptance criteria**

1. A signed-in account on an entitled plan can create a session from /code with a repository URL and sees it in the 'Cloud sessions' list.
2. Starting a turn shows it in the transcript while it runs, and polling updates it until it stops.
3. An approval waiting on a step can be approved or rejected from web, phone and CLI and the turn resumes or stops.
4. An account on a plan without Code sees 'Code is on paid plans' and cannot create a session (API refuses with 'Your plan does not include managed Code sessions').
5. Creating more active sessions than the plan allows is refused with the limit named.
6. Closing a session names that the environment is destroyed and uncommitted work is lost, and the transcript stays readable.
7. The same session id opens on web, phone, CLI and VS Code.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Model choice for a turn must be on the plan; the route returns 403 model_not_available otherwise (apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:60). [inferred requirement: every client should show the model picker limited to plan models]
- Retrying a create with the same requestId must not create a second session (apps/web/lib/services/cloud-code-session-service.ts:1232). [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a CLI action to send the next instruction to an existing cloud session so the terminal matches web and phone.
- [proposed] Record the exact plan names (as renamed) next to the plan tier keys in the Code upgrade copy and test.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | CloudCodePage | `apps/web/features/code/CloudCodePage.tsx` | Web home and workspace for list, new session, transcript, approvals, changes, terminal. |
| screen | Code routes | `apps/web/app/code/page.tsx` | Route /code and /code/[sessionId] render CloudCodePage. |
| config | CODE_COPY | `apps/web/features/code/code-surface.ts` | All visible labels and messages for Code. |
| service | createCloudCodeApi | `apps/web/features/code/services/cloud-code-api.ts` | Browser client for the managed Code contract with CSRF header. |
| service | createManagedCloudCodeApi | `packages/contracts/cloud-contracts/src` | Shared typed client used by web, mobile and VS Code (imported in each app). |
| endpoint | GET/POST /api/code/sessions | `apps/web/app/api/code/sessions/route.ts` | List sessions with availability and runtimes; create a session. |
| service | openCloudCodeSession | `apps/web/lib/services/cloud-code-session-open.ts` | Validates network access, harness credential, workspace policy and subscription before creating. |
| service | cloud-code-session-service | `apps/web/lib/services/cloud-code-session-service.ts` | Session rows, plan gate, active-session cap, listing. |
| endpoint | POST /api/code/sessions/[id]/agent | `apps/web/app/api/code/sessions/[sessionId]/agent/route.ts` | Starts one agent turn with idempotency key, model plan check and managed-compute gate. |
| endpoint | /api/code/sessions/[id]/agent/approvals | `apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts` | List and decide approvals (approve or reject). |
| service | managed-compute-access | `apps/web/lib/services/managed-compute-access.ts` | Subscription, workspace policy and spend-limit gate for managed compute. |
| table | cloud_code_sessions | `apps/web/lib/services/cloud-code-session-service.ts` | Session records. |
| table | cloud_code_agent_turns / steps / approvals / terminal_entries / environments | `apps/web/lib/services/cloud-code-agent-approval-service.ts` | Turn history, steps, approvals with expiry, terminal output, saved environments. |
| screen | CloudCodeSessionsScreen / CloudCodeSessionScreen | `apps/mobile/src/features/cloud-code/CloudCodeSessionsScreen.tsx` | Mobile list and session screens. |
| service | cloudCodeApi (mobile) | `apps/mobile/src/features/cloud-code/service.ts` | Mobile client with long timeout for agent turns. |
| component | NewCloudCodeSessionSheet | `apps/mobile/src/features/cloud-code/components/NewCloudCodeSessionSheet.tsx` | Mobile new-session form. |
| command | agi code | `apps/cli/src/lib.rs` | CLI subcommands start, handoff, list, show, open, approvals, approve, reject. |
| service | code_sessions client | `apps/cli/src/cloud/code_sessions.rs` | CLI calls to /api/code/sessions and approval handles. |
| service | cloudCodeSessions | `apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts` | VS Code cloud-session list and approval handling. |
| config | MANAGED_COMPUTE_PRIVATE_BETA_ENV | `apps/web/lib/managed-compute-gate.ts` | Kill switch name for managed compute. |
| config | plan limits | `packages/contracts/types/src/billing-catalog.ts` | maxSandboxes and Code daily budget per plan; planIncludesAgiCode. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens /code or the phone or CLI client; the client reads GET /api/code/sessions to get sessions, availability (deployment ready, plan entitled, plan tier, max sessions) and runtime catalogue. | our servers | apps/web/app/api/code/sessions/route.ts:37 |
| Create posts repository, network access, runtime, extra hosts; server checks sandbox readiness, kill switch, egress rules, workspace and feature policy, subscription access, then plan gate and active cap, then inserts a session row in state provisioning. | our servers | apps/web/lib/services/cloud-code-session-open.ts:34; apps/web/lib/services/cloud-code-session-service.ts:1244 |
| The isolated environment is run by an outside sandbox service (provider key and gate named e2b in code). | outside service | apps/web/lib/e2b/gate.ts:20 |
| A turn is posted with goal, model, mode, step bound and an idempotency key; server checks entitlement, model-on-plan and runs the agent loop up to an 800 second budget. | our servers | apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:104; apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:73 |
| Model calls for the turn go to the model provider selected from the catalog, through the server's managed route, or a coding agent run inside the sandbox using a proxied or the person's own key. | outside service | apps/web/lib/services/cloud-code-session-open.ts:97; apps/web/features/code/code-surface.ts:150 (harnessCredentialHelp) |
| Client polls the session every 4 seconds while a turn has no stop reason; approvals are read again on load. | device | apps/web/features/code/CloudCodePage.tsx:699 |
| Approve or reject posts turnId, stepIndex and decision; an expired approval returns a conflict. | our servers | apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:92 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Session, turns, steps, approvals, terminal entries, environments | Postgres tables cloud_code_sessions, cloud_code_agent_turns, cloud_code_agent_steps, cloud_code_agent_approvals, cloud_code_terminal_entries, cloud_code_environments | Read by every app through the same API, so shared across web, phone, CLI and VS Code | Closing destroys the environment but keeps the transcript; a deleteSession call exists in the client; retention period unknown |
| Own key for a coding agent | Kept in the session's sandbox only, not saved to the account (apps/web/features/code/code-surface.ts:150) | No | Goes away with the sandbox |
| Audit event code_session_lifecycle_changed | security audit log (apps/web/app/api/code/sessions/route.ts:84) | server side | unknown |

**Models and providers.** The turn names a model from the shared catalog; unknown models are rejected and models above the plan return 403. Coding harnesses (agents) are listed as runtimes; some have no managed credential and need the person's own key (apps/web/lib/services/cloud-code-session-open.ts:97). No specific providers read; provider folders not inspected.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required on every route (getUserScopedDb) (apps/web/app/api/code/sessions/route.ts:37). Mobile also needs cloud mode unlocked (apps/mobile/src/features/cloud-code/useCloudCodeAccess.ts:23). |
| Permissions | Workspace policy can block opening a cloud session or reaching a host, and a workspace feature gate for 'code' applies (apps/web/lib/services/cloud-code-session-open.ts:108). Mutations need a CSRF token and are rate limited. |
| Subscription | Plan must have sandboxes above zero and a Code daily budget above zero (apps/web/../packages/contracts/types/src/billing-catalog.ts:839). From the plan table: local-only, byok and free have budget 0; basic, pro, max_15x, team and enterprise have a budget above zero (packages/contracts/types/src/billing-catalog.ts:590-724). Subscription must be active for managed execution (apps/web/lib/services/managed-compute-access.ts:76). |
| Limits and metering | Active sessions capped by plan (max 20 overall) (packages/contracts/types/src/billing-catalog.ts:473); step bounds 12, 24 or 48; goal length limited by CLOUD_CODE_LIMITS.task; turn budget 800 s; workspace spend limit checked (apps/web/lib/services/managed-compute-access.ts:140). Turns carry a managed-usage idempotency key. |
| Feature flags | AGI_MANAGED_COMPUTE_PRIVATE_BETA (kill switch, default on) and the sandbox provider readiness check (apps/web/lib/managed-compute-gate.ts:55) (apps/web/lib/e2b/gate.ts:20). Mobile FEATURES.cloudTasks is true (apps/mobile/lib/v1FeatureFlags.ts:9). |
| Model compatibility | Model must exist in the catalog and be allowed on the plan; a model that may train on data is refused with model_may_train (apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:170). |
| Provider restrictions | Coding agents without a managed provider credential for sandboxes need the person's own key; full internet and extra hosts refused for them until the credential proxy covers it (apps/web/lib/services/cloud-code-session-open.ts:80). |
| Local mode | Cloud sessions need our servers, so they do not run in Local mode. The create error says 'Use the desktop app for local code' (apps/web/lib/services/cloud-code-session-open.ts:43) and the web copy offers 'Work with local code' (apps/web/features/code/code-surface.ts:110). Local code sessions run through local-session hooks in apps/web/features/code/hooks/use-local-session.ts; whether they need sign-in is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading sessions' and 'Opening session' spinners. | apps/web/features/code/code-surface.ts:132 |
| Empty | 'No cloud sessions yet.' and 'No open sessions.' | apps/web/features/code/code-surface.ts:130 |
| Plan lacks Code | Upgrade heading 'Code is on paid plans'; create disabled unless deployment enabled and plan entitled. | apps/web/features/code/CloudCodePage.tsx:687; apps/web/features/code/code-surface.ts:214 |
| Deployment not ready | Notice that Managed Code is not configured; runtime list empty. | apps/web/features/code/code-surface.ts:152 |
| Session missing or forbidden | Status 400/403/404 clears selection, shows a not-found notice and returns to the Code home. | apps/web/features/code/CloudCodePage.tsx:731 |
| Turn still running after request ends | 409 conflict with reason code; the turn continues durably and the page keeps polling. | apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:80 |
| Approval expired | Conflict returned; approvals expire after 30 minutes. | apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:41 |
| Cancel | Stop button 'Stop' with cancel route; stoppingTurn state. | apps/web/app/api/code/sessions/[sessionId]/agent/cancel/route.ts |
| Closed session | Banner 'This session is closed. Start a new one to keep working.' | apps/web/features/code/code-surface.ts:198 |
| Offline | not handled in the code that I read for web Code; unknown. | not found |
| Voice input | 'Voice input requires a supported Cloud session.' on web. | apps/web/features/code/code-surface.ts:121 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/CloudCodePage.test.tsx`: Web Code page behaviour.
- `apps/web/features/code/services/cloud-code-api.test.ts`: Client calls to the Code API.
- `apps/web/features/code/services/owned-cloud-code-api.test.ts`: Authority-bound client wrapper.
- `apps/web/app/api/code/sessions/route.test.ts`: List and create route.
- `apps/web/app/api/code/sessions/[sessionId]/agent/route.test.ts`: Agent turn route.
- `apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.test.ts`: Approvals route.
- `apps/web/lib/services/cloud-code-session-service.test.ts`: Session service including plan and cap rules.
- `apps/mobile/__tests__/CloudCodeSessionPolling.test.tsx`: Mobile polling.
- `apps/mobile/__tests__/NewCloudCodeSession.test.tsx`: Mobile new session.
- `apps/mobile/__tests__/CloudCodeSessionsApprovalNotice.test.tsx`: Mobile approval notice.
- `apps/extension-vscode/src/__tests__/cloudSessions.test.ts`: VS Code cloud sessions.
- `apps/cli/src/cloud/code_sessions.rs`: Inline Rust tests at lines 321 and 331 (content not read).

**Test scenarios**

- **Create on entitled plan**
  1. Sign in on a plan with Code.
  2. Open /code, enter a repository URL, type a task, press 'Start the task'.
  - Expected: A session appears in 'Cloud sessions' and the turn shows in the transcript.
- **Plan without Code**
  1. Sign in on a free account.
  2. Open /code.
  - Expected: 'Code is on paid plans' with Upgrade; POST /api/code/sessions answers with the plan-does-not-include message.
- **Approval from CLI**
  1. Start a turn that needs approval.
  2. Run agi code approvals.
  3. Run agi code approve <handle>.
  - Expected: The step resumes and the web transcript shows it.
- **Session cap**
  1. Create sessions until the plan limit.
  2. Create one more.
  - Expected: Refused naming the limit.
- **Kill switch**
  1. Set the kill switch off in a test deployment.
  2. Create a session.
  - Expected: 'Managed compute is temporarily unavailable...' message.
- **Close**
  1. Open Session actions, choose Close session, confirm.
  - Expected: Environment destroyed, transcript readable, banner shown.

**Where to look when it fails**

- Error codes model_not_available, model_may_train, NETWORK_ACCESS_REQUIRES_PROXY, HARNESS_CREDENTIAL_UNAVAILABLE.
- Server log line '[managed-compute-access]' for funding or collection state failures.
- Tables cloud_code_sessions.state, cloud_code_agent_turns stop reason, cloud_code_agent_approvals expires_at.
- Audit event code_session_lifecycle_changed.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)
- Mobile: [70-qa/test-plans/mobile/004-signed-in-application-destinations.md](../../70-qa/test-plans/mobile/004-signed-in-application-destinations.md)
- CLI: [70-qa/test-plans/cli/004-signed-in-application-destinations.md](../../70-qa/test-plans/cli/004-signed-in-application-destinations.md)
- VS Code: [70-qa/test-plans/vscode/004-signed-in-application-destinations.md](../../70-qa/test-plans/vscode/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **CLI cannot send a follow-up instruction to an existing session.** Affects: CLI users. Evidence: apps/cli/src/lib.rs:1163 lists only start, handoff, list, show, open, approvals, approve, reject. Work needed: Add a send action calling the agent turn route with an idempotency key.
- **Chrome extension has no Code surface.** Affects: Chrome users. Evidence: brief S4.19 status chrome missing; no reference in apps/extension/src. Work needed: Decide whether Code belongs in Chrome; if yes, add a list and open-in-web entry.
- **Brief code references are stale (cloud-code-api.ts:356/364, tui_app.rs lines) so verification by line is not possible.** Affects: Engineers and testers. Evidence: apps/web/features/code/services/cloud-code-api.ts has 70 lines. Work needed: Refresh the brief's code column.
- **Plan gate wording in the brief ('exact plan gate for Code') was unknown; code shows it is a Code daily budget above zero plus sandboxes above zero. Local-only, own-key and free users cannot use cloud Code.** Affects: Free, local-only and own-key users. Evidence: packages/contracts/types/src/billing-catalog.ts:839. Work needed: Confirm with the owner that own-key users should be excluded from cloud Code; own-key sandbox compute still costs us.
- **Desktop (Tauri) code was not checked for a separate Code surface.** Affects: Desktop. Evidence: not read. Work needed: Read apps/desktop/src Code and record.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- plan:basic
- plan:pro
- api:GET /api/code/sessions
- api:POST /api/code/sessions
- api:POST /api/code/sessions/[sessionId]/agent
- table:cloud_code_sessions
- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- SYS-execution-boundaries

## Unknown

- Whether the Tauri desktop has its own Code surface; not read.
- Whether VS Code can send a follow-up instruction to a running cloud session.
- Retention period for closed session transcripts.
- Exact content of the CLI inline tests.
- Which sandbox and model providers back managed turns (provider folders not inspected).
- Whether local code sessions on desktop need sign-in.
- Whether the sidebar entry for Code is visible to plans without Code.
