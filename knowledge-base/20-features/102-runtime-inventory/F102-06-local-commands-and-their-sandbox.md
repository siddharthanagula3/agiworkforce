---
id: "F102-06"
type: "feature"
title: "Local commands and their sandbox"
aliases: ["Local shell/PTY runtime", "Local code sandbox", "Local commands", "Seatbelt sandbox", "Bubblewrap sandbox", "Run a local command", "Terminal runtime", "S102.14", "S102.15"]
area: "102 Runtime inventory"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S102.14", "S102.15"]
depends_on: ["SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-authorization-and-workspaces", "surface:desktop", "surface:cli", "mode:local", "mode:cloud", "store:desktop-shell-policy", "F102-05", "F102-02", "file:apps/desktop/electron/runtime/shellService.ts", "file:apps/cli/src/sandbox.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F102-06 Local commands and their sandbox

Commands that run on the user's computer are started as programs, not through a shell, after a program allow or block check and an approval. On macOS they run inside Seatbelt, on Linux inside bubblewrap when installed. With no sandbox the desktop asks every time. The CLI has its own sandbox and warns when it is off.

Area: [102. Runtime inventory](README.md). Requirement items: [S102.14](../../10-requirements/capabilities/102-runtime-inventory.md#s10214), [S102.15](../../10-requirements/capabilities/102-runtime-inventory.md#s10215).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Runs local commands for a hosted agent (through the desktop) and for coding sessions (through the CLI), inside a sandbox that limits writes to the approved folder and blocks the network unless allowed. Long or interactive programs run as background commands with a terminal.

**Why it exists.** An agent that can run programs can damage the machine or leak data. The sandbox, allow list and approvals limit what a command can reach.

**Who uses it.** Desktop users whose cloud agent has device tools, developers in coding sessions, CLI users.

**Problems it solves**

- Unreviewed commands changing files outside the folder.
- Secrets in the environment leaking to a command.
- Commands blocking forever or flooding output.
- Account switching programs.

**Use cases**

- The cloud agent asks to run a test command in an approved folder; the user sees the exact command and chooses Run once.
- The user adds git to the allowed programs so it runs without asking.
- A dev server is started as a background command and its output read later.
- A CLI user runs a command in the workspace sandbox with the network denied.

## 2. User experience

**Where to find it**

- Desktop approval dialog 'Run a local command?' with buttons 'Cancel' and 'Run once', and a checkbox 'Allow network access for this command' (apps/desktop/electron/runtime/dispatcher.ts:1984, :1999-2025).
- Without a sandbox the dialog is 'Run without a sandbox?' with 'Run without a sandbox' (dispatcher.ts:2038-2050).
- Settings, Capabilities, 'Local access', 'Commands': lists 'Runs without asking' and 'Never runs' (apps/web/features/desktop-host/components/LocalAccessSection.tsx:488, :511).
- CLI: the status bar word seatbelt, bwrap or 'no sandbox' (apps/cli/src/sandbox.rs:~228).

**Before you start**

- Desktop: an approved folder and the shell.execute capability grant (dispatcher.ts:699-715).
- CLI: a trusted workspace for --no-sandbox to take effect (sandbox.rs:612-618).

**Screens and controls**

- Allow, block and ask lists per program.
- Per-run Run once and network checkbox.
- Per-input approval when typing into a running command.

**Journey**

1. 1. The agent proposes a command.
2. 2. The desktop parses it into a program and arguments; pipes, redirects and variables are refused.
3. 3. Policy: always-refused programs and the blocked list are denied; allowed names run; others ask.
4. 4. If asked or no sandbox exists, the dialog quotes the folder and exact command.
5. 5. The command runs in the sandbox with a cleaned environment and a private scratch folder.
6. 6. Output streams; the run ends on exit, timeout, size cap or cancel.

**What the person sees and gets**

- Streamed stdout and stderr, exit code, signal, truncated and timed-out flags, duration (shellService.ts:~810-830).
- Refusal messages such as 'Local commands run without a shell, so ... cannot be used...' and '<program> did not run. This computer has no sandbox for local commands, and running it without one was not approved.' (shellService.ts:567-575, :613-618).

**Settings**

- Allow and block lists stored on the device (desktop-shell-policy.json in user data, shellPolicyStore.ts).
- CLI: --no-sandbox, organization-forced sandbox, scrub environment settings (sandbox.rs:596-640).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Parse and policy: control characters refused; argv parsing; always-refused programs; blocked then allowed lists; a program named by path asks even if allowed (packages/contracts/local-runtime/src/shell.ts:237-274; shellService.ts:554-620). Limits: command 4000 chars, input 4000 chars, output 1,000,000 bytes, default timeout 120 s, max 600 s (shell.ts:44-48).
- Sandbox detection: macOS uses /usr/bin/sandbox-exec; Linux uses bwrap found on PATH; every other platform gets backend none (apps/desktop/electron/runtime/shellSandbox.ts:22, :189-203).
- Sandboxed spawn: writable roots are the pinned project folder plus a private scratch folder; protected host paths such as the app's own data are read-only and unreadable; network denied unless the user ticks the box (shellService.ts:554-680; dispatcher.ts:2387).
- No sandbox: every run asks, allowed or not, with a full-account warning; refusal ends with sandbox-unavailable (shellService.ts:585-620; dispatcher.ts:2038-2050).
- Environment: only an allowlist of variables passes (shellService.ts:220-290).
- Run: spawn without a shell, detached process group, timeout kill, output cap, streamed chunks (shellService.ts:686-820, KILL_GRACE_MS 2 s at :104).
- Background and terminal commands: macOS runs them through /usr/bin/script for a terminal; reading, typing (each input approved) and stopping are supported (shellService.ts:139, :953-1070). No PTY library was found in this file; the terminal is `script` on macOS only; on other platforms background commands are plain pipes [inferred from the `terminal = process.platform === 'darwin'` line, shellService.ts:~965].
- Server-side review: tool calls can carry a 'review' text that forces approval even for allowed programs (shellService.ts:~98-102; dispatcher.ts:2074 serverReview); the web device tool schema asks the model to set it for payments, messages, deletes, security changes and passwords (apps/web/lib/device-steps/device-tools.ts:53-58). The shellService comment says the server sets it once a turn has untrusted content; the setting code for that was not found, so both statements are recorded.
- CLI: SandboxType detects Seatbelt or bubblewrap (apps/cli/src/sandbox.rs:188-217); run_command uses the workspace sandbox, background option, network policy, internal destination refusal (apps/cli/src/features/exec/tools/bash/mod.rs:70-115); disabled() prints 'warning: running without OS-level sandboxing, system commands will have unrestricted access' (sandbox.rs:~455-462); --no-sandbox is honoured only when the organization has not forced the sandbox and the workspace is trusted (sandbox.rs:612-618).

**Incomplete**

- Windows has no sandbox in either app: detectShellSandbox returns none and the CLI detect returns None off macOS and Linux (shellSandbox.ts:189-203; sandbox.rs:196-217).
- The brief says Seatbelt or Landlock; no Landlock backend exists, Linux uses bubblewrap (crates/agiworkforce-sandbox-policy/src/wrap.rs:36-39 lists only MacosSeatbelt and LinuxBubblewrap).

**Present but disconnected or switched off**

- The CLI sandbox can be disabled by --no-sandbox in a trusted workspace (sandbox.rs:596-618).

**Not available**

- Pipes, redirects and variable expansion in desktop local commands (shellService.ts:567-575).
- Sandbox on Windows.

## 4. Required behaviour

**Established requirements**

- Local commands run in a shell/PTY runtime that supports interactive and long-running programs. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.14)
- Local commands run inside an OS sandbox (Seatbelt/Landlock) by default. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.15)
- Security fails closed; an agent never destroys user data on its own; actions need consent. (source: (AGENTS.md sections 6 and 9))
- The desktop warns and asks every time when no sandbox exists. (source: (apps/desktop/electron/runtime/dispatcher.ts:2038-2050))

