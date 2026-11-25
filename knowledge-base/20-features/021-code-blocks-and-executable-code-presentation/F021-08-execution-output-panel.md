---
id: "F021-08"
type: "feature"
title: "Execution output panel"
aliases: ["Code Execution panel", "Code execution output", "Output and Stderr sections", "Running Python", "Exit code line", "Tool call row with exit status (VS Code, CLI)"]
area: "21 Code blocks and executable code presentation"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S21.15", "S21.16", "S21.17", "S21.18", "S21.28"]
depends_on: ["F021-07", "F021-09", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "SYS-agents-tools-and-automation", "SYS-api-and-contracts", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:packages/ui/unified-chat/src/lib/code-execution-result.ts", "provider:anthropic"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F021-08 Execution output panel

After code runs, the reply shows a Code Execution panel: a spinner while running, a check or cross, Output text, a red Stderr box and an Exit code line on failure. Web, mobile and Chrome have the panel; CLI and VS Code show the same facts on command rows. Duration shows on CLI and VS Code rows and on mobile tool rows.

Area: [21. Code blocks and executable code presentation](README.md). Requirement items: [S21.15](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2115), [S21.16](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2116), [S21.17](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2117), [S21.18](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2118), [S21.28](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2128).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows what a run printed, what it reported as errors, whether it succeeded, and in some apps how long it took (apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:35-133).

**Why it exists.** The person must see the evidence for an answer that depends on running code, and must tell success from failure. [inferred]

**Who uses it.** Anyone who runs code from chat or lets an agent run commands.

**Problems it solves**

- Distinguishes normal output from errors.
- Shows failure with a number.
- Lets a long output be collapsed.

**Use cases**

- Check the numbers printed by a data script.
- See a Python traceback in red.
- Collapse a long output to keep reading.
- In the CLI, see exit code and a one-line stderr under a command.

## 2. User experience

**Where to find it**

- Web: panel titled Code Execution under the assistant message (CodeExecutionBlock.tsx:57; mounted at apps/web/features/chat/components/messages/MessageBubble.tsx:2798-2802).
- Desktop (Electron): same hosted web app (doc: AGENTS.md section 5). Internal Tauri desktop and the shared chat: panel titled Code execution from the shared package (packages/ui/unified-chat/src/components/CodeExecutionOutput.tsx:57, mounted at packages/ui/unified-chat/src/components/MessageBubble.tsx:877).
- Mobile: panel titled Code Execution (apps/mobile/src/features/chat/components/CodeExecutionBlock.tsx:22, mounted at apps/mobile/src/features/chat/components/MessageBubble.tsx:2444).
- Chrome side panel: block titled Code execution or Running code (apps/extension/src/features/side-panel/bubbles.ts:660-705; apps/extension/_locales/en/messages.json:2150-2166).
- CLI: tool row in the transcript with timing, exit code and stderr lines (apps/cli/src/tui/tui_app.rs:334-445).
- VS Code: command row in the Activity group with Exit status N or Command finished or failed (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8950-8968).

**Before you start**

- A run happened in the turn (a result or an executing flag exists) (CodeExecutionBlock.tsx:38).
- The web panel is fed by a provider code-tool result (x_code_result) (apps/web/lib/hooks/useChatStream.ts:3590-3609).

**Screens and controls**

- Header button toggling collapse, aria-expanded set (CodeExecutionBlock.tsx:51-55).
- Spinner while running; check icon on success; cross on failure (CodeExecutionBlock.tsx:58-64).
- Sections: Output, Stderr, Plot N, and Exit code: N (CodeExecutionBlock.tsx:84, :99, :115, :127).
- Mobile adds copy and share actions for stdout and stderr (apps/mobile/__tests__/CodeExecutionBlock.test.tsx, test titled copies and shares the exact stdout and stderr).
- CLI: Ctrl-O toggles full tool output (tui_app.rs:4056-4068).

**Journey**

1. 1. Person sends a message with code running on.
2. 2. While the tool runs, the header shows a spinner and the line Running Python (web, CodeExecutionBlock.tsx:75-77) or Running code (shared package, CodeExecutionOutput.tsx:79).
3. 3. When the result arrives, the icon becomes a check or cross.
4. 4. Output appears in a scrolling box (max about 16rem), stderr in a red box (max about 12rem) (CodeExecutionBlock.tsx:89, :105).
5. 5. On failure a line Exit code: N appears.
6. 6. Person clicks the header to collapse.

**What the person sees and gets**

- Output text, Stderr text, Exit code: N, Plot images (see F021-09).
- Screen-reader announcements in the shared package: Running code, Code execution succeeded, Code execution failed (CodeExecutionOutput.tsx:34-40).
- Mobile header label: Code Execution, Running Python, Exit code N or Finished (mobile CodeExecutionBlock.tsx:23, :85-89).
- Chrome: Code failed with an error code, or Exit code: N (bubbles.ts:679-691).

**Settings**

- No setting found for the panel itself.
- Mobile Code settings affect the code font (apps/mobile/src/features/settings/code/store.ts:22-23).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web panel with spinner, success and failure icons, Output, Stderr, Plot N, Exit code (CodeExecutionBlock.tsx:35-133).
- Web live stream fills stdout, stderr and returnCode from x_code_result (useChatStream.ts:3598-3609).
- Server keeps the last result per turn, trimmed to 10,000 characters per stream in the saved row (apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-sources.ts:90-93, :276-292).
- Shared package panel used by the internal Tauri desktop, with live announcements (CodeExecutionOutput.tsx:22-136; apps/desktop/src/runtime/cloudStreamDeltas.ts:468-490).
- Mobile panel with stdout, stderr, status text, collapse, copy and share (mobile CodeExecutionBlock.tsx; apps/mobile/__tests__/CodeExecutionBlock.test.tsx).
- Chrome panel with output, stderr and exit code, open by default (bubbles.ts:660-705).
- CLI shows tool timing, exit code and stderr for shell tools (tui_app.rs:374-445, :8000-8004, :8024-8040).
- VS Code shows exit status and elapsed time on tool rows (webviewContent.ts:8950-8968, :7960-7969).
- Web tool timeline rows carry duration (apps/web/features/chat/components/messages/ToolTimeline.tsx:164, :755; useChatStream.ts:2577).
- Mobile tool rows show duration (apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:166-168, :192).

**Incomplete**

- The web Code Execution panel shows no duration (CodeExecutionBlock.tsx:35-133). Duration appears only on the separate tool timeline row.
- The panel is fed only by a provider's own code tool result; the managed sandbox execute_code returns one merged output string with no separate stderr or exit code, because notebook cells have no process exit codes (apps/web/lib/e2b/execution-tools.ts:73-75; apps/web/lib/e2b/runtime.ts:1240-1253). How the web client shows execute_code results: not established.
- Header text says Running Python even when the language is not Python (CodeExecutionBlock.tsx:76).
- CLI stderr and exit code are split only for shell tools (tui_app.rs:8000-8004).
- VS Code has no separate stderr view; the body is one text (webviewContent.ts:8950-8957).

**Present but disconnected or switched off**

- The web CodeExecutionBlock duplicates the safe-image logic that the shared package already exports; the web file does not import it (CodeExecutionBlock.tsx:20-33 vs packages/ui/unified-chat/src/lib/code-execution-result.ts:19-32).

**Not available**

- Dependency install status: nothing found in any app.
- Chrome: duration and plots not shown (bubbles.ts:660-705; freeTrialClient.ts:879-908 parses no images).

## 4. Required behaviour

**Established requirements**

- Execution stdout is shown in a dedicated output panel under the code. (source: brief S21.15)
- Standard error is shown separately and visibly distinguished from stdout. (source: brief S21.16)
- Each execution shows how long it took. (source: brief S21.17)
- Each execution shows its outcome or exit status (success, failure with code). (source: brief S21.18)
- When execution installs dependencies, their installation status is shown. (source: brief S21.28)

**Acceptance criteria**

1. While a run is in progress the panel header shows a spinner and a running line.
2. A successful run (exit code 0) shows a check icon and no Exit code line.
3. A failed run shows a cross and a line Exit code: N.
4. Stdout and stderr appear in separate labelled sections; stderr is in the danger colour.
5. Clicking the header collapses and expands the panel and updates aria-expanded.
6. A result with no stdout, stderr or plots shows only the header (no chevron).
7. Duration is visible for the run on the apps that claim it (mobile tool row, CLI row, VS Code row).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Long outputs must stay scrollable inside a fixed height (web boxes use max height and overflow) [inferred from CodeExecutionBlock.tsx:89, :105].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add run duration to the web and Chrome panel header.
- [proposed] Show stderr and exit status for the managed sandbox result, if the sandbox can report them.
- [proposed] Show the real language instead of Python in the running line.
- [proposed] Show package install progress when the run installs dependencies.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CodeExecutionBlock (web) | `apps/web/features/chat/components/messages/CodeExecutionBlock.tsx` | Web panel |
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Mounts the panel at lines 2798-2802 |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Parses x_code_result into stdout, stderr, returnCode (3590-3609) |
| store | web chat store | `apps/web/shared/stores/web-chat-store.ts` | setCodeExecutionResult and metadata type (lines 394, 1622-1631) |
| service | assistant turn sources | `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-sources.ts` | Keeps the last code result per turn and caps stored text |
| component | ToolTimeline (web) | `apps/web/features/chat/components/messages/ToolTimeline.tsx` | Tool rows with durationMs; label Run code |
| component | CodeExecutionOutput (shared) | `packages/ui/unified-chat/src/components/CodeExecutionOutput.tsx` | Shared panel with announcements |
| service | code-execution-result helpers | `packages/ui/unified-chat/src/lib/code-execution-result.ts` | readCodeExecutionResult, isExecutingCode, safeExecutionImageSrc |
| service | desktop stream deltas | `apps/desktop/src/runtime/cloudStreamDeltas.ts` | Maps x_code_result to a result event (468-490) |
| component | CodeExecutionBlock (mobile) | `apps/mobile/src/features/chat/components/CodeExecutionBlock.tsx` | Mobile panel |
| store | mobile code result mapper | `apps/mobile/stores/chat/codeExecutionResult.ts` | Maps stream delta to a result (no images) |
| component | ToolCallTimeline (mobile) | `apps/mobile/src/features/chat/components/ToolCallTimeline.tsx` | Tool row duration label |
| component | bubbles (Chrome) | `apps/extension/src/features/side-panel/bubbles.ts` | buildCodeExecution block |
| service | freeTrialClient | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | parseCodeExecutionDelta, 16,000-character cap |
| service | tui_app tool cells | `apps/cli/src/tui/tui_app.rs` | ToolCell, ToolTiming, exit and stderr rendering (186-260, 334-445) |
| component | webviewContent (VS Code) | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | renderToolResponse, formatElapsedMs (8950-8990) |
| config | Chrome strings | `apps/extension/_locales/en/messages.json` | spCodeExecution, spCodeRunning, spCodeOutput, spCodeStderr, spCodeExitCode |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A provider's code tool runs the code and the server forwards its result as an x_code_result stream field. | outside service | apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-sources.ts:99; packages/ai/providers/anthropic/src/stream.ts (file found by search; lines not opened) |
| The client reads stdout, stderr and return code, stores them on the message and draws the panel. | device | useChatStream.ts:3590-3609; web-chat-store.ts:1622-1631 |
| The server collects the last result, trims each stream to 10,000 characters and saves it with the turn; the client's own save carries the full text and replaces it. | our servers | assistant-turn-sources.ts:90-93, :276-292 |
| Chrome parses the same field, caps each stream at 16,000 characters and stores it in extension chat history. | device | freeTrialClient.ts:747, :879-908; apps/extension/src/features/background/conversation-history.ts:486-500 |
| CLI and VS Code read the shell tool's output text, split off a leading Exit code line and a stderr marker, and draw the row. | device | tui_app.rs:8024-8040; webviewContent.ts:8892-8896 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Code result (stdout, stderr, return code) | Message metadata in the web store and the saved conversation row; Chrome extension chat history; mobile message metadata | web: saved with the turn on the server; Chrome and mobile: local to the device unless the conversation syncs (unknown) | Server copy trimmed to 10,000 characters per stream; kept with the conversation (assistant-turn-sources.ts:90-93) |

**Models and providers.** The panel is driven by provider code-tool results, so it depends on the routed provider's code tool (provider:anthropic is the one with a result mapper found; others unknown). Hosted code execution is priced per provider (apps/web/lib/e2b/hosted-code-execution.ts:41-46).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Display needs no extra rule; the run itself needs the entitlements in F021-07. |
| Permissions | none found in the code for display. |
| Subscription | Display follows the run; hosted code execution has per-provider rate-card prices (hosted-code-execution.ts:41-46). |
| Limits and metering | Stored stdout and stderr capped at 10,000 characters each on the server and 16,000 on Chrome (assistant-turn-sources.ts:90-93; freeTrialClient.ts:747). Sandbox output cap MAX_EXECUTION_OUTPUT_BYTES (apps/web/lib/e2b/types.ts, imported at runtime.ts:45). |
| Feature flags | none found in the code for display. |
| Model compatibility | Provider-native results need a model routed to a provider with a code tool. |
| Provider restrictions | Native code tools: provider:anthropic, provider:google, provider:openai (execution-tools.ts:211-232). |
| Local mode | Mobile Local mode has no run, so no panel. CLI and VS Code show local command results on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner and Running Python (web); shimmer text (mobile); Loader icon (Chrome) | CodeExecutionBlock.tsx:58, :75-77; mobile CodeExecutionBlock.tsx:130-139; bubbles.ts:696 |
| Empty | Result with no output shows header only, no chevron | CodeExecutionBlock.tsx:45, :65-71 |
| Success | Check icon; no exit line | CodeExecutionBlock.tsx:60-61, :125 |
| Failure | Cross icon and Exit code: N | CodeExecutionBlock.tsx:62-63, :125-129 |
| Tool error result | Web marks the tool failed with text Code execution failed: <code>; no panel is created | useChatStream.ts:3593-3596 |
| Malformed result | Shared reader returns defaults without throwing | packages/ui/unified-chat/src/lib/code-execution-result.ts:48-58; test titled reads a malformed result without throwing |
| Accessibility | aria-expanded on header; live region announces status in the shared panel; mobile headings have role header | CodeExecutionBlock.tsx:54; CodeExecutionOutput.tsx:47-49; mobile CodeExecutionBlock.tsx:147-150 |
| Timeout, offline, reconnect | not handled in the panel code | CodeExecutionBlock.tsx has no timeout or offline branch (lines 35-133) |
| Stale run flag | Web clears isExecutingCode when a result is set or the stream ends | web-chat-store.ts:1624-1628; useChatStream.ts:6333 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/CodeExecutionBlock.test.tsx`: Stderr uses a colour token defined in both themes
- `apps/web/features/chat/components/messages/MessageBubble.test.tsx`: Executing and result states of the bubble (lines 219-330)
- `packages/ui/unified-chat/src/components/__tests__/MessageBubble.codeExecution.test.tsx`: stdout, stderr and exit code, running console, unsafe images dropped, malformed result
- `packages/ui/unified-chat/src/lib/code-execution-result.test.ts`: Result reader and image rule (by file name)
- `apps/mobile/__tests__/CodeExecutionBlock.test.tsx`: Nothing rendered without a run, running line, success, stdout/stderr/exit apart, collapse, plots, copy and share
- `apps/desktop/src/runtime/__tests__/cloudStreamDeltas.test.ts`: Desktop stream mapping (by file name)
- `apps/cli/src/tui/tui_app.rs`: Inline test tool_cell_renders_per_type_icon_state_glyph_and_command_band (line 9095)

**Test scenarios**

- **Success run**
  1. Run print(2+2) with Run code on.
  2. Wait for the reply.
  - Expected: Check icon, Output shows 4, no Exit code line.
- **Failing run**
  1. Run code that raises an error.
  - Expected: Cross icon, Stderr box in red, and Exit code line (provider-tool route).
- **Collapse**
  1. Click the panel header twice.
  - Expected: Output hides, then shows; aria-expanded flips.
- **CLI command row**
  1. In the CLI approve a shell command that exits 1 and prints to stderr.
  2. Press Ctrl-O.
  - Expected: Row shows timing, exit 1, a stderr line; Ctrl-O shows more lines.
- **Chrome panel**
  1. Use the Chrome side panel with a cloud turn that runs code.
  - Expected: Block with Output, Stderr, Exit code lines.
- **Duration check**
  1. Run code on mobile and open the tool row.
  - Expected: A duration appears beside the status.

**Where to look when it fails**

- Failure text Code execution failed: <error_code> (useChatStream.ts:3595).
- Chrome stores a failed status with an errorCode (freeTrialClient.ts:884-889).
- Inspect message metadata codeExecutionResult in the web store.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md)
- Desktop: [70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md)
- Mobile: [70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md)
- CLI: [70-qa/test-plans/cli/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/cli/021-code-blocks-and-executable-code-presentation.md)
- VS Code: [70-qa/test-plans/vscode/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/vscode/021-code-blocks-and-executable-code-presentation.md)
- Chrome: [70-qa/test-plans/chrome/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/chrome/021-code-blocks-and-executable-code-presentation.md)

## 10. Gaps and dependencies

- **No duration in the web, desktop and Chrome panel** Affects: Web, desktop, Chrome. Evidence: CodeExecutionBlock.tsx:35-133; bubbles.ts:660-705. Work needed: Carry elapsed time in the result and draw it.
- **Managed sandbox results have no separate stderr or exit code** Affects: Web, desktop, mobile. Evidence: execution-tools.ts:73-75; runtime.ts:1240-1253. Work needed: Return stdout, stderr and an error flag separately and map them into the panel.
- **Running line always says Python** Affects: Web, mobile. Evidence: CodeExecutionBlock.tsx:76; mobile CodeExecutionBlock.tsx:23. Work needed: Use the real language.
- **No dependency install status anywhere** Affects: All apps. Evidence: brief S21.28; no match found. Work needed: Emit install events from the sandbox and show a status row.
- **Web panel code duplicates the shared panel** Affects: Web. Evidence: CodeExecutionBlock.tsx vs CodeExecutionOutput.tsx. Work needed: Use one component (doc: AGENTS.md section 3 ownership rule).
- **The brief's rows differ from the code: CLI duration exists and the web tool row has duration** Affects: Documentation. Evidence: tui_app.rs:374-379; ToolTimeline.tsx:755. Work needed: Correct the brief rows.

**Depends on**

- F021-07
- F021-09
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- SYS-agents-tools-and-automation
- SYS-api-and-contracts
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:packages/ui/unified-chat/src/lib/code-execution-result.ts
- provider:anthropic

## Unknown

- How the web client shows the result of the managed execute_code tool in the transcript (only the tool timeline label was seen).
- Whether the Chrome panel has a test: none found.
- Whether the CLI kills the child process on cancel: not read.
- Whether duration is populated for execute_code rows on web.
- Whether other providers map code results into x_code_result.
