---
id: "F067-05"
type: "feature"
title: "Review code changes, pull requests and security"
aliases: ["Code review and security", "Review code changes (S67.20)", "Review pull requests (S67.21)", "Scan for security problems (S67.22)", "Explain findings (S67.23)", "Respond to review feedback (S67.32)", "Investigate CI failures (S67.33)", "agi review", "/security-review", "/pr-comments", "/autofix-pr", "AGI Code Review"]
area: "67 Coding capabilities and developer workflows"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S67.20", "S67.21", "S67.22", "S67.23", "S67.32", "S67.33"]
depends_on: ["surface:cli", "surface:web", "surface:vscode", "surface:desktop", "surface:mobile", "mode:local", "mode:own-key", "mode:cloud", "F067-02", "F067-06", "SYS-agents-tools-and-automation", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "table:github_pr_review_attempts", "table:github_installations", "api:POST /api/github/webhook", "file:apps/cli/src/review.rs", "plan:basic"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F067-05 Review code changes, pull requests and security

The agent reviews the current changes or a pull request and lists findings with file and line, scans for security problems, reads pull request comments and fixes them, and looks into failed checks. Each app does part of this: the CLI most, the Web GitHub app reviews pull requests on its own, VS Code and Desktop use prompts.

Area: [67. Coding capabilities and developer workflows](README.md). Requirement items: [S67.20](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6720), [S67.21](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6721), [S67.22](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6722), [S67.23](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6723), [S67.32](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6732), [S67.33](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6733).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives review help at several points. The CLI reviews a diff, a commit, a branch comparison or a hosted pull request and can post the review. The Web GitHub app reviews pull requests when opened or when mentioned. The CLI can fetch pull request feedback and failing checks for the agent. VS Code and the CLI have security review prompts.

**Why it exists.** Review catches defects before merge. Founder decisions record that the CLI, VS Code and cloud Code review pull requests (doc: docs/decisions/2026-09-27-founder-decisions.md:381-382).

**Who uses it.** Developers and reviewers; repository owners who install the GitHub app.

**Problems it solves**

- Slow first-pass review.
- Missing review comments in large changes.
- Forgetting to address every comment or failing check.

**Use cases**

- Run agi review before committing.
- Mention the app on a pull request to get a review.
- Run /autofix-pr on the branch to address comments.
- Run a security review of pending changes in VS Code.

## 2. User experience

**Where to find it**

- CLI: 'agi review' with --base, --commit, --pr, --post, a prompt and --model (apps/cli/src/lib.rs:782-797); slash commands /security-review, /pr-comments, /autofix-pr, /ultrareview (apps/cli/src/claude_parity.rs:301-314).
- Web: GitHub app comments on pull requests; the install link on the Code page (apps/web/features/code/code-surface.ts:30-31).
- Desktop: the 'Review code' button in the changes panel (apps/web/features/code/components/LocalChangesPanel.tsx:259) and per-turn review pane 'Review changes' (apps/web/features/code/local-code.ts:1519).
- VS Code: 'Code: Review a Pull Request' and 'Code: Security Review of Pending Changes' (apps/extension-vscode/package.json:572, 577).
- Mobile: read findings in a Desktop session view; mobile pull request review is missing in the brief (doc: knowledge-base/data/area-briefs/067-coding-capabilities-and-developer-workflows.md S67.21).

**Before you start**

- CLI pull request review needs the GitHub CLI installed and signed in (apps/cli/src/review.rs:154-157).
- Web review needs the GitHub app installed, ownership verified, and pr_review_enabled for the installation (apps/web/app/api/github/webhook/route.ts:322-336).
- Web tasks need a plan that includes AGI Code (apps/web/lib/services/cloud-code-github-task.ts:236).

**Screens and controls**

- CLI review flags --base, --commit, --pr, --post (apps/cli/src/lib.rs:782-797).
- Desktop 'Review code' button is disabled while a turn runs (apps/web/features/code/components/LocalChangesPanel.test.tsx:183).
- Review pane comment box 'What should change here?', 'Add comment', 'Send to the agent', 'Discard comments' (apps/web/features/code/local-code.ts:1540-1546).

**Journey**

1. CLI: run agi review; the diff is gathered with hardened git, sent as one turn, and the result printed; with --pr --post it is posted as a pull request comment.
2. Web: open or update a pull request on an installed repository, or comment with the app mention; the review arrives as a pull request review with line comments.
3. CLI feedback: run /pr-comments to list unresolved threads; /autofix-pr to change code, which must be on the pull request branch.
4. VS Code: run the command, enter a number or branch, read the answer in chat.

**What the person sees and gets**

- Review output: overall explanation, severity clean, minor, major or critical, issues with file, line, description, suggestion (apps/cli/src/review.rs:21-36).
- If the diff is over 100,000 bytes only the start is reviewed and the output says the review is partial (apps/cli/src/review.rs:113-136).
- 'No changes to review.' when the diff is empty (apps/cli/src/review.rs:48-50).
- Feedback fetch says what was not read instead of claiming an empty result (apps/cli/src/pr_feedback.rs:365-380).
- Web comments: reply texts for quota reached, binary diff, no diff, prompt-injection skip (apps/web/app/api/github/webhook/route.ts:396-400, 506-540).

**Settings**

- review_model in CLI config (apps/cli/src/review.rs:60-63).
- Installation review model and enabled flag (apps/web/app/api/github/webhook/route.ts:322-336).
- Env GITHUB_PR_REVIEW_MONTHLY_CAP, default 100 (apps/web/app/api/github/webhook/route.ts:59-61).
- Product requirements list 'Autofix pull request' and 'Create pull request automatically' (doc: docs/product/requirements.md:1384-1385).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI review gathers staged, unstaged and untracked diffs, a commit, a base comparison, or reads a pull request with gh; revisions starting with a dash are refused; git runs with diff drivers off (apps/cli/src/review.rs:225-283).
- CLI review shortens a large diff and says so, and sensitive untracked files are named but not sent (apps/cli/src/review.rs:113-136, 286-300).
- CLI post_review posts with gh pr review --comment (apps/cli/src/review.rs:174-186).
- CLI feedback fetch pages through review threads, reviews and comments (up to 20 pages) and checks, reports unread parts, and fences the text as untrusted (apps/cli/src/pr_feedback.rs:7-9, 212-300, 380-440).
- /autofix-pr refuses when the checkout is on another branch (apps/cli/src/pr_feedback.rs:344-362).
- Failing checks are fetched with gh pr checks and included in the feedback prompt, so the CLI can look at failed CI (apps/cli/src/pr_feedback.rs:284-300, 391-396). The brief says CLI CI investigation is missing; this is a partial counter-finding: it lists failing check names and links but no log reading was found.
- Web webhook verifies the signature, drops duplicates, ignores bots, and only lets owner, member and collaborator mentions start a review (apps/web/app/api/github/webhook/route.ts:228-236, 51-55).
- Web reviews on opened, reopened, synchronize and ready_for_review, never on drafts (apps/web/app/api/github/webhook/route.ts:276-281, 296-304).
- Web review has a 5 minute debounce and a rolling 30 day cap per installation, and skips when a prompt-injection pattern is found (apps/web/app/api/github/webhook/route.ts:57-61, 356-420, 528-540).
- Web review runs a correctness and a security pass over each chunk and drops findings that name lines the diff lacks (apps/web/app/api/github/webhook/__tests__/automated-review.test.ts:107-115).
- Web: a mention on a pull request with a coding task runs a cloud session whose goal includes failed checks (apps/web/lib/services/cloud-code-github-task.ts:264-285; apps/web/lib/github-app.ts:1287).
- VS Code security and pull request review prompts that read git and say not to edit files (apps/extension-vscode/src/features/editor-utilities/editorUtilities.ts:171-192).

**Incomplete**

- Desktop and Mobile have no dedicated review engine found; they ask the session agent (apps/web/features/code/components/LocalChangesPanel.tsx:259). The brief's code references for security scanning in apps/cli/src/app_server/surfaces.rs:1116 and developer_host.rs:890 did not show scanning code where I opened them; unknown.
- Web review of review comments (respond to feedback): a mention task does not read earlier review comments; its context is the pull request body and failed checks (apps/web/lib/services/cloud-code-github-task.ts:140-170).
- CI investigation reads failed check output, annotations and a log tail on Web (apps/web/lib/services/cloud-code-github-task.ts:98-120) but needs the sandbox switch.

**Present but disconnected or switched off**

- Web review and tasks are skipped unless the managed-compute private beta gate is on and, for tasks, the sandbox is ready (apps/web/app/api/github/webhook/route.ts:477-483; apps/web/lib/services/cloud-code-github-task.ts:221).

**Not available**

- Mobile pull request review (brief: missing).
- Respond to feedback on Desktop, Web, Mobile, VS Code (brief); a general session can still be asked by prompt [inferred].

## 4. Required behaviour

**Established requirements**

- The agent reviews current changes and reports issues with file and line references. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.20)
- The agent reviews a pull request by fetching its diff and posts or shows findings. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.21)
- The agent scans for security problems and reports them; explains each finding in plain language with its location. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.22, S67.23)
- The agent reads review comments on a pull request and changes code to address them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.32)
- The agent investigates a failed CI run: reads logs, finds the cause, proposes a fix. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.33)
- The CLI, VS Code and cloud Code review pull requests. (source: (doc: docs/decisions/2026-09-27-founder-decisions.md:381-382))

