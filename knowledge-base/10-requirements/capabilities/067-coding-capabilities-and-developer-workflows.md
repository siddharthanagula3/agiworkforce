---
id: "REQ-AREA-067"
type: "requirements"
title: "Requirement items: Coding capabilities and developer workflows"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 67. Coding capabilities and developer workflows

39 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S67.01

**Explain repository structure.** The agent reads the repository and explains its structure: main parts, entry points, how they fit.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-01 Understand the repository](../../20-features/067-coding-capabilities-and-developer-workflows/F067-01-understand-the-repository.md)

## S67.02

**Find implementations.** Asked where something is implemented, the agent finds the defining code and cites file and line.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-01 Understand the repository](../../20-features/067-coding-capabilities-and-developer-workflows/F067-01-understand-the-repository.md)

## S67.03

**Find references.** Asked where a symbol is used, the agent finds its references across the repository.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-01 Understand the repository](../../20-features/067-coding-capabilities-and-developer-workflows/F067-01-understand-the-repository.md)

## S67.04

**Trace call paths.** The agent traces how a call flows through the code from entry point to effect.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-01 Understand the repository](../../20-features/067-coding-capabilities-and-developer-workflows/F067-01-understand-the-repository.md)

## S67.05

**Answer repository questions.** The agent answers free-form questions about the repository by reading its files.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-01 Understand the repository](../../20-features/067-coding-capabilities-and-developer-workflows/F067-01-understand-the-repository.md)

## S67.06

**Implement a feature.** Given a feature request, the agent edits and creates files in the repository to implement it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-02 Change code: implement, fix, refactor, write tests and docs, migrate, upgrade](../../20-features/067-coding-capabilities-and-developer-workflows/F067-02-change-code-implement-fix-refactor-write-tests-and.md)

## S67.07

**Fix a defect.** Given a defect, the agent finds the cause and edits the code to fix it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-02 Change code: implement, fix, refactor, write tests and docs, migrate, upgrade](../../20-features/067-coding-capabilities-and-developer-workflows/F067-02-change-code-implement-fix-refactor-write-tests-and.md)

## S67.08

**Refactor code.** The agent restructures existing code across files without changing behaviour.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-02 Change code: implement, fix, refactor, write tests and docs, migrate, upgrade](../../20-features/067-coding-capabilities-and-developer-workflows/F067-02-change-code-implement-fix-refactor-write-tests-and.md)

## S67.09

**Generate tests.** The agent writes new test files or cases for existing code.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-02 Change code: implement, fix, refactor, write tests and docs, migrate, upgrade](../../20-features/067-coding-capabilities-and-developer-workflows/F067-02-change-code-implement-fix-refactor-write-tests-and.md)

## S67.10

**Run tests.** The agent runs the project's test suite and reports the result.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-03 Run checks: tests, type checker, linter, build](../../20-features/067-coding-capabilities-and-developer-workflows/F067-03-run-checks-tests-type-checker-linter-build.md)

## S67.11

**Interpret test failures.** After a test run fails, the agent reads the failure output and explains or fixes the cause.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-03 Run checks: tests, type checker, linter, build](../../20-features/067-coding-capabilities-and-developer-workflows/F067-03-run-checks-tests-type-checker-linter-build.md)

## S67.12

**Run type checking.** The agent runs the project's type checker and reports errors.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-03 Run checks: tests, type checker, linter, build](../../20-features/067-coding-capabilities-and-developer-workflows/F067-03-run-checks-tests-type-checker-linter-build.md)

## S67.13

**Run linting.** The agent runs the project's linter and reports findings.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-03 Run checks: tests, type checker, linter, build](../../20-features/067-coding-capabilities-and-developer-workflows/F067-03-run-checks-tests-type-checker-linter-build.md)

## S67.14

**Build applications.** The agent builds the application with the project's build command.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-03 Run checks: tests, type checker, linter, build](../../20-features/067-coding-capabilities-and-developer-workflows/F067-03-run-checks-tests-type-checker-linter-build.md)

## S67.15

**Start development servers.** The agent starts a development server and keeps it running while it continues working.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI done, VS Code done
- Feature: [F067-04 Start dev servers and inspect a running app](../../20-features/067-coding-capabilities-and-developer-workflows/F067-04-start-dev-servers-and-inspect-a-running-app.md)

## S67.16

**Inspect browser behavior.** The agent opens the app in a browser and inspects how it behaves (navigate, click, read, screenshot).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile done, CLI done, VS Code partial, Chrome done
- Feature: [F067-04 Start dev servers and inspect a running app](../../20-features/067-coding-capabilities-and-developer-workflows/F067-04-start-dev-servers-and-inspect-a-running-app.md)

## S67.17

**Inspect console errors.** The agent reads the browser console errors of the app under test.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome done
- Feature: [F067-04 Start dev servers and inspect a running app](../../20-features/067-coding-capabilities-and-developer-workflows/F067-04-start-dev-servers-and-inspect-a-running-app.md)

## S67.18

**Inspect network failures.** The agent inspects failed network requests of the app under test.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome done
- Feature: [F067-04 Start dev servers and inspect a running app](../../20-features/067-coding-capabilities-and-developer-workflows/F067-04-start-dev-servers-and-inspect-a-running-app.md)

## S67.19

**Interact with a simulator.** The agent drives an iOS/Android simulator to exercise a mobile app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing
- Feature: [F067-04 Start dev servers and inspect a running app](../../20-features/067-coding-capabilities-and-developer-workflows/F067-04-start-dev-servers-and-inspect-a-running-app.md)

## S67.20

