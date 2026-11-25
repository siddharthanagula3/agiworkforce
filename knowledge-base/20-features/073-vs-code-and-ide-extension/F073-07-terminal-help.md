---
id: "F073-07"
type: "feature"
title: "Terminal help"
aliases: ["Explain Terminal Output", "Code: Explain Terminal Output", "Terminal integration", "Add Terminal Output to Chat", "Continue This Session in the Terminal", "Suggest Terminal Command", "Run Terminal Command", "S73.16", "agi-workforce.explainTerminal", "agi-workforce.continueInTerminal"]
area: "73 VS Code and IDE extension"
available_on: ["vscode"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S73.16"]
depends_on: ["surface:vscode", "mode:local", "mode:own-key", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "file:apps/extension-vscode/src/providers/terminalProvider.ts", "file:packages/client/ide-runtime/src/terminal.ts", "F073-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F073-07 Terminal help

In the AGI Code VS Code extension, the person can have the last terminal command and its output explained in chat, attach that output to a chat message, ask for safe command suggestions, run a command in a terminal, and hand a chat session to the AGI CLI in a terminal. VS Code only.

Area: [73. VS Code and IDE extension](README.md). Requirement items: [S73.16](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7316).

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

**What it does.** Links the VS Code integrated terminal to the chat. It reads the latest command and output from the active terminal (when VS Code shell integration is on), sends it to chat for explanation, offers validated command suggestions, runs commands in a terminal named Code, and starts the AGI CLI in a terminal named AGI to resume the current chat session.

**Why it exists.** The brief says the extension should work with the integrated terminal: run, suggest and explain commands, and continue a session in a terminal (S73.16). People hit errors in the terminal and want help without copying text by hand.

**Who uses it.** Developers using the AGI Code extension in VS Code, in local or remote windows.

**Problems it solves**

- Copying a long failing command output into chat by hand
- Not knowing what a terminal error means
- Moving a chat session into the CLI without losing the session id
- Running an AI-suggested command without review

**Use cases**

- A test run fails in the terminal; the person runs Code: Explain Terminal Output and reads the cause and fix in chat.
- Shell integration is off; the person pastes the output into the input box and gets the same explanation.
- The person uses Code: Suggest Terminal Command, picks a validated suggestion and confirms it before it runs.
- The person finishes a chat in the sidebar and runs Code: Continue This Session in the Terminal to keep working in the CLI.

## 2. User experience

**Where to find it**

- VS Code only. Command Palette titles: 'Code: Explain Terminal Output' (apps/extension-vscode/package.json:335-336), 'Code: Suggest Terminal Command' (package.json:340-341), 'Code: Run Terminal Command' (package.json:325-326), 'Code: Continue This Session in the Terminal' (package.json:808-810).
- Right-click menu inside a terminal: the entry for agi-workforce.addTerminalOutputToChat (package.json:1046-1050, command defined at package.json:238).
- Composer context chip for terminal output, which is unavailable until a command has run with shell integration (apps/extension-vscode/src/data/composerContext.ts:347-352).
- Explain Terminal Output has no editor or terminal menu entry; only the palette (no other package.json hit for explainTerminal besides the definition at line 335).

**Before you start**

- A trusted workspace. Explain Terminal Output refuses in an untrusted workspace (apps/extension-vscode/src/features/editor-utilities/editorUtilities.ts:142-146 with apps/extension-vscode/src/core/outboundContentGuard.ts:15).
- VS Code shell integration in the terminal to read output automatically; otherwise the person pastes it (apps/extension-vscode/src/providers/terminalProvider.ts:305-323).
- Continue in Terminal needs a started chat session, an open folder and an AGI CLI that runs (apps/extension-vscode/src/core/commandSetup.ts:466-493).
- Suggest Terminal Command needs a Cloud model; a Local model is refused (apps/extension-vscode/src/providers/terminalProvider.ts:194-197).

**Screens and controls**

- Input box titled 'Code, Paste Terminal Output' with placeholder 'Paste terminal output here…' (terminalProvider.ts:311-316).
- Quick pick 'Code, Suggested Commands (AI-generated, verify before running)'; blocked commands show 'BLOCKED' and 'This command will NOT be run.' (terminalProvider.ts:232-255).
- Modal warning 'Run the following command in your terminal?' with button 'Run Command' (terminalProvider.ts:270-274).
- Warning with button 'Install AGI CLI' when the CLI cannot be found (commandSetup.ts:500-515).
- Info message 'send a message first, then the terminal can pick this session up.' when there is no session (commandSetup.ts:468-473).

**Journey**

1. 1. Run a command in the integrated terminal.
2. 2. Open the Command Palette and choose 'Code: Explain Terminal Output'.
3. 3. The extension reads the last command, its output and its exit code from the active terminal (terminalProvider.ts:283-291).
4. 4. If nothing was captured, an input box asks for pasted output; an empty answer cancels (terminalProvider.ts:311-322).
5. 5. The prompt 'Explain this terminal output. If it failed, say what went wrong and how to fix it.' with the output in a code fence goes to the sidebar chat and the chat view is revealed (editorUtilities.ts:142-153; apps/extension-vscode/src/extension.ts:278-290).
6. 6. The answer streams in chat as a normal turn.
7. 7. To continue in the CLI, run 'Code: Continue This Session in the Terminal'; a terminal named AGI opens in the folder and runs the CLI with --resume and the session id (commandSetup.ts:491-493).

**What the person sees and gets**

- A chat turn with the explanation.
- Warnings: 'No terminal output to explain.' for empty output (editorUtilities.ts:143); the untrusted-workspace refusal text (outboundContentGuard.ts:6-7); 'The chat view is not available in this window. Reload the window and try again.' (editorUtilities.ts:31-35).
- For the attach action: 'no command output has been captured in the active terminal. Run a command in a terminal with shell integration, then try again.' (apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:328-334).
- The attached context item is named 'Terminal: <terminal name>' (composerContext.ts:185).

**Settings**

- agiWorkforce.useTerminal makes 'Code: Open Chat' start the CLI in a terminal instead of the native chat (package.json:1472; apps/extension-vscode/src/core/commandSetup.ts:1126-1129). It is listed as not overridable by an untrusted folder (package.json:65).
- agiWorkforce.cliPath selects the CLI that Continue in Terminal and sign-in commands run (package.json:1232).
- agiWorkforce.terminal.usePythonEnvironment activates the workspace Python environment in new AGI terminals (package.json:73; apps/extension-vscode/src/platform/agiTerminal.ts:26-47).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Capture of the latest shell execution per terminal: command line (only when VS Code reports high confidence), output with control codes stripped, exit code, running state; dropped when the terminal closes (apps/extension-vscode/src/providers/terminalProvider.ts:82-99, 293-303, 338-345).
- Capture stops growing at 8,000 characters and adds '... [output truncated]' (packages/client/ide-runtime/src/terminal.ts:4, 48).
- Explain Terminal Output falls back to a paste box (terminalProvider.ts:283-323) and sends one chat prompt (editorUtilities.ts:142-153).
- Add Terminal Output to Chat attaches 'Terminal: <name>' and keeps only the last 20,000 characters if longer (apps/extension-vscode/src/data/composerContext.ts:177-188; apps/extension-vscode/src/features/chat-participant/promptReferences.ts:8). [inferred] Because capture stops at 8,000 characters, this 20,000 cut is not reached by captured output.
- A terminal named Code is reused only if it is open, not running a command, and inside the workspace folder; otherwise a new one is created with the workspace folder as its working directory (terminalProvider.ts:103-133).
- Suggest Terminal Command asks a Cloud model for one to five commands, blocks unsafe ones in a shared validator, needs a modal confirm, and re-checks at the sink (terminalProvider.ts:190-281; packages/client/ide-runtime/src/terminal.ts:670-736).
- Run Terminal Command refuses in an untrusted workspace (terminalProvider.ts:135-145).
- Continue in Terminal releases the session writer, creates the AGI terminal in the workspace folder and runs the CLI with --resume and a shell-quoted session id (apps/extension-vscode/src/core/commandSetup.ts:466-494; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6515-6527).

**Incomplete**

- The first draft said the output is cut to the last part in the attach path when too long. That path exists, but capture already caps at 8,000 characters, so the two limits differ and only the 8,000 one is visible in practice [inferred] (ide-runtime terminal.ts:4; promptReferences.ts:8).
- If releasing the writer fails with an error other than 'stop before terminal', the failure is only logged and the CLI still starts (ChatStateManager.ts:6519-6526). Effect on a live session is unknown.

**Present but disconnected or switched off**

- Explain Error (agi-workforce.explainError, package.json:345-346) is not a terminal feature. It reads editor diagnostics around the cursor, so it is outside this feature even though the first draft listed it (apps/extension-vscode/src/features/editor-utilities/editorUtilities.ts:68-85; apps/extension-vscode/src/providers/errorExplainerProvider.ts:16-19).
- Explain Terminal Output has no menu placement, only the palette (package.json search).

**Not available**

- Web, Desktop, Mobile, CLI and Chrome do not have this feature (brief S73.16: status vscode only).
- Output of commands run before shell integration started, or in terminals without shell integration, cannot be read; the person must paste it (terminalProvider.ts:305-309).

## 4. Required behaviour

**Established requirements**

- The extension works with the integrated terminal: run, suggest and explain commands and continue a session in a terminal. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S73.16)
- VS Code is a thin client over the CLI-hosted developer session; do not add a second execution or persistence owner in the extension. (source: doc: docs/product/definition.md:509-516)
- Moving selected context between Cloud and a local developer session is an explicit handoff with consent where the trust boundary changes. (source: doc: docs/product/definition.md:121)

**Acceptance criteria**

1. With shell integration on, after a failing command, 'Code: Explain Terminal Output' sends a chat prompt containing the command line, the output and the exit code.
2. With shell integration off, the same command opens 'Code, Paste Terminal Output'; pasting text sends that text; cancelling or empty input sends nothing.
3. In an untrusted workspace, Explain Terminal Output and Run Terminal Command send or run nothing and show the trust message.
4. A suggested command that fails the validator is shown as BLOCKED and cannot be run even if picked.
5. 'Code: Continue This Session in the Terminal' with no session shows the 'send a message first' message and opens no terminal.
6. With a started session and a working CLI, a terminal named AGI opens in the workspace folder and resumes the same session id.
7. A terminal outside the workspace folder is not reused for a new command; a new Code terminal is created in the folder.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Explanation of terminal text should follow the model chosen in the chat, so Local, own key and Cloud routes behave as in any chat turn [inferred from editorUtilities sending the prompt to the sidebar chat, extension.ts:278-290].
- Output sent to a model should be bounded; the 8,000 character capture cap serves that [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a small notice when captured output was truncated, so the person knows the model saw only part of it.
- [proposed] Add Explain Terminal Output to the terminal right-click menu next to Add Terminal Output to Chat.
- [proposed] Align the two output limits (8,000 and 20,000) or drop the unreachable one.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | TerminalProvider | `apps/extension-vscode/src/providers/terminalProvider.ts` | Captures shell executions, creates or reuses the Code terminal, runs validated commands, asks for pasted output, suggests commands. |
| command | agi-workforce.explainTerminal | `apps/extension-vscode/src/providers/terminalProvider.ts` | Registered at line 405; reads output and sends the explain prompt. |
| command | agi-workforce.suggestCommand / runCommand | `apps/extension-vscode/src/providers/terminalProvider.ts` | Suggest (line 411) and run (line 357) terminal commands. |
| service | Editor utility prompts | `apps/extension-vscode/src/features/editor-utilities/editorUtilities.ts` | buildExplainTerminalPrompt (line 142) and runEditorUtility (line 27) send the prompt to chat. |
| service | Outbound content guard | `apps/extension-vscode/src/core/outboundContentGuard.ts` | Refuses to send content from untrusted workspaces or credential files. |
| store | Terminal output source | `apps/extension-vscode/src/data/terminalOutput.ts` | Lets the composer read the latest output from the provider. |
| service | Composer context terminal attachment | `apps/extension-vscode/src/data/composerContext.ts` | Builds the 'Terminal: <name>' attachment and its availability text. |
| command | agi-workforce.addTerminalOutputToChat | `apps/extension-vscode/src/core/commandSetup.ts` | Registered at line 1390; calls sidebarProvider.attachTerminalOutput. |
| service | SidebarProvider.attachTerminalOutput | `apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts` | Line 328; attaches or shows a no-output message. |
| command | agi-workforce.continueInTerminal | `apps/extension-vscode/src/core/commandSetup.ts` | Registered at line 1494; calls continueThisSessionInTheTerminal (line 466). |
| service | ensureCliForTerminal and openAgiInTheTerminal | `apps/extension-vscode/src/core/commandSetup.ts` | Probe the CLI and offer install (line 500); start the CLI in a terminal (line 517). |
| service | createAgiTerminal / findAgiTerminal | `apps/extension-vscode/src/platform/agiTerminal.ts` | Creates and finds the terminal named AGI, optionally with a Python environment. |
| service | releaseForTerminal | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Line 6515; hands the session writer back before the CLI resumes it. |
| service | Terminal capture helpers and command validator | `packages/client/ide-runtime/src/terminal.ts` | Capture limits, control-code stripping, formatting, command validation. |
| config | Command and menu declarations | `apps/extension-vscode/package.json` | Commands (lines 238, 325, 335, 340, 808), terminal/context menu (1046), settings (1232, 1472). |
| service | Cloud model boundary | `apps/extension-vscode/src/core/cloudModelBoundary.ts` | cloudUtilityModel (line 17) decides cloud or local route for Suggest Command. |
| test | terminalProvider tests | `apps/extension-vscode/src/__tests__/terminalProvider.test.ts` | Validator and sink gate tests. |
| test | terminalShellIntegration tests | `apps/extension-vscode/src/__tests__/terminalShellIntegration.test.ts` | Capture, truncation, paste fallback, per-terminal behaviour. |
| test | sessionHandoffCommands tests | `apps/extension-vscode/src/__tests__/sessionHandoffCommands.test.ts` | Continue in Terminal behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| VS Code reports a shell execution start and the extension reads its output stream into a bounded buffer. | device | apps/extension-vscode/src/providers/terminalProvider.ts:82-90, 293-303 |
| The person runs Explain Terminal Output; the extension takes the active terminal's last capture or asks for pasted text. | device | apps/extension-vscode/src/providers/terminalProvider.ts:185-188, 283-323 |
| The extension builds the prompt and hands it to the sidebar chat, which runs it as a normal chat turn. | device | apps/extension-vscode/src/features/editor-utilities/editorUtilities.ts:142-153; apps/extension-vscode/src/extension.ts:278-290 |
| The chat turn is run by the AGI CLI runtime started per workspace; where the model call goes depends on the chosen model route (Local, own key or Cloud). The routing itself was not traced for this feature. | device and our servers | doc: docs/product/definition.md:509-516; route detail unknown |
| For Suggest Terminal Command the extension sends the request text to the Cloud chat completion API; Local model is refused. | our servers | apps/extension-vscode/src/providers/terminalProvider.ts:194-221 |
| For Continue in Terminal, the extension releases the session writer to the CLI runtime and types the resume command into a terminal. | device | apps/extension-vscode/src/core/commandSetup.ts:466-494 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Latest captured command, output and exit code per terminal | Extension memory only | No; it leaves the device only when the person runs an explain or attach action | Dropped when the terminal closes or the extension is disposed (terminalProvider.ts:75-81, 325-331) |
| Pasted output | Not stored; used for the one prompt | Becomes part of the chat message and follows that chat's storage | Follows chat retention; not traced here |
| Chat session id | CLI developer-session store, outside this feature | unknown | unknown |

**Models and providers.** Explain and attach use whatever model the chat uses. Suggest Terminal Command uses the Cloud utility model only and refuses a Local model (terminalProvider.ts:194-197). No model name is fixed in this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Explain and attach work through the chat, so sign-in depends on the chosen route. Suggest Terminal Command needs a Cloud account token (apps/extension-vscode/src/utils/api.ts, chatCompletion; exact check not traced). Continue in Terminal needs no sign-in in the extension code opened. |
| Permissions | Workspace Trust is required for explain and run (outboundContentGuard.ts:15; terminalProvider.ts:136). Credential-file content is refused only for editor documents, not for terminal text. |
| Subscription | Managed-cloud developer access needs Premium or higher; Free and Basic do not include managed-cloud VS Code access, while Local and own key stay available (doc: docs/product/definition.md:378-382). The per-command plan check for this feature was not found. |
| Limits and metering | Output cap of 8,000 characters at capture and 20,000 at attach (ide-runtime terminal.ts:4; promptReferences.ts:8). Usage metering follows the chat turn; not traced. |
| Feature flags | none found in the code for this feature. |
| Model compatibility | Explain and attach: any chat model. Suggest Terminal Command: Cloud models only. |
| Provider restrictions | none found in the code, except that Suggest Terminal Command rejects a Local-route model. |
| Local mode | Explain Terminal Output and Add Terminal Output to Chat go through the chat, so they can use a Local model [inferred]. Suggest Terminal Command is refused with a message when the selected model is Local (terminalProvider.ts:194-197, 412-418). Continue in Terminal runs the local CLI and needs no cloud call. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No active terminal | captureOutput creates a Code terminal in the workspace folder, which has no capture, so the paste box appears. | apps/extension-vscode/src/providers/terminalProvider.ts:185-188, 111-133 |
| Shell integration inactive | Paste box says 'Shell integration is not active in this terminal.' | terminalProvider.ts:306-309 |
| Nothing captured yet | Paste box says 'No command output has been captured in this terminal yet.' | terminalProvider.ts:306-309 |
| Command still running | Output so far is sent with '[command is still running]'. | packages/client/ide-runtime/src/terminal.ts:49 |
| Low-confidence command line | The command line is left out rather than shown as fact. | terminalProvider.ts:338-345 |
| Output stream error | Captured text so far stays; nothing is invented. | terminalProvider.ts:299-302 |
| Untrusted workspace | Explain and run refuse with a trust message. | outboundContentGuard.ts:15; terminalProvider.ts:136-141 |
| Remote window | CLI-missing messages name the environment (for example the SSH host) and offer install. | apps/extension-vscode/src/core/commandSetup.ts:500-512; apps/extension-vscode/src/platform/remoteEnvironment.ts:184-186 |
| Turn in progress when continuing | A message asks the person to stop the turn first, and no terminal is opened. | ChatStateManager.ts:6518; commandSetup.ts:478-484 |
| Accessibility | Command-palette and quick-pick flows are keyboard driven; no screen-reader specific handling for this feature was found. | not handled in the code (no accessibility code found in terminalProvider.ts) |
| Offline or timeout | not handled in the code for explain; Suggest Terminal Command shows a cancellable progress notification and error actions with retry. | terminalProvider.ts:450-485 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/terminalShellIntegration.test.ts`: Capture through shell integration, control-code stripping, truncation, low-confidence command line, running state, paste fallback reasons, per-terminal capture, empty transcript refusal, attach offer.
- `apps/extension-vscode/src/__tests__/terminalProvider.test.ts`: Command validator rules, Local model refusal for suggestions, BLOCKED quick-pick items, sink refusal, workspace-relative arguments outside the workspace.
- `apps/extension-vscode/src/__tests__/editorUtilities.test.ts`: Explain terminal output prompt refusal on empty text and fencing; routing to the chat view.
- `apps/extension-vscode/src/__tests__/sessionHandoffCommands.test.ts`: Continue in Terminal opens a workspace terminal that resumes the session, no-session message, refusal of a session id carrying a shell command.
- `apps/extension-vscode/src/__tests__/useTerminal.test.ts`: Starting the CLI in an AGI terminal and the install offer.

**Test scenarios**

- **Explain a failing command**
  1. Open a trusted folder in VS Code with shell integration.
  2. Run a command that fails in the terminal.
  3. Run 'Code: Explain Terminal Output'.
  - Expected: The chat shows a prompt with the command, output and exit code, then an explanation.
- **No shell integration**
  1. Use a terminal where shell integration is off.
  2. Run 'Code: Explain Terminal Output'.
  3. Paste output into the box.
  - Expected: The box states shell integration is not active; the pasted text goes to chat.
- **Untrusted folder**
  1. Open a folder in Restricted Mode.
  2. Run Explain Terminal Output and Run Terminal Command.
  - Expected: Both refuse and show the trust messages; nothing is sent or typed.
- **Blocked suggestion**
  1. Use a Cloud model.
  2. Run 'Code: Suggest Terminal Command' and ask for something that yields a risky command.
  - Expected: Risky items show BLOCKED and picking one shows 'Refused to run command'.
- **Continue in terminal in a remote window**
  1. Open a dev container folder.
  2. Start a chat and send a message.
  3. Run 'Code: Continue This Session in the Terminal'.
  - Expected: A terminal named AGI opens in the container and runs the CLI with the same session id, or a message names the container if the CLI is missing.

**Where to look when it fails**

- Extension host log and the 'Code' warning and error messages quoted above.
- Output channel 'Code: Git' is unrelated; no terminal-specific log channel was found.
- console.warn text 'could not hand developer session ... over' (ChatStateManager.ts:6522-6525).

**Hands-on test plans**

- VS Code: [70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md](../../70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md)

## 10. Gaps and dependencies

- **Two different output limits (8,000 at capture, 20,000 at attach).** Affects: VS Code users attaching terminal output. Evidence: packages/client/ide-runtime/src/terminal.ts:4; apps/extension-vscode/src/features/chat-participant/promptReferences.ts:8. Work needed: Choose one limit and tell the person when output was cut.
- **Explain Terminal Output is only in the Command Palette, not in the terminal menu.** Affects: VS Code users. Evidence: apps/extension-vscode/package.json:1046-1050. Work needed: Add a menu entry or document the palette path.
- **Continue in Terminal does not check Workspace Trust in the extension code opened; whether the CLI refuses an untrusted folder is unknown.** Affects: VS Code users in Restricted Mode. Evidence: apps/extension-vscode/src/core/commandSetup.ts:466-494. Work needed: Confirm CLI behaviour and add a guard or a test.
- **No test found that covers Add Terminal Output to Chat through the real command path to the composer chip.** Affects: Testers. Evidence: grep of src/__tests__ for addTerminalOutputToChat found only the shell-integration test offering attach. Work needed: Add a test for the attachment name and the 20,000 limit.
- **No recorded run of any of these flows in a real editor.** Affects: All. Evidence: no result file found. Work needed: Run the scenarios above and record results.

**Depends on**

- surface:vscode
- mode:local
- mode:own-key
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- file:apps/extension-vscode/src/providers/terminalProvider.ts
- file:packages/client/ide-runtime/src/terminal.ts
- F073-12

## Unknown

- Which provider route a given explain turn takes (Local, own key or Cloud) was not traced.
- Whether the CLI refuses --resume in an untrusted folder.
- Exact sign-in check for Suggest Terminal Command inside chatCompletion.
- Whether any test records a real-editor run.