**Acceptance criteria**

1. agi review on a dirty folder lists issues with file and line, or says 'No changes to review.'
2. A diff above 100,000 bytes yields a review that says it is partial.
3. agi review --pr N --post adds a comment to the pull request.
4. A failing gh call shows an error, not an empty list.
5. A mention from a non-member does not start a review.
6. Opening a draft pull request starts no review; marking it ready does.
7. /autofix-pr on the wrong branch refuses and names the branch to check out.
8. A review of a diff holding prompt-injection phrases is skipped with a comment.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Findings should be plain language; the review prompt asks for explanation fields but quality depends on the model. [inferred]
- Security scan results should carry the same file and line format. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Read CI job logs in the CLI, not just check names.
- [proposed] Include earlier review comments in the Web mention task so it can respond to feedback.
- [proposed] Add a Desktop review button that uses the same review engine as the CLI.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | run_review | `apps/cli/src/review.rs` | Gather diff, ask the model once, parse, print and post a review. |
| command | Review subcommand | `apps/cli/src/lib.rs` | agi review flags and wiring (lines 782, 6497). |
| service | pr_feedback | `apps/cli/src/pr_feedback.rs` | Fetch review threads, reviews, comments and failing checks; build the prompt. |
| command | parity slash commands | `apps/cli/src/claude_parity.rs` | /security-review, /pr-comments, /autofix-pr, /ultrareview (lines 301-314, 1964). |
| endpoint | POST /api/github/webhook | `apps/web/app/api/github/webhook/route.ts` | GitHub events: reviews, mentions, installation removal. |
| service | webhook-router | `apps/web/app/api/github/webhook/webhook-router.ts` | Classifies GitHub events into review, automation or ignored. |
| service | delivery-dedup | `apps/web/app/api/github/webhook/delivery-dedup.ts` | Records each delivery once. |
| service | pr-diff-prompt | `apps/web/app/api/github/webhook/pr-diff-prompt.ts` | Escapes untrusted diff and issue text. |
| service | review pipeline | `apps/web/lib/code-review/pipeline.ts` | Chunks the diff, runs correctness and security passes, filters findings, bills the owner. |
| service | cloud-code-github-task | `apps/web/lib/services/cloud-code-github-task.ts` | Turns a mention into a cloud coding task with failed checks in the goal. |
| service | github-app | `apps/web/lib/github-app.ts` | Installation tokens, snapshot, post review, failed checks. |
| table | github_pr_review_attempts | `apps/web/app/api/github/webhook/route.ts` | One row per review attempt: pending, completed, failed, skipped (lines 356-420). |
| table | github_installations | `apps/web/app/api/github/webhook/route.ts` | Installation owner, pr_review_enabled, review_model (line 322 query). |
| service | organization-policy-code-gate | `apps/web/lib/services/organization-policy-code-gate.ts` | assertWorkspaceCodeAccess for review and cloud sessions. |
| component | LocalChangesPanel Review code | `apps/web/features/code/components/LocalChangesPanel.tsx` | Button that asks the session for one review turn. |
| component | LocalReviewPane | `apps/web/features/code/components/LocalReviewPane.tsx` | Per-turn review with line comments sent to the agent. |
| command | VS Code review commands | `apps/extension-vscode/src/extension.ts` | Registers reviewPullRequest and securityReview (lines 292, 302). |
| service | editorUtilities prompts | `apps/extension-vscode/src/features/editor-utilities/editorUtilities.ts` | Builds review and security prompts (lines 171, 187). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI reads the diff with hardened host git, or asks gh for a pull request diff. | device | apps/cli/src/review.rs:225-283 |
| The diff, cut to 100,000 bytes, goes to the configured review model in one turn. | outside service | apps/cli/src/review.rs:60-84, 113 |
| The CLI prints the findings; with --post it sends them to GitHub through gh. | outside service | apps/cli/src/review.rs:92-100, 174-186 |
| GitHub sends a webhook; our server verifies the signature, dedups, applies the author check, rate and quota checks, and mints an installation token. | our servers | apps/web/app/api/github/webhook/route.ts:69-96, 228-236, 356-420 |
| The server fetches the diff, screens it for prompt injection, resolves the owner's plan and runs the review pipeline with the owner billed. | our servers | apps/web/app/api/github/webhook/route.ts:489-570 |
| The review is posted back to the pull request as a review with line comments, unless nothing new was found. | outside service | apps/web/app/api/github/webhook/route.ts:590-610 |
| For a coding mention, a cloud session runs a turn in the sandbox, commits, pushes and opens a pull request. | our servers | apps/web/lib/services/cloud-code-github-task.ts:288-345 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Review attempts | table github_pr_review_attempts on our database (apps/web/app/api/github/webhook/route.ts:356-420). | Server only. | Deleted when the installation is removed (apps/web/app/api/github/webhook/route.ts:193-197). |
| Webhook delivery ids | Delivery dedup record (apps/web/app/api/github/webhook/delivery-dedup.ts). | Server only. | Released on processing failure so GitHub can retry (apps/web/app/api/github/webhook/route.ts:181-190). |
| CLI review result | Printed to the terminal; posted to GitHub if asked. | No. | Not stored by the review command; session history unknown. |

