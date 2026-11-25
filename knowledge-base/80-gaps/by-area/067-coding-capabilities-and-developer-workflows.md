---
id: "GAPS-AREA-067"
type: "gap-list"
title: "Gaps: Coding capabilities and developer workflows"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 67. Coding capabilities and developer workflows

97 open gaps that touch this area. Area page: [20-features/067-coding-capabilities-and-developer-workflows](../../20-features/067-coding-capabilities-and-developer-workflows/README.md).

## CMP-D84

**Track findings in Linear, GitHub Issues or Jira**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Detail: Findings can be approved or dismissed; no issue is drafted.
- Evidence: searched: track findings, Linear in apps/web/features/security-scan

## CMP-D85

**Triage external findings and verify a fix**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Detail: Only findings from our own scan are handled.
- Evidence: searched: triage, verify-fix, still_vulnerable in apps/web/features/security-scan

## CMP-DP57

**Turn an issue into a pull request**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F067-08](../../20-features/067-coding-capabilities-and-developer-workflows/F067-08-work-from-an-issue-or-a-team-mention.md)
- Detail: It does not read an issue or support GitLab A session can open a pull request on GitHub and show checks and reviews; it does not read an issue or support GitLab.
- Evidence: apps/web/features/code/code-surface.ts:401-420

## CMP-W178

**Continuous or scheduled security scanning of new commits**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Detail: Our security scan runs only when you start it on one session's repository; there is no new-commit, scheduled or pausable monitoring.
- Evidence: apps/web/features/security-scan/copy.ts:1-71 (only Scan and Scan again); searched: continuous, schedule, new commits in apps/web/features/security-scan

## CMP-W184

**Browse pull requests you wrote or were asked to review, with summary and changes tabs**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Detail: No list of your pull requests to review; the Code page shows only the status of the pull request a session opened.
- Evidence: searched: review-requested, involves, pull request list in apps/web/features/code, apps/web/lib/github-app.ts

## CMP-W186