**Acceptance criteria**

1. On macOS with Seatbelt, a command asked to write outside the approved folder fails.
2. A program on the blocked list is refused without a dialog; an always-refused program is refused regardless of lists.
3. A command containing a pipe or redirect is refused with the 'run without a shell' message.
4. With no sandbox backend the dialog 'Run without a sandbox?' appears for every run, even for an allowed program.
5. A run exceeding the timeout is killed and reported timedOut; output above 1,000,000 bytes is cut and flagged truncated.
6. Typing into a running command asks for approval each time.
7. The CLI prints the unrestricted-access warning when started without a sandbox, and refuses --no-sandbox in an untrusted workspace.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A Windows sandbox is a required parity item if the leaders sandbox there [inferred; not verified].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Correct the brief wording from Landlock to bubblewrap or build Landlock.
- [proposed] Evaluate a Windows sandbox backend.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | shellService | `apps/desktop/electron/runtime/shellService.ts` | Prepare, run, background, read, stop commands (lines 554, 686, 953, 1037, 1062). |
| service | shellSandbox | `apps/desktop/electron/runtime/shellSandbox.ts` | Detect backend and build sandboxed spawn (lines 22, 189, 603). |
| store | shellPolicyStore | `apps/desktop/electron/runtime/shellPolicyStore.ts` | Allow and block lists in desktop-shell-policy.json. |
| service | dispatcher shell cases | `apps/desktop/electron/runtime/dispatcher.ts` | shell_run, shell_start, shell_read, shell_stop, shell_policy_* (lines 699-715, 2378-2430) and dialogs (1999). |
| config | shell contract | `packages/contracts/local-runtime/src/shell.ts` | Policy evaluation, limits, always-refused programs (lines 44-48, 237). |
| config | device-steps contract | `packages/contracts/local-runtime/src/device-steps.ts` | device_run_command, device_start_command and siblings (lines 130-190). |
| service | web device tools | `apps/web/lib/device-steps/device-tools.ts` | Tool schemas the cloud agent sees; review field (line 53). |
| service | web device step runner | `apps/web/features/desktop-host/lib/device-steps.ts` | Forwards device steps to the desktop bridge (review at line 95). |
| component | LocalAccessSection Commands | `apps/web/features/desktop-host/components/LocalAccessSection.tsx` | Edit allow and block lists. |
| service | CLI sandbox | `apps/cli/src/sandbox.rs` | SandboxType, policy, disable rules (lines 188-217, 596-640). |
| service | CLI run_command tool | `apps/cli/src/features/exec/tools/bash/mod.rs` | Runs commands in the sandbox workspace (lines 70-115). |
| service | sandbox-policy crate | `crates/agiworkforce-sandbox-policy/src/wrap.rs` | Seatbelt and bubblewrap argv builders (line 36). |
| service | pathGuard | `apps/desktop/electron/runtime/pathGuard.ts` | Resolve paths within the approved root. |
| store | desktop-shell-policy | `apps/desktop/electron/runtime/shellPolicyStore.ts` | File stored in user data (storePath). |
| component | approval dialogs | `apps/desktop/electron/runtime/approvalReview.ts` | Dialog text helpers [path inferred from the test name; usage not opened]. |
| integration | developer terminals | `apps/desktop/electron/runtime/developerSessionService.ts` | openDeveloperTerminal and related functions for CLI-hosted terminals. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The cloud agent calls a device tool such as device_run_command. | our servers | (apps/web/lib/device-steps/device-tools.ts:53-58; packages/contracts/local-runtime/src/device-steps.ts:164-170) |
| The step reaches the desktop through the page and bridge and becomes the shell_run command. | device | (apps/web/features/desktop-host/lib/device-steps.ts:356-370; dispatcher.ts:2378) |
| The dispatcher checks the folder grant and shell.execute capability. | device | (dispatcher.ts:699-703, :3358-3496) |
| shellService parses, applies the policy, asks the user when needed, builds the sandboxed spawn and runs the program. | device | (shellService.ts:554-820) |
| Output streams back to the page and to the agent as the step result. | device and our servers | (dispatcher.ts:2390 emit shell-output) |
| In a coding session, the CLI helper runs commands itself through run_command in its sandbox. | device | (apps/cli/src/features/exec/tools/bash/mod.rs:70-115) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Allow and block lists | desktop-shell-policy.json in the app's user data | No | Corrupt file reads as empty; user edits via settings |
| Command output | memory and the streamed events; capped at 1,000,000 bytes | Sent to the cloud agent as the step result when a cloud agent asked | not stored by the shell |
| Scratch folder | a temporary folder per run | No | removed when the run ends (removeScratch) |