**Models and providers.** CLI: model from --model, review_model or default; provider from CLI selection, so it can be on-device, own key or managed (apps/cli/src/review.rs:60-72). Web: model preference from the installation and plan tier, billed to the installing account (apps/web/app/api/github/webhook/route.ts:553-566).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI: none needed for an on-device model and a local diff [inferred]; gh needs GitHub sign-in for pull requests. Web: a verified installing account. |
| Permissions | Web: only owner, member, collaborator may mention (apps/web/app/api/github/webhook/route.ts:51-55); organisation code policy gate (apps/web/app/api/github/webhook/route.ts:462-470). CLI: workspace policy and approvals for tools. |
| Subscription | Web review: managed compute private beta gate and organisation policy, usage budget message 'The installing account's usage budget cannot cover a review right now' (apps/web/app/api/github/webhook/route.ts:477-483, 577-587). Web coding mention: plan:basic and above include AGI Code; plan:free, plan:byok, plan:local-only do not (packages/contracts/types/src/billing-catalog.ts:839; 594, 611, 628). CLI cloud models: developer_surfaces plans (packages/contracts/types/src/billing-catalog.ts:359). |
| Limits and metering | Per installation 100 reviews per rolling 30 days unless GITHUB_PR_REVIEW_MONTHLY_CAP is set; 5 minute debounce per pull request (apps/web/app/api/github/webhook/route.ts:57-61). CLI diff cap 100,000 bytes; feedback cap 40,000 characters and 20 pages (apps/cli/src/pr_feedback.rs:7-9). Tokens used are recorded on the attempt row (apps/web/app/api/github/webhook/route.ts:630-640). |
| Feature flags | Managed-compute private beta gate (apps/web/lib/e2b/gate.ts:34-36); sandbox switch for tasks (apps/web/lib/e2b/gate.ts:20-30); GITHUB_BOT_LOGIN name (apps/web/app/api/github/webhook/route.ts:48). |
| Model compatibility | Review answers must follow a JSON shape; prose answers are reported as unreadable (apps/web/app/api/github/webhook/__tests__/automated-review.test.ts:123). |
| Provider restrictions | Web review uses managed compute only; own-key is not used on that path [inferred from the managed-compute gate]. |
| Local mode | agi review with an on-device model and a local diff works with no plan and no network [inferred]; the pull request path needs gh and therefore GitHub. Whether Local privacy mode blocks gh was not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty diff | 'No changes to review.' | apps/cli/src/review.rs:48-50 |
| Diff too large | Partial review notice printed and added to the explanation. | apps/cli/src/review.rs:78-90, 132-138 |
| gh missing | 'Reviewing a pull request needs the GitHub CLI...' | apps/cli/src/review.rs:154-157 |
| Git read fails | An error, not an empty diff. | apps/cli/src/review.rs:521 (test name) |
| Feedback partly unread | Prompt says what was not read. | apps/cli/src/pr_feedback.rs:365-380, 586 |
| Pull request missing | An error, not an empty list. | apps/cli/src/pr_feedback.rs:521 |
| Mention from outside the repository | Ignored silently, logged. | apps/web/app/api/github/webhook/route.ts:228-236 |
| Fork branch | Task refused: branch lives in a fork. | apps/web/lib/services/cloud-code-github-task.ts:258-262 |
| Binary or empty diff on mention | Comment explains. | apps/web/app/api/github/webhook/route.ts:500-520 |
| Newer push during review | Review notes the moved head and runs once more. | apps/web/app/api/github/webhook/route.ts:590-600, 645-650 |
| Approval needed in a task | Reply links the session to approve. | apps/web/lib/services/cloud-code-github-task.ts:296-300 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/review.rs`: In-file tests: option-like revisions refused, failed git read is an error, partial diff notice, escapes stripped, untracked file reviewed as addition, untracked link not followed.
- `apps/cli/src/pr_feedback.rs`: In-file tests: comment cannot close the fence, paging by cursor, endless connection incomplete, missing pull request is an error, thread reply count, only missing checks treated as no checks, empty result never claims exhaustive, prompt states what was not read, inspect versus fix wording.
- `apps/web/app/api/github/webhook/__tests__/automated-review.test.ts`: Which pull request actions trigger review; line anchoring; duplicate suppression; correctness and security passes; honest summaries.
- `apps/web/app/api/github/webhook/__tests__/review-custody.test.ts`: Review custody (titles not read).
- `apps/web/app/api/github/webhook/delivery-dedup.test.ts`: Delivery dedup (titles not read).
- `apps/web/app/api/github/webhook/webhook-router.test.ts`: Event routing (titles not read).
- `apps/web/lib/code-review/__tests__/diff-and-findings.test.ts`: Diff line numbering, binary files, chunk ceiling, hunk splitting, schema check.
- `apps/web/__tests__/security/web-high-3-github-spend-cap.test.ts`: GitHub review spend cap (titles not read).
- `apps/web/features/code/components/LocalChangesPanel.test.tsx`: Review code asks one review turn, waits while a turn runs, hidden when nothing changed.
- `apps/web/features/code/local-review.test.ts`: Local review helpers (titles not read).

**Test scenarios**

- **CLI local review**
  1. Edit a file in a git folder.
  2. Run agi review.
  - Expected: Findings with file and line, or no issues; nothing is posted.
- **Large diff**
  1. Create a diff over 100,000 bytes.
  2. Run agi review.
  - Expected: Partial review warning on screen and in the explanation.
- **Post to pull request**
  1. Run agi review --pr N --post with gh signed in.
  - Expected: A comment review appears on the pull request.
- **Feedback fix**
  1. Check out the pull request branch.
  2. Run /autofix-pr.
  - Expected: Agent addresses unresolved comments and failing checks; says what was not read.
- **Webhook outsider**
  1. Comment the app mention from an account with no repository standing.
  - Expected: No review; log says ignored.
- **Draft pull request**
  1. Open a draft pull request on an installed repository.
  - Expected: No review until ready for review.

**Where to look when it fails**

- Table github_pr_review_attempts statuses: pending, completed, failed, skipped_debounce, skipped_quota (apps/web/app/api/github/webhook/route.ts:356-420).
- Log lines: 'Monthly review quota reached', 'GitHub webhook: ignoring a review mention from outside the repository', 'RT-03 / WEB-17: blocking LLM review' (apps/web/app/api/github/webhook/route.ts:228, 400, 530).
- Task reply copy in TASK_COPY (apps/web/lib/services/cloud-code-github-task.ts:60-76).
- Nothing was run; no result recorded.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md)
- Desktop: [70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md)
- Mobile: [70-qa/test-plans/mobile/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/mobile/067-coding-capabilities-and-developer-workflows.md)
- CLI: [70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md)
- VS Code: [70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md)

## 10. Gaps and dependencies

- **CI investigation reads only check names and links in the CLI, and no log reading was found there.** Affects: CLI users.. Evidence: apps/cli/src/pr_feedback.rs:284-300. Work needed: Fetch failed job logs and add a test.
- **Respond to review feedback exists only in the CLI; Web mention tasks do not read earlier review comments.** Affects: Web, Desktop, Mobile, VS Code.. Evidence: apps/web/lib/services/cloud-code-github-task.ts:140-170; brief S67.32. Work needed: Add the feedback reader to the Web task goal; add UI entry points.
- **Web PR review and tasks depend on private beta and sandbox switches whose production state is unknown.** Affects: Web users with the GitHub app.. Evidence: apps/web/app/api/github/webhook/route.ts:477-483; apps/web/lib/e2b/gate.ts:20-30. Work needed: Owner switch-on and live check.
- **Desktop and Mobile have no dedicated review command; the brief's cited security scan lines were not confirmed.** Affects: Desktop, Mobile.. Evidence: apps/web/features/code/components/LocalChangesPanel.tsx:259 only asks the session; apps/cli/src/app_server/developer_host.rs:880-900 is session loading. Work needed: Locate or build the scan path and add tests.
- **Requirement 'file and line for every finding' is enforced only on the Web path, which drops unanchored findings.** Affects: CLI, VS Code.. Evidence: apps/web/app/api/github/webhook/__tests__/automated-review.test.ts:107; apps/cli/src/review.rs:21-36 allows a missing line. Work needed: Decide if the CLI must require a line.

**Depends on**

- surface:cli
- surface:web
- surface:vscode
- surface:desktop
- surface:mobile
- mode:local
- mode:own-key
- mode:cloud
- F067-02
- F067-06
- SYS-agents-tools-and-automation
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- table:github_pr_review_attempts
- table:github_installations
- api:POST /api/github/webhook
- file:apps/cli/src/review.rs
- plan:basic

## Unknown

- Whether Local privacy mode in the CLI blocks the gh calls.
- Where Desktop and Mobile security scanning lives, if anywhere.
- Whether the CLI review model default is on-device when none is configured.
- Text of the VS Code review output format beyond the prompt.
- Production state of the private beta and sandbox switches.
- How the installation row's pr_review_enabled is set from the Connectors settings (brief cites useConnectorsSettingsAdapter.tsx:626, not opened).