**Create a draft pull request from the session**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md), [F067-07](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Detail: The Create pull request button always opens a normal pull request; the session route takes no draft option.
- Evidence: apps/web/app/api/code/sessions/[sessionId]/pull-request/route.ts:29-44; searched: draft in apps/web/features/code

## CMP-W198

**Repository review rules in AGENTS.md guide reviews**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F067-10](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Detail: The pull request reviewer does not read repository instruction files; only sessions read AGENTS.md.
- Evidence: apps/web/lib/code-review/pipeline.ts (no instruction file); apps/web/lib/services/cloud-code-project-instructions.ts

## CMP-W199

**Repository rules file that customizes reviews (REVIEW.md, CLAUDE.md)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F067-10](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Detail: The pull request reviewer does not read any repository file for rules, severity changes, skipped paths or extra checks.
- Evidence: searched: REVIEW.md, AGENTS.md, CLAUDE.md in apps/web/lib/code-review, apps/web/app/api/github/webhook

## CMP-W207

**Submit a review (Comment, Approve, Request changes) from chat**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Detail: We show whether a pull request is approved or has changes requested, but you cannot draft or post a review verdict from the app.
- Evidence: apps/web/features/code/components/CodeChangesPanel.tsx:152-153 (status only)

## CMP-WP144

**Auto-fix pull requests when CI fails or reviewers comment**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md), [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: It does not run by itself Mentioning @agi-workforce on a GitHub issue or PR starts a task that reads failed checks; it does not run by itself.
- Evidence: apps/web/lib/services/cloud-code-github-task.ts:44; apps/web/lib/services/cloud-code-github-task.ts:18

## CMP-WP145

**Code review commands (/review, /security-review)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Detail: No multi-agent deep review Sessions accept /review and /security-review goals handled by one agent; no multi-agent deep review.
- Evidence: packages/contracts/types/src/cloud-code.ts:334

## CMP-WP151

**Review a pull request by commenting a mention (once, always, stop)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: There is no always-review subscription or stop command, and drafts are skipped A mention in a pull request comment starts one review; there is no always-review subscription or stop command, and drafts are skipped.
- Evidence: apps/web/app/api/github/webhook/route.ts:211-261,295-307

## CMP-WP153

**Security review of each pull request with a severity threshold**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: There is no severity threshold or security-only manual trigger Automatic pull request review runs a security pass beside correctness and posts inline comments, but there is no severity threshold or security-only manual trigger.
- Evidence: apps/web/lib/code-review/findings.ts:9 (REVIEW_PASSES correctness, security); apps/web/app/api/github/webhook/route.ts:600-612

## CMP-WP158

**Review finding severity labels and the reason each was flagged**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Detail: There is no pre-existing category or collapsed reason Inline comments carry one of four severities (blocker, major, minor, nit) and the pass name; there is no pre-existing category or collapsed reason.
- Evidence: apps/web/lib/code-review/findings.ts:6,140-152

## CMP-WP161

**What a cloud session carries over from the repository (instructions, skills, agents, rules, MCP config)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F067-10](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Detail: Not repository skills, agents, rules, hooks or MCP configuration A session reads up to two instruction files (AGENTS.md, CLAUDE.md, .agiworkforce/instructions.md) but not repository skills, agents, rules, hooks or MCP configuration.
- Evidence: packages/contracts/types/src/project-instructions.ts:1-9; apps/web/lib/services/cloud-code-project-instructions.ts:23

## GAP-AREA067-LW04

**The GitHub webhook answers 'queued' before the cloud switch and beta are checked; a user gets a queued reply even when the task will not run in a deployment without the switch.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-067
- Detail: Area 67. Coding capabilities and developer workflows
- Evidence: apps/web/app/api/github/webhook/route.ts:264-275 vs apps/web/lib/services/cloud-code-github-task.ts:221

## GAP-CAP-coding-workflows-10

**Commit and open a pull request or draft pull request: No draft pull request on web (W186). No session link in commits (W202). Pull-request panel missing on mobile and CLI.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md), [F067-07](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Requirement items: S66.36, S67.29, S67.30, S67.31
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-coding-workflows-11

**Auto-fix a pull request after CI or review comments: No CI-status panel anywhere (S66.37); respond to review feedback missing on web, desktop, mobile and VS Code (S67.32).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F066-11](../../20-features/066-coding-workspace-frontend/F066-11-pull-request-checks-test-results-recap.md), [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Requirement items: S66.37, S67.32, S67.33, S99.27
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-coding-workflows-12

**Automated pull request review on GitHub: No check run table or annotations (W200). Severity words differ from both leaders (blocker, major, minor, nit). Review pull requests missing on mobile (S67.21).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md), [F099-99](../../20-features/099-coding-and-local-runtime-components/F099-99-other-items.md)
- Requirement items: S67.20, S67.21, S99.24, S99.25
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-coding-workflows-14

**Repository rules file for reviews: Both rules files missing in the reviewer (W198, W199).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F067-10](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Requirement items: S67.38
- Detail: Claude yes, ChatGPT yes; AGI not built

## GAP-CAP-coding-workflows-15

**Review local changes and branches on the device: Web review commands partial (WP145).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Requirement items: S67.20, S67.23
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-coding-workflows-17

**Pull request inbox and submit a review from the app: Both missing on web (W184, W207).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Requirement items: S67.21
- Detail: Claude unknown, ChatGPT yes; AGI not built

## GAP-CAP-coding-workflows-18

**Security review of code and pull requests: Continuous scanning (W178) and issue-tracker tracking (D84, D85) missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Requirement items: S67.22, S67.23
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-coding-workflows-19

**Start coding work from GitHub, Slack or issues: Slack start not found; mobile, CLI and VS Code missing (S67.34).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F067-08](../../20-features/067-coding-capabilities-and-developer-workflows/F067-08-work-from-an-issue-or-a-team-mention.md)
- Requirement items: S67.34
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-coding-workflows-22

**Repository instruction files in cloud sessions: Ledger and comparison disagree for web.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F067-10](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Requirement items: S67.37, S67.38, S67.39
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F067-01-01

**Brief marks Web partial but the local path is Desktop-shell only; a browser tab has only the cloud sandbox, which depends on a deployment switch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-01](../../20-features/067-coding-capabilities-and-developer-workflows/F067-01-understand-the-repository.md)
- Detail: Affects: Web users in a browser tab.. Work needed: Confirm production switch state, live-check /code, and state the Desktop-only limit in product copy.
- Evidence: apps/web/features/code/hooks/use-local-sessions.ts:121; apps/web/lib/e2b/gate.ts:20-30

