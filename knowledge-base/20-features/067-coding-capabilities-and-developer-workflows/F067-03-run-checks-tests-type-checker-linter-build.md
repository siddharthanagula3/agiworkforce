---
id: "F067-03"
type: "feature"
title: "Run checks: tests, type checker, linter, build"
aliases: ["Run checks", "Run tests (S67.10)", "Interpret test failures (S67.11)", "Run type checking (S67.12)", "Run linting (S67.13)", "Build applications (S67.14)", "Run tests button", "device_run_command"]
area: "67 Coding capabilities and developer workflows"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S67.10", "S67.11", "S67.12", "S67.13", "S67.14"]
depends_on: ["surface:desktop", "surface:cli", "surface:vscode", "surface:mobile", "surface:web", "mode:local", "mode:own-key", "mode:cloud", "F067-02", "F067-04", "SYS-execution-boundaries", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "file:apps/web/features/code/hooks/use-local-tests.ts", "file:apps/cli/src/features/exec/tools/bash/mod.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F067-03 Run checks: tests, type checker, linter, build

The coding agent runs the project's own test, type check, lint and build commands in the folder, after the person approves the command, then reads the output and explains or fixes failures. Desktop also has a test-run helper that detects the test command itself. A non-zero exit is reported, never read as a pass.

Area: [67. Coding capabilities and developer workflows](README.md). Requirement items: [S67.10](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6710), [S67.11](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6711), [S67.12](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6712), [S67.13](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6713), [S67.14](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6714).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | not stated on this page | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Runs the project's checks inside the approved folder and gives the result and output back to the agent and the person. The agent can then explain the failure or change code to fix it.

**Why it exists.** A change is only trustworthy if the project's own checks pass. The brief requires the agent to run tests, type checks, linters and builds and to interpret failures (doc: knowledge-base/data/area-briefs/067-coding-capabilities-and-developer-workflows.md S67.10-S67.14).

**Who uses it.** Developers on Desktop, CLI and VS Code; Web users with a cloud sandbox; phone users watching a session.

**Problems it solves**

- Switching to a terminal to run checks and paste output back.
- Failures that are hard to read.
- Claims of success with no exit code behind them.

**Use cases**

- After an edit, the agent runs the tests and fixes a failing case.
- Ask for the type checker and a summary of errors by file.
- Ask for the linter and fixes for its findings.
- Ask for a production build to confirm the app compiles.

## 2. User experience

**Where to find it**

- Desktop session panel: ask in the composer, or use the test-run helper hook that detects the test command (apps/web/features/code/hooks/use-local-tests.ts:92-95).
- CLI: the run_command tool (aliases Bash, Shell) (apps/cli/src/platform/runtime/tool_catalog.rs:244).
- VS Code: the sidebar chat; the terminal integration agiTerminal (apps/extension-vscode/src/platform/agiTerminal.ts, file exists).
- Mobile: a Desktop session transcript, with a 'Test results' section in the Changes sheet (apps/mobile/src/features/companion/components/codeSessionTimeline.ts:43).
- Web cloud: the 'Command' field with 'Run' in the Mobile cloud sheet; the web cloud commands route (apps/mobile/src/features/cloud-code/presentation.ts:338-340; apps/web/app/api/code/sessions/[sessionId]/commands/route.ts:83).

**Before you start**

- Approved folder and shell permission (capability shell.execute) (apps/desktop/electron/runtime/dispatcher.ts:704-710).
- The project must declare its commands; the test helper looks for known manifest files (apps/web/features/code/local-code.ts:1469).

**Screens and controls**

- Approval card for the exact command (Allow once, Allow for this session, Always allow when a prefix is proposed, Deny, Deny and stop) (apps/web/features/code/local-code.ts:439-457).
- Test helper status: idle, running, passed, failed, unavailable, with stop (apps/web/features/code/hooks/use-local-tests.ts:26-39).
- Test messages '<command> passed.', failure with exit code, '<command> ran past its time limit and was stopped.' (apps/web/features/code/local-code.ts:57-60).

**Journey**

1. Ask the agent to run the tests, type check, lint or build, or press the test helper.
2. Approve the exact command.
3. Watch output stream in the transcript or the terminal dock.
4. If it fails, read the exit code and output; ask for a fix.
5. Run again to confirm.

**What the person sees and gets**

- Output and exit code. A timed-out run is recorded as unknown, not passed, even at exit 0 (apps/web/features/code/hooks/use-local-tests.ts:46-52).
- A validation summary built from the checks so a claim is backed by an exit code (apps/web/features/code/hooks/use-local-tests.ts:20-24).

**Settings**

- Shell policy store on Desktop (apps/desktop/electron/runtime/shellPolicyStore.ts, file exists).
- Shell timeout cap SHELL_TIMEOUT_MAX_MS used by the test helper (apps/web/features/code/hooks/use-local-tests.ts:103-105 region).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Test helper detects a test command from folder files and package.json, starts it with the desktop command runner and keeps the exit code (apps/web/features/code/hooks/use-local-tests.ts:92-110; apps/web/features/code/local-code.ts:1469).
- When no test command exists the helper says so and runs nothing (apps/web/features/code/hooks/use-local-tests.ts:97-102; apps/web/features/code/hooks/use-local-tests.test.ts:78, 143).
- The CLI run_command tool runs inside a sandbox, supports run_in_background and returns output; command_output reads and types into it, command_stop ends it (apps/cli/src/features/exec/tools/bash/mod.rs:74-79; apps/cli/src/platform/runtime/tool_catalog.rs:245-246).
- Desktop chat has device_run_command, which asks the person to approve the exact command, and returns output and exit code (packages/contracts/local-runtime/src/device-steps.ts:172-178).
- Web cloud sandbox: commands classified safe, requires approval, or denied; any shell metacharacter escalates to approval (apps/web/lib/services/cloud-code-agent-tools.ts:55, 223).
- Mobile Changes sheet shows 'Test results' parsed from test commands (apps/mobile/src/features/companion/components/CodeSessionChangesSheet.tsx:45; packages/platform/utils/src/remoteControl/codeRemoteController.ts:10-17 imports isTestCommand, parseTestSummary).

**Incomplete**

- Draft said device_run_command is how a Desktop coding session runs checks. Not so: device steps belong to Desktop chat; coding sessions use the CLI's own run_command (apps/cli/src/platform/runtime/tool_catalog.rs:244; packages/contracts/local-runtime/src/device-steps.ts:172).
- Web: a browser tab needs the sandbox switch (apps/web/lib/e2b/gate.ts:20-30).

**Present but disconnected or switched off**

- Cloud sandbox commands off until the sandbox switch passes (apps/web/lib/e2b/gate.ts:20-30).

**Not available**

- Chrome extension: no code session (doc: docs/product/surface-feature-matrix.md:419).
- Mobile has no way to run a check by itself on a Desktop session other than asking the agent [inferred].

## 4. Required behaviour

**Established requirements**

- The agent runs the project's test suite and reports the result. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.10)
- After a failed run the agent reads the output and explains or fixes the cause. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.11)
- The agent runs the type checker, the linter and the build command and reports results. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S67.12, S67.13, S67.14)
- Never report success without running what the change touches. (source: (doc: AGENTS.md section 12))

