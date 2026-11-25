---
id: "COMP-coding-workflows"
type: "competitor-trace"
title: "Coding workflows"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Coding workflows: competitors to requirements

Claude and ChatGPT both run coding in a cloud agent, open pull requests and review them on GitHub. Both keep this in separate coding tools (Claude Code, Codex) linked from the chat apps. AGI has a web Code tab, desktop, phone, CLI and VS Code sessions, and a GitHub review pipeline. No person has seen a pull request opened. The web Code tab was seen failing once and blocked once. Main gaps: review rules, auto-fix, environments, handoff.

**How the products divide this topic.** Review date for all competitor evidence: 2026-11-22. Four products are kept apart. Claude is the chat product: files and code execution, artifacts, a GitHub read integration (support.claude.com). Claude Code is the separate coding tool (code.claude.com) in terminal, IDE, desktop Code tab and on the web at claude.ai/code. Its cloud sessions start from claude.ai, the Claude mobile app Code tab, the Desktop app and the CLI, and share plan limits with Claude chat. ChatGPT is the chat product: code blocks, Python run, a read-only GitHub connector, Work with Apps on macOS. Codex is the separate coding tool (learn.chatgpt.com and help.openai.com Codex articles) with app, CLI, IDE, cloud tasks and Code Review. It is reached from the ChatGPT apps (the desktop menu picks ChatGPT or Codex; mobile has cloud tasks and a Remote tab) and is covered by ChatGPT plans. Plan limits seen in the catalogue: Claude Code cloud sessions need Pro, Max, Ultra, Team or Enterprise and are blocked under zero data retention, HIPAA configuration or customer-managed keys. Claude managed Code Review is Team and Enterprise only, GitHub only, billed as usage credits apart from plan usage. Ultrareview is a research preview with three free runs on Pro, Max and Ultra. Claude Tag in Slack is Team and Enterprise beta. Codex cloud is on paid ChatGPT plans; @ChatGPT in Slack is Business and Enterprise; GitLab is beta. One Codex page says legacy cloud still powers Code Review and Security Review during a transition. AGI side: the web Code tab is paid-only (a Free account sees an Upgrade and waitlist path). Cloud sessions need the managed sandbox gate (AGI_E2B_EXECUTION plus E2B_API_KEY, apps/web/lib/e2b/gate.ts:16-30). Local sessions run through the CLI-hosted developer runtime on the device. AGI statuses come from code reading unless a row says a person saw it.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-coding-workflows-01](#cap-coding-workflows-01) | Code blocks in chat | partly | yes | partly built | not verified |
| [CAP-coding-workflows-02](#cap-coding-workflows-02) | Run code from chat | yes | yes | partly built | seen working by a person |
| [CAP-coding-workflows-03](#cap-coding-workflows-03) | Code preview and artifacts beside the chat | yes | yes | partly built | seen working by a person |
| [CAP-coding-workflows-04](#cap-coding-workflows-04) | GitHub repository as chat context | yes | yes | partly built | seen failing by a person |
| [CAP-coding-workflows-05](#cap-coding-workflows-05) | Edit code in an IDE from the chat app | unknown | yes | unknown | not verified |
| [CAP-coding-workflows-06](#cap-coding-workflows-06) | Start a cloud coding session | yes | yes | partly built | seen failing by a person |
| [CAP-coding-workflows-07](#cap-coding-workflows-07) | Repository, branch and multi-repository choice | yes | yes | partly built | seen failing by a person |
| [CAP-coding-workflows-08](#cap-coding-workflows-08) | Cloud environments: network, setup scripts, secrets | yes | yes | partly built | code inspected only |
| [CAP-coding-workflows-09](#cap-coding-workflows-09) | Review the diff and comment on lines | yes | yes | partly built | code inspected only |
| [CAP-coding-workflows-10](#cap-coding-workflows-10) | Commit and open a pull request or draft pull request | yes | yes | partly built | seen failing by a person |
| [CAP-coding-workflows-11](#cap-coding-workflows-11) | Auto-fix a pull request after CI or review comments | yes | partly | partly built | not verified |
| [CAP-coding-workflows-12](#cap-coding-workflows-12) | Automated pull request review on GitHub | yes | yes | built | code inspected only |
| [CAP-coding-workflows-13](#cap-coding-workflows-13) | Review triggers, depth levels and spend caps | yes | partly | partly built | not verified |
| [CAP-coding-workflows-14](#cap-coding-workflows-14) | Repository rules file for reviews | yes | yes | not built | not verified |
| [CAP-coding-workflows-15](#cap-coding-workflows-15) | Review local changes and branches on the device | yes | yes | partly built | code inspected only |
| [CAP-coding-workflows-16](#cap-coding-workflows-16) | Deep cloud review before merge | yes | unknown | not built | not verified |
| [CAP-coding-workflows-17](#cap-coding-workflows-17) | Pull request inbox and submit a review from the app | unknown | yes | not built | not verified |
| [CAP-coding-workflows-18](#cap-coding-workflows-18) | Security review of code and pull requests | yes | yes | partly built | code inspected only |
| [CAP-coding-workflows-19](#cap-coding-workflows-19) | Start coding work from GitHub, Slack or issues | yes | yes | partly built | code inspected only |
| [CAP-coding-workflows-20](#cap-coding-workflows-20) | Move a session between cloud, terminal, editor and phone | yes | partly | partly built | code inspected only |
| [CAP-coding-workflows-21](#cap-coding-workflows-21) | Permission modes in coding sessions | yes | yes | partly built | code inspected only |
| [CAP-coding-workflows-22](#cap-coding-workflows-22) | Repository instruction files in cloud sessions | yes | yes | partly built | code inspected only |
| [CAP-coding-workflows-23](#cap-coding-workflows-23) | Parallel sessions and worktrees | yes | yes | partly built | code inspected only |
| [CAP-coding-workflows-24](#cap-coding-workflows-24) | Share and archive coding sessions | yes | unknown | built | code inspected only |
| [CAP-coding-workflows-25](#cap-coding-workflows-25) | Scheduled and event-triggered coding routines | yes | partly | partly built | seen working by a person |
| [CAP-coding-workflows-26](#cap-coding-workflows-26) | Coordinated projects of many coding threads | yes | unknown | not built | not verified |
| [CAP-coding-workflows-27](#cap-coding-workflows-27) | Shared limits and billing between chat and coding tools | yes | yes | partly built | seen failing by a person |
| [CAP-coding-workflows-28](#cap-coding-workflows-28) | Coding in CI with an action | yes | yes | unknown | not verified |

## CAP-coding-workflows-01 Code blocks in chat

Code in a chat reply sits in its own block with a language label, copy, edit and full screen.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (artifacts in chat): partly**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Claude creates an artifact for self-contained content, typically 15+ lines, including code; it opens beside the chat, editable, shareable. Plans: Free through Enterprise. Apps: web, desktop, mobile (mobile views results).
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt): Code sits in its own block with a language label, copy, direct edit for supported blocks, ask-ChatGPT-to-edit and full screen; edits autosave with the conversation. Apps: web, desktop, ios, android.

**AGI requirement** (inferred; source: competitor parity). Every chat surface shows code in a labelled block with copy, edit and full screen, whichever model wrote it.

**With different models, providers and the one subscription.** Rendering is client work, independent of model and provider. Works in Local mode with a local model. No separate limit; the turn counts against the one subscription like any chat turn.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile render code blocks (ledger area 21, not read item by item). Web run-again card exists. CLI and VS Code render code in their own transcripts. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: web: Run Python code blocks from a reply and see console output (no list_id)
- Code: `apps/web/features/chat/components/messages/CodeRunAgain.tsx:17-84`

**Gap.** Per-app edit and full-screen behaviour not confirmed.

**Acceptance criteria**

1. Ask for a function in a chat; the reply shows a block with a language label and a working copy button.
2. Edit the block text and reload; the edit is still there.
3. At phone width the block scrolls inside itself with no page scroll.

**Verification: not verified.** No scorecard row covers code blocks.

## CAP-coding-workflows-02 Run code from chat

The chat product runs code in a sandbox and shows output, files and charts.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude): Claude runs code in a sandbox to build downloadable files and charts; owners set network egress; the toggle is in Settings > Capabilities; it draws from plan limits. Plans: All plans; egress modes Team, Enterprise. Apps: web, desktop, mobile.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt): Run opens a code workspace showing console output or errors and lets you stop the program; admins can control code execution and network access. Plans: Varies. Apps: web, desktop, ios, android.

**AGI requirement** (inferred; source: competitor parity). A chat can run code in a server sandbox with output, stop, and admin and plan controls. The device-or-server boundary is stated before it runs.

**With different models, providers and the one subscription.** Any model may ask for a run. Server runs are metered by the one subscription. In Local mode the run must be on-device or refused with a visible reason, never silently sent to a server (AGENTS.md section 6).

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: Run code card with allow-once exists and Python blocks can be re-run. Desktop: provider-managed execution result UI is wired. Other apps not checked. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP159; rows without an id: web: Run Python code blocks from a reply and see console output (Same)
- Code: `apps/web/features/chat/components/messages/CodeRunAgain.tsx:17-84`; `apps/web/features/settings/sections/CapabilitiesSection.tsx:52,118`; `docs/decisions/wire-or-cut.md:137`

**Gap.** Network egress modes and admin controls are Partial (WP159).

**Acceptance criteria**

1. Ask for a script and press Run; console output shows and Stop halts a long loop.
2. Turn code execution off in Settings > Capabilities; Run is gone or says why.
3. In Local mode a server run is refused with a visible reason.

**Verification: seen working by a person.** Scorecard W-15 (Work, subscribed): a Run code card ran after Allow once, but the first step failed with a missing library in the sandbox (minor defect). This is the Work agent, not a plain chat run.

## CAP-coding-workflows-03 Code preview and artifacts beside the chat

A built page, React app or file opens in a side panel with preview, edit and download.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): Artifacts open beside the conversation, are editable and shareable, need cloud code execution on, and a Try fixing with Claude button copies error details into a new message. Plans: Free through Enterprise. Apps: web, desktop, Claude Code; mobile views results.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt): A Preview toggle renders supported HTML pages, React components, SVG, Mermaid and Vega. Apps: web, desktop, ios, android.

**AGI requirement** (inferred; source: competitor parity (owner direction on Claude-style artifacts is recorded in memory, not in a project document I opened)). Chat can open code output as a previewable, editable, downloadable artifact in a side panel.

**With different models, providers and the one subscription.** Any model can produce an artifact. Preview runs on the device. Works in Local mode. Counts as ordinary chat usage.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web built, downloads real HTML. Other apps follow shared unified-chat code (not checked per app). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `scorecard W-8` (not found)

**Gap.** A person saw a follow-up edit break after Stop (W-8 subscribed).

**Acceptance criteria**

1. Ask for a small calculator page; it renders in the side panel and an edit updates the result.
2. Download as HTML produces a file that opens and works.
3. Stop mid-way then ask for an edit; the artifact still updates.

**Verification: seen working by a person.** W-8 free and subscribed: artifact rendered, preview edit worked, download produced a real file. Both rows partial; the follow-up edit after Stop breaks on subscribed.

## CAP-coding-workflows-04 GitHub repository as chat context

The chat product reads files from a GitHub repository to answer questions; it does not write back.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10167454-use-the-github-integration](https://support.claude.com/en/articles/10167454-use-the-github-integration): Plus > Add from GitHub picks files and folders as context; repos can be added to project knowledge with Sync; only file names and contents on a branch are synced, not commits or PRs. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt](https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt): GitHub connector gives live read-only repo access retrieved on demand; queries are sent to GitHub; Business data is not used for training. Plans: Varies by plan. Apps: web.

**AGI requirement** (inferred; source: competitor parity). A chat can read a connected GitHub repo as read-only context, with the connection and any data sent to GitHub stated before use.

**With different models, providers and the one subscription.** Retrieved text goes to whichever provider is chosen, so the picker label must be visible. In Local mode the content stays on the device or the chat refuses a server connector. Connector availability follows plan (Free sees Connectors locked, W-17).

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: GitHub connector exists with per-tool permissions (GitHub only); locked on Free; on the test machine the repo picker says GitHub is not configured. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `docs/decisions/wire-or-cut.md:295`

**Gap.** Chat-side GitHub read behaviour not traced in code for this page; no comparison row found by keyword.

**Acceptance criteria**

1. Connect GitHub, pick a repo, ask where a function is defined; the answer cites file and line.
2. Disconnect; the next ask cannot read the repo.
3. On Free the connector shows a plain Upgrade message.

**Verification: seen failing by a person.** W-17 subscribed: no outside app could be connected (blocked); 74 of 87 connectors including GitHub were locked. W-18: GitHub App not configured on the test machine.

## CAP-coding-workflows-05 Edit code in an IDE from the chat app

The desktop chat app reads an open IDE window and proposes code edits as a diff.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT (macOS app): yes**
  - [https://help.openai.com/en/articles/10119604-work-with-apps-on-macos](https://help.openai.com/en/articles/10119604-work-with-apps-on-macos): In IDEs ChatGPT generates a diff to review and apply, with an auto-apply option; revert in ChatGPT or with Cmd+Z; admins can turn off Work with Apps or code edits. Plans: Enterprise, Edu admin toggles. Apps: desktop (macOS).

**AGI requirement** (proposed; source: competitor parity (one competitor only)). Not a stated AGI requirement. A choice for the owner.

**With different models, providers and the one subscription.** Would send editor content to the chosen provider; needs explicit consent and must refuse in Local mode unless the model is local.

**Current implementation, as this trace read it on 2026-11-24: unknown.** VS Code extension and CLI cover editing inside the coding tools; no chat-app window reader was looked for. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: none cited

**Gap.** Not searched.

**Acceptance criteria**

1. If built: pick an IDE window, ask for an edit, review a diff, press undo; the file returns.

**Verification: not verified.** No evidence.

## CAP-coding-workflows-06 Start a cloud coding session

A coding task runs on the vendor's servers, keeps going when the person leaves, and can be started from web, phone, desktop or terminal.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (cloud sessions, started from claude.ai/code, the Claude mobile app Code tab, Desktop and the CLI): yes**
  - [https://code.claude.com/docs/en/web-quickstart.md](https://code.claude.com/docs/en/web-quickstart.md): Cloud sessions clone a GitHub repo, make changes, run tests and push a branch; they count toward plan usage with no separate VM charge; start from claude.ai/code, the phone Code tab, Desktop with Cloud selected or claude --cloud. Plans: Pro, Max, Ultra, Team, Enterprise (Claude Code seat). Apps: web, ios, android, desktop, cli.
  - [https://support.claude.com/en/articles/12618689-use-claude-code-in-the-cloud](https://support.claude.com/en/articles/12618689-use-claude-code-in-the-cloud): Sessions end by pushing a branch and offering a pull request. Apps: desktop, web, mobile, cli.
- **Codex (cloud tasks, reached from ChatGPT): yes**
  - [https://help.openai.com/en/articles/20001545-using-codex-cloud](https://help.openai.com/en/articles/20001545-using-codex-cloud): Codex runs coding tasks in isolated workspaces from a published environment; tasks continue while your computer sleeps and start from desktop, web or mobile. Apps: web, desktop, ios, android.
  - [https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex): Cloud tasks run on OpenAI-managed computers; an environment must be created and published on desktop or web before a mobile task. Plans: Paid plans. Apps: web, ios, android, desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md (Codex cloud tasks and Claude Code web are the parity baseline); docs/product/competitive-guidance.md section 5.18 items 137-143). A signed-in person on an entitled plan starts a cloud coding task from web, desktop, phone, CLI or VS Code. It keeps running after they leave and shows which sandbox it runs in.

**With different models, providers and the one subscription.** Any provider model can drive the session, chosen by the picker or Auto. Sandbox compute and tokens are metered by the one subscription; entitlement is checked on the server per account. Local mode has no cloud session: the person gets Local session choices only, and a Local-to-cloud move is an explicit fork with consent (AGENTS.md section 6).

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: Code tab, paid plans only, cloud sandbox gated by a server switch. Desktop: selector partial. Mobile: Code lists Cloud and computer sessions; no execution selector. CLI and VS Code: no cloud selector. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S66.01, S66.04, S66.05, S99.30
- Comparison list ids: none matched; rows without an id: web: Cloud coding agent on the web (Same); web: Start a cloud coding session with no repository (Same); web: Several cloud sessions in parallel that keep running when you leave (Same)
- Code: `apps/web/app/code/page.tsx:1-12`; `apps/web/lib/e2b/gate.ts:16-30`; `apps/web/app/api/code/sessions/route.ts:46`; `docs/decisions/2026-11-13-founder-decisions.md:141`

**Gap.** Local/cloud selector is partial on web and desktop, missing on mobile, CLI and VS Code (S66.04). The sandbox switch is off in the test deployment.

**Acceptance criteria**

1. As Free open Code; see an Upgrade and waitlist path, no error.
2. As a paid user start a task with no repository; the first turn shows output, not a cancel.
3. Close the tab; the task finishes and reopens with its result.
4. Start from the phone Code tab; the session appears in the web list.

**Verification: seen failing by a person.** W-18 subscribed (blocked): the first turn of each new cloud task was cancelled within 1 s and showed nothing; Run this task again then completed. The Free path worked (Upgrade then waitlist, W-18 free, partial).

## CAP-coding-workflows-07 Repository, branch and multi-repository choice

The person picks one or more repos and the starting branch before a cloud session starts.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/web-quickstart.md](https://code.claude.com/docs/en/web-quickstart.md): Pick one or more repositories and a starting branch below the input; a No repository option exists. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/cloud.md](https://learn.chatgpt.com/docs/cloud.md): Ask Codex to use any repository available through your connected GitHub or GitLab account. Apps: web, desktop.

**AGI requirement** (inferred; source: competitor parity). Pick repo and branch before a session; GitHub is required, GitLab is a separate choice.

**With different models, providers and the one subscription.** Independent of model. Repo content goes to the sandbox and the chosen provider, so the boundary is shown. In Local mode the repo is a local folder.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web partial, desktop done, CLI done (branch picker missing), VS Code done, mobile missing. Multi-repo and GitLab missing on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S66.01, S66.02
- Comparison list ids: W188, W192; rows without an id: web: Pick a GitHub repository and branch for a session (Same)
- Code: `apps/web/features/code/code-surface.ts:36`; `apps/web/features/code/code-surface.ts:55-65`; `apps/web/features/code/components/CodeComposer.tsx:330`

**Gap.** No multi-repo (W192), no GitLab or Bitbucket (W188), branch picker missing in CLI and mobile.

**Acceptance criteria**

1. Pick a repo and a non-default branch; the session works on that branch.
2. Enter a bad URL; a clear message shows.
3. On mobile, start a session on a chosen repo.

**Verification: seen failing by a person.** W-18: the repo list could not load (GitHub App not configured); the bad URL message is clear; after a failed URL the chip is unchanged and a later start is refused (cosmetic defect).

## CAP-coding-workflows-08 Cloud environments: network, setup scripts, secrets

A saved environment sets network access, variables, setup and maintenance scripts for cloud sessions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/web-quickstart.md](https://code.claude.com/docs/en/web-quickstart.md): A Default environment with Limited network access is created; setup scripts run on clone; levels are Limited or None; GitHub credentials stay outside the VM behind a proxy. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, ios, android, desktop, cli.
- **Codex: yes**
  - [https://help.openai.com/en/articles/20001545-using-codex-cloud](https://help.openai.com/en/articles/20001545-using-codex-cloud): An environment bundles repositories, tools, dependencies and access settings, created and published on desktop or web; saved VM state is recoverable for 7 days; Enterprise can share environments. Plans: Enterprise for sharing. Apps: desktop, web.
  - [https://learn.chatgpt.com/docs/environments/cloud-environments.md](https://learn.chatgpt.com/docs/environments/cloud-environments.md): Optional setup and maintenance scripts; internet access settings and network secrets (from catalogue rows). Apps: web.

**AGI requirement** (inferred; source: competitor parity). A cloud session runs in a named environment with network levels, secret variables kept out of the VM and setup scripts.

**With different models, providers and the one subscription.** Secrets never go to the model. Sandbox time is metered under the one subscription. No Local-mode equivalent; local sessions use the person's own machine and the CLI sandbox rules.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: network access levels exist; named environments with setup script and secrets, cached setup, publish and share are missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W177, W180, W194, W196, W203, W204, WP150; rows without an id: Network access levels for the sandbox (Same)
- Code: `packages/contracts/types/src/cloud-code.ts:4`; `packages/contracts/types/src/cloud-code.ts:481`; `apps/web/lib/services/cloud-code-environment-service.ts:64-136`

**Gap.** Missing: named environments (W180), cached setup (W177), publish and share (W196, W203), private networking (W194), cloud OIDC (W204). Preinstalled toolchains partial (WP150).

**Acceptance criteria**

1. Create an environment with a setup script and a secret; a session sees the value as an environment variable but the transcript never prints it.
2. Set network to None; a package download fails with a clear message.
3. Reopen after expiry; history returns.

**Verification: code inspected only.** No person-run row for environments.

## CAP-coding-workflows-09 Review the diff and comment on lines

A Changes panel lists files changed and lets the person comment on lines and send comments with the next message.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/web-quickstart.md](https://code.claude.com/docs/en/web-quickstart.md): The Changes card shows lines added and removed and opens a diff; the + beside a line leaves a comment sent with the next message; compare against any branch. Apps: web, desktop.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/code-review.md](https://learn.chatgpt.com/docs/code-review.md): Review pane scopes Unstaged, Staged, Commit, Branch, Last turn; inline diff comments by pressing +; stage, unstage or revert per hunk. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md item 138). Every coding surface shows a line-level diff of the agent's changes, lets the person comment on lines and accept or reject hunks.

**With different models, providers and the one subscription.** Works with any model. Local sessions do it on the device; cloud sessions server-side. No extra metering.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Diff viewer: web partial; desktop, mobile, CLI, VS Code done. Inline review comments missing on all five coding apps. Hunk accept or reject: CLI and VS Code done; web, desktop, mobile missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S66.18, S66.19, S66.20, S66.21
- Comparison list ids: none matched; rows without an id: web: Review changed files and a diff before committing (Same)
- Code: `apps/web/features/code/components/CodeChangesPanel.tsx:119`

**Gap.** Inline review comments (S66.20) missing everywhere; hunk acceptance missing on web, desktop and mobile.

**Acceptance criteria**

1. After an agent edit the panel lists files with added and removed counts.
2. Comment on a line; the next message carries file and line.
3. Reject one hunk; only that hunk is reverted.

**Verification: code inspected only.** No person-run row.

## CAP-coding-workflows-10 Commit and open a pull request or draft pull request

From a session, commit changes and open a pull request on the code host with a generated title and description.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/web-quickstart.md](https://code.claude.com/docs/en/web-quickstart.md): Create PR from the Changes card with a generated title and description; right-click switches to Create draft PR; the session stays live. Apps: web, desktop.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/cloud.md](https://learn.chatgpt.com/docs/cloud.md): Review changed files, request follow-ups, commit or open a pull request. Apps: web, desktop, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md lines 1384-1385 (AGI Code settings: Create pull request automatically; Autofix pull request)). A session can commit and open a pull request, including a draft, after the person approves. Settings include create pull request automatically.

**With different models, providers and the one subscription.** Model-neutral. A push to the code host leaves the device or sandbox, so it asks first. Local mode: only a local commit unless the person signs in to a host and approves.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web partial (draft missing). Desktop and VS Code done. Pull-request panel missing on CLI and mobile. Commits and branches done on desktop, mobile, CLI, VS Code. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S66.36, S67.29, S67.30, S67.31
- Comparison list ids: W186; rows without an id: web: Commit and open a pull request from the session (Same)
- Code: `apps/web/app/api/code/sessions/[sessionId]/pull-request/route.ts:15-49`

**Gap.** No draft pull request on web (W186). No session link in commits (W202). Pull-request panel missing on mobile and CLI.

**Acceptance criteria**

1. Press create pull request; a link to a real pull request with a title and body shows.
2. Create a draft; GitHub shows it as draft.
3. With the sandbox switch off, the message says Managed Code is not enabled.

**Verification: seen failing by a person.** W-18 subscribed (blocked): the pull request could not be attempted because no GitHub App was configured. Nothing was seen opening a pull request.

## CAP-coding-workflows-11 Auto-fix a pull request after CI or review comments

The agent watches a pull request and pushes fixes for CI failures and reviewer comments.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/claude-code-on-the-web.md](https://code.claude.com/docs/en/claude-code-on-the-web.md): Claude watches a PR, reacts to CI failures and review comments, pushes clear fixes, asks about ambiguous ones and replies in threads labelled as Claude Code; started from the Changes card, /autofix-pr or mobile. Apps: web, cli, ios, android.
- **Codex: partly**
  - [https://learn.chatgpt.com/docs/code-review.md](https://learn.chatgpt.com/docs/code-review.md): Fix from the PR Checks section attaches failing CI output to a chat message for Codex; the message is prepared but not sent. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md line 1385 (Autofix pull request)). An agent can watch a pull request, read CI logs and reviewer comments and push approved fixes. An Autofix pull request setting exists.

**With different models, providers and the one subscription.** Any model. Each watch spends tokens and sandbox time under the one subscription, so a spend cap is needed. Local mode cannot watch a remote PR without the person signing in to the host.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web partial: a GitHub task service exists. Investigate CI failures missing on desktop, mobile, CLI, VS Code. Respond to review feedback done on CLI only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S66.37, S67.32, S67.33, S99.27
- Comparison list ids: WP144
- Code: `apps/web/lib/services/cloud-code-github-task.ts:44`; `apps/web/app/api/github/webhook/route.ts:30-37`

**Gap.** No CI-status panel anywhere (S66.37); respond to review feedback missing on web, desktop, mobile and VS Code (S67.32).

**Acceptance criteria**

1. Break a test on a PR; the agent pushes a fix or asks a question in a thread.
2. Turn auto-fix off; no new pushes.

**Verification: not verified.** No person-run row.

## CAP-coding-workflows-12 Automated pull request review on GitHub

A managed reviewer reads a pull request and posts inline findings and a summary on GitHub.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (Code Review service): yes**
  - [https://code.claude.com/docs/en/code-review.md](https://code.claude.com/docs/en/code-review.md): Multi-agent review finds, verifies, dedupes and ranks findings, then posts inline comments, a summary and a check run; it never approves or blocks merge; GitHub only; unavailable under zero data retention. Plans: Team, Enterprise. Apps: other (GitHub).
  - [https://claude.com/product/code-review](https://claude.com/product/code-review): Findings tagged Important, Nit, Pre-existing; levels Quick, Standard, Deep. Plans: Team, Enterprise. Apps: other.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/third-party/github.md](https://learn.chatgpt.com/docs/third-party/github.md): Mention @codex review or enable Automatic review; Codex posts a standard GitHub review flagging P0 and P1 issues. Apps: web (GitHub).

**AGI requirement** (inferred; source: competitor parity; docs/product/competitive-guidance.md item 138). A GitHub App reviews pull requests on open, ready or push and on a mention, posts severity-tagged inline comments, skips drafts, and bills under the one subscription with a visible spend cap.

**With different models, providers and the one subscription.** The review model comes from routing, not a fixed provider; the code already sets a configured model aside when it may train on inputs. Server only; the local review command covers private code on the device.

**Current implementation, as this trace read it on 2026-11-24: built.** Web: pipeline with correctness and security passes, severity labels and mention trigger. Desktop, CLI and VS Code review local changes. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S67.20, S67.21, S99.24, S99.25
- Comparison list ids: WP151, WP153, WP158; rows without an id: web: Automatic review of GitHub pull requests (Same)
- Code: `apps/web/lib/code-review/pipeline.ts:1-110`; `apps/web/lib/code-review/findings.ts:6-10,140-170`; `apps/web/app/api/github/webhook/route.ts:270-310`

**Gap.** No check run table or annotations (W200). Severity words differ from both leaders (blocker, major, minor, nit). Review pull requests missing on mobile (S67.21).

**Acceptance criteria**

1. Open a pull request on a connected repo; inline findings and a summary appear.
2. Open a draft; no automatic review runs.
3. Mention the trigger phrase; one review runs.

**Verification: code inspected only.** No person-run row; W-18 could not reach GitHub.

## CAP-coding-workflows-13 Review triggers, depth levels and spend caps

Per-repo choice of when reviews run, how deep they go and a monthly cap.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (Code Review service): yes**
  - [https://code.claude.com/docs/en/code-review-pull-requests.md](https://code.claude.com/docs/en/code-review-pull-requests.md): Review runs once, every push or manual with @claude review; always, stop and pause commands; drafts and fork PRs skip automatic reviews. Plans: Team, Enterprise. Apps: other.
  - [https://code.claude.com/docs/en/code-review-costs.md](https://code.claude.com/docs/en/code-review-costs.md): Org-wide monthly spend limit for Code Review; reviews skip when the limit or credits run out, with a PR comment naming the cause. Plans: Team, Enterprise. Apps: other.
- **Codex: partly**
  - [https://learn.chatgpt.com/docs/third-party/github.md](https://learn.chatgpt.com/docs/third-party/github.md): Per-repo and personal settings turn on automatic review and choose when reviews run. Apps: web.

**AGI requirement** (inferred; source: competitor parity; docs/product/commercial.md for limits as configuration). Admins choose when reviews run and how deep, and set a spend cap; a skipped review says why.

**With different models, providers and the one subscription.** Cap and cost are read from the one subscription system, not a constant in the reviewer.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: mention and push triggers exist; depth levels partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP157
- Code: `apps/web/app/api/github/webhook/route.ts:277-307`

**Gap.** Depth levels and spend cap not confirmed in code (WP157 Partial).

**Acceptance criteria**

1. Set once-only; a second push does not re-review.
2. Hit the cap; the pull request gets a comment naming it.

**Verification: not verified.** No person-run row.

## CAP-coding-workflows-14 Repository rules file for reviews

A file in the repo tells the reviewer what to check, read from the base branch.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (Code Review service): yes**
  - [https://code.claude.com/docs/en/code-review.md](https://code.claude.com/docs/en/code-review.md): Review instructions come from REVIEW.md on the base or default branch, never from the PR's own changes. Plans: Team, Enterprise. Apps: other.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/third-party/github.md](https://learn.chatgpt.com/docs/third-party/github.md): A Code Review Rules section in root or nested AGENTS.md files defines repo-specific checks; the closest file applies per changed file. Apps: web.

**AGI requirement** (inferred; source: competitor parity; AGENTS.md section 6 (validate at trust boundaries)). The reviewer reads review rules from the base branch instruction files and never from the changed files.

**With different models, providers and the one subscription.** Rules text is sent to the chosen model. Model-neutral.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web: the review pipeline reads no instruction file. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S67.38
- Comparison list ids: W198, W199
- Code: `apps/web/lib/code-review/pipeline.ts (no instruction file read)`

**Gap.** Both rules files missing in the reviewer (W198, W199).

**Acceptance criteria**

1. Add a rule in the base branch file; a review cites it.
2. Change the rule only in the PR; the review ignores the change.

**Verification: not verified.** None.

## CAP-coding-workflows-15 Review local changes and branches on the device

A command reviews uncommitted changes or a branch locally without a server pull request.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/code-review-local.md](https://code.claude.com/docs/en/code-review-local.md): /code-review (alias /review) reviews the current branch plus uncommitted changes, or a PR, range, commit or path, as a background subagent. Plans: All plans. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/code-review.md](https://learn.chatgpt.com/docs/code-review.md): /review in the app, CLI and IDE: base branch, uncommitted changes, a commit or custom instructions; reports prioritised findings without altering the working tree. Apps: desktop, cli, ide.

**AGI requirement** (inferred; source: competitor parity). Every coding tool has a local review command that works in Local mode with a local model and changes nothing.

**With different models, providers and the one subscription.** Runs with any model including a local one; a free local review costs no subscription usage.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Review code changes: web partial; desktop, mobile, CLI, VS Code done. Web review commands partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S67.20, S67.23
- Comparison list ids: WP145
- Code: `packages/contracts/types/src/cloud-code.ts:334`

**Gap.** Web review commands partial (WP145).

**Acceptance criteria**

1. Run review on uncommitted changes; findings carry file and line and the tree is unchanged.
2. Run it with a local model offline; it works.

**Verification: code inspected only.** No person-run row.

## CAP-coding-workflows-16 Deep cloud review before merge

A fleet of reviewers in a cloud sandbox independently reproduces each finding.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (Ultrareview, research preview): yes**
  - [https://code.claude.com/docs/en/ultrareview.md](https://code.claude.com/docs/en/ultrareview.md): Fleet of reviewers in a cloud sandbox, takes 5-15 minutes, three free runs then usage credits, typically $5 to $25 per review; unavailable on Bedrock, Vertex, Foundry, ZDR, HIPAA or CMEK orgs. Plans: Pro, Max, Ultra. Apps: cli.
- **Codex: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity (one competitor only)). Not stated. Optional deep review is an owner choice.

**With different models, providers and the one subscription.** Would be metered as sandbox plus tokens with a launch dialog showing estimated cost. Not available in Local mode.

**Current implementation, as this trace read it on 2026-11-24: not built.** No deep multi-agent review found by keyword. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: none cited

**Gap.** Not present.

**Acceptance criteria**

1. If built: the launch dialog shows scope and estimated cost before it starts.

**Verification: not verified.** None.

## CAP-coding-workflows-17 Pull request inbox and submit a review from the app

The app lists pull requests to review and lets the person submit Comment, Approve or Request changes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: unknown**
  - no page found in the saved documentation
- **Codex (inside ChatGPT apps): yes**
  - [https://learn.chatgpt.com/docs/code-review.md](https://learn.chatgpt.com/docs/code-review.md): Inbox Assigned to me, my team, Authored by me; submit review Comment, Approve or Request changes; nothing posts until you submit. Apps: desktop, web.
  - [https://help.openai.com/en/articles/20001552-review-pull-requests-with-codex](https://help.openai.com/en/articles/20001552-review-pull-requests-with-codex): Lists PRs you authored or were asked to review with description, diff, findings, checks and merge conflicts. Apps: desktop, web.

**AGI requirement** (proposed; source: competitor parity (one competitor only)). Not stated; one competitor only.

**With different models, providers and the one subscription.** Posting a review is an external write and asks first. Model-neutral.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web: browse and submit review both missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S67.21
- Comparison list ids: W184, W207
- Code: `apps/web/features/code/components/CodeChangesPanel.tsx:152-153`

**Gap.** Both missing on web (W184, W207).

**Acceptance criteria**

1. If built: list the PRs assigned to you; submitting a review shows a confirm naming the effect on GitHub.

**Verification: not verified.** None.

## CAP-coding-workflows-18 Security review of code and pull requests

A scan finds, validates and fixes vulnerabilities in a repo or on each pull request.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (Claude Security): yes**
  - [https://code.claude.com/docs/en/claude-security.md](https://code.claude.com/docs/en/claude-security.md): Security scanning of a repo and of changes with findings and patches (the catalogue lists 17 rows from this page). Apps: web, cli.
- **Codex (Codex Security): yes**
  - [https://help.openai.com/en/articles/20001107-codex-security](https://help.openai.com/en/articles/20001107-codex-security): Codex Security finds, validates and fixes vulnerabilities; CLI, CI and plugin variants are documented under learn.chatgpt.com/docs/security. Apps: web, cli.

**AGI requirement** (inferred; source: competitor parity). A security scan reports findings with location, explains each and proposes a patch the person approves.

**With different models, providers and the one subscription.** Model-neutral; metered on the one subscription; a local scan is allowed with a local model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web scan page exists; per-PR review has a security pass; continuous scans and tracker integration missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S67.22, S67.23
- Comparison list ids: D84, D85, W178, WP153; rows without an id: Security scan that finds, validates and fixes vulnerabilities (Same)
- Code: `apps/web/features/security-scan/components/SecurityScanPage.tsx`; `apps/web/lib/code-review/findings.ts:9`

**Gap.** Continuous scanning (W178) and issue-tracker tracking (D84, D85) missing.

**Acceptance criteria**

1. Scan a repo with a seeded flaw; the finding names file and line.
2. Apply the proposed patch; the finding no longer reports.

**Verification: code inspected only.** No person-run row.

## CAP-coding-workflows-19 Start coding work from GitHub, Slack or issues

A mention on a pull request, issue or Slack message starts a coding task and replies in the thread.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (GitHub mention) and Claude Tag in Slack: yes**
  - [https://code.claude.com/docs/en/claude-tag.md](https://code.claude.com/docs/en/claude-tag.md): Mention @Claude in Slack; it replies in the thread; a bug reported in a channel can come back as a draft pull request; each conversation has an ephemeral sandbox. Plans: Team, Enterprise (beta). Apps: slack.
- **Codex via ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/third-party/slack.md](https://learn.chatgpt.com/docs/third-party/slack.md): Mention @ChatGPT in an enabled channel to delegate repo work to a Codex Cloud task; Allow or Deny card before repo work; results post to the thread. Plans: Business, Enterprise. Apps: slack.

**AGI requirement** (inferred; source: competitor parity). A mention on GitHub starts a coding task; Slack start is a separate choice. Every start shows who may trigger it and what it may touch.

**With different models, providers and the one subscription.** Billed to the account that set it up under the one subscription; model-neutral; Local mode does not apply.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: GitHub mention task built (@agi-workforce). Desktop partial for issue to pull request. Slack start not found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S67.34
- Comparison list ids: DP57; rows without an id: web: Mention the assistant on a GitHub issue or pull request to start a coding task (Same)
- Code: `apps/web/lib/services/cloud-code-github-task.ts:44-47,102`; `apps/web/app/api/github/webhook/route.ts:30-37`

**Gap.** Slack start not found; mobile, CLI and VS Code missing (S67.34).

**Acceptance criteria**

1. Comment the mention on an issue; a branch and a pull request appear.
2. A person without write access cannot trigger it.

**Verification: code inspected only.** No person-run row.

## CAP-coding-workflows-20 Move a session between cloud, terminal, editor and phone

A running coding session continues on another client with its branch and history.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/claude-code-on-the-web.md](https://code.claude.com/docs/en/claude-code-on-the-web.md): claude --teleport, /teleport or Open in > Terminal pulls a cloud session and branch local (clean git state, same repo, pushed branch); the Desktop Code tab can push a local session to the cloud; the CLI hand-off is one way. Apps: cli, web, desktop.
- **Codex: partly**
  - [https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex): The mobile Remote tab accesses supported desktop Codex chats; it does not add them to history and is not the same as cloud environments. Plans: Paid plans. Apps: ios, android, desktop.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 143; docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-22); AGENTS.md section 6). A session moves between local and cloud keeping identity, revision, context, approvals and execution meaning. A local-to-cloud move is an explicit consent fork.

**With different models, providers and the one subscription.** Handoff keeps the same model choice or asks. Cloud side metered under the one subscription. In Local mode nothing moves to cloud without consent and a provider label.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Continue in another client: desktop, mobile, CLI, VS Code done; web missing. Handoff coordinator exists on the platform. Web move is partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S66.41, S99.28, S99.30
- Comparison list ids: WP148
- Code: `apps/web/features/code/code-surface.ts:3`; `docs/decisions/2026-11-13-founder-decisions.md:141`

**Gap.** Web move is partial (WP148; S66.41 web missing).

**Acceptance criteria**

1. Pull a cloud session into a local checkout; its branch and history load.
2. Send a local session to the cloud; a consent screen names the provider and what is uploaded.
3. A dirty tree is refused with a clear reason.

**Verification: code inspected only.** No person-run row.

## CAP-coding-workflows-21 Permission modes in coding sessions

The person sets how much the agent must ask before editing or running commands, including plan mode.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/web-quickstart.md](https://code.claude.com/docs/en/web-quickstart.md): Cloud modes are Auto (classifier), Accept edits and Plan; Manual and Bypass are not offered in cloud. Apps: web, ios, android, desktop, cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/permissions.md](https://learn.chatgpt.com/docs/permissions.md): Permissions and sandbox settings control what Codex may do before asking (the catalogue lists 21 rows from this page). Apps: cli, desktop, ide.

**AGI requirement** (stated requirement; source: docs/product/requirements.md (AGI Code settings include Bypass permissions mode); docs/product/definition.md (VS Code chat, edit and agent modes)). Plan, ask-first and autonomous modes exist and the running session honours them. Bypass is a setting.

**With different models, providers and the one subscription.** Mode logic sits outside the model, so a weaker model cannot widen it. Same on Local and cloud.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Plan mode done on desktop, CLI, VS Code; permission control partial on web, missing on mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S66.24, S66.25, S66.26
- Comparison list ids: WP155; rows without an id: web: Change permission mode for chatting or planning without edits (Same)
- Code: `apps/web/features/code/components/CodeComposer.tsx:1363-1440`

**Gap.** Web partial and plan mode missing on web; mobile missing.

**Acceptance criteria**

1. In plan mode, no file changes before approval.
2. In ask-first mode each command shows an approval card.
3. The mode survives reload.

**Verification: code inspected only.** No person-run row.

## CAP-coding-workflows-22 Repository instruction files in cloud sessions

The agent loads AGENTS.md or CLAUDE.md, skills and agents from the repo.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/claude-code-on-the-web.md](https://code.claude.com/docs/en/claude-code-on-the-web.md): Subagents in the repo .claude/agents load automatically; plugin suggestion cards appear. Apps: web.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/agent-configuration/agents-md.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md.md): AGENTS.md instruction discovery is hierarchical (the catalogue lists 7 rows from this page). Apps: cli, desktop, web.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 137). Every coding session loads the repository instruction files and shows which were read.

**With different models, providers and the one subscription.** Model-neutral text injected into context. Works in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop, mobile, CLI, VS Code done; web ledger says missing while the comparison says cloud sessions read AGENTS.md. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S67.37, S67.38, S67.39
- Comparison list ids: WP161; rows without an id: web: Cloud sessions read AGENTS.md for lint and test commands (Same)
- Code: `packages/contracts/types/src/project-instructions.ts:1-9`

**Gap.** Ledger and comparison disagree for web.

**Acceptance criteria**

1. Add a rule to AGENTS.md; the next session follows it.
2. The session shows the file it read.

**Verification: code inspected only.** No person-run row.

## CAP-coding-workflows-23 Parallel sessions and worktrees

Several coding sessions run at once, each on its own branch or worktree.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/web-quickstart.md](https://code.claude.com/docs/en/web-quickstart.md): Several independent tasks run at once, one session and branch each, without managing worktrees. Apps: web, cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/environments/git-worktrees.md](https://learn.chatgpt.com/docs/environments/git-worktrees.md): Codex works in git worktrees for isolation (the catalogue lists 13 rows from this page). Apps: desktop, cli.

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 141). Concurrent coding work is isolated by branch or worktree.

**With different models, providers and the one subscription.** Model-neutral; worktrees are local, cloud sessions are separate sandboxes each counting usage.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI done; worktree picker missing on web, desktop, mobile, VS Code; platform worktree manager done. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S66.03, S99.16
- Comparison list ids: none matched; rows without an id: web: Several cloud sessions in parallel that keep running when you leave (Same)
- Code: `apps/cli/src/lib.rs:413-415`; `apps/cli/src/lib.rs:4736`

**Gap.** No worktree picker on web, desktop, mobile or VS Code.

**Acceptance criteria**

1. Start two sessions on one repo; each edits its own tree.
2. A clean worktree is removed when the session ends.

**Verification: code inspected only.** No person-run row.

## CAP-coding-workflows-24 Share and archive coding sessions

Share a cloud session with a team or by link, and archive or delete it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/claude-code-on-the-web.md](https://code.claude.com/docs/en/claude-code-on-the-web.md): Team sessions are Private or Team; individual plans Private or Public; archive hides, delete permanently removes with a confirmation. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web.
- **Codex: unknown**
  - [https://help.openai.com/en/articles/20001333-archiving-and-deleting-codex-chats-in-the-chatgpt-app](https://help.openai.com/en/articles/20001333-archiving-and-deleting-codex-chats-in-the-chatgpt-app): Archiving and deleting Codex chats exists; sharing of coding sessions was not shown in the pages read. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-21); AGENTS.md section 9). Only cloud sessions are shared; local sessions stay unshareable. Delete is permanent only from an explicit action naming what is lost.

**With different models, providers and the one subscription.** Sharing exposes the transcript to others; the audience is shown before sharing. No model effect.

**Current implementation, as this trace read it on 2026-11-24: built.** Share: web and desktop done, mobile and VS Code missing. Archive and delete done on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S66.40
- Comparison list ids: none matched; rows without an id: web: Share a coding session (private, team or public) (Same); web: Archive or delete cloud sessions (Same); desktop: Unarchive a code session (Same)
- Code: `packages/contracts/types/src/cloud-code.ts:134`; `apps/web/features/code/components/CodeSessionMenu.tsx:40-65`

**Gap.** none known

**Acceptance criteria**

1. Share to team; a teammate opens it, a non-member cannot.
2. Delete asks and names what is lost.

**Verification: code inspected only.** No person-run row.

## CAP-coding-workflows-25 Scheduled and event-triggered coding routines

Coding work starts on a schedule, API call or GitHub event.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/web-quickstart.md](https://code.claude.com/docs/en/web-quickstart.md): Cloud scheduled tasks via /schedule run on a schedule, by API call or on GitHub events. Apps: web, cli.
- **ChatGPT Work (event tasks on pull request activity): partly**
  - [https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt](https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt): Event-triggered Work tasks on PR opened, ready for review, closed, reviews, comments and merges on github.com repos. Plans: Eligible users. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Coding routines run on a schedule or a GitHub event with approval pauses and a cost cap.

**With different models, providers and the one subscription.** Unattended runs spend subscription usage with no one watching, so a cap and an owner are required. Cloud only.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web partial; general scheduled tasks work (W-16). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP154
- Code: `apps/web/features/code/code-surface.ts:26`

**Gap.** Partial (WP154).

**Acceptance criteria**

1. A schedule starts a coding session at the set time and the result is listed.
2. A GitHub event starts one.

**Verification: seen working by a person.** W-16 subscribed: a one-time Cloud schedule completed and showed 0.2 credits. That was a general scheduled task, not a coding routine.

## CAP-coding-workflows-26 Coordinated projects of many coding threads

One conversation acts as coordinator and starts a cloud coding thread per task.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (Projects): yes**
  - [https://code.claude.com/docs/en/claude-projects.md](https://code.claude.com/docs/en/claude-projects.md): A project is a long-running conversation where Claude coordinates cloud-session threads; gradual rollout; suggested threads list is beta. Plans: Pro, Max, Ultra. Apps: web, desktop, ios, android.
- **Codex: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity (one competitor only)). Not stated. Owner choice.

**With different models, providers and the one subscription.** Fan-out multiplies usage under the one subscription; needs a cap.

**Current implementation, as this trace read it on 2026-11-24: not built.** Projects that start and track many cloud sessions missing on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W195
- Code: none cited

**Gap.** Missing (W195).

**Acceptance criteria**

1. If built: one message produces separate threads that can each be steered.

**Verification: not verified.** None.

## CAP-coding-workflows-27 Shared limits and billing between chat and coding tools

Coding usage counts against the same plan allowance as chat, with usage credits after the limit.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-max-or-ultra-plan](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-max-or-ultra-plan): All activity in Claude and Claude Code counts together toward five-hour and weekly limits; usage credits continue work after limits; an API key variable overrides the subscription. Plans: Pro, Max, Ultra. Apps: cli, ide, web.
- **ChatGPT and Codex: yes**
  - [https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan): Codex is covered by the ChatGPT plan; the current turn can finish after a limit; credits, resets or upgrade follow; Enterprise may bill token-based USD. Plans: Plus through Enterprise. Apps: desktop, cli, web.

**AGI requirement** (stated requirement; source: docs/product/commercial.md; docs/product/definition.md (one subscription system on every app)). One AGI Subscription system gives entitlement, usage and limits to chat and every coding tool, and tells the person which limit was hit.

**With different models, providers and the one subscription.** Own provider keys bypass subscription usage for model cost but not sandbox cost. Local inference is free and not metered. Free users see Upgrade only, not meters.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Usage indicator done on all five coding apps. Web Code is gated to paid plans; Free sees Upgrade. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S66.28
- Comparison list ids: none matched
- Code: `apps/web/lib/e2b/gate.ts:16-30`

**Gap.** A person saw a usage meter on the Free Upgrade page, against the Free-usage rule (W-18 minor defect). The Basic card omits Code while Code says it is included from Basic.

**Acceptance criteria**

1. Free: Code shows Upgrade, no meter.
2. Paid: a coding turn changes the shared usage figure used in chat.
3. At the limit the message names which limit.

**Verification: seen failing by a person.** W-18 free: the Upgrade page showed 'Usage this period 0%' (minor); the Basic card does not list Code.

## CAP-coding-workflows-28 Coding in CI with an action

A vendor action runs the coding agent inside the person's own CI.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/code-review.md](https://code.claude.com/docs/en/code-review.md): Alternatives to the managed service: run Claude in GitHub Actions or GitLab CI with an API key. Apps: other.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/github-action.md](https://learn.chatgpt.com/docs/github-action.md): openai/codex-action runs Codex in GitHub Actions jobs to review PRs or apply patches; only write-access users can trigger by default. Apps: other.

**AGI requirement** (proposed; source: competitor parity). Not stated. The CLI non-interactive mode may cover it; an official action is an owner choice.

**With different models, providers and the one subscription.** Uses the person's own provider key, outside AGI servers.

**Current implementation, as this trace read it on 2026-11-24: unknown.** CLI headless use is named in competitive guidance item 139; no action found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: none cited

**Gap.** Not searched.

**Acceptance criteria**

1. If built: a workflow job reviews a pull request and exits non-zero on a blocker.

**Verification: not verified.** None.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to build an editor-window reader in the chat app like Work with Apps (ChatGPT only in the evidence).
- Whether to build a deep multi-agent cloud review like Ultrareview (Claude only) and what to charge.
- Whether to build a pull-request inbox and Submit review in the app (ChatGPT only).
- Whether to build coordinated Projects that fan out many cloud threads (Claude only).
- Whether to start coding work from Slack, and whether to support GitLab, which ChatGPT lists in beta and Claude does not for cloud.
- Whether to ship an official CI action, or leave CI to the CLI non-interactive mode.
- Which severity words the review uses: Claude uses Important, Nit, Pre-existing; Codex uses P0 and P1; AGI uses blocker, major, minor, nit.
- How the Free plan describes Code: the page says included from Basic; the Basic upgrade card omits Code.
- Whether an unattended coding routine needs a per-user cost cap by default.

## Could not establish

- The saved page text was not opened for the learn.chatgpt.com permissions, agents-md and worktree pages; their rows use catalogue counts only.
- Whether ChatGPT shares Codex cloud sessions: the pages read do not say.
- Plan limits for Codex cloud tasks by plan tier were not extracted.
- Per-app detail for ledger areas 21, 26 and 28 (code blocks, artifacts, code canvas) was not read.
- The comparison CSVs for mobile, CLI, VS Code and Chrome were counted but not read row by row for coding.
- Several comparison rows have no list_id, so they are cited by feature name.
- No person has seen a pull request opened, a review posted, or a worktree or handoff used. The only web Code evidence is W-18: the Free upgrade path works; the paid path is blocked and failing.
- Desktop, phone, CLI, VS Code and Chrome have no human scorecard in the files read.
- Whether Chrome has any coding workflow was not established.
- docs/product/surface-feature-matrix.json was not read.