## GAP-F067-01-02

**Required file-and-line citing is not enforced by code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-01](../../20-features/067-coding-capabilities-and-developer-workflows/F067-01-understand-the-repository.md)
- Detail: Affects: All apps.. Work needed: Add a prompt rule or a post-check, then a test.
- Evidence: No citation check found in apps/cli/src/features/exec/tools/mod.rs or the web session panel.

## GAP-F067-01-03

**No symbol-aware references tool in the CLI tool list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-01](../../20-features/067-coding-capabilities-and-developer-workflows/F067-01-understand-the-repository.md)
- Detail: Affects: CLI, Desktop, VS Code.. Work needed: Add or document text search as the method.
- Evidence: apps/cli/src/platform/runtime/tool_catalog.rs:381-385 lists definition, hover, completion, symbols, diagnostics only.

## GAP-F067-01-04

**Whether the CLI app-server needs sign-in to run an on-device model is unproven, which matters for the 'local inference needs no subscription' requirement.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-01](../../20-features/067-coding-capabilities-and-developer-workflows/F067-01-understand-the-repository.md)
- Detail: Affects: Desktop and CLI users on Free or signed out.. Work needed: Trace the app-server start path; add a signed-out local-model test.
- Evidence: No sign-in check was read in apps/cli/src/app_server.rs or developerSessionService.ts.

## GAP-F067-01-PARTLY

**Understand the repository: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F067-01](../../20-features/067-coding-capabilities-and-developer-workflows/F067-01-understand-the-repository.md)
- Requirement items: S67.01, S67.02, S67.03, S67.04, S67.05
- Detail: Web S67.01: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S67.02: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S67.03: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.t

## GAP-F067-02-01

**No migration-specific or dependency-upgrade-specific behaviour; they rely on general tools.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-02](../../20-features/067-coding-capabilities-and-developer-workflows/F067-02-change-code-implement-fix-refactor-write-tests-and.md)
- Detail: Affects: All apps.. Work needed: Decide if general tools meet the requirement; add scenario tests.
- Evidence: No such code found in apps/cli/src or apps/desktop/electron/runtime.

## GAP-F067-02-02

**Web cloud sessions are off until the sandbox switch is set; Web browser users have no editing otherwise.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-02](../../20-features/067-coding-capabilities-and-developer-workflows/F067-02-change-code-implement-fix-refactor-write-tests-and.md)
- Detail: Affects: Web browser users.. Work needed: Set the switch (owner action), live-check /code.
- Evidence: apps/web/lib/e2b/gate.ts:20-30

## GAP-F067-02-03

**Failure display for refused commands on every app was not traced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-02](../../20-features/067-coding-capabilities-and-developer-workflows/F067-02-change-code-implement-fix-refactor-write-tests-and.md)
- Detail: Affects: Desktop, Mobile, VS Code.. Work needed: Trace to the UI and add a test per app.
- Evidence: Only CLI tool results were read (apps/cli/src/features/exec/tools/mod.rs:620-650).

## GAP-F067-02-04

**Cloud sandbox agent has no search tool of its own.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-02](../../20-features/067-coding-capabilities-and-developer-workflows/F067-02-change-code-implement-fix-refactor-write-tests-and.md)
- Detail: Affects: Web cloud sessions.. Work needed: Confirm that shell grep is enough or add a tool.
- Evidence: apps/web/lib/e2b/execution-tools.ts:14-19 lists six tools, none a search.

## GAP-F067-02-PARTLY

**Change code: implement, fix, refactor, write tests and docs, migrate, upgrade: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F067-02](../../20-features/067-coding-capabilities-and-developer-workflows/F067-02-change-code-implement-fix-refactor-write-tests-and.md)
- Requirement items: S67.06, S67.07, S67.08, S67.09, S67.26, S67.27, S67.28
- Detail: Web S67.06: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S67.07: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S67.08: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.t

## GAP-F067-03-01

