---
id: "F110-09"
type: "feature"
title: "Cloud coding sessions"
aliases: ["Cloud coding sessions", "AGI Code cloud sessions", "Managed Code", "Continue in the cloud", "agi code handoff", "agi resume --teleport", "Bring the branch in", "Local work to explicit cloud handoff (S110.22)", "Cloud result to local repository (S110.23)", "Design to implementation (S110.12)", "Repository to review deck (S110.13)", "/continue-with-cloud"]
area: "110 Cross-product experiences to include in the product map"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S110.12", "S110.13", "S110.22", "S110.23"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-authorization-and-workspaces", "api:POST /api/code/sessions", "api:POST /api/code/sessions/handoff", "table:cloud_code_agent_turns", "plan:basic", "F110-08", "F110-10"]
basis: "code inspection"
second_reader: "10 of 13 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F110-09 Cloud coding sessions

A coding session can run in a managed cloud sandbox on a GitHub repository. A local session can be handed to it from the CLI (agi code handoff) or from VS Code (Code: Continue in the Cloud), and a cloud branch can be brought back with agi resume --teleport or VS Code's Bring the branch in. It works only when managed Code is switched on. Design-to-code and review decks are not built.

Area: [110. Cross-product experiences to include in the product map](README.md). Requirement items: [S110.12](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11012), [S110.13](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11013), [S110.22](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11022), [S110.23](../../10-requirements/capabilities/110-cross-product-experiences-to-include-in-the-product-map.md#s11023).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Runs a coding agent in a cloud sandbox on a repository branch, lets the person follow it on web, mobile, CLI or VS Code, approve its steps, open a pull request, and move work between the local checkout and the cloud.

**Why it exists.** The brief wants an explicit local-to-cloud hand-off, a cloud result brought into the local checkout with review, a design implemented in the user's repo and a repository turned into a review deck (doc: knowledge-base/data/area-briefs/110-cross-product-experiences-to-include-in-the-product-map.md, S110.12, S110.13, S110.22, S110.23). The cloud parity spec says cloud sessions must match Claude's (doc: docs/specs/agi-code-cloud-parity/spec.md).

**Who uses it.** Developers on a plan that includes AGI Code, on a repository hosted on GitHub.

**Problems it solves**

- Long coding tasks tying up a laptop
- Continuing a terminal session somewhere that keeps running
- Getting a cloud branch into the local editor without copy and paste

**Use cases**

- From the CLI: push the branch, run agi code handoff, review what moves, confirm.
- In VS Code run 'Code: Continue in the Cloud', type a task, confirm the review.
- On web open /code, pick a repository and start a task.
- In VS Code pick a cloud session and choose 'Bring the branch in'.

## 2. User experience

**Where to find it**

- Web (and desktop's hosted web app): /code page, button 'Start the task' (apps/web/app/code/page.tsx; apps/web/features/code/code-surface.ts:131).
- CLI: `agi code start|handoff|list|show|open|approvals|approve|reject` (apps/cli/src/lib.rs:3033-3190) and `agi resume --teleport` (lib.rs:917-926).
- CLI chat: /continue-with-cloud, /fork-cloud, /managed-cloud (claude_parity.rs:247-249). This is a different thing: it moves a chat transcript from Local or BYOK to Managed mode, not a code session.
- VS Code: command 'Code: Continue in the Cloud' (apps/extension-vscode/package.json:592-594); the session picker has 'Continue here', 'Bring the branch in' and 'Open on web' (cloudCodeSessions.ts:81, 215-232).
- Mobile: Cloud Code sessions list, new session sheet and changes sheet (apps/mobile/src/features/cloud-code/*).
- Chrome: not found.

**Before you start**

- Managed Code switched on for the deployment: AGI_E2B_EXECUTION=1, E2B_API_KEY set, compute priceable (apps/web/lib/e2b/gate.ts:6-28).
- AGI_MANAGED_COMPUTE_PRIVATE_BETA not 0, false or off (apps/web/lib/managed-compute-gate.ts:40-58).
- A plan that includes AGI Code (maxSandboxes > 0 and a code harness daily ceiling > 0). It is enforced when a session is created in apps/web/lib/services/cloud-code-session-service.ts:1244, and the list route only reports it as availability.planEntitled (apps/web/app/api/code/sessions/route.ts:57).
- Signed in to AGI Cloud; repository on GitHub with the AGI GitHub App for private repositories (code_handoff.rs access check).
- CLI hand-off: session in Managed mode, branch fully pushed, run from the repository (code_push.rs:71-93; lib.rs:3209-3218).
- VS Code continue: workspace has a git source with a branch (continueInCloud.ts:93-99).

**Screens and controls**

- CLI review screen listing what moves and what stays, then the prompt 'Hand this session to the cloud?' (lib.rs:3226-3241; code_handoff.rs:322-380).
- VS Code modal with question and buttons 'Continue in the cloud' (continueInCloud.ts:21, 119-127).
- VS Code info message 'Bring the branch in' with a dirty-files confirmation (context-handoff/index.ts:327, 356-381).
- Web Code page: composer 'Start the task', changes panel, commit, pull request, share, archive (code-surface.ts; features/code/components).

**Journey**

1. CLI hand-off: push all commits.
2. Run `agi code handoff` in the repository folder (optionally a session id).
3. The CLI builds the handoff record and shows what moves and what stays.
4. Confirm, or pass --yes.
5. The server opens a cloud session on the pushed branch and returns a seed prompt and warnings.
6. The CLI runs the first cloud turn and prints the result and session link.
7. Later, `agi resume --teleport` in a clean checkout of the same repository fetches the session's branch, checks it out and continues with the session history (cloud/code_teleport.rs:125-175; lib.rs:2515-2519).
8. VS Code: run Continue in the Cloud, type the task, confirm; the extension creates the session and starts one agent turn (continueInCloud.ts:109-165).
9. VS Code: open a cloud session and choose 'Bring the branch in': it fetches and checks out the branch after a dirty-tree confirmation (context-handoff/index.ts:87-133).

**What the person sees and gets**

- CLI warns 'Uncommitted changes stay on this machine; the cloud session works from the pushed branch.' (code_push.rs:176-178).
- Refusal texts for protocol, expiry, account and unknown trust mode (code_push.rs:118-133).
- Server refusals: 'Managed Code is not enabled for this deployment. Use the desktop app for local code.' and 'Managed compute is temporarily unavailable...' (cloud-code-session-open.ts:44-52).
- VS Code messages 'this cloud task works on <branch> in <repo>' and 'is now on <branch>' (context-handoff/index.ts:131, 360-366).

**Settings**

- CLI config default.cloud_model (lib.rs cloud_code_model, around 3175).
- VS Code setting agiWorkforce.cliPath (not for this feature).
- Network access fixed to 'trusted' for CLI and VS Code starts (code_handoff.rs:11; continueInCloud.ts:146).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server: open cloud session applies the switches, network and credential checks, workspace feature and code policy gates and the managed-compute access check, then hands the plan to createCloudCodeSession, which refuses a plan without AGI Code (apps/web/lib/services/cloud-code-session-open.ts:43-160; apps/web/lib/services/cloud-code-session-service.ts:1243-1244).
- Server: POST /api/code/sessions/handoff admits a handoff record, maps a GitHub remote, opens the session and audits it (apps/web/app/api/code/sessions/handoff/route.ts:59-140).
- CLI: agi code start and handoff with a review, push check and first turn (apps/cli/src/lib.rs:3197-3268).
- CLI: agi resume --teleport brings a cloud branch and history local (lib.rs:2515-2519; cloud/code_teleport.rs:134-175). The brief says CLI cloud-to-local is missing; the code has it.
- VS Code: continue in cloud creates a session from the pushed branch with a typed goal (continueInCloud.ts:93-165).
- VS Code: bring-branch-in fetches and checks out with a dirty-tree confirmation (context-handoff/index.ts:87-133).
- Mobile: sessions list, new session sheet, changes sheet (apps/mobile/src/features/cloud-code).

**Incomplete**

- VS Code hand-off carries no history: it creates a session from the branch plus a new task (continueInCloud.ts:142-146); this matches the decision that history comes back only when a cloud session is pulled local (doc: docs/decisions/2026-09-27-founder-decisions.md:396-403).
- Bring-branch-in is a fetch and checkout, not a diff review before applying (context-handoff/index.ts:123-125); only uncommitted local files are confirmed.
- CLI hand-off does not carry uncommitted changes (code_push.rs:176-178).

**Present but disconnected or switched off**

- Everything is refused unless the sandbox switches are on (cloud-code-session-open.ts:44-46; gate.ts:20-28), and the managed-compute switch is on unless set to 0 (managed-compute-gate.ts:55-58). Changes and commit routes also check e2bProvisioningReady (changes/route.ts:32; commit/route.ts:47).

**Not available**

- S110.12 Design to implementation: no hand-off from a design or prototype to a coding session was found in apps/web/features or apps/web/lib (searches for implement-design phrasing returned nothing); the CLI decision list also rules out a design-to-code handoff (doc: docs/decisions/2026-09-27-founder-decisions.md:466-473).
- S110.13 Repository review deck: no code found.
- Desktop native hand-off and pull of cloud sessions: the desktop hands a cloud session to VS Code or the terminal by decision (doc: docs/decisions/2026-09-27-founder-decisions.md:342-351).
- Chrome and mobile hand-off: not found.

## 4. Required behaviour

**Established requirements**

- The user explicitly hands a local coding session (history, repo state, pending work) to cloud execution and it continues in a cloud session. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.22)
- A cloud session's result (diff, branch or files) is brought into the local checkout from a product control, with review before applying. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S110.23)
- A local session sent to the cloud starts a new cloud session from the pushed branch with a new task, as claude --cloud does; history comes back only when a cloud session is pulled local. VS Code S110.22 is met at parity once cloud sessions are on. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:391-410)
- A cloud session's result comes local through the CLI and VS Code; the desktop app adds no native pull. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:342-351)
- A cloud session is refused when sandbox switches are off, and when managed compute is switched off. (source: apps/web/lib/services/cloud-code-session-open.ts:43-53)
- CLI hand-off sends only a Managed session, and refuses Local or BYOK sessions with an explanation. (source: apps/cli/src/cloud/code_push.rs:71-93)

**Acceptance criteria**

1. With switches off, POST /api/code/sessions returns the 'Managed Code is not enabled for this deployment' error and the VS Code and CLI actions show a refusal.
2. With switches on and a plan that includes AGI Code, starting a session on a repository returns a session with a branch.
3. agi code handoff with unpushed commits stops and tells the user to push first.
4. agi code handoff from a Local-mode session refuses and names /continue-with-cloud.
5. agi code handoff of a Managed session shows what moves and what stays, then creates a session; uncommitted changes produce the warning.
6. agi resume --teleport in a checkout with uncommitted changes refuses and asks to commit or stash.
7. In VS Code, Bring the branch in with local changes asks before switching and does nothing if declined.
8. In VS Code, Continue in the Cloud when signed out shows 'sign in to AGI Cloud to continue work in the cloud'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's 'review before applying' for S110.23 is met only partly by a dirty-tree confirmation; a diff view of the cloud result before checkout is not present [inferred from index.ts:87-133].
- Web should show a visible reason when managed Code is off; the sessions list returns availability.deploymentEnabled and planEntitled for that (code/sessions/route.ts:57-62) [inferred use].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a review step (diff summary) before Bring the branch in.
- [proposed] Show the same what-moves and what-stays review on web and mobile when they gain a hand-off.
- [proposed] Treat design-to-code as a record-or-build decision per app, as the CLI has already ruled it out.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | openCloudCodeSession | `apps/web/lib/services/cloud-code-session-open.ts` | Single entry that applies the switch, network, credential, workspace, policy and managed-compute gates, then creates the session through createCloudCodeSession, which enforces the plan (lines 43-160). |
| service | createCloudCodeSession | `apps/web/lib/services/cloud-code-session-service.ts` | Enforces the plan on create: refuses a plan without AGI Code (planIncludesAgiCode) and applies max concurrent sandboxes (getPlanMaxSandboxes) against the plan (lines 1243-1244) [apps/web/lib/services/cloud-code-session-service.ts:1243-1244]. |
| config | e2b gate | `apps/web/lib/e2b/gate.ts` | AGI_E2B_EXECUTION, E2B_API_KEY and priceable-compute check (lines 6-28). |
| config | managed-compute gate | `apps/web/lib/managed-compute-gate.ts` | AGI_MANAGED_COMPUTE_PRIVATE_BETA (lines 40-58). |
| config | billing catalog plan limits | `packages/contracts/types/src/billing-catalog.ts` | getPlanMaxSandboxes (801), getPlanSandboxTtlMs (808), getPlanCodeHarnessDailyCeilingCents (827) and planIncludesAgiCode (839-840: maxSandboxes > 0 and ceiling > 0). |
| endpoint | GET/POST /api/code/sessions | `apps/web/app/api/code/sessions/route.ts` | Lists sessions with availability and plan data (planEntitled, line 57); creates sessions (handleCreate, lines 66-91, with no plan check of its own) (lines 40-100). |
| endpoint | POST /api/code/sessions/handoff | `apps/web/app/api/code/sessions/handoff/route.ts` | Accepts a hand-off record and opens a cloud session (lines 59-140). |
| endpoint | /api/code/sessions/[sessionId]/changes, commit, pull-request, agent, approvals | `apps/web/app/api/code/sessions/[sessionId]/changes/route.ts` | Read changes, commit and push, open a pull request, run turns and decide approvals. |
| screen | CloudCodePage | `apps/web/features/code/CloudCodePage.tsx` | Web code area for cloud sessions. |
| command | agi code handoff / start / list / show / open / approvals / approve / reject | `apps/cli/src/lib.rs` | CLI commands (handle_code_command 3033; handle_code_handoff 3197; handle_code_start 3270). |
| service | code_push | `apps/cli/src/cloud/code_push.rs` | Builds and submits the hand-off record; Managed-only admit (lines 40-195). |
| service | code_handoff | `apps/cli/src/cloud/code_handoff.rs` | Inspects the checkout, repository access and the what-moves review (lines 209-380). |
| service | code_teleport | `apps/cli/src/cloud/code_teleport.rs` | Brings a cloud branch and history into the local checkout (line 134). |
| command | /continue-with-cloud | `apps/cli/src/claude_parity.rs` | Chat transcript fork from Local or BYOK to Managed mode, default 8 messages, attached files excluded (lines 247-249, 516-575, 604). |
| command | agi-workforce.continueInCloud | `apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts` | VS Code command: new cloud session from the branch plus a typed task. |
| service | showCloudCodeSession | `apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts` | Session picker with approve, stop, Continue here, Bring the branch in (lines 215-340). |
| service | pullCloudResultIntoCheckout | `apps/extension-vscode/src/features/context-handoff/index.ts` | Fetch and checkout of the cloud branch after a dirty-tree confirmation (lines 87-133, 356-381). |
| screen | Cloud Code sessions screens | `apps/mobile/src/features/cloud-code/CloudCodeSessionsScreen.tsx` | Mobile list, session view and changes sheet. |
| schema | CloudCodeHandoffRequestSchema | `packages/contracts/cloud-contracts` | Shared hand-off record and refusal reasons (imported in handoff/route.ts:6-15). |
| table | cloud_code_agent_turns / steps / approvals | `apps/web/db/neon` | Stores agent turns, steps and approvals (created by migrations; file names not recorded). |
| test | continueInCloud tests | `apps/extension-vscode/src/__tests__/continueInCloud.test.ts` | Covers the VS Code command. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI reads the local checkout and session, checks pushed commits, and builds the hand-off record from the saved session. | device | lib.rs:3205-3218; code_push.rs:95-98 |
| CLI shows the review, asks for confirmation, then posts the record to /api/code/sessions/handoff. | device and our servers | lib.rs:3226-3245; code_push.rs:135-150 |
| The server validates the record, maps the GitHub remote, applies the switch, network, credential, workspace, policy and managed-compute gates, opens a sandbox session on the branch, and createCloudCodeSession refuses a plan without AGI Code. | our servers | handoff/route.ts:88-130; cloud-code-session-open.ts:43-160; cloud-code-session-service.ts:1243-1244 |
| The sandbox clones the pushed branch and runs the coding agent; steps and approvals are stored. | outside service | Sandbox provider gated by apps/web/lib/e2b/gate.ts (E2B named in env var E2B_API_KEY) |
| The CLI runs the first cloud turn and prints the result. | our servers | lib.rs:3250-3266 |
| To bring work back, the CLI or VS Code fetches the cloud branch from GitHub into the local checkout. | device | code_teleport.rs:150-175; context-handoff/index.ts:123-125 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Hand-off record (goal, approvals, plan, changed files, checks, folder path) | Sent to our servers once; session rows afterwards | Yes, visible in the web Code area | Session lifecycle rules not opened |
| Selected transcript for /continue-with-cloud (default 8 messages, size capped; attached files excluded) | Local session fork on the device; draft is reviewed before sending | Only after the user sends the reviewed draft | Oversized messages omitted whole (claude_parity.rs:604-640) |
| Code and branch | GitHub repository and the sandbox | Through git | Sandbox lifetime follows the plan (getPlanSandboxTtlMs, packages/contracts/types/src/billing-catalog.ts:808-810) |

**Models and providers.** The cloud agent model comes from the CLI --model, default.cloud_model, or an automatic coding route chosen for the plan (lib.rs cloud_code_model, about line 3170-3195); VS Code uses resolveCloudCodeAgentModel from the plan (continueInCloud.ts:116-125). Some coding agents need a managed provider credential or the user's own key, else the server refuses with a harness-credential error (cloud-code-session-open.ts:84-100).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in to AGI Cloud on every surface (CLI CloudClient::connect, continueInCloud.ts:101-106). |
| Permissions | Workspace code policy gate for act open_cloud_session and for extra hosts (cloud-code-session-open.ts:119-136); GitHub App access for private repositories (code_handoff.rs:282). |
| Subscription | Plan must include AGI Code: planIncludesAgiCode is true only when maxSandboxes > 0 and the daily code harness ceiling > 0 (packages/contracts/types/src/billing-catalog.ts:839-840); several plans have both at 0 (for example the one at billing-catalog.ts:585-596) and so lack it. The check is enforced on create in createCloudCodeSession (apps/web/lib/services/cloud-code-session-service.ts:1243-1244), which also applies max concurrent sandboxes (getPlanMaxSandboxes); the list route only reports it as availability.planEntitled (code/sessions/route.ts:40-62). Sandbox lifetime comes from the plan (getPlanSandboxTtlMs, billing-catalog.ts:808; getPlanMaxSandboxes at 801); a daily code harness ceiling exists per plan (getPlanCodeHarnessDailyCeilingCents, billing-catalog.ts:827). The same entitlement check also guards GET /api/code/repositories/branches (route.ts:61) and GET /api/github/repositories (route.ts:176), so a non-entitled plan cannot even list repositories. |
| Limits and metering | Managed compute access is evaluated per request and metered as sandbox compute (cloud-code-session-open.ts:138-148); max task length is CLOUD_CODE_LIMITS.task for VS Code (continueInCloud.ts:78-84), and the CLI uses TASK_LIMIT = 8_000 characters and TITLE_LIMIT = 120 (apps/cli/src/cloud/code_handoff.rs:9-10). |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY, AGI_MANAGED_COMPUTE_PRIVATE_BETA. |
| Model compatibility | The cloud agent needs a coding-capable route for the plan; not further established. |
| Provider restrictions | Full internet or extra egress hosts are refused for agents whose credentials would enter the sandbox; only Trusted hosts or Isolated are allowed (cloud-code-session-open.ts:73-92). |
| Local mode | Local mode never reaches the cloud on its own: CLI hand-off is refused for Local and BYOK sessions until the user forks into Managed with /continue-with-cloud and sends the reviewed draft (code_push.rs:71-93). The error text for web is 'Use the desktop app for local code.' (cloud-code-session-open.ts:46). Local coding on desktop needs no paid plan [inferred from AGENTS.md section 6 boundaries]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Switches off | Capability-unavailable error; sessions list reports deploymentEnabled false. | cloud-code-session-open.ts:43-47; code/sessions/route.ts:61 |
| Managed compute off | 'Managed compute is temporarily unavailable. Use Local or BYOK...' | cloud-code-session-open.ts:48-52 |
| Unpushed commits (CLI) | Command stops and says push first. | lib.rs:3209-3215 |
| No saved session or wrong folder (CLI) | Error messages naming the fix. | code_push.rs:48-67 |
| Non-confirmable run (CLI) | Refuses and tells the user to re-run with --yes. | lib.rs:3231-3236 |
| Handoff expired or wrong account | Refusal text per reason. | code_push.rs:118-133 |
| Remote not on GitHub | Validation: 'Managed Code clones repositories from GitHub...' | handoff/route.ts:110-114 |
| VS Code, no branch or signed out | Warning messages; nothing created. | continueInCloud.ts:93-106 |
| Bring branch in, dirty tree | Confirm overwrite; cancel returns without change. | context-handoff/index.ts:115-122 |
| Bring branch in, repo not open or ambiguous | Report text; no checkout. | context-handoff/index.ts:101-113 |
| Teleport with local changes | Refused until committed or stashed. | code_teleport.rs:150-158 |
| Turn stopped, approval pending | Labels and approve or reject actions in VS Code and CLI. | cloudCodeSessions.ts:272-340; lib.rs:3086-3130 |
| Offline or timeout | CLI timeouts of 300 s for create and 330 s for a turn; offline and timeout handling in the other apps was not established. | apps/cli/src/cloud/code_handoff.rs:12-13 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/continueInCloud.test.ts`: VS Code continue in the cloud.
- `apps/extension-vscode/src/__tests__/contextHandoff.test.ts`: Context and cloud handoff handling.
- `apps/web/lib/services/__tests__/cloud-code-durable-handoff.test.ts`: Durable hand-off service.
- `apps/web/features/code/CloudCodePage.test.tsx`: Web cloud code page.
- `apps/mobile/__tests__/CloudCodeSessionsNewSession.test.tsx`: Mobile new session.
- `apps/mobile/__tests__/CloudCodeSessionScreenChanges.test.tsx`: Mobile changes view.
- `apps/cli/src/cloud/code_push.rs`: Unit test only_a_managed_session_is_handed_to_the_cloud (lines 190-230).

**Test scenarios**

- **Switches off**
  1. Run the server without AGI_E2B_EXECUTION.
  2. Open /code and start a task.
  - Expected: Refusal 'Managed Code is not enabled for this deployment'; no session row.
- **CLI hand-off from Managed session**
  1. Push branch.
  2. agi code handoff.
  3. Read review, confirm.
  - Expected: Session created from pushed branch; warning if uncommitted files.
- **CLI hand-off from Local session**
  1. Run agi code handoff from a Local session.
  - Expected: Refusal naming Local mode and /continue-with-cloud; nothing sent.
- **Teleport back**
  1. Let the cloud session push its branch.
  2. In a clean checkout run agi resume --teleport.
  - Expected: Branch checked out and history loaded.
- **VS Code bring branch in with edits**
  1. Edit a file locally.
  2. Pick a cloud session > Bring the branch in.
  - Expected: Overwrite confirmation lists the file; declining leaves the tree unchanged.
- **VS Code continue signed out**
  1. Sign out.
  2. Run Code: Continue in the Cloud.
  - Expected: Warning to sign in; no session.

**Where to look when it fails**

- Errors capabilityUnavailable with the two messages above.
- Hand-off refusal code CLOUD_CODE_HANDOFF_REFUSED_CODE with a refusal reason (handoff/route.ts:90-103).
- Audit event code_session_lifecycle_changed (handoff/route.ts, recordAuditEvent).
- Tables cloud_code_agent_turns, steps, approvals.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/web/110-cross-product-experiences-to-include-in-the-product-map.md)
- Desktop: [70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/desktop/110-cross-product-experiences-to-include-in-the-product-map.md)
- Mobile: [70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/mobile/110-cross-product-experiences-to-include-in-the-product-map.md)
- CLI: [70-qa/test-plans/cli/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/cli/110-cross-product-experiences-to-include-in-the-product-map.md)
- VS Code: [70-qa/test-plans/vscode/110-cross-product-experiences-to-include-in-the-product-map.md](../../70-qa/test-plans/vscode/110-cross-product-experiences-to-include-in-the-product-map.md)

## 10. Gaps and dependencies

- **No design-to-implementation hand-off and no repository review deck.** Affects: Web, desktop, mobile, VS Code, Chrome. Evidence: Brief S110.12, S110.13; no code found. Work needed: Decide scope; for CLI it is already ruled out by decision.
- **Cloud result to local lacks a review (diff) step; it is a fetch and checkout.** Affects: VS Code, CLI. Evidence: context-handoff/index.ts:87-133; code_teleport.rs:150-175. Work needed: Add a diff summary before checkout if S110.23 review is required.
- **Hand-off from web, desktop, mobile and Chrome missing.** Affects: Those apps. Evidence: Brief S110.22 statuses. Work needed: Per decision, desktop hands a session to the CLI or VS Code; confirm the rest.
- **Brief for CLI cloud-to-local is out of date (teleport exists).** Affects: Documentation. Evidence: lib.rs:917-926. Work needed: Update the brief and the surface matrix.
- **Features are inert in production until the switch-on work (sandbox env and live check) is done.** Affects: All apps. Evidence: Brief S110.11, S110.23 Unfinished lines. Work needed: Owner sets AGI_E2B_EXECUTION=1 and E2B_API_KEY and runs a live check; not something code alone fixes.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-authorization-and-workspaces
- api:POST /api/code/sessions
- api:POST /api/code/sessions/handoff
- table:cloud_code_agent_turns
- plan:basic
- F110-08
- F110-10

## Unknown

- Whether any plan beyond those seen in packages/contracts/types/src/billing-catalog.ts lacks AGI Code (the definition is planIncludesAgiCode at billing-catalog.ts:839-840: maxSandboxes > 0 and a daily harness ceiling > 0; several plans have both at 0).
- Whether the web Code area has a visible message when the deployment switch is off (availability fields exist; the UI use was not opened).
- How mobile cloud sessions gate on availability.
- Whether Chrome starts or follows cloud sessions (brief: design unverified).
- How the web 'review changes' panel presents the diff before the pull request.
- Exact migration files for the cloud session tables.

## Second reader's check

A second reader checked 13 statements of this page against the code: 10 correct, 3 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 2 Before you start):** "A plan that includes AGI Code (apps/web/app/api/code/sessions/route.ts:57)" The code shows: route.ts:57 only computes planEntitled for the GET list response (availability, and whether runtimes are listed). The create path (handleCreate, lines 66-91) has no plan check. The plan gate for create is planIncludesAgiCode inside createCloudCodeSession, which is called from openCloudCodeSession. (apps/web/app/api/code/sessions/route.ts:57,66-91; apps/web/lib/services/cloud-code-session-service.ts:1243-1244). **Corrected:** A plan that includes AGI Code (maxSandboxes > 0 and a code harness daily ceiling > 0). It is enforced when a session is created in cloud-code-session-service.ts:1244, and the list route only reports it as availability.planEntitled.
- **Partly wrong (section 3 Working in the code / 5 map):** "Server open gates on switches, workspace feature, code policy, managed compute access and plan (cloud-code-session-open.ts:43-160)" The code shows: The file checks e2bProvisioningReady, the beta switch, network access/proxy, harness credential, workspace feature gate, code policy gate for open_cloud_session and each extra host, and evaluateManagedComputeAccess. It has no direct plan check. It only reads entitlement.plan and passes planTier to createCloudCodeSession, which does the check. (apps/web/lib/services/cloud-code-session-open.ts:43-160; cloud-code-session-service.ts:1244). **Corrected:** The open service applies the switches, network and credential checks, workspace and policy gates and the managed-compute access check, then hands the plan to createCloudCodeSession, which refuses a plan without AGI Code.
- **Partly wrong (section 7 Subscription / 6 Data):** "sandbox lifetime and max concurrent sandboxes from the plan (billing-catalog.ts:800-810); daily code harness ceiling (billing-catalog.ts:818-825), and apps/web/lib/billing-catalog.ts:808-810 for getPlanSandboxTtlMs" The code shows: The behaviour is right: getPlanMaxSandboxes, getPlanSandboxTtlMs and the codeHarnessDailyCeilingCents limit exist. But the file is not at apps/web/lib/billing-catalog.ts (it does not exist). It is packages/contracts/types/src/billing-catalog.ts, with getPlanMaxSandboxes at 801, getPlanSandboxTtlMs at 808, getPlanCodeHarnessDailyCeilingCents at 827 and planIncludesAgiCode at 839-840 (maxSandboxes>0 AND ceiling>0). Several plans have maxSandboxes 0 and ceiling 0, for example the one at lines 585-596. (packages/contracts/types/src/billing-catalog.ts:801-840,594). **Corrected:** Cite packages/contracts/types/src/billing-catalog.ts. AGI Code entitlement is maxSandboxes > 0 and a daily harness ceiling > 0.

**Facts the page missed**

- The page never gives the real task length limit. continueInCloud.ts:78-84 enforces CLOUD_CODE_LIMITS.task for VS Code, and the CLI uses TASK_LIMIT = 8_000 characters and TITLE_LIMIT = 120 (apps/cli/src/cloud/code_handoff.rs:9-10). Section 7 only says 'CLOUD_CODE_LIMITS'.
- Plan entitlement is not just 'basic'. Several plans (for example the one at packages/contracts/types/src/billing-catalog.ts:585-596) have maxSandboxes 0 and codeHarnessDailyCeilingCents 0, so planIncludesAgiCode is false (billing-catalog.ts:839-840). The same entitlement check also guards GET /api/code/repositories/branches (route.ts:61) and GET /api/github/repositories (route.ts:176), so a non-entitled plan cannot even list repositories. The page lists neither route, and section 7 gives no per-plan rule. Its 'Unknown' section says the planIncludesAgiCode definition was not opened.
- The page puts the plan check in cloud-code-session-open.ts and route.ts:57. The enforcing check on create is createCloudCodeSession (apps/web/lib/services/cloud-code-session-service.ts:1243-1244). That is where max concurrent sandboxes (getPlanMaxSandboxes) is applied against the plan, and it is missing from the implementation map.
