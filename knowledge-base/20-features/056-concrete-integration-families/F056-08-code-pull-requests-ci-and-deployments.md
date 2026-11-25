---
id: "F056-08"
type: "feature"
title: "Code, pull requests, CI and deployments"
aliases: ["Code, pull requests, CI and deployments", "S56.31 Repository search", "S56.32 Pull-request workflows", "S56.33 CI status and logs", "S56.39 Deployment management", "GitHub connector", "github-mcp", "GitHub App adapter"]
area: "56 Concrete integration families"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S56.31", "S56.32", "S56.33", "S56.39"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-chat-turn-pipeline", "mode:cloud", "mode:local", "mode:own-key", "surface:cli", "surface:vscode", "surface:web", "surface:mobile", "surface:chrome", "surface:desktop", "file:packages/contracts/types/src/connector-release.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F056-08 Code, pull requests, CI and deployments

Lets the assistant search code, read and review pull requests, report CI status and view or start deployments. It works two ways: through hosted connectors in a Cloud turn (GitHub App adapter, pinned GitHub MCP server, Vercel MCP server, all unreleased today), and through the local GitHub CLI on the coding apps (CLI review command, VS Code review and create commands).

Area: [56. Concrete integration families](README.md). Requirement items: [S56.31](../../10-requirements/capabilities/056-concrete-integration-families.md#s5631), [S56.32](../../10-requirements/capabilities/056-concrete-integration-families.md#s5632), [S56.33](../../10-requirements/capabilities/056-concrete-integration-families.md#s5633), [S56.39](../../10-requirements/capabilities/056-concrete-integration-families.md#s5639).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** On hosted surfaces the assistant fetches a pull request diff, posts an issue comment or a pull request review through a GitHub App installation, and can use the pinned GitHub MCP server and Vercel MCP server for search, status, logs and deploys. On the coding apps, the CLI reviews a pull request with the local gh tool, reads review threads and failing checks, and VS Code starts a review prompt or opens a pull request.

**Why it exists.** Developers want review help, build status and deploy control inside the assistant, as Claude and ChatGPT offer (doc: docs/decisions/2026-09-27-founder-decisions.md, D-2026-09-28-08).

**Who uses it.** Developers on a paid managed plan for hosted connectors; any CLI or VS Code user who has the GitHub CLI installed and signed in for the local path.

**Problems it solves**

- Reading a long diff and writing review notes by hand.
- Finding out why a build failed without opening the CI site.
- Checking or starting a deployment from chat.

**Use cases**

- Run `agi review --pr 128 --post` to review a pull request and post the result.
- In the CLI use /pr-comments to read review threads and failing checks, or /autofix-pr to fix them.
- In VS Code run 'Code: Review a Pull Request' with a number or branch.
- In a Cloud chat, ask the assistant to read a pull request diff or comment on an issue after approving.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web): Connectors page and settings; GitHub connects through a GitHub App install flow, not a directory toggle (apps/web/app/api/connectors/route.ts:599-620).
- Mobile: Settings, Connectors; unreleased rows read 'Coming soon' (apps/mobile/src/features/settings/cloud-connectors/index.tsx:162).
- CLI: `agi review --pr <number, URL or branch> [--post]` (apps/cli/src/lib.rs:781-795); slash commands /review, /pr-comments, /autofix-pr (apps/cli/src/claude_parity.rs:137,303).
- VS Code: commands 'Code: Review a Pull Request' (extension.ts:292) and 'Code: Create Pull Request' (apps/extension-vscode/package.json:262-263, :572-573).
- Chrome: shows approval cards and results of a Cloud turn only (apps/extension/src/features/side-panel/bubbles.ts:1129-1143).

**Before you start**

- Hosted path: paid managed plan, the connector released, the GitHub App configured by the operator and installed by the person.
- CLI and VS Code local path: the GitHub CLI (gh) installed and signed in; the CLI says so when it is missing (apps/cli/src/review.rs:153-157).
- For deployments: a Vercel account connected through OAuth; Vercel's client needs vendor approval (doc: docs/runbooks/connector-oauth-apps.md, vendor list).

**Screens and controls**

- CLI flag --post: posts the review as a pull request comment (apps/cli/src/lib.rs:790-792).
- VS Code modal confirm before pushing or opening a pull request; title and base-branch prompts (apps/extension-vscode/src/features/surfaces/pullRequest.ts:14-100).
- Approval card for hosted tools; post_issue_comment and post_pull_request_review are critical and ask every time (tool-metadata.ts:669-700; connector-tool-permissions.ts:43-52).