**Type check, lint and build have no dedicated helper; only tests do.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-03](../../20-features/067-coding-capabilities-and-developer-workflows/F067-03-run-checks-tests-type-checker-linter-build.md)
- Detail: Affects: Desktop.. Work needed: Decide if the agent path is enough; otherwise add helpers.
- Evidence: detectTestCommand only (apps/web/features/code/local-code.ts:1469).

## GAP-F067-03-02

**Draft mapped Desktop sessions to device steps; the code shows two separate paths (chat device steps and CLI tools).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-03](../../20-features/067-coding-capabilities-and-developer-workflows/F067-03-run-checks-tests-type-checker-linter-build.md)
- Detail: Affects: Documentation readers.. Work needed: State both paths in product docs.
- Evidence: packages/contracts/local-runtime/src/device-steps.ts:172; apps/cli/src/platform/runtime/tool_catalog.rs:244

## GAP-F067-03-03

**Web browser users depend on the sandbox switch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-03](../../20-features/067-coding-capabilities-and-developer-workflows/F067-03-run-checks-tests-type-checker-linter-build.md)
- Detail: Affects: Web.. Work needed: Owner switch-on and live check.
- Evidence: apps/web/lib/e2b/gate.ts:20-30

## GAP-F067-03-04

**Mobile transcript exit code display not confirmed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-03](../../20-features/067-coding-capabilities-and-developer-workflows/F067-03-run-checks-tests-type-checker-linter-build.md)
- Detail: Affects: Mobile.. Work needed: Check on a device.
- Evidence: Only the test summary parser was seen (packages/platform/utils/src/remoteControl/codeRemoteController.ts:10-17).

## GAP-F067-03-PARTLY

**Run checks: tests, type checker, linter, build: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F067-03](../../20-features/067-coding-capabilities-and-developer-workflows/F067-03-run-checks-tests-type-checker-linter-build.md)
- Requirement items: S67.10, S67.11, S67.12, S67.13, S67.14
- Detail: Web S67.10: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S67.11: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S67.12: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.t

## GAP-F067-04-01

**Brief says CLI console and network missing; the code has both tools.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-04](../../20-features/067-coding-capabilities-and-developer-workflows/F067-04-start-dev-servers-and-inspect-a-running-app.md)
- Detail: Affects: CLI; documentation.. Work needed: Correct the brief status after a live check.
- Evidence: apps/cli/src/platform/runtime/tool_catalog.rs:51-62; apps/cli/src/features/exec/tools/mod.rs:2178-2250

## GAP-F067-04-02

**Brief says Web missing for console and network; Desktop chat device steps handle both when Web runs in the Desktop shell.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-04](../../20-features/067-coding-capabilities-and-developer-workflows/F067-04-start-dev-servers-and-inspect-a-running-app.md)
- Detail: Affects: Web in Desktop shell.. Work needed: Correct brief; Web in a plain browser still has none.
- Evidence: apps/web/features/desktop-host/lib/device-steps.ts:216-218, 262

## GAP-F067-04-03

**No visible control found to start page watch; CLI instructions name a button not found in the extension source.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-04](../../20-features/067-coding-capabilities-and-developer-workflows/F067-04-start-dev-servers-and-inspect-a-running-app.md)
- Detail: Affects: Chrome extension, CLI, Desktop users reading console and network.. Work needed: Find or build the control, then test the whole path.
- Evidence: apps/cli/src/features/exec/tools/mod.rs:2298; apps/extension/src/background.ts:6902

## GAP-F067-04-04

**No agent step drives the iOS Simulator; the pane is human-operated, and Android has nothing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-04](../../20-features/067-coding-capabilities-and-developer-workflows/F067-04-start-dev-servers-and-inspect-a-running-app.md)
- Detail: Affects: All apps (S67.19).. Work needed: Design agent steps with approval, or narrow the requirement.
- Evidence: packages/contracts/local-runtime/src/device-steps.ts and apps/cli/src have no simulator step

## GAP-F067-04-05

**Browser tools are refused in CLI Local privacy mode, so local-only users cannot inspect a page they run themselves.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-04](../../20-features/067-coding-capabilities-and-developer-workflows/F067-04-start-dev-servers-and-inspect-a-running-app.md)
- Detail: Affects: Local mode users.. Work needed: Decide whether a localhost-only exception is allowed [proposed].
- Evidence: apps/cli/src/features/exec/tools/mod.rs:724-735