**Models and providers.** No model runs in this feature. A cloud model proposes the command (device steps) or the CLI's model does (coding session); the local sandbox does not depend on which model or provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Desktop: signed-in web session for cloud agent steps; none for local use of the sandbox itself. |
| Permissions | Folder grant plus shell.execute capability, program policy, per-run approval, per-input approval. |
| Subscription | none found in the code for the shell and sandbox; device tools reach the desktop through a cloud agent turn, which follows plan rules (F102-02). |
| Limits and metering | Timeout 120 s default and 600 s max; output 1 MB; command and input 4000 characters (shell.ts:44-48). No usage metering found. |
| Feature flags | CLI --no-sandbox and organization forced sandbox; scrub environment setting (sandbox.rs:596-640). Desktop: none found. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | This feature is fully local and free of any subscription check in the code read; it works without a model. Using it from a cloud agent needs a signed-in Cloud turn. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Not approved | Refusal 'Running <program> was not approved.' or the sandbox-unavailable message. | (shellService.ts:613-618) |
| Program missing | missingProgram error; with a failing sandbox launcher 'The command sandbox could not be started'. | (shellService.ts:~805-818) |
| Timeout | cancelShellRun after the timeout; result timedOut true. | (shellService.ts:~736-742) |
| Output too large | Run cancelled and truncated true. | (shellService.ts:~744-752) |
| Cancelled before start | Refused with a cancelled-before-start message. | (shellService.ts:~563, :655-660) |
| Typing into stopped program | Refused '<program> has already stopped.' | (shellService.ts:1042-1045) |
| Unsafe folder path for Seatbelt | Refused with a rename-the-folder message. | (shellSandbox.ts:~215-225) |
| Windows | No sandbox; every run asks with the warning dialog. | (shellSandbox.ts:189-203; dispatcher.ts:2038) |
| Accessibility | unknown: native dialogs only. | not read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/shellService.test.ts`: Shell service run behaviour.
- `apps/desktop/electron/__tests__/shellServiceSandbox.test.ts`: Sandboxed spawn paths.
- `apps/desktop/electron/__tests__/shellSandbox.test.ts`: Backend detection and profile building.
- `apps/desktop/electron/__tests__/shellPolicyStore.test.ts`: Policy file store.
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Dispatcher gates.
- `packages/contracts/local-runtime/src/__tests__/shell.test.ts`: Policy evaluation and parsing.
- `packages/contracts/local-runtime/src/__tests__/device-steps.test.ts`: Device step contract.
- `apps/cli/src/sandbox.rs`: In-file Rust tests for sandbox detection and policy (84 test attributes counted).
- `apps/cli/src/features/exec/tools/bash/mod.rs`: In-file Rust tests for the run_command tool (29 test attributes counted).
- `apps/web/features/desktop-host/__tests__/LocalAccessSection.test.tsx`: Commands allow and block UI.

**Test scenarios**

- **Sandbox write limit**
  1. On macOS approve a folder.
  2. Run a command that writes to the home folder outside it.
  - Expected: The write fails; writes inside the folder succeed.
- **Blocked program**
  1. Add a program to 'Never runs'.
  2. Have the agent run it.
  - Expected: Refused without a dialog, message that it is on the blocked list.
- **No sandbox**
  1. On a machine without Seatbelt or bwrap, run an allowed program.
  - Expected: 'Run without a sandbox?' dialog appears; Cancel gives sandbox-unavailable.
- **Pipe refusal**
  1. Ask the agent to run a command containing a pipe.
  - Expected: Refused with the no-shell message.
- **Background command**
  1. Start a dev server with device_start_command.
  2. Read output.
  3. Stop it.
  - Expected: Output returned; process group ends.
- **CLI no sandbox**
  1. Run the CLI with --no-sandbox in an untrusted workspace, then a trusted one.
  - Expected: Untrusted: sandbox stays on; trusted: warning printed.

**Where to look when it fails**

- Refusal codes: not-listed, always-refused, denied-by-policy, control-characters, unparseable, too-long, sandbox-unavailable.
- CLI status bar word and the unrestricted-access warning.
- Desktop runtime failures with code permission-denied.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief says Seatbelt/Landlock; code has Seatbelt and bubblewrap only.** Affects: Linux users and documentation.. Evidence: (crates/agiworkforce-sandbox-policy/src/wrap.rs:36-39). Work needed: Correct the brief or add Landlock.
- **No sandbox on Windows in the desktop or CLI.** Affects: Windows users.. Evidence: (shellSandbox.ts:189-203; sandbox.rs:196-217). Work needed: Add a backend or keep approval-every-time and record the decision.
- **The brief says shell/PTY with interactive support; the desktop terminal is `script` on macOS only and no PTY library was found there.** Affects: Interactive programs on Linux and Windows.. Evidence: (shellService.ts:139, :965). Work needed: Confirm interactive coverage per platform.
- **Who sets the review text is described two ways (model schema vs server on untrusted content).** Affects: Safety behaviour on untrusted turns.. Evidence: (device-tools.ts:53-58 vs shellService.ts:98-102). Work needed: Find or add the server-side rule and test it.

**Depends on**

- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-authorization-and-workspaces
- surface:desktop
- surface:cli
- mode:local
- mode:cloud
- store:desktop-shell-policy
- F102-05
- F102-02
- file:apps/desktop/electron/runtime/shellService.ts
- file:apps/cli/src/sandbox.rs

## Unknown

- Who sets the server review text on turns with untrusted content (no setter found).
- Interactive support and terminal behaviour on Linux and Windows.
- Whether the CLI run_command tool reads the same allow and block lists as the desktop (not found; CLI uses its own safety modules).
- Exact CLI status bar line numbers and in-file test names.
- Windows behaviour of the CLI sandbox warning path.
- Brief lines shellService.ts:581, :651, :676, shellSandbox.ts:133 and dispatcher.ts:992 were not each opened.