**Journey**

1. Hosted: connect GitHub (install the GitHub App), start a chat, ask about a pull request.
2. The assistant calls get_pull_request_diff (read) and answers; for a comment or review it pauses on an approval card.
3. CLI: run `agi review --pr N`; the CLI reads the diff through gh, the model writes a review, and --post sends it with gh pr review --comment.
4. CLI: /pr-comments collects threads, reviews, comments and failing checks and builds a prompt (apps/cli/src/pr_feedback.rs:212-300).
5. VS Code: run the command, type a number or branch, and the editor utility chat runs the review prompt.

**What the person sees and gets**

- Diff and review text in chat; the diff reaches the model fenced as untrusted (user-connector-tools.ts:243-253).
- CLI prints the review and, with --post, posts it; errors say 'gh <cmd> failed: ...' (review.rs:166-170).
- VS Code shows 'created' or 'finish on GitHub' toasts with a View button (pullRequest.ts:46-55).

**Settings**

- Per-tool permissions (Tool Permissions panel).
- Account tool-approval default.
- CLI trust mode Local, own key or Cloud; connectors need Cloud.
- GitHub App installation list (apps/web/app/api/github/installations/route.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GitHub App adapter with three tools: get_pull_request_diff (read), post_issue_comment and post_pull_request_review (external send, irreversible, at most once) (apps/web/lib/user-connector-tools.ts:299-345; tool-metadata.ts:669-700).
- Installation and repository ownership checks and PR review code exist (apps/web/lib/github-app.ts; github-app.pr-review.test.ts).
- CLI `agi review --pr` and --post run through local gh; /pr-comments and /autofix-pr read threads, reviews and failing checks through gh (apps/cli/src/review.rs:141-170; apps/cli/src/pr_feedback.rs:62-72, :212-300).
- CLI repository search of the local checkout: search and grep tools with a credential-file filter (apps/cli/src/features/exec/tools/dir_ops/mod.rs:66-100).
- VS Code review prompt and pull request creation with a modal confirm (apps/extension-vscode/src/extension.ts:292-300; features/surfaces/pullRequest.ts).
- Vercel MCP directory entry names list_deployments, get_deployment, get_deployment_build_logs, get_runtime_logs and deploy_to_vercel (first-party.json, vercel entry).

**Incomplete**

- Hosted repository search and CI status/logs are not tools of the GitHub App adapter; they would come from the pinned github-mcp server (first-party.json, github-mcp entry, tools discovered at runtime) after the owner creates the GitHub App with Actions read (brief S56.31, S56.33).
- Vercel and github-mcp tools are undeclared in AGI's metadata, so every call, reads included, asks (tool-metadata.ts:876-882, :1083).
- VS Code has no CI or deployment code of its own (searched apps/extension-vscode/src); its repository search uses the local runtime (brief cites localRuntimeClient.ts:950, not traced further).
- CircleCI has a catalog entry (api-key) with no remote endpoint, so it cannot be connected (catalog.ts circleci; oauth-setup.ts:155-162).

**Present but disconnected or switched off**

- The ids github, github-mcp and vercel are not released (connector-release.ts:16-30; connector-release.test.ts lists github and vercel as not released), so the hosted tools never reach a turn (user-connector-tools.ts:2451, :2537).
- The GitHub App adapter loads only with a verified installation and when the operator set up installation linking (apps/web/app/api/connectors/route.ts:178-186, :599-620).
- CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID and _CLIENT_SECRET are operator steps recorded as not done in the brief (doc: docs/runbooks/connector-oauth-apps.md, section 4).

**Not available**

- GitLab and Bitbucket: catalog entries exist (catalog.ts gitlab, bitbucket) but no pinned MCP endpoint in mcp-endpoints.ts; the brief marks GitLab out of scope.
- Netlify: directory entry with unknown auth mode and no tools listed (first-party.json netlify entry).
- CLI and VS Code cannot start deployments or read hosted CI except through a Cloud turn.

## 4. Required behaviour

**Established requirements**

- The assistant can search code across a connected repository (hosted, or the local checkout on coding surfaces). (source: brief S56.31)
- The assistant can read a pull request, review it and post review comments on the hosted repository. (source: brief S56.32)
- The assistant can report CI pipeline status and show build logs from a connected CI provider. (source: brief S56.33)
- The assistant can view and manage deployments (list, inspect, deploy) in a connected hosting provider. (source: brief S56.39)
- GitHub uses the pinned hosted server github-mcp; GitLab has no pinned server. (source: brief S56.31 note)
- Where the leaders ship a connector capability, it is built. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-08))