## GAP-F067-04-NOTBUILT

**Start dev servers and inspect a running app: not built on Web, Desktop, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code
- Features: [F067-04](../../20-features/067-coding-capabilities-and-developer-workflows/F067-04-start-dev-servers-and-inspect-a-running-app.md)
- Requirement items: S67.15, S67.16, S67.17, S67.18, S67.19
- Detail: Web: S67.15, S67.16, S67.17, S67.18, S67.19; Desktop: S67.19; Mobile: S67.15, S67.16, S67.17, S67.18, S67.19; CLI: S67.17, S67.18, S67.19; VS Code: S67.17, S67.18, S67.19

## GAP-F067-04-PARTLY

**Start dev servers and inspect a running app: partly built on VS Code**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: VS Code
- Features: [F067-04](../../20-features/067-coding-capabilities-and-developer-workflows/F067-04-start-dev-servers-and-inspect-a-running-app.md)
- Requirement items: S67.16
- Detail: VS Code S67.16: Needs a CLI-side browser pairing without AGI Desktop (c-cli lane); VS Code has nothing of its own to add.

## GAP-F067-05-01

**CI investigation reads only check names and links in the CLI, and no log reading was found there.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Detail: Affects: CLI users.. Work needed: Fetch failed job logs and add a test.
- Evidence: apps/cli/src/pr_feedback.rs:284-300

## GAP-F067-05-02

**Respond to review feedback exists only in the CLI; Web mention tasks do not read earlier review comments.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Detail: Affects: Web, Desktop, Mobile, VS Code.. Work needed: Add the feedback reader to the Web task goal; add UI entry points.
- Evidence: apps/web/lib/services/cloud-code-github-task.ts:140-170; brief S67.32

## GAP-F067-05-03

**Web PR review and tasks depend on private beta and sandbox switches whose production state is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Detail: Affects: Web users with the GitHub app.. Work needed: Owner switch-on and live check.
- Evidence: apps/web/app/api/github/webhook/route.ts:477-483; apps/web/lib/e2b/gate.ts:20-30

## GAP-F067-05-04

**Desktop and Mobile have no dedicated review command; the brief's cited security scan lines were not confirmed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Detail: Affects: Desktop, Mobile.. Work needed: Locate or build the scan path and add tests.
- Evidence: apps/web/features/code/components/LocalChangesPanel.tsx:259 only asks the session; apps/cli/src/app_server/developer_host.rs:880-900 is session loading

## GAP-F067-05-05

**Requirement 'file and line for every finding' is enforced only on the Web path, which drops unanchored findings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Detail: Affects: CLI, VS Code.. Work needed: Decide if the CLI must require a line.
- Evidence: apps/web/app/api/github/webhook/__tests__/automated-review.test.ts:107; apps/cli/src/review.rs:21-36 allows a missing line

## GAP-F067-05-NOTBUILT

**Review code changes, pull requests and security: not built on Web, Desktop, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Requirement items: S67.21, S67.32, S67.33
- Detail: Web: S67.32; Desktop: S67.32, S67.33; Mobile: S67.21, S67.32, S67.33; CLI: S67.33; VS Code: S67.32, S67.33

## GAP-F067-05-PARTLY

**Review code changes, pull requests and security: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F067-05](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Requirement items: S67.20, S67.22, S67.33
- Detail: Web S67.20: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S67.22: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S67.33: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.t

## GAP-F067-06-01

**Discard of an added or untracked file permanently removes it with git, not through the Trash.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-06](../../20-features/067-coding-capabilities-and-developer-workflows/F067-06-propose-and-apply-patches.md)
- Detail: Affects: Desktop users.. Work needed: Trash first, or prove a checkpoint can restore it; add a test.
- Evidence: apps/desktop/electron/runtime/gitService.ts:662, 676; doc: AGENTS.md section 9

## GAP-F067-06-02

**The changes panel does not select and apply; the person must use the review pane for per-hunk choices.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-06](../../20-features/067-coding-capabilities-and-developer-workflows/F067-06-propose-and-apply-patches.md)
- Detail: Affects: Desktop.. Work needed: Decide whether this meets 'user picks which patches'; if not, add selection.
- Evidence: apps/web/features/code/components/LocalChangesPanel.tsx:60-135