**Acceptance criteria**

1. Ask for the tests; an approval card shows the exact command before it runs.
2. A failing test returns a non-zero exit code and the transcript shows its output.
3. A run that exceeds the time limit shows the time-limit message and is not shown as passed.
4. In a folder with no test command, the helper says tests were not found and runs nothing.
5. Stop a running check; the helper returns to idle.
6. Declining the command leaves the helper idle.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The agent should read the failing output before proposing a fix; this depends on the model. [inferred]
- Long commands should run in the background and be readable later; the CLI supports it (apps/cli/src/features/exec/tools/bash/mod.rs:74). [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a one-press 'Run type check' and 'Run lint' helper like the tests helper.
- [proposed] Show the exit code in the Mobile transcript for every command.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useLocalTests | `apps/web/features/code/hooks/use-local-tests.ts` | Detects and runs the folder's test command; keeps exit code and checks. |
| service | detectTestCommand | `apps/web/features/code/local-code.ts` | Chooses a test command from file names and package.json (line 1469). |
| service | cloud-code-result | `apps/web/lib/services/cloud-code-result.ts` | Validation summary type shared across surfaces (imported at use-local-tests.ts:18-21). |
| service | shellService | `apps/desktop/electron/runtime/shellService.ts` | Desktop command runner behind startLocalCommand. |
| service | shellSandbox | `apps/desktop/electron/runtime/shellSandbox.ts` | Sandbox for desktop shell commands (file exists; details not read). |
| config | device-steps | `packages/contracts/local-runtime/src/device-steps.ts` | Chat device step catalogue: device_run_command, device_start_command, device_command_output, device_command_stop. |
| service | bash tool | `apps/cli/src/features/exec/tools/bash/mod.rs` | CLI run_command with sandbox and background mode. |
| service | terminals | `apps/cli/src/terminals.rs` | Background command registry used by command_output and command_stop (called at bash/mod.rs:342). |
| service | validation_run | `apps/cli/src/platform/runtime/validation_run.rs` | Validation run record in the CLI (file exists; contents not read). |
| service | cloud-code-agent-tools | `apps/web/lib/services/cloud-code-agent-tools.ts` | Command risk classification for the sandbox. |
| endpoint | POST /api/code/sessions/[sessionId]/commands | `apps/web/app/api/code/sessions/[sessionId]/commands/route.ts` | Runs a command in a cloud session. |
| component | CloudCodeChangesSheet | `apps/mobile/src/features/cloud-code/components/CloudCodeChangesSheet.tsx` | Mobile 'Commands' area with 'Run a command' field and checks state. |
| component | CodeSessionChangesSheet | `apps/mobile/src/features/companion/components/CodeSessionChangesSheet.tsx` | Mobile read-only changes and test results for a Desktop session. |
| service | codeRemoteController | `packages/platform/utils/src/remoteControl/codeRemoteController.ts` | Parses test commands and summaries for the phone. |
| integration | browser and terminal in VS Code | `apps/extension-vscode/src/platform/agiTerminal.ts` | Terminal used by VS Code agent features. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person asks for a check, or presses the test helper, which lists the folder and reads package.json to pick a test command. | device | apps/web/features/code/hooks/use-local-tests.ts:92-95 |
| The shell asks the person to approve the exact command, then runs it inside the folder with a timeout. | device | apps/web/features/code/hooks/use-local-tests.ts:40-44, 103-110; packages/contracts/local-runtime/src/device-steps.ts:172-178 |
| In a CLI or session run, run_command executes under the sandbox, streams output, and records the exit code. | device | apps/cli/src/features/exec/tools/bash/mod.rs:74-100 |
| The exit code and output return to the agent as a tool result; the model reads them and explains or edits. | outside service | apps/web/features/code/hooks/use-local-tests.ts:111-118; apps/web/features/code/local-code.ts:552-554 |
| Mobile receives the transcript and parsed test summary through remote control. | device and our servers | packages/platform/utils/src/remoteControl/codeRemoteController.ts:10-17 |
| Web cloud: the command runs in the sandbox after classification and, where needed, approval. | our servers | apps/web/lib/services/cloud-code-agent-tools.ts:223; apps/web/app/api/code/sessions/[sessionId]/commands/route.ts:83 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Command output and exit code | The session transcript on the device; for cloud, the session journal on our servers. | Phone sees it while paired; cloud is a server record. | Kept with the session; retention unknown. |
| Saved command permissions | CLI permission store on the device (apps/cli/src/features/exec/tools/mod.rs:553). | Not found. | Session grants end with the session; 'Always allow' is saved. |

**Models and providers.** The model only reads results and decides next steps; running the command needs no model. Model choice follows F067-01. The test helper uses no model at all (apps/web/features/code/hooks/use-local-tests.ts:92-110).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Desktop helper: none found in code. Cloud: signed in. |
| Permissions | shell.execute grant for the folder; per-command approval; workspace policy; sandbox on CLI. |
| Subscription | Running a command has no plan gate in the folder path. The model that reads the result may need plan:pro or higher on the account route (packages/contracts/types/src/billing-catalog.ts:359). Cloud sandbox needs a plan with a code budget (packages/contracts/types/src/billing-catalog.ts:839). |
| Limits and metering | Timeout cap SHELL_TIMEOUT_MAX_MS (apps/web/features/code/hooks/use-local-tests.ts:11); cloud sandbox TTL and daily ceiling by plan (packages/contracts/types/src/billing-catalog.ts:808, 827). |
| Feature flags | AGI_E2B_EXECUTION and E2B_API_KEY for cloud (apps/web/lib/e2b/gate.ts:6-7). |
| Model compatibility | Any model that can call tools; test helper needs none. |
| Provider restrictions | None found for running commands. |
| Local mode | Running checks needs no network and no plan; CLI Local privacy mode does not block run_command (apps/cli/src/features/exec/tools/mod.rs:724-735 lists only web_search, web_fetch, advisor and browser tools). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No test command found | Status unavailable with the not-found message; nothing runs. | apps/web/features/code/hooks/use-local-tests.ts:97-102 |
| Passed | Status passed only when exit 0 and not timed out. | apps/web/features/code/hooks/use-local-tests.ts:114 |
| Failed | Status failed with the exit code message. | apps/web/features/code/local-code.ts:58-59 |
| Timed out | Recorded as unknown; message says it was stopped. | apps/web/features/code/hooks/use-local-tests.ts:46-52 |
| Cancelled or declined | Returns to idle. | apps/web/features/code/hooks/use-local-tests.ts:120-125 |
| Folder switched while running | State resets; results from the old folder are ignored. | apps/web/features/code/hooks/use-local-tests.ts:66-77 |
| Local privacy mode | Commands run; network tools do not. | apps/cli/src/features/exec/tools/mod.rs:724-735 |
| Phone offline | Cannot send follow-ups; draft kept. | apps/mobile/src/features/companion/components/codeSessionTimeline.ts:17 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/hooks/use-local-tests.test.ts`: Pass at exit 0, failure with exit code, no test command, decline returns to idle, timeout is unknown, checks only for runs that happened.
- `apps/web/features/code/local-code.test.ts`: Local helpers including test command detection (titles not read).
- `apps/web/app/api/code/sessions/[sessionId]/commands/route.test.ts`: Cloud command route (titles not read).
- `apps/cli/src/features/exec/tools/bash/mod.rs`: CLI command tool, in-file tests (not read).

**Test scenarios**

- **Passing tests**
  1. Open a folder with a test script.
  2. Press the test helper and approve.
  - Expected: Status passed and message '<command> passed.'
- **Failing tests**
  1. Break a test.
  2. Run the helper.
  - Expected: Status failed; exit code and output shown; the agent can be asked to fix.
- **No tests**
  1. Open an empty folder.
  2. Run the helper.
  - Expected: Not-found message; nothing started.
- **Timeout**
  1. Use a command that hangs.
  2. Wait for the limit.
  - Expected: Time-limit message, not a pass.
- **Long server or watch run**
  1. Ask the agent to start a watcher in the CLI.
  2. Read it later.
  - Expected: Started in the background; command_output reads new output; command_stop ends it.

**Where to look when it fails**

- Exit code and the 'checks' record in the helper state (apps/web/features/code/hooks/use-local-tests.ts:34-39).
- CLI command refusals appear as tool results.
- Nothing was run; no result recorded.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md)
- Desktop: [70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md)
- Mobile: [70-qa/test-plans/mobile/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/mobile/067-coding-capabilities-and-developer-workflows.md)
- CLI: [70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md)
- VS Code: [70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md)

## 10. Gaps and dependencies

- **Type check, lint and build have no dedicated helper; only tests do.** Affects: Desktop.. Evidence: detectTestCommand only (apps/web/features/code/local-code.ts:1469).. Work needed: Decide if the agent path is enough; otherwise add helpers.
- **Draft mapped Desktop sessions to device steps; the code shows two separate paths (chat device steps and CLI tools).** Affects: Documentation readers.. Evidence: packages/contracts/local-runtime/src/device-steps.ts:172; apps/cli/src/platform/runtime/tool_catalog.rs:244. Work needed: State both paths in product docs.
- **Web browser users depend on the sandbox switch.** Affects: Web.. Evidence: apps/web/lib/e2b/gate.ts:20-30. Work needed: Owner switch-on and live check.
- **Mobile transcript exit code display not confirmed.** Affects: Mobile.. Evidence: Only the test summary parser was seen (packages/platform/utils/src/remoteControl/codeRemoteController.ts:10-17).. Work needed: Check on a device.

**Depends on**

- surface:desktop
- surface:cli
- surface:vscode
- surface:mobile
- surface:web
- mode:local
- mode:own-key
- mode:cloud
- F067-02
- F067-04
- SYS-execution-boundaries
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- file:apps/web/features/code/hooks/use-local-tests.ts
- file:apps/cli/src/features/exec/tools/bash/mod.rs

## Unknown

- Contents of the CLI validation_run module.
- Whether VS Code surfaces command output the same way.
- Retention of command output.
- Which test frameworks detectTestCommand recognises in full.