**Acceptance criteria**

1. Posting a pull request review from a Cloud chat always shows an approval card, even when the tool was set to Always allow.
2. get_pull_request_diff returns a diff fenced as untrusted data.
3. `agi review --pr N` without --post posts nothing to GitHub.
4. `agi review --pr N --post` posts exactly one comment.
5. With gh missing, the CLI says to install gh and sign in.
6. Starting a deployment from chat shows an approval card naming the project.
7. With github not released, the GitHub card reads 'Coming soon' and no GitHub tool is offered.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Reads should run without approval only under auto_approve_read_only and only for declared read tools [inferred from tool-metadata.ts:1083]; github-mcp and Vercel reads would still ask until declared.
- The local gh path runs on the device and does not use the Cloud connectors capability [inferred from apps/cli/src/review.rs].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Declare metadata for the github-mcp read tools and Vercel read tools.
- [proposed] Add a CI status tool to the adapter or document that github-mcp supplies it once Actions read is granted.
- [proposed] Add a VS Code command for CI status through gh to match the CLI.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | GITHUB_TOOL_DEFS | `apps/web/lib/user-connector-tools.ts` | Defines the three GitHub App adapter tools (line 299). |
| service | github-app | `apps/web/lib/github-app.ts` | GitHub App installation, ownership and PR review calls. |
| service | github-installation-access | `apps/web/lib/github-installation-access.ts` | Which repositories an installation can reach. |
| service | github-write-access | `apps/web/lib/github-write-access.ts` | Which repositories an installation can write. |
| endpoint | /api/github/installations | `apps/web/app/api/github/installations/route.ts` | List and remove GitHub installations. |
| config | GITHUB_TOOL_METADATA | `apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts` | Declares diff read and the two external-send tools (line 669). |
| config | connector-release.ts | `packages/contracts/types/src/connector-release.ts` | Release gate that keeps github, github-mcp and vercel out of turns. |
| config | first-party.json | `apps/web/lib/connectors/directory/sources/first-party.json` | Pinned github-mcp, vercel and netlify entries. |
| config | MCP_ENDPOINTS vercel | `apps/web/lib/connectors/mcp-endpoints.ts` | Vercel pinned as preregistered (line 175). |
| config | CONNECTOR_CAPABILITIES | `apps/web/lib/connectors/catalog.ts` | github (line 168), github-mcp, vercel (line 219), gitlab, bitbucket, circleci records. |
| service | loadUserConnectorToolCatalog | `apps/web/lib/user-connector-tools.ts` | Adds GitHub App tools only with an installation and a released id (line 2451). |
| service | connector-tool-permissions | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts` | Critical tools ask every time (decisionTimeConnectorLevel). |
| command | agi review | `apps/cli/src/review.rs` | CLI review of diffs and pull requests through gh; --post posts it. |
| command | /pr-comments and /autofix-pr | `apps/cli/src/pr_feedback.rs` | Reads threads, reviews, comments and failing checks through gh. |
| command | CLI Review subcommand | `apps/cli/src/lib.rs` | Flags --pr and --post (lines 781-795, 6497-6515). |
| command | CLI search tools | `apps/cli/src/features/exec/tools/dir_ops/mod.rs` | Local repository search with credential filtering. |
| command | agi-workforce.reviewPullRequest | `apps/extension-vscode/src/extension.ts` | VS Code review command (line 292). |
| command | agi-workforce.createPullRequest | `apps/extension-vscode/src/features/surfaces/pullRequest.ts` | VS Code create pull request with confirm. |
| service | managed approvals | `apps/cli/src/models/managed_approvals.rs` | CLI approval relay for hosted connector calls. |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Loads the connector catalog for the turn. |
| component | ToolApprovalCard | `apps/web/features/chat/components/approvals/ToolApprovalCard.tsx` | Approval card on web. |
| component | AgentActivityTimeline | `apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx` | Mobile tool steps and approvals. |
| table | github_installations | `apps/web/lib/user-connector-tools.ts` | Stores installations and verified repositories (query near line 372). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Hosted: the person asks in chat; the turn goes to the Cloud chat endpoint. | our servers | apps/web/app/api/llm/v1/chat/completions/route.ts:794 |
| The server adds GitHub App tools only if github is released and the person has an installation. | our servers | apps/web/lib/user-connector-tools.ts:2451-2455 |
| The model calls a tool; critical tools pause for approval on the device. | device and our servers | apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:43-52 and the decisionTimeConnectorLevel function |
| The server calls GitHub's API with the installation token and fences the diff. | outside service | apps/web/lib/user-connector-tools.ts:243-253, :299-345; apps/web/lib/github-app.ts |
| CLI local path: `agi review --pr` runs gh on the device to read the diff. | device | apps/cli/src/review.rs:141-170 |
| The CLI sends the diff to the chosen model route to write the review; where that goes depends on the trust mode (Local, own key, Cloud). | device and our servers | apps/cli/src/review.rs:1-20 (options include model); mode routing in SYS-execution-boundaries [inferred] |
| With --post the CLI runs gh pr review --comment on the device, which calls GitHub. | outside service | apps/cli/src/review.rs:175-189 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| GitHub installation, verified and writable repositories | table github_installations | Server side | Removed when the installation is deleted (apps/web/lib/github-app.installation-delete.test.ts names the case) |
| Pull request diff in a turn | Conversation and run records on our servers | With the conversation | unknown |
| CLI review output | Terminal; posted to GitHub only with --post | No | Held by the CLI session record [inferred] |

**Models and providers.** Any tool-capable chat model can call the hosted tools. The CLI review uses the model chosen with --model or the session default and follows the session trust mode (review.rs ReviewOptions). Provider names are not fixed by this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Hosted path: signed-in AGI account. CLI local review: gh sign-in on GitHub; AGI account only if the Cloud model route is used [inferred]. |
| Permissions | GitHub App installation scope; approval for each external-send call; critical tools cannot be set to always allow (connector-tool-permissions.ts:43-52). |
| Subscription | Hosted connectors need a paid managed plan (billing-catalog.ts:351). The local gh path needs no plan [inferred]. |
| Limits and metering | Plan connector-tool limit applies to hosted tools (user-connector-tools.ts:177-181). CLI review metering: unknown. |
| Feature flags | connector-release.ts state and ids; operator GitHub App configuration (isGitHubInstallationLinkingAvailable in apps/web/app/api/connectors/route.ts:178-186). |
| Model compatibility | Hosted: model must support tools. CLI review: any model the CLI can run. |
| Provider restrictions | GitHub only for the pinned server; GitLab has no pinned server (brief). |
| Local mode | The local gh path (CLI review, /pr-comments, VS Code review) runs on the device; the CLI blocks a Local-trust session from sending data to a cloud model (apps/cli/src/agent/chat.rs tests named local_session_* around lines 4540-4580). Hosted GitHub tools are not available in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| gh missing | CLI error: install gh and run gh auth login. | apps/cli/src/review.rs:153-157 |
| gh command fails | CLI error includes the gh subcommand and sanitized stderr. | apps/cli/src/review.rs:164-170 |
| Diff too large | The review prompt marks the omitted part and says the review is partial. | apps/cli/src/review.rs:125-135 |
| Review comments on very large threads | Paging capped at 20 pages and 40,000 characters. | apps/cli/src/pr_feedback.rs:5-7 |
| Unreleased connector | 'Coming soon'; no tools. | apps/mobile/src/features/settings/cloud-connectors/index.tsx:162 |
| GitHub install not available on this deployment | POST /api/connectors answers 501 with the setup message. | apps/web/app/api/connectors/route.ts:600-613 |
| Write outcome unknown after a failure | The server reconciles whether the GitHub write landed and logs it. | apps/web/lib/user-connector-tools.ts:432-448 |
| Accessibility, VS Code | Modal confirm and input boxes are native VS Code controls. | apps/extension-vscode/src/features/surfaces/pullRequest.ts:31-40 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/github-app.pr-review.test.ts`: GitHub App pull request review calls (named for it; body not read in detail).
- `apps/web/lib/github-app.issues.test.ts`: GitHub App issue calls (named for it).
- `apps/web/lib/github-app.ownership.test.ts`: Installation ownership checks (named for it).
- `apps/web/app/api/github/installations/route.pr-review.test.ts`: Installations route with PR review (named for it).
- `packages/contracts/types/src/__tests__/connector-release.test.ts`: github and vercel are not released.
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/tool-metadata.risk-tier.test.ts`: Risk tiers from metadata (named for it).
- `apps/cli/src/pr_feedback.rs`: Inline tests: a comment cannot close the feedback fence; later pages fetched with the cursor (lines 445-500).

**Test scenarios**

- **Review is gated**
  1. Install the GitHub App (when released) and connect.
  2. Ask the assistant to review pull request N and post the review.
  3. Open the approval card.
  - Expected: Card names post_pull_request_review; Always allow is not accepted for it; nothing posts until Allow.
- **CLI review without posting**
  1. Install gh and sign in.
  2. Run `agi review --pr N`.
  - Expected: Review prints in the terminal; the pull request has no new comment.
- **CLI review with posting**
  1. Run `agi review --pr N --post`.
  - Expected: One review comment appears on the pull request.
- **gh missing**
  1. Run the review on a machine without gh.
  - Expected: Clear message to install gh and sign in.
- **Unreleased hosted GitHub**
  1. Open Connectors on web.
  - Expected: GitHub reads 'Coming soon' or setup-required; no GitHub tool in chat.
- **Deployment start**
  1. When Vercel is released, connect it and ask to deploy a project.
  - Expected: Approval card first; deployment starts only after Allow.

**Where to look when it fails**

- Log '[user-connector] github write outcome reconciled: it landed' or 'did not land' or 'could not be reconciled' (user-connector-tools.ts:432-448).
- Log '[user-connector] github tool execution failed' (user-connector-tools.ts:543).
- CLI 'gh ... failed' messages.
- Table github_installations.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/056-concrete-integration-families.md](../../70-qa/test-plans/web/056-concrete-integration-families.md)
- Desktop: [70-qa/test-plans/desktop/056-concrete-integration-families.md](../../70-qa/test-plans/desktop/056-concrete-integration-families.md)
- Mobile: [70-qa/test-plans/mobile/056-concrete-integration-families.md](../../70-qa/test-plans/mobile/056-concrete-integration-families.md)
- CLI: [70-qa/test-plans/cli/056-concrete-integration-families.md](../../70-qa/test-plans/cli/056-concrete-integration-families.md)
- VS Code: [70-qa/test-plans/vscode/056-concrete-integration-families.md](../../70-qa/test-plans/vscode/056-concrete-integration-families.md)
- Chrome: [70-qa/test-plans/chrome/056-concrete-integration-families.md](../../70-qa/test-plans/chrome/056-concrete-integration-families.md)

## 10. Gaps and dependencies

- **Hosted repository search and CI status/logs have no declared tools and no released connector.** Affects: Web, Desktop, Mobile, Chrome.. Evidence: first-party.json github-mcp entry lists no tools; connector-release.ts:16-30 omits github-mcp. Work needed: Owner creates the GitHub App with Actions read and sets the github-mcp client; release the id; declare read metadata.
- **VS Code has no CI status or deployment command.** Affects: VS Code users.. Evidence: No CI or deploy code found in apps/extension-vscode/src.. Work needed: Add commands through gh or document the Cloud turn path.
- **Deployment tools (Vercel) all ask, reads included.** Affects: Cloud turns once released.. Evidence: tool-metadata.ts:876-882. Work needed: Declare read metadata for list and inspect tools.
- **CircleCI, GitLab, Bitbucket cannot be connected.** Affects: All apps.. Evidence: apps/web/lib/connectors/catalog.ts; oauth-setup.ts:155-162. Work needed: Pin endpoints or leave out of scope as the brief states for GitLab.
- **No test found that runs the CLI review end to end against a fake gh.** Affects: CLI quality.. Evidence: apps/cli/src/review.rs has no tests of run_gh found. Work needed: Add a fake-gh test.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-chat-turn-pipeline
- mode:cloud
- mode:local
- mode:own-key
- surface:cli
- surface:vscode
- surface:web
- surface:mobile
- surface:chrome
- surface:desktop
- file:packages/contracts/types/src/connector-release.ts

## Unknown

- Which tools the pinned github-mcp server offers once connected; none are listed in the directory entry.
- How VS Code repository search reaches the local runtime (webviewContent.ts:5648 and localRuntimeClient.ts:950 cited by the brief did not show a search feature when opened).
- Whether CLI review calls are metered.
- Retention of pull request diffs in conversation records.
- Whether Netlify can be connected (auth mode unknown, no tools listed).