## GAP-F067-06-03

**Mobile computer sessions cannot accept or reject a file.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-06](../../20-features/067-coding-capabilities-and-developer-workflows/F067-06-propose-and-apply-patches.md)
- Detail: Affects: Mobile.. Work needed: Add an action path or state the limit.
- Evidence: apps/mobile/src/features/companion/components/CodeSessionChangesSheet.tsx:45-100 has only a close control

## GAP-F067-06-04

**Web in a plain browser and cloud patch flow depend on the sandbox switch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-06](../../20-features/067-coding-capabilities-and-developer-workflows/F067-06-propose-and-apply-patches.md)
- Detail: Affects: Web.. Work needed: Owner switch-on and live check.
- Evidence: apps/web/lib/e2b/gate.ts:20-30

## GAP-F067-06-05

**Whether 'Preview first' from the requirements is built was not checked.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-06](../../20-features/067-coding-capabilities-and-developer-workflows/F067-06-propose-and-apply-patches.md)
- Detail: Affects: All apps.. Work needed: Search settings code for it.
- Evidence: doc: docs/product/requirements.md:1369-1385

## GAP-F067-06-PARTLY

**Propose and apply patches: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F067-06](../../20-features/067-coding-capabilities-and-developer-workflows/F067-06-propose-and-apply-patches.md)
- Requirement items: S67.24, S67.25
- Detail: Web S67.24: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S67.25: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## GAP-F067-07-01

**No person-facing Commit action on Desktop**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-07](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Detail: Affects: Desktop users who want to commit themselves. Work needed: Add a Commit control and a dispatcher command with the shell or git.write grant.
- Evidence: Only the agent commits; no commit command found in apps/desktop/electron/runtime/dispatcher.ts

## GAP-F067-07-02

**Mobile has no commit, branch or pull request control although the brief marks it done**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-07](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Detail: Affects: Mobile. Work needed: Either show status read-only or correct the brief.
- Evidence: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57-70; brief S67.29-31

## GAP-F067-07-03

**Cloud commit stages everything unless files are chosen**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-07](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Detail: Affects: Web Cloud. Work needed: Document or change the default.
- Evidence: apps/web/lib/services/cloud-code-session-service.ts:2157-2162

## GAP-F067-07-04

**Cloud path is switched off until E2B settings are set and live-checked**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-07](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Detail: Affects: Web. Work needed: Set switches and run a live check.
- Evidence: apps/web/lib/e2b/gate.ts:19-30; brief S67.29 Unfinished

## GAP-F067-07-05

**Audit event for the Cloud and CLI pull request paths not found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-07](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Detail: Affects: Web Cloud, CLI, VS Code. Work needed: Confirm or add audit parity.
- Evidence: Audit call found only in apps/web/app/api/code/local-pull-requests/route.ts:80

## GAP-F067-07-06

**Desktop push happens before the base-branch check**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-07](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Detail: Affects: Desktop. Work needed: Check base first or tell the person the branch was pushed.
- Evidence: LocalPullRequest.tsx:76-77

## GAP-F067-07-07

**The brief's code references are wrong for commit and branch**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-07](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: git_stage is at git_tools.rs:135, git_commit at 157, git_branch_create at 168; gitService.ts:241 is inside hostGitInvocation, not a pull request function

## GAP-F067-07-NOTBUILT

**Git work: commits, branches, pull requests: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F067-07](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Requirement items: S67.29, S67.30, S67.31
- Detail: Mobile: S67.29, S67.30, S67.31

## GAP-F067-07-PARTLY

**Git work: commits, branches, pull requests: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F067-07](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Requirement items: S67.29, S67.30, S67.31
- Detail: Web S67.29: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S67.30: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S67.31: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.t

## GAP-F067-08-01

**No Slack intake**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-08](../../20-features/067-coding-capabilities-and-developer-workflows/F067-08-work-from-an-issue-or-a-team-mention.md)
- Detail: Affects: All apps. Work needed: Decide whether Slack is wanted; build via connectors.
- Evidence: No slack match under apps/web/app/api/github or cloud-code services; brief names Slack

## GAP-F067-08-02

