---
id: "F070-12"
type: "feature"
title: "Planned or not applicable items"
aliases: ["Local agent daemon", "Local MCP servers", "Developer settings", "Native application context", "Cross-application dictation", "Dictate into the app you are using", "Local model management", "S70.16", "S70.17", "S70.18", "S70.20", "S70.23"]
area: "70 Desktop application"
available_on: ["desktop"]
implementation: {web: "n/a", desktop: "partial", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S70.16", "S70.17", "S70.18", "S70.20", "S70.23"]
depends_on: ["surface:desktop", "SYS-connectors-plugins-and-skills", "SYS-voice-and-media", "SYS-local-inference", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "F070-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F070-12 Planned or not applicable items

Five brief items that the brief says are not applicable or missing on desktop. The code differs for three: local MCP servers and cross-app dictation exist and are connected on macOS, and active-app reading exists only inside computer use and dictation. Local model management exists in the web page but the desktop shell refuses it. No local agent daemon was found.

Area: [70. Desktop application](README.md). Requirement items: [S70.16](../../10-requirements/capabilities/070-desktop-application.md#s7016), [S70.17](../../10-requirements/capabilities/070-desktop-application.md#s7017), [S70.18](../../10-requirements/capabilities/070-desktop-application.md#s7018), [S70.20](../../10-requirements/capabilities/070-desktop-application.md#s7020), [S70.23](../../10-requirements/capabilities/070-desktop-application.md#s7023).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Records the status of five desktop capabilities: a background agent service, MCP servers on the computer, reading the active app, dictating into other apps, and managing local models.

**Why it exists.** The brief lists them with statuses; testers and engineers need to know what really exists.

**Who uses it.** Engineers, testers and product owners checking the brief; developers (MCP) and macOS users (dictation) as end users.

**Problems it solves**

- Stale brief statuses
- Not knowing which controls are real

**Use cases**

- Add an MCP server for coding sessions
- Dictate into another app with the global shortcut
- Confirm that local models are not offered on desktop

## 2. User experience

**Where to find it**

- Local MCP servers: Settings > Developer > 'Local MCP servers' (apps/web/features/desktop-host/components/LocalMcpSettings.tsx:34-37; mounted at WebSettingsModal.tsx:253).
- Dictation: Settings > General > 'Dictate into the app you are using' (macOS only; DesktopSettingsSection.tsx:57; main.ts:1992-1994).
- Local models panel text 'Local models' with 'Allow local models' exists in Local access (LocalAccessSection.tsx:117-121) but renders only for a Tauri host (host.ts:45-48; host-bridge.ts:690).
- Local agent daemon and active-app context: no screen.

**Before you start**

- MCP: an approved folder for coding sessions (LocalMcpSettings.tsx:39-40).
- Dictation: macOS, the switch on after a confirmation, and Accessibility permission (main.ts:2078-2090, :2251-2257).

**Screens and controls**

- MCP: 'Add server', 'Edit config', per-server 'Test', 'Tools', 'Remove', an enable switch, status 'Ready', 'Signed in', 'Needs sign-in', 'Blocked by policy', 'Needs approval' (LocalMcpSettings.tsx:37-61).
- Dictation: switch; a small bar appears over the other app; pressing the shortcut again types the text (DesktopSettingsSection.tsx:58-59).
- Native question 'Dictate into other apps?' (main.ts:2084-2090).

**Journey**

1. MCP: open Developer, press Add server, enter the command, test it, start a coding session; the AGI CLI starts the server for that session.
2. Dictation: switch on and confirm; grant Accessibility; with another app in front press the dictation shortcut, speak, press again; the text is typed into that app.

**What the person sees and gets**

- MCP: test result text and tool list.
- Dictation: text typed into the front app; a notification or clipboard copy when typing is not possible (dictationElsewhere.ts deps typeText, copyText, notify).

**Settings**

- dictateIntoFocusedApp preference (macOS only).
- Config file for MCP servers; path ~/.agiworkforce/mcp.json per doc: docs/decisions/wire-or-cut.md:1065.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Local MCP servers (S70.17): list, add, remove, enable, test, tools, logs, open config and approval review are runtime commands (dispatcher.ts:2862-2925) and a settings pane (LocalMcpSettings.tsx). They run through the AGI CLI for coding sessions, not for the chat assistant: 'MCP servers on this computer, started by the AGI CLI for your coding sessions.' (LocalMcpSettings.tsx:35-36). doc: docs/decisions/wire-or-cut.md:1065 records the decision to wire it.
- Project MCP servers need a native approval review before running (dispatcher.ts:2913; docs/decisions/wire-or-cut.md:724).
- Cross-app dictation (S70.20): front app read, secure-input and password apps skipped, line breaks become spaces, text typed through the input helper, 10 minute session limit, off by default until confirmed (dictationElsewhere.ts:11-45; main.ts:1896-1930, :2251-2257).
- Active app (S70.18): the helper returns the front app name, process id, bundle id, window title and secure-input flag; used by dictation and computer use only (computerUseService.ts:340-395; packages/contracts/local-runtime/src/computer-use.ts:26-45).

**Incomplete**

- Active-app context is never given to the chat assistant as context; no selected-text or content reading was found in the files read.

**Present but disconnected or switched off**

- Local model management (S70.23): the page client calls local_model_servers, local_model_list and settings commands (runtime-client.ts:582-592) but the Electron dispatcher refuses every one with 'answers every conversation in the cloud. Models running on this Mac are not one of its runtimes.' (dispatcher.ts:3242-3245, :3366-3368). The panel renders only when the host shell is Tauri (host-bridge.ts:690-692).
- Telemetry domain named 'local_daemon' labels the Chrome pairing bridge, not an agent daemon (main.ts:507; desktopTelemetry.ts:10).

**Not available**

- Local agent daemon (S70.16): no persistent agent service found in apps/desktop/electron; the AGI CLI runtime is started per folder and shown as 'CLI in <folder>' (backgroundActivity.ts:23-40).
- Local model management on Electron; local inference on Desktop altogether (dispatcher.ts:3242).
- Dictation on non-macOS (preference exposed on darwin only, main.ts:1992-1994).

## 4. Required behaviour

**Established requirements**

- A local agent service runs on the machine and keeps accepting work in the background (brief: not applicable anywhere). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.16)
- The desktop app can run MCP servers on the local machine and give their tools to the assistant (brief: desktop missing). (source: S70.17 in the same brief)
- The assistant can read context from the app the user is working in (brief: desktop missing). (source: S70.18 in the same brief)
- Dictation by global shortcut inserts text into the app in use (brief: not applicable anywhere). (source: S70.20 in the same brief)
- Where local models are offered, the desktop app lets the user list, choose and configure them (brief: not applicable). (source: S70.23 in the same brief)
- Local MCP servers on Electron are wired through a Developer settings page. (source: docs/decisions/wire-or-cut.md:1065)
- Custom MCP servers come with paid plans only. (source: docs/product/definition.md:303)

**Acceptance criteria**

1. Not-applicable items do not appear in the UI: no daemon control exists.
2. Developer shows 'No MCP servers yet...' when empty and 'Approve a folder for coding sessions first...' with no folder.
3. A project-defined MCP server shows 'Needs approval' until reviewed.
4. Turning on dictation asks 'Dictate into other apps?' and Cancel leaves it off.
5. Dictation never types into password prompts and turns line breaks into spaces.
6. The Local models panel is not shown in the desktop app.
7. Reading the active app by the assistant, if built, must ask for permission first.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The brief statuses for S70.17 and S70.20 predate the code and should read 'partial' (MCP for coding sessions only) and 'built' (macOS).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief rows S70.17, S70.20, S70.23.
- [proposed] Remove the unreachable local-model panel text from the Electron build or document it as Tauri-only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LocalMcpSettings | `apps/web/features/desktop-host/components/LocalMcpSettings.tsx` | Developer pane for MCP servers and terminal settings. |
| command | developer_mcp_* commands | `apps/desktop/electron/runtime/dispatcher.ts` | List, add, remove, enable, test, tools, logs, config, approval review (lines 2862-2925). |
| service | developerSessionService MCP calls | `apps/desktop/electron/runtime/developerSessionService.ts` | Calls the AGI CLI's MCP methods. |
| service | mcpApprovalReview | `apps/desktop/electron/runtime/mcpApprovalReview.ts` | Native approval for project MCP servers. |
| service | dictationElsewhere | `apps/desktop/electron/dictationElsewhere.ts` | Dictation into the front app with guards. |
| component | dictationBar | `apps/desktop/electron/dictationBar.ts` | Small bar window. |
| service | voiceDictation | `apps/desktop/electron/voiceDictation.ts` | Global dictation toggle inside the app. |
| service | main dictation wiring | `apps/desktop/electron/main.ts` | dictateFromShortcut, confirmDictateIntoApps, preference handling. |
| service | computerUseService front-app helper | `apps/desktop/electron/runtime/computerUseService.ts` | applicationTakingInput and readFrontWindow. |
| config | computer-use contract | `packages/contracts/local-runtime/src/computer-use.ts` | DeviceFrontWindow shape. |
| command | LOCAL_INFERENCE_COMMANDS refusal | `apps/desktop/electron/runtime/dispatcher.ts` | Refuses local model commands (lines 3242-3245, 3366). |
| component | LocalAccessSection local models panel | `apps/web/features/desktop-host/components/LocalAccessSection.tsx` | Local models panel gated to Tauri. |
| hook | useLocalModels | `apps/web/features/desktop-host/hooks/use-local-models.ts` | Reads local model state; unused on Electron. |
| config | inference contract | `packages/contracts/local-runtime/src/inference.ts` | Local model command names. |
| service | browser bridge | `apps/desktop/electron/browser/bridgeServer.ts` | The only 'local_daemon' telemetry source (main.ts:507). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| MCP: the page calls developer_mcp_*; main forwards to the AGI CLI for the chosen folder, which starts or tests the server process. | device | dispatcher.ts:2862-2925; LocalMcpSettings.tsx:35 |
| An MCP server may itself contact outside services. | outside service | dispatcher.ts:MCP_SERVERS_REASON line 646-647 (reads files and reaches the network) |
| Dictation: the shortcut reads the front app, opens the bar, the speech is captured and text is typed into the app. | device | main.ts:1896-1930; dictationElsewhere.ts |
| How the speech is turned into text for the bar is not shown in the files read. | outside service | unknown; see unknowns |
| Local model commands are answered with a refusal. | device | dispatcher.ts:3366-3368 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| MCP server definitions | ~/.agiworkforce/mcp.json (per doc: docs/decisions/wire-or-cut.md:1065) | No sync found | Until removed in the pane |
| Dictation text | Typed into the other app; clipboard fallback | No | Not kept by the shell as far as the files read show |
| dictateIntoFocusedApp preference | settings.json | No | Until changed |

**Models and providers.** MCP tools are offered to the AGI CLI's coding agent, which uses the session's model. Dictation transcription provider: unknown. Local model management: no desktop path; public Desktop chat is Cloud only (dispatcher.ts:3242).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The panes live in the signed-in hosted app. MCP servers run under the user's own account on the machine. |
| Permissions | MCP: approved folder plus per-project server approval. Dictation: macOS Accessibility; microphone for speech; native confirmation to enable. |
| Subscription | doc: docs/product/definition.md:303 says custom MCP servers come with paid plans only; no plan check was found in LocalMcpSettings.tsx or the dispatcher MCP cases read, so enforcement for local MCP is unknown. |
| Limits and metering | Dictation session limit 10 minutes (dictationElsewhere.ts:45). Others: none found in the code. |
| Feature flags | none found in the code |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code |
| Local mode | MCP servers and dictation-typing run on the device. The desktop app has no local inference, so 'local models' is not available in Desktop; local-model panel is Tauri-only (host-bridge.ts:690). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No folder | MCP page asks to approve a folder first | LocalMcpSettings.tsx:39-40 |
| Empty | 'No MCP servers yet. Add one, or edit the config file.' | LocalMcpSettings.tsx:38 |
| Error | 'MCP servers could not be read.' and 'That could not be done.' | LocalMcpSettings.tsx:41-42 |
| Project server | 'From a project. Review it in the Code rail before it can run.' | LocalMcpSettings.tsx:46 |
| Secure input or password app | Dictation refuses to type | dictationElsewhere.ts:11-23 |
| Front app unreadable | Falls back to dictating inside the app | main.ts:1921-1929 |
| Dictation too long | Session ends at 10 minutes | dictationElsewhere.ts:45 |
| Non-macOS | Dictation preference not exposed | main.ts:1992-1994 |
| Local model request | Refused as unsupported-platform | dispatcher.ts:3366-3368 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/desktop-host/__tests__/LocalMcpSettings.test.tsx`: MCP pane
- `apps/desktop/electron/__tests__/mcpApprovalReview.test.ts`: Project MCP approval dialog
- `apps/desktop/electron/__tests__/approvalReview.test.ts`: Approval review dialogs
- `apps/desktop/electron/__tests__/dictationElsewhere.test.ts`: Dictation into other apps
- `apps/desktop/electron/__tests__/voiceDictation.test.ts`: Global dictation toggle
- `apps/web/features/desktop-host/__tests__/DictationBar.test.tsx`: Dictation bar page
- `apps/web/features/desktop-host/__tests__/LocalModelsPanel.test.tsx`: Local models panel (Tauri path)
- `apps/desktop/electron/__tests__/computerUseSession.test.ts`: Computer-use session which uses the front app reader

**Test scenarios**

- **Add MCP server**
  1. Approve a folder
  2. Settings > Developer > Add server
  3. Press Test
  - Expected: Test result shown; server listed with status
- **Project server approval**
  1. Open a folder with a project MCP file
  2. Open the Code rail
  - Expected: 'Needs approval' and a native review before running
- **Enable dictation**
  1. Switch on 'Dictate into the app you are using'
  2. Cancel the question
  - Expected: Preference stays off
- **Dictate**
  1. Enable and grant Accessibility
  2. Focus a text editor
  3. Press the dictation shortcut, speak, press again
  - Expected: Text typed into the editor with no line breaks
- **Password field**
  1. Focus a macOS password prompt
  2. Press the shortcut
  - Expected: Nothing typed
- **Local models**
  1. Open Local access in Desktop
  - Expected: No Local models panel

**Where to look when it fails**

- DesktopRuntimeError code unsupported-platform for local model commands
- Dictation console warning '[dictation] the app in front could not be read'
- MCP test output in the Developer pane
- Telemetry domain 'local_daemon' means the Chrome bridge

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/070-desktop-application.md](../../70-qa/test-plans/desktop/070-desktop-application.md)

## 10. Gaps and dependencies

- **Brief statuses for S70.17, S70.20 and S70.23 disagree with the code** Affects: Documentation and test planning. Evidence: dispatcher.ts:2862, main.ts:1896, dispatcher.ts:3242. Work needed: Update the brief; add these to the test plan
- **MCP tools reach only the coding agent, not the chat assistant** Affects: surface:desktop chat users. Evidence: LocalMcpSettings.tsx:35-36. Work needed: Decide whether chat should get local MCP tools
- **No active-app context for the assistant (title, selection, contents)** Affects: surface:desktop. Evidence: front-app reads only in computerUseService.ts and dictation. Work needed: Design a permissioned context reader
- **Local model panel code ships in the web app but is unreachable on Electron** Affects: Maintainers. Evidence: host.ts:45-48; host-bridge.ts:690. Work needed: Keep as Tauri-only or remove from the shared page
- **Plan check for local MCP not found although docs say paid only** Affects: Subscription consistency. Evidence: docs/product/definition.md:303; no check in LocalMcpSettings.tsx. Work needed: Confirm where it is enforced or add it

**Depends on**

- surface:desktop
- SYS-connectors-plugins-and-skills
- SYS-voice-and-media
- SYS-local-inference
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- F070-07

## Unknown

- Which service transcribes dictation speech
- Whether local MCP is plan-gated anywhere
- Whether any file other than computerUseService reads the active window for the assistant
- Whether the dictation preference defaults to off (confirmation required to enable)
- Why the brief lists S70.20 and S70.23 as not applicable anywhere
