---
id: "F067-02"
type: "feature"
title: "Change code: implement, fix, refactor, write tests and docs, migrate, upgrade"
aliases: ["Change code", "Implement a feature (S67.06)", "Fix a defect (S67.07)", "Refactor code (S67.08)", "Generate tests (S67.09)", "Generate documentation (S67.26)", "Perform migrations (S67.27)", "Upgrade dependencies (S67.28)", "Code: Fix Issue", "Code: Refactor Code", "Code: Generate Tests", "Code: Generate Docs"]
area: "67 Coding capabilities and developer workflows"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S67.06", "S67.07", "S67.08", "S67.09", "S67.26", "S67.27", "S67.28"]
depends_on: ["surface:desktop", "surface:cli", "surface:vscode", "surface:mobile", "surface:web", "mode:local", "mode:own-key", "mode:cloud", "F067-01", "F067-03", "F067-06", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "file:apps/cli/src/features/exec/tools/mod.rs", "plan:pro"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F067-02 Change code: implement, fix, refactor, write tests and docs, migrate, upgrade

The coding agent edits and creates files in the approved folder to do a job: build a feature, fix a defect, refactor, write tests or docs, migrate, upgrade dependencies. Each write or command is checked against folder access and the approval mode first. On a plain Web tab it runs in a cloud sandbox instead.

Area: [67. Coding capabilities and developer workflows](README.md). Requirement items: [S67.06](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6706), [S67.07](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6707), [S67.08](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6708), [S67.09](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6709), [S67.26](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6726), [S67.27](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6727), [S67.28](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6728).

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

**What it does.** Turns a plain request into file changes. The agent reads first, then edits or writes files, and asks the person before risky steps. It covers feature work, defect fixes, refactors, new tests, docs, migrations and dependency upgrades; all seven brief items use the same editing tools.

**Why it exists.** Editing code is the main job of a coding assistant. The brief gives one 'Should' line per task type (doc: knowledge-base/data/area-briefs/067-coding-capabilities-and-developer-workflows.md S67.06-S67.09, S67.26-S67.28).

**Who uses it.** Developers on Desktop, CLI and VS Code; developers who start or steer a Desktop session from the phone; Web users with a plan that includes the cloud sandbox.

**Problems it solves**

- Repetitive multi-file edits take long by hand.
- Writing tests and docs is skipped for lack of time.
- Upgrades need many small code changes.

**Use cases**

- Ask the agent to add a field across a form, its API and its tests.
- Paste a failing stack trace and ask for the fix.
- Ask for unit tests for an untested module.
- Ask to rename a module and update every import.

## 2. User experience

**Where to find it**

- Desktop: Code page folder session composer (apps/web/features/code/components/LocalSessionPanel.tsx:159).
- CLI: interactive agi; tools write_file, edit_file, multiedit, apply_patch (apps/cli/src/platform/runtime/tool_catalog.rs:241-243, 291).
- VS Code: commands 'Code: Fix Issue', 'Code: Refactor Code', 'Code: Generate Tests', 'Code: Generate Docs' (apps/extension-vscode/package.json:142, 147, 152, 310) and the sidebar chat.
- Mobile: composer 'Message this session' on a Desktop session, or a cloud session on the 'AGI Code' screen (apps/mobile/src/features/companion/components/codeSessionTimeline.ts:10).
- Web browser tab: cloud session on /code, only when the sandbox is switched on (apps/web/lib/e2b/gate.ts:20).

**Before you start**

- Approved folder and agent grant (Desktop) (apps/desktop/electron/runtime/agentAccess.ts:23).
- Git folder is not required to edit, but changes view needs a git repository ('This folder is not a git repository, so there are no changes to show.') (apps/web/features/code/local-code.ts:128).
- A reachable model; account cloud models need plan:pro or higher (packages/contracts/types/src/billing-catalog.ts:359).

**Screens and controls**

- Approval card with decisions 'Allow once', 'Allow for this session', 'Always allow' (only when a command prefix is proposed), 'Deny', 'Deny and stop' (apps/web/features/code/local-code.ts:439-445, 449-457).
- Risk labels 'Low risk', 'Medium risk', 'High risk' (apps/web/features/code/local-code.ts:447-451).
- Agent mode: plan, ask, auto, bypass; cycle skips bypass (apps/web/features/code/local-code.ts:432-437).
- Mobile approval card shows 'Command', risk and 'Cannot be undone' (apps/mobile/src/features/companion/components/codeSessionTimeline.ts:31-33).

**Journey**

1. Describe the change in the composer and send it.
2. The agent reads the relevant files.
3. For each write or command the agent asks, unless the mode allows it; the person picks a decision.
4. The agent edits files and may run checks (see F067-03).
5. Open the changes panel or the review pane to read and keep the result (see F067-06).

**What the person sees and gets**

- Approval cards with the exact command or patch; a patch approval lists every target file and the changes (apps/cli/src/features/exec/tools/mod.rs:4270-4290 test shows request detail lists all files).
- A final message with a summary. A refused command is returned to the agent as a failed tool result (apps/cli/src/features/exec/tools/mod.rs:802-806 pattern for refusals, e.g. 'was not approved under the workspace policy').

**Settings**

- Agent mode and remembered posture; bypass is never remembered (apps/web/features/code/local-code.ts:425-429).
- Workspace policy file .agiworkforce/policy.toml with allow, ask, deny rules (apps/cli/src/features/exec/tools/mod.rs:618-620).
- Settings listed in the product requirements for AGI Code: 'Preview first', 'Bypass permissions mode' (doc: docs/product/requirements.md:1369-1385).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI write tools: write_file, edit_file, multiedit, apply_patch, notebook_edit (apps/cli/src/platform/runtime/tool_catalog.rs:241-243, 258, 291). File edits are scoped to the workspace root and validated (apps/cli/src/features/exec/tools/mod.rs:509-545).
- An apply_patch approval names every target file and shows the changes, and protected files such as editor task files are included (apps/cli/src/features/exec/tools/mod.rs:4243-4290).
- Workspace policy can deny, allow or ask per tool (apps/cli/src/features/exec/tools/mod.rs:592-690).
- Desktop shell checks the folder grant before developer commands run (apps/desktop/electron/runtime/dispatcher.ts:1003-1011).
- VS Code shows a proposed change as a diff in an agi-proposed document before approval (apps/extension-vscode/src/features/permissions/proposedChangeReview.ts:4).
- VS Code has editor commands for fix, refactor, tests and docs (apps/extension-vscode/package.json:142-152, 310).
- Web cloud sandbox agent has write_file, edit_file, create_folder, execute_code (apps/web/lib/e2b/execution-tools.ts:14-19), and classifies commands: safe, requires approval, denied (apps/web/lib/services/cloud-code-agent-tools.ts:44-47).

**Incomplete**

- Web: cloud sandbox path needs the switch (apps/web/lib/e2b/gate.ts:20-30); Web local path needs the Desktop shell.
- Brief marks migrations and dependency upgrades as separate items; no migration-specific or upgrade-specific code was found. They use the general edit and shell tools [inferred].

**Present but disconnected or switched off**

- Cloud sandbox edits are disabled until AGI_E2B_EXECUTION=1, E2B_API_KEY and a priceable rate are set (apps/web/lib/e2b/gate.ts:20-30).

**Not available**

- Chrome extension has no code session (doc: docs/product/surface-feature-matrix.md:419).
- A plan gate for folder sessions that use on-device models: none found in the code read.

## 4. Required behaviour

**Established requirements**

- Given a feature request, the agent edits and creates files. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.06)
- Given a defect, the agent finds the cause and edits the code. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.07)
- The agent restructures code across files without changing behaviour. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.08)
- The agent writes new test files or cases. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.09)
- The agent writes or updates documentation from the code. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.26)
- The agent performs a code or schema migration across the repository. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.27)
- The agent upgrades dependencies and adjusts code. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.28)
- An action a user cannot undo asks first and names the consequence. (source: (doc: AGENTS.md section 9))