**Desktop, Mobile, CLI, VS Code have no issue or mention intake**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-08](../../20-features/067-coding-capabilities-and-developer-workflows/F067-08-work-from-an-issue-or-a-team-mention.md)
- Detail: Affects: those apps. Work needed: Define what intake means on each, or mark not applicable.
- Evidence: brief S67.34 statuses

## GAP-F067-08-03

**No test found for runGitHubCodeTask**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-08](../../20-features/067-coding-capabilities-and-developer-workflows/F067-08-work-from-an-issue-or-a-team-mention.md)
- Detail: Affects: Web. Work needed: Add unit tests for gates, fork, approval and success paths.
- Evidence: search of apps/web for runGitHubCodeTask in tests found none

## GAP-F067-08-04

**Needs Cloud switches that are off until live-checked**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-08](../../20-features/067-coding-capabilities-and-developer-workflows/F067-08-work-from-an-issue-or-a-team-mention.md)
- Detail: Affects: Web. Work needed: Set the switches and live-check.
- Evidence: brief S67.34 Unfinished; gate.ts:19-30

## GAP-F067-08-05

**Mention name '@agi-workforce' is a literal in the service rather than a product-name registry value**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-08](../../20-features/067-coding-capabilities-and-developer-workflows/F067-08-work-from-an-issue-or-a-team-mention.md)
- Detail: Affects: Naming consistency. Work needed: [proposed] Check the registry and move the literal.
- Evidence: cloud-code-github-task.ts:44; AGENTS.md section 4 says product names come from product-names.ts

## GAP-F067-08-NOTBUILT

**Work from an issue or a team mention: not built on Desktop, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, CLI, VS Code
- Features: [F067-08](../../20-features/067-coding-capabilities-and-developer-workflows/F067-08-work-from-an-issue-or-a-team-mention.md)
- Requirement items: S67.34
- Detail: Desktop: S67.34; Mobile: S67.34; CLI: S67.34; VS Code: S67.34

## GAP-F067-08-PARTLY

**Work from an issue or a team mention: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F067-08](../../20-features/067-coding-capabilities-and-developer-workflows/F067-08-work-from-an-issue-or-a-team-mention.md)
- Requirement items: S67.34
- Detail: Web S67.34: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Desktop S67.34: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## GAP-F067-09-01

**No goal-and-bound feature as written in the brief**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-09](../../20-features/067-coding-capabilities-and-developer-workflows/F067-09-bounded-goal-loops.md)
- Detail: Affects: All apps. Work needed: Define a goal object, the check for done, the bound options, and the UI.
- Evidence: No goal command found; brief S67.36

## GAP-F067-09-02

**No visible control for maxTurns in the local panel**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-09](../../20-features/067-coding-capabilities-and-developer-workflows/F067-09-bounded-goal-loops.md)
- Detail: Affects: Desktop, Web local. Work needed: Add a control or remove the unused option.
- Evidence: maxTurns only in use-local-session.ts

## GAP-F067-09-03

**No time bound outside Cloud**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-09](../../20-features/067-coding-capabilities-and-developer-workflows/F067-09-bounded-goal-loops.md)
- Detail: Affects: CLI, Desktop. Work needed: Add a wall-clock bound.
- Evidence: engine.rs has steps and dollars only

## GAP-F067-09-04

**No message that a cap ended the turn (CLI)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-09](../../20-features/067-coding-capabilities-and-developer-workflows/F067-09-bounded-goal-loops.md)
- Detail: Affects: CLI, Desktop. Work needed: Emit a notice and offer continue.
- Evidence: not found in engine.rs

## GAP-F067-09-05

**Brief citations do not locate the feature**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-09](../../20-features/067-coding-capabilities-and-developer-workflows/F067-09-bounded-goal-loops.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: apps/cli/src/lib.rs:313 is the max-turns flag; apps/cli/src/agent/chat.rs:946 is in emit_turn_notice/compaction code

## GAP-F067-09-06

**Mobile 'done' is not backed by a control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-09](../../20-features/067-coding-capabilities-and-developer-workflows/F067-09-bounded-goal-loops.md)
- Detail: Affects: Mobile. Work needed: Verify or correct.
- Evidence: CodeSessionView.tsx has stop/queue/steer only

## GAP-F067-09-NOTBUILT

