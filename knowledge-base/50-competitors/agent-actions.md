---
id: "COMP-agent-actions"
type: "competitor-trace"
title: "Agent actions"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Agent actions: competitors to requirements

Both leaders now offer delegated cloud agents (ChatGPT Work and dots, Claude Cowork and Duet), hosted cloud browsers, computer use with per-app permission, and schedules. AGI has Work, schedules, approvals, Desktop computer use on Mac and a Chrome browser agent. It lacks a cloud browser, an always-on agent, subagents outside the CLI, goal loops, and Windows computer use. Only Web was seen by a person; other apps are code-read only.

**How the products divide this topic.** Evidence read 2026-11-22 from the saved leader catalogue. Claude: Cowork (desktop, web, mobile, Chrome side panel), Claude in Chrome, cloud browser, computer use, Duet (research preview, US waitlist), Claude Tag in Slack. Claude Code is a separate coding tool (code.claude.com) with routines, cloud environments, agent view, teams, workflows and /goal; it connects to chat through the Chrome extension, Desktop and Slack. ChatGPT: Work (cloud or local), cloud browser, desktop built-in browser, Chrome extension, Computer Use, scheduled tasks, workspace agents and dots (always-on cloud agent). Many learn.chatgpt.com pages are shared by ChatGPT Work and Codex (the separate coding tool): subagents, goal mode and automations cover both; CLI and IDE rows are Codex only. ChatGPT agent mode is retired in favour of Work and the cloud browser. Claude Dispatch is closed to new users. Plan limits: ChatGPT cloud browser is paid plans only, Free and Go excluded; dots are Pro tiers, Business Premium and Enterprise, outside the EEA, UK and Switzerland, ages 18 and over. Claude cloud browser is Pro, Max and Ultra and not Team or Enterprise; Claude computer use is a preview or beta by plan. Most items are labelled rolling out, beta or preview, so availability varies by account.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-agent-actions-01](#cap-agent-actions-01) | Delegated multi-step task mode | yes | yes | partly built | seen working by a person |
| [CAP-agent-actions-02](#cap-agent-actions-02) | Plan review, questions and approvals during a run | yes | yes | built | seen working by a person |
| [CAP-agent-actions-03](#cap-agent-actions-03) | Run progress, steering, pause, stop and retry | yes | yes | partly built | seen failing by a person |
| [CAP-agent-actions-04](#cap-agent-actions-04) | Long-running work that continues when the device is off | yes | yes | partly built | seen failing by a person |
| [CAP-agent-actions-05](#cap-agent-actions-05) | Choose where a task runs | partly | yes | partly built | code inspected only |
| [CAP-agent-actions-06](#cap-agent-actions-06) | Parallel subagents and background agents | partly | yes | partly built | code inspected only |
| [CAP-agent-actions-07](#cap-agent-actions-07) | Goal loop with a completion condition | partly | partly | not built | not verified |
| [CAP-agent-actions-08](#cap-agent-actions-08) | Always-on personal agent | partly | yes | not built | not verified |
| [CAP-agent-actions-09](#cap-agent-actions-09) | Custom and workspace agents | partly | yes | partly built | code inspected only |
| [CAP-agent-actions-10](#cap-agent-actions-10) | Scheduled tasks and monitoring | yes | yes | partly built | seen working by a person |
| [CAP-agent-actions-11](#cap-agent-actions-11) | Event-triggered tasks | partly | yes | partly built | code inspected only |
| [CAP-agent-actions-12](#cap-agent-actions-12) | Cloud coding agents and environments | yes | yes | partly built | seen failing by a person |
| [CAP-agent-actions-13](#cap-agent-actions-13) | Delegating from Slack | yes | yes | partly built | code inspected only |
| [CAP-agent-actions-14](#cap-agent-actions-14) | Approval modes and per-tool permission levels | yes | yes | built | seen working by a person |
| [CAP-agent-actions-15](#cap-agent-actions-15) | Cloud browser for the agent | yes | yes | not built | not verified |
| [CAP-agent-actions-16](#cap-agent-actions-16) | Take over and hand back the browser or screen | yes | yes | partly built | code inspected only |
| [CAP-agent-actions-17](#cap-agent-actions-17) | Sign-in and human-check handoff | yes | yes | partly built | code inspected only |
| [CAP-agent-actions-18](#cap-agent-actions-18) | In-app browser pane the agent drives | yes | yes | partly built | code inspected only |
| [CAP-agent-actions-19](#cap-agent-actions-19) | Agent acting in the user's own browser | yes | yes | built | code inspected only |
| [CAP-agent-actions-20](#cap-agent-actions-20) | Website permissions, blocklists and consequential-action checks | yes | yes | partly built | code inspected only |
| [CAP-agent-actions-21](#cap-agent-actions-21) | Site tools (pages that expose actions) | unknown | yes | partly built | code inspected only |
| [CAP-agent-actions-22](#cap-agent-actions-22) | Recorded workflows, shortcuts and scheduled browser tasks | yes | unknown | partly built | code inspected only |
| [CAP-agent-actions-23](#cap-agent-actions-23) | Computer use in desktop apps with per-app permission | yes | yes | partly built | code inspected only |
| [CAP-agent-actions-24](#cap-agent-actions-24) | Computer use safety controls | yes | yes | partly built | code inspected only |
| [CAP-agent-actions-25](#cap-agent-actions-25) | Admin controls for agent browsing, computer use and cloud | yes | yes | partly built | code inspected only |
| [CAP-agent-actions-26](#cap-agent-actions-26) | Visible agent activity, replay and receipts | yes | yes | partly built | code inspected only |
| [CAP-agent-actions-27](#cap-agent-actions-27) | Send a task from phone or web to your own computer | partly | yes | partly built | code inspected only |
| [CAP-agent-actions-28](#cap-agent-actions-28) | Usage accounting and limits for agent runs | yes | yes | partly built | seen failing by a person |

## CAP-agent-actions-01 Delegated multi-step task mode

The user hands over an outcome, and the assistant plans and runs many steps with files, apps and tools, then returns finished deliverables.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork): yes**
  - [https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork): Describe an outcome and Claude plans, runs code in an isolated cloud environment, coordinates sub-agents and delivers finished files (read 2026-11-22). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop, web, mobile, Chrome side panel.
- **ChatGPT (Work): yes**
  - [https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex): Work agent does longer multi-step research and analysis and delivers documents, spreadsheets and presentations; cloud on web and mobile, local with files on desktop (read 2026-11-22). Plans: Eligible paid plans, Enterprise, Edu. Apps: web, iOS, Android, desktop.

**AGI requirement** (inferred; source: competitor parity; docs/product/definition.md says AGI keeps the one-home Chat and Work escalation). A Work mode on every app that has a cloud account lets the user start an agent run from an outcome and receive deliverables.

**With different models, providers and the one subscription.** The run uses any catalog model that passes the tool-use check, and the run records the model. Runs draw on the one AGI Subscription allowance, and the plan gate comes from packages/contracts/types/src/billing-catalog.ts. In Local mode on mobile and desktop there is no cloud Work; the screen must say so and offer sign-in or Upgrade, never route silently to a server.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile, CLI and VS Code have it; the Chrome extension has it only partly. Free accounts cannot use it. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S60.01, S60.02, S60.03, S60.29, S60.30, S60.32
- Comparison list ids: WP120, XP7
- Code: `packages/contracts/types/src/billing-catalog.ts:354`; `apps/web/features/chat/lib/agi-work.ts:32`; `apps/mobile/src/features/chat/components/WorkModeSwitch.tsx:20`; `apps/web/app/tasks/page.tsx:5`

**Gap.** Chrome panel does not run as a full Work session (S60.01 missing there). Free users get no Work switch and no message (seen on Web). Reloading a finished task showed duplicate rows, scaffold text and a live Start work button. docs/product/requirements.md section 20 says Free Cloud execution is enabled; the plan gate in billing-catalog.ts does not match, and the owner has not settled which holds.

**Acceptance criteria**

1. On a paid account, switch to Work, state an outcome, start the run, and receive a result file that downloads.
2. On Free, the Work entry explains why it is unavailable and offers Upgrade or the waitlist.
3. Reload a finished task: no duplicated rows and no live Start button.
4. In Local mode on mobile, Work is hidden or labelled as needing sign-in; no request leaves the device.

**Verification: seen working by a person.** 5-results/basics/scorecards/web.csv W-15 subscribed (partial): plan card, two approvals, result and CSV download worked; reload defects listed in web-problems-seen-in-browser.csv. W-15 free (partial): no Work switch and no message. Other apps: code inspected only.

## CAP-agent-actions-02 Plan review, questions and approvals during a run

The agent shows a plan before acting, can pause to ask a question, and waits for approval of risky steps.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Claude in Chrome, Cowork): yes**
  - [https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide](https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide): In Manually approve mode the classic panel shows an approvable plan with the sites it will use; the Cowork panel asks Allow all for this website, Allow this time only or Deny (read 2026-11-22). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: Chrome.
- **ChatGPT (Work): yes**
  - [https://chatgpt.com/work/](https://chatgpt.com/work/): Plan mode gathers context, asks questions and proposes a step-by-step plan to approve or change (read 2026-11-22). Apps: desktop, web.

**AGI requirement** (inferred; source: competitor parity; docs/product/requirements.md section 9.7 requires approval prompts that show action, target, risk and scope). Before an agent run acts, the user can review and edit the plan; the run pauses for questions and approvals and resumes with the answer.

**With different models, providers and the one subscription.** The plan and approval contract is the same for every model and provider, so a model swap never changes what needs approval. Approval prompts are free of charge and do not consume allowance. In Local mode, approvals gate on-device tools only.

**Current implementation, as this trace read it on 2026-11-24: built.** Done on Web, Desktop, Mobile, CLI and Chrome for the plan; clarification missing on VS Code. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S60.13, S60.18, S60.19, S63.32
- Comparison list ids: none matched
- Code: `packages/contracts/types/src/tool-approval-policy.ts:70`; `apps/mobile/src/features/tasks/components/CloudRunInputForm.tsx:35`; `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:17`

**Gap.** VS Code has no clarification request. A read-only PDF read was labelled high risk when seen on Web.

**Acceptance criteria**

1. Start a Work run, see the plan, edit one step, approve, and the run follows the edited plan.
2. When the agent asks a question, the run stops until you answer, then continues.
3. Deny an approval and the action does not run.

**Verification: seen working by a person.** Scorecard W-15 subscribed: plan card appeared in about 6 s and two Allow-once approvals worked. Defect: wrong risk label on a read-only read.

## CAP-agent-actions-03 Run progress, steering, pause, stop and retry

While a task runs the user sees steps, can redirect it, pause, resume, stop or retry a failed step.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork): yes**
  - [https://claude.com/product/cowork](https://claude.com/product/cowork): Shows files opened, tools used and choices made, and you can redirect anytime (read 2026-11-22). Plans: Paid plans. Apps: desktop.
- **ChatGPT (dots, Work): yes**
  - [https://learn.chatgpt.com/docs/dots/controls.md](https://learn.chatgpt.com/docs/dots/controls.md): Pause halts only the main task; delegated tasks are stopped in Activity and recurring ones in Scheduled; stopping does not undo completed actions (read 2026-11-22). Plans: Rolling out. Apps: desktop, web, iOS, Android.

**AGI requirement** (inferred; source: competitor parity). Every running task can be steered, paused, resumed and stopped, and stopping a run cancels it on the server and says what was already done.

**With different models, providers and the one subscription.** Stop must end metered model calls for any provider at once. A stopped run keeps its usage accounting on the one AGI Subscription. In Local mode, stop halts the on-device model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Steer and cancel done on all but Chrome (unverified). Pause missing on mobile, CLI, VS Code and Chrome. Retry failed step missing on mobile, CLI, VS Code and Chrome. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S60.14, S60.16, S60.20, S60.21, S60.22, S60.23, S60.24
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/tasks/TasksBoard.tsx:44-45`; `apps/mobile/src/features/tasks/CloudTasksScreen.tsx:626`; `packages/ui/unified-chat/src/components/tasks/TaskSteerSection.tsx`

**Gap.** Pause and retry are missing on several apps. Stopping an answer raised a false Agent run failed bell notification, and a stopped run showed every step in red.

**Acceptance criteria**

1. Press Stop on a running task: no further steps or charges appear after 20 seconds, including after a reload.
2. Pause a task, resume it, and it continues from the same step.
3. Stop raises no failure notification.

**Verification: seen failing by a person.** W-15 subscribed: Stop halted cleanly. W-1 free defect: Stop creates an Agent run failed notification. W-15 subscribed defect: stopped run shows red error icons.

## CAP-agent-actions-04 Long-running work that continues when the device is off

A task runs on the provider's servers, keeps going when the app is closed, and can be followed from another device.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork): yes**
  - [https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork): Cloud sessions run on Anthropic servers, follow the account across devices and keep working while away; local files, browser and computer need the desktop app open (read 2026-11-22). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop, web, mobile.
- **ChatGPT (Work): yes**
  - [https://learn.chatgpt.com/docs/browser.md](https://learn.chatgpt.com/docs/browser.md): Work uses its own browser on a separate cloud computer and keeps working when you close your device (read 2026-11-22). Apps: web, iOS, Android.

**AGI requirement** (inferred; source: competitor parity). Cloud tasks keep running when the user's device is off, show live progress, and notify on completion or when input is needed.

**With different models, providers and the one subscription.** Server runs are metered on the one AGI Subscription and need an entitlement check at start and a limit stop mid-run. Anything that needs the user's device (local files, browser) is labelled as device-bound and waits when the device is offline. Local mode runs nothing on servers.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Cloud tasks exist on Web, Desktop and Mobile; Cloud coding tasks failed in testing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S60.34, S65.27
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:340`; `apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:63`

**Gap.** On Web the first turn of every new cloud coding task was cancelled and no live progress showed (W-18).

**Acceptance criteria**

1. Start a cloud task, close the app, and a completion notification arrives with the result.
2. Progress is visible while the task runs.
3. With the paired computer offline, a device-bound step says so and waits instead of failing silently.

**Verification: seen failing by a person.** W-18 subscribed (blocked): first turn of each new cloud task cancelled within about 1 s; no live progress; Run this task again then completed. Defects in web-problems-seen-in-browser.csv.

## CAP-agent-actions-05 Choose where a task runs

The user picks cloud or their own computer for a task, and the product explains the difference.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork): partly**
  - [https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile): Local files, browser use and computer use reach your machine only through Desktop; from Oct 6, 2026 new Pro, Max and Ultra tasks always run in the cloud and an Only on your computer choice was removed (read 2026-11-22). Plans: Pro, Max, Ultra. Apps: desktop, web, mobile.
- **ChatGPT (Work): yes**
  - [https://learn.chatgpt.com/docs/get-started-with-work.md](https://learn.chatgpt.com/docs/get-started-with-work.md): Without local access, Local suits tasks needing the computer and Cloud suits ones such as scheduled website checks (read 2026-11-22). Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md and AGENTS.md section 6 (explicit execution boundaries; Local to cloud only by explicit consent)). The user sees where each task runs (device, AGI cloud, outside service) and can choose it where both exist; a task never moves across a trust boundary without consent.

**With different models, providers and the one subscription.** On-device runs use the local model or BYOK key and do not draw cloud allowance; cloud runs use the one AGI Subscription. Local mode never falls back to cloud silently; a move is an explicit fork with a visible label.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop done; Web, Mobile, CLI, VS Code and Chrome missing the choice. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S60.07, S65.29
- Comparison list ids: DP35, WP124
- Code: `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1062`; `apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:40`

**Gap.** Only Desktop offers the choice. The Web Your computer page needs a paired Desktop link; the phone cannot add a file to a computer session.

**Acceptance criteria**

1. On Desktop, start the same task on this computer and in the cloud; the task card shows which one ran it.
2. On Web, pair a computer and send a task; the page shows where it runs.
3. Take the paired computer offline: the run reports offline instead of hanging.

**Verification: code inspected only.** Comparison rows WP124, DP35 and ledger S60.07. No scorecard step covers it.

## CAP-agent-actions-06 Parallel subagents and background agents

One request splits into several agents working at once, with their own context, results and status.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://code.claude.com/docs/en/agents.md](https://code.claude.com/docs/en/agents.md): Five ways to run work in parallel: subagents, agent view, agent teams, dynamic workflows and projects; chat Cowork also coordinates sub-agents (read 2026-11-22). Apps: CLI, desktop, IDE.
  - [https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork): Cowork coordinates sub-agents and delivers finished files (read 2026-11-22). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop, web, mobile.
- **ChatGPT (Work) and Codex: yes**
  - [https://learn.chatgpt.com/docs/agent-configuration/subagents.md](https://learn.chatgpt.com/docs/agent-configuration/subagents.md): In ChatGPT Work agents run in the hosted environment and the chat shows their activity; the subagents panel is read-only (read 2026-11-22). Custom agent files and CLI commands are Codex. Plans: Eligible accounts. Apps: web, desktop, CLI, IDE.

**AGI requirement** (inferred; source: competitor parity). A parent task can delegate to child agents, and the user can see each child, its role, status, result and cost.

**With different models, providers and the one subscription.** Each child can run on a different model or provider, chosen by the routing registry, and each child's cost is recorded on the one AGI Subscription with a cap on parallel children. In Local mode children run on the local model and only as many as the device can hold.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI done (cap fixed at 7); VS Code partial; Web, Desktop, Mobile and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S60.17, S62.01, S62.02, S62.03, S62.08, S62.16
- Comparison list ids: CP57, CP80, D29, D31, VP31, W158, WP127
- Code: `apps/cli/src/subagent.rs:534`; `apps/cli/src/agents.rs:258`; `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3190-3225`

**Gap.** Cloud Work and Desktop run as one agent; no delegation or child list on Web, Desktop or Mobile; CLI limits are fixed constants.

**Acceptance criteria**

1. On CLI, start a task that spawns subagents and see each one listed with role and state.
2. On Web Work, a task that delegates shows each child's result separately.
3. The child count never exceeds the plan concurrency limit.

**Verification: code inspected only.** Ledger S62 and comparison rows; no scorecard step covers subagents.

## CAP-agent-actions-07 Goal loop with a completion condition

The user states a completion condition and the agent keeps working, checking the condition after each turn, until it is met or judged impossible.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (not the chat product): partly**
  - [https://code.claude.com/docs/en/goal.md](https://code.claude.com/docs/en/goal.md): A condition up to 4,000 characters; a fast model checks it after each turn; works in the CLI and Desktop; shows turns and token spend (read 2026-11-22). Apps: CLI, desktop.
- **Codex (inside the ChatGPT desktop app): partly**
  - [https://learn.chatgpt.com/docs/long-running-work.md](https://learn.chatgpt.com/docs/long-running-work.md): Typing /goal in desktop, CLI or IDE starts a goal whose text is both first prompt and completion criteria; goals keep the same sandbox and approvals (read 2026-11-22). Apps: desktop, CLI, IDE.

**AGI requirement** (proposed; source: competitor parity in the coding tools only; docs/decisions/2026-09-27-founder-decisions.md says features neither leader offers are not built, but both offer this one). A task can carry an explicit completion condition that the agent checks before finishing, with a visible budget.

**With different models, providers and the one subscription.** The condition check is a small extra model call on the same subscription and must count against allowance. It must work with any model and stop on limit. In Local mode the check runs on the local model.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on every app. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S60.11, S60.12
- Comparison list ids: C119, C135, D28
- Code: `apps/cli/src/claude_parity.rs:1005`

**Gap.** No /goal, no completion condition, no time budget. Spend budget exists only on the CLI.

**Acceptance criteria**

1. Set a goal; the run continues across turns and stops with a reason when met.
2. A goal that cannot be met ends with an impossible verdict and a reason.
3. A spending cap ends the run.

**Verification: not verified.** Not built; nothing to test.

## CAP-agent-actions-08 Always-on personal agent

A persistent agent that follows up between conversations, delegates in the background, and reaches out with results.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Duet, research preview): partly**
  - [https://support.claude.com/en/articles/17631495-get-started-with-claude-duet](https://support.claude.com/en/articles/17631495-get-started-with-claude-duet): Message Claude like a person; it runs on its own cloud computer, keeps working after the app closes, and sends a morning brief; no model choice, cannot take over its browser (read 2026-11-22). Plans: Pro, Max, Ultra (US, waitlist). Apps: iOS, Android.
- **ChatGPT (dots): yes**
  - [https://learn.chatgpt.com/docs/dots.md](https://learn.chatgpt.com/docs/dots.md): Always-on cloud agent that runs even when your computer is off, uses background agents and reaches out with results; Pro tiers, Business Premium, Enterprise; ages 18 and over outside EEA, UK, Switzerland (read 2026-11-22). Plans: Pro 100/200/500, Business Premium, Enterprise. Apps: iOS, Android, desktop, web.

**AGI requirement** (proposed; source: competitor parity). Not decided; if built, an always-on agent runs only in Managed Cloud, shows its own rules for acting without asking, and can be paused or deleted.

**With different models, providers and the one subscription.** It must route per task across providers, charge background work to the one AGI Subscription with a visible cap, and never exist in Local mode, which has no cloud runtime.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on Web and Mobile; scheduled tasks and event triggers are the nearest. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S61.01, S61.07, S61.11, S61.12
- Comparison list ids: D37, M60, M69, M71, W139, W154, W155
- Code: `apps/web/features/schedules/components/ScheduleForm.tsx:312`

**Gap.** No persistent agent, roster, presence, daily brief or per-agent rules. Roster items S61.* are done only in the CLI.

**Acceptance criteria**

1. Not applicable until the owner decides.

**Verification: not verified.** Not built.

## CAP-agent-actions-09 Custom and workspace agents

Users or teams build named agents with instructions, tools and schedules, share them, and start them from chat, Slack or an API call.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (plugins) and Claude Code (subagent files): partly**
  - [https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork): Plugins bundle skills, connectors and sub-agents, saved to the account and used in chat, Claude Code and Cowork (read 2026-11-22). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop, web.
- **ChatGPT (workspace agents): yes**
  - [https://help.openai.com/en/articles/20001143-chatgpt-workspace-agents-for-enterprise-and-business](https://help.openai.com/en/articles/20001143-chatgpt-workspace-agents-for-enterprise-and-business): Build from template or conversation, preview, schedule, API trigger that returns 202 with a conversation URL, run by @ mention, version history, analytics (read 2026-11-22). Plans: Business, Enterprise. Apps: web, Slack.

**AGI requirement** (inferred; source: competitor parity). Users can build, version, share and trigger custom agents; an agent can only use the connectors and actions its owner allowed.

**With different models, providers and the one subscription.** An agent stores a model preference or Auto and runs on any provider; its runs and API triggers are metered on the owner's AGI Subscription. Local mode can run an agent only with on-device tools.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web Agents page builds, versions and publishes; mobile lists and edits. Persistent roster items are CLI only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S61.02, S61.04, S61.05, S63.09
- Comparison list ids: W143, W156, W163, WP128, WP129, WP139
- Code: `apps/web/features/agents/components/AgentPublishPanel.tsx:217`; `apps/web/shared/components/layout/app-nav-items.ts:171`

**Gap.** No @ mention to run an agent in any chat, no duplicate, no per-action limits in each connector, no admin switch for who may build or publish.

**Acceptance criteria**

1. Create an agent, restrict it to one connector, run it, and see the other connectors refused.
2. Start an agent run by an API call with a scoped token.
3. Restore an earlier agent version.

**Verification: code inspected only.** Comparison rows; no scorecard step covers agents.

## CAP-agent-actions-10 Scheduled tasks and monitoring

Prompts that run once or on a repeat, in the cloud, with run history, notifications and tasks that watch for changes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork) and Claude Code: yes**
  - [https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork): Hourly, daily, weekly, weekdays or on demand; each run is its own session; runs remotely even with the computer off; a Scheduled page to pause, resume, run now, edit (read 2026-11-22). Claude Code has separate cloud routines, desktop schedules and /loop. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop, web, mobile.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): One-time, recurring and monitoring tasks that notify on changes and stop at an end condition, managed from a Scheduled page (read 2026-11-22). Plans: Free, Go, Plus, Pro, Business, Enterprise, Edu. Apps: web, iOS, Android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 20 (cloud routine, run history, pause, resume, delete, notification, permission review)). Users create, run now, pause, edit and delete schedules; runs ask for approval when needed; missed runs are explained.

**With different models, providers and the one subscription.** A schedule stores a model or Auto and works on any provider; each run is metered on the one AGI Subscription, with plan caps on active schedules owned by billing-catalog.ts. A run held by an exhausted allowance should wait for the reset. In Local mode only local desktop schedules on this computer apply.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop, Mobile and Chrome have it. Schedule cap by plan; Free has none. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.02, S63.11, S63.12, S63.14, S63.19, S63.20, S63.21, S63.22, S63.24, S63.25, S63.27, S63.28, S63.31, S63.34
- Comparison list ids: M75, MP45, MP47, MP49, MP50, MP51, MP52, W166, W168, W171, WP119, WP134, WP136, XP6
- Code: `apps/web/app/api/cron/run-schedules/route.ts:11`; `apps/web/features/schedules/components/ScheduleForm.tsx:312`; `apps/mobile/app/(app)/schedules/index.tsx:42`

**Gap.** Missing: pause until a date, duplicate, deferred run after allowance reset, connection-expiry repair, team shared tasks, scheduling from inside a chat, publishing an artifact from a run. Per-routine effort (S63.10) was ruled not to be built by D-2026-09-27-02, yet cc16:102 in the leader catalogue shows Claude Code routines choose effort.

**Acceptance criteria**

1. Create a one-time schedule; it runs once and shows Completed, not Paused.
2. On Free, Scheduled shows an Upgrade or waitlist path and no create control.
3. A recurring schedule shows next and last run.
4. A schedule waiting for approval shows Approve and Deny.

**Verification: seen working by a person.** W-16 subscribed (partial): one-time cloud schedule ran once, result shown; defect: Completed card also labelled Paused. W-16 free (partial): clear Upgrade path; chat reply to schedule request has no Upgrade pointer.

## CAP-agent-actions-11 Event-triggered tasks

A task starts when something happens in a connected service (new email, Slack message, pull request, webhook).

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (routines): partly**
  - [https://code.claude.com/docs/en/routines.md](https://code.claude.com/docs/en/routines.md): Cloud tasks start from a schedule, an API call with bearer token, or GitHub pull request, release and issue events, with filters (read 2026-11-22). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, CLI, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Tasks run on new Gmail mail, Slack channel messages or GitHub pull request activity, with Trigger, Condition and Prompt; approvals may pause them (read 2026-11-22). Plans: Plus, Pro, Business, Enterprise, Edu. Apps: web, iOS, Android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 20 (automations) and ledger S63.15 to S63.17). A task can start from a connected-service event or a signed webhook, with filters, and obeys the same approvals as other runs.

**With different models, providers and the one subscription.** Event content is untrusted input for any model. Triggered runs are metered on the one AGI Subscription with a per-trigger cap, so an event flood cannot drain allowance. Not available in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, Desktop and CLI done; Mobile and Chrome missing the trigger setup. Gmail and Calendar triggers are not fully there. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.15, S63.16, S63.17, S63.18
- Comparison list ids: WP121, WP123
- Code: `apps/web/lib/triggers/trigger-types.ts:24`; `apps/web/features/schedules/components/ScheduleTriggersPanel.tsx:59`

**Gap.** Triggers cover GitHub, Slack and webhooks fully; events from other connected apps are not covered.

**Acceptance criteria**

1. Post a signed webhook; a run starts and appears in history.
2. A filter that does not match starts no run.
3. An event run that needs approval pauses until approved.

**Verification: code inspected only.** Comparison row WP123; no scorecard step covers triggers.

## CAP-agent-actions-12 Cloud coding agents and environments

Coding tasks run in a hosted environment with repositories, network access level and secrets, reachable from phone and web.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (cloud sessions, routines): yes**
  - [https://code.claude.com/docs/en/cloud-environments.md](https://code.claude.com/docs/en/cloud-environments.md): Each cloud session runs in an environment with configurable network access, variables, network secrets and a setup script; used by desktop, mobile, web and CLI (read 2026-11-22). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, iOS, Android, CLI.
- **Codex cloud, started from ChatGPT dots: yes**
  - [https://learn.chatgpt.com/docs/dots/tasks-and-memory.md](https://learn.chatgpt.com/docs/dots/tasks-and-memory.md): A dot can start cloud coding tasks in a Codex cloud environment you have already set up; your computer can be offline (read 2026-11-22). Apps: desktop, web, iOS, Android.

**AGI requirement** (inferred; source: competitor parity). Cloud coding tasks run in a sandbox with a chosen network level, repository and optional secrets, and results come back as a branch or pull request.

**With different models, providers and the one subscription.** The coding agent uses any capable model; sandbox time and tokens count on the one AGI Subscription. Secrets are never shown to the model. Local mode uses the local developer host instead.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web Code page and CLI cloud sessions exist; saved environments, secrets and the CLI environment picker are missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.07
- Comparison list ids: C113, C114, C128, W169, W175, WP122
- Code: `apps/cli/src/lib.rs:1163`; `apps/web/features/code/components/LocalSessionPanel.tsx:1806`

**Gap.** Each session gets one network level and no secrets. No self-hosted runners.

**Acceptance criteria**

1. Start a cloud coding task on a repository and receive a branch or pull request.
2. Set network access to none and confirm the task cannot fetch a URL.
3. Cancel the task and see no further commits.

**Verification: seen failing by a person.** W-18 subscribed (blocked): no GitHub App on the test machine, so no repository could be listed; the first turn of two repository-less cloud tasks was cancelled.

## CAP-agent-actions-13 Delegating from Slack

Tag the assistant in a Slack channel to delegate work; it replies in thread with progress and can follow up.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Claude Tag) and Claude Code: yes**
  - [https://support.claude.com/en/articles/15594475-what-is-claude-tag](https://support.claude.com/en/articles/15594475-what-is-claude-tag): Tag @Claude in Slack channels to do work; it keeps channel context, schedules follow-ups and checks in proactively (read 2026-11-22). Plans: Team, Enterprise. Apps: Slack.
  - [https://code.claude.com/docs/en/slack.md](https://code.claude.com/docs/en/slack.md): Code and Chat routing modes start a Claude Code session from a mention (read 2026-11-22). Plans: Pro, Max, Ultra. Apps: Slack.
- **ChatGPT (workspace agents): yes**
  - [https://help.openai.com/en/articles/20001143-chatgpt-workspace-agents-for-enterprise-and-business](https://help.openai.com/en/articles/20001143-chatgpt-workspace-agents-for-enterprise-and-business): Add the agents app to a channel, connect an agent with its own handle, and choose reply to every message or only on mention (read 2026-11-22). Plans: Business, Enterprise. Apps: Slack.

**AGI requirement** (inferred; source: competitor parity). Mentioning the assistant in Slack starts a run under the channel's tools and approvals, with approve and cancel in Slack.

**With different models, providers and the one subscription.** Slack text is untrusted input. Runs use the workspace's AGI Subscription allowance and any provider. Not available in Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web settings; Slack tasks run Work, not coding sessions. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W141, W142, W167, WP125, WP138
- Code: `apps/web/lib/slack/slack-assistant-turn.ts:110`; `apps/web/lib/slack/slack-channel-policies.ts`

**Gap.** No coding session from Slack, no standing digests or channel watching, no Linear triage hand-off.

**Acceptance criteria**

1. Mention the assistant in a channel and receive an in-thread result.
2. A run needing approval posts Approve and Deny buttons.
3. A channel set to off ignores mentions.

**Verification: code inspected only.** Comparison rows; no scorecard step covers Slack.

## CAP-agent-actions-14 Approval modes and per-tool permission levels

The user chooses whether the agent asks for every action, only risky ones, or none, and sets permission per tool or connector.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork, Claude in Chrome): yes**
  - [https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork): Manual asks before each action, Auto reviews each action with a safety check, Skip does no checks; connector tools can be Always allow, Needs approval, Always ask or Blocked (read 2026-11-22). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop, web.
- **ChatGPT (Work): yes**
  - [https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security.md](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security.md): App permissions choose when ChatGPT asks: Always ask, Any changes, Important actions or Never ask; some high-risk actions can still be blocked (read 2026-11-22). Plans: Business, Enterprise, Edu. Apps: web, desktop, iOS, Android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 9.7 and section 21.4 (high-impact confirmations, no sensitive action without approval)). Three approval modes plus per-tool Allow, Ask or Deny, enforced in a tool-call gate; some actions always ask in every mode.

**With different models, providers and the one subscription.** The gate runs outside the model so no provider can bypass it. An automatic safety check must not bill the user separately without disclosure. In Local mode the gate applies to on-device tools.

**Current implementation, as this trace read it on 2026-11-24: built.** Same on Web, Mobile and Chrome; Chrome Auto and Full access are partial against the leaders' wording. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S60.19, S63.32, S65.23
- Comparison list ids: DP29, XP10, XP11, XP20, XP24
- Code: `packages/contracts/types/src/tool-approval-policy.ts:70`; `apps/web/features/connectors/components/ToolPermissionsPanel.tsx`; `apps/mobile/src/features/chat/components/ComposerApprovalModeControl.tsx:21`

**Gap.** No notice when Auto is on in Chrome; no free-text standing rules; no per-chat approval for sending messages.

**Acceptance criteria**

1. Set Ask before every action; every tool call prompts.
2. Set a connector tool to Deny; the agent cannot call it.
3. Changing a permission setting asks in every mode.

**Verification: seen working by a person.** W-15 subscribed: Allow-once approvals worked. Other modes: code inspected only.

## CAP-agent-actions-15 Cloud browser for the agent

The agent uses its own hosted browser on a server, so it can read, click and type on sites while the user's device is off.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/18442783-use-the-cloud-browser-in-claude](https://support.claude.com/en/articles/18442783-use-the-cloud-browser-in-claude): Claude browses in a server-side browser shown as a card in chat; not on Free, Team or Enterprise (read 2026-11-22). Plans: Pro, Max, Ultra (beta). Apps: web, desktop, iOS, Android.
- **ChatGPT (Work): yes**
  - [https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt](https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt): Work gets its own remote browser to read pages, click and fill forms; it keeps running after the user leaves and pauses for input, sign-in or confirmation (read 2026-11-22). Plans: Plus, Pro, Business, Enterprise, Edu. Apps: web, iOS, Android.

**AGI requirement** (inferred; source: competitor parity). Cloud agents can browse in a hosted browser with per-site permission and a visible replay.

**With different models, providers and the one subscription.** The hosted browser must be provider independent and metered on the one AGI Subscription. Page content is untrusted. Local mode has no hosted browser; it can only use the on-device browser, and the UI must say which one runs.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on Web and Mobile; Desktop has none either. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S64.19
- Comparison list ids: M59, M61, M62, M63, M66, M77, M79, W140, W174
- Code: `apps/web/features/desktop-host/components/BrowserPaneSettings.tsx`

**Gap.** Cloud Work only uses search and page reading. No hosted browser, site settings, cookie list or card in the task.

**Acceptance criteria**

1. Not applicable until the owner decides; if built, a cloud task opens a page, fills a form and shows a replay.

**Verification: not verified.** Not built.

## CAP-agent-actions-16 Take over and hand back the browser or screen

The user takes control of the agent's browser or computer to finish a step, then returns control and the agent continues.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/18442783-use-the-cloud-browser-in-claude](https://support.claude.com/en/articles/18442783-use-the-cloud-browser-in-claude): Take control to sign in or finish a step; Hand back returns control; control also returns on a time limit (read 2026-11-22). Plans: Pro, Max, Ultra (beta). Apps: web, desktop, mobile.
- **ChatGPT (Work, dots): yes**
  - [https://learn.chatgpt.com/docs/browser.md](https://learn.chatgpt.com/docs/browser.md): If blocked you can take control of Work's computer on mobile and desktop (read 2026-11-22). Apps: web, iOS, Android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 21.4 (manual takeover path)). The user can take over a running browser or computer task, then hand back without ending the run.

**With different models, providers and the one subscription.** Control handoff is local logic, independent of provider. While the user holds control the model is not called. Local mode can offer it on the same computer.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Chrome and Desktop computer use done; Web, Mobile, CLI and VS Code missing; Chrome side panel hand back works. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S64.23, S64.24, S65.21, S65.22
- Comparison list ids: M78, W170, WP141
- Code: `apps/web/features/desktop-host/components/ComputerUseControlBar.tsx`; `apps/extension/src/features/side-panel/bubbles.ts:1520`

**Gap.** S64.23 and S64.24 are missing on every app including Chrome; the Chrome extension row is listed Same elsewhere. No take over for a cloud browser.

**Acceptance criteria**

1. Take over mid-task, type input, hand back, and the task resumes.
2. If control is not handed back in time the task ends with a clear message.
3. Stop ends everything.

**Verification: code inspected only.** Comparison rows and ledger; no scorecard step covers it.

## CAP-agent-actions-17 Sign-in and human-check handoff

When a site needs a login or a CAPTCHA, the agent pauses so the user can finish it, ideally without the model seeing the credentials.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Claude in Chrome): yes**
  - [https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome): Claude can ask 1Password for a login approved by biometrics without seeing the password or code; beta on macOS (read 2026-11-22). Claude Code in Chrome pauses for logins or CAPTCHAs. Plans: Paid plans. Apps: Chrome.
- **ChatGPT (Work cloud browser): yes**
  - [https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt](https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt): A secure form sends credentials straight to the remote browser, unseen by the model and not stored; a review model checks for phishing first; 2FA supported (read 2026-11-22). Plans: Paid plans. Apps: web, iOS, Android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 21.4 (no sensitive action without approval; manual takeover path)). The agent pauses at sign-in or human checks, never solves a CAPTCHA, and credentials never enter model context.

**With different models, providers and the one subscription.** Credentials must be kept out of any provider payload, as for BYOK disclosure. The pause is free. Local mode keeps all sign-ins on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Chrome done; Desktop, Web, Mobile, CLI, VS Code missing. No password manager sign-in. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S64.21, S64.22, S65.24
- Comparison list ids: D30, MP53, X13
- Code: `apps/extension/src/features/computer-use/agentLoop.ts:1086`; `apps/extension/src/features/computer-use/escalationEngine.ts:73`

**Gap.** No secure sign-in form, no saved login with confirmation, no password manager.

**Acceptance criteria**

1. At a sign-in page the agent stops and asks you to sign in; after you finish it continues.
2. At a CAPTCHA the agent asks you and never tries to solve it.
3. The typed password is absent from the model transcript.

**Verification: code inspected only.** Comparison rows; the Chrome extension was not run by a tester.

## CAP-agent-actions-18 In-app browser pane the agent drives

A browser inside the desktop app, shared with the assistant, with tabs, its own profile, and clear-data controls.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork): yes**
  - [https://support.claude.com/en/articles/16607400-use-the-built-in-browser-in-claude-cowork](https://support.claude.com/en/articles/16607400-use-the-built-in-browser-in-claude-cowork): Cowork opens a browser in the side panel; Claude navigates, reads, clicks, types and fills forms while you watch; cookies can be imported from other browsers; asks permission the first time on a site (read 2026-11-22). Plans: Pro, Max, Ultra, Team, Enterprise (beta). Apps: desktop, web and mobile when Desktop is online.
- **ChatGPT desktop app (Work and Codex): yes**
  - [https://learn.chatgpt.com/docs/browser.md](https://learn.chatgpt.com/docs/browser.md): Built-in browser with its own profile, tabs, annotation and site permissions; Work and Codex open pages, click, type and verify with @Browser; it cannot automate file uploads (read 2026-11-22). Apps: desktop.

**AGI requirement** (inferred; source: competitor parity). The desktop app has a browser pane the agent can drive, with site allow and block lists and clear-data controls.

**With different models, providers and the one subscription.** The pane is on-device and works with any model; its page text is untrusted. In Local mode the pane may be used with the local model, and nothing is sent to servers unless the user moves the chat.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop pane exists only inside a coding session; agent browser work drives the user's own Chrome through the paired extension. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S64.30, S64.31
- Comparison list ids: D39, D40, D41, D43, D44, D45, DP39, WP140, WP143
- Code: `apps/desktop/electron/browserPane.ts`; `apps/web/features/desktop-host/components/BrowserPaneSettings.tsx:23-46`

**Gap.** No tabs, no agent control of the pane, no page annotation, no import of sign-ins.

**Acceptance criteria**

1. Ask the agent to open a page in the pane and watch it click.
2. Clear browsing data removes cookies and sign-ins.
3. A blocked site is refused.

**Verification: code inspected only.** Comparison rows; the Desktop app was not part of the Web scorecard.

## CAP-agent-actions-19 Agent acting in the user's own browser

A browser extension lets the assistant read and act in the user's regular tabs and signed-in sites.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Claude in Chrome); also Claude Code through the same extension: yes**
  - [https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome): A Chrome-only extension lets Claude read, click, type, navigate and fill forms, with multi-tab control in a tab group and background tasks (read 2026-11-22). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: Chrome.
  - [https://code.claude.com/docs/en/chrome.md](https://code.claude.com/docs/en/chrome.md): Claude Code connects through the extension to share logged-in state (read 2026-11-22). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: CLI, VS Code, Chrome.
- **ChatGPT (Work, Codex) with the browser extension: yes**
  - [https://learn.chatgpt.com/docs/chrome-extension.md](https://learn.chatgpt.com/docs/chrome-extension.md): Extension for Chrome, Edge, Brave, Opera and Vivaldi lets ChatGPT read and act in regular tabs and signed-in sites from the desktop app (read 2026-11-22). Apps: desktop, Chrome.

**AGI requirement** (stated requirement; source: docs/product/requirements.md Chrome section (page automation, ask and act modes, per-site prompts, prompt-injection defenses) and definition.md (Chrome is Cloud-only)). The Chrome extension runs multi-step browser tasks in the user's tabs with visible state, and also serves the desktop and CLI agents.

**With different models, providers and the one subscription.** Model choice for browser work comes from the Managed Cloud model picker; tasks are metered on the one AGI Subscription. The extension needs sign-in, so there is no Local mode there; browser data must not enter global memory by default.

**Current implementation, as this trace read it on 2026-11-24: built.** Chrome has most actions; the Web app cannot hand a task to the extension; CLI and Desktop reach it only through the paired Desktop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S64.10, S64.15, S64.16, S64.18, S64.32
- Comparison list ids: CP87, CP89, W176, X16, XP17, XP18, XP30, XP9
- Code: `apps/extension/src/features/computer-use/chatBrowserTools.ts:22`; `apps/extension/src/features/computer-use/browserToolDefinitions.ts:445`; `apps/extension/src/features/native-bridge/pairing.ts`

**Gap.** Works only in Chrome-built browsers (published to Edge). No background errands, Web chat cannot use the tabs, CLI has no install prompt or per-site permission, no JavaScript run on the page by design.

**Acceptance criteria**

1. Ask the extension to fill a form on an approved site and it does so without submitting.
2. Close the side panel and see the task state; notification on finish.
3. A blocked site is never read.

**Verification: code inspected only.** Comparison rows; the extension was not run by a tester.

## CAP-agent-actions-20 Website permissions, blocklists and consequential-action checks

The user decides which sites the agent may use, with blocked categories and extra confirmation before payments or deletion.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Claude in Chrome): yes**
  - [https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide](https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide): Changing permissions, authorizations, sensitive input and permanent deletion need approval in every mode; Claude never makes purchases or creates accounts (read 2026-11-22). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: Chrome.
- **ChatGPT desktop app and Work cloud browser: yes**
  - [https://learn.chatgpt.com/docs/browser.md](https://learn.chatgpt.com/docs/browser.md): Per-site permissions with exceptions; confirmation for submitting data, purchases, permission changes or deletion; org can restrict (read 2026-11-22). Apps: desktop, web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 21.4 (site and app prompts, allow and block lists, high-impact confirmations, logs and audit trail)). Per-site allow, decline and block lists, high-impact confirmation, and an audit trail on every browser surface.

**With different models, providers and the one subscription.** Rules are enforced by the harness, not the model, so they hold for every provider. Local mode keeps the lists on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Chrome built; Desktop pane built; Web and Mobile missing; CLI partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S64.26, S64.27, S64.28, S64.29
- Comparison list ids: CP88, DP40, DP43, W144, WP142, X11, X15, XP16, XP19, XP22, XP23, XP25
- Code: `apps/extension/src/features/computer-use/approvalPolicy.ts:40`; `apps/extension/src/features/computer-use/approvalPolicy.ts:435-440`

**Gap.** Banking, payment and adult sites are not blocked by default; purchases are refused only in code paths; no allow-for-all-sites choice; Web has no extra check for payments.

**Acceptance criteria**

1. A banking site asks before any action.
2. A blocked site is never read.
3. A payment step does not complete without a human click.

**Verification: code inspected only.** Comparison rows; no tester ran it.

## CAP-agent-actions-21 Site tools (pages that expose actions)

A website exposes predefined actions that the agent calls instead of clicking through the page.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT desktop app (Work and Codex): yes**
  - [https://learn.chatgpt.com/docs/webmcp.md](https://learn.chatgpt.com/docs/webmcp.md): Sites expose actions through the proposed WebMCP standard; each call gets a safety review (read 2026-11-22). Plans: Preview. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity (ChatGPT only)). The agent may call page-declared tools with approval; each call is reviewed and logged.

**With different models, providers and the one subscription.** The tool schema is provider independent. Each call needs approval; site instructions cannot authorize sharing. Local mode keeps the page session on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Chrome partial; Desktop partial; CLI, VS Code, Web missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S64.17
- Comparison list ids: DP45, XP29
- Code: `apps/extension/src/features/computer-use/browserToolDefinitions.ts:72-95`; `apps/extension/src/features/tools/browserAgentSiteTools.ts:9`

**Gap.** The leader has an address bar menu of available tools and an off switch; we have discovery only on approved sites.

**Acceptance criteria**

1. On an approved site that declares a tool, the agent calls it and shows an approval.
2. The user can turn site tools off.

**Verification: code inspected only.** Comparison row XP29.

## CAP-agent-actions-22 Recorded workflows, shortcuts and scheduled browser tasks

The user records or saves a browser routine as a shortcut and can schedule it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Claude in Chrome): yes**
  - [https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome): Record browser steps and save them as a shortcut Claude replays, but only in the classic panel; shortcuts can run on a daily, weekly, monthly or annual schedule (read 2026-11-22). Plans: Paid plans. Apps: Chrome.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity (Claude only)). Saved shortcuts run in the browser, and recorded steps can be scheduled.

**With different models, providers and the one subscription.** A replay runs without a model when steps are literal and with the user's model when it needs judgment. Scheduled replays are metered on the one AGI Subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Chrome shortcuts built; recording partial; scheduling a shortcut is dead code. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S63.03
- Comparison list ids: DP34, X10, X9, XP8
- Code: `apps/extension/src/features/side-panel/schedulesSection.ts:447`

**Gap.** Typed values optional and passwords not recorded; scheduling saved shortcuts missing; no GIF export.

**Acceptance criteria**

1. Record two steps on a page, save, and replay them.
2. Schedule the shortcut and see it run at the set time.

**Verification: code inspected only.** Comparison rows XP8, X10.

## CAP-agent-actions-23 Computer use in desktop apps with per-app permission

The assistant sees the screen and clicks and types in desktop apps after the user approves each app.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork, Claude Code): yes**
  - [https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork): Claude clicks, types and opens apps on macOS and Windows in Desktop when no connector exists; order of preference is connectors, then browser, then screen (read 2026-11-22). Plans: Pro, Max, Ultra (beta Team, Enterprise). Apps: desktop; web and mobile when Desktop is open.
- **ChatGPT desktop app (Work and Codex): yes**
  - [https://learn.chatgpt.com/docs/computer-use.md](https://learn.chatgpt.com/docs/computer-use.md): ChatGPT can see and operate graphical interfaces on macOS or Windows; asks before using an app; Always allow remembers an app and can be revoked (read 2026-11-22). Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md (precision order) and docs/product/requirements.md section 21.4). Prefer a connector, then browser automation, then screen control; screen control needs per-app permission, an allow list, a refuse list and a stop control.

**With different models, providers and the one subscription.** Screen control needs a model that passes a vision and tool-use check; model_catalog gating decides which models qualify. Screenshots go to the chosen provider only after consent; on Local with the local model they stay on the device. Capability gating by plan is in model-catalog.ts, and Free is excluded today.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop on Mac is built; Windows missing; CLI missing; Chrome built for browser; Linux not offered, as for both leaders. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S65.01, S65.02, S65.03, S65.04, S65.06, S65.12, S65.13, S65.14, S65.15, S65.16, S65.27
- Comparison list ids: C147, D27, DP25, DP26
- Code: `apps/web/features/desktop-host/components/ComputerUseSettings.tsx:161-250`; `apps/desktop/electron/runtime/computerUseService.ts:222-260`; `apps/desktop/electron/runtime/computerUseSession.ts:357`

**Gap.** Windows computer use is missing; no native file-dialog support; window selection missing.

**Acceptance criteria**

1. Turn on Computer use; the app asks for the two macOS permissions with a link.
2. Ask the agent to act in an app; it asks for that app first.
3. A refused app is never touched.

**Verification: code inspected only.** Comparison rows and ledger S65; no tester drove Desktop in the Web scorecard.

## CAP-agent-actions-24 Computer use safety controls

Extra limits on screen control: background mode, view-only tiers for browsers, blocked categories, input arbitration, emergency stop.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork): yes**
  - [https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork): Browsers and many trading apps are view-only, terminals and editors click and scroll only; a user blocklist; background mode on macOS 15 and later (read 2026-11-22). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: desktop.
- **ChatGPT desktop app: yes**
  - [https://learn.chatgpt.com/docs/computer-use.md](https://learn.chatgpt.com/docs/computer-use.md): Cannot automate terminal apps or ChatGPT itself, cannot approve admin prompts; on macOS a scoped task can run in the background; you can stop or take over any time (read 2026-11-22). Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 21.4 (clear visible state, manual takeover)). The user can stop computer control at once, the agent yields on user input, and the screen state is always visible.

**With different models, providers and the one subscription.** Safety logic runs in the host and is independent of model and provider.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop: arbitration, stop and indicators done; tiers, trading-app block, window selection, background mode missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S65.05, S65.07, S65.09, S65.10, S65.18, S65.19, S65.20, S65.25, S65.26, S65.28
- Comparison list ids: D32, D33, D36, DP36
- Code: `apps/desktop/electron/appMenu.ts:197-212`; `apps/desktop/electron/tray.ts:141-163`

**Gap.** Allowed apps get full mouse and keyboard control; the refuse list starts empty; the stop chord is partial.

**Acceptance criteria**

1. Press Stop; mouse control ends immediately.
2. Move the mouse; the agent yields.
3. A revoked permission stops the agent and says how to restore it.

**Verification: code inspected only.** Comparison rows; not run by a tester.

## CAP-agent-actions-25 Admin controls for agent browsing, computer use and cloud

Administrators turn agent browsing, computer use and cloud computers on or off and restrict sites, uploads and downloads.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork): Admins can disable Auto mode; Team and Enterprise owners can turn off web search for Cowork and Chat (read 2026-11-22). Plans: Team, Enterprise. Apps: web, desktop.
- **ChatGPT (Work, Codex): yes**
  - [https://help.openai.com/en/articles/20001510-manage-browser-and-computer-use-in-your-enterprise-workspace](https://help.openai.com/en/articles/20001510-manage-browser-and-computer-use-in-your-enterprise-workspace): Admins set policies to disable the in-app browser, Browser Use or native-app control, with per-origin rules for access, uploads, downloads and developer access (read 2026-11-22). Plans: Enterprise. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity; entitlements belong to the one AGI Subscription). Workspace admins can switch Work, browser, computer use, schedules and event triggers on or off, and limit sites.

**With different models, providers and the one subscription.** Controls are enforced server-side for every provider. They never grant access the plan lacks.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web switches built; site, upload and download limits partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: DP38, W144, WP126
- Code: `packages/contracts/types/src/enterprise/workspace-controls.ts:45-46,127`

**Gap.** No workspace-wide site blocklist; cloud and local Work cannot be allowed separately.

**Acceptance criteria**

1. An admin turns off Browser; members cannot start browser tasks.
2. An admin blocks a site; the agent refuses it.

**Verification: code inspected only.** Comparison rows.

## CAP-agent-actions-26 Visible agent activity, replay and receipts

The user can see what the agent did: action list, screenshots, live view or replay.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Cowork): yes**
  - [https://claude.com/product/cowork](https://claude.com/product/cowork): Shows files opened, tools used and choices made (read 2026-11-22). Plans: Paid plans. Apps: desktop.
- **ChatGPT (Work): yes**
  - [https://learn.chatgpt.com/docs/enterprise/chatgpt-work-overview.md](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-overview.md): Users can inspect page screenshots and a browser replay in the conversation (read 2026-11-22). Plans: Business, Enterprise, Edu. Apps: web, desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 21.4 (logs and audit trail, visible state)). Every browser or computer action leaves a visible record with its outcome, and the record is kept for audit.

**With different models, providers and the one subscription.** Records are produced by the harness for any provider; screenshots in the record follow the privacy and deletion controls of the plan. In Local mode records stay on the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Timeline built on Desktop, CLI, VS Code and Chrome; live preview only on Chrome. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S64.18, S64.19, S64.20, S65.25
- Comparison list ids: XP19
- Code: `apps/extension/src/features/side-panel/bubbles.ts:695`

**Gap.** No live browser preview on Web, Mobile or Desktop; Chrome approval history shows cloud tool approvals, not extension permissions.

**Acceptance criteria**

1. After a browser task, open a list of every action with its outcome.
2. Each failed action says why.

**Verification: code inspected only.** Ledger and comparison rows.

## CAP-agent-actions-27 Send a task from phone or web to your own computer

The user directs work on their own computer from another device.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Dispatch, closed to new users) and Claude Code: partly**
  - [https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude): Dispatch remains for existing users and is unavailable to new ones (read 2026-11-22). Plans: Pro, Max, Ultra. Apps: desktop, iOS, Android.
- **ChatGPT (dots with a connected computer): yes**
  - [https://learn.chatgpt.com/docs/dots/computers-and-apps.md](https://learn.chatgpt.com/docs/dots/computers-and-apps.md): Allow a dot to use a desktop computer from the app; the computer must be online with the app open (read 2026-11-22). Plans: Rolling out. Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/definition.md (trusted host stays authoritative for local access; Remote projection)). A paired computer receives tasks from another device and says clearly when it is offline.

**With different models, providers and the one subscription.** The trusted host decides what runs; Local inference stays on the host. The remote device carries only approvals and the event stream; the one subscription gates Remote access.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web page Your computer, Desktop pairing; mobile partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S65.27, S65.29
- Comparison list ids: DP35, WP124, WP130
- Code: `apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:40`

**Gap.** Phone cannot attach a photo or file to a computer session; one pairing per phone; no sleep prevention while a phone is not connected.

**Acceptance criteria**

1. Pair a computer, send a task from the web, and watch it progress.
2. With the computer offline the page says so.

**Verification: code inspected only.** Comparison rows.

## CAP-agent-actions-28 Usage accounting and limits for agent runs

Agent runs count toward plan limits, with caps on spend and parallel runs.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/12902405-claude-in-chrome-troubleshooting](https://support.claude.com/en/articles/12902405-claude-in-chrome-troubleshooting): Browser tasks count toward plan usage limits, share limits with Claude and Claude Code and are more compute-intensive (read 2026-11-22). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: Chrome.
- **ChatGPT (dots, Work): yes**
  - [https://learn.chatgpt.com/docs/dots.md](https://learn.chatgpt.com/docs/dots.md): Dot chats do not count toward usage limits; delegated Work or Codex tasks do (read 2026-11-22). Plans: Rolling out. Apps: desktop, web, iOS, Android.

**AGI requirement** (stated requirement; source: established requirement of one AGI Subscription system for entitlements, usage, quotas and limits on every app; docs/product/commercial.md owns plan limits). Every agent run, trigger, schedule and sub-run is counted on the one AGI Subscription and shows a limit state; runs stop or wait at the limit.

**With different models, providers and the one subscription.** Counting is provider independent; BYOK runs may skip managed usage per docs/product/commercial.md. Local inference is free. Concurrency is a plan limit owned by billing-catalog.ts.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Concurrent chat turns are capped by plan on Web; budget on routines built on Web and Desktop; spend cap on CLI only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S60.10, S61.20, S63.31, S63.34
- Comparison list ids: MP51, WP119, WP137; rows without an id: S62.08
- Code: `packages/contracts/types/src/billing-catalog.ts:354`

**Gap.** No spend or time budget for tasks on Web, Desktop or Mobile; held runs do not resume after an allowance reset; Billing showed no renewal info when a limit error pointed to it.

**Acceptance criteria**

1. Reach the plan limit mid-run: the run stops or waits and the screen says why with an Upgrade path.
2. Set a spend cap on a task; the run stops at the cap.
3. Free usage screens show only Upgrade, no meters.

**Verification: seen failing by a person.** web-problems-seen-in-browser.csv W-19 subscribed: error says check Settings > Billing, but Billing shows Active with no period or renewal; W-16 and W-18 free: usage meter on the Free Upgrade page.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to build an always-on personal agent (ChatGPT dots, Claude Duet) and, if so, Managed Cloud only.
- Whether to build a hosted cloud browser for agents; both leaders have one, with sign-in and plan limits that differ.
- Whether to match features only one leader documents: recorded browser shortcuts (Claude), site tools (ChatGPT), team shared tasks (ChatGPT), meetings (Claude).
- Whether Free accounts get Work, schedules or cloud code, since docs/product/requirements.md section 20 says Free Cloud execution is enabled but billing-catalog.ts gates Work to higher plans.
- Whether goal loops, subagents and agent view belong in the chat apps or only in the coding tools, where both leaders keep them.
- Whether to bring per-routine effort back, since the standing rule in D-2026-09-27-02 says neither leader has it but the catalogue shows Claude Code routines do.
- Whether Windows computer use ships before the Mac one is verified.
- Whether Local mode may run agent tasks at all: D-2026-09-15-15 keeps Local Tasks off until a small local model passes the tools and agentic matrix.

## Could not establish

- Nothing in the ledger or scorecards shows a live result for Desktop, Mobile, CLI, VS Code or Chrome agent actions; only Web scorecards W-15, W-16, W-18 and W-19 were read.
- Claude chat computer use: one page says Team and Enterprise only, another says Pro and Max preview; the plan split is unclear.
- Whether ChatGPT computer use and Browser pages describe ChatGPT chat or only Work and Codex in the desktop app; the pages mix both.
- Claude site tools (WebMCP) and ChatGPT recorded shortcuts are not in the catalogue, so has is unknown.
- Exact limits (concurrent runs, schedule caps, usage cost) for leader plans are not in the saved pages.
- Whether the leaders' Web, mobile and Chrome rows differ by rollout; most items are marked rolling out, beta or preview.
- Code line numbers were taken from the comparison files and spot-checked only for file existence, not each line.
