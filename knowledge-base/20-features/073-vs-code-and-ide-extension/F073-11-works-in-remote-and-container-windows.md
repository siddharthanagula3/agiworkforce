---
id: "F073-11"
type: "feature"
title: "Works in remote and container windows"
aliases: ["Remote workspace support", "Dev container support", "WSL support", "Remote-SSH support", "Check the CLI in This Environment", "S73.25", "S73.26"]
area: "73 VS Code and IDE extension"
available_on: ["vscode"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S73.25", "S73.26"]
depends_on: ["surface:vscode", "surface:cli", "mode:local", "mode:own-key", "mode:cloud", "SYS-local-inference", "SYS-execution-boundaries", "SYS-authentication-and-identity", "SYS-observability-and-operations", "file:apps/extension-vscode/src/platform/remoteEnvironment.ts", "F073-12", "F073-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F073-11 Works in remote and container windows

AGI Code is declared a workspace extension, so in Remote-SSH, tunnel, dev container, attached container, WSL and Codespaces windows it runs on the remote side and finds or installs the AGI CLI there. Messages name the environment. VS Code only.

Area: [73. VS Code and IDE extension](README.md). Requirement items: [S73.25](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7325), [S73.26](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7326).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Detects which kind of VS Code window is open, resolves and checks the AGI CLI inside that environment, and names the environment in error and status messages.

**Why it exists.** The brief requires the extension to work in Remote-SSH and tunnel workspaces by running on the remote host (S73.25) and in dev containers and WSL (S73.26). The CLI must run next to the files.

**Who uses it.** Developers who work over SSH, in containers or in WSL.

**Problems it solves**

- CLI not found because a remote server has no login PATH
- Confusing errors that do not say where the CLI is missing
- Running a planted CLI file from the workspace

**Use cases**

- Open a folder over Remote-SSH and run 'Code: Check the CLI in This Environment'.
- Open a dev container, see 'Install the CLI there' if missing.
- Sign in from a remote window and read that the approval page opens on the local computer.

## 2. User experience

**Where to find it**

- Command Palette: 'Code: Check the CLI in This Environment' (apps/extension-vscode/package.json:122-125) and 'Code: Install AGI CLI' (package.json:127-130).
- Error and warning messages from chat, terminal and settings that name the environment.

**Before you start**

- A remote window opened with the VS Code remote tooling; the extension installed in that remote.
- A real file system: virtual workspaces are not supported (package.json:78-81).

**Screens and controls**

- Info or error message from the check command: '<Code>: <version> runs from <path> in <environment>.' or 'The AGI CLI at <path> <reason> in <environment>. Install the CLI there, or set agiWorkforce.cliPath to its path inside <environment>.' (apps/extension-vscode/src/platform/remoteEnvironment.ts:178-185).
- Warning with 'Install AGI CLI' (apps/extension-vscode/src/core/commandSetup.ts:500-515).

**Journey**

1. 1. Open a folder in a remote window.
2. 2. The extension host starts on the remote side (extensionKind workspace, package.json:19-21).
3. 3. Open chat; the runtime pool starts the CLI per trusted folder with the environment label (apps/extension-vscode/src/extension.ts:120-139).
4. 4. If the CLI is missing, the setup state offers 'Install AGI CLI' and names the environment (ChatStateManager.ts:4486-4510).
5. 5. Run the check command to see the version and path.
6. 6. Set agiWorkforce.cliPath inside the environment if needed.

**What the person sees and gets**

- Labels: 'WSL', 'the SSH host', 'the dev container', 'the attached container', 'the codespace', 'the tunnelled machine', 'the <name> remote' (remoteEnvironment.ts:16-22, 25-33).
- CLI failure texts with 'in <environment>' (apps/extension-vscode/src/integrations/localRuntimeClient.ts:123-153).

**Settings**

- agiWorkforce.cliPath; relative paths are refused; '~' expands to the remote user's home (remoteEnvironment.ts:46-70; package.json:1232).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- describeRemoteEnvironment maps wsl, ssh-remote, dev-container, attached-container, codespaces and tunnel, with any other name as 'other-remote' (remoteEnvironment.ts:6-33). The first draft listed only four names.
- resolveCliPath looks on the PATH and in .agi/bin, .local/bin and .cargo/bin of the remote user's home, never returns a bare name, ignores relative PATH entries and files inside the workspace (remoteEnvironment.ts:44-99).
- Version probe with a 10 second limit and reason text for not found, not executable or failed (remoteEnvironment.ts:130-156).
- The runtime client gets an environment label when the window is not local (extension.ts:136-138).
- Device sign-in waits longer in remote windows and says the approval page opens on the local computer (apps/extension-vscode/src/features/account-auth/deviceAuth.ts:48-60).
- Session auto-archive is off in remote windows (apps/extension-vscode/src/features/trees/sessionAutoArchive.ts:24-28). Dictation is off in remote windows (ChatStateManager.ts:5710-5716).

**Incomplete**

- The first draft said activation is limited to remote-capable workspaces in package.json. It is not: activation events are chat, view, URI, workspaceContains and startup finished (package.json:41-52). Running on the remote comes from extensionKind workspace (package.json:19-21).
- The brief points to commandSetup.ts:779 for remote support; that line is unrelated artifact code. The relevant code is at commandSetup.ts:959-966 and 500-512.

**Present but disconnected or switched off**

- Voice dictation and session auto-archive are intentionally disabled in remote windows (see above).

**Not available**

- Virtual workspaces are not supported (package.json:78-81).
- Other apps have no remote-window concept in this feature.

## 4. Required behaviour

**Established requirements**

- The extension works in Remote-SSH and tunnel workspaces by running on the remote host. (source: S73.25)
- The extension works in dev containers and WSL windows. (source: S73.26)
- VS Code connects to one CLI app-server process per trusted workspace. (source: doc: docs/product/definition.md:511-513)

**Acceptance criteria**

1. In a WSL window, 'Code: Check the CLI in This Environment' names 'WSL'.
2. In an SSH window with the CLI under the remote home's .local/bin but not on PATH, the check finds it.
3. A relative agiWorkforce.cliPath is refused with a message that explains why.
4. A CLI file inside the workspace is never run from a PATH entry.
5. Missing-CLI messages in a container say 'the dev container'.
6. In a remote window the sign-in message says the approval page opens on the local computer.
7. Opening a folder without a real file system explains that virtual workspaces are unsupported.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The same behaviours should hold for Codespaces and tunnels because they share the code path [inferred from remoteEnvironment.ts:16-22].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a test window run for each remote kind.
- [proposed] Say in the walkthrough how to install the CLI in a container image.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | describeRemoteEnvironment and CLI resolution | `apps/extension-vscode/src/platform/remoteEnvironment.ts` | Environment kind, labels, CLI path resolution, probe and messages. |
| command | agi-workforce.checkCli | `apps/extension-vscode/src/core/commandSetup.ts` | Line 959; runs the probe and shows the message. |
| command | agi-workforce.installCli | `apps/extension-vscode/src/core/commandSetup.ts` | Line 968; installs then probes. |
| service | cliInstaller | `apps/extension-vscode/src/integrations/cliInstaller.ts` | Install flow (contents not opened). |
| service | resolveConfiguredCli | `apps/extension-vscode/src/platform/config.ts` | Applies trust rules to the cliPath setting and resolves it with the host. |
| service | LocalRuntimeClient errors | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | Lines 105-153; CLI not found and not executable messages with environment. |
| service | Runtime pool setup | `apps/extension-vscode/src/extension.ts` | Lines 120-139; passes environmentLabel. |
| service | Device authorization wording | `apps/extension-vscode/src/features/account-auth/deviceAuth.ts` | Lines 48-60; longer wait and local-browser notice in remote windows. |
| service | sessionAutoArchive | `apps/extension-vscode/src/features/trees/sessionAutoArchive.ts` | Line 24-28; off when remoteName is set. |
| service | Dictation availability | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | _canDictate at line 5710 excludes remote windows. |
| config | extensionKind, activation events, virtualWorkspaces | `apps/extension-vscode/package.json` | Lines 19-21, 41-52, 78-81. |
| service | Terminal sign-in command | `apps/extension-vscode/src/providers/terminalProvider.ts` | Line 383-404; CLI missing message names the environment. |
| test | remoteEnvironment.test | `apps/extension-vscode/src/__tests__/remoteEnvironment.test.ts` | Names, PATH search, installer folders, relative refusal, Windows suffixes, probe. |
| test | useTerminal.test | `apps/extension-vscode/src/__tests__/useTerminal.test.ts` | Install offer when no CLI. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| VS Code starts the extension on the remote host and gives it vscode.env.remoteName. | device | apps/extension-vscode/package.json:19-21; apps/extension-vscode/src/extension.ts:120 |
| The extension resolves the CLI against the remote PATH and home folders. | device | apps/extension-vscode/src/platform/remoteEnvironment.ts:60-99 |
| It runs '<cli> --version' with a 10 second timeout. | device | remoteEnvironment.ts:125-137 |
| Sign-in opens the approval page through the local client's browser. | device and our servers | apps/extension-vscode/src/features/account-auth/deviceAuth.ts:48-60 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Environment kind and label | Computed on demand; not stored | No | Not kept |
| cliPath setting | VS Code settings | By VS Code if configured; not by this product [inferred] | Until changed |

**Models and providers.** Not involved. The CLI the extension finds runs the model route.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for remote detection. Sign-in follows the normal account flow. |
| Permissions | Workspace Trust decides whether the CLI starts (see F073-12). The CLI is never taken from inside the workspace (remoteEnvironment.ts:92-93). |
| Subscription | none found in the code. |
| Limits and metering | Version probe timeout 10,000 ms (remoteEnvironment.ts:125). |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Local mode uses the CLI and local models on the remote host, not on the person's laptop [inferred from extensionKind workspace]. Whether a remote host has hardware or a local model server is not checked here. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| CLI not found | Message names the environment and offers install or cliPath. | remoteEnvironment.ts:181-185; commandSetup.ts:500-515 |
| CLI not executable | Message says the editor is not allowed to run it. | localRuntimeClient.ts:146-150 |
| Relative cliPath | Refused because it would resolve inside the workspace. | remoteEnvironment.ts:141-145 |
| Version probe slow | Fails after 10 seconds with a 'did not run' reason. | remoteEnvironment.ts:125-137 |
| Unknown remote name | Labelled 'the <name> remote'. | remoteEnvironment.ts:30-32 |
| Virtual workspace | Unsupported; manifest description explains. | package.json:78-81 |
| Offline or reconnect after a dropped SSH link | not handled in the code beyond VS Code's own reconnect. | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/remoteEnvironment.test.ts`: Environment names, PATH and installed-folder search, home expansion, bare name never returned, relative refusal, PATH entries inside the workspace skipped, Windows suffixes, probe results.
- `apps/extension-vscode/src/__tests__/useTerminal.test.ts`: CLI install offer paths in terminals.
- `apps/extension-vscode/src/test/suite/extension.smoke.test.ts`: Integration smoke test in a local VS Code (no remote).

**Test scenarios**

- **Check CLI over SSH**
  1. Open a folder with Remote-SSH.
  2. Run 'Code: Check the CLI in This Environment'.
  - Expected: Message names 'the SSH host' and shows version and path, or the install advice.
- **WSL**
  1. Open a folder in WSL.
  2. Run the same command.
  - Expected: Message names 'WSL'.
- **Container without CLI**
  1. Open a dev container without the CLI.
  2. Open chat.
  - Expected: Setup state offers 'Install AGI CLI' and names the container.
- **Relative path**
  1. Set agiWorkforce.cliPath to a relative path.
  2. Run the check.
  - Expected: Refusal with the workspace explanation.
- **Sign-in in a remote window**
  1. Start sign-in from a remote window.
  - Expected: Text says the approval page opens in the browser on the person's own computer.

**Where to look when it fails**

- Message text quoted above.
- Extension host log of the remote server (VS Code Remote log).

**Hands-on test plans**

- VS Code: [70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md](../../70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md)

## 10. Gaps and dependencies

- **No test or recorded run in a real remote window of any kind.** Affects: Remote users. Evidence: Only unit tests in remoteEnvironment.test.ts; smoke test runs locally. Work needed: Run and record a remote scenario per kind.
- **The brief cites activation limits and stale line numbers (commandSetup.ts:779) for remote support.** Affects: Engineers using the brief. Evidence: apps/extension-vscode/package.json:41-52; commandSetup.ts:959-966. Work needed: Fix the brief references.
- **Whether Local model use over a remote host is explained to the person is unknown.** Affects: Remote Local-mode users. Evidence: no message found. Work needed: Check and add wording.

**Depends on**

- surface:vscode
- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- SYS-local-inference
- SYS-execution-boundaries
- SYS-authentication-and-identity
- SYS-observability-and-operations
- file:apps/extension-vscode/src/platform/remoteEnvironment.ts
- F073-12
- F073-07

## Unknown

- Behaviour in a real Codespaces or tunnel window.
- What the installer does inside a container (cliInstaller.ts not opened).
- Whether Local model servers on the laptop are reachable from a remote host.
- Whether a dropped SSH connection restarts the CLI cleanly.
