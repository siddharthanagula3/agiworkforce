---
id: "F102-05"
type: "feature"
title: "Desktop app shell and its local helper"
aliases: ["Desktop renderer", "Desktop privileged host process", "Desktop local daemon", "Local MCP process host", "Electron shell", "AGI CLI app-server", "Local MCP servers", "S102.11", "S102.12", "S102.13", "S102.16"]
area: "102 Runtime inventory"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S102.11", "S102.12", "S102.13", "S102.16"]
depends_on: ["SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-local-inference", "SYS-authentication-and-identity", "SYS-connectors-plugins-and-skills", "SYS-shared-ui-and-design", "surface:desktop", "surface:cli", "mode:cloud", "mode:local", "store:agi-cloud-session-partition", "F102-06", "file:apps/desktop/electron/runtime/dispatcher.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F102-05 Desktop app shell and its local helper

The Electron desktop app is a window that loads the hosted web app, with a locked-down bridge to a main process that serves native commands through a dispatcher after folder and capability checks. For coding sessions it starts the bundled CLI in app-server mode, which hosts local MCP tool servers. Desktop chat itself is Cloud only.

Area: [102. Runtime inventory](README.md). Requirement items: [S102.11](../../10-requirements/capabilities/102-runtime-inventory.md#s10211), [S102.12](../../10-requirements/capabilities/102-runtime-inventory.md#s10212), [S102.13](../../10-requirements/capabilities/102-runtime-inventory.md#s10213), [S102.16](../../10-requirements/capabilities/102-runtime-inventory.md#s10216).

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

**What it does.** Shows the hosted web app in an Electron window, gives it a permission-checked bridge to the user's files, shell and coding runtime, and starts the AGI CLI as a long-running helper for coding sessions in an approved folder. That helper starts MCP servers as local child processes.

**Why it exists.** The desktop must feel like one product with the web while doing things a browser cannot: touch local folders, run commands, host local tools.

**Who uses it.** People who install the AGI desktop app on macOS (and other platforms the packaged app supports); developers running local coding sessions.

**Problems it solves**

- One UI for web and desktop without a second front end.
- Safe access to local folders: nothing runs before the user grants a folder and a capability.
- Long-running coding agents with their own process and recovery.
- Local tool servers (MCP) with a cleaned environment.

**Use cases**

- Open the desktop app and land in the hosted sign-in or chat.
- Add a folder under Settings, then start a coding session that runs the CLI helper in it.
- Add a local MCP server and test it.
- The window crashes; the app reloads it once, then shows a crash screen.

## 2. User experience

**Where to find it**

- Desktop app window (Electron).
- Settings, Capabilities page, section 'Local access' with 'Folders' ('Add a folder', 'Reveal', 'Remove') and 'Commands' (apps/web/features/desktop-host/components/LocalAccessSection.tsx:37-64; apps/web/features/settings/sections/CapabilitiesSection.tsx:213; nav label 'Capabilities' in WebSettingsModal tests).
- Section 'Developer' with 'Local MCP servers', 'Add server', 'Edit config', 'Test', 'Tools', 'Remove' (apps/web/features/desktop-host/components/LocalMcpSettings.tsx:34-48).
- Not shown on web, mobile, CLI-only, VS Code or Chrome (the host section returns nothing without a desktop host: LocalAccessSection.tsx:~393 'if (!host) return null').

**Before you start**

- Install the desktop app and sign in through the hosted page.
- For coding sessions and MCP: approve a folder first ('Approve a folder for coding sessions first. MCP servers run through the AGI CLI, which starts in an approved folder.', LocalMcpSettings.tsx:41-42).
- Grant the capability (shell.execute) when asked.

**Screens and controls**

- Native approval dialogs for capabilities and MCP launches (apps/desktop/electron/runtime/mcpApprovalReview.ts).
- Crash screen after repeated renderer faults (main.ts:895-915).

**Journey**

1. 1. The user opens the app; the window loads the hosted entry URL (main.ts:1328) after the app is reachable (main.ts:326).
2. 2. The user signs in; sign-in screens and the persistent session partition keep the session (config.ts REMOTE_SESSION_PARTITION).
3. 3. The user adds a folder; the main process stores consent (workspaceStore).
4. 4. The user starts a coding session; the main process spawns the CLI with app-server and consent arguments (developerSessionService.ts:1453-1470).
5. 5. The user adds an MCP server; the helper starts it when needed; project servers need approval first.
6. 6. If the window dies the app reloads once; a second quick fault shows a crash screen.

**What the person sees and gets**

- Native question dialogs with the exact command or launch details.
- Messages such as '<folder> is no longer on this Mac, so no coding session can run in it.' (developerSessionService.ts:~1426-1430).
- Shell and runtime events streamed to the web UI through the runtime event channel.

**Settings**

- CLI binary: a custom path chosen in Settings, else the bundled CLI, else an installed one, else 'agi' on PATH (developerSessionService.ts:373-381).
- AGI_CLOUD_APP_ORIGIN is honoured only in an unpackaged build (config.ts:~62-72 cloudAppOriginFrom).
- Programs allowed or blocked (F102-06).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Window loads the hosted app; the API base must be first-party HTTPS or localhost without credentials (apps/desktop/electron/config.ts:46-50, cloudAppOriginFrom ~line 62); packaged builds ignore the environment override.
- Window security: contextIsolation on, sandbox on, nodeIntegration off, preload bridge, persistent partition (apps/desktop/electron/main.ts:1103-1115).
- Bridge calls require a trusted sender and go to dispatchDesktopRuntime (main.ts:423, :525-540). The dispatcher refuses local-inference commands, then classifies every command into session, folder or ungated, and refuses a command found in none or two tables (dispatcher.ts:3326-3365).
- Folder capabilities: each folder command names a capability with a plain reason and the user is prompted once (dispatcher.ts:640-720, :3280-3320).
- Helper: spawned detached with app-server; for the bundled signed CLI it also passes workspace-consent arguments and a worktrees root; SSH environments use a remote launch (developerSessionService.ts:1431-1470). Its environment is the app's with guard-lifting variables removed plus the cloud origin (developerSessionService.ts:1182-1191). Stopping closes stdin then kills the process group after a grace period (developerSessionService.ts:~636-668).
- MCP host: the CLI uses the agiworkforce-mcp crate; local stdio servers are child processes with piped stdin, stdout and stderr, an emptied environment plus an allowlist, and manifest variables that would load code are refused (crates/agiworkforce-mcp/src/transport/stdio.rs:447-470). The client also supports HTTP and SSE transports (client.rs open_conn ~line 1087).
- MCP management commands (list, add, remove, enable, test, tools, logs, approval review) are dispatcher commands that need shell.execute (dispatcher.ts:845-900, cases ~2862-2890).
- Crash recovery: a renderer that is gone or unresponsive reloads once, then shows a crash screen with a reference (main.ts:895-915; runtime/rendererRecovery.ts:63).

**Incomplete**

- Not every privileged path goes through the dispatcher: main.ts registers other IPC handlers directly for open-external, notifications, dictation, updates, navigation and preferences (main.ts:542-673), each behind trusted-sender checks [the dispatcher comment claims it is the only way; the code shows additional handlers].

**Present but disconnected or switched off**

- Local inference commands are deliberately refused in this shell (dispatcher.ts:3236-3244).
- Tauri code in apps/desktop/src-tauri is retained internal code and is not the public desktop (AGENTS.md section 5).

**Not available**

- Windows and Linux support for every feature was not verified.
- Mobile and web have no MCP host: none found in apps/mobile or apps/web for local servers.

## 4. Required behaviour

**Established requirements**

- The desktop app renders its UI in an Electron renderer (hosted web by default). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.11)
- A privileged Electron main process hosts native services behind a dispatcher. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.12)
- The desktop starts a local long-running runtime process (the CLI app-server) for developer sessions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.13)
- Local MCP servers run as child processes managed by a host. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.16)
- The public Desktop shows the hosted web app; changes to apps/desktop/src never reach the Electron window. (source: (AGENTS.md section 5))
- Electron is the public desktop application. (source: (doc: docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-04))

