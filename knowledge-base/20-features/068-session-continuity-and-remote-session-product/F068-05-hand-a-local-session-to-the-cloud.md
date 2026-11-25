---
id: "F068-05"
type: "feature"
title: "Hand a local session to the cloud"
aliases: ["Hand a local session to the cloud", "Continue in the Cloud", "agi code handoff", "agi code start", "File/environment transfer review", "Summary-only transfer (not built)", "Transcript branch (not built)"]
area: "68 Session continuity and remote-session product"
available_on: ["cli", "vscode"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "built", vscode: "partial", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S68.16", "S68.18", "S68.28", "S68.29"]
depends_on: ["surface:cli", "surface:vscode", "mode:cloud", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-model-catalog-and-routing", "SYS-connectors-plugins-and-skills", "api:POST /api/code/sessions/handoff", "api:POST /api/code/sessions", "api:GET /api/github/repositories", "table:cloud_code_sessions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F068-05 Hand a local session to the cloud

On the command line, agi code handoff sends a local session to a new cloud Code session after showing what moves and what stays, and agi code start sends a new task. VS Code's 'Continue in the Cloud' starts a new task from the open repository. Web, desktop and phone have no hand-off.

Area: [68. Session continuity and remote-session product](README.md). Requirement items: [S68.16](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6816), [S68.18](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6818), [S68.28](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6828), [S68.29](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6829).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Moves coding work from the person's machine to cloud execution, after a review that names the repository and branch, the task or session record that move, and the files and settings that stay.

**Why it exists.** Long work can run while the laptop is closed, but nothing may leave the machine without the person seeing it first (doc: docs/product/definition.md:120).

**Who uses it.** Developers with a GitHub repository who want cloud execution of a local task.

**Problems it solves**

- Surprise uploads: the review lists moves and stays.
- Cloud work starting from code that GitHub does not have.
- Local or own-key sessions silently reaching our cloud.

**Use cases**

- Run agi code start "fix the failing test" in a checkout.
- Run agi code handoff to continue a local session in the cloud.
- In VS Code, run Code: Continue in the Cloud, type a task and confirm.

## 2. User experience

**Where to find it**

- CLI: agi code start <task> and agi code handoff [session] (apps/cli/src/lib.rs:1163-1196).
- VS Code: command palette 'Code: Continue in the Cloud' (apps/extension-vscode/package.json:592-595) and the Sessions sheet on the Cloud tab (doc: audit/partial/068-session-continuity-and-remote-session-product.md, S68.16 note).
- Web, desktop, phone: not available.

**Before you start**

- Cloud (managed) mode and a signed-in account (apps/cli/src/cloud/client.rs:361-379).
- A git checkout of a GitHub repository with the branch on GitHub (apps/cli/src/cloud/code_handoff.rs:209-280).
- For handoff: no unpushed commits, and a saved local session in this folder that is in Managed mode (apps/cli/src/lib.rs:3209-3218; code_push.rs:40-93).
- Cloud Code switched on for the deployment and plan (apps/web/lib/services/cloud-code-session-open.ts:44-53).

**Screens and controls**

- Review text: 'Hand this task to a cloud Code session:', 'What moves to the cloud', 'What stays on this machine', 'Access:' (apps/cli/src/cloud/code_handoff.rs:412-433).
- Prompt 'Hand this session to the cloud?' default no; '--yes' or '-y' skips it; '--model'; '--json' (apps/cli/src/lib.rs:1163-1196,3238).
- VS Code input box 'Continue in the cloud' with the prompt about the branch, then a modal review with a 'Continue in the cloud' button (apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:14,109-131).

**Journey**

1. 1. Push the branch to GitHub and commit what should travel.
2. 2. Run agi code handoff (or start).
3. 3. The CLI inspects git, checks GitHub access, picks the cloud model and prints the review.
4. 4. Answer the prompt (or pass --yes).
5. 5. The CLI sends the record, the server opens a session and returns a seed prompt.
6. 6. The first cloud turn runs; Ctrl-C stops it and keeps the session.
7. 7. The result and the session address print; bring the branch back later (F068-06).

**What the person sees and gets**

- Moves list includes the repository and branch on GitHub 'as of your last fetch', and the task with 'Trusted hosts' network access; for handoff also 'this session's handoff record: its goal, the approvals you gave, its plan and architecture notes, the files it changed, the checks it ran and this folder's path' (code_handoff.rs:333-351).
- Stays list includes unpushed commits, changed and untracked files, and local settings (code_handoff.rs:352-389).
- Refusals: '<branch> has N commit(s) that are not pushed ... push first' (lib.rs:3209-3214); 'Nothing was handed off: this run cannot ask for confirmation. Re-run with --yes.' (lib.rs:3234-3235); 'Nothing was handed off.' on a No answer (lib.rs:3238-3240).
- Warning 'Uncommitted changes stay on this machine; the cloud session works from the pushed branch.' (code_push.rs:174-178).
- VS Code: refusals about no GitHub remote, detached HEAD, no upstream (continueInCloud.ts:24-36) and 'sign in to AGI Cloud' (line 103).

**Settings**

- Default cloud model from config default.cloud_model, else a coding model the plan includes (lib.rs:1171-1176 doc comments).
- Network access is fixed at 'trusted' (code_handoff.rs:11).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- agi code handoff: inspect git, refuse unpushed commits, find the local session in this folder, admit only Managed mode, review, confirm, post to /api/code/sessions/handoff, then run the first cloud turn (apps/cli/src/lib.rs:3197-3268).
- agi code start: validate task (max 8000 characters, no null byte), review, confirm, create session, run first turn (lib.rs:3270-3331; code_handoff.rs:9,95-110).
- Server admits a hand-off only when it is fresh, for the same account, of a supported protocol and addressed to managed Code; otherwise 422 with a refusal reason (apps/web/app/api/code/sessions/handoff/route.ts:60-110; test apps/web/app/api/code/sessions/handoff/route.test.ts).
- A retried hand-off reuses the session by request id (route.test.ts 'gives the same request id to the same handoff so a retry reuses the session').
- Private repositories need the GitHub app; otherwise the session clones it as public and the review says to connect GitHub on the Code page (code_handoff.rs:390-404).
- The CLI turns the 422 refusal reasons into plain text (code_push.rs:118-133,141-164).
- VS Code shows a modal review with repository, branch, model, network, what moves and stays, unpushed and uncommitted counts (continueInCloud.ts:60-85; packages/ui/i18n/locales/en/vscode.json:228-235), creates the session and runs the first turn (continueInCloud.ts:142,164).

**Incomplete**

- VS Code creates a new session from a freshly typed task; it does not use the hand-off endpoint and so sends no session record (continueInCloud.ts:142-164; apps/web/__tests__/api/routes-without-callers.test.ts:160-161 says the CLI posts there). The brief marks it partial.
- CLI first-turn wait is 330 seconds while the server turn limit is 800 seconds (code_handoff.rs:14; packages/contracts/types/src/cloud-code.ts:259-266) [inferred risk].
- Unpushed commits are listed under 'stays' in the review but block only handoff; agi code start does not block on them (code_handoff.rs:353-359; lib.rs:3209-3215 vs 3281-3290).

**Present but disconnected or switched off**

- Cloud session creation needs the deployment switch; without it the server refuses with 'Managed Code is not enabled for this deployment. Use the desktop app for local code.' (apps/web/lib/services/cloud-code-session-open.ts:44-48).

**Not available**

- Web, desktop and phone hand-off and transfer review: not built (doc: brief S68.16, S68.18). Phone creates new cloud sessions only.
- Summary-only transfer and transcript branch (S68.28, S68.29): declined (doc: docs/decisions/2026-09-27-founder-decisions.md:164-168).

## 4. Required behaviour

**Established requirements**

- The user explicitly hands a local session to cloud execution, seeing what moves. (source: brief S68.16)
- Before a transfer the user reviews which files, context and environment move. (source: brief S68.18)
- Moving context between local and cloud is an explicit, provenance-preserving handoff with payload preview, secret scanning, consent and a new destination record. (source: docs/product/definition.md:120)
- Cloud handoff must not overwrite local context. (source: docs/product/requirements.md:694)
- Summary-only and transcript-branch options are not built. (source: docs/decisions/2026-09-27-founder-decisions.md:164-168)
- No local, BYOK or managed move happens silently; a Local to BYOK move is an explicit fork. (source: AGENTS.md section 6)

**Acceptance criteria**

1. agi code handoff with an unpushed commit exits with the 'push first' error and sends nothing.
2. Without a terminal and without --yes, nothing is sent.
3. The review lists the repository and branch, the task or record, and the files that stay, before any request.
4. A Local or own-key session is refused with a message naming the mode.
5. A private repository not in a GitHub installation shows the connect-GitHub line.
6. With the cloud switch off, the server refuses and no session is created.
7. Repeating the same handoff reuses the same cloud session.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Secret scanning of the handoff record should happen before upload; not found in the CLI path read [inferred from definition.md:120].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer hand-off on web and desktop for local sessions.
- [proposed] Make VS Code send a real session record through the hand-off endpoint.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | agi code start / handoff | `apps/cli/src/lib.rs` | Commands, handlers, confirmation and first turn |
| service | code_handoff | `apps/cli/src/cloud/code_handoff.rs` | Git inspection, GitHub access, review text, create body, turn calls |
| service | code_push | `apps/cli/src/cloud/code_push.rs` | Local session lookup, mode admission, hand-off record, submit, refusal text |
| service | session_handoff | apps/cli/src/runtime/session_handoff.rs (not found) (not found) | Builds the hand-off record (file not opened) |
| service | CloudClient | `apps/cli/src/cloud/client.rs` | Managed-only account client |
| endpoint | POST /api/code/sessions/handoff | `apps/web/app/api/code/sessions/handoff/route.ts` | Admits the record and opens a session |
| service | openCloudCodeSession | `apps/web/lib/services/cloud-code-session-open.ts` | Deployment, kill switch, subscription gates and creation |
| endpoint | POST /api/code/sessions | `apps/web/app/api/code/sessions/route.ts` | Plain session creation used by start and VS Code |
| endpoint | GET /api/github/repositories | `apps/web/app/api/github/repositories/route.ts` | Used by the CLI to find GitHub app access |
| service | continueInCloud | `apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts` | VS Code review, create, first turn |
| service | readWorkspaceCloudSource | `apps/extension-vscode/src/features/context-handoff/index.ts` | Reads repository, branch, upstream, unpushed and dirty files |
| config | vscode strings | `packages/ui/i18n/locales/en/vscode.json` | cloud.* review text |
| config | CLOUD_CODE_AGENT_TURN_REQUEST_LIMIT_MS | `packages/contracts/types/src/cloud-code.ts` | Turn request limit clients must allow |
| table | cloud_code_sessions | `apps/web/db/neon/0075_cloud_code_sessions.sql` | Stores the new session |
| test | routes-without-callers | `apps/web/__tests__/api/routes-without-callers.test.ts` | Records that the CLI posts to the hand-off route |
| service | managed compute gate | `apps/web/lib/managed-compute-gate.ts` | Kill switch AGI_MANAGED_COMPUTE_PRIVATE_BETA |
| service | e2b gate | `apps/web/lib/e2b/gate.ts` | Deployment switch |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI reads git state, remote and branch, and the local session file. | device | apps/cli/src/cloud/code_handoff.rs:209-280; code_push.rs:40-69 |
| CLI asks our servers whether the GitHub app can clone the repository. | our servers | apps/cli/src/cloud/code_handoff.rs:282-299 |
| CLI prints the review and asks for confirmation. | device | apps/cli/src/lib.rs:3223-3243 |
| CLI posts the record; server checks rate limit, CSRF, admission, deployment, kill switch and subscription, then opens the session. | our servers | apps/web/app/api/code/sessions/handoff/route.ts:60-150; cloud-code-session-open.ts:44-147 |
| The sandbox clones the pushed branch from GitHub. | outside service | apps/cli/src/cloud/code_handoff.rs:9-12,441-463; apps/web/lib/e2b/gate.ts:1-28 |
| CLI starts the first turn with the seed prompt and waits, or stops on Ctrl-C. | device and our servers | apps/cli/src/lib.rs:3365-3386 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Hand-off record: goal, approvals given, plan and architecture notes, changed files, checks run, folder path | sent to our servers; storage location of the record: unknown (route builds the seed prompt from it) | Becomes part of the cloud session's first turn [inferred] | unknown |
| New cloud session row and audit event with source 'handoff' | table cloud_code_sessions and the audit log | Visible on every client | unknown |
| Code on GitHub | GitHub (outside service) | The cloud session clones the pushed branch | Controlled by GitHub |

**Models and providers.** The cloud model is the --model value, else config default.cloud_model, else a coding model the plan includes (lib.rs:1171-1176). Model catalog and routing are owned by SYS-model-catalog-and-routing; the VS Code path resolves the model through resolveCloudCodeAgentModel (continueInCloud.ts:116-125). Providers: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account (apps/cli/src/cloud/client.rs:375-379; continueInCloud.ts:98-104). |
| Permissions | GitHub app installation decides private clone access (code_handoff.rs:390-404). Server: rate limit, CSRF, owner scope (handoff route.ts:60-65). |
| Subscription | Creation runs the managed compute access check with the 'code' feature and needs a plan with AGI Code (cloud-code-session-open.ts:138-147; packages/contracts/types/src/billing-catalog.ts:839-841). Plan names: unknown. |
| Limits and metering | Task up to 8000 UTF-16 units (code_handoff.rs:9,103-108); record size capped by CLOUD_CODE_HANDOFF_BODY_LIMIT_BYTES (handoff route.ts:70-77); per-plan session cap (apps/web/app/api/code/sessions/route.ts:45-46); turn cost settled per turn (cloud-code-agent-service.ts:302-312). |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY, AGI_MANAGED_COMPUTE_PRIVATE_BETA (apps/web/lib/e2b/gate.ts; apps/web/lib/managed-compute-gate.ts:40,55-58). |
| Model compatibility | A coding model the plan includes; exact list unknown. |
| Provider restrictions | none found in the CLI path; cloud route provider list unknown. |
| Local mode | A session that is Local or own-key is refused: 'Session <id> runs in <mode> mode, so it stays on this machine and nothing was handed off', with steps to start a Managed session (apps/cli/src/cloud/code_push.rs:84-91). The CLI client refuses non-managed modes altogether (apps/cli/src/cloud/client.rs:49-54,368-373). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No GitHub remote, detached HEAD, branch not on GitHub | Specific refusal messages telling what to push or check out. | apps/cli/src/cloud/code_handoff.rs:210-265 |
| Unpushed commits | Handoff refused before any request. | apps/cli/src/lib.rs:3209-3215 |
| No terminal and no --yes | Nothing handed off. | apps/cli/src/lib.rs:1987-1995,3234-3235 |
| User answers no | 'Nothing was handed off.' | apps/cli/src/lib.rs:3238-3240 |
| Server refusal (expired, wrong account, protocol, unknown mode) | Plain text from the refusal reason. | apps/cli/src/cloud/code_push.rs:118-133 |
| Timeout or interrupt | Ctrl-C asks the server to cancel; if that fails, tells the person to stop it on the web. | apps/cli/src/lib.rs:3371-3386 |
| Retry | Same hand-off reuses the session (request id from account and record). | apps/web/app/api/code/sessions/handoff/route.ts:111-124; route.test.ts |
| VS Code cancels | Cancelling the input or the modal creates nothing. | apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:108-132; test continueInCloud.test.ts |
| Terminal output safety | Task text is whitespace-normalised and truncated to 160 characters in the review. | apps/cli/src/cloud/code_handoff.rs:412-424 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/code/sessions/handoff/route.test.ts`: Opens a session from a fresh record; records only the id; no record when refused; retry reuses; refuses wrong account, expired, local-addressed, oversized, unbounded field and non-GitHub repository; carries the network acknowledgement
- `apps/cli/src/cloud/code_handoff.rs`: Unit test that the handoff review names the session record it uploads and does not claim the session stays local
- `apps/cli/src/cloud/code_push.rs`: Unit test that only a Managed session is handed to the cloud
- `apps/extension-vscode/src/__tests__/continueInCloud.test.ts`: Shows both models before creating, sends only the approved cloud model, creates nothing when cancelled, shows only the cloud model for a managed default
- `apps/web/__tests__/api/routes-without-callers.test.ts`: Lists the hand-off route as called by the CLI

**Test scenarios**

- **Unpushed commit**
  1. Make a commit without pushing.
  2. Run agi code handoff.
  - Expected: Error asking to push first; no request sent.
- **Review then decline**
  1. Run agi code start "task".
  2. Answer no.
  - Expected: Review printed, 'Nothing was started.', no session.
- **Non-interactive**
  1. Run in a pipe without --yes.
  - Expected: Refused with the re-run hint.
- **Local mode session**
  1. Open a Local mode session.
  2. Run agi code handoff.
  - Expected: Refusal naming Local mode.
- **Private repo without app**
  1. Use a private repo not in a GitHub installation.
  2. Run agi code start --yes.
  - Expected: Review says to connect GitHub; clone fails or is refused (outcome unknown).
- **Cloud switch off**
  1. Unset AGI_E2B_EXECUTION.
  2. Run agi code start --yes.
  - Expected: Capability message; no session.

**Where to look when it fails**

- CLI messages 'The cloud did not take the session: ...' (lib.rs:3247).
- HTTP 422 body with error.refusal.reason (handoff route.ts:92-104).
- Audit event code_session_lifecycle_changed with source 'handoff' (route.ts:125-140).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md)
- VS Code: [70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md)

## 10. Gaps and dependencies

- **No hand-off on web, desktop or phone.** Affects: Web, desktop, phone. Evidence: doc: brief S68.16, S68.18. Work needed: Decide scope; build review screens.
- **VS Code sends a new task, not the session record, and has no file-level review of what moves.** Affects: VS Code. Evidence: apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:142-164; vscode.json:229-230. Work needed: Use the hand-off endpoint and list files.
- **CLI wait of 330 seconds is shorter than the 800-second server turn limit.** Affects: CLI. Evidence: code_handoff.rs:14; cloud-code.ts:259-266. Work needed: Align limits [inferred].
- **Cloud switch needs environment values; production state unknown.** Affects: All clients. Evidence: apps/web/lib/e2b/gate.ts:20-28. Work needed: Owner switch-on and live check.
- **Secret scanning before upload not found.** Affects: CLI. Evidence: code_push.rs:95-116 (no scan seen). Work needed: Confirm in session_handoff.rs and add if missing.
- Not built on: Web, Desktop, Mobile (from the capability ledger).

**Depends on**

- surface:cli
- surface:vscode
- mode:cloud
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-model-catalog-and-routing
- SYS-connectors-plugins-and-skills
- api:POST /api/code/sessions/handoff
- api:POST /api/code/sessions
- api:GET /api/github/repositories
- table:cloud_code_sessions

## Unknown

- Where the hand-off record is stored on the server and for how long.
- Whether the CLI scans the record for secrets (session_handoff.rs not opened).
- What plan names include AGI Code.
- Webview code for the Sessions sheet entry (webviewContent.ts) was not opened; cited from the brief.
- Whether the CLI wait limit actually cuts a long turn.