**Acceptance criteria**

1. Ask for a one-file edit with mode ask; an approval card appears showing the patch before the file changes.
2. Deny the approval; the file is unchanged and the agent is told it was refused.
3. With mode plan, no file is written.
4. Edit a path outside the approved folder; the write is refused.
5. In a plain browser tab with the sandbox off, no edit is possible and the page says so.
6. Ask the agent to add tests; new test files exist and appear in the changes panel.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A failed command should be reported to the agent and to the person. Tool results carry success false and a message (apps/cli/src/features/exec/tools/mod.rs:802-806). Whether the person sees it as a notice on every app was not traced. [inferred]
- Dependency upgrades and migrations need shell approval because they run package commands. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a plain-language preview of every write on Web cloud sessions the same way VS Code does.
- [proposed] Add a test that runs the whole path signed out with an on-device model.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LocalSessionPanel | `apps/web/features/code/components/LocalSessionPanel.tsx` | Composer, transcript and approval cards for a folder session. |
| component | LocalApprovalCard | `apps/web/features/code/components/LocalApprovalCard.tsx` | Shows an approval request with decision buttons. |
| config | local-code | `apps/web/features/code/local-code.ts` | Decision labels, risk labels, agent mode cycling, failure actions, copy. |
| service | dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | Per-command capability table and folder grant check. |
| service | developerSessionService | `apps/desktop/electron/runtime/developerSessionService.ts` | Runs the CLI app-server and passes approval answers. |
| service | exec tools | `apps/cli/src/features/exec/tools/mod.rs` | Approval, workspace policy and file target validation for write tools. |
| config | tool_catalog | `apps/cli/src/platform/runtime/tool_catalog.rs` | Which tools are file-edit tools. |
| service | apply_patch | `apps/cli/src/apply_patch.rs` | Applies a patch with git apply and reports applied, skipped, conflicted. |
| service | path_security | `apps/cli/src/path_security.rs` | Validates workspace write paths (called at apps/cli/src/features/exec/tools/mod.rs:537). |
| command | VS Code editor commands | `apps/extension-vscode/package.json` | fix, refactor, generateTests, docs commands. |
| component | proposedChangeReview | `apps/extension-vscode/src/features/permissions/proposedChangeReview.ts` | Read-only agi-proposed documents for diffing a proposed edit. |
| component | CodeSessionView | `apps/mobile/src/features/companion/components/CodeSessionView.tsx` | Phone composer and approval answers. |
| service | codeRemoteController | `packages/platform/utils/src/remoteControl/codeRemoteController.ts` | Phone start limits; redaction of text sent to the phone. |
| config | remoteTurnAgentMode | `packages/contracts/local-runtime/src/developer-session.ts` | A turn started from a phone never names bypass mode (line 45). |
| service | cloud-code-agent-tools | `apps/web/lib/services/cloud-code-agent-tools.ts` | Sandbox command risk classes. |
| config | execution-tools | `apps/web/lib/e2b/execution-tools.ts` | Sandbox tool definitions: execute_code, write_file, edit_file and others. |
| endpoint | POST /api/code/sessions/[sessionId]/agent | `apps/web/app/api/code/sessions/[sessionId]/agent/route.ts` | Cloud agent turn. |
| endpoint | agent approvals route | `apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts` | Answers cloud agent approval requests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person sends a request in the composer; the desktop shell checks the folder grant. | device | apps/desktop/electron/runtime/dispatcher.ts:1003-1011 |
| The CLI agent plans tool calls and asks the model what to do next. | outside service | apps/cli/src/features/exec/tools/mod.rs:720-727 (privacy mode gate); apps/web/features/code/local-code.ts:552-554 |
| Before a write the CLI resolves the target against the workspace root and checks workspace policy, then asks for approval unless the mode pre-approves edits. | device | apps/cli/src/features/exec/tools/mod.rs:509-545, 592-690, 762-767 |
| The approval request is shown in the app and the answer returns to the CLI. | device | apps/web/features/code/local-code.ts:439-457 |
| The file is written inside the folder; the changes panel reads git status and diff afterwards. | device | apps/desktop/electron/runtime/gitService.ts:575 |
| Web cloud session: the turn runs in a managed sandbox; commands are classified and approvals come back through the approvals route. | our servers | apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:101; apps/web/lib/services/cloud-code-agent-tools.ts:44-47 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Edited files | The person's folder (Desktop, CLI, VS Code) or the sandbox workspace (Web cloud). | No sync for folder files; cloud sandbox state lives on our servers. | Per-turn checkpoints allow rewind (apps/web/features/code/hooks/use-local-review.ts:46); retention unknown. |
| Approval decisions and saved permissions | CLI permission store on the device (apps/cli/src/features/exec/tools/mod.rs:553). | Not found. | 'Allow for this session' lasts for the session; 'Always allow' is saved when a command prefix exists (apps/web/features/code/local-code.ts:449-457). |