**Bounded goal loops: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F067-09](../../20-features/067-coding-capabilities-and-developer-workflows/F067-09-bounded-goal-loops.md)
- Requirement items: S67.36
- Detail: Mobile: S67.36

## GAP-F067-09-PARTLY

**Bounded goal loops: partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F067-09](../../20-features/067-coding-capabilities-and-developer-workflows/F067-09-bounded-goal-loops.md)
- Requirement items: S67.36
- Detail: Web S67.36: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## GAP-F067-10-01

**Web (browser) has no repository memory, skills or instruction loading**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-10](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Detail: Affects: Web Cloud sessions. Work needed: Decide scope and add, or mark not applicable.
- Evidence: No loader in apps/web/lib/services/cloud-code-*.ts; brief says missing

## GAP-F067-10-02

**'.agi' canonical folder not found in the CLI code read**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-10](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Detail: Affects: CLI, VS Code, Desktop. Work needed: Confirm or add an .agi loader.
- Evidence: docs/product/definition.md:122 versus apps/cli/src/compaction.rs:23

## GAP-F067-10-03

**Memory cannot be edited or removed from the control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-10](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Detail: Affects: Desktop, VS Code. Work needed: Add list, edit and delete.
- Evidence: add_memory only appends

## GAP-F067-10-04

**Skill enable state is global, not per folder**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-10](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Detail: Affects: CLI, Desktop, VS Code. Work needed: Decide whether per folder is wanted; the popover implies this folder.
- Evidence: surfaces.rs:142-150

## GAP-F067-10-05

**Dispatcher reason text says the CLI agent writes the memory; the code appends the text directly**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-10](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Detail: Affects: Desktop consent text accuracy. Work needed: Correct the reason text.
- Evidence: dispatcher.ts:901-905 versus surfaces.rs:1646-1672

## GAP-F067-10-06

**Mobile 'done' is not backed by a control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-10](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Detail: Affects: Mobile. Work needed: Verify or correct.
- Evidence: No memory or skills control found

## GAP-F067-10-07

**Surface matrix says VS Code has no skills; the code has them**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-10](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Detail: Affects: Documentation. Work needed: Regenerate the matrix.
- Evidence: docs/product/surface-feature-matrix.md Skills section versus apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:220

## GAP-F067-10-08

**No test for LocalMemoryControl**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-10](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Detail: Affects: Desktop, Web local. Work needed: Add one.
- Evidence: no test file found for it

## GAP-F067-10-NOTBUILT

**Repository memory, instruction files and skills: not built on Web, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Mobile
- Features: [F067-10](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Requirement items: S67.37, S67.38, S67.39
- Detail: Web: S67.37, S67.38, S67.39; Mobile: S67.37, S67.38, S67.39

## GAP-F067-11-01

**Whole feature missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-11](../../20-features/067-coding-capabilities-and-developer-workflows/F067-11-reports-slides-and-designs-from-the-repository.md)
- Detail: Affects: Web, Desktop, Mobile, CLI, VS Code. Work needed: Decide ownership (coding versus Artifacts and Design), then implement and verify on each app.
- Evidence: brief S67.35 'missing' on every app; no code found

## GAP-F067-11-02

**No defined product requirement text specific to repository-grounded reports**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F067-11](../../20-features/067-coding-capabilities-and-developer-workflows/F067-11-reports-slides-and-designs-from-the-repository.md)
- Detail: Affects: Planning. Work needed: Write the requirement in docs/product.
- Evidence: docs/product/requirements.md describes deck and design generation without a repository source

## GAP-F067-11-NOTBUILT

**Reports, slides and designs from the repository: not built on Web, Desktop, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code
- Features: [F067-11](../../20-features/067-coding-capabilities-and-developer-workflows/F067-11-reports-slides-and-designs-from-the-repository.md)
- Requirement items: S67.35
- Detail: Web: S67.35; Desktop: S67.35; Mobile: S67.35; CLI: S67.35; VS Code: S67.35

## GAP-F067-99-NOTBUILT

**Other items in Coding capabilities and developer workflows: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F067-99](../../20-features/067-coding-capabilities-and-developer-workflows/F067-99-other-items.md)
- Requirement items: S67.40, S67.41
- Detail: CLI: S67.40, S67.41
