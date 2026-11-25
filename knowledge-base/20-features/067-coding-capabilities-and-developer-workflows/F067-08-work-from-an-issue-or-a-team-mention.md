---
id: "F067-08"
type: "feature"
title: "Work from an issue or a team mention"
aliases: ["Work from issues or team mentions (S67.34)", "GitHub mention task", "@agi-workforce mention", "AGI Code from GitHub", "githubMentionTask", "runGitHubCodeTask"]
area: "67 Coding capabilities and developer workflows"
available_on: ["web"]
implementation: {web: "partial", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S67.34"]
depends_on: ["surface:web", "mode:cloud", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-connectors-plugins-and-skills", "SYS-authorization-and-workspaces", "SYS-agents-tools-and-automation", "SYS-model-catalog-and-routing", "api:POST /api/github/webhook", "table:github_installations", "F067-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F067-08 Work from an issue or a team mention

A collaborator writes a comment that mentions the AGI GitHub App on an issue or pull request. The webhook answers 'queued' at once. Later a managed Cloud coding session runs the task, replies on GitHub, and opens a pull request with the changes. GitHub only; it needs managed Code and a plan that includes it. Slack was not found.

Area: [67. Coding capabilities and developer workflows](README.md). Requirement items: [S67.34](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6734).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Starts a managed Cloud coding session from a GitHub issue or pull request comment that mentions the app, works in the repository, and posts the outcome and a pull request back to GitHub (apps/web/lib/services/cloud-code-github-task.ts:209-355).

**Why it exists.** The brief says work 'starts from an issue or a team mention (e.g. @agent on GitHub or Slack) and the agent does the coding task' (brief S67.34).

**Who uses it.** Repository collaborators (owner, member or collaborator class) on a repository where the AGI GitHub App is installed by an AGI account holder (apps/web/app/api/github/webhook/route.ts:51, 224-233).

**Problems it solves**

- Delegate a fix from where the team already talks, without opening the AGI app.
- Fix failing checks on a pull request: failed check output is read into the task (cloud-code-github-task.ts:262-273).
- Keep a trail: the session link and the result are replied on the thread.

**Use cases**

- Comment '@agi-workforce fix the null check in parser' on an issue; get a pull request linked to the issue.
- Comment on a pull request whose checks failed; the agent works on that pull request's branch.
- Comment with only the mention or a request starting with 'review' on a pull request; that goes to the review feature instead.

## 2. User experience

**Where to find it**

- GitHub: a comment on an issue or pull request in a repository with the AGI GitHub App (apps/web/app/api/github/webhook/route.ts:210-267).
- Web: the session link in the reply opens the Cloud code session page (apps/web/lib/services/cloud-code-github-task.ts:107-109).
- Desktop: the brief says partial but no code for it was found (doc: brief S67.34).
- Mobile, CLI, VS Code: missing (doc: brief S67.34).

**Before you start**

- The AGI GitHub App installed on the repository and the installation verified, with pull request review enabled for it (cloud-code-github-task.ts:191-206).
- A commenter whose standing is in the allowed set (route.ts:51, 224-233).
- The deployment has Managed Code and managed compute on (cloud-code-github-task.ts:221-224).
- The installing account has a plan that includes managed Code sessions (cloud-code-github-task.ts:236-239).
- The workspace code gate allows it (cloud-code-github-task.ts:227-235).

**Screens and controls**

- The GitHub comment box. The mention text is '@agi-workforce' (cloud-code-github-task.ts:44).
- Reply comments on GitHub: 'AGI Code is working on this. Follow along or step in here:' with a link; pause, stop, failed and done messages (cloud-code-github-task.ts:63-79).
- Web session page: approve or decline a paused step.

**Journey**

1. Write a comment mentioning @agi-workforce with the task, up to 1,000 characters (cloud-code-github-task.ts:57, 102-106).
2. GitHub sends a signed webhook; the app checks the signature (route.ts:71-79).
3. The app ignores bots and outsiders, then answers 'task: queued' (route.ts:210-267).
4. In the background the app checks the installation, switches, workspace gate and plan, then replies 'working on this' with the session link.
5. A Cloud session is created on the repository branch (pull request head, or default) and runs one turn with a 15 minute signal.
6. If it needs approval, the reply says it paused. If it stops early, the reply says why.
7. On success with changes, the app commits and pushes, opens a pull request, and replies with its number.

**What the person sees and gets**

- Immediate JSON {received:true, task:'queued'} to GitHub (route.ts:267).
- GitHub comments as listed above.
- A pull request, linking the issue number when the task came from an issue (cloud-code-github-task.ts:281-285, 341).

**Settings**

- The GitHub App installation setting that enables pull request review also gates this task (cloud-code-github-task.ts:206).
- Workspace policy for managed Code (organization-policy-code-gate).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mention parsing with a word-boundary regex, 1,000 character cap (cloud-code-github-task.ts:46-52, 102-106).
- Webhook: signature check, bot filter, author association filter, issue versus pull request, review routing, queued reply (apps/web/app/api/github/webhook/route.ts:71-79, 210-267).
- Task runner: installation check, switches, workspace gate, plan check, fork refusal, failed checks and issue context fenced as untrusted text, session creation, one turn, commit, push and pull request (cloud-code-github-task.ts:209-355).
- A repeated delivery is deduplicated (apps/web/app/api/github/webhook/delivery-dedup.ts; test delivery-dedup.test.ts).

**Incomplete**

- Only one agent turn runs, with a 15 minute abort signal (cloud-code-github-task.ts:56, 311); longer work ends with the 'still working' reply.
- Review feedback loops (reply to later comments) are not part of this task path [inferred; only one comment starts one session].

**Present but disconnected or switched off**

- When AGI_E2B_EXECUTION, E2B_API_KEY or the managed compute beta is off, the app replies 'AGI Code cannot take coding tasks from GitHub right now...' (cloud-code-github-task.ts:63-64, 221-224). The brief says to set the E2B switches and live-check (doc: brief S67.34 Unfinished).

**Not available**

- Slack or other team chat intake: searched apps/web/app/api/github and apps/web/lib/services/cloud-code-*.ts for slack and found none.
- Desktop, Mobile, CLI, VS Code: no code found (doc: brief S67.34).
- Work from a fork's pull request: refused with a reply (cloud-code-github-task.ts:260-263).

## 4. Required behaviour

**Established requirements**

- Work starts from an issue or team mention (GitHub or Slack) and the agent does the task. (source: brief S67.34)
- The webhook answers queued at once; the task runs after the response. (source: apps/web/app/api/github/webhook/route.ts:266-267)
- Outsiders cannot start a task: only commenters with an allowed association. (source: apps/web/app/api/github/webhook/route.ts:224-233)
- Issue and pull request text is untrusted data, never instructions. (source: apps/web/lib/services/cloud-code-github-task.ts:128-145)

**Acceptance criteria**

1. A signed webhook with a mention by a collaborator returns {received:true, task:'queued'} before the task finishes.
2. A comment by a bot or an outsider starts nothing.
3. With the E2B or managed compute switch off, the thread gets the 'cannot take coding tasks' reply.
4. With a plan lacking managed Code, the thread gets the 'no plan' reply.
5. A pull request from a fork gets the fork reply and no session.
6. On success with file changes, one commit is pushed and a pull request is opened with the final message.
7. A comment that begins 'review' on a pull request starts a review, not a task.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The same Cloud limits and metering apply as for a Web Cloud session, because it uses the same session service.
- [inferred] Local and own-key modes are not used here: the task runs in managed Cloud only.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Slack intake through the connectors system only if the owner wants it.
- [proposed] Let a person continue the session from a follow-up comment.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/github/webhook | `apps/web/app/api/github/webhook/route.ts` | Receives GitHub events, filters, routes a mention to review or task. |
| service | githubMentionTask | `apps/web/lib/services/cloud-code-github-task.ts` | Parses the mention text. |
| job | runGitHubCodeTask | `apps/web/lib/services/cloud-code-github-task.ts` | The background task run after the response. |
| job | scheduleCodeTask | `apps/web/app/api/github/webhook/route.ts` | Wraps the task with error logging; scheduled with after(). |
| service | webhook-router | `apps/web/app/api/github/webhook/webhook-router.ts` | Routes event types (installation, comment). |
| service | delivery-dedup | `apps/web/app/api/github/webhook/delivery-dedup.ts` | Claims a delivery id so retries do not repeat work. |
| service | pr-diff-prompt (buildIssueContextBlock, escapeUntrustedIssueText) | `apps/web/app/api/github/webhook/pr-diff-prompt.ts` | Builds the issue context and escapes it. |
| integration | github-app (installation token, issues, checks, comments) | `apps/web/lib/github-app.ts` | All GitHub calls. |
| table | github_installations | `apps/web/lib/services/cloud-code-github-task.ts` | Reads user_id, pr_review_enabled for a verified installation (line 197-203). |
| service | createCloudCodeSession, commitAndPushCloudCodeSession, openCloudCodeSessionPullRequest | `apps/web/lib/services/cloud-code-session-service.ts` | Session and git work. |
| service | runCloudCodeTurn | `apps/web/lib/services/cloud-code-turn-transport.ts` | Runs the turn and reports stop reason. |
| service | assertWorkspaceCodeAccess | `apps/web/lib/services/organization-policy-code-gate.ts` | Workspace policy check. |
| config | e2bProvisioningReady / managed compute beta | `apps/web/lib/e2b/gate.ts` | Switches that decide whether tasks can run. |
| config | planIncludesAgiCode | `packages/contracts/types/src/billing-catalog.ts` | Plan check (line 839). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A person comments on GitHub. | outside service | apps/web/app/api/github/webhook/route.ts:210-213 |
| GitHub posts a signed webhook; AGI verifies the signature, filters, claims the delivery and returns 'queued'. | our servers | route.ts:71-79, 262-267 |
| After the response, the task reads the installation, checks switches, workspace gate and plan. | our servers | cloud-code-github-task.ts:209-239 |
| The task reads the issue or pull request and its failed checks from GitHub. | outside service | cloud-code-github-task.ts:249-283 |
| A managed sandbox session is created and one agent turn runs with the model chosen for the plan. | our servers | cloud-code-github-task.ts:287-312 |
| Changes are committed and pushed from the sandbox; a pull request is opened and a reply is posted. | our servers | cloud-code-github-task.ts:322-346 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cloud code session, turn, steps | table:cloud_code_sessions and cloud_code_agent_turns/cloud_code_agent_steps | Server only; visible on the Web session page | not established (unknown) |
| Task text, issue text, check output | Inside the session goal and transcript | Server only | unknown |
| Webhook delivery id | delivery dedup store (table not identified) | Server only | unknown |

**Models and providers.** The model is picked by resolveCloudCodeAgentModel for the plan tier, so the task runs on a managed model chosen by AGI. Model-may-train refusals are surfaced (cloud-code-github-task.ts:86-93, CloudCodeModelMayTrainError). No own-key or local model path exists here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The GitHub App installation must be linked to an AGI account (user_id on github_installations). The commenter needs no AGI account. |
| Permissions | Commenter association must be in REVIEW_TRIGGER_ASSOCIATIONS (route.ts:51, 224-233). The GitHub App needs write access to open the pull request. |
| Subscription | The installing account's plan must satisfy planIncludesAgiCode (cloud-code-github-task.ts:236). Managed compute access evaluation for surface 'code' is used by the Web routes; for this task the plan check and workspace gate are the checks read. |
| Limits and metering | Task text 1,000 chars; description 2,500; check block 3,200; turn signal 15 minutes (cloud-code-github-task.ts:53-60). Managed usage metering of this turn: not established (unknown). |
| Feature flags | AGI_E2B_EXECUTION, E2B_API_KEY, managed compute private beta (cloud-code-github-task.ts:221). |
| Model compatibility | Managed model chosen by AGI; the person cannot select one in the code read. |
| Provider restrictions | GitHub only. none found in the code for Slack. |
| Local mode | Not available: the task always runs in managed Cloud (cloud-code-github-task.ts:287-312). Nothing runs on the person's device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Mention by outsider or bot | Ignored with 200 received. | route.ts:217-233 |
| Plain mention or 'review...' on a pull request | Goes to the review path. | route.ts:238-262; cloud-code-github-task.ts:48-49, 110-112 |
| Plain mention on an issue | Ignored (no task). | route.ts:241-243 |
| Switches off | Replies unavailable. | cloud-code-github-task.ts:221-224 |
| Workspace gate refuses | Replies with the gate reason. | cloud-code-github-task.ts:227-235 |
| No plan | Replies 'no plan'. | cloud-code-github-task.ts:236-239 |
| Fork pull request | Replies the fork message. | cloud-code-github-task.ts:260-263 |
| Approval needed | Replies 'paused for your approval' with link. | cloud-code-github-task.ts:314-317 |
| Stopped early | Replies with the stop reason. | cloud-code-github-task.ts:318-323 |
| No file changes | Replies final message or 'finished without changing any files'. | cloud-code-github-task.ts:325-331 |
| Turn still running at the signal | Replies 'still working'. | cloud-code-github-task.ts:348-352 |
| Webhook failure | Returns 500 with Retry-After and releases the delivery claim for installation deletion errors. | route.ts:195-201 |
| Offline / retry by the person | not handled in the code beyond GitHub redelivery and dedup. | searched apps/web/lib/services/cloud-code-github-task.ts and the webhook route; no person-side retry |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- apps/web/app/api/github/webhook/__tests__/github-events.test.ts (not found) (not found): GitHub event handling in the webhook folder (file named; contents not read).
- `apps/web/app/api/github/webhook/webhook-router.test.ts`: Event routing.
- `apps/web/app/api/github/webhook/delivery-dedup.test.ts`: Delivery de-duplication.
- `apps/web/app/api/github/webhook/pr-diff-prompt.test.ts`: Prompt building and escaping.

**Test scenarios**

- **Collaborator mention**
  1. Install the App on a test repository with switches on.
  2. Comment '@agi-workforce add a unit test for X' on an issue.
  - Expected: Immediate queued webhook response; a 'working on this' comment; later a pull request comment.
- **Outsider mention**
  1. Comment the mention from an account with no repository standing.
  - Expected: No reply and no session.
- **Switch off**
  1. Turn off the E2B switch.
  2. Comment a task.
  - Expected: The 'cannot take coding tasks' reply.
- **Fork pull request**
  1. Mention on a pull request from a fork.
  - Expected: Fork reply; no session.
- **Failing checks**
  1. Mention on a pull request with a failing check.
  - Expected: Session goal contains the fenced check output; fix pushed to the head branch.

**Where to look when it fails**

- Log lines '[code-task] installation unreadable; task skipped', '[code-task] could not reply on GitHub', '[code-task] GitHub coding task failed' (cloud-code-github-task.ts:200, 222, 354).
- 'GitHub webhook: ignoring a review mention from outside the repository' (route.ts:229).
- table:github_installations and table:cloud_code_sessions.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md)

## 10. Gaps and dependencies

- **No Slack intake** Affects: All apps. Evidence: No slack match under apps/web/app/api/github or cloud-code services; brief names Slack. Work needed: Decide whether Slack is wanted; build via connectors.
- **Desktop, Mobile, CLI, VS Code have no issue or mention intake** Affects: those apps. Evidence: brief S67.34 statuses. Work needed: Define what intake means on each, or mark not applicable.
- **No test found for runGitHubCodeTask** Affects: Web. Evidence: search of apps/web for runGitHubCodeTask in tests found none. Work needed: Add unit tests for gates, fork, approval and success paths.
- **Needs Cloud switches that are off until live-checked** Affects: Web. Evidence: brief S67.34 Unfinished; gate.ts:19-30. Work needed: Set the switches and live-check.
- **Mention name '@agi-workforce' is a literal in the service rather than a product-name registry value** Affects: Naming consistency. Evidence: cloud-code-github-task.ts:44; AGENTS.md section 4 says product names come from product-names.ts. Work needed: [proposed] Check the registry and move the literal.
- Not built on: Desktop, Mobile, CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- mode:cloud
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-connectors-plugins-and-skills
- SYS-authorization-and-workspaces
- SYS-agents-tools-and-automation
- SYS-model-catalog-and-routing
- api:POST /api/github/webhook
- table:github_installations
- F067-07

## Unknown

- What the Desktop 'partial' in the brief refers to; no code found.
- Metering and quota treatment of a GitHub-started turn.
- Retention of the session and the task text.
- Whether the brief's status for Web (partial) reflects the switch only.
- Which table backs webhook delivery dedup.
- Contents of github-events.test.ts (not read).