**Models and providers.** The model is chosen per session. On-device models keep prompts on the device; own-key sends them to the person's provider; account cloud models go through our gateway under plan rules (apps/web/features/code/local-code.ts:700-711). Cloud sandbox turns pick a model with resolveCloudCodeAgentModel for the plan (apps/web/lib/services/cloud-code-github-task.ts:3-6).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Folder sessions: not required for on-device models [inferred]; required for account cloud models. Cloud sandbox: required. |
| Permissions | Desktop folder grant (apps/desktop/electron/runtime/agentAccess.ts:23); per-write approval; workspace policy; phone turns never start in bypass mode (packages/contracts/local-runtime/src/developer-session.ts:45). |
| Subscription | Folder sessions on account cloud models: plan:pro, plan:max, plan:max_15x, plan:team, plan:team_premium, plan:enterprise (packages/contracts/types/src/billing-catalog.ts:359). Cloud sandbox: plans with a code budget (packages/contracts/types/src/billing-catalog.ts:839-841). Folder editing with on-device or own-key models: no plan gate found in the code read. |
| Limits and metering | Cloud sandbox: sandbox count, TTL and daily code harness ceiling per plan (packages/contracts/types/src/billing-catalog.ts:801-833). Phone start limits (packages/platform/utils/src/remoteControl/codeRemoteController.ts:44-46). CLI batch calls capped at 25 (apps/cli/src/features/exec/tools/mod.rs:2318). |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY (apps/web/lib/e2b/gate.ts:6-7); managed-compute private beta gate (apps/web/lib/e2b/gate.ts:34-36). |
| Model compatibility | Tool use is required for editing; which models support it is defined by the catalog, not read here. Unknown. |
| Provider restrictions | A session cannot switch to a model in another trust boundary (apps/web/features/code/components/LocalSessionPanel.tsx onNewSessionWith prop, near line 190). |
| Local mode | Editing works with an on-device model and no paid plan: nothing in the folder edit path checks a plan [inferred from absence]. CLI Local privacy mode only blocks network tools (apps/cli/src/features/exec/tools/mod.rs:724-735). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Approval pending | Escape denies when it is the only pending approval; Enter never allows. | apps/web/features/code/components/LocalApprovalCard.test.tsx:44-60 |
| Denied by workspace policy | Tool result: 'is denied by ... and was not run.' | apps/cli/src/features/exec/tools/mod.rs:620-640 |
| Patch with conflicts | apply_patch returns applied, skipped and conflicted lists with an exit code. | apps/cli/src/apply_patch.rs:14-24 |
| Target outside workspace | Write path validation returns an error string. | apps/cli/src/features/exec/tools/mod.rs:537-540 |
| Turn failure | Retry, Upgrade or sign-in copy actions. | apps/web/features/code/local-code.ts:680-691 |
| Phone cannot reach computer | Follow-up not sent message; draft kept. | apps/mobile/src/features/companion/components/codeSessionTimeline.ts:17-19 |
| Too many phone starts | 'Too many sessions were started from the phone just now. Wait a few minutes.' | packages/platform/utils/src/remoteControl/codeRemoteController.ts:51 |
| Sandbox not enabled | Cloud request refused with capability unavailable. | apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:101 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalApprovalCard.test.tsx`: Approval keys: Deny, Escape and Enter behaviour.
- `apps/web/features/code/local-code.test.ts`: Local code helper functions (titles not read).
- `apps/web/features/code/local-code.plan.test.ts`: Plan lines and plan-needed logic for local sessions (titles not read).
- `apps/cli/src/features/exec/tools/mod.rs`: In-file tests, including a protected mixed patch approval that lists every target and its changes (line 4243 onward).
- `apps/web/lib/services/cloud-code-session-service.test.ts`: Session creation rules: branch refs, repository URLs, network access acknowledgement.
- `apps/mobile/src/features/companion/components/__tests__/CodeSessionView.test.tsx`: Mobile follow-up draft and rejection handling.

**Test scenarios**

- **Approve an edit**
  1. Start a Desktop session in ask mode.
  2. Ask to add a comment line to a file.
  3. Choose Allow once.
  - Expected: File changes; it appears in the changes panel.
- **Deny an edit**
  1. Same request.
  2. Choose Deny.
  - Expected: File unchanged; the agent reports it was refused.
- **Plan mode**
  1. Switch the mode to plan.
  2. Ask for an edit.
  - Expected: A plan is produced; no file is written.
- **Outside folder**
  1. Ask the agent to write a file one level above the folder.
  - Expected: Refused with a path error.
- **Plain browser**
  1. Open /code in a browser with the sandbox off.
  2. Try to start a session.
  - Expected: A notice that managed Code is not available.
- **Phone steer**
  1. Open a running Desktop session on the phone.
  2. Send a follow-up.
  - Expected: The computer runs it; if unreachable the draft is kept with a failure message.

**Where to look when it fails**

- Tool result text 'was not approved under the workspace policy' (apps/cli/src/features/exec/tools/mod.rs:640-650).
- Approval audit module apps/cli/src/approval_audit.rs exists; contents not read.
- Cloud: logger lines in apps/web/lib/services/cloud-code-github-task.ts for task failures.
- Nothing was run; no result is recorded.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md)
- Desktop: [70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md)
- Mobile: [70-qa/test-plans/mobile/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/mobile/067-coding-capabilities-and-developer-workflows.md)
- CLI: [70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md)
- VS Code: [70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md)

## 10. Gaps and dependencies

- **No migration-specific or dependency-upgrade-specific behaviour; they rely on general tools.** Affects: All apps.. Evidence: No such code found in apps/cli/src or apps/desktop/electron/runtime.. Work needed: Decide if general tools meet the requirement; add scenario tests.
- **Web cloud sessions are off until the sandbox switch is set; Web browser users have no editing otherwise.** Affects: Web browser users.. Evidence: apps/web/lib/e2b/gate.ts:20-30. Work needed: Set the switch (owner action), live-check /code.
- **Failure display for refused commands on every app was not traced.** Affects: Desktop, Mobile, VS Code.. Evidence: Only CLI tool results were read (apps/cli/src/features/exec/tools/mod.rs:620-650).. Work needed: Trace to the UI and add a test per app.
- **Cloud sandbox agent has no search tool of its own.** Affects: Web cloud sessions.. Evidence: apps/web/lib/e2b/execution-tools.ts:14-19 lists six tools, none a search.. Work needed: Confirm that shell grep is enough or add a tool.

**Depends on**

- surface:desktop
- surface:cli
- surface:vscode
- surface:mobile
- surface:web
- mode:local
- mode:own-key
- mode:cloud
- F067-01
- F067-03
- F067-06
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- file:apps/cli/src/features/exec/tools/mod.rs
- plan:pro

## Unknown

- Whether the sandbox switch is on in production.
- How a refused command shows to the person on each app.
- Whether a signed-out Desktop user can edit with an on-device model.
- Retention of per-turn checkpoints.
- Which models support the tools needed for editing.