**Acceptance criteria**

1. A packaged build ignores AGI_CLOUD_APP_ORIGIN and loads the production origin.
2. An API base URL with http on a non-local host, or with credentials, is refused.
3. A bridge call from an untrusted sender throws 'Untrusted bridge caller.'
4. A command not listed in exactly one gate table is refused before any service runs.
5. Starting a coding session for a folder that no longer exists gives the 'no longer on this Mac' message and spawns nothing.
6. An MCP stdio server does not receive the app's secrets: only allowlisted variables and the configured ones.
7. After a renderer crash the window reloads once; a second fault soon after shows the crash screen.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every privileged native call should go through one audited path; the extra direct handlers in main.ts should be reviewed against that rule [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Document the direct IPC handlers next to the dispatcher so the claim 'only way' is accurate.
- [proposed] Add Local mode on the desktop with an explicit label, per the stated requirement, after a product decision.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | desktop config | `apps/desktop/electron/config.ts` | Cloud origin, allowlist, session partition. |
| service | main process | `apps/desktop/electron/main.ts` | Windows, IPC registration (line 524), recovery (line 895), webPreferences (line 1103). |
| service | dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | Command table, gates and permission prompts (lines 640-900, 3326-3496). |
| service | developerSessionService | `apps/desktop/electron/runtime/developerSessionService.ts` | Starts, talks to and stops the CLI app-server; MCP management. |
| service | mcpApprovalReview | `apps/desktop/electron/runtime/mcpApprovalReview.ts` | Shows what a project MCP server would launch before approval. |
| service | rendererRecovery | `apps/desktop/electron/runtime/rendererRecovery.ts` | Plans reload or crash screen (line 63). |
| service | workspaceStore / permissionManager | `apps/desktop/electron/runtime/workspaceStore.ts` | Approved folders and capability grants. |
| service | bundled CLI | `apps/cli/src/app_server.rs` | The helper process mode started by the desktop. |
| service | MCP client | `crates/agiworkforce-mcp/src/client.rs` | MCP client over stdio, HTTP and SSE. |
| service | MCP stdio transport | `crates/agiworkforce-mcp/src/transport/stdio.rs` | Spawns the server child process (lines 447-470). |
| component | LocalAccessSection | `apps/web/features/desktop-host/components/LocalAccessSection.tsx` | Folders and Commands settings shown inside the desktop window. |
| component | LocalMcpSettings | `apps/web/features/desktop-host/components/LocalMcpSettings.tsx` | MCP server management UI. |
| service | desktop runtime client | `apps/web/features/desktop-host/lib/runtime-client.ts` | Web-side calls into the desktop bridge. |
| command | developer_mcp_* commands | `apps/desktop/electron/runtime/dispatcher.ts` | list, add, remove, set_enabled, test, tools, logs (lines 845-871). |
| config | preload bridge | apps/desktop/electron/preload.cts (not found) (not found) | Exposes the bridge to the page [path inferred from main.ts:1110 preload.cjs; source file name not opened]. |
| store | desktop session partition | `apps/desktop/electron/config.ts` | Persistent web session 'persist:agi-cloud'. |
| config | local runtime contract | `packages/contracts/local-runtime/src/index.ts` | Shared command, capability and shell types [path inferred from package layout]. |
| config | IPC channels | `apps/desktop/electron/main.ts` | Direct handlers beyond the dispatcher (lines 542-673). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The window loads the hosted app over HTTPS. | device and our servers | (main.ts:1328; config.ts:17) |
| The page calls the bridge; the main process checks the sender. | device | (main.ts:423, :525-533) |
| The dispatcher gates the command by folder and capability, prompting the user when needed. | device | (dispatcher.ts:3326-3496) |
| For a coding session the main process spawns the CLI in the folder and speaks to it over stdin and stdout. | device | (developerSessionService.ts:1453-1470) |
| The CLI signs in to the hosted origin for Cloud models and may call Cloud providers; it can also run local or own-key models. | device and our servers | (developerSessionService.ts:1182-1186 sets API base and auth base) |
| The CLI starts configured MCP servers as child processes. | device | (crates/agiworkforce-mcp/src/transport/stdio.rs:447) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approved folders and capability grants | desktop user data on the device (workspace and permission stores) | No | Removed when the user removes the folder or withdraws the grant (LocalAccessSection: Remove, Withdraw) |
| Web session | Electron partition persist:agi-cloud | No | until sign-out |
| Coding session history | the CLI's folders on the device | unknown | Delete removes the session from this computer (dispatcher.ts:developer_thread_delete reason) |

**Models and providers.** Desktop chat answers come from Cloud only. The CLI helper can use models according to the CLI's own configuration; the shell tells it which cloud origin to use. Local models are reached through the bundled CLI, not through the shell's chat (dispatcher.ts:3236-3242 comment).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in through the hosted page; the CLI signs in to the same origin with its own account grant (developerSessionService.ts:1177-1186, :1205-1213). |
| Permissions | Folder grant plus capability grant per command (shell.execute, filesystem.read and so on) with a stated reason (dispatcher.ts:640-720). |
| Subscription | Desktop Cloud chat is subject to the account plan (F102-01). Local coding with the helper has no subscription check in the shell code read here: none found in the code in main.ts or dispatcher.ts. CLI-side entitlement was not read. |
| Limits and metering | none found in the code for the shell itself. |
| Feature flags | AGI_CLOUD_APP_ORIGIN (unpackaged only), --agi-cloud-app-origin argument. |
| Model compatibility | Not applicable to the shell. |
| Provider restrictions | Cloud origin must be agiworkforce.com, a subdomain, or localhost (config.ts:42-50). |
| Local mode | The shell refuses local-inference commands: desktop chat is Cloud only (dispatcher.ts:3236-3244). Local coding sessions through the CLI helper run on the device. Whether local models in the CLI are free of subscription was not established here. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Offline or app unreachable | The window waits and reloads once reachable (main.ts:326-346 appReachable, reloadOnceReachable). | (main.ts:326-346) |
| Renderer crash | Reload once; a repeat shows a crash screen with a reference; each counted. | (main.ts:895-915) |
| Folder removed from disk | Session refused with a plain message. | (developerSessionService.ts:1425-1431) |
| CLI binary missing | spawnFailure error naming the binary. | (developerSessionService.ts:389-396) |
| Helper protocol fault or exit | closeServer rejects pending requests and emits runtime-stopped. | (developerSessionService.ts:~672-690) |
| Untrusted bridge caller | Throws. | (main.ts:526) |
| Permission denied | Failure code permission-denied with the capability and folder. | (dispatcher.ts:3290-3300) |
| Accessibility | unknown for the shell; native dialogs use platform behaviour. | not read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/config.test.ts`: Desktop config.
- `apps/desktop/electron/__tests__/cloud-app-origin.test.ts`: Origin selection and allowlist.
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Dispatcher gates.
- `apps/desktop/electron/__tests__/developerSessionService.test.ts`: Helper lifecycle.
- `apps/desktop/electron/__tests__/bundledCli.test.ts`: Bundled CLI selection.
- `apps/desktop/electron/__tests__/runtimeEnvironment.test.ts`: Environment passed to the helper.
- `apps/desktop/electron/__tests__/rendererRecovery.test.ts`: Crash recovery plans.
- `apps/desktop/electron/__tests__/mcpApprovalReview.test.ts`: MCP approval review text.
- `apps/desktop/electron/__tests__/preloadBridge.test.ts`: Bridge surface.
- `apps/desktop/electron/__tests__/windowPolicy.test.ts`: Navigation policy.
- `crates/agiworkforce-mcp/tests/stdio.rs`: Stdio MCP transport.
- `apps/web/features/desktop-host/__tests__/LocalAccessSection.test.tsx`: Local access settings UI.

**Test scenarios**

- **Origin lock**
  1. Start a packaged build with AGI_CLOUD_APP_ORIGIN set to another host.
  - Expected: The window loads the production origin.
- **Coding session helper**
  1. Add a folder.
  2. Start a coding session.
  3. Check the process list.
  - Expected: One CLI process with app-server argument runs in that folder; closing the session ends the process group.
- **Crash**
  1. Kill the renderer process twice within a short time.
  - Expected: First reload, then a crash screen with a reference.
- **MCP environment**
  1. Add a stdio MCP server that prints its environment.
  2. Run Test.
  - Expected: Only allowlisted and configured variables appear.
- **Local inference refusal**
  1. Call a local-inference bridge command.
  - Expected: unsupported-platform failure.

**Where to look when it fails**

- Desktop telemetry events: crash, cloud_request outcomes (main.ts:895-915, :1338-1347).
- Runtime failure codes such as permission-denied, unsupported-platform.
- MCP server logs through developer_mcp_logs.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Desktop has no local inference in the shell, though local inference on desktop should be free of any paid subscription.** Affects: Desktop users.. Evidence: (dispatcher.ts:3236-3244). Work needed: Product decision and Local-mode path with explicit labelling.
- **Dispatcher is described as the only path but other IPC handlers exist.** Affects: Security review.. Evidence: (main.ts:542-673 vs dispatcher.ts comment). Work needed: Review each handler; fix the comment or route through the dispatcher.
- **Subscription rules for the local helper are not visible from the shell.** Affects: Local coding on desktop.. Evidence: (none found in main.ts and dispatcher.ts). Work needed: Read the CLI entitlement code and record it.

**Depends on**

- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-local-inference
- SYS-authentication-and-identity
- SYS-connectors-plugins-and-skills
- SYS-shared-ui-and-design
- surface:desktop
- surface:cli
- mode:cloud
- mode:local
- store:agi-cloud-session-partition
- F102-06
- file:apps/desktop/electron/runtime/dispatcher.ts

## Unknown

- Entitlement rules in the CLI helper for local coding.
- Windows and Linux behaviour of the shell.
- Exact preload source file name and the local-runtime package entry file.
- Where approved folders are stored on disk (file name).
- Whether coding session history syncs anywhere.
- Brief lines main.ts:884, main.ts:1345 and dispatcher.ts:799 were not matched to the code I opened (main.ts:1345 is a code-session activity report).