**Review code changes.** The agent reviews the current code changes and reports issues with file/line references.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-05 Review code changes, pull requests and security](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Competitor trace: CAP-coding-workflows-12, CAP-coding-workflows-15

## S67.21

**Review pull requests.** The agent reviews a pull request (fetches its diff) and posts or shows review findings.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done
- Feature: [F067-05 Review code changes, pull requests and security](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Competitor trace: CAP-coding-workflows-12, CAP-coding-workflows-17

## S67.22

**Scan for security problems.** The agent scans the code for security problems and reports them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-05 Review code changes, pull requests and security](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Competitor trace: CAP-coding-workflows-18

## S67.23

**Explain findings.** After a review or scan, the agent explains each finding in plain language with its location.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-05 Review code changes, pull requests and security](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Competitor trace: CAP-coding-workflows-15, CAP-coding-workflows-18

## S67.24

**Propose patches.** The agent proposes a change as a reviewable patch before or as it applies it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-06 Propose and apply patches](../../20-features/067-coding-capabilities-and-developer-workflows/F067-06-propose-and-apply-patches.md)

## S67.25

**Apply selected patches.** The user picks which of the agent's proposed patches to apply, and only those are applied.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-06 Propose and apply patches](../../20-features/067-coding-capabilities-and-developer-workflows/F067-06-propose-and-apply-patches.md)

## S67.26

**Generate documentation.** The agent writes or updates documentation (README, doc comments) from the code.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-02 Change code: implement, fix, refactor, write tests and docs, migrate, upgrade](../../20-features/067-coding-capabilities-and-developer-workflows/F067-02-change-code-implement-fix-refactor-write-tests-and.md)

## S67.27

**Perform migrations.** The agent performs a code or schema migration across the repository.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-02 Change code: implement, fix, refactor, write tests and docs, migrate, upgrade](../../20-features/067-coding-capabilities-and-developer-workflows/F067-02-change-code-implement-fix-refactor-write-tests-and.md)

## S67.28

**Upgrade dependencies.** The agent upgrades dependencies and adjusts code to the new versions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-02 Change code: implement, fix, refactor, write tests and docs, migrate, upgrade](../../20-features/067-coding-capabilities-and-developer-workflows/F067-02-change-code-implement-fix-refactor-write-tests-and.md)

## S67.29

**Create commits.** The agent (or user from the coding surface) commits the session's changes with a message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-07 Git work: commits, branches, pull requests](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Competitor trace: CAP-coding-workflows-10

## S67.30

**Create branches.** The agent creates a git branch for its work.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-07 Git work: commits, branches, pull requests](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Competitor trace: CAP-coding-workflows-10

## S67.31

**Create pull requests.** The agent opens a pull request for its branch on the code host.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop done, Mobile done, VS Code done
- Feature: [F067-07 Git work: commits, branches, pull requests](../../20-features/067-coding-capabilities-and-developer-workflows/F067-07-git-work-commits-branches-pull-requests.md)
- Competitor trace: CAP-coding-workflows-10

## S67.32

**Respond to review feedback.** The agent reads review comments on a pull request and changes the code to address them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing
- Feature: [F067-05 Review code changes, pull requests and security](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Competitor trace: CAP-coding-workflows-11

## S67.33

**Investigate CI failures.** The agent investigates a failed CI run (reads logs, finds the cause, proposes a fix).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop missing, Mobile missing, CLI missing, VS Code missing
- Feature: [F067-05 Review code changes, pull requests and security](../../20-features/067-coding-capabilities-and-developer-workflows/F067-05-review-code-changes-pull-requests-and-security.md)
- Competitor trace: CAP-coding-workflows-11

## S67.34

**Work from issues or team mentions.** Work starts from an issue or a team mention (e.g. @agent on GitHub or Slack) and the agent does the coding task.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile missing, CLI missing, VS Code missing
- Feature: [F067-08 Work from an issue or a team mention](../../20-features/067-coding-capabilities-and-developer-workflows/F067-08-work-from-an-issue-or-a-team-mention.md)
- Competitor trace: CAP-coding-workflows-19

## S67.35

**Produce repository-grounded reports, slides, and designs.** The agent produces a report, slide deck or design grounded in the repository's contents.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing
- Feature: [F067-11 Reports, slides and designs from the repository](../../20-features/067-coding-capabilities-and-developer-workflows/F067-11-reports-slides-and-designs-from-the-repository.md)

## S67.36

**Run bounded goal/completion loops.** The user sets a goal and a bound (turns/time) and the agent loops until done or the bound is hit.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Mobile done, CLI done
- Feature: [F067-09 Bounded goal loops](../../20-features/067-coding-capabilities-and-developer-workflows/F067-09-bounded-goal-loops.md)

## S67.37

**Persist useful repository-specific Memory.** The agent saves useful repository-specific facts to memory and reuses them in later sessions on that repository.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-10 Repository memory, instruction files and skills](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Competitor trace: CAP-coding-workflows-22

## S67.38

**Load repository instruction files.** The agent loads the repository's instruction files (AGENTS.md, CLAUDE.md) and follows them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-10 Repository memory, instruction files and skills](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Competitor trace: CAP-coding-workflows-14, CAP-coding-workflows-22

## S67.39

**Use project-specific Skills and Plugins.** The agent uses skills and plugins defined in the project and the user can see or toggle them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F067-10 Repository memory, instruction files and skills](../../20-features/067-coding-capabilities-and-developer-workflows/F067-10-repository-memory-instruction-files-and-skills.md)
- Competitor trace: CAP-coding-workflows-22
